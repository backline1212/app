const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["week", 7 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
];

const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/** "3 days ago", "just now" - card timestamps (WorkspaceHomePage) don't need
 * second-level precision, so anything under a minute collapses to "just now". */
export function timeAgo(iso: string): string {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 60) return "just now";
  for (const [unit, unitSeconds] of UNITS) {
    if (seconds >= unitSeconds) {
      return formatter.format(-Math.floor(seconds / unitSeconds), unit);
    }
  }
  return "just now";
}

/** "18m ago": for columns and meta lines too narrow for timeAgo's long form. */
export function shortAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return days < 365 ? `${Math.floor(days / 30)}mo ago` : `${Math.floor(days / 365)}y ago`;
}
