import Link from "next/link";

import { hasGoogleAuthConfiguration } from "@/lib/auth";

export default function SignInPage() {
  return (
    <main className="access-shell">
      <div className="access-panel">
        <span className="brand-mark" aria-hidden="true">
          OC
        </span>
        <p className="symbol-label">PRIVATE ANALYTICS</p>
        <h1>Options Chart</h1>
        <p>
          {hasGoogleAuthConfiguration
            ? "Use the single allowlisted Google account."
            : "Google access has not been configured for this deployment."}
        </p>
        {hasGoogleAuthConfiguration ? (
          <a
            className="primary-command"
            href="/api/auth/signin/google?callbackUrl=%2F"
          >
            Sign in with Google
          </a>
        ) : (
          <Link className="secondary-command" href="/">
            Return to status
          </Link>
        )}
      </div>
    </main>
  );
}