# Backline Brand Assets

All brand assets for the Backline platform, organized by type and usage.

## 📁 Asset Map

```
assets/brand/
├── logo-full.svg            Full logo (icon + wordmark), gradient
├── logo-icon.svg            Icon-only, gradient (compact / sidebar)
├── logo-mono-light.svg      Full logo, white (for dark backgrounds)
├── logo-mono-dark.svg       Full logo, dark (for light backgrounds)
├── feature-anchoring.jpg    Persistent Anchoring illustration
├── feature-comments.svg     Contextual Comments illustration
├── feature-integrations.svg Integrations hub-and-spoke diagram
├── feature-kanban.svg       Kanban dashboard illustration
├── feature-realtime.svg     Real-time collaboration (animated)
├── feature-recovery.svg     Recovery Engine illustration
├── og-social-card.jpg       OG / social media card (1:1)
└── BRAND.md                 This file

public/
├── favicon.svg              Browser tab favicon
└── vite.svg                 (Vite default — not used)

docs/
└── banner.jpg               README hero banner (16:9)
```

## 🎨 Brand Colors

| Token | Hex | Usage |
|---|---|---|
| Primary Start | `#7c3aed` | Gradient start, purple accent |
| Primary End | `#2563eb` | Gradient end, blue accent |
| Success | `#22c55e` | Resolved states, positive actions |
| Warning | `#f59e0b` | In-progress, attention states |
| Danger | `#ef4444` | Errors, destructive actions |
| Cyan | `#06b6d4` | Info, secondary accent |
| Surface Dark | `#0f172a` | Background (dark mode) |
| Surface Elevated | `#1e293b` | Cards, panels |
| Border | `#334155` | Dividers, subtle outlines |
| Text Primary | `#e2e8f0` | Headings, body (dark mode) |
| Text Secondary | `#94a3b8` | Captions, metadata |

## 🔤 Typography

- **Primary font:** Inter (Google Fonts)
- **Fallbacks:** Segoe UI, system-ui, sans-serif
- **Wordmark weight:** 700 (Bold)
- **Letter spacing:** -0.5px (wordmark only)

## 📐 Logo Usage

| Variant | When to use |
|---|---|
| `logo-full.svg` | Default — header, sign-in page, marketing |
| `logo-icon.svg` | Collapsed sidebar, mobile header, favicon fallback |
| `logo-mono-light.svg` | Over dark photos / video, dark UI surfaces |
| `logo-mono-dark.svg` | Print, light-background contexts |

### Clear space

Maintain at least **1× icon height** of clear space around the logo on all sides.

### Don'ts

- Don't rotate, skew, or add drop shadows to the logo
- Don't change the gradient colors
- Don't recreate the wordmark in a different typeface
- Don't use the icon without the bubble outline (it's the defining shape)

## 🖼️ Feature Illustrations

Use these on landing pages, docs, and onboarding flows:

| File | Feature | Format |
|---|---|---|
| `feature-anchoring.jpg` | Persistent Anchoring (DOM fingerprint) | Raster (AI-generated) |
| `feature-comments.svg` | Contextual Comments (click → pin → comment) | Vector |
| `feature-integrations.svg` | Integrations (Slack, ClickUp, Trello…) | Vector |
| `feature-kanban.svg` | Dashboard Board (kanban + drag) | Vector |
| `feature-realtime.svg` | Real-time Collaboration (cursors + pulse) | Vector (animated) |
| `feature-recovery.svg` | Recovery Engine (displaced → recovered) | Vector |

## 📱 Social / OG

- `og-social-card.jpg` — Square 1:1 card for `<meta property="og:image">`
- `docs/banner.jpg` — Wide 16:9 hero for the GitHub README
