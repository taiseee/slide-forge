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
 * - GET  /api/layouts  レイアウトカタログ(skill/SKILL.md の表をパース)
 * - /                  webui/dist と md のあるディレクトリ(相対パス画像用)を配信
 */

import express from 'express';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marp } from '@marp-team/marp-core';
import { parseDeck, serializeDeck, slideClass } from './lib/deck.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const mdArg = args.find((a) => !a.startsWith('--'));
const portIdx = args.indexOf('--port');
const PORT = portIdx >= 0 ? Number(args[portIdx + 1]) : 5757;
if (!mdArg) {
  console.error('usage: node webui/server.mjs <file.md> [--port 5757]');
  process.exit(2);
}
const MD = path.resolve(mdArg);
const MD_DIR = path.dirname(MD);

// ---------- marp-core レンダラ ----------

// 各ブロック要素に Markdown ソースの行範囲を付与する markdown-it プラグイン
function sourceLinePlugin(md) {
  md.core.ruler.push('source_line', (state) => {
    const walk = (tokens) => {
      for (const t of tokens) {
        if (t.map && t.nesting !== -1) t.attrSet('data-source-line', `${t.map[0]}-${t.map[1]}`);
        if (t.children) walk(t.children);
      }
    };
    walk(state.tokens);
  });
}

async function createMarp() {
  const marp = new Marp({ html: true, math: 'katex' });
  for (const f of ['core.css', 'research.css', 'business.css']) {
    marp.themeSet.add(await readFile(path.join(ROOT, 'theme', f), 'utf8'));
  }
  marp.use(sourceLinePlugin);
  return marp;
}

const marpPromise = createMarp();

// ---------- API ----------

const app = express();
app.use(express.json({ limit: '10mb' }));

app.get('/api/deck', async (_req, res) => {
  try {
    const text = await readFile(MD, 'utf8');
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

app.put('/api/deck', (req, res) => {
  enqueue(async () => {
    const { frontmatter, slides } = req.body;
    if (!Array.isArray(slides)) throw new Error('slides must be an array');
    const text = serializeDeck({ frontmatter: frontmatter ?? '', slides: slides.map(String) });
    await writeFile(MD, text, 'utf8');
  })
    .then(() => res.json({ ok: true }))
    .catch((e) => res.status(500).json({ ok: false, error: String(e.message || e) }));
});

app.post('/api/render', async (req, res) => {
  try {
    const { markdown } = req.body;
    if (typeof markdown !== 'string') throw new Error('markdown must be a string');
    const marp = await marpPromise;
    const { html, css } = marp.render(markdown, { htmlAsArray: true });
    res.json({ css, slides: html });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/layouts', async (_req, res) => {
  try {
    const skill = await readFile(path.join(ROOT, 'skill', 'SKILL.md'), 'utf8');
    const layouts = [];
    for (const line of skill.split('\n')) {
      const m = line.match(/^\|\s*`([\w-]+)`\s*\|\s*(.+?)\s*\|\s*$/);
      if (!m) continue;
      const skin = m[2].match(/※(\w+)/);
      layouts.push({ cls: m[1], desc: m[2].replace(/※\w+/, '').trim(), skin: skin ? skin[1] : null });
    }
    res.json(layouts);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ---------- 静的配信 ----------

app.use(express.static(path.join(ROOT, 'webui', 'dist')));
app.use(express.static(MD_DIR)); // レンダリングHTML内の相対パス画像用

app.listen(PORT, '127.0.0.1', () => {
  console.log(`slide-forge webui: http://127.0.0.1:${PORT}  (${path.relative(ROOT, MD)})`);
});
