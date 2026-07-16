/*
 * Deck-level quality checks that do not require a browser.
 * Keep this module free of Node-only imports so the WebUI can reuse it.
 */

const DENSE_LAYOUTS = new Set([
  "references",
  "cheatsheet",
  "table",
  "benchmark",
  "experiment",
  "matrix-3",
  "confusion-matrix",
  "qualitative-grid",
]);

const TITLE_LIMIT = 46;
const BODY_LIMIT = 520;
const NOTE_EXEMPT_LAYOUTS = new Set([
  "agenda",
  "agenda-grid",
  "divider",
  "end",
  "references",
  "title",
  "title-visual",
]);

const PLACEHOLDER_NOTE_PATTERNS = [
  /\{\{[^}]+\}\}/,
  /^(?:TODO|TBD|FIXME|XXX)(?:\s*[:：].*)?$/i,
  /^(?:speaker|presenter)\s+notes?(?:\s*[:：].*)?$/i,
  /^(?:発表者ノート|話す内容|説明メモ)(?:\s*[:：].*)?$/,
  /ここに.{0,30}(?:話す内容|説明|ノート).{0,30}(?:記入|追加|書)/,
  /^\s*\[(?!\d+(?:\s*[-,]\s*\d+)*\s*\])[^\]\n]+\]\s*$/,
];

export function classOf(raw) {
  return raw.match(/<!--\s*_class:\s*([^>]*?)\s*-->/)?.[1]?.trim() ?? "";
}

export function stripPresentationSyntax(raw) {
  return raw
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/^\s{0,3}(?:#{1,6}|[-+*]|\d+[.)]|>)[ \t]*/gm, "")
    .replace(/[*_`|~]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

export function imageRefs(raw) {
  const refs = [];
  const re = /!\[([^\]]*)\]\((?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\)/g;
  for (const match of raw.matchAll(re)) {
    refs.push({ alt: match[1].trim(), src: (match[2] ?? match[3]).trim() });
  }
  return refs;
}

/** Marp directives are comments too, so only return comments that become presenter notes. */
export function presenterNotes(raw) {
  return [...raw.matchAll(/<!--([\s\S]*?)-->/g)]
    .map((match) => match[1].trim())
    .filter((text) => text && !/^_?[\w.-]+\s*:/i.test(text));
}

export function isPlaceholderPresenterNote(text) {
  const normalized = String(text).trim();
  return PLACEHOLDER_NOTE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function frontmatterRequires(frontmatter, key) {
  const pattern = new RegExp(`^\\s*${key}\\s*:\\s*["']?required["']?\\s*(?:#.*)?$`, "im");
  return pattern.test(frontmatter ?? "");
}

function issue(slide, severity, code, message) {
  return { slide, severity, code, message };
}

export function analyzeDeckSource(
  { slides, frontmatter = "" },
  { requirePresenterNotes = frontmatterRequires(frontmatter, "sf_notes") } = {},
) {
  const issues = [];
  const classes = slides.map(classOf);

  slides.forEach((raw, index) => {
    const slide = index + 1;
    const cls = classes[index].split(/\s+/)[0] || "content";
    const inspectable = raw.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, "");
    const headings = [...inspectable.matchAll(/^#\s+(.+)$/gm)].map((m) => m[1].trim());
    if (headings.length === 0 && stripPresentationSyntax(raw)) {
      issues.push(issue(slide, "warning", "missing-title", "スライドタイトル(h1)がありません"));
    } else if (headings.length > 1) {
      issues.push(issue(slide, "error", "multiple-titles", `h1が${headings.length}個あります`));
    }
    if (headings[0] && [...headings[0]].length > TITLE_LIMIT) {
      issues.push(
        issue(slide, "warning", "long-title", `タイトルが長すぎます (${[...headings[0]].length}文字)`),
      );
    }

    const topLevelItems = inspectable.split("\n").filter((line) => /^(?:[-+*]|\d+[.)])\s+/.test(line)).length;
    if (!DENSE_LAYOUTS.has(cls) && topLevelItems > 6) {
      issues.push(issue(slide, "warning", "too-many-items", `箇条書きが多すぎます (${topLevelItems}項目)`));
    }

    const chars = [...stripPresentationSyntax(raw)].length;
    if (!DENSE_LAYOUTS.has(cls) && chars > BODY_LIMIT) {
      issues.push(issue(slide, "warning", "text-density", `本文量が多すぎます (${chars}文字)`));
    }

    for (const ref of imageRefs(inspectable)) {
      if (!ref.alt) {
        issues.push(issue(slide, "warning", "missing-alt", `画像 ${ref.src} に説明的なalt textがありません`));
      }
      if (/^https?:\/\//i.test(ref.src)) {
        issues.push(issue(slide, "error", "remote-asset", `外部画像 ${ref.src} はオフライン出力で欠落します`));
      }
    }

    const notes = presenterNotes(raw);
    const requiresNotes =
      requirePresenterNotes &&
      !NOTE_EXEMPT_LAYOUTS.has(cls) &&
      stripPresentationSyntax(raw).length > 0;
    if (requiresNotes && notes.length === 0) {
      issues.push(
        issue(slide, "warning", "missing-presenter-notes", "発表者ノートがありません"),
      );
    }
    if (notes.some(isPlaceholderPresenterNote)) {
      issues.push(
        issue(
          slide,
          "warning",
          "placeholder-presenter-notes",
          "発表者ノートがTODO・入力待ちのままです",
        ),
      );
    }
  });

  for (let start = 0; start < classes.length; ) {
    let end = start + 1;
    while (end < classes.length && classes[end] === classes[start]) end += 1;
    if (classes[start] && end - start >= 4) {
      issues.push(
        issue(
          start + 1,
          "warning",
          "layout-streak",
          `${classes[start]} が${end - start}枚連続しています (slide ${start + 1}-${end})`,
        ),
      );
    }
    start = end;
  }

  return issues;
}

export function summarizeIssues(issues) {
  return issues.reduce(
    (summary, item) => {
      summary[item.severity] = (summary[item.severity] ?? 0) + 1;
      return summary;
    },
    { error: 0, warning: 0 },
  );
}

export function estimateDeckMinutes(slides) {
  let seconds = 0;
  for (const raw of slides) {
    const noteBlocks = presenterNotes(raw);
    const source = noteBlocks.length ? noteBlocks.join("\n") : stripPresentationSyntax(raw);
    const latinWords = source.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length ?? 0;
    const nonLatinChars = [...source.replace(/[A-Za-z0-9\s.,:;!?()'"/+-]/g, "")].length;
    // 発表時の目安: 英語130語/分、日本語300字/分。切替・指差し用に1枚5秒を加える。
    seconds += (latinWords / 130 + nonLatinChars / 300) * 60 + 5;
  }
  return Math.max(1, Math.round(seconds / 60));
}
