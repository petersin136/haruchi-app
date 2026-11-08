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
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { loadKoreanChapter } from "../../bible-reading/bibleData";
import type { BookId } from "../../bible-reading/books";
import { BOOK_ORDER, BOOKS, isOldTestament } from "../../bible-reading/books";
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
  type TextSeg,
  type VerseSpan,
} from "../lib/offsets";
import {
  loadParagraphMap,
  paragraphStartsForChapter,
  type ParagraphMap,
} from "../lib/paragraphs";
import {
  isStudyDebugOn,
  pushStudyDebug,
  subscribeStudyDebug,
} from "../lib/studyDebug";
import {
  loadChapterWordStudy,
  matchTokenByGloss,
  type WordStudyToken,
} from "../lib/wordStudy";
import WordStudySheet from "./WordStudySheet";
import {
  STUDY_SPREAD_ANIM_MS,
  STUDY_SPREAD_BAR_H,
  STUDY_SPREAD_EDGE,
  STUDY_SPREAD_OUTER,
  STUDY_SPREAD_PGNUM_H,
  STUDY_SPREAD_SWIPE_PX,
  STUDY_SPREAD_TOPBAR,
  calcSpreadGeometry,
  chapterLabel,
  subscribeStudySpread,
} from "../lib/studySpread";
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
  /** 스프레드: 책 마지막 장 다음 → 다음 책 */
  onGoNextBook?: () => void;
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
/** 손잡이/길게누른채 끌기 시작으로 인정하는 최소 이동 */
const DRAG_START_PX = 4;
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
  onGoNextBook,
}: Props) {
  const isOtBook = isOldTestament(bookId);
  const bookMeta = BOOKS[bookId];
  const total = bookMeta.totalChapters;
  const [spreadOn, setSpreadOn] = useState(false);
  /** 펼침 번호(0-based). 한 번에 두 쪽 */
  const [spreadIndex, setSpreadIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [spreadCount, setSpreadCount] = useState(1);
  const [spreadStride, setSpreadStride] = useState(720);
  const [spreadBoxStyle, setSpreadBoxStyle] = useState<CSSProperties>({});
  const [spreadDragging, setSpreadDragging] = useState(false);
  const [spreadDragDx, setSpreadDragDx] = useState(0);
  const [spreadNextBookUi, setSpreadNextBookUi] = useState(false);
  const spreadVpRef = useRef<HTMLDivElement | null>(null);
  const spreadFlowRef = useRef<HTMLElement | null>(null);
  const spreadIndexRef = useRef(0);
  const spreadCountRef = useRef(1);
  const spreadStrideRef = useRef(720);
  const pageCountRef = useRef(1);
  const spreadSwipeRef = useRef<{
    id: number;
    x: number;
    y: number;
    armed: boolean;
  } | null>(null);
  const spreadAnchorVerseRef = useRef<number | null>(null);
  spreadIndexRef.current = spreadIndex;
  spreadCountRef.current = spreadCount;
  spreadStrideRef.current = spreadStride;
  pageCountRef.current = pageCount;
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
  /** 손잡이 드래그 중이면 돋보기에 글자 단위 스타일 */
  const [magCharStyle, setMagCharStyle] = useState(false);
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
  /** 바깥 탭 취소를 막기 위해 도구 막대 동작 직전 선택 범위를 보관 */
  const toolStashRef = useRef<ToolbarMode | null>(null);
  /** 원어: 버튼 누른 순간의 선택 텍스트·절 (cleanup 후에도 유지) */
  const wsPickRef = useRef<{
    text: string;
    verse: number;
    start: number;
    end: number;
  } | null>(null);
  const wsActionAtRef = useRef(0);
  const [toolTip, setToolTip] = useState<string | null>(null);
  const tipTimerRef = useRef(0);
  /** 이름 말풍선(캡션과 별도). 동작은 막지 않음 — 실기기 길게 누르기 오탐 방지 */
  const tipShownRef = useRef(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [paraMap, setParaMap] = useState<ParagraphMap | null>(null);
  const [debugOn, setDebugOn] = useState(false);
  const [debugLines, setDebugLines] = useState<string[]>([]);
  /** 연속 읽기 창에서 디버그 UI는 한 인스턴스만 */
  const [debugHost, setDebugHost] = useState(false);
  const debugLog = useCallback((line: string) => {
    pushStudyDebug(line);
  }, []);
  const debugLogRef = useRef(debugLog);
  debugLogRef.current = debugLog;

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
  const [wsHasFile, setWsHasFile] = useState(false);
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
    setWsHasFile(false);
    loadChapterWordStudy(bookId, chapter).then((loaded) => {
      if (stale) return;
      setWsTokens(loaded.tokens);
      setWsHasFile(loaded.hasFile);
    });
    return () => {
      stale = true;
    };
  }, [bookId, chapter]);

  useEffect(() => {
    let stale = false;
    setParaMap(null);
    loadParagraphMap(bookId).then((map) => {
      if (!stale) setParaMap(map);
    });
    return () => {
      stale = true;
    };
  }, [bookId]);

  useEffect(() => {
    const on = isStudyDebugOn();
    setDebugOn(on);
    if (!on) return;
    const w = window as Window & { __haruchiStudyDebugHost?: boolean };
    if (!w.__haruchiStudyDebugHost) {
      w.__haruchiStudyDebugHost = true;
      setDebugHost(true);
      return () => {
        w.__haruchiStudyDebugHost = false;
      };
    }
    return undefined;
  }, []);

  useEffect(() => {
    if (!debugOn || !debugHost) return;
    return subscribeStudyDebug(setDebugLines);
  }, [debugOn, debugHost]);

  useEffect(() => {
    if (!debugOn) return;
    debugLog(
      `[원어] 버튼 렌더됨 ch=${chapter} hasFile=${wsHasFile ? 1 : 0} ot=${isOtBook ? 1 : 0}`,
    );
  }, [debugOn, isOtBook, wsHasFile, bookId, chapter, debugLog]);

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
      if (caret) {
        const host =
          caret.node.nodeType === Node.ELEMENT_NODE
            ? (caret.node as Element)
            : caret.node.parentElement;
        // 절 번호·절 사이 공백 위 → 가장 가까운 본문 글자로
        if (host?.closest?.(".study-vnum, .study-v-gap")) {
          return offsetFromPointScan(root, x, y, spans);
        }
        if (closestVerseText(caret.node, root)) {
          const off = domPointToOffset(root, caret.node, caret.offset, spans);
          if (off != null) return off;
        }
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
      releasePointerCaptureSafe();
      const hadDrag = !!dragRef.current;
      dragRef.current = null;
      setMagCharStyle(false);
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
    [releasePointerCaptureSafe, selectionToolbarFor],
  );

  const finishDrag = useCallback(() => {
    if (!dragRef.current) return;
    abortSelectGesture({ keepSelection: true, showToolbar: true });
  }, [abortSelectGesture]);

  const updateDragTo = useCallback(
    (x: number, y: number) => {
      const d = dragRef.current;
      if (!d) return;
      // 손잡이: 잡은 지점(grabDy)만큼 보정한 뒤 본문 글자에 붙임
      const hitY = d.mode === "press" ? y : y - d.grabDy - HANDLE_LIFT;
      let off = offsetAtPoint(x, hitY);
      // 보정 좌표가 빗나가면 손가락 좌표로 재시도
      if (off == null && d.mode !== "press") off = offsetAtPoint(x, y);
      if (off == null) return;
      const max = plainRef.current.length;
      if (max < 1) return;
      const f = Math.max(0, Math.min(max, off));
      let next: { start: number; end: number } | null = null;

      if (d.mode === "press") {
        // 길게 누른 채 끌기: 단어 단위 확장 (앵커 어절은 유지)
        if (f > d.anchorEnd) {
          const e = snapEnd(words, f);
          next = {
            start: d.anchorStart,
            end: Math.max(e ?? d.anchorEnd, d.anchorEnd),
          };
        } else if (f < d.anchorStart) {
          const s = snapStart(words, f);
          next = {
            start: Math.min(s ?? d.anchorStart, d.anchorStart),
            end: d.anchorEnd,
          };
        } else {
          next = { start: d.anchorStart, end: d.anchorEnd };
        }
      } else {
        // 손잡이 드래그: 항상 글자 단위 (단어 스냅 없음)
        const cur = selRef.current;
        if (!cur) return;
        let a = d.mode === "start" ? f : cur.start;
        let b = d.mode === "end" ? f : cur.end;
        if (a === b) {
          // 최소 1글자
          if (d.mode === "end") b = Math.min(max, a + 1);
          else a = Math.max(0, b - 1);
          if (a === b) {
            if (a > 0) a -= 1;
            else b = Math.min(max, b + 1);
          }
        }
        if (a > b) {
          const t = a;
          a = b;
          b = t;
          d.mode = d.mode === "start" ? "end" : "start";
        }
        next = { start: a, end: b };
      }

      if (!next) return;
      next.start = Math.max(0, Math.min(max - 1, next.start));
      next.end = Math.max(next.start + 1, Math.min(max, next.end));
      const prevSel = selRef.current;
      if (prevSel && prevSel.start === next.start && prevSel.end === next.end)
        return;
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
      setMagCharStyle(mode !== "press");
      setDragging(true);
      document.documentElement.dataset.studySelecting = "1";
      window.dispatchEvent(new Event("haruchi:study-selecting"));
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
    e: ReactPointerEvent<HTMLSpanElement> | ReactMouseEvent<HTMLSpanElement>,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragRef.current) return;
    const cur = selRef.current;
    const root = bodyRef.current;
    const rects = selRectsRef.current;
    if (!cur || !root || rects.length === 0) return;
    const hit = e.currentTarget as HTMLElement;
    // MouseEvent에 가짜 pointerId로 capture하면 lostpointercapture가 바로 나며 드래그가 끊김
    if ("pointerId" in e && typeof e.pointerId === "number") {
      captureTargetRef.current = hit;
      capturePointerIdRef.current = e.pointerId;
      try {
        hit.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    suppressClickRef.current = true;
    const r = which === "start" ? rects[0] : rects[rects.length - 1];
    const lineMid = root.getBoundingClientRect().top + r.top + r.height / 2;
    beginDrag(which, cur, e.clientX, e.clientY, e.clientY - lineMid);
  };

  gestureFnsRef.current.updateDragTo = updateDragTo;
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
          DRAG_START_PX
        ) {
          return;
        }
        d.moved = true;
        setToolbar(null);
        window.clearTimeout(magHideTimerRef.current);
        setMagState("shown");
      }
      const fns = gestureFnsRef.current;
      fns.updateDragTo(e.clientX, e.clientY);
      fns.placeMagnifier();
    };

    const onUp = (e?: Event) => {
      lastPointerAtRef.current = performance.now();
      const p = pressRef.current;
      if (p) {
        window.clearTimeout(p.timer);
        pressRef.current = null;
      }
      if (dragRef.current) {
        const ev = e as PointerEvent | MouseEvent | undefined;
        if (ev && typeof ev.clientX === "number") {
          lastPointRef.current = { x: ev.clientX, y: ev.clientY };
          gestureFnsRef.current.updateDragTo(ev.clientX, ev.clientY);
        }
        gestureFnsRef.current.finishDrag();
      }
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

    const onMouseMove = (e: MouseEvent) => {
      // PointerEvent를 안 보내는 자동화/구형 경로 보완
      if (window.PointerEvent && (e as MouseEvent & { sourceCapabilities?: { firesTouchEvents?: boolean } }).sourceCapabilities?.firesTouchEvents) {
        return;
      }
      onMove(e as unknown as PointerEvent);
    };
    const onMouseUp = (e: MouseEvent) => onUp(e);

    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    document.addEventListener("lostpointercapture", onUp);
    document.addEventListener("mousemove", onMouseMove, { passive: false });
    document.addEventListener("mouseup", onMouseUp);
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
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("touchend", onUp);
      document.removeEventListener("touchcancel", onUp);
      document.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("blur", onAbort);
      document.removeEventListener("visibilitychange", onVis);
      gestureFnsRef.current.abortSelectGesture({ keepSelection: true });
    };
  }, []);

  // 공부 노트 선택·손잡이·도구 막대 상태를 서랍 스와이프에 알림
  useEffect(() => {
    const on = dragging || !!sel || !!toolbar || magState === "shown";
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
      if (t?.closest?.(".study-toolbar, .study-sel-handle, .study-ws-root"))
        return;
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
        if (spreadOn) {
          spreadAnchorVerseRef.current = target;
          // 페이지 측정 후 jump — measure effect 가 처리
        } else {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
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
  }, [flashVerse, verses, bookId, chapter, spreadOn]);

  useEffect(() => subscribeStudySpread(setSpreadOn), []);

  // 가로↔세로 전환 시 보던 절 유지
  useEffect(() => {
    if (spreadOn) {
      const body = bodyRef.current;
      if (body) {
        const versesEls = [
          ...body.querySelectorAll<HTMLElement>("[data-verse-num]"),
        ];
        let bestNum: number | null = null;
        let bestDist = Infinity;
        const mid = window.innerHeight * 0.35;
        for (const el of versesEls) {
          const r = el.getBoundingClientRect();
          const d = Math.abs(r.top - mid);
          if (d < bestDist) {
            bestDist = d;
            const raw = el.getAttribute("data-verse-num");
            const n = raw ? Number(raw) : NaN;
            bestNum = Number.isFinite(n) ? n : null;
          }
        }
        if (bestNum != null) spreadAnchorVerseRef.current = bestNum;
      }
      document.documentElement.dataset.studySpread = "1";
      return () => {
        delete document.documentElement.dataset.studySpread;
      };
    }
    delete document.documentElement.dataset.studySpread;
    const v = spreadAnchorVerseRef.current;
    if (v != null) {
      requestAnimationFrame(() => {
        const el = bodyRef.current?.querySelector<HTMLElement>(
          `[data-verse-num="${v}"]`,
        );
        el?.scrollIntoView({ block: "center" });
      });
    }
    return undefined;
  }, [spreadOn]);

  useEffect(() => {
    setSpreadIndex(0);
    setSpreadNextBookUi(false);
    setSpreadDragDx(0);
    spreadAnchorVerseRef.current = null;
  }, [bookId, chapter]);

  const measureSpread = useCallback(() => {
    const vp = spreadVpRef.current;
    const flow = spreadFlowRef.current;
    if (!vp || !flow || !spreadOn) return;

    const topbar = STUDY_SPREAD_TOPBAR;
    const barH = STUDY_SPREAD_BAR_H;
    const pgnumH = STUDY_SPREAD_PGNUM_H;
    const outer = STUDY_SPREAD_OUTER;
    const spreadH = Math.max(
      120,
      window.innerHeight - topbar - barH - pgnumH,
    );
    const spreadW = Math.max(
      200,
      Math.min(window.innerWidth - outer * 2, window.innerWidth - outer * 2),
    );
    const g = calcSpreadGeometry(spreadW, spreadH);

    setSpreadBoxStyle({
      width: `${g.spreadW}px`,
      height: `${g.spreadH}px`,
      ["--study-spread-w" as string]: `${g.spreadW}px`,
    });

    // 열 본문: 쪽 안여백을 column-width/gap 으로 반영
    // width:max-content 는 WebKit에서 scrollWidth가 비정상적으로 커져 쓰지 않음
    flow.style.width = "";
    flow.style.minWidth = `${g.spreadW}px`;
    flow.style.height = `${g.spreadH}px`;
    flow.style.maxHeight = `${g.spreadH}px`;
    flow.style.columnWidth = `${g.colW}px`;
    flow.style.columnGap = `${g.colGap}px`;
    flow.style.columnFill = "auto";
    flow.style.paddingLeft = `${g.padOuter}px`;
    flow.style.paddingRight = `${g.padOuter}px`;
    flow.style.paddingTop = "16px";
    flow.style.paddingBottom = "12px";
    flow.style.boxSizing = "border-box";

    void flow.offsetHeight;
    // 쪽 수: 본문(열 컨테이너) 실측 폭 기준
    const body = flow.querySelector(".study-body") as HTMLElement | null;
    const measureW = Math.max(
      body?.offsetWidth ?? 0,
      flow.scrollWidth - g.padOuter * 2,
    );
    const pages = Math.max(
      1,
      Math.ceil((measureW + g.colGap) / (g.colW + g.colGap)),
    );
    const spreads = Math.max(1, Math.ceil(pages / 2));
    setPageCount(pages);
    setSpreadCount(spreads);
    setSpreadStride(g.spreadStride);

    const anchor = spreadAnchorVerseRef.current;
    if (anchor != null) {
      const el = bodyRef.current?.querySelector<HTMLElement>(
        `[data-verse-num="${anchor}"]`,
      );
      if (el) {
        const vr = vp.getBoundingClientRect();
        const er = el.getBoundingClientRect();
        const contentX =
          spreadIndexRef.current * g.spreadStride + (er.left - vr.left);
        const page = Math.max(
          0,
          Math.min(pages - 1, Math.floor(contentX / g.pageStride)),
        );
        const si = Math.floor(page / 2);
        setSpreadIndex(si);
        spreadAnchorVerseRef.current = null;
        return;
      }
    }
    setSpreadIndex((i) => Math.min(i, Math.max(0, spreads - 1)));
  }, [spreadOn]);

  useLayoutEffect(() => {
    if (!spreadOn || !verses) return;
    measureSpread();
    const onResize = () => measureSpread();
    window.addEventListener("resize", onResize);
    const mo = new MutationObserver(() => measureSpread());
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });
    const reader = document.querySelector(".brp-reader");
    if (reader) {
      mo.observe(reader, { attributes: true, attributeFilter: ["style", "class"] });
    }
    const t0 = window.setTimeout(measureSpread, 50);
    const t1 = window.setTimeout(measureSpread, 200);
    return () => {
      window.removeEventListener("resize", onResize);
      mo.disconnect();
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
  }, [spreadOn, verses, title, chapter, bookId, data.marks.length, measureSpread]);

  const goSpreadBy = useCallback(
    (delta: number) => {
      if (document.documentElement.dataset.studySelecting === "1") return;
      setSpreadNextBookUi(false);
      setSpreadIndex((p) => {
        const next = p + delta;
        if (next < 0) {
          if (chapter > 1) {
            if (onMoveChapter) onMoveChapter(chapter - 1);
            else if (!embedded) {
              window.location.assign(`/study/${bookId}/${chapter - 1}`);
            }
          }
          return 0;
        }
        if (next > spreadCountRef.current - 1) {
          if (chapter < total) {
            if (onMoveChapter) onMoveChapter(chapter + 1);
            else if (!embedded) {
              window.location.assign(`/study/${bookId}/${chapter + 1}`);
            }
            return p;
          }
          const idx = BOOK_ORDER.indexOf(bookId);
          const hasNextBook = idx >= 0 && idx < BOOK_ORDER.length - 1;
          if (hasNextBook) {
            setSpreadNextBookUi(true);
          }
          return p;
        }
        return next;
      });
    },
    [bookId, chapter, embedded, onMoveChapter, total],
  );

  // 마지막 펼침(마지막 쪽 포함)이 보이면 장 완료
  useEffect(() => {
    if (!spreadOn || !onEndVisibilityChange) return;
    const viewingLast =
      spreadCount > 0 && spreadIndex >= spreadCount - 1;
    onEndVisibilityChange(viewingLast);
  }, [spreadOn, spreadIndex, spreadCount, onEndVisibilityChange]);

  useEffect(() => {
    if (!spreadOn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, [contenteditable=true]")) return;
      if (document.documentElement.dataset.studySelecting === "1") return;
      e.preventDefault();
      goSpreadBy(e.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [spreadOn, goSpreadBy]);

  const onSpreadPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!spreadOn) return;
    if (document.documentElement.dataset.studySelecting === "1") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest(".study-spread-edge, .study-spread-next-book, .study-toolbar, .study-ws-root"))
      return;
    spreadSwipeRef.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      armed: true,
    };
  };

  const onSpreadPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = spreadSwipeRef.current;
    if (!s || s.id !== e.pointerId || !s.armed) return;
    if (document.documentElement.dataset.studySelecting === "1") {
      spreadSwipeRef.current = null;
      setSpreadDragging(false);
      setSpreadDragDx(0);
      return;
    }
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!spreadDragging) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dx) <= Math.abs(dy) * 1.5) {
        s.armed = false;
        return;
      }
      setSpreadDragging(true);
    }
    setSpreadDragDx(dx);
  };

  const finishSpreadSwipe = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = spreadSwipeRef.current;
    if (!s || s.id !== e.pointerId) return;
    spreadSwipeRef.current = null;
    const dx = spreadDragging ? spreadDragDx : e.clientX - s.x;
    const dy = e.clientY - s.y;
    setSpreadDragging(false);
    setSpreadDragDx(0);
    if (document.documentElement.dataset.studySelecting === "1") return;
    if (
      Math.abs(dx) >= STUDY_SPREAD_SWIPE_PX &&
      Math.abs(dx) > Math.abs(dy) * 1.5
    ) {
      goSpreadBy(dx < 0 ? 1 : -1);
    }
  };

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

  const toolbarActionTarget = (): ToolbarMode | null =>
    toolbar ?? toolStashRef.current;

  const lastToolActRef = useRef(0);
  const fireTool = (fn: () => void) => {
    const t = Date.now();
    if (t - lastToolActRef.current < 300) return;
    lastToolActRef.current = t;
    fn();
  };

  const applyHighlight = (color: string) => {
    const tb = toolbarActionTarget();
    if (!tb) return;
    if (tb.kind === "mark") {
      const cur = marksById.get(tb.markId);
      if (!cur) return;
      upsertMark({ ...cur, type: "hl", color });
      toolStashRef.current = null;
      setToolbar(null);
      return;
    }
    upsertMark({
      ref: tb.ref,
      start: tb.start,
      end: tb.end,
      type: "hl",
      color,
    });
    window.getSelection()?.removeAllRanges();
    toolStashRef.current = null;
    setToolbar(null);
  };

  const applyUnderline = () => {
    const tb = toolbarActionTarget();
    if (!tb) return;
    if (tb.kind === "mark") {
      const cur = marksById.get(tb.markId);
      if (!cur) return;
      upsertMark({ ...cur, type: "ul", color: UL_COLOR });
      toolStashRef.current = null;
      setToolbar(null);
      return;
    }
    upsertMark({
      ref: tb.ref,
      start: tb.start,
      end: tb.end,
      type: "ul",
      color: UL_COLOR,
    });
    window.getSelection()?.removeAllRanges();
    toolStashRef.current = null;
    setToolbar(null);
  };

  const eraseFromToolbar = () => {
    const tb = toolbarActionTarget();
    if (!tb) return;
    if (tb.kind === "mark") {
      persist({
        ...dataRef.current,
        marks: dataRef.current.marks.filter((m) => m.id !== tb.markId),
      });
      toolStashRef.current = null;
      setToolbar(null);
      return;
    }
    const { start, end } = tb;
    persist({
      ...dataRef.current,
      marks: dataRef.current.marks.filter(
        (m) => m.end <= start || m.start >= end,
      ),
    });
    window.getSelection()?.removeAllRanges();
    toolStashRef.current = null;
    setToolbar(null);
  };

  const copyFromToolbar = async () => {
    const tb = toolbarActionTarget();
    if (!tb) return;
    let start: number;
    let end: number;
    if (tb.kind === "selection") {
      ({ start, end } = tb);
    } else {
      const m = marksById.get(tb.markId);
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
    toolStashRef.current = null;
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
    const tb = toolbarActionTarget();
    if (!tb) return;
    if (tb.kind === "mark") {
      beginNoteEdit(tb.markId);
      return;
    }
    // 선택만 있고 칠이 없으면 노랑 자동 적용 후 메모
    const existing = dataRef.current.marks.find(
      (m) => m.start === tb.start && m.end === tb.end,
    );
    const mark =
      existing ??
      upsertMark({
        ref: tb.ref,
        start: tb.start,
        end: tb.end,
        type: "hl",
        color: DEFAULT_HL,
      });
    beginNoteEdit(mark.id, mark.note);
  };

  const stashWordStudyPick = useCallback(() => {
    const tb = toolbar ?? toolStashRef.current;
    if (!tb) {
      debugLogRef.current("[원어] stash 실패 — toolbar 없음");
      return;
    }
    toolStashRef.current = tb;
    let text = "";
    let verse = 1;
    let start = 0;
    let end = 0;
    if (tb.kind === "selection") {
      start = tb.start;
      end = tb.end;
      verse = tb.ref;
      text = plainRef.current.slice(start, end);
    } else {
      const mark = marksById.get(tb.markId);
      if (!mark) {
        debugLogRef.current("[원어] stash 실패 — mark 없음");
        return;
      }
      start = mark.start;
      end = mark.end;
      verse = mark.ref;
      text = plainRef.current.slice(start, end);
    }
    text = text.trim();
    wsPickRef.current = { text, verse, start, end };
    debugLogRef.current(
      `[원어] 저장된 선택 텍스트="${text.slice(0, 40)}" verse=${verse}`,
    );
  }, [toolbar, marksById]);

  const openWordStudyFromToolbar = () => {
    const now = Date.now();
    if (now - wsActionAtRef.current < 300) {
      debugLog("[원어] 중복 실행 방지");
      return;
    }
    wsActionAtRef.current = now;
    debugLog("[원어] open 시도");
    if (!wsHasFile) {
      if (isOtBook) {
        setToast("히브리어 사전은 준비 중이에요");
        debugLog("[원어] OT word-study 파일 없음 — 토스트");
        return;
      }
      if (wsTokens.length === 0) {
        const path = `/word-study/${bookId}/${chapter}.json`;
        setToast(`원어 자료 없음: ${path}`);
        debugLog(`[원어] tokens 비어 있음 ${path}`);
        return;
      }
    }
    const pick = wsPickRef.current;
    const tb = toolbarActionTarget();
    let selectedKo = pick?.text ?? "";
    let verse = pick?.verse ?? 1;
    if (!selectedKo && tb) {
      if (tb.kind === "selection") {
        selectedKo = plainRef.current.slice(tb.start, tb.end).trim();
        verse = tb.ref;
      } else {
        const mark = marksById.get(tb.markId);
        if (!mark) {
          setToast("선택한 표시를 찾지 못했어요");
          debugLog("[원어] mark 없음");
          return;
        }
        selectedKo = plainRef.current.slice(mark.start, mark.end).trim();
        verse = mark.ref;
      }
    }
    if (!selectedKo) {
      setToast("단어를 선택해 주세요");
      debugLog("[원어] 선택 텍스트 비어 있음");
      return;
    }
    if (wsTokens.length === 0) {
      const path = `/word-study/${bookId}/${chapter}.json`;
      setToast(`원어 자료 없음: ${path}`);
      debugLog(`[원어] tokens 비어 있음 ${path}`);
      return;
    }
    const matched = matchTokenByGloss(wsTokens, verse, selectedKo);
    if (!matched) {
      setToast("이 구절의 원어를 찾지 못했어요");
      debugLog(`[원어] match 실패 verse=${verse} ko=${selectedKo.slice(0, 24)}`);
      return;
    }
    debugLog(
      `[원어] match ok strong=${matched.strong || "-"} → setWsOpen(true)`,
    );
    setWsVerse(verse);
    setWsInitial(matched);
    setWsSelectedKo(selectedKo);
    setWsOpen(true);
    toolStashRef.current = null;
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

  const paraStarts = paragraphStartsForChapter(paraMap, chapter);
  const useParas = !!paraStarts && paraStarts.length > 0;
  const paraGroups: { key: string; startN: number; verses: VerseSpan[] }[] =
    (() => {
      if (!useParas || !paraStarts) {
        return [{ key: "all", startN: spans[0]?.n ?? 1, verses: spans }];
      }
      const startSet = new Set(paraStarts);
      const groups: { key: string; startN: number; verses: VerseSpan[] }[] = [];
      let cur: { key: string; startN: number; verses: VerseSpan[] } | null =
        null;
      for (const span of spans) {
        if (!cur || startSet.has(span.n)) {
          cur = {
            key: `p-${span.n}`,
            startN: span.n,
            verses: [span],
          };
          groups.push(cur);
        } else {
          cur.verses.push(span);
        }
      }
      return groups;
    })();

  const renderSegNodes = (segs: TextSeg[], keyPrefix: string): ReactNode[] =>
    segs.map((seg, i) => {
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
        return <span key={`${keyPrefix}-${i}`}>{seg.text}</span>;
      }

      return (
        <span
          key={`${keyPrefix}-${i}`}
          className={cls}
          style={
            seg.style.hl
              ? ({ ["--study-hl"]: seg.style.hl } as CSSProperties)
              : undefined
          }
          data-mark-id={primaryId}
          data-note-anchor={
            noteHosts.length > 0 ? noteHosts.join(" ") : undefined
          }
          onClick={(e) => {
            if (!primaryId) return;
            if (editingMarkId) return;
            e.preventDefault();
            e.stopPropagation();
            const lines = mergeLineRects(
              Array.from((e.currentTarget as HTMLElement).getClientRects()),
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
    });

  /** 절 본문만 data-v — 번호·앞 공백은 오프셋 밖. 번호+첫 글자 nowrap. */
  const renderVerse = (span: VerseSpan, paraFirst: boolean) => {
    const segs = segmentVerse(span.text, span.start, span.end, data.marks);
    const legacy = legacyByRef.get(span.n);
    const legacyOpen = openLegacy.has(span.n);
    const firstCp = Array.from(span.text)[0] ?? "";
    const firstLen = firstCp.length;
    const splitAt = span.start + firstLen;

    const firstSegs: TextSeg[] = [];
    const restSegs: TextSeg[] = [];
    for (const seg of segs) {
      if (seg.end <= splitAt) firstSegs.push(seg);
      else if (seg.start >= splitAt) restSegs.push(seg);
      else {
        firstSegs.push({
          ...seg,
          end: splitAt,
          text: span.text.slice(seg.start - span.start, firstLen),
        });
        restSegs.push({
          ...seg,
          start: splitAt,
          text: span.text.slice(firstLen, seg.end - span.start),
          style: {
            ...seg.style,
            // 메모 앵커는 조각 시작에만 — 앞쪽에만 유지
            noteMarkIds: [],
          },
        });
      }
    }

    return (
      <span
        key={span.n}
        className="study-verse"
        data-verse={span.n}
        data-verse-num={span.n}
      >
        {!paraFirst ? <span className="study-v-gap"> </span> : null}
        <span className="study-v-nowrap">
          <span className="study-vnum">{span.n}</span>
          {firstLen > 0 ? (
            <span className="study-verse-text" data-v={span.n} data-v-off="0">
              {renderSegNodes(firstSegs, `${span.n}-a`)}
            </span>
          ) : null}
        </span>
        {restSegs.length > 0 ? (
          <span
            className="study-verse-text"
            data-v={span.n}
            data-v-off={String(firstLen)}
          >
            {renderSegNodes(restSegs, `${span.n}-b`)}
          </span>
        ) : null}
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
  };

  const spreadTx =
    spreadOn
      ? -(spreadIndex * spreadStride) + (spreadDragging ? spreadDragDx : 0)
      : 0;
  const leftPageNum = spreadIndex * 2 + 1;
  const rightPageNum = spreadIndex * 2 + 2;
  const nextBookId =
    BOOK_ORDER.indexOf(bookId) >= 0 &&
    BOOK_ORDER.indexOf(bookId) < BOOK_ORDER.length - 1
      ? BOOK_ORDER[BOOK_ORDER.indexOf(bookId) + 1]
      : null;

  return (
    <div
      className={`study-root${embedded ? " is-embedded" : ""}${
        spreadOn ? " is-spread" : ""
      }`}
    >
      {debugOn && debugHost && typeof document !== "undefined"
        ? createPortal(
            <div className="study-debug-log" aria-live="polite">
              {debugLines.length === 0
                ? "debug=1 — 원어 로그 대기"
                : debugLines.join("\n")}
            </div>,
            document.body,
          )
        : null}
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
        {spreadOn ? (
          <div className="study-spread-bar" aria-live="polite">
            {chapterLabel(bookMeta.name, chapter, bookId)} · {leftPageNum} /{" "}
            {pageCount}쪽
          </div>
        ) : null}
        <div className="study-layout">
          {spreadOn ? (
            <div
              className="study-spread spread"
              ref={spreadVpRef}
              style={spreadBoxStyle}
              onPointerDown={onSpreadPointerDown}
              onPointerMove={onSpreadPointerMove}
              onPointerUp={finishSpreadSwipe}
              onPointerCancel={finishSpreadSwipe}
            >
              <div
                className={`study-spread-track${
                  spreadDragging ? " is-dragging" : ""
                }`}
                style={{
                  transform: `translate3d(${spreadTx}px,0,0)`,
                  transitionDuration: spreadDragging
                    ? "0ms"
                    : `${STUDY_SPREAD_ANIM_MS}ms`,
                }}
              >
                <article
                  ref={spreadFlowRef}
                  className="study-page study-spread-flow"
                  data-study-chapter-inner={chapter}
                >
                  <span
                    className={`study-drop${digLen >= 3 ? " is-wide" : ""}`}
                    data-digits={digLen}
                    data-chapter-anchor={title ? undefined : ""}
                    aria-hidden="true"
                  >
                    <span className="study-drop-num">{chapter}</span>
                  </span>
                  {title ? (
                    <span className="study-chapter-title" data-chapter-anchor="">
                      {title}
                    </span>
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
                    {useParas
                      ? paraGroups.map((g) => (
                          <p key={g.key} className="study-para">
                            {g.verses.map((span, i) =>
                              renderVerse(span, i === 0),
                            )}
                          </p>
                        ))
                      : paraGroups[0]?.verses.map((span, i) =>
                          renderVerse(span, i === 0),
                        )}
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
                              data-handle="start"
                              onPointerDown={(e) =>
                                onHandlePointerDown("start", e)
                              }
                              onMouseDown={(e) =>
                                onHandlePointerDown("start", e)
                              }
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
                              data-handle="end"
                              onPointerDown={(e) =>
                                onHandlePointerDown("end", e)
                              }
                              onMouseDown={(e) =>
                                onHandlePointerDown("end", e)
                              }
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
                          ? {
                              top: pos.top,
                              left: pos.openLeft,
                              width: pos.openWidth,
                            }
                          : isBadge
                            ? { top: pos.top, left: pos.left }
                            : {
                                top: pos.top,
                                left: pos.left,
                                maxWidth: pos.width,
                              };
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
              <div className="study-spread-fold" aria-hidden />
              <button
                type="button"
                className="study-spread-edge is-prev"
                aria-label="이전 쪽"
                style={{ width: `${STUDY_SPREAD_EDGE * 100}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  goSpreadBy(-1);
                }}
              />
              <button
                type="button"
                className="study-spread-edge is-next"
                aria-label="다음 쪽"
                style={{ width: `${STUDY_SPREAD_EDGE * 100}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  goSpreadBy(1);
                }}
              />
              {spreadNextBookUi && nextBookId ? (
                <div className="study-spread-next-book">
                  <button
                    type="button"
                    className="study-spread-next-book-btn"
                    onClick={() => {
                      setSpreadNextBookUi(false);
                      if (onGoNextBook) onGoNextBook();
                      else {
                        window.location.assign(
                          embedded
                            ? `/bible-reading?book=${encodeURIComponent(nextBookId)}&chapter=1`
                            : `/study/${nextBookId}/1`,
                        );
                      }
                    }}
                  >
                    다음 책: {BOOKS[nextBookId].name} →
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
          <article className="study-page" data-study-chapter-inner={chapter}>
            <span
              className={`study-drop${digLen >= 3 ? " is-wide" : ""}`}
              data-digits={digLen}
              data-chapter-anchor={title ? undefined : ""}
              aria-hidden="true"
            >
              <span className="study-drop-num">{chapter}</span>
            </span>
            {title ? (
              <span className="study-chapter-title" data-chapter-anchor="">
                {title}
              </span>
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
              {useParas
                ? paraGroups.map((g) => (
                    <p key={g.key} className="study-para">
                      {g.verses.map((span, i) => renderVerse(span, i === 0))}
                    </p>
                  ))
                : paraGroups[0]?.verses.map((span, i) =>
                    renderVerse(span, i === 0),
                  )}
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
                        role="button"
                        aria-label="선택 시작 조정"
                        onPointerDown={(e) => onHandlePointerDown("start", e)}
                        onMouseDown={(e) => onHandlePointerDown("start", e)}
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
                        role="button"
                        aria-label="선택 끝 조정"
                        onPointerDown={(e) => onHandlePointerDown("end", e)}
                        onMouseDown={(e) => onHandlePointerDown("end", e)}
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
          )}
          {spreadOn ? (
            <div
              className="study-spread-pgnum-row"
              style={{ width: spreadBoxStyle.width }}
              aria-hidden
            >
              <span className="study-spread-pgnum is-left">{leftPageNum}</span>
              {rightPageNum <= pageCount ? (
                <span className="study-spread-pgnum is-right">
                  {rightPageNum}
                </span>
              ) : (
                <span className="study-spread-pgnum is-right is-blank" />
              )}
            </div>
          ) : null}
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

      {toolbar && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={toolbarRef}
              className="study-toolbar"
              style={{ left: toolbar.x, top: toolbar.rt }}
              role="toolbar"
              aria-label="형광펜 도구"
              onMouseDown={(e) => e.preventDefault()}
              onPointerDown={(e) => {
                e.stopPropagation();
                toolStashRef.current = toolbar;
              }}
              onPointerUp={(e) => e.stopPropagation()}
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
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      toolStashRef.current = toolbar;
                    }}
                    onPointerUp={(e) => {
                      e.stopPropagation();
                      fireTool(() => applyHighlight(c));
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      fireTool(() => applyHighlight(c));
                    }}
                  />
                ))}
              </div>
              <span className="study-toolbar-divider" aria-hidden="true" />
              <div className="study-toolbar-icons">
                {(
                  [
                    {
                      label: "밑줄",
                      action: applyUnderline,
                      icon: <IconUnderline />,
                    },
                    {
                      label: "메모",
                      action: openNoteFromToolbar,
                      icon: <IconPen />,
                    },
                    {
                      label: "원어",
                      action: openWordStudyFromToolbar,
                      icon: <span className="study-toolbar-alpha">α</span>,
                    },
                    {
                      label: "복사",
                      action: () => void copyFromToolbar(),
                      icon: <IconCopy />,
                    },
                    {
                      label: "지우기",
                      action: eraseFromToolbar,
                      icon: <IconEraser />,
                    },
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
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      toolStashRef.current = toolbar;
                      if (label === "원어") {
                        debugLog("[원어] pointerdown");
                        stashWordStudyPick();
                      }
                      startToolTip(label);
                    }}
                    onPointerUp={(e) => {
                      e.stopPropagation();
                      endToolTip();
                      tipShownRef.current = false;
                      if (label === "원어") debugLog("[원어] pointerup");
                      fireTool(action);
                    }}
                    onPointerLeave={endToolTip}
                    onPointerCancel={endToolTip}
                    onContextMenu={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (label === "원어") {
                        debugLog("[원어] click");
                        stashWordStudyPick();
                      }
                      fireTool(action);
                    }}
                  >
                    {icon}
                    <span className="study-toolbar-caption">{label}</span>
                    {toolTip === label ? (
                      <span className="study-toolbar-tip" aria-hidden="true">
                        {label}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}

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
          className={`study-mag${magCharStyle ? " is-char" : ""}${
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
        onError={(msg) => setToast(msg)}
        onDebug={debugOn ? debugLog : undefined}
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

function versePlainLen(el: HTMLElement): number {
  const pre = document.createRange();
  pre.selectNodeContents(el);
  let n = pre.toString().length;
  el.querySelectorAll(".study-mark-note, .study-mark-note-input, .study-vnum").forEach(
    (node) => {
      n -= (node.textContent || "").length;
      if (node instanceof HTMLInputElement) n -= node.value.length;
    },
  );
  return Math.max(0, n);
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

  // 같은 절이 첫글자/나머지로 쪼개져 있으면 앞조각 길이를 더함
  const parts = [
    ...root.querySelectorAll<HTMLElement>(`[data-v="${v}"]`),
  ];
  let prior = 0;
  for (const part of parts) {
    if (part === verseEl) break;
    prior += versePlainLen(part);
  }

  const pre = document.createRange();
  pre.selectNodeContents(verseEl);
  try {
    pre.setEnd(node, offset);
  } catch {
    return span.start + prior;
  }
  // 메모/입력·절 번호 텍스트는 오프셋에서 제외
  const raw = pre.toString();
  const skipEls = verseEl.querySelectorAll(
    ".study-mark-note, .study-mark-note-input, .study-vnum",
  );
  let subtract = 0;
  skipEls.forEach((el) => {
    if (pre.intersectsNode(el)) {
      subtract += (el.textContent || "").length;
      if (el instanceof HTMLInputElement) subtract += el.value.length;
    }
  });
  return span.start + prior + Math.max(0, raw.length - subtract);
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
    while ((n = w.nextNode())) {
      const t = n as Text;
      if (
        t.parentElement?.closest(
          ".study-vnum, .study-mark-note, .study-mark-note-input",
        )
      ) {
        continue;
      }
      out.push(t);
    }
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
  const parts = [
    ...root.querySelectorAll<HTMLElement>(`[data-v="${span.n}"]`),
  ];
  if (parts.length === 0) return null;
  let rem = Math.max(0, Math.min(offset, span.end) - span.start);
  let last: Text | null = null;
  for (const el of parts) {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = w.nextNode())) {
      const t = n as Text;
      if (t.parentElement?.closest(".study-vnum, .study-mark-note, .study-mark-note-input")) {
        continue;
      }
      last = t;
      if (rem < t.length || (isEnd && rem === t.length)) {
        return { node: t, offset: rem };
      }
      rem -= t.length;
    }
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
