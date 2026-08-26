import Link from "next/link";

import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { hasGoogleAuthConfiguration } from "@/lib/auth";
import { getAuthErrorMessage } from "@/lib/auth-error";

type SignInPageProps = {
  readonly searchParams: Promise<{
    readonly error?: string | readonly string[];
  }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const errorMessage = getAuthErrorMessage((await searchParams).error);

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
        {errorMessage ? (
          <p className="access-error" role="alert">
            {errorMessage}
          </p>
        ) : null}
        {hasGoogleAuthConfiguration ? (
          <GoogleSignInButton />
        ) : (
          <Link className="secondary-command" href="/">
            Return to status
          </Link>
        )}
      </div>
    </main>
  );
}
