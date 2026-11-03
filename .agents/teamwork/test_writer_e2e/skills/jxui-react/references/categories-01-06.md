# JXUI Component Reference: Categories 1 to 6

## Category 1: Buttons & Actions (24 Components)

*Magnetic attraction, liquid gel morphing, zero-shift states, spring physics, and hold-to-confirm safeguards.*

### `<JXButton />`
- **Category**: Category 1: Buttons & Actions | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Morphing Tactile Button
- **MUI Flaw Addressed**: *ALL-CAPS text, dated ink ripple, layout shift when showing a loading spinner.*
- **JXUI Upgrade**: **Title Case typography, top specular highlight, press compression (scale 0.98), and 3-state inline morphing (idle -> loading -> success/error) with locked width.**

**Usage Example**:
```tsx
<JXButton
  variant="contained"
  color="primary"
  spring
  morphSuccess
  lockWidth
  onClick={async () => await deployRelease()}
>
  Deploy Production Build
</JXButton>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `checked` | `boolean` | `false` | Current toggle state. |
| `onToggle` | `(checked: boolean) => void` | `-` | Callback fired on spring state change. |

---

### `<JXButtonGroup />`
- **Category**: Category 1: Buttons & Actions | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Segmented Pill & Split Action Bar
- **MUI Flaw Addressed**: *Harsh 1px divider lines that overlap awkwardly on focus.*
- **JXUI Upgrade**: **Smooth floating sliding background pill indicator for active state, unified focus halo, and split-button dropdown support.**

**Usage Example**:
```tsx
<JXButtonGroup variant="segmented" activeId={view} onChange={setView}>
  <JXButton id="board">Kanban Board</JXButton>
  <JXButton id="timeline">Gantt Timeline</JXButton>
  <JXButton id="metrics">Velocity Metrics</JXButton>
</JXButtonGroup>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `checked` | `boolean` | `false` | Current toggle state. |
| `onToggle` | `(checked: boolean) => void` | `-` | Callback fired on spring state change. |

---

### `<JXFab />`
- **Category**: Category 1: Buttons & Actions | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Floating Action Island
- **MUI Flaw Addressed**: *Static circular button that covers mobile content.*
- **JXUI Upgrade**: **Dynamic scroll-aware morphing (collapses from extended pill with label into compact icon circle on scroll down), glassmorphic backdrop, and notification badge.**

**Usage Example**:
```tsx
<JXFab
  extended={!isScrolledDown}
  glass
  badgeCount={3}
  icon={<PlusIcon />}
  label="Create Issue"
/>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `checked` | `boolean` | `false` | Current toggle state. |
| `onToggle` | `(checked: boolean) => void` | `-` | Callback fired on spring state change. |

---

### `<JXToggleButtonGroup />`
- **Category**: Category 1: Buttons & Actions | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Animated Segmented Control
- **MUI Flaw Addressed**: *Flat boxy buttons with harsh borders.*
- **JXUI Upgrade**: **Inset recessed track (#F1F5F9) with an elevated white floating pill (elevation-1) that glides smoothly between active options.**

**Usage Example**:
```tsx
<JXToggleButtonGroup value={interval} exclusive onChange={setInterval}>
  <JXToggleButton value="24h">24 Hours</JXToggleButton>
  <JXToggleButton value="7d">7 Days</JXToggleButton>
  <JXToggleButton value="30d">30 Days</JXToggleButton>
</JXToggleButtonGroup>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `checked` | `boolean` | `false` | Current toggle state. |
| `onToggle` | `(checked: boolean) => void` | `-` | Callback fired on spring state change. |

---

### `<MagneticButton />`
- **Category**: Category 1: Buttons & Actions | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Cursor magnetic tracking with physics pull
- **MUI Flaw Addressed**: *Rigid static bounding box*
- **JXUI Upgrade**: **Elastic cursor gravitation**

**Usage Example**:
```tsx
<MagneticButton />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `checked` | `boolean` | `false` | Current toggle state. |
| `onToggle` | `(checked: boolean) => void` | `-` | Callback fired on spring state change. |

---

### `<LiquidButton />`
- **Category**: Category 1: Buttons & Actions | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Fluid morphing gel with specular highlights
- **MUI Flaw Addressed**: *Flat solid color fill*
- **JXUI Upgrade**: **Liquid specular sheen**

**Usage Example**:
```tsx
<LiquidButton />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `checked` | `boolean` | `false` | Current toggle state. |
| `onToggle` | `(checked: boolean) => void` | `-` | Callback fired on spring state change. |

---

### `<MorphButton />`
- **Category**: Category 1: Buttons & Actions | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Stable 3-state morphing (idle/load/success)
- **MUI Flaw Addressed**: *Layout jumps on spinner entrance*
- **JXUI Upgrade**: **Preserves dimensions during supported state changes**

**Usage Example**:
```tsx
<MorphButton />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `checked` | `boolean` | `false` | Current toggle state. |
| `onToggle` | `(checked: boolean) => void` | `-` | Callback fired on spring state change. |

---

### `<SpringButton />`
- **Category**: Category 1: Buttons & Actions | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Tactile spring scale on press
- **MUI Flaw Addressed**: *Abrupt linear transitions*
- **JXUI Upgrade**: **Cubic bezier spring release**

**Usage Example**:
```tsx
<SpringButton />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `checked` | `boolean` | `false` | Current toggle state. |
| `onToggle` | `(checked: boolean) => void` | `-` | Callback fired on spring state change. |

---

### `<RippleButton />`
- **Category**: Category 1: Buttons & Actions | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Upgraded coordinate wave ripple
- **MUI Flaw Addressed**: *Heavy DOM ripple nodes*
- **JXUI Upgrade**: **GPU-accelerated wave**

**Usage Example**:
```tsx
<RippleButton />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `checked` | `boolean` | `false` | Current toggle state. |
| `onToggle` | `(checked: boolean) => void` | `-` | Callback fired on spring state change. |

---

### `<GlowButton />`
- **Category**: Category 1: Buttons & Actions | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Dynamic luminescent drop glow
- **MUI Flaw Addressed**: *Static box shadow*
- **JXUI Upgrade**: **Palette-reactive glow**

**Usage Example**:
```tsx
<GlowButton />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `checked` | `boolean` | `false` | Current toggle state. |
| `onToggle` | `(checked: boolean) => void` | `-` | Callback fired on spring state change. |

---

### `<GradientButton />`
- **Category**: Category 1: Buttons & Actions | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Animated gradient sweep
- **MUI Flaw Addressed**: *CSS filter lag*
- **JXUI Upgrade**: **Hardware smooth gradient**

**Usage Example**:
```tsx
<GradientButton />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `checked` | `boolean` | `false` | Current toggle state. |
| `onToggle` | `(checked: boolean) => void` | `-` | Callback fired on spring state change. |

---

### `<ShimmerButton />`
- **Category**: Category 1: Buttons & Actions | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Continuous metallic sheen ray
- **MUI Flaw Addressed**: *Plain border*
- **JXUI Upgrade**: **Ray shimmer transition**

**Usage Example**:
```tsx
<ShimmerButton />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `checked` | `boolean` | `false` | Current toggle state. |
| `onToggle` | `(checked: boolean) => void` | `-` | Callback fired on spring state change. |

---

### `<ParticleButton />`
- **Category**: Category 1: Buttons & Actions | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Micro-burst particles on click
- **MUI Flaw Addressed**: *Static click*
- **JXUI Upgrade**: **Celebratory particle burst**

**Usage Example**:
```tsx
<ParticleButton />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `checked` | `boolean` | `false` | Current toggle state. |
| `onToggle` | `(checked: boolean) => void` | `-` | Callback fired on spring state change. |

---

### `<MagneticIconButton />`
- **Category**: Category 1: Buttons & Actions | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Circular icon button with magnetic snap
- **MUI Flaw Addressed**: *Standard icon button*
- **JXUI Upgrade**: **Tactile magnetic attraction**

**Usage Example**:
```tsx
<MagneticIconButton />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `checked` | `boolean` | `false` | Current toggle state. |
| `onToggle` | `(checked: boolean) => void` | `-` | Callback fired on spring state change. |

---

### `<HoldToConfirmButton />`
- **Category**: Category 1: Buttons & Actions | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Long-press safeguard progress fill
- **MUI Flaw Addressed**: *Accidental one-click destruction*
- **JXUI Upgrade**: **1.5s press confirmation**

**Usage Example**:
```tsx
<HoldToConfirmButton />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `checked` | `boolean` | `false` | Current toggle state. |
| `onToggle` | `(checked: boolean) => void` | `-` | Callback fired on spring state change. |

---

### `<SlideToAction />`
- **Category**: Category 1: Buttons & Actions | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Swipe slider pill to authorize action
- **MUI Flaw Addressed**: *Requires modal confirmation*
- **JXUI Upgrade**: **Smooth drag authorization**

**Usage Example**:
```tsx
<SlideToAction />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ExpandableButton />`
- **Category**: Category 1: Buttons & Actions | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Collapsed icon expanding on hover
- **MUI Flaw Addressed**: *Fixed text taking layout room*
- **JXUI Upgrade**: **Zero-shift fluid expansion**

**Usage Example**:
```tsx
<ExpandableButton />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `checked` | `boolean` | `false` | Current toggle state. |
| `onToggle` | `(checked: boolean) => void` | `-` | Callback fired on spring state change. |

---

### `<FloatingActionButton />`
- **Category**: Category 1: Buttons & Actions | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Elevated action button with spring pop
- **MUI Flaw Addressed**: *Rigid material elevation*
- **JXUI Upgrade**: **Tactile luminescence floating pill**

**Usage Example**:
```tsx
<FloatingActionButton />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `checked` | `boolean` | `false` | Current toggle state. |
| `onToggle` | `(checked: boolean) => void` | `-` | Callback fired on spring state change. |

---

### `<SpeedDial />`
- **Category**: Category 1: Buttons & Actions | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Radial / vertical secondary quick actions
- **MUI Flaw Addressed**: *Z-index collision issues*
- **JXUI Upgrade**: **Clean animated action stack**

**Usage Example**:
```tsx
<SpeedDial />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<SplitButton />`
- **Category**: Category 1: Buttons & Actions | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Primary action plus dropdown chevron
- **MUI Flaw Addressed**: *Awkward disconnected border*
- **JXUI Upgrade**: **Unified tactile split pill**

**Usage Example**:
```tsx
<SplitButton />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `checked` | `boolean` | `false` | Current toggle state. |
| `onToggle` | `(checked: boolean) => void` | `-` | Callback fired on spring state change. |

---

### `<AnimatedButtonGroup />`
- **Category**: Category 1: Buttons & Actions | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Connected segment group with sliding pill
- **MUI Flaw Addressed**: *Discrete jarring tab clicks*
- **JXUI Upgrade**: **Gliding active indicator**

**Usage Example**:
```tsx
<AnimatedButtonGroup />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `checked` | `boolean` | `false` | Current toggle state. |
| `onToggle` | `(checked: boolean) => void` | `-` | Callback fired on spring state change. |

---

### `<CommandButton />`
- **Category**: Category 1: Buttons & Actions | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Integrated keyboard shortcut badge
- **MUI Flaw Addressed**: *No shortcut affordance*
- **JXUI Upgrade**: **Embedded ⌘K badge**

**Usage Example**:
```tsx
<CommandButton />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `checked` | `boolean` | `false` | Current toggle state. |
| `onToggle` | `(checked: boolean) => void` | `-` | Callback fired on spring state change. |

---

### `<GestureButton />`
- **Category**: Category 1: Buttons & Actions | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Double-tap and swipe gesture trigger
- **MUI Flaw Addressed**: *Mouse-only assumption*
- **JXUI Upgrade**: **Multi-touch gesture support**

**Usage Example**:
```tsx
<GestureButton />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `checked` | `boolean` | `false` | Current toggle state. |
| `onToggle` | `(checked: boolean) => void` | `-` | Callback fired on spring state change. |

---

### `<MultiStateButton />`
- **Category**: Category 1: Buttons & Actions | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Status cycle through 4 workflow stages
- **MUI Flaw Addressed**: *Separate modal dropdown*
- **JXUI Upgrade**: **One-click tactile cycle**

**Usage Example**:
```tsx
<MultiStateButton />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `checked` | `boolean` | `false` | Current toggle state. |
| `onToggle` | `(checked: boolean) => void` | `-` | Callback fired on spring state change. |

---

## Category 2: Glassmorphism & Surfaces (24 Components)

*Specular reflections, multi-layer diffuse blurs, adaptive theme tinting, and spatial translucent workspaces.*

### `<JXAccordion />`
- **Category**: Category 2: Glassmorphism & Surfaces | **Tier**: `showcase` | **Difficulty**: `intermediate`
- **Subtitle**: Smooth Spring Disclosure
- **MUI Flaw Addressed**: *Sharp borders, jumping margins when expanded, clunky chevron rotation.*
- **JXUI Upgrade**: **Separated rounded bento cards or unified soft container, physics height animation, custom + / × morph icon, and subtitle metadata in header.**

**Usage Example**:
```tsx
<JXAccordion variant="bento" iconMode="plus-cross" items={faqItems} />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<JXAppBar />`
- **Category**: Category 2: Glassmorphism & Surfaces | **Tier**: `showcase` | **Difficulty**: `intermediate`
- **Subtitle**: Floating Glass Navigation Header
- **MUI Flaw Addressed**: *Solid colored block glued to the top of the screen.*
- **JXUI Upgrade**: **Supports sticky frosted glass (backdrop-blur-md bg-white/75) or floating pill island mode (top-4 mx-auto rounded-2xl) with integrated ⌘K trigger.**

**Usage Example**:
```tsx
<JXAppBar mode="floating-island" glass commandShortcut="⌘K" />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<JXCard />`
- **Category**: Category 2: Glassmorphism & Surfaces | **Tier**: `showcase` | **Difficulty**: `intermediate`
- **Subtitle**: Bento Surface with Cursor Spotlight Glow
- **MUI Flaw Addressed**: *Basic white box with dated shadow.*
- **JXUI Upgrade**: **Bento-ready surface with subtle specular border, cursor-tracking radial spotlight glow on hover, interactive lift, and clean header/footer dividers.**

**Usage Example**:
```tsx
<JXCard spotlight hoverLift elevation={2}>
  <JXCardHeader title="Edge Inference Engine" subheader="Sub-15ms global p99" />
  <JXCardContent>...</JXCardContent>
</JXCard>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<JXPaper />`
- **Category**: Category 2: Glassmorphism & Surfaces | **Tier**: `showcase` | **Difficulty**: `intermediate`
- **Subtitle**: Semantic Layered Surface Primitive
- **MUI Flaw Addressed**: *Relies on 24 legacy Material shadow levels.*
- **JXUI Upgrade**: **Semantic surface hierarchy (surface="base" | "raised" | "overlay" | "glass" | "sunken"), specular inner highlights, and dark-mode luminance parity.**

**Usage Example**:
```tsx
<JXPaper surface="glass" specularBorder padding="lg">
  Translucent Frosted Surface
</JXPaper>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<LiquidGlass />`
- **Category**: Category 2: Glassmorphism & Surfaces | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Fluid dynamic blurred glass container
- **MUI Flaw Addressed**: *Opaque card surface*
- **JXUI Upgrade**: **Refractive backdrop blur**

**Usage Example**:
```tsx
<LiquidGlass />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<FrostedGlass />`
- **Category**: Category 2: Glassmorphism & Surfaces | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Deep diffuse blur with rim lighting
- **MUI Flaw Addressed**: *Flat gray background*
- **JXUI Upgrade**: **Specular border luminescence**

**Usage Example**:
```tsx
<FrostedGlass />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<AdaptiveGlass />`
- **Category**: Category 2: Glassmorphism & Surfaces | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Ambient theme-tinted glass surface
- **MUI Flaw Addressed**: *Hardcoded color tokens*
- **JXUI Upgrade**: **Palette-reactive glass**

**Usage Example**:
```tsx
<AdaptiveGlass />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<DynamicGlassPanel />`
- **Category**: Category 2: Glassmorphism & Surfaces | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Adjustable blur and opacity controls
- **MUI Flaw Addressed**: *Fixed CSS styling*
- **JXUI Upgrade**: **Real-time slider blur tuning**

**Usage Example**:
```tsx
<DynamicGlassPanel />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<GlassCard />`
- **Category**: Category 2: Glassmorphism & Surfaces | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Luminescent card with specular highlights
- **MUI Flaw Addressed**: *Heavy shadow borders*
- **JXUI Upgrade**: **Translucent depth layering**

**Usage Example**:
```tsx
<GlassCard />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<GlassNavbar />`
- **Category**: Category 2: Glassmorphism & Surfaces | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Floating pill glass header
- **MUI Flaw Addressed**: *Sticky opaque top bar*
- **JXUI Upgrade**: **Frosted floating island**

**Usage Example**:
```tsx
<GlassNavbar />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<GlassSidebar />`
- **Category**: Category 2: Glassmorphism & Surfaces | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Semi-transparent navigation sidebar
- **MUI Flaw Addressed**: *Solid blocking drawer*
- **JXUI Upgrade**: **Backdrop blur visibility**

**Usage Example**:
```tsx
<GlassSidebar />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<GlassModal />`
- **Category**: Category 2: Glassmorphism & Surfaces | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Refractive translucent dialog window
- **MUI Flaw Addressed**: *Harsh black overlay*
- **JXUI Upgrade**: **Diffuse ambient backdrop**

**Usage Example**:
```tsx
<GlassModal />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<GlassPopover />`
- **Category**: Category 2: Glassmorphism & Surfaces | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Lightweight translucent dropdown
- **MUI Flaw Addressed**: *Sharp white popover box*
- **JXUI Upgrade**: **Floating glass surface**

**Usage Example**:
```tsx
<GlassPopover />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<GlassTooltip />`
- **Category**: Category 2: Glassmorphism & Surfaces | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Micro frosted glass info label
- **MUI Flaw Addressed**: *Heavy dark tooltip badge*
- **JXUI Upgrade**: **Subtle translucent pill**

**Usage Example**:
```tsx
<GlassTooltip />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<GlassDock />`
- **Category**: Category 2: Glassmorphism & Surfaces | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: macOS-inspired glass icon shelf
- **MUI Flaw Addressed**: *Bottom toolbar*
- **JXUI Upgrade**: **Proximity floating dock**

**Usage Example**:
```tsx
<GlassDock />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<GlassToolbar />`
- **Category**: Category 2: Glassmorphism & Surfaces | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Compact floating glass action strip
- **MUI Flaw Addressed**: *Heavy action row*
- **JXUI Upgrade**: **Minimalist glass buttons**

**Usage Example**:
```tsx
<GlassToolbar />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<GlassNotification />`
- **Category**: Category 2: Glassmorphism & Surfaces | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Frosted glass alert banner
- **MUI Flaw Addressed**: *Opaque alert card*
- **JXUI Upgrade**: **Translucent notification card**

**Usage Example**:
```tsx
<GlassNotification />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<GlassInput />`
- **Category**: Category 2: Glassmorphism & Surfaces | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Glassmorphic input field with translucent fill
- **MUI Flaw Addressed**: *Solid white input box*
- **JXUI Upgrade**: **Frosted text container**

**Usage Example**:
```tsx
<GlassInput />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `value` | `string` | `-` | Controlled input string value. |
| `onChange` | `(val: string) => void` | `-` | Event handler triggered on user input. |
| `placeholder` | `string` | `'Enter value...'` | Accessible placeholder text. |

---

### `<GlassButton />`
- **Category**: Category 2: Glassmorphism & Surfaces | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Frosted glass press button
- **MUI Flaw Addressed**: *Material flat button*
- **JXUI Upgrade**: **Specular border press**

**Usage Example**:
```tsx
<GlassButton />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `checked` | `boolean` | `false` | Current toggle state. |
| `onToggle` | `(checked: boolean) => void` | `-` | Callback fired on spring state change. |

---

### `<GlassTabs />`
- **Category**: Category 2: Glassmorphism & Surfaces | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Glassmorphic pill segmented tabs
- **MUI Flaw Addressed**: *Underline tab bar*
- **JXUI Upgrade**: **Backdrop blur pill tabs**

**Usage Example**:
```tsx
<GlassTabs />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<GlassSheet />`
- **Category**: Category 2: Glassmorphism & Surfaces | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Sliding translucent inspector panel
- **MUI Flaw Addressed**: *Opaque right sidebar*
- **JXUI Upgrade**: **Glass property drawer**

**Usage Example**:
```tsx
<GlassSheet />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<GlassCommandMenu />`
- **Category**: Category 2: Glassmorphism & Surfaces | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Command launcher in frosted glass
- **MUI Flaw Addressed**: *Solid white dialog*
- **JXUI Upgrade**: **Spatial launcher interface**

**Usage Example**:
```tsx
<GlassCommandMenu />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<GlassFloatingPanel />`
- **Category**: Category 2: Glassmorphism & Surfaces | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Draggable floating performance widget
- **MUI Flaw Addressed**: *Fixed footer banner*
- **JXUI Upgrade**: **Detached glass widget**

**Usage Example**:
```tsx
<GlassFloatingPanel />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<SpatialGlassWorkspace />`
- **Category**: Category 2: Glassmorphism & Surfaces | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: 3D multi-layered glass plane container
- **MUI Flaw Addressed**: *Flat 2D grid*
- **JXUI Upgrade**: **Multi-plane spatial depth**

**Usage Example**:
```tsx
<SpatialGlassWorkspace />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

## Category 3: Navigation & Wayfinding (30 Components)

*Proximity docks, adaptive responsive navbars, radial satellite kinematics, and collapsible breadcrumbs.*

### `<JXBottomNavigation />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Floating Mobile Pill Dock
- **MUI Flaw Addressed**: *Full-width flat bottom bar with jumping label text.*
- **JXUI Upgrade**: **Floating frosted pill dock with sliding active background indicator, spring icon bounce, and tactile visual feedback.**

**Usage Example**:
```tsx
<JXBottomNavigation floatingDock value={tab} onChange={setTab} items={dockItems} />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<JXBreadcrumbs />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Collapsible Path Bar & Sibling Switcher
- **MUI Flaw Addressed**: *Static text links that wrap awkwardly on narrow screens.*
- **JXUI Upgrade**: **Interactive middle-item ellipsis dropdown menu (click ... to view hidden parent folders), folder icons, and sibling switcher on current crumb.**

**Usage Example**:
```tsx
<JXBreadcrumbs
  maxItems={3}
  items={pathHierarchy}
  siblingOptions={['Production', 'Staging', 'Preview']}
/>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<JXDrawer />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Floating Inset Sheet & Mini-Rail Sidebar
- **MUI Flaw Addressed**: *Sharp-edged panel that slams into the viewport edge.*
- **JXUI Upgrade**: **Supports Floating Inset Sheet mode (12px margin from viewport edges with rounded-2xl corners) and Mini-Rail Collapsible Sidebar with tooltip fallback.**

**Usage Example**:
```tsx
<JXDrawer variant="floating-inset" collapsibleRail open={open} onClose={close} />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<JXLink />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Animated Underline & Hover Preview Link
- **MUI Flaw Addressed**: *Basic anchor tag with browser underline.*
- **JXUI Upgrade**: **Smooth left-to-right animated underline bar, automatic external-link arrow icon (↗), and optional hover preview card.**

**Usage Example**:
```tsx
<JXLink href="https://mui.com" external previewCard={{ title: 'Architecture Spec', readTime: '3m' }}>
  Read RFC-042 Specification
</JXLink>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<JXMenu & JXMenuItem />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Nested Command & Context Menu
- **MUI Flaw Addressed**: *Large padding, slow transitions, no keyboard shortcut styling.*
- **JXUI Upgrade**: **Compact high-density rounded menu items, right-aligned <kbd> shortcut badges, destructive red item hover styling, and nested sub-menus.**

**Usage Example**:
```tsx
<JXMenu density="compact">
  <JXMenuItem icon={<CopyIcon />} shortcut="⌘C">Duplicate Component</JXMenuItem>
  <JXMenuItem destructive icon={<TrashIcon />} shortcut="⌘⌫">Delete Instance</JXMenuItem>
</JXMenu>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<JXPagination />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Smart Page Jumper & Summary Bar
- **MUI Flaw Addressed**: *Just a row of numbered circles/squares.*
- **JXUI Upgrade**: **Sliding active page indicator, integrated "Rows per page" selector, "Go to page #" quick input, and "Showing X–Y of Z" summary counter.**

**Usage Example**:
```tsx
<JXPagination
  count={12}
  page={page}
  rowsPerPage={25}
  totalItems={294}
  showQuickJumper
/>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<JXSpeedDial />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Staggered Quick Action Menu with Always-Visible Labels
- **MUI Flaw Addressed**: *Unlabeled mini-circles that require hovering each one to see what it does.*
- **JXUI Upgrade**: **Always-visible frosted glass labels next to each staggered action button, backdrop blur overlay when open, and smooth spring stagger.**

**Usage Example**:
```tsx
<JXSpeedDial alwaysShowLabels glassLabels actions={quickActions} />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<JXStepper />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Interactive Progress & Wizard Flow
- **MUI Flaw Addressed**: *Rigid circles and thin lines that break on mobile.*
- **JXUI Upgrade**: **Animated fill connector bars, clickable completed steps, error/warning badges, and a compact circular progress header mode for mobile screens.**

**Usage Example**:
```tsx
<JXStepper activeStep={step} clickableSteps mobileCompactRing steps={wizardSteps} />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<JXTabs & JXTab />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `showcase` | **Difficulty**: `intermediate`
- **Subtitle**: Sliding Pill & Underline Tabs
- **MUI Flaw Addressed**: *Rigid bottom bar and ALL-CAPS tab labels.*
- **JXUI Upgrade**: **Supports both a smooth sliding bottom indicator bar AND a soft pill background indicator, counter badges inside tabs, and natural Title Case.**

**Usage Example**:
```tsx
<JXTabs indicatorMode="pill" value={activeTab} onChange={setActiveTab}>
  <JXTab label="Overview" count={4} />
  <JXTab label="Deployments" count={18} />
  <JXTab label="Security Audit" />
</JXTabs>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<JXNavigationRail />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Compact Vertical App Rail (Missing in MUI Core)
- **MUI Flaw Addressed**: *Listed as "❌ No support" in standard Material UI.*
- **JXUI Upgrade**: **First-class vertical icon rail for desktop/tablet apps with active pill indicator, avatar footer, and expandable secondary panel.**

**Usage Example**:
```tsx
<JXNavigationRail
  activeId={section}
  onChange={setSection}
  expandableSecondaryPanel
  items={railItems}
/>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<MagneticDock />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Proximity-magnified icon dock
- **MUI Flaw Addressed**: *Static tab bar*
- **JXUI Upgrade**: **Cosine-bell cursor magnification**

**Usage Example**:
```tsx
<MagneticDock />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<FloatingDock />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Detached floating navigation pill
- **MUI Flaw Addressed**: *Sticky header*
- **JXUI Upgrade**: **Bottom-anchored island**

**Usage Example**:
```tsx
<FloatingDock />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<AdaptiveNavbar />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Responsive desktop/mobile hybrid header
- **MUI Flaw Addressed**: *Separate mobile menu code*
- **JXUI Upgrade**: **Unified fluid navbar**

**Usage Example**:
```tsx
<AdaptiveNavbar />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<MorphingNavbar />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Scroll-position dynamic contraction
- **MUI Flaw Addressed**: *Fixed height navbar*
- **JXUI Upgrade**: **Zero-shift smooth shrink**

**Usage Example**:
```tsx
<MorphingNavbar />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<AnimatedSidebar />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Sidebar with icon badges and expand spring
- **MUI Flaw Addressed**: *Rigid drawer*
- **JXUI Upgrade**: **Fluid width animation**

**Usage Example**:
```tsx
<AnimatedSidebar />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ExpandableSidebar />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Hover-expanding navigation rail
- **MUI Flaw Addressed**: *Click-only expansion*
- **JXUI Upgrade**: **Effortless hover reveal**

**Usage Example**:
```tsx
<ExpandableSidebar />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<CollapsibleNavigation />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Multi-level tree disclosure
- **MUI Flaw Addressed**: *Accordion clipping*
- **JXUI Upgrade**: **Smooth height interpolation**

**Usage Example**:
```tsx
<CollapsibleNavigation />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<MegaMenu />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Categorized multi-column dropdown panel
- **MUI Flaw Addressed**: *Basic select list*
- **JXUI Upgrade**: **Rich categorized showcase**

**Usage Example**:
```tsx
<MegaMenu />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<CommandNavigation />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Keyboard-first navigation bar
- **MUI Flaw Addressed**: *Mouse-only nav*
- **JXUI Upgrade**: **Integrated ⌘P affordance**

**Usage Example**:
```tsx
<CommandNavigation />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<BreadcrumbTrail />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Animated path breadcrumbs
- **MUI Flaw Addressed**: *Plain text / links*
- **JXUI Upgrade**: **Overflow-collapsed trail**

**Usage Example**:
```tsx
<BreadcrumbTrail />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<AnimatedTabs />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Sliding pill active indicator
- **MUI Flaw Addressed**: *Jumpy border line*
- **JXUI Upgrade**: **Smooth gliding active pill**

**Usage Example**:
```tsx
<AnimatedTabs />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<SlidingTabs />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Fluid underline indicator
- **MUI Flaw Addressed**: *Delayed CSS animation*
- **JXUI Upgrade**: **Hardware-accelerated sliding bar**

**Usage Example**:
```tsx
<SlidingTabs />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<NavigationRail />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Compact vertical app rail
- **MUI Flaw Addressed**: *Takes 240px screen width*
- **JXUI Upgrade**: **Minimalist 56px footprint**

**Usage Example**:
```tsx
<NavigationRail />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<FloatingTabBar />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Mobile floating bottom tab bar
- **MUI Flaw Addressed**: *Full-bleed opaque footer*
- **JXUI Upgrade**: **Floating glass capsule**

**Usage Example**:
```tsx
<FloatingTabBar />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<CircularNavigation />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Rotating ring navigation sectors
- **MUI Flaw Addressed**: *Horizontal only*
- **JXUI Upgrade**: **Radial 360° wayfinding**

**Usage Example**:
```tsx
<CircularNavigation />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<RadialMenu />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Pie menu expanding on click
- **MUI Flaw Addressed**: *Dropdown list*
- **JXUI Upgrade**: **Circular ergonomic reach**

**Usage Example**:
```tsx
<RadialMenu />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<OrbitalMenu />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Satellites orbiting trigger center
- **MUI Flaw Addressed**: *Linear menu*
- **JXUI Upgrade**: **Orbital physics layout**

**Usage Example**:
```tsx
<OrbitalMenu />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ContextNavigation />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Entity-sensitive contextual toolbar
- **MUI Flaw Addressed**: *Always visible dead buttons*
- **JXUI Upgrade**: **Appears only on selection**

**Usage Example**:
```tsx
<ContextNavigation />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<MultiLevelMenu />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Deep nested flyout without accidental close
- **MUI Flaw Addressed**: *Diagonal mouse exit closes menu*
- **JXUI Upgrade**: **Direction-aware hover triangle**

**Usage Example**:
```tsx
<MultiLevelMenu />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<GestureNavigation />`
- **Category**: Category 3: Navigation & Wayfinding | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Swipe left/right back-forward indicator
- **MUI Flaw Addressed**: *Button-only navigation*
- **JXUI Upgrade**: **Touch-first wayfinding**

**Usage Example**:
```tsx
<GestureNavigation />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

## Category 4: Inputs & Forms (32 Components)

*Zero-notch floating labels, OTP auto-advance, entropy meters, dual range sliders, and signature pads.*

### `<JXAutocomplete />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `showcase` | **Difficulty**: `advanced`
- **Subtitle**: Enhanced Autocomplete & Command Combobox
- **MUI Flaw Addressed**: *Clunky dropdown list, plain text options, jarring notched outline.*
- **JXUI Upgrade**: **Spotlight Command Palette UX (Cmd+K), fuzzy match highlighting, sticky frosted group headers, multi-select pills with Backspace delete.**

**Usage Example**:
```tsx
<JXAutocomplete
  label="Assign Reviewers & Channels"
  shortcut="⌘K"
  multiple
  fuzzyHighlight
  groupBy={(opt) => opt.department}
  options={teamMembers}
  renderOption={(opt) => <JXRichOption avatar={opt.avatar} meta={opt.role} />}
/>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `value` | `string` | `-` | Controlled input string value. |
| `onChange` | `(val: string) => void` | `-` | Event handler triggered on user input. |
| `placeholder` | `string` | `'Enter value...'` | Accessible placeholder text. |

---

### `<JXNumberField />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Tactile Stepper & Scrubbable Input
- **MUI Flaw Addressed**: *Relies on tiny browser spin buttons or basic Base UI composition.*
- **JXUI Upgrade**: **Integrated -/+ tactile buttons with hold acceleration, tabular numerals, unit prefix/suffix ($/%/kg), and horizontal drag-to-scrub on label.**

**Usage Example**:
```tsx
<JXNumberField
  label="Max Memory Allocation"
  value={memoryGb}
  onChange={setMemoryGb}
  min={1}
  max={128}
  unit="GB"
  scrubbableLabel
/>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `value` | `string` | `-` | Controlled input string value. |
| `onChange` | `(val: string) => void` | `-` | Event handler triggered on user input. |
| `placeholder` | `string` | `'Enter value...'` | Accessible placeholder text. |

---

### `<JXRating />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Expressive Micro-Animated Rating
- **MUI Flaw Addressed**: *Static stars with abrupt hover fills.*
- **JXUI Upgrade**: **Sequential wave-scale animation on hover, half-star precision, dynamic sentiment tooltip badge ("Needs Work" to "Exceptional"), and icon presets.**

**Usage Example**:
```tsx
<JXRating
  value={4.5}
  precision={0.5}
  showSentimentBadge
  preset="star"
  onChange={setRating}
/>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<JXSelect />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `showcase` | **Difficulty**: `intermediate`
- **Subtitle**: Rich Popover Select
- **MUI Flaw Addressed**: *Native-looking menu overlay that covers the trigger and lacks search.*
- **JXUI Upgrade**: **Anchored floating popover with spring entry, inline search filter, status dots/avatars inside options, and animated checkmark indicator.**

**Usage Example**:
```tsx
<JXSelect
  label="Deployment Region"
  searchable
  value={region}
  onChange={setRegion}
  options={regionsWithLatency}
/>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<JXSlider />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `showcase` | **Difficulty**: `intermediate`
- **Subtitle**: Precision Interactive Scrubber
- **MUI Flaw Addressed**: *Tiny thumb, basic tooltip, hard-to-read step marks.*
- **JXUI Upgrade**: **Thick rounded track with gradient fill, magnetic tick marks, live floating glass value pill with formatted units, and range histogram preview.**

**Usage Example**:
```tsx
<JXSlider
  label="Target Latency Threshold"
  value={latencyMs}
  onChange={setLatencyMs}
  min={10}
  max={500}
  unit="ms"
  showHistogram
  magneticMarks={[50, 100, 250, 400]}
/>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `min` | `number` | `0` | Minimum scalar bound. |
| `max` | `number` | `100` | Maximum scalar bound. |
| `value` | `number` | `50` | Current numerical value. |

---

### `<JXTextField />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Contextual Smart Input
- **MUI Flaw Addressed**: *Floating label cuts a physical notch through the top border; abrupt red error jump.*
- **JXUI Upgrade**: **Clean stacked or inner floating label (zero border notch), 3px focus halo, clear button, password visibility + real-time entropy bar, character ring, and copy action.**

**Usage Example**:
```tsx
<JXTextField
  label="Production Signing Secret"
  type="password"
  showEntropyMeter
  clearable
  copyable
  maxLength={64}
/>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `value` | `string` | `-` | Controlled input string value. |
| `onChange` | `(val: string) => void` | `-` | Event handler triggered on user input. |
| `placeholder` | `string` | `'Enter value...'` | Accessible placeholder text. |

---

### `<JXTransferList />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Dual-Pane Drag & Filter Shuttle
- **MUI Flaw Addressed**: *Clunky dual-checkbox boxes requiring multiple clicks to move items.*
- **JXUI Upgrade**: **Instant search filtering in both panes, one-click transfer on double-click, Move All action bar, and selected count badges.**

**Usage Example**:
```tsx
<JXTransferList
  leftTitle="Available Scopes"
  rightTitle="Granted Token Scopes"
  searchable
  doubleClickTransfer
  items={oauthScopes}
/>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<LiquidInput />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Fluid glowing border on active focus
- **MUI Flaw Addressed**: *Notched outline cutout*
- **JXUI Upgrade**: **Smooth liquid glow underline**

**Usage Example**:
```tsx
<LiquidInput />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `value` | `string` | `-` | Controlled input string value. |
| `onChange` | `(val: string) => void` | `-` | Event handler triggered on user input. |
| `placeholder` | `string` | `'Enter value...'` | Accessible placeholder text. |

---

### `<FloatingLabelInput />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Zero-notch smooth label transition
- **MUI Flaw Addressed**: *Text clipping label border*
- **JXUI Upgrade**: **Inset zero-shift label float**

**Usage Example**:
```tsx
<FloatingLabelInput />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `value` | `string` | `-` | Controlled input string value. |
| `onChange` | `(val: string) => void` | `-` | Event handler triggered on user input. |
| `placeholder` | `string` | `'Enter value...'` | Accessible placeholder text. |

---

### `<AnimatedInput />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Micro-animated icon reactions
- **MUI Flaw Addressed**: *Static icon adornment*
- **JXUI Upgrade**: **Focus scale and color reaction**

**Usage Example**:
```tsx
<AnimatedInput />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `value` | `string` | `-` | Controlled input string value. |
| `onChange` | `(val: string) => void` | `-` | Event handler triggered on user input. |
| `placeholder` | `string` | `'Enter value...'` | Accessible placeholder text. |

---

### `<FormGlassInput />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Frosted glass translucent input field
- **MUI Flaw Addressed**: *Solid white input box*
- **JXUI Upgrade**: **Frosted text container**

**Usage Example**:
```tsx
<FormGlassInput />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `value` | `string` | `-` | Controlled input string value. |
| `onChange` | `(val: string) => void` | `-` | Event handler triggered on user input. |
| `placeholder` | `string` | `'Enter value...'` | Accessible placeholder text. |

---

### `<MorphingInput />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Expands into multi-line textarea
- **MUI Flaw Addressed**: *Separate inputs required*
- **JXUI Upgrade**: **Smooth height morphing**

**Usage Example**:
```tsx
<MorphingInput />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `value` | `string` | `-` | Controlled input string value. |
| `onChange` | `(val: string) => void` | `-` | Event handler triggered on user input. |
| `placeholder` | `string` | `'Enter value...'` | Accessible placeholder text. |

---

### `<SearchInput />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Instant clear button and search hint
- **MUI Flaw Addressed**: *Basic input with startAdornment*
- **JXUI Upgrade**: **Debounced search field**

**Usage Example**:
```tsx
<SearchInput />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `value` | `string` | `-` | Controlled input string value. |
| `onChange` | `(val: string) => void` | `-` | Event handler triggered on user input. |
| `placeholder` | `string` | `'Enter value...'` | Accessible placeholder text. |

---

### `<SmartSearch />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Search with instant suggestion chips
- **MUI Flaw Addressed**: *Plain dropdown*
- **JXUI Upgrade**: **Categorized quick tags**

**Usage Example**:
```tsx
<SmartSearch />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<CommandInput />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Terminal prompt styled command field
- **MUI Flaw Addressed**: *Standard text field*
- **JXUI Upgrade**: **Hacker-grade dark prompt**

**Usage Example**:
```tsx
<CommandInput />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `value` | `string` | `-` | Controlled input string value. |
| `onChange` | `(val: string) => void` | `-` | Event handler triggered on user input. |
| `placeholder` | `string` | `'Enter value...'` | Accessible placeholder text. |

---

### `<AutoComplete />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Fuzzy-matched dropdown filter
- **MUI Flaw Addressed**: *Complex verbose boilerplate*
- **JXUI Upgrade**: **High-speed fuzzy ranker**

**Usage Example**:
```tsx
<AutoComplete />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `value` | `string` | `-` | Controlled input string value. |
| `onChange` | `(val: string) => void` | `-` | Event handler triggered on user input. |
| `placeholder` | `string` | `'Enter value...'` | Accessible placeholder text. |

---

### `<MultiSelect />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Removable tag-based multi-option selector
- **MUI Flaw Addressed**: *Clipped chips inside box*
- **JXUI Upgrade**: **Flowing tag wraps**

**Usage Example**:
```tsx
<MultiSelect />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<TagInput />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Freeform string tags with Enter key
- **MUI Flaw Addressed**: *Required external library*
- **JXUI Upgrade**: **Native keyboard tag input**

**Usage Example**:
```tsx
<TagInput />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `value` | `string` | `-` | Controlled input string value. |
| `onChange` | `(val: string) => void` | `-` | Event handler triggered on user input. |
| `placeholder` | `string` | `'Enter value...'` | Accessible placeholder text. |

---

### `<TokenInput />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: API key / token formatted field
- **MUI Flaw Addressed**: *Plain text string*
- **JXUI Upgrade**: **Monospace token badge**

**Usage Example**:
```tsx
<TokenInput />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `value` | `string` | `-` | Controlled input string value. |
| `onChange` | `(val: string) => void` | `-` | Event handler triggered on user input. |
| `placeholder` | `string` | `'Enter value...'` | Accessible placeholder text. |

---

### `<OTPInput />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: 6-digit one-time code auto-focus
- **MUI Flaw Addressed**: *Manual input splitting*
- **JXUI Upgrade**: **Auto-advance digit boxes**

**Usage Example**:
```tsx
<OTPInput />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `value` | `string` | `-` | Controlled input string value. |
| `onChange` | `(val: string) => void` | `-` | Event handler triggered on user input. |
| `placeholder` | `string` | `'Enter value...'` | Accessible placeholder text. |

---

### `<PinInput />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Masked secure PIN dots
- **MUI Flaw Addressed**: *Plain password field*
- **JXUI Upgrade**: **Individual visual pin dots**

**Usage Example**:
```tsx
<PinInput />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `value` | `string` | `-` | Controlled input string value. |
| `onChange` | `(val: string) => void` | `-` | Event handler triggered on user input. |
| `placeholder` | `string` | `'Enter value...'` | Accessible placeholder text. |

---

### `<PasswordStrength />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Real-time entropy meter and rules
- **MUI Flaw Addressed**: *No security feedback*
- **JXUI Upgrade**: **Color-coded entropy bar**

**Usage Example**:
```tsx
<PasswordStrength />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<PasswordReveal />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Eye toggle with security verification
- **MUI Flaw Addressed**: *Plain toggle button*
- **JXUI Upgrade**: **Tactile reveal with icon**

**Usage Example**:
```tsx
<PasswordReveal />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ColorPicker />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Hex swatch picker with instant pill
- **MUI Flaw Addressed**: *Browser native raw picker*
- **JXUI Upgrade**: **Curated token picker**

**Usage Example**:
```tsx
<ColorPicker />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<GradientPicker />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Dual-stop CSS gradient generator
- **MUI Flaw Addressed**: *Unsupported*
- **JXUI Upgrade**: **Real-time gradient preview**

**Usage Example**:
```tsx
<GradientPicker />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<RangeSlider />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Single scrubbable slider with percentage
- **MUI Flaw Addressed**: *Thumb offset misalignment*
- **JXUI Upgrade**: **Tactile scrub with tooltip**

**Usage Example**:
```tsx
<RangeSlider />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `min` | `number` | `0` | Minimum scalar bound. |
| `max` | `number` | `100` | Maximum scalar bound. |
| `value` | `number` | `50` | Current numerical value. |

---

### `<DualRangeSlider />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Min/max two-handle range slider
- **MUI Flaw Addressed**: *Handles collide and stick*
- **JXUI Upgrade**: **Collision-free dual handles**

**Usage Example**:
```tsx
<DualRangeSlider />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `min` | `number` | `0` | Minimum scalar bound. |
| `max` | `number` | `100` | Maximum scalar bound. |
| `value` | `number` | `50` | Current numerical value. |

---

### `<CircularSlider />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Dial knob rotating 0 to 360°
- **MUI Flaw Addressed**: *Horizontal only*
- **JXUI Upgrade**: **Radial knob ergonomics**

**Usage Example**:
```tsx
<CircularSlider />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `min` | `number` | `0` | Minimum scalar bound. |
| `max` | `number` | `100` | Maximum scalar bound. |
| `value` | `number` | `50` | Current numerical value. |

---

### `<MagneticSlider />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Handle snaps magnetically to tick marks
- **MUI Flaw Addressed**: *Discrete steps feel choppy*
- **JXUI Upgrade**: **Smooth snap physics**

**Usage Example**:
```tsx
<MagneticSlider />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `min` | `number` | `0` | Minimum scalar bound. |
| `max` | `number` | `100` | Maximum scalar bound. |
| `value` | `number` | `50` | Current numerical value. |

---

### `<SignaturePad />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Canvas drawing for digital signatures
- **MUI Flaw Addressed**: *External library needed*
- **JXUI Upgrade**: **Smooth vector path capture**

**Usage Example**:
```tsx
<SignaturePad />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<FormWizard />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Multi-step wizard with validation dots
- **MUI Flaw Addressed**: *Clunky stepper*
- **JXUI Upgrade**: **Zero-shift progress transition**

**Usage Example**:
```tsx
<FormWizard />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<DynamicFormBuilder />`
- **Category**: Category 4: Inputs & Forms | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Schema-driven JSON form generator
- **MUI Flaw Addressed**: *Manual JSX per field*
- **JXUI Upgrade**: **Instant JSON form engine**

**Usage Example**:
```tsx
<DynamicFormBuilder />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

## Category 5: Toggles & Selection (18 Components)

*Fluid morphing switches, animated drawing checkmarks, sliding segment pills, and selectable card surfaces.*

### `<JXCheckbox />`
- **Category**: Category 5: Toggles & Selection | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Animated SVG Spring Checkbox & Card Mode
- **MUI Flaw Addressed**: *Small hit target, rigid SVG tick, plain label alignment.*
- **JXUI Upgrade**: **Custom SVG stroke-dashoffset draw animation with spring bounce, indeterminate morph, and variant="card" selection cards.**

**Usage Example**:
```tsx
<JXCheckbox
  variant="card"
  checked={enabled}
  onChange={setEnabled}
  title="Edge Caching & Smart Routing"
  description="Replicate static assets across 310 global PoPs"
  badge="Included"
/>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<JXRadioGroup />`
- **Category**: Category 5: Toggles & Selection | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Bento Selection Cards & Sliding Pills
- **MUI Flaw Addressed**: *Dated circular radio dots stacked vertically.*
- **JXUI Upgrade**: **Supports spring radio dots, Linear-style sliding segmented pills, and rich Bento Radio Cards with icons, pricing right-alignment, and active ring highlights.**

**Usage Example**:
```tsx
<JXRadioGroup variant="bento-cards" value={plan} onChange={setPlan}>
  <JXRadioCard value="pro" title="Pro Cluster" price="$49/mo" meta="16 vCPU · 64 GB RAM" />
  <JXRadioCard value="enterprise" title="Dedicated Metal" price="$199/mo" meta="64 vCPU · 256 GB RAM" />
</JXRadioGroup>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<JXSwitch />`
- **Category**: Category 5: Toggles & Selection | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Tactile Spring Toggle & Setting Row
- **MUI Flaw Addressed**: *Ugly thumb overhang track design from older Material specs.*
- **JXUI Upgrade**: **Enclosed pill track with fluid thumb stretch on press, embedded on/off micro-icons inside track, and card mode settings row.**

**Usage Example**:
```tsx
<JXSwitch
  cardMode
  trackIcons
  checked={zeroDowntime}
  onChange={setZeroDowntime}
  label="Zero-Downtime Blue/Green Swaps"
  helperText="Automatically verify health probes before shifting traffic"
/>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `checked` | `boolean` | `false` | Current toggle state. |
| `onToggle` | `(checked: boolean) => void` | `-` | Callback fired on spring state change. |

---

### `<LiquidSwitch />`
- **Category**: Category 5: Toggles & Selection | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Fluid morphing toggle switch
- **MUI Flaw Addressed**: *Mechanical jumpy switch*
- **JXUI Upgrade**: **Liquid gel thumb slide**

**Usage Example**:
```tsx
<LiquidSwitch />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `checked` | `boolean` | `false` | Current toggle state. |
| `onToggle` | `(checked: boolean) => void` | `-` | Callback fired on spring state change. |

---

### `<MorphSwitch />`
- **Category**: Category 5: Toggles & Selection | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Thumb morphs between check and cross
- **MUI Flaw Addressed**: *Plain circle thumb*
- **JXUI Upgrade**: **Visual icon state morph**

**Usage Example**:
```tsx
<MorphSwitch />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `checked` | `boolean` | `false` | Current toggle state. |
| `onToggle` | `(checked: boolean) => void` | `-` | Callback fired on spring state change. |

---

### `<MagneticSwitch />`
- **Category**: Category 5: Toggles & Selection | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Magnetic spring snap to on/off state
- **MUI Flaw Addressed**: *Linear thumb transition*
- **JXUI Upgrade**: **Spring snap damping**

**Usage Example**:
```tsx
<MagneticSwitch />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `checked` | `boolean` | `false` | Current toggle state. |
| `onToggle` | `(checked: boolean) => void` | `-` | Callback fired on spring state change. |

---

### `<AnimatedCheckbox />`
- **Category**: Category 5: Toggles & Selection | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: SVG checkmark draws on select
- **MUI Flaw Addressed**: *Instant raster jump*
- **JXUI Upgrade**: **Path draw animation**

**Usage Example**:
```tsx
<AnimatedCheckbox />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<GlassCheckbox />`
- **Category**: Category 5: Toggles & Selection | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Frosted glass translucent checkbox
- **MUI Flaw Addressed**: *Solid material checkbox*
- **JXUI Upgrade**: **Luminescent glass fill**

**Usage Example**:
```tsx
<GlassCheckbox />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<CircularCheckbox />`
- **Category**: Category 5: Toggles & Selection | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Round radio-style checkbox with dot
- **MUI Flaw Addressed**: *Confused with radio buttons*
- **JXUI Upgrade**: **Distinct multi-select ring**

**Usage Example**:
```tsx
<CircularCheckbox />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<AnimatedRadio />`
- **Category**: Category 5: Toggles & Selection | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Expanding ripple wave on selection
- **MUI Flaw Addressed**: *Static inner circle*
- **JXUI Upgrade**: **Scale-in tactile dot**

**Usage Example**:
```tsx
<AnimatedRadio />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<SegmentedControl />`
- **Category**: Category 5: Toggles & Selection | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Multi-option pill selection bar
- **MUI Flaw Addressed**: *Separate button group*
- **JXUI Upgrade**: **Unified sliding pill**

**Usage Example**:
```tsx
<SegmentedControl />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<SlidingSegmentedControl />`
- **Category**: Category 5: Toggles & Selection | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Gliding active background indicator
- **MUI Flaw Addressed**: *Abrupt background toggle*
- **JXUI Upgrade**: **Hardware sliding surface**

**Usage Example**:
```tsx
<SlidingSegmentedControl />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<SelectableCard />`
- **Category**: Category 5: Toggles & Selection | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Card with selected border and checkmark
- **MUI Flaw Addressed**: *Plain clickable card*
- **JXUI Upgrade**: **Checked state feedback**

**Usage Example**:
```tsx
<SelectableCard />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<SelectionGrid />`
- **Category**: Category 5: Toggles & Selection | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Multi-card selection grid with counter
- **MUI Flaw Addressed**: *Manual array handling*
- **JXUI Upgrade**: **Built-in selection state**

**Usage Example**:
```tsx
<SelectionGrid />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<MultiStateToggle />`
- **Category**: Category 5: Toggles & Selection | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: 3-state workflow toggle (Off/Eco/Turbo)
- **MUI Flaw Addressed**: *Binary only*
- **JXUI Upgrade**: **Multi-state cycle**

**Usage Example**:
```tsx
<MultiStateToggle />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `checked` | `boolean` | `false` | Current toggle state. |
| `onToggle` | `(checked: boolean) => void` | `-` | Callback fired on spring state change. |

---

### `<TriStateToggle />`
- **Category**: Category 5: Toggles & Selection | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: True / Indeterminate / False toggle
- **MUI Flaw Addressed**: *Clunky indeterminate icon*
- **JXUI Upgrade**: **Minus/Check/Empty cycle**

**Usage Example**:
```tsx
<TriStateToggle />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |
| `checked` | `boolean` | `false` | Current toggle state. |
| `onToggle` | `(checked: boolean) => void` | `-` | Callback fired on spring state change. |

---

### `<GestureSelector />`
- **Category**: Category 5: Toggles & Selection | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Swipe left/right to toggle
- **MUI Flaw Addressed**: *Click only*
- **JXUI Upgrade**: **Touch swipe detection**

**Usage Example**:
```tsx
<GestureSelector />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<FloatingSelectionBar />`
- **Category**: Category 5: Toggles & Selection | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Bulk action bar on item selection
- **MUI Flaw Addressed**: *Takes permanent header space*
- **JXUI Upgrade**: **Floats only when items picked**

**Usage Example**:
```tsx
<FloatingSelectionBar />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

## Category 6: Modals & Overlays (22 Components)

*Geometric morphing dialogs, spring physics modals, magnetic snap sheets, and spotlight search palettes.*

### `<JXBackdrop />`
- **Category**: Category 6: Modals & Overlays | **Tier**: `showcase` | **Difficulty**: `intermediate`
- **Subtitle**: Frosted Glass Scrim
- **MUI Flaw Addressed**: *Flat rgba(0,0,0,0.5) dark overlay.*
- **JXUI Upgrade**: **Progressive backdrop-filter: blur(8px) with subtle surface tint and smooth spring opacity transition.**

**Usage Example**:
```tsx
<JXBackdrop open={isSyncing} blur="md" glassTint="slate">
  <JXCircularProgress label="Synchronizing state..." />
</JXBackdrop>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<JXDialog />`
- **Category**: Category 6: Modals & Overlays | **Tier**: `showcase` | **Difficulty**: `intermediate`
- **Subtitle**: Spring Modal & Command Sheet
- **MUI Flaw Addressed**: *Boxy white rectangle with harsh drop shadow and cramped action footer.*
- **JXUI Upgrade**: **24px rounded corners, frosted glass header/footer, bottom-sheet morph on mobile, and destructive confirmation shake protection.**

**Usage Example**:
```tsx
<JXDialog
  open={open}
  onClose={handleClose}
  title="Rotate Production API Keys"
  destructiveGuard
  glassFooter
/>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<MorphingModal />`
- **Category**: Category 6: Modals & Overlays | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Expands smoothly from trigger element
- **MUI Flaw Addressed**: *Appears from screen center*
- **JXUI Upgrade**: **Zero-shift geometric morph**

**Usage Example**:
```tsx
<MorphingModal />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<LiquidDialog />`
- **Category**: Category 6: Modals & Overlays | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Viscous spring backdrop blur modal
- **MUI Flaw Addressed**: *Heavy dark backdrop*
- **JXUI Upgrade**: **Liquid ambient refraction**

**Usage Example**:
```tsx
<LiquidDialog />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<GlassDialog />`
- **Category**: Category 6: Modals & Overlays | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Specular reflections on translucent modal
- **MUI Flaw Addressed**: *Solid white box*
- **JXUI Upgrade**: **Multi-layer glass reflection**

**Usage Example**:
```tsx
<GlassDialog />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<SpringModal />`
- **Category**: Category 6: Modals & Overlays | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Physics bouncy entrance modal
- **MUI Flaw Addressed**: *Linear fade-in*
- **JXUI Upgrade**: **Cubic-bezier spring pop**

**Usage Example**:
```tsx
<SpringModal />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<FullscreenModal />`
- **Category**: Category 6: Modals & Overlays | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Complete viewport overlay with escape bar
- **MUI Flaw Addressed**: *Clunky page takeover*
- **JXUI Upgrade**: **Clean immersive viewport**

**Usage Example**:
```tsx
<FullscreenModal />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<Drawer />`
- **Category**: Category 6: Modals & Overlays | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Edge slide-out right drawer
- **MUI Flaw Addressed**: *Stiff side drawer*
- **JXUI Upgrade**: **Smooth transform drawer**

**Usage Example**:
```tsx
<Drawer />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<MagneticDrawer />`
- **Category**: Category 6: Modals & Overlays | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Snaps magnetically to 30%, 60%, 100%
- **MUI Flaw Addressed**: *Binary open/close*
- **JXUI Upgrade**: **3 magnetic height detents**

**Usage Example**:
```tsx
<MagneticDrawer />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<BottomSheet />`
- **Category**: Category 6: Modals & Overlays | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Mobile bottom sheet with grab handle
- **MUI Flaw Addressed**: *Desktop modal on mobile*
- **JXUI Upgrade**: **Thumb-friendly bottom sheet**

**Usage Example**:
```tsx
<BottomSheet />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<InteractiveBottomSheet />`
- **Category**: Category 6: Modals & Overlays | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Drag down to dismiss bottom sheet
- **MUI Flaw Addressed**: *Must click backdrop*
- **JXUI Upgrade**: **Natural drag-to-dismiss**

**Usage Example**:
```tsx
<InteractiveBottomSheet />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<FloatingPanel />`
- **Category**: Category 6: Modals & Overlays | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Draggable window-style floating overlay
- **MUI Flaw Addressed**: *Locked in DOM tree*
- **JXUI Upgrade**: **Detached floating widget**

**Usage Example**:
```tsx
<FloatingPanel />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ResizablePanel />`
- **Category**: Category 6: Modals & Overlays | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Corner-resizable overlay panel
- **MUI Flaw Addressed**: *Fixed dimensions*
- **JXUI Upgrade**: **Draggable corner resize handle**

**Usage Example**:
```tsx
<ResizablePanel />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<SpotlightOverlay />`
- **Category**: Category 6: Modals & Overlays | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Dimmed backdrop focusing on single element
- **MUI Flaw Addressed**: *Blocks entire screen*
- **JXUI Upgrade**: **Guided spotlight cutout**

**Usage Example**:
```tsx
<SpotlightOverlay />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ContextMenu />`
- **Category**: Category 6: Modals & Overlays | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Desktop right-click contextual list
- **MUI Flaw Addressed**: *Browser raw menu*
- **JXUI Upgrade**: **Sleek custom context actions**

**Usage Example**:
```tsx
<ContextMenu />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<RadialContextMenu />`
- **Category**: Category 6: Modals & Overlays | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Circular right-click pie options
- **MUI Flaw Addressed**: *Vertical menu only*
- **JXUI Upgrade**: **Ergonomic 360° pie options**

**Usage Example**:
```tsx
<RadialContextMenu />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<SmartPopover />`
- **Category**: Category 6: Modals & Overlays | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Collision-detecting anchor popover
- **MUI Flaw Addressed**: *Overlaps screen boundaries*
- **JXUI Upgrade**: **Auto flip & reposition**

**Usage Example**:
```tsx
<SmartPopover />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<InteractiveTooltip />`
- **Category**: Category 6: Modals & Overlays | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Tooltip allowing mouse hover & links
- **MUI Flaw Addressed**: *Disappears immediately on hover*
- **JXUI Upgrade**: **Interactive hover corridor**

**Usage Example**:
```tsx
<InteractiveTooltip />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<HoverCard />`
- **Category**: Category 6: Modals & Overlays | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Rich preview card on link hover
- **MUI Flaw Addressed**: *Plain text tooltip*
- **JXUI Upgrade**: **Rich media preview card**

**Usage Example**:
```tsx
<HoverCard />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<CommandPalette />`
- **Category**: Category 6: Modals & Overlays | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Cmd+K style keyboard search and launcher
- **MUI Flaw Addressed**: *Unstyled search input*
- **JXUI Upgrade**: **Fuzzy-ranked launcher**

**Usage Example**:
```tsx
<CommandPalette />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<SpotlightSearch />`
- **Category**: Category 6: Modals & Overlays | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Fullscreen centered spotlight search
- **MUI Flaw Addressed**: *Tiny top search bar*
- **JXUI Upgrade**: **Command center spotlight**

**Usage Example**:
```tsx
<SpotlightSearch />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<OverlayStack />`
- **Category**: Category 6: Modals & Overlays | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Multi-layer z-index stacked dialog manager
- **MUI Flaw Addressed**: *Z-index conflicts and clipping*
- **JXUI Upgrade**: **Deterministic LIFO stack**

**Usage Example**:
```tsx
<OverlayStack />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

