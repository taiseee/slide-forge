import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { analyzeDeckSource, estimateDeckMinutes, imageRefs } from "../lib/quality.mjs";
import { checkAssetFiles, checkRenderedHtml } from "../scripts/check-quality.mjs";

test("imageRefs extracts local and remote references", () => {
  assert.deepEqual(imageRefs("![図](assets/a.svg)\n![写真](https://example.com/a.jpg)"), [
    { alt: "図", src: "assets/a.svg" },
    { alt: "写真", src: "https://example.com/a.jpg" },
  ]);
});

test("source quality reports accessibility and offline issues", () => {
  const issues = analyzeDeckSource({ slides: ["# Title\n\n![](https://example.com/a.jpg)"] });
  assert.deepEqual(
    issues.map((item) => item.code),
    ["missing-alt", "remote-asset"],
  );
});

test("source quality reports long layout streak", () => {
  const raw = "<!-- _class: content -->\n\n# Title\n\n- item";
  const issues = analyzeDeckSource({ slides: [raw, raw, raw, raw] });
  assert.ok(issues.some((item) => item.code === "layout-streak"));
});

test("speaking time prefers presenter notes", () => {
  const withoutNotes = estimateDeckMinutes(["# 短い本文"]);
  const withNotes = estimateDeckMinutes(["# 短い本文\n\n<!-- 詳しい説明をここでゆっくり話します。背景と結果を順番に説明します。 -->"]);
  assert.ok(withNotes >= withoutNotes);
});

test("headings inside code fences are not slide titles", () => {
  const issues = analyzeDeckSource({ slides: ["# Code example\n\n```sh\n# a shell comment\necho ok\n```"] });
  assert.ok(!issues.some((item) => item.code === "multiple-titles"));
});

test("asset checks do not skip missing absolute paths", async () => {
  const issues = await checkAssetFiles("/tmp/slides.md", ["![Missing](/definitely/missing.png)"]);
  assert.equal(issues[0]?.code, "asset-outside-deck");
});

test("rendered checks recognize embedded SVG as resolution-independent", { timeout: 20_000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "slide-forge-quality-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0L10 10"/></svg>').toString("base64");
  const html = path.join(directory, "slides.html");
  await fs.writeFile(
    html,
    `<!doctype html><html><body><section><img style="width:1200px" src="data:image/svg+xml;base64,${svg}" alt="line"></section></body></html>`,
  );
  const issues = await checkRenderedHtml(html);
  assert.ok(!issues.some((item) => item.code === "low-resolution"));
});

test("rendered quality checks do not execute deck scripts or network requests", { timeout: 20_000 }, async (t) => {
  let requests = 0;
  const server = http.createServer((_request, response) => {
    requests += 1;
    response.end("ok");
  });
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "slide-forge-quality-network-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const html = path.join(directory, "slides.html");
  await fs.writeFile(
    html,
    `<!doctype html><html><body><section><h1>Safe</h1><script>fetch('http://127.0.0.1:${port}/leak')</script></section></body></html>`,
  );
  await checkRenderedHtml(html);
  assert.equal(requests, 0);
});
