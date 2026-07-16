import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  RECIPE_REGRESSION_CASES,
  VISUAL_SKIN_CASES,
  regressionFormats,
} from "../scripts/regress-recipes.mjs";

const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("recipe regression gate covers every catalog recipe", async () => {
  const catalog = JSON.parse(await fs.readFile(path.join(SKILL_ROOT, "catalog", "recipes.json"), "utf8"));
  assert.deepEqual(
    RECIPE_REGRESSION_CASES,
    catalog.recipes.map((recipe) => recipe.id),
  );
  assert.deepEqual(regressionFormats(false), ["html"]);
  assert.deepEqual(regressionFormats(true), ["html", "pdf"]);
  assert.deepEqual(VISUAL_SKIN_CASES, ["research", "business", "lecture", "soft"]);
});
