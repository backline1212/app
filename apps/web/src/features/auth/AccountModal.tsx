import { useEffect, useRef, useState } from "react";
import { Dialog } from "../../components/Dialog";
import { useToast } from "../../components/Toast";
import { useAuth } from "./AuthContext";
import { changePassword, confirmEmailChange, listSessions, requestEmailChange, updateProfile, type SessionOut, type UserUpdateRequest } from "./api";

type Tab = "profile" | "notifications" | "security";

const NOTIFICATION_ROWS = [
  ["notify_on_assignment", "Email me when I'm assigned", "A ticket or comment lands on your plate."],
  ["notify_on_mention", "Mentions always email me", "Someone @mentions you in a thread."],
  ["notify_on_reply", "Replies to my comments", "A teammate or client answers a thread you're in."],
  ["notify_on_status_change", "Status changes on my tickets", "Something you raised or own moves column."],
  ["daily_digest", "Daily digest", "One email with everything from the day before."],
] as const;

type Prefs = Record<(typeof NOTIFICATION_ROWS)[number][0], boolean>;

// Downscaled and center-cropped in the browser, so the stored photo is a few KB and
// the server only has to check it is a small image data URL (auth/schemas.py).
function resizePhoto(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Couldn't read that image."));
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that image."));
    };
    img.src = url;
  });
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function AccountModal({ onClose }: { onClose: () => void }) {
  const { user, logout, updateUser } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("profile");

  const [first, setFirst] = useState(() => (user?.name ?? "").trim().split(/\s+/)[0] ?? "");
  const [last, setLast] = useState(() => (user?.name ?? "").trim().split(/\s+/).slice(1).join(" "));
  // undefined = unchanged, null = remove, string = new photo
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [prefs, setPrefs] = useState<Prefs>({
    notify_on_assignment: true,
    notify_on_mention: true,
    notify_on_reply: true,
    notify_on_status_change: true,
    daily_digest: true,
    ...user?.preferences,
  });
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Email change: code goes to the new address, then it's confirmed here.
  const [email, setEmail] = useState(user?.email ?? "");
  const [emailPassword, setEmailPassword] = useState("");
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState("");
  const emailChanged = email.trim().toLowerCase() !== (user?.email ?? "").toLowerCase();

  // Password
  const [pwOpen, setPwOpen] = useState(false);
  const [pwOld, setPwOld] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwNew2, setPwNew2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState("");

  const [sessions, setSessions] = useState<SessionOut[] | null>(null);
  const [sessionError, setSessionError] = useState(false);
  useEffect(() => {
    if (tab !== "security" || sessions) return;
    listSessions().then(setSessions).catch(() => setSessionError(true));
  }, [tab, sessions]);

  const shownPhoto = photo === undefined ? user?.avatar_url : photo;
  const displayName = `${first} ${last}`.trim() || user?.name || "";

  async function pickPhoto(files: FileList | null) {
    const file = files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("Pick an image file.", "error");
    try {
      setPhoto(await resizePhoto(file));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't read that image.", "error");
    }
  }

  async function sendEmailCode() {
    setEmailBusy(true);
    setEmailError("");
    try {
      const next = email.trim();
      await requestEmailChange(next, user?.has_password ? emailPassword : null);
      setCodeSentTo(next);
      setCode("");
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Couldn't send the code.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function confirmEmail() {
    if (!codeSentTo) return;
    setEmailBusy(true);
    setEmailError("");
    try {
      const updated = await confirmEmailChange(codeSentTo, code.trim());
      updateUser(updated);
      setEmail(updated.email);
      setCodeSentTo(null);
      setEmailPassword("");
      toast("Email updated.");
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Couldn't confirm that code.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function savePassword() {
    setPwError("");
    if (!pwOld) return setPwError("Enter your current password first.");
    if (pwNew.length < 12) return setPwError("The new password needs at least 12 characters.");
    if (pwNew !== pwNew2) return setPwError("The two new passwords do not match.");
    setPwBusy(true);
    try {
      await changePassword(pwOld, pwNew);
      setPwOpen(false);
      setPwOld("");
      setPwNew("");
      setPwNew2("");
      setSessions(null);
      toast("Password updated. You stay signed in on this device.");
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Couldn't update your password.");
    } finally {
      setPwBusy(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!first.trim()) return toast("First name can't be empty.", "error");
    setSaving(true);
    try {
      const patch: UserUpdateRequest = { name: displayName, preferences: prefs };
      if (photo !== undefined) patch.avatar_url = photo;
      updateUser(await updateProfile(patch));
      toast(emailChanged ? "Saved. Your email changes once you confirm the code." : "Account saved.");
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save your changes.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not sign out.", "error");
      setSigningOut(false);
    }
  }

  return (
    <Dialog title="Account" onClose={onClose}>
      <form className="bl-acct" onSubmit={(e) => void handleSave(e)}>
        <p className="bl-acct-sub">Your profile, notifications and security</p>
        <div className="bl-acct-body">
          <div className="bl-acct-top">
            <span className="bl-acct-av">{shownPhoto ? <img src={shownPhoto} alt="" /> : initials(displayName)}</span>
            <div className="bl-acct-who">
              <strong>{displayName}</strong>
              <span>{user?.email}</span>
              <div className="bl-acct-photo-actions">
                <button type="button" className="bl-quiet" onClick={() => fileRef.current?.click()}>
                  Change photo
                </button>
                {shownPhoto && (
                  <button type="button" className="bl-quiet" onClick={() => setPhoto(null)}>
                    Remove
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void pickPhoto(e.target.files)} />
              </div>
            </div>
          </div>

          <div className="bl-acct-tabs" role="tablist">
            {(["profile", "notifications", "security"] as Tab[]).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
                {k[0].toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>

          {tab === "profile" && (
            <div className="bl-acct-panel">
              <div className="bl-nt-grid">
                <label className="bl-nt-field">
                  <span>First name</span>
                  <input className="bl-acct-in" value={first} maxLength={60} required onChange={(e) => setFirst(e.target.value)} />
                </label>
                <label className="bl-nt-field">
                  <span>Last name</span>
                  <input className="bl-acct-in" value={last} maxLength={60} onChange={(e) => setLast(e.target.value)} />
                </label>
              </div>
              <label className="bl-nt-field">
                <span>Email</span>
                <input
                  className="bl-acct-in"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setCodeSentTo(null);
                    setEmailError("");
                  }}
                />
              </label>
              {emailChanged && (
                <div className="bl-acct-box">
                  {codeSentTo ? (
                    <>
                      <p>
                        We sent a code to <b>{codeSentTo}</b>. Enter it to switch your sign-in email.
                      </p>
                      <div className="bl-acct-inline">
                        <input className="bl-acct-in" inputMode="numeric" autoComplete="one-time-code" placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} />
                        <button type="button" className="bl-button" disabled={emailBusy || !code.trim()} onClick={() => void confirmEmail()}>
                          {emailBusy ? "Checking…" : "Confirm email"}
                        </button>
                        <button type="button" className="bl-quiet" disabled={emailBusy} onClick={() => void sendEmailCode()}>
                          Resend
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p>{user?.has_password ? "Confirm it's you, then we'll send a code to the new address." : "We'll send a code to the new address to confirm it."}</p>
                      <div className="bl-acct-inline">
                        {user?.has_password && (
                          <input className="bl-acct-in" type="password" autoComplete="current-password" placeholder="Current password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} />
                        )}
                        <button type="button" className="bl-button" disabled={emailBusy || (user?.has_password && !emailPassword)} onClick={() => void sendEmailCode()}>
                          {emailBusy ? "Sending…" : "Send code"}
                        </button>
                      </div>
                    </>
                  )}
                  {emailError && (
                    <p role="alert" className="bl-acct-err">
                      {emailError}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "notifications" && (
            <div className="bl-acct-panel bl-acct-rows">
              {NOTIFICATION_ROWS.map(([key, title, desc]) => (
                <div className="bl-acct-row" key={key}>
                  <span>
                    <b>{title}</b>
                    <small>{desc}</small>
                  </span>
                  <button type="button" className="bl-acct-sw" role="switch" aria-checked={prefs[key]} aria-label={title} onClick={() => setPrefs({ ...prefs, [key]: !prefs[key] })}>
                    <i />
                  </button>
                </div>
              ))}
            </div>
          )}

          {tab === "security" && (
            <div className="bl-acct-panel bl-acct-rows">
              <div className="bl-acct-row">
                <span>
                  <b>Password</b>
                  <small>{user?.has_password ? "Used when you sign in with your email and password." : "You sign in with Google or an email code, so there's no password to change."}</small>
                </span>
                {user?.has_password && (
                  <button type="button" className="bl-quiet bl-acct-small" onClick={() => { setPwOpen(!pwOpen); setPwError(""); }}>
                    {pwOpen ? "Cancel" : "Change password"}
                  </button>
                )}
              </div>
              {pwOpen && (
                <div className="bl-acct-box">
                  <label className="bl-nt-field">
                    <span>Current password</span>
                    <input className="bl-acct-in" type="password" autoComplete="current-password" autoFocus value={pwOld} onChange={(e) => setPwOld(e.target.value)} />
                  </label>
                  <div className="bl-nt-grid">
                    <label className="bl-nt-field">
                      <span>New password</span>
                      <input className="bl-acct-in" type="password" autoComplete="new-password" placeholder="At least 12 characters" value={pwNew} onChange={(e) => setPwNew(e.target.value)} />
                    </label>
                    <label className="bl-nt-field">
                      <span>Confirm new password</span>
                      <input className="bl-acct-in" type="password" autoComplete="new-password" placeholder="Repeat it" value={pwNew2} onChange={(e) => setPwNew2(e.target.value)} />
                    </label>
                  </div>
                  {pwError && (
                    <p role="alert" className="bl-acct-err">
                      {pwError}
                    </p>
                  )}
                  <div className="bl-acct-inline">
                    <button type="button" className="bl-button" disabled={pwBusy} onClick={() => void savePassword()}>
                      {pwBusy ? "Updating…" : "Update password"}
                    </button>
                  </div>
                </div>
              )}
              <p className="bl-acct-lbl">Where you are signed in</p>
              {sessionError ? (
                <p className="bl-acct-hint">Sessions could not load.</p>
              ) : !sessions ? (
                <p className="bl-acct-hint">Loading…</p>
              ) : (
                sessions.map((s) => (
                  <div className="bl-acct-row" key={s.id}>
                    <span>
                      <b>
                        {s.os || "Unknown device"} · {s.browser || "Unknown browser"}
                      </b>
                      <small>
                        {s.ip_address || "Unknown IP"} · signed in {new Date(s.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                      </small>
                    </span>
                    {s.current && (
                      <span className="bl-pill-select bl-st-resolved bl-acct-here">
                        <i aria-hidden="true" />
                        This device
                      </span>
                    )}
                  </div>
                ))
              )}
              <p className="bl-acct-hint">You can be signed in on one device at a time. Signing in somewhere else signs you out here.</p>
            </div>
          )}
        </div>

        <footer className="bl-acct-foot">
          <button type="button" className="bl-quiet" disabled={signingOut} onClick={() => void handleSignOut()}>
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
          <span />
          <button type="button" className="bl-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="bl-button" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
