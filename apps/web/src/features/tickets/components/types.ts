import type { Schemas } from "@backline/types";
import type { UseMutationResult } from "@tanstack/react-query";
import type { CommentOut } from "../../board/api";

export type TicketUpdateMutation = UseMutationResult<
  CommentOut,
  Error,
  { id: string; patch: Schemas["CommentUpdate"] }
> & { canEdit: (ticket: Pick<Schemas["TicketOut"], "project_id">) => boolean };
