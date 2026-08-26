import { describe, expect, it } from "vitest";

import {
  DERIBIT_OI_STALE_AFTER_MS,
  DERIBIT_POLL_RECOVERY_DELAY_MS,
} from "./constants";
import { DeribitPollHealth } from "./health";

describe("DeribitPollHealth", () => {
  it("accepts one valid startup snapshot", () => {
    const health = new DeribitPollHealth();
    expect(health.recordSuccess(1_000)).toEqual({
      state: "LIVE",
      needsFollowUp: false,
    });
  });

  it("requires two validated polls separated by five seconds during recovery", () => {
    const health = new DeribitPollHealth();
    health.recordSuccess(1_000);
    expect(health.recordFailure(true)).toBe("FALLBACK");
    expect(health.recordSuccess(2_000)).toEqual({
      state: "DEGRADED",
      needsFollowUp: true,
    });
    expect(
      health.recordSuccess(2_000 + DERIBIT_POLL_RECOVERY_DELAY_MS - 1).state,
    ).toBe("DEGRADED");
    expect(
      health.recordSuccess(2_000 + DERIBIT_POLL_RECOVERY_DELAY_MS).state,
    ).toBe("LIVE");
  });

  it("does not declare timer-throttled data stale while the page is hidden", () => {
    const health = new DeribitPollHealth();
    health.recordSuccess(1_000);
    health.setHidden(true);
    expect(health.evaluate(1_000 + DERIBIT_OI_STALE_AFTER_MS)).toBe("LIVE");
    health.setHidden(false);
    expect(health.evaluate(1_000 + DERIBIT_OI_STALE_AFTER_MS)).toBe("STALE");
  });
});
