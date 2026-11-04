/**
 * Append-Only Audit Trail & Merkle Root Verifier (Screen 12)
 * Reconstructed with pure JXUI primitives, motion/react, and lucide-react.
 * ZERO inline styles. ZERO custom CSS.
 */

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  GlassModal,
  JXCard,
  JXCardHeader,
  JXCardContent,
  JXButton,
  JXBadge,
  JXSelect,
  JXTextField,
  JXGrid,
  JXGridItem,
} from "../ui";
import {
  ShieldCheck,
  FileCheck,
  Download,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileSpreadsheet,
  FileJson,
  FileText,
  Clock,
  Server,
  User,
  Hash,
  ExternalLink,
  ChevronDown,
} from "lucide-react";
import { useDashboardStore } from "../state/dashboardStore";
import type { AuditEvent } from "../types/dashboard";

export const AuditTrailView: React.FC = () => {
  const auditEvents = useDashboardStore((s) => s.auditEvents);

  // Cryptographic Merkle Root state
  const merkleRoot = "0x7fa281b94d27e8a10459c03bfe82910fa321";
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verificationProof, setVerificationProof] = useState<{
    verified: boolean;
    blocksChecked: number;
    latencyMs: number;
    root: string;
  } | null>(null);

  // Filters state
  const [actorFilter, setActorFilter] = useState<string>("all");
  const [verdictFilter, setVerdictFilter] = useState<string>("all");
  const [hostSearch, setHostSearch] = useState<string>("");
  const [hashSearch, setHashSearch] = useState<string>("");

  // Cryptographic Verification Modal state
  const [selectedProofEvent, setSelectedProofEvent] = useState<AuditEvent | null>(null);

  // Exporter dropdown menu
  const [exportMenuOpen, setExportMenuOpen] = useState<boolean>(false);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);

  // Filtered ledger records
  const filteredRecords = useMemo(() => {
    return auditEvents.filter((ev) => {
      if (actorFilter !== "all" && !ev.actor.toLowerCase().includes(actorFilter.toLowerCase())) {
        return false;
      }
      if (verdictFilter !== "all" && ev.governanceVerdict !== verdictFilter) {
        return false;
      }
      if (hostSearch && !ev.targetHost.toLowerCase().includes(hostSearch.toLowerCase())) {
        return false;
      }
      if (hashSearch && !ev.sha256Hash.toLowerCase().includes(hashSearch.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [auditEvents, actorFilter, verdictFilter, hostSearch, hashSearch]);

  const handleVerifyIntegrity = () => {
    setIsVerifying(true);
    setTimeout(() => {
      setIsVerifying(false);
      setVerificationProof({
        verified: true,
        blocksChecked: 14920,
        latencyMs: 38,
        root: merkleRoot,
      });
    }, 700);
  };

  const handleExport = (format: "csv" | "jsonld") => {
    if (filteredRecords.length === 0) return;

    if (format === "csv") {
      const header = "Block,Timestamp,Actor,Action,TargetHost,Verdict,Hash\n";
      const rows = filteredRecords
        .map(
          (r) =>
            `${r.blockNumber},${r.timestamp},${r.actor},${r.action},${r.targetHost},${r.governanceVerdict},${r.sha256Hash}`
        )
        .join("\n");
      const blob = new Blob([header + rows], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-ledger-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (format === "jsonld") {
      const payload = {
        "@context": "https://schema.org",
        type: "AuditReport",
        merkleRoot,
        totalRecords: filteredRecords.length,
        timestamp: new Date().toISOString(),
        blocks: filteredRecords,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/ld+json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-report-${Date.now()}.jsonld`;
      a.click();
      URL.revokeObjectURL(url);
    }

    setExportMenuOpen(false);
    setDownloadNotice(`Exported ${filteredRecords.length} records in ${format.toUpperCase()} format.`);
    setTimeout(() => setDownloadNotice(null), 3500);
  };

  return (
    <div className="space-y-4">
      {/* Cryptographic Merkle Root Header & Verification Action */}
      <JXCard className="bg-slate-900/60 border-slate-800">
        <div className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <JXButton
              variant="contained"
              color="primary"
              size="md"
              loading={isVerifying}
              onClick={handleVerifyIntegrity}
              startIcon={<FileCheck className="w-4 h-4" />}
            >
              Preview verification
            </JXButton>

            {/* Multi-Format Exporter Dropdown */}
            <div className="relative">
              <JXButton
                variant="outlined"
                color="neutral"
                size="md"
                disabled={filteredRecords.length === 0}
                onClick={() => setExportMenuOpen(!exportMenuOpen)}
                startIcon={<Download className="w-4 h-4" />}
                endIcon={<ChevronDown className="w-3.5 h-3.5" />}
              >
                Export
              </JXButton>

              {exportMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl bg-slate-900 border border-slate-800 p-1.5 shadow-2xl z-30 space-y-1 font-mono text-xs">
                  <button
                    type="button"
                    onClick={() => handleExport("csv")}
                    className="w-full flex items-center gap-2.5 p-2 rounded-lg text-slate-200 hover:bg-slate-800 text-left transition-colors"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                    <span>CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport("jsonld")}
                    className="w-full flex items-center gap-2.5 p-2 rounded-lg text-slate-200 hover:bg-slate-800 text-left transition-colors"
                  >
                    <FileJson className="w-4 h-4 text-indigo-400" />
                    <span>JSON-LD</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {verificationProof && (
          <div className="px-5 pb-4">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs font-mono text-emerald-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>
                  Sample verification complete: {verificationProof.blocksChecked} blocks.
                </span>
              </div>
              <span className="text-slate-400">Validated in {verificationProof.latencyMs}ms</span>
            </div>
          </div>
        )}

        {downloadNotice && (
          <div className="px-5 pb-4">
            <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-xs font-mono text-indigo-300">
              {downloadNotice}
            </div>
          </div>
        )}
      </JXCard>

      {/* Filter Ribbon & Immutable Data Grid */}
      <JXCard className="bg-slate-900/60 border-slate-800">
        <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2 flex-wrap">
            <select
              aria-label="Filter audit verdicts"
              value={verdictFilter}
              onChange={(e) => setVerdictFilter(e.target.value)}
              className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none"
            >
              <option value="all">All Verdicts</option>
              <option value="auto_allowed">Auto-Allowed</option>
              <option value="human_approved">Human-Approved</option>
              <option value="denied">Denied</option>
            </select>

            <select
              aria-label="Filter audit actors"
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
              className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none"
            >
              <option value="all">All Actors</option>
              <option value="claude">Claude Agent</option>
              <option value="sarah">Operator Sarah J.</option>
              <option value="system">System Daemon</option>
            </select>

            <input
              type="text"
              placeholder="Search target host..."
              value={hostSearch}
              onChange={(e) => setHostSearch(e.target.value)}
              className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none"
            />

            <input
              type="text"
              placeholder="Filter by hash..."
              value={hashSearch}
              onChange={(e) => setHashSearch(e.target.value)}
              className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none"
            />
          </div>

          <span className="text-slate-400">
            Showing <strong className="text-slate-200">{filteredRecords.length}</strong> immutable records
          </span>
        </div>

        <JXCardContent>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-mono uppercase">
                  <th className="p-3">Block #</th>
                  <th className="p-3">RFC 3339 Timestamp (UTC)</th>
                  <th className="p-3">Actor Identity</th>
                  <th className="p-3">Action / Tool</th>
                  <th className="p-3">Target Host</th>
                  <th className="p-3">Verdict</th>
                  <th className="p-3">SHA-256 Digest</th>
                  <th className="p-3 text-right">Verification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredRecords.map((rec) => (
                  <tr key={rec.blockNumber} className="hover:bg-slate-950/40 transition-colors">
                    <td className="p-3 font-bold text-indigo-400">
                      #{String(rec.blockNumber).padStart(8, "0")}
                    </td>
                    <td className="p-3 text-slate-300">{rec.timestamp}</td>
                    <td className="p-3 text-slate-200">{rec.actor}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-200">
                        {rec.action}
                      </span>
                    </td>
                    <td className="p-3 text-slate-300">{rec.targetHost}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                          rec.governanceVerdict === "human_approved"
                            ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                            : rec.governanceVerdict === "auto_allowed"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                        }`}
                      >
                        {rec.governanceVerdict}
                      </span>
                    </td>
                    <td className="p-3 text-slate-400 text-[11px] truncate max-w-xs">
                      {rec.sha256Hash}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedProofEvent(rec)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition-colors"
                      >
                        Verify Proof
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </JXCardContent>
      </JXCard>

      {/* Cryptographic Verification Modal */}
      <AnimatePresence>
        {selectedProofEvent && (
          <GlassModal onClose={() => setSelectedProofEvent(null)} title="Sample audit proof">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2 text-emerald-400 font-bold">
                  <ShieldCheck className="w-5 h-5" />
                  <span>Merkle Cryptographic Chain Proof</span>
                </div>
                <button
                  type="button"
                  aria-label="Close audit proof"
                  onClick={() => setSelectedProofEvent(null)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs font-mono">
                <div>
                  <span className="text-slate-400 block mb-1">Block Sequence ID:</span>
                  <div className="p-2 rounded bg-slate-950 text-indigo-400 font-bold">
                    #{selectedProofEvent.blockNumber} (RFC 3339: {selectedProofEvent.timestamp})
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 block mb-1">Current Block Hash (Leaf Node):</span>
                  <div className="p-2 rounded bg-slate-950 text-emerald-300 break-all font-mono">
                    {selectedProofEvent.sha256Hash}
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 block mb-1">Previous Block Hash Link:</span>
                  <div className="p-2 rounded bg-slate-950 text-slate-300 break-all font-mono">
                    {selectedProofEvent.prevHash || "0x0000000000000000000000000000000000000000 (Genesis Root)"}
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 block mb-1">Payload Summary:</span>
                  <div className="p-2.5 rounded bg-slate-950 text-slate-300">
                    {selectedProofEvent.payloadSummary}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Cryptographic hash linkage matches Merkle Root branch 0x7fa281b94d.</span>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <JXButton
                  variant="outlined"
                  color="neutral"
                  size="sm"
                  onClick={() => setSelectedProofEvent(null)}
                >
                  Close Proof
                </JXButton>
              </div>
            </motion.div>
          </GlassModal>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AuditTrailView;

