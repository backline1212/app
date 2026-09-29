import type { components } from "./openapi";

export type { components, paths } from "./openapi";

// Shorthand so feature modules write `Schemas["WorkspaceOut"]` instead of the full
// `components["schemas"]["WorkspaceOut"]` path (Rule 3, 02-Engineering-Principles.md -
// these are generated from the backend's OpenAPI schema, never hand-maintained).
export type Schemas = components["schemas"];
export type { NativeReviewAuth, NativeReviewLaunch, NativeReviewInfo, NativeReviewStatus } from "./native-review";
