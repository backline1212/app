/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_WS_BASE_URL: string;
  readonly VITE_GOOGLE_OAUTH_CLIENT_ID: string;
  readonly VITE_SENTRY_DSN?: string;
  /** Chrome Web Store listing; set once the listing is approved and public. */
  readonly VITE_EXTENSION_STORE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
