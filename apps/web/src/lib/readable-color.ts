// WCAG relative luminance and contrast for #rgb/#rrggbb colours.
function channels(hex: string): [number, number, number] | null {
  const value = hex.trim().replace(/^#/, "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const linear = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const toHex = (rgb: [number, number, number]) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/**
 * The brand colour itself when text in it is readable (4.5:1) on every given
 * background, otherwise the same hue darkened just enough. Null for an unparseable
 * colour, so the caller keeps its default.
 */
export function readableInk(hex: string, backgrounds: string[]): string | null {
  const base = channels(hex);
  const surfaces = backgrounds.map(channels).filter((c): c is [number, number, number] => c !== null);
  if (!base) return null;
  for (let step = 0; step <= 20; step += 1) {
    const factor = 1 - step * 0.05;
    const candidate = base.map((v) => v * factor) as [number, number, number];
    if (surfaces.every((surface) => contrast(candidate, surface) >= 4.5)) return toHex(candidate);
  }
  return "#000000";
}
