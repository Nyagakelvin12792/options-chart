import {
  getServerSession,
  type NextAuthOptions,
  type Profile,
} from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
const allowlistedEmail = process.env.AUTH_ALLOWLIST_EMAIL?.trim().toLowerCase();
const nextAuthSecret = process.env.NEXTAUTH_SECRET?.trim();
const temporaryPublicPreviewBranch = "handoff/antigravity-m11";

type PreviewEnvironment = {
  readonly VERCEL_ENV: string | undefined;
  readonly VERCEL_GIT_COMMIT_REF: string | undefined;
};

export const isTemporaryPublicPreview = (
  environment: PreviewEnvironment,
): boolean =>
  environment.VERCEL_ENV === "preview" &&
  environment.VERCEL_GIT_COMMIT_REF === temporaryPublicPreviewBranch;

const hasVerifiedEmail = (
  profile: Profile | undefined,
): profile is Profile & { readonly email_verified: true } =>
  Boolean(
    profile && "email_verified" in profile && profile.email_verified === true,
  );

export const isAllowlistedGoogleProfile = (
  profile: Profile | undefined,
  expectedEmail: string | undefined,
): boolean =>
  Boolean(
    hasVerifiedEmail(profile) &&
    expectedEmail &&
    profile.email?.trim().toLowerCase() === expectedEmail.trim().toLowerCase(),
  );

export const hasGoogleAuthConfiguration = Boolean(
  googleClientId && googleClientSecret && allowlistedEmail && nextAuthSecret,
);

export const authOptions: NextAuthOptions = {
  providers:
    googleClientId && googleClientSecret
      ? [
          GoogleProvider({
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          }),
        ]
      : [],
  session: { strategy: "jwt" },
  callbacks: {
    signIn({ profile }) {
      return isAllowlistedGoogleProfile(profile, allowlistedEmail);
    },
  },
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
  ...(nextAuthSecret ? { secret: nextAuthSecret } : {}),
};

export type DashboardAccess =
  | {
      readonly authorized: true;
      readonly label: string;
      readonly mode: "google" | "development";
    }
  | {
      readonly authorized: false;
      readonly reason: "configuration" | "session";
    };

export const getDashboardAccess = async (): Promise<DashboardAccess> => {
  if (
    isTemporaryPublicPreview({
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF,
    })
  ) {
    return {
      authorized: true,
      label: "Public branch preview",
      mode: "development",
    };
  }

  if (
    process.env.NODE_ENV === "development" &&
    process.env.AUTH_DEV_BYPASS !== "false"
  ) {
    return {
      authorized: true,
      label: "Local preview",
      mode: "development",
    };
  }

  if (!hasGoogleAuthConfiguration) {
    return { authorized: false, reason: "configuration" };
  }

  const session = await getServerSession(authOptions);
  const sessionEmail = session?.user?.email?.trim().toLowerCase();
  if (!sessionEmail || sessionEmail !== allowlistedEmail) {
    return { authorized: false, reason: "session" };
  }

  return { authorized: true, label: sessionEmail, mode: "google" };
};
