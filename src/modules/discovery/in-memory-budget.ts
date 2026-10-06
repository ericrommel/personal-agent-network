import { type AgentIdentityId, parseAgentIdentityId } from "../identity/index.js";
import type { DiscoveryBudgetInput, DiscoveryBudgetPort } from "./ports.js";

export const DEFAULT_DISCOVERY_BUDGETS = Object.freeze({
  windowMs: 60_000,
  callerLimit: 30,
  sourceLimit: 60,
  globalLimit: 1_000,
});

export type DiscoveryBudgetConfiguration = Readonly<{
  windowMs: number;
  callerLimit: number;
  sourceLimit: number;
  globalLimit: number;
}>;

/**
 * Atomic only within one JavaScript process/event loop. All rolling-window counters reset when the
 * process restarts; instances do not coordinate. There are deliberately no target-keyed counters.
 */
export class InMemoryDiscoveryBudget implements DiscoveryBudgetPort {
  readonly #configuration: DiscoveryBudgetConfiguration;
  readonly #callerAttempts = new Map<AgentIdentityId, number[]>();
  readonly #sourceAttempts = new Map<string, number[]>();
  readonly #globalAttempts: number[] = [];

  constructor(configuration: DiscoveryBudgetConfiguration = DEFAULT_DISCOVERY_BUDGETS) {
    if (
      !Number.isSafeInteger(configuration.windowMs) ||
      !Number.isSafeInteger(configuration.callerLimit) ||
      !Number.isSafeInteger(configuration.sourceLimit) ||
      !Number.isSafeInteger(configuration.globalLimit) ||
      configuration.windowMs <= 0 ||
      configuration.callerLimit <= 0 ||
      configuration.sourceLimit <= 0 ||
      configuration.globalLimit <= 0
    ) {
      throw new TypeError("Invalid Discovery budget configuration");
    }
    this.#configuration = Object.freeze({ ...configuration });
  }

  async consume(input: DiscoveryBudgetInput): Promise<boolean> {
    if (
      !parseAgentIdentityId(input.callerId).ok ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.sourceKey) ||
      !Number.isSafeInteger(input.nowMs) ||
      input.nowMs < 0
    ) {
      return false;
    }
    const cutoff = input.nowMs - this.#configuration.windowMs;
    this.#sweep(this.#callerAttempts, cutoff);
    this.#sweep(this.#sourceAttempts, cutoff);
    const caller = this.#prune(this.#callerAttempts.get(input.callerId) ?? [], cutoff);
    const source = this.#prune(this.#sourceAttempts.get(input.sourceKey) ?? [], cutoff);
    this.#prune(this.#globalAttempts, cutoff);

    const callerHasRoom = caller.length < this.#configuration.callerLimit;
    const sourceHasRoom = source.length < this.#configuration.sourceLimit;
    const globalHasRoom = this.#globalAttempts.length < this.#configuration.globalLimit;

    if (globalHasRoom) {
      this.#globalAttempts.push(input.nowMs);
      if (callerHasRoom) {
        caller.push(input.nowMs);
        this.#callerAttempts.set(input.callerId, caller);
      }
      if (sourceHasRoom) {
        source.push(input.nowMs);
        this.#sourceAttempts.set(input.sourceKey, source);
      }
    }

    return callerHasRoom && sourceHasRoom && globalHasRoom;
  }

  #prune(attempts: number[], cutoff: number): number[] {
    let firstCurrent = 0;
    while (firstCurrent < attempts.length && (attempts[firstCurrent] as number) <= cutoff) {
      firstCurrent += 1;
    }
    if (firstCurrent > 0) {
      attempts.splice(0, firstCurrent);
    }
    return attempts;
  }

  #sweep<Key>(attemptsByKey: Map<Key, number[]>, cutoff: number): void {
    for (const [key, attempts] of attemptsByKey) {
      this.#prune(attempts, cutoff);
      if (attempts.length === 0) {
        attemptsByKey.delete(key);
      }
    }
  }
}
