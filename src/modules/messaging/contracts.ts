export const AVAILABILITY_REQUEST_CONTRACT_V1 = "pan.availability-request/v1" as const;
export const AVAILABILITY_ENVELOPE_CONTRACT_V1 = "pan.availability-envelope/v1" as const;
export const AVAILABILITY_PURPOSE_V1 = "availability_check" as const;
export const AVAILABILITY_SCOPE_V1 = "availability_boolean" as const;
export const AGENT_URI_SAN_PREFIX = "urn:pan:agent:" as const;
export const REPLAY_MAX_WINDOW_MS = 5 * 60 * 1000;
export const REPLAY_SKEW_MS = 30 * 1000;

export type AvailabilitySuccess = Readonly<{ result: boolean }>;
export type AvailabilityDenial = Readonly<{ outcome: "unavailable" }>;
export type AvailabilityResponse = AvailabilitySuccess | AvailabilityDenial;

export const unavailable = (): AvailabilityDenial => Object.freeze({ outcome: "unavailable" });
export const released = (result: boolean): AvailabilitySuccess => Object.freeze({ result });
