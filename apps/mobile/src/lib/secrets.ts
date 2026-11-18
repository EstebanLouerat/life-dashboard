import * as SecureStore from "expo-secure-store";

/**
 * Secrets (API key, server address, GitHub token) in the Android keystore
 * through SecureStore. The web preview uses secrets.web.ts instead.
 */
export const secrets = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  remove: (key: string) => SecureStore.deleteItemAsync(key),
  /** False when secrets only last until the page is reloaded (web preview). */
  persistent: true,
};
