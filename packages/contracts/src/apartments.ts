import { z } from "zod";

/** Same shape as the JSON block produced by the apartment-scan skill. */
export const ListingStatus = z.enum(["new", "seen", "contacted", "visited", "rejected"]);
export type ListingStatus = z.infer<typeof ListingStatus>;

export const Listing = z.object({
  /** Stable hash of area + surface + price, used for dedup across scans. */
  id: z.string(),
  title: z.string(),
  price: z.number(),
  chargesIncluded: z.boolean(),
  surface: z.number(),
  rooms: z.number(),
  area: z.string(),
  address: z.string().nullable(),
  floor: z.number().nullable(),
  furnished: z.boolean().nullable(),
  sources: z.array(z.object({ site: z.string(), url: z.string() })),
  publishedAt: z.string().nullable(),
  score: z.number().min(0).max(100),
  reason: z.string(),
  redFlags: z.array(z.string()),
  status: ListingStatus,
});
export type Listing = z.infer<typeof Listing>;

export const ApartmentScan = z.object({
  scanDate: z.string(),
  window: z.string(),
  listings: z.array(Listing),
  rejectedCount: z.number().int().nonnegative(),
});
export type ApartmentScan = z.infer<typeof ApartmentScan>;
