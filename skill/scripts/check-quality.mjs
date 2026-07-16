#!/usr/bin/env node
/*
 * check-quality.mjs — Markdownと任意のビルド済みHTMLを検査する。
 *
 * node scripts/check-quality.mjs slides.md [slides.html] [--json] [--strict]
 *   error があれば終了コード1。--strict時はwarningでも1。
 */

import crypto from "node:crypto";
import { access, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as yaml from "js-yaml";
import puppeteer from "puppeteer";
import { inspectRenderedSlides } from "../lib/browser-quality.mjs";
import { parseDeck } from "../webui/lib/deck.mjs";
import { analyzeDeckSource, imageRefs, summarizeIssues } from "../lib/quality.mjs";

const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHART_TYPES = new Set(["bar", "line", "scatter", "area", "heatmap"]);
const PROVENANCE_FIELDS = [
  "author",
  "source_url",
  "license",
  "license_url",
  "acquired_at",
  "sha256",
];
const AMBIGUOUS_UNIT_LABEL = /(?:^|\b)(?:value|score|rate|accuracy|precision|recall|cost|latency|duration|time|size|distance|throughput|temperature|memory|energy)(?:\b|$)|(?:値|スコア|率|精度|コスト|遅延|時間|サイズ|距離|温度|メモリ|エネルギー)/i;
const UNIT_MARKER = /[%‰°℃℉$€£¥￥]|\([^()]+\)|\[[^\]]+\]|\b(?:ms|s|min|h|hz|kb|mb|gb|tb|px|pt|usd|jpy|eur|w|kw|mw|m|cm|mm|km|kg|g|mol|db|fps|bps)\b|\//i;

function qualityIssue(slide, severity, code, message) {
  return { slide, severity, code, message };
}

function cleanReference(reference) {
  const clean = String(reference).split(/[?#]/, 1)[0];
  try {
    return decodeURIComponent(clean);
  } catch {
    return clean;
  }
}

function resolveInsideDeck(base, reference) {
  const clean = cleanReference(reference);
  if (
    path.isAbsolute(clean) ||
    clean.split(/[\\/]+/).includes("..") ||
    /^[a-z][a-z\d+.-]*:/i.test(clean)
  ) {
    return null;
  }
  const file = path.resolve(base, clean);
  return file === base || file.startsWith(`${base}${path.sep}`) ? file : null;
}

function deckPath(base, file) {
  return path.relative(base, file).split(path.sep).join("/");
}

async function confinedRealpath(base, file) {
  try {
    const [realBase, realFile] = await Promise.all([realpath(base), realpath(file)]);
    const relative = path.relative(realBase, realFile);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      return null;
    }
    return realFile;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function optionalDeckText(base, file) {
  if (!(await exists(file))) return { text: null, outside: false };
  const confined = await confinedRealpath(base, file);
  if (!confined) return { text: null, outside: true };
  return { text: await readFile(confined, "utf8"), outside: false };
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function fileSha256(file) {
  return crypto.createHash("sha256").update(await readFile(file)).digest("hex");
}

async function isVisualSpecSidecar(base, file) {
  const confined = await confinedRealpath(base, file);
  if (!confined) return false;
  try {
    const source = await readFile(confined, "utf8");
    const value = path.extname(file).toLowerCase() === ".json" ? JSON.parse(source) : yaml.load(source);
    return Boolean(
      value &&
      typeof value === "object" &&
      typeof value.type === "string" &&
      value.data !== undefined &&
      typeof value.alt === "string" &&
      value.alt.trim(),
    );
  } catch {
    return false;
  }
}

function sidecarCandidates(file) {
  const extension = path.extname(file);
  const base = extension ? file.slice(0, -extension.length) : file;
  return [
    `${base}.prompt.md`,
    `${base}.yaml`,
    `${base}.yml`,
    `${base}.json`,
  ];
}

function frontmatterRequires(frontmatter, key) {
  const pattern = new RegExp(`^\\s*${key}\\s*:\\s*["']?required["']?\\s*(?:#.*)?$`, "im");
  return pattern.test(frontmatter ?? "");
}

export function visualSpecRefs(raw) {
  return [...raw.matchAll(/<!--\s*sf_visual_spec\s*:\s*([^\s>]+)\s*-->/gi)]
    .map((match) => match[1].trim());
}

export function chartMetadataBlocks(raw) {
  return [...raw.matchAll(/<!--\s*sf_chart\s*:\s*([\s\S]*?)-->/gi)].map((match) =>
    Object.fromEntries(
      match[1]
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const separator = part.indexOf("=");
          return separator < 0
            ? [part.toLowerCase(), ""]
            : [part.slice(0, separator).trim().toLowerCase(), part.slice(separator + 1).trim()];
        }),
    ),
  );
}

function labelHasUnit(label, format = "") {
  return UNIT_MARKER.test(String(label)) || /[%$€£¥￥]/.test(String(format));
}

/** Check metadata from a render-visual YAML/JSON object without rendering it. */
export function analyzeVisualSpecMetadata(spec, slide = 1, label = "visual spec") {
  if (!spec || typeof spec !== "object" || !CHART_TYPES.has(spec.type)) return [];
  const issues = [];
  const requiredAxes = spec.type === "heatmap"
    ? ["x_label", "y_label", "value_label"]
    : ["x_label", "y_label"];
  const missingAxes = requiredAxes.filter((key) => !String(spec[key] ?? "").trim());
  if (missingAxes.length) {
    issues.push(
      qualityIssue(
        slide,
        "warning",
        "missing-chart-axis",
        `${label}: 軸・値ラベルがありません (${missingAxes.join(", ")})`,
      ),
    );
  }

  const quantitativeLabels = spec.type === "heatmap"
    ? [[spec.value_label, spec.value_format]]
    : [[spec.y_label, spec.value_format]];
  if (spec.type === "scatter") quantitativeLabels.push([spec.x_label, spec.x_format]);
  for (const [axisLabel, format] of quantitativeLabels) {
    if (axisLabel && AMBIGUOUS_UNIT_LABEL.test(axisLabel) && !labelHasUnit(axisLabel, format)) {
      issues.push(
        qualityIssue(
          slide,
          "warning",
          "missing-chart-unit",
          `${label}: 「${axisLabel}」の単位または表示形式が不明です`,
        ),
      );
    }
  }

  if (Array.isArray(spec.data)) {
    const withSeries = spec.data.filter(
      (row) => row?.series !== undefined && row?.series !== null && String(row.series).trim(),
    );
    const distinctSeries = new Set(withSeries.map((row) => String(row.series)));
    if (withSeries.length > 0 && withSeries.length !== spec.data.length) {
      issues.push(
        qualityIssue(
          slide,
          "warning",
          "incomplete-chart-legend",
          `${label}: series が一部の行にしかなく、凡例が不完全になります`,
        ),
      );
    }
    if (withSeries.length === 0 && ["bar", "line", "area"].includes(spec.type)) {
      const seen = new Set();
      const repeatedX = spec.data.some((row) => {
        const key = JSON.stringify(row?.x);
        if (seen.has(key)) return true;
        seen.add(key);
        return false;
      });
      if (repeatedX) {
        issues.push(
          qualityIssue(
            slide,
            "warning",
            "missing-chart-legend",
            `${label}: 同じx値に複数系列があります。series名を付けて凡例を生成してください`,
          ),
        );
      }
    }
    if (
      distinctSeries.size > 1 &&
      [...distinctSeries].some((value) => /^(?:series|group)\s*\d*$/i.test(value))
    ) {
      issues.push(
        qualityIssue(
          slide,
          "warning",
          "placeholder-chart-legend",
          `${label}: 凡例名が汎用プレースホルダーのままです`,
        ),
      );
    }
  }
  return issues;
}

function analyzeMarkdownChartMetadata(metadata, slide) {
  const issues = [];
  const missing = ["x", "y"].filter((key) => !metadata[key]);
  if (missing.length) {
    issues.push(
      qualityIssue(
        slide,
        "warning",
        "missing-chart-axis",
        `sf_chart: ${missing.join(", ")} ラベルがありません`,
      ),
    );
  }
  if (metadata.y && AMBIGUOUS_UNIT_LABEL.test(metadata.y) && !labelHasUnit(metadata.y, metadata.unit)) {
    issues.push(
      qualityIssue(
        slide,
        "warning",
        "missing-chart-unit",
        `sf_chart: 「${metadata.y}」の単位が不明です`,
      ),
    );
  }
  const seriesCount = Number.parseInt(metadata.series ?? "1", 10);
  if (Number.isFinite(seriesCount) && seriesCount > 1 && !metadata.legend) {
    issues.push(
      qualityIssue(
        slide,
        "warning",
        "missing-chart-legend",
        "sf_chart: 複数系列ですが凡例名がありません",
      ),
    );
  }
  return issues;
}

export async function checkAssetFiles(markdownPath, slides) {
  const base = path.dirname(path.resolve(markdownPath));
  const realBase = await realpath(base);
  const issues = [];
  for (const [index, raw] of slides.entries()) {
    for (const ref of imageRefs(raw)) {
      if (/^(?:https?:|data:)/i.test(ref.src)) continue;
      const clean = ref.src.split(/[?#]/, 1)[0];
      let decoded;
      try {
        decoded = decodeURIComponent(clean);
      } catch {
        decoded = clean;
      }
      if (
        path.isAbsolute(decoded)
        || decoded.split(/[\\/]+/).includes("..")
        || /^[a-z][a-z\d+.-]*:/i.test(decoded)
      ) {
        issues.push({
          slide: index + 1,
          severity: "error",
          code: "asset-outside-deck",
          message: `デッキ外または未対応URLの画像は使えません: ${ref.src}`,
        });
        continue;
      }
      const candidate = path.resolve(base, decoded);
      try {
        await access(candidate);
        const realCandidate = await realpath(candidate);
        const relative = path.relative(realBase, realCandidate);
        if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
          issues.push({
            slide: index + 1,
            severity: "error",
            code: "asset-outside-deck",
            message: `画像がデッキ外を参照しています: ${ref.src}`,
          });
        }
      } catch {
        issues.push({
          slide: index + 1,
          severity: "error",
          code: "missing-asset",
          message: `画像ファイルがありません: ${ref.src}`,
        });
      }
    }
  }
  return issues;
}

function localAssetUses(base, slides) {
  const uses = new Map();
  slides.forEach((raw, index) => {
    for (const ref of imageRefs(raw)) {
      if (/^(?:https?:|data:)/i.test(ref.src)) continue;
      const file = resolveInsideDeck(base, ref.src);
      if (file && !uses.has(file)) uses.set(file, { slide: index + 1, ref });
    }
  });
  return uses;
}

/**
 * Verify source records for structured decks. Standalone Markdown stays opt-in;
 * an init-created manifest or sources/assets.json enables the policy automatically.
 */
export async function checkAssetProvenance(
  markdownPath,
  slides,
  { required = undefined } = {},
) {
  const base = path.dirname(path.resolve(markdownPath));
  const manifestPath = path.join(base, "manifest.json");
  const sourcePath = path.join(base, "sources", "assets.json");
  const [manifestFile, sourceFile] = await Promise.all([
    optionalDeckText(base, manifestPath),
    optionalDeckText(base, sourcePath),
  ]);
  const manifestText = manifestFile.text;
  const sourceText = sourceFile.text;
  const policyActive = required ?? (manifestText !== null || sourceText !== null);
  if (!policyActive && sourceText === null && !manifestFile.outside && !sourceFile.outside) return [];

  const issues = [];
  if (manifestFile.outside) {
    issues.push(qualityIssue(1, "error", "manifest-outside-deck", "manifest.json がデッキ外を参照しています"));
  }
  if (sourceFile.outside) {
    issues.push(
      qualityIssue(1, "error", "provenance-outside-deck", "sources/assets.json がデッキ外を参照しています"),
    );
  }
  const uses = localAssetUses(base, slides);
  let manifestFiles = new Set();
  if (manifestText !== null) {
    try {
      const manifest = JSON.parse(manifestText);
      manifestFiles = new Set(
        (Array.isArray(manifest.files) ? manifest.files : [])
          .filter((item) => typeof item === "string")
          .map((item) => item.replaceAll("\\", "/")),
      );
    } catch {
      issues.push(qualityIssue(1, "error", "invalid-deck-manifest", "manifest.json を解析できません"));
    }
  }

  let sourceRecords = [];
  if (sourceText !== null) {
    try {
      const sourceManifest = JSON.parse(sourceText);
      if (sourceManifest.schema_version !== 1 || !Array.isArray(sourceManifest.assets)) {
        throw new Error("unsupported schema");
      }
      sourceRecords = sourceManifest.assets;
    } catch {
      issues.push(
        qualityIssue(1, "error", "invalid-asset-provenance", "sources/assets.json の形式が不正です"),
      );
    }
  }
  const recordsByPath = new Map(
    sourceRecords
      .filter((record) => typeof record?.deck_path === "string")
      .map((record) => [record.deck_path.replaceAll("\\", "/"), record]),
  );

  let bundledHashes = new Set();
  try {
    const bundled = JSON.parse(await readFile(path.join(SKILL_ROOT, "assets", "assets.json"), "utf8"));
    bundledHashes = new Set((bundled.assets ?? []).map((asset) => asset.sha256).filter(Boolean));
  } catch {
    // A distributed skill may intentionally omit the optional asset pack.
  }

  for (const [file, { slide, ref }] of uses) {
    if (!(await exists(file))) continue;
    const confinedFile = await confinedRealpath(base, file);
    if (!confinedFile) continue; // checkAssetFiles reports the unsafe reference once.
    const relative = deckPath(base, file);
    const record = recordsByPath.get(relative);
    const hash = await fileSha256(confinedFile);
    if (record) {
      const missing = PROVENANCE_FIELDS.filter((field) => !String(record[field] ?? "").trim());
      if (missing.length) {
        issues.push(
          qualityIssue(
            slide,
            "error",
            "incomplete-asset-provenance",
            `${ref.src}: source record に ${missing.join(", ")} がありません`,
          ),
        );
      }
      const invalid = [];
      if (record.source_url && !/^https?:\/\//i.test(record.source_url)) invalid.push("source_url");
      if (record.license_url && !/^https?:\/\//i.test(record.license_url)) invalid.push("license_url");
      if (record.acquired_at && !/^\d{4}-\d{2}-\d{2}$/.test(record.acquired_at)) invalid.push("acquired_at");
      if (record.sha256 && !/^[a-f0-9]{64}$/i.test(record.sha256)) invalid.push("sha256");
      if (invalid.length) {
        issues.push(
          qualityIssue(
            slide,
            "error",
            "invalid-asset-provenance-fields",
            `${ref.src}: source record の ${invalid.join(", ")} が不正です`,
          ),
        );
      }
      if (record.sha256 && record.sha256 !== hash) {
        issues.push(
          qualityIssue(
            slide,
            "error",
            "asset-provenance-hash",
            `${ref.src}: source record のSHA-256とファイルが一致しません`,
          ),
        );
      }
      continue;
    }

    const sidecars = sidecarCandidates(file);
    const existingSidecars = [];
    for (const candidate of sidecars) {
      if (await exists(candidate)) {
        if (await confinedRealpath(base, candidate)) {
          existingSidecars.push(candidate);
        } else {
          issues.push(
            qualityIssue(
              slide,
              "error",
              "provenance-sidecar-outside-deck",
              `${deckPath(base, candidate)} がデッキ外を参照しています`,
            ),
          );
        }
      }
    }
    const prompt = existingSidecars.find((candidate) => candidate.endsWith(".prompt.md"));
    if (prompt) {
      const promptText = await readFile(await confinedRealpath(base, prompt), "utf8");
      if (!/(?:^|\n)\s*(?:alt|代替テキスト)\s*[:：]/i.test(promptText) || !/\d{4}-\d{2}-\d{2}/.test(promptText)) {
        issues.push(
          qualityIssue(
            slide,
            "warning",
            "incomplete-imagegen-record",
            `${deckPath(base, prompt)} に生成日とaltを記録してください`,
          ),
        );
      }
      continue;
    }
    let hasVisualSpec = false;
    for (const candidate of existingSidecars.filter((item) => /\.(?:ya?ml|json)$/i.test(item))) {
      if (await isVisualSpecSidecar(base, candidate)) {
        hasVisualSpec = true;
        break;
      }
    }
    if (manifestFiles.has(relative) || bundledHashes.has(hash) || hasVisualSpec) {
      continue;
    }
    issues.push(
      qualityIssue(
        slide,
        "warning",
        "missing-asset-provenance",
        `${ref.src}: sources/assets.json、生成仕様、またはprompt記録がありません`,
      ),
    );
  }
  return issues;
}

function analyzeGeneratedSvgMetadata(svg, slide, label) {
  const type = svg.match(/\bdata-sf-visual=["']([^"']+)["']/i)?.[1];
  if (!CHART_TYPES.has(type)) return [];
  const issues = [];
  const axisLabel = (axis) => {
    const match = svg.match(new RegExp(`aria-label="${axis}-axis\\s+([^"]+)"`, "i"));
    return match?.[1] ?? "";
  };
  const xAxis = axisLabel("X");
  const yAxis = axisLabel("Y");
  const missing = [];
  if (!/^titled\s+/i.test(xAxis)) missing.push("x_label");
  if (!/^titled\s+/i.test(yAxis)) missing.push("y_label");
  if (missing.length) {
    issues.push(
      qualityIssue(
        slide,
        "warning",
        "missing-chart-axis",
        `${label}: 生成SVGの軸ラベルがありません (${missing.join(", ")})`,
      ),
    );
  }
  const yLabel = yAxis.match(/^titled\s+'([^']+)'/i)?.[1];
  if (yLabel && AMBIGUOUS_UNIT_LABEL.test(yLabel) && !labelHasUnit(yAxis)) {
    issues.push(
      qualityIssue(
        slide,
        "warning",
        "missing-chart-unit",
        `${label}: 「${yLabel}」の単位が不明です`,
      ),
    );
  }
  return issues;
}

export async function checkVisualMetadata(markdownPath, slides) {
  const base = path.dirname(path.resolve(markdownPath));
  const issues = [];
  for (const [index, raw] of slides.entries()) {
    const slide = index + 1;
    for (const metadata of chartMetadataBlocks(raw)) {
      issues.push(...analyzeMarkdownChartMetadata(metadata, slide));
    }

    const explicit = visualSpecRefs(raw);
    const specFiles = new Set();
    for (const reference of explicit) {
      const file = resolveInsideDeck(base, reference);
      if (!file) {
        issues.push(
          qualityIssue(slide, "error", "visual-spec-outside-deck", `図表仕様がデッキ外です: ${reference}`),
        );
      } else if (!(await exists(file))) {
        issues.push(
          qualityIssue(slide, "error", "missing-visual-spec", `図表仕様がありません: ${reference}`),
        );
      } else if (!(await confinedRealpath(base, file))) {
        issues.push(
          qualityIssue(slide, "error", "visual-spec-outside-deck", `図表仕様がデッキ外です: ${reference}`),
        );
      } else {
        specFiles.add(file);
      }
    }

    const svgFilesWithoutSpecs = [];
    for (const ref of imageRefs(raw)) {
      if (/^(?:https?:|data:)/i.test(ref.src)) continue;
      const image = resolveInsideDeck(base, ref.src);
      if (!image || !(await exists(image))) continue;
      if (!(await confinedRealpath(base, image))) continue; // checkAssetFiles reports it.
      const candidates = sidecarCandidates(image).filter((candidate) => /\.(?:ya?ml|json)$/i.test(candidate));
      let found = false;
      for (const candidate of candidates) {
        if (await exists(candidate)) {
          if (await confinedRealpath(base, candidate)) {
            specFiles.add(candidate);
            found = true;
          } else {
            issues.push(
              qualityIssue(
                slide,
                "error",
                "visual-spec-outside-deck",
                `図表仕様がデッキ外です: ${deckPath(base, candidate)}`,
              ),
            );
          }
        }
      }
      if (!found && path.extname(image).toLowerCase() === ".svg") svgFilesWithoutSpecs.push(image);
    }

    for (const file of specFiles) {
      try {
        const confined = await confinedRealpath(base, file);
        if (!confined) continue;
        const source = await readFile(confined, "utf8");
        const spec = path.extname(file).toLowerCase() === ".json" ? JSON.parse(source) : yaml.load(source);
        issues.push(...analyzeVisualSpecMetadata(spec, slide, deckPath(base, file)));
      } catch (error) {
        issues.push(
          qualityIssue(
            slide,
            "error",
            "invalid-visual-spec",
            `${deckPath(base, file)} を解析できません: ${error.message}`,
          ),
        );
      }
    }
    if (specFiles.size === 0) {
      for (const file of svgFilesWithoutSpecs) {
        const confined = await confinedRealpath(base, file);
        if (!confined) continue;
        issues.push(
          ...analyzeGeneratedSvgMetadata(await readFile(confined, "utf8"), slide, deckPath(base, file)),
        );
      }
    }
  }
  return issues;
}

export async function checkRenderedHtml(htmlPath) {
  const browser = await puppeteer.launch();
  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const protocol = new URL(request.url()).protocol;
      if (["file:", "data:", "blob:", "about:"].includes(protocol)) request.continue();
      else request.abort("blockedbyclient");
    });
    await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(path.resolve(htmlPath)).href, { waitUntil: "networkidle0", timeout: 30_000 });
    return await page.evaluate(inspectRenderedSlides);
  } finally {
    await browser.close();
  }
}

export async function checkQuality(
  markdownPath,
  htmlPath,
  { requirePresenterNotes = undefined, requireAssetProvenance = undefined } = {},
) {
  const markdown = await readFile(markdownPath, "utf8");
  const deck = parseDeck(markdown);
  const provenancePolicy = frontmatterRequires(deck.frontmatter, "sf_asset_provenance")
    ? true
    : requireAssetProvenance;
  const issues = [
    ...analyzeDeckSource(deck, { requirePresenterNotes }),
    ...(await checkAssetFiles(markdownPath, deck.slides)),
    ...(await checkAssetProvenance(markdownPath, deck.slides, { required: provenancePolicy })),
    ...(await checkVisualMetadata(markdownPath, deck.slides)),
  ];
  if (htmlPath) issues.push(...(await checkRenderedHtml(htmlPath)));
  return issues;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isCli) {
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const markdownPath = positional[0];
  const htmlPath = positional[1];
  const asJson = process.argv.includes("--json");
  const strict = process.argv.includes("--strict");
  const requirePresenterNotes = process.argv.includes("--require-notes") ? true : undefined;
  const requireAssetProvenance = process.argv.includes("--require-provenance") ? true : undefined;
  if (!markdownPath) {
    console.error(
      "usage: node scripts/check-quality.mjs <slides.md> [slides.html] [--json] [--strict] [--require-notes] [--require-provenance]",
    );
    process.exit(2);
  }
  const issues = await checkQuality(markdownPath, htmlPath, {
    requirePresenterNotes,
    requireAssetProvenance,
  });
  const summary = summarizeIssues(issues);
  if (asJson) {
    console.log(JSON.stringify({ summary, issues }, null, 2));
  } else if (!issues.length) {
    console.log("OK: 品質上の問題は見つかりませんでした");
  } else {
    console.log(`品質チェック: error ${summary.error} / warning ${summary.warning}`);
    for (const item of issues) {
      console.log(`  ${item.severity.toUpperCase()} slide ${item.slide} [${item.code}]: ${item.message}`);
    }
  }
  if (summary.error || (strict && summary.warning)) process.exitCode = 1;
}
