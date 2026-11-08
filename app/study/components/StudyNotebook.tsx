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
import { createPortal, flushSync } from "react-dom";
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
  formatStudyCopy,
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
  GREEK_SBL_OMIT_HINT,
  greekVerseKind,
  loadGreekVerseDiffMap,
  type GreekVerseKind,
} from "../lib/greekVerseDiff";
import {
  loadChapterWordStudy,
  matchTokenByGlossDetailed,
  tokensInVerse,
  type VerseWordStudyMeta,
  type WordStudyToken,
} from "../lib/wordStudy";
import WordStudySheet from "./WordStudySheet";
import { stemOf } from "../lib/koStem";
import {
  STUDY_SPREAD_ANIM_MS,
  STUDY_SPREAD_COMMIT_DEG,
  STUDY_SPREAD_COMMIT_VEL,
  STUDY_SPREAD_EDGE,
  STUDY_SPREAD_OUTER,
  STUDY_SPREAD_PGNUM_H,
  calcSpreadGeometry,
  subscribeStudySpread,
} from "../lib/studySpread";
import "../study.css";

/** 책별로 이미 로드된 장 본문을 모아 본체 검증에 쓴다 */
const bookCorpusMap = new Map<string, string>();
function rememberBookText(bookId: string, chunk: string) {
  if (!chunk) return;
  const prev = bookCorpusMap.get(bookId) ?? "";
  if (prev.includes(chunk.slice(0, Math.min(80, chunk.length)))) return;
  bookCorpusMap.set(bookId, prev ? `${prev}\n${chunk}` : chunk);
}

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
const NOTE_MIN_ROOM = 56;

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
  /** 드래그 진행 0–1. 그림자·종이 밝기 */
  const [spreadPull, setSpreadPull] = useState(0);
  /** 커밋 연출 방향. 1 다음, -1 이전 */
  const [spreadTurn, setSpreadTurn] = useState<0 | 1 | -1>(0);
  /** 3D 잎이 떠 있는 동안만 4쪽을 마운트. 각도는 ref로만 갱신 */
  const [flip, setFlip] = useState<{ dir: 1 | -1; auto: boolean } | null>(null);
  const [pageW, setPageW] = useState(480);
  const [nextPack, setNextPack] = useState<{
    chapter: number;
    title: string;
    verses: { n: number; t: string }[];
  } | null>(null);
  const [prevPack, setPrevPack] = useState<{
    chapter: number;
    title: string;
    verses: { n: number; t: string }[];
  } | null>(null);
  const [prevPageCount, setPrevPageCount] = useState(0);
  const [versePick, setVersePick] = useState<number[] | null>(null);
  const [spreadHint, setSpreadHint] = useState(false);
  const [nextChTitle, setNextChTitle] = useState("");
  const [spreadNextBookUi, setSpreadNextBookUi] = useState(false);
  /** 상단바·쪽번호 표시. 숨겨도 펼침 높이는 다시 계산하지 않음 */
  const [chromeOn, setChromeOn] = useState(true);
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
    t: number;
    lastX: number;
    lastT: number;
    vx: number;
    moved: number;
    mode: "pending" | "drag" | "hold" | "ignore";
    done: boolean;
    timer: number;
  } | null>(null);
  const spreadEdgeTapRef = useRef(0);
  const flipRef = useRef(flip);
  flipRef.current = flip;
  const leafRef = useRef<HTMLDivElement | null>(null);
  const leafInkRef = useRef<HTMLDivElement | null>(null);
  const leafCastRef = useRef<HTMLDivElement | null>(null);
  const leafRimRef = useRef<HTMLDivElement | null>(null);
  const flipAngleRef = useRef(0);
  const flipRafRef = useRef(0);
  const flipBusyRef = useRef(false);
  const pageWRef = useRef(480);
  const versePickRef = useRef<number[] | null>(null);
  versePickRef.current = versePick;
  const verseDragRef = useRef<{
    id: number;
    n: number;
    x: number;
    y: number;
    mode: "pending" | "drag";
    wasSelected: boolean;
    base: number[];
  } | null>(null);
  const noteGuardRef = useRef(0);
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
  const [wsVerseMeta, setWsVerseMeta] = useState<
    Record<number, VerseWordStudyMeta>
  >({});
  const [greekDiffMap, setGreekDiffMap] = useState<Map<
    string,
    GreekVerseKind
  > | null>(null);
  const [wsOpen, setWsOpen] = useState(false);
  const [wsMatchHint, setWsMatchHint] = useState<string | null>(null);
  const [wsMatched, setWsMatched] = useState(false);
  const [wsTitleShift, setWsTitleShift] = useState(false);
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
  /** 길게 누른 어절의 본체↔전체 토글 */
  const stemToggleRef = useRef<{
    word: { start: number; end: number };
    stem: { start: number; end: number };
    mode: "stem" | "full";
  } | null>(null);

  useEffect(() => {
    rememberBookText(bookId, plain);
  }, [bookId, plain]);

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
    setWsTitleShift(false);
    setWsVerseMeta({});
    loadChapterWordStudy(bookId, chapter).then((loaded) => {
      if (stale) return;
      setWsTokens(loaded.tokens);
      setWsHasFile(loaded.hasFile);
      setWsTitleShift(!!loaded.titleShift);
      setWsVerseMeta(loaded.verseMeta ?? {});
    });
    if (!isOldTestament(bookId)) {
      loadGreekVerseDiffMap().then((map) => {
        if (!stale) setGreekDiffMap(map);
      });
    }
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
    // 양쪽: 그 쪽이 보이는 PageView 안에서만 앵커를 잰다
    const baseEl =
      spreadOn && spreadVpRef.current ? spreadVpRef.current : root;
    const base = baseEl.getBoundingClientRect();
    const bodyW = root.clientWidth;
    const bodies: HTMLElement[] =
      spreadOn && spreadVpRef.current
        ? Array.from(
            spreadVpRef.current.querySelectorAll<HTMLElement>(
              ".study-page-view .study-body",
            ),
          ).filter((body) => !body.closest(".is-covered, .study-spread-measure, .study-leaf"))
        : [root];
    const items: { id: string; top: number; start: number }[] = [];
    const seen = new Set<string>();
    for (const body of bodies) {
      const clip = (body.closest(".study-page-view") as HTMLElement | null) ?? body;
      const clipBox = clip.getBoundingClientRect();
      body.querySelectorAll<HTMLElement>("[data-note-anchor]").forEach((el) => {
        const rects = Array.from(el.getClientRects());
        const first =
          rects.find((r) => {
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            return (
              r.width > 0 &&
              cx >= clipBox.left &&
              cx <= clipBox.right &&
              cy >= clipBox.top &&
              cy <= clipBox.bottom
            );
          }) ?? null;
        if (!first) return;
        const start = Math.max(0, first.left - base.left);
        const top = first.bottom - base.top - 2;
        for (const id of (el.dataset.noteAnchor ?? "").split(" ")) {
          if (!id || seen.has(id)) continue;
          seen.add(id);
          items.push({ id, top, start });
        }
      });
    }
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
      // 양쪽: 메모가 그 쪽(열) 안에서만 가로로 이어지게
      if (spreadOn && spreadVpRef.current) {
        const mid = spreadVpRef.current.getBoundingClientRect().width / 2;
        const colRight = it.start < mid ? mid - 8 : base.width;
        const colLeft = it.start < mid ? 0 : mid + 8;
        left = Math.max(left, colLeft);
        width = Math.max(40, colRight - left);
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
  }, [spreadOn]);

  useLayoutEffect(() => {
    measureNotes();
  }, [measureNotes, verses, data.marks, editingMarkId, spreadIndex, spreadOn]);

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
    const vv = window.visualViewport;
    if (!vv) return;
    const place = () => {
      const input = editInputRef.current;
      if (!input) return;
      const limit = vv.offsetTop + vv.height - 12;
      const h = input.offsetHeight || 32;
      const top = parseFloat(input.style.top || "0");
      if (Number.isFinite(top) && top + h > limit) {
        input.style.top = `${Math.max(vv.offsetTop + 8, limit - h)}px`;
      }
    };
    vv.addEventListener("resize", place);
    vv.addEventListener("scroll", place);
    place();
    return () => {
      vv.removeEventListener("resize", place);
      vv.removeEventListener("scroll", place);
    };
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
      // 좌표는 viewport clientX/Y 만. pageY·scrollY·손가락 들림 보정 금지.
      const caret = caretFromPoint(x, y);
      let glyph: DOMRect | null = null;
      let raw: number | null = null;
      const pointRoot =
        (caret?.node.parentElement?.closest(".study-body") as HTMLElement | null) ??
        root;
      if (caret && caret.node.nodeType === Node.TEXT_NODE) {
        glyph = glyphRectOf(caret.node as Text, caret.offset);
        const host = caret.node.parentElement;
        if (!host?.closest(".study-vnum, .study-v-gap")) {
          if (closestVerseText(caret.node, pointRoot)) {
            raw = domPointToOffset(pointRoot, caret.node, caret.offset, spans);
          }
        }
      }
      const contains =
        !!glyph && y >= glyph.top - 0.5 && y <= glyph.bottom + 0.5;
      const ch =
        caret && caret.node.nodeType === Node.TEXT_NODE
          ? (caret.node as Text).data.charAt(
              Math.max(
                0,
                Math.min((caret.node as Text).length - 1, caret.offset),
              ),
            )
          : "";
      const space = !ch || /\s/.test(ch);
      debugLogRef.current(
        `[선택] pointer clientX=${Math.round(x)} clientY=${Math.round(y)} caretRangeFromPoint(${Math.round(x)},${Math.round(y)}) glyphRect=${glyph ? `${Math.round(glyph.left)},${Math.round(glyph.top)} ${Math.round(glyph.width)}×${Math.round(glyph.height)}` : "none"} ch=${JSON.stringify(ch)} containsY=${contains}`,
      );
      // 공백의 줄 박스는 빈 칸까지 덮고, 그 오프셋에서 단어 스냅이 다음 줄로 간다
      if (raw != null && contains && !space) return raw;
      const fixed = offsetNearestLine(root, x, y, spans);
      if (fixed) {
        debugLogRef.current(
          `[선택] 줄 보정(같은 열, 세로 중심) glyphRect=${Math.round(fixed.rect.left)},${Math.round(fixed.rect.top)} ${Math.round(fixed.rect.width)}×${Math.round(fixed.rect.height)} off=${fixed.off}`,
        );
        return fixed.off;
      }
      return raw ?? offsetFromPointScan(root, x, y, spans);
    },
    [spans],
  );

  const measureSel = useCallback(() => {
    const root = bodyRef.current;
    const cur = selRef.current;
    const picks = versePickRef.current;
    if (!root || !cur) {
      selRectsRef.current = [];
      setSelRects([]);
      return;
    }
    const ranges: { start: number; end: number }[] =
      picks && picks.length
        ? picks.flatMap((n) => {
            const sp = spans.find((s) => s.n === n);
            return sp ? [{ start: sp.start, end: sp.end }] : [];
          })
        : [cur];
    const baseEl = spreadVpRef.current ?? root;
    const base = baseEl.getBoundingClientRect();
    const bodies: HTMLElement[] = spreadVpRef.current
      ? Array.from(
          spreadVpRef.current.querySelectorAll<HTMLElement>(
            ".study-page-view .study-body",
          ),
        ).filter((body) => !body.closest(".is-covered, .study-spread-measure"))
      : [root];
    const rects: SelRect[] = [];
    for (const body of bodies) {
      const clip = (body.closest(".study-page-view") as HTMLElement | null) ?? body;
      const clipBox = clip.getBoundingClientRect();
      for (const range of ranges) {
        const a = offsetToDomPoint(body, range.start, spans, false);
        const b = offsetToDomPoint(body, range.end, spans, true);
        if (!a || !b) continue;
        const dom = document.createRange();
        dom.setStart(a.node, a.offset);
        dom.setEnd(b.node, b.offset);
        for (const r of mergeLineRects(Array.from(dom.getClientRects()))) {
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          if (spreadVpRef.current) {
            if (cx < clipBox.left || cx > clipBox.right || cy < clipBox.top || cy > clipBox.bottom)
              continue;
          }
          rects.push({
            top: r.top - base.top,
            left: r.left - base.left,
            width: r.width,
            height: r.height,
          });
        }
      }
    }
    selRectsRef.current = rects;
    setSelRects(rects);
  }, [spans]);

  useLayoutEffect(() => {
    selRef.current = sel;
    measureSel();
  }, [sel, measureSel, data.marks, spreadIndex, spreadOn]);

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
    stemToggleRef.current = null;
    versePickRef.current = null;
    setVersePick(null);
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
    const d = dragRef.current;
    const cur = selRef.current;
    const tog = stemToggleRef.current;
    if (d.moved && tog && cur) {
      if (cur.start === tog.stem.start && cur.end === tog.stem.end) {
        tog.mode = "stem";
      } else if (cur.start === tog.word.start && cur.end === tog.word.end) {
        tog.mode = "full";
      } else {
        // 끌기로 어절 밖으로 넓히면 본체 토글은 더 이상 쓰지 않음
        stemToggleRef.current = null;
      }
    }
    abortSelectGesture({ keepSelection: true, showToolbar: true });
  }, [abortSelectGesture]);

  const updateDragTo = useCallback(
    (x: number, y: number) => {
      const d = dragRef.current;
      if (!d) return;
      // 길게 누름·손잡이·돋보기 캐럿 모두 clientX/Y 그대로
      const off = offsetAtPoint(x, y);
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
    const base = (spreadVpRef.current ?? root).getBoundingClientRect();
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
      const eojeol = plainRef.current.slice(w.start, w.end);
      const packText = [nextPack, prevPack]
        .filter(Boolean)
        .map((p) => p!.verses.map((v) => v.t).join(" "))
        .join("\n");
      if (packText) rememberBookText(bookId, packText);
      const corpus = bookCorpusMap.get(bookId) ?? plainRef.current;
      const local = stemOf(eojeol, corpus);
      const stem = {
        start: w.start + local.start,
        end: w.start + local.end,
      };
      if (stem.end <= stem.start) {
        stem.start = w.start;
        stem.end = w.end;
      }
      stemToggleRef.current = { word: { ...w }, stem: { ...stem }, mode: "stem" };
      const first = { start: stem.start, end: stem.end };
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


  // 빈 곳 탭 → 선택 취소. 선택 안을 탭하면 본체↔어절 전체 토글
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
      const cur = selRef.current;
      const tog = stemToggleRef.current;
      if (cur && tog) {
        const insideSel = selRectsRef.current.some((r) => {
          const root = (spreadVpRef.current ?? bodyRef.current)?.getBoundingClientRect();
          if (!root) return false;
          const left = root.left + r.left;
          const top = root.top + r.top;
          return (
            e.clientX >= left &&
            e.clientX <= left + r.width &&
            e.clientY >= top &&
            e.clientY <= top + r.height
          );
        });
        if (insideSel) {
          const next =
            tog.mode === "stem"
              ? { start: tog.word.start, end: tog.word.end }
              : { start: tog.stem.start, end: tog.stem.end };
          tog.mode = tog.mode === "stem" ? "full" : "stem";
          selRef.current = next;
          setSel(next);
          const tb = selectionToolbarFor(next);
          if (tb) setToolbar(tb);
          return;
        }
      }
      clearSelection();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("pointerup", onUp);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerup", onUp);
    };
  }, [sel, dragging, clearSelection, selectionToolbarFor]);

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
    // 장 전환 시 StudyNotebook이 리마운트되므로 마지막 쪽 요청은 dataset으로 유지
    if (document.documentElement.dataset.studySpreadEnd !== "1") {
      setSpreadIndex(0);
    }
    setSpreadNextBookUi(false);
    setSpreadDragDx(0);
    setSpreadPull(0);
    spreadAnchorVerseRef.current = null;
    const turn = document.documentElement.dataset.studySpreadTurn;
    delete document.documentElement.dataset.studySpreadTurn;
    if (turn === "next" || turn === "prev") {
      setSpreadTurn(turn === "next" ? 1 : -1);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.setTimeout(
        () => setSpreadTurn(0),
        reduce ? 200 : STUDY_SPREAD_ANIM_MS,
      );
    }
  }, [bookId, chapter]);

  useEffect(() => {
    if (!spreadOn) return;
    let seen = false;
    try {
      seen = window.localStorage.getItem("haruchi/spread-hint-seen") === "1";
    } catch {
      return;
    }
    if (seen) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      try {
        window.localStorage.setItem("haruchi/spread-hint-seen", "1");
      } catch {
        /* ignore */
      }
      return;
    }
    setSpreadHint(true);
    const t = window.setTimeout(() => {
      setSpreadHint(false);
      try {
        window.localStorage.setItem("haruchi/spread-hint-seen", "1");
      } catch {
        /* ignore */
      }
    }, 700);
    return () => window.clearTimeout(t);
  }, [spreadOn]);

  useEffect(() => {
    if (!spreadOn || chapter >= total) return;
    if (spreadCount > 0 && spreadIndex < spreadCount - 1 && !flip) return;
    let cancel = false;
    setNextChTitle("");
    loadKoreanChapter(bookId, chapter + 1)
      .then((ch) => {
        if (cancel) return;
        setNextChTitle(ch.title ?? "");
        setNextPack({
          chapter: chapter + 1,
          title: ch.title ?? "",
          verses: ch.verses.krv ?? [],
        });
      })
      .catch(() => {});
    void loadChapterWordStudy(bookId, chapter + 1).catch(() => {});
    return () => {
      cancel = true;
    };
  }, [spreadOn, spreadIndex, spreadCount, chapter, bookId, total, flip]);

  useEffect(() => {
    if (!spreadOn || chapter <= 1) return;
    if (spreadIndex > 0 && flip?.dir !== -1) return;
    let cancel = false;
    loadKoreanChapter(bookId, chapter - 1)
      .then((ch) => {
        if (cancel) return;
        setPrevPack({
          chapter: chapter - 1,
          title: ch.title ?? "",
          verses: ch.verses.krv ?? [],
        });
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [spreadOn, spreadIndex, chapter, bookId, flip]);

  useEffect(() => {
    document.documentElement.dataset.studyWsOpen = wsOpen ? "1" : "";
    return () => {
      delete document.documentElement.dataset.studyWsOpen;
    };
  }, [wsOpen]);

  useEffect(() => {
    document.documentElement.dataset.studyNoteOpen = editingMarkId
      ? "1"
      : "";
    return () => {
      delete document.documentElement.dataset.studyNoteOpen;
    };
  }, [editingMarkId]);

  useEffect(() => {
    if (!spreadOn) {
      delete document.documentElement.dataset.studyChrome;
      return;
    }
    document.documentElement.dataset.studyChrome = chromeOn ? "1" : "0";
    return () => {
      delete document.documentElement.dataset.studyChrome;
    };
  }, [spreadOn, chromeOn]);

  const toggleChrome = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current) return;
    const ds = document.documentElement.dataset;
    if (ds.studySelecting === "1") return;
    if (ds.studyWsOpen === "1") return;
    if (ds.studyNoteOpen === "1") return;
    if (selRef.current) return;
    const t = e.target as HTMLElement;
    if (
      t.closest(
        ".study-spread-edge, .study-spread-pager, .study-toolbar, .study-ws-root, .study-vnum, button, a, input, textarea",
      )
    )
      return;
    const box = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - box.left) / Math.max(1, box.width);
    if (rel < STUDY_SPREAD_EDGE || rel > 1 - STUDY_SPREAD_EDGE) return;
    setChromeOn((v) => !v);
  };

  const measureSpread = useCallback(() => {
    const vp = spreadVpRef.current;
    const flow =
      (vp?.querySelector("[data-spread-measure]") as HTMLElement | null) ??
      spreadFlowRef.current;
    if (!vp || !flow || !spreadOn) return;

    const vv = window.visualViewport;
    const vvTop = vv?.offsetTop ?? 0;
    const vvH = vv?.height ?? window.innerHeight;
    const vvW = vv?.width ?? window.innerWidth;
    const outer = STUDY_SPREAD_OUTER;

    // 실제로 보이는 상단 요소(모바일 톱바 또는 데스크탑 헤더) 하단 Y
    let topChrome = 0;
    for (const sel of [".brp-mobile-topbar", ".brp-header"]) {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) continue;
      const st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.height < 1) continue;
      topChrome = Math.max(topChrome, r.bottom);
    }
    const pgEl = document.querySelector(
      ".study-spread-pager",
    ) as HTMLElement | null;
    // 상단 「n / n쪽」 줄은 없음. 바를 숨겨도(opacity) 높이는 유지되므로 여기서 다시 키우지 않음
    const barH = 0;
    const pgnumH =
      pgEl?.getBoundingClientRect().height || STUDY_SPREAD_PGNUM_H;
    // spread 높이 = visualViewport − 보이는 상단 − 쪽번호줄
    const contentTop = Math.max(topChrome, vvTop) + barH;
    const contentBottom = vvTop + vvH - pgnumH;
    const spreadH = Math.max(120, Math.floor(contentBottom - contentTop));
    const spreadW = Math.max(200, Math.floor(vvW - outer * 2));
    const g = calcSpreadGeometry(spreadW, spreadH);

    pageWRef.current = g.pageW;
    setPageW(g.pageW);
    vp.style.setProperty("--study-page-w", `${g.pageW}px`);
    setSpreadBoxStyle({
      width: `${g.spreadW}px`,
      height: `${g.spreadH}px`,
      ["--study-spread-w" as string]: `${g.spreadW}px`,
      ["--study-page-w" as string]: `${g.pageW}px`,
    });

    const paintFlow = (node: HTMLElement) => {
      node.style.width = "";
      node.style.minWidth = `${Math.ceil(g.colW + g.padOuter * 2)}px`;
      node.style.height = `${g.spreadH}px`;
      node.style.maxHeight = `${g.spreadH}px`;
      node.style.columnWidth = `${g.colW}px`;
      node.style.columnGap = `${g.colGap}px`;
      node.style.columnFill = "auto";
      node.style.paddingLeft = `${g.padOuter}px`;
      node.style.paddingRight = `${g.padOuter}px`;
      node.style.paddingTop = "32px";
      node.style.paddingBottom = "36px";
      node.style.boxSizing = "border-box";
    };
    vp.querySelectorAll<HTMLElement>(".study-spread-flow").forEach(paintFlow);

    void flow.offsetHeight;

    // 쪽 수: 열 시작 위치(실측)로 마지막 글자가 몇 번째 열인지
    const body = flow.querySelector(".study-body") as HTMLElement | null;
    const pageStride = g.colW + g.colGap;
    let pages = 1;
    if (body) {
      // getBoundingClientRect 는 이미 transform 반영 → tx를 다시 더하면 쪽 수 폭주
      const flowLeft = flow.getBoundingClientRect().left;
      let maxCol = 0;
      const nodes = body.querySelectorAll<HTMLElement>("[data-verse-num]");
      const list =
        nodes.length > 0
          ? nodes
          : body.querySelectorAll<HTMLElement>(":scope > *");
      list.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 && r.height < 1) return;
        const x = r.left - flowLeft - g.padOuter;
        const col = Math.max(0, Math.floor((x + 1) / pageStride));
        if (col > maxCol) maxCol = col;
      });
      pages = Math.max(1, maxCol + 1);
      // scrollWidth는 펼침 상자 너비라 짧은 장도 2쪽으로 부푼다. 절이 있으면 열 실측만.
      if (nodes.length === 0) {
        pages = Math.max(
          1,
          Math.ceil(Math.max(flow.scrollWidth - g.padOuter * 2, 0) / pageStride),
        );
      }
    }
    const spreads = Math.max(1, Math.ceil(pages / 2));
    setPageCount(pages);
    setSpreadCount(spreads);
    setSpreadStride(g.spreadStride);
    const prevFlow = vp.querySelector<HTMLElement>("[data-measure-prev]");
    if (prevFlow) {
      const left = prevFlow.getBoundingClientRect().left;
      let maxCol = 0;
      prevFlow.querySelectorAll<HTMLElement>("[data-verse-num]").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 && r.height < 1) return;
        const col = Math.max(
          0,
          Math.floor((r.left - left - g.padOuter + 1) / g.pageStride),
        );
        if (col > maxCol) maxCol = col;
      });
      setPrevPageCount(Math.max(1, maxCol + 1));
    }

    const anchor = spreadAnchorVerseRef.current;
    if (anchor != null) {
      const el = bodyRef.current?.querySelector<HTMLElement>(
        `[data-verse-num="${anchor}"]`,
      );
      if (el) {
        const flowLeft = flow.getBoundingClientRect().left;
        const er = el.getBoundingClientRect();
        const contentX = er.left - flowLeft - g.padOuter;
        const page = Math.max(
          0,
          Math.min(pages - 1, Math.floor((contentX + 1) / g.pageStride)),
        );
        const si = Math.floor(page / 2);
        setSpreadIndex(si);
        spreadAnchorVerseRef.current = null;
        delete document.documentElement.dataset.studySpreadEnd;
        return;
      }
    }
    if (document.documentElement.dataset.studySpreadEnd === "1") {
      // 본문 절이 아직 배치되기 전에 pages=1로 조기 확정하면 1쪽으로 떨어짐
      const laidOut =
        (body?.querySelectorAll("[data-verse-num]")?.length ?? 0) > 0;
      if (!laidOut) return;
      setSpreadIndex(Math.max(0, spreads - 1));
      delete document.documentElement.dataset.studySpreadEnd;
      return;
    }
    setSpreadIndex((i) => Math.min(i, Math.max(0, spreads - 1)));
  }, [spreadOn]);

  useLayoutEffect(() => {
    if (!spreadOn || !verses) return;
    measureSpread();
    const onResize = () => measureSpread();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onResize);
    vv?.addEventListener("scroll", onResize);
    const ro = new ResizeObserver(() => measureSpread());
    ro.observe(document.documentElement);
    const topbar = document.querySelector(".brp-mobile-topbar");
    const header = document.querySelector(".brp-header");
    const pg = document.querySelector(".study-spread-pager");
    const reader = document.querySelector(".brp-reader");
    for (const el of [topbar, header, pg, reader]) {
      if (el) ro.observe(el);
    }
    document.fonts?.ready.then(measureSpread).catch(() => {});
    const mo = new MutationObserver(() => measureSpread());
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "class", "data-study-spread"],
    });
    const t0 = window.setTimeout(measureSpread, 50);
    const t1 = window.setTimeout(measureSpread, 200);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      vv?.removeEventListener("resize", onResize);
      vv?.removeEventListener("scroll", onResize);
      ro.disconnect();
      mo.disconnect();
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
  }, [spreadOn, verses, title, chapter, bookId, data.marks.length, measureSpread]);

  const spreadBlocked = (dir: 1 | -1) => {
    if (dir < 0) return spreadIndexRef.current <= 0 && chapter <= 1;
    return (
      spreadIndexRef.current >= spreadCountRef.current - 1 && chapter >= total
    );
  };

  const reducedMotion = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const paintShade = (angle: number) => {
    const t = Math.sin((Math.min(180, Math.abs(angle)) * Math.PI) / 180);
    if (leafInkRef.current) leafInkRef.current.style.opacity = String(t);
    if (leafCastRef.current) leafCastRef.current.style.opacity = String(t);
    if (leafRimRef.current) leafRimRef.current.style.opacity = String(Math.min(1, t));
  };

  const stopShade = () => {
    if (flipRafRef.current) cancelAnimationFrame(flipRafRef.current);
    flipRafRef.current = 0;
  };

  const bezierY = (p: number) => {
    const x1 = 0.2;
    const y1 = 0.8;
    const x2 = 0.2;
    const y2 = 1;
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;
    const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
    const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
    let t = p;
    for (let i = 0; i < 5; i++) {
      const dx = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(dx) < 1e-4) break;
      t = Math.min(1, Math.max(0, t - (sampleX(t) - p) / dx));
    }
    return sampleY(t);
  };

  const trackShade = (from: number, to: number) => {
    stopShade();
    const t0 = performance.now();
    const loop = (now: number) => {
      const p = Math.min(1, (now - t0) / STUDY_SPREAD_ANIM_MS);
      paintShade(from + (to - from) * bezierY(p));
      if (p < 1) flipRafRef.current = requestAnimationFrame(loop);
    };
    flipRafRef.current = requestAnimationFrame(loop);
  };

  const commitFlip = (commit: boolean) => {
    if (flipBusyRef.current) return;
    flipBusyRef.current = true;
    stopShade();
    const dir = flipRef.current?.dir ?? 0;
    const spread = spreadVpRef.current;
    spread?.classList.remove("is-fade-turn");
    setFlip(null);
    flipAngleRef.current = 0;
    if (!commit || !dir || spreadBlocked(dir)) {
      flipBusyRef.current = false;
      return;
    }
    if (dir > 0 && spreadIndexRef.current >= spreadCountRef.current - 1) {
      if (chapter < total) {
        delete document.documentElement.dataset.studySpreadEnd;
        if (onMoveChapter) onMoveChapter(chapter + 1);
        else if (!embedded)
          window.location.assign(`/study/${bookId}/${chapter + 1}`);
      }
      flipBusyRef.current = false;
      return;
    }
    if (dir < 0 && spreadIndexRef.current <= 0) {
      if (chapter > 1) {
        document.documentElement.dataset.studySpreadEnd = "1";
        if (onMoveChapter) onMoveChapter(chapter - 1);
        else if (!embedded)
          window.location.assign(`/study/${bookId}/${chapter - 1}`);
      }
      flipBusyRef.current = false;
      return;
    }
    setSpreadIndex((i) => i + dir);
    flipBusyRef.current = false;
  };

  const settleFlip = (commit: boolean) => {
    const leaf = leafRef.current;
    const dir = flipRef.current?.dir ?? 1;
    if (reducedMotion()) {
      const spread = spreadVpRef.current;
      spread?.classList.add("is-fade-turn");
      if (spread) {
        spread.style.transition = "opacity 200ms ease";
        spread.style.opacity = "0.45";
      }
      window.setTimeout(() => {
        commitFlip(commit);
        if (spread) spread.style.opacity = "1";
      }, 200);
      return;
    }
    if (!leaf) {
      commitFlip(commit);
      return;
    }
    const target = commit ? (dir > 0 ? -180 : 180) : 0;
    const from = flipAngleRef.current;
    leaf.style.transition = "none";
    void leaf.offsetWidth;
    leaf.style.transition = `transform ${STUDY_SPREAD_ANIM_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
    leaf.style.transform = `rotateY(${target}deg)`;
    trackShade(from, target);
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      leaf.removeEventListener("transitionend", onEnd);
      window.clearTimeout(fallback);
      commitFlip(commit);
    };
    const onEnd = (ev: TransitionEvent) => {
      if (ev.target !== leaf || ev.propertyName !== "transform") return;
      done();
    };
    leaf.addEventListener("transitionend", onEnd);
    const fallback = window.setTimeout(done, STUDY_SPREAD_ANIM_MS + 80);
  };

  const goSpreadBy = useCallback(
    (delta: number) => {
      if (document.documentElement.dataset.studySelecting === "1") return;
      if (document.documentElement.dataset.studyWsOpen === "1") return;
      if (document.documentElement.dataset.studyNoteOpen === "1") return;
      if (flipRef.current) return;
      const dir: 1 | -1 = delta > 0 ? 1 : -1;
      setSpreadNextBookUi(false);
      if (spreadBlocked(dir)) return;
      flipBusyRef.current = false;
      flipAngleRef.current = 0;
      setFlip({ dir, auto: true });
    },
    [chapter, total],
  );

  useLayoutEffect(() => {
    if (!flip?.auto) return;
    let cancel = false;
    const id = requestAnimationFrame(() => {
      if (!cancel) settleFlip(true);
    });
    return () => {
      cancel = true;
      cancelAnimationFrame(id);
    };
    // settleFlip는 렌더마다 새로 만들어지지만, flip이 바뀔 때만 재생한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flip]);

  useLayoutEffect(() => {
    if (!flip || flip.auto) return;
    const leaf = leafRef.current;
    if (!leaf) return;
    leaf.style.transition = "none";
    leaf.style.transform = `rotateY(${flipAngleRef.current}deg)`;
    paintShade(flipAngleRef.current);
  }, [flip]);

  useLayoutEffect(() => {
    if (!spreadOn) return;
    measureSpread();
  }, [flip, spreadOn, measureSpread, nextPack, prevPack]);

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

  const releaseSpreadCapture = (
    el: HTMLDivElement,
    id: number,
  ) => {
    try {
      if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
    } catch {
      /* ignore */
    }
  };

  const resetSpreadDrag = () => {
    setSpreadDragging(false);
    setSpreadDragDx(0);
    setSpreadPull(0);
  };

  const onSpreadPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!spreadOn) return;
    const ds = document.documentElement.dataset;
    if (ds.studySelecting === "1") return;
    if (ds.studyWsOpen === "1") return;
    if (ds.studyNoteOpen === "1") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (
      t.closest(
        ".study-toolbar, .study-ws-root, .study-sel-handle, .study-mark-note-input, .study-spread-pager, .study-vnum",
      )
    )
      return;
    const now = performance.now();
    const gesture = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      t: now,
      lastX: e.clientX,
      lastT: now,
      vx: 0,
      moved: 0,
      mode: "pending" as const,
      done: false,
      timer: 0,
    };
    gesture.timer = window.setTimeout(() => {
      const cur = spreadSwipeRef.current;
      if (!cur || cur.id !== gesture.id || cur.mode !== "pending") return;
      if (cur.moved < 8) cur.mode = "hold";
    }, 350);
    spreadSwipeRef.current = gesture;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onSpreadPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = spreadSwipeRef.current;
    if (!s || s.id !== e.pointerId || s.done) return;
    if (s.mode === "hold" || s.mode === "ignore") return;
    const ds = document.documentElement.dataset;
    if (
      ds.studySelecting === "1" ||
      ds.studyWsOpen === "1" ||
      ds.studyNoteOpen === "1"
    ) {
      s.mode = "ignore";
      if (pressRef.current == null) resetSpreadDrag();
      return;
    }
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    s.moved = Math.hypot(dx, dy);
    const now = performance.now();
    const dt = Math.max(1, now - s.lastT);
    s.vx = (e.clientX - s.lastX) / dt;
    s.lastX = e.clientX;
    s.lastT = now;
    const elapsed = now - s.t;
    if (s.mode === "pending") {
      const horizontal =
        Math.abs(dx) >= 10 && Math.abs(dx) > Math.abs(dy) * 1.5;
      const verticalish = Math.abs(dx) <= Math.abs(dy) * 1.5;
      if (elapsed <= 350 && horizontal) {
        s.mode = "drag";
        if (pressRef.current) {
          window.clearTimeout(pressRef.current.timer);
          pressRef.current = null;
        }
        const dragDir: 1 | -1 = dx < 0 ? 1 : -1;
        if (!flipRef.current) {
          flipBusyRef.current = false;
          flipAngleRef.current = 0;
          setFlip({ dir: dragDir, auto: false });
        }
      } else if (elapsed > 350 || (s.moved >= 8 && verticalish)) {
        s.mode = "ignore";
        if (s.moved >= 8 && pressRef.current) {
          window.clearTimeout(pressRef.current.timer);
          pressRef.current = null;
        }
        return;
      } else {
        return;
      }
    }
    if (s.mode !== "drag") return;
    const active: 1 | -1 = flipRef.current?.dir ?? (dx < 0 ? 1 : -1);
    const width = Math.max(1, pageWRef.current);
    let angle = (dx / width) * 180;
    if (active > 0) angle = Math.max(-180, Math.min(0, angle));
    else angle = Math.min(180, Math.max(0, angle));
    if (spreadBlocked(active)) angle *= 0.3;
    flipAngleRef.current = angle;
    if (flipRafRef.current) return;
    flipRafRef.current = requestAnimationFrame(() => {
      flipRafRef.current = 0;
      const leaf = leafRef.current;
      if (!leaf) return;
      leaf.style.transition = "none";
      leaf.style.transform = `rotateY(${flipAngleRef.current}deg)`;
      paintShade(flipAngleRef.current);
    });
  };

  const finishSpreadSwipe = (
    e: ReactPointerEvent<HTMLDivElement>,
    cancel = false,
  ) => {
    const s = spreadSwipeRef.current;
    if (!s || s.id !== e.pointerId || s.done) return;
    s.done = true;
    window.clearTimeout(s.timer);
    spreadSwipeRef.current = null;
    releaseSpreadCapture(e.currentTarget, e.pointerId);
    const wasDrag = s.mode === "drag";
    const dx = e.clientX - s.x;
    const dir: 1 | -1 =
      flipRef.current?.dir ?? (dx < 0 || (dx === 0 && s.vx < 0) ? 1 : -1);
    resetSpreadDrag();
    if (cancel || !wasDrag) {
      if (flipRef.current) settleFlip(false);
      if (!cancel && s.mode === "pending" && s.moved < 8) {
        const box = e.currentTarget.getBoundingClientRect();
        const rel = (e.clientX - box.left) / Math.max(1, box.width);
        const target = e.target as HTMLElement | null;
        if (!target?.closest?.(".study-vnum")) {
          if (rel < STUDY_SPREAD_EDGE || rel > 1 - STUDY_SPREAD_EDGE) {
            spreadEdgeTapRef.current = performance.now();
            goSpreadBy(rel < STUDY_SPREAD_EDGE ? -1 : 1);
          }
        }
      }
      return;
    }
    suppressClickRef.current = true;
    spreadEdgeTapRef.current = performance.now();
    const flick =
      dir > 0 ? s.vx < -STUDY_SPREAD_COMMIT_VEL : s.vx > STUDY_SPREAD_COMMIT_VEL;
    const commit =
      !spreadBlocked(dir) &&
      (Math.abs(flipAngleRef.current) > STUDY_SPREAD_COMMIT_DEG || flick);
    settleFlip(commit);
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

  const pickedVerseMarks = (type: "hl" | "ul", color: string) => {
    const picks = versePickRef.current;
    if (!picks || picks.length === 0) return false;
    const marks = [...dataRef.current.marks];
    for (const n of picks) {
      const sp = spans.find((s) => s.n === n);
      if (!sp) continue;
      marks.push({
        id: newMarkId(),
        ref: n,
        start: sp.start,
        end: sp.end,
        type,
        color,
      });
    }
    persist({ ...dataRef.current, marks });
    versePickRef.current = null;
    setVersePick(null);
    toolStashRef.current = null;
    setToolbar(null);
    setSel(null);
    return true;
  };

  const applyHighlight = (color: string) => {
    const tb = toolbarActionTarget();
    if (!tb) return;
    if (tb.kind === "selection" && pickedVerseMarks("hl", color)) return;
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
    if (tb.kind === "selection" && pickedVerseMarks("ul", UL_COLOR)) return;
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
    const picks = versePickRef.current;
    const ranges =
      picks && picks.length
        ? picks.flatMap((n) => {
            const sp = spans.find((s) => s.n === n);
            return sp ? [{ start: sp.start, end: sp.end }] : [];
          })
        : [{ start: tb.start, end: tb.end }];
    persist({
      ...dataRef.current,
      marks: dataRef.current.marks.filter(
        (m) => !ranges.some((r) => m.start < r.end && m.end > r.start),
      ),
    });
    versePickRef.current = null;
    setVersePick(null);
    setSel(null);
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
    const picks = versePickRef.current;
    const items =
      picks && picks.length
        ? picks.flatMap((n) => {
            const sp = spans.find((s) => s.n === n);
            return sp ? [{ chapter, n, text: sp.text }] : [];
          })
        : [
            {
              chapter,
              n: verseContaining(spans, start),
              text: plainRef.current.slice(start, end),
            },
          ];
    const payload = formatStudyCopy(bookMeta.shortName, items);
    if (!payload.trim()) return;
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

  const focusNoteInput = (markId?: string) => {
    const input = editInputRef.current;
    if (!input) return;
    if (markId) {
      const anchor = document.querySelector<HTMLElement>(
        `[data-note-anchor~="${markId}"]`,
      );
      if (anchor) {
        const r = anchor.getBoundingClientRect();
        const vv = window.visualViewport;
        const limit = (vv ? vv.offsetTop + vv.height : window.innerHeight) - 12;
        let top = r.bottom - 2;
        if (top + 32 > limit) top = Math.max(8, limit - 32);
        input.style.position = "fixed";
        input.style.top = `${top}px`;
        input.style.left = `${Math.max(8, r.left)}px`;
        input.style.width = `${Math.max(140, Math.min(280, window.innerWidth - r.left - 16))}px`;
        input.style.zIndex = "80";
      }
    }
    noteGuardRef.current = performance.now() + 600;
    input.focus();
    const len = input.value.length;
    try {
      input.setSelectionRange(len, len);
    } catch {
      /* ignore */
    }
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
      flushSync(() => beginNoteEdit(tb.markId));
      focusNoteInput(tb.markId);
      return;
    }
    if (versePickRef.current && versePickRef.current.length > 1) {
      const first = spans.find((s) => s.n === versePickRef.current?.[0]);
      if (first) {
        tb.start = first.start;
        tb.end = first.end;
        tb.ref = first.n;
      }
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
    flushSync(() => beginNoteEdit(mark.id, mark.note));
    focusNoteInput(mark.id);
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
          debugLog("[원어] mark 없음 — 시트는 1절 칩으로 연다");
          verse = 1;
          selectedKo = "";
        } else {
          selectedKo = plainRef.current.slice(mark.start, mark.end).trim();
          verse = mark.ref;
        }
      }
    }

    const path = `/word-study/${bookId}/${chapter}.json`;
    const openSheet = (opts: {
      initial: WordStudyToken | null;
      matched: boolean;
      hint: string | null;
    }) => {
      setWsVerse(verse);
      setWsInitial(opts.initial);
      setWsSelectedKo(selectedKo);
      setWsMatched(opts.matched);
      setWsMatchHint(opts.hint);
      setWsOpen(true);
      toolStashRef.current = null;
      setToolbar(null);
      window.getSelection()?.removeAllRanges();
    };

    if (!wsHasFile && wsTokens.length === 0) {
      debugLog(`[원어] 실패 사유=파일 없음 ${path}`);
      setToast(
        isOtBook
          ? "히브리어 원어 파일이 아직 없어요"
          : `원어 자료 없음: ${path}`,
      );
      // 파일이 없어도 빈 시트를 열어 무반응 경로를 없앰
      openSheet({
        initial: null,
        matched: false,
        hint: "정확한 단어를 못 찾았어요 · 칩에서 골라 주세요",
      });
      return;
    }

    const verseToks = tokensInVerse(wsTokens, verse);
    const meta = wsVerseMeta[verse];
    const diffKind = isOtBook
      ? null
      : greekVerseKind(greekDiffMap, bookId, chapter, verse);
    // 리포트(krvOnlyOmit/krvEmpty) 또는 장 JSON의 빈 칩 → SBL 안내
    const isOmit =
      !isOtBook &&
      (diffKind === "omit" || (!!meta?.empty && verseToks.length === 0));

    if (isOmit) {
      debugLog(`[원어] SBL 생략/빈 절 verse=${verse} diff=${diffKind ?? "-"}`);
      openSheet({
        initial: null,
        matched: false,
        hint: GREEK_SBL_OMIT_HINT,
      });
      return;
    }

    const span = spans.find((s) => s.n === verse);
    const verseLen = span ? Math.max(0, span.end - span.start) : 0;
    const absStart =
      pick?.start ??
      (tb?.kind === "selection"
        ? tb.start
        : tb?.kind === "mark"
          ? (marksById.get(tb.markId)?.start ?? 0)
          : 0);
    const charIndex = span
      ? Math.max(0, Math.min(Math.max(0, verseLen - 1), absStart - span.start))
      : 0;
    const result = matchTokenByGlossDetailed(
      wsTokens,
      verse,
      selectedKo,
      { titleShift: wsTitleShift, charIndex, verseLen },
    );
    const reasonKo: Record<string, string> = {
      ok: "ok",
      "empty-query": "선택 텍스트 비어 있음",
      "no-file": "파일 없음",
      "no-verse": "절 없음",
      split: "split",
      titleShift: "titleShift",
      "match-zero": "매칭 0",
    };
    if (result.reason !== "ok") {
      debugLog(
        `[원어] 실패 사유=${reasonKo[result.reason] ?? result.reason} verse=${verse} ko="${selectedKo.slice(0, 24)}" score=${result.score} nearest=${result.nearest?.strong || "-"}`,
      );
    } else {
      debugLog(
        `[원어] match ok strong=${result.token?.strong || "-"} → setWsOpen(true)`,
      );
    }

    // split 절: 히브리어와 같이 칩을 보여 주고, 없으면 첫 칩을 고름
    const pickToken =
      result.token ?? result.nearest ?? verseToks[0] ?? null;
    openSheet({
      initial: pickToken,
      matched: result.reason === "ok",
      hint:
        result.reason === "ok"
          ? null
          : "정확한 단어를 못 찾았어요 · 칩에서 골라 주세요",
    });
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
  const applyVersePick = (nums: number[]) => {
    const unique = [...new Set(nums)]
      .filter((n) => spans.some((s) => s.n === n))
      .sort((a, b) => a - b);
    if (unique.length === 0) {
      clearSelection();
      return;
    }
    versePickRef.current = unique;
    setVersePick(unique);
    const first = spans.find((s) => s.n === unique[0]);
    if (!first) return;
    const range = { start: first.start, end: first.end };
    selRef.current = range;
    setSel(range);
    const tb = selectionToolbarFor(range);
    if (tb) setToolbar(tb);
  };

  const verseAtPointer = (x: number, y: number) => {
    const root = (spreadOn ? spreadVpRef.current : bodyRef.current) ?? document.body;
    const box = root.getBoundingClientRect();
    const best = { n: -1, d: Infinity };
    root.querySelectorAll<HTMLElement>(".study-vnum").forEach((el) => {
      if (el.closest(".is-covered, .study-spread-measure")) return;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      if (r.right < box.left || r.left > box.right || r.bottom < box.top || r.top > box.bottom)
        return;
      if (x < r.left - 140 || x > r.right + 320) return;
      const num = Number(el.textContent);
      if (!Number.isFinite(num)) return;
      const d = Math.abs((r.top + r.bottom) / 2 - y);
      if (d < best.d) {
        best.n = num;
        best.d = d;
      }
    });
    return best.d < 100 ? best.n : null;
  };

  const onVerseNumPointerDown = (n: number, e: ReactPointerEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const base = versePickRef.current ?? [];
    verseDragRef.current = {
      id: e.pointerId,
      n,
      x: e.clientX,
      y: e.clientY,
      mode: "pending",
      wasSelected: base.includes(n),
      base,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onVerseNumPointerMove = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const d = verseDragRef.current;
    if (!d || d.id !== e.pointerId) return;
    if (d.mode === "pending" && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) return;
    d.mode = "drag";
    const hit = verseAtPointer(e.clientX, e.clientY) ?? d.n;
    const lo = Math.min(d.n, hit);
    const hi = Math.max(d.n, hit);
    applyVersePick(spans.filter((s) => s.n >= lo && s.n <= hi).map((s) => s.n));
    if (spreadOn) return;
    const sc = scrollRootOf(bodyRef.current);
    const edge =
      sc === window
        ? { top: 0, bottom: window.innerHeight }
        : (sc as HTMLElement).getBoundingClientRect();
    if (e.clientY < edge.top + 48) scrollByY(sc, -16);
    else if (e.clientY > edge.bottom - 48) scrollByY(sc, 16);
  };

  const onVerseNumPointerUp = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const d = verseDragRef.current;
    if (!d || d.id !== e.pointerId) return;
    verseDragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (d.mode === "drag") return;
    if (d.base.length === 0) applyVersePick([d.n]);
    else if (d.wasSelected) applyVersePick(d.base.filter((n) => n !== d.n));
    else applyVersePick([...d.base, d.n]);
  };

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
          <span
            className="study-vnum"
            onPointerDown={(e) => onVerseNumPointerDown(span.n, e)}
            onPointerMove={onVerseNumPointerMove}
            onPointerUp={onVerseNumPointerUp}
            onPointerCancel={onVerseNumPointerUp}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {span.n}
          </span>
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

  const renderMarkNotes = (): ReactNode => {
    const rows = Object.entries(notePos).map(([nid, pos]) => {
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
            onBlur={() => {
              if (performance.now() < noteGuardRef.current) {
                requestAnimationFrame(() => editInputRef.current?.focus());
                return;
              }
              commitNoteEdit();
            }}
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
            else {
              flushSync(() => beginNoteEdit(nid));
              focusNoteInput(nid);
            }
          }}
        >
          {isBadge ? circledNum(pos.badge ?? 1) : mark.note}
        </span>
      );
    });
    if (editingMarkId && !notePos[editingMarkId]) {
      rows.push(
        <input
          key={`edit-pending-${editingMarkId}`}
          ref={editInputRef}
          className="study-mark-note-input"
          style={{
            position: "fixed",
            top: 72,
            left: 16,
            width: 240,
            zIndex: 80,
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
            if (e.key === "Escape") setEditingMarkId(null);
          }}
          onBlur={() => {
            if (performance.now() < noteGuardRef.current) {
              requestAnimationFrame(() => editInputRef.current?.focus());
              return;
            }
            commitNoteEdit();
          }}
        />,
      );
    }
    return rows;
  };

  const pageStridePx = spreadStride > 0 ? spreadStride / 2 : pageW;

  const renderPlainFlow = (
    pack: { chapter: number; title: string; verses: { n: number; t: string }[] },
    local: number,
    measurePrev = false,
  ) => (
    <article
      className="study-page study-spread-flow"
      data-measure-prev={measurePrev ? "" : undefined}
      data-study-chapter-inner={pack.chapter}
      style={{ transform: `translate3d(${-local * pageStridePx}px,0,0)` }}
    >
      <span
        className={`study-drop${String(pack.chapter).length >= 3 ? " is-wide" : ""}`}
        aria-hidden
      >
        <span className="study-drop-num">{pack.chapter}</span>
      </span>
      {pack.title ? <span className="study-chapter-title">{pack.title}</span> : null}
      <div className="study-body">
        {pack.verses.map((v, i) => (
          <span key={v.n} className="study-verse" data-verse-num={v.n}>
            {i > 0 ? <span className="study-v-gap"> </span> : null}
            <span className="study-vnum">{v.n}</span>
            {v.t}
          </span>
        ))}
      </div>
    </article>
  );

  const renderCurrentFlow = (pageIndex: number, measure: boolean) => (
    <article
      ref={measure ? spreadFlowRef : undefined}
      className="study-page study-spread-flow"
      data-spread-measure={measure ? "" : undefined}
      data-study-chapter-inner={chapter}
      style={{ transform: `translate3d(${-pageIndex * pageStridePx}px,0,0)` }}
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
        ref={measure ? bodyRef : undefined}
        className={`study-body${dragging ? " is-selecting" : ""}`}
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
          : paraGroups[0]?.verses.map((span, i) => renderVerse(span, i === 0))}
      </div>
    </article>
  );

  const renderFace = (pageIndex: number, measure: boolean) => {
    let inner: ReactNode = null;
    if (pageIndex >= 0 && pageIndex < pageCount) {
      inner = renderCurrentFlow(pageIndex, measure);
    } else if (pageIndex >= pageCount) {
      const over = pageIndex - pageCount;
      const oddBlank = pageCount % 2 === 1;
      if (oddBlank && over === 0) {
        inner =
          chapter < total ? (
            <button
              type="button"
              className="study-spread-next-ch"
              onClick={(e) => {
                e.stopPropagation();
                if (performance.now() - spreadEdgeTapRef.current < 450) return;
                goSpreadBy(1);
              }}
            >
              <span className="study-spread-next-kicker">다음 장</span>
              <span className="study-spread-next-num">{chapter + 1}</span>
              {nextChTitle ? (
                <span className="study-spread-next-title">{nextChTitle}</span>
              ) : null}
              <span className="study-spread-next-cta">넘겨서 계속 읽기 →</span>
            </button>
          ) : (
            <div className="study-page-blank" />
          );
      } else if (nextPack) {
        inner = renderPlainFlow(nextPack, oddBlank ? over - 1 : over);
      }
    } else if (prevPack && prevPageCount > 0) {
      const start = Math.floor((prevPageCount - 1) / 2) * 2;
      const local = start + (pageIndex + 2);
      if (local >= 0 && local < prevPageCount) {
        inner = renderPlainFlow(prevPack, local);
      }
    }
    return <div className="study-page-view">{inner}</div>;
  };

  const spreadTx =
    spreadOn
      ? -(spreadIndex * spreadStride) + (spreadDragging ? spreadDragDx : 0)
      : 0;
  const leftPage = spreadIndex * 2;
  const leftPageNum = spreadIndex * 2 + 1;
  const rightPageNum = spreadIndex * 2 + 2;
  const stackCount = (n: number) => {
    if (n <= 0) return 0;
    if (n <= 2) return 1;
    if (n <= 6) return 2;
    if (n <= 12) return 3;
    return 4;
  };
  const leftStack = stackCount(Math.max(0, leftPageNum - 1));
  const rightStack = stackCount(
    Math.max(0, pageCount - Math.min(pageCount, rightPageNum)),
  );
  const blankRight = rightPageNum > pageCount;
  const showNextCard = spreadOn && blankRight && chapter < total;
  const spreadProgress =
    pageCount > 0 ? Math.min(pageCount, rightPageNum) / pageCount : 0;
  const liftOp = spreadDragging
    ? 0.04 * (1 - Math.abs(2 * spreadPull - 1))
    : 0;
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
        <div className="study-layout">
          {spreadOn ? (
            <div
              className={`study-spread spread${spreadTurn ? " is-turn" : ""}`}
              ref={spreadVpRef}
              style={spreadBoxStyle}
              onPointerDown={onSpreadPointerDown}
              onPointerMove={onSpreadPointerMove}
              onPointerUp={(e) => finishSpreadSwipe(e, false)}
              onPointerCancel={(e) => finishSpreadSwipe(e, true)}
              onLostPointerCapture={(e) => finishSpreadSwipe(e, true)}
              onClick={toggleChrome}
            >
              {prevPack && spreadIndex === 0 && !flip ? (
                <div className="study-spread-measure" aria-hidden>
                  {renderPlainFlow(prevPack, 0, true)}
                </div>
              ) : null}
              {flip?.dir === -1 ? (
                <div className="study-sheet is-left is-under">
                  {renderFace(leftPage - 2, false)}
                  <div ref={leafCastRef} className="study-leaf-cast" />
                </div>
              ) : (
                <div className="study-sheet is-left">
                  {renderFace(leftPage, true)}
                </div>
              )}
              {flip?.dir === 1 ? (
                <div className="study-sheet is-right is-under">
                  {renderFace(leftPage + 3, false)}
                  <div ref={leafCastRef} className="study-leaf-cast" />
                </div>
              ) : (
                <div className="study-sheet is-right">
                  {renderFace(leftPage + 1, flip?.dir === -1)}
                </div>
              )}
              {flip ? (
                <div
                  ref={leafRef}
                  className={`study-leaf is-hot ${flip.dir === 1 ? "is-next" : "is-prev"}`}
                >
                  <div className="study-leaf-face is-front">
                    {renderFace(flip.dir === 1 ? leftPage + 1 : leftPage, false)}
                    <div ref={leafInkRef} className="study-leaf-ink" />
                    <div ref={leafRimRef} className="study-leaf-rim" />
                  </div>
                  <div className="study-leaf-face is-back">
                    {renderFace(flip.dir === 1 ? leftPage + 2 : leftPage - 1, false)}
                  </div>
                </div>
              ) : null}

              {spreadOn &&
              (selRects.length > 0 || Object.keys(notePos).length > 0) ? (
                <div className="study-note-layer is-spread-overlay">
                  {selRects.map((r, i) => (
                    <span
                      key={`sel-ov-${i}`}
                      className="study-sel-rect"
                      style={{
                        top: r.top,
                        left: r.left,
                        width: r.width,
                        height: r.height,
                      }}
                    />
                  ))}
                  {renderMarkNotes()}
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
                          onPointerDown={(e) => onHandlePointerDown("end", e)}
                          onMouseDown={(e) => onHandlePointerDown("end", e)}
                        />
                      </span>
                    </>
                  ) : null}
                </div>
              ) : null}
              <div
                className="study-spread-lift"
                style={spreadDragging ? { opacity: liftOp } : undefined}
                aria-hidden
              />
              <div
                className={`study-spread-shade is-next${
                  spreadTurn === 1 ? " is-on" : ""
                }`}
                style={
                  spreadDragging && spreadDragDx < 0
                    ? { opacity: spreadPull }
                    : undefined
                }
                aria-hidden
              />
              <div
                className={`study-spread-shade is-prev${
                  spreadTurn === -1 ? " is-on" : ""
                }`}
                style={
                  spreadDragging && spreadDragDx > 0
                    ? { opacity: spreadPull }
                    : undefined
                }
                aria-hidden
              />
              {leftStack > 0 ? (
                <div className="study-spread-stack is-left" aria-hidden>
                  {Array.from({ length: leftStack }, (_, i) => (
                    <i key={i} />
                  ))}
                </div>
              ) : null}
              {rightStack > 0 ? (
                <div className="study-spread-stack is-right" aria-hidden>
                  {Array.from({ length: rightStack }, (_, i) => (
                    <i key={i} />
                  ))}
                </div>
              ) : null}
              <div className="study-spread-fold" aria-hidden />
              <div className="study-spread-runhead is-left" aria-hidden>
                {bookMeta.name}
              </div>
              <div className="study-spread-runhead is-right" aria-hidden>
                {chapter}
                {bookId === "psalms" ? "편" : "장"}
              </div>
              <div className="study-spread-folio is-left" aria-hidden>
                {leftPageNum}
              </div>
              {rightPageNum <= pageCount ? (
                <div className="study-spread-folio is-right" aria-hidden>
                  {rightPageNum}
                </div>
              ) : null}
              <button
                type="button"
                className="study-spread-edge is-prev"
                aria-label="이전 쪽"
                style={{ width: `${STUDY_SPREAD_EDGE * 100}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (performance.now() - spreadEdgeTapRef.current < 450) return;
                  goSpreadBy(-1);
                }}
              >
                <span className="study-spread-turn" aria-hidden>
                  ‹
                </span>
              </button>
              <button
                type="button"
                className="study-spread-edge is-next"
                aria-label="다음 쪽"
                style={{ width: `${STUDY_SPREAD_EDGE * 100}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (performance.now() - spreadEdgeTapRef.current < 450) return;
                  goSpreadBy(1);
                }}
              >
                <span className="study-spread-turn" aria-hidden>
                  ›
                </span>
              </button>
              {spreadHint ? <div className="study-spread-hint" aria-hidden /> : null}
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
                {renderMarkNotes()}
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
              className="study-spread-pager"
              style={{ width: spreadBoxStyle.width }}
              aria-live="polite"
            >
              <div className="study-spread-progress" aria-hidden>
                <span style={{ width: `${spreadProgress * 100}%` }} />
              </div>
              <div className="study-spread-pager-row">
                <button
                  type="button"
                  className="study-spread-pager-btn"
                  aria-label="이전 쪽"
                  onClick={(e) => {
                    e.stopPropagation();
                    goSpreadBy(-1);
                  }}
                >
                  ‹
                </button>
                <span className="study-spread-pager-label">
                  {rightPageNum <= pageCount
                    ? `${leftPageNum}–${rightPageNum} / ${pageCount}`
                    : `${leftPageNum} / ${pageCount}`}
                </span>
                <button
                  type="button"
                  className="study-spread-pager-btn"
                  aria-label="다음 쪽"
                  onClick={(e) => {
                    e.stopPropagation();
                    goSpreadBy(1);
                  }}
                >
                  ›
                </button>
              </div>
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
              data-no-drawer-swipe=""
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
        matched={wsMatched}
        matchHint={wsMatchHint}
        onClose={() => {
          setWsOpen(false);
          setWsMatchHint(null);
        }}
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

function glyphRectOf(node: Text, offset: number): DOMRect | null {
  if (!node.length) return null;
  const i = Math.max(0, Math.min(node.length - 1, offset));
  const range = document.createRange();
  range.setStart(node, i);
  range.setEnd(node, i + 1);
  const r = range.getBoundingClientRect();
  if (r.width < 0.4 && r.height < 0.4) return null;
  return r;
}

/** 같은 열에서 세로 중심이 터치 y에 가장 가까운 줄의 글자 */
function offsetNearestLine(
  root: HTMLElement,
  x: number,
  y: number,
  spans: VerseSpan[],
): { off: number; rect: DOMRect } | null {
  type Line = {
    top: number;
    bottom: number;
    left: number;
    right: number;
    chars: { node: Text; i: number; r: DOMRect }[];
  };
  const lines: Line[] = [];
  const range = document.createRange();
  for (const node of verseTextNodes(root)) {
    for (let i = 0; i < node.length; i += 1) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      if (r.width < 0.4 || r.height < 0.4) continue;
      if (/\s/.test(node.data.charAt(i))) continue;
      const mid = (r.top + r.bottom) / 2;
      let line = lines.find(
        (l) =>
          mid >= l.top &&
          mid <= l.bottom &&
          r.left <= l.right + 28 &&
          r.right >= l.left - 28,
      );
      if (!line) {
        line = {
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
          chars: [],
        };
        lines.push(line);
      } else {
        line.top = Math.min(line.top, r.top);
        line.bottom = Math.max(line.bottom, r.bottom);
        line.left = Math.min(line.left, r.left);
        line.right = Math.max(line.right, r.right);
      }
      line.chars.push({ node, i, r });
    }
  }
  if (lines.length === 0) return null;
  const inCol = lines.filter((l) => x >= l.left - 12 && x <= l.right + 12);
  const pool = inCol.length > 0 ? inCol : lines;
  let best = pool[0];
  let bestDy = Infinity;
  for (const l of pool) {
    const dy = Math.abs((l.top + l.bottom) / 2 - y);
    if (dy < bestDy) {
      bestDy = dy;
      best = l;
    }
  }
  let pick = best.chars[0];
  let bestDx = Infinity;
  for (const c of best.chars) {
    if (x >= c.r.left && x <= c.r.right) {
      pick = c;
      bestDx = 0;
      break;
    }
    const dx = x < c.r.left ? c.r.left - x : x - c.r.right;
    if (dx < bestDx) {
      bestDx = dx;
      pick = c;
    }
  }
  const after = x > pick.r.left + pick.r.width / 2;
  const off = domPointToOffset(
    root,
    pick.node,
    after ? pick.i + 1 : pick.i,
    spans,
  );
  if (off == null) return null;
  return { off, rect: pick.r };
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
