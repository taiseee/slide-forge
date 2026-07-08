import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SlideCanvas from './SlideCanvas.jsx';
import { serializeDeck } from '../lib/deck.mjs';
import { inlineMarkdown, locate, patchLines, patchTableCell, patchImagePath } from './patch.js';
import { extractNotes, setNotes } from './notes.js';
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

// インライン編集の対象にしないブロック(ネストしたリストは編集可能なので除外しない)
const hasUneditableChildren = (el) => !!el.querySelector('p, pre, table, img, .katex');

// 直下のネストリスト(li の子の ul/ol)
const nestedListsOf = (el) =>
  el.tagName === 'LI' ? [...el.children].filter((c) => c.tagName === 'UL' || c.tagName === 'OL') : [];

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
  const selRef = useRef(0);
  selRef.current = sel;
  const saveTimer = useRef(null);
  const editTimer = useRef(null);
  const editingRef = useRef(null);
  const thumbRoots = useRef([]);

  // ---------- Undo / Redo 履歴 ----------
  // 連続入力(同じ coalesce キーで 1.2 秒以内)は1エントリにまとめる
  const historyRef = useRef({ past: [], future: [] });
  const histMetaRef = useRef({ key: null, time: 0 });

  const snapshot = useCallback(
    () => ({
      slides: stateRef.current.slides,
      frontmatter: stateRef.current.frontmatter,
      sel: selRef.current,
    }),
    [],
  );

  const pushHistory = useCallback(
    (coalesceKey) => {
      const now = Date.now();
      const meta = histMetaRef.current;
      if (coalesceKey && meta.key === coalesceKey && now - meta.time < 1200) {
        meta.time = now;
        return;
      }
      histMetaRef.current = { key: coalesceKey ?? null, time: now };
      const h = historyRef.current;
      h.past.push(snapshot());
      if (h.past.length > 200) h.past.shift();
      h.future = [];
    },
    [snapshot],
  );

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

  // coalesceKey を渡すと連続入力が1つの履歴エントリにまとまる(省略時は常に積む)
  const update = (fn, coalesceKey) => {
    pushHistory(coalesceKey);
    setSlides((prev) => fn(prev));
    markDirty();
  };

  // ---------- インライン編集 ----------

  const commitEdit = useCallback(
    (ed) => {
      if (!ed || ed.cancelled) return;
      let target = ed.el;
      if (ed.nested?.length) {
        // ネストリストは編集対象外(li 自身の行だけパッチする)なので複製から取り除く
        target = ed.el.cloneNode(true);
        target.querySelectorAll('ul, ol').forEach((n) => n.remove());
      }
      const text = inlineMarkdown(target);
      pushHistory(`inline-${ed.slideIdx}-${ed.start}`);
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
    },
    [markDirty, pushHistory],
  );

  // 編集セッションを閉じる。unfreeze=false は「別ブロックへ移る」用(凍結を保つ)
  const cleanupEdit = useCallback(
    (ed, unfreeze) => {
      clearTimeout(editTimer.current);
      ed.el.removeEventListener('input', ed.onInput);
      ed.el.removeEventListener('keydown', ed.onKey);
      ed.el.removeEventListener('blur', ed.onBlur);
      ed.el.removeEventListener('click', ed.onClickFix);
      if (!ed.cancelled) commitEdit(ed);
      ed.el.removeAttribute('contenteditable');
      ed.nested?.forEach((n) => n.removeAttribute('contenteditable'));
      if (editingRef.current === ed) editingRef.current = null;
      if (unfreeze) setEditing(false); // 凍結解除 → 次のレンダリングで表示を正規化
    },
    [commitEdit],
  );

  const startEdit = useCallback(
    (el, lineAttr) => {
      const { slides: s, frontmatter: fm } = stateRef.current;
      const [g0, g1] = lineAttr.split('-').map(Number);
      const loc = locate(fm, s.map((x) => x.raw), g0);
      if (!loc) return;
      let cellIdx = null;
      if (el.tagName === 'TD' || el.tagName === 'TH') {
        cellIdx = [...el.parentElement.children].indexOf(el);
      }
      const nested = nestedListsOf(el);
      const ed = {
        el,
        slideIdx: loc.slideIdx,
        start: loc.localLine,
        // ネストリストを持つ li は自身のテキスト行(先頭行)だけを編集対象にする
        count: nested.length > 0 ? 1 : Math.max(1, g1 - g0),
        cellIdx,
        nested,
        snapshotRaw: s[loc.slideIdx].raw,
        snapshotHtml: el.innerHTML,
        cancelled: false,
      };
      // ネストリストは編集不可アイランドにする(クリックすれば個別に編集できる)
      nested.forEach((n) => n.setAttribute('contenteditable', 'false'));
      ed.onInput = () => {
        setStatus('dirty');
        clearTimeout(editTimer.current);
        editTimer.current = setTimeout(() => commitEdit(ed), 500);
      };
      ed.onKey = (e) => {
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
      ed.onBlur = () => cleanupEdit(ed, true);
      // テキスト末尾より後ろ(右・下の余白)をクリックしたときはカーソルを末尾へ補正する。
      // テキスト上のクリックはブラウザ既定のとおりクリック位置に置かれる
      ed.onClickFix = (e2) => {
        const r = document.createRange();
        r.selectNodeContents(el);
        const rects = [...r.getClientRects()];
        if (rects.length === 0) return;
        const last = rects[rects.length - 1];
        const beyondEnd =
          e2.clientY > last.bottom || (e2.clientY >= last.top && e2.clientX > last.right);
        if (!beyondEnd) return;
        const selection = el.getRootNode().getSelection?.() ?? window.getSelection();
        const end = document.createRange();
        end.selectNodeContents(el);
        end.collapse(false);
        selection.removeAllRanges();
        selection.addRange(end);
      };
      editingRef.current = ed;
      setEditing(true);
      // mousedown 中に編集可能へ切り替える → ブラウザが1クリック目でクリック位置にカーソルを置く
      el.setAttribute('contenteditable', 'true');
      el.addEventListener('input', ed.onInput);
      el.addEventListener('keydown', ed.onKey);
      el.addEventListener('blur', ed.onBlur);
      el.addEventListener('click', ed.onClickFix);
      // 万一フォーカスが移らなかった場合の保険(通常はクリックの既定動作で移る)
      requestAnimationFrame(() => {
        const root = el.getRootNode();
        if (root.activeElement !== el) el.focus();
      });
    },
    [commitEdit, cleanupEdit, markDirty],
  );

  // ---------- 画像差し替え(クリック→ファイル選択 / ドラッグ&ドロップ) ----------

  const fileRef = useRef(null);
  const pendingImageRef = useRef(null);

  // クリック(ドロップ)された img を「どのスライドの何番目の画像か」に解決する
  const resolveImageTarget = useCallback((img) => {
    const block = img.closest('[data-source-line]');
    if (!block || block.tagName === 'SECTION') return null;
    const { slides: s, frontmatter: fm } = stateRef.current;
    const [g0, g1] = block.getAttribute('data-source-line').split('-').map(Number);
    const loc = locate(fm, s.map((x) => x.raw), g0);
    if (!loc) return null;
    return {
      slideIdx: loc.slideIdx,
      start: loc.localLine,
      count: Math.max(1, g1 - g0),
      imgIdx: [...block.querySelectorAll('img')].indexOf(img),
    };
  }, []);

  const uploadAndReplace = useCallback(
    async (file, target) => {
      if (!file || !file.type.startsWith('image/') || !target) return;
      setStatus('saving');
      try {
        const res = await fetch(`/api/asset?name=${encodeURIComponent(file.name)}`, {
          method: 'POST',
          headers: { 'content-type': file.type },
          body: file,
        }).then((r) => r.json());
        if (!res.path) throw new Error(res.error || 'upload failed');
        update((prev) =>
          prev.map((s, i) =>
            i === target.slideIdx
              ? { ...s, raw: patchImagePath(s.raw, target.start, target.count, target.imgIdx, res.path) }
              : s,
          ),
        );
      } catch (e) {
        setStatus('error');
        setError(String(e.message || e));
      }
    },
    [update],
  );

  const onFilePicked = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    uploadAndReplace(file, pendingImageRef.current);
    pendingImageRef.current = null;
  };

  const onCanvasDrop = useCallback(
    (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (!file || !file.type.startsWith('image/')) return;
      // img の上に落とせばその画像、そうでなければスライド内の唯一の画像を対象にする
      let img = e.nativeEvent.composedPath().find((n) => n.tagName === 'IMG');
      if (!img) {
        const host = e.currentTarget;
        const imgs = host.shadowRoot?.querySelectorAll('section img') ?? [];
        if (imgs.length === 1) img = imgs[0];
      }
      if (!img) return;
      uploadAndReplace(file, resolveImageTarget(img));
    },
    [uploadAndReplace, resolveImageTarget],
  );

  const onCanvasMouseDown = useCallback(
    (e) => {
      const target = e.nativeEvent.composedPath()[0];
      let el = target.nodeType === 3 ? target.parentElement : target;
      if (!(el instanceof Element)) return;
      if (el.tagName === 'IMG') {
        // 画像クリック → ファイル選択で差し替え
        e.preventDefault();
        const t = resolveImageTarget(el);
        if (t) {
          pendingImageRef.current = t;
          fileRef.current?.click();
        }
        return;
      }
      el = el.closest('h1, h2, h3, h4, h5, h6, p, li, th, td, figcaption');
      const cur = editingRef.current;
      if (el && cur && cur.el === el) return; // 編集中ブロック内のカーソル移動はブラウザに任せる
      if (!el) return; // ブロック外 → 編集中なら blur がセッションを閉じる
      if (el.closest('pre') || el.closest('.katex') || hasUneditableChildren(el)) {
        setMdPanel(true); // インライン編集の対象外 → Markdownパネルで編集
        return;
      }
      const lineEl = el.hasAttribute('data-source-line') ? el : el.closest('[data-source-line]');
      if (!lineEl || lineEl.tagName === 'SECTION') return;
      if (cur) cleanupEdit(cur, false); // 凍結を保ったまま別ブロックの編集へ移る
      startEdit(el, lineEl.getAttribute('data-source-line'));
    },
    [startEdit, cleanupEdit],
  );

  // ---------- スライド操作(追加・複製・削除・並び替え) ----------

  // スライドを切り替えるときは進行中のインライン編集を確定して閉じる
  const selectSlide = useCallback(
    (i) => {
      const cur = editingRef.current;
      if (cur) cleanupEdit(cur, true);
      setSel(i);
    },
    [cleanupEdit],
  );

  // ---------- Undo / Redo ----------

  const applySnapshot = useCallback(
    (snap) => {
      setSlides(snap.slides);
      setFrontmatter(snap.frontmatter);
      setSel(Math.max(0, Math.min(snap.sel, snap.slides.length - 1)));
      markDirty();
    },
    [markDirty],
  );

  const undo = useCallback(() => {
    const cur = editingRef.current;
    if (cur) cleanupEdit(cur, true); // 進行中の編集を確定してから戻す
    const h = historyRef.current;
    if (h.past.length === 0) return;
    histMetaRef.current = { key: null, time: 0 }; // 次の変更は新しい履歴エントリに
    h.future.push(snapshot());
    applySnapshot(h.past.pop());
  }, [cleanupEdit, snapshot, applySnapshot]);

  const redo = useCallback(() => {
    const cur = editingRef.current;
    if (cur) cleanupEdit(cur, true);
    const h = historyRef.current;
    if (h.future.length === 0) return;
    histMetaRef.current = { key: null, time: 0 };
    h.past.push(snapshot());
    applySnapshot(h.future.pop());
  }, [cleanupEdit, snapshot, applySnapshot]);

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

  const editRaw = (raw) =>
    update((prev) => prev.map((s, i) => (i === sel ? { ...s, raw } : s)), `md-${sel}`);
  const changeCls = (cls) =>
    update((prev) => prev.map((s, i) => (i === sel ? { ...s, raw: setSlideCls(s.raw, cls) } : s)));

  // ---------- キーボードショートカット ----------

  const keyActions = useRef({});
  keyActions.current = {
    save,
    undo,
    redo,
    deleteSlide,
    duplicateSlide,
    selectSlide,
    sel,
    count: slides?.length ?? 0,
  };

  useEffect(() => {
    const isTyping = () => {
      if (editingRef.current) return true;
      const ae = document.activeElement;
      return !!ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.tagName === 'SELECT');
    };
    const onKey = (e) => {
      const a = keyActions.current;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      // Undo/Redo と保存は入力中でもアプリ全体の履歴として扱う
      if (mod && k === 's') {
        e.preventDefault();
        a.save();
        return;
      }
      if (mod && k === 'z') {
        e.preventDefault();
        (e.shiftKey ? a.redo : a.undo)();
        return;
      }
      if (mod && k === 'y') {
        e.preventDefault();
        a.redo();
        return;
      }
      if (isTyping()) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        a.deleteSlide();
        return;
      }
      if (mod && k === 'd') {
        e.preventDefault();
        a.duplicateSlide();
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        a.selectSlide(Math.max(0, a.sel - 1));
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        a.selectSlide(Math.min(a.count - 1, a.sel + 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
        <button onClick={undo} title="元に戻す (⌘Z)">↩</button>
        <button onClick={redo} title="やり直す (⇧⌘Z)">↪</button>
        <button className={mdPanel ? 'active' : ''} onClick={() => setMdPanel((v) => !v)}>
          Markdown
        </button>
      </header>

      <div className="main">
        <aside className="sidebar">
          <div className="sidebar-actions">
            <button onClick={addSlide}>＋ 追加</button>
            <button onClick={duplicateSlide} title="複製 (⌘D)">複製</button>
            <button onClick={deleteSlide} disabled={slides.length <= 1} title="削除 (Delete)">削除</button>
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
                  onClick={() => selectSlide(i)}
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
                onMouseDown={onCanvasMouseDown}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onCanvasDrop}
              />
            ) : (
              <div className="stage-empty">レンダリング中…</div>
            )}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFilePicked} />
          </div>
          <div className="notes">
            <span className="notes-label">ノート</span>
            <textarea
              className="notes-text"
              placeholder="発表者ノートを追加(スライドには表示されず、Markdown のコメントとして保存されます)"
              value={extractNotes(cur.raw)}
              onChange={(e) =>
                update(
                  (prev) => prev.map((s, i) => (i === sel ? { ...s, raw: setNotes(s.raw, e.target.value) } : s)),
                  `notes-${sel}`,
                )
              }
              spellCheck={false}
            />
          </div>
          {issues.length > 0 && (
            <div className="issues">
              <div className="issues-title">はみ出し検出: {issues.length} 枚</div>
              {issues.map((it) => (
                <button key={it.slide} className="issue" onClick={() => selectSlide(it.slide - 1)}>
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
                  pushHistory('fm');
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
