# Original User Request

## Approved Task Prompt — 2026-11-02T22:58:48Z

Act as a Senior Product Designer, Senior UI/UX Engineer, and Senior Frontend Developer. Recreate the reference enterprise dashboard for AI Bridge in apps/dashboard as a clean, sophisticated, production-release interface using @jacxishippingorg/jx-ui-react, motion, and lucide-react with zero custom UI components.

Working directory: apps/dashboard
Integrity mode: development

Reference material:
- Design specifications: apps/dashboard/DASHBOARD_DESIGN_SPEC.md
- Implementation references: apps/dashboard/stitch_design_system_implementation

## Requirements

### R1. Strict Technology Stack & Zero Custom UI Components
Exclusively use `@jacxishippingorg/jx-ui-react` for all UI components, `motion` for animations and transitions, and `lucide-react` for icons. Absolutely forbid custom React UI components, custom component wrappers, custom CSS, inline styles, CSS modules, SCSS, Tailwind, manually recreated UI elements, custom SVG icons, or alternative implementations of existing library components. Standard React state, hooks, event handlers, conditional rendering, and application logic are permitted. Inspect the installed library exports and TypeScript definitions rather than inventing component names, properties, or functionality.

### R2. Senior Product Design & Prohibition of Generic AI Aesthetics
Implement a deliberate, consistent, and professional enterprise SaaS design language with clean visual hierarchy, disciplined spacing and alignment, restrained color palette, and professional typography. Strictly avoid generic AI-generated aesthetic tropes: random gradients, purple/pink/blue gradient backgrounds, excessive rounded cards, unnecessary glassmorphism, random colorful badges, excessive shadows, decorative blobs/shapes, emojis, stickers, oversized headings, fake charts, repetitive sections, and AI marketing slogans.

### R3. Content, Typography, and Iconography Standards
Ensure all interface text is concise, realistic, and relevant, avoiding promotional copy, filler text, generic welcome messages, or invented business metrics. Use `lucide-react` icons exclusively and only where they enhance recognition and usability, maintaining consistent sizing and restrained stroke weights without decorative icon overload or emojis.

### R4. Complete Dashboard Reconstruction
Recreate the entire dashboard application across all accessible navigation destinations and workflows specified in the references, including dashboard overview, sidebar pages, navigation and nested sections, analytics and reporting, data tables, search and filtering, detail views, forms and workflows, settings, account management, and notifications. Each page must feature a distinct, context-appropriate content structure rather than duplicating a generic layout.

### R5. Functional Accuracy, State, and Purposeful Motion
Ensure every visible interactive element functions, implementing navigation, search, filters, sorting, pagination, dropdowns, tabs, forms, dialogs/modals, settings, notifications, and clear states (loading, empty, error/success feedback) backed by realistic local state. Use `motion` only where it improves the user experience, ensuring animations are subtle, smooth, fast, and purposeful without unnecessary bouncing, dramatic scaling, or decorative animation.

## Acceptance Criteria

### Technology Stack & Component Integrity
- [ ] Only `@jacxishippingorg/jx-ui-react`, `motion`, and `lucide-react` are installed and imported in `apps/dashboard`.
- [ ] No custom CSS files, inline `style={...}` attributes, CSS modules, SCSS, Tailwind, or custom UI component wrapper abstractions are present.
- [ ] Running `npm run build` in `apps/dashboard` succeeds with exit code 0 and zero TypeScript or bundling errors.

### Visual Polish & Anti-AI Standards
- [ ] Interface layout uses neutral backgrounds, restrained semantic status colors, and consistent spacing across all screens.
- [ ] No purple/pink/blue decorative gradients, floating abstract blobs, decorative emojis, or promotional filler text exist in any view.
- [ ] Icons are sourced exclusively from `lucide-react` with consistent sizing and functional purpose.

### Functional Completeness & Interactive Behavior
- [ ] All sidebar navigation links, nested sub-routes, and tabs resolve to distinct, fully structured page views matching the design specifications.
- [ ] All interactive controls (search filters, column sorting, pagination, dropdown menus, modals/dialogs, form inputs) update and reflect state changes interactively.
- [ ] Simulated flows provide realistic local state with appropriate loading, empty, and feedback states.

## Verification Resources
- Run `npm run build` in `apps/dashboard` to verify TypeScript types and build integrity.
- Automated component and flow tests written by the team to verify route rendering and interactive control states.

