// Viewport rasterization (07-Review-SDK.md §7.4 step 3): serialize the live DOM into an
// SVG <foreignObject>, rasterize that to a canvas, export as JPEG. This is the same
// fundamental technique libraries like dom-to-image use. It can legitimately fail -
// cross-origin stylesheets can't be read (SecurityError) and cross-origin images inside
// the cloned subtree taint the canvas - both are the "canvas taint from cross-origin
// content" failure mode the spec explicitly anticipates (P5, Graceful Failure): this
// function returns null rather than throwing, and the caller proceeds without a
// screenshot and flags capture_status: "failed".
//
// The SVG must be loaded as a data: URI, not a blob: URL - verified empirically
// (docs/tdr/0003-widget-screenshot-data-uri.md): Chrome unconditionally taints the
// canvas for a foreignObject-bearing SVG loaded via blob:, even with fully same-origin
// content, which would make every single capture fail regardless of cross-origin
// content. A data: URI doesn't hit this restriction.

function collectInlineStyles(): string {
  let css = "";
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        css += rule.cssText + "\n";
      }
    } catch {
      // Cross-origin stylesheet without CORS headers - can't read its rules. Skip it.
    }
  }
  return css;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to rasterize snapshot SVG."));
    img.src = src;
  });
}

function isTransparent(color: string): boolean {
  return color === "transparent" || /^rgba\(.*,\s*0\)$/.test(color);
}

function pageBackground(): string {
  for (const element of [document.body, document.documentElement]) {
    const color = window.getComputedStyle(element).backgroundColor;
    if (!isTransparent(color)) return color;
  }
  return "#ffffff";
}

export async function captureScreenshot(): Promise<Blob | null> {
  try {
    const width = window.innerWidth;
    const height = window.innerHeight;

    const clone = document.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[data-backline-root]").forEach((node) => node.remove());

    const css = collectInlineStyles();
    const serializedBody = new XMLSerializer().serializeToString(clone);
    // The page's own backdrop: the body's background, else the root's, else white - what
    // the browser paints. A transparent backdrop used to rasterize as black in the JPEG.
    const background = pageBackground();
    // The clone renders from the top of the document; shift it so the image shows the
    // part of the page the reviewer is looking at. Relative offsets keep fixed headers
    // and footers pinned to the viewport, as on screen.
    const scrollX = Math.round(window.scrollX);
    const scrollY = Math.round(window.scrollY);

    const svgString =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<foreignObject width="100%" height="100%">` +
      `<div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;left:${-scrollX}px;top:${-scrollY}px;background:${background};min-height:${height + scrollY}px;">` +
      `<style>${css}</style>${serializedBody}</div>` +
      `</foreignObject></svg>`;

    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
    const image = await loadImage(dataUrl);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.8);
    });
  } catch {
    return null;
  }
}
