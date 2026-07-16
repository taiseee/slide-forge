/*
 * Browser DOM に描画済みの Marp スライドを検査する共通ロジック。
 * WebUI では直接呼び、CLI では Puppeteer の page.evaluate に渡すため、
 * この関数は外側のクロージャや Node API に依存させない。
 */
export function inspectRenderedSlides(root = document) {
  const rgba = (value) => {
    const match = value?.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)(?:[, /]+([\d.]+))?\)/);
    return match
      ? [Number(match[1]), Number(match[2]), Number(match[3]), match[4] == null ? 1 : Number(match[4])]
      : null;
  };
  const luminance = ([red, green, blue]) => {
    const channel = (value) => {
      const normalized = value / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
  };
  const contrastRatio = (first, second) => {
    const [high, low] = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (high + 0.05) / (low + 0.05);
  };
  const styleOf = (element) => element.ownerDocument.defaultView.getComputedStyle(element);
  const background = (element, stop) => {
    for (let current = element; current && current !== stop.parentElement; current = current.parentElement) {
      const style = styleOf(current);
      const color = rgba(style.backgroundColor);
      if (color && color[3] > 0.95) return color;
      if (style.backgroundImage !== "none") return null;
    }
    return [255, 255, 255, 1];
  };
  const displaySource = (source) => {
    if (/^data:image\/svg\+xml(?:[;,]|$)/i.test(source)) return "埋め込みSVG";
    if (/^data:/i.test(source)) return "埋め込み画像";
    return source || "(unknown)";
  };
  const isVectorImage = (source) =>
    /^data:image\/svg\+xml(?:[;,]|$)/i.test(source) || /\.svg(?:$|[?#])/i.test(source);

  let sections = [
    ...root.querySelectorAll(
      "svg[data-marpit-svg]:not([data-marpit-advanced-background]) > foreignObject > section",
    ),
  ];
  if (!sections.length) sections = [...root.querySelectorAll("section")];
  const results = [];
  const add = (slide, severity, code, message) => results.push({ slide, severity, code, message });

  sections.forEach((section, index) => {
    const slide = index + 1;
    for (const image of section.querySelectorAll("img")) {
      const source = image.currentSrc || image.getAttribute("src") || "";
      if (image.complete && image.naturalWidth === 0) {
        add(slide, "error", "broken-image", `画像を読み込めません: ${displaySource(source)}`);
        continue;
      }
      const rectangle = image.getBoundingClientRect();
      if (
        image.complete &&
        image.naturalWidth > 0 &&
        !isVectorImage(source) &&
        rectangle.width > 0 &&
        image.naturalWidth / rectangle.width < 1
      ) {
        add(
          slide,
          "warning",
          "low-resolution",
          `表示幅に対して画像解像度が不足しています: ${displaySource(source)}`,
        );
      }
    }

    for (const element of section.querySelectorAll("h1,h2,p,li,blockquote,td,th")) {
      if (element.closest("header,footer") || element.matches("[aria-hidden='true']")) continue;
      if (!element.textContent.trim()) continue;
      const style = styleOf(element);
      const size = Number.parseFloat(style.fontSize);
      if (size && size < 18 && !section.classList.contains("references")) {
        add(slide, "warning", "small-text", `最小文字サイズ未満です: ${Math.round(size)}px`);
        break;
      }
      const foreground = rgba(style.color);
      const backdrop = background(element, section);
      if (foreground && backdrop) {
        const minimum = size >= 24 || Number.parseInt(style.fontWeight, 10) >= 700 ? 3 : 4.5;
        const actual = contrastRatio(foreground, backdrop);
        if (actual < minimum) {
          add(slide, "warning", "low-contrast", `文字コントラストが低い要素があります (${actual.toFixed(2)}:1)`);
          break;
        }
      }
    }
  });
  return results;
}
