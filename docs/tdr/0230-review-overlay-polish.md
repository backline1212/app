# TDR-0230: Review overlay polish - placement, focus, phones, collapsible toolbar

Date: 2026-11-07. Source: remaining items of the widget/extension UX audit (TDR-0227).

- **Pins on offset pages.** The overlay host sat in `<body>` unpositioned, so on a site
  whose `<body>` is positioned, offset or transformed every pin and card was shifted by
  that amount. The host is now `position:absolute` at the document origin and appended to
  `<html>` (it also stays out of the `<body>` clone used for screenshots). Checked with
  `body{position:relative;margin:60px 0 0 80px}`: the new pin's corner lands exactly on
  the click.
- **Focus.** Closing a thread card returns keyboard focus to the pin that opened it,
  unless focus has already moved elsewhere on the page.
- **Reply and edit boxes** grow with their text like the new-comment box.
- **Phones and tablets** (`pointer: coarse`): at least 40px hit areas for pins, close and
  remove buttons, tags, status, mode-bar and action buttons; 16px text boxes so iOS
  doesn't zoom the page on focus.
- **Extension toolbar** can be collapsed to the project name and "Show tools" (kept for
  the tab's session); choosing Comment or Draw expands it.
