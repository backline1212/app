# TDR-0065: Gate server browser execution on isolated worker infrastructure

Date: 2026-10-19
Status: Default-off mitigation implemented; network isolation not provisioned or
verified in this task. Audit F09 remains open for infrastructure acceptance.

## Decision

The existing Playwright document-navigation guard does not secure subresources,
service workers, DNS rebinding or other browser network traffic. Do not represent
it as sufficient SSRF isolation. Add operator setting `SERVER_BROWSER_ENABLED`,
default false, with an explicit note in both environment examples. This setting
is not a project setting or a tenant-controlled option.

When false: cross-browser render requests and manual preview refresh return an
actionable unavailable error; project listing/creation do not queue automatic
preview captures; queued preview/render jobs mark their record failed and return
before launching a browser. Direct preview capture also checks the gate. Legacy
cloud-login ticket creation and execution follow the same gate. Saved private
previews/renders may still be read under existing authorization. The normal target
website tab and native extension/browser review are not server browser processes.

This intentionally stops fresh server previews on an unconfigured worker. It does
not disable reading projects/tickets/evidence or claim cross-engine interactive QA
works. Existing stale queued records may remain until their old job is delivered
or retried; no bulk state/data migration runs here. Already-running processes need
draining during rollout; this is not an external kill switch for an old worker.

## Enabling later

Only enable in API and worker/service environments after an operator has isolated
browser execution from API/database/storage/private infrastructure. Enforce egress
through a policy that denies loopback, private/link-local/reserved ranges, metadata
endpoints, IPv4/IPv6 and alternate protocols, including redirects, subresources,
websocket/WebRTC traffic, service workers and DNS changes/rebinding. The browser
must not inherit infrastructure credentials or access the worker's service network.
The feature flag itself proves none of those properties. Preserve authorization,
per-project opt-in, rate limits and signed private storage when it is enabled.

No firewall, provider purchase or network change is performed by this source
increment. Browser-lab selection remains deferred. The default-off path is the
current mitigation until the isolated deployment passes its live acceptance.
