# TDR-0091: Bound website version capture and expose recovery

Date: 2026-10-20. Scope: website review responsiveness and snapshot/recovery gaps.

## Decision

Keep page-version capture independent of leaving feedback. Give each DOM capture
its own node counter so overlapping captures cannot reset IDs. Stop and report a
failed complete capture at 5,000 visible nodes, depth 80, 20,000 scanned elements,
large direct text/attributes, 4 MiB serialized content or ten seconds of elapsed
capture work. Yield periodically for browser input, include finite raw-text/memory
checks and exclude Backline's own UI host. Never silently truncate a version and
feed partial content into recovery. These bounds do not guarantee every site can
produce a complete version or make browser layout/style calculations preemptible.

Bind capture to the document URL associated with page registration. Check before
walking, during yielding and before submitting. A changed page must be reopened;
never post its new DOM to the earlier page's revision identity. Shared capture UI
shows a separate failure notice with retry/dismiss; slow responses get a waiting
notice after twenty seconds. A new page/capture generation supersedes old notices.
The optional notice never disables comment creation or claims feedback was saved.
Session/auth recovery retains ownership of 401/403 errors. The request can remain
pending after the waiting notice; no false HTTP timeout/rollback claim is made.

Bound raw snapshot HTTP bodies before FastAPI JSON parsing: 4 MiB, declared and
actual byte checks, 35-second receive deadline, disconnect handling. Place the
limiter inside CORS so bounded rejections are readable by supported browsers. New
Pydantic writes validate viewport, hash format, index size, tree depth, one-to-one
node identity and tree/index tag agreement. Existing stored revisions remain
readable without migration. Guest scope and existing rate limits still apply.

Release widget/extension capture changes as 0.4.6. Preserve unrelated local 0.4.5
store/icon preparation; stage only this release's manifest version change. The
production backend/extension rollout remains pending Railway's temporary deploy
pause (TDR-0090). Installed-extension acceptance is separate from source/build.

## Verification and remaining acceptance

Initial widget/extension lint/typecheck/build passes 6/6 before final scan/text and
notice refinements. Backend Ruff passes; mypy/contracts/final checks are in progress.
No suite or production snapshot/comment write. Pending supported manual acceptance:
large/deep/hidden-node/text pages, overlapping captures, SPA navigation during the
walk, retry/dismiss, stale responses/generation, slow/disconnected/oversize/chunked
requests, complete-tree rejection, small legacy captures, CORS/auth/scope and actual
version recovery. Browser use is unavailable. No universal website/SSO promise or
isolated server browser enablement is introduced.

Final source checks pass: full frontend lint/typecheck/build 12/12, backend Ruff/
full mypy (214 files), affected mypy (9), scope audit (23 repositories), regenerated
contracts and diff checks. Earlier widget/extension checks passed 6/6. Revisited DOM
elements fail explicitly; child lists are copied only after a bounded count check.
No suite run. Release/build does not confirm installed-extension or live acceptance.
