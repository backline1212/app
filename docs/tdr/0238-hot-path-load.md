# TDR-0238: Hot-path load (snapshots, storage, sockets, dashboard refetch)

Date: 2026-11-08. Source: performance/infra audit (code read plus local measurement).

- Snapshot submit compressed a multi-MB tree with gzip level 9 on the event loop
  (measured ~250ms for 4MB) before checking whether the page had changed at all. It now
  compresses only when storing a new object, at level 6, in a thread.
- Storage reads/writes reuse the one shared boto3 client (thread-safe) instead of
  building a client and TLS connection per call; pool raised to 32.
- Extension token "last used" is written at most once a minute, not on every request.
- Idle websockets re-check access about once a minute instead of every 15s and every
  client message; broadcasts still re-check before delivering.
- Dashboard: comment events coalesce into one refresh of Tickets/Dashboard/Activity
  ~1.5s after a burst, and a hidden tab refreshes when it's next shown.
- Project canvas comment list (can be several MB) is not re-downloaded on tab focus
  while the live connection is up; it already merges changes.
- Comment screenshots load lazily.

Checked and already fine: the review proxy already gzips text responses
(`_maybe_compress`). Not changed: the worker image's browser layer ordering (which
Dockerfile stage Railway builds for the worker isn't visible from here).
