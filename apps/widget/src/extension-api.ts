// Curated re-export surface for the browser extension's content script (Phase 4,
// browser-extension plan) - the extension depends on this package as
// "@backline/widget": "workspace:*" and imports only from here, not from individual
// sibling modules directly, so this file is the one place that has to stay in sync
// when the widget's internals move around. Everything exported here was already
// auth-mechanism-agnostic after the Phase 0 refactor (api-client.ts's pluggable
// getAuthHeader) - none of it needed to change to be reusable outside the guest widget.
export { createApiClient, WidgetApiError } from "./api-client";
export type { ApiClient, AuthHeaderProvider } from "./api-client";

export { createShadowRoot, openComposer, renderPin, showTooltip } from "./ui";
export type { ComposerDetails, ComposerResult } from "./ui";

export { anchorPointFor, computeAnchor, computeRegionAnchor, resolveAnchorElement } from "./anchor";

export { uploadAttachment, uploadScreenshot } from "./attachment-upload";

export { captureScreenshot } from "./screenshot";

export { parseUserAgent } from "./user-agent";

export { registerCurrentPage } from "./page-registration";

export { createThreadManager } from "./thread-manager";
export type { ThreadManager, ThreadManagerOptions } from "./thread-manager";

export { setupRegionDrawer } from "./region-drawer";

export type { AnchorPayload, AttachmentRecord, CommentRecord } from "./types";
