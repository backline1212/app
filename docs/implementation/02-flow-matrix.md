# Flow inventory and acceptance criteria

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

2026-10-19: FD-08 recovery now offers explicit extension launch when proxy tools
don't acknowledge within 15 seconds. TDR-0069 fixes the old extension API default
and adds readiness, origin and project credential checks. TDR-0068 hardens upload
references and snapshot delivery. Static checks do not close live acceptance rows.

Source line references point to the checked-in unmodified HTML. Every row is a requirement, not a completion claim. Delivery evidence lives in [06-delivery](06-delivery.md).

The [2026-10-19 source audit](site-gap-audit-2026-10-19.md) maps current findings to
these acceptance rows. Its findings remain open. FD-22/23 below retain their historical
amendment wording; later TDRs implement real Groq AI and billing, so those rows require
reconciliation (F35) and must not be read as a current capability inventory.

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
| FD-22 | L5484–5683 | AI summary/task/duplicates/tags/changelog/reply | none (intentional divergence) | Explicit non-functional placeholders; no fake results, credits, zero-usage telemetry or paywall |
| FD-23 | L5684–5716 | Plans and checkout | none (intentional divergence) | Explicit non-functional placeholders; no simulated prices, entitlements, limits or checkout |
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

Wrong workspace IDs, guest access to staff routes, assignment to a foreign user, client/project from another tenant, invalid/duplicate tags, null required values, date clearing, archived project writes, expired links, reply-as-root counts, empty searches, CSV formula payloads, upload failures, missing provider configuration, and stale query responses must all have explicit behavior.
