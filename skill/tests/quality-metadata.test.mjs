import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { analyzeDeckSource } from "../lib/quality.mjs";
import {
  analyzeVisualSpecMetadata,
  checkAssetProvenance,
  checkVisualMetadata,
} from "../scripts/check-quality.mjs";

async function temporaryDeck(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "slide-forge-metadata-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.mkdir(path.join(directory, "assets"), { recursive: true });
  return directory;
}

test("required presenter notes skip structural slides and report missing or placeholder notes", () => {
  const issues = analyzeDeckSource({
    frontmatter: "sf_notes: required",
    slides: [
      "<!-- _class: title -->\n# Deck title",
      "<!-- _class: content -->\n# Evidence\n\n- Result",
      "<!-- _class: content -->\n# Next\n\n<!-- TODO -->",
    ],
  });
  assert.deepEqual(
    issues.filter((item) => item.code.includes("presenter-notes")).map((item) => [item.slide, item.code]),
    [
      [2, "missing-presenter-notes"],
      [3, "placeholder-presenter-notes"],
    ],
  );
});

test("chart spec metadata checks axes, ambiguous units, and series needed for a legend", () => {
  const issues = analyzeVisualSpecMetadata({
    type: "line",
    x_label: "Epoch",
    y_label: "Accuracy",
    data: [
      { x: 1, y: 0.5 },
      { x: 1, y: 0.7 },
    ],
  });
  assert.deepEqual(
    issues.map((item) => item.code),
    ["missing-chart-unit", "missing-chart-legend"],
  );

  const complete = analyzeVisualSpecMetadata({
    type: "line",
    x_label: "Epoch",
    y_label: "Accuracy",
    value_format: ".0%",
    data: [
      { x: 1, y: 0.5, series: "Baseline" },
      { x: 1, y: 0.7, series: "Proposed" },
    ],
  });
  assert.deepEqual(complete, []);
});

test("visual metadata is read from a sibling spec and from sf_chart Markdown", async (t) => {
  const directory = await temporaryDeck(t);
  await fs.writeFile(path.join(directory, "assets", "result.svg"), "<svg/>");
  await fs.writeFile(
    path.join(directory, "assets", "result.yaml"),
    "type: bar\nx_label: Method\ny_label: Score\ndata:\n  - { x: A, y: 1 }\n",
  );
  const slides = [
    "# Result\n\n![comparison chart](assets/result.svg)",
    "# External chart\n\n<!-- sf_chart: x=Method; y=Latency; series=2 -->",
  ];
  const issues = await checkVisualMetadata(path.join(directory, "slides.md"), slides);
  assert.deepEqual(
    issues.map((item) => [item.slide, item.code]),
    [
      [1, "missing-chart-unit"],
      [2, "missing-chart-unit"],
      [2, "missing-chart-legend"],
    ],
  );
});

test("structured decks require provenance and verify a recorded asset hash", async (t) => {
  const directory = await temporaryDeck(t);
  const asset = path.join(directory, "assets", "photo.png");
  const bytes = Buffer.from("local test image");
  await fs.writeFile(asset, bytes);
  await fs.writeFile(path.join(directory, "manifest.json"), '{"schema_version":1,"files":[]}\n');
  const slides = ["# Photo\n\n![documented photo](assets/photo.png)"];

  const missing = await checkAssetProvenance(path.join(directory, "slides.md"), slides);
  assert.equal(missing[0]?.code, "missing-asset-provenance");

  await fs.mkdir(path.join(directory, "sources"), { recursive: true });
  const record = {
    schema_version: 1,
    assets: [{
      deck_path: "assets/photo.png",
      author: "Example Author",
      source_url: "https://example.com/source",
      license: "CC BY 4.0",
      license_url: "https://creativecommons.org/licenses/by/4.0/",
      acquired_at: "2026-07-13",
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    }],
  };
  await fs.writeFile(path.join(directory, "sources", "assets.json"), `${JSON.stringify(record)}\n`);
  assert.deepEqual(
    await checkAssetProvenance(path.join(directory, "slides.md"), slides),
    [],
  );

  record.assets[0].sha256 = "0".repeat(64);
  await fs.writeFile(path.join(directory, "sources", "assets.json"), `${JSON.stringify(record)}\n`);
  const changed = await checkAssetProvenance(path.join(directory, "slides.md"), slides);
  assert.equal(changed[0]?.code, "asset-provenance-hash");
});

test("metadata sidecars that escape through a symlink are not read", async (t) => {
  const directory = await temporaryDeck(t);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "slide-forge-metadata-outside-"));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.writeFile(path.join(directory, "assets", "chart.svg"), "<svg/>");
  await fs.writeFile(path.join(outside, "chart.yaml"), "type: bar\nx_label: Leaked\ny_label: Value\n");
  await fs.symlink(path.join(outside, "chart.yaml"), path.join(directory, "assets", "chart.yaml"));
  const issues = await checkVisualMetadata(
    path.join(directory, "slides.md"),
    ["# Chart\n\n![chart](assets/chart.svg)"],
  );
  assert.equal(issues[0]?.code, "visual-spec-outside-deck");
});
