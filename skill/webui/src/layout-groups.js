/*
 * layout-groups.js — レイアウトピッカーのタブ分け(表示用のグルーピング)。
 * カタログの正は SKILL.md。ここに載っていない新レイアウトは「その他」タブに出る。
 */

export const LAYOUT_GROUPS = [
  {
    name: "導入・締め",
    classes: [
      "title",
      "title-visual",
      "agenda",
      "agenda-grid",
      "objectives",
      "divider",
      "lead",
      "exec-summary",
      "takeaway",
      "summary",
      "contact",
      "end",
      "references",
    ],
  },
  {
    name: "本文",
    classes: [
      "content",
      "content-lead",
      "two-column",
      "sidebar",
      "columns",
      "cards",
      "spec",
      "faq",
      "checklist",
      "quote",
      "quotes",
      "code",
      "math",
      "definition",
      "glossary",
    ],
  },
  {
    name: "画像",
    classes: [
      "image-right",
      "image-left",
      "image-top",
      "image-bottom",
      "image-full",
      "annotated",
      "browser",
      "zoom",
      "phone",
      "app-intro",
      "quote-photo",
      "gallery",
      "photo-grid",
      "collage",
      "image-cards",
      "before-after",
      "qualitative-grid",
      "logos",
      "profile",
      "team",
      "persona",
    ],
  },
  {
    name: "比較・分類",
    classes: [
      "comparison",
      "comparison-3",
      "pros-cons",
      "transition",
      "table",
      "benchmark",
      "matrix",
      "matrix-3",
      "swot",
      "pest",
      "venn",
      "venn-3",
      "positioning",
      "ranking",
      "plans",
      "scorecard",
      "forces",
      "bmc",
    ],
  },
  {
    name: "プロセス・構造",
    classes: [
      "steps",
      "steps-v",
      "steps-photo",
      "flow",
      "chain",
      "io",
      "cycle",
      "timeline",
      "timeline-h",
      "timeline-photo",
      "gantt",
      "roadmap",
      "kanban",
      "funnel",
      "pyramid",
      "pyramid-tri",
      "logic-tree",
      "layers",
      "org",
      "tree",
      "radial",
      "causes",
      "journey",
    ],
  },
  {
    name: "数値・結果",
    classes: [
      "stat",
      "stat-ring",
      "kpi",
      "impact",
      "okr",
      "actions",
      "risks",
      "experiment",
      "hypothesis",
      "rq",
      "confusion-matrix",
      "tam-sam-som",
      "tam-sam-som-circle",
      "case-study",
      "chart-insight",
    ],
  },
  {
    name: "状態・例外",
    classes: [
      "callout",
      "status",
      "changelog",
      "draft",
      "confidential",
      "deprecated",
    ],
  },
  {
    name: "教育",
    classes: [
      "quiz",
      "answer",
      "code-focus",
      "misconception",
      "cheatsheet",
      "code-compare",
    ],
  },
];

/** カタログ(cls配列)をグループに割り付ける。未分類は「その他」へ */
export function groupLayouts(catalog) {
  if (catalog.length > 0 && catalog.every((layout) => layout.groupLabel)) {
    const byGroup = new Map();
    for (const layout of catalog) {
      if (!byGroup.has(layout.group)) {
        byGroup.set(layout.group, { name: layout.groupLabel, items: [] });
      }
      byGroup.get(layout.group).items.push(layout);
    }
    return [...byGroup.values()];
  }
  const known = new Set(LAYOUT_GROUPS.flatMap((g) => g.classes));
  const byCls = new Map(catalog.map((l) => [l.cls, l]));
  const groups = LAYOUT_GROUPS.map((g) => ({
    name: g.name,
    items: g.classes.map((c) => byCls.get(c)).filter(Boolean),
  })).filter((g) => g.items.length > 0);
  const rest = catalog.filter((l) => !known.has(l.cls));
  if (rest.length > 0) groups.push({ name: "その他", items: rest });
  return groups;
}
