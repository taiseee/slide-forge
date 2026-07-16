import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SlideCanvas from './SlideCanvas.jsx';
import LayoutPicker from './LayoutPicker.jsx';
import AssetPicker from './AssetPicker.jsx';
import { serializeDeck } from '../lib/deck.mjs';
import {
  inlineMarkdown,
  locate,
  patchLines,
  patchTableCell,
  patchImagePath,
  splitListLine,
  removeLines,
  slideLineOffsets,
} from './patch.js';
import { extractNotes, setNotes } from './notes.js';
import { checkRoots } from './overflow.js';
import { analyzeDeckSource, estimateDeckMinutes } from '../../lib/quality.mjs';
import { inspectRenderedSlides } from '../../lib/browser-quality.mjs';
import { setLibraryAsset, setSlideCls, slideCls } from './asset-insertion.js';

const NEW_SLIDE = '\n<!-- _class: content -->\n\n# 新しいスライド\n\n- 内容\n';

const SIDEBAR_WIDTH_KEY = 'sf-sidebar-width';
const SIDEBAR_MIN = 160;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 224;

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
  const [previews, setPreviews] = useState(null);
  const [assets, setAssets] = useState([]);
  const [issues, setIssues] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [mdPanel, setMdPanel] = useState(false);
  const [editing, setEditing] = useState(false);
  const [themes, setThemes] = useState([]);
  const [exporting, setExporting] = useState(null);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    return saved >= SIDEBAR_MIN && saved <= SIDEBAR_MAX ? saved : SIDEBAR_DEFAULT;
  });
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;

  const stateRef = useRef({});
  stateRef.current = { slides, frontmatter };
  const selRef = useRef(0);
  selRef.current = sel;
  const saveTimer = useRef(null);
  const editTimer = useRef(null);
  const editingRef = useRef(null);
  const thumbRoots = useRef([]);
  const stageRootRef = useRef(null);
  // 項目の分割・削除後、再レンダリングされた要素へ編集フォーカスを移すための予約
  const pendingFocusRef = useRef(null);

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
      setThemes(await fetch('/api/themes').then((r) => r.json()));
      const assetResult = await fetch('/api/assets').then((r) => (r.ok ? r.json() : { assets: [] }));
      setAssets(assetResult.assets ?? []);
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

  // レイアウトピッカーのプレビュー(テーマごとにサーバ側キャッシュあり)
  const theme = useMemo(() => frontmatter.match(/^theme:\s*(\S+)/m)?.[1] ?? 'research', [frontmatter]);
  const motionMode = useMemo(
    () => frontmatter.match(/^sf_motion:\s*(\S+)/m)?.[1]?.replace(/["']/g, '') ?? 'standard',
    [frontmatter],
  );
  // スキン専用クラスは、そのスキン以外では CSS が無く崩れるためピッカーに出さない
  const usableLayouts = useMemo(
    () => layouts.filter((l) => theme === 'soft' || !l.skin || l.skin === theme),
    [layouts, theme],
  );
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/layout-previews?theme=${encodeURIComponent(theme)}`)
      .then((r) => r.json())
      .then((p) => {
        if (!cancelled && p.items) setPreviews(p);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [theme]);

  // レンダリング反映後に、修正必須のエラーだけをまとめて表示
  useEffect(() => {
    const roots = thumbRoots.current.slice(0, rendered.slides.length);
    const evaluate = () => {
      const overflow = checkRoots(roots).map((item) => ({
        ...item,
        severity: 'error',
        code: 'overflow',
        message: item.problems.join(', '),
      }));
      const source = slides ? analyzeDeckSource({ slides: slides.map((item) => item.raw) }) : [];
      const renderedIssues = roots.flatMap((root, index) =>
          root
            ? inspectRenderedSlides(root).map((item) => ({ ...item, slide: index + 1 }))
            : [],
        );
      setIssues(
        [...overflow, ...source, ...renderedIssues].filter((item) => item.severity === 'error'),
      );
    };
    const timer = setTimeout(evaluate, 150);
    const pendingImages = roots.flatMap((root) =>
      root ? [...root.querySelectorAll('img')].filter((image) => !image.complete) : [],
    );
    for (const image of pendingImages) {
      image.addEventListener('load', evaluate);
      image.addEventListener('error', evaluate);
    }
    return () => {
      clearTimeout(timer);
      for (const image of pendingImages) {
        image.removeEventListener('load', evaluate);
        image.removeEventListener('error', evaluate);
      }
    };
  }, [rendered, slides]);

  // ---------- 保存 ----------

  const save = useCallback(async (throwOnError = false) => {
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
      if (throwOnError) throw e;
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

  // Enter でリスト項目をカーソル位置で分割する(末尾なら空の新項目を追加)
  const splitItem = useCallback(
    (ed) => {
      const root = ed.el.getRootNode();
      const selection = root.getSelection?.() ?? window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const caret = selection.getRangeAt(0);
      const half = (setEdge) => {
        const r = document.createRange();
        r.selectNodeContents(ed.el);
        setEdge(r);
        const div = document.createElement('div');
        div.appendChild(r.cloneContents());
        div.querySelectorAll('ul, ol').forEach((n) => n.remove());
        return inlineMarkdown(div);
      };
      const beforeText = half((r) => r.setEnd(caret.startContainer, caret.startOffset));
      const afterText = half((r) => r.setStart(caret.endContainer, caret.endOffset));
      // ネストリストを持つ li は、子リストの後ろに兄弟項目として挿入する
      const insertPos = ed.nested.length > 0 ? ed.start + ed.blockLen : ed.start + 1;
      clearTimeout(editTimer.current);
      ed.cancelled = true; // ここで確定するので blur 時の再コミットは行わない
      const { slides: s } = stateRef.current;
      const { raw, line } = splitListLine(s[ed.slideIdx].raw, ed.start, ed.count, insertPos, beforeText, afterText);
      pushHistory();
      setSlides((prev) => prev.map((x, i) => (i === ed.slideIdx ? { ...x, raw } : x)));
      markDirty();
      pendingFocusRef.current = { slideIdx: ed.slideIdx, localLine: line, at: 'start' };
      cleanupEdit(ed, true);
    },
    [cleanupEdit, markDirty, pushHistory],
  );

  // 空になったリスト項目を Backspace で削除する
  const removeItem = useCallback(
    (ed) => {
      clearTimeout(editTimer.current);
      ed.cancelled = true;
      const { slides: s } = stateRef.current;
      const before = s[ed.slideIdx].raw;
      pushHistory();
      setSlides((prev) =>
        prev.map((x, i) => (i === ed.slideIdx ? { ...x, raw: removeLines(x.raw, ed.start, ed.count) } : x)),
      );
      markDirty();
      // 直前の行がリスト項目なら、その末尾へカーソルを移す
      const prevLine = before.split('\n')[ed.start - 1] ?? '';
      if (/^\s*(?:[-*+]|\d+[.)])\s/.test(prevLine)) {
        pendingFocusRef.current = { slideIdx: ed.slideIdx, localLine: ed.start - 1, at: 'end' };
      }
      cleanupEdit(ed, true);
    },
    [cleanupEdit, markDirty, pushHistory],
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
        blockLen: Math.max(1, g1 - g0), // 子リストを含むブロック全体の行数(分割時の挿入位置用)
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
          // リスト項目なら分割(=項目追加)、それ以外は編集を確定して終了
          if (ed.el.tagName === 'LI' && ed.cellIdx == null) splitItem(ed);
          else el.blur();
        } else if (
          e.key === 'Backspace' &&
          ed.el.tagName === 'LI' &&
          ed.cellIdx == null &&
          ed.nested.length === 0 &&
          ed.el.textContent.trim() === ''
        ) {
          e.preventDefault();
          removeItem(ed);
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
    [commitEdit, cleanupEdit, markDirty, splitItem, removeItem],
  );

  // 分割・削除の再レンダリング後、予約された要素の編集を自動で開始する
  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending || !stageRootRef.current) return;
    pendingFocusRef.current = null;
    const { slides: s, frontmatter: fm } = stateRef.current;
    if (!s || pending.slideIdx !== selRef.current) return;
    const offsets = slideLineOffsets(fm, s.map((x) => x.raw));
    const g = offsets[pending.slideIdx] + pending.localLine;
    requestAnimationFrame(() => {
      const root = stageRootRef.current;
      const el =
        root?.querySelector(`li[data-source-line^="${g}-"]`) ??
        root?.querySelector(`[data-source-line^="${g}-"]:not(section):not(ul):not(ol)`);
      if (!el) return;
      startEdit(el, el.getAttribute('data-source-line'));
      requestAnimationFrame(() => {
        const selection = el.getRootNode().getSelection?.() ?? window.getSelection();
        if (!selection) return;
        const r = document.createRange();
        r.selectNodeContents(el);
        r.collapse(pending.at === 'start');
        selection.removeAllRanges();
        selection.addRange(r);
      });
    });
  }, [rendered, startEdit]);

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

  // ---------- サイドバー幅のドラッグリサイズ ----------

  const onSidebarResizeStart = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidthRef.current;
    let latest = startWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (e2) => {
      latest = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startWidth + (e2.clientX - startX)));
      setSidebarWidth(latest);
    };
    const onUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(latest));
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

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

  // レイアウトを選んで追加: そのレイアウトのサンプル(ピッカーのプレビューと同じ)を
  // 雛形として挿入する。プレースホルダをクリックしてそのまま書き換える想定
  const addSlideWithLayout = (cls) => {
    const body = previews?.items?.find((it) => it.cls === cls)?.raw ?? '# 新しいスライド\n\n- 内容';
    update((prev) => {
      const next = [...prev];
      next.splice(sel + 1, 0, ...withKeys([`\n<!-- _class: ${cls} -->\n\n${body}\n`]));
      setSel(sel + 1);
      return next;
    });
  };

  const useLibraryAsset = async (asset) => {
    try {
      const copied = await fetch('/api/assets/use', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: asset.id }),
      }).then((response) => response.json());
      if (!copied.path) throw new Error(copied.error || 'asset copy failed');
      update((prev) =>
        prev.map((slide, index) =>
          index === sel
            ? { ...slide, raw: setLibraryAsset(slide.raw, copied.path, { ...asset, alt: copied.alt || asset.alt }) }
            : slide,
        ),
      );
    } catch (e) {
      setStatus('error');
      setError(String(e.message || e));
    }
  };

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

  // ---------- テーマ切替・エクスポート ----------

  const changeTheme = (t) => {
    pushHistory();
    setFrontmatter((fm) =>
      /^theme:/m.test(fm) ? fm.replace(/^theme:.*$/m, `theme: ${t}`) : `${fm}\ntheme: ${t}`,
    );
    markDirty();
  };

  const changeMotion = (mode) => {
    pushHistory();
    setFrontmatter((fm) =>
      /^sf_motion:/m.test(fm)
        ? fm.replace(/^sf_motion:.*$/m, `sf_motion: ${mode}`)
        : `${fm.trimEnd()}\nsf_motion: ${mode}`,
    );
    markDirty();
  };

  const doExport = async (format) => {
    // await 後の window.open はポップアップとして拒否されるため、クリック中に表示先を確保する。
    const target = window.open('about:blank', '_blank');
    if (!target) {
      setStatus('error');
      setError('書き出し先を開けませんでした。ブラウザでポップアップを許可してください。');
      return;
    }
    target.document.title = 'slide-forge — 書き出し中';
    target.document.body.textContent = '書き出し中…';
    target.opener = null;

    setExporting(format);
    try {
      await save(true); // 保存に失敗した場合は古い内容を書き出さない
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ format }),
      }).then((r) => r.json());
      if (!res.path) throw new Error(res.error || 'export failed');
      target.location.replace(res.path);
    } catch (e) {
      target.close();
      setStatus('error');
      setError(String(e.message || e));
    } finally {
      setExporting(null);
    }
  };

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
      // インライン編集側(項目の分割・削除など)が処理済みのキーは無視する
      if (e.defaultPrevented) return;
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
        <span className="duration" title="本文または発表者ノートから概算した発表時間">
          約{estimateDeckMinutes(slides.map((item) => item.raw))}分
        </span>
        {status === 'error' && <span className="errmsg">{error}</span>}
        <select
          className="theme-select"
          value={theme}
          onChange={(e) => changeTheme(e.target.value)}
          title="スキン(テーマ)を切り替え"
        >
          {(themes.length ? themes : [theme]).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button
          onClick={() => doExport('html')}
          disabled={!!exporting}
          title="発表用HTMLを書き出して開く(Pキーで発表者ビュー)"
        >
          {exporting === 'html' ? '準備中…' : '発表'}
        </button>
        <button onClick={() => doExport('pdf')} disabled={!!exporting} title="PDFを書き出して開く">
          {exporting === 'pdf' ? '書き出し中…' : 'PDF'}
        </button>
        <button onClick={undo} title="元に戻す (⌘Z)">↩</button>
        <button onClick={redo} title="やり直す (⇧⌘Z)">↪</button>
        <button className={mdPanel ? 'active' : ''} onClick={() => setMdPanel((v) => !v)}>
          Markdown
        </button>
      </header>

      <div className="main">
        <aside className="sidebar" style={{ width: sidebarWidth }}>
          <div className="sidebar-actions">
            <LayoutPicker
              layouts={usableLayouts}
              previews={previews}
              label="＋ 追加"
              splitAction={addSlide}
              onSelect={addSlideWithLayout}
            />
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

        <div className="sidebar-resize-handle" onMouseDown={onSidebarResizeStart} />

        <section className="stage">
          <div className="stage-toolbar">
            <span className="toolbar-label">レイアウト</span>
            <LayoutPicker layouts={usableLayouts} previews={previews} current={curCls} onSelect={changeCls} />
            <AssetPicker assets={assets} onSelect={useLibraryAsset} />
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
                onRoot={(r) => {
                  stageRootRef.current = r;
                }}
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
              <div className="issues-title">修正が必要な箇所: {issues.length}</div>
              {issues.map((it, issueIndex) => (
                <button
                  key={`${it.slide}-${it.code}-${issueIndex}`}
                  className={`issue issue-${it.severity}`}
                  onClick={() => selectSlide(it.slide - 1)}
                >
                  {it.severity.toUpperCase()} — slide {it.slide} [{it.code}] — {it.message}
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
