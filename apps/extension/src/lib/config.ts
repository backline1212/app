// Matches apps/widget's own DEFAULT_API_BASE_URL - no build-time env plumbing exists
// yet for this dev/unpacked-only phase (20-Build-Plan.md's extension MVP scope), so
// this is the one line to change before pointing a build at a deployed API.
export const API_BASE_URL = "http://localhost:8000";

// Where the popup sends a member to generate a token (Settings -> Browser Extension)
// when it isn't already connected.
export const DASHBOARD_BASE_URL = "http://localhost:5173";
