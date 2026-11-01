# TDR-0227: Extension 0.5.15 - nothing captured without the user, fewer permissions

Date: 2026-11-01. Source: Chrome Web Store rejected 0.5.14 (0.4.13 is live); compliance
and UX review of the extension and website SDK.

## Store compliance

- **Card picture is opt-in.** Since 0.5.13 (TDR-0197) a member's review took a screenshot
  of the tab 1.5 s after loading and uploaded it as the project card picture, without the
  user doing anything. The toolbar now offers "Use this view as the project picture" /
  "Not now" (at most once a day per project) and captures only on click.
- **`activeTab` removed.** Screenshots and script injection are covered by the
  `<all_urls>` host permission; the extra permission had a justification that no longer
  described what the code did.
- **Disclosure.** The privacy notice describes the console/network diagnostics (what is
  kept, masking, the 50-entry cap, sent only with "Attach console errors" ticked) and
  screen/voice recordings (only on Record, after the browser's prompt). The store
  handoff lists the matching Privacy-practices answers.

## Extension UX

- The popup showed nothing when starting a comment failed (read-only access, plan limit,
  offline): it closed anyway. It now shows the page's error. A tab opened before install
  gets "Reload this page…" with a Reload button instead of "can't run on this page".
- Network failures read "Can't reach Backline - check your connection." instead of
  "Check the token".
- Comment mode started from the popup had no way back to the site short of reloading; a
  small "Click anything to comment · Done" pill now ends it.

## Website SDK (also used by the extension)

- Comment-mode clicks are caught in the capture phase on `window` with
  `stopImmediatePropagation`, so a site's own handlers (SPA links, menus, add-to-cart)
  no longer run while a reviewer places a pin; Draw intercepts clicks the same way.
- Draw uses pointer events and `touch-action: none` while active, so it works by touch.
- × and Cancel on a written comment ask once ("Click again to discard this comment."),
  like Escape; a reload or tab close with a draft asks the browser to confirm.
- Client-facing copy: "Saving your comment…", "Couldn't save a copy of this page. Your
  feedback still saves.", "Attach a file", "Open with extension".
- Scrolling to a pin or composer respects reduced motion.
