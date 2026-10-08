import { failure, type Result, success } from "../../shared/domain/result.js";
import { parseAgentIdentityId } from "../identity/index.js";
import {
  APPROVAL_LIFETIME_MS,
  type ApprovalClock,
  type ApprovalError,
  type ApprovalErrorCode,
  type TrustedApprovalSource,
} from "./contracts.js";
import {
  type ApprovalRecord,
  type ApprovalStatus,
  createPendingApproval,
  isApproval,
  isApprovalId,
  parseUtcInstant,
  readApprovalBinding,
  withApprovalStatus,
} from "./domain/approval.js";
import type { ApprovalStore } from "./in-memory-approval-store.js";

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SOURCE_KEYS = ["kind", "key"] as const;

export type ApprovalServiceDependencies = Readonly<{
  clock: ApprovalClock;
  store: ApprovalStore;
}>;

const invalid = (): Result<never, ApprovalError> =>
  failure(Object.freeze({ code: "APPROVAL_COMMAND_INVALID" }));

const conflict = (): Result<never, ApprovalError> =>
  failure(Object.freeze({ code: "APPROVAL_CONFLICT" }));

const notFound = (): Result<never, ApprovalError> =>
  failure(Object.freeze({ code: "APPROVAL_NOT_FOUND" }));

const dependency = (): Result<never, ApprovalError> =>
  failure(Object.freeze({ code: "APPROVAL_DEPENDENCY_FAILED" }));

/**
 * Local approval lifecycle. ASK is recorded only through createAsk.
 * Approve and reject accept a trusted local source, not a remote parser.
 */
export class ApprovalService {
  readonly #clock: ApprovalClock;
  readonly #store: ApprovalStore;

  constructor(dependencies: ApprovalServiceDependencies) {
    this.#clock = dependencies.clock;
    this.#store = dependencies.store;
  }

  createAsk(input: unknown): Result<ApprovalRecord, ApprovalError> {
    try {
      const binding = readApprovalBinding(input);
      if (binding === null) {
        return invalid();
      }
      const now = this.#now();
      if (now === null) {
        return dependency();
      }
      const created = createPendingApproval(
        binding,
        new Date(now + APPROVAL_LIFETIME_MS).toISOString(),
      );
      if (created === null) {
        return dependency();
      }
      const stored = this.#store.insertPending(created);
      if (isApproval(stored)) {
        return success(stored);
      }
      if (isErrorCode(stored, "APPROVAL_CONFLICT")) {
        return conflict();
      }
      return dependency();
    } catch {
      return dependency();
    }
  }

  approve(
    source: TrustedApprovalSource,
    approvalId: unknown,
  ): Result<ApprovalRecord, ApprovalError> {
    return this.#decide("approved", source, approvalId);
  }

  reject(
    source: TrustedApprovalSource,
    approvalId: unknown,
  ): Result<ApprovalRecord, ApprovalError> {
    return this.#decide("rejected", source, approvalId);
  }

  /**
   * Single spend. True only for one unexpired approved row whose current
   * relationshipActive is exactly true. A later call returns false.
   */
  release(approvalId: unknown, relationshipActive: unknown): boolean {
    try {
      if (!isApprovalId(approvalId)) {
        return false;
      }
      const current = this.#stored(this.#store.findById(approvalId));
      if (current === "missing" || current === "corrupt" || current.status !== "approved") {
        return false;
      }
      const now = this.#now();
      const expiresAt = parseUtcInstant(current.expiresAt);
      if (now === null || expiresAt === null) {
        return false;
      }
      if (now >= expiresAt) {
        return false;
      }
      if (relationshipActive === false) {
        this.#store.replace(withApprovalStatus(current, "invalidated"));
        return false;
      }
      if (relationshipActive !== true) {
        return false;
      }
      const saved = this.#store.replace(withApprovalStatus(current, "released"));
      return isApproval(saved) && saved.status === "released" && saved.id === current.id;
    } catch {
      return false;
    }
  }

  /** Pending and approved rows for this ordered pair only. Released rows stay released. */
  invalidateUnreleased(from: unknown, to: unknown): void {
    try {
      const binding = orderedPair(from, to);
      if (binding === null) {
        return;
      }
      for (const value of this.#store.values()) {
        if (
          !isApproval(value) ||
          value.fromAgentId !== binding.fromAgentId ||
          value.toAgentId !== binding.toAgentId ||
          (value.status !== "pending" && value.status !== "approved")
        ) {
          continue;
        }
        this.#store.replace(withApprovalStatus(value, "invalidated"));
      }
    } catch {
      return;
    }
  }

  findById(approvalId: unknown): ApprovalRecord | null {
    try {
      return readable(this.#stored(this.#store.findById(approvalId)));
    } catch {
      return null;
    }
  }

  findByRequestId(requestId: unknown): ApprovalRecord | null {
    try {
      return readable(this.#stored(this.#store.findByRequestId(requestId)));
    } catch {
      return null;
    }
  }

  #decide(
    decision: Extract<ApprovalStatus, "approved" | "rejected">,
    source: TrustedApprovalSource,
    approvalId: unknown,
  ): Result<ApprovalRecord, ApprovalError> {
    try {
      if (readSourceKey(source) === null) {
        return invalid();
      }
      if (!isApprovalId(approvalId)) {
        return invalid();
      }
      const current = this.#stored(this.#store.findById(approvalId));
      if (current === "missing") {
        return notFound();
      }
      if (current === "corrupt") {
        return dependency();
      }
      const now = this.#now();
      const expiresAt = parseUtcInstant(current.expiresAt);
      if (now === null || expiresAt === null) {
        return dependency();
      }
      if (current.status === "pending" && now >= expiresAt) {
        return this.#save(withApprovalStatus(current, "expired"));
      }
      if (current.status === decision) {
        return success(current);
      }
      if (current.status !== "pending") {
        return conflict();
      }
      return this.#save(withApprovalStatus(current, decision));
    } catch {
      return dependency();
    }
  }

  #save(record: ApprovalRecord): Result<ApprovalRecord, ApprovalError> {
    const saved = this.#store.replace(record);
    if (isApproval(saved) && saved.id === record.id && saved.status === record.status) {
      return success(saved);
    }
    return dependency();
  }

  #stored(found: unknown): ApprovalRecord | "missing" | "corrupt" {
    if (found === null || found === undefined) {
      return "missing";
    }
    return isApproval(found) ? found : "corrupt";
  }

  #now(): number | null {
    try {
      return parseUtcInstant(this.#clock.now());
    } catch {
      return null;
    }
  }
}

const orderedPair = (
  from: unknown,
  to: unknown,
): Readonly<{ fromAgentId: string; toAgentId: string }> | null => {
  const fromAgentId = parseAgentIdentityId(from);
  const toAgentId = parseAgentIdentityId(to);
  if (!fromAgentId.ok || !toAgentId.ok || fromAgentId.value === toAgentId.value) {
    return null;
  }
  return { fromAgentId: fromAgentId.value, toAgentId: toAgentId.value };
};

const readable = (found: ApprovalRecord | "missing" | "corrupt"): ApprovalRecord | null =>
  found === "missing" || found === "corrupt" ? null : found;

const readSourceKey = (source: TrustedApprovalSource): string | null => {
  try {
    if (typeof source !== "object" || source === null) {
      return null;
    }
    const record = exactRecord(source, SOURCE_KEYS);
    const sourceKey = record?.key;
    if (
      record === null ||
      sourceKey === undefined ||
      Object.getPrototypeOf(source) !== Object.prototype ||
      record.kind !== "trusted-approval-source" ||
      !TOKEN.test(sourceKey)
    ) {
      return null;
    }
    return sourceKey;
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
      const value = record[key];
      if (typeof value !== "string") {
        return null;
      }
      parsed[key] = value;
    }
    return parsed;
  } catch {
    return null;
  }
};

const isErrorCode = (value: unknown, code: ApprovalErrorCode): boolean => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  const keys = Reflect.ownKeys(value);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Object.values(Object.getOwnPropertyDescriptors(value)).every((item) => "value" in item) &&
    keys.length === 1 &&
    keys[0] === "code" &&
    (value as { readonly code?: unknown }).code === code
  );
};
