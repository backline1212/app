import { useEffect } from "react";
import { readableInk } from "./readable-color";

/** Applies a workspace's client branding accent (TDR-0150) while a review page is open.
 * Text and icons drawn in it get a shade that stays readable on light surfaces
 * (TDR-0180); fills keep the exact brand colour. */
export function useBrandAccent(accent: string | null | undefined) {
  useEffect(() => {
    if (!accent) return;
    const root = document.documentElement;
    root.style.setProperty("--bl-brand-accent", accent);
    root.style.setProperty("--bl-brand-ink", readableInk(accent, ["#FFFFFF", "#E3F8EF", "#F1F2F0"]) ?? accent);
    root.classList.add("bl-branded");
    return () => {
      root.style.removeProperty("--bl-brand-accent");
      root.style.removeProperty("--bl-brand-ink");
      root.classList.remove("bl-branded");
    };
  }, [accent]);
}
