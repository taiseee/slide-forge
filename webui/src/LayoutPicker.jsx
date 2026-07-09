import React, { useEffect, useRef, useState } from 'react';
import SlideCanvas from './SlideCanvas.jsx';
import { groupLayouts } from './layout-groups.js';

/**
 * レイアウトピッカー: グループタブ+実レンダリングした縮小プレビューのグリッド。
 * previews は /api/layout-previews の { css, items: [{cls, html, raw}] }。
 * label を渡すとボタンの表示がその文字列になる(レイアウト選択追加などの挿入モード用。
 * current は無しでよい)。
 */
export default function LayoutPicker({ layouts, previews, current, onSelect, label }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(0);
  const panelRef = useRef(null);

  const groups = groupLayouts(layouts);
  const htmlByCls = new Map((previews?.items ?? []).map((it) => [it.cls, it.html]));

  // 外側クリック・Esc で閉じる
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // 開いたとき、現在のレイアウトが属するタブを表示する
  const openPicker = () => {
    const idx = groups.findIndex((g) => g.items.some((l) => l.cls === current));
    setTab(idx >= 0 ? idx : 0);
    setOpen(true);
  };

  return (
    <div className="picker" ref={panelRef}>
      <button className="picker-button" onClick={() => (open ? setOpen(false) : openPicker())}>
        {label ?? (current || '(レイアウトなし)')} ▾
      </button>
      {open && (
        <div className="picker-panel">
          <div className="picker-tabs">
            {groups.map((g, i) => (
              <button
                key={g.name}
                className={`picker-tab ${i === tab ? 'active' : ''}`}
                onClick={() => setTab(i)}
              >
                {g.name}
              </button>
            ))}
          </div>
          <div className="picker-grid">
            {groups[tab]?.items.map((l) => (
              <button
                key={l.cls}
                className={`picker-card ${l.cls === current ? 'active' : ''}`}
                title={l.desc}
                onClick={() => {
                  onSelect(l.cls);
                  setOpen(false);
                }}
              >
                {htmlByCls.has(l.cls) && previews ? (
                  <SlideCanvas html={htmlByCls.get(l.cls)} css={previews.css} className="picker-thumb" />
                ) : (
                  <div className="picker-thumb picker-thumb-empty" />
                )}
                <span className="picker-name">
                  {l.cls}
                  {l.skin ? <em> ※{l.skin}</em> : null}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
