import type { SkillPermissionEvent } from "./contracts.js";
import type { SkillPermission } from "./domain/skill-permission.js";
import type { SkillPermissionStorePort } from "./ports.js";

/**
 * Port adapter for the durable permission commands.
 * PostgresSkillPermissionStore keeps different method names so it is not
 * itself a SkillPermissionStorePort. This class returns those Promises.
 * The service must await them. This adapter does not open a pool.
 */
export type DurableSkillPermissionCommands = Readonly<{
  insertDurablePermission(record: SkillPermission, event: SkillPermissionEvent): unknown;
  revokeDurablePermission(
    fromAgentId: unknown,
    toAgentId: unknown,
    permissionId: unknown,
    event: SkillPermissionEvent,
  ): unknown;
  findDurablePermission(fromAgentId: unknown, toAgentId: unknown): unknown;
}>;

export class AwaitedSkillPermissionStore implements SkillPermissionStorePort {
  readonly #commands: DurableSkillPermissionCommands;

  constructor(commands: DurableSkillPermissionCommands) {
    this.#commands = commands;
  }

  insertActive(record: SkillPermission, event: SkillPermissionEvent): unknown {
    return this.#commands.insertDurablePermission(record, event);
  }

  revokeMatching(
    fromAgentId: unknown,
    toAgentId: unknown,
    permissionId: unknown,
    event: SkillPermissionEvent,
  ): unknown {
    return this.#commands.revokeDurablePermission(fromAgentId, toAgentId, permissionId, event);
  }

  findCurrent(fromAgentId: unknown, toAgentId: unknown): unknown {
    return this.#commands.findDurablePermission(fromAgentId, toAgentId);
  }
}

type _AwaitedPermissionMatchesPort = AwaitedSkillPermissionStore extends SkillPermissionStorePort
  ? true
  : never;

const _awaitedPermissionMatchesPort: _AwaitedPermissionMatchesPort = true;
void _awaitedPermissionMatchesPort;
