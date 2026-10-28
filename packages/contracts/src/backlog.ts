import { z } from "zod";

/**
 * Backlog of ideas and bugs, independent of the tool that hosts it. Today
 * the adapter is GitHub Issues (labels encode status, kind and module);
 * switching tools means writing another BacklogProvider, not touching the
 * app's screens or cache.
 */
export const BacklogStatus = z.enum(["todo", "doing", "done"]);
export type BacklogStatus = z.infer<typeof BacklogStatus>;

export const BacklogKind = z.enum(["idea", "bug"]);
export type BacklogKind = z.infer<typeof BacklogKind>;

export const BacklogItem = z.object({
  /** Provider id (GitHub: the issue number). */
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  status: BacklogStatus,
  kind: BacklogKind.nullable(),
  /** App module it concerns (hair-care, courses…), null when none. */
  module: z.string().nullable(),
  /** Every label as the provider shows it. */
  labels: z.array(z.string()),
  url: z.string().url(),
  /** ISO timestamp of the last change on the provider. */
  updatedAt: z.string(),
});
export type BacklogItem = z.infer<typeof BacklogItem>;

export const NewBacklogItem = z.object({
  title: z.string().trim().min(1).max(256),
  description: z.string(),
  kind: BacklogKind,
  module: z.string().nullable(),
});
export type NewBacklogItem = z.infer<typeof NewBacklogItem>;

export interface BacklogProvider {
  list(): Promise<BacklogItem[]>;
  create(item: NewBacklogItem): Promise<BacklogItem>;
  setStatus(id: string, status: BacklogStatus): Promise<BacklogItem>;
  comment(id: string, body: string): Promise<void>;
}
