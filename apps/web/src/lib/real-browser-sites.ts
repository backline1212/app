// Big consumer sites that block embedded/proxied previews and third-party sign-in: the
// preview may load blank or half-working there, so the project page says up front that
// the extension (the real website in the reviewer's own browser) is the way to review.
const SITES: [RegExp, string][] = [
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, "YouTube"],
  [/(^|\.)google\.[a-z.]+$/, "Google"],
  [/(^|\.)facebook\.com$/, "Facebook"],
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)(x|twitter)\.com$/, "X"],
  [/(^|\.)linkedin\.com$/, "LinkedIn"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)amazon\.[a-z.]+$/, "Amazon"],
  [/(^|\.)netflix\.com$/, "Netflix"],
  [/(^|\.)github\.com$/, "GitHub"],
  [/(^|\.)notion\.so$|(^|\.)notion\.site$/, "Notion"],
  [/(^|\.)figma\.com$/, "Figma"],
];

/** The site's name when it's one that needs the extension, else null. */
export function realBrowserSiteName(url: string | null | undefined): string | null {
  if (!url) return null;
  let host: string;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
  return SITES.find(([pattern]) => pattern.test(host))?.[1] ?? null;
}
