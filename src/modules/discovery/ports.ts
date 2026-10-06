import type {
  AgentIdentity,
  AgentIdentityId,
  AuthenticatedAgentPrincipal,
} from "../identity/index.js";
import type { DiscoverabilityGrant } from "./domain/discoverability-grant.js";
import type { CanonicalEmail } from "./domain/email-identifier.js";

declare const trustedDiscoverySourceBrand: unique symbol;

/** Established by a future trusted ingress; there is intentionally no public constructor/parser. */
export type TrustedDiscoverySource = Readonly<{
  kind: "trusted-discovery-source";
  key: string;
  readonly [trustedDiscoverySourceBrand]: true;
}>;

export interface DiscoveryDirectoryPort {
  resolveCaller(principal: AuthenticatedAgentPrincipal): Promise<AgentIdentity | null>;
  findTarget(targetId: AgentIdentityId): Promise<AgentIdentity | null>;
}

export interface DiscoverabilityPolicyPort {
  findGrants(callerId: AgentIdentityId, email: CanonicalEmail): Promise<readonly unknown[]>;
}

export type DiscoveryBudgetInput = Readonly<{
  callerId: AgentIdentityId;
  sourceKey: string;
  nowMs: number;
}>;

export interface DiscoveryBudgetPort {
  consume(input: DiscoveryBudgetInput): Promise<unknown>;
}

export type DiscoveryEvent = Readonly<{
  contract: "pan.discovery-event/v1";
  correlationId: string;
  callerId: AgentIdentityId | "unresolved";
  outcome: "resolved" | "not-resolved";
  control: "none" | "budget" | "dependency" | "validation";
}>;

export interface DiscoveryEventPort {
  acknowledge(event: DiscoveryEvent): Promise<unknown>;
}

export type DiscoveryDisclosureCommit = Readonly<{
  expectedGrant: DiscoverabilityGrant;
  expectedCallerId: AgentIdentityId;
  expectedTargetId: AgentIdentityId;
  expectedEmail: CanonicalEmail;
  expectedAgentReference: string;
  event: DiscoveryEvent & Readonly<{ outcome: "resolved"; control: "none" }>;
}>;

/**
 * The adapter MUST atomically verify that the exact grant snapshot is still current and active,
 * verify current target eligibility, and acknowledge/persist the supplied minimized event. Only
 * exact `true` means the event corresponds to authorization for the immediate disclosure.
 */
export interface DiscoveryDisclosureCommitPort {
  commit(input: DiscoveryDisclosureCommit): Promise<unknown>;
}

export type { DiscoverabilityGrant };
