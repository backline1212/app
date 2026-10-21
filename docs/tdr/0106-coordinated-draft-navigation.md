# TDR-0106: One navigation guard for nested review drafts

Date: 2026-10-22. Backlog item: BUG-03.

## Plan and behavior

1. Put one React Router blocker inside the root route. Forms register transient
   draft state/callbacks; they do not install competing blockers. Keep business
   data in React Query and form state, never a persistent draft registry.
2. Aggregate every draft affected by the attempted route change in one Stay /
   Discard confirmation. Include pending and unconfirmed saves. Never allow
   discarding an active save/upload, or discard only a child while losing a parent.
3. Keep local-close confirmations. Their one-navigation approval exempts only that
   form, so another draft can still block the same change. Preserve canvas-only
   reply URL changes and the file review's deliberate internal URL transitions.
4. Register new-ticket/team-note and file-manager changes alongside existing
   website/ticket/file-review drafts. Share one native unload guard. Cleanup must
   release unmounted guards; forced access loss cannot retain protected content.
5. Read current form refs at confirmation, handle newly affected drafts before
   consenting, and resume a blocked transition when all affected work has saved or
   unmounted. Confirmed saves must not replace a pending user navigation.
6. Verify web lint/typecheck/build and diff; push/deploy the web slice. Record live
   unsent draft/Back/Forward/nested/pending/access-loss checks separately. No test
   suites per AGENTS.md and no shared comments, uploads or provider calls for QA.

No HTTP contract, generated types, schema or data migration changes. Explicit
discard closes local transient forms and preserves already saved server records.

## Acceptance to record

Source checks pass (web lint/typecheck/build and diff). Vercel reports success for
`82da7f4`; the public page/bundle return 200 and the bundle contains the shared
draft dialog. Browser use was disabled at this checkpoint, so the interactions
below remain unverified rather than inferred from bundle contents.

Single and nested drafts; two affected drafts in one confirmation; Stay/X/Escape;
discard/resume; browser Back/Forward; unconfirmed original-request recovery;
pending save/upload refusal and completion; unaffected canvas URL transitions;
local close without a second prompt for the same form; new drafts while blocked;
revoked access/unmount cleanup and normal navigation without drafts.
