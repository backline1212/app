import { useState, type CSSProperties } from "react";
import type * as api from "./api";

const PREVIEW_PALETTES = [
  { accent: "#69DEB2", accentSoft: "#CFF4E5", ink: "#17342A", paper: "#F5FAF7" },
  { accent: "#E8B833", accentSoft: "#F7E8B8", ink: "#302A18", paper: "#FCFAF2" },
  { accent: "#7C6BE8", accentSoft: "#DED9FF", ink: "#25233A", paper: "#F8F7FF" },
  { accent: "#5B7FA6", accentSoft: "#DCE8F1", ink: "#162B3D", paper: "#F5F9FC" },
] as const;

function hashOf(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  return hash;
}

// A comment pin as the widget draws it on a reviewed page (ui-styles.ts .bl-pin): round
// except the bottom-left corner, which is the point that sits on the spot commented on.
// Drawn with that point at the origin so the drop-in can scale from it.
const PIN = "M0 -8A8 8 0 0 1 8 -16A8 8 0 0 1 16 -8A8 8 0 0 1 8 0L2 0Q0 0 0 -2Z";

type Point = readonly [number, number];

function Pins({ spots, open, total }: { spots: readonly Point[]; open: number; total: number }) {
  if (total === 0) return null;
  if (open === 0) {
    // Everything reviewed so far is closed: one quiet check instead of numbered pins.
    const [x, y] = spots[0]!;
    return (
      <g transform={`translate(${x} ${y})`}>
        <g className="bl-art-pin">
          <path d={PIN} className="bl-art-pin-done" />
          <path d="M4.6 -8.2 7 -5.8 11.6 -10.6" fill="none" stroke="var(--bl-surface)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>
    );
  }
  return (
    <>
      {spots.slice(0, Math.min(open, spots.length)).map(([x, y], index) => (
        <g key={index} transform={`translate(${x} ${y})`} style={{ "--i": index } as CSSProperties}>
          <circle className="bl-art-pin-ring" r="5" />
          <g className="bl-art-pin">
            <g className="bl-art-pin-body">
              <path d={PIN} />
              <text x="8" y="-5.1" textAnchor="middle">
                {index === spots.length - 1 && open > spots.length ? `+${open - index}` : index + 1}
              </text>
            </g>
          </g>
        </g>
      ))}
    </>
  );
}

// Three page layouts, chosen per project, so a grid of cards doesn't read as one image
// repeated. Each names the spots its pins land on: a headline, the artwork, a button.
function WebsiteLayout({ variant }: { variant: number }) {
  if (variant === 1) {
    return (
      <>
        <rect x="96" y="70" width="128" height="10" rx="3" className="bl-art-ink" />
        <rect x="116" y="85" width="88" height="10" rx="3" className="bl-art-ink" />
        <rect x="106" y="103" width="108" height="4" rx="2" className="bl-art-line" />
        <rect x="124" y="111" width="72" height="4" rx="2" className="bl-art-line" />
        <rect x="136" y="123" width="48" height="13" rx="3" className="bl-art-accent" />
        <rect x="28" y="146" width="264" height="70" rx="4" className="bl-art-soft" />
        <circle cx="258" cy="164" r="8" className="bl-art-accent" opacity=".7" />
        <path d="M28 216 96 170l44 28 40-22 112 40Z" className="bl-art-ink" opacity=".14" />
      </>
    );
  }
  if (variant === 2) {
    return (
      <>
        <rect x="28" y="66" width="124" height="82" rx="4" className="bl-art-soft" />
        <path d="M28 148 64 114l28 20 22-14 38 28Z" className="bl-art-ink" opacity=".16" />
        <circle cx="126" cy="86" r="8" className="bl-art-accent" opacity=".7" />
        <rect x="168" y="72" width="112" height="9" rx="3" className="bl-art-ink" />
        <rect x="168" y="86" width="80" height="9" rx="3" className="bl-art-ink" />
        {[104, 116, 128].map((y) => (
          <g key={y}>
            <circle cx="172" cy={y + 2} r="2.5" className="bl-art-accent" />
            <rect x="180" y={y} width={y === 116 ? 70 : 88} height="4" rx="2" className="bl-art-line" />
          </g>
        ))}
        <rect x="168" y="138" width="46" height="13" rx="3" className="bl-art-accent" />
        {[28, 124, 220].map((x) => (
          <rect key={x} x={x} y="164" width="72" height="44" rx="3" className="bl-art-card" />
        ))}
      </>
    );
  }
  return (
    <>
      <rect x="28" y="72" width="122" height="10" rx="3" className="bl-art-ink" />
      <rect x="28" y="87" width="94" height="10" rx="3" className="bl-art-ink" />
      <rect x="28" y="105" width="112" height="4" rx="2" className="bl-art-line" />
      <rect x="28" y="113" width="86" height="4" rx="2" className="bl-art-line" />
      <rect x="28" y="126" width="48" height="13" rx="3" className="bl-art-accent" />
      <rect x="82" y="126" width="40" height="13" rx="3" className="bl-art-outline" />
      <rect x="166" y="66" width="126" height="80" rx="4" className="bl-art-soft" />
      <path d="M166 146 204 110l30 22 24-16 34 30Z" className="bl-art-ink" opacity=".16" />
      <circle cx="266" cy="86" r="9" className="bl-art-accent" opacity=".7" />
      {[28, 116, 204].map((x) => (
        <rect key={x} x={x} y="158" width="80" height="50" rx="3" className="bl-art-card" />
      ))}
    </>
  );
}

const PIN_SPOTS: Record<number, readonly Point[]> = {
  0: [[112, 76], [244, 104], [64, 128]],
  1: [[204, 74], [150, 166], [178, 126]],
  2: [[250, 76], [92, 94], [204, 142]],
};

/**
 * The picture on a project card. Nothing here is a screenshot (capturing one per card
 * would mean a headless-browser render for every project in the grid): a website gets a
 * schematic page with the site's own favicon in its header, an image or PDF project a
 * sketch of its kind. The pins are real, though - one per open comment, up to three,
 * or a check once everything on it is closed. Colors come from a per-project palette
 * that the stylesheet re-mixes for dark mode.
 */
export function ProjectArtwork({ project, open = 0, total = 0 }: { project: api.ProjectOut; open?: number; total?: number }) {
  const seed = hashOf(project.id || project.name);
  const palette = PREVIEW_PALETTES[seed % PREVIEW_PALETTES.length]!;
  const variant = (seed >>> 3) % 3;
  const type = project.project_type ?? "website";
  const initial = project.name.trim()[0]?.toUpperCase() ?? "?";
  const [faviconFailed, setFaviconFailed] = useState(false);
  let hostname: string | null = null;
  try { hostname = new URL(project.target_origin).hostname; } catch { hostname = null; }
  const faviconUrl = hostname ? `https://${hostname}/favicon.ico` : null;
  const style = {
    "--art-accent": palette.accent,
    "--art-soft-raw": palette.accentSoft,
    "--art-ink-raw": palette.ink,
    "--art-paper-raw": palette.paper,
  } as CSSProperties;

  if (project.hero_url) {
    return (
      <div className={`bl-project-art bl-project-art-${type}`} aria-hidden="true">
        <img src={project.hero_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    );
  }

  return (
    <div className={`bl-project-art bl-project-art-${type}`} style={style} aria-hidden="true">
      <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMin slice">
        <rect width="320" height="200" className="bl-art-paper" />
        {type === "website" && (
          <>
            <rect x="16" y="30" width="288" height="190" rx="5" className="bl-art-page" />
            <rect x="28" y="40" width="14" height="14" rx="3" className="bl-art-accent" />
            <text x="35" y="50.4" textAnchor="middle" className="bl-art-initial">{initial}</text>
            {faviconUrl && !faviconFailed && (
              <image key={faviconUrl} href={faviconUrl} x="28" y="40" width="14" height="14" onError={() => setFaviconFailed(true)} />
            )}
            <rect x="48" y="44" width="34" height="6" rx="3" className="bl-art-ink" opacity=".75" />
            {[190, 214, 238].map((x) => <rect key={x} x={x} y="45" width="18" height="4" rx="2" className="bl-art-line" />)}
            <rect x="266" y="41" width="26" height="12" rx="6" className="bl-art-ink" />
            <line x1="16" y1="60" x2="304" y2="60" className="bl-art-rule" />
            <WebsiteLayout variant={variant} />
            <Pins spots={PIN_SPOTS[variant]!} open={open} total={total} />
          </>
        )}
        {type === "image" && (
          <>
            <rect x="18" y="34" width="136" height="76" rx="3" className="bl-art-accent" />
            <path d="M18 110 55 76l31 24 25-19 43 29Z" className="bl-art-ink" opacity=".24" />
            <circle cx="128" cy="54" r="9" className="bl-art-page" opacity=".7" />
            <rect x="166" y="34" width="136" height="76" rx="3" className="bl-art-ink" />
            <rect x="184" y="54" width="75" height="7" rx="3" className="bl-art-page" opacity=".4" />
            <rect x="184" y="69" width="51" height="7" rx="3" className="bl-art-page" opacity=".25" />
            <rect x="184" y="86" width="42" height="11" rx="2" className="bl-art-accent" />
            <rect x="18" y="122" width="86" height="70" rx="3" className="bl-art-soft" />
            <rect x="116" y="122" width="86" height="70" rx="3" className="bl-art-card" />
            <rect x="214" y="122" width="88" height="70" rx="3" className="bl-art-page" />
            <circle cx="159" cy="157" r="16" className="bl-art-ink" opacity=".18" />
            <Pins spots={[[96, 72], [230, 76], [150, 150]]} open={open} total={total} />
          </>
        )}
        {type === "pdf" && (
          <>
            <rect x="40" y="30" width="108" height="170" rx="2" className="bl-art-page" />
            <rect x="54" y="46" width="58" height="8" rx="2" className="bl-art-ink" />
            <rect x="54" y="64" width="79" height="4" rx="2" className="bl-art-line" />
            <rect x="54" y="74" width="65" height="4" rx="2" className="bl-art-line" />
            <rect x="54" y="92" width="80" height="40" rx="2" className="bl-art-soft" />
            <rect x="54" y="144" width="70" height="4" rx="2" className="bl-art-line" />
            <rect x="54" y="154" width="58" height="4" rx="2" className="bl-art-line" />
            <rect x="172" y="30" width="108" height="170" rx="2" className="bl-art-page" />
            <rect x="186" y="46" width="66" height="7" rx="2" className="bl-art-ink" />
            <rect x="186" y="66" width="80" height="65" rx="2" className="bl-art-soft" />
            <rect x="197" y="101" width="12" height="21" className="bl-art-accent" opacity=".55" />
            <rect x="216" y="87" width="12" height="35" className="bl-art-accent" opacity=".75" />
            <rect x="235" y="74" width="12" height="48" className="bl-art-accent" />
            <rect x="186" y="145" width="67" height="4" rx="2" className="bl-art-line" />
            <Pins spots={[[100, 50], [244, 78], [120, 146]]} open={open} total={total} />
          </>
        )}
      </svg>
    </div>
  );
}
