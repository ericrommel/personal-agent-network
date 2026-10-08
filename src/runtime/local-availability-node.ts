import { parseUtcInstant } from "../modules/approval/domain/approval.js";
import {
  APPROVAL_POLICY_VERSION_V1,
  APPROVAL_PURPOSE_V1,
  APPROVAL_SCOPE_V1,
  APPROVAL_SKILL_VERSION_V1,
  type ApprovalRecord,
  ApprovalService,
  type ApprovalStore,
  InMemoryApprovalStore,
  type PostgresApprovalStore,
} from "../modules/approval/index.js";
import {
  type AuditCategory,
  type AuditError,
  type AuditEvent,
  type AuditOutcome,
  LocalAuditLog,
  type PostgresAuditLog,
  type TrustedAuditOperator,
} from "../modules/audit/index.js";
import {
  type AvailabilityInterval,
  AvailabilityService,
  type SimulatedPrivateContext,
} from "../modules/context/index.js";
import type { AgentIdentity } from "../modules/identity/index.js";
import {
  type AvailabilityResponse,
  handleAvailabilityRequest,
} from "../modules/messaging/index.js";
import {
  InMemorySkillPermissionStore,
  SkillPermissionService,
  type SkillPermissionStorePort,
} from "../modules/permissions/index.js";
import {
  decideAuthorization,
  type PolicyDecision,
  type PolicyPorts,
} from "../modules/policy/index.js";
import {
  InMemoryRelationshipStore,
  RelationshipService,
  type RelationshipStorePort,
} from "../modules/relationships/index.js";
import {
  InMemorySkillAdvertisementStore,
  SkillAdvertisementService,
} from "../modules/skills/index.js";
import type { Result } from "../shared/domain/result.js";

export type LocalAvailabilityClock = Readonly<{
  now(): string;
  nowMs(): number;
}>;

export type AuditAppendPort = Readonly<{
  append(
    operator: TrustedAuditOperator,
    command: unknown,
  ): Result<AuditEvent, AuditError> | Promise<Result<AuditEvent, AuditError>>;
}>;

export type LocalAvailabilityNodeOptions = Readonly<{
  clock: LocalAvailabilityClock;
  agents: readonly AgentIdentity[];
  audit?: AuditAppendPort;
  context?: SimulatedPrivateContext;
  findAgent?: (id: unknown) => Promise<unknown>;
  relationshipStore?: RelationshipStorePort;
  approvalStore?: ApprovalStore;
  permissionStore?: SkillPermissionStorePort;
}>;

type QueryInput = Readonly<{
  requesterId: string;
  targetId: string;
  requestId: string;
  start: string;
  end: string;
}>;

const operator = {
  kind: "trusted-audit-operator",
  key: "local-owner",
} as TrustedAuditOperator;

const silentEvents = { record(): void {} };

/**
 * Process-local wiring for one availability node.
 * The default stores drop on restart. An injected PostgreSQL relationship store,
 * approval store, permission store, or audit log can outlive the process.
 * handle waits for the audit append. Approval calls wait for the approval store.
 * Permission calls wait for the permission store. These options are not
 * two-node acceptance evidence.
 */
export class LocalAvailabilityNode {
  readonly auditLog: LocalAuditLog;
  readonly relationships: RelationshipService;
  readonly advertisements: SkillAdvertisementService;
  readonly permissions: SkillPermissionService;
  readonly approvals: ApprovalService;
  readonly availability: AvailabilityService;
  readonly #clock: LocalAvailabilityClock;
  readonly #audit: AuditAppendPort;
  readonly #context: SimulatedPrivateContext;
  readonly #policyPorts: PolicyPorts;

  constructor(options: LocalAvailabilityNodeOptions) {
    this.#clock = options.clock;
    this.auditLog = new LocalAuditLog(options.clock);
    this.#audit = options.audit ?? this.auditLog;
    this.#context = options.context ?? { busyIntervals: [] };
    const agents = new Map(options.agents.map((agent) => [agent.id, agent]));
    const findAgent =
      options.findAgent ?? (async (id: unknown) => agents.get(id as AgentIdentity["id"]) ?? null);
    const parties = { findAgent };
    this.approvals = new ApprovalService({
      clock: options.clock,
      store: options.approvalStore ?? new InMemoryApprovalStore(),
    });
    this.relationships = new RelationshipService({
      parties,
      events: silentEvents,
      store: options.relationshipStore ?? new InMemoryRelationshipStore(silentEvents),
    });
    this.advertisements = new SkillAdvertisementService({
      parties,
      events: silentEvents,
      store: new InMemorySkillAdvertisementStore(silentEvents),
    });
    this.permissions = new SkillPermissionService({
      parties,
      events: silentEvents,
      store: options.permissionStore ?? new InMemorySkillPermissionStore(silentEvents),
      approvals: {
        invalidateUnreleased: (from, to) => this.approvals.invalidateUnreleased(from, to),
      },
    });
    this.availability = new AvailabilityService({
      context: this.#context,
      clock: options.clock,
    });
    this.#policyPorts = {
      readActive: (from, to) => this.relationships.readActive(from, to),
      readAdvertised: (agentId, skillVersion) =>
        this.advertisements.readAdvertised(agentId, skillVersion),
      readPermission: (from, to) => this.permissions.readSnapshot(from, to),
    };
  }

  setBusyIntervals(intervals: readonly AvailabilityInterval[]): void {
    const target = this.#context.busyIntervals as AvailabilityInterval[];
    target.splice(0, target.length, ...intervals);
  }

  async handle(principal: unknown, body: unknown): Promise<AvailabilityResponse> {
    let firstDecision: PolicyDecision | null = null;
    let invalidated = false;
    const response = await handleAvailabilityRequest(principal, body, {
      decide: async (input) => {
        const decision = await decideAuthorization(
          this.#policyPorts,
          input.requesterId,
          input.targetId,
          input.purpose,
          input.scope,
        );
        if (firstDecision === null) {
          firstDecision = decision;
        }
        return decision;
      },
      readActive: (requesterId, targetId) => this.relationships.readActive(requesterId, targetId),
      openApproval: (binding) => this.#openApproval(binding),
      release: async (requestId, relationshipActive) => {
        if (relationshipActive === false) {
          invalidated = true;
        }
        return await this.releaseByRequestId(requestId, relationshipActive);
      },
      queryAvailability: (input) => this.queryAvailability(input),
    });
    const audited = auditFor(response, firstDecision, invalidated);
    await this.#audit.append(operator, {
      kind: "audit-event",
      category: audited.category,
      requestId: firstDecision === null ? "unavailable" : (body as { requestId: string }).requestId,
      outcome: audited.outcome,
    });
    return response;
  }

  async queryAvailability(input: QueryInput): Promise<boolean | null> {
    const decision = await decideAuthorization(
      this.#policyPorts,
      input.requesterId,
      input.targetId,
    );
    if (decision === "ALLOW" || (decision === "ASK" && (await this.#askAuthorized(input)))) {
      return this.availability.readAuthorizedBoolean(input.requesterId, {
        start: input.start,
        end: input.end,
      });
    }
    return null;
  }

  async releaseByRequestId(requestId: string, relationshipActive: boolean): Promise<boolean> {
    const record = await this.approvals.findByRequestId(requestId);
    if (record === null) {
      return false;
    }
    return this.approvals.release(record.id, relationshipActive);
  }

  async #openApproval(binding: {
    requestId: string;
    requesterId: string;
    targetId: string;
    start: string;
    end: string;
  }): Promise<unknown> {
    const created = await this.approvals.createAsk({
      requestId: binding.requestId,
      fromAgentId: binding.requesterId,
      toAgentId: binding.targetId,
      skillVersion: APPROVAL_SKILL_VERSION_V1,
      purpose: APPROVAL_PURPOSE_V1,
      scope: APPROVAL_SCOPE_V1,
      start: binding.start,
      end: binding.end,
      policyVersion: APPROVAL_POLICY_VERSION_V1,
    });
    if (!created.ok) {
      return { status: "absent" };
    }
    return approvalView(created.value);
  }

  async #askAuthorized(input: QueryInput): Promise<boolean> {
    const approval = await this.approvals.findByRequestId(input.requestId);
    if (!sameApprovedInterval(approval, input)) {
      return false;
    }
    const now = this.#clock.nowMs();
    const expiresAt = parseUtcInstant(approval.expiresAt);
    return (
      typeof now === "number" && Number.isSafeInteger(now) && expiresAt !== null && now < expiresAt
    );
  }
}

const approvalView = (record: ApprovalRecord) => ({
  status: record.status,
  requestId: record.requestId,
  fromAgentId: record.fromAgentId,
  toAgentId: record.toAgentId,
  start: record.start,
  end: record.end,
});

const sameApprovedInterval = (
  approval: ApprovalRecord | null,
  input: QueryInput,
): approval is ApprovalRecord =>
  approval !== null &&
  approval.status === "approved" &&
  approval.fromAgentId === input.requesterId &&
  approval.toAgentId === input.targetId &&
  approval.start === input.start &&
  approval.end === input.end;

const auditFor = (
  response: AvailabilityResponse,
  firstDecision: PolicyDecision | null,
  invalidated: boolean,
): { category: AuditCategory; outcome: AuditOutcome } => {
  if ("result" in response) {
    return { category: "disclosure", outcome: "released" };
  }
  if (invalidated) {
    return { category: "revocation", outcome: "invalidated" };
  }
  if (firstDecision === "DENY") {
    return { category: "decision", outcome: "deny" };
  }
  if (firstDecision === "ASK") {
    return { category: "approval", outcome: "unavailable" };
  }
  return { category: "decision", outcome: "unavailable" };
};

type _PostgresApprovalMatchesStore = PostgresApprovalStore extends ApprovalStore ? true : never;

const _postgresApprovalMatchesStore: _PostgresApprovalMatchesStore = true;
void _postgresApprovalMatchesStore;

type _PostgresAuditMatchesPort = PostgresAuditLog extends AuditAppendPort ? true : never;

const _postgresAuditMatchesPort: _PostgresAuditMatchesPort = true;
void _postgresAuditMatchesPort;
