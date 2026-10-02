# TDR-0058: Project cards show a screenshot of the site

Date: 2026-10-02
Status: Implemented; verified by lint/typecheck/build, the backend suite and a browser
pass with a real worker

## Context

Every website card in the projects grid showed the same schematic page, recolored per
project, with the site's favicon in its header. With more than a few projects the
grid read as one image repeated: to tell YouTube from Instagram you had to read the
card's title. The user asked for each card to show the site's real hero section, by a
stored screenshot or a small live frame, and said heavier work such as storing images
was acceptable.

## Decision

The worker takes a screenshot of the top of each website project's site and the card
shows it under its browser bar.

- **Capture.** A new Arq job, `capture_project_preview_job`
  (`modules/projects/preview_service.py`), opens the project's review URL in headless
  Chromium at 1280×800. It waits for the load event (at most 10 s, since sites that
  stream, like YouTube, never go network-idle), then captures the viewport. Pillow
  scales it to an 800 px wide JPEG, which is 10–35 KB.
- **Storage.** The JPEG goes to private storage under
  `previews/{workspace}/{project}/{token}.jpg`. Project hard delete now removes that
  prefix too. A capture that replaces an earlier one deletes the earlier object.
- **Data.** The project document gets an additive `preview` subdocument: `status`,
  `token`, `origin`, `requested_at`, `key`, `key_origin`, `captured_at` and `error`.
  It needs no new index and no migration. `updated_at` is not touched, because the
  grid sorts by activity.
- **When a capture runs.** A capture is due when:
  - the project has no capture yet;
  - its review URL changed;
  - the last capture is 7 days old;
  - the last attempt failed more than 6 hours ago;
  - or a queued job has been silent for 10 minutes.

  Listing projects queues whatever is due, up to 20 per request, so existing projects
  get previews the first time the grid opens. Creating a project and changing its URL
  queue one straight away. A compare-and-set on `preview.token` means concurrent
  listings queue one job, and a superseded job's result is discarded.
- **API.**
  - `ProjectOut` gains `preview_url`, a signed GET valid for 6 hours, plus
    `preview_status`, `preview_captured_at` and `preview_requested_at`.
  - The list, get, create and update responses sign the URL. Internal `get_project`
    callers don't, unless they pass `with_preview=True`.
  - A screenshot is shown only for the URL it was taken of, so after a URL change the
    card shows the sketch, not the old site.
  - `POST /projects/{id}/preview` (202) retakes it. It refuses image/PDF and archived
    projects, and won't queue a second job while one is pending.
- **Security.** `assert_safe_to_fetch` runs before Chromium launches, and the
  browser-render route guard re-checks every redirect hop of the navigation. An
  unresolvable or private host fails the capture without loading anything.
- **Frontend.**
  - `ProjectArtwork` shows the screenshot when there is one, and otherwise the
    existing schematic.
  - A queued capture adds a "Capturing preview…" chip. The grid polls every 5 s while
    a capture requested in the last 3 minutes is pending.
  - The image `src` is held per `preview_captured_at`, because the signed URL rotates
    on every read. A failed load retries once with the newest URL and then falls back
    to the sketch.
  - The card menu gains "Refresh preview".

## Alternatives rejected

- **Live `<iframe>` per card.** Many sites refuse framing (`X-Frame-Options`, CSP
  `frame-ancestors`), so the card would be blank for them. Fourteen live sites in one
  grid also cost real CPU, memory and network, run their scripts, autoplay and
  analytics, and can show login walls.
- **Third-party screenshot API.** This sends every client URL to an outside service.
  The worker already ships Chromium for cross-browser renders, so there is no reason
  to.
- **Full-page capture.** The card shows only the top of the page. A full page costs
  more time and storage for pixels no one sees.

## Consequences

- Each website project costs one Chromium page load per week, plus one per URL change
  or refresh, on the existing worker (`max_jobs = 3`).
- A preview reflects what an anonymous desktop visitor sees: login walls and cookie
  banners included, and nothing behind authentication.
- Without a running worker, captures stay queued. The grid stops polling after
  3 minutes and the cards keep their sketch.
