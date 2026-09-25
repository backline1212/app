# TDR-0036: Late-rendered pins and a same-origin upload fallback

Date: 2026-09-26
Status: Accepted

## Context

Reviewers reported that an existing comment pin could appear on one load and disappear
on another, and that comment screenshots or attachments were not always stored. Two
independent browser races caused those symptoms:

- The widget resolved every stored selector exactly once during initialization. An SPA
  that rendered the anchored element after fetching data missed that instant, so the
  comment remained in MongoDB but no pin was drawn for the entire page view.
- The normal browser-to-R2 presigned `PUT` requires a correct bucket CORS policy. A
  missing or stale policy makes `fetch()` fail before JavaScript can inspect an R2
  response; the comment was still posted with `capture_status="failed"` and no object
  key. This is especially easy to hit because the widget can run on arbitrary client
  origins.

## Decision

- `waitForAnchorElement` performs a bounded eight-second resolution using a
  `MutationObserver` plus a low-frequency poll. Pin loads use it asynchronously, so a
  stale anchor never delays widget initialization. Route changes guard every pending
  result by page id before rendering it.
- Stored and newly created pins retain the captured percentage within their element,
  not a fixed pixel offset. The shared position tracker now reports current element
  width and height as well as position, keeping the pin aligned when late fonts,
  images, responsive layout, or animation resize the element.
- Direct-to-R2 remains the normal upload path. If its presigned `PUT` fails or is
  browser-blocked, the widget and dashboard retry through `POST /api/v1/uploads/direct`
  as multipart form data. The storage router applies the same actor rate limit, reads
  at most 20 MiB plus one byte, validates content type/size through `UploadRequest`,
  re-runs workspace/project guest or member authorization, generates a fresh private
  object key, and writes through the existing S3-compatible storage client.
- The relay returns only the private object key. Comments still store that key and
  reads still use short-lived signed GET URLs; no bucket is made public and legacy
  comment records remain readable.

## Consequences

- Client-rendered anchors get a realistic opportunity to appear without turning stale
  selectors into an unbounded observer or delaying the rest of the widget.
- A bucket CORS regression costs backend bandwidth for the affected upload instead of
  silently losing the screenshot/attachment. Correct R2 CORS remains recommended for
  the fast path documented in `DEPLOYMENT.md`.
- The new response contract is generated into `packages/types`; generated API
  declarations are not hand-edited.
