/**
 * Human-in-the-Loop Approvals & AST Command Diff Inspector (Screen 10)
 * Reconstructed with pure JXUI primitives, motion/react, and lucide-react.
 * ZERO inline styles. ZERO custom CSS.
 */

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useScrollShadow } from "../hooks/useScrollShadow";
import {
  GlassModal,
  HoldToConfirmButton,
  JXCard,
  JXCardHeader,
  JXCardContent,
  JXButton,
  JXBadge,
  JXCheckbox,
  JXTextField,
  JXGrid,
  JXGridItem,
  JXLinearProgress,
  ProductGlass,
  ProductModePill,
  ProductNotice,
  ProductSegmented,
  ProductStatusDot,
  SlideToAction,
} from "../ui";
import {
  ShieldAlert,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Eye,
  FileCode,
  Server,
  Bot,
  User,
  History,
  CheckSquare,
  Lock,
  Trash2,
} from "lucide-react";
import { useDashboardStore } from "../state/dashboardStore";
import { api, token, sessionToken } from "../api";
import type { ApprovalRequest } from "../types/dashboard";

interface DecisionRecord {
  id: string;
  command: string;
  decidedBy: string;
  verdict: "approved" | "denied";
  timestamp: string;
  justification: string;
}

export const HumanApprovalsView: React.FC = () => {
  const isLive = typeof window !== "undefined" && Boolean(token() || sessionToken());
  const approvals = useDashboardStore((s) => s.approvals);
  const resolveApproval = useDashboardStore((s) => s.resolveApproval);
  const refreshLive = useDashboardStore((s) => s.refreshLive);
  const operatorProfile = useDashboardStore((s) => s.operatorProfile);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const scrollShadow = useScrollShadow(tableScrollRef);

  // Active selected approval for inspection
  const [selectedId, setSelectedId] = useState<string>(
    approvals.find((a) => a.status === "pending")?.id || approvals[0]?.id || "appr-001"
  );

  const [queueFilter, setQueueFilter] = useState<"all" | "pending">("all");
  const activeApproval = approvals.find((a) => a.id === selectedId) || approvals[0];

  // Tick once per second so per-row SLA countdowns update without sharing selected state.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const computeRemaining = (expiresAt?: string): number | null => {
    if (!expiresAt) return null;
    const ms = new Date(expiresAt).getTime() - Date.now();
    return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : null;
  };

  const formatCountdown = (secs: number | null) => {
    if (secs === null) return "No SLA";
    if (secs <= 0) return "00:00";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const dangerousTokensFor = (command: string, existing?: string[]) => {
    if (existing?.length) return existing;
    const patterns = ["-rf", "--no-preserve-root", "rm", "sudo", "systemctl", "kill", "format", "mkfs", "dd", "chmod", "iptables"];
    return command.split(/\s+/).filter((word) => patterns.some((p) => word === p || word.includes(p)));
  };

  // Mandatory Safety Checklist state
  const [checklist, setChecklist] = useState<{
    scopeConfirmed: boolean;
    networkChecked: boolean;
    blastRadiusEvaluated: boolean;
  }>({
    scopeConfirmed: false,
    networkChecked: false,
    blastRadiusEvaluated: false,
  });

  // Rejection modal & reason state
  const [showDenyModal, setShowDenyModal] = useState<boolean>(false);
  const [rejectionReason, setRejectionReason] = useState<string>("");
  const [rePlanMessage, setRePlanMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!approvals.some((a) => a.id === selectedId)) {
      const next = approvals.find((a) => a.status === "pending")?.id || approvals[0]?.id;
      if (next) setSelectedId(next);
    }
  }, [approvals, selectedId]);

  // Decision history archive
  const [historyRecords, setHistoryRecords] = useState<DecisionRecord[]>([
    {
      id: "appr-099",
      command: "rm -rf /opt/ai-bridge/temp/*",
      decidedBy: "Sarah J.",
      verdict: "approved",
      timestamp: "2026-11-02T19:40:12Z",
      justification: "Verified sandbox cache path is isolated from root.",
    },
    {
      id: "appr-098",
      command: "iptables -F && iptables -t nat -F",
      decidedBy: "Sarah J.",
      verdict: "denied",
      timestamp: "2026-11-02T18:14:02Z",
      justification: "Attempted global firewall flush violates network segmentation policy.",
    },
    {
      id: "appr-097",
      command: "systemctl restart docker",
      decidedBy: "Sarah J.",
      verdict: "approved",
      timestamp: "2026-11-02T16:55:28Z",
      justification: "Routine daemon recycle during maintenance window.",
    },
  ]);

  const effectiveHistoryRecords: DecisionRecord[] = isLive
    ? approvals
        .filter((a): a is ApprovalRequest & { status: "approved" | "denied" } => a.status === "approved" || a.status === "denied")
        .map((a) => ({
          id: a.id,
          command: a.command,
          decidedBy: a.decidedBy || operatorProfile.name || "Operator",
          verdict: a.status,
          timestamp: a.decidedAt || a.requestedAt,
          justification: a.decisionReason || a.reason || "Operator decision recorded on control plane.",
        }))
    : historyRecords;

  const allChecklistSatisfied =
    checklist.scopeConfirmed &&
    checklist.networkChecked &&
    checklist.blastRadiusEvaluated;

  const handleAuthorize = async () => {
    if (!activeApproval || !allChecklistSatisfied) return;
    setActionError(null);
    try {
      await resolveApproval(
        activeApproval.id,
        "approved",
        "Operator validated blast radius and target node scope."
      );
    } catch (err: any) {
      setActionError(err?.message || "Failed to approve request.");
      return;
    }

    if (!isLive) {
      setHistoryRecords((prev) => [
        {
          id: activeApproval.id,
          command: activeApproval.command,
          decidedBy: "Sarah J.",
          verdict: "approved",
          timestamp: new Date().toISOString(),
          justification: "Operator authorized execution following safety verification.",
        },
        ...prev,
      ]);
    } else {
      await refreshLive?.();
    }

    // Reset checklist
    setChecklist({
      scopeConfirmed: false,
      networkChecked: false,
      blastRadiusEvaluated: false,
    });
  };

  const handleDeny = async () => {
    if (!activeApproval || !rejectionReason.trim()) return;
    setActionError(null);
    try {
      await resolveApproval(activeApproval.id, "denied", rejectionReason);
    } catch (err: any) {
      setActionError(err?.message || "Failed to deny request.");
      return;
    }

    if (!isLive) {
      setHistoryRecords((prev) => [
        {
          id: activeApproval.id,
          command: activeApproval.command,
          decidedBy: "Sarah J.",
          verdict: "denied",
          timestamp: new Date().toISOString(),
          justification: rejectionReason,
        },
        ...prev,
      ]);
    } else {
      await refreshLive?.();
    }

    setShowDenyModal(false);
    setRejectionReason("");
  };

  const handleRequestRePlan = async () => {
    if (!activeApproval) return;
    setActionError(null);
    const feedback = "Operator requested re-plan: reformulate command using non-destructive parameters.";
    if (isLive) {
      try {
        await api.replanApproval(activeApproval.id, feedback);
        await refreshLive?.();
      } catch (err: any) {
        setActionError(err?.message || "Failed to send re-plan feedback.");
        return;
      }
    }
    setRePlanMessage("Feedback dispatched: approval cancelled for non-destructive re-planning.");
    setTimeout(() => setRePlanMessage(null), 4000);
  };

  const handleDeleteApproval = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActionError(null);
    if (isLive) {
      try {
        await api.deleteApproval(id);
        await refreshLive?.();
      } catch (err: any) {
        setActionError(err?.message || "Failed to delete approval.");
      }
    }
  };

  // AST dangerous token highlighting
  const renderHighlightedCommand = (command: string) => {
    const dangerousPatterns = [
      "-rf",
      "--no-preserve-root",
      "rm",
      "sudo",
      "systemctl restart",
      "kill -9",
      "format",
      "mkfs",
      "dd if=",
      "chmod 777",
    ];

    const parts = command.split(" ");
    return (
      <div className="flex flex-wrap gap-1 font-mono text-sm leading-relaxed">
        {parts.map((word, i) => {
          const isDanger = dangerousPatterns.some(
            (p) => word === p || word.includes(p)
          );
          return (
            <span
              key={i}
              className={`px-1 rounded ${
                isDanger
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold"
                  : "text-[var(--product-text-secondary)]"
              }`}
            >
              {word}
            </span>
          );
        })}
      </div>
    );
  };

  const pendingCount = approvals.filter((a) => a.status === "pending").length;

  const visibleApprovals = queueFilter === "pending"
    ? approvals.filter((a) => a.status === "pending")
    : approvals;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-[var(--product-text)]">Human approvals</h1>
          <ProductModePill live={isLive} detail={`${pendingCount} pending`} />
        </div>
        <ProductSegmented
          ariaLabel="Approval queue filter"
          value={queueFilter}
          onChange={setQueueFilter}
          options={[
            { id: "all", label: `All (${approvals.length})` },
            { id: "pending", label: `Pending (${pendingCount})` },
          ]}
        />
      </header>

      {/* Main Split: Left Urgent Queue, Right Approval Inspector */}
      <JXGrid columns={12} gap="lg">
        {/* Left: Urgent Approval Queue */}
        <JXGridItem colSpan={4}>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono font-semibold text-[var(--product-text-tertiary)] uppercase tracking-wider">
                Urgent Approvals Queue
              </span>
              <ProductStatusDot
                status={pendingCount > 0 ? "warn" : "online"}
                pulse={pendingCount > 0}
                label={`${pendingCount} pending`}
              />
            </div>

            <div className="space-y-3">
              {visibleApprovals.map((req) => {
                const isSelected = req.id === selectedId;
                const isPending = req.status === "pending";

                return (
                  <div
                    key={req.id}
                    onClick={() => setSelectedId(req.id)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? "bg-[var(--product-surface)] border-indigo-500 shadow-lg shadow-indigo-500/10"
                        : "bg-[var(--product-canvas)]/60 border-[var(--product-line)] hover:border-[var(--product-line)]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[var(--product-text)] text-sm">
                          {req.id}
                        </span>
                        <span
                          className={`font-mono text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold ${
                            req.riskTier === "tier4_kernel"
                              ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                              : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                          }`}
                        >
                          {req.riskTier === "tier4_kernel" ? "Tier 4 • Kernel" : "Tier 3 • Shell"}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-mono text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                            req.status === "approved"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : req.status === "denied"
                              ? "bg-rose-500/20 text-rose-300"
                              : "bg-amber-500/20 text-amber-300"
                          }`}
                        >
                          {req.status}
                        </span>
                        {isLive && (
                          <button
                            type="button"
                            onClick={(e) => void handleDeleteApproval(req.id, e)}
                            title="Delete approval record"
                            className="p-1 rounded hover:bg-rose-500/20 text-[var(--product-text-dim)] hover:text-rose-300"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="text-xs font-semibold text-[var(--product-text-secondary)] truncate mb-1">
                      {req.reason}
                    </div>

                    <div className="text-[11px] font-mono text-[var(--product-text-tertiary)] space-y-1">
                      <div className="flex items-center gap-1.5 truncate">
                        <Bot className="w-3.5 h-3.5 text-[var(--product-text-dim)]" />
                        <span>{req.requester}</span>
                      </div>
                      <div className="flex items-center gap-1.5 truncate">
                        <Server className="w-3.5 h-3.5 text-[var(--product-text-dim)]" />
                        <span>{req.deviceHostname}</span>
                      </div>
                    </div>

                    {isPending && (
                      <div className="mt-3 pt-2.5 border-t border-[var(--product-line)]/80 flex items-center justify-between text-[11px] font-mono">
                        <span className="text-[var(--product-text-tertiary)]">Auto-kill SLA</span>
                        <span className={`font-bold flex items-center gap-1 ${req.expiresAt ? "text-amber-400" : "text-[var(--product-text-tertiary)]"}`}>
                          <Clock className="w-3 h-3" />
                          {formatCountdown(computeRemaining(req.expiresAt))}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </JXGridItem>

        {/* Right: Approval Inspector & AST Diff Viewport */}
        <JXGridItem colSpan={8}>
          {activeApproval ? (
            <div className="space-y-4">
              {/* Header Box */}
              <JXCard className="bg-[var(--product-surface)]/60 border-[var(--product-line)]">
                <JXCardHeader
                  title={`Approval Inspector — ${activeApproval.id}`}
                  subheader={`Host: ${activeApproval.deviceHostname} • Requester: ${activeApproval.requester}`}
                  icon={<ShieldAlert className="w-5 h-5 text-amber-400" />}
                />
                <JXCardContent>
                  <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-[var(--product-canvas)] border border-[var(--product-line)] text-xs font-mono">
                    <div>
                      <span className="text-[var(--product-text-tertiary)] uppercase tracking-wider block text-[10px]">
                        Target Host Node
                      </span>
                      <span className="font-semibold text-[var(--product-text-secondary)]">
                        {activeApproval.deviceHostname}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--product-text-tertiary)] uppercase tracking-wider block text-[10px]">
                        Permission Tier
                      </span>
                      <span className="font-semibold text-amber-400">
                        {activeApproval.riskTier}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--product-text-tertiary)] uppercase tracking-wider block text-[10px]">
                        SLA remaining
                      </span>
                      <span className="text-[var(--product-text-secondary)] truncate block">
                        {formatCountdown(computeRemaining(activeApproval.expiresAt))}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-[11px] text-[var(--product-text-tertiary)]">
                    Checklist items are operator attestation only — they are not validated by the control plane.
                  </p>
                </JXCardContent>
              </JXCard>

              {/* Exact AST Command Diff with Dangerous Parameter Highlighting */}
              <JXCard className="bg-[var(--product-surface)]/60 border-[var(--product-line)]">
                <JXCardHeader
                  title="Command changes"
                  icon={<FileCode className="w-4 h-4 text-indigo-400" />}
                />
                <JXCardContent>
                  <div className="space-y-3">
                    <div className="p-4 rounded-xl bg-[var(--product-canvas)] border border-[var(--product-line)]">
                      <span className="text-[10px] font-mono text-[var(--product-text-tertiary)] uppercase tracking-wider block mb-2">
                        Requested Command String
                      </span>
                      {renderHighlightedCommand(activeApproval.command)}
                    </div>

                    {(() => {
                      const tokens = dangerousTokensFor(
                        activeApproval.command,
                        activeApproval.argsDiff?.dangerousTokens
                      );
                      if (!tokens.length && !activeApproval.argsDiff?.proposed) return null;
                      return (
                        <div className="p-3 rounded-lg bg-[var(--product-canvas)]/60 border border-[var(--product-line)]/80 space-y-1.5 text-xs font-mono">
                          {tokens.length > 0 && (
                            <div className="text-[var(--product-text-tertiary)]">
                              Flagged tokens:{" "}
                              <span className="text-rose-400 font-bold">{tokens.join(", ")}</span>
                            </div>
                          )}
                          {activeApproval.argsDiff?.proposed && (
                            <div className="text-[var(--product-text-tertiary)]">
                              Parsed target scope:{" "}
                              <span className="text-[var(--product-text-secondary)] font-semibold">
                                {activeApproval.argsDiff.proposed}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </JXCardContent>
              </JXCard>

              {activeApproval.screenshotUrl ? (
                <JXCard className="bg-[var(--product-surface)]/60 border-[var(--product-line)]">
                  <JXCardHeader
                    title="Desktop context"
                    icon={<Eye className="w-4 h-4 text-cyan-400" />}
                  />
                  <JXCardContent>
                    <img
                      src={activeApproval.screenshotUrl}
                      alt={`Desktop context for ${activeApproval.deviceHostname}`}
                      className="w-full max-h-64 rounded-xl border border-[var(--product-line)] object-contain bg-[var(--product-canvas)]"
                    />
                  </JXCardContent>
                </JXCard>
              ) : (
                <ProductNotice tone="info">
                  No desktop screenshot attached to this approval. Review the command string and host carefully before authorizing.
                </ProductNotice>
              )}

              {/* Mandatory Safety Checklist & Decision Action Ribbon */}
              {activeApproval.status === "pending" && (
                <JXCard className="bg-[var(--product-surface)]/60 border-[var(--product-line)]">
                  <JXCardHeader
                    title="Safety checklist"
                    subheader="Operator attestation — complete all checks before approving."
                    icon={<CheckSquare className="w-4 h-4 text-emerald-400" />}
                  />
                  <JXCardContent>
                    <div className="space-y-4">
                      <div className="space-y-2 p-3 rounded-xl bg-[var(--product-canvas)] border border-[var(--product-line)] text-xs">
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checklist.scopeConfirmed}
                            onChange={(e) =>
                              setChecklist((c) => ({ ...c, scopeConfirmed: e.target.checked }))
                            }
                            className="w-4 h-4 rounded border-[var(--product-line)] bg-[var(--product-surface)] accent-emerald-500 cursor-pointer"
                          />
                          <span className="text-[var(--product-text-secondary)]">
                            Verified target hostname matches intended operational scope
                          </span>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checklist.networkChecked}
                            onChange={(e) =>
                              setChecklist((c) => ({ ...c, networkChecked: e.target.checked }))
                            }
                            className="w-4 h-4 rounded border-[var(--product-line)] bg-[var(--product-surface)] accent-emerald-500 cursor-pointer"
                          />
                          <span className="text-[var(--product-text-secondary)]">
                            Confirmed payload contains no unauthorized external network transfers
                          </span>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checklist.blastRadiusEvaluated}
                            onChange={(e) =>
                              setChecklist((c) => ({ ...c, blastRadiusEvaluated: e.target.checked }))
                            }
                            className="w-4 h-4 rounded border-[var(--product-line)] bg-[var(--product-surface)] accent-emerald-500 cursor-pointer"
                          />
                          <span className="text-[var(--product-text-secondary)]">
                            Evaluated blast radius of destructive command and confirmed rollback strategy
                          </span>
                        </label>
                      </div>

                      {actionError && (
                        <ProductNotice tone="error">{actionError}</ProductNotice>
                      )}

                      {rePlanMessage && (
                        <ProductNotice tone="info">{rePlanMessage}</ProductNotice>
                      )}

                      {/* Action CTAs */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <JXButton
                            variant="soft"
                            color="error"
                            size="md"
                            onClick={() => setShowDenyModal(true)}
                            startIcon={<XCircle className="w-4 h-4" />}
                            className="bg-rose-500/10 text-rose-300 border border-rose-500/30"
                          >
                            Deny Invocation
                          </JXButton>
                          <JXButton
                            variant="outlined"
                            color="neutral"
                            size="md"
                            onClick={handleRequestRePlan}
                            startIcon={<RotateCcw className="w-4 h-4" />}
                          >
                            Request Re-Plan
                          </JXButton>
                        </div>

                        {allChecklistSatisfied ? (
                          <ProductGlass className="p-2">
                            <SlideToAction
                              label="Slide to authorize"
                              completedText="Authorized"
                              onComplete={() => { void handleAuthorize(); }}
                            />
                          </ProductGlass>
                        ) : (
                          <JXButton
                            variant="contained"
                            color="success"
                            size="md"
                            disabled
                            startIcon={<CheckCircle2 className="w-4 h-4" />}
                            className="bg-emerald-600 text-white font-semibold"
                          >
                            Complete checklist
                          </JXButton>
                        )}
                      </div>
                    </div>
                  </JXCardContent>
                </JXCard>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-[var(--product-text-tertiary)] font-mono text-xs">
              No approval selected.
            </div>
          )}
        </JXGridItem>
      </JXGrid>

      {/* Historical Decision Archive Table */}
      <JXCard className="bg-[var(--product-surface)]/60 border-[var(--product-line)]">
        <JXCardHeader
          title="Decision history"
          icon={<History className="w-5 h-5 text-indigo-400" />}
        />
        <JXCardContent>
          <div ref={tableScrollRef} tabIndex={0} role="region" aria-label="Approval decision history" className="overflow-x-auto scroll-shadow rounded-xl border border-[var(--product-line)]" data-scroll-left={scrollShadow.left} data-scroll-right={scrollShadow.right}>
            <table className="product-table-sticky-first w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[var(--product-canvas)] border-b border-[var(--product-line)] text-[var(--product-text-tertiary)] font-mono uppercase">
                  <th className="p-3">Request ID</th>
                  <th className="p-3">Command</th>
                  <th className="p-3">Deciding Operator</th>
                  <th className="p-3">Verdict</th>
                  <th className="p-3">Timestamp (UTC)</th>
                  <th className="p-3">Justification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {effectiveHistoryRecords.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-[var(--product-text-tertiary)] font-sans">
                      No approval decisions recorded yet.
                    </td>
                  </tr>
                ) : (
                  effectiveHistoryRecords.map((rec) => (
                    <tr key={rec.id} className="hover:bg-[var(--product-canvas)]/40 transition-colors">
                      <td className="p-3 font-semibold text-[var(--product-text-secondary)]">{rec.id}</td>
                      <td className="p-3 text-[var(--product-text-secondary)]">
                        <code>{rec.command}</code>
                      </td>
                      <td className="p-3 text-[var(--product-text-tertiary)]">{rec.decidedBy}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                            rec.verdict === "approved"
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                              : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                          }`}
                        >
                          {rec.verdict}
                        </span>
                      </td>
                      <td className="p-3 text-[var(--product-text-tertiary)]">{rec.timestamp}</td>
                      <td className="p-3 text-[var(--product-text-secondary)] font-sans">{rec.justification}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </JXCardContent>
      </JXCard>

      {/* Mandatory Deny Reason Modal */}
      <AnimatePresence>
        {showDenyModal && (
          <GlassModal onClose={() => setShowDenyModal(false)} title={isLive ? "Deny approval request" : "Deny sample request"}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[var(--product-line)] pb-3">
                <div className="flex items-center gap-2 text-rose-400 font-bold">
                  <XCircle className="w-5 h-5" />
                  <span>Deny Request #{activeApproval?.id}</span>
                </div>
                <button
                  type="button"
                  aria-label="Close denial"
                  onClick={() => setShowDenyModal(false)}
                  className="text-[var(--product-text-tertiary)] hover:text-[var(--product-text-secondary)]"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2 text-xs">
                <label className="block text-[var(--product-text-secondary)] font-semibold font-mono">
                  Mandatory Rejection Reason:
                </label>
                <textarea
                  rows={4}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Explain why this invocation was rejected. This text will be returned to the autonomous agent..."
                  className="w-full p-3 rounded-lg bg-[var(--product-canvas)] border border-[var(--product-line)] font-mono text-xs text-[var(--product-text-secondary)] focus:outline-none resize-none"
                />
              </div>

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <JXButton
                  variant="outlined"
                  color="neutral"
                  size="sm"
                  onClick={() => setShowDenyModal(false)}
                >
                  Cancel
                </JXButton>
                {rejectionReason.trim() ? (
                  <HoldToConfirmButton
                    label="Hold to deny"
                    tone="danger"
                    variant="solid"
                    holdDurationMs={isLive ? 900 : 600}
                    onConfirm={() => { void handleDeny(); }}
                  />
                ) : (
                  <JXButton variant="contained" color="error" size="sm" disabled>
                    Enter a reason
                  </JXButton>
                )}
              </div>
            </motion.div>
          </GlassModal>
        )}
      </AnimatePresence>
    </div>
  );
};

export default HumanApprovalsView;

