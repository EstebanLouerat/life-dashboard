/**
 * Web preview only: SecureStore does not exist in a browser, and a key in
 * localStorage would be readable by any script of the origin. Secrets are
 * kept in memory, so they last until the page is reloaded.
 */
const memory = new Map<string, string>();

export const secrets = {
  get: async (key: string) => memory.get(key) ?? null,
  set: async (key: string, value: string) => {
    memory.set(key, value);
  },
  remove: async (key: string) => {
    memory.delete(key);
  },
  /** False when secrets only last until the page is reloaded (web preview). */
  persistent: false,
};
