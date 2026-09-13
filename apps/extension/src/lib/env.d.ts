// Replaced with literal strings at build time by esbuild's `define` (scripts/build.mjs)
// - a browser extension has no runtime env to read, unlike apps/web's Vite-injected
// import.meta.env.VITE_API_BASE_URL, so this has to happen at bundle time instead.
declare const __API_BASE_URL__: string;
declare const __DASHBOARD_BASE_URL__: string;
