// Baked in at build time (see env.d.ts) - override via the BACKLINE_API_BASE_URL /
// BACKLINE_DASHBOARD_BASE_URL environment variables when running the build script
// (scripts/build.mjs) to point a build at a different stack, e.g. local dev against
// http://localhost:8000 / :5173 instead of the deployed API/dashboard these default to.
export const API_BASE_URL = __API_BASE_URL__;

// Where the popup sends a member to generate a token (Settings -> Browser Extension)
// when it isn't already connected.
export const DASHBOARD_BASE_URL = __DASHBOARD_BASE_URL__;
