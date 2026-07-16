#!/usr/bin/env node
/*
 * export.mjs — slide-forge の再現可能な書き出し入口。
 *
 * CLI:
 *   node scripts/export.mjs slides.md [--format html|pdf]
 *                                      [--output build/slides.html]
 *
 * HTML はローカル画像と KaTeX フォントを data URI に変換するため、生成した
 * 1 ファイルだけでオフライン再生できる。sf_motion: rich のときだけ、同梱の
 * runtime/motion.{css,js} をインライン注入する。
 */

import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const execFileP = promisify(execFile);

export const EXPORT_FORMATS = Object.freeze(["html", "pdf"]);
export const MOTION_MODES = Object.freeze(["off", "standard", "rich"]);

const FORMAT_EXTENSION = Object.freeze({
  html: "html",
  pdf: "pdf",
});

const FORMAT_SUFFIX = FORMAT_EXTENSION;

const MIME_TYPES = Object.freeze({
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".webm": "video/webm",
});

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const REMOTE_RE = /^https?:\/\//i;
const PASSTHROUGH_RE = /^(?:data:|blob:|#|about:|mailto:|tel:)/i;

export function exportExtension(format) {
  if (!EXPORT_FORMATS.includes(format)) {
    throw new Error(`format must be one of: ${EXPORT_FORMATS.join(", ")}`);
  }
  return FORMAT_EXTENSION[format];
}

export function exportSuffix(format) {
  exportExtension(format);
  return FORMAT_SUFFIX[format];
}

/** frontmatter の sf_motion を読む。未指定時は standard。 */
export function parseMotionMode(markdown) {
  const frontmatter = markdown.match(FRONTMATTER_RE)?.[1] ?? "";
  const declarations = [];
  for (const line of frontmatter.split(/\r?\n/)) {
    const match = line.match(/^\s*sf_motion\s*:\s*(.*?)\s*$/);
    if (match) declarations.push(match[1]);
  }
  if (declarations.length === 0) return "standard";
  if (declarations.length > 1) {
    throw new Error("sf_motion must be declared only once");
  }
  const raw = declarations[0].replace(/\s+#.*$/, "").trim();
  const unquoted = raw.match(/^(?:"([^"]*)"|'([^']*)'|([^\s]+))$/)?.slice(1).find((v) => v !== undefined);
  const mode = unquoted?.toLowerCase();
  if (!MOTION_MODES.includes(mode)) {
    throw new Error(`sf_motion must be one of: ${MOTION_MODES.join(", ")}`);
  }
  return mode;
}

export function defaultExportPath(input, format) {
  const absolute = path.resolve(input);
  const stem = path.basename(absolute, path.extname(absolute));
  return path.join(path.dirname(absolute), `${stem}.export.${exportSuffix(format)}`);
}

/** テストとサーバの双方で使う Marp CLI 引数生成。 */
export function buildMarpArgs({ input, output, format, motionMode, root = ROOT }) {
  exportExtension(format);
  if (!MOTION_MODES.includes(motionMode)) {
    throw new Error(`motionMode must be one of: ${MOTION_MODES.join(", ")}`);
  }
  const args = [
    "--theme-set",
    path.join(root, "theme"),
    "--html",
    "--allow-local-files",
  ];
  if (format === "pdf") args.push("--pdf");
  // motion は一枚のスライド内だけを対象にし、スライド間のView Transitionは常に止める。
  if (format === "html") args.push("--no-bespoke.transition");
  args.push(path.resolve(input), "-o", path.resolve(output));
  return args;
}

function decodeHtml(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function escapeAttribute(value, quote = '"') {
  let escaped = String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  escaped = quote === '"' ? escaped.replaceAll('"', "&quot;") : escaped.replaceAll("'", "&#39;");
  return escaped;
}

async function replaceAsync(text, regex, replacer) {
  const matches = [...text.matchAll(regex)];
  if (matches.length === 0) return text;
  const replacements = await Promise.all(matches.map((match) => replacer(...match)));
  let output = "";
  let cursor = 0;
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    output += text.slice(cursor, match.index) + replacements[index];
    cursor = match.index + match[0].length;
  }
  return output + text.slice(cursor);
}

function cleanReference(reference) {
  return decodeHtml(reference.trim()).replace(/^(["'])|(["'])$/g, "");
}

function referenceWithoutQuery(reference) {
  const hash = reference.indexOf("#");
  const query = reference.indexOf("?");
  const cut = Math.min(hash < 0 ? reference.length : hash, query < 0 ? reference.length : query);
  return reference.slice(0, cut);
}

function katexFontPath(reference, root) {
  if (!REMOTE_RE.test(reference)) return null;
  let url;
  try {
    url = new URL(reference);
  } catch {
    return null;
  }
  const match = url.pathname.match(/\/katex@[^/]+\/dist\/fonts\/([^/]+)$/);
  if (url.hostname !== "cdn.jsdelivr.net" || !match) return null;
  return path.join(root, "node_modules", "katex", "dist", "fonts", decodeURIComponent(match[1]));
}

function isWithin(candidate, directory) {
  const relative = path.relative(directory, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function localResourcePath(reference, baseDir, root, resourceRoot = baseDir) {
  const clean = referenceWithoutQuery(cleanReference(reference));
  const katex = katexFontPath(clean, root);
  if (katex) {
    const [file, fontsRoot] = await Promise.all([
      realpath(katex),
      realpath(path.join(root, "node_modules", "katex", "dist", "fonts")),
    ]);
    if (!isWithin(file, fontsRoot)) throw new Error(`KaTeX font escapes its allowed directory: ${clean}`);
    return file;
  }
  if (REMOTE_RE.test(clean)) {
    throw new Error(`remote rendered asset cannot be embedded: ${clean}`);
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(clean)) {
    throw new Error(`unsupported rendered asset URL: ${clean}`);
  }
  let decoded;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    decoded = clean;
  }
  if (path.isAbsolute(decoded)) {
    throw new Error(`absolute rendered asset path is not allowed: ${clean}`);
  }
  if (decoded.split(/[\\/]+/).includes("..")) {
    throw new Error(`parent traversal is not allowed in rendered assets: ${clean}`);
  }
  const [file, allowedRoot] = await Promise.all([
    realpath(path.resolve(baseDir, decoded)),
    realpath(resourceRoot),
  ]);
  if (!isWithin(file, allowedRoot)) {
    throw new Error(`rendered asset escapes deck directory: ${clean}`);
  }
  return file;
}

function mimeType(file) {
  return MIME_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

const SVG_MOTION_STYLE = `<style data-sf-generated-motion="true">
@keyframes sf-generated-draw{to{stroke-dashoffset:0}}
@keyframes sf-generated-fade{from{opacity:0}to{opacity:1}}
@keyframes sf-generated-wipe{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes sf-generated-highlight{0%{opacity:.35;filter:saturate(.35)}55%{opacity:1;filter:saturate(1.45) brightness(1.08)}to{opacity:1;filter:none}}
@media (prefers-reduced-motion:no-preference){
  [data-sf-draw]{stroke-dasharray:1;stroke-dashoffset:1;animation:sf-generated-draw 900ms ease-out var(--sf-delay,0ms) both}
  [data-sf-fade]{animation:sf-generated-fade 500ms ease-out var(--sf-delay,0ms) both}
  [data-sf-wipe]{animation:sf-generated-wipe 700ms ease-out var(--sf-delay,0ms) both}
  [data-sf-highlight]{animation:sf-generated-highlight 760ms cubic-bezier(.2,.75,.25,1) var(--sf-delay,0ms) both}
}
@media print,(prefers-reduced-motion:reduce){
  [data-sf-draw],[data-sf-fade],[data-sf-wipe],[data-sf-highlight]{animation:none!important;clip-path:none!important;filter:none!important;opacity:1!important;stroke-dashoffset:0!important}
}
</style>`;

/** data-sf-draw 付き図形を pathLength=1 に正規化し、再生用CSSを埋め込む。 */
export function prepareDrawSvg(svg) {
  if (!/<svg\b/i.test(svg)) return svg;
  let output = svg.replace(
    /<(path|line|polyline|polygon|circle|ellipse|rect)\b([^>]*\bdata-sf-draw(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?[^>]*)>/gi,
    (full, element, attributes) =>
      /\bpathLength\s*=/i.test(attributes)
        ? full
        : `<${element} pathLength="1"${attributes}>`,
  );
  if (!/\bdata-sf-draw(?:\s*=|\s|>)/i.test(output)) {
    // 外部SVGにdrawフックがない場合も無動作にせず、図全体のwipeへ安全に退避。
    output = output.replace(/<svg\b/i, '<svg data-sf-wipe="whole-visual"');
  }
  if (!/data-sf-generated-motion=/i.test(output)) {
    output = output.replace(/<svg\b[^>]*>/i, (rootTag) => `${rootTag}${SVG_MOTION_STYLE}`);
  }
  return output;
}

/** highlight対象がない図では、図全体を1回だけ強調する安全なフォールバックにする。 */
export function prepareHighlightSvg(svg) {
  if (!/<svg\b/i.test(svg)) return svg;
  let output = svg;
  if (!/\bdata-sf-highlight(?:\s*=|\s|>)/i.test(output)) {
    output = output.replace(/<svg\b/i, '<svg data-sf-highlight="whole-visual"');
  }
  if (!/data-sf-generated-motion=/i.test(output)) {
    output = output.replace(/<svg\b[^>]*>/i, (rootTag) => `${rootTag}${SVG_MOTION_STYLE}`);
  }
  return output;
}

async function resourceAsDataUri(reference, {
  baseDir,
  root,
  resourceRoot = baseDir,
  svgMotion = null,
  stack = new Set(),
}) {
  const clean = cleanReference(reference);
  if (PASSTHROUGH_RE.test(clean)) return clean;
  let file;
  try {
    file = await localResourcePath(clean, baseDir, root, resourceRoot);
  } catch (error) {
    throw new Error(`cannot embed rendered asset ${clean}: ${error.message}`);
  }
  if (stack.has(file)) throw new Error(`circular asset reference: ${file}`);
  const nextStack = new Set(stack).add(file);
  let bytes;
  try {
    bytes = await readFile(file);
  } catch (error) {
    throw new Error(`cannot embed rendered asset ${clean}: ${error.message}`);
  }
  const mime = mimeType(file);
  if (mime === "image/svg+xml") {
    let svg = bytes.toString("utf8");
    svg = await inlineSvgResources(svg, {
      baseDir: path.dirname(file),
      root,
      resourceRoot,
      stack: nextStack,
    });
    if (svgMotion === "draw") svg = prepareDrawSvg(svg);
    if (svgMotion === "highlight") svg = prepareHighlightSvg(svg);
    bytes = Buffer.from(svg);
  }
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

async function inlineCssUrls(text, options) {
  return replaceAsync(text, /url\(([^)]*)\)/gi, async (full, rawReference) => {
    const reference = cleanReference(rawReference);
    if (!reference || PASSTHROUGH_RE.test(reference)) return full;
    const data = await resourceAsDataUri(reference, options);
    return `url(${data})`;
  });
}

/** HTML/SVG本文の文字列は触らず、style要素とstyle属性にあるCSSだけを処理する。 */
async function inlineMarkupStyles(markup, options) {
  let output = await replaceAsync(
    markup,
    /<style\b[^>]*>[\s\S]*?<\/style>/gi,
    (styleBlock) => inlineCssUrls(styleBlock, options),
  );
  output = await replaceAsync(
    output,
    /(\bstyle\s*=\s*)(["'])([\s\S]*?)\2/gi,
    async (attribute, prefix, quote, css) =>
      `${prefix}${quote}${await inlineCssUrls(css, options)}${quote}`,
  );
  return output;
}

async function inlineSvgResources(svg, options) {
  let output = await replaceAsync(
    svg,
    /<(?:image|use)\b[^>]*>/gi,
    async (tag) => replaceAsync(
      tag,
      /(\b(?:href|xlink:href)\s*=\s*)(["'])(.*?)\2/gi,
      async (attribute, prefix, quote, reference) => {
        const clean = cleanReference(reference);
        if (!clean || PASSTHROUGH_RE.test(clean)) return attribute;
        const data = await resourceAsDataUri(clean, options);
        return `${prefix}${quote}${data}${quote}`;
      },
    ),
  );
  output = await inlineMarkupStyles(output, options);
  return output;
}

function readAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match ? decodeHtml(match[2]) : null;
}

function setAttribute(tag, name, value) {
  const expression = new RegExp(`(\\b${name}\\s*=\\s*)(["'])(.*?)\\2`, "i");
  if (expression.test(tag)) {
    return tag.replace(expression, (_full, prefix, quote) =>
      `${prefix}${quote}${escapeAttribute(value, quote)}${quote}`,
    );
  }
  const suffix = tag.endsWith("/>") ? "/>" : ">";
  return `${tag.slice(0, -suffix.length)} ${name}="${escapeAttribute(value)}"${suffix}`;
}

function motionFromFilename(reference) {
  const file = path.basename(referenceWithoutQuery(cleanReference(reference)));
  return file.match(/(?:^|[._-])sf[-_](fade|wipe|draw|highlight)(?=[._-]|$)/i)?.[1]?.toLowerCase() ?? null;
}

async function motionFromSvg(reference, { baseDir, root }) {
  const clean = cleanReference(reference);
  if (PASSTHROUGH_RE.test(clean) || REMOTE_RE.test(clean) || !/\.svg(?:[?#]|$)/i.test(clean)) return null;
  const file = await localResourcePath(clean, baseDir, root, baseDir);
  let svg;
  try {
    svg = await readFile(file, "utf8");
  } catch {
    return null; // 本処理のインライン化で、より具体的な欠損エラーを返す。
  }
  const rootTag = svg.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  const mode = readAttribute(rootTag, "data-sf-motion")?.toLowerCase();
  return ["fade", "wipe", "draw", "highlight"].includes(mode) ? mode : null;
}

/** Markdown の alt 接頭辞・ファイル名・SVGメタデータをHTMLのフックへ変換。 */
export async function annotateMotionImages(html, { baseDir, root = ROOT }) {
  return replaceAsync(html, /<img\b[^>]*>/gi, async (tag) => {
    const source = readAttribute(tag, "src");
    if (!source) return tag;
    const alt = readAttribute(tag, "alt") ?? "";
    const explicit = alt.match(/^\s*sf:(fade|wipe|draw|highlight)(?:\s+([\s\S]*))?$/i);
    const motion = explicit?.[1]?.toLowerCase()
      ?? motionFromFilename(source)
      ?? await motionFromSvg(source, { baseDir, root });
    if (!motion) return tag;
    let output = tag;
    if (explicit) output = setAttribute(output, "alt", explicit[2] ?? "");
    output = setAttribute(output, "data-sf-motion", motion);
    if (/\.svg(?:[?#]|$)/i.test(source)) output = setAttribute(output, "data-sf-svg", "true");
    return output;
  });
}

async function inlineMediaTags(html, options) {
  return replaceAsync(
    html,
    /<(?:img|source|video|audio|image)\b[^>]*>/gi,
    async (tag) => {
      const svgMotion = readAttribute(tag, "data-sf-motion");
      return replaceAsync(
        tag,
        /(\b(?:src|poster|href|xlink:href)\s*=\s*)(["'])(.*?)\2/gi,
        async (attribute, prefix, quote, reference) => {
          const clean = cleanReference(reference);
          if (!clean || PASSTHROUGH_RE.test(clean)) return attribute;
          const data = await resourceAsDataUri(clean, { ...options, svgMotion });
          return `${prefix}${quote}${data}${quote}`;
        },
      );
    },
  );
}

function insertBefore(html, closingTag, content) {
  const index = html.lastIndexOf(closingTag);
  if (index < 0) throw new Error(`Marp HTML is missing ${closingTag}`);
  return `${html.slice(0, index)}${content}${html.slice(index)}`;
}

/** Marp HTML を単一ファイル化し、rich の場合だけモーションランタイムを注入。 */
export async function postprocessHtml(html, {
  baseDir,
  motionMode,
  root = ROOT,
}) {
  if (!MOTION_MODES.includes(motionMode)) {
    throw new Error(`motionMode must be one of: ${MOTION_MODES.join(", ")}`);
  }
  let output = html;
  if (motionMode === "rich") {
    output = await annotateMotionImages(output, { baseDir, root });
  }
  output = await inlineMediaTags(output, { baseDir, resourceRoot: baseDir, root });
  output = await inlineMarkupStyles(output, { baseDir, resourceRoot: baseDir, root });
  output = insertBefore(
    output,
    "</head>",
    `<meta name="slide-forge-motion" content="${motionMode}">`,
  );
  if (motionMode === "rich") {
    const [css, script] = await Promise.all([
      readFile(path.join(root, "runtime", "motion.css"), "utf8"),
      readFile(path.join(root, "runtime", "motion.js"), "utf8"),
    ]);
    output = insertBefore(output, "</head>", `<style data-slide-forge-motion>${css}</style>`);
    output = insertBefore(output, "</body>", `<script data-slide-forge-motion>${script}</script>`);
  }
  return output;
}

async function runMarp(marpBin, cliArgs, cwd) {
  const running = execFileP(marpBin, cliArgs, {
    cwd,
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  // stdin がパイプだと Marp CLI が EOF を待つため、明示的に閉じる。
  running.child.stdin?.end();
  await running;
}

/**
 * デッキを書き出して最終ファイルの絶対パスを返す。
 * HTMLは発表用の単一ファイル、PDFは静止した最終状態として出力する。
 */
export async function exportDeck({
  input,
  format = "html",
  output = null,
  root = ROOT,
  marpBin = path.join(root, "node_modules", ".bin", "marp"),
}) {
  exportExtension(format);
  const inputPath = path.resolve(input);
  await access(inputPath);
  const markdown = await readFile(inputPath, "utf8");
  const motionMode = parseMotionMode(markdown);
  const outputPath = path.resolve(output ?? defaultExportPath(inputPath, format));
  const inputRealPath = await realpath(inputPath);
  let outputRealPath = null;
  try {
    outputRealPath = await realpath(outputPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (outputPath === inputPath || outputRealPath === inputRealPath) {
    throw new Error("export output must not overwrite the source Markdown file");
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryDirectory = await mkdtemp(path.join(path.dirname(outputPath), ".sf-export-"));
  const temporaryOutput = path.join(temporaryDirectory, `deck.${exportExtension(format)}`);
  try {
    const cliArgs = buildMarpArgs({
      input: inputPath,
      output: temporaryOutput,
      format,
      motionMode,
      root,
    });
    await runMarp(marpBin, cliArgs, path.dirname(inputPath));
    if (format === "html") {
      const html = await readFile(temporaryOutput, "utf8");
      const standalone = await postprocessHtml(html, {
        baseDir: path.dirname(inputPath),
        motionMode,
        root,
      });
      await writeFile(temporaryOutput, standalone, "utf8");
    }
    await rename(temporaryOutput, outputPath);
    return { path: outputPath, format, motionMode };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function parseCli(argv) {
  const options = { format: "html", output: null, input: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--format" || value === "--output") {
      const next = argv[index + 1];
      if (!next) throw new Error(`${value} requires a value`);
      options[value.slice(2)] = next;
      index += 1;
    } else if (value.startsWith("--")) {
      throw new Error(`unknown option: ${value}`);
    } else if (!options.input) {
      options.input = value;
    } else {
      throw new Error(`unexpected argument: ${value}`);
    }
  }
  if (!options.input) {
    throw new Error("usage: node scripts/export.mjs <file.md> [--format html|pdf] [--output file]");
  }
  return options;
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    const options = parseCli(process.argv.slice(2));
    const result = await exportDeck(options);
    console.log(result.path);
  } catch (error) {
    console.error(`slide-forge export: ${error.message || error}`);
    process.exitCode = 1;
  }
}
