// Hand-drawn SVG scenes for empty, error and "coming soon" states. Every color is a theme
// token (see the "Illustrations" block in backline.css), so each scene flips with dark
// mode, and every animation ends on its resting frame: the global prefers-reduced-motion
// rule cuts animations to one near-instant run, which leaves them still, not half-drawn.

// The widget's comment pin (apps/widget ui-styles.ts .bl-pin), point at the origin.
const PIN = "M0 -9A9 9 0 0 1 9 -18A9 9 0 0 1 18 -9A9 9 0 0 1 9 0L2 0Q0 0 0 -2Z";

export type EmptyKind = "tickets" | "search" | "clients" | "activity" | "links" | "people" | "projects" | "board" | "keys";

function Backdrop() {
  return <ellipse cx="66" cy="52" rx="54" ry="38" className="ea-bg" />;
}

function Scene({ kind }: { kind: EmptyKind }) {
  switch (kind) {
    case "tickets":
      return (
        <>
          <rect x="30" y="26" width="58" height="50" rx="4" className="ea-card" transform="rotate(-7 59 51)" />
          <g className="ea-float">
            <rect x="40" y="20" width="58" height="56" rx="4" className="ea-card" />
            {[32, 46, 60].map((y, i) => (
              <g key={y}>
                <rect x="47" y={y} width="9" height="9" rx="2" className={i < 2 ? "ea-mint" : "ea-hole"} />
                {i < 2 && <path d={`M49 ${y + 4.6} 51 ${y + 6.6} 54.4 ${y + 2.6}`} className="ea-tick" />}
                <rect x="60" y={y + 2.5} width={i === 1 ? 22 : 30} height="4" rx="2" className="ea-line" />
              </g>
            ))}
          </g>
          <g transform="translate(92 22)">
            <g className="ea-drop">
              <path d={PIN} className="ea-pin ea-pin-mint" />
              <path d="M5.5 -9.5 8 -7 12.5 -11.5" className="ea-tick" />
            </g>
          </g>
        </>
      );
    case "search":
      return (
        <>
          <rect x="34" y="16" width="64" height="66" rx="4" className="ea-card" />
          {[28, 38, 48, 58, 68].map((y, i) => (
            <rect key={y} x="44" y={y} width={[40, 32, 44, 26, 36][i]} height="4" rx="2" className="ea-dashline" />
          ))}
          <g className="ea-sweep">
            <circle cx="60" cy="50" r="13" className="ea-lens" />
            <circle cx="60" cy="50" r="13" className="ea-stroke" />
            <path d="M69.5 59.5 80 70" className="ea-stroke ea-thick" />
          </g>
        </>
      );
    case "clients":
      return (
        <>
          <g className="ea-float">
            <path d="M24 26h50a6 6 0 0 1 6 6v22a6 6 0 0 1-6 6H40l-10 9v-9h-6a6 6 0 0 1-6-6V32a6 6 0 0 1 6-6Z" className="ea-card" />
            <rect x="30" y="36" width="36" height="4" rx="2" className="ea-line" />
            <rect x="30" y="45" width="24" height="4" rx="2" className="ea-line" />
          </g>
          <g className="ea-float ea-late">
            <path d="M60 44h46a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6h-4v9l-10-9H60a6 6 0 0 1-6-6V50a6 6 0 0 1 6-6Z" className="ea-ink" />
            {[70, 83, 96].map((x, i) => <circle key={x} cx={x} cy="59" r="3.2" className="ea-mint ea-blink" style={{ animationDelay: `${i * 0.18}s` }} />)}
          </g>
        </>
      );
    case "activity":
      return (
        <>
          <path d="M44 18V80" className="ea-rail ea-draw" />
          {[24, 46, 68].map((y, i) => (
            <g key={y}>
              <circle cx="44" cy={y} r="5.5" className={i === 0 ? "ea-mint ea-pop" : "ea-dot ea-pop"} style={{ animationDelay: `${0.25 + i * 0.2}s` }} />
              <rect x="56" y={y - 7} width={[46, 38, 42][i]} height="14" rx="3" className="ea-card ea-pop" style={{ animationDelay: `${0.35 + i * 0.2}s` }} />
              <rect x="62" y={y - 2} width={[30, 22, 26][i]} height="4" rx="2" className="ea-line ea-pop" style={{ animationDelay: `${0.35 + i * 0.2}s` }} />
            </g>
          ))}
        </>
      );
    case "links":
      return (
        <>
          <g className="ea-float">
            <rect x="28" y="38" width="42" height="22" rx="11" className="ea-ring" transform="rotate(-18 49 49)" />
            <rect x="60" y="38" width="42" height="22" rx="11" className="ea-ring ea-ring-mint" transform="rotate(-18 81 49)" />
          </g>
          <path d="M100 20v8M96 24h8" className="ea-stroke ea-twinkle" />
          <path d="M30 70v6M27 73h6" className="ea-stroke ea-twinkle ea-late" />
        </>
      );
    case "people":
      return (
        <>
          <circle cx="42" cy="46" r="15" className="ea-ink" />
          <circle cx="42" cy="42" r="5.5" className="ea-mint" />
          <path d="M32 55a10 8 0 0 1 20 0" className="ea-mint" />
          <circle cx="66" cy="46" r="15" className="ea-card" />
          <circle cx="66" cy="42" r="5.5" className="ea-line" />
          <path d="M56 55a10 8 0 0 1 20 0" className="ea-line" />
          <g className="ea-breathe">
            <circle cx="90" cy="46" r="15" className="ea-dashring" />
            <path d="M90 40v12M84 46h12" className="ea-stroke" />
          </g>
        </>
      );
    case "projects":
      return (
        <>
          <rect x="22" y="18" width="88" height="62" rx="5" className="ea-card" />
          <path d="M22 30h88" className="ea-rule" />
          {[29, 35, 41].map((x) => <circle key={x} cx={x} cy="24" r="1.8" className="ea-dot" />)}
          <rect x="32" y="38" width="30" height="5" rx="2.5" className="ea-line" />
          <rect x="32" y="48" width="22" height="4" rx="2" className="ea-line" />
          <rect x="70" y="38" width="30" height="30" rx="3" className="ea-soft" />
          <path d="M85 47v12M79 53h12" className="ea-stroke" />
          <g transform="translate(58 70)">
            <g className="ea-drop">
              <path d={PIN} className="ea-pin" />
              <text x="9" y="-5.6" textAnchor="middle" className="ea-pin-text">1</text>
            </g>
          </g>
        </>
      );
    case "board":
      return (
        <>
          {[22, 52, 82].map((x, i) => (
            <g key={x}>
              <rect x={x} y="18" width="28" height="62" rx="4" className="ea-col" />
              <rect x={x + 4} y="24" width="14" height="3" rx="1.5" className="ea-line" />
              {i !== 1 && <rect x={x + 4} y="32" width="20" height="16" rx="3" className="ea-dashcard" />}
            </g>
          ))}
          <g className="ea-slide">
            <rect x="56" y="32" width="20" height="16" rx="3" className="ea-card" />
            <rect x="60" y="37" width="12" height="3" rx="1.5" className="ea-mint" />
            <rect x="60" y="42" width="8" height="2.5" rx="1.25" className="ea-line" />
          </g>
        </>
      );
    case "keys":
      return (
        <>
          <g className="ea-float">
            <circle cx="46" cy="50" r="15" className="ea-mint" />
            <circle cx="46" cy="50" r="5.5" className="ea-card" />
            <path d="M61 50h40M92 50v9M83 50v6" className="ea-stroke ea-thick" />
          </g>
          <path d="M100 22v8M96 26h8" className="ea-stroke ea-twinkle" />
          <path d="M28 74v6M25 77h6" className="ea-stroke ea-twinkle ea-late" />
        </>
      );
  }
}

// A four-point sparkle centred on the origin, the AI mark used across the app.
const SPARK = "M0 -7 1.6 -1.6 7 0 1.6 1.6 0 7 -1.6 1.6 -7 0 -1.6 -1.6Z";

/** AI: a comment thread on the left condenses into a short summary card on the right. */
export function AiSummaryArt() {
  return (
    <svg className="bl-ai-art" viewBox="0 0 200 120" aria-hidden="true" focusable="false">
      <ellipse cx="100" cy="62" rx="94" ry="54" className="ea-bg" />
      <g className="ea-float">
        {[20, 46, 72].map((y, i) => (
          <g key={y} transform={`translate(${i === 1 ? 30 : 20} ${y})`}>
            <rect width="74" height="22" rx="4" className="ea-card" />
            <circle cx="11" cy="11" r="4.5" className={i === 1 ? "ea-mint" : "ea-dot"} />
            <rect x="21" y="6.5" width={[42, 34, 46][i]} height="3.5" rx="1.75" className="ea-line" />
            <rect x="21" y="13" width={[28, 38, 22][i]} height="3" rx="1.5" className="ea-dashline" />
          </g>
        ))}
      </g>
      <path d="M106 57c6 0 6 4 12 4" className="ea-rail ea-draw" />
      <g className="ea-pop" style={{ animationDelay: ".45s" }}>
        <rect x="120" y="34" width="62" height="54" rx="5" className="ea-ink" />
        <rect x="129" y="44" width="26" height="4" rx="2" className="ea-mint" />
        {[55, 63, 71].map((y, i) => (
          <rect key={y} x="129" y={y} width={[44, 38, 24][i]} height="3.5" rx="1.75" className="ea-summary-line ea-type" style={{ animationDelay: `${0.7 + i * 0.16}s` }} />
        ))}
      </g>
      {/* Positioned by the outer <g>: the twinkle animates `transform`, which would
          override a transform attribute on the path itself. */}
      <g transform="translate(182 30)"><path d={SPARK} className="ea-mint ea-spark ea-twinkle" /></g>
      <g transform="translate(114 22) scale(.6)"><path d={SPARK} className="ea-mint ea-spark ea-twinkle ea-late" /></g>
    </svg>
  );
}

/** A small scene above an empty state's heading. Decorative only. */
export function EmptyArt({ kind }: { kind: EmptyKind }) {
  return (
    <svg className="bl-empty-art" viewBox="0 0 132 96" aria-hidden="true" focusable="false">
      <Backdrop />
      <Scene kind={kind} />
    </svg>
  );
}

/** 404: a comment pin that lost its page, hovering over an empty browser window. */
export function LostPinArt() {
  return (
    <svg className="bl-lost-art" viewBox="0 0 240 170" aria-hidden="true" focusable="false">
      <ellipse cx="120" cy="92" rx="104" ry="68" className="ea-bg" />
      <rect x="40" y="34" width="160" height="112" rx="7" className="ea-card" />
      <path d="M40 52h160" className="ea-rule" />
      {[52, 61, 70].map((x) => <circle key={x} cx={x} cy="43" r="2.6" className="ea-dot" />)}
      <rect x="84" y="38.5" width="92" height="9" rx="4.5" className="ea-col" />
      <text x="130" y="45.6" textAnchor="middle" className="ea-mono">/ 404</text>
      <rect x="58" y="66" width="124" height="66" rx="4" className="ea-dashcard" />
      <ellipse cx="121" cy="122" rx="13" ry="3.2" className="ea-shadow" />
      <g transform="translate(111 110)">
        <g className="ea-hover">
          <path d={PIN} className="ea-pin" transform="scale(1.35)" />
          <text x="12.2" y="-7.6" textAnchor="middle" className="ea-pin-text ea-pin-text-lg">?</text>
        </g>
      </g>
      <path d="M186 26v9M181.5 30.5h9" className="ea-stroke ea-twinkle" />
      <path d="M44 150v7M40.5 153.5h7" className="ea-stroke ea-twinkle ea-late" />
    </svg>
  );
}

/** "Usage tracking - coming soon": a chart whose bars grow and whose trend line draws. */
export function UsageChartArt() {
  const bars = [30, 46, 38, 58, 50, 72];
  return (
    <svg className="bl-soon-illus" viewBox="0 0 200 120" aria-hidden="true" focusable="false">
      <ellipse cx="100" cy="64" rx="92" ry="54" className="ea-bg" />
      <rect x="26" y="14" width="148" height="94" rx="6" className="ea-card" />
      {[40, 60, 80].map((y) => <path key={y} d={`M38 ${y}h124`} className="ea-grid" />)}
      {bars.map((h, i) => (
        <rect key={i} x={44 + i * 20} y={96 - h} width="12" height={h} rx="2" className={`ea-grow ${i === bars.length - 1 ? "ea-mint" : "ea-soft"}`} style={{ animationDelay: `${0.1 + i * 0.09}s` }} />
      ))}
      <path d="M50 70 70 56 90 62 110 44 130 50 150 30" className="ea-trend ea-draw-long" />
      <circle cx="150" cy="30" r="3.6" className="ea-ink ea-pop" style={{ animationDelay: "1.1s" }} />
    </svg>
  );
}

/** Billing - no invoices yet: an invoice with a stamp that lands. */
export function InvoiceArt() {
  return (
    <svg className="bl-soon-illus" viewBox="0 0 200 120" aria-hidden="true" focusable="false">
      <ellipse cx="100" cy="64" rx="92" ry="54" className="ea-bg" />
      <g className="ea-float">
        <path d="M62 12h76v96l-9.5-6-9.5 6-9.5-6-9.5 6-9.5-6-9.5 6-9.5-6-9.5 6Z" className="ea-card" />
        <rect x="72" y="24" width="30" height="6" rx="3" className="ea-ink" />
        {[42, 52, 62].map((y, i) => (
          <g key={y}>
            <rect x="72" y={y} width={[34, 28, 38][i]} height="4" rx="2" className="ea-line" />
            <rect x="116" y={y} width="12" height="4" rx="2" className="ea-line" />
          </g>
        ))}
        <path d="M72 76h56" className="ea-rule" />
        <rect x="72" y="83" width="22" height="5" rx="2.5" className="ea-ink" />
        <rect x="110" y="83" width="18" height="5" rx="2.5" className="ea-mint" />
      </g>
      <g transform="translate(150 92) rotate(-14)">
        <g className="ea-stamp">
          <rect x="-18" y="-10" width="36" height="20" rx="4" className="ea-stamp-box" />
          <text x="0" y="3.4" textAnchor="middle" className="ea-mono ea-stamp-text">SOON</text>
        </g>
      </g>
    </svg>
  );
}

/** The brand mark for the full-page loading state: the square glyph with its mint signal pinging. */
export function LoadingMarkArt() {
  return (
    <svg className="bl-loading-art" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect x="10" y="10" width="44" height="44" rx="11" className="ea-mark" />
      <text x="30" y="40.5" textAnchor="middle" className="ea-mark-letter">B</text>
      <circle cx="45" cy="45" r="4" className="ea-mint ea-ping" />
      <circle cx="45" cy="45" r="4" className="ea-mint" />
    </svg>
  );
}
