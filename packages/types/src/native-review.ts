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

export interface NativeReviewLaunchResult {
  ready: boolean;
}

export interface NativeReviewInfo {
  project: { id: string; name: string; target_origin: string; my_role?: "viewer" | "commenter" | "editor" | "manager" | null; variant?: string | null };
  authorName: string;
  member: boolean;
  returnUrl: string;
  launchId: string;
  /** Whose comments this reviewer may edit or delete (their own). Absent in a
   * review stored by an older extension version, which then offers neither. */
  viewer?: { type: "member" | "guest"; id: string };
  /** The project lets this guest reviewer resolve their own threads. */
  reviewerCanResolve?: boolean;
}

export interface NativeReviewStatus {
  version: 2;
  apiBaseUrl: string;
  extensionVersion: string;
  workspaceId: string | null;
  userId: string | null;
}
