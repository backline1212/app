// Barrel: re-exports the review-overlay UI's public API. The implementation lives in
// the sibling ui-*.ts modules (split out of what used to be one large file here) -
// styles/shadow-root setup, simple notifications (tooltip/toast/name-prompt/pin),
// shared attachment handling, the new-comment composer, and the read-only card for an
// existing comment.
// Kept as a single import surface (index.ts imports only from "./ui") so this split is
// purely internal organization, not a change to the widget's module boundaries.
export { createShadowRoot } from "./ui-styles";
export { showTooltip, showToast, showOfflineIndicator, promptForName, renderPin } from "./ui-notifications";
export type { AttachmentResult, AttachmentInfo } from "./ui-attachments";
export type { ComposerDetails, ComposerResult } from "./ui-composer";
export { openComposer } from "./ui-composer";
export type { CommentViewData, CommentViewControls } from "./ui-comment-view";
export { openCommentView } from "./ui-comment-view";
