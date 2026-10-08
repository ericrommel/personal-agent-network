import type { SkillPermissionError, SkillPermissionEvent } from "./contracts.js";
import {
  isSkillPermission,
  isSkillPermissionId,
  permissionKey,
  revokeStoredSkillPermission,
  type SkillPermission,
} from "./domain/skill-permission.js";
import type { SkillPermissionEventSink, SkillPermissionStorePort } from "./ports.js";

const dependencyFailure = (): SkillPermissionError =>
  Object.freeze({ code: "SKILL_PERMISSION_DEPENDENCY_FAILED" });
const notFound = (): SkillPermissionError => Object.freeze({ code: "SKILL_PERMISSION_NOT_FOUND" });

/**
 * Permission only inside one process. Restart clears every grant.
 * Absence after restart denies. This store is not relationship state.
 */
export class InMemorySkillPermissionStore implements SkillPermissionStorePort {
  readonly #events: SkillPermissionEventSink;
  readonly #records = new Map<string, unknown>();

  constructor(events: SkillPermissionEventSink, seed?: ReadonlyArray<readonly [string, unknown]>) {
    this.#events = events;
    if (seed === undefined) {
      return;
    }
    for (const entry of seed) {
      this.#records.set(entry[0], entry[1]);
    }
  }

  insertActive(record: SkillPermission, event: SkillPermissionEvent): unknown {
    if (!isSkillPermission(record) || record.status !== "active") {
      return dependencyFailure();
    }
    const key = `${record.fromAgentId}>${record.toAgentId}`;
    const current = this.#records.get(key);
    if (isSkillPermission(current) && current.status === "active") {
      return Object.freeze({ code: "SKILL_PERMISSION_CONFLICT" });
    }
    this.#records.set(key, record);
    try {
      this.#events.record(event);
    } catch {
      this.#records.delete(key);
      return dependencyFailure();
    }
    return record;
  }

  revokeMatching(
    fromAgentId: unknown,
    toAgentId: unknown,
    permissionId: unknown,
    event: SkillPermissionEvent,
  ): unknown {
    const key = permissionKey(fromAgentId, toAgentId);
    const current = key === null ? undefined : this.#records.get(key);
    if (
      key === null ||
      !isSkillPermissionId(permissionId) ||
      !isSkillPermission(current) ||
      current.id !== permissionId
    ) {
      return notFound();
    }
    const revoked = revokeStoredSkillPermission(current);
    this.#records.set(key, revoked);
    try {
      this.#events.record(event);
    } catch {
      return revoked;
    }
    return revoked;
  }

  findCurrent(fromAgentId: unknown, toAgentId: unknown): unknown {
    const key = permissionKey(fromAgentId, toAgentId);
    if (key === null) {
      return null;
    }
    const current = this.#records.get(key);
    return isSkillPermission(current) ? current : null;
  }
}
