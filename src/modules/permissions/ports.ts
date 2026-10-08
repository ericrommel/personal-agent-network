import type { SkillPermissionEvent } from "./contracts.js";
import type { SkillPermission } from "./domain/skill-permission.js";

declare const trustedPermissionSourceBrand: unique symbol;

/** Local human owner path. There is no parser from remote JSON. */
export type TrustedPermissionSource = Readonly<{
  kind: "trusted-permission-source";
  key: string;
  readonly [trustedPermissionSourceBrand]: true;
}>;

export interface PermissionPartyPort {
  findAgent(id: unknown): Promise<unknown>;
}

export interface SkillPermissionEventSink {
  record(event: SkillPermissionEvent): void;
}

export interface SkillPermissionStorePort {
  insertActive(record: SkillPermission, event: SkillPermissionEvent): unknown;
  revokeMatching(
    fromAgentId: unknown,
    toAgentId: unknown,
    permissionId: unknown,
    event: SkillPermissionEvent,
  ): unknown;
  findCurrent(fromAgentId: unknown, toAgentId: unknown): unknown;
}

/** Drops pending and approved approvals for one ordered pair. Released rows stay released. */
export interface UnreleasedApprovalPort {
  invalidateUnreleased(fromAgentId: string, toAgentId: string): void;
}
