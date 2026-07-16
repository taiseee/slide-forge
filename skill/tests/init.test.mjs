import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  copyRecipeFiles,
  initializeDeck,
} from "../scripts/init.mjs";

const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "slide-forge-init-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("legacy initialization remains a one-slide deck", (t) => {
  const cwd = temporaryDirectory(t);
  const root = initializeDeck(
    [
      "--topic",
      "midterm_report",
      "--title",
      "中間発表",
      "--created-at",
      "2026-07-13_120000",
    ],
    { cwd, skillRoot: SKILL_ROOT },
  );

  assert.equal(
    fs.readFileSync(path.join(root, "slides.md"), "utf8"),
    `---
marp: true
theme: research
size: 16:9
paginate: true
title: "中間発表"
---

<!-- _class: title -->
<!-- _paginate: false -->

# 中間発表

`,
  );
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  assert.equal(manifest.generation, undefined);
  assert.deepEqual(manifest.files, []);
});

test("frontmatter safely quotes titles containing YAML syntax", (t) => {
  const cwd = temporaryDirectory(t);
  const root = initializeDeck(
    [
      "--topic",
      "yaml_title",
      "--title",
      "Finding: A # note",
      "--created-at",
      "2026-07-13_120002",
    ],
    { cwd, skillRoot: SKILL_ROOT },
  );
  const slides = fs.readFileSync(path.join(root, "slides.md"), "utf8");
  assert.match(slides, /^title: "Finding: A # note"$/m);
});

test("paper-talk recipe composes reusable templates and records provenance", (t) => {
  const cwd = temporaryDirectory(t);
  const root = initializeDeck(
    [
      "--topic",
      "paper_review",
      "--title",
      "論文紹介",
      "--recipe",
      "paper-talk",
      "--theme",
      "soft",
      "--created-at",
      "2026-07-13_120001",
    ],
    { cwd, skillRoot: SKILL_ROOT },
  );

  const slides = fs.readFileSync(path.join(root, "slides.md"), "utf8");
  assert.match(slides, /^---\nmarp: true\ntheme: soft\n/);
  assert.match(slides, /# Research Question/);
  assert.match(slides, /# 再現性情報/);
  assert.match(slides, /1\. \*\*問題設定とResearch Gap\*\*/);
  assert.doesNotMatch(slides, /\{\{[^}]+\}\}/);
  assert.equal((slides.match(/<!-- _class:/g) ?? []).length, 19);

  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  assert.equal(manifest.deck.theme, "soft");
  assert.equal(manifest.generation.recipe, "paper-talk");
  assert.equal(manifest.generation.templates.length, 19);
  assert.deepEqual(manifest.files, [
    "assets/starter/flask-conical.svg",
    "assets/starter/chart-line.svg",
    "assets/starter/file-text.svg",
    "assets/starter/main-result-placeholder.svg",
  ]);
  assert.ok(manifest.files.every((file) => fs.existsSync(path.join(root, file))));
});

test("business proposal recipe composes decision-oriented templates and assets", (t) => {
  const cwd = temporaryDirectory(t);
  const root = initializeDeck(
    [
      "--topic",
      "customer_proposal",
      "--title",
      "顧客向け事業提案",
      "--recipe",
      "business-proposal",
      "--created-at",
      "2026-07-13_120003",
    ],
    { cwd, skillRoot: SKILL_ROOT },
  );

  const slides = fs.readFileSync(path.join(root, "slides.md"), "utf8");
  assert.match(slides, /^---\nmarp: true\ntheme: business\n/);
  assert.match(slides, /# 解くべき事業課題/);
  assert.match(slides, /# 市場機会/);
  assert.match(slides, /# ビジネスモデル/);
  assert.match(slides, /1\. \*\*顧客課題と提供価値\*\*/);
  assert.equal((slides.match(/<!-- _class:/g) ?? []).length, 17);

  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  assert.equal(manifest.deck.theme, "business");
  assert.equal(manifest.generation.recipe, "business-proposal");
  assert.equal(manifest.generation.templates.length, 17);
  assert.deepEqual(manifest.files, [
    "assets/starter/business-customer.webp",
    "assets/starter/business-target.svg",
    "assets/starter/business-growth.svg",
    "assets/starter/business-workflow.svg",
  ]);
  assert.ok(manifest.files.every((file) => fs.existsSync(path.join(root, file))));
});

test("recipe copy entries support files, directories, and optional packs", (t) => {
  const temporary = temporaryDirectory(t);
  const skillRoot = path.join(temporary, "skill");
  const deckRoot = path.join(temporary, "deck");
  fs.mkdirSync(path.join(skillRoot, "packs", "research"), { recursive: true });
  fs.mkdirSync(deckRoot, { recursive: true });
  fs.writeFileSync(path.join(skillRoot, "packs", "research", "icon.svg"), "<svg/>");

  const copied = copyRecipeFiles({
    skillRoot,
    deckRoot,
    entries: [
      {
        source: "packs/research",
        destination: "assets/starter/research",
      },
      {
        source: "packs/research",
        destination: "assets/starter/research",
      },
      {
        source: "packs/not-installed",
        destination: "assets/starter/optional",
        optional: true,
      },
    ],
  });

  assert.deepEqual(copied, ["assets/starter/research"]);
  assert.equal(
    fs.readFileSync(path.join(deckRoot, "assets", "starter", "research", "icon.svg"), "utf8"),
    "<svg/>",
  );
  assert.throws(
    () =>
      copyRecipeFiles({
        skillRoot,
        deckRoot,
        entries: [{ source: "../outside", destination: "assets/outside" }],
      }),
    /escapes its root/,
  );
  assert.throws(
    () =>
      copyRecipeFiles({
        skillRoot,
        deckRoot,
        entries: [{ source: "packs/research/icon.svg", destination: "slides.md" }],
      }),
    /copy destination must start with/,
  );
});

test("unknown recipes fail with the available IDs", (t) => {
  const cwd = temporaryDirectory(t);
  assert.throws(
    () =>
      initializeDeck(
        ["--topic", "demo", "--recipe", "unknown"],
        { cwd, skillRoot: SKILL_ROOT },
      ),
    /research-progress, paper-talk, conference-talk, business-proposal, executive-review/,
  );
});

test("CLI argument mistakes fail instead of silently creating a legacy deck", (t) => {
  const cwd = temporaryDirectory(t);
  assert.throws(
    () => initializeDeck(["--topic", "demo", "--receipe", "paper-talk"], { cwd, skillRoot: SKILL_ROOT }),
    /unknown option: --receipe/,
  );
  assert.throws(
    () => initializeDeck(["--topic"], { cwd, skillRoot: SKILL_ROOT }),
    /--topic requires a value/,
  );
  assert.throws(
    () => initializeDeck(["--topic", "demo", "--topic", "again"], { cwd, skillRoot: SKILL_ROOT }),
    /--topic may be specified only once/,
  );
});

test("copy destination conflicts are rejected before any file is copied", (t) => {
  const temporary = temporaryDirectory(t);
  const skillRoot = path.join(temporary, "skill");
  const deckRoot = path.join(temporary, "deck");
  fs.mkdirSync(skillRoot, { recursive: true });
  fs.mkdirSync(deckRoot, { recursive: true });
  fs.writeFileSync(path.join(skillRoot, "first.svg"), "first");
  fs.writeFileSync(path.join(skillRoot, "second.svg"), "second");
  assert.throws(
    () => copyRecipeFiles({
      skillRoot,
      deckRoot,
      entries: [
        { source: "first.svg", destination: "assets/shared.svg" },
        { source: "second.svg", destination: "assets/shared.svg" },
      ],
    }),
    /copy destinations overlap/,
  );
  assert.ok(!fs.existsSync(path.join(deckRoot, "assets", "shared.svg")));
});

test("catalog references are complete, unique, and resolvable", () => {
  const layouts = JSON.parse(
    fs.readFileSync(path.join(SKILL_ROOT, "catalog", "layouts.json"), "utf8"),
  );
  const templates = JSON.parse(
    fs.readFileSync(path.join(SKILL_ROOT, "catalog", "templates.json"), "utf8"),
  );
  const recipes = JSON.parse(
    fs.readFileSync(path.join(SKILL_ROOT, "catalog", "recipes.json"), "utf8"),
  );

  const layoutIds = layouts.groups.flatMap(({ layouts: ids }) => ids);
  assert.equal(layoutIds.length, 117);
  assert.equal(new Set(layoutIds).size, layoutIds.length);
  assert.deepEqual(Object.keys(layouts.descriptions).sort(), [...layoutIds].sort());
  const skillText = fs.readFileSync(path.join(SKILL_ROOT, "SKILL.md"), "utf8");
  const documentedLayoutIds = [...skillText.matchAll(/^\|\s*`([\w-]+)`\s*\|/gm)]
    .map((match) => match[1])
    .filter((id) => layoutIds.includes(id));
  assert.deepEqual([...new Set(documentedLayoutIds)].sort(), [...layoutIds].sort());

  const templateIds = templates.templates.map(({ id }) => id);
  assert.equal(new Set(templateIds).size, templateIds.length);
  for (const template of templates.templates) {
    assert.ok(layoutIds.includes(template.layout), `${template.id} uses ${template.layout}`);
    assert.ok(fs.existsSync(path.join(SKILL_ROOT, template.source)), template.source);
    for (const entry of template.copy ?? []) {
      assert.ok(fs.existsSync(path.join(SKILL_ROOT, entry.source)), entry.source);
    }
  }

  const requiredResearchTemplates = [
    "problem-gap",
    "research-question",
    "contributions",
    "related-work",
    "method-overview",
    "train-vs-inference",
    "experiment-setup",
    "dataset-metrics",
    "main-result",
    "ablation",
    "qualitative-results",
    "error-analysis",
    "limitations",
    "reproducibility",
  ];
  assert.ok(requiredResearchTemplates.every((id) => templateIds.includes(id)));
  const requiredBusinessTemplates = [
    "business-problem",
    "executive-summary",
    "customer-persona",
    "value-proposition",
    "solution-overview",
    "market-opportunity",
    "competitive-landscape",
    "business-model",
    "go-to-market",
    "business-kpis",
    "customer-impact",
    "pricing-plans",
    "risks-mitigation",
    "action-plan",
    "business-status",
  ];
  assert.ok(requiredBusinessTemplates.every((id) => templateIds.includes(id)));

  assert.deepEqual(
    recipes.recipes.map(({ id }) => id),
    ["research-progress", "paper-talk", "conference-talk", "business-proposal", "executive-review"],
  );
  for (const recipe of recipes.recipes) {
    for (const entry of recipe.templates) {
      const id = typeof entry === "string" ? entry : entry.id;
      assert.ok(templateIds.includes(id), `${recipe.id} references ${id}`);
    }
  }
});
