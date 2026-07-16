import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import SlideCanvas from './SlideCanvas.jsx';

const INTENT_LABELS = {
  orient: '導入',
  'show-problem': '問題',
  'state-question': '問い',
  'state-contribution': '貢献',
  compare: '比較',
  'explain-method': '手法',
  'show-evidence': '根拠',
  'interpret-result': '結果',
  'explain-failure': '失敗分析',
  'state-limitation': '限界',
  'support-reproduction': '再現性',
  'report-status': '進捗',
  'plan-next': '次の行動',
  conclude: '結論',
  cite: '参考文献',
  close: '締め',
};

export default function TemplatePicker({ catalog, onSelect }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  const wasOpenRef = useRef(false);
  const dialogId = useId();
  const headingId = useId();
  const items = catalog?.items ?? catalog?.templates ?? [];

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.key === 'Tab') {
        const focusable = [...(dialogRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled)') ?? [])];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (event.key === 'Escape' || (event.type === 'mousedown' && !rootRef.current?.contains(event.target))) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);

  useEffect(() => {
    if (wasOpenRef.current && !open) triggerRef.current?.focus();
    wasOpenRef.current = open;
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      [item.id, item.name_ja, item.intent, item.layout, ...(item.required_fields ?? [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [items, query]);

  return (
    <div className="template-picker" ref={rootRef}>
      <button
        ref={triggerRef}
        onClick={() => setOpen((value) => !value)}
        title="何を伝えたいかから研究テンプレートを選ぶ"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        disabled={!catalog}
      >
        ＋ テンプレート
      </button>
      {open && (
        <div
          ref={dialogRef}
          id={dialogId}
          className="template-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby={headingId}
        >
          <div className="template-panel-head">
            <strong id={headingId}>何を伝えたいですか？</strong>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="問題・比較・結果・限界…"
              autoFocus
            />
          </div>
          <div className="template-grid">
            {filtered.map((item) => (
              <button
                key={item.id}
                className="template-card"
                onClick={() => {
                  onSelect(item);
                  setOpen(false);
                }}
              >
                {item.html && catalog.css ? (
                  <SlideCanvas html={item.html} css={catalog.css} className="template-preview" />
                ) : null}
                <span className="template-intent">{INTENT_LABELS[item.intent] ?? item.intent}</span>
                <strong>{item.name_ja}</strong>
                <small>{item.layout} · {item.required_fields?.slice(0, 3).join(' / ') || '構成済み'}</small>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
