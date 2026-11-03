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
