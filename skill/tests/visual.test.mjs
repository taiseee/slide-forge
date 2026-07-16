import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  loadVisualSpec,
  defaultVisualPath,
  renderVisual,
  renderVisualFile,
  validateVisualSpec,
} from "../scripts/render-visual.mjs";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsRoot = path.join(skillRoot, "assets");
const examplesRoot = path.join(assetsRoot, "examples");

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

test("all canonical visual examples parse and render as accessible offline SVG", { timeout: 120_000 }, async () => {
  const names = (await fs.readdir(examplesRoot))
    .filter((name) => /\.(?:json|ya?ml)$/i.test(name))
    .sort();
  assert.deepEqual(names, [
    "architecture.yaml",
    "area.yaml",
    "bar.yaml",
    "heatmap.yaml",
    "line.yaml",
    "pipeline.yaml",
    "scatter.json",
    "sequence.yaml",
  ]);

  for (const name of names) {
    const spec = await loadVisualSpec(path.join(examplesRoot, name));
    const svg = await renderVisual(spec);
    assert.match(svg, /^<svg\b/);
    assert.match(svg, /role="img"/);
    assert.match(svg, /aria-labelledby="sf-visual-title-[a-f0-9]{12} sf-visual-desc-[a-f0-9]{12}"/);
    assert.match(svg, new RegExp(`data-sf-visual="${spec.type}"`));
    assert.match(svg, new RegExp(`data-sf-theme="${spec.theme}"`));
    assert.match(svg, new RegExp(`data-sf-motion="${spec.motion}"`));
    assert.ok(svg.includes(spec.alt.replaceAll("&", "&amp;")));
    assert.doesNotMatch(svg, /(?:href|src)=["']https?:\/\//i);
    assert.doesNotMatch(svg, /<script\b/i);
  }
});

test("chart and Mermaid output are deterministic", { timeout: 60_000 }, async () => {
  for (const name of ["bar.yaml", "pipeline.yaml"]) {
    const spec = await loadVisualSpec(path.join(examplesRoot, name));
    const first = await renderVisual(spec);
    const second = await renderVisual(spec);
    assert.equal(sha256(first), sha256(second), `${name} changed between renders`);
  }
});

test("theme option overrides the spec without changing its data", async () => {
  const spec = await loadVisualSpec(path.join(examplesRoot, "bar.yaml"));
  const original = structuredClone(spec);
  const svg = await renderVisual(spec, { theme: "soft" });
  assert.match(svg, /data-sf-theme="soft"/);
  assert.match(svg, /#c4705c/i);
  assert.deepEqual(spec, original);
});

test("invalid specs fail before a renderer is started", () => {
  assert.throws(
    () => validateVisualSpec({ type: "pie", data: [], alt: "" }),
    /type must be one of/,
  );
  assert.throws(
    () =>
      validateVisualSpec({
        type: "pipeline",
        alt: "Broken edge",
        data: {
          nodes: [{ id: "known", label: "Known" }],
          edges: [{ from: "known", to: "missing" }],
        },
      }),
    /must reference existing/,
  );
  assert.throws(
    () =>
      validateVisualSpec({
        type: "scatter",
        alt: "Bad scatter",
        data: [{ x: "not numeric", y: 1 }],
      }),
    /requires numeric x\/y/,
  );
  assert.throws(
    () => validateVisualSpec({
      type: "pipeline",
      alt: "Invalid direction",
      data: { direction: "LR\nmalicious", nodes: [{ id: "a", label: "A" }], edges: [] },
      unknown_field: true,
    }),
    /must be equal to one of the allowed values|must NOT have additional properties/,
  );
  assert.throws(
    () => validateVisualSpec({ type: "bar", alt: "Unknown motion", data: [{ x: "A", y: 1 }], motion: "spin" }),
    /motion must be one of|must be equal to one of the allowed values/,
  );
});

test("draw motion marks generated SVG paths for the rich runtime", async () => {
  const spec = await loadVisualSpec(path.join(examplesRoot, "line.yaml"));
  const svg = await renderVisual(spec);
  assert.match(svg, /data-sf-motion="draw"/);
  assert.match(svg, /<(?:path|line|polyline|polygon)\b[^>]*\bdata-sf-draw\b/);
});

test("highlight motion marks exact chart targets and falls back to the whole visual", async () => {
  const targeted = await renderVisual({
    type: "bar",
    alt: "B is highlighted",
    data: [{ x: "A", y: 1 }, { x: "B", y: 2 }],
    highlight: "B",
    motion: "highlight",
  });
  assert.match(targeted, /data-sf-motion="highlight"/);
  assert.match(targeted, /data-sf-highlight="target"/);
  assert.match(targeted, /class="[^"]*sf_highlight_marks[^"]*"/);

  const fallback = await renderVisual({
    type: "scatter",
    alt: "The whole scatter plot receives emphasis",
    data: [{ x: 1, y: 2 }],
    motion: "highlight",
  });
  assert.match(fallback, /<svg data-sf-highlight="whole-visual"/);
});

test("visual file output never defaults to or aliases the source spec", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "slide-forge-visual-output-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const input = path.join(directory, "SPEC");
  await fs.writeFile(input, JSON.stringify({ type: "bar", alt: "One bar", data: [{ x: "A", y: 1 }] }));
  assert.equal(defaultVisualPath(input), `${input}.svg`);
  await assert.rejects(
    renderVisualFile({ input, output: input }),
    /must not overwrite the source spec/,
  );

  const caseAlias = path.join(directory, "spec");
  try {
    await fs.realpath(caseAlias);
  } catch {
    return; // case-sensitive filesystem: the alias is a distinct, non-existing path.
  }
  await assert.rejects(
    renderVisualFile({ input, output: caseAlias }),
    /must not overwrite the source spec/,
  );
});

test("asset manifest is one-to-one, complete, and hash-verified", async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(assetsRoot, "assets.json"), "utf8"));
  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.generated_at, "2026-07-15");
  assert.equal(manifest.assets.length, 91);

  const ids = new Set();
  const paths = new Set();
  const counts = { icon: 0, photo: 0, background: 0 };
  for (const asset of manifest.assets) {
    assert.match(asset.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(!ids.has(asset.id), `duplicate id: ${asset.id}`);
    assert.ok(!paths.has(asset.path), `duplicate path: ${asset.path}`);
    ids.add(asset.id);
    paths.add(asset.path);
    counts[asset.kind] += 1;

    assert.match(asset.source_url, /^https:\/\//);
    assert.match(asset.license_url, /^https:\/\//);
    assert.match(asset.acquired_at, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(asset.alt.length > 0);
    assert.ok(asset.tags.length > 0);
    assert.ok(Array.isArray(asset.recommended_layouts));
    assert.ok(asset.focal_point.x >= 0 && asset.focal_point.x <= 1);
    assert.ok(asset.focal_point.y >= 0 && asset.focal_point.y <= 1);

    const file = await fs.readFile(path.join(assetsRoot, asset.path));
    assert.equal(sha256(file), asset.sha256, `${asset.path} hash mismatch`);
  }
  assert.deepEqual(counts, { icon: 63, photo: 12, background: 16 });

  const diskFiles = [];
  for (const directory of ["icons", "photos", "backgrounds"]) {
    for (const name of await fs.readdir(path.join(assetsRoot, directory))) {
      diskFiles.push(`${directory}/${name}`);
    }
  }
  assert.deepEqual([...paths].sort(), diskFiles.sort());
});

test("visual and asset JSON schemas are valid JSON documents", async () => {
  for (const name of ["visual.schema.json", "assets.schema.json"]) {
    const schema = JSON.parse(await fs.readFile(path.join(assetsRoot, name), "utf8"));
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.type, "object");
  }
});
