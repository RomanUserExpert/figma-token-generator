# Token Studio — Figma Plugin

A Figma plugin that generates a practical, startup-ready design token system in seconds.

Primitive palettes + semantic tokens + accessible mappings + ready-to-use text styles — all from a clean preset-first UI.

---

## What it generates

| Module | Output |
|--------|--------|
| **Colors** | Primitive color palettes (8/10/11 shades) + optional semantic tokens |
| **Spacing** | Spacing scale variables |
| **Typography** | Font-size, line-height, font-weight, font-family variables + Figma text styles |
| **Border Radius** | Radius token scale |
| **Elevation** | Drop shadow effect styles + variables |

---

## Features

### Colors
- 6 base colors: Neutral, Brand, Info, Error, Success, Warning
- Custom colors with role selection (Primitive only / Accent / Status / Custom role)
- Shade presets: Compact (8), Standard (10), System (11)
- Ant Design palette algorithm — perceptually balanced light and dark shades
- Color input validation: warns when a color is too light, too dark, or too pale — with a one-click Fix

### Semantic Tokens
- Generated into a separate **Semantics** collection
- Full set: Background, Surface, Text, Icon, Border, Actions, Status
- Subtle + Strong variants for all colored surfaces and borders
- Accessibility-optimized mappings by default

### Dark Mode
- Toggle to generate a **Primitives Dark** collection
- Semantic tokens automatically map across Light and Dark modes
- When disabled, no Dark mode is created in the Semantics collection

### Typography
- Multiple font groups — assign categories per font (e.g. Space Grotesk → Heading, Inter → Body)
- Categories: Heading (H1–H6), Title (L/M/S), Body (L/M/S), Label (L/M/S), Caption (L/M/S), Button (L/M/S), Link (L/M/S)
- Presets: Compact, Standard, Large
- Scale ratios: Minor 2nd → Perfect 4th
- Link styles get `UNDERLINE` text decoration automatically

### Border Radius
- Sharp / Balanced / Rounded / Soft presets
- Tokens under `radius/` path prefix

### Elevation
- Soft / Material / Sharp shadow presets
- Variables bound to effect styles

---

## Token Architecture

```
Primitives          — raw color values (color/brand/500, color/neutral/50…)
Primitives Dark     — dark variant (optional, when dark mode is on)
Semantics           — semantic aliases mapped per Light/Dark mode
Typography          — font variables
Spacing             — spacing variables
Border Radius       — radius variables
Elevation           — shadow variables
```

### Semantic token groups

```
bg/primary · bg/inversed

surface/primary · surface/secondary · surface/tertiary · surface/inversed
surface/brand/subtle · surface/brand/strong
surface/info/subtle · surface/info/strong  (+ success, warning, error)

text/primary · text/secondary · text/tertiary · text/inversed
text/brand · text/info · text/success · text/warning · text/error

icon/primary · icon/secondary · icon/tertiary · icon/inversed
icon/brand · icon/info · icon/success · icon/warning · icon/error

border/primary · border/secondary · border/tertiary · border/inversed · border/focus
border/brand/subtle · border/brand/strong
border/info/subtle · border/info/strong  (+ success, warning, error)

action/primary/default · hover · pressed · focused · disabled
action/secondary/*  ·  action/tertiary/*
```

---

## Installation (development)

1. Clone the repo
2. Open Figma desktop → **Plugins → Development → Import plugin from manifest**
3. Select `manifest.json`
4. Run the plugin from the Plugins menu

No build step required — the plugin runs directly from `code.js` and `ui.html`.

---

## File structure

```
code.js        — Figma plugin backend (variable/style generation)
ui.html        — Plugin UI (React + Babel, no bundler)
manifest.json  — Figma plugin manifest
```

---

## Target users

Freelance designers, agencies, startup product teams, and SaaS/web app designers who need a clean Figma variable system quickly — without configuring 900 options manually.
