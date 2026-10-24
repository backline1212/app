# TDR-0152: Realtime fan-out, capture trust and version-first polling

Date: 2026-10-24. Source: backend/extension review of live updates and page versions.

## Decisions

- **Realtime fan-out.** Each socket's membership/project access is cached for 5 s
  (`AUTH_CACHE_SECONDS`) instead of re-read from Mongo on every event, and events are
  delivered concurrently (up to 50 sends at once). Membership, role, project and
  share-link changes clear the caches immediately, so revocation is not delayed. A
  socket whose send fails is disconnected.
- **Untrusted page versions.** A revision now records `trusted_capture` (a team
  member's session or the member-linked extension). Re-anchoring after a guest-supplied
  capture is skipped when that capture is near-empty (< 5 nodes) or shares under 10% of
  the previous version's structure, so a client link cannot push a fake page that
  detaches every ticket. Trusted captures behave as before.
- **Version-first polling.** `GET /pages/{page_id}/comments/version` returns a hash and
  count of exactly what the caller's comment list would contain (guest-safe for
  guests). The extension polls it every 10 s and downloads the full list only when it
  changes (any error falls back to a full fetch). The extension allowlist permits only
  GET of this path for pages in the current session. Extension 0.5.2.

## Verification

Backend ruff/format/mypy/scoping, workspace lint/typecheck/build. Local API: version
endpoint returned `{version, count}` for a guest session and changed after a reply.
