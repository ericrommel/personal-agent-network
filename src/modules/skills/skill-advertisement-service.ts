import { failure, type Result, success } from "../../shared/domain/result.js";
import {
  type AgentIdentityId,
  isAgentIdentityEligibleForPrincipal,
  parseAgentIdentityId,
} from "../identity/index.js";
import {
  AVAILABILITY_SKILL_VERSION_V1,
  SKILL_ADVERTISEMENT_COMMAND_CONTRACT_V1,
  SKILL_ADVERTISEMENT_EVENT_CONTRACT_V1,
  type SkillAdvertisementError,
  type SkillAdvertisementErrorCode,
  type SkillAdvertisementEvent,
  type SkillAdvertisementEventCommand,
  type SkillAdvertisementEventControl,
} from "./contracts.js";
import {
  createStoredSkillAdvertisement,
  isPinnedSkillVersion,
  isSkillAdvertisement,
  isSkillAdvertisementId,
  type SkillAdvertisement,
  type SkillAdvertisementId,
} from "./domain/skill-advertisement.js";
import type {
  SkillAdvertisementEventSink,
  SkillAdvertisementPartyPort,
  SkillAdvertisementStorePort,
  TrustedSkillAdvertisementSource,
} from "./ports.js";

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ADVERTISE_KEYS = ["contract", "action", "correlationId", "agentId", "skillVersion"] as const;
const WITHDRAW_KEYS = [
  "contract",
  "action",
  "correlationId",
  "agentId",
  "skillVersion",
  "advertisementId",
] as const;

export type SkillAdvertisementServiceDependencies = Readonly<{
  parties: SkillAdvertisementPartyPort;
  events: SkillAdvertisementEventSink;
  store: SkillAdvertisementStorePort;
}>;

type ParsedCommand = Readonly<{
  correlationId: string;
  agentId: AgentIdentityId;
  advertisementId?: SkillAdvertisementId;
}>;

const invalid = (): Result<never, SkillAdvertisementError> =>
  failure({ code: "SKILL_ADVERTISEMENT_COMMAND_INVALID" });

const rejected = (errorCode: SkillAdvertisementErrorCode): Result<never, SkillAdvertisementError> =>
  failure({ code: errorCode });

export class SkillAdvertisementService {
  readonly #parties: SkillAdvertisementPartyPort;
  readonly #events: SkillAdvertisementEventSink;
  readonly #store: SkillAdvertisementStorePort;

  constructor(dependencies: SkillAdvertisementServiceDependencies) {
    this.#parties = dependencies.parties;
    this.#events = dependencies.events;
    this.#store = dependencies.store;
  }

  async advertise(
    source: TrustedSkillAdvertisementSource,
    command: unknown,
  ): Promise<Result<SkillAdvertisement, SkillAdvertisementError>> {
    return this.#mutate("advertise", source, command);
  }

  async withdraw(
    source: TrustedSkillAdvertisementSource,
    command: unknown,
  ): Promise<Result<SkillAdvertisement, SkillAdvertisementError>> {
    return this.#mutate("withdraw", source, command);
  }

  async readAdvertised(agentId: unknown, skillVersion: unknown): Promise<boolean> {
    try {
      const found = await this.#store.findCurrent(agentId, skillVersion);
      if (!isCurrentAdvertisement(found, agentId, skillVersion)) {
        return false;
      }
      const party = await this.#parties.findAgent(found.agentId);
      if (!matchesEligibleAgent(party, found.agentId)) {
        return false;
      }
      const current = await this.#store.findCurrent(agentId, skillVersion);
      return (
        isSkillAdvertisement(current) &&
        current.status === "advertised" &&
        current.id === found.id &&
        current.agentId === agentId &&
        current.skillVersion === skillVersion
      );
    } catch {
      return false;
    }
  }

  async #mutate(
    action: SkillAdvertisementEventCommand,
    source: TrustedSkillAdvertisementSource,
    command: unknown,
  ): Promise<Result<SkillAdvertisement, SkillAdvertisementError>> {
    let correlationId = "invalid";
    let sourceKey = "invalid";
    try {
      const parsed = action === "advertise" ? parseAdvertise(command) : parseWithdraw(command);
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
      if (action === "advertise") {
        return await this.#advertise(parsed, correlationId, sourceKey);
      }
      return await this.#withdraw(parsed, correlationId, sourceKey);
    } catch {
      return rejected("SKILL_ADVERTISEMENT_DEPENDENCY_FAILED");
    }
  }

  async #advertise(
    parsed: ParsedCommand,
    correlationId: string,
    sourceKey: string,
  ): Promise<Result<SkillAdvertisement, SkillAdvertisementError>> {
    let party: unknown;
    try {
      party = await this.#parties.findAgent(parsed.agentId);
    } catch {
      this.#reject(correlationId, sourceKey, "advertise", "dependency");
      return rejected("SKILL_ADVERTISEMENT_DEPENDENCY_FAILED");
    }
    if (!matchesEligibleAgent(party, parsed.agentId)) {
      this.#reject(correlationId, sourceKey, "advertise", "validation");
      return rejected("SKILL_ADVERTISEMENT_PARTY_INELIGIBLE");
    }
    const created = createStoredSkillAdvertisement(parsed.agentId);
    const stored = await this.#store.insertAdvertised(
      created,
      acceptedEvent(correlationId, sourceKey, "advertise"),
    );
    if (isSkillAdvertisement(stored)) {
      return success(stored);
    }
    if (isErrorCode(stored, "SKILL_ADVERTISEMENT_CONFLICT")) {
      this.#reject(correlationId, sourceKey, "advertise", "conflict");
      return rejected("SKILL_ADVERTISEMENT_CONFLICT");
    }
    return rejected("SKILL_ADVERTISEMENT_DEPENDENCY_FAILED");
  }

  async #withdraw(
    parsed: ParsedCommand,
    correlationId: string,
    sourceKey: string,
  ): Promise<Result<SkillAdvertisement, SkillAdvertisementError>> {
    const stored = await this.#store.withdrawMatching(
      parsed.agentId,
      AVAILABILITY_SKILL_VERSION_V1,
      parsed.advertisementId,
      acceptedEvent(correlationId, sourceKey, "withdraw"),
    );
    if (
      isSkillAdvertisement(stored) &&
      stored.status === "withdrawn" &&
      stored.id === parsed.advertisementId
    ) {
      return success(stored);
    }
    if (isErrorCode(stored, "SKILL_ADVERTISEMENT_NOT_FOUND")) {
      this.#reject(correlationId, sourceKey, "withdraw", "validation");
      return rejected("SKILL_ADVERTISEMENT_NOT_FOUND");
    }
    return rejected("SKILL_ADVERTISEMENT_DEPENDENCY_FAILED");
  }

  #reject(
    correlationId: string,
    sourceKey: string,
    command: SkillAdvertisementEventCommand,
    control: Exclude<SkillAdvertisementEventControl, "none">,
  ): void {
    this.#events.record(
      Object.freeze({
        contract: SKILL_ADVERTISEMENT_EVENT_CONTRACT_V1,
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
  command: SkillAdvertisementEventCommand,
): SkillAdvertisementEvent =>
  Object.freeze({
    contract: SKILL_ADVERTISEMENT_EVENT_CONTRACT_V1,
    correlationId,
    sourceKey,
    command,
    outcome: "accepted",
    control: "none",
  });

const isCurrentAdvertisement = (
  found: unknown,
  agentId: unknown,
  skillVersion: unknown,
): found is SkillAdvertisement =>
  isSkillAdvertisement(found) &&
  found.status === "advertised" &&
  found.agentId === agentId &&
  found.skillVersion === skillVersion;

const matchesEligibleAgent = (party: unknown, id: string): boolean =>
  isAgentIdentityEligibleForPrincipal(party) &&
  typeof party === "object" &&
  party !== null &&
  (party as { readonly id?: unknown }).id === id;

const parseAdvertise = (input: unknown): ParsedCommand | null => {
  const record = exactRecord(input, ADVERTISE_KEYS);
  const agentId = record === null ? null : parseAgentIdentityId(record.agentId);
  if (
    record === null ||
    !agentId?.ok ||
    record.contract !== SKILL_ADVERTISEMENT_COMMAND_CONTRACT_V1 ||
    record.action !== "advertise" ||
    !isToken(record.correlationId) ||
    !isPinnedSkillVersion(record.skillVersion)
  ) {
    return null;
  }
  return { correlationId: record.correlationId, agentId: agentId.value };
};

const parseWithdraw = (input: unknown): ParsedCommand | null => {
  const record = exactRecord(input, WITHDRAW_KEYS);
  const agentId = record === null ? null : parseAgentIdentityId(record.agentId);
  if (
    record === null ||
    !agentId?.ok ||
    record.contract !== SKILL_ADVERTISEMENT_COMMAND_CONTRACT_V1 ||
    record.action !== "withdraw" ||
    !isToken(record.correlationId) ||
    !isPinnedSkillVersion(record.skillVersion) ||
    !isSkillAdvertisementId(record.advertisementId)
  ) {
    return null;
  }
  return {
    correlationId: record.correlationId,
    agentId: agentId.value,
    advertisementId: record.advertisementId,
  };
};

const parseSourceKey = (source: TrustedSkillAdvertisementSource): string | null => {
  try {
    if (typeof source !== "object" || source === null) {
      return null;
    }
    const record = exactRecord(source, ["kind", "key"]);
    if (
      record === null ||
      Object.getPrototypeOf(source) !== Object.prototype ||
      record.kind !== "trusted-skill-advertisement-source" ||
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

const isErrorCode = (value: unknown, code: SkillAdvertisementErrorCode): boolean => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const keys = Reflect.ownKeys(value);
  return keys.length === 1 && keys[0] === "code" && (value as { code?: unknown }).code === code;
};
