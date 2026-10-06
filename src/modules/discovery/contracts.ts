export const DISCOVERY_REQUEST_CONTRACT_V1 = "pan.discovery-request/v1" as const;
export const DISCOVERY_RESULT_CONTRACT_V1 = "pan.discovery-result/v1" as const;
export const DISCOVERY_NEGATIVE_CONTRACT_V1 = "pan.discovery-negative/v1" as const;

export type DiscoveryRequestV1 = Readonly<{
  contract: typeof DISCOVERY_REQUEST_CONTRACT_V1;
  email: string;
  correlationId: string;
}>;

export type DiscoverySuccessV1 = Readonly<{
  contract: typeof DISCOVERY_RESULT_CONTRACT_V1;
  agentReference: string;
}>;

export type DiscoveryNegativeV1 = Readonly<{
  contract: typeof DISCOVERY_NEGATIVE_CONTRACT_V1;
}>;

export type DiscoveryResultV1 = DiscoverySuccessV1 | DiscoveryNegativeV1;

export const DISCOVERY_NEGATIVE_V1: DiscoveryNegativeV1 = Object.freeze({
  contract: DISCOVERY_NEGATIVE_CONTRACT_V1,
});
