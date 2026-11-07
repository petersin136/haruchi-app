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
  type ReactNode,
} from "react";
import { loadKoreanChapter } from "../../bible-reading/bibleData";
import type { BookId } from "../../bible-reading/books";
import { BOOKS, isNewTestament } from "../../bible-reading/books";
import ChapterEndSentinel from "../../bible-reading/components/ChapterEndSentinel";
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
  /** /bible-reading 본문 자리에 끼울 때 — 자체 머리·장 링크 숨김 */
  embedded?: boolean;
  flashVerse?: number | null;
  onEndVisibilityChange?: (visible: boolean) => void;
  endSentinelNonce?: number;
  onMoveChapter?: (chapter: number) => void;
};

/** PC(≥960) 에서는 .brp-reader 가 스크롤 컨테이너 */
function scrollRootOf(body: HTMLElement | null): HTMLElement | Window {
  const reader = body?.closest(".brp-reader") as HTMLElement | null;
  if (reader && reader.scrollHeight > reader.clientHeight + 4) return reader;
  return window;
}

function scrollByY(root: HTMLElement | Window, dy: number) {
  if (root === window) window.scrollBy(0, dy);
  else (root as HTMLElement).scrollBy({ top: dy, behavior: "auto" });
}

function edgeY(root: HTMLElement | Window, clientY: number): number {
  if (root === window) return clientY;
  const r = (root as HTMLElement).getBoundingClientRect();
  return clientY - r.top;
}

function edgeHeight(root: HTMLElement | Window): number {
  if (root === window) return window.innerHeight;
  return (root as HTMLElement).clientHeight;
}

type ToolbarMode =
  | {
      kind: "selection";
      start: number;
      end: number;
      ref: number;
      /** 선택 범위 가운데 x, 위·아래 끝 y (화면 좌표) */
      x: number;
      rt: number;
      rb: number;
    }
  | {
      kind: "mark";
      markId: string;
      x: number;
      rt: number;
      rb: number;
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

/** 시작점~본문 오른쪽 끝이 본문 폭의 이 비율보다 좁으면 줄 왼쪽 끝에서 시작 */
const NOTE_MIN_RATIO = 0.4;
/** 같은 줄 앞 메모가 이 폭보다 좁아지면 뒤 메모는 번호 배지로 */
const NOTE_MIN_ROOM = 40;

const LONG_PRESS_MS = 350;
const MOVE_CANCEL_PX = 8;
const AUTO_SCROLL_EDGE = 60;
/** 도구 막대가 화면 좌우에서 떨어질 최소 거리 */
const TOOLBAR_EDGE = 12;
/** 꼬리가 알약 둥근 끝에 붙지 않게 */
const TOOLBAR_TAIL_INSET = 24;
const TOOLBAR_GAP = 10;
/** 손잡이 원(18px)이 줄 아래로 내려오는 높이 + 여유 */
const SEL_HANDLE_SIZE = 20;
/** 손잡이를 이만큼 가만히 잡고 있으면 글자 단위 */
const CHAR_MODE_MS = 400;
const CHAR_MODE_STILL_PX = 4;
/** 끄는 동안 손잡이를 손가락보다 위로 */
const HANDLE_LIFT = 12;
const MAG_W = 120;
const MAG_H = 44;
const MAG_GAP = 60;
const MAG_SCALE = 1.5;
const MAG_FADE_MS = 150;

type DragMode = "press" | "start" | "end";

type SelRect = { top: number; left: number; width: number; height: number };

/** 선택 범위 위에 둘 자리가 없으면 아래로 */
function toolbarTop(
  rangeTop: number,
  rangeBottom: number,
  h: number,
): { top: number; below: boolean } {
  const above = rangeTop - h - TOOLBAR_GAP;
  if (above >= 8) return { top: above, below: false };
  return {
    top: Math.min(rangeBottom + TOOLBAR_GAP, window.innerHeight - h - 8),
    below: true,
  };
}

type BubbleState = {
  text: string;
  x: number;
  y: number;
};

function StudyNotebook({
  bookId,
  chapter,
  embedded = false,
  flashVerse = null,
  onEndVisibilityChange,
  endSentinelNonce = 0,
  onMoveChapter,
}: Props) {
  const wordStudyOk = isNewTestament(bookId);
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
  const dragRef = useRef<{
    mode: DragMode;
    /** press: 길게 누른 어절. 이 범위는 늘 선택에 남음 */
    anchorStart: number;
    anchorEnd: number;
    /** 손잡이: 잡은 손가락과 줄 가운데 사이 거리 */
    grabDy: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const [charMode, setCharMode] = useState(false);
  const charModeRef = useRef(false);
  const charTimerRef = useRef<{ timer: number; x: number; y: number } | null>(
    null,
  );
  const [magState, setMagState] = useState<"hidden" | "shown" | "hiding">(
    "hidden",
  );
  const magRef = useRef<HTMLDivElement | null>(null);
  const magInnerRef = useRef<HTMLDivElement | null>(null);
  const magCursorRef = useRef<HTMLDivElement | null>(null);
  const magHideTimerRef = useRef(0);
  const selRectsRef = useRef<SelRect[]>([]);
  /** setPointerCapture 한 요소 — 반드시 같은 곳에서 release */
  const captureTargetRef = useRef<HTMLElement | null>(null);
  const capturePointerIdRef = useRef<number | null>(null);
  const lastPointerAtRef = useRef(performance.now());
  const gestureFnsRef = useRef({
    updateDragTo: (_x: number, _y: number) => {},
    armCharTimer: (_x: number, _y: number) => {},
    placeMagnifier: () => {},
    finishDrag: () => {},
    abortSelectGesture: (_o?: {
      keepSelection?: boolean;
      showToolbar?: boolean;
    }) => {},
  });
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
  const [toolTip, setToolTip] = useState<string | null>(null);
  const tipTimerRef = useRef(0);
  /** 이름 말풍선을 띄운 길게 누르기는 버튼 동작으로 치지 않음 */
  const tipShownRef = useRef(false);
  const [backupOpen, setBackupOpen] = useState(false);

  const startToolTip = (label: string) => {
    window.clearTimeout(tipTimerRef.current);
    tipShownRef.current = false;
    tipTimerRef.current = window.setTimeout(() => {
      tipShownRef.current = true;
      setToolTip(label);
    }, LONG_PRESS_MS);
  };

  const endToolTip = () => {
    window.clearTimeout(tipTimerRef.current);
    setToolTip(null);
  };
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
  const words = useMemo(() => buildWords(spans), [spans]);

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
      selRectsRef.current = [];
      setSelRects([]);
      return;
    }
    const a = offsetToDomPoint(root, cur.start, spans, false);
    const b = offsetToDomPoint(root, cur.end, spans, true);
    if (!a || !b) {
      selRectsRef.current = [];
      setSelRects([]);
      return;
    }
    const range = document.createRange();
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset);
    const base = root.getBoundingClientRect();
    const rects = mergeLineRects(Array.from(range.getClientRects())).map((r) => ({
      top: r.top - base.top,
      left: r.left - base.left,
      width: r.width,
      height: r.height,
    }));
    selRectsRef.current = rects;
    setSelRects(rects);
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
        rt: first.top,
        rb: last.bottom + SEL_HANDLE_SIZE,
      };
    },
    [spans],
  );

  const clearSelection = useCallback(() => {
    setSel(null);
    setToolbar((t) => (t?.kind === "selection" ? null : t));
  }, []);

  const stopCharTimer = useCallback(() => {
    if (charTimerRef.current) {
      window.clearTimeout(charTimerRef.current.timer);
      charTimerRef.current = null;
    }
  }, []);

  /** 손잡이를 잡은 채 400ms 가만히 → 글자 단위 */
  const armCharTimer = useCallback(
    (x: number, y: number) => {
      stopCharTimer();
      const timer = window.setTimeout(() => {
        charTimerRef.current = null;
        const d = dragRef.current;
        if (!d || d.mode === "press" || charModeRef.current) return;
        charModeRef.current = true;
        setCharMode(true);
        if (isAndroid()) navigator.vibrate?.(10);
      }, CHAR_MODE_MS);
      charTimerRef.current = { timer, x, y };
    },
    [stopCharTimer],
  );

  const releasePointerCaptureSafe = useCallback(() => {
    const el = captureTargetRef.current;
    const id = capturePointerIdRef.current;
    if (el && id != null) {
      try {
        if (el.hasPointerCapture?.(id)) el.releasePointerCapture(id);
      } catch {
        /* already released */
      }
    }
    captureTargetRef.current = null;
    capturePointerIdRef.current = null;
  }, []);

  /**
   * 선택 제스처 강제 종료 — capture·플래그·확대경·오토스크롤을 한곳에서 원복.
   * keepSelection: 손 뗀 뒤 노란 선택·도구 막대는 남김.
   */
  const abortSelectGesture = useCallback(
    (opts?: { keepSelection?: boolean; showToolbar?: boolean }) => {
      const keep = opts?.keepSelection ?? false;
      const showTb = opts?.showToolbar ?? false;
      if (pressRef.current) {
        window.clearTimeout(pressRef.current.timer);
        pressRef.current = null;
      }
      stopCharTimer();
      charModeRef.current = false;
      setCharMode(false);
      releasePointerCaptureSafe();
      const hadDrag = !!dragRef.current;
      dragRef.current = null;
      setDragging(false);
      if (autoScrollRef.current) {
        cancelAnimationFrame(autoScrollRef.current);
        autoScrollRef.current = 0;
      }
      window.clearTimeout(magHideTimerRef.current);
      setMagState("hidden");
      if (!keep) {
        selRef.current = null;
        setSel(null);
        setToolbar((t) => (t?.kind === "selection" ? null : t));
      } else if (showTb && hadDrag) {
        const cur = selRef.current;
        if (cur) setToolbar(selectionToolbarFor(cur));
      }
    },
    [releasePointerCaptureSafe, stopCharTimer, selectionToolbarFor],
  );

  const finishDrag = useCallback(() => {
    if (!dragRef.current) return;
    abortSelectGesture({ keepSelection: true, showToolbar: true });
  }, [abortSelectGesture]);

  const updateDragTo = useCallback(
    (x: number, y: number) => {
      const d = dragRef.current;
      if (!d) return;
      const hitY = d.mode === "press" ? y : y - d.grabDy - HANDLE_LIFT;
      const off = offsetAtPoint(x, hitY);
      if (off == null) return;
      const max = plainRef.current.length;
      const f = Math.max(0, Math.min(max, off));
      const byChar = charModeRef.current;
      const toEnd = (b: number) => (byChar ? b : snapEnd(words, b));
      const toStart = (b: number) => (byChar ? b : snapStart(words, b));
      let next: { start: number; end: number } | null = null;
      if (d.mode === "press") {
        if (f > d.anchorEnd) {
          const e = toEnd(f);
          next = { start: d.anchorStart, end: Math.max(e ?? d.anchorEnd, d.anchorEnd) };
        } else if (f < d.anchorStart) {
          const s = toStart(f);
          next = { start: Math.min(s ?? d.anchorStart, d.anchorStart), end: d.anchorEnd };
        } else {
          next = { start: d.anchorStart, end: d.anchorEnd };
        }
      } else {
        const cur = selRef.current;
        if (!cur) return;
        const fixed = d.mode === "start" ? cur.end : cur.start;
        if (d.mode === "end") {
          const e = f > fixed ? toEnd(f) : null;
          if (e != null && e > fixed) next = { start: fixed, end: e };
          else if (f < fixed) {
            const s = toStart(f);
            if (s != null && s < fixed) {
              next = { start: s, end: fixed };
              d.mode = "start";
            }
          }
        } else {
          const s = f < fixed ? toStart(f) : null;
          if (s != null && s < fixed) next = { start: s, end: fixed };
          else if (f > fixed) {
            const e = toEnd(f);
            if (e != null && e > fixed) {
              next = { start: fixed, end: e };
              d.mode = "end";
            }
          }
        }
      }
      if (!next) return;
      next.end = Math.min(max, next.end);
      if (next.end <= next.start) return;
      const prevSel = selRef.current;
      if (prevSel && prevSel.start === next.start && prevSel.end === next.end) return;
      selRef.current = next;
      setSel(next);
    },
    [offsetAtPoint, words],
  );

  /** 선택의 움직이는 끝(캐럿) 위치, 화면 좌표 */
  const movingCaret = useCallback(() => {
    const root = bodyRef.current;
    const rects = selRectsRef.current;
    const d = dragRef.current;
    const cur = selRef.current;
    if (!root || rects.length === 0 || !cur) return null;
    let atStart = d?.mode === "start";
    if (d?.mode === "press") atStart = cur.start < d.anchorStart;
    const r = atStart ? rects[0] : rects[rects.length - 1];
    const base = root.getBoundingClientRect();
    return {
      x: base.left + (atStart ? r.left : r.left + r.width),
      y: base.top + r.top + r.height / 2,
      h: r.height,
    };
  }, []);

  const placeMagnifier = useCallback(() => {
    const mag = magRef.current;
    const inner = magInnerRef.current;
    const cursor = magCursorRef.current;
    const article = bodyRef.current?.closest(".study-page") as HTMLElement | null;
    const caret = movingCaret();
    if (!mag || !inner || !article || !caret) return;
    const { x, y } = lastPointRef.current;
    const left = Math.max(8, Math.min(window.innerWidth - MAG_W - 8, x - MAG_W / 2));
    let top = y - MAG_GAP - MAG_H;
    if (top < 8) top = y + MAG_GAP;
    mag.style.left = `${left}px`;
    mag.style.top = `${top}px`;
    const ar = article.getBoundingClientRect();
    const cw = mag.clientWidth / 2;
    const ch = mag.clientHeight / 2;
    const tx = cw - (caret.x - ar.left) * MAG_SCALE;
    const ty = ch - (caret.y - ar.top) * MAG_SCALE;
    inner.style.transform = `translate(${tx}px, ${ty}px) scale(${MAG_SCALE})`;
    if (cursor) {
      const h = caret.h * MAG_SCALE;
      cursor.style.height = `${h}px`;
      cursor.style.top = `${ch - h / 2}px`;
    }
  }, [movingCaret]);

  // 확대경 속 본문: 선택이 바뀔 때마다 본문을 복제해 1.5배로
  useLayoutEffect(() => {
    if (magState !== "shown") return;
    const inner = magInnerRef.current;
    const article = bodyRef.current?.closest(".study-page") as HTMLElement | null;
    if (!inner || !article) return;
    const clone = article.cloneNode(true) as HTMLElement;
    clone.style.width = `${article.offsetWidth}px`;
    clone.style.margin = "0";
    clone.removeAttribute("id");
    inner.replaceChildren(clone);
    placeMagnifier();
  }, [magState, selRects, placeMagnifier]);

  useEffect(() => {
    if (magState !== "hiding") return;
    magHideTimerRef.current = window.setTimeout(() => {
      setMagState("hidden");
    }, MAG_FADE_MS);
    return () => window.clearTimeout(magHideTimerRef.current);
  }, [magState]);

  const runAutoScroll = useCallback(() => {
    const d = dragRef.current;
    if (!d) {
      autoScrollRef.current = 0;
      return;
    }
    const { x, y } = lastPointRef.current;
    const root = scrollRootOf(bodyRef.current);
    const h = edgeHeight(root);
    const ey = edgeY(root, y);
    let dy = 0;
    if (ey < AUTO_SCROLL_EDGE) dy = -Math.ceil(((AUTO_SCROLL_EDGE - ey) / AUTO_SCROLL_EDGE) * 14);
    else if (ey > h - AUTO_SCROLL_EDGE)
      dy = Math.ceil(((ey - (h - AUTO_SCROLL_EDGE)) / AUTO_SCROLL_EDGE) * 14);
    if (dy !== 0) {
      scrollByY(root, dy);
      updateDragTo(x, y);
    }
    autoScrollRef.current = requestAnimationFrame(runAutoScroll);
  }, [updateDragTo]);

  const beginDrag = useCallback(
    (
      mode: DragMode,
      anchor: { start: number; end: number },
      x: number,
      y: number,
      grabDy = 0,
    ) => {
      dragRef.current = {
        mode,
        anchorStart: anchor.start,
        anchorEnd: anchor.end,
        grabDy,
        originX: x,
        originY: y,
        moved: false,
      };
      lastPointRef.current = { x, y };
      lastPointerAtRef.current = performance.now();
      charModeRef.current = false;
      setCharMode(false);
      setDragging(true);
      document.documentElement.dataset.studySelecting = "1";
      window.dispatchEvent(new Event("haruchi:study-selecting"));
      if (mode !== "press") armCharTimer(x, y);
      if (!autoScrollRef.current) {
        autoScrollRef.current = requestAnimationFrame(runAutoScroll);
      }
    },
    [runAutoScroll, armCharTimer],
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
      const w = wordAt(words, off);
      if (!w) return;
      if (isAndroid()) navigator.vibrate?.(10);
      suppressClickRef.current = true;
      setExpandedNoteId(null);
      const first = { start: w.start, end: w.end };
      selRef.current = first;
      setSel(first);
      setToolbar(selectionToolbarFor(first));
      beginDrag("press", first, startX, startY);
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
    const root = bodyRef.current;
    const rects = selRectsRef.current;
    if (!cur || !root || rects.length === 0) return;
    const hit = e.currentTarget as HTMLElement;
    captureTargetRef.current = hit;
    capturePointerIdRef.current = e.pointerId;
    hit.setPointerCapture?.(e.pointerId);
    suppressClickRef.current = true;
    const r = which === "start" ? rects[0] : rects[rects.length - 1];
    const lineMid = root.getBoundingClientRect().top + r.top + r.height / 2;
    beginDrag(which, cur, e.clientX, e.clientY, e.clientY - lineMid);
  };

  gestureFnsRef.current.updateDragTo = updateDragTo;
  gestureFnsRef.current.armCharTimer = armCharTimer;
  gestureFnsRef.current.placeMagnifier = placeMagnifier;
  gestureFnsRef.current.finishDrag = finishDrag;
  gestureFnsRef.current.abortSelectGesture = abortSelectGesture;

  // 선택 중 포인터/터치 리스너 — 빈 deps 로 드래그 중 재구독 방지
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      lastPointerAtRef.current = performance.now();
      const p = pressRef.current;
      if (p && p.id === e.pointerId) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) >= MOVE_CANCEL_PX) {
          window.clearTimeout(p.timer);
          pressRef.current = null;
        }
        return;
      }
      const d = dragRef.current;
      if (!d) return;
      e.preventDefault();
      const { x: px, y: py } = lastPointRef.current;
      if (px === e.clientX && py === e.clientY) return;
      lastPointRef.current = { x: e.clientX, y: e.clientY };
      if (!d.moved) {
        if (
          Math.hypot(e.clientX - d.originX, e.clientY - d.originY) <
          CHAR_MODE_STILL_PX
        ) {
          return;
        }
        d.moved = true;
        setToolbar(null);
        window.clearTimeout(magHideTimerRef.current);
        setMagState("shown");
      }
      const still = charTimerRef.current;
      const fns = gestureFnsRef.current;
      if (
        d.mode !== "press" &&
        !charModeRef.current &&
        (!still ||
          Math.hypot(e.clientX - still.x, e.clientY - still.y) >=
            CHAR_MODE_STILL_PX)
      ) {
        fns.armCharTimer(e.clientX, e.clientY);
      }
      fns.updateDragTo(e.clientX, e.clientY);
      fns.placeMagnifier();
    };

    const onUp = () => {
      lastPointerAtRef.current = performance.now();
      const p = pressRef.current;
      if (p) {
        window.clearTimeout(p.timer);
        pressRef.current = null;
      }
      if (dragRef.current) gestureFnsRef.current.finishDrag();
    };

    const onAbort = () => {
      if (!dragRef.current && !pressRef.current) return;
      gestureFnsRef.current.abortSelectGesture({
        keepSelection: true,
        showToolbar: true,
      });
    };

    const onTouchMove = (e: TouchEvent) => {
      if (dragRef.current && e.cancelable) e.preventDefault();
    };

    const onVis = () => {
      if (document.visibilityState === "hidden") onAbort();
    };

    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    document.addEventListener("lostpointercapture", onUp);
    document.addEventListener("touchend", onUp, { passive: true });
    document.addEventListener("touchcancel", onUp, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("blur", onAbort);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      document.removeEventListener("lostpointercapture", onUp);
      document.removeEventListener("touchend", onUp);
      document.removeEventListener("touchcancel", onUp);
      document.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("blur", onAbort);
      document.removeEventListener("visibilitychange", onVis);
      gestureFnsRef.current.abortSelectGesture({ keepSelection: true });
    };
  }, []);

    // 공부 노트 선택 상태를 서랍 스와이프에 알림
  useEffect(() => {
    const on =
      dragging ||
      !!sel ||
      toolbar?.kind === "selection" ||
      magState === "shown";
    if (on) document.documentElement.dataset.studySelecting = "1";
    else delete document.documentElement.dataset.studySelecting;
    return () => {
      delete document.documentElement.dataset.studySelecting;
    };
  }, [dragging, sel, toolbar, magState]);

  // 드래그 중 3초 무터치 → 강제 정리 (먹통 안전장치)
  useEffect(() => {
    if (!dragging) return;
    lastPointerAtRef.current = performance.now();
    const id = window.setInterval(() => {
      if (!dragRef.current) return;
      if (performance.now() - lastPointerAtRef.current < 3000) return;
      abortSelectGesture({ keepSelection: true, showToolbar: true });
    }, 400);
    return () => window.clearInterval(id);
  }, [dragging, abortSelectGesture]);


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
    const root = scrollRootOf(bodyRef.current);
    const target: EventTarget = root === window ? window : root;
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, [toolbar, selectionToolbarFor]);

  useEffect(() => {
    clearSelection();
  }, [bookId, chapter, clearSelection]);

  // 검색 결과 절 — 본문이 그려진 뒤 data-verse-num 을 찾아 스크롤·강조
  useEffect(() => {
    if (flashVerse == null || !verses) return;
    const target = flashVerse;
    let cancelled = false;
    let tries = 0;
    const run = () => {
      if (cancelled) return;
      const el = bodyRef.current?.querySelector<HTMLElement>(
        `[data-verse-num="${target}"]`,
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("is-flash");
        window.setTimeout(() => el.classList.remove("is-flash"), 2000);
        return;
      }
      if (tries++ < 60) requestAnimationFrame(run);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [flashVerse, verses, bookId, chapter]);

  // 화면 좌우 12px 안으로 보정 + 꼬리는 선택 범위 쪽
  useLayoutEffect(() => {
    const el = toolbarRef.current;
    if (!el || !toolbar) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const left = Math.max(
      TOOLBAR_EDGE,
      Math.min(vw - TOOLBAR_EDGE - w, toolbar.x - w / 2),
    );
    const { top, below } = toolbarTop(toolbar.rt, toolbar.rb, h);
    const tail = Math.max(
      TOOLBAR_TAIL_INSET,
      Math.min(w - TOOLBAR_TAIL_INSET, toolbar.x - left),
    );
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.setProperty("--tail-x", `${tail}px`);
    el.classList.toggle("is-below", below);
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
    if (!toolbar || !wordStudyOk) return;
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
      <div className={`study-root${embedded ? " is-embedded" : ""}`}>
        <p className="study-loading">{error}</p>
      </div>
    );
  }

  if (!verses) {
    return (
      <div className={`study-root${embedded ? " is-embedded" : ""}`}>
        <p className="study-loading">본문을 불러오는 중…</p>
      </div>
    );
  }

  const toolbarMark =
    toolbar?.kind === "mark" ? marksById.get(toolbar.markId) : undefined;
  const activeColor =
    toolbarMark?.type === "hl" ? toolbarMark.color.toUpperCase() : null;

  const prev = chapter > 1 ? chapter - 1 : null;
  const nextCh = chapter < total ? chapter + 1 : null;

  const digLen = String(chapter).length;

  return (
    <div className={`study-root${embedded ? " is-embedded" : ""}`}>
      {!embedded ? (
        <div className="study-top">
          <Link href="/bible-reading" className="study-top-back">
            ← 읽기
          </Link>
          <div className="study-top-row">
            <h1 className="study-book-title">{bookMeta.name}</h1>
            <span className="study-top-count">
              {chapter} / {total}
            </span>
          </div>
        </div>
      ) : null}

      <div className="study-shell">
        <div className="study-layout">
          <article className="study-page">
            <span
              className={`study-drop${digLen >= 3 ? " is-wide" : ""}`}
              data-digits={digLen}
              aria-hidden="true"
            >
              <span className="study-drop-num">{chapter}</span>
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
                  <span
                    key={span.n}
                    className="study-verse"
                    data-verse={span.n}
                    data-verse-num={span.n}
                  >
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
                                rt: first.top,
                                rb: last.bottom,
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
                      className="study-sel-handle is-start"
                      style={{
                        top: selRects[0].top,
                        left: selRects[0].left,
                        height: selRects[0].height,
                      }}
                    >
                      <span className="study-sel-handle-bar" />
                      <span className="study-sel-handle-knob" />
                      <span
                        className="study-sel-handle-hit"
                        aria-label="선택 시작 조정"
                        onPointerDown={(e) => onHandlePointerDown("start", e)}
                      />
                    </span>
                    <span
                      className="study-sel-handle is-end"
                      style={{
                        top: selRects[selRects.length - 1].top,
                        left:
                          selRects[selRects.length - 1].left +
                          selRects[selRects.length - 1].width,
                        height: selRects[selRects.length - 1].height,
                      }}
                    >
                      <span className="study-sel-handle-bar" />
                      <span className="study-sel-handle-knob" />
                      <span
                        className="study-sel-handle-hit"
                        aria-label="선택 끝 조정"
                        onPointerDown={(e) => onHandlePointerDown("end", e)}
                      />
                    </span>
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
            {verses.length > 0 && onEndVisibilityChange ? (
              <ChapterEndSentinel
                key={`end-${bookId}-${chapter}-krv-${endSentinelNonce}`}
                onVisibilityChange={onEndVisibilityChange}
              />
            ) : null}
          </article>
        </div>

        {!embedded ? (
        <nav className="study-nav" aria-label="장 이동">
          {prev ? (
            onMoveChapter ? (
              <button
                type="button"
                className="study-nav-link is-prev"
                onClick={() => onMoveChapter(prev)}
              >
                <span className="study-nav-label">← 이전 장</span>
                <span className="study-nav-name">{prev}장</span>
              </button>
            ) : (
              <Link href={`/study/${bookId}/${prev}`} className="study-nav-link is-prev">
                <span className="study-nav-label">← 이전 장</span>
                <span className="study-nav-name">{prev}장</span>
              </Link>
            )
          ) : (
            <span aria-hidden="true" />
          )}
          {nextCh ? (
            onMoveChapter ? (
              <button
                type="button"
                className="study-nav-link is-next"
                onClick={() => onMoveChapter(nextCh)}
              >
                <span className="study-nav-label">다음 장 →</span>
                <span className="study-nav-name">{nextCh}장</span>
              </button>
            ) : (
              <Link href={`/study/${bookId}/${nextCh}`} className="study-nav-link is-next">
                <span className="study-nav-label">다음 장 →</span>
                <span className="study-nav-name">{nextCh}장</span>
              </Link>
            )
          ) : (
            <span aria-hidden="true" />
          )}
        </nav>
        ) : null}

        <div className={`study-io${embedded ? " is-embedded" : ""}`}>
          <button
            type="button"
            className="study-io-link"
            onClick={() => setBackupOpen(true)}
          >
            노트 백업
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
          style={{ left: toolbar.x, top: toolbar.rt }}
          role="toolbar"
          aria-label="형광펜 도구"
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="study-toolbar-colors">
            {HL_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`study-toolbar-swatch${
                  activeColor === c.toUpperCase() ? " is-active" : ""
                }`}
                style={{ background: c }}
                aria-label={`형광펜 ${c}`}
                onClick={() => applyHighlight(c)}
              />
            ))}
          </div>
          <span className="study-toolbar-divider" aria-hidden="true" />
          <div className="study-toolbar-icons">
            {(
              [
                { label: "밑줄", action: applyUnderline, icon: <IconUnderline /> },
                { label: "메모", action: openNoteFromToolbar, icon: <IconPen /> },
                ...(wordStudyOk
                  ? [
                      {
                        label: "원어",
                        action: openWordStudyFromToolbar,
                        icon: <span className="study-toolbar-alpha">α</span>,
                      },
                    ]
                  : []),
                {
                  label: "복사",
                  action: () => void copyFromToolbar(),
                  icon: <IconCopy />,
                },
                { label: "지우개", action: eraseFromToolbar, icon: <IconEraser /> },
              ] as {
                label: string;
                action: () => void;
                icon: ReactNode;
              }[]
            ).map(({ label, action, icon }) => (
              <button
                key={label}
                type="button"
                className="study-toolbar-btn"
                aria-label={label}
                onPointerDown={() => startToolTip(label)}
                onPointerUp={endToolTip}
                onPointerLeave={endToolTip}
                onPointerCancel={endToolTip}
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => {
                  if (tipShownRef.current) {
                    tipShownRef.current = false;
                    return;
                  }
                  action();
                }}
              >
                {icon}
                {toolTip === label ? (
                  <span className="study-toolbar-tip" aria-hidden="true">
                    {label}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {backupOpen ? (
        <div className="study-backup-root">
          <button
            type="button"
            className="study-backup-backdrop"
            aria-label="닫기"
            onClick={() => setBackupOpen(false)}
          />
          <div className="study-backup-sheet" role="dialog" aria-label="노트 백업">
            <span className="study-backup-handle" aria-hidden="true" />
            <button
              type="button"
              className="study-backup-row"
              onClick={() => {
                setBackupOpen(false);
                exportJson();
              }}
            >
              <IconDownload />
              <span>파일로 저장</span>
            </button>
            <button
              type="button"
              className="study-backup-row"
              onClick={() => {
                setBackupOpen(false);
                fileRef.current?.click();
              }}
            >
              <IconUpload />
              <span>파일 불러오기</span>
            </button>
          </div>
        </div>
      ) : null}

      {magState !== "hidden" ? (
        <div
          ref={magRef}
          className={`study-mag${charMode ? " is-char" : ""}${
            magState === "hiding" ? " is-hiding" : ""
          }`}
          aria-hidden
        >
          <div ref={magInnerRef} className="study-mag-inner" />
          <div ref={magCursorRef} className="study-mag-cursor" />
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
        onNavigate={(nextBook, nextChapter) => {
          if (onMoveChapter && nextBook === bookId) {
            onMoveChapter(nextChapter);
            return;
          }
          if (embedded) {
            window.location.assign(
              `/bible-reading?book=${encodeURIComponent(nextBook)}&chapter=${nextChapter}`,
            );
            return;
          }
          window.location.assign(`/study/${nextBook}/${nextChapter}`);
        }}
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

function ToolIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="study-toolbar-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function IconUnderline() {
  return (
    <ToolIcon>
      <path d="M7 4v6a5 5 0 0 0 10 0V4" />
      <path d="M5 20h14" />
    </ToolIcon>
  );
}

function IconPen() {
  return (
    <ToolIcon>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </ToolIcon>
  );
}

function IconCopy() {
  return (
    <ToolIcon>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </ToolIcon>
  );
}

function IconEraser() {
  return (
    <ToolIcon>
      <path d="m7 21-4.3-4.3a2.4 2.4 0 0 1 0-3.4l9.6-9.6a2.4 2.4 0 0 1 3.4 0l5.6 5.6a2.4 2.4 0 0 1 0 3.4L13 21" />
      <path d="M22 21H7" />
      <path d="m5 11 9 9" />
    </ToolIcon>
  );
}

function IconDownload() {
  return (
    <ToolIcon>
      <path d="M12 4v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 20h14" />
    </ToolIcon>
  );
}

function IconUpload() {
  return (
    <ToolIcon>
      <path d="M12 15V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 20h14" />
    </ToolIcon>
  );
}

type WordRange = { start: number; end: number };

const WORD_FALLBACK_RE = /[^\s.,?!;:·"'“”‘’()[\]{}「」『』《》〈〉…~\-—]+/g;

/** 절마다 어절(띄어쓰기 기준) 범위. 문장부호는 빼고, 절 경계는 항상 단어 경계 */
function buildWords(spans: VerseSpan[]): WordRange[] {
  const out: WordRange[] = [];
  const Seg = (Intl as unknown as {
    Segmenter?: new (
      locale: string,
      opts: { granularity: "word" },
    ) => {
      segment: (s: string) => Iterable<{
        segment: string;
        index: number;
        isWordLike?: boolean;
      }>;
    };
  }).Segmenter;
  const segmenter = Seg ? new Seg("ko", { granularity: "word" }) : null;
  for (const span of spans) {
    const text = span.text;
    if (segmenter) {
      let cur: WordRange | null = null;
      for (const s of segmenter.segment(text)) {
        const a = span.start + s.index;
        const b = a + s.segment.length;
        if (s.isWordLike) {
          // 띄어쓰기 없이 붙은 조각은 한 어절로 합침
          if (cur && cur.end === a) cur.end = b;
          else {
            cur = { start: a, end: b };
            out.push(cur);
          }
        } else {
          cur = null;
        }
      }
    } else {
      for (const m of text.matchAll(WORD_FALLBACK_RE)) {
        const a = span.start + (m.index ?? 0);
        out.push({ start: a, end: a + m[0].length });
      }
    }
  }
  return out;
}

function wordContainingChar(words: WordRange[], c: number): WordRange | null {
  let lo = 0;
  let hi = words.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const w = words[mid];
    if (c < w.start) hi = mid - 1;
    else if (c >= w.end) lo = mid + 1;
    else return w;
  }
  return null;
}

/** 경계 b에서 끝을 단어 끝으로: b 왼쪽 글자의 단어, 없으면 앞 단어 */
function snapEnd(words: WordRange[], b: number): number | null {
  const w = wordContainingChar(words, b - 1);
  if (w) return w.end;
  for (let i = words.length - 1; i >= 0; i -= 1) {
    if (words[i].end <= b) return words[i].end;
  }
  return null;
}

/** 경계 b에서 시작을 단어 시작으로: b 오른쪽 글자의 단어, 없으면 다음 단어 */
function snapStart(words: WordRange[], b: number): number | null {
  const w = wordContainingChar(words, b);
  if (w) return w.start;
  for (const x of words) {
    if (x.start >= b) return x.start;
  }
  return null;
}

/** 길게 누른 자리의 어절. 공백·문장부호 위면 가까운 단어 */
function wordAt(words: WordRange[], off: number): WordRange | null {
  const hit =
    wordContainingChar(words, off) ?? wordContainingChar(words, off - 1);
  if (hit) return hit;
  let best: WordRange | null = null;
  let bestD = Infinity;
  for (const w of words) {
    const d = off < w.start ? w.start - off : off - w.end;
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best;
}

function isAndroid(): boolean {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
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
