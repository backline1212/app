# TDR-0119: Load file review and PDF parsing only when needed

Date: 2026-10-22. Backlog item: OPT-04, guest/project review startup.

## Plan and decision

The guest entry and website project pages imported the PDF/image reviewer
eagerly even when the project was a website. The file reviewer imported
`pdfjs-dist` eagerly even when the file was an image. A production build put
about 514 kB of minified code into a shared `NativeReviewButton` chunk, so
opening website review could fetch the PDF parser before a login or comment.

Load `AssetReview` through React Suspense only for PDF/image projects, with a
visible loading state. Keep its component identity and props stable so guest
identity, URL state, comments and draft behavior do not change. Inside the
file preview, import `pdfjs-dist` only while preparing an actual PDF. The PDF
worker remains a separate file. This is a delivery and loading change only:
no API, evidence format, stored data or migration changes.

The production build now separates the 6.18 kB native-review chunk, 25.89 kB
file-review chunk and 483.14 kB PDF parser chunk. The prior combined native
review chunk was 514.27 kB. These are build outputs, not measured network or
time-to-interactive improvements. PDF review still pays for its parser when
opened; website and image review need not download it.

## Acceptance and verification

Web lint, typecheck, production build and diff checks pass. The build no longer
prints the >500 kB chunk advisory; the base index remains 444.66 kB. Codex
adds no test suite under this task's AGENTS.md rule. After web rollout,
browser/network acceptance should verify website guest/member entry without
the PDF chunk, an image file without the PDF parser, and a PDF file that loads
its parser/worker, renders, switches pages and saves comments. Network and
startup timings remain to be measured before closing OPT-04/03.

Rollout evidence on 2026-10-22: GitHub's Vercel context reports success for
source commit `a86e919`, and the public Vercel root returns HTTP 200. No
signed-in network trace, image review or PDF comment acceptance was run.
