"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export function GoogleSignInButton() {
  const [pending, setPending] = useState(false);

  const startSignIn = () => {
    setPending(true);
    void signIn("google", { callbackUrl: "/" }).catch(() => setPending(false));
  };

  return (
    <button
      className="primary-command"
      type="button"
      disabled={pending}
      onClick={startSignIn}
    >
      {pending ? "Opening Google..." : "Sign in with Google"}
    </button>
  );
}
