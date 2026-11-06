import { SimulatedNotice } from "../shell/SimulatedNotice";
/**
 * AI Bridge Enterprise Dashboard — Autonomous Workflows & Multi-Turn Plans (Screen 7)
 * Multi-turn DAG pipeline stepper with AI reasoning thought trace, OCR verification,
 * step inspection, workflow controls (Pause/Resume/Re-Plan/Abort), and workflow builder modal.
 * Strict JXUI Primitives & Lucide Icons. ZERO inline styles.
 */

import React, { useState, useMemo } from "react";
import {
  JXBox,
  JXStack,
  JXGrid,
  JXGridItem,
  JXCard,
  JXCardHeader,
  JXCardContent,
  JXBadge,
  JXButton,
  GlassModal,
} from "../ui";
import {
  Workflow,
  CheckCircle2,
  Clock,
  Play,
  Pause,
  RotateCcw,
  StopCircle,
  Plus,
  Search,
  Filter,
  FileCode,
  Copy,
  Check,
  Shield,
  Eye,
  Crosshair,
  Bot,
  Terminal,
  Activity,
  Layers,
  Sparkles,
  AlertTriangle,
  Lock,
  ArrowRight,
  RefreshCw,
  X,
} from "lucide-react";
import { useDashboardStore } from "../state/dashboardStore";
import type { WorkflowPlan, WorkflowStep } from "../types/dashboard";

interface PlanItem {
  id: string;
  title: string;
  code: string;
  cadence: string;
  targetFleet: string;
  status: "running" | "succeeded" | "idle" | "awaiting_gate";
  currentStep: number;
  totalSteps: number;
  description: string;
  successRate: string;
  lastRan: string;
  steps: {
    number: number;
    name: string;
    tool: string;
    status: "completed" | "running" | "pending" | "failed";
    duration: string;
    reasoning: string;
    boundsDesc: string;
    payload: Record<string, unknown>;
  }[];
}

const PLANS_DATA: PlanItem[] = [
  {
    id: "WF-9841",
    title: "Fleet-wide Zero-Trust Enclave Attestation",
    code: "Multi-Node DAG",
    cadence: "Every 6 hours",
    targetFleet: "#edge-enclaves (12 nodes)",
    status: "running",
    currentStep: 3,
    totalSteps: 4,
    description: "Performs TPM 2.0 PCR-7 visual window detection via Claude Vision, validates token cryptographically across edge fleet.",
    successRate: "99.8%",
    lastRan: "Running now • 840ms",
    steps: [
      {
        number: 1,
        name: "Baseline Capture",
        tool: "desktop.capture_screen",
        status: "completed",
        duration: "420ms",
        reasoning: "Captured high-res desktop frame buffer at 3840x2160 native resolution with active window metadata.",
        boundsDesc: "[X: 0, Y: 0, W: 3840, H: 2160]",
        payload: { display_index: 0, format: "png", include_som: true },
      },
      {
        number: 2,
        name: "Vision AI OCR Checkpoint",
        tool: "claude-3-5-sonnet.vision",
        status: "completed",
        duration: "1,120ms",
        reasoning: "OCR Pass: Scanning display buffer. Pattern matching TPM security policy dialog. Result: String match 'TPM 2.0 PCR-7 Status: ACTIVE' detected at coords (1420, 840). Confidence 99.8%. Checkpoint satisfied.",
        boundsDesc: "[X: 1420, Y: 840, W: 310, H: 95]",
        payload: {
          target_surface: "system_security_enclave",
          expected_pcr_register: 7,
          min_confidence_score: 0.95,
          capture_mode: "lossless_rgb_rect",
        },
      },
      {
        number: 3,
        name: "Cryptographic Exchange",
        tool: "enclave.verify_token",
        status: "running",
        duration: "840ms...",
        reasoning: "Performing ephemeral ECDSA signature exchange with hardware TPM enclave on 12 distributed edge nodes.",
        boundsDesc: "[X: 800, Y: 600, W: 400, H: 120]",
        payload: { algorithm: "ECDSA_P256", token_nonce: "7f83b1657ff1709bcfa4" },
      },
      {
        number: 4,
        name: "Audit Ledger Commit",
        tool: "ledger.append_hash",
        status: "pending",
        duration: "--",
        reasoning: "Awaiting turn 3 signature quorum before appending cryptographic block to Merkle root tree.",
        boundsDesc: "[X: 0, Y: 0, W: 0, H: 0]",
        payload: { tree: "merkle-core-2026", auto_sync: true },
      },
    ],
  },
  {
    id: "WF-1092",
    title: "Automated Checkout Flow Remediation",
    code: "Multi-Turn Plan",
    cadence: "Continuous Watch",
    targetFleet: "srv-us-east-412",
    status: "running",
    currentStep: 3,
    totalSteps: 4,
    description: "Multi-turn visual plan inspecting checkout form, OCR validation, and clicking submit button.",
    successRate: "99.4%",
    lastRan: "Running now • 320ms",
    steps: [
      {
        number: 1,
        name: "Observation Phase",
        tool: "desktop.capture_screen",
        status: "completed",
        duration: "320ms",
        reasoning: "Captured high-res viewport to locate payment confirmation button.",
        boundsDesc: "[X: 100, Y: 100, W: 1200, H: 800]",
        payload: { resolution: "native" },
      },
      {
        number: 2,
        name: "Verification Checkpoint",
        tool: "vision.ocr_screen",
        status: "completed",
        duration: "410ms",
        reasoning: "Identified OCR text 'Confirm Order' at coordinate bounding box [740, 480, 880, 520] with 98.4% confidence.",
        boundsDesc: "[X: 740, Y: 480, W: 140, H: 40]",
        payload: { pattern: "Confirm Order" },
      },
      {
        number: 3,
        name: "Conditional Branch Execution",
        tool: "desktop.click_coordinate",
        status: "running",
        duration: "180ms...",
        reasoning: "Targeting center coordinate of verified confirmation button [X: 810, Y: 500].",
        boundsDesc: "[X: 810, Y: 500, W: 20, H: 20]",
        payload: { x: 810, y: 500, button: "left" },
      },
      {
        number: 4,
        name: "Ledger Commitment",
        tool: "audit.commit_transaction",
        status: "pending",
        duration: "--",
        reasoning: "Awaiting step 3 completion before signing transaction hash into immutable ledger.",
        boundsDesc: "[X: 0, Y: 0, W: 0, H: 0]",
        payload: { ledger: "merkle-core" },
      },
    ],
  },
  {
    id: "WF-9838",
    title: "Automated UI Regression & Visual Checkpoint",
    code: "6 Steps",
    cadence: "Git-Push Trigger",
    targetFleet: "#studio-mac (4 nodes)",
    status: "succeeded",
    currentStep: 6,
    totalSteps: 6,
    description: "Runs full visual snapshot comparison against baseline golden images on macOS builder cluster.",
    successRate: "98.9%",
    lastRan: "Ran 12m ago",
    steps: [
      {
        number: 1,
        name: "Git Fetch & Clean",
        tool: "shell.exec",
        status: "completed",
        duration: "840ms",
        reasoning: "Checked out latest release commit on builder cluster.",
        boundsDesc: "[X: 0, Y: 0, W: 0, H: 0]",
        payload: { branch: "main", depth: 1 },
      },
      {
        number: 2,
        name: "Launch Test Shell",
        tool: "desktop.launch_app",
        status: "completed",
        duration: "1,200ms",
        reasoning: "Bootstrapped dashboard Electron harness in headless mode.",
        boundsDesc: "[X: 0, Y: 0, W: 1920, H: 1080]",
        payload: { app: "ai-bridge-dashboard" },
      },
    ],
  },
  {
    id: "WF-9830",
    title: "Incident Self-Healing: Service Auto-Recovery",
    code: "3 Steps",
    cadence: "Event: watchdog.sigkill",
    targetFleet: "#all-nodes (40 nodes)",
    status: "idle",
    currentStep: 0,
    totalSteps: 3,
    description: "Monitors agent daemon heartbeats; automatically restarts systemd units upon panic or SIGSEGV.",
    successRate: "100%",
    lastRan: "Last: 2d ago",
    steps: [
      {
        number: 1,
        name: "Process Check",
        tool: "process.list",
        status: "pending",
        duration: "--",
        reasoning: "Awaiting panic watchdog trigger event.",
        boundsDesc: "[X: 0, Y: 0, W: 0, H: 0]",
        payload: { filter: "ai-bridge-agent" },
      },
    ],
  },
  {
    id: "WF-9824",
    title: "Secure Host Key Rotation & CA Verification",
    code: "5 Steps • Tier-3 Human Gate",
    cadence: "Bi-weekly",
    targetFleet: "#core-gateways (2 nodes)",
    status: "awaiting_gate",
    currentStep: 4,
    totalSteps: 5,
    description: "Rotates mTLS TLS 1.3 certificate authorities and generates new ephemeral token secret.",
    successRate: "Paused at Step 4",
    lastRan: "Expires in 42m",
    steps: [
      {
        number: 1,
        name: "Generate Keypair",
        tool: "crypto.gen_key",
        status: "completed",
        duration: "210ms",
        reasoning: "Generated Ed25519 root keypair in TPM.",
        boundsDesc: "[X: 0, Y: 0, W: 0, H: 0]",
        payload: { key_type: "ed25519" },
      },
      {
        number: 4,
        name: "Human Gate Approval",
        tool: "human.gate_approve",
        status: "running",
        duration: "Awaiting review",
        reasoning: "Tier-3 sensitive operation requires mandatory SecOps review before rotating CA root.",
        boundsDesc: "[X: 0, Y: 0, W: 0, H: 0]",
        payload: { approver_role: "Lead SecOps" },
      },
    ],
  },
];

export const WorkflowsView: React.FC = () => {
  const devices = useDashboardStore((s) => s.devices);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("WF-9841");
  const [selectedStepNumber, setSelectedStepNumber] = useState<number>(2);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [copiedPayload, setCopiedPayload] = useState<boolean>(false);

  // Workflow builder modal state
  const [builderOpen, setBuilderOpen] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>("");
  const [newDescription, setNewDescription] = useState<string>("");
  const [newTargetNode, setNewTargetNode] = useState<string>("srv-us-east-412");
  const [newFallback, setNewFallback] = useState<string>("stop");
  const [newRequireGate, setNewRequireGate] = useState<boolean>(false);
  const [builderSteps, setBuilderSteps] = useState<Array<{ name: string; tool: string }>>([
    { name: "Observation Phase", tool: "desktop.capture_screen" },
    { name: "OCR Verification", tool: "vision.ocr_screen" },
  ]);

  const activePlan = useMemo(() => {
    return PLANS_DATA.find((p) => p.id === selectedPlanId) || PLANS_DATA[0];
  }, [selectedPlanId]);

  const activeStep = useMemo(() => {
    return activePlan.steps.find((s) => s.number === selectedStepNumber) || activePlan.steps[0] || {
      number: 1,
      name: "Step",
      tool: "tool",
      status: "completed" as const,
      duration: "0ms",
      reasoning: "No step data available.",
      boundsDesc: "N/A",
      payload: {},
    };
  }, [activePlan, selectedStepNumber]);

  // Filter plans list
  const filteredPlans = useMemo(() => {
    return PLANS_DATA.filter((p) => {
      const matchCat =
        filterCategory === "all" ||
        (filterCategory === "active" && p.status === "running") ||
        (filterCategory === "scheduled" && p.cadence.includes("Every")) ||
        (filterCategory === "drafts" && p.status === "idle");
      const matchQuery =
        !searchQuery ||
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.targetFleet.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchQuery;
    });
  }, [filterCategory, searchQuery]);

  const togglePauseWorkflow = () => {
    setIsPaused(!isPaused);
    setNotice(!isPaused ? `Paused workflow execution for ${activePlan.id}` : `Resumed workflow execution for ${activePlan.id}`);
    setTimeout(() => setNotice(null), 3000);
  };

  const forceReplan = () => {
    setNotice(`Triggered forced re-planning for ${activePlan.id}. Regenerating multi-turn DAG...`);
    setTimeout(() => setNotice(null), 3500);
  };

  const abortPlan = () => {
    setNotice(`Aborted workflow ${activePlan.id}. Transaction rolled back and audited.`);
    setTimeout(() => setNotice(null), 3500);
  };

  const copyStepPayload = () => {
    navigator.clipboard?.writeText(JSON.stringify(activeStep.payload, null, 2));
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  const handleAddBuilderStep = () => {
    setBuilderSteps((prev) => [
      ...prev,
      { name: `Step ${prev.length + 1}`, tool: "desktop.click_coordinate" },
    ]);
  };

  const handleSaveNewWorkflow = () => {
    if (!newTitle.trim()) return;
    setBuilderOpen(false);
    setNotice(`Created new workflow: ${newTitle} (${builderSteps.length} steps)`);
    setTimeout(() => setNotice(null), 3500);
  };

  return (
    <div className="space-y-4">
      <SimulatedNotice feature="The workflow planner" />
      {/* Top Header & Breadcrumb Ribbon */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800/60">
        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setBuilderOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-2 transition-all shadow-md shadow-indigo-600/25 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>New workflow</span>
          </button>
        </div>
      </div>

      {notice && (
        <div role="status" className="p-3 rounded-xl bg-indigo-950/70 border border-indigo-500/40 text-xs font-mono text-indigo-300 flex items-center justify-between">
          <span>{notice}</span>
          <button type="button" aria-label="Dismiss notification" onClick={() => setNotice(null)} className="text-slate-400 hover:text-slate-200">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main 2-Column Split: Directory on Left (4 cols), Stepper & Details on Right (8 cols) */}
      <JXGrid columns={12} gap="lg">
        {/* LEFT COLUMN: Workflow Directory (4 cols) */}
        <JXGridItem colSpan={4}>
          <JXCard className="bg-slate-900/70 border-slate-800 shadow-xl">
            <JXCardHeader
              title="Workflows"
              icon={<Layers className="w-4 h-4 text-indigo-400" />}
            />
            <JXCardContent>
              <div className="space-y-3">
                {/* Search Input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search plans, tools, tags..."
                    className="w-full min-h-[38px] pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                {/* Filter Tabs */}
                <div className="flex p-1 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px]">
                  {[
                    { id: "all", label: "All (14)" },
                    { id: "active", label: "Active (8)" },
                    { id: "scheduled", label: "Scheduled (4)" },
                    { id: "drafts", label: "Drafts (2)" },
                  ].map((tab) => {
                    const isSelected = filterCategory === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setFilterCategory(tab.id)}
                        className={`flex-1 py-1 rounded-lg text-center transition-all ${
                          isSelected
                            ? "bg-slate-800 text-slate-100 font-semibold shadow"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* Workflow Cards Stack */}
                <div tabIndex={0} aria-label="Workflow plans" className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
                  {filteredPlans.map((plan) => {
                    const isSelected = plan.id === selectedPlanId;
                    return (
                      <div
                        key={plan.id}
                        onClick={() => {
                          setSelectedPlanId(plan.id);
                          setSelectedStepNumber(plan.steps[0]?.number || 1);
                        }}
                        className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                          isSelected
                            ? "bg-indigo-950/50 border-indigo-500/60 shadow-lg shadow-indigo-600/10"
                            : "bg-slate-950/70 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold text-slate-100 truncate">{plan.title}</span>
                            <span className="font-mono text-[10px] text-indigo-400 mt-0.5">
                              {plan.id} • {plan.code}
                            </span>
                          </div>

                          <span
                            className={`font-mono text-[10px] px-2 py-0.5 rounded font-semibold uppercase shrink-0 ${
                              plan.status === "running"
                                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                                : plan.status === "succeeded"
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                : plan.status === "awaiting_gate"
                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {plan.status === "running" ? `Step ${plan.currentStep}/${plan.totalSteps}` : plan.status}
                          </span>
                        </div>

                        <p className="text-[11px] text-slate-400 mt-1.5 line-clamp-2">
                          {plan.description}
                        </p>

                        <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-mono text-slate-400">
                          <span className="text-emerald-400 font-semibold">{plan.successRate}</span>
                          <span>{plan.lastRan}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </JXCardContent>
          </JXCard>
        </JXGridItem>

        {/* RIGHT COLUMN: Stepper & Step Deep Inspection (8 cols) */}
        <JXGridItem colSpan={8}>
          <div className="space-y-5">
            {/* Upper: Workflow Execution Stepper Card */}
            <JXCard className="bg-slate-900/70 border-slate-800 shadow-xl">
              <JXCardHeader
                title={activePlan.title}
                subheader={activePlan.targetFleet}
                icon={<Workflow className="w-4 h-4 text-indigo-400" />}
              />
              <JXCardContent>
                <div className="space-y-4">
                  {/* Turn State Ribbon */}
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-400"></span>
                      </span>
                      <span className="font-mono text-xs font-bold text-slate-100">
                        Turn {activePlan.currentStep} of {activePlan.totalSteps} {isPaused ? "[PAUSED]" : "Running"}
                      </span>
                      <span className="text-slate-600 font-mono text-xs">|</span>
                      <span className="font-mono text-xs text-indigo-300">
                        Active Step: {activeStep.tool}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
                      <span>Telemetry: 80ms ping</span>
                      <span className="px-2 py-0.5 rounded bg-slate-900 text-emerald-400 font-semibold">
                        Zero-Trust Enclave
                      </span>
                    </div>
                  </div>

                  {/* Visual Step Pipeline DAG Stepper */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-400 uppercase tracking-wider">Multi-Turn Execution Pipeline DAG</span>
                      <span className="text-emerald-400 font-semibold">Real-Time Telemetry Stream</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                      {activePlan.steps.map((step) => {
                        const isInspected = step.number === selectedStepNumber;
                        return (
                          <div
                            key={step.number}
                            onClick={() => setSelectedStepNumber(step.number)}
                            className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex flex-col justify-between min-h-[110px] ${
                              isInspected
                                ? "bg-indigo-950/60 border-indigo-500 shadow-md shadow-indigo-600/10 ring-1 ring-indigo-500/50"
                                : "bg-slate-950/80 border-slate-800 hover:border-slate-700"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span
                                className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-xs font-bold ${
                                  step.status === "completed"
                                    ? "bg-emerald-600 text-white"
                                    : step.status === "running"
                                    ? "bg-indigo-600 text-white"
                                    : "bg-slate-800 text-slate-400"
                                }`}
                              >
                                {step.status === "completed" ? (
                                  <Check className="w-3.5 h-3.5 text-white" />
                                ) : (
                                  step.number
                                )}
                              </span>
                              <span className="font-mono text-[10px] text-slate-400">{step.duration}</span>
                            </div>

                            <div className="mt-2">
                              <span className="font-semibold text-slate-200 block truncate">{step.name}</span>
                              <span className="font-mono text-[10px] text-slate-400 block truncate">{step.tool}</span>
                            </div>

                            <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-800/40 text-[10px] font-mono">
                              <span
                                className={
                                  step.status === "completed"
                                    ? "text-emerald-400"
                                    : step.status === "running"
                                    ? "text-indigo-400 font-bold"
                                    : "text-slate-400"
                                }
                              >
                                {step.status}
                              </span>
                              {isInspected && <span className="text-indigo-400 font-bold">Inspecting</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </JXCardContent>
            </JXCard>

            {/* Lower: Step Deep Inspection Sub-Panel */}
            <JXCard className="bg-slate-900/70 border-slate-800 shadow-xl">
              <JXCardHeader
                title={`Step ${activeStep.number}: ${activeStep.name}`}
                subheader={activeStep.tool}
                icon={<Eye className="w-4 h-4 text-emerald-400" />}
              />
              <JXCardContent>
                <div className="space-y-4">
                  {/* Inspection Header Badge */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-800/60">
                    <button
                      type="button"
                      onClick={copyStepPayload}
                      className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-200 font-mono text-[11px] flex items-center gap-1.5 transition-colors"
                    >
                      {copiedPayload ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-400" />
                          <span>Copy Step JSON</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* 2-Pane Inspection Content */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Left Pane: Visual Verification Checkpoint with SoM overlay */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                        <span className="uppercase tracking-wider">Visual Verification Checkpoint</span>
                        <span className="text-indigo-400">Set-of-Marks Marker #04</span>
                      </div>

                      {/* Screen preview container */}
                      <div className="relative w-full h-52 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden flex flex-col justify-between p-3 select-none">
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                          <span>Ubuntu 24.04 Enclave</span>
                          <span>3840×2160 native</span>
                        </div>

                        {/* Simulated Canvas Graphic & Reticle */}
                        <div className="flex items-center justify-center relative my-auto">
                          <div className="w-32 h-16 rounded-lg border-2 border-dashed border-emerald-400/80 bg-emerald-500/10 flex items-center justify-center p-2 text-center">
                            <span className="font-mono text-[10px] text-emerald-300 font-bold">
                              [04] PCR-7 ACTIVE
                            </span>
                          </div>
                        </div>

                        {/* Bottom Tag */}
                        <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between font-mono text-[10px] text-slate-300">
                          <span className="text-emerald-400 font-bold">SOM Mark [04]: Enclave TPM Status</span>
                          <span className="text-slate-400">{activeStep.boundsDesc}</span>
                        </div>
                      </div>

                    </div>

                    {/* Right Pane: AI Reasoning Trace & Tool Payload */}
                    <div className="space-y-2 font-mono text-xs">
                      <span className="text-slate-400 uppercase tracking-wider block">
                        AI Reasoning Trace & Payload
                      </span>

                      {/* Reasoning Trace Log */}
                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                        <div className="flex items-center gap-2 text-indigo-400 font-bold">
                          <Bot className="w-4 h-4" />
                          <span>Claude 3.5 Sonnet Reasoning Thought Trace</span>
                        </div>
                        <p className="p-2 rounded-lg bg-slate-900/80 border border-slate-800/80 text-[11px] leading-relaxed text-slate-300">
                          &gt; {activeStep.reasoning}
                        </p>
                      </div>

                      {/* Input JSON Parameters Payload */}
                      <div className="space-y-1">
                        <span className="text-xs text-slate-400 block">
                          Arguments
                        </span>
                        <pre className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 overflow-x-auto max-h-32">
                          <code>{JSON.stringify(activeStep.payload, null, 2)}</code>
                        </pre>
                      </div>
                    </div>
                  </div>

                  {/* Workflow Execution Controls Toolbar */}
                  <div className="pt-2 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span>Execution Stream: LIVE (Turn {activePlan.currentStep}/{activePlan.totalSteps})</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={togglePauseWorkflow}
                        className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-200 font-mono text-xs flex items-center gap-1.5 transition-all"
                      >
                        {isPaused ? <Play className="w-3.5 h-3.5 text-emerald-400" /> : <Pause className="w-3.5 h-3.5 text-amber-400" />}
                        <span>{isPaused ? "Resume Workflow" : "Pause Workflow"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={forceReplan}
                        className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-800 text-indigo-300 font-mono text-xs flex items-center gap-1.5 transition-all"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Force Re-Plan</span>
                      </button>

                      <button
                        type="button"
                        onClick={abortPlan}
                        className="px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-300 font-mono text-xs flex items-center gap-1.5 transition-all"
                      >
                        <StopCircle className="w-3.5 h-3.5 text-rose-400" />
                        <span>Abort Plan</span>
                      </button>
                    </div>
                  </div>
                </div>
              </JXCardContent>
            </JXCard>
          </div>
        </JXGridItem>
      </JXGrid>

      {/* Workflow Builder Modal */}
      {builderOpen && (
        <GlassModal onClose={() => setBuilderOpen(false)} title="Create sample workflow">
          <div className="space-y-4 font-mono text-xs text-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Workflow className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-slate-100">Workflow DAG Builder</h3>
              </div>
              <button
                type="button"
                aria-label="Close workflow builder"
                onClick={() => setBuilderOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-slate-400 uppercase text-[10px] block mb-1">Workflow Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Automated Kubernetes Pod Self-Healing"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-slate-400 uppercase text-[10px] block mb-1">Description</label>
                <textarea
                  rows={2}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Describe goal and verification checkpoints..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 uppercase text-[10px] block mb-1">Target Host</label>
                  <select
                    aria-label="Workflow target host"
                    value={newTargetNode}
                    onChange={(e) => setNewTargetNode(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 outline-none focus:border-indigo-500"
                  >
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.hostname}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 uppercase text-[10px] block mb-1">Failure Fallback</label>
                  <select
                    aria-label="Workflow failure fallback"
                    value={newFallback}
                    onChange={(e) => setNewFallback(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 outline-none focus:border-indigo-500"
                  >
                    <option value="stop">Halt & Rollback</option>
                    <option value="retry">Retry 3x on Transient</option>
                    <option value="skip">Skip & Proceed</option>
                  </select>
                </div>
              </div>

              {/* Step Sequence Manager */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 uppercase text-[10px]">Sequenced Steps ({builderSteps.length})</span>
                  <button
                    type="button"
                    onClick={handleAddBuilderStep}
                    className="text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Step
                  </button>
                </div>

                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {builderSteps.map((st, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800"
                    >
                      <span className="font-bold text-indigo-400">{idx + 1}.</span>
                      <input
                        type="text"
                        value={st.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBuilderSteps((prev) =>
                            prev.map((s, i) => (i === idx ? { ...s, name: val } : s))
                          );
                        }}
                        className="bg-transparent border-none outline-none text-slate-200 flex-1 px-2"
                      />
                      <span className="text-[10px] text-slate-500 px-2">{st.tool}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Human Approval Gate */}
              <label className="flex items-center gap-2 cursor-pointer pt-1 text-slate-300">
                <input
                  type="checkbox"
                  checked={newRequireGate}
                  onChange={(e) => setNewRequireGate(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0"
                />
                <span>Require Human-in-the-Loop Approval Gate before execution</span>
              </label>
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setBuilderOpen(false)}
                className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveNewWorkflow}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md shadow-indigo-600/30"
              >
                Save & Deploy Workflow
              </button>
            </div>
          </div>
        </GlassModal>
      )}
    </div>
  );
};

export default WorkflowsView;
