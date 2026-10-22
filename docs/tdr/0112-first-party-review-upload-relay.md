# TDR-0112: Use the same-origin relay for first-party review uploads

Date: 2026-10-22. Backlog item: BUG-06/07, first-party transport slice.

## Plan and decision

The widget and portal currently request a signed R2 PUT first, even though both
already support the same-origin `/uploads/direct` relay. Each issued signed grant
reserves workspace bytes. If the browser never PUTs, the server cannot safely
release that hold from URL expiry alone: an earlier request may still finish.
The browser's CORS/network failure path can also create a second relay object.

Use the same-origin relay as the sole first-party browser path for review
screenshots and attachments. This makes the upload and its confirmation one API
operation, and the content-key replay in TDR-0111 reuses a hold after an ambiguous
response once the matching backend is live. A failed relay keeps the draft/file
selection for retry where the caller supports it; screenshot failure retains its
existing explicit failed-capture behavior. The 20 MiB validation and 120-second
server object-write deadline remain. The portal waits 150 seconds to allow that
deadline plus request/response overhead. Expect additional API bandwidth/memory cost;
measure it before raising file limits.

Keep `POST /uploads` and its signed PUT contract for older integrations/clients.
This is an additive first-party routing decision, not safe cleanup of historical
unused grants. The API-relay must be available on every environment before this
web/widget change is treated as live. No HTTP schema or generated type change.

## Acceptance and verification

Run widget and web lint, typecheck, production build and diff checks. Codex adds no
test suite under this task's AGENTS.md rule. Live acceptance: website and portal
uploads (including screenshot, attachment, failed response/retry, 20 MiB boundary,
access loss and quota); confirm no first-party signed grant for those flows and one
object/hold for retry after the matching API is deployed. Existing extension upload
already uses the relay. Historical holds and custom API clients remain BUG-06 work.

Source verification on 2026-10-22: widget and web lint, typecheck, production
builds and diff checks pass. Web build retains the existing native review chunk
size advisory. No suite or shared upload was run. Live relay/error/retry/quota
acceptance remains pending; the older backend has the relay but not TDR-0111 replay.
