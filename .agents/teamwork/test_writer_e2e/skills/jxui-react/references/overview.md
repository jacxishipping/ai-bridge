# JXUI Design System Overview & Architecture

## Core Philosophy
1. **Zero Layout Shift (CLS 0.00)**: Components reserve bounding geometry during pending, active, and disabled states.
2. **Tactile Spring Physics**: High-performance fluid spring interactions using native motion coordinates and velocity curves.
3. **Specular Glassmorphism**: Multilayered frosted glass with dynamic radial spotlights, top border specular highlights, and deep ambient shadows.
4. **Tailwind CSS v4 Native**: No runtime Emotion or styled-components overhead; compiles purely down to minimal CSS.

## Theming Tokens & Dark Mode
`JXThemeProvider` synthesizes semantic CSS custom properties:
- `--jx-primary`: Brand primary glow & accents.
- `--jx-canvas`: Root surface canvas gradient.
- `--jx-surface-base`: Base container background.
- `--jx-surface-raised`: Elevated card background.
- `--jx-surface-glass`: Backdrop blur frosted acrylic.
- `--jx-border-subtle`: Border stroke.
- `--jx-specular-highlight`: Inner top highlight stroke.

Toggle mode dynamically with:
```tsx
import { useJXTheme } from "@jacxishippingorg/jx-ui-react";

const { mode, setMode, accent, setAccent } = useJXTheme();
```
