// Browser-extension protocol, not an HTTP API schema. Credentials are sent only
// on the trusted dashboard origin; never in the reviewed site's URL or DOM.
export type NativeReviewAuth =
  | { kind: "member"; token: string }
  | { kind: "guest"; token: string; shareToken: string; displayName: string };

export interface NativeReviewLaunch {
  projectId: string;
  url: string;
  returnUrl: string;
  auth?: NativeReviewAuth;
}

export interface NativeReviewInfo {
  project: { id: string; name: string; target_origin: string; my_role?: "viewer" | "commenter" | "editor" | "manager" | null };
  authorName: string;
  member: boolean;
  returnUrl: string;
  launchId: string;
}

export interface NativeReviewStatus {
  version: 2;
  apiBaseUrl: string;
  extensionVersion: string;
  workspaceId: string | null;
  userId: string | null;
}
