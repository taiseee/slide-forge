#!/usr/bin/env node
/*
 * Build every catalog recipe and run the non-visual regression checks.
 *
 * Default: offline HTML, overflow, and quality checks.
 * --full: additionally export PDF. Kept out of `npm test` because
 * Chromium-backed exports are intentionally an integration gate.
 */

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { checkOverflow } from "./check-overflow.mjs";
import { checkQuality } from "./check-quality.mjs";
import { exportDeck } from "./export.mjs";
import { initializeDeck } from "./init.mjs";
import { parseDeck } from "../webui/lib/deck.mjs";

const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY_ROOT = path.resolve(SKILL_ROOT, "..");
const MARP_BIN = path.join(SKILL_ROOT, "node_modules", ".bin", "marp");
const execFileP = promisify(execFile);

export const RECIPE_REGRESSION_CASES = Object.freeze([
  "research-progress",
  "paper-talk",
  "conference-talk",
  "business-proposal",
  "executive-review",
]);

export const VISUAL_SKIN_CASES = Object.freeze([
  "research",
  "business",
  "lecture",
  "soft",
]);

export function regressionFormats(full = false) {
  return full ? ["html", "pdf"] : ["html"];
}

async function assertOutput(format, file) {
  const info = await stat(file);
  if (info.size === 0) throw new Error(`${format} export is empty: ${file}`);
  const head = await readFile(file);
  if (format === "html" && !/^\s*<!doctype html>/i.test(head.subarray(0, 200).toString("utf8"))) {
    throw new Error(`HTML signature is invalid: ${file}`);
  }
  if (format === "pdf" && head.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error(`PDF signature is invalid: ${file}`);
  }
}

async function renderPngDeck(markdown, outputDirectory) {
  await mkdir(outputDirectory, { recursive: true });
  const output = path.join(outputDirectory, "slide.png");
  const running = execFileP(
    MARP_BIN,
    [
      "--theme-set",
      path.join(SKILL_ROOT, "theme"),
      "--html",
      "--allow-local-files",
      "--images",
      "png",
      markdown,
      "--output",
      output,
    ],
    {
      cwd: path.dirname(markdown),
      timeout: 240_000,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  running.child.stdin?.end();
  await running;
  const pngs = (await readdir(outputDirectory))
    .filter((name) => name.endsWith(".png"))
    .sort()
    .map((name) => path.join(outputDirectory, name));
  const expected = parseDeck(await readFile(markdown, "utf8")).slides.length;
  if (pngs.length !== expected) {
    throw new Error(`PNG page count mismatch for ${markdown}: expected ${expected}, got ${pngs.length}`);
  }
  for (const png of pngs) {
    const signature = (await readFile(png)).subarray(0, 8).toString("hex");
    if (signature !== "89504e470d0a1a0a") throw new Error(`PNG signature is invalid: ${png}`);
  }
  return pngs;
}

export async function createRegressionRoot(parent = null) {
  const base = parent ? path.resolve(parent) : os.tmpdir();
  await mkdir(base, { recursive: true });
  return mkdtemp(path.join(base, "slide-forge-recipes-"));
}

export async function runRecipeRegression({ outputRoot, full = false, strict = false, visual = false }) {
  const reports = [];
  for (const [index, recipe] of RECIPE_REGRESSION_CASES.entries()) {
    const topic = recipe.replaceAll("-", "_");
    const deckRoot = initializeDeck(
      [
        "--topic",
        topic,
        "--title",
        `Regression: ${recipe}`,
        "--recipe",
        recipe,
        "--root",
        ".",
        "--created-at",
        `2026-07-13_12${String(index).padStart(2, "0")}00`,
      ],
      { cwd: outputRoot, skillRoot: SKILL_ROOT },
    );
    const markdown = path.join(deckRoot, "slides.md");
    const build = path.join(deckRoot, "build");
    await mkdir(build, { recursive: true });

    const outputs = {};
    for (const format of regressionFormats(full)) {
      const output = path.join(build, `slides.${format}`);
      await exportDeck({ input: markdown, format, output, root: SKILL_ROOT });
      await assertOutput(format, output);
      outputs[format] = output;
    }
    if (visual) outputs.png = await renderPngDeck(markdown, path.join(build, "png"));

    const [quality, overflow] = await Promise.all([
      checkQuality(markdown, outputs.html, { requirePresenterNotes: true }),
      checkOverflow(outputs.html),
    ]);
    const errors = quality.filter((item) => item.severity === "error");
    const missingNotes = quality.filter((item) => item.code === "missing-presenter-notes");
    if (overflow.length || errors.length || missingNotes.length || (strict && quality.length)) {
      const summary = [
        `${overflow.length} overflow`,
        `${errors.length} quality errors`,
        `${quality.length - errors.length} warnings`,
      ].join(", ");
      throw new Error(`${recipe} regression failed: ${summary}`);
    }
    reports.push({ recipe, deckRoot, outputs, quality, overflow });
  }
  return reports;
}

export async function runSkinVisualRegression({ outputRoot }) {
  const reports = [];
  for (const skin of VISUAL_SKIN_CASES) {
    const markdown = path.join(REPOSITORY_ROOT, "examples", `demo-${skin}.md`);
    try {
      await stat(markdown);
    } catch (error) {
      if (error.code === "ENOENT") continue; // Standalone skill installs do not include repository demos.
      throw error;
    }
    const build = path.join(outputRoot, "skin-demos", skin);
    await mkdir(build, { recursive: true });
    const html = path.join(build, "slides.html");
    await exportDeck({ input: markdown, format: "html", output: html, root: SKILL_ROOT });
    const overflow = await checkOverflow(html);
    if (overflow.length) throw new Error(`${skin} demo regression failed: ${overflow.length} overflow`);
    const pngs = await renderPngDeck(markdown, path.join(build, "png"));
    reports.push({ skin, markdown, html, pngs, overflow });
  }
  return reports;
}

function parseCli(argv) {
  const options = { full: false, strict: false, visual: false, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--full") options.full = true;
    else if (value === "--strict") options.strict = true;
    else if (value === "--visual") options.visual = true;
    else if (value === "--output") {
      if (!argv[index + 1]) throw new Error("--output requires a directory");
      options.output = argv[++index];
    } else {
      throw new Error(`unknown option: ${value}`);
    }
  }
  return options;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isCli) {
  const options = parseCli(process.argv.slice(2));
  const root = await createRegressionRoot(options.output);
  try {
    const reports = await runRecipeRegression({
      outputRoot: root,
      full: options.full,
      strict: options.strict,
      visual: options.visual,
    });
    for (const report of reports) {
      console.log(
        `OK ${report.recipe}: ${Object.keys(report.outputs).join("/")}, warning ${report.quality.length}`,
      );
    }
    if (options.visual) {
      const demos = await runSkinVisualRegression({ outputRoot: root });
      for (const report of demos) console.log(`OK skin ${report.skin}: ${report.pngs.length} PNG`);
    }
    if (!options.output && !options.visual) await rm(root, { recursive: true, force: true });
    else console.log(`outputs: ${root}`);
  } catch (error) {
    console.error(`recipe regression artifacts: ${root}`);
    throw error;
  }
}
