import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { LoadingScreen } from "../../components/LoadingScreen";
import { takeReturnPath } from "../../lib/return-path";
import { useDocumentTitle } from "../../lib/use-document-title";
import { useAuth } from "./AuthContext";

export function AuthCallbackPage() {
  useDocumentTitle("Signing in");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithGoogleCode } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const code = searchParams.get("code");
    if (!code) {
      setError("Missing authorization code.");
      return;
    }

    loginWithGoogleCode(code)
      .then(() => navigate(takeReturnPath(), { replace: true }))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Google sign-in failed.");
      });
  }, [searchParams, loginWithGoogleCode, navigate]);

  if (error) {
    return (
      <main className="bl-review-gate">
        <span className="bl-loading-mark" aria-hidden="true">B</span>
        <div className="bl-review-gate-copy">
          <span className="bl-review-eyebrow">Sign in</span>
          <h1>Couldn't sign you in</h1>
          <p>{error}</p>
          <div className="bl-review-gate-actions">
            <Link className="bl-quiet" to="/login">Back to sign in</Link>
          </div>
        </div>
      </main>
    );
  }
  return <LoadingScreen label="Signing you in" />;
}
