import type { Schemas } from "@backline/types";
import { uploadAttachment } from "../board/api";

/** Keep each confirmed upload even if another selected file fails. */
export async function uploadReplyFiles(projectId: string, files: File[], remaining: number, onUploaded: (value: Schemas["AttachmentIn"]) => void): Promise<string | null> {
  if (files.length > remaining) return `You can attach ${remaining} more file${remaining === 1 ? "" : "s"}. Choose fewer files.`;
  let failed = 0;
  for (const file of files) {
    try {
      if (!file.size || file.size > 20 * 1024 * 1024) throw new Error("File size");
      onUploaded(await uploadAttachment(projectId, file));
    } catch { failed += 1; }
  }
  return failed ? `${failed} file${failed === 1 ? " could" : "s could"} not upload. Successful attachments are kept. Retry only the failed files; supported files must be at most 20 MiB.` : null;
}
