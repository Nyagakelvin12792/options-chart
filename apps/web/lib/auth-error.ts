const authErrorMessages: Readonly<Record<string, string>> = {
  AccessDenied: "This Google account is not authorized for this dashboard.",
  Configuration: "Google sign-in is temporarily unavailable.",
  OAuthCallback: "Google sign-in could not be completed. Please try again.",
  OAuthSignin: "Google sign-in could not be started. Please try again.",
  google: "Google sign-in could not be started. Please try again.",
};

export const getAuthErrorMessage = (
  error: string | readonly string[] | undefined,
): string | undefined => {
  const errorCode = Array.isArray(error) ? error[0] : error;

  if (!errorCode) {
    return undefined;
  }

  return (
    authErrorMessages[errorCode] ??
    "Google sign-in could not be completed. Please try again."
  );
};
