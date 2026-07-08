/*
 * overflow.js — scripts/check-overflow.mjs の検出ロジックのクライアント移植。
 * shadow DOM 内にレンダリングされた section 群を直接計測する(puppeteer不要)。
 */

const TOL = 3; // px 許容誤差

/** 1枚の section を検査して問題の説明文の配列を返す(なければ空) */
export function checkSection(s) {
  const problems = [];

  const dv = s.scrollHeight - s.clientHeight;
  const dh = s.scrollWidth - s.clientWidth;
  if (dv > TOL) problems.push(`縦はみ出し ${dv}px`);
  if (dh > TOL) problems.push(`横はみ出し ${dh}px`);

  const rect = s.getBoundingClientRect();
  const scale = rect.width / s.clientWidth || 1;
  const tol = TOL * scale;
  for (const el of s.querySelectorAll('*')) {
    if (el.closest('.katex-mathml') !== null) continue;
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility()) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const out = [];
    if (r.top < rect.top - tol) out.push('上');
    if (r.bottom > rect.bottom + tol) out.push('下');
    if (r.left < rect.left - tol) out.push('左');
    if (r.right > rect.right + tol) out.push('右');
    if (out.length > 0) {
      const tag = el.tagName.toLowerCase();
      problems.push(`要素 <${tag}> が枠外(${out.join('/')})`);
      break;
    }
  }
  return problems;
}

/**
 * shadowRoot の配列(スライドごと)を検査して issues を返す。
 * 戻り値: [{ slide: 1始まり, class, problems }]
 */
export function checkRoots(roots) {
  const issues = [];
  roots.forEach((root, i) => {
    const s = root?.querySelector('svg[data-marpit-svg] > foreignObject > section');
    if (!s) return;
    const problems = checkSection(s);
    if (problems.length > 0) {
      issues.push({ slide: i + 1, class: s.className || '(none)', problems });
    }
  });
  return issues;
}
