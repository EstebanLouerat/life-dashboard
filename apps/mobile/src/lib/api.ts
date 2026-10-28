import * as SecureStore from "expo-secure-store";
import {
  APP_KEY_HEADER,
  GroceryPlan,
  HealthResponse,
  WorkoutSession,
  type GroceryRequest,
  type WorkoutRequest,
} from "@ld/contracts";
import type { z } from "zod";

const URL_KEY = "api_base_url";
const APP_KEY = "api_app_key";

export async function getApiConfig() {
  const [baseUrl, appKey] = await Promise.all([
    SecureStore.getItemAsync(URL_KEY),
    SecureStore.getItemAsync(APP_KEY),
  ]);
  return { baseUrl: baseUrl ?? "", appKey: appKey ?? "" };
}

export async function setApiConfig(baseUrl: string, appKey: string) {
  await SecureStore.setItemAsync(URL_KEY, baseUrl.trim().replace(/\/+$/, ""));
  await SecureStore.setItemAsync(APP_KEY, appKey.trim());
}

export class ApiError extends Error {}

async function request<S extends z.ZodType>(
  path: string,
  init: RequestInit,
  schema: S,
): Promise<z.infer<S>> {
  const { baseUrl, appKey } = await getApiConfig();
  if (!baseUrl || !appKey) {
    throw new ApiError("Configure l'URL du backend et la clé dans Réglages.");
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", [APP_KEY_HEADER]: appKey },
    });
  } catch {
    throw new ApiError("Backend injoignable. Vérifie l'URL et ta connexion.");
  }
  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const code = (body as { error?: string } | null)?.error ?? `http_${res.status}`;
    throw new ApiError(`Erreur backend : ${code}`);
  }
  // Never trust the wire: re-validate against the shared contract.
  return schema.parse(body);
}

export const api = {
  health: () => request("/api/health", { method: "GET" }, HealthResponse),
  groceries: (input: GroceryRequest) =>
    request("/api/groceries", { method: "POST", body: JSON.stringify(input) }, GroceryPlan),
  workout: (input: WorkoutRequest) =>
    request("/api/workout", { method: "POST", body: JSON.stringify(input) }, WorkoutSession),
};
