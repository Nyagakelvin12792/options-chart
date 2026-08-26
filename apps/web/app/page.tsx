import { DashboardClient } from "@/components/dashboard-client";
import { getDashboardAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const access = await getDashboardAccess();

  if (!access.authorized) {
    return (
      <main className="access-shell">
        <div className="access-panel">
          <span className="brand-mark" aria-hidden="true">
            OC
          </span>
          <p className="symbol-label">PRIVATE ANALYTICS</p>
          <h1>Options Chart</h1>
          <p>
            {access.reason === "configuration"
              ? "Google access has not been configured for this deployment."
              : "Sign in with the allowlisted Google account to continue."}
          </p>
          {access.reason === "session" ? (
            <a
              className="primary-command"
              href="/api/auth/signin/google?callbackUrl=%2F"
            >
              Sign in with Google
            </a>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <DashboardClient accessLabel={access.label} accessMode={access.mode} />
  );
}
