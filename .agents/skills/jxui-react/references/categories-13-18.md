# JXUI Component Reference: Categories 13 to 18

## Category 13: Layout & Workspace (20 Components)

*Infinite pan-and-zoom canvases, desktop window managers, split draggable panes, and masonry waterfall grids.*

### `<JXBox & JXContainer />`
- **Category**: Category 13: Layout & Workspace | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Token-Aware Layout Primitives
- **MUI Flaw Addressed**: *Manual sx prop boilerplate for responsive fluid padding and surface tokens.*
- **JXUI Upgrade**: **Fluid clamp() padding tokens, semantic surface tokens, and container-query responsive breakpoints out of the box.**

**Usage Example**:
```tsx
<JXContainer maxWidth="xl" fluidPadding surface="raised">
  <JXBox tokenGap="md">...</JXBox>
</JXContainer>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<JXGrid />`
- **Category**: Category 13: Layout & Workspace | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Asymmetric Bento & CSS Grid v2 System
- **MUI Flaw Addressed**: *Legacy negative-margin flexbox grid quirks and verbose responsive props.*
- **JXUI Upgrade**: **True 12-column CSS Grid + pre-configured asymmetric Bento Grid spans (colSpan, rowSpan) with consistent gap tokens.**

**Usage Example**:
```tsx
<JXGrid columns={12} gap="md" bento>
  <JXGridItem colSpan={8} rowSpan={2}>Primary Bento Feature</JXGridItem>
  <JXGridItem colSpan={4}>Telemetry Tile</JXGridItem>
</JXGrid>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<JXStack />`
- **Category**: Category 13: Layout & Workspace | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Flex Stack with Smart Hairline Dividers
- **MUI Flaw Addressed**: *Manual divider cloning and rigid spacing.*
- **JXUI Upgrade**: **1-dimensional layout with interactive direction switching, alignment controls, and automatic radial-fade hairline divider insertion.**

**Usage Example**:
```tsx
<JXStack direction="row" spacing="md" smartDividers align="center">
  <MetricItem label="Throughput" value="14.2k req/s" />
  <MetricItem label="Error Rate" value="0.002%" />
</JXStack>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<JXMasonry />`
- **Category**: Category 13: Layout & Workspace | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Dynamic Reflow Masonry Layout
- **MUI Flaw Addressed**: *Jarring layout jumps when items are filtered or resized.*
- **JXUI Upgrade**: **Smooth animated reflow when cards are filtered by category or dynamically added/removed.**

**Usage Example**:
```tsx
<JXMasonry columns={3} gap={16} animatedReflow items={filteredCards} />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<JXTransitions, JXModal, JXPopper & JXTextareaAutosize />`
- **Category**: Category 13: Layout & Workspace | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Spring Physics Primitives & Auto-Growing Composer
- **MUI Flaw Addressed**: *Linear cubic-bezier transitions and bare unstyled textarea primitive.*
- **JXUI Upgrade**: **Unified utility primitives with spring presets (Fade, Scale, SlideUp, BlurIn) and auto-growing textarea with integrated formatting toolbar.**

**Usage Example**:
```tsx
<JXTransitions preset="blur-in" open={visible}>
  <JXTextareaAutosize minRows={3} toolbarSlot={<MarkdownToolbar />} />
</JXTransitions>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<AdaptiveDashboard />`
- **Category**: Category 13: Layout & Workspace | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Responsive multi-widget layout
- **MUI Flaw Addressed**: *Rigid CSS grid*
- **JXUI Upgrade**: **Fluid widget arrangements**

**Usage Example**:
```tsx
<AdaptiveDashboard />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<InfiniteCanvas />`
- **Category**: Category 13: Layout & Workspace | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Pan and zoom canvas (like Figma/Miro)
- **MUI Flaw Addressed**: *DOM page scroll only*
- **JXUI Upgrade**: **Infinite 2D spatial canvas**

**Usage Example**:
```tsx
<InfiniteCanvas />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<SpatialWorkspace />`
- **Category**: Category 13: Layout & Workspace | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: 3D stacked window layers
- **MUI Flaw Addressed**: *Flat 2D screen*
- **JXUI Upgrade**: **Z-index spatial depth**

**Usage Example**:
```tsx
<SpatialWorkspace />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<WindowManager />`
- **Category**: Category 13: Layout & Workspace | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Desktop OS window controls (min/max/close)
- **MUI Flaw Addressed**: *Browser tabs only*
- **JXUI Upgrade**: **Virtual window manager**

**Usage Example**:
```tsx
<WindowManager />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<FloatingWindow />`
- **Category**: Category 13: Layout & Workspace | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Draggable window with title bar
- **MUI Flaw Addressed**: *Static layout container*
- **JXUI Upgrade**: **Movable window pane**

**Usage Example**:
```tsx
<FloatingWindow />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<DockManager />`
- **Category**: Category 13: Layout & Workspace | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: macOS-style pinned dock at screen edge
- **MUI Flaw Addressed**: *Fixed bottom bar*
- **JXUI Upgrade**: **Edge-pinned smart dock**

**Usage Example**:
```tsx
<DockManager />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<SplitPane />`
- **Category**: Category 13: Layout & Workspace | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Divider with drag resizing between panes
- **MUI Flaw Addressed**: *Static flex columns*
- **JXUI Upgrade**: **Dual draggable divider**

**Usage Example**:
```tsx
<SplitPane />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ResizableLayout />`
- **Category**: Category 13: Layout & Workspace | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Multi-column adjustable workspace layout
- **MUI Flaw Addressed**: *Fixed column width*
- **JXUI Upgrade**: **Responsive column bounds**

**Usage Example**:
```tsx
<ResizableLayout />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<MosaicGrid />`
- **Category**: Category 13: Layout & Workspace | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Flexible tile layout like modern dashboards
- **MUI Flaw Addressed**: *Rigid table grid*
- **JXUI Upgrade**: **Asymmetric tile mosaic**

**Usage Example**:
```tsx
<MosaicGrid />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<BentoLayout />`
- **Category**: Category 13: Layout & Workspace | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Modern asymmetric bento section organizer
- **MUI Flaw Addressed**: *Equal size cards only*
- **JXUI Upgrade**: **Visual hierarchy bento**

**Usage Example**:
```tsx
<BentoLayout />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ResponsiveGrid />`
- **Category**: Category 13: Layout & Workspace | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Breakpoint-aware dynamic grid
- **MUI Flaw Addressed**: *Heavy breakpoint classes*
- **JXUI Upgrade**: **Semantic auto-fit grid**

**Usage Example**:
```tsx
<ResponsiveGrid />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<MasonryLayout />`
- **Category**: Category 13: Layout & Workspace | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Pinterest-style waterfall columns
- **MUI Flaw Addressed**: *Uneven column gaps*
- **JXUI Upgrade**: **Optimal column packing**

**Usage Example**:
```tsx
<MasonryLayout />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<AutoLayout />`
- **Category**: Category 13: Layout & Workspace | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Flexbox auto-distributing spacing helper
- **MUI Flaw Addressed**: *Manual margin utility math*
- **JXUI Upgrade**: **Semantic gap distributor**

**Usage Example**:
```tsx
<AutoLayout />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<PanelGroup />`
- **Category**: Category 13: Layout & Workspace | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Collapsible grouped panels
- **MUI Flaw Addressed**: *Clunky accordion*
- **JXUI Upgrade**: **Coordinated panel group**

**Usage Example**:
```tsx
<PanelGroup />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<WorkspaceSwitcher />`
- **Category**: Category 13: Layout & Workspace | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Multi-workspace tab selector
- **MUI Flaw Addressed**: *Page reload navigation*
- **JXUI Upgrade**: **Instant in-memory switch**

**Usage Example**:
```tsx
<WorkspaceSwitcher />
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

## Category 14: Animation & Motion (16 Components)

*Spring transitions, organic liquid blobs, magnetic cursor attraction, animated gradients, and particle fields.*

### `<JXSpotlightDock />`
- **Category**: Category 14: Animation & Motion | **Tier**: `showcase` | **Difficulty**: `advanced`
- **Subtitle**: Proximity-Magnified Floating Glass App Dock
- **MUI Flaw Addressed**: *Standard toolbars have static 40px icons with zero spatial feedback or proximity physics.*
- **JXUI Upgrade**: **Composes JXTooltip, JXBadge, and spring physics into a proximity-reactive macOS-style floating glass dock with live running-process dots and instant launcher actions.**

**Usage Example**:
```tsx
<JXSpotlightDock
  magnification={1.45}
  distance={140}
  glass
  items={[
    { id: 'terminal', label: 'Edge Console', shortcut: '⌘T', active: true },
    { id: 'metrics', label: 'Live Telemetry', badge: 3, active: true },
    { id: 'deploy', label: 'Canary Rollout', shortcut: '⌘D' }
  ]}
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

### `<SpringTransition />`
- **Category**: Category 14: Animation & Motion | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Wrapper animating enter/exit with spring
- **MUI Flaw Addressed**: *Linear CSS keyframes*
- **JXUI Upgrade**: **Cubic bezier spring physics**

**Usage Example**:
```tsx
<SpringTransition />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<MorphTransition />`
- **Category**: Category 14: Animation & Motion | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Shape shifting between circle and square
- **MUI Flaw Addressed**: *Instant replacement*
- **JXUI Upgrade**: **Geometric SVG interpolation**

**Usage Example**:
```tsx
<MorphTransition />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<SharedElementTransition />`
- **Category**: Category 14: Animation & Motion | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Shared element layoutId transition
- **MUI Flaw Addressed**: *Screen flashing refresh*
- **JXUI Upgrade**: **Continuity layout transitions**

**Usage Example**:
```tsx
<SharedElementTransition />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<PageTransition />`
- **Category**: Category 14: Animation & Motion | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Full page slide and fade transition
- **MUI Flaw Addressed**: *Harsh white page flash*
- **JXUI Upgrade**: **Silky smooth route enter**

**Usage Example**:
```tsx
<PageTransition />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<StaggeredReveal />`
- **Category**: Category 14: Animation & Motion | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Children revealed with incremental delay
- **MUI Flaw Addressed**: *All items pop at once*
- **JXUI Upgrade**: **Cascading natural reveal**

**Usage Example**:
```tsx
<StaggeredReveal />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ScrollReveal />`
- **Category**: Category 14: Animation & Motion | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Elements sliding in as viewport scrolls
- **MUI Flaw Addressed**: *Pop-in after scroll*
- **JXUI Upgrade**: **Pre-rendered threshold slide**

**Usage Example**:
```tsx
<ScrollReveal />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ParallaxContainer />`
- **Category**: Category 14: Animation & Motion | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Multi-depth parallax scroll container
- **MUI Flaw Addressed**: *Single scroll layer*
- **JXUI Upgrade**: **Multi-plane parallax depth**

**Usage Example**:
```tsx
<ParallaxContainer />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<MagneticCursor />`
- **Category**: Category 14: Animation & Motion | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Custom cursor attracted to nearby buttons
- **MUI Flaw Addressed**: *Raw system arrow*
- **JXUI Upgrade**: **Magnetic cursor tracking**

**Usage Example**:
```tsx
<MagneticCursor />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<CursorFollower />`
- **Category**: Category 14: Animation & Motion | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Smooth lagging trailing glow circle
- **MUI Flaw Addressed**: *No cursor effects*
- **JXUI Upgrade**: **Ambient halo follower**

**Usage Example**:
```tsx
<CursorFollower />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<AnimatedGradient />`
- **Category**: Category 14: Animation & Motion | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Continuous shifting mesh gradient
- **MUI Flaw Addressed**: *Static gradient image*
- **JXUI Upgrade**: **GPU animated mesh**

**Usage Example**:
```tsx
<AnimatedGradient />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<LiquidBlob />`
- **Category**: Category 14: Animation & Motion | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Organic morphing SVG blob shape
- **MUI Flaw Addressed**: *Rigid geometry*
- **JXUI Upgrade**: **Fluid organic blob**

**Usage Example**:
```tsx
<LiquidBlob />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ParticleField />`
- **Category**: Category 14: Animation & Motion | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Floating ambient background particles
- **MUI Flaw Addressed**: *Heavy canvas script*
- **JXUI Upgrade**: **Lightweight CSS particles**

**Usage Example**:
```tsx
<ParticleField />
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

### `<SpotlightEffect />`
- **Category**: Category 14: Animation & Motion | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Cursor-tracking spotlight glow effect
- **MUI Flaw Addressed**: *Flat background*
- **JXUI Upgrade**: **Dynamic light beam**

**Usage Example**:
```tsx
<SpotlightEffect />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<HoverDistortion />`
- **Category**: Category 14: Animation & Motion | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Wave distortion on mouse hover
- **MUI Flaw Addressed**: *Static hover*
- **JXUI Upgrade**: **Fluid wave displacement**

**Usage Example**:
```tsx
<HoverDistortion />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<MotionSequence />`
- **Category**: Category 14: Animation & Motion | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Keyframed choreographed animation runner
- **MUI Flaw Addressed**: *Uncoordinated timers*
- **JXUI Upgrade**: **Deterministic timeline**

**Usage Example**:
```tsx
<MotionSequence />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

## Category 15: AI Components (16 Components)

*Conversational chat panels, step-by-step thinking accordions, tool call trace inspectors, and approval cards.*

### `<JXSecurityVaultCard />`
- **Category**: Category 15: AI Components | **Tier**: `showcase` | **Difficulty**: `enterprise`
- **Subtitle**: Passkey Biometric Challenge & Hardware Key Manager
- **MUI Flaw Addressed**: *Standard security settings forms lack interactive WebAuthn challenge feedback and audit accordions.*
- **JXUI Upgrade**: **Composes JXCard, JXAccordion (Bento mode), JXSwitch, and an interactive Passkey Touch simulator with animated cryptographic fingerprint verification.**

**Usage Example**:
```tsx
<JXSecurityVaultCard
  strictWebAuthn
  registeredKeys={['YubiKey 5C Nano', 'Touch ID Enclave']}
  onVerifyPasskey={() => triggerHardwareChallenge()}
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

### `<AIChatPanel />`
- **Category**: Category 15: AI Components | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Conversational message history and input
- **MUI Flaw Addressed**: *Basic chat list*
- **JXUI Upgrade**: **AI-first conversation surface**

**Usage Example**:
```tsx
<AIChatPanel />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<AIMessage />`
- **Category**: Category 15: AI Components | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Assistant message bubble with thought drawer
- **MUI Flaw Addressed**: *Plain text paragraph*
- **JXUI Upgrade**: **Structured message card**

**Usage Example**:
```tsx
<AIMessage />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<AIComposer />`
- **Category**: Category 15: AI Components | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Input with attachment chips and model picker
- **MUI Flaw Addressed**: *Basic text field*
- **JXUI Upgrade**: **Multi-modal prompt composer**

**Usage Example**:
```tsx
<AIComposer />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<AIThinkingIndicator />`
- **Category**: Category 15: AI Components | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Step-by-step reasoning accordion
- **MUI Flaw Addressed**: *Spinner without progress*
- **JXUI Upgrade**: **Transparent reasoning drawer**

**Usage Example**:
```tsx
<AIThinkingIndicator />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<AIStreamingText />`
- **Category**: Category 15: AI Components | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Typewriter streaming markdown tokens
- **MUI Flaw Addressed**: *Blocks until fully completed*
- **JXUI Upgrade**: **Real-time token cursor**

**Usage Example**:
```tsx
<AIStreamingText />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<AIToolCall />`
- **Category**: Category 15: AI Components | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Card showing tool function and arguments
- **MUI Flaw Addressed**: *Unformatted JSON blob*
- **JXUI Upgrade**: **Interactive tool card**

**Usage Example**:
```tsx
<AIToolCall />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<AIToolTrace />`
- **Category**: Category 15: AI Components | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Detailed trace view with execution metrics
- **MUI Flaw Addressed**: *Hidden backend logs*
- **JXUI Upgrade**: **Performance timing trace**

**Usage Example**:
```tsx
<AIToolTrace />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<AIApprovalCard />`
- **Category**: Category 15: AI Components | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Human-in-the-loop action approval card
- **MUI Flaw Addressed**: *Implicit automated actions*
- **JXUI Upgrade**: **Explicit safety gate**

**Usage Example**:
```tsx
<AIApprovalCard />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<AIReasoningTimeline />`
- **Category**: Category 15: AI Components | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Chronological timeline of thought nodes
- **MUI Flaw Addressed**: *Unordered log output*
- **JXUI Upgrade**: **Structured thought pipeline**

**Usage Example**:
```tsx
<AIReasoningTimeline />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<AIResponseActions />`
- **Category**: Category 15: AI Components | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Thumbs up/down, retry, copy, branch
- **MUI Flaw Addressed**: *Missing feedback buttons*
- **JXUI Upgrade**: **Complete reaction toolbar**

**Usage Example**:
```tsx
<AIResponseActions />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<AIContextPanel />`
- **Category**: Category 15: AI Components | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Token budget and active context documents
- **MUI Flaw Addressed**: *Hidden token limits*
- **JXUI Upgrade**: **Visual token meter**

**Usage Example**:
```tsx
<AIContextPanel />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<AIModelSelector />`
- **Category**: Category 15: AI Components | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Dropdown to switch LLM models
- **MUI Flaw Addressed**: *Hardcoded model endpoint*
- **JXUI Upgrade**: **Instant multi-model switcher**

**Usage Example**:
```tsx
<AIModelSelector />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<AIAttachmentPreview />`
- **Category**: Category 15: AI Components | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Image/file preview chip with remove CTA
- **MUI Flaw Addressed**: *Unrendered file name*
- **JXUI Upgrade**: **Thumbnail attachment card**

**Usage Example**:
```tsx
<AIAttachmentPreview />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<AICitationCard />`
- **Category**: Category 15: AI Components | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Source link citation popup with excerpt
- **MUI Flaw Addressed**: *Plain inline hyperlink*
- **JXUI Upgrade**: **Rich source card**

**Usage Example**:
```tsx
<AICitationCard />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<AIWorkflowBuilder />`
- **Category**: Category 15: AI Components | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Visual canvas connecting agent steps
- **MUI Flaw Addressed**: *Code-only pipelines*
- **JXUI Upgrade**: **Drag-and-drop workflow nodes**

**Usage Example**:
```tsx
<AIWorkflowBuilder />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

## Category 16: Editors & Creative Tools (17 Components)

*WYSIWYG toolbars, Notion-style slash command menus, code syntax highlighters, and visual theme editors.*

### `<JXRichTextEditor & JXUploadDropzone />`
- **Category**: Category 16: Editors & Creative Tools | **Tier**: `showcase` | **Difficulty**: `enterprise`
- **Subtitle**: Slash-Command (/) Block Editor & Multi-File Dropzone
- **MUI Flaw Addressed**: *Listed on MUI X future roadmap or requires external 3rd-party integration.*
- **JXUI Upgrade**: **Built-in slash-command (/) block editor toolbar + interactive drag-and-drop file uploader with live file-type icons, image thumbnails, and upload progress bars.**

**Usage Example**:
```tsx
<JXRichTextEditor slashCommands placeholder="Type '/' for commands..." />
<JXUploadDropzone accept={['.svg', '.png', '.json']} maxFiles={5} />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<JXInteractiveColorStudio />`
- **Category**: Category 16: Editors & Creative Tools | **Tier**: `showcase` | **Difficulty**: `enterprise`
- **Subtitle**: Live HSL/OKLCH Tonal Scale & WCAG Contrast Generator
- **MUI Flaw Addressed**: *MUI createTheme palette generation is opaque and provides no real-time WCAG AA/AAA contrast audit.*
- **JXUI Upgrade**: **Composes JXSlider, JXCard, and JXChip to generate a 9-stop tonal scale (50–900) in real time with live WCAG contrast ratio badges and one-click CSS variable export.**

**Usage Example**:
```tsx
<JXInteractiveColorStudio
  baseHue={242}
  saturation={84}
  auditTargets={['#F8FAFC', '#0B0F19']}
  exportFormat="css-variables"
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

### `<RichTextEditor />`
- **Category**: Category 16: Editors & Creative Tools | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: WYSIWYG toolbar and contentEditable field
- **MUI Flaw Addressed**: *Basic text field only*
- **JXUI Upgrade**: **Full formatting suite**

**Usage Example**:
```tsx
<RichTextEditor />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<FloatingEditorToolbar />`
- **Category**: Category 16: Editors & Creative Tools | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Floating selection menu (Bold, Italic, Link)
- **MUI Flaw Addressed**: *Fixed top toolbar only*
- **JXUI Upgrade**: **Contextual floating pill**

**Usage Example**:
```tsx
<FloatingEditorToolbar />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<SlashCommandMenu />`
- **Category**: Category 16: Editors & Creative Tools | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Notion-like / trigger dropdown menu
- **MUI Flaw Addressed**: *Standard dropdowns only*
- **JXUI Upgrade**: **Inline command launcher**

**Usage Example**:
```tsx
<SlashCommandMenu />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<BlockEditor />`
- **Category**: Category 16: Editors & Creative Tools | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Draggable content block editor
- **MUI Flaw Addressed**: *Monolithic text blob*
- **JXUI Upgrade**: **Modular draggable blocks**

**Usage Example**:
```tsx
<BlockEditor />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<MarkdownEditor />`
- **Category**: Category 16: Editors & Creative Tools | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Split preview markdown composer
- **MUI Flaw Addressed**: *Raw markdown string*
- **JXUI Upgrade**: **Live side-by-side rendering**

**Usage Example**:
```tsx
<MarkdownEditor />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<CodeEditor />`
- **Category**: Category 16: Editors & Creative Tools | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Syntax-highlighted code editing box
- **MUI Flaw Addressed**: *Unformatted monospace input*
- **JXUI Upgrade**: **Theme-reactive syntax highlighting**

**Usage Example**:
```tsx
<CodeEditor />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<DiffViewer />`
- **Category**: Category 16: Editors & Creative Tools | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Git-style side-by-side or inline diff (+/-)
- **MUI Flaw Addressed**: *Manual string comparison*
- **JXUI Upgrade**: **Color-coded line additions/removals**

**Usage Example**:
```tsx
<DiffViewer />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<JsonEditor />`
- **Category**: Category 16: Editors & Creative Tools | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Collapsible tree JSON viewer/editor
- **MUI Flaw Addressed**: *Raw JSON.stringify display*
- **JXUI Upgrade**: **Interactive collapsible tree**

**Usage Example**:
```tsx
<JsonEditor />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<VisualThemeEditor />`
- **Category**: Category 16: Editors & Creative Tools | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Live color token studio preview
- **MUI Flaw Addressed**: *Requires code recompilation*
- **JXUI Upgrade**: **Instant real-time token sliders**

**Usage Example**:
```tsx
<VisualThemeEditor />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<GradientEditor />`
- **Category**: Category 16: Editors & Creative Tools | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Interactive color stops gradient creator
- **MUI Flaw Addressed**: *Static CSS background*
- **JXUI Upgrade**: **Draggable gradient stops**

**Usage Example**:
```tsx
<GradientEditor />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<LayerPanel />`
- **Category**: Category 16: Editors & Creative Tools | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Graphic design layer tree with eye toggles
- **MUI Flaw Addressed**: *Flat component list*
- **JXUI Upgrade**: **Photoshop-style layer stack**

**Usage Example**:
```tsx
<LayerPanel />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ColorPaletteBuilder />`
- **Category**: Category 16: Editors & Creative Tools | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Harmonious OKLCH palette generator
- **MUI Flaw Addressed**: *Basic hex inputs*
- **JXUI Upgrade**: **Perceptually uniform color math**

**Usage Example**:
```tsx
<ColorPaletteBuilder />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<IconPicker />`
- **Category**: Category 16: Editors & Creative Tools | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Searchable grid of Lucide icons
- **MUI Flaw Addressed**: *Huge static icon bundles*
- **JXUI Upgrade**: **Instant keyword icon search**

**Usage Example**:
```tsx
<IconPicker />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<EmojiPicker />`
- **Category**: Category 16: Editors & Creative Tools | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Categorized emoji search popover
- **MUI Flaw Addressed**: *OS raw picker*
- **JXUI Upgrade**: **Cross-platform emoji popover**

**Usage Example**:
```tsx
<EmojiPicker />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<DesignTokenEditor />`
- **Category**: Category 16: Editors & Creative Tools | **Tier**: `primitive` | **Difficulty**: `enterprise`
- **Subtitle**: Live CSS variables / HSL editor with preview
- **MUI Flaw Addressed**: *Hardcoded SCSS files*
- **JXUI Upgrade**: **Dynamic CSS custom property engine**

**Usage Example**:
```tsx
<DesignTokenEditor />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

## Category 17: Time & Scheduling (12 Components)

*Smart natural language calendars, double-date range pickers, Gantt project roadmaps, and countdown timers.*

### `<JXTimeline />`
- **Category**: Category 17: Time & Scheduling | **Tier**: `showcase` | **Difficulty**: `advanced`
- **Subtitle**: Interactive Activity & Audit Feed
- **MUI Flaw Addressed**: *Rigid center-split timeline from MUI Lab with zero interactive payloads.*
- **JXUI Upgrade**: **Rich timeline nodes with avatars, status icons, timestamps, collapsible code diff/comment payloads, and active step connector lines.**

**Usage Example**:
```tsx
<JXTimeline interactiveDiffs items={auditLogEvents} />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<JXDatePicker, JXTimePicker & JXDateRangePicker />`
- **Category**: Category 17: Time & Scheduling | **Tier**: `showcase` | **Difficulty**: `advanced`
- **Subtitle**: Natural Language Parser + Quick Presets Calendar
- **MUI Flaw Addressed**: *Requires multiple clicks across months; no natural language or preset sidebar.*
- **JXUI Upgrade**: **Dual-month range calendar with hover range bridging, left-hand Quick Presets Sidebar ("Today", "Last 7 Days", "YTD"), and natural language header ("next friday", "in 3 days").**

**Usage Example**:
```tsx
<JXDateRangePicker
  naturalLanguageInput
  presets={['today', 'last7Days', 'thisQuarter', 'ytd']}
  value={dateRange}
  onChange={setDateRange}
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

### `<SmartCalendar />`
- **Category**: Category 17: Time & Scheduling | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Natural language date picker and month grid
- **MUI Flaw Addressed**: *Rigid date picker modal*
- **JXUI Upgrade**: **Natural language date parsing**

**Usage Example**:
```tsx
<SmartCalendar />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<RangeCalendar />`
- **Category**: Category 17: Time & Scheduling | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Double-calendar selection for start/end dates
- **MUI Flaw Addressed**: *Two separate inputs*
- **JXUI Upgrade**: **Unified range selection**

**Usage Example**:
```tsx
<RangeCalendar />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<Timeline />`
- **Category**: Category 17: Time & Scheduling | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Chronological event line with status markers
- **MUI Flaw Addressed**: *Basic vertical list*
- **JXUI Upgrade**: **Color-coded milestone path**

**Usage Example**:
```tsx
<Timeline />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<GanttChart />`
- **Category**: Category 17: Time & Scheduling | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Project roadmap with dependency bars
- **MUI Flaw Addressed**: *Requires complex enterprise package*
- **JXUI Upgrade**: **Lightweight Gantt bars**

**Usage Example**:
```tsx
<GanttChart />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<Scheduler />`
- **Category**: Category 17: Time & Scheduling | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Day/week calendar time block organizer
- **MUI Flaw Addressed**: *Static calendar grid*
- **JXUI Upgrade**: **Interactive time booking**

**Usage Example**:
```tsx
<Scheduler />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<TimePicker />`
- **Category**: Category 17: Time & Scheduling | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Hour and minute selector with timezone
- **MUI Flaw Addressed**: *Clunky clock dial*
- **JXUI Upgrade**: **Compact monospace pill**

**Usage Example**:
```tsx
<TimePicker />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<DateRangePicker />`
- **Category**: Category 17: Time & Scheduling | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Popover field with preset quick ranges
- **MUI Flaw Addressed**: *Must click calendar dates*
- **JXUI Upgrade**: **Instant preset pills**

**Usage Example**:
```tsx
<DateRangePicker />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<AvailabilityGrid />`
- **Category**: Category 17: Time & Scheduling | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Weekly time slot matrix with drag selection
- **MUI Flaw Addressed**: *Checkbox rows*
- **JXUI Upgrade**: **Visual availability matrix**

**Usage Example**:
```tsx
<AvailabilityGrid />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<EventTimeline />`
- **Category**: Category 17: Time & Scheduling | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Activity feed with timestamps and user badges
- **MUI Flaw Addressed**: *Raw log list*
- **JXUI Upgrade**: **Tactile event cards**

**Usage Example**:
```tsx
<EventTimeline />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<CountdownTimer />`
- **Category**: Category 17: Time & Scheduling | **Tier**: `primitive` | **Difficulty**: `advanced`
- **Subtitle**: Real-time decreasing days, hours, mins, secs
- **MUI Flaw Addressed**: *Static text timestamp*
- **JXUI Upgrade**: **Animated tabular countdown**

**Usage Example**:
```tsx
<CountdownTimer />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

## Category 18: Advanced Utilities (20 Components)

*Virtual list viewports, image before/after comparison sliders, audio frequency visualizers, and QR codes.*

### `<JXAvatar & JXAvatarGroup />`
- **Category**: Category 18: Advanced Utilities | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Presence & Interactive Stack
- **MUI Flaw Addressed**: *Basic circle image and static +N overflow circle.*
- **JXUI Upgrade**: **Squircle or circle shapes, deterministic pastel gradient fallbacks, live status rings, and hover fan-out with +N overflow popover list.**

**Usage Example**:
```tsx
<JXAvatarGroup max={4} shape="squircle" interactiveFanOut>
  <JXAvatar name="Elena Rostova" status="online" />
  <JXAvatar name="Marcus Vance" status="busy" />
  <JXAvatar name="Sora Takahashi" status="away" />
</JXAvatarGroup>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<JXBadge />`
- **Category**: Category 18: Advanced Utilities | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Contextual Pulse & Odometer Count Pill
- **MUI Flaw Addressed**: *Static circle that clips awkwardly on rounded corners.*
- **JXUI Upgrade**: **Automatic optical corner offset, live radar pulse for notifications, smooth rolling odometer transition when numbers change, and status text.**

**Usage Example**:
```tsx
<JXBadge count={unreadCount} odometer pulse color="primary">
  <JXIconButton icon={<BellIcon />} />
</JXBadge>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<JXChip />`
- **Category**: Category 18: Advanced Utilities | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Interactive Status & Filter Pill
- **MUI Flaw Addressed**: *Dull gray rounded rectangle with a cramped delete icon.*
- **JXUI Upgrade**: **Soft tinted surface with subtle border and status indicator (Active, Pending, Failed), interactive filter dropdown chevron, and collapse on delete.**

**Usage Example**:
```tsx
<JXChip
  label="Status: Healthy"
  status="active"
  filterDropdown
  onDelete={() => removeFilter('status')}
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

### `<JXDivider />`
- **Category**: Category 18: Advanced Utilities | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Gradient & Action Divider
- **MUI Flaw Addressed**: *Plain 1px gray line.*
- **JXUI Upgrade**: **Supports soft radial fade-out edges, embedded pill labels, or interactive "Expand / Show More" action buttons centered on the line.**

**Usage Example**:
```tsx
<JXDivider
  variant="radial-fade"
  actionLabel={expanded ? "Collapse Advanced Logs" : "Show 12 More Events"}
  onAction={() => setExpanded(!expanded)}
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

### `<JXIcon & JXSvgIcon />`
- **Category**: Category 18: Advanced Utilities | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Duotone & Micro-Animated Icon Wrapper
- **MUI Flaw Addressed**: *Flat single-color SVG wrapper.*
- **JXUI Upgrade**: **Built-in soft rounded icon container badges (variant="soft-box"), duotone opacity layers, and hover micro-animations (spin, bounce, wiggle).**

**Usage Example**:
```tsx
<JXIcon
  variant="soft-box"
  color="indigo"
  hoverAnimation="bounce"
  icon={<SparklesIcon />}
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

### `<JXList />`
- **Category**: Category 18: Advanced Utilities | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Inset Interactive List & Collapsible Tree
- **MUI Flaw Addressed**: *Tall, unstyled rows with full-width gray hover bars.*
- **JXUI Upgrade**: **Inset rounded hover highlights (rounded-xl mx-2), keyboard arrow navigation, reveal-on-hover quick actions (Pin, Archive, Delete), and nested guide lines.**

**Usage Example**:
```tsx
<JXList insetHover quickActions={['pin', 'archive', 'delete']}>
  <JXListItem title="Core Design Tokens" subtitle="Updated 14m ago" nestedItems={tokenFiles} />
</JXList>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<JXTooltip & JXHtmlTooltip />`
- **Category**: Category 18: Advanced Utilities | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Rich Interactive Preview Card
- **MUI Flaw Addressed**: *Tiny dark gray box with delayed, abrupt fade.*
- **JXUI Upgrade**: **Directional spring entrance, hotkey badge (⌘K), warm handoff between adjacent tooltips, and a rich variant supporting profile previews and metrics.**

**Usage Example**:
```tsx
<JXTooltip
  variant="rich"
  shortcut="⌘I"
  title="Cluster Node us-east-1a"
  metrics={{ cpu: '38%', mem: '12.4 GB', uptime: '99.998%' }}
>
  <JXButton>Inspect Node Telemetry</JXButton>
</JXTooltip>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<JXTypography />`
- **Category**: Category 18: Advanced Utilities | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: Fluid Semantic Type System
- **MUI Flaw Addressed**: *Hardcoded px/rem jumps and verbose variant names.*
- **JXUI Upgrade**: **Fluid clamp() sizing, automatic text-wrap: balance for headings, gradient text support, inline copyable code snippets, and maxLines truncation.**

**Usage Example**:
```tsx
<JXTypography variant="display-sm" balance gradient="indigo-violet">
  Precision Ergonomics at Scale
</JXTypography>
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<JXTrafficSplitter />`
- **Category**: Category 18: Advanced Utilities | **Tier**: `showcase` | **Difficulty**: `enterprise`
- **Subtitle**: Dynamic Color-Coded Canary Deployment Bar & Rollout Orchestrator
- **MUI Flaw Addressed**: *No composed DevOps pipeline primitive combining steppers, traffic sliders, and rollback guards.*
- **JXUI Upgrade**: **Slider-driven canary deployment UI with a multi-segment split bar that dynamically color-codes segments (Slate, Sky, Indigo, Amber, Emerald) to represent live traffic percentages, p99 latency, and RPS.**

**Usage Example**:
```tsx
<JXTrafficSplitter
  stableVersion="v2.4.0"
  canaryVersion="v3.0.0"
  canaryWeight={30}
  autoRollbackOnError
  onPromote={() => promoteCanaryToProduction()}
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

### `<JXAudioWaveformScrubber />`
- **Category**: Category 18: Advanced Utilities | **Tier**: `showcase` | **Difficulty**: `beginner`
- **Subtitle**: 48-Bar Frequency Waveform Player & Speed Pill
- **MUI Flaw Addressed**: *MUI Slider only renders a flat 4px line with no acoustic bar visualization or chapter markers.*
- **JXUI Upgrade**: **Interactive 48-bar acoustic frequency scrubber with hover timestamp preview, playback speed pill cycler (1.0x–2.0x), and animated equalizer bars.**

**Usage Example**:
```tsx
<JXAudioWaveformScrubber
  title="RFC-042 Design Architecture Review.wav"
  durationSeconds={184}
  playbackRates={[1, 1.25, 1.5, 2]}
  chapters={[{ at: 42, label: 'Spring Physics' }, { at: 118, label: 'Zero-Notch Inputs' }]}
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

### `<InfiniteScroll />`
- **Category**: Category 18: Advanced Utilities | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Intersection sentinel triggering next batch
- **MUI Flaw Addressed**: *Manual scroll listeners*
- **JXUI Upgrade**: **Zero-overhead IntersectionObserver**

**Usage Example**:
```tsx
<InfiniteScroll />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<VirtualList />`
- **Category**: Category 18: Advanced Utilities | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Windowed list rendering only visible rows
- **MUI Flaw Addressed**: *Renders 10k DOM elements*
- **JXUI Upgrade**: **Fixed 10 DOM node memory footprint**

**Usage Example**:
```tsx
<VirtualList />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ScrollProgress />`
- **Category**: Category 18: Advanced Utilities | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Top thin progress bar tracking page scroll
- **MUI Flaw Addressed**: *No reading progress affordance*
- **JXUI Upgrade**: **Fixed reading progress strip**

**Usage Example**:
```tsx
<ScrollProgress />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ScrollToTop />`
- **Category**: Category 18: Advanced Utilities | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Floating pill button appearing after scrolling
- **MUI Flaw Addressed**: *Manual window.scrollTo code*
- **JXUI Upgrade**: **Smooth spring scroll to top**

**Usage Example**:
```tsx
<ScrollToTop />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ImageLightbox />`
- **Category**: Category 18: Advanced Utilities | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Fullscreen zoomable image viewer with backdrop
- **MUI Flaw Addressed**: *Basic dialog with img tag*
- **JXUI Upgrade**: **Pinch & zoom lightbox**

**Usage Example**:
```tsx
<ImageLightbox />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<ImageComparison />`
- **Category**: Category 18: Advanced Utilities | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Before/After slider dragging between 2 images
- **MUI Flaw Addressed**: *Side-by-side images only*
- **JXUI Upgrade**: **Interactive scrub comparison**

**Usage Example**:
```tsx
<ImageComparison />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<VideoPlayer />`
- **Category**: Category 18: Advanced Utilities | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Custom styled media player with tactile controls
- **MUI Flaw Addressed**: *Raw browser video controls*
- **JXUI Upgrade**: **Luminescent video player**

**Usage Example**:
```tsx
<VideoPlayer />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<AudioVisualizer />`
- **Category**: Category 18: Advanced Utilities | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Real-time frequency equalizer canvas animation
- **MUI Flaw Addressed**: *Native audio element only*
- **JXUI Upgrade**: **Fluid audio equalizer waves**

**Usage Example**:
```tsx
<AudioVisualizer />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<QRCodeGenerator />`
- **Category**: Category 18: Advanced Utilities | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Dynamic SVG QR code renderer with logo center
- **MUI Flaw Addressed**: *Raster image download*
- **JXUI Upgrade**: **Clean scalable vector QR**

**Usage Example**:
```tsx
<QRCodeGenerator />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

### `<TourGuide />`
- **Category**: Category 18: Advanced Utilities | **Tier**: `primitive` | **Difficulty**: `beginner`
- **Subtitle**: Interactive step-by-step onboarding spotlight
- **MUI Flaw Addressed**: *Annoying popups*
- **JXUI Upgrade**: **Guided spotlight step tour**

**Usage Example**:
```tsx
<TourGuide />
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `'solid' \| 'glass' \| 'subtle' \| 'outline' \| 'ghost'` | `'solid'` | Tactile v3.0 surface rendering mode with specular highlights and adaptive contrast. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Physical dimension sizing with lock-width metrics guaranteeing zero layout shift. |
| `disabled` | `boolean` | `false` | Accessible disabled state maintaining 4.5:1 contrast and aria-disabled binding. |
| `className` | `string` | `''` | Optional Tailwind CSS classes for custom layout overrides. |
| `version` | `'3.0' \| '3.0.0'` | `'3.0.0'` | JXUI v3.0 engine schema and token contract identifier. |

---

