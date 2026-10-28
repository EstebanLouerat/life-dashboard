import { isAuthorized, unauthorized } from "@/lib/auth";

/**
 * Placeholder. The weekly scan currently runs as the apartment-scan skill in
 * Claude (Gmail connector). Next step: read alert emails here via the Gmail
 * API, run the same dedup/scoring with generateStructured(ApartmentScan),
 * and return the result so the app can trigger and display scans.
 */
export async function POST(req: Request) {
  if (!isAuthorized(req)) return unauthorized();
  return Response.json({ error: "not_implemented" }, { status: 501 });
}
