import { failure, type Result, success } from "../../shared/domain/result.js";
import {
  type AgentIdentityId,
  isAgentIdentityEligibleForPrincipal,
  parseAgentIdentityId,
} from "../identity/index.js";
import {
  RELATIONSHIP_COMMAND_CONTRACT_V1,
  RELATIONSHIP_EVENT_CONTRACT_V1,
  type RelationshipError,
  type RelationshipErrorCode,
  type RelationshipEvent,
  type RelationshipEventCommand,
  type RelationshipEventControl,
} from "./contracts.js";
import {
  createStoredRelationship,
  isRelationship,
  isRelationshipId,
  type Relationship,
  type RelationshipId,
} from "./domain/relationship.js";
import type {
  RelationshipEventSink,
  RelationshipPartyPort,
  RelationshipStorePort,
  TrustedRelationshipSource,
} from "./ports.js";

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CREATE_KEYS = ["contract", "action", "correlationId", "fromAgentId", "toAgentId"] as const;
const REVOKE_KEYS = [
  "contract",
  "action",
  "correlationId",
  "fromAgentId",
  "toAgentId",
  "relationshipId",
] as const;

export type RelationshipServiceDependencies = Readonly<{
  parties: RelationshipPartyPort;
  store: RelationshipStorePort;
}>;

type ParsedCommand = Readonly<{
  correlationId: string;
  fromAgentId: AgentIdentityId;
  toAgentId: AgentIdentityId;
  relationshipId?: RelationshipId;
}>;

const invalid = (): Result<never, RelationshipError> =>
  failure({ code: "RELATIONSHIP_COMMAND_INVALID" });

const rejected = (code: RelationshipErrorCode): Result<never, RelationshipError> =>
  failure({ code });

export class RelationshipService {
  readonly #parties: RelationshipPartyPort;
  readonly #store: RelationshipStorePort;
  readonly #events: RelationshipEventSink;

  constructor(dependencies: RelationshipServiceDependencies & { events: RelationshipEventSink }) {
    this.#parties = dependencies.parties;
    this.#store = dependencies.store;
    this.#events = dependencies.events;
  }

  async create(
    source: TrustedRelationshipSource,
    command: unknown,
  ): Promise<Result<Relationship, RelationshipError>> {
    return this.#mutate("create", source, command);
  }

  async revoke(
    source: TrustedRelationshipSource,
    command: unknown,
  ): Promise<Result<Relationship, RelationshipError>> {
    return this.#mutate("revoke", source, command);
  }

  async readActive(from: unknown, to: unknown): Promise<boolean> {
    try {
      const found = this.#store.findByDirectedPair(from, to);
      if (
        !isRelationship(found) ||
        found.status !== "active" ||
        found.fromAgentId !== from ||
        found.toAgentId !== to
      ) {
        return false;
      }
      const fromParty = await this.#parties.findAgent(found.fromAgentId);
      const toParty = await this.#parties.findAgent(found.toAgentId);
      return (
        matchesEligibleAgent(fromParty, found.fromAgentId) &&
        matchesEligibleAgent(toParty, found.toAgentId)
      );
    } catch {
      return false;
    }
  }

  async #mutate(
    action: RelationshipEventCommand,
    source: TrustedRelationshipSource,
    command: unknown,
  ): Promise<Result<Relationship, RelationshipError>> {
    let correlationId = "invalid";
    let sourceKey = "invalid";
    try {
      const parsed =
        action === "create" ? parseCreateCommand(command) : parseRevokeCommand(command);
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

      if (action === "create") {
        return await this.#create(parsed, correlationId, sourceKey);
      }
      return this.#revoke(parsed, correlationId, sourceKey);
    } catch {
      return rejected("RELATIONSHIP_DEPENDENCY_FAILED");
    }
  }

  async #create(
    parsed: ParsedCommand,
    correlationId: string,
    sourceKey: string,
  ): Promise<Result<Relationship, RelationshipError>> {
    let fromParty: unknown;
    let toParty: unknown;
    try {
      fromParty = await this.#parties.findAgent(parsed.fromAgentId);
      toParty = await this.#parties.findAgent(parsed.toAgentId);
    } catch {
      this.#reject(correlationId, sourceKey, "create", "dependency");
      return rejected("RELATIONSHIP_DEPENDENCY_FAILED");
    }

    if (
      !matchesEligibleAgent(fromParty, parsed.fromAgentId) ||
      !matchesEligibleAgent(toParty, parsed.toAgentId)
    ) {
      this.#reject(correlationId, sourceKey, "create", "validation");
      return rejected("RELATIONSHIP_PARTY_INELIGIBLE");
    }

    const created = createStoredRelationship(parsed.fromAgentId, parsed.toAgentId);
    const stored = this.#store.insertActive(
      created,
      acceptedEvent(correlationId, sourceKey, "create"),
    );
    if (isRelationship(stored)) {
      return success(stored);
    }
    if (isErrorCode(stored, "RELATIONSHIP_CONFLICT")) {
      this.#reject(correlationId, sourceKey, "create", "conflict");
      return rejected("RELATIONSHIP_CONFLICT");
    }
    return rejected("RELATIONSHIP_DEPENDENCY_FAILED");
  }

  #revoke(
    parsed: ParsedCommand,
    correlationId: string,
    sourceKey: string,
  ): Result<Relationship, RelationshipError> {
    const stored = this.#store.revokeMatching(
      parsed.fromAgentId,
      parsed.toAgentId,
      parsed.relationshipId,
      acceptedEvent(correlationId, sourceKey, "revoke"),
    );
    if (
      isRelationship(stored) &&
      stored.status === "revoked" &&
      stored.id === parsed.relationshipId
    ) {
      return success(stored);
    }
    if (isErrorCode(stored, "RELATIONSHIP_NOT_FOUND")) {
      this.#reject(correlationId, sourceKey, "revoke", "validation");
      return rejected("RELATIONSHIP_NOT_FOUND");
    }
    return rejected("RELATIONSHIP_DEPENDENCY_FAILED");
  }

  #reject(
    correlationId: string,
    sourceKey: string,
    command: RelationshipEventCommand,
    control: Exclude<RelationshipEventControl, "none">,
  ): void {
    this.#events.record(
      Object.freeze({
        contract: RELATIONSHIP_EVENT_CONTRACT_V1,
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
  command: RelationshipEventCommand,
): RelationshipEvent =>
  Object.freeze({
    contract: RELATIONSHIP_EVENT_CONTRACT_V1,
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

const parseCreateCommand = (input: unknown): ParsedCommand | null => {
  const record = exactRecord(input, CREATE_KEYS);
  const pair = record === null ? null : isAgentPair(record.fromAgentId, record.toAgentId);
  if (
    record === null ||
    pair === null ||
    record.contract !== RELATIONSHIP_COMMAND_CONTRACT_V1 ||
    record.action !== "create" ||
    !isToken(record.correlationId)
  ) {
    return null;
  }
  return {
    correlationId: record.correlationId,
    fromAgentId: pair.fromAgentId,
    toAgentId: pair.toAgentId,
  };
};

const parseRevokeCommand = (input: unknown): ParsedCommand | null => {
  const record = exactRecord(input, REVOKE_KEYS);
  const pair = record === null ? null : isAgentPair(record.fromAgentId, record.toAgentId);
  if (
    record === null ||
    pair === null ||
    record.contract !== RELATIONSHIP_COMMAND_CONTRACT_V1 ||
    record.action !== "revoke" ||
    !isToken(record.correlationId) ||
    !isRelationshipId(record.relationshipId)
  ) {
    return null;
  }
  return {
    correlationId: record.correlationId,
    fromAgentId: pair.fromAgentId,
    toAgentId: pair.toAgentId,
    relationshipId: record.relationshipId,
  };
};

const parseSourceKey = (source: TrustedRelationshipSource): string | null => {
  try {
    if (typeof source !== "object" || source === null) {
      return null;
    }
    const record = exactRecord(source, ["kind", "key"]);
    if (
      record === null ||
      Object.getPrototypeOf(source) !== Object.prototype ||
      record.kind !== "trusted-relationship-source" ||
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

const isAgentPair = (
  from: unknown,
  to: unknown,
): Readonly<{ fromAgentId: AgentIdentityId; toAgentId: AgentIdentityId }> | null => {
  const parsedFrom = parseAgentIdentityId(from);
  const parsedTo = parseAgentIdentityId(to);
  if (!parsedFrom.ok || !parsedTo.ok || parsedFrom.value === parsedTo.value) {
    return null;
  }
  return { fromAgentId: parsedFrom.value, toAgentId: parsedTo.value };
};

const isErrorCode = (value: unknown, code: RelationshipErrorCode): boolean => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const keys = Reflect.ownKeys(value);
  return (
    keys.length === 1 && keys[0] === "code" && (value as { readonly code?: unknown }).code === code
  );
};
