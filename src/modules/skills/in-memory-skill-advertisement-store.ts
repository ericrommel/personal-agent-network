import type { SkillAdvertisementError, SkillAdvertisementEvent } from "./contracts.js";
import {
  advertisementKey,
  isSkillAdvertisement,
  isSkillAdvertisementId,
  type SkillAdvertisement,
  withdrawStoredSkillAdvertisement,
} from "./domain/skill-advertisement.js";
import type { SkillAdvertisementEventSink, SkillAdvertisementStorePort } from "./ports.js";

const dependencyFailure = (): SkillAdvertisementError =>
  Object.freeze({ code: "SKILL_ADVERTISEMENT_DEPENDENCY_FAILED" });

const notFound = (): SkillAdvertisementError =>
  Object.freeze({ code: "SKILL_ADVERTISEMENT_NOT_FOUND" });

/**
 * Presence only inside one JavaScript process. Restart clears every advertisement.
 * Absence after restart denies. This store is not a permission and not durable evidence.
 */
export class InMemorySkillAdvertisementStore implements SkillAdvertisementStorePort {
  readonly #events: SkillAdvertisementEventSink;
  readonly #records = new Map<string, unknown>();

  constructor(
    events: SkillAdvertisementEventSink,
    seed?: ReadonlyArray<readonly [string, unknown]>,
  ) {
    this.#events = events;
    if (seed === undefined) {
      return;
    }
    for (const entry of seed) {
      this.#records.set(entry[0], entry[1]);
    }
  }

  insertAdvertised(record: SkillAdvertisement, event: SkillAdvertisementEvent): unknown {
    if (!isSkillAdvertisement(record) || record.status !== "advertised") {
      return dependencyFailure();
    }
    const key = `${record.agentId}>${record.skillVersion}`;
    const current = this.#records.get(key);
    if (isSkillAdvertisement(current) && current.status === "advertised") {
      return Object.freeze({ code: "SKILL_ADVERTISEMENT_CONFLICT" });
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

  withdrawMatching(
    agentId: unknown,
    skillVersion: unknown,
    advertisementId: unknown,
    event: SkillAdvertisementEvent,
  ): unknown {
    const key = advertisementKey(agentId, skillVersion);
    const current = key === null ? undefined : this.#records.get(key);
    if (
      key === null ||
      !isSkillAdvertisementId(advertisementId) ||
      !isSkillAdvertisement(current) ||
      current.id !== advertisementId
    ) {
      return notFound();
    }
    const withdrawn = withdrawStoredSkillAdvertisement(current);
    this.#records.set(key, withdrawn);
    try {
      this.#events.record(event);
    } catch {
      return withdrawn;
    }
    return withdrawn;
  }

  findCurrent(agentId: unknown, skillVersion: unknown): unknown {
    const key = advertisementKey(agentId, skillVersion);
    if (key === null) {
      return null;
    }
    const current = this.#records.get(key);
    return isSkillAdvertisement(current) ? current : null;
  }
}
