import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SlideCanvas from './SlideCanvas.jsx';
import { serializeDeck } from '../lib/deck.mjs';
import { inlineMarkdown, locate, patchLines, patchTableCell } from './patch.js';
import { checkRoots } from './overflow.js';

const CLASS_RE = /<!--\s*_class:\s*([^>]*?)\s*-->/;
const slideCls = (raw) => (raw.match(CLASS_RE)?.[1] ?? '').trim();

// raw 内の _class 行だけを書き換える(他は一切触らない)
const setSlideCls = (raw, cls) => {
  if (CLASS_RE.test(raw)) {
    if (cls) return raw.replace(CLASS_RE, `<!-- _class: ${cls} -->`);
    const lines = raw.split('\n');
    const i = lines.findIndex((l) => CLASS_RE.test(l));
    lines.splice(i, 1);
    return lines.join('\n');
  }
  if (!cls) return raw;
  const lines = raw.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i += 1;
  lines.splice(i, 0, `<!-- _class: ${cls} -->`, '');
  return lines.join('\n');
};

const NEW_SLIDE = '\n<!-- _class: content -->\n\n# 新しいスライド\n\n- 内容\n';

let keySeq = 0;
const withKeys = (raws) => raws.map((raw) => ({ key: `k${keySeq++}`, raw }));

// インライン編集の対象にしないブロック(中に別ブロックを含む等)
const hasBlockChildren = (el) => !!el.querySelector('ul, ol, p, pre, table, img, .katex');

export default function App() {
  const [slides, setSlides] = useState(null);
  const [frontmatter, setFrontmatter] = useState('');
  const [file, setFile] = useState('');
  const [layouts, setLayouts] = useState([]);
  const [sel, setSel] = useState(0);
  const [rendered, setRendered] = useState({ css: '', slides: [] });
  const [issues, setIssues] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [mdPanel, setMdPanel] = useState(false);
  const [editing, setEditing] = useState(false);

  const stateRef = useRef({});
  stateRef.current = { slides, frontmatter };
  const saveTimer = useRef(null);
  const editTimer = useRef(null);
  const editingRef = useRef(null);
  const thumbRoots = useRef([]);

  const fullText = useMemo(
    () => (slides ? serializeDeck({ frontmatter, slides: slides.map((s) => s.raw) }) : ''),
    [slides, frontmatter],
  );

  // ---------- 読み込み ----------

  useEffect(() => {
    (async () => {
      const deck = await fetch('/api/deck').then((r) => r.json());
      setSlides(withKeys(deck.slides.map((s) => s.raw)));
      setFrontmatter(deck.frontmatter);
      setFile(deck.file);
      setStatus('saved');
      setLayouts(await fetch('/api/layouts').then((r) => r.json()));
    })().catch((e) => {
      setStatus('error');
      setError(String(e));
    });
  }, []);

  // ---------- レンダリング(marp-core) ----------

  useEffect(() => {
    if (!fullText) return undefined;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/render', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ markdown: fullText }),
        }).then((r) => r.json());
        if (!cancelled && res.slides) setRendered(res);
      } catch {
        /* 一時的な失敗は次のレンダリングで回復する */
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [fullText]);

  // レンダリング反映後にクライアント側で overflow 検出
  useEffect(() => {
    const t = setTimeout(() => {
      setIssues(checkRoots(thumbRoots.current.slice(0, rendered.slides.length)));
    }, 150);
    return () => clearTimeout(t);
  }, [rendered]);

  // ---------- 保存 ----------

  const save = useCallback(async () => {
    clearTimeout(saveTimer.current);
    const { slides: s, frontmatter: fm } = stateRef.current;
    if (!s) return;
    setStatus('saving');
    try {
      const res = await fetch('/api/deck', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ frontmatter: fm, slides: s.map((x) => x.raw) }),
      }).then((r) => r.json());
      if (!res.ok) throw new Error(res.error || 'save failed');
      setStatus('saved');
      setError('');
    } catch (e) {
      setStatus('error');
      setError(String(e.message || e));
    }
  }, []);

  const markDirty = useCallback(() => {
    setStatus('dirty');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 800);
  }, [save]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  const update = (fn) => {
    setSlides((prev) => fn(prev));
    markDirty();
  };

  // ---------- インライン編集 ----------

  const commitEdit = useCallback(() => {
    const ed = editingRef.current;
    if (!ed || ed.cancelled) return;
    const text = inlineMarkdown(ed.el);
    setSlides((prev) =>
      prev.map((s, i) => {
        if (i !== ed.slideIdx) return s;
        if (ed.cellIdx != null) return { ...s, raw: patchTableCell(s.raw, ed.start, ed.cellIdx, text) };
        const { raw, count } = patchLines(s.raw, ed.start, ed.count, text);
        ed.count = count;
        return { ...s, raw };
      }),
    );
    markDirty();
  }, [markDirty]);

  const finishEdit = useCallback(() => {
    const ed = editingRef.current;
    if (!ed) return;
    clearTimeout(editTimer.current);
    if (!ed.cancelled) commitEdit();
    ed.el.removeAttribute('contenteditable');
    editingRef.current = null;
    setEditing(false); // 凍結解除 → 次のレンダリングで表示を正規化
  }, [commitEdit]);

  const startEdit = useCallback(
    (el, lineAttr, ev) => {
      const { slides: s, frontmatter: fm } = stateRef.current;
      const [g0] = lineAttr.split('-').map(Number);
      const g1 = Number(lineAttr.split('-')[1]);
      const loc = locate(fm, s.map((x) => x.raw), g0);
      if (!loc) return;
      let cellIdx = null;
      if (el.tagName === 'TD' || el.tagName === 'TH') {
        cellIdx = [...el.parentElement.children].indexOf(el);
      }
      const ed = {
        el,
        slideIdx: loc.slideIdx,
        start: loc.localLine,
        count: Math.max(1, g1 - g0),
        cellIdx,
        snapshotRaw: s[loc.slideIdx].raw,
        snapshotHtml: el.innerHTML,
        cancelled: false,
      };
      editingRef.current = ed;
      setEditing(true);
      el.setAttribute('contenteditable', 'true');
      el.focus();
      // クリック位置にカーソルを置く
      try {
        const range = document.caretRangeFromPoint(ev.clientX, ev.clientY);
        if (range) {
          const selArea = (el.getRootNode().getSelection?.() ?? window.getSelection());
          selArea.removeAllRanges();
          selArea.addRange(range);
        }
      } catch {
        /* 位置指定に失敗したら先頭カーソルのまま */
      }
      const onInput = () => {
        setStatus('dirty');
        clearTimeout(editTimer.current);
        editTimer.current = setTimeout(commitEdit, 500);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') {
          ed.cancelled = true;
          clearTimeout(editTimer.current);
          el.innerHTML = ed.snapshotHtml;
          setSlides((prev) => prev.map((x, i) => (i === ed.slideIdx ? { ...x, raw: ed.snapshotRaw } : x)));
          markDirty();
          el.blur();
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          el.blur();
        }
      };
      const onBlur = () => {
        el.removeEventListener('input', onInput);
        el.removeEventListener('keydown', onKey);
        finishEdit();
      };
      el.addEventListener('input', onInput);
      el.addEventListener('keydown', onKey);
      el.addEventListener('blur', onBlur, { once: true });
    },
    [commitEdit, finishEdit, markDirty],
  );

  const onCanvasClick = useCallback(
    (e) => {
      if (editingRef.current) return; // 編集中の再クリックはブラウザに任せる
      const target = e.nativeEvent.composedPath()[0];
      let el = target.nodeType === 3 ? target.parentElement : target;
      if (!(el instanceof Element)) return;
      el = el.closest('h1, h2, h3, h4, h5, h6, p, li, th, td, figcaption');
      if (!el) return;
      if (el.closest('pre') || el.closest('.katex') || hasBlockChildren(el)) {
        setMdPanel(true); // インライン編集の対象外 → Markdownパネルで編集
        return;
      }
      const lineEl = el.hasAttribute('data-source-line') ? el : el.closest('[data-source-line]');
      if (!lineEl || lineEl.tagName === 'SECTION') return;
      startEdit(el, lineEl.getAttribute('data-source-line'), e);
    },
    [startEdit],
  );

  // ---------- スライド操作(追加・複製・削除・並び替え) ----------

  const addSlide = () =>
    update((prev) => {
      const next = [...prev];
      next.splice(sel + 1, 0, ...withKeys([NEW_SLIDE]));
      setSel(sel + 1);
      return next;
    });

  const duplicateSlide = () =>
    update((prev) => {
      const next = [...prev];
      next.splice(sel + 1, 0, ...withKeys([prev[sel].raw]));
      setSel(sel + 1);
      return next;
    });

  const deleteSlide = () => {
    if (slides.length <= 1) return;
    update((prev) => prev.filter((_, i) => i !== sel));
    setSel((s) => Math.max(0, Math.min(s, slides.length - 2)));
  };

  const dragFrom = useRef(null);
  const onDrop = (to) => {
    const from = dragFrom.current;
    dragFrom.current = null;
    if (from == null || from === to) return;
    update((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setSel(to);
  };

  const editRaw = (raw) => update((prev) => prev.map((s, i) => (i === sel ? { ...s, raw } : s)));
  const changeCls = (cls) =>
    update((prev) => prev.map((s, i) => (i === sel ? { ...s, raw: setSlideCls(s.raw, cls) } : s)));

  // ----------

  if (!slides) {
    return <div className="loading">{status === 'error' ? `読み込み失敗: ${error}` : '読み込み中…'}</div>;
  }

  const cur = slides[sel];
  const curCls = slideCls(cur.raw);
  const statusLabel = { saved: '保存済み', dirty: '変更あり…', saving: '保存中…', error: 'エラー' }[status] || '';
  const mainHtml = rendered.slides[sel];

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">slide-forge</span>
        <span className="filename">{file}</span>
        <span className={`status status-${status}`}>{statusLabel}</span>
        {status === 'error' && <span className="errmsg">{error}</span>}
        <button className={mdPanel ? 'active' : ''} onClick={() => setMdPanel((v) => !v)}>
          Markdown
        </button>
      </header>

      <div className="main">
        <aside className="sidebar">
          <div className="sidebar-actions">
            <button onClick={addSlide}>＋ 追加</button>
            <button onClick={duplicateSlide}>複製</button>
            <button onClick={deleteSlide} disabled={slides.length <= 1}>削除</button>
          </div>
          <ol className="thumbs">
            {slides.map((s, i) => {
              const bad = issues.some((it) => it.slide === i + 1);
              const html = rendered.slides[i];
              return (
                <li
                  key={s.key}
                  className={`thumb ${i === sel ? 'selected' : ''} ${bad ? 'bad' : ''}`}
                  draggable
                  onDragStart={() => (dragFrom.current = i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(i)}
                  onClick={() => setSel(i)}
                >
                  {html ? (
                    <SlideCanvas
                      html={html}
                      css={rendered.css}
                      className="thumb-canvas"
                      onRoot={(r) => {
                        thumbRoots.current[i] = r;
                      }}
                    />
                  ) : (
                    <div className="thumb-empty" />
                  )}
                  <span className="num">{i + 1}</span>
                  <span className="badge">{slideCls(s.raw) || '—'}</span>
                </li>
              );
            })}
          </ol>
        </aside>

        <section className="stage">
          <div className="stage-toolbar">
            <label>
              レイアウト
              <select value={curCls} onChange={(e) => changeCls(e.target.value)}>
                <option value="">(なし)</option>
                {layouts.map((l) => (
                  <option key={l.cls} value={l.cls}>
                    {l.cls}
                    {l.skin ? ` ※${l.skin}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <span className="hint">
              {layouts.find((l) => l.cls === curCls)?.desc || 'テキストをクリックすると直接編集できます'}
            </span>
          </div>
          <div className="stage-body">
            {mainHtml ? (
              <SlideCanvas
                html={mainHtml}
                css={rendered.css}
                frozen={editing}
                className="stage-canvas"
                onClick={onCanvasClick}
              />
            ) : (
              <div className="stage-empty">レンダリング中…</div>
            )}
          </div>
          {issues.length > 0 && (
            <div className="issues">
              <div className="issues-title">はみ出し検出: {issues.length} 枚</div>
              {issues.map((it) => (
                <button key={it.slide} className="issue" onClick={() => setSel(it.slide - 1)}>
                  slide {it.slide} [{it.class}] — {it.problems.join(', ')}
                </button>
              ))}
            </div>
          )}
        </section>

        {mdPanel && (
          <section className="mdpanel">
            <div className="mdpanel-title">Markdown(選択スライド)</div>
            <textarea
              className="slide-text"
              value={cur.raw}
              onChange={(e) => editRaw(e.target.value)}
              spellCheck={false}
            />
            <details className="frontmatter">
              <summary>frontmatter</summary>
              <textarea
                value={frontmatter}
                onChange={(e) => {
                  setFrontmatter(e.target.value);
                  markDirty();
                }}
                spellCheck={false}
              />
            </details>
          </section>
        )}
      </div>
    </div>
  );
}
