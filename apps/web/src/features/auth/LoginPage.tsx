import { type ClipboardEvent, type FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useAuth } from "./AuthContext";
import { useDocumentTitle } from "../../lib/use-document-title";
import { buildGoogleAuthUrl } from "./google-oauth-url";
import { ThemeToggle } from "../../components/ThemeToggle";

import type { TranslationKeys } from "../../lib/i18n";

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
  const { t } = useTranslation();
  const { requestOtp, verifyOtp, signup, loginWithPassword } = useAuth();
  useDocumentTitle(t('auth.login.title' as TranslationKeys));
  const navigate = useNavigate();
  // design/index.html's four panels: #lg-in, #lg-up, #lg-reset, #lg-sent. "help" is
  // the reset panel - it doesn't reset a password (there's no reset-link flow yet),
  // it emails the six-digit code, which is also the way in for the members who predate
  // passwords and have none on their account at all.
  const [step, setStep] = useState<"signin" | "signup" | "help" | "code">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [expiresIn, setExpiresIn] = useState(OTP_EXPIRY_SECONDS);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const errorId = "login-form-error";

  // Resend cooldown + expiry countdown - both reset whenever a fresh code is sent
  // (initial request or resend), and stop entirely once we leave the code step.
  useEffect(() => {
    if (step !== "code") return;
    const interval = window.setInterval(() => {
      setResendCooldown((v) => (v > 0 ? v - 1 : 0));
      setExpiresIn((v) => (v > 0 ? v - 1 : 0));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [step]);

  useEffect(() => {
    if (step === "code") {
      codeInputRef.current?.focus();
    }
  }, [step]);

  async function sendOtp() {
    setError(null);
    setIsSubmitting(true);
    try {
      await requestOtp(email);
      setStep("code");
      setCode("");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setExpiresIn(OTP_EXPIRY_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRequestOtp(event: FormEvent) {
    event.preventDefault();
    await sendOtp();
  }

  async function handleResendOtp() {
    if (resendCooldown > 0 || isSubmitting) return;
    await sendOtp();
  }

  async function handlePasswordLogin(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await loginWithPassword(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect email or password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignup(event: FormEvent) {
    event.preventDefault();
    if (!acceptedTerms) {
      setError("Agree to the terms and privacy policy to create an account.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await signup(name, email, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create that account.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyOtp(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await verifyOtp(email, code);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect code.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function goToHelp() {
    setError(null);
    setStep("help");
  }

  function goToSignIn() {
    setError(null);
    setStep("signin");
  }

  function goToSignup() {
    setError(null);
    setStep("signup");
  }

  function handleCodePaste(event: ClipboardEvent<HTMLInputElement>) {
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
    <div className="lg" id="lgGate">
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

                <a href={buildGoogleAuthUrl()} className="lg-google" data-lg-google="1">
                  <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.7-2 5.1-4.4 6.7v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.4z"/><path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.2 15.5 46 24 46z"/><path fill="#FBBC05" d="M11.8 28.3c-.4-1.3-.7-2.7-.7-4.3s.3-2.9.7-4.3v-5.7H4.5C2.9 17.2 2 20.5 2 24s.9 6.8 2.5 10l7.3-5.7z"/><path fill="#EA4335" d="M24 10.7c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.1 29.9 2 24 2 15.5 2 8.1 6.8 4.5 13.9l7.3 5.7c1.7-5.2 6.5-8.9 12.2-8.9z"/></svg>
                {t('auth.login.google' as TranslationKeys)}
              </a>
              <div className="lg-or">OR USE YOUR EMAIL</div>

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
                    <button type="button" className="lg-forgot" onClick={goToHelp}>Forgot password?</button>
                  </div>
                  <span className="lg-inp pw">
                    <input
                      id="lgInPw"
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      aria-describedby={error ? errorId : undefined}
                      aria-invalid={error ? true : undefined}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Your password"
                    />
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
                <p className="lg-new">
                  Joined with Google or a code? <em>You may not have a password</em> — use
                  “Forgot password?” above and we'll email you a sign-in code.
                </p>
              </form>
              <div className="lg-swap">
                New here? <button type="button" onClick={goToSignup}>Create an account</button>
              </div>
            </div>
          )}

          {step === "signup" && (
            <div id="lg-up">
              <h1>Create your account</h1>

                <a href={buildGoogleAuthUrl()} className="lg-google" data-lg-google="1">
                  <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.7-2 5.1-4.4 6.7v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.4z"/><path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.2 15.5 46 24 46z"/><path fill="#FBBC05" d="M11.8 28.3c-.4-1.3-.7-2.7-.7-4.3s.3-2.9.7-4.3v-5.7H4.5C2.9 17.2 2 20.5 2 24s.9 6.8 2.5 10l7.3-5.7z"/><path fill="#EA4335" d="M24 10.7c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.1 29.9 2 24 2 15.5 2 8.1 6.8 4.5 13.9l7.3 5.7c1.7-5.2 6.5-8.9 12.2-8.9z"/></svg>
                Continue with Google
              </a>
              <div className="lg-or">OR USE YOUR EMAIL</div>

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
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Maitrik Makwana"
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
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@studio.com"
                      spellCheck="false"
                    />
                  </span>
                </div>

                <div className="lg-f" id="lgf-upPw">
                  <div className="lg-lbl"><label htmlFor="lgUpPw">Password</label></div>
                  <span className="lg-inp pw">
                    <input
                      id="lgUpPw"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={PASSWORD_MIN_LENGTH}
                      autoComplete="new-password"
                      aria-describedby="lgBar"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
                    />
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
                    id="lgTerms"
                    checked={acceptedTerms}
                    onChange={(event) => setAcceptedTerms(event.target.checked)}
                  />
                  <span>I agree to the <a href="#">terms of service</a> and the <a href="#">privacy policy</a>.</span>
                </label>
                {error && (
                  <p id={errorId} role="alert" className="lg-err">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
                    <span>{error}</span>
                  </p>
                )}
                <button type="submit" className="lg-go" disabled={isSubmitting}>
                  {isSubmitting ? <span className="lg-spin"></span> : null}
                  Create account
                </button>
              </form>
              <div className="lg-swap">
                Already have an account? <button type="button" onClick={goToSignIn}>Sign in</button>
              </div>
            </div>
          )}

          {step === "help" && (
            <div id="lg-reset">
              <button type="button" className="lg-back" onClick={goToSignIn}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>
                Back to sign in
              </button>
              <h1>Trouble signing in?</h1>
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
                Remembered it? <button type="button" onClick={goToSignIn}>Sign in instead</button>
              </div>
            </div>
          )}

          {step === "code" && (
            <div id="lg-sent">
              <div className="lg-sent" aria-hidden="true">
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7l9 6 9-6"/><rect x="3" y="5" width="18" height="14" rx="2"/></svg>
              </div>
              <h1>Check your email</h1>
              <p className="lg-lede">The sign-in code is on its way to:</p>
              <p className="lg-mailbox">{email}</p>
              <p className="lg-lede">
                It works once. If nothing arrives in a few minutes, look in spam before
                asking for another.
              </p>

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
                  Verify and sign in
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
                <button type="button" onClick={goToSignIn}>Use a different email</button>
              </div>
            </div>
          )}
        </div>
        
        <div className="lg-foot">
          <span className="c">&copy; {new Date().getFullYear()} Backline</span>
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
          <a href="#">Support</a>
        </div>
      </section>

      <section className="lg-stage" aria-hidden="true">
        <div className="lg-pitch">
          <h2>Your client points at the thing. You get a ticket.</h2>
          <p>Comments land on the page itself, pinned to the element they are about, with the
            browser and screen size already captured.</p>

          <div className="lg-demo">
            <div className="lg-demo-bar"><i /><i /><i /><span>www.sarvam.ai/pricing</span></div>
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
