import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  annotateMotionImages,
  buildMarpArgs,
  exportDeck,
  exportExtension,
  exportSuffix,
  parseMotionMode,
  postprocessHtml,
  prepareDrawSvg,
  prepareHighlightSvg,
} from "../scripts/export.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

test("parseMotionMode defaults to standard and accepts quoted values", () => {
  assert.equal(parseMotionMode("---\nmarp: true\n---\n# Slide"), "standard");
  assert.equal(parseMotionMode("---\nsf_motion: 'rich' # comment\n---\n# Slide"), "rich");
  assert.equal(parseMotionMode("---\nsf_motion: off\n---\n# Slide"), "off");
  assert.throws(
    () => parseMotionMode("---\nsf_motion: cinematic\n---\n# Slide"),
    /sf_motion must be one of/,
  );
});

test("buildMarpArgs exposes HTML/PDF and always disables slide transitions", () => {
  const common = { input: "/tmp/slides.md", output: "/tmp/out", root: ROOT };
  for (const motionMode of ["off", "standard", "rich"]) {
    const html = buildMarpArgs({ ...common, format: "html", motionMode });
    assert.ok(html.includes("--no-bespoke.transition"));
  }
  const pdf = buildMarpArgs({ ...common, format: "pdf", motionMode: "standard" });
  assert.ok(pdf.includes("--pdf"));
  assert.ok(!pdf.includes("--no-bespoke.transition"));
  assert.equal(exportExtension("html"), "html");
  assert.equal(exportSuffix("pdf"), "pdf");
  for (const removed of ["pdf-notes", "pptx", "notes"]) {
    assert.throws(() => exportExtension(removed), /format must be one of: html, pdf/);
  }
});

test("prepareHighlightSvg animates a marked target and has a whole-visual fallback", () => {
  const targeted = prepareHighlightSvg(
    '<svg xmlns="http://www.w3.org/2000/svg"><g data-sf-highlight="target"><path d="M0 0"/></g></svg>',
  );
  assert.match(targeted, /data-sf-highlight="target"/);
  assert.match(targeted, /sf-generated-highlight/);
  assert.match(targeted, /prefers-reduced-motion:reduce/);

  const fallback = prepareHighlightSvg(
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>',
  );
  assert.match(fallback, /<svg data-sf-highlight="whole-visual"/);
  assert.match(fallback, /filter:none!important/);
});

test("prepareDrawSvg adds path normalization and final-state safeguards", () => {
  const svg = prepareDrawSvg(
    '<svg xmlns="http://www.w3.org/2000/svg"><path data-sf-draw d="M0 0L1 1"/></svg>',
  );
  assert.match(svg, /pathLength="1"/);
  assert.match(svg, /data-sf-generated-motion/);
  assert.match(svg, /prefers-reduced-motion:reduce/);
  assert.match(svg, /stroke-dashoffset:0!important/);

  const fallback = prepareDrawSvg(
    '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
  );
  assert.match(fallback, /data-sf-wipe="whole-visual"/);
});

test("annotateMotionImages converts Markdown-safe hooks and keeps accessible alt text", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sf-export-hooks-"));
  try {
    await writeFile(
      path.join(directory, "diagram.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" data-sf-motion="wipe"></svg>',
    );
    const html = await annotateMotionImages(
      '<img src="diagram.svg" alt="sf:draw Architecture overview">',
      { baseDir: directory, root: ROOT },
    );
    assert.match(html, /data-sf-motion="draw"/);
    assert.match(html, /data-sf-svg="true"/);
    assert.match(html, /alt="Architecture overview"/);

    await writeFile(
      path.join(directory, "result.sf-highlight.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    );
    const filenameHook = await annotateMotionImages(
      '<img src="result.sf-highlight.svg" alt="Main result">',
      { baseDir: directory, root: ROOT },
    );
    assert.match(filenameHook, /data-sf-motion="highlight"/);
    assert.match(filenameHook, /alt="Main result"/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rich HTML is a self-contained file with the local motion runtime", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sf-export-html-"));
  try {
    await writeFile(
      path.join(directory, "diagram.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" data-sf-motion="draw"><path data-sf-draw d="M0 0L1 1"/></svg>',
    );
    await writeFile(
      path.join(directory, "pixel.png"),
      Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
    );
    const input = `<!doctype html><html><head><style>.bg{background:url(pixel.png)}</style></head><body>
      <svg data-marpit-svg><foreignObject><section><img src="diagram.svg" alt="Diagram"></section></foreignObject></svg>
    </body></html>`;
    const output = await postprocessHtml(input, {
      baseDir: directory,
      motionMode: "rich",
      root: ROOT,
    });
    assert.match(output, /name="slide-forge-motion" content="rich"/);
    assert.match(output, /data-slide-forge-motion/);
    assert.match(output, /data-sf-motion="draw"/);
    assert.doesNotMatch(output, /(?:src=["']|url\()(?:(?:diagram\.svg)|(?:pixel\.png))/);
    assert.match(output, /data:image\/png;base64,/);

    const image = output.match(/<img\b[^>]*>/)?.[0] ?? "";
    const encodedSvg = image.match(/data:image\/svg\+xml;base64,([^"#]+)/)?.[1];
    assert.ok(encodedSvg);
    const svg = Buffer.from(encodedSvg, "base64").toString("utf8");
    assert.match(svg, /data-sf-generated-motion/);
    assert.match(svg, /pathLength="1"/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rich HTML restarts generated highlight SVG and keeps its final-state fallback", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sf-export-highlight-"));
  try {
    await writeFile(
      path.join(directory, "result.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" data-sf-motion="highlight"><g data-sf-highlight="target"><path d="M0 0L1 1"/></g></svg>',
    );
    const output = await postprocessHtml(
      '<!doctype html><html><head></head><body><svg data-marpit-svg><foreignObject><section><img src="result.svg" alt="Result chart"></section></foreignObject></svg></body></html>',
      { baseDir: directory, motionMode: "rich", root: ROOT },
    );
    assert.match(output, /data-sf-motion="highlight"/);
    assert.match(output, /data-sf-svg="true"/);
    assert.match(output, /data-sf-motion=\\?"highlight\\?"/);
    const image = output.match(/<img\b[^>]*>/)?.[0] ?? "";
    const encodedSvg = image.match(/data:image\/svg\+xml;base64,([^"#]+)/)?.[1];
    const svg = Buffer.from(encodedSvg, "base64").toString("utf8");
    assert.match(svg, /data-sf-highlight="target"/);
    assert.match(svg, /sf-generated-highlight/);
    assert.match(svg, /@media print,\(prefers-reduced-motion:reduce\)/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("HTML export rejects remote rendered assets instead of silently requiring a network", async () => {
  await assert.rejects(
    postprocessHtml(
      '<!doctype html><html><head></head><body><img src="https://example.com/image.png"></body></html>',
      { baseDir: "/tmp", motionMode: "standard", root: ROOT },
    ),
    /remote rendered asset cannot be embedded/,
  );
});

test("HTML export confines local assets to the deck directory", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sf-export-confine-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "sf-export-outside-"));
  try {
    const secret = path.join(outside, "secret.txt");
    await writeFile(secret, "must not be embedded", "utf8");
    await symlink(secret, path.join(directory, "linked.txt"));
    const cases = [
      path.join(outside, "secret.txt"),
      pathToFileURL(secret).href,
      "../secret.txt",
      "linked.txt",
    ];
    for (const reference of cases) {
      await assert.rejects(
        postprocessHtml(
          `<!doctype html><html><head></head><body><img src="${reference}"></body></html>`,
          { baseDir: directory, motionMode: "standard", root: ROOT },
        ),
        /cannot embed rendered asset/,
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("CSS URL rewriting does not interpret slide text or code as an asset", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sf-export-css-scope-"));
  try {
    const html = "<!doctype html><html><head></head><body><code>url(not-an-asset.png)</code><p>url(missing.png)</p></body></html>";
    const output = await postprocessHtml(html, {
      baseDir: directory,
      motionMode: "standard",
      root: ROOT,
    });
    assert.match(output, /url\(not-an-asset\.png\)/);
    assert.match(output, /url\(missing\.png\)/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("export refuses to overwrite its source Markdown", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sf-export-source-"));
  try {
    const input = path.join(directory, "slides.md");
    await writeFile(input, "---\nmarp: true\n---\n# Keep me\n", "utf8");
    await assert.rejects(
      exportDeck({ input, output: input, format: "html", root: ROOT }),
      /must not overwrite the source Markdown/,
    );
    assert.match(await readFile(input, "utf8"), /# Keep me/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("export recognizes case-only source aliases on case-insensitive filesystems", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sf-export-case-alias-"));
  try {
    const input = path.join(directory, "slides.md");
    const alias = path.join(directory, "SLIDES.md");
    await writeFile(input, "---\nmarp: true\n---\n# Keep me\n", "utf8");
    try {
      await readFile(alias);
    } catch {
      return; // case-sensitive filesystemでは別ファイルなので、この防御は該当しない。
    }
    await assert.rejects(
      exportDeck({ input, output: alias, format: "html", root: ROOT }),
      /must not overwrite the source Markdown/,
    );
    assert.match(await readFile(input, "utf8"), /# Keep me/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
