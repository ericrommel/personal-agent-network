import { describe, expect, it } from "vitest";

import {
  type AgentIdentityId,
  type AuthenticatedAgentPrincipal,
  createAgentIdentity,
  generateAgentIdentityId,
  generateHumanIdentityId,
  type HumanIdentityId,
} from "../../../../src/modules/identity/index.js";

const compileTimeBoundaryChecks = (): void => {
  const humanId = generateHumanIdentityId();
  const agentId = generateAgentIdentityId();

  // @ts-expect-error Human and Agent identifiers are not interchangeable.
  const humanFromAgent: HumanIdentityId = agentId;
  // @ts-expect-error Human and Agent identifiers are not interchangeable.
  const agentFromHuman: AgentIdentityId = humanId;
  // @ts-expect-error Raw strings must cross a validating parser.
  const humanFromString: HumanIdentityId = "pan_human_00000000-0000-4000-8000-000000000000";
  const payloadClaim = {
    schema: "pan.authenticated-agent-principal/v1",
    kind: "authenticated-agent",
    agentId,
    authenticatedAt: new Date().toISOString(),
  } as const;
  // @ts-expect-error Payload-shaped data lacks nominal trusted-boundary evidence.
  const principal: AuthenticatedAgentPrincipal = payloadClaim;

  const identityResult = createAgentIdentity(agentId, humanId);
  if (identityResult.ok) {
    // @ts-expect-error Ownership is immutable.
    identityResult.value.ownerId = generateHumanIdentityId();
  }

  void [humanFromAgent, agentFromHuman, humanFromString, principal];
};

void compileTimeBoundaryChecks;

describe("AC-ID-001 compile-time identity boundaries", () => {
  it("keeps compile-time assertions in the typechecked test suite", () => {
    expect(compileTimeBoundaryChecks).toBeTypeOf("function");
  });
});
