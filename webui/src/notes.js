/*
 * notes.js — 発表者ノート(Marp のプレゼンターノート = ディレクティブでない HTML コメント)の読み書き。
 *
 * Marpit は <!-- _class: ... --> のようなディレクティブ以外のコメントを
 * 発表者ノートとして扱う。ここではスライド raw からノートを抽出し、
 * 編集結果を「スライド末尾の1つのコメント」として書き戻す。
 */

// Marpit のディレクティブキー(グローバル+スポット。_ プレフィックス含む)
const DIRECTIVE_KEY_RE =
  /^\s*_?(marp|theme|style|headingDivider|size|math|title|author|description|keywords|url|image|paginate|header|footer|class|backgroundColor|backgroundImage|backgroundPosition|backgroundRepeat|backgroundSize|color|transition|lang)\s*:/;

const COMMENT_RE = /<!--([\s\S]*?)-->/g;

/** コメントの中身がディレクティブか(全行がディレクティブ形式ならディレクティブ) */
function isDirective(content) {
  const lines = content.split('\n').filter((l) => l.trim() !== '');
  return lines.length > 0 && lines.every((l) => DIRECTIVE_KEY_RE.test(l));
}

/** fenced code block(``` / ~~~)内の文字範囲を求める(コメント誤検出を避ける) */
function fencedRanges(raw) {
  const ranges = [];
  let fence = null;
  let start = 0;
  let offset = 0;
  for (const line of raw.split('\n')) {
    const f = line.match(/^\s*(`{3,}|~{3,})/);
    if (f) {
      const mark = f[1][0];
      if (!fence) {
        fence = mark;
        start = offset;
      } else if (fence === mark) {
        fence = null;
        ranges.push([start, offset + line.length]);
      }
    }
    offset += line.length + 1;
  }
  if (fence) ranges.push([start, raw.length]);
  return ranges;
}

const inRanges = (ranges, idx) => ranges.some(([a, b]) => idx >= a && idx < b);

/** スライド raw 中のノートコメント(ディレクティブ以外)を [{start, end, content}] で返す */
function noteComments(raw) {
  const ranges = fencedRanges(raw);
  const notes = [];
  for (const m of raw.matchAll(COMMENT_RE)) {
    if (inRanges(ranges, m.index)) continue;
    if (isDirective(m[1])) continue;
    notes.push({ start: m.index, end: m.index + m[0].length, content: m[1] });
  }
  return notes;
}

/** 表示用: ノート本文(複数コメントは空行で連結)。両端の空白1段だけ剥がす */
export function extractNotes(raw) {
  return noteComments(raw)
    .map((n) => {
      let c = n.content;
      if (c.startsWith('\n')) c = c.slice(1);
      else if (c.startsWith(' ')) c = c.slice(1);
      if (c.endsWith('\n')) c = c.slice(0, -1);
      else if (c.endsWith(' ')) c = c.slice(0, -1);
      return c;
    })
    .join('\n\n');
}

/**
 * ノートを書き戻す: 既存のノートコメントを全て取り除き、
 * text が空でなければスライド末尾に <!-- text --> を1つ置く。
 * ディレクティブコメント・本文は変更しない。
 */
export function setNotes(raw, text) {
  const notes = noteComments(raw);
  let out = raw;
  for (let i = notes.length - 1; i >= 0; i -= 1) {
    const { start, end } = notes[i];
    // コメントだけの行だったら行ごと削除する
    let a = start;
    let b = end;
    while (a > 0 && (out[a - 1] === ' ' || out[a - 1] === '\t')) a -= 1;
    const lineStart = a === 0 || out[a - 1] === '\n';
    if (lineStart && out[b] === '\n') b += 1;
    out = out.slice(0, a) + out.slice(b);
  }
  const body = text.replaceAll('-->', '→'); // コメント終端の混入だけ防ぐ
  if (body.trim() === '') return out;
  if (!out.endsWith('\n')) out += '\n';
  return `${out}<!-- ${body} -->\n`;
}
