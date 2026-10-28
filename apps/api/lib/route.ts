import type { z } from "zod";
import { isAuthorized, unauthorized } from "./auth";

/**
 * Wraps a POST handler: checks the app key, validates the body against the
 * request schema, and turns errors into JSON responses the app can show.
 */
export function jsonPost<S extends z.ZodType>(
  requestSchema: S,
  handler: (input: z.infer<S>) => Promise<unknown>,
) {
  return async (req: Request): Promise<Response> => {
    if (!isAuthorized(req)) return unauthorized();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid_json" }, { status: 400 });
    }

    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
    }

    try {
      return Response.json(await handler(parsed.data));
    } catch (err) {
      console.error(err);
      return Response.json({ error: "generation_failed" }, { status: 502 });
    }
  };
}
