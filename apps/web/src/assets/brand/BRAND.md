# Backline Brand & Motion Assets

All brand identity, 3D interactive graphics, vector logos, cinematic loaders, and explainer animations for the Backline platform.

## 📁 Asset Map

```
apps/web/src/assets/brand/
├── brand-design-system.html         Master Interactive Brand & Motion Showcase Gallery
├── logo-3d-interactive.html         Interactive 3D WebGL (Three.js) Insignia with Orbit Controls
├── factory-cinematic-loader.html    Factory.ai & Fable style Multi-Sequence Command Loader
├── explainer-how-it-works-3d.html   3D Core Idea Explainer (DOM Pinning & Self-Healing Engine)
├── splash-loader.html               Cinematic SVG Stroke Draw Splash Screen
│
├── logo-3d-photoreal.svg            Photorealistic 3D Specular & Glass Shader SVG Emblem
├── logo-3d-mark.svg                 3D Isometric Brand Mark with Drop Shadow
├── logo-full.svg                    Full Logo (Icon + Wordmark), Gradient
├── logo-icon.svg                    Icon-only, Gradient (Compact / Sidebar)
├── logo-mono-light.svg              Full Logo, White (For dark backgrounds)
├── logo-mono-dark.svg               Full Logo, Dark (For light backgrounds)
│
├── feature-spatial-pinning-3d.svg   3D Isometric Spatial Pinning & DOM Target Reticle
├── feature-neural-recovery-3d.svg   Autonomous DOM Heuristic Recovery & Self-Healing Illustration
├── feature-anchoring.jpg            Persistent Anchoring illustration
├── feature-comments.svg             Contextual Comments illustration
├── feature-integrations.svg         Integrations hub-and-spoke diagram
├── feature-kanban.svg               Kanban dashboard illustration
├── feature-realtime.svg             Real-time collaboration (animated)
├── feature-recovery.svg             Recovery Engine illustration
├── og-social-card.jpg               OG / Social Media Card (1:1)
└── BRAND.md                         This documentation file

public/
├── favicon.svg                      Browser tab favicon (Target Crosshairs inside Bubble)
└── vite.svg                         (Vite default — not used)

docs/
└── banner.jpg                       README hero banner (16:9)
```

---

## 🚀 Interactive 3D & Cinematic Components

### 1. `brand-design-system.html`
**Master Design System Portal**: Open directly in any browser to test and inspect all logos, 3D models, loaders, vectors, and color tokens side-by-side in fullscreen.

### 2. `logo-3d-interactive.html`
**Real-Time 3D WebGL Three.js Emblem**:
- **Orbit & Tilt**: Full 360° mouse drag orbit controls and reactive lighting caustics.
- **Material Presets**: Toggle between **Iridescent Glass**, **Titanium Chrome**, and **Holo-Wireframe**.
- **Explosion Mode**: Interactive slider that pulls apart the 3D layers (Outer Shell, Concentric Reticles, Optics, and Singularity Core).
- **Telemetry HUD**: Real-time FPS, vertex count, and anchor precision readouts.

### 3. `factory-cinematic-loader.html`
**Factory.ai / Fable Style Multi-Sequence Loader**:
- **4-Stage Morphing Insignias**: Precision Scope ➔ DOM Wireframe ➔ Spatial Pin ➔ 3D Master Insignia.
- **Kinetic Command Feed**: Fast-scrolling telemetry (`[0.18ms] INITIALIZE_SPATIAL_OPTICS`, `[0.42ms] INDEX_DOM_HIERARCHY`, `[0.78ms] ESTABLISH_SOCKET_MESH`).
- **Staggered Typography**: Cinematic letter slide-in transition for `BACKLINE` followed by seamless app reveal.
- **Replayable**: Includes interactive speed controls (1x, 2x) and instant replay button.

### 4. `explainer-how-it-works-3d.html`
**3D Core Concept Explainer & Interactive Sandbox**:
- **Interactive Web Sandbox**: Click anywhere on the live simulated page to drop real-time spatial pins.
- **Dynamic DOM Redesign Simulator**: Hit "Simulate Redesign" to watch how Backline's recovery algorithm instantly calculates a 99.4% confidence score and relocates the pin when HTML/CSS changes!
- **Isometric 3D Toggle**: Switches the browser window between 2D flat and 3D spatial isometric perspective.

---

## 🎨 Brand Colors

| Token | Hex | Usage |
|---|---|---|
| Primary Start | `#7c3aed` | Gradient start, purple accent |
| Primary End | `#2563eb` | Gradient end, blue accent |
| Laser Cyan | `#06b6d4` | Targeting lasers, active reticles, telemetry |
| Success Emerald | `#10b981` | Resolved states, healed selectors, positive actions |
| Warning Amber | `#f59e0b` | In-progress, attention states |
| Danger Rose | `#ef4444` | Displaced nodes, errors, destructive actions |
| Surface Dark | `#030611` | Background (dark void) |
| Surface Elevated | `#0a0e1c` | Cards, panels, HUD |
| Border | `rgba(99, 102, 241, 0.25)` | Subtle glowing dividers |
| Text Primary | `#f8fafc` | Headings, primary body |
| Text Secondary | `#94a3b8` | Captions, metadata, telemetry |

---

## 🔤 Typography

- **Primary font:** Inter (Google Fonts)
- **Code & Telemetry:** JetBrains Mono
- **Wordmark weight:** 900 (Black / Heavy)
- **Wordmark Letter spacing:** `0.15em`

---

## 📐 Logo Assets Reference

| File | Variant | Use Case |
|---|---|---|
| `logo-3d-photoreal.svg` | 3D Photoreal Specular Emblem | High-impact hero sections, marketing, splash screens |
| `logo-3d-mark.svg` | 3D Isometric Mark | Brand highlights, feature cards, app launcher |
| `logo-full.svg` | Flat Gradient Icon + Wordmark | App header, sign-in page, docs |
| `logo-icon.svg` | Flat Gradient Icon | Collapsed sidebar, mobile navigation |
| `logo-mono-light.svg` | Pure White Monochrome | Dark media, video overlays, monochrome prints |
| `logo-mono-dark.svg` | Dark Charcoal Monochrome | Light paper, documentation printouts |
| `favicon.svg` | Target Reticle Favicon | Browser tabs and PWA icons |
