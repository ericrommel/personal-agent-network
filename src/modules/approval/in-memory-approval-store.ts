import type { ApprovalError } from "./contracts.js";
import { type ApprovalStatus, isApproval, sameApprovalBinding } from "./domain/approval.js";

const dependencyFailure = (): ApprovalError =>
  Object.freeze({ code: "APPROVAL_DEPENDENCY_FAILED" });

const conflict = (): ApprovalError => Object.freeze({ code: "APPROVAL_CONFLICT" });

const TRANSITIONS: Readonly<Record<ApprovalStatus, readonly ApprovalStatus[]>> = {
  pending: ["approved", "rejected", "expired", "invalidated"],
  approved: ["released", "expired", "invalidated"],
  rejected: [],
  expired: [],
  released: [],
  invalidated: [],
};

export interface ApprovalStore {
  findByRequestId(requestId: unknown): unknown;
  findById(id: unknown): unknown;
  insertPending(record: unknown): unknown;
  replace(record: unknown): unknown;
  values(): readonly unknown[];
}

/**
 * Process-local approvals. A new instance is empty, including after restart.
 * This Map is not durable and is not shared across processes.
 */
export class InMemoryApprovalStore implements ApprovalStore {
  readonly #byRequestId = new Map<string, unknown>();
  readonly #requestIdByApprovalId = new Map<string, string>();

  constructor(seed?: ReadonlyArray<readonly [string, unknown]>) {
    if (seed === undefined) {
      return;
    }
    for (const [requestId, value] of seed) {
      this.#byRequestId.set(requestId, value);
      if (isApproval(value) && value.requestId === requestId) {
        this.#requestIdByApprovalId.set(value.id, requestId);
      }
    }
  }

  findByRequestId(requestId: unknown): unknown {
    try {
      if (typeof requestId !== "string") {
        return null;
      }
      return this.#byRequestId.get(requestId) ?? null;
    } catch {
      return null;
    }
  }

  findById(id: unknown): unknown {
    try {
      if (typeof id !== "string") {
        return null;
      }
      const requestId = this.#requestIdByApprovalId.get(id);
      if (requestId === undefined) {
        return null;
      }
      return this.#byRequestId.get(requestId) ?? null;
    } catch {
      return null;
    }
  }

  insertPending(record: unknown): unknown {
    try {
      if (!isApproval(record) || record.status !== "pending") {
        return dependencyFailure();
      }
      if (this.#requestIdByApprovalId.has(record.id)) {
        return dependencyFailure();
      }
      const current = this.#byRequestId.get(record.requestId);
      if (current !== undefined) {
        if (!isApproval(current)) {
          return dependencyFailure();
        }
        if (!sameApprovalBinding(current, record)) {
          return conflict();
        }
        return current;
      }
      this.#byRequestId.set(record.requestId, record);
      this.#requestIdByApprovalId.set(record.id, record.requestId);
      return record;
    } catch {
      return dependencyFailure();
    }
  }

  replace(record: unknown): unknown {
    try {
      if (!isApproval(record)) {
        return dependencyFailure();
      }
      const requestId = this.#requestIdByApprovalId.get(record.id);
      const current = requestId === undefined ? undefined : this.#byRequestId.get(requestId);
      if (
        requestId !== record.requestId ||
        !isApproval(current) ||
        current.id !== record.id ||
        current.expiresAt !== record.expiresAt ||
        !sameApprovalBinding(current, record) ||
        !canTransition(current.status, record.status)
      ) {
        return dependencyFailure();
      }
      if (current.status === record.status) {
        return current;
      }
      this.#byRequestId.set(record.requestId, record);
      return record;
    } catch {
      return dependencyFailure();
    }
  }

  values(): readonly unknown[] {
    return [...this.#byRequestId.values()];
  }
}

const canTransition = (from: ApprovalStatus, to: ApprovalStatus): boolean =>
  from === to || TRANSITIONS[from].includes(to);
