// The design's pastel person marks, picked stably from an id or name.
const PASTELS = ["#C9CFC9", "#F3D9C6", "#F1DCE0", "#C9E4F5", "#D8E9D2", "#DCD4EF", "#FBF1D6"];

export function pastelColor(seed: string) {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PASTELS[hash % PASTELS.length]!;
}
