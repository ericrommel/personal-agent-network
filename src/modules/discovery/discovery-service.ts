import {
  type AuthenticatedAgentPrincipal,
  isAgentIdentityEligibleForPrincipal,
} from "../identity/index.js";
import {
  DISCOVERY_NEGATIVE_V1,
  DISCOVERY_REQUEST_CONTRACT_V1,
  DISCOVERY_RESULT_CONTRACT_V1,
  type DiscoveryRequestV1,
  type DiscoveryResultV1,
} from "./contracts.js";
import { isDiscoverabilityGrant } from "./domain/discoverability-grant.js";
import { canonicalizeDiscoveryEmail } from "./domain/email-identifier.js";
import type {
  DiscoverabilityPolicyPort,
  DiscoveryBudgetPort,
  DiscoveryDirectoryPort,
  DiscoveryDisclosureCommitPort,
  DiscoveryEvent,
  DiscoveryEventPort,
  TrustedDiscoverySource,
} from "./ports.js";

export type DiscoveryClock = Readonly<{ nowMs(): number }>;

export type DiscoveryServiceDependencies = Readonly<{
  directory: DiscoveryDirectoryPort;
  policy: DiscoverabilityPolicyPort;
  budget: DiscoveryBudgetPort;
  events: DiscoveryEventPort;
  disclosureCommit: DiscoveryDisclosureCommitPort;
  clock: DiscoveryClock;
}>;

export class DiscoveryService {
  readonly #dependencies: DiscoveryServiceDependencies;

  constructor(dependencies: DiscoveryServiceDependencies) {
    this.#dependencies = dependencies;
  }

  async discover(
    principal: AuthenticatedAgentPrincipal,
    source: TrustedDiscoverySource,
    request: unknown,
  ): Promise<DiscoveryResultV1> {
    let correlationId = "invalid";
    let callerId: DiscoveryEvent["callerId"] = "unresolved";
    try {
      const parsedRequest = parseRequest(request);
      if (parsedRequest !== null) {
        correlationId = parsedRequest.correlationId;
      }
      if (!isValidSource(source)) {
        await this.#acknowledge(correlationId, callerId, "not-resolved", "validation");
        return DISCOVERY_NEGATIVE_V1;
      }

      const caller = await this.#dependencies.directory.resolveCaller(principal);
      if (
        caller === null ||
        !isAgentIdentityEligibleForPrincipal(caller) ||
        caller.id !== principal.agentId
      ) {
        await this.#acknowledge(correlationId, callerId, "not-resolved", "dependency");
        return DISCOVERY_NEGATIVE_V1;
      }
      callerId = caller.id;

      const withinBudget = await this.#dependencies.budget.consume({
        callerId,
        sourceKey: source.key,
        nowMs: this.#dependencies.clock.nowMs(),
      });
      if (withinBudget !== true) {
        await this.#acknowledge(correlationId, callerId, "not-resolved", "budget");
        return DISCOVERY_NEGATIVE_V1;
      }

      if (parsedRequest === null) {
        await this.#acknowledge(correlationId, callerId, "not-resolved", "validation");
        return DISCOVERY_NEGATIVE_V1;
      }

      const email = canonicalizeDiscoveryEmail(parsedRequest.email);
      if (!email.ok) {
        await this.#acknowledge(correlationId, callerId, "not-resolved", "validation");
        return DISCOVERY_NEGATIVE_V1;
      }

      const candidates = await this.#dependencies.policy.findGrants(callerId, email.value);
      if (candidates.length !== 1 || !isDiscoverabilityGrant(candidates[0])) {
        await this.#acknowledge(correlationId, callerId, "not-resolved", "none");
        return DISCOVERY_NEGATIVE_V1;
      }
      const grant = candidates[0];
      if (grant.status !== "active" || grant.callerId !== callerId || grant.email !== email.value) {
        await this.#acknowledge(correlationId, callerId, "not-resolved", "none");
        return DISCOVERY_NEGATIVE_V1;
      }

      const target = await this.#dependencies.directory.findTarget(grant.targetId);
      if (
        target === null ||
        !isAgentIdentityEligibleForPrincipal(target) ||
        target.id !== grant.targetId
      ) {
        await this.#acknowledge(correlationId, callerId, "not-resolved", "none");
        return DISCOVERY_NEGATIVE_V1;
      }

      const committed = await this.#dependencies.disclosureCommit.commit(
        Object.freeze({
          expectedGrant: grant,
          expectedCallerId: callerId,
          expectedTargetId: grant.targetId,
          expectedEmail: email.value,
          expectedAgentReference: grant.agentReference,
          event: Object.freeze({
            contract: "pan.discovery-event/v1" as const,
            correlationId,
            callerId,
            outcome: "resolved" as const,
            control: "none" as const,
          }),
        }),
      );
      if (committed !== true) {
        await this.#acknowledge(correlationId, callerId, "not-resolved", "dependency");
        return DISCOVERY_NEGATIVE_V1;
      }

      // There is deliberately no await between the atomic commit and this return. This address is
      // not authority: downstream use must independently revalidate grant, target, authentication,
      // and authorization.
      return Object.freeze({
        contract: DISCOVERY_RESULT_CONTRACT_V1,
        agentReference: grant.agentReference,
      });
    } catch {
      await this.#acknowledge(correlationId, callerId, "not-resolved", "dependency");
      return DISCOVERY_NEGATIVE_V1;
    }
  }

  async #acknowledge(
    correlationId: string,
    callerId: DiscoveryEvent["callerId"],
    outcome: DiscoveryEvent["outcome"],
    control: DiscoveryEvent["control"],
  ): Promise<boolean> {
    try {
      const acknowledged = await this.#dependencies.events.acknowledge(
        Object.freeze({
          contract: "pan.discovery-event/v1",
          correlationId,
          callerId,
          outcome,
          control,
        }),
      );
      return acknowledged === true;
    } catch {
      return false;
    }
  }
}

const parseRequest = (input: unknown): DiscoveryRequestV1 | null => {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(input) as unknown;
    const record = input as Record<string, unknown>;
    const keys = Reflect.ownKeys(input);
    if (
      (prototype !== Object.prototype && prototype !== null) ||
      !Object.values(Object.getOwnPropertyDescriptors(input)).every((item) => "value" in item) ||
      keys.length !== 3 ||
      !["contract", "email", "correlationId"].every((key) => Object.hasOwn(input, key)) ||
      record.contract !== DISCOVERY_REQUEST_CONTRACT_V1 ||
      typeof record.email !== "string" ||
      typeof record.correlationId !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(record.correlationId)
    ) {
      return null;
    }
    return record as DiscoveryRequestV1;
  } catch {
    return null;
  }
};

const isValidSource = (source: TrustedDiscoverySource): boolean => {
  try {
    if (typeof source !== "object" || source === null) {
      return false;
    }
    const keys = Reflect.ownKeys(source);
    return (
      Object.getPrototypeOf(source) === Object.prototype &&
      Object.values(Object.getOwnPropertyDescriptors(source)).every((item) => "value" in item) &&
      keys.length === 2 &&
      Object.hasOwn(source, "kind") &&
      Object.hasOwn(source, "key") &&
      source.kind === "trusted-discovery-source" &&
      typeof source.key === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(source.key)
    );
  } catch {
    return false;
  }
};
