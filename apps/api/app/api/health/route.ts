import { isAuthorized } from "@/lib/auth";

/** Lets the app check the backend URL and key from the settings screen. */
export async function GET(req: Request) {
  return Response.json({ ok: true, authorized: isAuthorized(req) });
}
