# Flow inventory and acceptance criteria

FD-25 follow-up (TDR-0086): Google readiness checks both credentials and the single
allowed dashboard callback. Verify checking/unconfigured/error/retry states in
login and signup, email fallback and actual configured callback completion. A
capability response is configuration evidence, not successful provider acceptance.

2026-10-19 follow-up: TDR-0070 adds a product-level sign-in question, guided
extension setup/connection/return, recover/rejoin and real guest exit, expiry-aware
sharing and one-write metadata/settings edits (FD-04/07/08/16/17/19). New links
cannot enable unavailable domain verification or guest export. Legacy policies
remain readable and explicitly labelled; browser acceptance remains open.
User-assisted Chrome checks now cover project/share access, guest join/recover/exit,
missing/stale extension guidance, real signed-in 0.4.1 tab launch and Comment mode.
TDR-0071 closes the refresh successor read gap observed during launch. The next
0.4.1 pass covers filled-draft protection/cancel, return retaining the selected
thread, toolbar cleanup and existing-login YouTube launch. TDR-0072 repairs the
shared composer's rejected-submit recovery in source. Posting/evidence, induced
failure on the updated extension and broad-site acceptance remain explicit in
the delivery ledger; these observations do not close complete acceptance rows.
An explicitly approved native QA comment and its screenshot now persist through
portal reload. TDR-0073 fixes the toolbar overlap found during that check, with
updated-extension visual/failure-path acceptance still pending.
The user's 0.4.3 update now passes the observed short-window layout, empty-body
pointer validation, 60-line draft cancellation, original-ticket return and toolbar
cleanup checks. Wrapped/narrow windows and induced failure remain open.
TDR-0074 simplifies settings to install/check/open project, keeps standalone token
setup optional, separates local readiness from connection/access history, and
gates canvas mode/dock/hotkeys on widget readiness. Failed previews retain portal
feedback and expose the same native launcher; guest board actions are clarified.
This web-only increment needs its own recorded browser acceptance.
TDR-0075 repairs FD-20/21/25 retry and sign-in continuity in source: preserve the
original request/evidence on ambiguous saves, copy drafts, freeze pending edits,
reject wrong-page captures and refresh code timers by elapsed time. Its 0.4.4
installed/browser failure acceptance remains distinct from prior 0.4.3 checks.
TDR-0076 adds file management to FD-05, version-specific page approval to FD-08/09,
and a team-note entry to FD-13. The server retains history on file archive and
optimistically checks approval revision/timestamp. Ticket/file comment retries use
the strict actor/resource/fingerprint replay contract. Live write/concurrency and
guest/role negative acceptance remain separately pending.

2026-10-19: FD-08 recovery now offers explicit extension launch when proxy tools
don't acknowledge within 15 seconds. TDR-0069 fixes the old extension API default
and adds readiness, origin and project credential checks. TDR-0068 hardens upload
references and snapshot delivery. Static checks do not close live acceptance rows.

Source line references point to the checked-in unmodified HTML. Every row is a requirement, not a completion claim. Delivery evidence lives in [06-delivery](06-delivery.md).

The [2026-10-19 source audit](site-gap-audit-2026-10-19.md) maps current findings to
these acceptance rows. Its findings remain open. FD-22/23 below now describe the real
Groq/provider-backed billing paths; complete entitlement, quota, concurrency and
provider acceptance remain open in the audit and delivery ledger.

| ID | Source | User flow | Backend/data dependencies | Acceptance |
|---|---|---|---|---|
| FD-01 | L2097–2246 | Navigate workspace, search, status links | membership, project/ticket summary | Correct workspace; URL filters; real counts; responsive dashboard below 1024px |
| FD-02 | L2782–3020 | Project cards/compact/list/table, sort/filter | project metadata and aggregate root counts | Same projects/counts in every view; empty/error states |
| FD-03 | L2871 | Waiting on you | assignees/waiting-on/dates | Only open, relevant tickets; links open actual thread |
| FD-04 | L5395–5483 | New website project, client, environment | project/client create; existing link creation | Valid URL; persistent client/env; real link after success |
| FD-05 | L5395, L3374 | Image set/PDF creation and review | private uploads, assets, page identities | Validated files survive refresh; image/PDF preview and scoped guest access |
| FD-06 | L2724 | Web App/Mobile coming soon | none | Clearly upcoming; no fake working controls |
| FD-07 | L3066, L5299–5348 | Rename/settings/archive/restore/export | project mutation, audit, archive read guard | Restore works; archive revokes review access; safe CSV |
| FD-08 | L3081–3497 | Project/page preview, viewport/version/navigation | pages, revisions, proxy, widget | Existing website navigation and recovery remain functional |
| FD-09 | L3498–3734 | Thread detail, reply, screenshot/attachments | comments, storage, realtime | Persist after refresh; team replies never reach guests |
| FD-10 | L2475, L3605, L3799 | Workflow metadata | extended comment schemas | Five statuses plus legacy closed; multi-assign; nullable due date; tags/priority |
| FD-11 | L3824–4152 | Workspace tickets and filters | paginated workspace query | Root-only; no cross-workspace data; project/person/status/tag filters compose |
| FD-12 | L3859–3974 | List, board, table, calendar, groups/sorts | same ticket read model | Status updates reflected in every view; unscheduled items retained |
| FD-13 | L3977 | Standalone new ticket | project ticket creation | No fake DOM anchor; real detail/replies; validated project and members |
| FD-14 | L3736–3798 | Clients table, add/edit, project chips | clients module, project client_id | Persistent contact data and project association; no automatic access grants |
| FD-15 | L4005–4046 | Activity feed | existing append-only events | Paginated tenant scoped events; no fabricated history |
| FD-16 | L5191–5248, L5820 | Share roles, passcode, expiry, regenerate | share links and guest access | Old link/session rejected after revoke; expiration/passcode enforced |
| FD-17 | L5820 | Domain restrictions and export permission | verified reviewer email + policy | Cannot be bypassed by typing an email; not enabled without verification |
| FD-18 | L5249–5289 | Global search and notifications | scoped search, notifications | Results link correctly; read state persists |
| FD-19 | L5947–5968 | Guest name gate | current guest sessions | No member privileges; archived/revoked/expired links fail |
| FD-20 | L5969–end placement handlers | Point/region create, drag/resize, tags | region geometry anchored to page/version | Persist geometry; no overlapping accidental comments; cancel creates nothing |
| FD-21 | L5355, L5916 | Attachments and mentions | upload scopes, member resolution, notifications | Attachment authorization; mention recipients belong to workspace |
| FD-22 | L5484–5683 | Thread summaries, suggested replies and bounded BugHunt triage | configured Groq provider, scoped comments, workspace credits | Real provider outcomes; explicit analysis coverage; permission-preserving mutations and normal events; no fake success |
| FD-23 | L5684–5716 | Plans, checkout, invoices and renewal | configured payment provider, verified callbacks and persisted subscription state | Provider-confirmed state; idempotent callbacks, honest entitlements/quotas, retained legacy records; no fake checkout |
| FD-24 | L5717–5819 | Profile and notifications | users/preferences/email jobs | Persistent settings reflected in delivery behavior |
| FD-25 | L1590, L6430–end | Login/signup/reset/Google/2FA/sessions | actual authentication/security | Existing OTP/OAuth preserved; fake accounts and QR removed |
| FD-26 | L3034–3052 | Undo/redo | inverse validated mutations | Does not overwrite others' changes; no local-only illusion of persistence |

## Negative journeys

### Connected website review amendment (2026-10-19, planned)

[TDR-0060](../tdr/0060-connected-website-review.md) and the
[connected review plan](connected-review-plan-2026-10-19.md) define the next website
review flow. CR-A01 through CR-A09 in that plan are additional acceptance requirements,
not passed checks. They extend FD-04/08/09/16/19/20/21/25 with installation readiness,
independent website authentication, safe launch handoff, widget/extension continuity,
portal evidence, live reproduction and fix verification. FD-05 image/PDF behavior
remains required. Exact viewport/browser/device capabilities must be labeled honestly;
no iframe loading event or browser label establishes successful review readiness.

Implementation evidence: partial CR-01 now addresses access/session/retry prerequisites
for CR-A05/06 and FD-18/19/21/25. See TDR-0061 and the delivery ledger. These acceptance
rows remain unverified until their live journeys are demonstrated; CR-A01..04/07..09
are not implemented by this foundation slice.
Google state and refresh/OTP concurrency repairs (TDR-0062/0063) now pass their static
checks; the corresponding FD-25 and CR-A02/05/06 live acceptance remains pending.
TDR-0064 adds signup code confirmation, legacy inbox recovery and credential cutoffs
to FD-25/CR-A02/06. TDR-0065 mitigates unsafe optional server capture by default-off
execution until worker isolation is verified. Their live acceptance remains pending.
TDR-0066 adds stored guest validation, explicit rejoin and active access-loss cleanup
to FD-19/CR-A05/06/09, including guest image/PDF views. Live acceptance remains open.

The normal connected flow is project/ticket/evidence in Backline -> Open on site ->
actual website with its installed review panel -> return to the same ticket. Existing
legacy flows require explicit migration and must not silently change destinations.

### Existing negative journeys

F24 acceptance (TDR-0085): race final-byte reservations across every write path;
verify retained/archived content and pending grants count, same-key retry does not
double-charge, failed server writes release only after HEAD absence, renewed holds
survive stale checks, and confirmed deletion frees bytes. Unused signed PUT grants
keep conservative holds. Existing inventory/readiness and enforcement state must
match billing. No destructive fixtures or production near-quota stress in this task.

File-upload acceptance (TDR-0084): lose the response for the only PDF / final image
slot, retry the same batch and recover the same page/file; confirm acknowledged
files are skipped. Race equal IDs, reject differing actor/body/project reuse, and
revoke membership/session/role during storage. Close batch/reselect/restart is a
new intent, not persisted queue recovery. Orphan/byte quota reconciliation is open.

F30 acceptance (TDR-0083): fail client/project/default-link/audit insertion and verify
atomic rollback; lose a create response and retry at full quota to recover the same
record/link; race extension origin resolution; reject changed-body/actor request-ID
reuse; save a new client through project settings; verify pending/close/copy recovery.
No guest client/contact exposure. Separate file-upload acknowledgement and generic
project-update conflict/audit replay remain open; static checks do not close these.

F16 acceptance (TDR-0082): create/edit/duplicate a website URL containing `/app/`,
query and hash; reopen it through portal preview, guest review and native extension.
Legacy path-bearing targets must not duplicate the path in proxy requests, headers
or registered page URLs. Cover host casing/default ports, invalid new ports, sample
conversion at capacity and asset projects. Initial hash navigation does not imply
distinct hash-route comment identities. Source checks cannot close browser acceptance.

F28 acceptance (TDR-0081): enable/disable feedback email independently of the daily
digest, trigger each enabled event, verify correct thread links and actual inbox
receipt, then retry after queue/provider failure or worker restart. Queued messages
must skip after opt-out, removed membership/project access, changed verified
address or expiry. No historical/default-on email backfill. Source implementation
does not establish inbox delivery; Apps Script deduplication remains unverified.

F26 capacity acceptance (TDR-0080): race two project creates/restores/sample
conversions, invites/room joins/approvals and AI requests for the last slot. Only
capacity-fitting writes may commit; failed approvals remain pending. Confirm
duplicate joins need no extra seat, failed/empty/cancelled AI calls release credit,
crashed reservations expire, successful calls retain their request-start month and
legacy credits remain visible. Source checks pass; these live journeys are pending.

Wrong workspace IDs, guest access to staff routes, assignment to a foreign user, client/project from another tenant, invalid/duplicate tags, null required values, date clearing, archived project writes, expired links, reply-as-root counts, empty searches, CSV formula payloads, upload failures, missing provider configuration, and stale query responses must all have explicit behavior.
