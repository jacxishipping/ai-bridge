# JXUI (@jxui/react) — Design System Architecture & Specifications

> **Next-Generation Component Library & Interactive Design System Workbench**  
> Reimagining Material UI (Core, Lab, and X) with tactile spring interactions, glassmorphic depth, and stable-state geometry across **361 unified components in 18 categories**.

---

## 1. Design System Philosophy & Core Invariants

Traditional enterprise UI libraries (such as Material UI) were conceived in the era of flat paper cards, all-caps buttons, notched outlines, and ink ripples. While functional, they introduce visual noise, layout shifts, and dated aesthetics.

**JXUI** establishes a modern, physical design language founded on four core invariants:

1. **Stable-State Geometry**:
  - Button, input, tab, and card state transitions should preserve their intended dimensions where the component supports it.
  - Bounding geometries can be locked or pre-allocated using the `useLockGeometry` hook.
  - Skeletons should match destination border-radii and bounding heights using `.jx-shimmer-wave`.
   - Numeric counters, metrics, ratings, and code timestamps strictly use `font-mono tabular-nums`.
2. **Tactile Physics & Motion**:
   - Interactions utilize spring dynamics (`cubic-bezier(0.22, 1, 0.36, 1)`), velocity-based kinematics, and active press compression (`scale 0.98` / `active:scale-95`) rather than dated radial ink ripples.
   - Built-in zero-dependency Web Audio API synthesizer (`tactile.playClick()`, `tactile.playSuccess()`) and mobile haptic vibration feedback.
3. **Specular Glassmorphism & Depth**:
   - Surfaces employ subtle ambient occlusion combined with top specular highlights (`inset 0 1px 0 0 rgba(255, 255, 255, 0.8)` in light mode and `0.06` in dark mode).
   - Interactive cursor-tracking spotlights (`SpotlightCard`, `JXCard`) project radial luminescent highlights without DOM repaints.
4. **Accessibility Targets (WCAG 2.1 AA)**:
  - Document and test keyboard navigation contracts (`ArrowUp/Down`, `Enter`, `Space`, `Escape`, `Tab`) for each interactive component.
  - Aim for mobile touch targets of at least `44px x 44px` via `min-h-[44px] min-w-[44px] touch-manipulation`.
  - Use semantic ARIA live regions, sufficient contrast, and visible focus rings (`--jx-accent-halo`); validate with assistive technology and manual testing.

---

## 2. Design Tokens & Theme Foundation

### 2.1 Typography

| Role | Font Family | Numeric Variant | Usage |
| :--- | :--- | :--- | :--- |
| **Primary Sans** | `'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | Normal | UI labels, headings, body text, buttons |
| **Monospace / Tabular** | `'JetBrains Mono', ui-monospace, SFMono-Regular, monospace` | `tabular-nums` | Numerical counters, badges, code snippets, timestamps, data grids |

### 2.2 Dynamic Accent Palettes

JXUI components adapt dynamically to 5 curated accent palettes via `useJXTheme()`. Changing the accent alters CSS custom property `--jx-accent` and focus halo rings `--jx-accent-halo` without React re-renders:

| Palette | Primary Hex | Light BG | Dark BG | Ring Focus |
| :--- | :--- | :--- | :--- | :--- |
| **Indigo** | `#4f46e5` | `bg-indigo-600` | `dark:bg-indigo-500` | `focus-visible:ring-indigo-500/30` |
| **Violet** | `#7c3aed` | `bg-violet-600` | `dark:bg-violet-500` | `focus-visible:ring-violet-500/30` |
| **Emerald** | `#059669` | `bg-emerald-600` | `dark:bg-emerald-500` | `focus-visible:ring-emerald-500/30` |
| **Rose** | `#e11d48` | `bg-rose-600` | `dark:bg-rose-500` | `focus-visible:ring-rose-500/30` |
| **Ocean** | `#0284c7` | `bg-sky-600` | `dark:bg-sky-500` | `focus-visible:ring-sky-500/30` |

### 2.3 Surface Luminance Tiers (Dark Mode Hierarchy)

Rather than arbitrary grays, dark mode surfaces strictly follow a 3-tier elevation hierarchy:

| Surface Tier | Token Hex | CSS Utility | Usage |
| :--- | :--- | :--- | :--- |
| **Canvas** | `#0B0F19` | `dark:bg-[#0B0F19]` | Root page canvas, background viewport |
| **Elevated Surfaces** | `#111827` | `dark:bg-[#111827]` | Showcase cards, dialog windows, bento panels |
| **Subtle Shelves** | `#1E293B` | `dark:bg-[#1E293B]` | Nested drawers, toolbars, input field containers, dropdown menus |

### 2.4 Elevation & Specular Borders

```css
/* Tier 1: Controls & Secondary Surfaces */
.jx-elevation-1 {
  box-shadow: 0 2px 6px -1px rgba(15, 23, 42, 0.04),
              0 1px 2px -1px rgba(15, 23, 42, 0.02),
              inset 0 1px 0 0 rgba(255, 255, 255, 0.8);
}
.dark .jx-elevation-1 {
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.35),
              0 1px 2px -1px rgba(0, 0, 0, 0.25),
              inset 0 1px 0 0 rgba(255, 255, 255, 0.06);
}

/* Tier 2: Floating Cards & Dropdowns */
.jx-elevation-2 {
  box-shadow: 0 10px 25px -4px rgba(15, 23, 42, 0.06),
              0 4px 10px -2px rgba(15, 23, 42, 0.03),
              inset 0 1px 0 0 rgba(255, 255, 255, 0.85);
}
.dark .jx-elevation-2 {
  box-shadow: 0 10px 25px -4px rgba(0, 0, 0, 0.5),
              0 4px 10px -2px rgba(0, 0, 0, 0.35),
              inset 0 1px 0 0 rgba(255, 255, 255, 0.08);
}

/* Tier 3: Modals, Command Finder & Overlays */
.jx-elevation-3 {
  box-shadow: 0 20px 40px -8px rgba(15, 23, 42, 0.10),
              0 8px 16px -4px rgba(15, 23, 42, 0.04),
              inset 0 1px 0 0 rgba(255, 255, 255, 0.9);
}
.dark .jx-elevation-3 {
  box-shadow: 0 20px 40px -8px rgba(0, 0, 0, 0.65),
              0 8px 16px -4px rgba(0, 0, 0, 0.45),
              inset 0 1px 0 0 rgba(255, 255, 255, 0.10);
}
```

### 2.5 Radius Scaling Tiers

Components consume `getRadiusClass(tier)` supporting 5 global scales:
- **Sharp (0px)**: Technical, industrial layouts.
- **Small (8px)**: Compact data-dense dashboards.
- **Medium (12px)**: Default balanced enterprise UI.
- **Large (16px)**: Friendly, contemporary SaaS surfaces.
- **Ultra (24px)**: Expressive mobile/tablet experiences.

---

## 3. Wireframe Blueprints & Shell Architecture

```
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│                                          AppHeader                                            │
│ [Logo] [Quick Find ⌘K]                 [Palette ●●●●●] [Radius 0.5x..1.75x] [Theme ☀️/🌙] [GitHub]│
├─────────────────────┬─────────────────────────────────────────────────────────────────────────┤
│     AppSidebar      │                               AppWorkbench                              │
│ [Search Comps...]   │ ┌─────────────────────────────────────────────────────────────────────┐ │
│ ┌─────────────────┐ │ │ Hero / Telemetry KPIs (361 Components, 18 Categories, 0 CLS)        │ │
│ │ Tier Filters:   │ │ └─────────────────────────────────────────────────────────────────────┘ │
│ │ • All (361)     │ │ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ • Showcases (61)│ │ │ Live Playground Studio (Fluid / Mobile 375px / Tablet / Desktop)     │ │
│ │ • Primitives    │ │ │ [Props Editor] ── [Live Interactive Stage] ── [Code Exporter (TSX)] │ │
│ │ • Starred ★     │ │ └─────────────────────────────────────────────────────────────────────┘ │
│ ├─────────────────┤ │ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ 18 Categories:  │ │ │ Component Catalog (18 Categories with Split Compare & Live Docs)    │ │
│ │ 1. Buttons      │ │ │ ┌─────────────────────────────────┐ ┌─────────────────────────────┐ │ │
│ │ 2. Glassmorphism│ │ │ │ <JXButton />                    │ │ <TiltCard />                │ │ │
│ │ 3. Navigation   │ │ │ │ [Morph State] [Copy TSX] [Docs] │ │ [3D Tilt Physics] [Props]   │ │ │
│ │ ...             │ │ │ └─────────────────────────────────┘ └─────────────────────────────┘ │ │
│ │ 18. Utilities   │ │ └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────┴─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Kinematics, Motion & Tactile Feedback Engine

### 4.1 Spring Physics Constants
- **Timing Curve**: `cubic-bezier(0.22, 1, 0.36, 1)` (Tactile Settling Bezier)
- **Spring Stiffness**: `stiffness: 400`
- **Spring Damping**: `damping: 25`
- **Active Press Scale**: `active:scale-95` (Buttons/Badges) and `active:scale-[0.98]` (Large Cards)

### 4.2 Proximity & Magnetic Gravitation
Dock icons and magnetic buttons calculate cursor proximity using a cosine-bell curve:
\\[ \text{scale} = 1 + \text{maxBoost} \times \cos\left(\frac{\pi \times \text{dist}}{2 \times \text{threshold}}\right) \\]
When the cursor approaches within threshold distance, pointer-capture gravitational pull slides the button toward the cursor coordinates.

### 4.3 Synthesized Web Audio & Haptics
- **Micro-Click**: Sine oscillator at 800Hz ramping to 320Hz over 40ms with exponential gain decay.
- **Success Chime**: 3-note harmonic triad (C5: 523Hz, E5: 659Hz, G5: 784Hz) with 60ms stagger.
- **Haptic Vibration**: Native `navigator.vibrate([10, 30, 20])` on supported mobile touch viewports.

---

## 5. Complete 18-Category Component Catalog (361 Components)

### 1. Category 1: Buttons & Actions (buttons-actions) — 24 Components

| Component | Tier | Description |
| :--- | :---: | :--- |
| JXButton | **Showcase** | Morphing Tactile Button |
| JXButtonGroup | **Showcase** | Segmented Pill & Split Action Bar |
| JXFab | **Showcase** | Floating Action Island |
| JXToggleButtonGroup | **Showcase** | Animated Segmented Control |
| MagneticButton | Primitive | Cursor magnetic tracking with physics pull |
| LiquidButton | Primitive | Fluid morphing gel with specular highlights |
| MorphButton | Primitive | Zero-shift 3-state morphing (idle/load/success) |
| SpringButton | Primitive | Tactile spring scale on press |
| RippleButton | Primitive | Upgraded coordinate wave ripple |
| GlowButton | Primitive | Dynamic luminescent drop glow |
| GradientButton | Primitive | Animated gradient sweep |
| ShimmerButton | Primitive | Continuous metallic sheen ray |
| ParticleButton | Primitive | Micro-burst particles on click |
| MagneticIconButton | Primitive | Circular icon button with magnetic snap |
| HoldToConfirmButton | Primitive | Long-press safeguard progress fill |
| SlideToAction | Primitive | Swipe slider pill to authorize action |
| ExpandableButton | Primitive | Collapsed icon expanding on hover |
| FloatingActionButton | Primitive | Elevated action button with spring pop |
| SpeedDial | Primitive | Radial / vertical secondary quick actions |
| SplitButton | Primitive | Primary action plus dropdown chevron |
| AnimatedButtonGroup | Primitive | Connected segment group with sliding pill |
| CommandButton | Primitive | Integrated keyboard shortcut badge |
| GestureButton | Primitive | Double-tap and swipe gesture trigger |
| MultiStateButton | Primitive | Status cycle through 4 workflow stages |

### 2. Category 2: Glassmorphism & Surfaces (glass-surfaces) — 24 Components

| Component | Tier | Description |
| :--- | :---: | :--- |
| JXAccordion | **Showcase** | Smooth Spring Disclosure |
| JXAppBar | **Showcase** | Floating Glass Navigation Header |
| JXCard | **Showcase** | Bento Surface with Cursor Spotlight Glow |
| JXPaper | **Showcase** | Semantic Layered Surface Primitive |
| LiquidGlass | Primitive | Fluid dynamic blurred glass container |
| FrostedGlass | Primitive | Deep diffuse blur with rim lighting |
| AdaptiveGlass | Primitive | Ambient theme-tinted glass surface |
| DynamicGlassPanel | Primitive | Adjustable blur and opacity controls |
| GlassCard | Primitive | Luminescent card with specular highlights |
| GlassNavbar | Primitive | Floating pill glass header |
| GlassSidebar | Primitive | Semi-transparent navigation sidebar |
| GlassModal | Primitive | Refractive translucent dialog window |
| GlassPopover | Primitive | Lightweight translucent dropdown |
| GlassTooltip | Primitive | Micro frosted glass info label |
| GlassDock | Primitive | macOS-inspired glass icon shelf |
| GlassToolbar | Primitive | Compact floating glass action strip |
| GlassNotification | Primitive | Frosted glass alert banner |
| GlassInput | Primitive | Glassmorphic input field with translucent fill |
| GlassButton | Primitive | Frosted glass press button |
| GlassTabs | Primitive | Glassmorphic pill segmented tabs |
| GlassSheet | Primitive | Sliding translucent inspector panel |
| GlassCommandMenu | Primitive | Command launcher in frosted glass |
| GlassFloatingPanel | Primitive | Draggable floating performance widget |
| SpatialGlassWorkspace | Primitive | 3D multi-layered glass plane container |

### 3. Category 3: Navigation & Wayfinding (navigation) — 30 Components

| Component | Tier | Description |
| :--- | :---: | :--- |
| JXBottomNavigation | **Showcase** | Floating Mobile Pill Dock |
| JXBreadcrumbs | **Showcase** | Collapsible Path Bar & Sibling Switcher |
| JXDrawer | **Showcase** | Floating Inset Sheet & Mini-Rail Sidebar |
| JXLink | **Showcase** | Animated Underline & Hover Preview Link |
| JXMenu & JXMenuItem | **Showcase** | Nested Command & Context Menu |
| JXPagination | **Showcase** | Smart Page Jumper & Summary Bar |
| JXSpeedDial | **Showcase** | Staggered Quick Action Menu with Always-Visible Labels |
| JXStepper | **Showcase** | Interactive Progress & Wizard Flow |
| JXTabs & JXTab | **Showcase** | Sliding Pill & Underline Tabs |
| JXNavigationRail | **Showcase** | Compact Vertical App Rail (Missing in MUI Core) |
| MagneticDock | Primitive | Proximity-magnified icon dock |
| FloatingDock | Primitive | Detached floating navigation pill |
| AdaptiveNavbar | Primitive | Responsive desktop/mobile hybrid header |
| MorphingNavbar | Primitive | Scroll-position dynamic contraction |
| AnimatedSidebar | Primitive | Sidebar with icon badges and expand spring |
| ExpandableSidebar | Primitive | Hover-expanding navigation rail |
| CollapsibleNavigation | Primitive | Multi-level tree disclosure |
| MegaMenu | Primitive | Categorized multi-column dropdown panel |
| CommandNavigation | Primitive | Keyboard-first navigation bar |
| BreadcrumbTrail | Primitive | Animated path breadcrumbs |
| AnimatedTabs | Primitive | Sliding pill active indicator |
| SlidingTabs | Primitive | Fluid underline indicator |
| NavigationRail | Primitive | Compact vertical app rail |
| FloatingTabBar | Primitive | Mobile floating bottom tab bar |
| CircularNavigation | Primitive | Rotating ring navigation sectors |
| RadialMenu | Primitive | Pie menu expanding on click |
| OrbitalMenu | Primitive | Satellites orbiting trigger center |
| ContextNavigation | Primitive | Entity-sensitive contextual toolbar |
| MultiLevelMenu | Primitive | Deep nested flyout without accidental close |
| GestureNavigation | Primitive | Swipe left/right back-forward indicator |

### 4. Category 4: Inputs & Forms (inputs-forms) — 32 Components

| Component | Tier | Description |
| :--- | :---: | :--- |
| JXAutocomplete | **Showcase** | Enhanced Autocomplete & Command Combobox |
| JXNumberField | **Showcase** | Tactile Stepper & Scrubbable Input |
| JXRating | **Showcase** | Expressive Micro-Animated Rating |
| JXSelect | **Showcase** | Rich Popover Select |
| JXSlider | **Showcase** | Precision Interactive Scrubber |
| JXTextField | **Showcase** | Contextual Smart Input |
| JXTransferList | **Showcase** | Dual-Pane Drag & Filter Shuttle |
| LiquidInput | Primitive | Fluid glowing border on active focus |
| FloatingLabelInput | Primitive | Zero-notch smooth label transition |
| AnimatedInput | Primitive | Micro-animated icon reactions |
| FormGlassInput | Primitive | Frosted glass translucent input field |
| MorphingInput | Primitive | Expands into multi-line textarea |
| SearchInput | Primitive | Instant clear button and search hint |
| SmartSearch | Primitive | Search with instant suggestion chips |
| CommandInput | Primitive | Terminal prompt styled command field |
| AutoComplete | Primitive | Fuzzy-matched dropdown filter |
| MultiSelect | Primitive | Removable tag-based multi-option selector |
| TagInput | Primitive | Freeform string tags with Enter key |
| TokenInput | Primitive | API key / token formatted field |
| OTPInput | Primitive | 6-digit one-time code auto-focus |
| PinInput | Primitive | Masked secure PIN dots |
| PasswordStrength | Primitive | Real-time entropy meter and rules |
| PasswordReveal | Primitive | Eye toggle with security verification |
| ColorPicker | Primitive | Hex swatch picker with instant pill |
| GradientPicker | Primitive | Dual-stop CSS gradient generator |
| RangeSlider | Primitive | Single scrubbable slider with percentage |
| DualRangeSlider | Primitive | Min/max two-handle range slider |
| CircularSlider | Primitive | Dial knob rotating 0 to 360° |
| MagneticSlider | Primitive | Handle snaps magnetically to tick marks |
| SignaturePad | Primitive | Canvas drawing for digital signatures |
| FormWizard | Primitive | Multi-step wizard with validation dots |
| DynamicFormBuilder | Primitive | Schema-driven JSON form generator |

### 5. Category 5: Toggles & Selection (toggles-selection) — 18 Components

| Component | Tier | Description |
| :--- | :---: | :--- |
| JXCheckbox | **Showcase** | Animated SVG Spring Checkbox & Card Mode |
| JXRadioGroup | **Showcase** | Bento Selection Cards & Sliding Pills |
| JXSwitch | **Showcase** | Tactile Spring Toggle & Setting Row |
| LiquidSwitch | Primitive | Fluid morphing toggle switch |
| MorphSwitch | Primitive | Thumb morphs between check and cross |
| MagneticSwitch | Primitive | Magnetic spring snap to on/off state |
| AnimatedCheckbox | Primitive | SVG checkmark draws on select |
| GlassCheckbox | Primitive | Frosted glass translucent checkbox |
| CircularCheckbox | Primitive | Round radio-style checkbox with dot |
| AnimatedRadio | Primitive | Expanding ripple wave on selection |
| SegmentedControl | Primitive | Multi-option pill selection bar |
| SlidingSegmentedControl | Primitive | Gliding active background indicator |
| SelectableCard | Primitive | Card with selected border and checkmark |
| SelectionGrid | Primitive | Multi-card selection grid with counter |
| MultiStateToggle | Primitive | 3-state workflow toggle (Off/Eco/Turbo) |
| TriStateToggle | Primitive | True / Indeterminate / False toggle |
| GestureSelector | Primitive | Swipe left/right to toggle |
| FloatingSelectionBar | Primitive | Bulk action bar on item selection |

### 6. Category 6: Modals & Overlays (modals-overlays) — 22 Components

| Component | Tier | Description |
| :--- | :---: | :--- |
| JXBackdrop | **Showcase** | Frosted Glass Scrim |
| JXDialog | **Showcase** | Spring Modal & Command Sheet |
| MorphingModal | Primitive | Expands smoothly from trigger element |
| LiquidDialog | Primitive | Viscous spring backdrop blur modal |
| GlassDialog | Primitive | Specular reflections on translucent modal |
| SpringModal | Primitive | Physics bouncy entrance modal |
| FullscreenModal | Primitive | Complete viewport overlay with escape bar |
| Drawer | Primitive | Edge slide-out right drawer |
| MagneticDrawer | Primitive | Snaps magnetically to 30%, 60%, 100% |
| BottomSheet | Primitive | Mobile bottom sheet with grab handle |
| InteractiveBottomSheet | Primitive | Drag down to dismiss bottom sheet |
| FloatingPanel | Primitive | Draggable window-style floating overlay |
| ResizablePanel | Primitive | Corner-resizable overlay panel |
| SpotlightOverlay | Primitive | Dimmed backdrop focusing on single element |
| ContextMenu | Primitive | Desktop right-click contextual list |
| RadialContextMenu | Primitive | Circular right-click pie options |
| SmartPopover | Primitive | Collision-detecting anchor popover |
| InteractiveTooltip | Primitive | Tooltip allowing mouse hover & links |
| HoverCard | Primitive | Rich preview card on link hover |
| CommandPalette | Primitive | Cmd+K style keyboard search and launcher |
| SpotlightSearch | Primitive | Fullscreen centered spotlight search |
| OverlayStack | Primitive | Multi-layer z-index stacked dialog manager |

### 7. Category 7: Notifications & Feedback (feedback-notifications) — 17 Components

| Component | Tier | Description |
| :--- | :---: | :--- |
| JXAlert | **Showcase** | Actionable Callout Banner |
| JXSnackbar | **Showcase** | Sonner-Style 3D Stacked Toast System |
| SmartToast | Primitive | Countdown timer bar and undo callback |
| NotificationStack | Primitive | 3D stacked toasts with hover expansion |
| NotificationCenter | Primitive | Full panel history of system events |
| FeedbackGlassNotification | Primitive | Frosted glass alert toast banner |
| AnimatedAlert | Primitive | Entrance slide and pulsing status icon |
| InlineAlert | Primitive | Compact embedded message strip |
| SmartBanner | Primitive | Dismissible sticky top banner |
| ProgressToast | Primitive | Toast displaying live percentage progress |
| UndoNotification | Primitive | Notification with instant undo action button |
| LiveActivity | Primitive | Dynamic island pill with live state |
| StatusIndicator | Primitive | Colored dot with optional pulsing halo |
| PulseIndicator | Primitive | Concentric ripple rings around status marker |
| ConnectionStatus | Primitive | Real-time online/offline indicator |
| SuccessCelebration | Primitive | Confetti burst animation overlay |
| ErrorBoundaryFallback | Primitive | Resilient error screen with retry CTA |

### 8. Category 8: Loading & Progress (loading-progress) — 17 Components

| Component | Tier | Description |
| :--- | :---: | :--- |
| JXProgress (Linear & Circular) | **Showcase** | Shimmer Track & Completion Morph |
| JXSkeleton | **Showcase** | Layout-Aware Shimmer Placeholder |
| LiquidLoader | Primitive | Fluid viscous pulsing gel loader |
| MorphingLoader | Primitive | Geometric shape shifting (circle/square) |
| OrbitalLoader | Primitive | Planetary orbiting dots loader |
| ParticleLoader | Primitive | Swirling particle vortex |
| WaveLoader | Primitive | Audio equalizer undulating bars |
| GradientLoader | Primitive | Conic gradient spinning ring |
| SkeletonCard | Primitive | Shimmer placeholder matching card shape |
| SkeletonTable | Primitive | Shimmer placeholder for table rows |
| SkeletonText | Primitive | Text line skeletons with varied widths |
| ProgressRing | Primitive | SVG circular progress with percentage |
| CircularProgress | Primitive | Continuous spinning SVG circle |
| SegmentedProgress | Primitive | Multi-bar discrete step progress |
| MultiStepProgress | Primitive | Numbered milestone step connector |
| UploadProgress | Primitive | File transfer loader with byte rate counter |
| TaskProgress | Primitive | Background task completion badge |

### 9. Category 9: Cards & Content (cards-content) — 22 Components

| Component | Tier | Description |
| :--- | :---: | :--- |
| JXImageList | **Showcase** | Bento & Lightbox Media Grid |
| JXPricingMatrix | **Showcase** | Tiered Glassmorphic Pricing Cards & Smooth Price-Toggling Matrix |
| ContentGlassCard | Primitive | Frosted luminescent glass surface |
| MagneticCard | Primitive | Card tilting toward cursor position |
| TiltCard | Primitive | 3D parallax tilt on mouse move |
| HoverLiftCard | Primitive | Tactile elevation lift with soft shadow |
| ExpandableCard | Primitive | Unfolds to reveal details with zero CLS |
| MorphingCard | Primitive | Resizes smoothly into modal view |
| FlipCard | Primitive | 180° flip to show back-side security key |
| StackedCard | Primitive | Cards in stacked deck format |
| SwipeableCard | Primitive | Tinder-style swipe left/right |
| InteractiveCard | Primitive | Hover states, tags, and quick actions |
| SpotlightCard | Primitive | Radial spotlight gradient following cursor |
| SpotlightBorderCard | Primitive | Card border glows near cursor |
| GradientBorderCard | Primitive | Animated conic gradient border |
| ProfileCard | Primitive | Avatar, title, status, and social badges |
| ProductCard | Primitive | Image, price, discount badge, and cart CTA |
| PricingCard | Primitive | Monthly/annual pricing tier with checklist |
| MetricCard | Primitive | Large KPI metric number with delta percent |
| ComparisonCard | Primitive | Side-by-side benchmark comparison card |
| FeatureCard | Primitive | Icon, title, description, and link |
| BentoGrid | Primitive | Asymmetric modern grid container |

### 10. Category 10: Data Visualization (data-visualization) — 21 Components

| Component | Tier | Description |
| :--- | :---: | :--- |
| JXCharts (Line, Bar, Pie & Sparkline) | **Showcase** | Interactive SVG Telemetry with Magnetic Crosshair |
| KineticBarChart | Primitive | Animated SVG bars with hover tooltips |
| AnimatedLineChart | Primitive | Smooth bezier curve with drawing entrance |
| LiquidAreaChart | Primitive | Fluid gradient area beneath waveform |
| RadialChart | Primitive | Concentric comparison progress rings |
| DonutChart | Primitive | Center-cut pie chart with legend |
| InteractivePieChart | Primitive | Slices expanding on hover |
| RadarChart | Primitive | Multi-axis spider polygon diagram |
| ScatterPlot | Primitive | 2D coordinate point clusters |
| BubbleChart | Primitive | Sized circular bubbles by third metric |
| Heatmap | Primitive | Grid of color-intensity activity cells |
| CalendarHeatmap | Primitive | GitHub-style 52-week activity contribution |
| Treemap | Primitive | Hierarchical nested rectangular tiles |
| SankeyDiagram | Primitive | Flow path streams between stages |
| WaterfallChart | Primitive | Stepwise positive/negative variance bars |
| FunnelChart | Primitive | Conversion funnel with percentage dropoffs |
| LiveTicker | Primitive | Real-time streaming metric ticker |
| NumberCounter | Primitive | Rolling odometer digit animator |
| Sparkline | Primitive | Micro inline sparkline graph |
| InteractiveGauge | Primitive | Speedometer arc gauge with reading |
| DataComparisonChart | Primitive | Multi-series benchmark comparison bar |

### 11. Category 11: Tables & Data Grids (tables-datagrids) — 18 Components

| Component | Tier | Description |
| :--- | :---: | :--- |
| JXTable | **Showcase** | Modern Interactive Data Surface with Bulk Action Bar |
| JXDataGrid | **Showcase** | Next-Gen Enterprise Data Grid (Notion / Linear Hybrid) |
| JXTreeView | **Showcase** | VS Code / Notion File & Hierarchy Explorer |
| SmartDataTable | Primitive | Sortable, filterable table with column toggles |
| VirtualizedTable | Primitive | 100k row virtual list container at 60 FPS |
| ExpandableTable | Primitive | Nested row accordion expansion |
| EditableTable | Primitive | Inline cell click-to-edit |
| TreeTable | Primitive | Hierarchical directory tree table |
| PivotTable | Primitive | Group by and aggregate summary table |
| KanbanTable | Primitive | Table rows viewable as kanban cards |
| InfiniteDataGrid | Primitive | Infinite scroll dynamic page loader |
| ColumnResizer | Primitive | Draggable vertical column border handle |
| ColumnManager | Primitive | Checkbox popover to show/hide columns |
| FilterBuilder | Primitive | Multi-condition rule builder (AND/OR) |
| AdvancedFilterPanel | Primitive | Slide-out drawer with faceted filters |
| TableToolbar | Primitive | Top action strip (Search, Filter, Export) |
| RowSelectionToolbar | Primitive | Bulk action bar when rows are checked |
| DataExportPanel | Primitive | CSV, JSON, Excel exporter modal |

### 12. Category 12: Drag & Drop (drag-drop) — 15 Components

| Component | Tier | Description |
| :--- | :---: | :--- |
| KineticKanban | Primitive | Multi-column drag board with spring drop |
| DragGrid | Primitive | 2D grid items reordering smoothly |
| SortableList | Primitive | Vertical list with drag handles and swap |
| SortableGrid | Primitive | Grid with drag-and-drop tile sorting |
| NestedDragList | Primitive | Tree list with parent/child drop levels |
| DragTree | Primitive | Directory tree with file drag-and-drop |
| MultiSelectDrag | Primitive | Dragging lasso selection of multiple items |
| DragDropUpload | Primitive | Drop target zone with upload animation |
| MagneticDropZone | Primitive | Target pulls items magnetically to center |
| FloatingDragPreview | Primitive | Ghost preview avatar following cursor |
| ResizableGridItem | Primitive | Grid item with drag resize borders |
| SnapGrid | Primitive | Items snapping to 8px or 16px grid coordinates |
| DragTimeline | Primitive | Timeline events scrubbable across dates |
| DragCalendar | Primitive | Appointments draggable across time slots |
| MultiContainerDrag | Primitive | Dragging cards across discrete containers |

### 13. Category 13: Layout & Workspace (layout-workspace) — 20 Components

| Component | Tier | Description |
| :--- | :---: | :--- |
| JXBox & JXContainer | **Showcase** | Token-Aware Layout Primitives |
| JXGrid | **Showcase** | Asymmetric Bento & CSS Grid v2 System |
| JXStack | **Showcase** | Flex Stack with Smart Hairline Dividers |
| JXMasonry | **Showcase** | Dynamic Reflow Masonry Layout |
| JXTransitions, JXModal, JXPopper & JXTextareaAutosize | **Showcase** | Spring Physics Primitives & Auto-Growing Composer |
| AdaptiveDashboard | Primitive | Responsive multi-widget layout |
| InfiniteCanvas | Primitive | Pan and zoom canvas (like Figma/Miro) |
| SpatialWorkspace | Primitive | 3D stacked window layers |
| WindowManager | Primitive | Desktop OS window controls (min/max/close) |
| FloatingWindow | Primitive | Draggable window with title bar |
| DockManager | Primitive | macOS-style pinned dock at screen edge |
| SplitPane | Primitive | Divider with drag resizing between panes |
| ResizableLayout | Primitive | Multi-column adjustable workspace layout |
| MosaicGrid | Primitive | Flexible tile layout like modern dashboards |
| BentoLayout | Primitive | Modern asymmetric bento section organizer |
| ResponsiveGrid | Primitive | Breakpoint-aware dynamic grid |
| MasonryLayout | Primitive | Pinterest-style waterfall columns |
| AutoLayout | Primitive | Flexbox auto-distributing spacing helper |
| PanelGroup | Primitive | Collapsible grouped panels |
| WorkspaceSwitcher | Primitive | Multi-workspace tab selector |

### 14. Category 14: Animation & Motion (animation-motion) — 16 Components

| Component | Tier | Description |
| :--- | :---: | :--- |
| JXSpotlightDock | **Showcase** | Proximity-Magnified Floating Glass App Dock |
| SpringTransition | Primitive | Wrapper animating enter/exit with spring |
| MorphTransition | Primitive | Shape shifting between circle and square |
| SharedElementTransition | Primitive | Shared element layoutId transition |
| PageTransition | Primitive | Full page slide and fade transition |
| StaggeredReveal | Primitive | Children revealed with incremental delay |
| ScrollReveal | Primitive | Elements sliding in as viewport scrolls |
| ParallaxContainer | Primitive | Multi-depth parallax scroll container |
| MagneticCursor | Primitive | Custom cursor attracted to nearby buttons |
| CursorFollower | Primitive | Smooth lagging trailing glow circle |
| AnimatedGradient | Primitive | Continuous shifting mesh gradient |
| LiquidBlob | Primitive | Organic morphing SVG blob shape |
| ParticleField | Primitive | Floating ambient background particles |
| SpotlightEffect | Primitive | Cursor-tracking spotlight glow effect |
| HoverDistortion | Primitive | Wave distortion on mouse hover |
| MotionSequence | Primitive | Keyframed choreographed animation runner |

### 15. Category 15: AI Components (ai-components) — 16 Components

| Component | Tier | Description |
| :--- | :---: | :--- |
| JXSecurityVaultCard | **Showcase** | Passkey Biometric Challenge & Hardware Key Manager |
| AIChatPanel | Primitive | Conversational message history and input |
| AIMessage | Primitive | Assistant message bubble with thought drawer |
| AIComposer | Primitive | Input with attachment chips and model picker |
| AIThinkingIndicator | Primitive | Step-by-step reasoning accordion |
| AIStreamingText | Primitive | Typewriter streaming markdown tokens |
| AIToolCall | Primitive | Card showing tool function and arguments |
| AIToolTrace | Primitive | Detailed trace view with execution metrics |
| AIApprovalCard | Primitive | Human-in-the-loop action approval card |
| AIReasoningTimeline | Primitive | Chronological timeline of thought nodes |
| AIResponseActions | Primitive | Thumbs up/down, retry, copy, branch |
| AIContextPanel | Primitive | Token budget and active context documents |
| AIModelSelector | Primitive | Dropdown to switch LLM models |
| AIAttachmentPreview | Primitive | Image/file preview chip with remove CTA |
| AICitationCard | Primitive | Source link citation popup with excerpt |
| AIWorkflowBuilder | Primitive | Visual canvas connecting agent steps |

### 16. Category 16: Editors & Creative Tools (editors-creative) — 17 Components

| Component | Tier | Description |
| :--- | :---: | :--- |
| JXRichTextEditor & JXUploadDropzone | **Showcase** | Slash-Command (/) Block Editor & Multi-File Dropzone |
| JXInteractiveColorStudio | **Showcase** | Live HSL/OKLCH Tonal Scale & WCAG Contrast Generator |
| RichTextEditor | Primitive | WYSIWYG toolbar and contentEditable field |
| FloatingEditorToolbar | Primitive | Floating selection menu (Bold, Italic, Link) |
| SlashCommandMenu | Primitive | Notion-like / trigger dropdown menu |
| BlockEditor | Primitive | Draggable content block editor |
| MarkdownEditor | Primitive | Split preview markdown composer |
| CodeEditor | Primitive | Syntax-highlighted code editing box |
| DiffViewer | Primitive | Git-style side-by-side or inline diff (+/-) |
| JsonEditor | Primitive | Collapsible tree JSON viewer/editor |
| VisualThemeEditor | Primitive | Live color token studio preview |
| GradientEditor | Primitive | Interactive color stops gradient creator |
| LayerPanel | Primitive | Graphic design layer tree with eye toggles |
| ColorPaletteBuilder | Primitive | Harmonious OKLCH palette generator |
| IconPicker | Primitive | Searchable grid of Lucide icons |
| EmojiPicker | Primitive | Categorized emoji search popover |
| DesignTokenEditor | Primitive | Live CSS variables / HSL editor with preview |

### 17. Category 17: Time & Scheduling (time-scheduling) — 12 Components

| Component | Tier | Description |
| :--- | :---: | :--- |
| JXTimeline | **Showcase** | Interactive Activity & Audit Feed |
| JXDatePicker, JXTimePicker & JXDateRangePicker | **Showcase** | Natural Language Parser + Quick Presets Calendar |
| SmartCalendar | Primitive | Natural language date picker and month grid |
| RangeCalendar | Primitive | Double-calendar selection for start/end dates |
| Timeline | Primitive | Chronological event line with status markers |
| GanttChart | Primitive | Project roadmap with dependency bars |
| Scheduler | Primitive | Day/week calendar time block organizer |
| TimePicker | Primitive | Hour and minute selector with timezone |
| DateRangePicker | Primitive | Popover field with preset quick ranges |
| AvailabilityGrid | Primitive | Weekly time slot matrix with drag selection |
| EventTimeline | Primitive | Activity feed with timestamps and user badges |
| CountdownTimer | Primitive | Real-time decreasing days, hours, mins, secs |

### 18. Category 18: Advanced Utilities (advanced-utilities) — 20 Components

| Component | Tier | Description |
| :--- | :---: | :--- |
| JXAvatar & JXAvatarGroup | **Showcase** | Presence & Interactive Stack |
| JXBadge | **Showcase** | Contextual Pulse & Odometer Count Pill |
| JXChip | **Showcase** | Interactive Status & Filter Pill |
| JXDivider | **Showcase** | Gradient & Action Divider |
| JXIcon & JXSvgIcon | **Showcase** | Duotone & Micro-Animated Icon Wrapper |
| JXList | **Showcase** | Inset Interactive List & Collapsible Tree |
| JXTooltip & JXHtmlTooltip | **Showcase** | Rich Interactive Preview Card |
| JXTypography | **Showcase** | Fluid Semantic Type System |
| JXTrafficSplitter | **Showcase** | Dynamic Color-Coded Canary Deployment Bar & Rollout Orchestrator |
| JXAudioWaveformScrubber | **Showcase** | 48-Bar Frequency Waveform Player & Speed Pill |
| InfiniteScroll | Primitive | Intersection sentinel triggering next batch |
| VirtualList | Primitive | Windowed list rendering only visible rows |
| ScrollProgress | Primitive | Top thin progress bar tracking page scroll |
| ScrollToTop | Primitive | Floating pill button appearing after scrolling |
| ImageLightbox | Primitive | Fullscreen zoomable image viewer with backdrop |
| ImageComparison | Primitive | Before/After slider dragging between 2 images |
| VideoPlayer | Primitive | Custom styled media player with tactile controls |
| AudioVisualizer | Primitive | Real-time frequency equalizer canvas animation |
| QRCodeGenerator | Primitive | Dynamic SVG QR code renderer with logo center |
| TourGuide | Primitive | Interactive step-by-step onboarding spotlight |



---

## 6. Zero-Shift Ergonomics & `useLockGeometry` Hook

To guarantee **CLS = 0** across custom state-morphing interactions:

```tsx
import React, { useState } from 'react';
import { useLockGeometry, tactile } from '@jacxishippingorg/jx-ui-react';

export function MorphingAction() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const { ref, style, recompute } = useLockGeometry({ dimension: 'width' });

  const trigger = async () => {
    tactile.playClick();
    setStatus('loading');
    await new Promise((r) => setTimeout(r, 1200));
    setStatus('success');
    tactile.playSuccess();
  };

  return (
    <button
      ref={ref}
      style={style}
      onClick={trigger}
      className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold transition-all duration-200 active:scale-95 touch-manipulation min-h-[44px]"
    >
      {status === 'idle' && 'Deploy Service'}
      {status === 'loading' && 'Verifying Nodes (0ms Reflow)...'}
      {status === 'success' && '✓ Deployed Successfully'}
    </button>
  );
}
```

---

## 7. Developer Tooling & Token Exporter

1. **W3C Design Tokens**: Full JSON & CSS variables export via `DesignTokenExporter`.
2. **Cmd+K Spotlight Search**: Fuzzy search across component names, keywords, and difficulty levels.
3. **Keyboard Shortcuts**: Press `?` anywhere in the app to view the accessibility cheatsheet.
4. **Live Code Copying**: Toggle between clean JSX import snippets and full raw TypeScript implementations.
