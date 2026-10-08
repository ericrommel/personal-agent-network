const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export type ReplayDecision = "accepted" | "duplicate";

/**
 * Remembers one envelope message id. A duplicate or unusable id fails closed.
 * This memory adapter is not restart-safe acceptance evidence.
 */
export type ReplayStore = Readonly<{
  remember(messageId: string): ReplayDecision | Promise<ReplayDecision>;
}>;

export class InMemoryReplayStore implements ReplayStore {
  readonly #ids = new Set<string>();

  remember(messageId: string): ReplayDecision {
    if (typeof messageId !== "string" || !TOKEN.test(messageId) || this.#ids.has(messageId)) {
      return "duplicate";
    }
    this.#ids.add(messageId);
    return "accepted";
  }
}
