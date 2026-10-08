import { failure, type Result, success } from "../../shared/domain/result.js";
import { type AgentIdentityId, isAgentIdentityEligibleForPrincipal } from "../identity/index.js";
import {
  type PermissionEffect,
  SKILL_PERMISSION_COMMAND_CONTRACT_V1,
  SKILL_PERMISSION_EVENT_CONTRACT_V1,
  type SkillPermissionError,
  type SkillPermissionErrorCode,
  type SkillPermissionEvent,
  type SkillPermissionEventCommand,
  type SkillPermissionEventControl,
} from "./contracts.js";
import {
  createStoredSkillPermission,
  isPermissionEffect,
  isSkillPermission,
  isSkillPermissionId,
  type PermissionSnapshot,
  parseDirectedPair,
  type SkillPermission,
  type SkillPermissionId,
  toSnapshot,
} from "./domain/skill-permission.js";
import type {
  PermissionPartyPort,
  SkillPermissionEventSink,
  SkillPermissionStorePort,
  TrustedPermissionSource,
  UnreleasedApprovalPort,
} from "./ports.js";

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const GRANT_KEYS = [
  "contract",
  "action",
  "correlationId",
  "fromAgentId",
  "toAgentId",
  "effect",
] as const;
const REVOKE_KEYS = [...GRANT_KEYS, "permissionId"] as const;

export type SkillPermissionServiceDependencies = Readonly<{
  parties: PermissionPartyPort;
  events: SkillPermissionEventSink;
  store: SkillPermissionStorePort;
  approvals: UnreleasedApprovalPort;
}>;

type ParsedCommand = Readonly<{
  correlationId: string;
  fromAgentId: AgentIdentityId;
  toAgentId: AgentIdentityId;
  effect?: PermissionEffect;
  permissionId?: SkillPermissionId;
}>;

const invalid = (): Result<never, SkillPermissionError> =>
  failure({ code: "SKILL_PERMISSION_COMMAND_INVALID" });
const rejected = (code: SkillPermissionErrorCode): Result<never, SkillPermissionError> =>
  failure({ code });

export class SkillPermissionService {
  readonly #parties: PermissionPartyPort;
  readonly #events: SkillPermissionEventSink;
  readonly #store: SkillPermissionStorePort;
  readonly #approvals: UnreleasedApprovalPort;

  constructor(dependencies: SkillPermissionServiceDependencies) {
    this.#parties = dependencies.parties;
    this.#events = dependencies.events;
    this.#store = dependencies.store;
    this.#approvals = dependencies.approvals;
  }

  async grant(
    source: TrustedPermissionSource,
    command: unknown,
  ): Promise<Result<SkillPermission, SkillPermissionError>> {
    return this.#mutate("grant", source, command);
  }

  async revoke(
    source: TrustedPermissionSource,
    command: unknown,
  ): Promise<Result<SkillPermission, SkillPermissionError>> {
    return this.#mutate("revoke", source, command);
  }

  async readSnapshot(fromAgentId: unknown, toAgentId: unknown): Promise<PermissionSnapshot | null> {
    try {
      const found = this.#store.findCurrent(fromAgentId, toAgentId);
      if (!isSkillPermission(found) || found.status !== "active") {
        return null;
      }
      if (found.fromAgentId !== fromAgentId || found.toAgentId !== toAgentId) {
        return null;
      }
      const fromParty = await this.#parties.findAgent(found.fromAgentId);
      const toParty = await this.#parties.findAgent(found.toAgentId);
      if (
        !matchesEligibleAgent(fromParty, found.fromAgentId) ||
        !matchesEligibleAgent(toParty, found.toAgentId)
      ) {
        return null;
      }
      const current = this.#store.findCurrent(fromAgentId, toAgentId);
      if (!isSkillPermission(current) || current.status !== "active" || current.id !== found.id) {
        return null;
      }
      return toSnapshot(current);
    } catch {
      return null;
    }
  }

  async #mutate(
    action: SkillPermissionEventCommand,
    source: TrustedPermissionSource,
    command: unknown,
  ): Promise<Result<SkillPermission, SkillPermissionError>> {
    let correlationId = "invalid";
    let sourceKey = "invalid";
    try {
      const parsed = action === "grant" ? parseGrant(command) : parseRevoke(command);
      const parsedSource = parseSourceKey(source);
      if (parsed !== null) {
        correlationId = parsed.correlationId;
      }
      if (parsedSource !== null) {
        sourceKey = parsedSource;
      }
      if (parsed === null || parsedSource === null) {
        this.#reject(correlationId, sourceKey, action, "validation");
        return invalid();
      }
      if (action === "grant") {
        return await this.#grant(parsed, correlationId, sourceKey);
      }
      return this.#revoke(parsed, correlationId, sourceKey);
    } catch {
      return rejected("SKILL_PERMISSION_DEPENDENCY_FAILED");
    }
  }

  async #grant(
    parsed: ParsedCommand,
    correlationId: string,
    sourceKey: string,
  ): Promise<Result<SkillPermission, SkillPermissionError>> {
    let fromParty: unknown;
    let toParty: unknown;
    try {
      fromParty = await this.#parties.findAgent(parsed.fromAgentId);
      toParty = await this.#parties.findAgent(parsed.toAgentId);
    } catch {
      this.#reject(correlationId, sourceKey, "grant", "dependency");
      return rejected("SKILL_PERMISSION_DEPENDENCY_FAILED");
    }
    if (
      !matchesEligibleAgent(fromParty, parsed.fromAgentId) ||
      !matchesEligibleAgent(toParty, parsed.toAgentId)
    ) {
      this.#reject(correlationId, sourceKey, "grant", "validation");
      return rejected("SKILL_PERMISSION_PARTY_INELIGIBLE");
    }
    const created = createStoredSkillPermission(
      parsed.fromAgentId,
      parsed.toAgentId,
      parsed.effect as PermissionEffect,
    );
    const stored = this.#store.insertActive(
      created,
      acceptedEvent(correlationId, sourceKey, "grant"),
    );
    if (isSkillPermission(stored)) {
      return success(stored);
    }
    if (isErrorCode(stored, "SKILL_PERMISSION_CONFLICT")) {
      this.#reject(correlationId, sourceKey, "grant", "conflict");
      return rejected("SKILL_PERMISSION_CONFLICT");
    }
    return rejected("SKILL_PERMISSION_DEPENDENCY_FAILED");
  }

  #revoke(
    parsed: ParsedCommand,
    correlationId: string,
    sourceKey: string,
  ): Result<SkillPermission, SkillPermissionError> {
    const stored = this.#store.revokeMatching(
      parsed.fromAgentId,
      parsed.toAgentId,
      parsed.permissionId,
      acceptedEvent(correlationId, sourceKey, "revoke"),
    );
    if (
      isSkillPermission(stored) &&
      stored.status === "revoked" &&
      stored.id === parsed.permissionId
    ) {
      // A later ASK grant must not spend an approval that belonged to this revoked permission.
      this.#approvals.invalidateUnreleased(stored.fromAgentId, stored.toAgentId);
      return success(stored);
    }
    if (isErrorCode(stored, "SKILL_PERMISSION_NOT_FOUND")) {
      this.#reject(correlationId, sourceKey, "revoke", "validation");
      return rejected("SKILL_PERMISSION_NOT_FOUND");
    }
    return rejected("SKILL_PERMISSION_DEPENDENCY_FAILED");
  }

  #reject(
    correlationId: string,
    sourceKey: string,
    command: SkillPermissionEventCommand,
    control: Exclude<SkillPermissionEventControl, "none">,
  ): void {
    this.#events.record(
      Object.freeze({
        contract: SKILL_PERMISSION_EVENT_CONTRACT_V1,
        correlationId,
        sourceKey,
        command,
        outcome: "rejected",
        control,
      }),
    );
  }
}

const acceptedEvent = (
  correlationId: string,
  sourceKey: string,
  command: SkillPermissionEventCommand,
): SkillPermissionEvent =>
  Object.freeze({
    contract: SKILL_PERMISSION_EVENT_CONTRACT_V1,
    correlationId,
    sourceKey,
    command,
    outcome: "accepted",
    control: "none",
  });

const matchesEligibleAgent = (party: unknown, id: string): boolean =>
  isAgentIdentityEligibleForPrincipal(party) &&
  typeof party === "object" &&
  party !== null &&
  (party as { readonly id?: unknown }).id === id;

const parseGrant = (input: unknown): ParsedCommand | null => {
  const record = exactRecord(input, GRANT_KEYS);
  const pair = record === null ? null : parseDirectedPair(record.fromAgentId, record.toAgentId);
  if (
    record === null ||
    pair === null ||
    record.contract !== SKILL_PERMISSION_COMMAND_CONTRACT_V1 ||
    record.action !== "grant" ||
    !isToken(record.correlationId) ||
    !isPermissionEffect(record.effect)
  ) {
    return null;
  }
  return {
    correlationId: record.correlationId,
    fromAgentId: pair.fromAgentId,
    toAgentId: pair.toAgentId,
    effect: record.effect,
  };
};

const parseRevoke = (input: unknown): ParsedCommand | null => {
  const record = exactRecord(input, REVOKE_KEYS);
  const pair = record === null ? null : parseDirectedPair(record.fromAgentId, record.toAgentId);
  if (
    record === null ||
    pair === null ||
    record.contract !== SKILL_PERMISSION_COMMAND_CONTRACT_V1 ||
    record.action !== "revoke" ||
    !isToken(record.correlationId) ||
    !isSkillPermissionId(record.permissionId)
  ) {
    return null;
  }
  return {
    correlationId: record.correlationId,
    fromAgentId: pair.fromAgentId,
    toAgentId: pair.toAgentId,
    permissionId: record.permissionId,
  };
};

const parseSourceKey = (source: TrustedPermissionSource): string | null => {
  try {
    if (typeof source !== "object" || source === null) {
      return null;
    }
    const record = exactRecord(source, ["kind", "key"]);
    if (
      record === null ||
      Object.getPrototypeOf(source) !== Object.prototype ||
      record.kind !== "trusted-permission-source" ||
      !isToken(record.key)
    ) {
      return null;
    }
    return record.key;
  } catch {
    return null;
  }
};

const exactRecord = (
  input: unknown,
  expected: readonly string[],
): Record<string, string> | null => {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(input) as unknown;
    const keys = Reflect.ownKeys(input);
    if (
      (prototype !== Object.prototype && prototype !== null) ||
      !Object.values(Object.getOwnPropertyDescriptors(input)).every((item) => "value" in item) ||
      keys.length !== expected.length ||
      !expected.every((key) => Object.hasOwn(input, key)) ||
      !keys.every((key) => typeof key === "string")
    ) {
      return null;
    }
    const record = input as Record<string, unknown>;
    const parsed: Record<string, string> = {};
    for (const key of expected) {
      if (typeof record[key] !== "string") {
        return null;
      }
      parsed[key] = record[key];
    }
    return parsed;
  } catch {
    return null;
  }
};

const isToken = (input: unknown): input is string => typeof input === "string" && TOKEN.test(input);

const isErrorCode = (value: unknown, code: SkillPermissionErrorCode): boolean => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const keys = Reflect.ownKeys(value);
  return keys.length === 1 && keys[0] === "code" && (value as { code?: unknown }).code === code;
};
