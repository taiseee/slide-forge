import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

const KIND_LABELS = { all: 'すべて', icon: 'アイコン', photo: '写真', background: '背景' };

export default function AssetPicker({ assets, onSelect }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('all');
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  const wasOpenRef = useRef(false);
  const dialogId = useId();
  const headingId = useId();

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

  const kinds = useMemo(() => ['all', ...new Set((assets ?? []).map((asset) => asset.kind))], [assets]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (assets ?? []).filter((asset) => {
      if (kind !== 'all' && asset.kind !== kind) return false;
      if (!q) return true;
      return [asset.id, asset.title, asset.alt, asset.author, ...(asset.tags ?? [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [assets, kind, query]);

  return (
    <div className="asset-picker" ref={rootRef}>
      <button
        ref={triggerRef}
        className="asset-trigger"
        onClick={() => setOpen((value) => !value)}
        title="同梱されたライセンス確認済み素材を使う"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
      >
        素材
      </button>
      {open && (
        <div
          ref={dialogRef}
          id={dialogId}
          className="asset-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby={headingId}
        >
          <div className="asset-panel-head">
            <strong id={headingId}>素材ライブラリ</strong>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="データ・研究・抽象…"
              autoFocus
            />
          </div>
          <div className="asset-tabs">
            {kinds.map((value) => (
              <button key={value} className={kind === value ? 'active' : ''} onClick={() => setKind(value)}>
                {KIND_LABELS[value] ?? value}
              </button>
            ))}
          </div>
          <div className="asset-grid">
            {filtered.map((asset) => (
              <button
                key={asset.id}
                className={`asset-card asset-${asset.kind}`}
                title={`${asset.alt}\n${asset.author} · ${asset.license}`}
                onClick={() => {
                  onSelect(asset);
                  setOpen(false);
                }}
              >
                <span className="asset-image">
                  <img
                    src={asset.url}
                    alt=""
                    style={{
                      objectPosition: `${(asset.focal_point?.x ?? 0.5) * 100}% ${(asset.focal_point?.y ?? 0.5) * 100}%`,
                    }}
                  />
                </span>
                <strong>{asset.title}</strong>
                <small>{asset.license} · {asset.author}</small>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
