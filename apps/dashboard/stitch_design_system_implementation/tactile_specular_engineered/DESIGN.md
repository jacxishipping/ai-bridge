---
name: Tactile Specular Engineered
colors:
  surface: '#0f131d'
  surface-dim: '#0f131d'
  surface-bright: '#353944'
  surface-container-lowest: '#0a0e18'
  surface-container-low: '#171b26'
  surface-container: '#1c1f2a'
  surface-container-high: '#262a35'
  surface-container-highest: '#313540'
  on-surface: '#dfe2f1'
  on-surface-variant: '#c7c4d8'
  inverse-surface: '#dfe2f1'
  inverse-on-surface: '#2c303b'
  outline: '#918fa1'
  outline-variant: '#464555'
  surface-tint: '#c3c0ff'
  primary: '#c3c0ff'
  on-primary: '#1d00a5'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#4d44e3'
  secondary: '#d2bbff'
  on-secondary: '#3f008e'
  secondary-container: '#6001d1'
  on-secondary-container: '#c9aeff'
  tertiary: '#68dba9'
  on-tertiary: '#003825'
  tertiary-container: '#006e4c'
  on-tertiary-container: '#7df1bd'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#eaddff'
  secondary-fixed-dim: '#d2bbff'
  on-secondary-fixed: '#25005a'
  on-secondary-fixed-variant: '#5a00c6'
  tertiary-fixed: '#85f8c4'
  tertiary-fixed-dim: '#68dba9'
  on-tertiary-fixed: '#002114'
  on-tertiary-fixed-variant: '#005137'
  background: '#0f131d'
  on-background: '#dfe2f1'
  surface-variant: '#313540'
  accent-indigo: '#4f46e5'
  accent-violet: '#7c3aed'
  accent-emerald: '#059669'
  accent-rose: '#e11d48'
  accent-ocean: '#0284c7'
  surface-canvas: '#0B0F19'
  surface-elevated: '#111827'
  surface-shelf: '#1E293B'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 3.5rem
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: -0.03em
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 2.25rem
    fontWeight: '800'
    lineHeight: '1.15'
    letterSpacing: -0.025em
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 2.5rem
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 1.75rem
    fontWeight: '700'
    lineHeight: '1.25'
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 1.75rem
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 1.25rem
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 1.125rem
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: -0.005em
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 1rem
    fontWeight: '400'
    lineHeight: '1.5'
    letterSpacing: '0'
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: '1.5'
    letterSpacing: '0'
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 0.875rem
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 0.75rem
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: 0.02em
  mono-metric:
    fontFamily: JetBrains Mono
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  mono-code:
    fontFamily: JetBrains Mono
    fontSize: 0.8125rem
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: '0'
  mono-label:
    fontFamily: JetBrains Mono
    fontSize: 0.6875rem
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-md: 1.5rem
  gutter-lg: 2rem
  margin: 1rem
  margin-md: 2rem
  margin-lg: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system combines high-precision developer-grade utility with tactile physical realism. It rejects flat, lifeless digital interfaces in favor of an engineered material reality inspired by precision-machined hardware, frosted acrylics, and tactile kinematics. The aesthetic is tailored for technical professionals, enterprise operators, and demanding creative technologists who value speed, spatial clarity, and sensory feedback.

The system is governed by four core architectural invariants:
1. **Stable-State Geometry:** Zero Cumulative Layout Shift (CLS = 0). Dimensional stability is maintained across all dynamic loading, validation, and layout morphing states. Specular highlights and borders are drawn inside the element bounding box to preserve geometry.
2. **Tactile Physics & Motion:** Component interactions behave according to physical mass, tension, and compression. Elastic spring physics govern micro-interactions, accompanied by coordinated haptic and synthesized acoustic feedback.
3. **Specular Glassmorphism & Depth:** Surface hierarchy is communicated through directional light refraction, interior specular rims (`inset 0 1px 0 0`), and calibrated multi-layered drop shadows rather than flat border lines.
4. **WCAG 2.1 AA Accessibility:** All interactive controls maintain minimum target bounds of 44×44px, strict 4.5:1 text-to-surface contrast ratios, high-visibility focus halos, and non-reliant multisensory communication.

## Colors

The color architecture is built upon a 3-tier dark mode luminance hierarchy paired with five interchangeable chromatic accent palettes. Dark mode serves as the primary canvas to emphasize luminescence and specular reflections.

### Surface Luminance Tiers (Dark Mode)
- **Canvas (`#0B0F19`):** Root background viewport. Establishes the deepest optical plane.
- **Elevated Surfaces (`#111827`):** Primary structural layer used for content cards, dialog containers, bento grids, and floating surfaces.
- **Subtle Shelves (`#1E293B`):** Recessed containers, form inputs, toolbars, nested panels, and auxiliary controls embedded within elevated surfaces.

### Dynamic Accent Palettes
Accent palettes are dynamically switchable and drive all high-priority visual states (`--jx-accent` and `--jx-accent-halo`):
- **Indigo (`#4f46e5`):** Standard interactive core; communicates institutional stability, technical depth, and focused energy.
- **Violet (`#7c3aed`):** Expressive alternative; creative workflows and advanced command palettes.
- **Emerald (`#059669`):** Production environments, operational metrics, validation, and telemetry.
- **Rose (`#e11d48`):** High-criticality actions, alerts, destructive prompts, and high-impact states.
- **Ocean (`#0284c7`):** Analytical displays, telemetry panels, and information architecture.

Every accent mode requires an accompanying 30% alpha focus halo token (`--jx-accent-halo`) to enforce distinct, accessible interactive focus rings across all themes without masking underlying surface borders.

## Typography

The typographic system pairs the structural warmth and legibility of **Plus Jakarta Sans** with the mechanical exactness of **JetBrains Mono**.

### Primary Interface Typography (Plus Jakarta Sans)
Used across headings, navigational anchors, control labels, and body text. Fluid tracking adjustments tighten as font sizes expand, maintaining proportional optical density across display tiers. All button and control labels employ `label-md` or `label-sm` with a semi-bold weight (`600`) to guarantee contrast against saturated accent fills and dark backdrops.

### Numeric & Monospace Rule (JetBrains Mono)
Any dynamic numeric value—including counters, financial totals, timers, status flags, coordinates, and telemetry badges—must strictly render in **JetBrains Mono** with tabular numerals (`font-feature-settings: "tnum" 1`). This prevents horizontal visual jitter during real-time value transitions, reinforcing the CLS = 0 system invariant.

## Layout & Spacing

Layout geometry follows an 8px base rhythm with a 4px half-step sub-grid for dense micro-controls. Layout compositions follow a responsive 12-column fluid grid governed by rigid safe margins and internal bento grouping.

### Breakpoints & Adaptive Reflow
- **Mobile (< 768px):** 4 fluid columns, 1rem margins, 1rem gutters. Interactive components strictly expand to satisfy the touch-target invariant (`min-h-[44px]` and `min-w-[44px]`).
- **Tablet (768px – 1024px):** 8 fluid columns, 2rem margins, 1.5rem gutters. Sidebars collapse to icon-only rails or bottom docking trays.
- **Desktop (> 1024px):** 12 fluid columns, 3rem margins, 2rem gutters. Bento grids orchestrate multiple focal containers, with fixed or proportional panel distribution.

### Invariant Geometry Rules
Spacers and component paddings are fixed across loading and state transitions. Skeleton states, spinners, and form validation error slots must reserve their dedicated dimensions via layout locking utilities to prevent neighboring elements from shifting during user interactions.

## Elevation & Depth

Visual depth is achieved through **Specular Glassmorphism**, combining multi-layered ambient light attenuation with crisp, directional specular top highlights. This replicates physical bevels on CNC-milled acrylic plates.

### Specular Edge Construction
To prevent physical stroke widths from altering container dimensions (CLS = 0), all interior borders and surface chamfers are constructed with top-edge inset shadows (`inset 0 1px 0 0 [specular-color]`).

### Elevation Tiers

#### Tier 1: Controls & Secondary Surfaces (`.jx-elevation-1`)
Used for input boxes, segmented pills, standard buttons, and embedded toolbars.
- **Dark:**
  `box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.35), 0 1px 2px -1px rgba(0, 0, 0, 0.25), inset 0 1px 0 0 rgba(255, 255, 255, 0.06);`
- **Light:**
  `box-shadow: 0 2px 6px -1px rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.02), inset 0 1px 0 0 rgba(255, 255, 255, 0.8);`

#### Tier 2: Floating Cards & Dropdowns (`.jx-elevation-2`)
Used for bento cards, popovers, select dropdown menus, and flyout tooltips.
- **Dark:**
  `box-shadow: 0 10px 25px -4px rgba(0, 0, 0, 0.50), 0 4px 10px -2px rgba(0, 0, 0, 0.35), inset 0 1px 0 0 rgba(255, 255, 255, 0.08);`
- **Light:**
  `box-shadow: 0 10px 25px -4px rgba(15, 23, 42, 0.06), 0 4px 10px -2px rgba(15, 23, 42, 0.03), inset 0 1px 0 0 rgba(255, 255, 255, 0.85);`

#### Tier 3: Modals, Command Finder & Overlays (`.jx-elevation-3`)
Used for modals, the global command finder, toast stacks, and critical alerts.
- **Dark:**
  `box-shadow: 0 20px 40px -8px rgba(0, 0, 0, 0.65), 0 8px 16px -4px rgba(0, 0, 0, 0.45), inset 0 1px 0 0 rgba(255, 255, 255, 0.10);`
- **Light:**
  `box-shadow: 0 20px 40px -8px rgba(15, 23, 42, 0.10), 0 8px 16px -4px rgba(15, 23, 42, 0.04), inset 0 1px 0 0 rgba(255, 255, 255, 0.9);`

### Dynamic Luminescence (Spotlights)
Cards and interactive containers project an active radial spotlight gradient on hover (`radial-gradient(600px circle at var(--mouse-x) var(--mouse-y), rgba(255,255,255,0.04), transparent 40%)`), tracking mouse proximity to reveal micro-textures without distracting from textual content.

## Shapes

Corner rounding conveys physical finish and hierarchy. Components adhere strictly to five contextual corner radius tiers:

- **Sharp (`0px`):** Reserved for technical, high-density data tables, terminal shells, and industrial layouts.
- **Small (`8px`):** Form inputs, nested pills, tags, tooltips, and compact data-dense panels.
- **Medium (`12px`):** Default standard tier. Applied to standard buttons, select triggers, cards, and list groups.
- **Large (`16px`):** Primary display cards, showcase containers, and elevated bento panels.
- **Ultra (`24px`):** Modals, prominent bottom action sheets, and focal command center wrappers.

To ensure nested curvature consistency, internal nested containers must adopt an inner corner radius calculated as $R_{\text{inner}} = R_{\text{outer}} - \text{padding}$, ensuring concentric arcs and eliminating visual optical warping.

## Components

### Buttons & Interactive Controls
- **Geometry & Insets:** Minimum target dimensions of 44×44px. Standard paddings are `px-4` (16px) and `py-2` (8px). Built with `rounded-xl` (or component tier), with specular top edge highlight (`inset 0 1px 0 0 rgba(255,255,255,0.2)` on solid colors).
- **Interactive Physics:** Tap/click states apply a mechanical spring compression scale (`active:scale-95`). Transitions execute via `cubic-bezier(0.22, 1, 0.36, 1)` with spring stiffness 400 and damping 25.
- **Focus Halos:** Keyboard navigation triggers `focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--jx-accent-halo)]` with zero border displacement.
- **Multisensory Feedback:** Primary clicks trigger an synthesized sine sweep (800Hz down to 320Hz over 40ms) and short mobile haptics (`navigator.vibrate([10])`).

### Cards & Bento Surfaces
- **Base Surface:** Dark mode uses elevated surface luminance (`#111827`) wrapped in Elevation Tier 2. 
- **Dividers:** Sub-panels avoid harsh physical border strokes, using hairline dividers (`rgba(255,255,255,0.06)`) or subtle shelf recesses (`#1E293B`).
- **Compression:** Hover activates dynamic spotlight luminescence; sustained clicks compress slightly (`active:scale-[0.98]`).

### Form Inputs & Text Areas
- **Surface & State:** Base fill sits on Subtle Shelf (`#1E293B`) with an inset top rim. Active focus transitions the border to `--jx-accent` with a soft glow ring.
- **Zero CLS Validation:** Validation icons and inline error messages sit in pre-allocated geometry slots. Error text animates via opacity rather than dynamic height expansion.

### Checkboxes, Radios & Switches
- **Target Boundaries:** Functional clickable surface strictly respects 44×44px touch envelopes, centered visually over a 20×20px check surface.
- **Checked State:** Transitions to the active theme accent fill with a high-contrast white glyph, settled by an elastic spring curve.

### Chips & Badges
- **Status Indicators:** Rendered with `JetBrains Mono` tabular figures for all numeric counters.
- **Fill Treatments:** Semi-transparent colored fills (`rgba(accent, 0.12)`) paired with high-contrast text and a hairline specular border.

### Command Finder & Dialogs
- **Backdrop:** Deep frosted acrylic blur (`backdrop-blur-md bg-black/60`).
- **Modal Container:** Employs Elevation Tier 3 with Ultra radius (`24px`). Keyboard shortcut indicators and navigational telemetry render in `mono-code` labels.