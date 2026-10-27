import type { CSSProperties } from "react";

import { ShotImage } from "./ShotImage";

export interface ShotMarker {
  x: number;
  y: number;
  w?: number | null;
  h?: number | null;
}

/**
 * A comment's screenshot with a marker where its pin or drawn area was (TDR-0197),
 * so the team sees what the client pointed at. The wrapper takes the image's own size,
 * so the percentages line up however the image is scaled.
 */
export function MarkedShot({ src, alt, marker, label, imgClassName }: {
  src: string;
  alt: string;
  marker?: ShotMarker | null;
  label?: string | number | null;
  imgClassName?: string;
}) {
  const area = marker && marker.w != null && marker.h != null && marker.w > 0 && marker.h > 0;
  const style = marker
    ? ({
        left: `${marker.x * 100}%`,
        top: `${marker.y * 100}%`,
        ...(area ? { width: `${marker.w! * 100}%`, height: `${marker.h! * 100}%` } : {}),
      } as CSSProperties)
    : undefined;
  return (
    <span className="bl-marked-shot">
      <ShotImage className={imgClassName} src={src} alt={alt} loading="lazy" decoding="async" />
      {marker && (area
        ? <span className="bl-shot-area" style={style} aria-hidden="true" />
        : <span className="bl-shot-pin" style={style} aria-hidden="true">{label ?? "•"}</span>)}
    </span>
  );
}
