import {
  type SqlPool as ApprovalSqlPool,
  applyApprovalSchema,
  createPgPool as createApprovalPool,
  PostgresApprovalStore,
} from "../modules/approval/index.js";
import {
  type SqlPool as AuditSqlPool,
  applyAuditSchema,
  createPgPool as createAuditPool,
  PostgresAuditLog,
} from "../modules/audit/index.js";
import type { SimulatedPrivateContext } from "../modules/context/index.js";
import type { AgentIdentity } from "../modules/identity/index.js";
import {
  applyReplaySchema,
  createPgPool as createReplayPool,
  PostgresReplayStore,
  type SqlPool as ReplaySqlPool,
} from "../modules/messaging/index.js";
import {
  AwaitedSkillPermissionStore,
  applySkillPermissionSchema,
  createPgPool as createPermissionPool,
  type SqlPool as PermissionSqlPool,
  PostgresSkillPermissionStore,
} from "../modules/permissions/index.js";
import {
  applyRelationshipSchema,
  createPgPool as createRelationshipPool,
  PostgresRelationshipStore,
  type SqlPool as RelationshipSqlPool,
} from "../modules/relationships/index.js";
import {
  type SqlPool as AdvertisementSqlPool,
  AwaitedSkillAdvertisementStore,
  applySkillAdvertisementSchema,
  createPgPool as createAdvertisementPool,
  PostgresSkillAdvertisementStore,
} from "../modules/skills/index.js";
import { type LocalAvailabilityClock, LocalAvailabilityNode } from "./local-availability-node.js";
import type { RemoteHttpsDependencies } from "./remote-https-server.js";

/**
 * Opens the existing PostgreSQL adapters for one demonstration process.
 * LocalAvailabilityNode does not call this. src/main.ts and the CLI do not call this.
 * Nothing here listens or grants authority from remote input.
 */

type DurableSqlPool =
  | RelationshipSqlPool
  | ApprovalSqlPool
  | PermissionSqlPool
  | AdvertisementSqlPool
  | AuditSqlPool
  | ReplaySqlPool;

export type DurablePoolOpeners = Readonly<{
  relationships: (databaseUrl: string) => RelationshipSqlPool;
  approvals: (databaseUrl: string) => ApprovalSqlPool;
  permissions: (databaseUrl: string) => PermissionSqlPool;
  advertisements: (databaseUrl: string) => AdvertisementSqlPool;
  audit: (databaseUrl: string) => AuditSqlPool;
  replay: (databaseUrl: string) => ReplaySqlPool;
}>;

export type DurableAvailabilityOptions = Readonly<{
  clock: LocalAvailabilityClock;
  agents: readonly AgentIdentity[];
  localAgentId: string;
  context?: SimulatedPrivateContext;
}>;

export type DurableAvailabilityResources = Readonly<{
  node: LocalAvailabilityNode;
  replay: PostgresReplayStore;
  audit: PostgresAuditLog;
  dependencies: RemoteHttpsDependencies;
  close: () => Promise<void>;
}>;

const silent = { record(): void {} };

const defaultOpeners: DurablePoolOpeners = {
  relationships: (databaseUrl) => createRelationshipPool(databaseUrl),
  approvals: (databaseUrl) => createApprovalPool(databaseUrl),
  permissions: (databaseUrl) => createPermissionPool(databaseUrl),
  advertisements: (databaseUrl) => createAdvertisementPool(databaseUrl),
  audit: (databaseUrl) => createAuditPool(databaseUrl),
  replay: (databaseUrl) => createReplayPool(databaseUrl),
};

const endAll = async (pools: readonly DurableSqlPool[]): Promise<void> => {
  await Promise.all(pools.map((pool) => pool.end().catch(() => undefined)));
};

export const openDurableAvailabilityResources = async (
  databaseUrl: string,
  options: DurableAvailabilityOptions,
  openers: DurablePoolOpeners = defaultOpeners,
): Promise<DurableAvailabilityResources> => {
  if (databaseUrl.trim() === "" || options.localAgentId.trim() === "") {
    throw new Error("durable availability ingress requires a database URL and a local agent id");
  }
  const opened: DurableSqlPool[] = [];
  const remember = <T extends DurableSqlPool>(pool: T): T => {
    opened.push(pool);
    return pool;
  };
  try {
    const relationships = remember(openers.relationships(databaseUrl));
    const approvals = remember(openers.approvals(databaseUrl));
    const permissions = remember(openers.permissions(databaseUrl));
    const advertisements = remember(openers.advertisements(databaseUrl));
    const audit = remember(openers.audit(databaseUrl));
    const replayPool = remember(openers.replay(databaseUrl));
    await applyRelationshipSchema(relationships);
    await applyApprovalSchema(approvals);
    await applySkillPermissionSchema(permissions);
    await applySkillAdvertisementSchema(advertisements);
    await applyAuditSchema(audit);
    await applyReplaySchema(replayPool);
    const durableAudit = new PostgresAuditLog(audit, options.clock);
    const node = new LocalAvailabilityNode({
      clock: options.clock,
      agents: options.agents,
      ...(options.context === undefined ? {} : { context: options.context }),
      relationshipStore: new PostgresRelationshipStore(relationships, silent),
      approvalStore: new PostgresApprovalStore(approvals),
      permissionStore: new AwaitedSkillPermissionStore(
        new PostgresSkillPermissionStore(permissions, silent),
      ),
      advertisementStore: new AwaitedSkillAdvertisementStore(
        new PostgresSkillAdvertisementStore(advertisements, silent),
      ),
      audit: durableAudit,
    });
    const replay = new PostgresReplayStore(replayPool);
    return {
      node,
      replay,
      audit: durableAudit,
      dependencies: {
        localAgentId: options.localAgentId,
        nowMs: () => options.clock.nowMs(),
        store: replay,
        audit: durableAudit,
        handle: (principal, body) => node.handle(principal, body),
      },
      close: async () => {
        await Promise.all(opened.map((pool) => pool.end()));
      },
    };
  } catch (error) {
    await endAll(opened);
    throw error;
  }
};
