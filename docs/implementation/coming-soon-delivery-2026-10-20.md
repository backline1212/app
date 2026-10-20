# Site-wide missing feature delivery

Date: 2026-10-20. User authorized implementation of all Coming soon features and
continued core flow repair, without clarification questions. This inventory covers
actual source behavior, including promises in pricing; a removed label is not proof
of a feature. Preserve current architecture and the isolation gate in TDR-0065.

Core follow-ups now also include [atomic metadata onboarding](../tdr/0083-atomic-project-and-client-creation.md)
and [PDF/image upload replay](../tdr/0084-file-upload-replay.md). These source repairs
do not establish browser/storage failure acceptance or full storage-byte quotas.

| Area | Current delivery | Remaining work / acceptance |
|---|---|---|
| Login/comment continuity | TDR-0075 source deployed as 6366103; extension 0.4.4 published | Installed extension update and lost-response/actual OTP/provider acceptance |
| Manage files | TDR-0076 implements member file list, rename, archive/restore, upload, preserved history and active capacity serialization | Browser persistence, concurrent upload/restore, guest archive exclusion and storage acceptance |
| PDF/image review | TDR-0077 implements stable authenticated content, bounded PDF rendering, file-specific pin movement and ticket-to-file resolution. TDR-0088 adds file/page/thread URLs, PDF picker, router/native draft guards and unavailable-content/text recovery | Browser/storage acceptance, guest/role negatives, narrow/touch devices; replacement-version/page mapping remains distinct |
| Page approval | TDR-0076 implements latest captured-version approval/reopen, recorded actor/time, stale approval after version change and compare-and-set conflict protection | Browser approve/reopen, concurrent version change and role/guest negative acceptance |
| Private comment entry | TDR-0076 replaces disabled Private with Team note, backed by existing member-only team ticket creation, current project/page preselection and immutable replay | Browser save/private guest exclusion; private DOM pins inside an untrusted website are not implemented by this portal-only note |
| Deploy sync | TDR-0087 implements manager credential rotation/revoke, signed bounded CI notifications, immutable delivery replay, paginated durable history, current member-review snapshot association, existing revision outbox, CI sender/setup and read-only MCP history | Actual CI/credential/browser/concurrency/role/guest acceptance; fragment-route deployment capture and isolated background capture remain unavailable. Snapshot receipt does not prove a commit is live or a fix verified |
| Web App | Signed-in website review works through Website/native extension; dedicated app state/diagnostic mode remains planned | Opt-in reproduction steps and explicit state, sanitized console/network capture with limits/consent, state-aware navigation and MCP contracts. Do not claim a shared website account or universal SSO |
| Mobile App | Existing image/PDF review is not native app execution | Device/build records, real-device capture integration, build-linked screenshots/comments, SDK/device permissions and distribution, native screen coordinates/version mapping; no fake APK/TestFlight runner |
| Video/audio recording | Upload types currently exclude recordings; no recorder or playback flow | Explicit getDisplayMedia/MediaRecorder permission, visible start/stop/cancel, duration/size limits, validated private media storage/quota, attachment playback/download, mobile/browser fallbacks; no hidden recording |
| Browser console replay | No console/network recorder or safe redaction pipeline | Opt-in capture, no cookies/Authorization/request bodies by default, robust secret/query redaction, bounded buffers, private evidence contracts, timeline display and deletion/retention |
| Custom branding/domains | Pricing truthfully marks these unshipped | Tenant branding settings/assets, reviewed output themes, DNS ownership verification, host-to-workspace binding, certificate provisioning/status, strict routing/CORS/cookie isolation and domain removal |
| White-label client portals | Pricing truthfully marks these unshipped | Branding/domain foundation, guest route/theme/application title, scoped share identity, transactional email ownership/branding, support/legal identity and acceptance across guest gates/boards/files |
| Cloud login pricing claim | Deployment disables fresh server browser work until isolation | Pricing must not sell disabled cloud sessions as an available capability; retain actual native website sign-in review |

## Delivery order and boundaries

1. Finish TDR-0075 and release TDR-0076 review workflows with evidence.
2. Connect deploy notifications to the existing revision/outbox pipeline without
   opening the disabled shared-browser path.
3. Add opt-in diagnostics/recording as private evidence, then app-state context.
4. Add native mobile build/device integration and branding/verified-domain routing.
5. Reconcile plan entitlements and comparison rows only when features actually ship.

All HTTP contracts originate in Pydantic and regenerate packages/types. New features
need tenant/guest/role enforcement, pending/error/empty/retry states, audit evidence
and recorded lint/typecheck/build plus supported manual acceptance. No production
fixtures, destructive migration, pretend checkout or fake successful integrations.
Infrastructure, device/provider credentials and publication steps are distinct from
source implementation; leave their status explicit rather than inventing success.
