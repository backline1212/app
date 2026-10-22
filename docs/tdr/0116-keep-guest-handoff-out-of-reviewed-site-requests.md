# TDR-0116: Keep guest handoff fields out of reviewed-site proxy requests

Date: 2026-10-22. Backlog item: BUG-08, guest handoff privacy slice.

## Plan and decision

The guest join page appends `backline_guest` and `backline_name` to the first
review URL so the widget can resume the identity created at the gate. In proxy
mode, the first request reaches Backline's preview host, but the proxy copied
that entire query to the reviewed website. Its mapped Referer could also carry
the same fields on later requests. This exposed the Backline guest bearer and
display name to the reviewed site's server, CDN or request logs even though
the website needs neither value.

Before constructing any upstream proxy URL or upstream Referer, remove those
two reserved fields. Decode parameter *names* so percent-encoded spellings are
covered, while retaining all other raw query pieces in order; reserializing
unrelated parameters could change a website's routing or signature. Keep the
browser-to-Backline handoff unchanged for the widget and old clients. This is
additive handling of current and legacy review links, with no schema or data
migration.

This protects proxy egress, not the whole handoff. The initial URL still reaches
Backline infrastructure and browser history before the widget removes it.
Snippet mode navigates directly to the reviewed site and still carries these
fields; a secure snippet exchange requires a separate browser-compatible
handoff design. The native extension passes the guest identity through its
message channel rather than a website URL. Do not describe URL-bearer
retirement as complete.

## Acceptance and verification

Run backend Ruff, format check, mypy, workspace-scope and diff checks. Codex
adds no suite under this task's AGENTS.md rule. Once the matching backend is
live, use an authorized request inspection endpoint to confirm that the target
receives ordinary query parameters but neither reserved handoff field in the
request URL or Referer, including percent-encoded names. Also confirm the guest
widget still resumes its Backline session. Backline request-log, snippet-mode
and browser-history exposure remain open until their separate handoff change.
