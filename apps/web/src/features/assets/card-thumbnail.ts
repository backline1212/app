/** An up-to-800 px wide JPEG of a rendered file - an image, or a PDF page's canvas - for
 * the project card (TDR-0198). Null when it can't be read. */
export function cardThumbnail(media: HTMLImageElement | HTMLCanvasElement): string | null {
  const width = media instanceof HTMLImageElement ? media.naturalWidth : media.width;
  const height = media instanceof HTMLImageElement ? media.naturalHeight : media.height;
  if (!width || !height) return null;
  const scale = Math.min(1, 800 / width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  // Transparent PNGs go on white, as the card shows them.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(media, 0, 0, canvas.width, canvas.height);
  try {
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return null;
  }
}
