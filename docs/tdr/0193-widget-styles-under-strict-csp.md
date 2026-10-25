# TDR-0193: Widget stays styled under a site's strict style policy

Date: 2026-10-25. Source: checking the one-tag install (TDR-0192) on a page whose CSP has
`style-src 'self'`: the widget's `<style>` element in its shadow root was refused, so the
name prompt, toolbar and cards rendered unstyled; the status menu's `style=""` dots were
refused too.

## Decision

- The shadow root adopts a constructed stylesheet (`new CSSStyleSheet()` +
  `replaceSync`), which is not inline markup and so isn't subject to `style-src`. Browsers
  without constructable stylesheets keep the `<style>` element.
- Status-menu dot colours are set through the CSSOM after rendering instead of `style=""`
  in the template.
- The SDK is 35.1 kB gzipped. The extension shares this code; it ships in the package
  after 0.5.11.

## Verification

Chromium on a page with `script-src 'self' http://localhost:8000; style-src 'self'` and
only the one-tag install: name prompt, toolbar, composer and thread card were styled, a
comment saved with its screenshot, status dots coloured, zero CSP violations. Review-link
proxy and extension (local build) composers unchanged.
