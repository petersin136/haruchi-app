"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { loadKoreanChapter } from "../../bible-reading/bibleData";
import type { BookId } from "../../bible-reading/books";
import { BOOKS } from "../../bible-reading/books";
import {
  DEFAULT_HL,
  HL_COLORS,
  UL_COLOR,
  emptyStudyData,
  loadChapterStudy,
  newMarkId,
  saveChapterStudy,
  type ChapterStudyData,
  type StudyMark,
  type StudyNote,
} from "../lib/marksStorage";
import {
  buildChapterPlain,
  circledNum,
  segmentVerse,
  verseAtOffset,
  type VerseSpan,
} from "../lib/offsets";
import {
  loadChapterWordStudy,
  matchTokenByGloss,
  type WordStudyToken,
} from "../lib/wordStudy";
import WordStudySheet from "./WordStudySheet";
import "../study.css";

type Props = {
  bookId: BookId;
  chapter: number;
};

type ToolbarMode =
  | {
      kind: "selection";
      start: number;
      end: number;
      ref: number;
      x: number;
      y: number;
    }
  | {
      kind: "mark";
      markId: string;
      x: number;
      y: number;
    };

/** .study-body 기준 좌표. width = 접힌 상태 폭, openLeft/openWidth = 펼친 상태 */
type NotePos = {
  top: number;
  left: number;
  width: number;
  openLeft: number;
  openWidth: number;
  mode: "full" | "badge";
  badge?: number;
};

type BubbleState = {
  text: string;
  x: number;
  y: number;
};

function StudyNotebook({ bookId, chapter }: Props) {
  const bookMeta = BOOKS[bookId];
  const total = bookMeta.totalChapters;
  const [verses, setVerses] = useState<{ n: number; t: string }[] | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ChapterStudyData>(emptyStudyData);
  const [toolbar, setToolbar] = useState<ToolbarMode | null>(null);
  const [editingMarkId, setEditingMarkId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [openLegacy, setOpenLegacy] = useState<Set<number>>(() => new Set());
  const [notePos, setNotePos] = useState<Record<string, NotePos>>({});
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [sel, setSel] = useState<{ start: number; end: number } | null>(null);
  const [selRects, setSelRects] = useState<SelRect[]>([]);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const selRef = useRef<{ start: number; end: number } | null>(null);
  const dragRef = useRef<{ mode: DragMode; anchor: number } | null>(null);
  const pressRef = useRef<{
    timer: number;
    x: number;
    y: number;
    id: number;
  } | null>(null);
  const lastPointRef = useRef({ x: 0, y: 0 });
  const autoScrollRef = useRef(0);
  const suppressClickRef = useRef(false);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [bubble, setBubble] = useState<BubbleState | null>(null);
  const [wsTokens, setWsTokens] = useState<WordStudyToken[]>([]);
  const [wsOpen, setWsOpen] = useState(false);
  const [wsVerse, setWsVerse] = useState(1);
  const [wsInitial, setWsInitial] = useState<WordStudyToken | null>(null);
  const [wsSelectedKo, setWsSelectedKo] = useState("");
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const plainRef = useRef("");

  const { plain, spans } = useMemo(
    () => buildChapterPlain(verses ?? []),
    [verses],
  );
  plainRef.current = plain;

  const marksById = useMemo(() => {
    const map = new Map<string, StudyMark>();
    for (const m of data.marks) map.set(m.id, m);
    return map;
  }, [data.marks]);

  useEffect(() => {
    let cancelled = false;
    setVerses(null);
    setError(null);
    setToolbar(null);
    setEditingMarkId(null);
    loadKoreanChapter(bookId, chapter)
      .then((ch) => {
        if (cancelled) return;
        setTitle(ch.title ?? "");
        setVerses(ch.verses.krv ?? []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "본문을 불러오지 못했어요");
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, chapter]);

  useEffect(() => {
    setData(loadChapterStudy(bookId, chapter));
    setOpenLegacy(new Set());
    setBubble(null);
    setWsOpen(false);
  }, [bookId, chapter]);

  useEffect(() => {
    let stale = false;
    setWsTokens([]);
    loadChapterWordStudy(bookId, chapter).then((list) => {
      if (!stale) setWsTokens(list);
    });
    return () => {
      stale = true;
    };
  }, [bookId, chapter]);

  const persist = useCallback(
    (next: ChapterStudyData) => {
      setData(next);
      saveChapterStudy(bookId, chapter, next);
    },
    [bookId, chapter],
  );

  const measureNotes = useCallback(() => {
    const root = bodyRef.current;
    if (!root) return;
    const base = root.getBoundingClientRect();
    const bodyW = root.clientWidth;
    const items: { id: string; top: number; start: number }[] = [];
    root
      .querySelectorAll<HTMLElement>("[data-note-anchor]")
      .forEach((el) => {
        const rects = Array.from(el.getClientRects());
        const first = rects.find((r) => r.width > 0) ?? rects[0];
        if (!first) return;
        const start = Math.max(0, first.left - base.left);
        const top = first.bottom - base.top - 2;
        for (const id of (el.dataset.noteAnchor ?? "").split(" ")) {
          if (id) items.push({ id, top, start });
        }
      });
    items.sort((a, b) => a.top - b.top || a.start - b.start);

    const next: Record<string, NotePos> = {};
    let badge = 0;
    let prevId: string | null = null;
    for (const it of items) {
      let left = it.start;
      let width = bodyW - it.start;
      if (width < bodyW * NOTE_MIN_RATIO) {
        left = 0;
        width = bodyW;
      }
      const prev = prevId ? next[prevId] : null;
      if (prev && Math.abs(prev.top - it.top) < 10) {
        const room = left - prev.left - 6;
        if (room >= NOTE_MIN_ROOM) {
          prev.width = Math.min(prev.width, room);
        } else {
          badge += 1;
          const shrink = it.start - prev.left - 4;
          if (shrink >= NOTE_MIN_ROOM) prev.width = Math.min(prev.width, shrink);
          next[it.id] = {
            top: it.top,
            left: it.start,
            width: 0,
            openLeft: left,
            openWidth: width,
            mode: "badge",
            badge,
          };
          continue;
        }
      }
      next[it.id] = {
        top: it.top,
        left,
        width,
        openLeft: left,
        openWidth: width,
        mode: "full",
      };
      prevId = it.id;
    }
    setNotePos(next);
  }, []);

  useLayoutEffect(() => {
    measureNotes();
  }, [measureNotes, verses, data.marks, editingMarkId]);

  useEffect(() => {
    if (!expandedNoteId) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(`[data-mark-note-id="${expandedNoteId}"]`)) return;
      setExpandedNoteId(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [expandedNoteId]);

  useEffect(() => {
    setExpandedNoteId(null);
  }, [bookId, chapter]);

  useEffect(() => {
    if (!editingMarkId) return;
    editInputRef.current?.focus();
  }, [editingMarkId]);

  useEffect(() => {
    if (!bubble) return;
    const t = window.setTimeout(() => setBubble(null), 2200);
    return () => window.clearTimeout(t);
  }, [bubble]);

  /* ── 자체 선택: 길게 누르기 → 끌기 → 손잡이 조정 ───────────────────── */

  const offsetAtPoint = useCallback(
    (x: number, y: number): number | null => {
      const root = bodyRef.current;
      if (!root) return null;
      const caret = caretFromPoint(x, y);
      if (caret && closestVerseText(caret.node, root)) {
        const off = domPointToOffset(root, caret.node, caret.offset, spans);
        if (off != null) return off;
      }
      return offsetFromPointScan(root, x, y, spans);
    },
    [spans],
  );

  const measureSel = useCallback(() => {
    const root = bodyRef.current;
    const cur = selRef.current;
    if (!root || !cur) {
      setSelRects([]);
      return;
    }
    const a = offsetToDomPoint(root, cur.start, spans, false);
    const b = offsetToDomPoint(root, cur.end, spans, true);
    if (!a || !b) {
      setSelRects([]);
      return;
    }
    const range = document.createRange();
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset);
    const base = root.getBoundingClientRect();
    setSelRects(
      mergeLineRects(Array.from(range.getClientRects())).map((r) => ({
        top: r.top - base.top,
        left: r.left - base.left,
        width: r.width,
        height: r.height,
      })),
    );
  }, [spans]);

  useLayoutEffect(() => {
    selRef.current = sel;
    measureSel();
  }, [sel, measureSel, data.marks]);

  const selectionToolbarFor = useCallback(
    (range: { start: number; end: number }): ToolbarMode | null => {
      const root = bodyRef.current;
      if (!root) return null;
      const a = offsetToDomPoint(root, range.start, spans, false);
      const b = offsetToDomPoint(root, range.end, spans, true);
      if (!a || !b) return null;
      const r = document.createRange();
      r.setStart(a.node, a.offset);
      r.setEnd(b.node, b.offset);
      const lines = mergeLineRects(Array.from(r.getClientRects()));
      if (lines.length === 0) return null;
      const first = lines[0];
      const last = lines[lines.length - 1];
      return {
        kind: "selection",
        start: range.start,
        end: range.end,
        ref: verseAtOffset(spans, range.start),
        x: first.left + first.width / 2,
        y: toolbarTop(first.top, last.bottom + SEL_HANDLE_SIZE),
      };
    },
    [spans],
  );

  const clearSelection = useCallback(() => {
    setSel(null);
    setToolbar((t) => (t?.kind === "selection" ? null : t));
  }, []);

  const finishDrag = useCallback(() => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (autoScrollRef.current) {
      cancelAnimationFrame(autoScrollRef.current);
      autoScrollRef.current = 0;
    }
    if (!d) return;
    const cur = selRef.current;
    if (!cur) return;
    setToolbar(selectionToolbarFor(cur));
  }, [selectionToolbarFor]);

  const updateDragTo = useCallback(
    (x: number, y: number) => {
      const d = dragRef.current;
      if (!d) return;
      const off = offsetAtPoint(x, y);
      if (off == null) return;
      const max = plainRef.current.length;
      const f = Math.max(0, Math.min(max, off));
      let next: { start: number; end: number };
      if (d.mode === "press") {
        next =
          f > d.anchor
            ? { start: d.anchor, end: Math.max(f, d.anchor + 1) }
            : { start: f, end: d.anchor + 1 };
      } else {
        const cur = selRef.current;
        if (!cur) return;
        const fixed = d.mode === "start" ? cur.end : cur.start;
        next =
          f < fixed
            ? { start: f, end: fixed }
            : { start: fixed, end: Math.max(f, fixed + 1) };
        if (f > fixed && d.mode === "start") dragRef.current = { ...d, mode: "end" };
        if (f < fixed && d.mode === "end") dragRef.current = { ...d, mode: "start" };
      }
      next.end = Math.min(max, next.end);
      if (next.end <= next.start) return;
      const prevSel = selRef.current;
      if (prevSel && prevSel.start === next.start && prevSel.end === next.end) return;
      selRef.current = next;
      setSel(next);
    },
    [offsetAtPoint],
  );

  const runAutoScroll = useCallback(() => {
    const d = dragRef.current;
    if (!d) {
      autoScrollRef.current = 0;
      return;
    }
    const { x, y } = lastPointRef.current;
    const h = window.innerHeight;
    let dy = 0;
    if (y < AUTO_SCROLL_EDGE) dy = -Math.ceil(((AUTO_SCROLL_EDGE - y) / AUTO_SCROLL_EDGE) * 14);
    else if (y > h - AUTO_SCROLL_EDGE)
      dy = Math.ceil(((y - (h - AUTO_SCROLL_EDGE)) / AUTO_SCROLL_EDGE) * 14);
    if (dy !== 0) {
      window.scrollBy(0, dy);
      updateDragTo(x, y);
    }
    autoScrollRef.current = requestAnimationFrame(runAutoScroll);
  }, [updateDragTo]);

  const beginDrag = useCallback(
    (mode: DragMode, anchor: number, x: number, y: number) => {
      dragRef.current = { mode, anchor };
      lastPointRef.current = { x, y };
      setDragging(true);
      setToolbar(null);
      if (!autoScrollRef.current) {
        autoScrollRef.current = requestAnimationFrame(runAutoScroll);
      }
    },
    [runAutoScroll],
  );

  const onBodyPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    suppressClickRef.current = false;
    if (editingMarkId) return;
    const t = e.target as HTMLElement;
    if (t.closest(".study-mark-note, .study-mark-note-input, .study-sel-handle")) return;
    const startX = e.clientX;
    const startY = e.clientY;
    if (pressRef.current) window.clearTimeout(pressRef.current.timer);
    const timer = window.setTimeout(() => {
      pressRef.current = null;
      const off = offsetAtPoint(startX, startY);
      if (off == null) return;
      const max = plainRef.current.length;
      if (max === 0) return;
      const anchor = Math.min(off, max - 1);
      if (/Android/i.test(navigator.userAgent)) navigator.vibrate?.(10);
      suppressClickRef.current = true;
      setExpandedNoteId(null);
      const first = { start: anchor, end: anchor + 1 };
      selRef.current = first;
      setSel(first);
      beginDrag("press", anchor, startX, startY);
    }, LONG_PRESS_MS);
    pressRef.current = { timer, x: startX, y: startY, id: e.pointerId };
  };

  const onHandlePointerDown = (
    which: "start" | "end",
    e: ReactPointerEvent<HTMLSpanElement>,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const cur = selRef.current;
    if (!cur) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    suppressClickRef.current = true;
    beginDrag(which, which === "start" ? cur.end : cur.start, e.clientX, e.clientY);
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const p = pressRef.current;
      if (p && p.id === e.pointerId) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) >= MOVE_CANCEL_PX) {
          window.clearTimeout(p.timer);
          pressRef.current = null;
        }
        return;
      }
      if (!dragRef.current) return;
      e.preventDefault();
      lastPointRef.current = { x: e.clientX, y: e.clientY };
      updateDragTo(e.clientX, e.clientY);
    };
    const onUp = (e: PointerEvent) => {
      const p = pressRef.current;
      if (p && p.id === e.pointerId) {
        window.clearTimeout(p.timer);
        pressRef.current = null;
      }
      if (dragRef.current) finishDrag();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (dragRef.current && e.cancelable) e.preventDefault();
    };
    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      document.removeEventListener("touchmove", onTouchMove);
    };
  }, [updateDragTo, finishDrag]);

  // 빈 곳 탭 → 선택 취소 (스크롤 제스처는 유지)
  useEffect(() => {
    if (!sel || dragging) return;
    let down: { x: number; y: number; t: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const onUp = (e: PointerEvent) => {
      if (!down || dragRef.current) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < LONG_PRESS_MS;
      down = null;
      if (moved >= MOVE_CANCEL_PX || !quick) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(".study-toolbar, .study-sel-handle")) return;
      clearSelection();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("pointerup", onUp);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerup", onUp);
    };
  }, [sel, dragging, clearSelection]);

  // 도구 막대가 닫히면(버튼 동작 등) 임시 선택도 같이 지움
  useEffect(() => {
    if (dragging) return;
    if (!toolbar || toolbar.kind !== "selection") {
      if (selRef.current) {
        selRef.current = null;
        setSel(null);
      }
    }
  }, [toolbar, dragging]);

  // 스크롤해도 도구 막대가 선택 범위를 따라가게
  useEffect(() => {
    if (!toolbar || toolbar.kind !== "selection") return;
    const onScroll = () => {
      const cur = selRef.current;
      if (!cur) return;
      const next = selectionToolbarFor(cur);
      if (next) setToolbar(next);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [toolbar, selectionToolbarFor]);

  useEffect(() => {
    clearSelection();
  }, [bookId, chapter, clearSelection]);

  useLayoutEffect(() => {
    const el = toolbarRef.current;
    if (!el || !toolbar) return;
    const w = el.offsetWidth;
    const min = w / 2 + 8;
    const max = window.innerWidth - w / 2 - 8;
    el.style.left = `${max < min ? window.innerWidth / 2 : Math.min(max, Math.max(min, toolbar.x))}px`;
  }, [toolbar]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    const remeasure = () => {
      measureNotes();
      measureSel();
    };
    const ro = new ResizeObserver(remeasure);
    ro.observe(root);
    window.addEventListener("resize", remeasure);
    window.addEventListener("orientationchange", remeasure);
    document.fonts?.ready.then(remeasure).catch(() => {});
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("orientationchange", remeasure);
    };
  }, [measureNotes, measureSel, verses]);

  const upsertMark = (
    patch: Omit<StudyMark, "id"> & { id?: string },
  ): StudyMark => {
    const id = patch.id ?? newMarkId();
    const mark: StudyMark = {
      id,
      ref: patch.ref,
      start: patch.start,
      end: patch.end,
      type: patch.type,
      color: patch.color,
    };
    if (patch.note != null && patch.note !== "") mark.note = patch.note;
    const others = dataRef.current.marks.filter((m) => m.id !== id);
    persist({ ...dataRef.current, marks: [...others, mark] });
    return mark;
  };

  const applyHighlight = (color: string) => {
    if (!toolbar) return;
    if (toolbar.kind === "mark") {
      const cur = marksById.get(toolbar.markId);
      if (!cur) return;
      upsertMark({ ...cur, type: "hl", color });
      setToolbar(null);
      return;
    }
    upsertMark({
      ref: toolbar.ref,
      start: toolbar.start,
      end: toolbar.end,
      type: "hl",
      color,
    });
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
  };

  const applyUnderline = () => {
    if (!toolbar) return;
    if (toolbar.kind === "mark") {
      const cur = marksById.get(toolbar.markId);
      if (!cur) return;
      upsertMark({ ...cur, type: "ul", color: UL_COLOR });
      setToolbar(null);
      return;
    }
    upsertMark({
      ref: toolbar.ref,
      start: toolbar.start,
      end: toolbar.end,
      type: "ul",
      color: UL_COLOR,
    });
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
  };

  const eraseFromToolbar = () => {
    if (!toolbar) return;
    if (toolbar.kind === "mark") {
      persist({
        ...dataRef.current,
        marks: dataRef.current.marks.filter((m) => m.id !== toolbar.markId),
      });
      setToolbar(null);
      return;
    }
    const { start, end } = toolbar;
    persist({
      ...dataRef.current,
      marks: dataRef.current.marks.filter(
        (m) => m.end <= start || m.start >= end,
      ),
    });
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
  };

  const copyFromToolbar = async () => {
    if (!toolbar) return;
    let start: number;
    let end: number;
    if (toolbar.kind === "selection") {
      ({ start, end } = toolbar);
    } else {
      const m = marksById.get(toolbar.markId);
      if (!m) return;
      ({ start, end } = m);
    }
    const text = plainRef.current.slice(start, end).trim();
    if (!text) return;
    const v1 = verseContaining(spans, start);
    const v2 = verseContaining(spans, Math.max(start, end - 1));
    const refLabel = `${bookMeta.shortName} ${chapter}:${v1}${v2 !== v1 ? `-${v2}` : ""}`;
    const payload = `${text} (${refLabel})`;
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = payload;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setToolbar(null);
    setToast("복사했어요");
  };

  const beginNoteEdit = (markId: string, initial?: string) => {
    const cur = dataRef.current.marks.find((m) => m.id === markId);
    setEditText(initial ?? cur?.note ?? "");
    setEditingMarkId(markId);
    setToolbar(null);
    setBubble(null);
    window.getSelection()?.removeAllRanges();
  };

  const openNoteFromToolbar = () => {
    if (!toolbar) return;
    if (toolbar.kind === "mark") {
      beginNoteEdit(toolbar.markId);
      return;
    }
    // 선택만 있고 칠이 없으면 노랑 자동 적용 후 메모
    const existing = dataRef.current.marks.find(
      (m) => m.start === toolbar.start && m.end === toolbar.end,
    );
    const mark =
      existing ??
      upsertMark({
        ref: toolbar.ref,
        start: toolbar.start,
        end: toolbar.end,
        type: "hl",
        color: DEFAULT_HL,
      });
    beginNoteEdit(mark.id, mark.note);
  };

  const openWordStudyFromToolbar = () => {
    if (!toolbar) return;
    let selectedKo = "";
    let verse = 1;
    if (toolbar.kind === "selection") {
      selectedKo = plainRef.current.slice(toolbar.start, toolbar.end);
      verse = toolbar.ref;
    } else {
      const mark = marksById.get(toolbar.markId);
      if (!mark) return;
      selectedKo = plainRef.current.slice(mark.start, mark.end);
      verse = mark.ref;
    }
    selectedKo = selectedKo.trim();
    if (!selectedKo) return;
    const matched = matchTokenByGloss(wsTokens, verse, selectedKo);
    if (!matched) return;
    setWsVerse(verse);
    setWsInitial(matched);
    setWsSelectedKo(selectedKo);
    setWsOpen(true);
    setToolbar(null);
    window.getSelection()?.removeAllRanges();
  };

  const commitNoteEdit = () => {
    if (!editingMarkId) return;
    const cur = dataRef.current.marks.find((m) => m.id === editingMarkId);
    if (!cur) {
      setEditingMarkId(null);
      return;
    }
    const text = editText.trim();
    const next: StudyMark = { ...cur };
    if (text) next.note = text;
    else delete next.note;
    persist({
      ...dataRef.current,
      marks: dataRef.current.marks.map((m) =>
        m.id === editingMarkId ? next : m,
      ),
    });
    setEditingMarkId(null);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(dataRef.current, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `haruchi-marks-${bookId}-${chapter}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as ChapterStudyData;
      const loaded = {
        marks: Array.isArray(parsed.marks)
          ? parsed.marks
              .map((m) => {
                const id =
                  typeof m?.id === "string" && m.id ? m.id : newMarkId();
                if (
                  !m ||
                  typeof m.ref !== "number" ||
                  typeof m.start !== "number" ||
                  typeof m.end !== "number"
                ) {
                  return null;
                }
                const out: StudyMark = {
                  id,
                  ref: m.ref,
                  start: m.start,
                  end: m.end,
                  type: m.type === "ul" ? "ul" : "hl",
                  color: typeof m.color === "string" ? m.color : DEFAULT_HL,
                };
                if (typeof m.note === "string" && m.note.trim()) {
                  out.note = m.note;
                }
                return out;
              })
              .filter((m): m is StudyMark => m !== null)
          : [],
        notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      };
      persist(loaded);
    } catch {
      window.alert("가져오기 실패 — JSON 형식을 확인해 주세요.");
    }
  };

  const legacyByRef = useMemo(() => {
    const map = new Map<number, StudyNote>();
    for (const n of data.notes) map.set(n.ref, n);
    return map;
  }, [data.notes]);

  if (error) {
    return (
      <div className="study-root">
        <p className="study-loading">{error}</p>
      </div>
    );
  }

  if (!verses) {
    return (
      <div className="study-root">
        <p className="study-loading">본문을 불러오는 중…</p>
      </div>
    );
  }

  const prev = chapter > 1 ? chapter - 1 : null;
  const nextCh = chapter < total ? chapter + 1 : null;

  return (
    <div className="study-root">
      <div className="study-top">
        <Link href="/bible-reading" className="study-top-back">
          ← 읽기
        </Link>
        <h1 className="study-book-title">{bookMeta.name}</h1>
        <span style={{ width: 48 }} aria-hidden="true" />
      </div>

      <div className="study-shell">
        <div className="study-layout">
          <article className="study-page">
            <span className="study-drop" aria-hidden="true">
              {chapter}
            </span>
            {title ? (
              <span className="study-chapter-title">{title}</span>
            ) : null}
            <div
              className={`study-body${dragging ? " is-selecting" : ""}`}
              ref={bodyRef}
              onPointerDown={onBodyPointerDown}
              onContextMenu={(e) => {
                const t = e.target as HTMLElement;
                if (t.closest(".study-mark-note-input")) return;
                e.preventDefault();
              }}
              onClickCapture={(e) => {
                if (!suppressClickRef.current) return;
                suppressClickRef.current = false;
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              {spans.map((span) => {
                const segs = segmentVerse(
                  span.text,
                  span.start,
                  span.end,
                  data.marks,
                );
                const legacy = legacyByRef.get(span.n);
                const legacyOpen = openLegacy.has(span.n);
                return (
                  <span key={span.n} className="study-verse" data-verse={span.n}>
                    <sup className="study-vnum">{span.n}</sup>
                    <span className="study-verse-text" data-v={span.n}>
                      {segs.map((seg, i) => {
                        const cls = [
                          "study-seg",
                          seg.style.hl ? "study-seg--hl" : "",
                          seg.style.ul ? "study-seg--ul" : "",
                        ]
                          .filter(Boolean)
                          .join(" ");
                        const primaryId = seg.style.markIds[0];
                        const noteHosts = seg.style.noteMarkIds.filter((id) => {
                          const m = marksById.get(id);
                          return m && (m.note || editingMarkId === id);
                        });

                        if (!seg.style.hl && !seg.style.ul && noteHosts.length === 0) {
                          return (
                            <span key={`${span.n}-${i}`}>{seg.text}</span>
                          );
                        }

                        return (
                          <span
                            key={`${span.n}-${i}`}
                            className={cls}
                            style={
                              seg.style.hl
                                ? ({
                                    ["--study-hl"]: seg.style.hl,
                                  } as CSSProperties)
                                : undefined
                            }
                            data-mark-id={primaryId}
                            data-note-anchor={
                              noteHosts.length > 0
                                ? noteHosts.join(" ")
                                : undefined
                            }
                            onClick={(e) => {
                              if (!primaryId) return;
                              if (editingMarkId) return;
                              e.preventDefault();
                              e.stopPropagation();
                              const lines = mergeLineRects(
                                Array.from(
                                  (
                                    e.currentTarget as HTMLElement
                                  ).getClientRects(),
                                ),
                              );
                              const first = lines[0];
                              const last = lines[lines.length - 1];
                              if (!first || !last) return;
                              setToolbar({
                                kind: "mark",
                                markId: primaryId,
                                x: first.left + first.width / 2,
                                y: toolbarTop(first.top, last.bottom),
                              });
                            }}
                          >
                            {seg.text}
                          </span>
                        );
                      })}
                    </span>
                    {legacy ? (
                      <button
                        type="button"
                        className="study-note-dot"
                        aria-label={`${span.n}절 옛 메모`}
                        onClick={() => {
                          setOpenLegacy((prev) => {
                            const n = new Set(prev);
                            if (n.has(span.n)) n.delete(span.n);
                            else n.add(span.n);
                            return n;
                          });
                        }}
                      />
                    ) : null}
                    {legacy ? (
                      <span
                        className={`study-note-legacy${legacyOpen ? " is-open" : ""}`}
                        role="note"
                      >
                        <span className="study-note-legacy-inner">
                          <span>{legacy.text}</span>
                        </span>
                      </span>
                    ) : null}
                  </span>
                );
              })}
              <div className="study-note-layer" aria-label="행간 메모">
                {selRects.map((r, i) => (
                  <span
                    key={`sel-${i}`}
                    className="study-sel-rect"
                    style={{
                      top: r.top,
                      left: r.left,
                      width: r.width,
                      height: r.height,
                    }}
                  />
                ))}
                {selRects.length > 0 ? (
                  <>
                    <span
                      className="study-sel-handle"
                      style={{
                        top: selRects[0].top + selRects[0].height,
                        left: selRects[0].left,
                      }}
                      aria-label="선택 시작 조정"
                      onPointerDown={(e) => onHandlePointerDown("start", e)}
                    />
                    <span
                      className="study-sel-handle"
                      style={{
                        top:
                          selRects[selRects.length - 1].top +
                          selRects[selRects.length - 1].height,
                        left:
                          selRects[selRects.length - 1].left +
                          selRects[selRects.length - 1].width,
                      }}
                      aria-label="선택 끝 조정"
                      onPointerDown={(e) => onHandlePointerDown("end", e)}
                    />
                  </>
                ) : null}
                {Object.entries(notePos).map(([nid, pos]) => {
                  if (editingMarkId === nid) {
                    return (
                      <input
                        key={`edit-${nid}`}
                        ref={editInputRef}
                        className="study-mark-note-input"
                        style={{
                          top: pos.top,
                          left: pos.openLeft,
                          width: pos.openWidth,
                        }}
                        value={editText}
                        aria-label="형광펜 메모"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitNoteEdit();
                          }
                          if (e.key === "Escape") {
                            setEditingMarkId(null);
                          }
                        }}
                        onBlur={commitNoteEdit}
                      />
                    );
                  }
                  const mark = marksById.get(nid);
                  if (!mark?.note) return null;
                  const expanded = expandedNoteId === nid;
                  const isBadge = pos.mode === "badge" && !expanded;
                  const style: CSSProperties = expanded
                    ? { top: pos.top, left: pos.openLeft, width: pos.openWidth }
                    : isBadge
                      ? { top: pos.top, left: pos.left }
                      : { top: pos.top, left: pos.left, maxWidth: pos.width };
                  return (
                    <span
                      key={`note-${nid}`}
                      className={[
                        "study-mark-note",
                        isBadge ? "is-badge" : "",
                        expanded ? "is-open" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={style}
                      data-mark-note-id={nid}
                      title={mark.note}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (expanded) {
                          setExpandedNoteId(null);
                          return;
                        }
                        const el = e.currentTarget as HTMLElement;
                        const truncated =
                          isBadge || el.scrollWidth > el.clientWidth + 1;
                        if (truncated) setExpandedNoteId(nid);
                        else beginNoteEdit(nid);
                      }}
                    >
                      {isBadge ? circledNum(pos.badge ?? 1) : mark.note}
                    </span>
                  );
                })}
              </div>
            </div>
          </article>
        </div>

        <nav className="study-nav" aria-label="장 이동">
          {prev ? (
            <Link href={`/study/${bookId}/${prev}`}>← {prev}장</Link>
          ) : (
            <span>← 이전</span>
          )}
          {nextCh ? (
            <Link href={`/study/${bookId}/${nextCh}`}>{nextCh}장 →</Link>
          ) : (
            <span>다음 →</span>
          )}
        </nav>

        <div className="study-io">
          <button type="button" onClick={exportJson}>
            내보내기
          </button>
          <button type="button" onClick={() => fileRef.current?.click()}>
            가져오기
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importJson(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {toolbar ? (
        <div
          ref={toolbarRef}
          className="study-toolbar"
          style={{ left: toolbar.x, top: toolbar.y }}
          role="toolbar"
          aria-label="형광펜 도구"
          onMouseDown={(e) => e.preventDefault()}
        >
          {HL_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="study-toolbar-swatch"
              style={{ background: c }}
              aria-label={`형광펜 ${c}`}
              onClick={() => applyHighlight(c)}
            />
          ))}
          <button
            type="button"
            className="study-toolbar-btn"
            onClick={applyUnderline}
          >
            밑줄
          </button>
          <button
            type="button"
            className="study-toolbar-btn"
            onClick={openNoteFromToolbar}
          >
            메모
          </button>
          <button
            type="button"
            className="study-toolbar-btn"
            onClick={openWordStudyFromToolbar}
          >
            원어
          </button>
          <button
            type="button"
            className="study-toolbar-btn"
            onClick={() => void copyFromToolbar()}
          >
            복사
          </button>
          <button
            type="button"
            className="study-toolbar-btn"
            onClick={eraseFromToolbar}
          >
            지우개
          </button>
        </div>
      ) : null}

      {toast ? (
        <div className="study-toast" role="status">
          {toast}
        </div>
      ) : null}

      <WordStudySheet
        open={wsOpen}
        bookId={bookId}
        chapter={chapter}
        verse={wsVerse}
        tokens={wsTokens}
        initial={wsInitial}
        selectedKo={wsSelectedKo}
        onClose={() => setWsOpen(false)}
      />

      {bubble ? (
        <div
          className="study-note-bubble"
          style={{ left: bubble.x, top: bubble.y }}
          role="status"
        >
          {bubble.text}
        </div>
      ) : null}

      <span hidden aria-hidden="true">
        {plain.length}
      </span>
    </div>
  );
}

function domPointToOffset(
  root: HTMLElement,
  node: Node,
  offset: number,
  spans: VerseSpan[],
): number | null {
  const verseEl = closestVerseText(node, root);
  if (!verseEl) return null;
  const v = Number(verseEl.dataset.v);
  const span = spans.find((s) => s.n === v);
  if (!span) return null;

  const pre = document.createRange();
  pre.selectNodeContents(verseEl);
  try {
    pre.setEnd(node, offset);
  } catch {
    return span.start;
  }
  // 메모/입력 UI 텍스트는 오프셋에서 제외
  const raw = pre.toString();
  const noteEls = verseEl.querySelectorAll(
    ".study-mark-note, .study-mark-note-input",
  );
  let subtract = 0;
  noteEls.forEach((el) => {
    if (pre.intersectsNode(el)) {
      subtract += (el.textContent || "").length;
      if (el instanceof HTMLInputElement) subtract += el.value.length;
    }
  });
  return span.start + Math.max(0, raw.length - subtract);
}

function verseContaining(spans: VerseSpan[], offset: number): number {
  const hit = spans.find((s) => offset >= s.start && offset < s.end);
  return hit?.n ?? spans[spans.length - 1]?.n ?? 1;
}

function caretFromPoint(
  x: number,
  y: number,
): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
  };
  if (typeof doc.caretRangeFromPoint === "function") {
    const r = doc.caretRangeFromPoint(x, y);
    if (r && r.startContainer.nodeType === Node.TEXT_NODE) {
      return { node: r.startContainer, offset: r.startOffset };
    }
  }
  if (typeof doc.caretPositionFromPoint === "function") {
    const p = doc.caretPositionFromPoint(x, y);
    if (p && p.offsetNode.nodeType === Node.TEXT_NODE) {
      return { node: p.offsetNode, offset: p.offset };
    }
  }
  return null;
}

function verseTextNodes(root: HTMLElement): Text[] {
  const out: Text[] = [];
  root.querySelectorAll<HTMLElement>("[data-v]").forEach((v) => {
    const w = document.createTreeWalker(v, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = w.nextNode())) out.push(n as Text);
  });
  return out;
}

/** caret API가 줄 사이 빈칸 등에서 실패할 때: 가장 가까운 줄의 가장 가까운 글자 경계 */
function offsetFromPointScan(
  root: HTMLElement,
  x: number,
  y: number,
  spans: VerseSpan[],
): number | null {
  let best: { node: Text; offset: number; dy: number; dx: number } | null =
    null;
  const range = document.createRange();
  for (const node of verseTextNodes(root)) {
    range.selectNodeContents(node);
    const boxes = Array.from(range.getClientRects());
    if (
      !boxes.some((b) => y >= b.top - b.height && y <= b.bottom + b.height)
    ) {
      continue;
    }
    const len = node.length;
    for (let i = 0; i < len; i += 1) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const dy =
        y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      if (
        !best ||
        dy < best.dy - 0.5 ||
        (Math.abs(dy - best.dy) <= 0.5 && dx < best.dx)
      ) {
        const after = x > r.left + r.width / 2;
        best = { node, offset: after ? i + 1 : i, dy, dx };
      }
    }
  }
  if (!best) return null;
  return domPointToOffset(root, best.node, best.offset, spans);
}

/** 장 평문 오프셋 → DOM 지점. isEnd면 절 경계에서 앞 절 끝을 고름 */
function offsetToDomPoint(
  root: HTMLElement,
  offset: number,
  spans: VerseSpan[],
  isEnd: boolean,
): { node: Text; offset: number } | null {
  const span =
    spans.find((s) =>
      isEnd ? offset > s.start && offset <= s.end : offset >= s.start && offset < s.end,
    ) ?? (offset >= (spans[spans.length - 1]?.end ?? 0) ? spans[spans.length - 1] : spans[0]);
  if (!span) return null;
  const el = root.querySelector<HTMLElement>(`[data-v="${span.n}"]`);
  if (!el) return null;
  let rem = Math.max(0, Math.min(offset, span.end) - span.start);
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  let last: Text | null = null;
  while ((n = w.nextNode())) {
    const t = n as Text;
    last = t;
    if (rem < t.length || (isEnd && rem === t.length)) {
      return { node: t, offset: rem };
    }
    rem -= t.length;
  }
  return last ? { node: last, offset: last.length } : null;
}

/** Range.getClientRects() 조각을 줄마다 하나로 합침 */
function mergeLineRects(rects: DOMRect[]): DOMRect[] {
  const lines: { top: number; bottom: number; left: number; right: number }[] =
    [];
  for (const r of rects) {
    if (r.width < 0.5) continue;
    const mid = (r.top + r.bottom) / 2;
    const hit = lines.find((l) => mid >= l.top && mid <= l.bottom);
    if (hit) {
      hit.left = Math.min(hit.left, r.left);
      hit.right = Math.max(hit.right, r.right);
      hit.top = Math.min(hit.top, r.top);
      hit.bottom = Math.max(hit.bottom, r.bottom);
    } else {
      lines.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
    }
  }
  return lines
    .sort((a, b) => a.top - b.top)
    .map((l) => new DOMRect(l.left, l.top, l.right - l.left, l.bottom - l.top));
}

function closestVerseText(node: Node, root: HTMLElement): HTMLElement | null {
  let cur: Node | null = node;
  while (cur && cur !== root) {
    if (cur instanceof HTMLElement && cur.dataset.v) return cur;
    cur = cur.parentNode;
  }
  return null;
}

export default StudyNotebook;
