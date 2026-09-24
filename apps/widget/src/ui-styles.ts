const HOST_STYLES = `
  :host {
    all: initial;
    /* Backline design tokens (apps/web's backline.css), so the overlay reads as the same
       product as the dashboard around it. --bl-ink-4 is the dashboard's AA-contrast
       value, not the prototype's lighter #9A9D99. */
    --bl-ink: #0B0B0B; --bl-ink-2: #3A3D3A; --bl-ink-3: #6B6E6B; --bl-ink-4: #696C68;
    --bl-paper: #F1F2F0; --bl-surface: #FFFFFF; --bl-line: #DDDEDA; --bl-line-soft: #E9EAE6;
    --bl-mint: #69DEB2; --bl-mint-deep: #0A6B4B; --bl-mint-tint: #E3F8EF;
    --bl-sans: "Inter", "Schibsted Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    --bl-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .bl-tooltip {
    position: fixed; bottom: 24px; right: 24px; z-index: 2147483000;
    background: #14141A; color: #F2F2F5; padding: 10px 14px; border-radius: 8px;
    font-size: 13px; box-shadow: 0 4px 16px rgba(0,0,0,0.25); max-width: 220px;
  }
  .bl-name-form {
    position: fixed; z-index: 2147483000; background: #FFFFFF; color: #14141A;
    border-radius: 10px; box-shadow: 0 8px 30px rgba(0,0,0,0.25); padding: 16px;
    width: 260px; border: 1px solid rgba(0,0,0,0.08);
    top: 50%; left: 50%; transform: translate(-50%, -50%);
  }
  .bl-name-form input {
    width: 100%; border: 1px solid rgba(0,0,0,0.15); border-radius: 6px; padding: 8px;
    font-size: 13px; margin-top: 6px; margin-bottom: 10px;
  }
  .bl-name-form button {
    background: #4F46E5; color: #fff; border: none; border-radius: 6px; padding: 8px 12px;
    font-size: 13px; cursor: pointer; width: 100%;
  }
  .bl-attachments { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
  .bl-attachment-chip {
    display: flex; align-items: center; gap: 5px; background: #F5F5F7; border-radius: 6px;
    padding: 4px 6px 4px 8px; font-size: 12px; max-width: 100%; border: 1px solid rgba(0,0,0,0.06);
  }
  .bl-attachment-chip.bl-attachment-pending { opacity: 0.6; }
  .bl-attachment-name {
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px;
  }
  .bl-pin {
    /* absolute (document coordinates): must scroll with the page to stay attached to
       the element it marks, the same reasoning as .bl-card below. The square
       bottom-left corner is the pin's point, lifted by its own height so that corner
       sits exactly on the clicked spot. */
    position: absolute; width: 24px; height: 24px; border-radius: 50% 50% 50% 3px;
    background: var(--bl-ink); color: #fff; border: 2px solid #fff;
    transform: translateY(-100%); display: grid; place-items: center;
    font-size: 13px; font-weight: 700; line-height: 1;
    z-index: 2147482999; box-shadow: 0 2px 5px rgba(11,11,11,0.22); cursor: pointer;
  }
  /* The pin for a comment still being written - the design's "ghost" pin. */
  .bl-pin.bl-pin-ghost {
    background: var(--bl-mint); color: var(--bl-ink);
    outline: 2px dashed var(--bl-ink); outline-offset: 2px;
  }
  .bl-pin.bl-pin-ghost::after { content: "+"; }
  .bl-pin:focus-visible { outline: 3px solid #14141A; outline-offset: 3px; }
  .bl-status { font-size: 12px; color: #6B6B76; margin-top: 8px; }
  .bl-toast {
    position: fixed; bottom: 24px; left: 24px; z-index: 2147483000;
    background: #14141A; color: #F2F2F5; padding: 10px 14px; border-radius: 8px;
    font-size: 13px; box-shadow: 0 4px 16px rgba(0,0,0,0.25); max-width: 240px;
  }
  .bl-toast-offline { background: #8A5B00; color: #FFFFFF; }
  button.bl-attachment-remove {
    background: none; border: none; color: #6B6B76; cursor: pointer; width: auto;
    padding: 0 2px; font-size: 14px; line-height: 1; flex-shrink: 0;
  }
  button.bl-attachment-remove:hover { color: #EF4444; }

  /* ---- Comment cards: the new-comment composer and the read-only view of an
     existing comment share this box (the design's composer-pop) ---- */
  .bl-card {
    /* absolute (document coordinates), not fixed (viewport coordinates): the card
       opens at the point the reviewer clicked, on an already-scrolled page - fixed
       positioning would leave it glued to that screen position as the page scrolls
       underneath it, drifting away from the element it's actually about. */
    position: absolute; z-index: 2147483000; width: 344px; max-width: calc(100vw - 24px);
    background: var(--bl-surface); color: var(--bl-ink); border: 1px solid var(--bl-line);
    border-radius: 8px; box-shadow: 0 20px 48px rgba(11,11,11,0.24);
    font-size: 14px; line-height: 1.45; text-align: left;
  }
  .bl-card, .bl-card * { font-family: var(--bl-sans); }
  .bl-card .bl-cp-av, .bl-card .bl-cp-loc, .bl-card .bl-cp-lbl,
  .bl-card .bl-cp-ctx, .bl-card .bl-cp-hint, .bl-card .bl-cp-hint kbd {
    font-family: var(--bl-mono);
  }
  .bl-card button { font: inherit; margin: 0; cursor: pointer; }
  .bl-card button:disabled { cursor: default; opacity: 0.55; }
  .bl-cp-head {
    display: flex; align-items: center; gap: 9px; padding: 11px 12px;
    background: var(--bl-ink); color: #fff; border-radius: 7px 7px 0 0;
    font-size: 13px; font-weight: 600;
  }
  .bl-card .bl-cp-av {
    width: 22px; height: 22px; border-radius: 50%; background: var(--bl-mint);
    color: var(--bl-ink); display: grid; place-items: center; flex: none;
    font-size: 9px; font-weight: 700;
  }
  .bl-cp-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bl-card .bl-cp-loc {
    margin-left: auto; min-width: 0; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; color: rgba(255,255,255,0.72); background: rgba(255,255,255,0.12);
    border-radius: 20px; padding: 2px 8px; font-size: 10px; font-weight: 400;
  }
  .bl-card button.bl-cancel {
    flex: none; background: none; border: 0; padding: 0 2px; color: rgba(255,255,255,0.7);
    font-size: 18px; line-height: 1;
  }
  .bl-card button.bl-cancel:hover { color: #fff; }
  /* The comment's status, in the header of the read-only comment view
     (ui-comment-view.ts): a button with a menu where this viewer can change it, a plain
     pill where they can't. */
  .bl-cv-status-wrap { position: relative; flex: none; }
  .bl-card .bl-cv-status {
    display: inline-flex; align-items: center; gap: 6px; flex: none; height: 22px;
    padding: 0 8px; border: 0; border-radius: 20px; background: rgba(255,255,255,0.12);
    color: #fff; font-size: 11px; font-weight: 500; line-height: 1; white-space: nowrap;
  }
  .bl-card button.bl-cv-status { padding-right: 6px; }
  .bl-card button.bl-cv-status:hover, .bl-card button.bl-cv-status[aria-expanded="true"] {
    background: rgba(255,255,255,0.22);
  }
  .bl-card button.bl-cv-status:focus-visible { outline: 2px solid var(--bl-mint); outline-offset: 2px; }
  .bl-card button.bl-cv-status[aria-busy="true"] { opacity: 0.6; cursor: progress; }
  .bl-cv-status svg { color: rgba(255,255,255,0.7); flex: none; }
  .bl-cv-status-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
  .bl-cv-status-menu {
    position: absolute; top: calc(100% + 6px); right: 0; z-index: 1;
    display: grid; gap: 1px; min-width: 168px; padding: 4px;
    background: var(--bl-surface); color: var(--bl-ink); border: 1px solid var(--bl-line);
    border-radius: 6px; box-shadow: 0 12px 32px rgba(11,11,11,0.18);
  }
  .bl-cv-status-menu.bl-is-up { top: auto; bottom: calc(100% + 6px); }
  .bl-cv-status-menu[hidden] { display: none; }
  .bl-card .bl-cv-status-opt {
    display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 8px;
    border: 0; border-radius: 4px; background: none; color: var(--bl-ink-2);
    font-size: 12.5px; font-weight: 500; line-height: 1.2; text-align: left;
  }
  .bl-card .bl-cv-status-opt:hover, .bl-card .bl-cv-status-opt:focus-visible {
    background: var(--bl-paper); color: var(--bl-ink); outline: none;
  }
  .bl-cv-status-opt svg { margin-left: auto; color: var(--bl-mint-deep); flex: none; visibility: hidden; }
  .bl-card .bl-cv-status-opt[aria-checked="true"] { color: var(--bl-ink); font-weight: 600; }
  .bl-cv-status-opt[aria-checked="true"] svg { visibility: visible; }
  .bl-cp-body { padding: 13px 13px 12px; }
  /* max-height is the cap the composer's own auto-grow reads back out of the computed
     style (ui-composer.ts) - one source of truth for how tall this can get before it
     starts scrolling instead. resize stays on, so it's still draggable past that. */
  .bl-card textarea {
    display: block; width: 100%; min-height: 78px; max-height: 40vh; margin: 0;
    padding: 10px 11px; overflow-y: auto;
    border: 1px solid var(--bl-line); border-radius: 3px; background: var(--bl-surface);
    color: var(--bl-ink); font-size: 13.5px; line-height: 1.5; resize: vertical; outline: none;
  }
  .bl-card textarea:focus { border-color: var(--bl-ink); }
  .bl-card textarea::placeholder { color: var(--bl-ink-4); }
  .bl-cp-sec { margin-top: 12px; }
  .bl-card .bl-cp-lbl {
    display: block; margin-bottom: 7px; font-size: 9px; letter-spacing: 0.07em;
    color: var(--bl-ink-4);
  }
  .bl-cp-tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .bl-card .bl-cp-tag {
    display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 11px 0 9px;
    border: 1px solid var(--bl-line); border-radius: 20px; background: var(--bl-surface);
    color: var(--bl-ink-2); font-size: 12px; font-weight: 500;
  }
  .bl-cp-tag svg { color: var(--bl-ink-4); flex: none; }
  .bl-card button.bl-cp-tag:hover { border-color: var(--bl-ink-4); }
  .bl-card .bl-cp-tag[aria-pressed="true"], .bl-card .bl-cp-tag.bl-is-on {
    background: var(--bl-ink); border-color: var(--bl-ink); color: #fff;
  }
  .bl-cp-tag[aria-pressed="true"] svg, .bl-cp-tag.bl-is-on svg { color: var(--bl-mint); }
  .bl-cp-shots { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; }
  /* The uploaded-file chips flow in the same row as the attach button. */
  .bl-cp-shots .bl-attachments { display: contents; }
  .bl-card .bl-attachment-chip {
    height: 34px; border-radius: 3px; border: 1px solid var(--bl-line);
    background: var(--bl-paper); color: var(--bl-ink-2);
  }
  .bl-card button.bl-cp-attach {
    display: inline-flex; align-items: center; gap: 7px; width: auto; height: 34px;
    padding: 0 12px; border: 1px dashed var(--bl-line); border-radius: 3px;
    background: var(--bl-surface); color: var(--bl-ink-3); font-size: 12.5px;
  }
  .bl-card button.bl-cp-attach svg { color: var(--bl-ink-4); }
  .bl-card button.bl-cp-attach:hover { border-color: var(--bl-ink); border-style: solid; color: var(--bl-ink); }
  .bl-card button.bl-cp-attach:hover svg { color: var(--bl-ink); }
  .bl-card .bl-cp-ctx {
    display: flex; align-items: center; flex-wrap: wrap; gap: 7px; margin-top: 12px;
    padding: 8px 10px; background: var(--bl-paper); border-radius: 3px;
    font-size: 10px; color: var(--bl-ink-3);
  }
  .bl-cp-ctx svg { color: var(--bl-ink-4); flex: none; }
  .bl-cp-sep { width: 1px; height: 10px; background: var(--bl-line); flex: none; }
  .bl-cp-rgn {
    display: inline-flex; align-items: center; gap: 5px; margin-left: auto;
    color: var(--bl-mint-deep); background: var(--bl-mint-tint); border-radius: 20px; padding: 2px 8px;
  }
  .bl-cp-rgn svg { color: var(--bl-mint-deep); }
  .bl-card .bl-status { margin-top: 10px; font-size: 12px; color: var(--bl-ink-3); }
  .bl-card .bl-status:empty { display: none; }
  .bl-cp-foot {
    display: flex; align-items: center; gap: 8px; margin-top: 13px; padding-top: 12px;
    border-top: 1px solid var(--bl-line-soft);
  }
  .bl-card .bl-cp-hint { margin-right: auto; font-size: 9.5px; color: var(--bl-ink-4); white-space: nowrap; }
  .bl-card .bl-cp-hint kbd {
    background: var(--bl-paper); border: 1px solid var(--bl-line); border-radius: 3px;
    padding: 1px 5px; font-size: inherit; font-weight: 500; color: var(--bl-ink-3);
  }
  .bl-card button.bl-cp-cancel {
    background: none; border: 0; border-radius: 3px; padding: 8px 12px;
    font-size: 12.5px; color: var(--bl-ink-3);
  }
  .bl-card button.bl-cp-cancel:hover:not(:disabled) { background: var(--bl-paper); color: var(--bl-ink); }
  .bl-card button.bl-submit {
    display: inline-flex; align-items: center; gap: 7px; background: var(--bl-ink); color: #fff;
    border: 0; border-radius: 3px; padding: 8px 14px; font-size: 12.5px; font-weight: 600;
  }
  .bl-card button.bl-submit:hover:not(:disabled) { background: #232523; }
  /* Read-only view of an existing comment (ui-comment-view.ts). */
  .bl-cv-text {
    margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--bl-ink);
    white-space: pre-wrap; word-break: break-word;
  }
  .bl-cv-files { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; }
  .bl-card .bl-attachment-link {
    display: inline-flex; align-items: center; gap: 6px; height: 34px; max-width: 100%;
    padding: 0 10px; border: 1px solid var(--bl-line); border-radius: 3px;
    background: var(--bl-paper); color: var(--bl-ink-2); font-size: 12px; text-decoration: none;
  }
  .bl-card .bl-attachment-link:hover { border-color: var(--bl-ink); color: var(--bl-ink); }
  .bl-card .bl-attachment-link.bl-cv-thumb { width: 64px; height: 48px; padding: 0; overflow: hidden; }
  .bl-cv-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
`;

export function createShadowRoot(): ShadowRoot {
  const host = document.createElement("div");
  host.setAttribute("data-backline-root", "true");
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = HOST_STYLES;
  shadow.appendChild(style);

  // Keystrokes typed into Backline's own UI must not also reach the page underneath.
  // A shadow root hides the DOM, not the events: they keep propagating out (retargeted
  // to the host), so a site listening on document for a key - a search box, a nav, a
  // carousel - acts on a comment being typed into the composer. Pressing Enter mid
  // comment navigated the frame away on sites that do this, taking the unsent comment
  // with it.
  //
  // Stopping them here, at the boundary, leaves every widget-internal handler working:
  // those sit either on the elements themselves (the composer's Cmd+Enter, a pin's
  // Enter) or on document in the capture phase (the comment card's Escape), and both
  // run before an event reaches this point on the way out. A site's own capture-phase
  // listeners still fire - nothing inside a shadow tree can prevent that.
  for (const type of ["keydown", "keypress", "keyup"]) {
    shadow.addEventListener(type, (event) => event.stopPropagation());
  }

  return shadow;
}
