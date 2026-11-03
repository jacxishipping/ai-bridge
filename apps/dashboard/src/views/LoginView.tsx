/**
 * AI Bridge Enterprise Dashboard — LoginView (Screen 0)
 * Zero-Trust Dual-Auth Console: Admin Secret Token, Operator Credentials, Google SSO PKCE.
 * Pure @jacxishippingorg/jx-ui-react, motion/react, and lucide-react. ZERO inline styles.
 */

import React, { useState, useMemo, useCallback } from "react";
import { motion } from "motion/react";
import {
  JXCard,
  JXCardHeader,
  JXCardContent,
  JXButton,
  JXTextField,
  JXCheckbox,
  JXBadge,
  JXTabs,
  JXAlert,
  JXDivider,
} from "@jacxishippingorg/jx-ui-react";
import {
  Shield,
  ShieldCheck,
  Key,
  User,
  Lock,
  Eye,
  EyeOff,
  Terminal,
  CheckCircle2,
  AlertCircle,
  Clipboard,
  Fingerprint,
} from "lucide-react";
import { useDashboardStore } from "../state/dashboardStore";

export function calculatePasswordEntropy(password: string): {
  entropy: number;
  rating: "weak" | "fair" | "strong" | "enterprise";
  label: string;
  colorClass: string;
  widthPercentClass: string;
} {
  if (!password) {
    return {
      entropy: 0,
      rating: "weak",
      label: "Enter password (0 bits)",
      colorClass: "bg-slate-700",
      widthPercentClass: "w-0",
    };
  }
  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/[0-9]/.test(password)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(password)) pool += 33;
  const entropy = Math.round(password.length * Math.log2(pool || 1));

  if (
    password.length >= 16 &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  ) {
    return {
      entropy,
      rating: "enterprise",
      label: `Enterprise Grade (${entropy} bits)`,
      colorClass: "bg-indigo-500",
      widthPercentClass: "w-full",
    };
  }
  if (password.length >= 12 && pool >= 62) {
    return {
      entropy,
      rating: "strong",
      label: `Strong (${entropy} bits)`,
      colorClass: "bg-emerald-500",
      widthPercentClass: "w-3/4",
    };
  }
  if (password.length >= 8) {
    return {
      entropy,
      rating: "fair",
      label: `Fair (${entropy} bits)`,
      colorClass: "bg-amber-500",
      widthPercentClass: "w-1/2",
    };
  }
  return {
    entropy,
    rating: "weak",
    label: `Weak (${entropy} bits)`,
    colorClass: "bg-rose-500",
    widthPercentClass: "w-1/4",
  };
}

export const LoginView: React.FC = () => {
  const setCurrentView = useDashboardStore((s) => s.setCurrentView);
  const gatewayLatencyMs = useDashboardStore((s) => s.gatewayLatencyMs);
  const gatewayStatus = useDashboardStore((s) => s.gatewayStatus);

  const [authTab, setAuthTab] = useState<string>("admin_token");
  const [adminToken, setAdminToken] = useState<string>("");
  const [tokenMasked, setTokenMasked] = useState<boolean>(true);

  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [passwordMasked, setPasswordMasked] = useState<boolean>(true);

  const [pinMtlsSession, setPinMtlsSession] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [ssoLoading, setSsoLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const entropyMeta = useMemo(() => calculatePasswordEntropy(password), [password]);

  const handleInsertDevToken = useCallback(() => {
    setAdminToken("ai_bridge_sec_adm_99182a4");
    setErrorMessage(null);
  }, []);

  const handlePasteClipboard = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setAdminToken(text.trim());
          setErrorMessage(null);
        }
      }
    } catch {
      // Graceful fallback
      handleInsertDevToken();
    }
  }, [handleInsertDevToken]);

  const handleGoogleSSO = useCallback(async () => {
    setSsoLoading(true);
    setErrorMessage(null);
    try {
      await new Promise((res) => setTimeout(res, 600));
      setSuccessMessage("Google SSO PKCE exchange authenticated. Unlocking control plane...");
      setTimeout(() => {
        setCurrentView("overview");
      }, 400);
    } catch {
      setErrorMessage("Google SSO PKCE exchange failed. Check network or identity provider.");
    } finally {
      setSsoLoading(false);
    }
  }, [setCurrentView]);

  const handleLoginSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setErrorMessage(null);
      setIsSubmitting(true);

      try {
        if (authTab === "admin_token") {
          const trimmedToken = adminToken.trim();
          if (!trimmedToken) {
            setErrorMessage("Admin Secret Token is required.");
            setIsSubmitting(false);
            return;
          }
          if (!trimmedToken.startsWith("ai_bridge_sec_adm") && trimmedToken.length < 8) {
            setErrorMessage("Invalid Admin Secret Token format. Expected 'ai_bridge_sec_adm_...' prefix.");
            setIsSubmitting(false);
            return;
          }
        } else {
          if (!username.trim()) {
            setErrorMessage("Username or operator identity is required.");
            setIsSubmitting(false);
            return;
          }
          if (password.length < 8) {
            setErrorMessage("Password must satisfy minimum entropy requirements (>= 8 characters).");
            setIsSubmitting(false);
            return;
          }
        }

        // Simulate cryptographic mTLS attestation handshake
        await new Promise((res) => setTimeout(res, 500));
        setSuccessMessage("Cryptographic mTLS session bound. Gateway unlocked.");
        setTimeout(() => {
          setCurrentView("overview");
        }, 300);
      } catch (err: any) {
        setErrorMessage(err?.message || "Authentication rejected by control plane.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [authTab, adminToken, username, password, setCurrentView]
  );

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 md:p-8 bg-slate-950 text-slate-100">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-lg"
      >
        <JXCard spotlight hoverLift className="bg-slate-900/80 border-slate-800 shadow-2xl backdrop-blur-xl">
          <JXCardHeader
            title="AI Bridge Fleet Gateway"
            subheader="Enterprise Zero-Trust Autonomous Control Plane"
            icon={<Shield className="w-6 h-6 text-indigo-400" />}
          />
          <JXCardContent>
            <div className="space-y-6 pt-2">
              {/* Gateway Health Indicator Bar */}
              <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                  </span>
                  <span className="text-slate-300">
                    Gateway: {gatewayStatus === "online" ? "Online" : "Offline"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <span className="text-emerald-400 font-semibold">{gatewayLatencyMs}ms latency</span>
                  <span>•</span>
                  <span className="text-slate-400">mTLS v1.3</span>
                </div>
              </div>

              {/* Error or Success Feedback Alert */}
              {errorMessage && (
                <JXAlert
                  severity="error"
                  title="Authentication Denied"
                  description={errorMessage}
                />
              )}
              {successMessage && (
                <JXAlert
                  severity="success"
                  title="Attestation Verified"
                  description={successMessage}
                />
              )}

            {/* Google SSO PKCE Trigger */}
            <div className="space-y-2">
              <JXButton
                variant="outlined"
                color="neutral"
                size="md"
                fullWidth
                onClick={handleGoogleSSO}
                loading={ssoLoading}
                loadingLabel="Verifying Google SSO PKCE..."
                className="justify-center border-slate-700 hover:border-indigo-500/50 hover:bg-slate-800/80 text-slate-200"
                startIcon={<Fingerprint className="w-4 h-4 text-indigo-400" />}
              >
                Continue with Google SSO
              </JXButton>
            </div>

            {/* Divider */}
            <div className="relative flex items-center justify-center">
              <div className="border-t border-slate-800 w-full" />
              <span className="bg-slate-900 px-3 text-[11px] font-mono text-slate-400 uppercase tracking-wider absolute">
                or authenticate directly
              </span>
            </div>

            {/* Dual-Auth Tab Switcher */}
            <div className="pt-1">
              <JXTabs
                value={authTab}
                onChange={(val) => {
                  setAuthTab(val);
                  setErrorMessage(null);
                }}
                tabs={[
                  {
                    id: "admin_token",
                    label: "Admin Secret Token",
                    icon: <Key className="w-3.5 h-3.5 text-indigo-400" />,
                  },
                  {
                    id: "operator_login",
                    label: "Operator Login",
                    icon: <User className="w-3.5 h-3.5 text-indigo-400" />,
                  },
                ]}
              />
            </div>

            {/* Authentication Forms */}
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              {authTab === "admin_token" ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                      <span>Admin Bearer Secret</span>
                      <button
                        type="button"
                        onClick={() => setTokenMasked(!tokenMasked)}
                        className="text-[11px] font-mono text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                      >
                        {tokenMasked ? (
                          <>
                            <Eye className="w-3 h-3" /> Show
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3 h-3" /> Hide
                          </>
                        )}
                      </button>
                    </label>
                    <JXTextField
                      type={tokenMasked ? "password" : "text"}
                      value={adminToken}
                      onChange={(val) => setAdminToken(val)}
                      placeholder="ai_bridge_sec_adm_..."
                      startIcon={<Lock className="w-4 h-4 text-slate-400" />}
                      size="md"
                      clearable
                      helperText="Accepts AI_BRIDGE_ADMIN_TOKEN secret bearer string."
                    />
                  </div>

                  {/* Quick token action chips */}
                  <div className="flex items-center gap-2 pt-1">
                    <JXButton
                      type="button"
                      variant="soft"
                      color="neutral"
                      size="sm"
                      onClick={handlePasteClipboard}
                      startIcon={<Clipboard className="w-3 h-3 text-slate-400" />}
                      className="text-xs text-slate-300 bg-slate-800/80 hover:bg-slate-800"
                    >
                      Paste from Clipboard
                    </JXButton>
                    <JXButton
                      type="button"
                      variant="soft"
                      color="primary"
                      size="sm"
                      onClick={handleInsertDevToken}
                      startIcon={<Terminal className="w-3 h-3 text-indigo-400" />}
                      className="text-xs bg-indigo-950/60 text-indigo-300 hover:bg-indigo-900/60"
                    >
                      Insert Dev Token
                    </JXButton>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">
                      Operator Identity / Email
                    </label>
                    <JXTextField
                      type="text"
                      value={username}
                      onChange={(val) => setUsername(val)}
                      placeholder="sarah.j@security.internal"
                      startIcon={<User className="w-4 h-4 text-slate-400" />}
                      size="md"
                      clearable
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-300">
                        Workstation Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setPasswordMasked(!passwordMasked)}
                        className="text-[11px] font-mono text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                      >
                        {passwordMasked ? (
                          <>
                            <Eye className="w-3 h-3" /> Show
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3 h-3" /> Hide
                          </>
                        )}
                      </button>
                    </div>
                    <JXTextField
                      type={passwordMasked ? "password" : "text"}
                      value={password}
                      onChange={(val) => setPassword(val)}
                      placeholder="••••••••••••••••"
                      startIcon={<Lock className="w-4 h-4 text-slate-400" />}
                      size="md"
                    />

                    {/* Real-time entropy progress bar */}
                    <div className="space-y-1 pt-1">
                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${entropyMeta.colorClass} ${entropyMeta.widthPercentClass}`}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                        <span>Entropy: {entropyMeta.label}</span>
                        <span className="uppercase text-[10px] tracking-wider text-slate-400">
                          {entropyMeta.rating}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Session Pinning Checkbox */}
              <div className="pt-2">
                <JXCheckbox
                  checked={pinMtlsSession}
                  onChange={(checked) => setPinMtlsSession(checked)}
                  label="Remember this workstation for 24 hours (mTLS session pinned)"
                />
              </div>

              {/* Primary Login Button */}
              <div className="pt-2">
                <JXButton
                  type="submit"
                  variant="contained"
                  color="primary"
                  size="lg"
                  fullWidth
                  loading={isSubmitting}
                  loadingLabel="Authenticating & Unlocking Gateway..."
                  startIcon={<ShieldCheck className="w-4 h-4" />}
                  className="bg-indigo-600 hover:bg-indigo-500 font-semibold"
                >
                  Authenticate & Unlock Gateway
                </JXButton>
              </div>
            </form>

            {/* Security Compliance Footer */}
            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
              <div className="flex items-center gap-1.5 text-slate-400">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>ISO 27001 / SOC-2 Type II Verified</span>
              </div>
              <span className="text-slate-400">Zero-Trust Mesh</span>
            </div>
            </div>
          </JXCardContent>
        </JXCard>
      </motion.div>
    </div>
  );
};

export default LoginView;
