# Token Studio — Product & Implementation Spec for Claude Code

## Goal
Build a Figma plugin called **Token Studio** that generates a practical starter token system for product/UI design.

The plugin should focus on fast, clean token generation for:

- Colors
- Spacing
- Typography
- Border Radius
- Elevation
- Opacity

Main positioning: **design system bootstrap tool**, not an enterprise token monster.

Target users:

- Freelance designers
- Agencies
- Startup product teams
- SaaS/web app designers
- Small product teams that need clean Figma variables and styles quickly

---

# 1. General UX Principles

## Keep it preset-first
Users should not have to configure everything manually.

Use simple presets with advanced controls only when needed.

Good pattern:

```txt
Compact — small/simple systems
Standard — SaaS/web apps
System — larger design systems
```

## Avoid showing huge token lists by default
Do not dump all generated semantic tokens in the UI.

Use progressive disclosure:

- Show compact summary
- Show includes list
- Optional “Preview token structure” modal/accordion later

## Mental model
The plugin has modules:

```txt
Colors
Spacing
Typography
Border Radius
Elevation
Opacity
```

User can select modules from the left sidebar.

---

# 2. Colors Module

## Base Colors
Default base color inputs:

```txt
brand
info
neutral
error
success
warning
```

Note: Prefer `Neutral` instead of `Gray` in final UI because it is more system-friendly and supports warm/cool neutral palettes.

Each color should accept HEX.

Default example values:

```txt
brand: 3D78FF
info: 0686D4
neutral: 6B7280
error: EF4444
success: 22C55E
warning: F59E0B
```

Add button:

```txt
+ add custom color
```

---

## Custom Colors
When user adds a custom color, do not automatically add it to semantic tokens.

Custom colors should have a semantic role selector:

```txt
Use as:
- Primitive only
- Accent
- Status
- Custom role
```

### Primitive only
Only generate primitive palette:

```txt
color/purple/100
color/purple/200
...
```

### Accent
Can generate:

```txt
action/accent/default
action/accent/hover
action/accent/pressed
action/accent/focused
text/accent
icon/accent
border/accent
surface/accent
```

### Status
Can replace or extend status colors such as info/success/warning/error.

### Custom role
User enters a role name, for example:

```txt
premium
```

Generate:

```txt
surface/premium
text/premium
icon/premium
border/premium
```

Do not generate action states for custom roles by default unless user enables interaction states.

---

## Shade Scale
Use presets instead of raw number-only UI.

Recommended options:

```txt
Compact — 8 shades
Standard — 10 shades
System — 11 shades
```

Default:

```txt
Standard — 10 shades
```

### Compact — 8 shades
Good for simple sites/landing pages.

Example naming:

```txt
100
200
300
400
500
600
700
800
```

### Standard — 10 shades
Good for most SaaS/web apps.

Example naming:

```txt
50
100
200
300
400
500
600
700
800
900
```

### System — 11 shades
Good for larger design systems.

Example naming:

```txt
50
100
200
300
400
500
600
700
800
900
950
```

---

## Naming Convention
Options:

```txt
100–900
50–900
50–950
1–10
```

Make naming options compatible with selected shade count.

Example:

- 10 shades → `50–900`
- 11 shades → `50–950`
- 8 shades → `100–800`

---

## Collections
Recommended MVP architecture:

### Primitives
One primitive palette collection.

```txt
Collection: Primitives
```

Primitive colors are raw palette values:

```txt
color/brand/50
color/brand/100
color/brand/200
...
color/neutral/950
```

### Semantics
Separate semantic collection.

```txt
Collection: Semantics
Modes:
- Light
- Dark
```

Semantic tokens map to primitives per mode.

Example:

```txt
bg/primary
Light → color/neutral/50
Dark → color/neutral/950
```

```txt
text/primary
Light → color/neutral/950
Dark → color/neutral/50
```

---

## Dark Mode
Dark mode should be a toggle.

When enabled:

- Generate dark primitive palette if required by strategy
- Generate semantic mappings across Light/Dark modes

UI copy suggestion:

```txt
Generates dark palette and maps semantic tokens across Light/Dark modes.
```

Dark mode strategies:

```txt
Mirror
Hue shift
Manual later
```

### Recommended MVP behavior
Use one primitive palette and map semantics differently for Light/Dark.

Do not create separate primitive light/dark collections by default unless advanced option is enabled.

Optional advanced feature:

```txt
Generate separate dark primitives
```

---

# 3. Semantic Color Tokens

Semantic tokens should be optional toggle inside Colors.

```txt
Semantic tokens: on/off
```

Do not show full generated list by default. Show compact includes summary.

## Includes
Recommended includes list:

```txt
Background
Surface
Text
Icon
Border
Actions
Status
```

Use `Status` instead of `Feedback`. Feedback is unclear.

---

## Base Semantic Set

### Background
For page/app backgrounds.

```txt
bg/primary
bg/inversed
```

### Surface
For cards, containers, modals, panels, alerts.

```txt
surface/primary
surface/secondary
surface/tertiary
surface/inversed
surface/brand/subtle
surface/brand/strong
surface/info/subtle
surface/info/strong
surface/success/subtle
surface/success/strong
surface/warning/subtle
surface/warning/strong
surface/error/subtle
surface/error/strong
```

### Text
```txt
text/primary
text/secondary
text/tertiary
text/inversed
text/info
text/success
text/warning
text/error
```

### Icon
```txt
icon/primary
icon/secondary
icon/tertiary
icon/inversed
icon/info
icon/success
icon/warning
icon/error
```

### Border
```txt
border/primary
border/secondary
border/tertiary
border/inversed
border/brand/subtle
border/brand/strong
border/info/subtle
border/info/strong
border/success/subtle
border/success/strong
border/warning/subtle
border/warning/strong
border/error/subtle
border/error/strong
border/focus
```

### Actions
Actions need states.

```txt
action/primary/default
action/primary/hover
action/primary/pressed
action/primary/focused
action/primary/disabled

action/secondary/default
action/secondary/hover
action/secondary/pressed
action/secondary/focused
action/secondary/disabled

action/tertiary/default
action/tertiary/hover
action/tertiary/pressed
action/tertiary/focused
action/tertiary/disabled
```

Status actions are not required for MVP:

```txt
action/success/*
action/error/*
action/warning/*
action/info/*
```

Keep them optional/advanced later.

---

# 4. Accessibility / WCAG Logic

Do not build a full WCAG checker UI in MVP.

Instead, generate semantic mappings that are accessibility-safe by default.

Positioning:

```txt
Accessibility optimized semantic mapping
```

## How it should work

1. Generate primitive palette.
2. Generate semantic mappings.
3. Check important foreground/background pairs.
4. If contrast fails, choose closest accessible shade.
5. Do not mutate the original brand/base color.
6. Change only semantic mapping aliases.

Example:

```txt
action/primary/default = brand/500
text/inversed = white
```

If it fails AA:

```txt
Try brand/600 → brand/700 → brand/800
Use first shade that passes.
```

## Contrast pairs to check

### Text
```txt
text/primary ↔ bg/primary
text/secondary ↔ bg/primary
text/tertiary ↔ bg/primary
text/inversed ↔ bg/inversed

text/success ↔ surface/success
text/error ↔ surface/error
text/warning ↔ surface/warning
text/info ↔ surface/info
```

### Icon
```txt
icon/primary ↔ bg/primary
icon/secondary ↔ bg/primary
icon/tertiary ↔ bg/primary
icon/inversed ↔ bg/inversed

icon/success ↔ surface/success
icon/error ↔ surface/error
icon/warning ↔ surface/warning
icon/info ↔ surface/info
```

### Border
```txt
border/primary ↔ bg/primary
border/secondary ↔ bg/primary
border/tertiary ↔ bg/primary
border/inversed ↔ bg/inversed

border/brand/subtle ↔ surface/brand/subtle
border/brand/strong ↔ surface/brand/strong

border/success/subtle ↔ surface/success/subtle
border/success/strong ↔ surface/success/strong
border/error/subtle ↔ surface/error/subtle
border/error/strong ↔ surface/error/strong
border/warning/subtle ↔ surface/warning/subtle
border/warning/strong ↔ surface/warning/strong
border/info/subtle ↔ surface/info/subtle
border/info/strong ↔ surface/info/strong

border/focus ↔ bg/primary
```

### Actions
```txt
text/inversed ↔ action/primary/default
text/inversed ↔ action/primary/hover
text/inversed ↔ action/primary/pressed

text/primary ↔ action/secondary/default
text/primary ↔ action/secondary/hover
text/primary ↔ action/secondary/pressed

text/primary ↔ action/tertiary/default
text/primary ↔ action/tertiary/hover
text/primary ↔ action/tertiary/pressed
```

## Do not check

Do not compare:

```txt
primitive vs primitive
text vs text
border vs border
all colors vs all colors
```

That creates noise.

## WCAG thresholds

```txt
Normal text: AA 4.5:1
Large text: AA 3:1
Icons / borders / UI elements: 3:1
```

---

# 5. Spacing Module

Keep spacing simple.

Current desired settings:

```txt
Collection name
Prefix
Base unit
Scale size
Naming
Example preview
```

## Base Unit
Options:

```txt
2
4
6
8
```

Default:

```txt
4
```

## Scale Size
Use same preset language as colors.

```txt
Compact — 8 tokens
Standard — 12 tokens
System — 16 tokens
```

Default:

```txt
Standard — 12 tokens
```

## Naming
Options:

```txt
Value based: spacing-4, spacing-8, spacing-12
Sequential: spacing-1, spacing-2, spacing-3
T-shirt later: xs, sm, md, lg
```

Default recommendation:

```txt
Value based
```

## Example Preview
Show dynamic example based on current settings.

Example for base unit 4 and compact 8:

```txt
spacing/spacing-4
spacing/spacing-8
spacing/spacing-12
...
```

or if sequential:

```txt
spacing/1 = 4px
spacing/2 = 8px
spacing/3 = 12px
```

## Remove from MVP
Remove or hide advanced:

```txt
Scale type
Include negative
```

Negative spacing can be advanced later.

---

# 6. Typography Module

Typography should generate both:

1. Typography variables/tokens
2. Optional Figma text styles

## Key idea
Variables are raw values:

```txt
font-size/*
line-height/*
letter-spacing/*
font-weight/*
font-family/*
```

Text styles are composed styles:

```txt
Heading/H1
Body/M
Label/M
Caption/S
```

User needs ready-to-use text styles, not just variables.

---

## Typography Preset
Add one global preset at the top.

```txt
Typography preset
```

Options:

```txt
Compact — enterprise dashboards / dense systems
Standard — SaaS / web apps
Large — landing pages / marketing websites
```

Default:

```txt
Standard
```

The global preset controls the overall size ranges and hierarchy.

### Compact
Good for enterprise dashboards, admin panels, dense systems.

Smaller headings, tighter hierarchy.

Example ranges:

```txt
Heading: 20–40
Title: 16–24
Body: 14–16
Caption: 10–12
```

### Standard
Good for SaaS products, web apps, marketplaces.

Balanced hierarchy.

Example ranges:

```txt
Heading: 24–48
Title: 18–28
Body: 14–18
Caption: 12–14
```

### Large
Good for landing pages and marketing websites.

Larger headings, stronger hierarchy.

Example ranges:

```txt
Heading: 32–72
Title: 20–40
Body: 16–20
Caption: 12–16
```

---

## Font Groups
Instead of only `Primary font` and `Mono font`, support multiple font groups.

Button:

```txt
+ Add font
```

Each font group can define:

```txt
Font family
Assigned categories
Scale ratio
Weights
Line height behavior
Letter spacing behavior
```

Example:

```txt
Font 1
Family: Inter
Assigned: Body, Caption, Label, Title
Scale ratio: Major Second
```

```txt
Font 2
Family: Space Grotesk
Assigned: Heading
Scale ratio: Major Third
```

This supports users who need:

- one font only
- heading + body fonts

---

## Text Categories
Use familiar naming.

Recommended categories:

```txt
Heading
Title
Body
Label
Caption
```

### Heading
Page and section headings.

```txt
Heading/H1
Heading/H2
Heading/H3
Heading/H4
Heading/H5
Heading/H6
```

### Title
Intermediate titles for components.

Used for:

- modal titles
- card titles
- table titles
- widget titles
- smaller section labels

```txt
Title/L
Title/M
Title/S
```

### Body
Main reading text.

```txt
Body/L
Body/M
Body/S
```

### Label
For UI labels.

Used for:

- buttons
- inputs
- tabs
- chips
- form labels

```txt
Label/L
Label/M
Label/S
```

### Caption
Small supporting text.

Used for:

- hints
- helper text
- timestamps
- metadata

```txt
Caption/L
Caption/M
Caption/S
```

---

## Scale Ratios
Do not provide too many ratios.

Recommended options:

```txt
Compact UI — Minor Second (1.067)
Product — Major Second (1.125)
Balanced — Minor Third (1.2)
Marketing — Major Third (1.25)
Editorial — Perfect Fourth (1.333)
```

Default:

```txt
Balanced — Minor Third (1.2)
```

Avoid Golden Ratio in MVP. It is usually too aggressive for real UI systems.

## Preset vs Ratio
Global typography preset controls macro behavior.

Scale ratio is per font group and controls micro tuning.

Example:

```txt
Global preset: Standard

Inter:
Assigned: Body, Label, Caption
Ratio: Major Second

Space Grotesk:
Assigned: Heading
Ratio: Major Third
```

---

## Size Generation Logic
Do not blindly multiply everything by scale ratio.

Use `Body/M` as anchor.

Example:

```txt
Base size = 16px
Body/M = 16px
```

Then derive categories from preset ranges.

Example standard system:

```txt
Body/S = 14
Body/M = 16
Body/L = 18

Caption/S = 11 or 12
Caption/M = 12
Caption/L = 14

Label/S = 12
Label/M = 14
Label/L = 16

Title/S = 18
Title/M = 20
Title/L = 24

Heading/H6 = 20 or 24
Heading/H5 = 24
Heading/H4 = 28 or 32
Heading/H3 = 32
Heading/H2 = 40
Heading/H1 = 48
```

For Large preset, headings/display should be bigger.

For Compact preset, headings should be smaller and hierarchy tighter.

---

## Toggles
Typography module should include:

```txt
Generate typography variables
Generate text styles
```

Recommended default:

```txt
Generate typography variables: on
Generate text styles: on
```

---

# 7. Border Radius Module

Keep simple.

Recommended fields:

```txt
Collection name
Prefix
Radius preset
Naming
```

Presets:

```txt
Sharp
Balanced
Rounded
Soft / Mobile
```

Example tokens:

```txt
radius/none
radius/xs
radius/sm
radius/md
radius/lg
radius/xl
radius/2xl
radius/full
```

---

# 8. Elevation Module

Add elevation/shadow tokens.

Recommended tokens:

```txt
elevation/none
elevation/xs
elevation/sm
elevation/md
elevation/lg
elevation/xl
```

or:

```txt
shadow/xs
shadow/sm
shadow/md
shadow/lg
shadow/xl
```

Recommended presets:

```txt
Soft
Material
Sharp
```

Settings can include:

```txt
shadow color
opacity
blur scale
Y offset scale
```

But MVP can be preset-only.

---

# 9. Opacity Module

Lightweight module.

Recommended tokens:

```txt
opacity/0
opacity/5
opacity/10
opacity/20
opacity/30
opacity/40
opacity/50
opacity/60
opacity/70
opacity/80
opacity/90
opacity/100
```

Optional semantic opacities:

```txt
opacity/disabled
opacity/hover
opacity/pressed
opacity/backdrop
opacity/overlay
```

---

# 10. Stylesheet

The plugin generates a visual token preview on a dedicated **"Token Stylesheet"** page in Figma. Controlled by a **Stylesheet** checkbox in the footer (on by default). The page is cleared and rebuilt every run.

## Frames

One frame per active module, placed left-to-right:

### Colors
One row per color — label + horizontal swatches (44×44px each). Swatch fills are bound to the primitive variables so they update when variables change.

### Semantic Tokens
Vertical list of all semantic token swatches (16×16px) grouped by prefix: bg · surface · text · icon · border · action. Swatches bound to semantic variables (light mode shown).

### Spacing
Name · px value · proportional bar. Bar width scales to the largest token value.

### Typography
Table with columns: Style · Size · Weight · Preview. Preview shows "Aa" rendered in the actual font at the actual size (capped at 28px to prevent oversized heading rows). Category dividers separate Heading / Title / Body / Label / Caption / Button / Link.

### Border Radius
Row of 60×60 rounded rectangles with the actual radius applied. Labeled with token name and px value below.

### Elevation
Row of 80×56 white cards with the actual shadow effects applied. Labeled with level name below.

---

# 11. MVP Scope

## Include in MVP

```txt
Colors
Semantic colors
Spacing
Typography variables
Text styles
Border Radius
Elevation
Opacity
Accessible semantic mapping
Stylesheet (visual token preview page)
```

## Do not include in MVP

```txt
Breakpoints
Z-index
Motion tokens
Component tokens
Full WCAG audit UI
Chart/data-vis tokens
Enterprise-level semantic levels
Negative spacing by default
```

---

# 12. Suggested Module Order

Left sidebar order:

```txt
Colors
Spacing
Typography
Border Radius
Elevation
Opacity
```

Optional select all checkbox.

---

# 13. Product Positioning

The plugin should feel like:

```txt
Generate a startup-ready design token system in seconds.
```

Not:

```txt
Configure 900 token options manually.
```

Good defaults matter more than endless settings.

Main differentiator:

```txt
Primitive palettes + semantic tokens + accessible mappings + ready-to-use text styles.
```

