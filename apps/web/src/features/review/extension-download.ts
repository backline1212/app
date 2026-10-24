// Versioned static release artifact: the API-hosted ZIP may be on a different
// deployment cadence. Keep this URL and public ZIP aligned with the store package.
export const EXTENSION_VERSION = "0.5.0";
// Oldest build the dashboard still launches reviews with. 0.5.0 only adds optional
// console/network capture, so 0.4.13 keeps working; it's offered the update instead.
export const MIN_EXTENSION_VERSION = "0.4.13";
export const EXTENSION_DOWNLOAD_URL = `/backline-extension-${EXTENSION_VERSION}.zip`;
