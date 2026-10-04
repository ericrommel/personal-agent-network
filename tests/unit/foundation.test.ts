import { describe, expect, it } from "vitest";

import { foundationStatus } from "../../src/foundation.js";

describe("foundation status smoke test", () => {
  it("identifies the skeleton as non-functional bootstrap work", () => {
    expect(foundationStatus).toEqual({
      phase: "bootstrap",
      product: "Personal Agent Network",
      productBehaviorImplemented: false,
    });
  });
});
