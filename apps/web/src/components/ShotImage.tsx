import { type ImgHTMLAttributes, useState } from "react";

/**
 * A comment screenshot that says so when it can't load (a signed link that expired in
 * an old tab, a file removed from storage) instead of showing the browser's broken-image
 * icon (TDR-0217).
 */
export function ShotImage({ className, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className={`bl-shot-missing ${className ?? ""}`} role="img" aria-label="Screenshot unavailable">Screenshot unavailable</span>;
  }
  return <img {...props} className={className} onError={() => setFailed(true)} />;
}
