/*
 * deck.mjs — Marp Markdown をスライド単位に分解・再構成する。
 *
 * 方針: 内容を失わないこと。スライド本文(raw)は一切加工せず、
 * frontmatter とスライド区切り(fenced code block 外の "---" 行)だけを管理する。
 * _class は raw から正規表現で読み取るのみで、書き換えはフロントエンド側が raw を編集する。
 */

const CLASS_RE = /<!--\s*_class:\s*([^>]*?)\s*-->/;
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

/** raw スライドから _class の値を読む(なければ '') */
export function slideClass(raw) {
  const m = raw.match(CLASS_RE);
  return m ? m[1].trim() : '';
}

/** fenced code block 外の "---" 行で本文をスライドに分割する */
export function splitBody(body) {
  const lines = body.split('\n');
  const slides = [];
  let cur = [];
  let fence = null; // 開いている fence('```' or '~~~')
  for (const line of lines) {
    const f = line.match(/^\s*(`{3,}|~{3,})/);
    if (f) {
      const mark = f[1][0];
      if (!fence) fence = mark;
      else if (fence === mark) fence = null;
    }
    if (!fence && /^-{3,}\s*$/.test(line)) {
      slides.push(cur.join('\n'));
      cur = [];
    } else {
      cur.push(line);
    }
  }
  slides.push(cur.join('\n'));
  return slides;
}

/**
 * Markdown 全文 → { frontmatter, slides }
 * frontmatter は区切り "---" を除いた中身。slides は raw 文字列の配列。
 */
export function parseDeck(text) {
  let frontmatter = '';
  let body = text;
  const m = text.match(FRONTMATTER_RE);
  if (m) {
    frontmatter = m[1];
    body = text.slice(m[0].length);
  }
  return { frontmatter, slides: splitBody(body) };
}

/** parseDeck の逆操作 */
export function serializeDeck({ frontmatter, slides }) {
  const body = slides.join('\n---\n');
  return frontmatter ? `---\n${frontmatter}\n---\n${body}` : body;
}
