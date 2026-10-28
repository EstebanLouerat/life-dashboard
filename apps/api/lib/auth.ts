import { timingSafeEqual } from "node:crypto";
import { APP_KEY_HEADER } from "@ld/contracts";

/** Single-user app: one shared secret, compared in constant time. */
export function isAuthorized(req: Request): boolean {
  const expected = process.env.APP_KEY;
  const got = req.headers.get(APP_KEY_HEADER);
  if (!expected || !got) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
