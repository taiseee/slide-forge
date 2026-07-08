/*
 * patch.js — インライン編集の結果(要素のinnerHTML)を Markdown ソースへ書き戻す。
 *
 * data-source-line はサーバへ送った全文(frontmatter込み)の行番号。
 * ここで「全文の行番号 → スライドindex+スライド内行番号」への変換と、
 * ブロック接頭辞(# / - / > 等)を保持したインライン置換を行う。
 */

import TurndownService from 'turndown';

const td = new TurndownService({
  emDelimiter: '*',
  strongDelimiter: '**',
  codeBlockStyle: 'fenced',
});
// 編集対象はインライン内容のみ。ブロックを跨ぐ変換はしない
td.keep(['br']);

/** 要素の innerHTML → 1行の Markdown インライン記法 */
export function inlineMarkdown(el) {
  const md = td.turndown(el.innerHTML);
  return md.replace(/\s*\n+\s*/g, ' ').trim();
}

/**
 * serializeDeck と同じ規則で、各スライドの全文中の開始行番号を返す。
 * 全文 = "---\n" + frontmatter + "\n---\n" + slides.join("\n---\n")
 */
export function slideLineOffsets(frontmatter, slideRaws) {
  let offset = frontmatter ? frontmatter.split('\n').length + 2 : 0;
  return slideRaws.map((raw) => {
    const start = offset;
    offset += raw.split('\n').length + 1; // +1 = 区切り "---" の行
    return start;
  });
}

/** 全文の行番号 → { slideIdx, localLine }。スライド範囲外なら null */
export function locate(frontmatter, slideRaws, globalLine) {
  const offsets = slideLineOffsets(frontmatter, slideRaws);
  for (let i = slideRaws.length - 1; i >= 0; i -= 1) {
    if (globalLine >= offsets[i]) {
      const localLine = globalLine - offsets[i];
      if (localLine < slideRaws[i].split('\n').length) return { slideIdx: i, localLine };
      return null;
    }
  }
  return null;
}

// 行頭のブロック接頭辞(見出し・リスト・引用の記号、ネスト含む)
const PREFIX_RE = /^(\s*(?:>\s*)*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)?)/;

/**
 * スライド raw の [start, start+count) 行を、接頭辞を保持して newInline で置き換える。
 * 範囲末尾の空行は保持する。戻り値: { raw, count }(count = 置換後の行数、次回パッチ用)
 */
export function patchLines(raw, start, count, newInline) {
  const lines = raw.split('\n');
  const range = lines.slice(start, start + count);
  // 範囲末尾の空行は置換対象から外して保持する
  let contentLen = range.length;
  while (contentLen > 0 && range[contentLen - 1].trim() === '') contentLen -= 1;
  const kept = range.slice(contentLen);
  const prefix = (range[0] ?? '').match(PREFIX_RE)[1];
  const newLines = [prefix + newInline, ...kept];
  lines.splice(start, count, ...newLines);
  return { raw: lines.join('\n'), count: newLines.length };
}

/**
 * 表セル(th/td)の置換: 行はテーブルの1行("| a | b | c |")なので、
 * セル位置 cellIdx の中身だけを差し替える。
 */
export function patchTableCell(raw, line, cellIdx, newInline) {
  const lines = raw.split('\n');
  const row = lines[line] ?? '';
  // 先頭・末尾の | を除いて分割(エスケープされた \| は簡易的に非対応: セル内では使わない前提)
  const trimmed = row.replace(/^\s*\|/, '').replace(/\|\s*$/, '');
  const cells = trimmed.split('|');
  if (cellIdx < 0 || cellIdx >= cells.length) return raw;
  cells[cellIdx] = ` ${newInline} `;
  lines[line] = `|${cells.join('|')}|`;
  return lines.join('\n');
}
