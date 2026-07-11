#!/usr/bin/env node
/*
 * init.mjs — タイムスタンプ付きデッキディレクトリを初期化する。
 *
 * CLI:
 *   node scripts/init.mjs --topic <snake_case> [--title "..."] [--theme research]
 *                         [--root docs/slides] [--created-at YYYY-MM-DD_HHmmss]
 *                         [--source-commit <sha>]
 *
 * 作成先:
 *   <root>/YYYY-MM-DD_HHmmss_<topic>/
 *     README.md, slides.md, manifest.json
 *     assets/ data/ scripts/ sources/ tooling/ validation/
 *
 * 標準出力に作成したディレクトリの絶対パスを1行で出す。
 * タイムゾーンは Asia/Tokyo 固定（cpa-gpua の init-deck.mjs と同じ契約）。
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const THEMES = new Set(["research", "business", "lecture", "soft"]);

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, values) => {
    if (value.startsWith("--")) pairs.push([value.slice(2), values[index + 1]]);
    return pairs;
  }, []),
);

if (!args.topic || !/^[a-z0-9_]+$/.test(args.topic)) {
  throw new Error("--topic must be snake_case (e.g. midterm_report)");
}

const theme = args.theme ?? "research";
if (!THEMES.has(theme)) {
  throw new Error(`--theme must be one of: ${[...THEMES].join(", ")}`);
}

const now = new Date();
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

const timestamp =
  args["created-at"] ??
  `${parts.year}-${parts.month}-${parts.day}_${parts.hour}${parts.minute}${parts.second}`;
if (!/^\d{4}-\d{2}-\d{2}_\d{6}$/.test(timestamp)) {
  throw new Error("--created-at must be YYYY-MM-DD_HHmmss");
}

const title = args.title ?? args.topic;
const id = `${timestamp}_${args.topic}`;
const root = path.resolve(args.root ?? "docs/slides", id);
const localIso = `${timestamp.slice(0, 10)}T${timestamp.slice(11, 13)}:${timestamp.slice(13, 15)}:${timestamp.slice(15, 17)}+09:00`;

if (fs.existsSync(root)) {
  throw new Error(`already exists: ${root}`);
}

for (const directory of [
  "assets",
  "data",
  "scripts",
  "sources",
  "tooling",
  "validation",
]) {
  fs.mkdirSync(path.join(root, directory), { recursive: true });
}

fs.writeFileSync(
  path.join(root, "README.md"),
  `# ${title}\n\nSee manifest.json for provenance.\n`,
);

fs.writeFileSync(
  path.join(root, "slides.md"),
  `---
marp: true
theme: ${theme}
size: 16:9
paginate: true
title: ${title}
---

<!-- _class: title -->
<!-- _paginate: false -->

# ${title}

`,
);

fs.writeFileSync(
  path.join(root, "manifest.json"),
  `${JSON.stringify(
    {
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
      files: [],
      content_sha256: "",
    },
    null,
    2,
  )}\n`,
);

console.log(root);
