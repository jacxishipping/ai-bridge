# JXUI Component Reference: Categories 7 to 12

## Category 7: Notifications & Feedback (17 Components)

*3D stacked toast queues with promise morphing, live island activity pills, undo action bars, and celebration bursts.*

### `<JXAlert />`
- **Category**: Category 7: Notifications & Feedback | **Tier**: `showcase` | **Difficulty**: `intermediate`
- **Subtitle**: Actionable Callout Banner
- **MUI Flaw Addressed**: *Flat colored box with basic icon.*
- **JXUI Upgrade**: **Soft tinted surface with subtle border glow, custom duotone status icon badge, collapsible "View technical details" drawer, and inline actions.**

**Usage Example**:
```tsx
<JXAlert
  severity="warning"
  title="API Rate Limit Approaching (88%)"
  technicalDetails="X-RateLimit-Remaining: 120 / 1000 · Reset in 42s"
  primaryAction={{ label: 'Upgrade Quota', onClick: upgrade }}
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

### `<JXSnackbar />`
- **Category**: Category 7: Notifications & Feedback | **Tier**: `showcase` | **Difficulty**: `intermediate`
- **Subtitle**: Sonner-Style 3D Stacked Toast System
- **MUI Flaw Addressed**: *Single flat black bar at the bottom corner; no stacking or promise states.*
- **JXUI Upgrade**: **Multi-toast 3D spatial stack (expands into list on hover), built-in promise() state morphing (Loading -> Success), pause-on-hover, and inline Undo.**

**Usage Example**:
```tsx
const { pushToast, triggerPromiseToast } = useJXSnackbar();
triggerPromiseToast('Database Migration #402');
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<SmartToast />`
- **Category**: Category 7: Notifications & Feedback | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Countdown timer bar and undo callback
- **MUI Flaw Addressed**: *Disappears without undo*
- **JXUI Upgrade**: **Instant undo recovery**

**Usage Example**:
```tsx
<SmartToast />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<NotificationStack />`
- **Category**: Category 7: Notifications & Feedback | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: 3D stacked toasts with hover expansion
- **MUI Flaw Addressed**: *Toasts overlap and obscure content*
- **JXUI Upgrade**: **3D card deck with hover expand**

**Usage Example**:
```tsx
<NotificationStack />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<NotificationCenter />`
- **Category**: Category 7: Notifications & Feedback | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Full panel history of system events
- **MUI Flaw Addressed**: *No event archive*
- **JXUI Upgrade**: **Searchable audit drawer**

**Usage Example**:
```tsx
<NotificationCenter />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<FeedbackGlassNotification />`
- **Category**: Category 7: Notifications & Feedback | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Frosted glass alert toast banner
- **MUI Flaw Addressed**: *Solid opaque banner*
- **JXUI Upgrade**: **Luminescent translucent toast**

**Usage Example**:
```tsx
<FeedbackGlassNotification />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<AnimatedAlert />`
- **Category**: Category 7: Notifications & Feedback | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Entrance slide and pulsing status icon
- **MUI Flaw Addressed**: *Static color box*
- **JXUI Upgrade**: **Gentle pulse alert**

**Usage Example**:
```tsx
<AnimatedAlert />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<InlineAlert />`
- **Category**: Category 7: Notifications & Feedback | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Compact embedded message strip
- **MUI Flaw Addressed**: *Bulky full-width banner*
- **JXUI Upgrade**: **Clean accent-bordered strip**

**Usage Example**:
```tsx
<InlineAlert />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<SmartBanner />`
- **Category**: Category 7: Notifications & Feedback | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Dismissible sticky top banner
- **MUI Flaw Addressed**: *Shifts layout downwards*
- **JXUI Upgrade**: **Smooth height expansion**

**Usage Example**:
```tsx
<SmartBanner />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ProgressToast />`
- **Category**: Category 7: Notifications & Feedback | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Toast displaying live percentage progress
- **MUI Flaw Addressed**: *Static loading spinner*
- **JXUI Upgrade**: **Precise percentage bar**

**Usage Example**:
```tsx
<ProgressToast />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<UndoNotification />`
- **Category**: Category 7: Notifications & Feedback | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Notification with instant undo action button
- **MUI Flaw Addressed**: *Destructive action permanent*
- **JXUI Upgrade**: **5-second undo window**

**Usage Example**:
```tsx
<UndoNotification />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<LiveActivity />`
- **Category**: Category 7: Notifications & Feedback | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Dynamic island pill with live state
- **MUI Flaw Addressed**: *Unobtrusive status hidden*
- **JXUI Upgrade**: **Island capsule indicator**

**Usage Example**:
```tsx
<LiveActivity />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<StatusIndicator />`
- **Category**: Category 7: Notifications & Feedback | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Colored dot with optional pulsing halo
- **MUI Flaw Addressed**: *Text-only label*
- **JXUI Upgrade**: **Visual radar indicator**

**Usage Example**:
```tsx
<StatusIndicator />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<PulseIndicator />`
- **Category**: Category 7: Notifications & Feedback | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Concentric ripple rings around status marker
- **MUI Flaw Addressed**: *Static circle*
- **JXUI Upgrade**: **Active heartbeat pulse**

**Usage Example**:
```tsx
<PulseIndicator />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ConnectionStatus />`
- **Category**: Category 7: Notifications & Feedback | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Real-time online/offline indicator
- **MUI Flaw Addressed**: *Hidden network failures*
- **JXUI Upgrade**: **Immediate websocket badge**

**Usage Example**:
```tsx
<ConnectionStatus />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<SuccessCelebration />`
- **Category**: Category 7: Notifications & Feedback | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Confetti burst animation overlay
- **MUI Flaw Addressed**: *Plain green banner*
- **JXUI Upgrade**: **Celebratory particle burst**

**Usage Example**:
```tsx
<SuccessCelebration />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ErrorBoundaryFallback />`
- **Category**: Category 7: Notifications & Feedback | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Resilient error screen with retry CTA
- **MUI Flaw Addressed**: *White screen of death*
- **JXUI Upgrade**: **Safe graceful fallback**

**Usage Example**:
```tsx
<ErrorBoundaryFallback />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

## Category 8: Loading & Progress (17 Components)

*Shape-shifting geometric loaders, orbital kinematics, shimmer skeleton placeholders, and circular progress rings.*

### `<JXProgress (Linear & Circular) />`
- **Category**: Category 8: Loading & Progress | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Shimmer Track & Completion Morph
- **MUI Flaw Addressed**: *Dated indeterminate bar animation and zero built-in labels.*
- **JXUI Upgrade**: **Smooth gradient shimmer track, built-in percentage readout and ETA label, stepped progress segments, and morph into a completion badge at 100%.**

**Usage Example**:
```tsx
<JXLinearProgress
  value={progress}
  showValueLabel
  eta="12s remaining"
  morphOnComplete
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

### `<JXSkeleton />`
- **Category**: Category 8: Loading & Progress | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Layout-Aware Shimmer Placeholder
- **MUI Flaw Addressed**: *Basic gray blocks that require manual stacking.*
- **JXUI Upgrade**: **Diagonal silky light shimmer wave plus ready-made composite presets (preset="card" | "table-row" | "profile" | "chart").**

**Usage Example**:
```tsx
<JXSkeleton preset="card" shimmer="wave" count={1} />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<LiquidLoader />`
- **Category**: Category 8: Loading & Progress | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Fluid viscous pulsing gel loader
- **MUI Flaw Addressed**: *Standard blue spinning wheel*
- **JXUI Upgrade**: **Viscous organic gel pulse**

**Usage Example**:
```tsx
<LiquidLoader />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<MorphingLoader />`
- **Category**: Category 8: Loading & Progress | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Geometric shape shifting (circle/square)
- **MUI Flaw Addressed**: *Repetitive spinner*
- **JXUI Upgrade**: **Geometric shape morph**

**Usage Example**:
```tsx
<MorphingLoader />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<OrbitalLoader />`
- **Category**: Category 8: Loading & Progress | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Planetary orbiting dots loader
- **MUI Flaw Addressed**: *Basic spinner*
- **JXUI Upgrade**: **Dual-planet orbit**

**Usage Example**:
```tsx
<OrbitalLoader />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ParticleLoader />`
- **Category**: Category 8: Loading & Progress | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Swirling particle vortex
- **MUI Flaw Addressed**: *Static dots*
- **JXUI Upgrade**: **Cascading bounce particles**

**Usage Example**:
```tsx
<ParticleLoader />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<WaveLoader />`
- **Category**: Category 8: Loading & Progress | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Audio equalizer undulating bars
- **MUI Flaw Addressed**: *Generic loading bar*
- **JXUI Upgrade**: **Dynamic waveform equalizer**

**Usage Example**:
```tsx
<WaveLoader />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<GradientLoader />`
- **Category**: Category 8: Loading & Progress | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Conic gradient spinning ring
- **MUI Flaw Addressed**: *Single color circle*
- **JXUI Upgrade**: **Dual-tone gradient sweep**

**Usage Example**:
```tsx
<GradientLoader />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<SkeletonCard />`
- **Category**: Category 8: Loading & Progress | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Shimmer placeholder matching card shape
- **MUI Flaw Addressed**: *Gray rectangle*
- **JXUI Upgrade**: **Exact geometry shimmer wave**

**Usage Example**:
```tsx
<SkeletonCard />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<SkeletonTable />`
- **Category**: Category 8: Loading & Progress | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Shimmer placeholder for table rows
- **MUI Flaw Addressed**: *Disjointed boxes*
- **JXUI Upgrade**: **Tabular row shimmer wave**

**Usage Example**:
```tsx
<SkeletonTable />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<SkeletonText />`
- **Category**: Category 8: Loading & Progress | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Text line skeletons with varied widths
- **MUI Flaw Addressed**: *Uniform artificial lines*
- **JXUI Upgrade**: **Natural typography rhythm**

**Usage Example**:
```tsx
<SkeletonText />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ProgressRing />`
- **Category**: Category 8: Loading & Progress | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: SVG circular progress with percentage
- **MUI Flaw Addressed**: *Basic indeterminate ring*
- **JXUI Upgrade**: **Tabular numeric center**

**Usage Example**:
```tsx
<ProgressRing />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<CircularProgress />`
- **Category**: Category 8: Loading & Progress | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Continuous spinning SVG circle
- **MUI Flaw Addressed**: *CPU intensive CSS rotate*
- **JXUI Upgrade**: **Hardware-accelerated spin**

**Usage Example**:
```tsx
<CircularProgress />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<SegmentedProgress />`
- **Category**: Category 8: Loading & Progress | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Multi-bar discrete step progress
- **MUI Flaw Addressed**: *Continuous bar only*
- **JXUI Upgrade**: **Discrete milestone segments**

**Usage Example**:
```tsx
<SegmentedProgress />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<MultiStepProgress />`
- **Category**: Category 8: Loading & Progress | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Numbered milestone step connector
- **MUI Flaw Addressed**: *Clunky stepper*
- **JXUI Upgrade**: **Minimalist connected pills**

**Usage Example**:
```tsx
<MultiStepProgress />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<UploadProgress />`
- **Category**: Category 8: Loading & Progress | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: File transfer loader with byte rate counter
- **MUI Flaw Addressed**: *Progress bar with no stats*
- **JXUI Upgrade**: **Transfer rate & percent**

**Usage Example**:
```tsx
<UploadProgress />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<TaskProgress />`
- **Category**: Category 8: Loading & Progress | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Background task completion badge
- **MUI Flaw Addressed**: *Silent completion*
- **JXUI Upgrade**: **Instant checkmark resolution**

**Usage Example**:
```tsx
<TaskProgress />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

## Category 9: Cards & Content (22 Components)

*3D parallax tilt, cursor spotlight borders, flip cards, tabular metric KPIs, and asymmetric bento layouts.*

### `<JXImageList />`
- **Category**: Category 9: Cards & Content | **Tier**: `showcase` | **Difficulty**: `intermediate`
- **Subtitle**: Bento & Lightbox Media Grid
- **MUI Flaw Addressed**: *Static grid with harsh dark overlay bars for titles.*
- **JXUI Upgrade**: **Smooth blur-up placeholder, subtle zoom-on-hover (scale-105), frosted glass caption pills on hover, and built-in click-to-expand Lightbox modal.**

**Usage Example**:
```tsx
<JXImageList
  variant="bento"
  cols={3}
  lightbox
  items={architecturalGallery}
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

### `<JXPricingMatrix />`
- **Category**: Category 9: Cards & Content | **Tier**: `showcase` | **Difficulty**: `intermediate`
- **Subtitle**: Tiered Glassmorphic Pricing Cards & Smooth Price-Toggling Matrix
- **MUI Flaw Addressed**: *Static pricing cards require custom wiring of sliders, toggles, badges, and checkout spinners.*
- **JXUI Upgrade**: **Composes tiered glassmorphic hover cards, active-state scale-in spring animations for recommended plans, smooth price-toggling transitions, seat scrubber, and 3-state morphing checkout buttons.**

**Usage Example**:
```tsx
<JXPricingMatrix
  billingCycle="annual"
  annualDiscount={0.20}
  seats={25}
  selectedTierId="pro"
  glassHover
  onCheckout={(tier, total) => morphButtonToSuccess(tier, total)}
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

### `<ContentGlassCard />`
- **Category**: Category 9: Cards & Content | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Frosted luminescent glass surface
- **MUI Flaw Addressed**: *Opaque card*
- **JXUI Upgrade**: **Refractive translucence**

**Usage Example**:
```tsx
<ContentGlassCard />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<MagneticCard />`
- **Category**: Category 9: Cards & Content | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Card tilting toward cursor position
- **MUI Flaw Addressed**: *Static card*
- **JXUI Upgrade**: **Cursor magnetic pull**

**Usage Example**:
```tsx
<MagneticCard />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<TiltCard />`
- **Category**: Category 9: Cards & Content | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: 3D parallax tilt on mouse move
- **MUI Flaw Addressed**: *Flat hover shadow*
- **JXUI Upgrade**: **Real 3D tilt perspective**

**Usage Example**:
```tsx
<TiltCard />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<HoverLiftCard />`
- **Category**: Category 9: Cards & Content | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Tactile elevation lift with soft shadow
- **MUI Flaw Addressed**: *Abrupt shadow jump*
- **JXUI Upgrade**: **Spring elevation lift**

**Usage Example**:
```tsx
<HoverLiftCard />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ExpandableCard />`
- **Category**: Category 9: Cards & Content | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Unfolds to reveal details with zero CLS
- **MUI Flaw Addressed**: *Layout jumps on expand*
- **JXUI Upgrade**: **Smooth height transition**

**Usage Example**:
```tsx
<ExpandableCard />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<MorphingCard />`
- **Category**: Category 9: Cards & Content | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Resizes smoothly into modal view
- **MUI Flaw Addressed**: *Abrupt modal pop*
- **JXUI Upgrade**: **Geometric surface expansion**

**Usage Example**:
```tsx
<MorphingCard />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<FlipCard />`
- **Category**: Category 9: Cards & Content | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: 180° flip to show back-side security key
- **MUI Flaw Addressed**: *Two separate cards*
- **JXUI Upgrade**: **3D perspective card flip**

**Usage Example**:
```tsx
<FlipCard />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<StackedCard />`
- **Category**: Category 9: Cards & Content | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Cards in stacked deck format
- **MUI Flaw Addressed**: *Horizontal scroll only*
- **JXUI Upgrade**: **Z-index card stack**

**Usage Example**:
```tsx
<StackedCard />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<SwipeableCard />`
- **Category**: Category 9: Cards & Content | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Tinder-style swipe left/right
- **MUI Flaw Addressed**: *Button clicks only*
- **JXUI Upgrade**: **Natural gesture swiping**

**Usage Example**:
```tsx
<SwipeableCard />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<InteractiveCard />`
- **Category**: Category 9: Cards & Content | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Hover states, tags, and quick actions
- **MUI Flaw Addressed**: *Static container*
- **JXUI Upgrade**: **Action-rich surface**

**Usage Example**:
```tsx
<InteractiveCard />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<SpotlightCard />`
- **Category**: Category 9: Cards & Content | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Radial spotlight gradient following cursor
- **MUI Flaw Addressed**: *Plain dark card*
- **JXUI Upgrade**: **Dynamic luminescent spotlight**

**Usage Example**:
```tsx
<SpotlightCard />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<SpotlightBorderCard />`
- **Category**: Category 9: Cards & Content | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Card border glows near cursor
- **MUI Flaw Addressed**: *Hard border line*
- **JXUI Upgrade**: **Proximity border glow**

**Usage Example**:
```tsx
<SpotlightBorderCard />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<GradientBorderCard />`
- **Category**: Category 9: Cards & Content | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Animated conic gradient border
- **MUI Flaw Addressed**: *Static border*
- **JXUI Upgrade**: **Fluid gradient aura**

**Usage Example**:
```tsx
<GradientBorderCard />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ProfileCard />`
- **Category**: Category 9: Cards & Content | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Avatar, title, status, and social badges
- **MUI Flaw Addressed**: *Basic list item*
- **JXUI Upgrade**: **Executive identity card**

**Usage Example**:
```tsx
<ProfileCard />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ProductCard />`
- **Category**: Category 9: Cards & Content | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Image, price, discount badge, and cart CTA
- **MUI Flaw Addressed**: *Generic card*
- **JXUI Upgrade**: **E-commerce tactile card**

**Usage Example**:
```tsx
<ProductCard />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<PricingCard />`
- **Category**: Category 9: Cards & Content | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Monthly/annual pricing tier with checklist
- **MUI Flaw Addressed**: *Plain price table*
- **JXUI Upgrade**: **High-converting pricing card**

**Usage Example**:
```tsx
<PricingCard />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<MetricCard />`
- **Category**: Category 9: Cards & Content | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Large KPI metric number with delta percent
- **MUI Flaw Addressed**: *Unstyled number*
- **JXUI Upgrade**: **Tabular-nums telemetry KPI**

**Usage Example**:
```tsx
<MetricCard />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ComparisonCard />`
- **Category**: Category 9: Cards & Content | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Side-by-side benchmark comparison card
- **MUI Flaw Addressed**: *Bulky table*
- **JXUI Upgrade**: **Instant delta pill comparison**

**Usage Example**:
```tsx
<ComparisonCard />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<FeatureCard />`
- **Category**: Category 9: Cards & Content | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Icon, title, description, and link
- **MUI Flaw Addressed**: *Basic box*
- **JXUI Upgrade**: **Polished feature showcase**

**Usage Example**:
```tsx
<FeatureCard />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<BentoGrid />`
- **Category**: Category 9: Cards & Content | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Asymmetric modern grid container
- **MUI Flaw Addressed**: *Uniform rigid grid*
- **JXUI Upgrade**: **Dynamic bento proportions**

**Usage Example**:
```tsx
<BentoGrid />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

## Category 10: Data Visualization (21 Components)

*Kinetic bar/line charts, liquid gradient waveforms, calendar contribution heatmaps, and live streaming tickers.*

### `<JXCharts (Line, Bar, Pie & Sparkline) />`
- **Category**: Category 10: Data Visualization | **Tier**: `showcase` | **Difficulty**: `advanced`
- **Subtitle**: Interactive SVG Telemetry with Magnetic Crosshair
- **MUI Flaw Addressed**: *Basic SVG paths with static tooltips and non-interactive legends.*
- **JXUI Upgrade**: **SVG charts with smooth gradient area fills, magnetic crosshair scrubbing, floating glassmorphic multi-series tooltips, and interactive legend pills that toggle series visibility.**

**Usage Example**:
```tsx
<JXCharts
  type="area"
  series={[
    { id: 'jxui', label: 'JXUI Render (ms)', color: '#4f46e5' },
    { id: 'mui', label: 'Legacy MUI (ms)', color: '#94a3b8' }
  ]}
  magneticCrosshair
  interactiveLegend
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

### `<KineticBarChart />`
- **Category**: Category 10: Data Visualization | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Animated SVG bars with hover tooltips
- **MUI Flaw Addressed**: *Static chart images*
- **JXUI Upgrade**: **Fluid reactive SVG bars**

**Usage Example**:
```tsx
<KineticBarChart />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<AnimatedLineChart />`
- **Category**: Category 10: Data Visualization | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Smooth bezier curve with drawing entrance
- **MUI Flaw Addressed**: *Jagged polygon line*
- **JXUI Upgrade**: **Bezier spring animation**

**Usage Example**:
```tsx
<AnimatedLineChart />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<LiquidAreaChart />`
- **Category**: Category 10: Data Visualization | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Fluid gradient area beneath waveform
- **MUI Flaw Addressed**: *Flat color block*
- **JXUI Upgrade**: **Translucent gradient area**

**Usage Example**:
```tsx
<LiquidAreaChart />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<RadialChart />`
- **Category**: Category 10: Data Visualization | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Concentric comparison progress rings
- **MUI Flaw Addressed**: *Single pie slice*
- **JXUI Upgrade**: **Multi-ring visual benchmark**

**Usage Example**:
```tsx
<RadialChart />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<DonutChart />`
- **Category**: Category 10: Data Visualization | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Center-cut pie chart with legend
- **MUI Flaw Addressed**: *Clunky legend alignment*
- **JXUI Upgrade**: **Centered KPI telemetry donut**

**Usage Example**:
```tsx
<DonutChart />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<InteractivePieChart />`
- **Category**: Category 10: Data Visualization | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Slices expanding on hover
- **MUI Flaw Addressed**: *Static SVG slices*
- **JXUI Upgrade**: **Spring slice expansion**

**Usage Example**:
```tsx
<InteractivePieChart />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<RadarChart />`
- **Category**: Category 10: Data Visualization | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Multi-axis spider polygon diagram
- **MUI Flaw Addressed**: *Unsupported natively*
- **JXUI Upgrade**: **Spider capability chart**

**Usage Example**:
```tsx
<RadarChart />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ScatterPlot />`
- **Category**: Category 10: Data Visualization | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: 2D coordinate point clusters
- **MUI Flaw Addressed**: *Slow canvas redraw*
- **JXUI Upgrade**: **High-speed SVG points**

**Usage Example**:
```tsx
<ScatterPlot />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<BubbleChart />`
- **Category**: Category 10: Data Visualization | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Sized circular bubbles by third metric
- **MUI Flaw Addressed**: *Complex charting library*
- **JXUI Upgrade**: **Proportional bubble radius**

**Usage Example**:
```tsx
<BubbleChart />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<Heatmap />`
- **Category**: Category 10: Data Visualization | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Grid of color-intensity activity cells
- **MUI Flaw Addressed**: *Raw table grid*
- **JXUI Upgrade**: **Intensity color scale**

**Usage Example**:
```tsx
<Heatmap />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<CalendarHeatmap />`
- **Category**: Category 10: Data Visualization | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: GitHub-style 52-week activity contribution
- **MUI Flaw Addressed**: *Third-party dependency*
- **JXUI Upgrade**: **Native calendar contribution**

**Usage Example**:
```tsx
<CalendarHeatmap />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<Treemap />`
- **Category**: Category 10: Data Visualization | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Hierarchical nested rectangular tiles
- **MUI Flaw Addressed**: *Overlapping labels*
- **JXUI Upgrade**: **Proportional squarified layout**

**Usage Example**:
```tsx
<Treemap />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<SankeyDiagram />`
- **Category**: Category 10: Data Visualization | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Flow path streams between stages
- **MUI Flaw Addressed**: *Complex D3 dependency*
- **JXUI Upgrade**: **Lightweight flow pathways**

**Usage Example**:
```tsx
<SankeyDiagram />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<WaterfallChart />`
- **Category**: Category 10: Data Visualization | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Stepwise positive/negative variance bars
- **MUI Flaw Addressed**: *Requires manual math*
- **JXUI Upgrade**: **Color-coded variance steps**

**Usage Example**:
```tsx
<WaterfallChart />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<FunnelChart />`
- **Category**: Category 10: Data Visualization | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Conversion funnel with percentage dropoffs
- **MUI Flaw Addressed**: *Unstyled trapezoids*
- **JXUI Upgrade**: **Visual dropoff stages**

**Usage Example**:
```tsx
<FunnelChart />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<LiveTicker />`
- **Category**: Category 10: Data Visualization | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Real-time streaming metric ticker
- **MUI Flaw Addressed**: *Static label*
- **JXUI Upgrade**: **Color-coded live change**

**Usage Example**:
```tsx
<LiveTicker />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<NumberCounter />`
- **Category**: Category 10: Data Visualization | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Rolling odometer digit animator
- **MUI Flaw Addressed**: *Instant number jump*
- **JXUI Upgrade**: **Tabular-nums rolling odometer**

**Usage Example**:
```tsx
<NumberCounter />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<Sparkline />`
- **Category**: Category 10: Data Visualization | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Micro inline sparkline graph
- **MUI Flaw Addressed**: *Takes full chart container*
- **JXUI Upgrade**: **Tiny inline SVG sparkline**

**Usage Example**:
```tsx
<Sparkline />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<InteractiveGauge />`
- **Category**: Category 10: Data Visualization | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Speedometer arc gauge with reading
- **MUI Flaw Addressed**: *Circular progress only*
- **JXUI Upgrade**: **180° speedometer arc**

**Usage Example**:
```tsx
<InteractiveGauge />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<DataComparisonChart />`
- **Category**: Category 10: Data Visualization | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Multi-series benchmark comparison bar
- **MUI Flaw Addressed**: *Cluttered bars*
- **JXUI Upgrade**: **Clean proportional bar**

**Usage Example**:
```tsx
<DataComparisonChart />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

## Category 11: Tables & Data Grids (18 Components)

*Virtualized 100k-row rendering, tree hierarchies, inline cell editing, faceted filters, and column managers.*

### `<JXTable />`
- **Category**: Category 11: Tables & Data Grids | **Tier**: `showcase` | **Difficulty**: `enterprise`
- **Subtitle**: Modern Interactive Data Surface with Bulk Action Bar
- **MUI Flaw Addressed**: *Plain HTML-like table with harsh horizontal rules and clunky pagination.*
- **JXUI Upgrade**: **Sticky frosted header, subtle row hover, column sort indicators, expandable detail rows, and a floating glassmorphic Bulk Action Bar when rows are selected.**

**Usage Example**:
```tsx
<JXTable
  stickyHeader
  selectable
  expandableRows
  floatingBulkBar
  columns={deploymentColumns}
  rows={deployments}
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

### `<JXDataGrid />`
- **Category**: Category 11: Tables & Data Grids | **Tier**: `showcase` | **Difficulty**: `enterprise`
- **Subtitle**: Next-Gen Enterprise Data Grid (Notion / Linear Hybrid)
- **MUI Flaw Addressed**: *Heavyweight spreadsheet look, complex configuration, jarring cell focus outlines.*
- **JXUI Upgrade**: **Inline double-click cell editing, column pinning, multi-column filter pills, density toggle (Compact/Comfortable/Spacious), group-by aggregation, and instant CSV/JSON export.**

**Usage Example**:
```tsx
<JXDataGrid
  rows={enterpriseRows}
  columns={columns}
  inlineEditable
  density="comfortable"
  pinnableColumns
  groupBy="category"
  exportFormats={['csv', 'json']}
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

### `<JXTreeView />`
- **Category**: Category 11: Tables & Data Grids | **Tier**: `showcase` | **Difficulty**: `enterprise`
- **Subtitle**: VS Code / Notion File & Hierarchy Explorer
- **MUI Flaw Addressed**: *Plain nested chevrons without indent guides, search, or inline rename.*
- **JXUI Upgrade**: **Vertical indent guide lines, file-type icons, inline rename, drag reordering preview, and instant search filtering that auto-expands matching branches.**

**Usage Example**:
```tsx
<JXTreeView
  data={repoFileTree}
  indentGuides
  searchable
  inlineRename
  defaultExpanded={['src', 'components']}
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

### `<SmartDataTable />`
- **Category**: Category 11: Tables & Data Grids | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Sortable, filterable table with column toggles
- **MUI Flaw Addressed**: *Heavy DOM weight*
- **JXUI Upgrade**: **Zero-shift lightweight table**

**Usage Example**:
```tsx
<SmartDataTable />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<VirtualizedTable />`
- **Category**: Category 11: Tables & Data Grids | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: 100k row virtual list container at 60 FPS
- **MUI Flaw Addressed**: *Browser freezes on 10k rows*
- **JXUI Upgrade**: **Smooth 60 FPS windowing**

**Usage Example**:
```tsx
<VirtualizedTable />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ExpandableTable />`
- **Category**: Category 11: Tables & Data Grids | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Nested row accordion expansion
- **MUI Flaw Addressed**: *Jumpy row expansion*
- **JXUI Upgrade**: **Zero-shift row drawer**

**Usage Example**:
```tsx
<ExpandableTable />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<EditableTable />`
- **Category**: Category 11: Tables & Data Grids | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Inline cell click-to-edit
- **MUI Flaw Addressed**: *Complex modal edit forms*
- **JXUI Upgrade**: **Direct click-to-edit**

**Usage Example**:
```tsx
<EditableTable />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<TreeTable />`
- **Category**: Category 11: Tables & Data Grids | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Hierarchical directory tree table
- **MUI Flaw Addressed**: *Flattened row hacks*
- **JXUI Upgrade**: **Indent hierarchy with icons**

**Usage Example**:
```tsx
<TreeTable />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<PivotTable />`
- **Category**: Category 11: Tables & Data Grids | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Group by and aggregate summary table
- **MUI Flaw Addressed**: *Server-side only*
- **JXUI Upgrade**: **Client-side pivot grouping**

**Usage Example**:
```tsx
<PivotTable />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<KanbanTable />`
- **Category**: Category 11: Tables & Data Grids | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Table rows viewable as kanban cards
- **MUI Flaw Addressed**: *Table only view*
- **JXUI Upgrade**: **Dual table/kanban view**

**Usage Example**:
```tsx
<KanbanTable />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<InfiniteDataGrid />`
- **Category**: Category 11: Tables & Data Grids | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Infinite scroll dynamic page loader
- **MUI Flaw Addressed**: *Pagination only*
- **JXUI Upgrade**: **Seamless infinite stream**

**Usage Example**:
```tsx
<InfiniteDataGrid />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ColumnResizer />`
- **Category**: Category 11: Tables & Data Grids | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Draggable vertical column border handle
- **MUI Flaw Addressed**: *Fixed column widths*
- **JXUI Upgrade**: **Fluid column dragging**

**Usage Example**:
```tsx
<ColumnResizer />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ColumnManager />`
- **Category**: Category 11: Tables & Data Grids | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Checkbox popover to show/hide columns
- **MUI Flaw Addressed**: *Hardcoded columns*
- **JXUI Upgrade**: **Instant column visibility**

**Usage Example**:
```tsx
<ColumnManager />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<FilterBuilder />`
- **Category**: Category 11: Tables & Data Grids | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Multi-condition rule builder (AND/OR)
- **MUI Flaw Addressed**: *Single search string*
- **JXUI Upgrade**: **Structured SQL-like filter**

**Usage Example**:
```tsx
<FilterBuilder />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<AdvancedFilterPanel />`
- **Category**: Category 11: Tables & Data Grids | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Slide-out drawer with faceted filters
- **MUI Flaw Addressed**: *Cluttered filter rows*
- **JXUI Upgrade**: **Dedicated facet panel**

**Usage Example**:
```tsx
<AdvancedFilterPanel />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<TableToolbar />`
- **Category**: Category 11: Tables & Data Grids | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Top action strip (Search, Filter, Export)
- **MUI Flaw Addressed**: *Scattered action buttons*
- **JXUI Upgrade**: **Unified compact strip**

**Usage Example**:
```tsx
<TableToolbar />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<RowSelectionToolbar />`
- **Category**: Category 11: Tables & Data Grids | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Bulk action bar when rows are checked
- **MUI Flaw Addressed**: *Permanent bulk buttons*
- **JXUI Upgrade**: **Appears only on selection**

**Usage Example**:
```tsx
<RowSelectionToolbar />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<DataExportPanel />`
- **Category**: Category 11: Tables & Data Grids | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: CSV, JSON, Excel exporter modal
- **MUI Flaw Addressed**: *Raw browser download*
- **JXUI Upgrade**: **Token-clean export**

**Usage Example**:
```tsx
<DataExportPanel />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

## Category 12: Drag & Drop (15 Components)

*Kinetic kanbans with spring drop physics, sortable list handles, magnetic drop targets, and timeline scrubbing.*

### `<KineticKanban />`
- **Category**: Category 12: Drag & Drop | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Multi-column drag board with spring drop
- **MUI Flaw Addressed**: *Choppy DOM drags*
- **JXUI Upgrade**: **Spring drop kinematics**

**Usage Example**:
```tsx
<KineticKanban />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<DragGrid />`
- **Category**: Category 12: Drag & Drop | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: 2D grid items reordering smoothly
- **MUI Flaw Addressed**: *Linear lists only*
- **JXUI Upgrade**: **2D matrix reordering**

**Usage Example**:
```tsx
<DragGrid />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<SortableList />`
- **Category**: Category 12: Drag & Drop | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Vertical list with drag handles and swap
- **MUI Flaw Addressed**: *Jumping list items*
- **JXUI Upgrade**: **Smooth FLIP animation**

**Usage Example**:
```tsx
<SortableList />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<SortableGrid />`
- **Category**: Category 12: Drag & Drop | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Grid with drag-and-drop tile sorting
- **MUI Flaw Addressed**: *Complex drag setup*
- **JXUI Upgrade**: **Plug-and-play sortable grid**

**Usage Example**:
```tsx
<SortableGrid />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<NestedDragList />`
- **Category**: Category 12: Drag & Drop | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Tree list with parent/child drop levels
- **MUI Flaw Addressed**: *Flat lists only*
- **JXUI Upgrade**: **Multi-depth nesting**

**Usage Example**:
```tsx
<NestedDragList />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<DragTree />`
- **Category**: Category 12: Drag & Drop | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Directory tree with file drag-and-drop
- **MUI Flaw Addressed**: *Rigid folder tree*
- **JXUI Upgrade**: **Visual drop indicators**

**Usage Example**:
```tsx
<DragTree />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<MultiSelectDrag />`
- **Category**: Category 12: Drag & Drop | **Tier**: `primitive` | **Difficulty**: `intermediate`
- **Subtitle**: Dragging lasso selection of multiple items
- **MUI Flaw Addressed**: *Single item drag only*
- **JXUI Upgrade**: **Group ghost avatar**

**Usage Example**:
```tsx
<MultiSelectDrag />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<DragDropUpload />`
- **Category**: Category 12: Drag & Drop | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Drop target zone with upload animation
- **MUI Flaw Addressed**: *Hidden input file only*
- **JXUI Upgrade**: **Tactile dashed dropzone**

**Usage Example**:
```tsx
<DragDropUpload />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<MagneticDropZone />`
- **Category**: Category 12: Drag & Drop | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Target pulls items magnetically to center
- **MUI Flaw Addressed**: *Strict pixel boundaries*
- **JXUI Upgrade**: **Magnetic proximity snap**

**Usage Example**:
```tsx
<MagneticDropZone />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<FloatingDragPreview />`
- **Category**: Category 12: Drag & Drop | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Ghost preview avatar following cursor
- **MUI Flaw Addressed**: *Browser raw drag ghost*
- **JXUI Upgrade**: **Styled translucent card**

**Usage Example**:
```tsx
<FloatingDragPreview />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ResizableGridItem />`
- **Category**: Category 12: Drag & Drop | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Grid item with drag resize borders
- **MUI Flaw Addressed**: *Static grid tiles*
- **JXUI Upgrade**: **Customizable tile bounds**

**Usage Example**:
```tsx
<ResizableGridItem />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<SnapGrid />`
- **Category**: Category 12: Drag & Drop | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Items snapping to 8px or 16px grid coordinates
- **MUI Flaw Addressed**: *Freeform pixel chaos*
- **JXUI Upgrade**: **Strict design grid snap**

**Usage Example**:
```tsx
<SnapGrid />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<DragTimeline />`
- **Category**: Category 12: Drag & Drop | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Timeline events scrubbable across dates
- **MUI Flaw Addressed**: *Text date inputs*
- **JXUI Upgrade**: **Horizontal event dragging**

**Usage Example**:
```tsx
<DragTimeline />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<DragCalendar />`
- **Category**: Category 12: Drag & Drop | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Appointments draggable across time slots
- **MUI Flaw Addressed**: *Modal reschedule form*
- **JXUI Upgrade**: **Direct time slot drag**

**Usage Example**:
```tsx
<DragCalendar />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<MultiContainerDrag />`
- **Category**: Category 12: Drag & Drop | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Dragging cards across discrete containers
- **MUI Flaw Addressed**: *Single container limits*
- **JXUI Upgrade**: **Cross-container event bus**

**Usage Example**:
```tsx
<MultiContainerDrag />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

