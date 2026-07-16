import assert from "node:assert/strict";
import test from "node:test";
import { setFirstImage, setLibraryAsset } from "../webui/src/asset-insertion.js";

test("library asset replacement updates an ordinary image path and alt text", () => {
  const raw = "# Result\n\n![Old experiment description](assets/old.png \"caption\")\n";
  assert.equal(
    setFirstImage(raw, "assets/new.webp", "New laboratory scene"),
    "# Result\n\n![New laboratory scene](assets/new.webp \"caption\")\n",
  );
});

test("library asset replacement preserves Marp background directives", () => {
  const raw = "![bg right:40% cover](assets/old.jpg)\n\n# Title\n";
  assert.equal(
    setFirstImage(raw, "assets/new.webp", "New scene"),
    "![bg right:40% cover](assets/new.webp)\n\n# Title\n",
  );
});

test("background assets become a Marp background without changing the layout", () => {
  const raw = "<!-- _class: content -->\n\n# Result\n\n- Evidence\n";
  assert.equal(
    setLibraryAsset(raw, "assets/background.svg", { kind: "background", alt: "Abstract background" }),
    "![bg cover](assets/background.svg)\n\n<!-- _class: content -->\n\n# Result\n\n- Evidence\n",
  );
});

test("icon assets fill the first card icon slot", () => {
  const raw = "<!-- _class: cards -->\n\n# Features\n\n- **Fast** Description\n- **Safe** Description\n";
  assert.equal(
    setLibraryAsset(raw, "assets/spark.svg", { kind: "icon", alt: "Spark icon" }),
    "<!-- _class: cards -->\n\n# Features\n\n- ![Spark icon](assets/spark.svg) **Fast** Description\n- **Safe** Description\n",
  );
});

test("standalone icon assets use an accessible Marp width directive", () => {
  const raw = "<!-- _class: content -->\n\n# Concept\n\nExplanation\n";
  assert.equal(
    setLibraryAsset(raw, "assets/concept.svg", { kind: "icon", alt: "Concept icon" }),
    "<!-- _class: image-right -->\n\n# Concept\n\nExplanation\n\n![w:280 Concept icon](assets/concept.svg)\n",
  );
});
