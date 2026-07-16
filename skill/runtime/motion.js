/* Rich HTML motion. This file is inlined by scripts/export.mjs. */
(() => {
  "use strict";

  document.documentElement.dataset.sfMotion = "rich";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const activeSlides = new WeakSet();
  let svgRun = 0;

  const restartGeneratedSvg = (slide) => {
    for (const image of slide.querySelectorAll(
      'img[data-sf-svg="true"]:is([data-sf-motion="draw"],[data-sf-motion="highlight"])',
    )) {
      const current = image.getAttribute("src");
      if (!current) continue;
      const base = image.__sfMotionSource || current.replace(/#sf-motion-\d+$/, "");
      image.__sfMotionSource = base;
      svgRun += 1;
      image.setAttribute("src", `${base}#sf-motion-${svgRun}`);
    }
  };

  const enter = (slide) => {
    if (reducedMotion.matches) return;
    slide.classList.remove("sf-motion-enter");
    // Reflow is intentional: it restarts CSS animation when revisiting a slide.
    void slide.getBoundingClientRect();
    slide.classList.add("sf-motion-enter");
    restartGeneratedSvg(slide);
  };

  const sync = (slide) => {
    const active = slide.classList.contains("bespoke-marp-active");
    if (active && !activeSlides.has(slide)) {
      activeSlides.add(slide);
      enter(slide);
    } else if (!active && activeSlides.has(slide)) {
      activeSlides.delete(slide);
      slide.classList.remove("sf-motion-enter");
    }
  };

  const slides = [...document.querySelectorAll("svg[data-marpit-svg]")];
  const observer = new MutationObserver((records) => {
    for (const { target } of records) sync(target);
  });
  for (const slide of slides) {
    observer.observe(slide, { attributes: true, attributeFilter: ["class"] });
    sync(slide);
  }

  reducedMotion.addEventListener?.("change", () => {
    for (const slide of slides) {
      slide.classList.remove("sf-motion-enter");
      if (!reducedMotion.matches && slide.classList.contains("bespoke-marp-active")) enter(slide);
    }
  });
})();
