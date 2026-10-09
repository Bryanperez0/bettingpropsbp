import { useState, type FormEvent } from "react";
import { supabase } from "../auth/supabase";
import { useAuth } from "../auth/AuthProvider";

type Mode = "signin" | "signup" | "forgot" | "reset";

const VIEWS: Record<Mode, { title: string; sub: string; button: string; email: boolean; password: boolean }> = {
  signin: { title: "Sign in", sub: "Sign in with your email to use Prop Lab.", button: "Sign in", email: true, password: true },
  signup: { title: "Create an account", sub: "Use your email and a password of at least 6 characters.", button: "Create account", email: true, password: true },
  forgot: { title: "Reset your password", sub: "We'll email you a link to set a new password.", button: "Send reset link", email: true, password: false },
  reset: { title: "Set a new password", sub: "Choose a new password of at least 6 characters.", button: "Save password", email: false, password: true },
};

const inputCls = "mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-over focus:outline-none";
const linkCls = "text-sm text-ink-3 underline-offset-2 hover:text-ink hover:underline";

export default function SignIn() {
  const { recovery, endRecovery } = useAuth();
  const [mode, setMode] = useState<Mode>(recovery ? "reset" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const view = VIEWS[recovery ? "reset" : mode];
  const current: Mode = recovery ? "reset" : mode;

  const go = (m: Mode) => { setMode(m); setPassword(""); setShowPassword(false); setMsg(null); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (view.email && !/^\S+@\S+\.\S+$/.test(email.trim())) return setMsg({ text: "Enter a valid email address.", ok: false });
    if (view.password && password.length < 6) return setMsg({ text: "Password must be at least 6 characters.", ok: false });
    setBusy(true);
    const redirectTo = window.location.origin;
    try {
      if (current === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else if (current === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        if (!data.session) { go("signin"); setMsg({ text: "Check your email for a confirmation link, then sign in.", ok: true }); }
      } else if (current === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
        if (error) throw error;
        setMsg({ text: "If that email has an account, a reset link is on its way.", ok: true });
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        endRecovery();
      }
    } catch (err) {
      setMsg({ text: (err as Error).message || "Something went wrong. Try again.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-start justify-center px-4 pt-[12vh]">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <div>
            <div className="font-bold tracking-tight text-ink">Prop Lab</div>
            <div className="text-[11px] text-ink-3">NFL prop analytics</div>
          </div>
        </div>
        <form onSubmit={submit} noValidate className="rounded-xl border border-line bg-surface p-6">
          <h1 className="text-lg font-semibold tracking-tight text-ink">{view.title}</h1>
          <p className="mt-1 text-sm text-ink-3">{view.sub}</p>
          {view.email && (
            <label className="mt-4 block text-sm font-medium text-ink-2">
              Email
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputCls} />
            </label>
          )}
          {view.password && (
            <div className="mt-4">
              <label htmlFor="password" className="block text-sm font-medium text-ink-2">
                {current === "reset" ? "New password" : "Password"}
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={current === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className={`${inputCls} pr-16`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-pressed={showPassword}
                  aria-controls="password"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 mt-1 rounded-r-lg px-3 text-xs font-semibold text-ink-3 hover:text-ink focus-visible:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-over"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          )}
          <button type="submit" disabled={busy} className="mt-5 w-full rounded-lg bg-over px-3 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {busy ? "Please wait…" : view.button}
          </button>
          {msg && <p role="status" className={`mt-3 text-sm ${msg.ok ? "text-strong" : "text-negative"}`}>{msg.text}</p>}
          {current !== "reset" && (
            <div className="mt-4 flex justify-between gap-3">
              <button type="button" className={linkCls} onClick={() => go(current === "signin" ? "signup" : "signin")}>
                {current === "signin" ? "Create an account" : "Back to sign in"}
              </button>
              {current === "signin" && <button type="button" className={linkCls} onClick={() => go("forgot")}>Forgot password?</button>}
            </div>
          )}
        </form>
        <p className="mt-4 text-center text-xs text-ink-3">Research only. Not a sportsbook.</p>
      </div>
    </div>
  );
}
