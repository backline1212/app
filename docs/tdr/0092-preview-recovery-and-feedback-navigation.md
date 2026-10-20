# TDR-0092: One preview recovery surface and direct saved-feedback access

Date: 2026-10-20. Scope: live product review of FD-08/09/18.

## Live observations before this change

Browser access resumed in a fresh Chrome tab after the older tab binding timed out.
The signed-in portal reports installed extension 0.4.3 ready. PDF type selection
opens the expected upload/name/access form, with Create disabled without a file;
closing leaves the existing project list intact. No file/project/comment was saved.
The existing example.com project transitions to its preview-unavailable recovery
surface. Its three saved comments and the earlier approved QA screenshot remain
accessible in Comments. Deploy sync loads its off/setup/empty-history states and
closes normally; no credential or notification was created.

The fallback repeats similar failure messages in the header and canvas, while
saved feedback is behind a vertical rail control. Network root cause was not
established: raw CDP inspection reported a paused document response in browser
tooling. Do not infer a backend/site failure cause or universal browser compatibility
from this observation.

## Decision

Use one prominent canvas recovery surface after failure. Retain short native-browser
guidance while loading; hide it after tools connect or the recovery surface takes
over. Add View saved feedback to loading, failed preparation, origin mismatch and
preview failure states. It opens the Comments panel without reloading the website
or changing project/feedback records. Keep extension launch, preview retry, live
page and URL correction available. Connection details stay inside recovery.

Loading/error overlays follow the effective document-plus-widget readiness state,
so document onLoad without tools does not hide guidance or grant comment controls.
Store side-panel selection in URL parameters, preserving page/thread/filter state.
Legacy thread/comment links open Comments when no explicit panel is chosen. Closing
sets panel=closed; explicit later actions can reopen it. Handle each pin-open nonce
once so URL changes do not loop the request effect. No backend/API or credential
changes are needed for this slice.

## Verification

Affected web lint/typecheck/build passes 3/3 after replacing Object.hasOwn with the
project's supported ES2020 equivalent. Existing chunk advisory remains. No suite
written/run. Baseline browser observations above are distinct from acceptance of
the final change. After rollout verify one recovery surface, direct feedback,
panel reload/close/open, page/thread/filter retention, pin/AI-open requests and
readiness failure transitions. Backend 93acf9f and capture 48e6d3e remain pending
Railway's temporary deployment pause; this web-only slice does not imply their rollout.
