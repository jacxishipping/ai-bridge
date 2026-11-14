import React, { useEffect, useState } from "react";
import { ArrowRight, KeyRound, UserRound } from "lucide-react";
import { FrostedGlass, JXAlert, JXButton, JXCardContent, JXTextField, JXLinearProgress, ShimmerButton } from "../ui";
import { Brand, BrandArt } from "../Brand";
import { api, apiOrigin, authenticate, probeControlHealth } from "../api";
import { dashboardStore, useDashboardStore } from "../state/dashboardStore";
import { LanguageControl } from "../LanguageControl";
import { ThemeControl } from "../ThemeControl";
import { useLanguage } from "../i18n";

function passwordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  const clamped = Math.min(4, Math.floor(score / 1.5));
  const labels = ["Very weak", "Weak", "Fair", "Strong", "Very strong"];
  const colors = ["rose", "rose", "amber", "emerald", "emerald"];
  return { score: clamped, label: labels[clamped], color: colors[clamped] };
}

export const LoginView: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useDashboardStore((s) => s.setCurrentView);
  const [method, setMethod] = useState<"token" | "password">("token");
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ssoConfigured, setSsoConfigured] = useState(false);
  const [health, setHealth] = useState<{ ok: boolean; detail: string; version?: string } | null>(null);
  const [probing, setProbing] = useState(true);
  useEffect(() => {
    let active = true;
    api.oidcConfigured().then((data) => { if (active) setSsoConfigured(Boolean(data.enabled)); }).catch(() => {});
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    setProbing(true);
    probeControlHealth().then((result) => {
      if (active) { setHealth(result); setProbing(false); }
    });
    return () => { active = false; };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const preflight = await probeControlHealth();
      setHealth(preflight);
      if (!preflight.ok) {
        throw new Error(preflight.detail);
      }
      await authenticate(method === "token" ? { token: token.trim() } : { username: username.trim(), password });
      // A successful sign-in lands on the live control plane, not the demo overview.
      await dashboardStore.refreshLive();
      navigate("live");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
    } finally { setBusy(false); }
  };

  return <main className="product-auth">
    <header className="product-container flex flex-wrap items-center justify-between gap-2 py-4"><Brand /><div className="flex items-center gap-2"><ThemeControl /><LanguageControl /></div></header>
    <div className="product-auth-content">
    <div className="product-auth-form space-y-4">
      <div className="space-y-3">
        <h1>{t("Connect to AI Bridge")}</h1>
      </div>
      <FrostedGlass className="rounded-2xl border border-[color:var(--product-line)] bg-[var(--product-surface)]/70 p-1">
        <JXCardContent>
          <div className="space-y-4 p-3 sm:p-4">
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("Sign-in method")}>
              <JXButton color={method === "token" ? "primary" : "neutral"} variant={method === "token" ? "contained" : "outlined"}
                aria-pressed={method === "token"} onClick={() => { setMethod("token"); setError(""); }} startIcon={<KeyRound className="h-4 w-4" />}>{t("Admin token")}</JXButton>
              <JXButton color={method === "password" ? "primary" : "neutral"} variant={method === "password" ? "contained" : "outlined"}
                aria-pressed={method === "password"} onClick={() => { setMethod("password"); setError(""); }} startIcon={<UserRound className="h-4 w-4" />}>{t("Account")}</JXButton>
            </div>
            <div lang="en" dir="ltr" className="rounded-lg border border-[color:var(--product-line)] bg-[var(--product-raised)]/40 px-3 py-2 text-xs text-[color:var(--product-text-tertiary)]">
              <p>Control plane: <code className="text-[color:var(--product-text-secondary)]">{apiOrigin}</code></p>
              <p className="mt-1" role="status">
                {probing ? "Checking API…" : health?.ok
                  ? `API reachable${health.version ? ` · v${health.version}` : ""}`
                  : (health?.detail || "API unreachable")}
              </p>
            </div>
            {error && <div lang="en" dir="ltr"><JXAlert severity="error" title="Unable to sign in" description={error} /></div>}
            {!probing && health && !health.ok && !error && (
              <div lang="en" dir="ltr"><JXAlert severity="warning" title="Control plane unreachable" description={health.detail} /></div>
            )}
            <form className="space-y-4" onSubmit={submit}>
              {method === "token" ? <><JXTextField label={t("Admin token")} type="password" value={token} onChange={setToken}
                required autoComplete="off" clearable={false} />
                <p lang="en" dir="ltr" className="text-xs text-[color:var(--product-text-tertiary)]">Use the AI_BRIDGE_ADMIN_TOKEN configured on your server.</p></> :
                <>
                  <JXTextField label={t("Username")} value={username} onChange={setUsername} required autoComplete="username" clearable={false} />
                  <div className="space-y-1">
                    <JXTextField label={t("Password")} type="password" value={password} onChange={setPassword} required autoComplete="current-password" clearable={false} />
                    {method === "password" && password.length > 0 && (
                      <div className="space-y-1" aria-live="polite">
                        <JXLinearProgress
                          value={(passwordStrength(password).score + 1) * 20}
                        />
                        <p className="text-[11px] text-[color:var(--product-text-tertiary)]">{passwordStrength(password).label}</p>
                      </div>
                    )}
                  </div>
                </>}
              {health?.ok ? (
                <ShimmerButton
                  type="submit"
                  tone="primary"
                  variant="solid"
                  disabled={busy || probing}
                  className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium"
                >
                  {busy ? t("Signing in…") : t("Sign in")}
                  {!busy && <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />}
                </ShimmerButton>
              ) : (
                <JXButton type="submit" fullWidth loading={busy} loadingLabel={t("Signing in…")}
                  disabled={busy || probing || Boolean(health && !health.ok)}
                  endIcon={<ArrowRight className="h-4 w-4 rtl:rotate-180" />}>{t("Sign in")}</JXButton>
              )}
            </form>
            {health && !health.ok && (
              <JXButton fullWidth variant="outlined" color="neutral" onClick={() => {
                setProbing(true);
                probeControlHealth().then((result) => { setHealth(result); setProbing(false); });
              }}>Retry connection check</JXButton>
            )}
            {ssoConfigured && <JXButton fullWidth color="neutral" variant="outlined" onClick={() => api.oidcLogin()}>{t("Sign in with your identity provider")}</JXButton>}
            <div className="space-y-3 border-t border-[color:var(--product-line)] pt-5">
              <JXButton fullWidth variant="outlined" color="neutral" onClick={() => navigate("overview")}>{t("Explore demo workspace")}</JXButton>
            </div>
          </div>
        </JXCardContent>
      </FrostedGlass>
      <p lang="en" dir="ltr" className="text-xs leading-relaxed text-[color:var(--product-text-tertiary)]">Credentials are kept for this browser session, not saved permanently.</p>
    </div>
    <div className="product-auth-art"><BrandArt /></div>
    </div>
  </main>;
};

export default LoginView;
