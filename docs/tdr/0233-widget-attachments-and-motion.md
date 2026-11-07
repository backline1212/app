# TDR-0233: Widget attachments say why; cards and toasts fade in

Date: 2026-11-07. Source: remaining items of the widget UX audit (TDR-0227).

- **Attachment types.** Pasted files and the picker's "All files" skipped the accept
  list, and every failure read "couldn't be uploaded. Retry or remove it." - so a
  disallowed type got a Retry that could never work. Files are checked against the same
  list the API accepts before uploading ("note.txt can't be attached. Use an image, PDF,
  Word, Excel or Markdown file, or a recording."). Upload errors carry the server's
  message, and Retry is offered only for network/server errors (status 0, 429, 5xx).
- **Motion.** Comment cards, toasts and the hint tooltip fade in over 140 ms using
  `@starting-style`, so it plays once when they appear (not again after the composer's
  nudge); off under reduced motion, instant in browsers without support. The hint
  tooltip is announced (`role="status"`).
