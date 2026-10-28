export * from "./groceries";
export * from "./workout";
export * from "./apartments";
export * from "./backlog";

/** Header the app sends on every API call (single-user shared secret). */
export const APP_KEY_HEADER = "x-app-key";

import { z } from "zod";
export const HealthResponse = z.object({ ok: z.boolean(), authorized: z.boolean() });
export type HealthResponse = z.infer<typeof HealthResponse>;
