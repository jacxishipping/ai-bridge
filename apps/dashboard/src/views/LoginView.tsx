import React, { useEffect, useState } from "react";
import { ArrowRight, KeyRound, Shield, UserRound } from "lucide-react";
import { JXAlert, JXButton, JXCard, JXCardContent, JXTextField } from "../ui";
import { api, authenticate } from "../api";
import { useDashboardStore } from "../state/dashboardStore";

export const LoginView: React.FC = () => {
  const navigate = useDashboardStore((s) => s.setCurrentView);
  const [method, setMethod] = useState<"token" | "password">("token");
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ssoConfigured, setSsoConfigured] = useState(false);
  useEffect(() => {
    let active = true;
    api.oidcConfigured().then((data) => { if (active) setSsoConfigured(Boolean(data.enabled)); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await authenticate(method === "token" ? { token: token.trim() } : { username: username.trim(), password });
      navigate("live");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
    } finally { setBusy(false); }
  };

  return <main className="flex min-h-dvh items-center justify-center bg-[#0B0F19] px-4 py-10 text-slate-100">
    <div className="w-full max-w-md space-y-6">
      <div className="space-y-3 text-center">
        <Shield className="mx-auto h-9 w-9 text-indigo-400" aria-hidden="true" />
        <h1 className="text-2xl font-semibold tracking-tight">Connect to AI Bridge</h1>
      </div>
      <JXCard>
        <JXCardContent>
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Sign-in method">
              <JXButton color={method === "token" ? "primary" : "neutral"} variant={method === "token" ? "contained" : "outlined"}
                aria-pressed={method === "token"} onClick={() => { setMethod("token"); setError(""); }} startIcon={<KeyRound className="h-4 w-4" />}>Admin token</JXButton>
              <JXButton color={method === "password" ? "primary" : "neutral"} variant={method === "password" ? "contained" : "outlined"}
                aria-pressed={method === "password"} onClick={() => { setMethod("password"); setError(""); }} startIcon={<UserRound className="h-4 w-4" />}>Account</JXButton>
            </div>
            {error && <JXAlert severity="error" title="Unable to sign in" description={error} />}
            <form className="space-y-4" onSubmit={submit}>
              {method === "token" ? <JXTextField label="Admin token" type="password" value={token} onChange={setToken}
                required autoComplete="off" clearable={false} helperText="Use the AI_BRIDGE_ADMIN_TOKEN configured on your server." /> :
                <>
                  <JXTextField label="Username" value={username} onChange={setUsername} required autoComplete="username" clearable={false} />
                  <JXTextField label="Password" type="password" value={password} onChange={setPassword} required autoComplete="current-password" clearable={false} />
                </>}
              <JXButton type="submit" fullWidth loading={busy} loadingLabel="Signing in…" disabled={busy}
                endIcon={<ArrowRight className="h-4 w-4" />}>Sign in</JXButton>
            </form>
            {ssoConfigured && <JXButton fullWidth color="neutral" variant="outlined" onClick={() => api.oidcLogin()}>Sign in with your identity provider</JXButton>}
            <div className="space-y-3 border-t border-slate-800 pt-5">
              <JXButton fullWidth variant="outlined" color="neutral" onClick={() => navigate("overview")}>Explore demo workspace</JXButton>
            </div>
          </div>
        </JXCardContent>
      </JXCard>
      <p className="text-center text-xs text-slate-400">Credentials are kept for this browser session, not saved permanently.</p>
    </div>
  </main>;
};

export default LoginView;
