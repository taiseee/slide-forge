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
 * - GET  /api/layouts  レイアウトカタログ(SKILL.md の表をパース)
 * - GET  /api/themes   利用可能なスキン名の一覧(theme/*.css の @theme をパース)
 * - POST /api/export   marp CLI で PDF / 発表用HTML を書き出す({format: 'pdf'|'html'})
 * - /                  webui/dist と md のあるディレクトリ(相対パス画像用)を配信
 */

import express from "express";
import {
  readFile,
  writeFile,
  mkdir,
  access,
  readdir,
  stat,
} from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Marp } from "@marp-team/marp-core";
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
async function assetVersion() {
  const files = [path.join(ROOT, "SKILL.md"), SAMPLES_PATH];
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
  const skill = await readFile(path.join(ROOT, "SKILL.md"), "utf8");
  const layouts = [];
  for (const line of skill.split("\n")) {
    const m = line.match(/^\|\s*`([\w-]+)`\s*\|\s*(.+?)\s*\|\s*$/);
    if (!m) continue;
    const skin = m[2].match(/※(\w+)/);
    layouts.push({
      cls: m[1],
      desc: m[2].replace(/※\w+/, "").trim(),
      skin: skin ? skin[1] : null,
    });
  }
  return layouts;
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

// marp CLI で PDF / 発表用HTML を書き出す。
// HTML は相対パスの画像を参照するため、md と同じディレクトリに
// <名前>.export.<拡張子> として出力する(元の md や成果物とは衝突しない)。
const execFileP = promisify(execFile);
app.post("/api/export", async (req, res) => {
  try {
    const format = String(req.body?.format);
    if (!["pdf", "html"].includes(format))
      throw new Error("format must be pdf or html");
    const stem = path.basename(MD, path.extname(MD));
    const name = `${stem}.export.${format}`;
    const marpBin = path.join(ROOT, "node_modules", ".bin", "marp");
    const cliArgs = [
      "--theme-set",
      path.join(ROOT, "theme"),
      "--html",
      "--allow-local-files",
      MD,
      "-o",
      path.join(MD_DIR, name),
    ];
    if (format === "pdf") cliArgs.unshift("--pdf");
    // marp CLI は stdin がパイプだと EOF を待ち続けるため、すぐ閉じる
    const running = execFileP(marpBin, cliArgs, {
      cwd: MD_DIR,
      timeout: 120_000,
    });
    running.child.stdin?.end();
    await running;
    res.json({ path: `/${name}` });
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

// ---------- 静的配信 ----------

app.use(express.static(path.join(ROOT, "webui", "dist")));
app.use(express.static(MD_DIR)); // レンダリングHTML内の相対パス画像用

app.listen(PORT, "127.0.0.1", () => {
  console.log(
    `slide-forge webui: http://127.0.0.1:${PORT}  (${path.relative(ROOT, MD)})`,
  );
});
