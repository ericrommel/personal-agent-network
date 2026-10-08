import type { SkillAdvertisementEvent } from "./contracts.js";
import type { SkillAdvertisement } from "./domain/skill-advertisement.js";
import type { SkillAdvertisementStorePort } from "./ports.js";

/**
 * Port adapter for the durable advertisement commands.
 * PostgresSkillAdvertisementStore keeps different method names so it is not
 * itself a SkillAdvertisementStorePort. This class returns those Promises.
 * The service must await them. An advertisement grants nothing. This adapter
 * does not open a pool.
 */
export type DurableSkillAdvertisementCommands = Readonly<{
  insertDurableAdvertisement(record: SkillAdvertisement, event: SkillAdvertisementEvent): unknown;
  withdrawDurableAdvertisement(
    agentId: unknown,
    skillVersion: unknown,
    advertisementId: unknown,
    event: SkillAdvertisementEvent,
  ): unknown;
  findDurableAdvertisement(agentId: unknown, skillVersion: unknown): unknown;
}>;

export class AwaitedSkillAdvertisementStore implements SkillAdvertisementStorePort {
  readonly #commands: DurableSkillAdvertisementCommands;

  constructor(commands: DurableSkillAdvertisementCommands) {
    this.#commands = commands;
  }

  insertAdvertised(record: SkillAdvertisement, event: SkillAdvertisementEvent): unknown {
    return this.#commands.insertDurableAdvertisement(record, event);
  }

  withdrawMatching(
    agentId: unknown,
    skillVersion: unknown,
    advertisementId: unknown,
    event: SkillAdvertisementEvent,
  ): unknown {
    return this.#commands.withdrawDurableAdvertisement(
      agentId,
      skillVersion,
      advertisementId,
      event,
    );
  }

  findCurrent(agentId: unknown, skillVersion: unknown): unknown {
    return this.#commands.findDurableAdvertisement(agentId, skillVersion);
  }
}

type _AwaitedAdvertisementMatchesPort =
  AwaitedSkillAdvertisementStore extends SkillAdvertisementStorePort ? true : never;

const _awaitedAdvertisementMatchesPort: _AwaitedAdvertisementMatchesPort = true;
void _awaitedAdvertisementMatchesPort;
