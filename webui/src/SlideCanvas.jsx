import React, { useEffect, useRef } from 'react';

// shadow DOM 内に敷く補助CSS(marp のテーマCSSはアプリ側と相互に汚染しない)
const INNER_CSS = `
:host { display: block; }
.marpit { margin: 0; }
.marpit svg[data-marpit-svg] { display: block; width: 100%; height: auto; }
section [data-source-line]:not(section) { cursor: text; }
section img, section pre, section .katex { cursor: default; }
[contenteditable="true"] {
  outline: 2px solid rgba(138, 122, 99, 0.55);
  outline-offset: 2px;
  border-radius: 1px;
}
`;

/**
 * marp-core が返した1スライド分の HTML+CSS を shadow DOM に描画する。
 * frozen=true の間は描画を更新しない(インライン編集中のカーソル保持用)。
 */
export default function SlideCanvas({ html, css, frozen = false, onRoot, className, onClick }) {
  const hostRef = useRef(null);
  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;

  useEffect(() => {
    if (frozenRef.current) return;
    const host = hostRef.current;
    if (!host) return;
    const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${css}</style><style>${INNER_CSS}</style><div class="marpit">${html}</div>`;
    onRoot?.(root);
  }, [html, css, frozen]);

  return <div ref={hostRef} className={className} onClick={onClick} />;
}
