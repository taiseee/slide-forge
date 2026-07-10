/*
 * layout-groups.js — レイアウトピッカーのタブ分け(表示用のグルーピング)。
 * カタログの正は skill/SKILL.md。ここに載っていない新レイアウトは「その他」タブに出る。
 */

export const LAYOUT_GROUPS = [
  {
    name: '導入・締め',
    classes: ['title', 'title-visual', 'agenda', 'agenda-grid', 'objectives', 'divider', 'lead', 'exec-summary', 'takeaway', 'summary', 'end', 'references'],
  },
  {
    name: '本文',
    classes: ['content', 'content-lead', 'two-column', 'sidebar', 'columns', 'cards', 'spec', 'faq', 'checklist', 'quote', 'code', 'math', 'definition', 'callout'],
  },
  {
    name: '画像',
    classes: ['image-right', 'image-left', 'image-top', 'image-bottom', 'image-full', 'annotated', 'gallery', 'photo-grid', 'image-cards', 'before-after', 'logos', 'profile', 'team', 'persona'],
  },
  {
    name: '比較・分類',
    classes: ['comparison', 'comparison-3', 'pros-cons', 'transition', 'table', 'benchmark', 'matrix', 'matrix-3', 'venn', 'venn-3', 'positioning', 'ranking', 'plans', 'scorecard', 'forces', 'bmc'],
  },
  {
    name: 'プロセス・構造',
    classes: ['steps', 'steps-v', 'flow', 'cycle', 'timeline', 'timeline-h', 'gantt', 'roadmap', 'funnel', 'pyramid', 'layers', 'org', 'tree', 'radial', 'journey', 'changelog'],
  },
  {
    name: '数値・結果',
    classes: ['stat', 'kpi', 'impact', 'okr', 'status', 'experiment', 'hypothesis', 'tam-sam-som', 'tam-sam-som-circle', 'case-study', 'contact'],
  },
  {
    name: '教育',
    classes: ['quiz', 'answer', 'code-focus', 'misconception', 'cheatsheet'],
  },
];

/** カタログ(cls配列)をグループに割り付ける。未分類は「その他」へ */
export function groupLayouts(catalog) {
  const known = new Set(LAYOUT_GROUPS.flatMap((g) => g.classes));
  const byCls = new Map(catalog.map((l) => [l.cls, l]));
  const groups = LAYOUT_GROUPS.map((g) => ({
    name: g.name,
    items: g.classes.map((c) => byCls.get(c)).filter(Boolean),
  })).filter((g) => g.items.length > 0);
  const rest = catalog.filter((l) => !known.has(l.cls));
  if (rest.length > 0) groups.push({ name: 'その他', items: rest });
  return groups;
}
