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

/** A project's stable colours, shared by its card artwork and the "Waiting on you" marks. */
export function projectPalette(project: Pick<api.ProjectOut, "id" | "name">) {
  const seed = hashOf(project.id || project.name);
  return { seed, palette: PREVIEW_PALETTES[seed % PREVIEW_PALETTES.length]! };
}
