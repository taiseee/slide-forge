import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function waitForReady(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`WebUI server did not start:\n${output}`)), 10_000);
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.includes("slide-forge webui:")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`WebUI server exited early (${code}):\n${output}`));
    });
  });
}

test("WebUI serves machine catalogs and materializes template assets with provenance", { timeout: 20_000 }, async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "slide-forge-webui-test-"));
  const markdown = path.join(directory, "slides.md");
  fs.writeFileSync(
    markdown,
    "---\nmarp: true\ntheme: research\n---\n\n<!-- _class: content -->\n\n# Test\n",
  );
  const port = await availablePort();
  const child = spawn(process.execPath, ["webui/server.mjs", markdown, "--port", String(port)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => {
    child.kill("SIGTERM");
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await waitForReady(child);
  const base = `http://127.0.0.1:${port}`;

  const layouts = await fetch(`${base}/api/layouts`).then((response) => response.json());
  const templates = await fetch(`${base}/api/templates?theme=research`).then((response) => response.json());
  const businessTemplates = await fetch(`${base}/api/templates?theme=business`).then((response) => response.json());
  const assets = await fetch(`${base}/api/assets`).then((response) => response.json());
  assert.equal(layouts.length, 117);
  assert.equal(templates.theme, "research");
  assert.ok(templates.items.length >= 20);
  assert.ok(templates.items.every((item) => item.raw && item.html));
  assert.ok(templates.items.every((item) => !item.kind.startsWith("business")));
  assert.ok(businessTemplates.items.some((item) => item.id === "business-problem"));
  assert.ok(businessTemplates.items.some((item) => item.id === "executive-summary"));
  assert.ok(businessTemplates.items.every((item) => !item.kind.startsWith("research")));
  assert.equal(assets.assets.length, 91);

  const removedExport = await fetch(`${base}/api/export`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ format: "pptx" }),
  });
  assert.equal(removedExport.status, 400);

  const template = await fetch(`${base}/api/templates/use`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "title-visual-starter", theme: "research" }),
  }).then((response) => response.json());
  assert.match(template.raw, /geometric-architecture\.webp/);
  assert.ok(fs.existsSync(path.join(directory, "assets", "starter", "geometric-architecture.webp")));

  const incompatible = await fetch(`${base}/api/templates/use`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "research-question", theme: "business" }),
  });
  assert.equal(incompatible.status, 400);

  const asset = await fetch(`${base}/api/assets/use`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "photo-data-center" }),
  }).then((response) => response.json());
  assert.match(asset.path, /^assets\/slide-forge\/photo-data-center-/);
  assert.ok(fs.existsSync(path.join(directory, asset.path)));
  const provenance = JSON.parse(fs.readFileSync(path.join(directory, "sources", "assets.json"), "utf8"));
  assert.equal(provenance.assets[0].id, "photo-data-center");

  const concurrentIds = [
    "icon-brain-circuit",
    "icon-chart-line",
    "icon-database",
    "icon-flask",
    "icon-microscope",
    "icon-target",
  ];
  await Promise.all(concurrentIds.map((id) =>
    fetch(`${base}/api/assets/use`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    }).then((response) => {
      assert.equal(response.status, 200);
      return response.json();
    }),
  ));
  const concurrentProvenance = JSON.parse(
    fs.readFileSync(path.join(directory, "sources", "assets.json"), "utf8"),
  );
  assert.deepEqual(
    new Set(concurrentProvenance.assets.map((item) => item.id)),
    new Set(["photo-data-center", ...concurrentIds]),
  );
});
