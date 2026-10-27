import { type ClipboardEvent, type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "./AuthContext";
import { takeReturnPath } from "../../lib/return-path";
import { useDocumentTitle } from "../../lib/use-document-title";
import { getAuthCapabilities, startGoogleSignIn, updateProfile } from "./api";
import { qk } from "../../lib/query-keys";
import { ThemeToggle } from "../../components/ThemeToggle";
import { ApiError } from "../../lib/api-client";

import type { TranslationKeys } from "../../lib/i18n";
import { ClientPortalLanding } from "../review/ClientPortal";
import { useClientPortal } from "../review/use-client-portal";

// M-05/UX-AUD-019: matches the backend's actual OTP contract (13-Authentication.md
// §13.2 - 10-minute expiry) so the countdown never promises a code is valid for longer
// than the server will actually honor it.
const RESEND_COOLDOWN_SECONDS = 30;
const OTP_EXPIRY_SECONDS = 10 * 60;

// Mirrors core/security.py's PASSWORD_MIN_LENGTH - the server rejects anything shorter,
// this is only so the field can say so before a round trip.
const PASSWORD_MIN_LENGTH = 12;
const STRENGTH_LABELS = ["Too short", "Weak", "Fair", "Good", "Strong"];

/** The design's own four-point meter (design/index.html's score()): length, mixed case,
 * a digit, a symbol. Advisory only - it gates nothing, and the real policy lives in
 * auth/service.py's _validate_new_password. */
function passwordScore(value: string): number {
  if (!value) return 0;
  let score = 0;
  if (value.length >= PASSWORD_MIN_LENGTH) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^\w\s]/.test(value)) score += 1;
  return score;
}

export function LoginPage() {
  // A workspace's own review domain shows its client portal instead of sign-in.
  const portal = useClientPortal();
  if (portal.loading) return null;
  if (portal.branding) return <ClientPortalLanding branding={portal.branding} />;
  return <SignInPage />;
}

function SignInPage() {
  const { t } = useTranslation();
  const { status, requestOtp, verifyOtp, signup, verifySignup, loginWithPassword, setPassword: savePassword, user, updateUser } = useAuth();
  // Not the "Sign in to Backline" heading: the hook appends "— Backline" itself.
  useDocumentTitle("Sign in");
  const navigate = useNavigate();
  const capabilities = useQuery({
    queryKey: qk.authCapabilities(),
    queryFn: getAuthCapabilities,
    staleTime: 30_000,
    retry: 1,
  });
  const googleAvailable = !capabilities.isError && capabilities.data?.google_sign_in === true;
  const serviceUnreachable = capabilities.error instanceof ApiError
    && ["NETWORK_ERROR", "SERVICE_UNAVAILABLE"].includes(capabilities.error.code);
  // design/index.html's four panels: #lg-in, #lg-up, #lg-reset, #lg-sent. "help" is
  // the reset panel - it doesn't reset a password (there's no reset-link flow yet),
  // it emails the six-digit code, which is also the way in for the members who predate
  // passwords and have none on their account at all.
  // An invitation email links to /login?use=code&email=...: invited people have no
  // password yet, so they start on the email-code step with their address filled in.
  const [params] = useSearchParams();
  const invitedToCode = params.get("use") === "code";
  const [step, setStep] = useState<"signin" | "signup" | "help" | "code" | "newpw">(invitedToCode ? "help" : "signin");
  const [codeFirst, setCodeFirst] = useState(invitedToCode);
  const [email, setEmail] = useState(() => (params.get("email") ?? "").slice(0, 320));
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acknowledgedPrivacy, setAcknowledgedPrivacy] = useState(false);
  const [code, setCode] = useState("");
  const [codePurpose, setCodePurpose] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [expiresIn, setExpiresIn] = useState(OTP_EXPIRY_SECONDS);
  const authPending = useRef(false);
  const redirectStarted = useRef(false);
  const codeDeadlines = useRef({ resendAt: 0, expiresAt: 0 });
  // M-05/UX-AUD-019 follow-up (TDR-0037): Caps Lock is only worth flagging on a
  // password field, where the typed characters are hidden - one flag is enough
  // since the sign-in, sign-up and set-password panels never show at the same time.
  const [capsOn, setCapsOn] = useState(false);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const errorId = "login-form-error";
  const googleStatus = !googleAvailable && (
    <p id="google-signin-status" className="lg-sub" role="status">
      {capabilities.isPending ? "Checking Google sign-in…" : capabilities.isError ? <>
        {serviceUnreachable
          ? "Backline is unreachable right now. Password and email-code sign-in may also be unavailable."
          : "Could not check Google sign-in. You can try email below."} {" "}
        <button type="button" className="lg-forgot" disabled={capabilities.isFetching || isSubmitting} onClick={() => void capabilities.refetch()}>Check again</button>
      </> : "Google sign-in is unavailable. Use email below."}
    </p>
  );

  const finishSignIn = useCallback(() => {
    if (redirectStarted.current) return;
    redirectStarted.current = true;
    const destination = takeReturnPath();
    // Straight from sign-in, the picker may open the last-used workspace itself.
    navigate(destination, { replace: true, state: destination === "/" ? { autoEnter: true } : undefined });
  }, [navigate]);

  function beginAuth(): boolean {
    if (authPending.current || redirectStarted.current) return false;
    authPending.current = true;
    setIsSubmitting(true);
    setError(null);
    return true;
  }

  function endAuth(): void {
    authPending.current = false;
    setIsSubmitting(false);
  }

  function showCode(lifetime: number, requestStartedAt: number): void {
    const now = Date.now();
    codeDeadlines.current = {
      resendAt: now + RESEND_COOLDOWN_SECONDS * 1000,
      expiresAt: requestStartedAt + lifetime * 1000,
    };
    setCode("");
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    setExpiresIn(Math.max(0, Math.ceil((codeDeadlines.current.expiresAt - now) / 1000)));
    setStep("code");
  }

  function checkCapsLock(event: { getModifierState(key: string): boolean }) {
    setCapsOn(event.getModifierState("CapsLock"));
  }

  async function handleGoogleSignIn() {
    if (!googleAvailable || !beginAuth()) return;
    try {
      const result = await startGoogleSignIn();
      window.location.assign(result.authorization_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in couldn't start. Try again.");
      endAuth();
    }
  }

  // Resend cooldown + expiry countdown - both reset whenever a fresh code is sent
  // (initial request or resend), and stop entirely once we leave the code step.
  useEffect(() => {
    if (step !== "code") return;
    const updateCountdown = () => {
      const now = Date.now();
      setResendCooldown(Math.max(0, Math.ceil((codeDeadlines.current.resendAt - now) / 1000)));
      setExpiresIn(Math.max(0, Math.ceil((codeDeadlines.current.expiresAt - now) / 1000)));
    };
    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);
    window.addEventListener("focus", updateCountdown);
    document.addEventListener("visibilitychange", updateCountdown);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", updateCountdown);
      document.removeEventListener("visibilitychange", updateCountdown);
    };
  }, [step]);

  useEffect(() => {
    if (step === "code") {
      codeInputRef.current?.focus();
    }
    setCapsOn(false);
  }, [step]);

  // A session restored from the refresh cookie (a bookmarked /login, the back button
  // after signing in) goes straight to the app instead of asking to sign in again.
  // Not mid-submit or on "Set a password": a verified code is already signed in there.
  useEffect(() => {
    if (status === "authenticated" && !isSubmitting && step !== "newpw") {
      finishSignIn();
    }
  }, [status, isSubmitting, step, finishSignIn]);

  async function sendOtp() {
    if (!beginAuth()) return;
    const requestStartedAt = Date.now();
    try {
      let lifetime = OTP_EXPIRY_SECONDS;
      if (codePurpose === "signup") {
        lifetime = (await signup(name, email, password)).expires_in_seconds;
      } else {
        await requestOtp(email);
      }
      showCode(lifetime, requestStartedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      endAuth();
    }
  }

  async function handleRequestOtp(event: FormEvent) {
    event.preventDefault();
    await sendOtp();
  }

  async function handleResendOtp() {
    if (Date.now() < codeDeadlines.current.resendAt) return;
    await sendOtp();
  }

  async function handlePasswordLogin(event: FormEvent) {
    event.preventDefault();
    if (!beginAuth()) return;
    try {
      await loginWithPassword(email, password);
      finishSignIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect email or password.");
    } finally {
      endAuth();
    }
  }

  async function handleSignup(event: FormEvent) {
    event.preventDefault();
    if (authPending.current) return;
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (!acknowledgedPrivacy) {
      setError("Review the privacy notice to create an account.");
      return;
    }
    if (!beginAuth()) return;
    const requestStartedAt = Date.now();
    try {
      const challenge = await signup(name, email, password);
      setCodePurpose("signup");
      setEmail(challenge.email);
      showCode(challenge.expires_in_seconds, requestStartedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create that account.");
    } finally {
      endAuth();
    }
  }

  async function handleVerifyOtp(event: FormEvent) {
    event.preventDefault();
    if (authPending.current) return;
    if (Date.now() >= codeDeadlines.current.expiresAt) {
      setExpiresIn(0);
      setError("This code has expired. Resend a code to continue.");
      return;
    }
    if (!beginAuth()) return;
    try {
      if (codePurpose === "signup") {
        await verifySignup(name, email, password, code);
        setPassword("");
        finishSignIn();
        return;
      }
      await verifyOtp(email, code);
      // The code just proved control of this inbox - offer to set/replace the
      // password right here (UX-AUD-057/TDR-0037) instead of only signing in,
      // since this is the only way in for a member with no password on the account.
      setNewPassword("");
      setStep("newpw");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect code.");
    } finally {
      endAuth();
    }
  }

  // An invited teammate's account is named after their email ("dev.sam") until they
  // say otherwise (TDR-0209); the first sign-in asks once.
  const needsName = Boolean(user && (!user.name.trim() || user.name.trim().toLowerCase() === user.email.split("@")[0].toLowerCase()));
  const [profileName, setProfileName] = useState("");

  async function saveProfileName(): Promise<string | null> {
    const next = profileName.trim();
    if (!needsName || !next || !user) return null;
    const updated = await updateProfile({ name: next });
    updateUser({ ...user, name: updated.name });
    return updated.name;
  }

  async function handleSetPassword(event: FormEvent) {
    event.preventDefault();
    if (authPending.current) return;
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setError(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (!beginAuth()) return;
    try {
      const savedName = await saveProfileName();
      await savePassword(newPassword);
      // The account modal's has_password gate (TDR-0034) would otherwise still show
      // stale "no password to change" copy until the next token refresh.
      // `user` is this render's copy, so keep the name just saved with it.
      if (user) updateUser({ ...user, name: savedName ?? user.name, has_password: true });
      finishSignIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that password.");
    } finally {
      endAuth();
    }
  }

  async function skipSetPassword() {
    if (authPending.current) return;
    if (needsName && profileName.trim()) {
      if (!beginAuth()) return;
      try {
        await saveProfileName();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save your name.");
        return;
      } finally {
        endAuth();
      }
    }
    finishSignIn();
  }

  function goToHelp(useCode = false) {
    if (authPending.current) return;
    setError(null);
    setCodePurpose("signin");
    setPassword("");
    setCodeFirst(useCode);
    setStep("help");
  }

  function goToSignIn() {
    if (authPending.current) return;
    setError(null);
    setCodePurpose("signin");
    setPassword("");
    setCode("");
    setStep("signin");
  }

  function goToSignup() {
    if (authPending.current) return;
    setError(null);
    setCodePurpose("signup");
    setStep("signup");
  }

  function handleCodePaste(event: ClipboardEvent<HTMLInputElement>) {
    if (authPending.current) return;
    const digits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (digits.length > 0) {
      event.preventDefault();
      setCode(digits);
    }
  }

  function formatCountdown(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  return (
    <div className="lg" id="lgGate" aria-busy={isSubmitting}>
      <section className="lg-side">
        <div className="lg-theme"><ThemeToggle /></div>
        {/* Brand centred at top of the left column */}
        <div className="lg-brand">
          <span className="lg-mark">B</span>
          <span><b>Backline</b><em>CLIENT REVIEW, IN ONE PLACE</em></span>
        </div>

        <div className="lg-form">
          {/* One panel at a time, the way design/index.html switches #lg-in / #lg-up /
              #lg-reset / #lg-sent - each owns its own heading, so the brand, footer and
              the pitch on the right are all that stay put between them. */}
          {step === "signin" && (
            <div id="lg-in">
              <h1>{t('auth.login.title' as TranslationKeys)}</h1>
              {params.get("deleted") === "1" && <p className="lg-lede" role="status">Your account was deleted. You can create a new one with the same email any time.</p>}

                <button type="button" onClick={() => void handleGoogleSignIn()} disabled={isSubmitting || !googleAvailable} aria-describedby={!googleAvailable ? "google-signin-status" : undefined} aria-busy={isSubmitting || capabilities.isPending} className="lg-google" data-lg-google="1">
                  <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.7-2 5.1-4.4 6.7v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.4z"/><path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.2 15.5 46 24 46z"/><path fill="#FBBC05" d="M11.8 28.3c-.4-1.3-.7-2.7-.7-4.3s.3-2.9.7-4.3v-5.7H4.5C2.9 17.2 2 20.5 2 24s.9 6.8 2.5 10l7.3-5.7z"/><path fill="#EA4335" d="M24 10.7c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.1 29.9 2 24 2 15.5 2 8.1 6.8 4.5 13.9l7.3 5.7c1.7-5.2 6.5-8.9 12.2-8.9z"/></svg>
                {t('auth.login.google' as TranslationKeys)}
              </button>
              {googleStatus}
              <div className="lg-or">{googleAvailable ? "OR USE YOUR EMAIL" : "USE YOUR EMAIL"}</div>

              <form className="lg-formel" onSubmit={handlePasswordLogin}>
                <div className="lg-f" id="lgf-inMail">
                  <div className="lg-lbl"><label htmlFor="lgInMail">{t('auth.login.email' as TranslationKeys)}</label></div>
                  <span className="lg-inp">
                    <input
                      id="lgInMail"
                      type="email"
                      required
                      autoComplete="username"
                      aria-describedby={error ? errorId : undefined}
                      aria-invalid={error ? true : undefined}
                      readOnly={isSubmitting}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@studio.com"
                      spellCheck="false"
                    />
                  </span>
                </div>

                <div className="lg-f" id="lgf-inPw">
                  <div className="lg-lbl">
                    <label htmlFor="lgInPw">Password</label>
                    <button type="button" className="lg-forgot" onClick={() => goToHelp()} disabled={isSubmitting}>Forgot password?</button>
                  </div>
                  <span className={`lg-inp pw${capsOn ? " capson" : ""}`}>
                    <input
                      id="lgInPw"
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      aria-describedby={error ? errorId : undefined}
                      aria-invalid={error ? true : undefined}
                      readOnly={isSubmitting}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      onKeyDown={checkCapsLock}
                      onKeyUp={checkCapsLock}
                      placeholder="Your password"
                    />
                    {capsOn && (
                      <span className="lg-caps" aria-hidden="true">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 3l7 7h-4v8h-6v-8H5z"/></svg>
                        CAPS LOCK
                      </span>
                    )}
                    <button
                      type="button"
                      className="lg-peek"
                      aria-pressed={showPassword}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword((shown) => !shown)}
                    >
                      {showPassword ? "HIDE" : "SHOW"}
                    </button>
                  </span>
                </div>
                {error && (
                  <p id={errorId} role="alert" className="lg-err">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
                    <span>{error}</span>
                  </p>
                )}
                <button type="submit" className="lg-go" disabled={isSubmitting}>
                  {isSubmitting ? <span className="lg-spin"></span> : null}
                  Sign in
                </button>
                {/* Teammates who joined from an invite or with Google often have no
                    password; the code sign-in shouldn't hide behind "Forgot password?". */}
                <p className="lg-new">
                  No password yet?{" "}
                  <button type="button" onClick={() => goToHelp(true)} disabled={isSubmitting}>Email me a sign-in code</button>
                </p>
              </form>
              <div className="lg-swap">
                New here? <button type="button" onClick={goToSignup} disabled={isSubmitting}>Create an account</button>
              </div>
            </div>
          )}

          {step === "signup" && (
            <div id="lg-up">
              <h1>Create your account</h1>

                <button type="button" onClick={() => void handleGoogleSignIn()} disabled={isSubmitting || !googleAvailable} aria-describedby={!googleAvailable ? "google-signin-status" : undefined} aria-busy={isSubmitting || capabilities.isPending} className="lg-google" data-lg-google="1">
                  <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.7-2 5.1-4.4 6.7v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.4z"/><path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.2 15.5 46 24 46z"/><path fill="#FBBC05" d="M11.8 28.3c-.4-1.3-.7-2.7-.7-4.3s.3-2.9.7-4.3v-5.7H4.5C2.9 17.2 2 20.5 2 24s.9 6.8 2.5 10l7.3-5.7z"/><path fill="#EA4335" d="M24 10.7c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.1 29.9 2 24 2 15.5 2 8.1 6.8 4.5 13.9l7.3 5.7c1.7-5.2 6.5-8.9 12.2-8.9z"/></svg>
                Continue with Google
              </button>
              {googleStatus}
              <div className="lg-or">{googleAvailable ? "OR USE YOUR EMAIL" : "USE YOUR EMAIL"}</div>

              <form className="lg-formel" onSubmit={handleSignup}>
                <div className="lg-f" id="lgf-upName">
                  <div className="lg-lbl"><label htmlFor="lgUpName">Your name</label></div>
                  <span className="lg-inp">
                    <input
                      id="lgUpName"
                      type="text"
                      required
                      maxLength={120}
                      autoComplete="name"
                      readOnly={isSubmitting}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Your full name"
                    />
                  </span>
                </div>

                <div className="lg-f" id="lgf-upMail">
                  <div className="lg-lbl"><label htmlFor="lgUpMail">{t('auth.login.email' as TranslationKeys)}</label></div>
                  <span className="lg-inp">
                    <input
                      id="lgUpMail"
                      type="email"
                      required
                      autoComplete="email"
                      aria-describedby={error ? errorId : undefined}
                      aria-invalid={error ? true : undefined}
                      readOnly={isSubmitting}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@studio.com"
                      spellCheck="false"
                    />
                  </span>
                </div>

                <div className="lg-f" id="lgf-upPw">
                  <div className="lg-lbl"><label htmlFor="lgUpPw">Password</label></div>
                  <span className={`lg-inp pw${capsOn ? " capson" : ""}`}>
                    <input
                      id="lgUpPw"
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete="new-password"
                      aria-describedby="lgBar"
                      readOnly={isSubmitting}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      onKeyDown={checkCapsLock}
                      onKeyUp={checkCapsLock}
                      placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
                    />
                    {capsOn && (
                      <span className="lg-caps" aria-hidden="true">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 3l7 7h-4v8h-6v-8H5z"/></svg>
                        CAPS LOCK
                      </span>
                    )}
                    <button
                      type="button"
                      className="lg-peek"
                      aria-pressed={showPassword}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword((shown) => !shown)}
                    >
                      {showPassword ? "HIDE" : "SHOW"}
                    </button>
                  </span>
                  <div className={`lg-bar s${passwordScore(password)}`} id="lgBar" role="status" aria-live="polite">
                    <i /><i /><i /><i />
                    <span>{password ? STRENGTH_LABELS[passwordScore(password)] : "Strength"}</span>
                  </div>
                </div>

                <label className="lg-check">
                  <input
                    type="checkbox"
                    id="lgPrivacy"
                    disabled={isSubmitting}
                    checked={acknowledgedPrivacy}
                    onChange={(event) => setAcknowledgedPrivacy(event.target.checked)}
                  />
                  <span>I have read the <a href="/privacy" target="_blank" rel="noopener noreferrer">privacy notice</a>.</span>
                </label>
                {error && (
                  <p id={errorId} role="alert" className="lg-err">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
                    <span>{error}</span>
                  </p>
                )}
                <button type="submit" className="lg-go" disabled={isSubmitting}>
                  {isSubmitting ? <span className="lg-spin"></span> : null}
                  Send verification code
                </button>
              </form>
              <div className="lg-swap">
                Already have an account? <button type="button" onClick={goToSignIn} disabled={isSubmitting}>Sign in</button>
              </div>
            </div>
          )}

          {step === "help" && (
            <div id="lg-reset">
              <button type="button" className="lg-back" onClick={goToSignIn} disabled={isSubmitting}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>
                Back to sign in
              </button>
              <h1>{codeFirst ? "Sign in with an email code" : "Trouble signing in?"}</h1>
              <p className="lg-lede">
                Tell us the email on the account and we send a six-digit code that signs
                you in. It works whether or not you ever set a password.
              </p>

              <form className="lg-formel" onSubmit={handleRequestOtp}>
                <div className="lg-f" id="lgf-rsMail">
                  <div className="lg-lbl"><label htmlFor="lgRsMail">{t('auth.login.email' as TranslationKeys)}</label></div>
                  <span className="lg-inp">
                    <input
                      id="lgRsMail"
                      type="email"
                      required
                      autoComplete="email"
                      aria-describedby={error ? errorId : undefined}
                      aria-invalid={error ? true : undefined}
                      readOnly={isSubmitting}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@studio.com"
                      spellCheck="false"
                    />
                  </span>
                </div>
                {error && (
                  <p id={errorId} role="alert" className="lg-err">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
                    <span>{error}</span>
                  </p>
                )}
                <button type="submit" className="lg-go" disabled={isSubmitting}>
                  {isSubmitting ? <span className="lg-spin"></span> : null}
                  Send the sign-in code
                </button>
              </form>
              <div className="lg-swap">
                Remembered it? <button type="button" onClick={goToSignIn} disabled={isSubmitting}>Sign in instead</button>
              </div>
            </div>
          )}

          {step === "code" && (
            <div id="lg-sent">
              <div className="lg-sent" aria-hidden="true">
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7l9 6 9-6"/><rect x="3" y="5" width="18" height="14" rx="2"/></svg>
              </div>
              <h1>Check your email</h1>
              <p className="lg-mailbox">{email}</p>

              <form className="lg-formel" onSubmit={handleVerifyOtp}>
                <div className="lg-f" id="lgf-inCode">
                  <div className="lg-lbl"><label htmlFor="lgInCode">Code</label></div>
                  <span className="lg-inp">
                    <input
                      id="lgInCode"
                      ref={codeInputRef}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      autoComplete="one-time-code"
                      required
                      aria-describedby={error ? errorId : undefined}
                      aria-invalid={error ? true : undefined}
                      readOnly={isSubmitting}
                      value={code}
                      onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      onPaste={handleCodePaste}
                      placeholder="000000"
                      style={{ letterSpacing: '0.18em' }}
                    />
                  </span>
                  <p className="lg-err" style={{ color: 'var(--ink-4)', marginTop: '4px' }} role="status" aria-live="polite">
                    {expiresIn > 0
                      ? `Code expires in ${formatCountdown(expiresIn)}`
                      : "This code has expired - request a new one."}
                  </p>
                </div>
                {error && (
                  <p id={errorId} role="alert" className="lg-err">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
                    <span>{error}</span>
                  </p>
                )}
                <button type="submit" className="lg-go" disabled={isSubmitting || expiresIn <= 0}>
                  {isSubmitting ? <span className="lg-spin"></span> : null}
                  {codePurpose === "signup" ? "Verify and create account" : "Verify and sign in"}
                </button>
              </form>
              <div className="lg-swap">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0 || isSubmitting}
                  style={{ opacity: (resendCooldown > 0 || isSubmitting) ? 0.5 : 1, cursor: (resendCooldown > 0 || isSubmitting) ? 'not-allowed' : 'pointer' }}
                >
                  {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Resend code"}
                </button>
                <span style={{ margin: '0 8px' }}>|</span>
                <button type="button" onClick={goToSignIn} disabled={isSubmitting}>Use a different email</button>
              </div>
            </div>
          )}

          {step === "newpw" && (
            <div id="lg-newpw">
              <h1>{needsName ? "Welcome to Backline" : "Set a password"}</h1>
              <p className="lg-lede">
                {needsName
                  ? "You're signed in. Tell your team your name, and add a password if you'd like to sign in with one next time."
                  : "You're signed in. Add a password so you can sign in with it next time, or skip this and keep using a sign-in code."}
              </p>

              <form className="lg-formel" onSubmit={handleSetPassword}>
                {needsName && (
                  <div className="lg-f" id="lgf-profileName">
                    <div className="lg-lbl"><label htmlFor="lgProfileName">Your name</label></div>
                    <span className="lg-inp">
                      <input id="lgProfileName" type="text" autoComplete="name" maxLength={120} readOnly={isSubmitting}
                        value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="Your full name" />
                    </span>
                  </div>
                )}
                <div className="lg-f" id="lgf-newPw">
                  <div className="lg-lbl"><label htmlFor="lgNewPw">New password</label></div>
                  <span className={`lg-inp pw${capsOn ? " capson" : ""}`}>
                    <input
                      id="lgNewPw"
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete="new-password"
                      aria-describedby="lgNewPwBar"
                      readOnly={isSubmitting}
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      onKeyDown={checkCapsLock}
                      onKeyUp={checkCapsLock}
                      placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
                    />
                    {capsOn && (
                      <span className="lg-caps" aria-hidden="true">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 3l7 7h-4v8h-6v-8H5z"/></svg>
                        CAPS LOCK
                      </span>
                    )}
                    <button
                      type="button"
                      className="lg-peek"
                      aria-pressed={showPassword}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword((shown) => !shown)}
                    >
                      {showPassword ? "HIDE" : "SHOW"}
                    </button>
                  </span>
                  <div className={`lg-bar s${passwordScore(newPassword)}`} id="lgNewPwBar" role="status" aria-live="polite">
                    <i /><i /><i /><i />
                    <span>{newPassword ? STRENGTH_LABELS[passwordScore(newPassword)] : "Strength"}</span>
                  </div>
                </div>
                {error && (
                  <p id={errorId} role="alert" className="lg-err">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
                    <span>{error}</span>
                  </p>
                )}
                <button type="submit" className="lg-go" disabled={isSubmitting}>
                  {isSubmitting ? <span className="lg-spin"></span> : null}
                  {needsName ? "Save and continue" : "Save password"}
                </button>
              </form>
              <div className="lg-swap">
                <button type="button" onClick={skipSetPassword} disabled={isSubmitting}>{needsName ? "Continue without a password" : "Skip for now"}</button>
              </div>
            </div>
          )}
        </div>

        <div className="lg-foot">
          <span className="c">&copy; {new Date().getFullYear()} Backline</span>
          <a href="/privacy">Privacy</a>
          <a href="/support">Support</a>
        </div>
      </section>

      <section className="lg-stage" aria-hidden="true">
        <div className="lg-pitch">
          <h2>Your client points at the thing. You get a ticket.</h2>
          <p>Comments land on the page itself, pinned to the element they are about, with the
            browser and screen size already captured.</p>

          <div className="lg-demo">
            <div className="lg-demo-bar"><i /><i /><i /><span>staging.yourclient.com/pricing</span></div>
            <div className="lg-page">
              <div className="lg-sel" />
              <span className="lg-ln h" />
              <span className="lg-ln h2" />
              <span className="lg-ln" style={{ width: '88%', marginTop: '16px' }} />
              <span className="lg-ln" style={{ width: '74%' }} />
              <span className="lg-ln" style={{ width: '52%' }} />
              <span className="lg-cta" />
              <span className="lg-pin" style={{ background: 'var(--mint)', top: '26px', left: '60%' }}>1</span>
              <span className="lg-pin" style={{ background: 'var(--amber)', top: '118px', left: '14%' }}>2</span>
              <span className="lg-pin" style={{ background: 'var(--badge-blue)', color: 'var(--bl-invert-fg)', top: '162px', left: '76%' }}>3</span>
              <div className="lg-note">
                <div className="lg-note-top"><span className="lg-note-av">RK</span><b>Ravi Kulkarni</b><em>18m</em></div>
                <p>The toggle still says annual after I switch to monthly.</p>
                <div><span className="lg-chip on"><span className="d" />In progress</span><span className="lg-chip">Bug</span></div>
              </div>
            </div>
          </div>

          <div className="lg-facts">
            <div className="lg-fact"><b>No account</b><span>FOR REVIEWERS</span></div>
            <div className="lg-fact"><b>No extension</b><span>TO INSTALL</span></div>
            <div className="lg-fact"><b>Every device</b><span>CAPTURED</span></div>
          </div>
        </div>
      </section>
    </div>
  );
}
