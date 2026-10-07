import type { SkillAdvertisementEvent } from "./contracts.js";
import type { SkillAdvertisement } from "./domain/skill-advertisement.js";

declare const trustedSkillAdvertisementSourceBrand: unique symbol;

/** Local control path only. There is no parser from remote JSON. */
export type TrustedSkillAdvertisementSource = Readonly<{
  kind: "trusted-skill-advertisement-source";
  key: string;
  readonly [trustedSkillAdvertisementSourceBrand]: true;
}>;

export interface SkillAdvertisementPartyPort {
  findAgent(id: unknown): Promise<unknown>;
}

export interface SkillAdvertisementEventSink {
  record(event: SkillAdvertisementEvent): void;
}

export interface SkillAdvertisementStorePort {
  insertAdvertised(record: SkillAdvertisement, event: SkillAdvertisementEvent): unknown;
  withdrawMatching(
    agentId: unknown,
    skillVersion: unknown,
    advertisementId: unknown,
    event: SkillAdvertisementEvent,
  ): unknown;
  findCurrent(agentId: unknown, skillVersion: unknown): unknown;
}
