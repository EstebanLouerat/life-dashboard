/**
 * Initial backlog from references/modules.md: every item listed after
 * "Missing:", "Next:" or "Later:" in a module's section becomes one issue,
 * tagged with that module. Pure: the import script does the reading and the
 * GitHub calls.
 */

export type ImportedItem = { title: string; module: string; description: string };

const LIST = /\b(Missing|Next|Later):\s*(.+?)\.(?:\s|$)/g;

/** Module slug of a section heading, matching the app's route folders (courses, hair-care…). */
export function moduleSlug(heading: string): string {
  const open = heading.indexOf(" (");
  const name = (open >= 0 ? heading.slice(0, open) : heading).replace(/^#+\s*/, "").trim();
  const firstPath = open >= 0 ? heading.slice(open + 2, heading.lastIndexOf(")")).split(", ")[0] : "";
  const route = /modules\/([\w-]+?)(?:\.tsx|\/|$)/.exec(firstPath);
  if (route) return route[1];
  if (/\(tabs\)\/index\.tsx$/.test(firstPath)) return "today";
  const api = /^\/api\/([\w-]+)/.exec(firstPath);
  if (api) return api[1];
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Splits "a, b (c, d), then e" on top-level commas: ["a", "b (c, d)", "e"]. */
function splitList(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of list) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((p) => p.trim().replace(/^(then|and)\s+/, "")).filter(Boolean);
}

export function parseModulesDoc(markdown: string): ImportedItem[] {
  const items: ImportedItem[] = [];
  let section: { name: string; slug: string } | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      const open = line.indexOf(" (");
      section = { name: (open >= 0 ? line.slice(3, open) : line.slice(3)).trim(), slug: moduleSlug(line) };
      continue;
    }
    if (!section) continue;
    for (const match of line.matchAll(LIST)) {
      for (const entry of splitList(match[2])) {
        items.push({
          title: `${section.name} : ${entry[0].toUpperCase()}${entry.slice(1)}`,
          module: section.slug,
          description: `Importé depuis references/modules.md (${section.name}, « ${match[1]} »).`,
        });
      }
    }
  }
  return items;
}
