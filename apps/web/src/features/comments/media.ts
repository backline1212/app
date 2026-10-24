export function isMediaAttachment(contentType: string): boolean {
  return contentType.startsWith("video/") || contentType.startsWith("audio/");
}
