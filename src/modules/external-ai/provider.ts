import type { AvailabilityToolOffer } from "./contracts.js";

export type UntrustedToolCall = Readonly<{
  id: string;
  name: string;
  arguments: unknown;
}>;

export type UntrustedTurn = Readonly<{
  text: string;
  calls: readonly UntrustedToolCall[];
}>;

export type ProviderResume = Readonly<{
  responseId: string;
  callId: string;
  output: string;
}>;

export type ProviderCompletion = Readonly<{
  responseId: string;
  turn: UntrustedTurn;
}>;

/**
 * One replaceable model adapter.
 * Model output is untrusted. The provider identity is not a PAN identity.
 */
export type ExternalAiProvider = Readonly<{
  complete(
    input:
      | Readonly<{ userText: string; tool: AvailabilityToolOffer; prior: null }>
      | Readonly<{ tool: null; prior: ProviderResume }>,
  ): Promise<ProviderCompletion | null>;
}>;
