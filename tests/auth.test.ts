import type { Profile } from "next-auth";
import { describe, expect, it } from "vitest";

import { isAllowlistedGoogleProfile } from "../apps/web/lib/auth";
import { getAuthErrorMessage } from "../apps/web/lib/auth-error";

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

describe("Google authentication errors", () => {
  it("explains access denial and provider startup failures", () => {
    expect(getAuthErrorMessage("AccessDenied")).toBe(
      "This Google account is not authorized for this dashboard.",
    );
    expect(getAuthErrorMessage("google")).toBe(
      "Google sign-in could not be started. Please try again.",
    );
  });

  it("returns no message when there is no error", () => {
    expect(getAuthErrorMessage(undefined)).toBeUndefined();
  });
});
