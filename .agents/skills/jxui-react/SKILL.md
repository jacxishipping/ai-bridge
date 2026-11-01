---
name: jxui-react
description: Comprehensive development and design system guide for JXUI React (@jacxishippingorg/jx-ui-react) — Next-Generation React 19 component library, 361 tactile spring & specular glassmorphic components across 18 categories, Tailwind CSS v4 zero-shift architecture, and enterprise UI/UX patterns.
---

# JXUI React Design System & Component Engineering Skill

## 🌟 Executive Overview
**JXUI** (`@jacxishippingorg/jx-ui-react`) is a next-generation React 19 component library and interactive design system workbench designed for high-performance enterprise dashboards, autonomous agent clouds, and modern creative workflows.

- **Total Suite**: **361 components across 18 categories** (61 production showcase state machines + 300 modular primitives).
- **Architecture**: Zero-runtime layout shift, true 3D perspective pitch/yaw tilt physics, specular glass ambient highlights, tactile audio cues, and seamless Tailwind CSS v4 compilation.
- **Engine**: React 19 + TypeScript + Tailwind CSS v4 + Motion (`motion/react`) + Lucide Icons.

---

## 🚀 Critical Setup & Prerequisites

### 1. Package Installation
```bash
npm install @jacxishippingorg/jx-ui-react motion lucide-react
npm install -D tailwindcss @tailwindcss/vite
```

### 2. Mandatory Tailwind CSS v4 Configuration
Because `@jacxishippingorg/jx-ui-react` relies on Tailwind CSS v4 utility classes and does not ship a pre-bundled standalone CSS sheet, you **must** configure Tailwind v4 to scan the library sources:

**`vite.config.ts`**:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
});
```

**`src/tailwind.css`**:
```css
@import "tailwindcss";
@source "../node_modules/@jacxishippingorg/jx-ui-react";
```

### 3. Universal Button Reset (Eliminates Browser Bevels)
Add to your global stylesheet (e.g. `src/jxui.css`):
```css
button {
  font-family: inherit;
  border: none;
  background: transparent;
  padding: 0;
  margin: 0;
  cursor: pointer;
  color: inherit;
}
```

### 4. Application Root Theme Provider (`main.tsx`)
```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { JXThemeProvider } from '@jacxishippingorg/jx-ui-react';
import './tailwind.css';
import './jxui.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <JXThemeProvider defaultMode="dark" defaultAccent="indigo" storageKey="ai_bridge_theme">
      <App />
    </JXThemeProvider>
  </React.StrictMode>
);
```

---

## 🎨 Master Category Architecture (18 Categories • 361 Components)

| # | Category | Showcases | Primitives | Total | Focus & Key Components |
| :-: | :--- | :-: | :-: | :-: | :--- |
| **01** | **Buttons & Actions** | 4 | 20 | **24** | `JXButton`, `MagneticButton`, `LiquidButton`, `HoldConfirmButton`, `MorphingFab` |
| **02** | **Glassmorphism & Surfaces** | 4 | 20 | **24** | `AdaptiveGlass`, `BentoGrid`, `TiltCard`, `SpecularHighlight`, `FrostedContainer` |
| **03** | **Navigation & Wayfinding** | 10 | 20 | **30** | `CommandPalette`, `FloatingDock`, `MegaMenu`, `RadialMenu`, `BreadcrumbTrail` |
| **04** | **Inputs & Forms** | 7 | 25 | **32** | `JXAutocomplete`, `TagInput`, `PinCodeInput`, `CreditCardInput`, `CurrencyInput` |
| **05** | **Toggles & Selection** | 3 | 15 | **18** | `JXSwitch`, `MultiToggleSegment`, `ColorPickerWheel`, `RotaryKnob`, `RatingStars` |
| **06** | **Modals & Overlays** | 2 | 20 | **22** | `GlassModal`, `DrawerSheet`, `ContextMenu`, `LightBoxViewer`, `BottomSheet` |
| **07** | **Notifications & Feedback** | 2 | 15 | **17** | `JXToast`, `BannerAlert`, `ConfettiTrigger`, `UndoNotification`, `PulseIndicator` |
| **08** | **Loading & Progress** | 2 | 15 | **17** | `ShimmerSkeleton`, `CircularGauge`, `WaveLoader`, `MatrixStreamLoader`, `MultiStepProgress` |
| **09** | **Cards & Content** | 2 | 20 | **22** | `InteractiveCard`, `FlipCard`, `PricingMatrix`, `ProductShowcaseCard`, `ComparisonSlider` |
| **10** | **Data Visualization** | 1 | 20 | **21** | `SparklineChart`, `HeatmapGrid`, `MiniAreaChart`, `BarTelemetry`, `RadarCoverageChart` |
| **11** | **Tables & Data Grids** | 3 | 15 | **18** | `VirtualizedTable`, `ColumnFilterTable`, `EditableRowGrid`, `TreeTable`, `KanbanBoard` |
| **12** | **Drag & Drop** | 0 | 15 | **15** | `DraggableList`, `KanbanColumn`, `FileDropZone`, `ReorderableGrid`, `SortableTags` |
| **13** | **Layout & Workspace** | 5 | 15 | **20** | `SplitPane`, `CollapsibleSidebar`, `WorkspaceSwitcher`, `MasonryGrid`, `WindowManager` |
| **14** | **Animation & Motion** | 1 | 15 | **16** | `ParallaxScrollContainer`, `MarqueeBanner`, `TextMorph`, `ParticleBackground`, `MagneticCursor` |
| **15** | **AI Components** | 0 | 16 | **16** | `AIChatPanel`, `AIThinkingIndicator`, `AIStreamingText`, `AIToolCall`, `AIModelSelector` |
| **16** | **Editors & Creative Tools** | 0 | 17 | **17** | `MarkdownLiveEditor`, `CodeEditorBlock`, `RichTextRibbon`, `SignaturePad`, `ColorPaletteStudio` |
| **17** | **Time & Scheduling** | 0 | 12 | **12** | `DatePickerInline`, `TimePicker`, `DateRangePicker`, `CalendarMonthView`, `TimelineEventScheduler` |
| **18** | **Advanced Utilities** | 0 | 20 | **20** | `KbdShortcutHint`, `TourGuide`, `AudioFeedbackProvider`, `VisualThemeEditor`, `PerformanceMonitorBadge` |

---

## 📚 Component Reference Documentation

For detailed component APIs, prop tables, and code snippets, see:
- [Design Principles & Overview](./references/overview.md)
- [Categories 01–06: Buttons, Glassmorphism, Navigation, Inputs, Toggles, Modals](./references/categories-01-06.md)
- [Categories 07–12: Notifications, Progress, Cards, DataViz, Tables, Drag & Drop](./references/categories-07-12.md)
- [Categories 13–18: Layout, Motion, AI Components, Editors, Scheduling, Utilities](./references/categories-13-18.md)
- [Alphabetical Master Index (All 361 Components)](./references/components-index.md)

---

## 💡 Quick Examples & Common Patterns

### 1. Tactile Morphing Button
```tsx
import { JXButton } from "@jacxishippingorg/jx-ui-react";

<JXButton
  variant="contained"
  color="primary"
  size="md"
  loading={isSubmitting}
  loadingLabel="Deploying..."
  onClick={handleDeploy}
>
  Deploy Service
</JXButton>
```

### 2. 3D Tilt Card with Specular Depth
```tsx
import { TiltCard } from "@jacxishippingorg/jx-ui-react";

<TiltCard
  title="Autonomous Fleet Node"
  subtitle="Production Edge Cluster"
  className="border border-white/10 bg-slate-900/60 backdrop-blur-xl"
>
  <div className="text-3xl font-bold tracking-tight text-white">99.98%</div>
  <p className="text-xs text-slate-400">Zero packet loss recorded across 24h</p>
</TiltCard>
```

### 3. Spotlight Command Palette
```tsx
import { CommandPalette } from "@jacxishippingorg/jx-ui-react";

<CommandPalette
  isOpen={cmdOpen}
  onClose={() => setCmdOpen(false)}
  placeholder="Search fleet commands, servers, logs..."
  items={[
    { id: "1", title: "Enroll New Machine", group: "Operations", onSelect: () => enroll() },
    { id: "2", title: "Emergency Queue Pause", group: "Security", onSelect: () => pause() },
  ]}
/>
```

### 4. AI Chat Assistant & Reasoning Inspector
```tsx
import { AIChatPanel, AIThinkingIndicator, AIToolCall } from "@jacxishippingorg/jx-ui-react";

<AIChatPanel
  title="Antigravity Cloud Copilot"
  status="Active Reasoning"
>
  <AIThinkingIndicator active thoughts="Analyzing cluster metrics and evaluating auto-scaling thresholds..." />
  <AIToolCall toolName="scale_droplet" status="completed" result='{"nodes": 4, "status": "healthy"}' />
</AIChatPanel>
```
