import { describe, expect, it } from "vitest";

import { GEX_ASSUMPTIONS } from "./assumptions";
import {
  CALCULATION_ENGINE_VERSION,
  GAMMA_PROFILE_VERSION,
  GEX_MODEL_VERSION,
  MAX_PAIN_VERSION,
} from "./version";

describe("calculation architecture lock", () => {
  it("pins auditable calculation versions", () => {
    expect(CALCULATION_ENGINE_VERSION).toBe("1.0.0");
    expect(GEX_MODEL_VERSION).toBe("gex-heuristic-v1");
    expect(GAMMA_PROFILE_VERSION).toBe("sticky-iv-v1");
    expect(MAX_PAIN_VERSION).toBe("max-pain-expiry-v1");
  });

  it("does not multiply normalized BTC open interest twice", () => {
    expect(GEX_ASSUMPTIONS.contractMultiplierBtc).toBe(1);
    expect(GEX_ASSUMPTIONS.normalizedOpenInterestUnit).toBe("BTC");
    expect(GEX_ASSUMPTIONS.formula).toContain("openInterestBtc");
  });
});
