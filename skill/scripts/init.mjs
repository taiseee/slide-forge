#!/usr/bin/env node
/*
 * init.mjs — タイムスタンプ付きデッキディレクトリを初期化する。
 *
 * CLI:
 *   node scripts/init.mjs --topic <snake_case> [--title "..."] [--theme research]
 *                         [--recipe paper-talk] [--root docs/slides]
 *                         [--created-at YYYY-MM-DD_HHmmss] [--source-commit <sha>]
 *
 * --recipe を省略した場合は、従来どおり表紙1枚の slides.md を生成する。
 * レシピは catalog/recipes.json、スライド本文は catalog/templates.json から
 * 解決する。レシピの copy 項目により、同梱素材をデッキへ再帰コピーできる。
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const THEMES = new Set(["research", "business", "lecture", "soft"]);
const COPY_DESTINATION_ROOTS = new Set([
  "assets",
  "data",
  "scripts",
  "sources",
  "tooling",
  "validation",
]);

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_SKILL_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const CLI_OPTIONS = new Set([
  "topic",
  "title",
  "theme",
  "recipe",
  "root",
  "created-at",
  "source-commit",
]);

export function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) throw new Error(`unexpected argument: ${value}`);
    const key = value.slice(2);
    if (!CLI_OPTIONS.has(key)) throw new Error(`unknown option: ${value}`);
    if (Object.hasOwn(args, key)) throw new Error(`${value} may be specified only once`);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) throw new Error(`${value} requires a value`);
    args[key] = next;
    index += 1;
  }
  return args;
}

function readCatalog(skillRoot, filename) {
  const catalogPath = path.join(skillRoot, "catalog", filename);
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  if (catalog.schema_version !== 1) {
    throw new Error(`${filename} schema_version must be 1`);
  }
  return catalog;
}

function resolveInside(base, relativePath, label) {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new Error(`${label} must be a non-empty relative path`);
  }
  if (path.isAbsolute(relativePath)) {
    throw new Error(`${label} must be relative: ${relativePath}`);
  }
  const absoluteBase = path.resolve(base);
  const resolved = path.resolve(absoluteBase, relativePath);
  if (resolved !== absoluteBase && !resolved.startsWith(`${absoluteBase}${path.sep}`)) {
    throw new Error(`${label} escapes its root: ${relativePath}`);
  }
  return resolved;
}

function normalizeCopyEntry(entry) {
  if (typeof entry === "string") {
    return { source: entry, destination: entry, optional: false };
  }
  if (!entry || typeof entry !== "object") {
    throw new Error("recipe copy entries must be strings or objects");
  }
  return {
    source: entry.source,
    destination: entry.destination ?? entry.source,
    optional: entry.optional === true,
  };
}

function planRecipeCopies({ skillRoot, deckRoot, entries }) {
  const planned = [];
  const seen = new Set();
  for (const rawEntry of entries) {
    const entry = normalizeCopyEntry(rawEntry);
    const source = resolveInside(skillRoot, entry.source, "copy source");
    const destination = resolveInside(deckRoot, entry.destination, "copy destination");
    const destinationRoot = path.relative(path.resolve(deckRoot), destination).split(path.sep)[0];
    if (!COPY_DESTINATION_ROOTS.has(destinationRoot)) {
      throw new Error(
        `copy destination must start with ${[...COPY_DESTINATION_ROOTS].join(", ")}: ${entry.destination}`,
      );
    }
    if (!fs.existsSync(source)) {
      if (entry.optional) continue;
      throw new Error(`recipe copy source does not exist: ${entry.source}`);
    }
    const key = `${source}\0${destination}`;
    if (seen.has(key)) continue;
    for (const existing of planned) {
      const overlaps = destination === existing.destination
        || destination.startsWith(`${existing.destination}${path.sep}`)
        || existing.destination.startsWith(`${destination}${path.sep}`);
      if (overlaps) {
        throw new Error(
          `copy destinations overlap: ${entry.destination} and ${existing.destination}`,
        );
      }
    }
    seen.add(key);
    planned.push({ ...entry, source, destination });
  }
  return planned;
}

/** Copy recipe/template resources without allowing either side to escape its root. */
export function copyRecipeFiles({ skillRoot, deckRoot, entries = [] }) {
  const copied = [];
  for (const entry of planRecipeCopies({ skillRoot, deckRoot, entries })) {
    fs.mkdirSync(path.dirname(entry.destination), { recursive: true });
    fs.cpSync(entry.source, entry.destination, {
      recursive: fs.statSync(entry.source).isDirectory(),
      errorOnExist: true,
      force: false,
    });
    copied.push(path.relative(path.resolve(deckRoot), entry.destination));
  }
  return copied;
}

function interpolateTemplate(source, variables, templateId) {
  return source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    if (!Object.hasOwn(variables, key)) {
      throw new Error(`template ${templateId} requires variable: ${key}`);
    }
    return String(variables[key]);
  });
}

function normalizeTemplateEntry(entry) {
  if (typeof entry === "string") return { id: entry, variables: {} };
  if (!entry || typeof entry !== "object" || typeof entry.id !== "string") {
    throw new Error("recipe templates must be IDs or { id, variables } objects");
  }
  if (entry.variables != null && typeof entry.variables !== "object") {
    throw new Error(`template ${entry.id} variables must be an object`);
  }
  return { id: entry.id, variables: entry.variables ?? {} };
}

export function renderRecipe({ recipe, templateCatalog, skillRoot, variables }) {
  const templatesById = new Map(
    templateCatalog.templates.map((template) => [template.id, template]),
  );
  const fragments = [];
  const usedTemplates = [];

  for (const rawEntry of recipe.templates) {
    const entry = normalizeTemplateEntry(rawEntry);
    const template = templatesById.get(entry.id);
    if (!template) throw new Error(`unknown template in recipe ${recipe.id}: ${entry.id}`);
    const sourcePath = resolveInside(skillRoot, template.source, `template ${entry.id} source`);
    const source = fs.readFileSync(sourcePath, "utf8");
    fragments.push(
      interpolateTemplate(source, { ...variables, ...entry.variables }, entry.id).trim(),
    );
    usedTemplates.push(template);
  }

  return {
    body: `${fragments.join("\n\n---\n\n")}\n`,
    usedTemplates,
  };
}

function timestampInTokyo(now) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}_${parts.hour}${parts.minute}${parts.second}`;
}

function frontmatter({ title, theme }) {
  return `---
marp: true
theme: ${theme}
size: 16:9
paginate: true
title: ${JSON.stringify(String(title))}
---\n\n`;
}

function legacyBody(title) {
  return `<!-- _class: title -->
<!-- _paginate: false -->

# ${title}

`;
}

export function initializeDeck(
  argv,
  {
    cwd = process.cwd(),
    now = new Date(),
    skillRoot = DEFAULT_SKILL_ROOT,
  } = {},
) {
  const args = parseArgs(argv);
  if (!args.topic || !/^[a-z0-9_]+$/.test(args.topic)) {
    throw new Error("--topic must be snake_case (e.g. midterm_report)");
  }

  let recipe = null;
  let recipeCatalog = null;
  let templateCatalog = null;
  if (args.recipe) {
    recipeCatalog = readCatalog(skillRoot, "recipes.json");
    recipe = recipeCatalog.recipes.find((candidate) => candidate.id === args.recipe);
    if (!recipe) {
      const choices = recipeCatalog.recipes.map(({ id }) => id).join(", ");
      throw new Error(`--recipe must be one of: ${choices}`);
    }
    templateCatalog = readCatalog(skillRoot, "templates.json");
  }

  const theme = args.theme ?? recipe?.default_theme ?? "research";
  if (!THEMES.has(theme)) {
    throw new Error(`--theme must be one of: ${[...THEMES].join(", ")}`);
  }

  const timestamp = args["created-at"] ?? timestampInTokyo(now);
  if (!/^\d{4}-\d{2}-\d{2}_\d{6}$/.test(timestamp)) {
    throw new Error("--created-at must be YYYY-MM-DD_HHmmss");
  }

  const title = args.title ?? args.topic;
  const id = `${timestamp}_${args.topic}`;
  const parent = path.resolve(cwd, args.root ?? "docs/slides");
  const root = path.join(parent, id);
  const localIso = `${timestamp.slice(0, 10)}T${timestamp.slice(11, 13)}:${timestamp.slice(13, 15)}:${timestamp.slice(15, 17)}+09:00`;

  if (fs.existsSync(root)) throw new Error(`already exists: ${root}`);

  let body = legacyBody(title);
  let usedTemplates = [];
  if (recipe) {
    ({ body, usedTemplates } = renderRecipe({
      recipe,
      templateCatalog,
      skillRoot,
      variables: {
        title,
        topic: args.topic,
        recipe_id: recipe.id,
        recipe_name: recipe.name_ja,
      },
    }));
  }

  const copyEntries = [
    ...(recipe?.copy ?? []),
    ...usedTemplates.flatMap((template) => template.copy ?? []),
  ];
  // Validate every source and destination before creating a partial deck.
  planRecipeCopies({ skillRoot, deckRoot: root, entries: copyEntries });
  fs.mkdirSync(parent, { recursive: true });
  const buildRoot = fs.mkdtempSync(path.join(parent, `.${id}.tmp-`));
  try {
    for (const directory of [
      "assets",
      "data",
      "scripts",
      "sources",
      "tooling",
      "validation",
    ]) {
      fs.mkdirSync(path.join(buildRoot, directory), { recursive: true });
    }

    const copied = copyRecipeFiles({ skillRoot, deckRoot: buildRoot, entries: copyEntries });

    const recipeLine = recipe
      ? `\nInitialized from slide-forge recipe \`${recipe.id}\` (${recipe.name_ja}).\n`
      : "";
    fs.writeFileSync(
      path.join(buildRoot, "README.md"),
      `# ${title}\n${recipeLine}\nSee manifest.json for provenance.\n`,
    );
    fs.writeFileSync(path.join(buildRoot, "slides.md"), `${frontmatter({ title, theme })}${body}`);

    const manifest = {
      schema_version: 1,
      deck: {
        id,
        title,
        theme,
        timezone: "Asia/Tokyo",
        created_at: localIso,
        updated_at: localIso,
      },
      repository: {
        source_commit:
          args["source-commit"] ?? "0000000000000000000000000000000000000000",
      },
      external_inputs: [],
      validation: { overflow: "pending", visual_review: "pending" },
      files: copied,
      content_sha256: "",
    };
    if (recipe) {
      manifest.generation = {
        recipe: recipe.id,
        recipe_catalog_schema_version: recipeCatalog.schema_version,
        template_catalog_schema_version: templateCatalog.schema_version,
        templates: usedTemplates.map(({ id: templateId }) => templateId),
      };
    }
    fs.writeFileSync(path.join(buildRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    fs.renameSync(buildRoot, root);
    return root;
  } catch (error) {
    fs.rmSync(buildRoot, { recursive: true, force: true });
    throw error;
  }
}

export function main(argv = process.argv.slice(2)) {
  const root = initializeDeck(argv);
  console.log(root);
}

const isCli = (() => {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(SCRIPT_PATH);
  } catch {
    return false;
  }
})();

if (isCli) main();
