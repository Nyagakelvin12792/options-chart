import type { Profile } from "next-auth";
import { describe, expect, it } from "vitest";

import { isAllowlistedGoogleProfile } from "../apps/web/lib/auth";

const profile = (email: string, emailVerified: boolean): Profile => ({
  email,
  email_verified: emailVerified,
});

describe("Google authentication allowlist", () => {
  it("accepts only the verified allowlisted email", () => {
    expect(
      isAllowlistedGoogleProfile(
        profile("Owner@Example.com", true),
        "owner@example.com",
      ),
    ).toBe(true);
    expect(
      isAllowlistedGoogleProfile(
        profile("other@example.com", true),
        "owner@example.com",
      ),
    ).toBe(false);
  });

  it("rejects an unverified profile", () => {
    expect(
      isAllowlistedGoogleProfile(
        profile("owner@example.com", false),
        "owner@example.com",
      ),
    ).toBe(false);
  });
});
