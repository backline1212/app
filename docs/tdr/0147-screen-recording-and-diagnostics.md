# TDR-0147: Screen/voice recording and console & network error capture

Date: 2026-10-24. Replaces the pricing "Coming soon" rows "Video & audio screen
recording" and "Browser console replay".

## Decision

- **Recording.** Comment and reply composers (widget, extension, dashboard reply,
  image/PDF composer) offer Record screen and Voice note. The browser's own picker and
  permission prompts are used; a visible timer runs; recordings stop at 2 minutes or
  ~19 MiB and are uploaded as normal attachments only after the reviewer stops.
  Storage accepts `video/webm|mp4` and `audio/webm|mp4|ogg` under the existing 20 MiB
  cap and quota. Recordings play inline wherever attachments render.
- **Diagnostics.** The widget (and the extension, through a main-world script injected
  only while a review is active) keeps in-memory ring buffers of console
  errors/warnings, uncaught errors/rejections and failed requests (>= 400 or network
  error; method, origin+path, status, duration - never headers, bodies or query
  strings). The composer shows "Attach N console errors…", ticked when something
  failed; the reviewer can untick it. `ContextIn.diagnostics` is optional and scrubbed
  again server-side (`comments/diagnostics.py`): query strings, JWTs, bearer values,
  secret-named key/value pairs and emails are removed. Stored with the comment's
  context regardless of the device-details setting because the reviewer opted in per
  comment. `ContextIn.steps_to_reproduce` is added for Web App projects.
- Image/PDF comments accept `attachments` (`AssetCommentCreate`).
- Both features are available on every plan; pricing lists them as included.
- Extension 0.5.0 adds the main-world capture (`chrome.scripting` world MAIN, top
  frame, active review tab only). 0.4.13 remains supported; the dashboard offers 0.5.0.

Not a full session replay: no DOM/event recording, no network bodies.

## Verification

Backend ruff/mypy, workspace lint/typecheck/build, regenerated `packages/types`.
Chromium against a local stack: widget on a test site captured a console error, a
warning and a 404 (token and email redacted, query stripped), recorded the screen,
uploaded the WebM and posted; the dashboard panel played the recording and listed the
diagnostics.
