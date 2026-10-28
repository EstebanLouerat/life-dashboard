import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { moduleSlug, parseModulesDoc } from "./backlogImport.ts";

describe("moduleSlug", () => {
  it("uses the route folder or file of the module", () => {
    assert.equal(moduleSlug("## Groceries (src/app/(tabs)/modules/courses.tsx, /api/groceries)"), "courses");
    assert.equal(moduleSlug("## Hair care (src/app/(tabs)/modules/hair-care/, lib/stock.ts)"), "hair-care");
    assert.equal(moduleSlug("## Today (src/app/(tabs)/index.tsx)"), "today");
    assert.equal(moduleSlug("## Apartment search (/api/apartments)"), "apartments");
    assert.equal(moduleSlug("## Portfolio / crypto (later)"), "portfolio-crypto");
  });
});

describe("parseModulesDoc", () => {
  const doc = [
    "# Modules",
    "## Groceries (src/app/(tabs)/modules/courses.tsx, /api/groceries)",
    "Status: generation done. Missing: pantry inventory, price table UI, receipt scan.",
    "## Apartment search (/api/apartments)",
    "Status: placeholder. Next: Gmail API (read-only, in the API), then a list screen.",
    "## Hair care (src/app/(tabs)/modules/hair-care/)",
    "Phase 2 done. Later: automatic alignment score, PDF export for the dermatologist.",
  ].join("\n");

  it("turns every Missing / Next / Later item into one issue of its module", () => {
    const items = parseModulesDoc(doc);
    assert.deepEqual(
      items.map((i) => [i.module, i.title]),
      [
        ["courses", "Groceries : Pantry inventory"],
        ["courses", "Groceries : Price table UI"],
        ["courses", "Groceries : Receipt scan"],
        ["apartments", "Apartment search : Gmail API (read-only, in the API)"],
        ["apartments", "Apartment search : A list screen"],
        ["hair-care", "Hair care : Automatic alignment score"],
        ["hair-care", "Hair care : PDF export for the dermatologist"],
      ],
    );
    assert.match(items[0].description, /Missing/);
  });
});
