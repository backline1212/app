// Versioned static release artifact: the API-hosted ZIP may be on a different
// deployment cadence. Keep this URL and public ZIP aligned with the store package.
export const EXTENSION_VERSION = "0.5.10";
// Oldest build the dashboard still launches reviews with. 0.5.0 only adds optional
// console/network capture, so 0.4.13 keeps working; it's offered the update instead.
export const MIN_EXTENSION_VERSION = "0.4.13";
export const EXTENSION_DOWNLOAD_URL = `/backline-extension-${EXTENSION_VERSION}.zip`;
// The Chrome Web Store listing (item kdijhbgnbpjoaalbpnimfomemeheokca). Unset until
// Google approves it; then installs and updates go through the store and the ZIP stays
// as the Edge/manual fallback.
export const EXTENSION_STORE_URL: string | null = import.meta.env.VITE_EXTENSION_STORE_URL?.trim() || null;
