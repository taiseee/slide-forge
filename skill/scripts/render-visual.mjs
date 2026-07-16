#!/usr/bin/env node
/*
 * render-visual.mjs — YAML / JSON からスライド向けのオフライン SVG を生成する。
 *
 * Charts: bar, line, scatter, area, heatmap (Vega-Lite)
 * Diagrams: pipeline, architecture, sequence (Mermaid)
 *
 * CLI:
 *   node scripts/render-visual.mjs visual.yaml [--theme research]
 *        [--output assets/visual.svg]
 *
 * API:
 *   import { loadVisualSpec, renderVisual } from "./render-visual.mjs";
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import * as yaml from "js-yaml";
import puppeteer from "puppeteer";
import * as vega from "vega";
import * as vegaLite from "vega-lite";

const CHART_TYPES = new Set(["bar", "line", "scatter", "area", "heatmap"]);
const DIAGRAM_TYPES = new Set(["pipeline", "architecture", "sequence"]);
const VISUAL_TYPES = new Set([...CHART_TYPES, ...DIAGRAM_TYPES]);
const MOTIONS = new Set(["off", "fade", "wipe", "draw", "highlight"]);
const VISUAL_SCHEMA_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "visual.schema.json");
const visualSchema = JSON.parse(await fs.readFile(VISUAL_SCHEMA_PATH, "utf8"));
const validateAgainstSchema = new Ajv2020({ allErrors: true, strict: false }).compile(visualSchema);

export const THEMES = Object.freeze({
  research: {
    background: "#ffffff",
    text: "#2f3237",
    muted: "#666d76",
    line: "#e3e5e9",
    panel: "#eef0f3",
    accent: "#566173",
    strong: "#343c48",
    series: ["#566173", "#9aa3b1", "#343c48", "#c5cad2", "#727b89"],
  },
  business: {
    background: "#fbfaf7",
    text: "#38332c",
    muted: "#6b655b",
    line: "#e6e0d4",
    panel: "#f1ece2",
    accent: "#8a7a63",
    strong: "#55483a",
    series: ["#8a7a63", "#b8a98f", "#55483a", "#d1c2aa", "#6d6256"],
  },
  lecture: {
    background: "#fbfcfa",
    text: "#2f342f",
    muted: "#646b63",
    line: "#e1e5df",
    panel: "#edf1ea",
    accent: "#5c7360",
    strong: "#3b4c40",
    series: ["#5c7360", "#8ea593", "#3b4c40", "#b9c7bb", "#708b75"],
  },
  soft: {
    background: "#fdfdfc",
    text: "#3a3735",
    muted: "#6c665f",
    line: "#eae6e1",
    panel: "#f3f0ec",
    accent: "#c4705c",
    strong: "#8e4a3e",
    series: ["#c4705c", "#df9a89", "#8e4a3e", "#e8bcb0", "#a95e4f"],
  },
});

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isScalar(value) {
  return ["string", "number", "boolean"].includes(typeof value);
}

function validationError(errors) {
  const error = new Error(`Invalid visual spec:\n- ${errors.join("\n- ")}`);
  error.name = "VisualSpecError";
  return error;
}

export function validateVisualSpec(spec) {
  const errors = [];
  if (!isObject(spec)) throw validationError(["root must be an object"]);

  if (!validateAgainstSchema(spec)) {
    errors.push(...validateAgainstSchema.errors.map((error) => {
      const location = error.instancePath || "root";
      return `${location} ${error.message}`;
    }));
  }

  if (!VISUAL_TYPES.has(spec.type)) {
    errors.push(`type must be one of: ${[...VISUAL_TYPES].join(", ")}`);
  }
  if (typeof spec.alt !== "string" || spec.alt.trim().length === 0) {
    errors.push("alt must be a non-empty string");
  }
  if (spec.theme !== undefined && !Object.hasOwn(THEMES, spec.theme)) {
    errors.push(`theme must be one of: ${Object.keys(THEMES).join(", ")}`);
  }
  if (spec.motion !== undefined && !MOTIONS.has(spec.motion)) {
    errors.push(`motion must be one of: ${[...MOTIONS].join(", ")}`);
  }
  if (spec.width !== undefined && (!Number.isInteger(spec.width) || spec.width < 320 || spec.width > 2400)) {
    errors.push("width must be an integer from 320 to 2400");
  }
  if (spec.height !== undefined && (!Number.isInteger(spec.height) || spec.height < 180 || spec.height > 1600)) {
    errors.push("height must be an integer from 180 to 1600");
  }
  if (spec.highlight !== undefined) {
    if (Array.isArray(spec.highlight) && spec.highlight.length === 0) {
      errors.push("highlight array must not be empty");
    } else if (isObject(spec.highlight)) {
      if (typeof spec.highlight.field !== "string" || spec.highlight.field.length === 0) {
        errors.push("highlight object requires a field");
      }
      if (spec.highlight.value === undefined && !Array.isArray(spec.highlight.values)) {
        errors.push("highlight object requires value or values");
      }
      if (Array.isArray(spec.highlight.values) && spec.highlight.values.length === 0) {
        errors.push("highlight.values must not be empty");
      }
    } else if (!Array.isArray(spec.highlight) && !isScalar(spec.highlight)) {
      errors.push("highlight must be a scalar, non-empty array, or field/value object");
    }
  }

  if (CHART_TYPES.has(spec.type)) {
    if (!Array.isArray(spec.data) || spec.data.length === 0) {
      errors.push("chart data must be a non-empty array");
    } else {
      spec.data.forEach((row, index) => {
        if (!isObject(row)) {
          errors.push(`data[${index}] must be an object`);
          return;
        }
        if (spec.type === "heatmap") {
          if (!isScalar(row.x) || !isScalar(row.y) || !Number.isFinite(row.value)) {
            errors.push(`data[${index}] for heatmap requires scalar x/y and numeric value`);
          }
        } else if (spec.type === "scatter") {
          if (!Number.isFinite(row.x) || !Number.isFinite(row.y)) {
            errors.push(`data[${index}] for scatter requires numeric x/y`);
          }
        } else if (!isScalar(row.x) || !Number.isFinite(row.y)) {
          errors.push(`data[${index}] requires scalar x and numeric y`);
        }
        if (row.series !== undefined && !isScalar(row.series)) {
          errors.push(`data[${index}].series must be a scalar`);
        }
      });
    }
  }

  if (["pipeline", "architecture"].includes(spec.type)) {
    if (!isObject(spec.data)) {
      errors.push(`${spec.type} data must be an object`);
    } else {
      const nodes = spec.data.nodes;
      const edges = spec.data.edges;
      if (!Array.isArray(nodes) || nodes.length === 0) {
        errors.push(`${spec.type} data.nodes must be a non-empty array`);
      }
      if (!Array.isArray(edges)) {
        errors.push(`${spec.type} data.edges must be an array`);
      }
      if (Array.isArray(nodes)) {
        const ids = new Set();
        nodes.forEach((node, index) => {
          if (!isObject(node) || typeof node.id !== "string" || typeof node.label !== "string") {
            errors.push(`data.nodes[${index}] requires string id and label`);
            return;
          }
          if (ids.has(node.id)) errors.push(`duplicate node id: ${node.id}`);
          ids.add(node.id);
        });
        if (Array.isArray(edges)) {
          edges.forEach((edge, index) => {
            if (!isObject(edge) || !ids.has(edge.from) || !ids.has(edge.to)) {
              errors.push(`data.edges[${index}] must reference existing from/to node ids`);
            }
          });
        }
      }
    }
  }

  if (spec.type === "sequence") {
    if (!isObject(spec.data)) {
      errors.push("sequence data must be an object");
    } else {
      const actors = spec.data.actors;
      const messages = spec.data.messages;
      if (!Array.isArray(actors) || actors.length < 2) {
        errors.push("sequence data.actors must contain at least two actors");
      }
      if (!Array.isArray(messages) || messages.length === 0) {
        errors.push("sequence data.messages must be a non-empty array");
      }
      if (Array.isArray(actors)) {
        const ids = new Set();
        actors.forEach((actor, index) => {
          if (!isObject(actor) || typeof actor.id !== "string" || typeof actor.label !== "string") {
            errors.push(`data.actors[${index}] requires string id and label`);
            return;
          }
          if (ids.has(actor.id)) errors.push(`duplicate actor id: ${actor.id}`);
          ids.add(actor.id);
        });
        if (Array.isArray(messages)) {
          messages.forEach((message, index) => {
            if (
              !isObject(message) ||
              !ids.has(message.from) ||
              !ids.has(message.to) ||
              typeof message.text !== "string"
            ) {
              errors.push(`data.messages[${index}] requires existing from/to actors and text`);
            }
          });
        }
      }
    }
  }

  if (spec.annotations !== undefined) {
    if (!Array.isArray(spec.annotations)) {
      errors.push("annotations must be an array");
    } else {
      spec.annotations.forEach((annotation, index) => {
        if (!isObject(annotation) || typeof annotation.text !== "string") {
          errors.push(`annotations[${index}] requires text`);
          return;
        }
        if (CHART_TYPES.has(spec.type) && annotation.x === undefined && annotation.y === undefined) {
          errors.push(`annotations[${index}] for a chart requires x or y`);
        }
        if (
          CHART_TYPES.has(spec.type) &&
          spec.type !== "heatmap" &&
          annotation.y !== undefined &&
          !Number.isFinite(annotation.y)
        ) {
          errors.push(`annotations[${index}].y must be numeric for ${spec.type}`);
        }
        if (["pipeline", "architecture"].includes(spec.type)) {
          const ids = new Set(spec.data?.nodes?.map((node) => node.id) ?? []);
          if (typeof annotation.target !== "string" || !ids.has(annotation.target)) {
            errors.push(`annotations[${index}] must target an existing node`);
          }
        }
        if (spec.type === "sequence") {
          const ids = new Set(spec.data?.actors?.map((actor) => actor.id) ?? []);
          if (typeof annotation.target !== "string" || !ids.has(annotation.target)) {
            errors.push(`annotations[${index}] must target an existing actor`);
          }
        }
      });
    }
  }

  if (errors.length > 0) throw validationError(errors);
  return spec;
}

export async function loadVisualSpec(file) {
  const source = await fs.readFile(file, "utf8");
  let parsed;
  try {
    parsed = path.extname(file).toLowerCase() === ".json" ? JSON.parse(source) : yaml.load(source);
  } catch (error) {
    throw new Error(`Could not parse ${file}: ${error.message}`);
  }
  return validateVisualSpec(parsed);
}

function normalizedHighlight(highlight, rows) {
  if (highlight === undefined || highlight === null || highlight === false) return null;
  if (isObject(highlight)) {
    const values = Array.isArray(highlight.values) ? highlight.values : [highlight.value];
    return {
      field: highlight.field,
      values: values.filter((value) => value !== undefined),
    };
  }
  const values = Array.isArray(highlight) ? highlight : [highlight];
  const candidateFields = ["series", "x", "y", "value"];
  const field = candidateFields.find((candidate) => rows.some((row) => values.includes(row[candidate]))) ?? "x";
  return { field, values };
}

function highlightPredicate(highlight) {
  if (!highlight || typeof highlight.field !== "string" || highlight.values.length === 0) return null;
  const field = JSON.stringify(highlight.field);
  const values = JSON.stringify(highlight.values);
  return `indexof(${values}, datum[${field}]) >= 0`;
}

function chartConfig(theme) {
  return {
    background: theme.background,
    font: "Arial, Helvetica, sans-serif",
    view: { stroke: null },
    axis: {
      domainColor: theme.line,
      domainWidth: 1,
      gridColor: theme.line,
      gridOpacity: 0.8,
      labelColor: theme.muted,
      labelFont: "Arial, Helvetica, sans-serif",
      labelFontSize: 18,
      labelPadding: 10,
      tickColor: theme.line,
      titleColor: theme.text,
      titleFont: "Arial, Helvetica, sans-serif",
      titleFontSize: 20,
      titleFontWeight: 500,
      titlePadding: 18,
    },
    legend: {
      labelColor: theme.muted,
      labelFont: "Arial, Helvetica, sans-serif",
      labelFontSize: 17,
      symbolStrokeWidth: 4,
      title: null,
    },
    title: {
      anchor: "start",
      color: theme.text,
      font: "Arial, Helvetica, sans-serif",
      fontSize: 24,
      fontWeight: 600,
      offset: 20,
    },
  };
}

function seriesEncoding(rows, theme) {
  if (!rows.some((row) => row.series !== undefined)) return undefined;
  return {
    field: "series",
    type: "nominal",
    scale: { range: theme.series },
    legend: { orient: "bottom", direction: "horizontal" },
  };
}

function chartBaseEncoding(spec, xType) {
  return {
    x: {
      field: "x",
      type: xType,
      title: spec.x_label ?? null,
      sort: xType === "nominal" ? [...new Set(spec.data.map((row) => row.x))] : undefined,
      axis: xType === "nominal" ? { labelAngle: 0, labelLimit: 180 } : undefined,
    },
    y: {
      field: "y",
      type: "quantitative",
      title: spec.y_label ?? null,
      axis: spec.value_format ? { format: spec.value_format } : undefined,
      scale: spec.zero === false ? { zero: false } : undefined,
    },
  };
}

function annotationLayers(spec, theme, xType, yType = "quantitative") {
  const annotations = spec.annotations ?? [];
  const layers = [];
  const xSort = xType === "nominal" ? [...new Set(spec.data.map((row) => row.x))] : undefined;
  const ySort = yType === "nominal" ? [...new Set(spec.data.map((row) => row.y))] : undefined;
  const points = annotations.filter((annotation) => annotation.x !== undefined && annotation.y !== undefined);
  const verticalRules = annotations.filter((annotation) => annotation.x !== undefined && annotation.y === undefined);
  const horizontalRules = annotations.filter((annotation) => annotation.x === undefined && annotation.y !== undefined);

  if (points.length > 0) {
    layers.push({
      data: { values: points },
      mark: { type: "point", filled: true, size: 120, color: theme.strong },
      encoding: {
        x: { field: "x", type: xType, sort: xSort },
        y: { field: "y", type: yType, sort: ySort },
      },
    });
    layers.push({
      data: { values: points },
      mark: {
        type: "text",
        align: "center",
        baseline: "bottom",
        dy: -12,
        font: "Arial, Helvetica, sans-serif",
        fontSize: 17,
        fontWeight: 600,
        color: theme.text,
      },
      encoding: {
        x: { field: "x", type: xType, sort: xSort },
        y: { field: "y", type: yType, sort: ySort },
        text: { field: "text", type: "nominal" },
      },
    });
  }
  if (verticalRules.length > 0) {
    layers.push({
      data: { values: verticalRules },
      mark: { type: "rule", strokeDash: [6, 5], color: theme.strong, strokeWidth: 2 },
      encoding: { x: { field: "x", type: xType, sort: xSort } },
    });
    layers.push({
      data: { values: verticalRules },
      mark: { type: "text", angle: 270, align: "right", dx: -8, fontSize: 16, color: theme.text },
      encoding: {
        x: { field: "x", type: xType, sort: xSort },
        y: { value: 8 },
        text: { field: "text", type: "nominal" },
      },
    });
  }
  if (horizontalRules.length > 0) {
    layers.push({
      data: { values: horizontalRules },
      mark: { type: "rule", strokeDash: [6, 5], color: theme.strong, strokeWidth: 2 },
      encoding: { y: { field: "y", type: yType, sort: ySort } },
    });
    layers.push({
      data: { values: horizontalRules },
      mark: { type: "text", align: "right", baseline: "bottom", dx: -8, dy: -6, fontSize: 16, color: theme.text },
      encoding: {
        x: { value: spec.width ?? 1100 },
        y: { field: "y", type: yType, sort: ySort },
        text: { field: "text", type: "nominal" },
      },
    });
  }
  return layers;
}

function buildChartSpec(spec, themeName) {
  const theme = THEMES[themeName];
  const width = spec.width ?? 1100;
  const height = spec.height ?? 560;
  const series = seriesEncoding(spec.data, theme);
  const highlight = normalizedHighlight(spec.highlight, spec.data);
  const predicate = highlightPredicate(highlight);
  const xType = ["scatter", "line", "area"].includes(spec.type) && spec.data.every((row) => typeof row.x === "number")
    ? "quantitative"
    : "nominal";
  let mainLayer;

  if (spec.type === "heatmap") {
    const xOrder = [...new Set(spec.data.map((row) => row.x))];
    const yOrder = [...new Set(spec.data.map((row) => row.y))];
    const encoding = {
      x: { field: "x", type: "nominal", title: spec.x_label ?? null, sort: xOrder },
      y: { field: "y", type: "nominal", title: spec.y_label ?? null, sort: yOrder },
      color: {
        field: "value",
        type: "quantitative",
        title: spec.value_label ?? null,
        scale: { range: [theme.panel, theme.accent, theme.strong] },
        legend: { orient: "right" },
      },
    };
    if (predicate) {
      encoding.stroke = { condition: { test: predicate, value: theme.strong }, value: theme.background };
      encoding.strokeWidth = { condition: { test: predicate, value: 4 }, value: 2 };
    }
    mainLayer = {
      mark: { type: "rect", cornerRadius: themeName === "soft" ? 8 : 0 },
      encoding,
    };
  } else {
    const encoding = chartBaseEncoding(spec, xType);
    if (series) encoding.color = series;
    if (predicate) encoding.opacity = { condition: { test: predicate, value: 1 }, value: 0.28 };

    if (spec.type === "bar") {
      mainLayer = {
        mark: { type: "bar", color: series ? undefined : theme.accent, cornerRadiusTopLeft: themeName === "soft" ? 8 : 0, cornerRadiusTopRight: themeName === "soft" ? 8 : 0 },
        encoding: {
          ...encoding,
          ...(series ? { xOffset: { field: "series" } } : {}),
        },
      };
    } else if (spec.type === "line") {
      mainLayer = {
        mark: { type: "line", color: series ? undefined : theme.accent, strokeWidth: 4, point: { filled: true, size: 70 } },
        encoding,
      };
    } else if (spec.type === "area") {
      mainLayer = {
        mark: { type: "area", color: series ? undefined : theme.accent, opacity: predicate ? undefined : 0.78, line: { strokeWidth: 3 } },
        encoding,
      };
    } else {
      mainLayer = {
        mark: { type: "point", filled: true, color: series ? undefined : theme.accent, size: 120, opacity: predicate ? undefined : 0.9 },
        encoding: {
          ...encoding,
          ...(spec.size_field ? { size: { field: spec.size_field, type: "quantitative", legend: null } } : {}),
        },
      };
    }
  }

  const layers = [
    mainLayer,
    ...(predicate
      ? [{
        // VegaのSVGでは `sf_highlight_marks` になる。decorateSvg がこの
        // レイヤーだけを data-sf-highlight としてモーション対象にする。
        name: "sf-highlight",
        transform: [{ filter: predicate }],
        mark: spec.type === "area"
          ? { type: "point", filled: true, size: 150, color: series ? undefined : theme.accent }
          : structuredClone(mainLayer.mark),
        encoding: (() => {
          const encoding = structuredClone(mainLayer.encoding);
          // 元レイヤーのlowlight条件を重ねず、選択対象を必ず最終色で描く。
          delete encoding.opacity;
          return encoding;
        })(),
      }]
      : []),
    ...annotationLayers(
      spec,
      theme,
      spec.type === "heatmap" ? "nominal" : xType,
      spec.type === "heatmap" ? "nominal" : "quantitative",
    ),
  ];
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    width,
    height,
    background: theme.background,
    padding: 12,
    autosize: { type: "pad", contains: "padding" },
    ...(spec.title ? { title: spec.title } : {}),
    data: { values: spec.data },
    layer: layers,
    config: chartConfig(theme),
  };
}

async function renderChart(spec, themeName) {
  const vegaLiteSpec = buildChartSpec(spec, themeName);
  const compiled = vegaLite.compile(vegaLiteSpec, { config: vegaLiteSpec.config });
  const runtime = vega.parse(compiled.spec);
  const view = new vega.View(runtime, { renderer: "none" });
  try {
    return await view.toSVG();
  } finally {
    view.finalize();
  }
}

function escapeMermaidLabel(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\n", " ")
    .replaceAll(";", "&#59;");
}

function highlightValues(highlight) {
  if (highlight === undefined || highlight === null) return [];
  if (isObject(highlight)) {
    const values = Array.isArray(highlight.values) ? highlight.values : [highlight.value];
    return values.filter((value) => value !== undefined).map(String);
  }
  return (Array.isArray(highlight) ? highlight : [highlight]).map(String);
}

function buildFlowDiagram(spec, themeName) {
  const theme = THEMES[themeName];
  const direction = spec.data.direction ?? (spec.type === "pipeline" ? "LR" : "TB");
  const nodeNames = new Map(spec.data.nodes.map((node, index) => [node.id, `n${index}`]));
  const groupNames = new Map((spec.data.groups ?? []).map((group, index) => [group.id, `g${index}`]));
  const lines = [`flowchart ${direction}`];
  const grouped = new Set();

  for (const group of spec.data.groups ?? []) {
    lines.push(`  subgraph ${groupNames.get(group.id)}["${escapeMermaidLabel(group.label)}"]`);
    lines.push(`    direction ${group.direction ?? "LR"}`);
    for (const node of spec.data.nodes.filter((candidate) => candidate.group === group.id)) {
      grouped.add(node.id);
      lines.push(`    ${nodeNames.get(node.id)}["${escapeMermaidLabel(node.label)}"]`);
    }
    lines.push("  end");
  }
  for (const node of spec.data.nodes.filter((candidate) => !grouped.has(candidate.id))) {
    lines.push(`  ${nodeNames.get(node.id)}["${escapeMermaidLabel(node.label)}"]`);
  }
  for (const edge of spec.data.edges) {
    const arrow = edge.kind === "dashed" ? "-.->" : edge.kind === "open" ? "---" : "-->";
    const label = edge.label ? `|"${escapeMermaidLabel(edge.label)}"|` : "";
    lines.push(`  ${nodeNames.get(edge.from)} ${arrow}${label} ${nodeNames.get(edge.to)}`);
  }

  (spec.annotations ?? []).forEach((annotation, index) => {
    if (!nodeNames.has(annotation.target)) return;
    lines.push(`  a${index}["${escapeMermaidLabel(annotation.text)}"]:::annotation`);
    lines.push(`  a${index} -.-> ${nodeNames.get(annotation.target)}`);
  });

  const highlighted = highlightValues(spec.highlight)
    .map((value) => nodeNames.get(value))
    .filter(Boolean);
  lines.push(`  classDef default fill:${theme.panel},stroke:${theme.accent},color:${theme.text},stroke-width:2px`);
  lines.push(`  classDef annotation fill:${theme.background},stroke:${theme.line},color:${theme.muted},stroke-dasharray:5 4`);
  lines.push(`  classDef highlight fill:${theme.strong},stroke:${theme.strong},color:${theme.background},stroke-width:3px`);
  if (highlighted.length > 0) lines.push(`  class ${highlighted.join(",")} highlight`);
  return lines.join("\n");
}

function buildSequenceDiagram(spec) {
  const actorNames = new Map(spec.data.actors.map((actor, index) => [actor.id, `p${index}`]));
  const lines = ["sequenceDiagram"];
  for (const actor of spec.data.actors) {
    lines.push(`  participant ${actorNames.get(actor.id)} as ${escapeMermaidLabel(actor.label)}`);
  }
  const arrows = {
    sync: "->>",
    async: "-)",
    return: "-->>",
    error: "--x",
  };
  for (const message of spec.data.messages) {
    const arrow = arrows[message.kind] ?? arrows.sync;
    lines.push(
      `  ${actorNames.get(message.from)}${arrow}${actorNames.get(message.to)}: ${escapeMermaidLabel(message.text)}`,
    );
  }
  for (const annotation of spec.annotations ?? []) {
    if (actorNames.has(annotation.target)) {
      const actor = actorNames.get(annotation.target);
      lines.push(`  Note over ${actor}: ${escapeMermaidLabel(annotation.text)}`);
    }
  }
  return lines.join("\n");
}

let mermaidBundlePromise;
const require = createRequire(import.meta.url);
async function mermaidBundle() {
  mermaidBundlePromise ??= fs.readFile(require.resolve("mermaid/dist/mermaid.min.js"), "utf8");
  return mermaidBundlePromise;
}

async function renderDiagram(spec, themeName) {
  const theme = THEMES[themeName];
  const definition = spec.type === "sequence" ? buildSequenceDiagram(spec) : buildFlowDiagram(spec, themeName);
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: spec.width ?? 1200, height: spec.height ?? 675, deviceScaleFactor: 1 });
    await page.setContent("<!doctype html><html><body></body></html>");
    await page.addScriptTag({ content: await mermaidBundle() });
    return await page.evaluate(
      async ({ definition, theme, type }) => {
        globalThis.mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          deterministicIds: true,
          deterministicIDSeed: `slide-forge-${type}`,
          theme: "base",
          fontFamily: "Arial, Helvetica, sans-serif",
          flowchart: { htmlLabels: false, curve: "linear", useMaxWidth: false },
          sequence: { useMaxWidth: false, mirrorActors: false, wrap: true },
          themeVariables: {
            background: theme.background,
            primaryColor: theme.panel,
            primaryTextColor: theme.text,
            primaryBorderColor: theme.accent,
            lineColor: theme.muted,
            secondaryColor: theme.background,
            tertiaryColor: theme.panel,
            noteBkgColor: theme.background,
            noteBorderColor: theme.line,
            noteTextColor: theme.text,
            actorBkg: theme.panel,
            actorBorder: theme.accent,
            actorTextColor: theme.text,
            signalColor: theme.muted,
            signalTextColor: theme.text,
            labelBoxBkgColor: theme.background,
            labelBoxBorderColor: theme.line,
            labelTextColor: theme.text,
          },
        });
        const result = await globalThis.mermaid.render("sf-visual-diagram", definition);
        return result.svg;
      },
      { definition, theme, type: spec.type },
    );
  } finally {
    await browser.close();
  }
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function decorateSvg(svg, spec, themeName) {
  const hash = crypto.createHash("sha256").update(`${spec.type}:${spec.alt}`).digest("hex").slice(0, 12);
  const titleId = `sf-visual-title-${hash}`;
  const descId = `sf-visual-desc-${hash}`;
  const title = spec.title ?? `${spec.type} visual`;
  const motion = spec.motion ?? "off";
  let decorated = svg.replace(/<svg\b([^>]*)>/, (_match, attributes) => {
    const cleaned = attributes
      .replace(/\s(?:role|aria-labelledby|aria-describedby|data-sf-visual|data-sf-theme|data-sf-motion)=(?:"[^"]*"|'[^']*')/g, "")
      .replace(/\saria-roledescription=(?:"[^"]*"|'[^']*')/g, "");
    return `<svg${cleaned} role="img" aria-labelledby="${titleId} ${descId}" data-sf-visual="${spec.type}" data-sf-theme="${themeName}" data-sf-motion="${motion}">`;
  });
  decorated = decorated.replace(
    /(<svg\b[^>]*>)/,
    `$1<title id="${titleId}">${escapeXml(title)}</title><desc id="${descId}">${escapeXml(spec.alt)}</desc>`,
  );
  // Vegaの専用レイヤーとMermaidのhighlightクラスを、埋め込み後も安定して
  // 参照できる共通属性へ変換する。表示上の静的highlightはそのまま残す。
  decorated = decorated.replace(
    /<([a-z][\w:-]*)\b([^>]*\bclass=(['"])([^'"]*)\3[^>]*)>/gi,
    (full, element, attributes, _quote, classNames) => {
      const classes = classNames.split(/\s+/);
      const target = classes.includes("highlight")
        || classes.some((className) => className.startsWith("sf_highlight"));
      if (!target || /\bdata-sf-highlight\b/i.test(attributes)) return full;
      return `<${element} data-sf-highlight="target"${attributes}>`;
    },
  );
  if (motion === "highlight" && !/\bdata-sf-highlight\b/i.test(decorated)) {
    decorated = decorated.replace(/<svg\b/i, '<svg data-sf-highlight="whole-visual"');
  }
  if (motion === "draw") {
    decorated = decorated.replace(
      /<(path|line|polyline|polygon)\b(?![^>]*\bdata-sf-draw\b)/gi,
      "<$1 data-sf-draw",
    );
  }
  return `${decorated.trim()}\n`;
}

export async function renderVisual(spec, options = {}) {
  validateVisualSpec(spec);
  const themeName = options.theme ?? spec.theme ?? "research";
  if (!Object.hasOwn(THEMES, themeName)) {
    throw new Error(`Unknown theme: ${themeName}`);
  }
  // Vega attaches internal Symbol properties to data rows. Render from a clone so
  // importing this module never mutates the caller's reusable visual spec.
  const renderSpec = structuredClone(spec);
  const rawSvg = CHART_TYPES.has(renderSpec.type)
    ? await renderChart(renderSpec, themeName)
    : await renderDiagram(renderSpec, themeName);
  return decorateSvg(rawSvg, spec, themeName);
}

export function defaultVisualPath(input) {
  const absolute = path.resolve(input);
  return /\.(?:ya?ml|json)$/i.test(absolute)
    ? absolute.replace(/\.(?:ya?ml|json)$/i, ".svg")
    : `${absolute}.svg`;
}

/** visual specを検証・描画し、入力を壊さない原子的な書き込みで保存する。 */
export async function renderVisualFile({ input, output = null, theme = undefined }) {
  const inputPath = path.resolve(input);
  const outputPath = path.resolve(output ?? defaultVisualPath(inputPath));
  const inputRealPath = await fs.realpath(inputPath);
  let outputRealPath = null;
  try {
    outputRealPath = await fs.realpath(outputPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (outputPath === inputPath || outputRealPath === inputRealPath) {
    throw new Error("visual output must not overwrite the source spec");
  }

  const spec = await loadVisualSpec(inputPath);
  const svg = await renderVisual(spec, { theme });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryDirectory = await fs.mkdtemp(path.join(path.dirname(outputPath), ".sf-visual-"));
  const temporaryOutput = path.join(temporaryDirectory, "visual.svg");
  try {
    await fs.writeFile(temporaryOutput, svg);
    await fs.rename(temporaryOutput, outputPath);
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
  return outputPath;
}

function parseCliArgs(values) {
  const args = { input: null };
  const assigned = new Set();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--output" || value === "-o" || value === "--theme") {
      const key = value === "--theme" ? "theme" : "output";
      const next = values[index + 1];
      if (!next || next.startsWith("-")) throw new Error(`${value} requires a value`);
      if (assigned.has(key)) throw new Error(`${value} may be specified only once`);
      assigned.add(key);
      args[key] = next;
      index += 1;
    }
    else if (!value.startsWith("-") && args.input === null) args.input = value;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

const isCli = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isCli) {
  try {
    const args = parseCliArgs(process.argv.slice(2));
    if (!args.input) {
      console.error("usage: node scripts/render-visual.mjs <visual.yaml|json> [--theme research] [--output visual.svg]");
      process.exitCode = 2;
    } else {
      const output = await renderVisualFile({
        input: args.input,
        output: args.output,
        theme: args.theme,
      });
      console.log(output);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
