#!/usr/bin/env node
/*
 * server.mjs — slide-forge 編集WebUI(Canva風)のローカルサーバ。
 *
 * 使い方: node webui/server.mjs <file.md> [--port 5757]
 * (通常は `npm run webui -- <file.md>` から起動する)
 *
 * - GET  /api/deck     デッキを取得(frontmatter + スライドraw + class)
 * - PUT  /api/deck     デッキを保存(書き込みのみ。検証はクライアント側で行う)
 * - POST /api/render   Markdown全文 → marp-core でスライド別HTML+CSS
 *                      (各ブロック要素に data-source-line="開始-終了" を注入)
 * - POST /api/asset    画像を md と同じディレクトリの assets/ に保存(?name=元ファイル名)
 * - GET  /api/layouts  catalog/layouts.json の機械可読レイアウトカタログ
 * - GET  /api/templates 意図別の意味的テンプレート+レンダリング済みプレビュー
 * - GET  /api/assets    ライセンス確認済みの同梱素材一覧
 * - POST /api/assets/use 同梱素材をデッキへコピーしてprovenanceを記録
 * - GET  /api/themes   利用可能なスキン名の一覧(theme/*.css の @theme をパース)
 * - POST /api/export   発表用HTMLまたはPDFを書き出す
 *                      ({format: 'html'|'pdf'})
 * - /                  webui/dist と md のあるディレクトリ(相対パス画像用)を配信
 */

import express from "express";
import {
  readFile,
  writeFile,
  mkdir,
  cp,
  access,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Marp } from "@marp-team/marp-core";
import {
  EXPORT_FORMATS,
  exportDeck,
  exportSuffix,
} from "../scripts/export.mjs";
import { parseDeck, serializeDeck, slideClass } from "./lib/deck.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const mdArg = args.find((a) => !a.startsWith("--"));
const portIdx = args.indexOf("--port");
const PORT = portIdx >= 0 ? Number(args[portIdx + 1]) : 5757;
if (!mdArg) {
  console.error("usage: node webui/server.mjs <file.md> [--port 5757]");
  process.exit(2);
}
const MD = path.resolve(mdArg);
const MD_DIR = path.dirname(MD);
const CATALOG_DIR = path.join(ROOT, "catalog");
const ASSET_ROOT = path.join(ROOT, "assets");
const THEMES = new Set(["research", "business", "lecture", "soft"]);

// ---------- marp-core レンダラ ----------

// 各ブロック要素に Markdown ソースの行範囲を付与する markdown-it プラグイン
function sourceLinePlugin(md) {
  md.core.ruler.push("source_line", (state) => {
    const walk = (tokens) => {
      for (const t of tokens) {
        if (t.map && t.nesting !== -1)
          t.attrSet("data-source-line", `${t.map[0]}-${t.map[1]}`);
        if (t.children) walk(t.children);
      }
    };
    walk(state.tokens);
  });
}

async function createMarp() {
  const marp = new Marp({ html: true, math: "katex" });
  // theme/ 配下の全スキンを登録する(コアは各スキンが @import で解決)
  for (const f of (await readdir(path.join(ROOT, "theme"))).filter((x) =>
    x.endsWith(".css"),
  )) {
    marp.themeSet.add(await readFile(path.join(ROOT, "theme", f), "utf8"));
  }
  marp.use(sourceLinePlugin);
  return marp;
}

// テーマCSS・カタログ・サンプルの最大mtime。サーバ起動中の
// レイアウト追加(theme/*.css・SKILL.md・samples.mjs の更新)を検知して
// marp インスタンスとプレビューキャッシュを作り直すためのバージョン値。
const SAMPLES_PATH = path.join(ROOT, "webui", "lib", "samples.mjs");
async function filesRecursively(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesRecursively(target)));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

async function assetVersion() {
  const files = [
    path.join(ROOT, "SKILL.md"),
    SAMPLES_PATH,
    path.join(CATALOG_DIR, "layouts.json"),
    path.join(CATALOG_DIR, "templates.json"),
    ...(await filesRecursively(path.join(ROOT, "templates"))),
    ...(await filesRecursively(ASSET_ROOT)),
  ];
  for (const f of (await readdir(path.join(ROOT, "theme"))).filter((x) =>
    x.endsWith(".css"),
  )) {
    files.push(path.join(ROOT, "theme", f));
  }
  const stats = await Promise.all(files.map((f) => stat(f)));
  return String(Math.max(...stats.map((s) => s.mtimeMs)));
}

let marpCache = null; // { ver, marp }
async function getMarp() {
  const ver = await assetVersion();
  if (!marpCache || marpCache.ver !== ver) {
    marpCache = { ver, marp: await createMarp() };
    previewCache.clear();
    templateCache.clear();
  }
  return marpCache.marp;
}

// samples.mjs は ESM キャッシュを避けるためバージョン付きで動的 import する
async function loadSamples() {
  const ver = marpCache?.ver ?? (await assetVersion());
  return import(`${pathToFileURL(SAMPLES_PATH)}?v=${ver}`);
}

// ---------- API ----------

const app = express();
app.use(express.json({ limit: "10mb" }));

app.get("/api/deck", async (_req, res) => {
  try {
    const text = await readFile(MD, "utf8");
    const { frontmatter, slides } = parseDeck(text);
    res.json({
      file: MD,
      frontmatter,
      slides: slides.map((raw) => ({ raw, cls: slideClass(raw) })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// 保存の直列化(連続保存時の競合防止)
let chain = Promise.resolve();
const enqueue = (fn) => {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
};

// 素材の出典台帳は別キューで直列化し、一時ファイルからのrenameで原子的に更新する。
let provenanceChain = Promise.resolve();
let provenanceSequence = 0;
const enqueueProvenance = (fn) => {
  const next = provenanceChain.then(fn, fn);
  provenanceChain = next.catch(() => {});
  return next;
};

app.put("/api/deck", (req, res) => {
  enqueue(async () => {
    const { frontmatter, slides } = req.body;
    if (!Array.isArray(slides)) throw new Error("slides must be an array");
    const text = serializeDeck({
      frontmatter: frontmatter ?? "",
      slides: slides.map(String),
    });
    await writeFile(MD, text, "utf8");
  })
    .then(() => res.json({ ok: true }))
    .catch((e) =>
      res.status(500).json({ ok: false, error: String(e.message || e) }),
    );
});

app.post("/api/render", async (req, res) => {
  try {
    const { markdown } = req.body;
    if (typeof markdown !== "string")
      throw new Error("markdown must be a string");
    const marp = await getMarp();
    const { html, css } = marp.render(markdown, { htmlAsArray: true });
    res.json({ css, slides: html });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post(
  "/api/asset",
  express.raw({ type: "image/*", limit: "50mb" }),
  async (req, res) => {
    try {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0)
        throw new Error("画像データが空です");
      // ファイル名はベース名だけを使い、記号を落とす(パストラバーサル防止)
      const original = path.basename(String(req.query.name || "image.png"));
      const ext = (path.extname(original) || ".png").toLowerCase();
      const stem =
        original
          .slice(0, original.length - path.extname(original).length)
          .replace(/[^\w.-]+/g, "_")
          .slice(0, 60) || "image";
      const dir = path.join(MD_DIR, "assets");
      await mkdir(dir, { recursive: true });
      // 既存ファイルは上書きせず連番を振る
      let name = `${stem}${ext}`;
      for (let i = 1; ; i += 1) {
        try {
          await access(path.join(dir, name));
          name = `${stem}-${i}${ext}`;
        } catch {
          break;
        }
      }
      await writeFile(path.join(dir, name), req.body);
      res.json({ path: `assets/${name}` });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  },
);

async function readLayoutCatalog() {
  const catalog = JSON.parse(await readFile(path.join(CATALOG_DIR, "layouts.json"), "utf8"));
  if (catalog.schema_version !== 1) throw new Error("layouts.json schema_version must be 1");
  const skinByLayout = new Map();
  for (const [skin, classes] of Object.entries(catalog.theme_only ?? {})) {
    for (const cls of classes) skinByLayout.set(cls, skin);
  }
  const seen = new Set();
  return (catalog.groups ?? []).flatMap((group) =>
    group.layouts.flatMap((cls) => {
      if (seen.has(cls)) return [];
      seen.add(cls);
      return [{
        cls,
        desc: catalog.descriptions?.[cls] ?? cls,
        skin: skinByLayout.get(cls) ?? null,
        group: group.id,
        groupLabel: group.label_ja,
      }];
    }),
  );
}

app.get("/api/layouts", async (_req, res) => {
  try {
    res.json(await readLayoutCatalog());
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// レイアウトピッカー用: 全レイアウトのサンプルスライドをテーマ付きでレンダリング
const previewCache = new Map(); // theme → { css, items }
const templateCache = new Map(); // theme → { css, items }
app.get("/api/layout-previews", async (req, res) => {
  try {
    const theme = /^[\w-]+$/.test(String(req.query.theme))
      ? String(req.query.theme)
      : "research";
    // getMarp がテーマ・カタログ・サンプルの更新を検知したら previewCache も破棄される
    const marp = await getMarp();
    if (!previewCache.has(theme)) {
      const layouts = await readLayoutCatalog();
      const classes = layouts.map((l) => l.cls);
      const { buildSampleDeck, sampleBody } = await loadSamples();
      const { html, css } = marp.render(buildSampleDeck(theme, classes), {
        htmlAsArray: true,
      });
      previewCache.set(theme, {
        css,
        // raw はレイアウト選択追加(新規スライドの雛形)に使うサンプル本文
        items: classes.map((cls, i) => ({
          cls,
          html: html[i] ?? "",
          raw: sampleBody(cls),
        })),
      });
    }
    res.json(previewCache.get(theme));
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

function templateSupportsTheme(template, theme) {
  if (theme === "soft") return true;
  if (template.kind?.startsWith("research")) return theme === "research";
  if (template.kind?.startsWith("business")) return theme === "business";
  return true;
}

async function readTemplateCatalog() {
  const catalog = JSON.parse(await readFile(path.join(CATALOG_DIR, "templates.json"), "utf8"));
  if (catalog.schema_version !== 1) throw new Error("templates.json schema_version must be 1");
  const items = [];
  for (const template of catalog.templates ?? []) {
    const source = path.resolve(ROOT, template.source);
    if (source !== ROOT && !source.startsWith(`${ROOT}${path.sep}`)) {
      throw new Error(`template source escapes skill root: ${template.source}`);
    }
    items.push({ ...template, raw: await readFile(source, "utf8") });
  }
  return items;
}

app.get("/api/templates", async (req, res) => {
  try {
    const theme = /^[\w-]+$/.test(String(req.query.theme)) ? String(req.query.theme) : "research";
    const marp = await getMarp();
    if (!templateCache.has(theme)) {
      const layouts = await readLayoutCatalog();
      const allowedLayouts = new Set(
        layouts.filter((layout) => theme === "soft" || !layout.skin || layout.skin === theme).map((layout) => layout.cls),
      );
      const items = (await readTemplateCatalog()).filter(
        (template) =>
          template.picker !== false
          && templateSupportsTheme(template, theme)
          && allowedLayouts.has(template.layout),
      );
      const previewBodies = items.map((item) => {
        let raw = item.raw;
        for (const copy of item.copy ?? []) {
          raw = raw.replaceAll(
            copy.destination,
            `/__skill-file?path=${encodeURIComponent(copy.source)}`,
          );
        }
        return raw;
      });
      const markdown = `---\nmarp: true\ntheme: ${theme}\npaginate: false\nmath: katex\n---\n\n${items
        .map((_item, index) => previewBodies[index].trim())
        .join("\n\n---\n\n")}\n`;
      const { html, css } = marp.render(markdown, { htmlAsArray: true });
      templateCache.set(theme, {
        theme,
        css,
        items: items.map((item, index) => ({ ...item, html: html[index] ?? "" })),
      });
    }
    res.json(templateCache.get(theme));
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/templates/use", async (req, res) => {
  try {
    const theme = String(req.body?.theme ?? "research");
    if (!THEMES.has(theme)) return res.status(400).json({ error: "unknown theme" });
    const template = (await readTemplateCatalog()).find((item) => item.id === req.body?.id);
    if (!template || template.picker === false) return res.status(404).json({ error: "unknown template id" });
    if (!templateSupportsTheme(template, theme)) {
      return res.status(400).json({ error: `template ${template.id} is not available for theme ${theme}` });
    }
    const layouts = await readLayoutCatalog();
    const allowedLayouts = new Set(
      layouts
        .filter((layout) => theme === "soft" || !layout.skin || layout.skin === theme)
        .map((layout) => layout.cls),
    );
    if (!allowedLayouts.has(template.layout)) {
      return res.status(400).json({ error: `template ${template.id} is not available for theme ${theme}` });
    }
    for (const entry of template.copy ?? []) {
      const source = path.resolve(ROOT, entry.source);
      const destination = path.resolve(MD_DIR, entry.destination);
      if (source !== ROOT && !source.startsWith(`${ROOT}${path.sep}`)) {
        return res.status(400).json({ error: "template copy source escapes skill root" });
      }
      if (destination !== MD_DIR && !destination.startsWith(`${MD_DIR}${path.sep}`)) {
        return res.status(400).json({ error: "template copy destination escapes deck root" });
      }
      await mkdir(path.dirname(destination), { recursive: true });
      try {
        await access(destination);
      } catch {
        await cp(source, destination, { recursive: true, errorOnExist: true, force: false });
      }
    }
    res.json({ id: template.id, raw: template.raw });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

async function readAssetCatalog() {
  const manifest = JSON.parse(await readFile(path.join(ASSET_ROOT, "assets.json"), "utf8"));
  if (manifest.schema_version !== 1) throw new Error("assets.json schema_version must be 1");
  return manifest;
}

app.get("/api/assets", async (_req, res) => {
  try {
    const manifest = await readAssetCatalog();
    res.json({
      ...manifest,
      assets: manifest.assets.map((asset) => ({
        ...asset,
        url: `/__library/${asset.path.split(path.sep).map(encodeURIComponent).join("/")}`,
      })),
    });
  } catch (e) {
    // 素材パック未同梱の古いインストールでもWebUI本体は使える。
    if (e.code === "ENOENT") return res.json({ schema_version: 1, assets: [] });
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/assets/use", async (req, res) => {
  try {
    const manifest = await readAssetCatalog();
    const asset = manifest.assets.find((item) => item.id === req.body?.id);
    if (!asset) return res.status(404).json({ error: "unknown asset id" });
    const source = path.resolve(ASSET_ROOT, asset.path);
    if (source !== ASSET_ROOT && !source.startsWith(`${ASSET_ROOT}${path.sep}`)) {
      return res.status(400).json({ error: "asset path escapes library" });
    }
    const ext = path.extname(source).toLowerCase();
    const safeId = asset.id.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80);
    const fingerprint = String(asset.sha256 ?? "asset").slice(0, 10);
    const relative = path.posix.join("assets", "slide-forge", `${safeId}-${fingerprint}${ext}`);
    const destination = path.join(MD_DIR, ...relative.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    try {
      await access(destination);
    } catch {
      await writeFile(destination, await readFile(source));
    }

    const provenancePath = path.join(MD_DIR, "sources", "assets.json");
    await mkdir(path.dirname(provenancePath), { recursive: true });
    await enqueueProvenance(async () => {
      let provenance = { schema_version: 1, assets: [] };
      try {
        provenance = JSON.parse(await readFile(provenancePath, "utf8"));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      provenance.assets = (provenance.assets ?? []).filter((item) => item.id !== asset.id);
      provenance.assets.push({ ...asset, deck_path: relative });
      const temporary = `${provenancePath}.${process.pid}.${provenanceSequence++}.tmp`;
      try {
        await writeFile(temporary, `${JSON.stringify(provenance, null, 2)}\n`, "utf8");
        await rename(temporary, provenancePath);
      } catch (error) {
        await rm(temporary, { force: true });
        throw error;
      }
    });
    res.json({ path: relative, alt: asset.alt, provenance: "sources/assets.json" });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// 利用可能なスキン名の一覧(コアテーマは除く)
app.get("/api/themes", async (_req, res) => {
  try {
    const names = [];
    for (const f of (await readdir(path.join(ROOT, "theme"))).filter((x) =>
      x.endsWith(".css"),
    )) {
      const m = (await readFile(path.join(ROOT, "theme", f), "utf8")).match(
        /@theme\s+([\w-]+)/,
      );
      if (m && m[1] !== "slide-forge-core") names.push(m[1]);
    }
    res.json(names.sort());
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// scripts/export.mjs の共通経路で書き出す。
// HTML はローカル素材・KaTeXフォント・rich motion runtimeをインライン化した
// 単一ファイル。PDFはMarp CLIの標準出力を使う。
app.post("/api/export", async (req, res) => {
  try {
    const format = String(req.body?.format);
    if (!EXPORT_FORMATS.includes(format)) {
      return res.status(400).json({
        error: `format must be one of: ${EXPORT_FORMATS.join(", ")}`,
      });
    }
    const stem = path.basename(MD, path.extname(MD));
    const name = `${stem}.export.${exportSuffix(format)}`;
    const result = await exportDeck({
      input: MD,
      format,
      output: path.join(MD_DIR, name),
      root: ROOT,
    });
    res.json({ path: `/${name}`, format, motion: result.motionMode });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// サンプル用の画像プレースホルダ
app.get("/__ph.svg", (_req, res) => {
  res.type("image/svg+xml").send(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 280">
      <rect width="400" height="280" fill="#eceae5"/>
      <rect x="24" y="24" width="352" height="232" fill="none" stroke="#c9c4ba" stroke-width="2" stroke-dasharray="8 6"/>
      <circle cx="140" cy="120" r="34" fill="#c9c4ba"/>
      <path d="M60 220 L150 150 L210 195 L280 130 L340 220 Z" fill="#d8d4cc"/>
    </svg>`,
  );
});

app.get("/__skill-file", async (req, res) => {
  try {
    const file = path.resolve(ROOT, String(req.query.path ?? ""));
    if (file === ROOT || !file.startsWith(`${ROOT}${path.sep}`)) {
      return res.status(400).send("invalid skill file path");
    }
    await access(file);
    res.sendFile(file);
  } catch {
    res.status(404).send("skill file not found");
  }
});

// ---------- 静的配信 ----------

app.use("/__library", express.static(ASSET_ROOT, { fallthrough: false }));
app.use(express.static(path.join(ROOT, "webui", "dist")));
app.use(express.static(MD_DIR)); // レンダリングHTML内の相対パス画像用

app.listen(PORT, "127.0.0.1", () => {
  console.log(
    `slide-forge webui: http://127.0.0.1:${PORT}  (${path.relative(ROOT, MD)})`,
  );
});
