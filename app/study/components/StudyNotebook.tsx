"use client";

import Link from "next/link";
import {
  Fragment,
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
import {
  loadBookData,
  loadReaderChapter,
} from "../../bible-reading/bibleData";
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
  groupByStarts,
  loadParagraphMap,
  mergeParagraphStarts,
  paragraphStartsForChapter,
  type ParagraphMap,
} from "../lib/paragraphs";
import {
  headingsForChapter,
  loadHeadingMap,
  type HeadingMap,
} from "../lib/headings";
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
  matchTokenForSelection,
  tokensInVerse,
  type GlossMatchResult,
  type VerseWordStudyMeta,
  type WordStudyToken,
} from "../lib/wordStudy";
import WordStudySheet, {
  WS_SIDE_INSET,
  type WsSidePanel,
} from "./WordStudySheet";
import {
  loadWsLast,
  saveWsLast,
  type WsLast,
} from "../lib/wsLast";
import { stemOf } from "../lib/koStem";
import {
  STUDY_SPREAD_ANIM_MS,
  STUDY_SPREAD_COMMIT_DIST,
  STUDY_SPREAD_COMMIT_VEL,
  STUDY_SPREAD_FLIP_WATCHDOG_MS,
  STUDY_SPREAD_SETTLE_PAD_MS,
  STUDY_SPREAD_OUTER,
  STUDY_SPREAD_PAD_OUTER,
  STUDY_SPREAD_PGNUM_H,
  calcSpreadGeometry,
  spreadEdgePx,
  subscribeStudySpread,
  subscribeStudyWsCard,
} from "../lib/studySpread";
import { openStudyLoc } from "../lib/studyLocStore";
import StudyLocHost from "./StudyLocHost";
import "../study.css";

/** 본체 뒤 꼬리가 동사를 만드는 말이면 원어 짝에서 동사 칩을 우선 */
const VERBAL_TAIL_RE = /^(하|되|시키|케|함|한|할|합|해|했|치)/;
/** 원어 시트 위로 선택 줄을 띄울 때 줄 아래 여백(한 쪽 보기) */
const WS_REVEAL_GAP = 12;

/** 책별로 이미 로드된 장 본문을 모아 본체 검증에 쓴다 */
const bookCorpusMap = new Map<string, string>();
/** 책 전체 개역한글 — 「핍박+을/이」처럼 다른 장에만 나오는 근거까지 본다 */
const bookFullCorpusMap = new Map<string, string>();
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
  /**
   * 스프레드 연속 채움에서 화면에 보이는 장이 바뀔 때(URL·톱바 동기화).
   * 흐름 재시작(onMoveChapter)과 분리 — 호출해도 본문 창을 리마운트하지 말 것.
   */
  onActiveChapterChange?: (chapter: number) => void;
  /**
   * 본문 레이어. 기본 개역한글.
   * kids = bible-kids-v2, web/kjv = 영어 청크. 원어 공부(단어카드)는 krv 전용.
   */
  textLayer?: "krv" | "kids" | "web" | "kjv";
};

type ContPack = {
  chapter: number;
  title: string;
  verses: { n: number; t: string }[];
};

/** 양면 빈쪽 메우기용으로 한 흐름에 이어서 붙일 최대 뒤 장 수 */
const SPREAD_CONT_MAX = 24;

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

/** 펼침/본문 기준 좌표. width = 접힌 표시 폭, open* = 카드·펼침 */
type NotePos = {
  top: number;
  left: number;
  width: number;
  openLeft: number;
  openWidth: number;
  mode: "full" | "badge" | "dot";
  badge?: number;
  /** 행간 실측(px). 표시 글씨 크기 계산용 */
  gap: number;
  fontSize: number;
  /** 입력 카드: 선택 줄 아래(또는 위) */
  cardTop: number;
  cardPlace: "below" | "above";
};

/** 시작점~단 오른쪽 끝이 단 폭의 이 비율보다 좁으면 단 왼쪽 끝에서 시작 */
const NOTE_MIN_RATIO = 0.4;
/** 같은 줄 앞 메모가 이 폭보다 좁아지면 뒤 메모는 번호 배지로 */
const NOTE_MIN_ROOM = 56;
/** 기본 손글씨 크기(CSS와 맞춤). 틈이 좁으면 줄임 */
const NOTE_FONT_MAX = 22;
/** 이보다 좁은 틈에는 글씨 대신 점만 */
const NOTE_GAP_MIN = 12;
/** 입력 카드 대략 높이(패딩·테두리 포함) */
const NOTE_CARD_H = 40;
const NOTE_CARD_GAP = 6;

const LONG_PRESS_MS = 350;
const MOVE_CANCEL_PX = 8;
/** PC 양쪽: 이 거리 미만으로 350ms 누르면 koStem. 이상이면 네이티브 끌기 */
const MOUSE_HOLD_MOVE_PX = 6;
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

/** 왼쪽 쪽의 왼쪽 끝 / 오른쪽 쪽의 오른쪽 끝. 아니면 0 */
function hitSpreadEdge(
  clientX: number,
  box: DOMRect,
  pageW: number,
): 0 | 1 | -1 {
  const edge = spreadEdgePx(pageW);
  const x = clientX - box.left;
  if (x <= edge) return -1;
  if (x >= box.width - edge) return 1;
  return 0;
}

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
  onActiveChapterChange,
  textLayer = "krv",
}: Props) {
  const isOtBook = isOldTestament(bookId);
  const wsLayerOk = textLayer === "krv";
  const bookMeta = BOOKS[bookId];
  const total = bookMeta.totalChapters;
  const [spreadOn, setSpreadOn] = useState(false);
  /** ≥769: 원어 세로 카드(스프레드·한 단 공통) */
  const [wsCardOn, setWsCardOn] = useState(false);
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
  const [nextPack, setNextPack] = useState<ContPack | null>(null);
  const [prevPack, setPrevPack] = useState<ContPack | null>(null);
  /** 양면: 현재 장 뒤에 같은 흐름으로 이어 붙인 장들(빈 오른쪽 쪽 방지) */
  const [contPacks, setContPacks] = useState<ContPack[]>([]);
  /** 이어서 불러올 뒤 장 개수(측정 후 홀수 쪽이면 +1) */
  const [contWant, setContWant] = useState(0);
  const contPacksRef = useRef<ContPack[]>([]);
  contPacksRef.current = contPacks;
  /** measureSpread 가 반영한 contPacks.length — 측정 전 연속 장 폭주 방지 */
  const measuredContLenRef = useRef(0);
  /** 마지막 쪽에 다음 장을 넣을 빈 칸이 남는지(짝수 쪽이어도 이어 붙여야 함) */
  const lastPageSlackRef = useRef(false);
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
    pageW: number;
    lastProgress: number;
    signFlips: number;
  } | null>(null);
  const spreadEdgeTapRef = useRef(0);
  const flipRef = useRef(flip);
  /* commitFlip이 먼저 비운 값을 다음 렌더의 옛 flip state가 되살리지 않게, 여기서 동기화하지 않음 */
  const leafRef = useRef<HTMLDivElement | null>(null);
  const leafInkRef = useRef<HTMLDivElement | null>(null);
  const leafCastRef = useRef<HTMLDivElement | null>(null);
  const leafRimRef = useRef<HTMLDivElement | null>(null);
  const flipAngleRef = useRef(0);
  const flipRafRef = useRef(0);
  const flipBusyRef = useRef(false);
  const flipTimerRef = useRef(0);
  const flipTeCountRef = useRef(0);
  const flipAeCountRef = useRef(0);
  const flipMoveCountRef = useRef(0);
  const flipLostCapRef = useRef(0);
  const flipWatchdogRef = useRef(0);
  /** handoff가 settleFlip을 직접 호출하면 auto effect 중복 settle 스킵 */
  const skipAutoSettleRef = useRef(false);
  const lastFlipStartRef = useRef(0);
  const lastFlipEndRef = useRef(0);
  const spreadCaptureIdRef = useRef<number | null>(null);
  const spreadCaptureElRef = useRef<HTMLElement | null>(null);
  const hudRef = useRef<HTMLPreElement | null>(null);
  const hudPtRef = useRef({ x: 0, y: 0 });
  const hudProgressRef = useRef({
    v: 0,
    signFlips: 0,
    samples: 0,
    dragging: false,
  });
  const pageWRef = useRef(480);
  const flipPageWRef = useRef(480);
  const gStatsRef = useRef({
    enter: 0,
    leave: 0,
    renderNb: 0,
    renderFace: 0,
    measure: 0,
    widthEmpty: 0,
    ro: 0,
    turnOn: 0,
    turnOff: 0,
    liftOn: 0,
    liftOff: 0,
    masterUnmount: 0,
    sheetTfOnSamples: 0,
    lastTurning: false,
    lastLift: false,
    hoverEl: ".study-spread-edge",
    liftEl: ".study-spread-edge-hint (pe:none opacity)",
  });
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
    kind?: "mouse-hold" | "touch";
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
  const [headingMap, setHeadingMap] = useState<HeadingMap | null>(null);
  const [debugOn, setDebugOn] = useState(false);
  const [debugLines, setDebugLines] = useState<string[]>([]);
  /** 연속 읽기 창에서 디버그 UI는 한 인스턴스만 */
  const [debugHost, setDebugHost] = useState(false);
  const debugLog = useCallback((line: string) => {
    pushStudyDebug(line);
  }, []);
  const debugLogRef = useRef(debugLog);
  debugLogRef.current = debugLog;
  const logFlip = (line: string) => {
    const w = window as Window & {
      __studyFlipLog?: { t: number; line: string }[];
    };
    if (!w.__studyFlipLog) w.__studyFlipLog = [];
    w.__studyFlipLog.push({ t: performance.now(), line });
    try {
      debugLogRef.current(`[넘김] ${line}`);
    } catch {
      /* 로그 실패가 넘김을 막지 않음 */
    }
  };

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
  /** 스프레드: 선택 반대쪽 세로 패널. null = 아래 시트(한 쪽 보기) */
  const [wsSidePanel, setWsSidePanel] = useState<WsSidePanel | null>(null);
  /** 원어 시트를 닫으면 되돌릴 도구 막대·선택 범위 */
  const wsRestoreRef = useRef<{
    toolbar: ToolbarMode | null;
    range: { start: number; end: number } | null;
  } | null>(null);
  const [wsMatchHint, setWsMatchHint] = useState<string | null>(null);
  const [wsMatched, setWsMatched] = useState(false);
  const [wsTitleShift, setWsTitleShift] = useState(false);
  const [wsVerse, setWsVerse] = useState(1);
  const [wsInitial, setWsInitial] = useState<WordStudyToken | null>(null);
  const [wsSelectedKo, setWsSelectedKo] = useState("");
  const [wsLast, setWsLast] = useState<WsLast | null>(null);
  const [wsTabPos, setWsTabPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
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
  const spansRef = useRef(spans);
  spansRef.current = spans;
  const spreadOnRef = useRef(spreadOn);
  spreadOnRef.current = spreadOn;
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

  useEffect(() => {
    if (bookFullCorpusMap.has(bookId)) return;
    let alive = true;
    loadBookData(bookId)
      .then((d) => {
        if (!alive) return;
        const text = d.chapters
          .map((c) => (c.verses?.krv ?? []).map((v) => v.t).join(" "))
          .join("\n");
        if (text) bookFullCorpusMap.set(bookId, text);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [bookId]);

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
    setContPacks([]);
    setContWant(0);
    measuredContLenRef.current = 0;
    loadReaderChapter(bookId, chapter, textLayer)
      .then((ch) => {
        if (cancelled) return;
        setTitle(ch.title ?? "");
        setVerses(ch.verses ?? []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "본문을 불러오지 못했어요");
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, chapter, textLayer]);

  useEffect(() => {
    setData(loadChapterStudy(bookId, chapter));
    setOpenLegacy(new Set());
    setBubble(null);
    setWsOpen(false);
  }, [bookId, chapter]);

  // 양면: 다음 장이 있으면 최소 1장은 같은 흐름에 붙여 둠(빈 쪽·빈 칸 방지)
  useEffect(() => {
    if (!spreadOn || !verses) return;
    if (chapter >= total) return;
    setContWant((w) => Math.max(w, 1));
  }, [spreadOn, verses, chapter, total]);

  // 양면: 빈 오른쪽·마지막 쪽 남는 칸을 메울 만큼 다음 장들을 같은 흐름에 이어 붙임
  useEffect(() => {
    if (!spreadOn) {
      setContPacks([]);
      setContWant(0);
      lastPageSlackRef.current = false;
      return;
    }
    if (!verses || contWant <= 0) {
      if (contWant <= 0) setContPacks([]);
      return;
    }
    let cancel = false;
    const want = contWant;
    (async () => {
      const packs: ContPack[] = [];
      for (let c = chapter + 1; c <= Math.min(total, chapter + want); c++) {
        try {
          const ch = await loadReaderChapter(bookId, c, textLayer);
          if (cancel) return;
          packs.push({
            chapter: c,
            title: ch.title ?? "",
            verses: ch.verses ?? [],
          });
        } catch {
          break;
        }
      }
      if (!cancel) setContPacks(packs);
    })();
    return () => {
      cancel = true;
    };
  }, [spreadOn, verses, contWant, chapter, bookId, total, textLayer]);

  // 홀수 쪽(오른쪽 빔)이거나 마지막 쪽에 빈 칸이 남으면 다음 장을 더 붙임
  useLayoutEffect(() => {
    if (!spreadOn || !verses || flip) return;
    if (pageCount < 1) return;
    const needMore =
      pageCount % 2 === 1 || lastPageSlackRef.current;
    if (!needMore) return;
    const expect = Math.min(contWant, Math.max(0, total - chapter));
    // 요청분 로딩 중
    if (contPacks.length < expect) return;
    // 방금 붙인 장이 아직 쪽 수에 안 들어갔으면 대기(폭주 방지)
    if (measuredContLenRef.current !== contPacks.length) return;
    const last =
      contPacks.length > 0
        ? contPacks[contPacks.length - 1]!.chapter
        : chapter;
    if (last >= total) return;
    if (contPacks.length >= SPREAD_CONT_MAX) return;
    setContWant(contPacks.length + 1);
  }, [
    spreadOn,
    verses,
    flip,
    pageCount,
    contPacks,
    chapter,
    total,
    contWant,
  ]);

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
    let stale = false;
    setHeadingMap(null);
    loadHeadingMap(bookId).then((map) => {
      if (!stale) setHeadingMap(map);
    });
    return () => {
      stale = true;
    };
  }, [bookId]);

  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, [contenteditable=true]")) return;
      const root = bodyRef.current;
      if (!root) return;
      const native = window.getSelection();
      const inStudy =
        !!native &&
        native.rangeCount > 0 &&
        !native.isCollapsed &&
        !!(native.anchorNode && root.contains(native.anchorNode));
      const mapped = inStudy
        ? nativeSelectionToOffsets(root, spansRef.current)
        : null;
      const cur = selRef.current;
      const range = mapped
        ? { start: mapped.start, end: mapped.end }
        : cur && root.contains(document.activeElement)
          ? cur
          : null;
      if (!range) return;
      const items = [
        {
          chapter,
          n: verseContaining(spansRef.current, range.start),
          text: plainRef.current.slice(range.start, range.end),
        },
      ];
      const payload = formatStudyCopy(bookMeta.shortName, items);
      if (!payload.trim()) return;
      e.preventDefault();
      e.clipboardData?.setData("text/plain", payload);
    };
    document.addEventListener("copy", onCopy);
    return () => document.removeEventListener("copy", onCopy);
  }, [bookId, chapter, bookMeta.shortName]);

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

  const paintA2Hud = useCallback((x?: number, y?: number) => {
    const el = hudRef.current;
    const spread = spreadVpRef.current;
    const body = bodyRef.current;
    if (typeof x === "number" && typeof y === "number") {
      hudPtRef.current = { x, y };
    }
    const px = hudPtRef.current.x;
    const py = hudPtRef.current.y;
    const cap =
      captureTargetRef.current ??
      (spreadCaptureIdRef.current != null ? spread : null);
    const pt = typeof document !== "undefined" ? document.elementFromPoint(px, py) : null;
    const edge = spread
      ? hitSpreadEdge(px, spread.getBoundingClientRect(), pageWRef.current)
      : 0;
    const turning = !!flipRef.current;
    const g = gStatsRef.current;
    if (turning !== g.lastTurning) {
      if (turning) g.turnOn += 1;
      else g.turnOff += 1;
      g.lastTurning = turning;
    }
    let sheetLift = false;
    if (spread) {
      spread.querySelectorAll<HTMLElement>(".study-sheet").forEach((sheet) => {
        const tf = getComputedStyle(sheet).transform;
        if (tf && tf !== "none") sheetLift = true;
      });
    }
    if (sheetLift !== g.lastLift) {
      if (sheetLift) g.liftOn += 1;
      else g.liftOff += 1;
      g.lastLift = sheetLift;
    }
    if (sheetLift) g.sheetTfOnSamples += 1;
    const snap = {
      isTurning: turning,
      flipStart: lastFlipStartRef.current,
      flipEnd: lastFlipEndRef.current,
      capture: cap
        ? `${cap.tagName.toLowerCase()}.${(cap.className || "").toString().slice(0, 40)}`
        : "none",
      spreadUserSelect: spread ? getComputedStyle(spread).userSelect : "",
      bodyUserSelect: body ? getComputedStyle(body).userSelect : "",
      fromPoint: pt
        ? `${pt.tagName.toLowerCase()}.${String(pt.className || "").slice(0, 48)}`
        : "none",
      inEdge: edge,
      studySelecting: document.documentElement.dataset.studySelecting || "",
      peBody: body ? getComputedStyle(body).pointerEvents : "",
      progress: hudProgressRef.current.v,
      signFlips: hudProgressRef.current.signFlips,
      progressN: hudProgressRef.current.samples,
      edgeDrag: hudProgressRef.current.dragging,
      g: { ...g },
    };
    (window as Window & { __studyA2?: typeof snap; __studyG?: typeof g }).__studyA2 =
      snap;
    (window as Window & { __studyG?: typeof g }).__studyG = g;
    if (!el) return;
    el.textContent = [
      `isTurning=${snap.isTurning ? "true" : "false"}`,
      `flipStart=${snap.flipStart ? Math.round(snap.flipStart) : 0}`,
      `flipEnd=${snap.flipEnd ? Math.round(snap.flipEnd) : 0}`,
      `capture=${snap.capture}`,
      `spread us=${snap.spreadUserSelect} pe=${spread ? getComputedStyle(spread).pointerEvents : ""}`,
      `body us=${snap.bodyUserSelect} pe=${snap.peBody}`,
      `fromPoint=${snap.fromPoint}`,
      `inEdge=${snap.inEdge === 0 ? "no" : snap.inEdge > 0 ? "next" : "prev"}`,
      `selecting=${snap.studySelecting || "0"}`,
      `progress=${snap.progress.toFixed(3)} flips=${snap.signFlips} n=${snap.progressN} drag=${snap.edgeDrag ? 1 : 0}`,
      `G enter/leave=${g.enter}/${g.leave} renderNb/face=${g.renderNb}/${g.renderFace}`,
      `G measure=${g.measure} wEmpty=${g.widthEmpty} ro=${g.ro}`,
      `G turnOn/Off=${g.turnOn}/${g.turnOff} liftOn/Off=${g.liftOn}/${g.liftOff}`,
      `G sheetTfSamples=${g.sheetTfOnSamples} masterUnmount=${g.masterUnmount}`,
      `G hoverEl=${g.hoverEl}`,
      `G liftEl=${g.liftEl}`,
      `G sameEl=${g.hoverEl === g.liftEl ? "yes" : "no"}`,
    ].join("\n");
  }, []);

  useEffect(() => {
    if (!debugOn || !debugHost) return;
    const onMove = (e: PointerEvent) => paintA2Hud(e.clientX, e.clientY);
    window.addEventListener("pointermove", onMove);
    paintA2Hud();
    const id = window.setInterval(() => paintA2Hud(), 200);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.clearInterval(id);
    };
  }, [debugOn, debugHost, paintA2Hud, flip, spreadOn]);

  // G probe는 HUD host와 무관하게 펼침+debug 때 항상 노출
  useEffect(() => {
    if (!debugOn || !spreadOn) return;
    type GWin = Window & {
      __studyGReset?: () => void;
      __studyGProbe?: (ms?: number) => Promise<Record<string, unknown>>;
      __studyG?: typeof gStatsRef.current;
      __studyGReady?: boolean;
    };
    const w = window as GWin;
    const reset = () => {
      const g = gStatsRef.current;
      g.enter = 0;
      g.leave = 0;
      g.renderNb = 0;
      g.renderFace = 0;
      g.measure = 0;
      g.widthEmpty = 0;
      g.ro = 0;
      g.turnOn = 0;
      g.turnOff = 0;
      g.liftOn = 0;
      g.liftOff = 0;
      g.masterUnmount = 0;
      g.sheetTfOnSamples = 0;
      g.lastTurning = !!flipRef.current;
      g.lastLift = false;
    };
    const onEnter = () => {
      gStatsRef.current.enter += 1;
    };
    const onLeave = () => {
      gStatsRef.current.leave += 1;
    };
    const edgeRoot = () =>
      spreadVpRef.current ??
      (document.querySelector(".study-spread.spread") as HTMLElement | null);
    const bindEdges = () => {
      const root = edgeRoot();
      if (!root) return () => {};
      const edges = root.querySelectorAll<HTMLElement>(".study-spread-edge");
      edges.forEach((edge) => {
        edge.addEventListener("pointerenter", onEnter);
        edge.addEventListener("pointerleave", onLeave);
      });
      return () => {
        edges.forEach((edge) => {
          edge.removeEventListener("pointerenter", onEnter);
          edge.removeEventListener("pointerleave", onLeave);
        });
      };
    };
    let unbind = bindEdges();
    let childMo: MutationObserver | null = null;
    const master = edgeRoot()?.querySelector(".study-spread-master");
    if (master) {
      childMo = new MutationObserver((recs) => {
        for (const r of recs) {
          if (r.type === "childList" && r.removedNodes.length > 0) {
            gStatsRef.current.masterUnmount += 1;
          }
        }
      });
      childMo.observe(master, { childList: true });
    }
    w.__studyGReset = reset;
    w.__studyGReady = true;
    w.__studyG = gStatsRef.current;
    w.__studyGProbe = (ms = 10000) =>
      new Promise((resolve) => {
        reset();
        unbind();
        unbind = bindEdges();
        const root = edgeRoot();
        const edge =
          root?.querySelector<HTMLElement>(".study-spread-edge.is-next") ??
          root?.querySelector<HTMLElement>(".study-spread-edge") ??
          null;
        if (!edge || !root) {
          resolve({ ...gStatsRef.current, error: "no-edge" });
          return;
        }
        const box = edge.getBoundingClientRect();
        const x = box.left + box.width * 0.5;
        const y = box.top + box.height * 0.5;
        const step = 1000 / 60;
        let t = 0;
        const sampleLift = () => {
          let sheetLift = false;
          root.querySelectorAll<HTMLElement>(".study-sheet").forEach((sheet) => {
            const tf = getComputedStyle(sheet).transform;
            if (tf && tf !== "none") sheetLift = true;
          });
          const g = gStatsRef.current;
          if (sheetLift !== g.lastLift) {
            if (sheetLift) g.liftOn += 1;
            else g.liftOff += 1;
            g.lastLift = sheetLift;
          }
          if (sheetLift) g.sheetTfOnSamples += 1;
        };
        const tick = () => {
          edge.dispatchEvent(
            new PointerEvent("pointermove", {
              bubbles: true,
              clientX: x,
              clientY: y,
              pointerType: "mouse",
              pointerId: 1,
            }),
          );
          edge.dispatchEvent(
            new MouseEvent("mouseover", {
              bubbles: true,
              clientX: x,
              clientY: y,
            }),
          );
          sampleLift();
          t += step;
          if (t >= ms) {
            // 합성 pointerleave는 리스너를 안 타는 환경이 있어 종료 leave를 직접 반영
            edge.dispatchEvent(
              new PointerEvent("pointerleave", {
                bubbles: true,
                clientX: x,
                clientY: y,
                pointerType: "mouse",
                pointerId: 1,
              }),
            );
            if (gStatsRef.current.enter > gStatsRef.current.leave) {
              gStatsRef.current.leave += 1;
            }
            sampleLift();
            resolve({ ...gStatsRef.current });
            return;
          }
          window.setTimeout(tick, step);
        };
        edge.dispatchEvent(
          new PointerEvent("pointerenter", {
            bubbles: true,
            clientX: x,
            clientY: y,
            pointerType: "mouse",
            pointerId: 1,
          }),
        );
        edge.dispatchEvent(
          new MouseEvent("mouseenter", {
            bubbles: false,
            clientX: x,
            clientY: y,
          }),
        );
        sampleLift();
        window.setTimeout(tick, step);
      });
    return () => {
      unbind();
      childMo?.disconnect();
      if (w.__studyG === gStatsRef.current) {
        delete w.__studyGReset;
        delete w.__studyGProbe;
        delete w.__studyGReady;
      }
    };
  }, [debugOn, spreadOn, spreadIndex, chapter, bookId]);

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
    // 형광펜(measureSel)과 같은 Range 줄 상자. 앵커 getClientRects/getBoundingClientRect 는
    // CSS columns에서 열 밖 펼침 상자를 돌려 메모가 다음 단락 글자 위에 그어진다.
    const baseEl =
      spreadOn && spreadVpRef.current ? spreadVpRef.current : root;
    const base = baseEl.getBoundingClientRect();
    const bodies: HTMLElement[] = visibleStudyBodies(
      spreadOn ? spreadVpRef.current : null,
      root,
    );
    const marks = dataRef.current.marks.filter(
      (m) => m.note || m.id === editingMarkId,
    );
    const items: {
      id: string;
      inkTop: number;
      inkBottom: number;
      start: number;
      colLeft: number;
      colRight: number;
      colTop: number;
      colBottom: number;
      gap: number;
      fontSize: number;
      cardTop: number;
      cardPlace: "below" | "above";
      displayTop: number;
      modeHint: "full" | "dot";
    }[] = [];
    const seen = new Set<string>();
    for (const mark of marks) {
      if (seen.has(mark.id)) continue;
      const lines = collectRangeLineRects(
        bodies,
        { start: mark.start, end: Math.max(mark.end, mark.start + 1) },
        spans,
        base,
        !!spreadVpRef.current,
      );
      if (lines.length === 0) continue;
      const line = lines[0]!;
      const hostBody =
        bodies.find((b) => {
          const a = offsetToDomPoint(b, mark.start, spans, false);
          return !!a;
        }) ?? bodies[0]!;
      // master 본문은 .study-page-view가 없어 clip이 펼침 전체가 됨 → 단(쪽) 폭으로 자름
      const clip = noteColumnClip(hostBody, line.absLeft, line.absRight);
      const ink = startGlyphBox(
        bodies,
        mark.start,
        spans,
        !!spreadVpRef.current,
      );
      const inkTop = ink?.top ?? line.absTop;
      const inkBottom = ink?.bottom ?? line.absBottom;
      const nextInk = nextLineInkTop(
        bodies,
        {
          absBottom: line.absBottom,
          absLeft: line.absLeft,
          absRight: line.absRight,
        },
        clip,
      );
      const gap =
        nextInk != null && nextInk > inkBottom
          ? nextInk - inkBottom
          : Math.max(0, clip.bottom - inkBottom);
      const fontSize =
        gap < NOTE_GAP_MIN
          ? 0
          : Math.max(10, Math.min(NOTE_FONT_MAX, gap * 0.8));
      const modeHint: "full" | "dot" = gap < NOTE_GAP_MIN ? "dot" : "full";
      // 표시: 틈 안에 끼움(윗줄 bottom ~ 아랫줄 top). 겹침 0.
      let displayTopVp = inkBottom + Math.max(0, (gap - fontSize) / 2);
      if (nextInk != null) {
        displayTopVp = Math.min(displayTopVp, nextInk - fontSize);
      }
      displayTopVp = Math.max(inkBottom, displayTopVp);

      // 입력 카드: 선택 줄 바로 아래 떠 있는 카드(틈에 끼우지 않음).
      // 쪽 맨 아래라 카드가 잘리면 선택 위로. 375는 visualViewport로 추가 보정.
      let cardPlace: "below" | "above" = "below";
      let cardTopVp = inkBottom + NOTE_CARD_GAP;
      if (cardTopVp + NOTE_CARD_H > clip.bottom - 8) {
        cardPlace = "above";
        cardTopVp = Math.max(
          clip.top + 8,
          inkTop - NOTE_CARD_H - NOTE_CARD_GAP,
        );
      }

      seen.add(mark.id);
      items.push({
        id: mark.id,
        inkTop: inkTop - base.top,
        inkBottom: inkBottom - base.top,
        start: Math.max(0, line.absLeft - base.left),
        colLeft: clip.left - base.left,
        colRight: clip.right - base.left,
        colTop: clip.top - base.top,
        colBottom: clip.bottom - base.top,
        gap,
        fontSize,
        cardTop: cardTopVp - base.top,
        cardPlace,
        displayTop: displayTopVp - base.top,
        modeHint,
      });
    }
    items.sort((a, b) => a.displayTop - b.displayTop || a.start - b.start);

    const next: Record<string, NotePos> = {};
    let badge = 0;
    let prevId: string | null = null;
    for (const it of items) {
      const colW = Math.max(40, it.colRight - it.colLeft);
      // 표시는 선택 시작에 붙이고, 입력·펼침 카드만 단 안에서 읽기 좋은 폭으로
      let left = Math.max(it.start, it.colLeft);
      let width = Math.max(24, Math.min(it.colRight - left, it.colRight - it.start));
      let openLeft = left;
      let openWidth = width;
      if (openWidth < colW * NOTE_MIN_RATIO) {
        openLeft = it.colLeft;
        openWidth = colW;
      }
      openLeft = Math.max(openLeft, it.colLeft);
      openWidth = Math.max(40, Math.min(openWidth, it.colRight - openLeft));
      const prev = prevId ? next[prevId] : null;
      if (prev && Math.abs(prev.top - it.displayTop) < 10) {
        const room = left - prev.left - 6;
        if (room >= NOTE_MIN_ROOM) {
          prev.width = Math.min(prev.width, room);
        } else {
          badge += 1;
          const shrink = it.start - prev.left - 4;
          if (shrink >= NOTE_MIN_ROOM) prev.width = Math.min(prev.width, shrink);
          next[it.id] = {
            top: it.displayTop,
            left: it.start,
            width: 0,
            openLeft,
            openWidth,
            mode: "badge",
            badge,
            gap: it.gap,
            fontSize: it.fontSize || 14,
            cardTop: it.cardTop,
            cardPlace: it.cardPlace,
          };
          continue;
        }
      }
      next[it.id] = {
        top: it.displayTop,
        left,
        width,
        openLeft,
        openWidth,
        mode: it.modeHint === "dot" ? "dot" : "full",
        gap: it.gap,
        fontSize: it.fontSize || 14,
        cardTop: it.cardTop,
        cardPlace: it.cardPlace,
      };
      prevId = it.id;
    }
    setNotePos(next);
  }, [spreadOn, spans, data.marks, editingMarkId]);

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

  const notePosRef = useRef(notePos);
  notePosRef.current = notePos;

  const placeNoteInputInViewport = useCallback(() => {
    const input = editInputRef.current;
    const id = editingMarkId;
    if (!input || !id) return;
    const pos = notePosRef.current[id];
    if (pos) {
      input.style.position = "absolute";
      input.style.top = `${pos.cardTop}px`;
      input.style.left = `${pos.openLeft}px`;
      input.style.width = `${pos.openWidth}px`;
      input.style.zIndex = "12";
    }
    const r = input.getBoundingClientRect();
    const vv = window.visualViewport;
    const vvTop = vv?.offsetTop ?? 0;
    const limit = vvTop + (vv?.height ?? window.innerHeight) - 12;
    if (r.bottom > limit) {
      const h = r.height || NOTE_CARD_H;
      input.style.position = "fixed";
      input.style.top = `${Math.max(vvTop + 8, limit - h)}px`;
      input.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8))}px`;
      input.style.width = `${Math.max(96, r.width)}px`;
      input.style.zIndex = "80";
    }
  }, [editingMarkId]);

  useLayoutEffect(() => {
    if (!editingMarkId) return;
    placeNoteInputInViewport();
  }, [editingMarkId, notePos, placeNoteInputInViewport]);

  useEffect(() => {
    if (!editingMarkId) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const place = () => placeNoteInputInViewport();
    vv.addEventListener("resize", place);
    vv.addEventListener("scroll", place);
    place();
    return () => {
      vv.removeEventListener("resize", place);
      vv.removeEventListener("scroll", place);
    };
  }, [editingMarkId, placeNoteInputInViewport]);

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
        if (
          !host?.closest(
            ".study-vnum, .study-v-gap, .study-subhead, .study-chapter-title, .study-drop",
          )
        ) {
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
    const bodies: HTMLElement[] = visibleStudyBodies(
      spreadVpRef.current,
      root,
    );
    const rects: SelRect[] = [];
    for (const range of ranges) {
      for (const line of collectRangeLineRects(
        bodies,
        range,
        spans,
        base,
        !!spreadVpRef.current,
      )) {
        rects.push({
          top: line.top,
          left: line.left,
          width: line.width,
          height: line.height,
        });
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
      const baseEl = spreadVpRef.current ?? root;
      const base = baseEl.getBoundingClientRect();
      const bodies: HTMLElement[] = visibleStudyBodies(
        spreadVpRef.current,
        root,
      );
      const clipped = collectRangeLineRects(
        bodies.length ? bodies : [root],
        range,
        spans,
        base,
        !!spreadVpRef.current,
      );
      const first = clipped[0];
      const last = clipped[clipped.length - 1];
      if (first && last) {
        return {
          kind: "selection",
          start: range.start,
          end: range.end,
          ref: verseAtOffset(spans, range.start),
          x: first.absLeft + first.width / 2,
          rt: first.absTop,
          rb: last.absBottom + SEL_HANDLE_SIZE,
        };
      }
      const a = offsetToDomPoint(root, range.start, spans, false);
      const b = offsetToDomPoint(root, range.end, spans, true);
      if (!a || !b) return null;
      const r = document.createRange();
      r.setStart(a.node, a.offset);
      r.setEnd(b.node, b.offset);
      const lines = mergeLineRects(Array.from(r.getClientRects()));
      if (lines.length === 0) return null;
      const f = lines[0];
      const l = lines[lines.length - 1];
      return {
        kind: "selection",
        start: range.start,
        end: range.end,
        ref: verseAtOffset(spans, range.start),
        x: f.left + f.width / 2,
        rt: f.top,
        rb: l.bottom + SEL_HANDLE_SIZE,
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

  /** 마우스 mouseup: 브라우저 Range → 기존 offset + 도구막대(선택 상자 위) */
  const applyNativeMouseSelection = useCallback(
    (e?: Event) => {
      if (!spreadOnRef.current) return;
      const t = (e?.target as HTMLElement | null) ?? null;
      if (
        t?.closest?.(
          ".study-toolbar, .study-sel-handle, .study-ws-root, .study-ws-tab, .study-spread-edge, .study-spread-pager, .study-mark-note-input",
        )
      ) {
        return;
      }
      const root = bodyRef.current;
      if (!root) return;
      const mapped = nativeSelectionToOffsets(root, spansRef.current);
      if (!mapped) return;
      const next = { start: mapped.start, end: mapped.end };
      selRef.current = next;
      setSel(next);
      setExpandedNoteId(null);
      const box = spreadVpRef.current?.getBoundingClientRect();
      const vis = box
        ? mapped.rects.filter((r) => {
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            return (
              cx >= box.left &&
              cx <= box.right &&
              cy >= box.top &&
              cy <= box.bottom
            );
          })
        : mapped.rects;
      const lines = vis.length ? vis : mapped.rects;
      const first = lines[0];
      const last = lines[lines.length - 1];
      if (box && lines.length) {
        const painted = lines.map((r) => ({
          top: r.top - box.top,
          left: r.left - box.left,
          width: r.width,
          height: r.height,
        }));
        selRectsRef.current = painted;
        setSelRects(painted);
      }
      if (first && last) {
        setToolbar({
          kind: "selection",
          start: next.start,
          end: next.end,
          ref: verseAtOffset(spansRef.current, next.start),
          x: first.left + first.width / 2,
          rt: first.top,
          rb: last.bottom + SEL_HANDLE_SIZE,
        });
      } else {
        const tb = selectionToolbarFor(next);
        if (tb) setToolbar(tb);
      }
      /* setSel이 verse span을 다시 그려 네이티브 선택은  anyway 사라짐. 노란 칠을 남긴 뒤 지움 */
      window.getSelection()?.removeAllRanges();
    },
    [selectionToolbarFor],
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

  const selectStemAtPoint = (startX: number, startY: number, fromMouse: boolean) => {
    const off = offsetAtPoint(startX, startY);
    if (off == null) return false;
    const w = wordAt(words, off);
    if (!w) return false;
    if (!fromMouse && isAndroid()) navigator.vibrate?.(10);
    suppressClickRef.current = true;
    setExpandedNoteId(null);
    const eojeol = plainRef.current.slice(w.start, w.end);
    const packText = [nextPack, prevPack]
      .filter(Boolean)
      .map((p) => p!.verses.map((v) => v.t).join(" "))
      .join("\n");
    if (packText) rememberBookText(bookId, packText);
    const corpus =
      bookFullCorpusMap.get(bookId) ??
      bookCorpusMap.get(bookId) ??
      plainRef.current;
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
    window.getSelection()?.removeAllRanges();
    beginDrag("press", first, startX, startY);
    return true;
  };

  const onBodyPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    suppressClickRef.current = false;
    if (editingMarkId) return;
    const t = e.target as HTMLElement;
    if (
      t.closest(
        ".brp-mobile-topbar, .brp-header, [data-no-drawer-swipe], .study-mark-note, .study-mark-note-input, .study-sel-handle",
      )
    )
      return;
    if (spreadOn && spreadVpRef.current) {
      const edge = hitSpreadEdge(
        e.clientX,
        spreadVpRef.current.getBoundingClientRect(),
        pageWRef.current,
      );
      if (edge !== 0) return;
    }
    const startX = e.clientX;
    const startY = e.clientY;
    if (e.pointerType === "mouse") {
      if (spreadOn) {
        /* preventDefault·setPointerCapture 금지. 350ms 안 6px 이상 → 네이티브 끌기 */
        if (pressRef.current) window.clearTimeout(pressRef.current.timer);
        const timer = window.setTimeout(() => {
          const p = pressRef.current;
          pressRef.current = null;
          if (!p) return;
          selectStemAtPoint(startX, startY, true);
        }, LONG_PRESS_MS);
        pressRef.current = {
          timer,
          x: startX,
          y: startY,
          id: e.pointerId,
          kind: "mouse-hold",
        };
        return;
      }
      const off = offsetAtPoint(startX, startY);
      if (off == null) return;
      const max = plainRef.current.length;
      if (max < 1) return;
      const start = Math.max(0, Math.min(max - 1, off));
      const first = { start, end: Math.min(max, start + 1) };
      selRef.current = first;
      setSel(first);
      setExpandedNoteId(null);
      beginDrag("end", first, startX, startY);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
        captureTargetRef.current = e.currentTarget;
        capturePointerIdRef.current = e.pointerId;
      } catch {
        /* ignore */
      }
      return;
    }
    if (pressRef.current) window.clearTimeout(pressRef.current.timer);
    const timer = window.setTimeout(() => {
      pressRef.current = null;
      selectStemAtPoint(startX, startY, false);
    }, LONG_PRESS_MS);
    pressRef.current = {
      timer,
      x: startX,
      y: startY,
      id: e.pointerId,
      kind: "touch",
    };
  };

  const onBodyDoubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!spreadOn) return;
    e.preventDefault();
    selectStemAtPoint(e.clientX, e.clientY, true);
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
        const limit =
          p.kind === "mouse-hold" ? MOUSE_HOLD_MOVE_PX : MOVE_CANCEL_PX;
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) >= limit) {
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
        return;
      }
      const pe = e as PointerEvent | undefined;
      if (pe && pe.pointerType === "touch") return;
      applyNativeMouseSelection(e);
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
  }, [applyNativeMouseSelection]);

  // 끄는 중에만 넘김을 막음. 선택·도구막대가 남아 있으면 넘김이 영구 정지됐음.
  useEffect(() => {
    const on = dragging || magState === "shown";
    if (on) document.documentElement.dataset.studySelecting = "1";
    else delete document.documentElement.dataset.studySelecting;
    return () => {
      delete document.documentElement.dataset.studySelecting;
    };
  }, [dragging, magState]);

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
      if (t?.closest?.(".study-toolbar, .study-sel-handle, .study-ws-root, .study-ws-tab"))
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

  // 도구 막대가 닫히면(버튼 동작 등) 임시 선택도 같이 지움 — 원어 시트가 열려 있는 동안은 유지
  useEffect(() => {
    if (dragging || wsOpen) return;
    if (!toolbar || toolbar.kind !== "selection") {
      if (selRef.current) {
        selRef.current = null;
        setSel(null);
      }
    }
  }, [toolbar, dragging, wsOpen]);

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
        window.setTimeout(() => el.classList.remove("is-flash"), 1500);
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
  useEffect(() => subscribeStudyWsCard(setWsCardOn), []);

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
    loadReaderChapter(bookId, chapter + 1, textLayer)
      .then((ch) => {
        if (cancel) return;
        setNextChTitle(ch.title ?? "");
        setNextPack({
          chapter: chapter + 1,
          title: ch.title ?? "",
          verses: ch.verses ?? [],
        });
      })
      .catch(() => {});
    if (wsLayerOk) void loadChapterWordStudy(bookId, chapter + 1).catch(() => {});
    return () => {
      cancel = true;
    };
  }, [
    spreadOn,
    spreadIndex,
    spreadCount,
    chapter,
    bookId,
    total,
    flip,
    textLayer,
    wsLayerOk,
  ]);

  useEffect(() => {
    if (!spreadOn || chapter <= 1) return;
    if (spreadIndex > 0 && flip?.dir !== -1) return;
    let cancel = false;
    loadReaderChapter(bookId, chapter - 1, textLayer)
      .then((ch) => {
        if (cancel) return;
        setPrevPack({
          chapter: chapter - 1,
          title: ch.title ?? "",
          verses: ch.verses ?? [],
        });
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [spreadOn, spreadIndex, chapter, bookId, flip, textLayer]);

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
        ".brp-mobile-topbar, .brp-header, [data-no-drawer-swipe], .study-spread-edge, .study-spread-pager, .study-toolbar, .study-ws-root, .study-ws-tab, .study-vnum, .study-verse-text, .study-drop, .study-chapter-title, .study-subhead, .study-seg, button, a, input, textarea",
      )
    )
      return;
    const box = e.currentTarget.getBoundingClientRect();
    if (hitSpreadEdge(e.clientX, box, pageWRef.current) !== 0) return;
    setChromeOn((v) => !v);
  };

  const measureSpread = useCallback(() => {
    const vp = spreadVpRef.current;
    const flow =
      (vp?.querySelector("[data-spread-measure]") as HTMLElement | null) ??
      spreadFlowRef.current;
    if (!vp || !flow || !spreadOn) return;
    if (flipRef.current) return;
    if (spreadSwipeRef.current) return;

    gStatsRef.current.measure += 1;

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

    if (!(g.pageW >= 40) || !Number.isFinite(g.pageW)) {
      gStatsRef.current.widthEmpty += 1;
    }

    pageWRef.current = g.pageW;
    setPageW(g.pageW);
    const edgeW = spreadEdgePx(g.pageW);
    vp.style.setProperty("--study-page-w", `${g.pageW}px`);
    vp.style.setProperty("--study-col-w", `${g.colW}px`);
    vp.style.setProperty("--study-col-gap", `${g.colGap}px`);
    vp.style.setProperty("--study-spread-h", `${g.spreadH}px`);
    vp.style.setProperty("--study-spread-gap", `${g.gap}px`);
    vp.style.setProperty("--study-edge-w", `${edgeW}px`);
    setSpreadBoxStyle({
      width: `${g.spreadW}px`,
      height: `${g.spreadH}px`,
      ["--study-spread-w" as string]: `${g.spreadW}px`,
      ["--study-page-w" as string]: `${g.pageW}px`,
      ["--study-col-w" as string]: `${g.colW}px`,
      ["--study-col-gap" as string]: `${g.colGap}px`,
      ["--study-spread-h" as string]: `${g.spreadH}px`,
      ["--study-spread-gap" as string]: `${g.gap}px`,
      ["--study-edge-w" as string]: `${edgeW}px`,
    });

    const paintFlow = (node: HTMLElement) => {
      node.style.minWidth = `${Math.ceil(g.colW)}px`;
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
      const nodes = body.querySelectorAll<HTMLElement>(
        "[data-verse-num], .study-subhead",
      );
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
    // 마지막 쪽 하단이 비면 다음 장을 이어 붙여야 함(짝수 쪽이어도)
    let slack = false;
    if (body && pages >= 1) {
      const flowBox = flow.getBoundingClientRect();
      const flowLeft2 = flowBox.left;
      const lastCol = pages - 1;
      let maxBottom = 0;
      const nodes2 = body.querySelectorAll<HTMLElement>(
        "[data-verse-num], .study-subhead, .study-ch-cont-gap, .study-drop",
      );
      nodes2.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 && r.height < 1) return;
        const col = Math.max(
          0,
          Math.floor((r.left - flowLeft2 - g.padOuter + 1) / pageStride),
        );
        if (col === lastCol) maxBottom = Math.max(maxBottom, r.bottom);
      });
      // 쪽 하단(패딩 제외)까지 ~1.25행 이상 비면 slack
      const usableBottom = flowBox.top + g.spreadH - 36;
      const line = 17 * 2.4; // --study-lh
      if (maxBottom > 0 && usableBottom - maxBottom > line * 1.25) {
        slack = true;
      }
    }
    lastPageSlackRef.current = slack;
    measuredContLenRef.current = contPacksRef.current.length;
    setPageCount(pages);
    setSpreadCount(spreads);
    setSpreadStride(g.spreadStride);
    const prevFlow = vp.querySelector<HTMLElement>("[data-measure-prev]");
    if (prevFlow) {
      const left = prevFlow.getBoundingClientRect().left;
      let maxCol = 0;
      prevFlow
        .querySelectorAll<HTMLElement>("[data-verse-num], .study-subhead")
        .forEach((el) => {
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
    const onRo = () => {
      gStatsRef.current.ro += 1;
      measureSpread();
    };
    const ro = new ResizeObserver(onRo);
    // documentElement RO는 class/hover 부산물에 민감 → 실제 레이아웃 앵커만
    const topbar = document.querySelector(".brp-mobile-topbar");
    const header = document.querySelector(".brp-header");
    const pg = document.querySelector(".study-spread-pager");
    const reader = document.querySelector(".brp-reader");
    const vp = spreadVpRef.current;
    for (const el of [topbar, header, pg, reader, vp]) {
      if (el) ro.observe(el);
    }
    document.fonts?.ready.then(measureSpread).catch(() => {});
    // hover/선택 class 변경으로 재실측하지 않음. 펼침 모드 토글만.
    const mo = new MutationObserver((recs) => {
      for (const r of recs) {
        if (r.type === "attributes" && r.attributeName === "data-study-spread") {
          measureSpread();
          break;
        }
      }
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-study-spread"],
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
  }, [
    spreadOn,
    verses,
    title,
    chapter,
    bookId,
    data.marks.length,
    paraMap,
    headingMap,
    contPacks,
    measureSpread,
  ]);

  const lastContChapter = () => {
    const packs = contPacksRef.current;
    return packs.length > 0 ? packs[packs.length - 1]!.chapter : chapter;
  };

  const spreadBlocked = (dir: 1 | -1) => {
    if (dir < 0) return spreadIndexRef.current <= 0 && chapter <= 1;
    return (
      spreadIndexRef.current >= spreadCountRef.current - 1 &&
      lastContChapter() >= total
    );
  };

  // 양면: 현재 펼침에 보이는 장 → 톱바/URL (흐름 리마운트 없음)
  useEffect(() => {
    if (!spreadOn || !onActiveChapterChange) return;
    const flow = spreadFlowRef.current;
    if (!flow) return;
    const gPad = STUDY_SPREAD_PAD_OUTER;
    const stride = spreadStride > 0 ? spreadStride / 2 : pageW;
    if (!(stride > 0)) return;
    const flowLeft = flow.getBoundingClientRect().left;
    const rightCol = spreadIndex * 2 + 1;
    let active = chapter;
    flow.querySelectorAll<HTMLElement>("[data-cont-ch]").forEach((el) => {
      const ch = Number(el.dataset.contCh);
      if (!Number.isFinite(ch)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 1 && r.height < 1) return;
      const col = Math.max(
        0,
        Math.floor((r.left - flowLeft - gPad + 1) / stride),
      );
      if (col <= rightCol) active = ch;
    });
    onActiveChapterChange(active);
  }, [
    spreadOn,
    spreadIndex,
    pageCount,
    contPacks,
    chapter,
    spreadStride,
    pageW,
    onActiveChapterChange,
  ]);

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
      const ang = from + (to - from) * bezierY(p);
      // CSS transition과 동기 — release 이후 progress 모니터용
      flipAngleRef.current = ang;
      paintShade(ang);
      if (p < 1) flipRafRef.current = requestAnimationFrame(loop);
    };
    flipRafRef.current = requestAnimationFrame(loop);
  };

  const clearFlipWatchdog = () => {
    window.clearTimeout(flipWatchdogRef.current);
    flipWatchdogRef.current = 0;
  };

  const armFlipWatchdog = () => {
    clearFlipWatchdog();
    lastFlipStartRef.current = performance.now();
    flipWatchdogRef.current = window.setTimeout(() => {
      if (!flipRef.current) return;
      logFlip("watchdog 600ms isTurning → leaf 제거·capture 해제");
      window.clearTimeout(flipTimerRef.current);
      flipTimerRef.current = 0;
      const spread = spreadVpRef.current;
      const capId = spreadCaptureIdRef.current;
      const capEl = spreadCaptureElRef.current ?? spread;
      if (capEl && capId != null) releaseSpreadCapture(capEl, capId);
      spreadCaptureIdRef.current = null;
      spreadCaptureElRef.current = null;
      spread?.classList.remove("is-edge-drag");
      hudProgressRef.current.dragging = false;
      spreadSwipeRef.current = null;
      resetSpreadDrag();
      commitFlip(false);
    }, STUDY_SPREAD_FLIP_WATCHDOG_MS);
  };

  const armFlipTimer = (commit: boolean) => {
    window.clearTimeout(flipTimerRef.current);
    const animMs = reducedMotion() ? 200 : STUDY_SPREAD_ANIM_MS;
    const waitMs = animMs + STUDY_SPREAD_SETTLE_PAD_MS;
    flipTimerRef.current = window.setTimeout(() => {
      logFlip(
        `timer fire +${STUDY_SPREAD_SETTLE_PAD_MS}ms te=${flipTeCountRef.current} ae=${flipAeCountRef.current}`,
      );
      commitFlip(commit);
    }, waitMs);
  };

  const commitFlip = (commit: boolean) => {
    window.clearTimeout(flipTimerRef.current);
    flipTimerRef.current = 0;
    clearFlipWatchdog();
    lastFlipEndRef.current = performance.now();
    if (!flipRef.current) return;
    stopShade();
    const dir = flipRef.current?.dir ?? 0;
    const had = !!flipRef.current;
    const spread = spreadVpRef.current;
    spread?.classList.remove("is-fade-turn");
    if (spread) spread.style.opacity = "1";
    const leaf = leafRef.current;
    if (leaf) {
      leaf.style.transition = "none";
      leaf.style.transform = "";
    }
    flipRef.current = null;
    setFlip(null);
    flipAngleRef.current = 0;
    flipBusyRef.current = false;
    logFlip(
      `commit commit=${commit} dir=${dir} had=${had} te=${flipTeCountRef.current} ae=${flipAeCountRef.current} move=${flipMoveCountRef.current} lostCap=${flipLostCapRef.current}`,
    );
    if (!commit || !dir || spreadBlocked(dir)) return;
    clearSelection();
    if (dir > 0 && spreadIndexRef.current >= spreadCountRef.current - 1) {
      const last = lastContChapter();
      if (last < total) {
        delete document.documentElement.dataset.studySpreadEnd;
        if (onMoveChapter) onMoveChapter(last + 1);
        else if (!embedded)
          window.location.assign(`/study/${bookId}/${last + 1}`);
      }
      return;
    }
    if (dir < 0 && spreadIndexRef.current <= 0) {
      if (chapter > 1) {
        document.documentElement.dataset.studySpreadEnd = "1";
        if (onMoveChapter) onMoveChapter(chapter - 1);
        else if (!embedded)
          window.location.assign(`/study/${bookId}/${chapter - 1}`);
      }
      return;
    }
    setSpreadIndex((i) => i + dir);
  };

  const settleFlip = (commit: boolean) => {
    clearFlipWatchdog();
    const leaf = leafRef.current;
    const dir = flipRef.current?.dir ?? 1;
    const animMs = reducedMotion() ? 200 : STUDY_SPREAD_ANIM_MS;
    const waitMs = animMs + STUDY_SPREAD_SETTLE_PAD_MS;
    flipTeCountRef.current = 0;
    flipAeCountRef.current = 0;
    logFlip(
      `settle start commit=${commit} dir=${dir} leaf=${!!leaf} w=${leaf ? Math.round(leaf.offsetWidth) : 0} anim=${animMs} timer=${waitMs}`,
    );
    const onTe = (ev: TransitionEvent) => {
      if (!leaf || ev.target !== leaf) return;
      flipTeCountRef.current += 1;
      logFlip(
        `transitionend prop=${ev.propertyName} te=${flipTeCountRef.current} (타이머로 확정, 이벤트는 기록만)`,
      );
    };
    const onAe = (ev: AnimationEvent) => {
      if (!leaf || ev.target !== leaf) return;
      flipAeCountRef.current += 1;
      logFlip(`animationend name=${ev.animationName} ae=${flipAeCountRef.current}`);
    };
    if (leaf) {
      leaf.addEventListener("transitionend", onTe);
      leaf.addEventListener("animationend", onAe);
    }
    if (reducedMotion()) {
      const spread = spreadVpRef.current;
      spread?.classList.add("is-fade-turn");
      if (spread) {
        spread.style.transition = "opacity 200ms ease";
        spread.style.opacity = "0.45";
      }
      armFlipTimer(commit);
      return;
    }
    if (leaf && leaf.offsetWidth >= 8) {
      const target = commit ? (dir > 0 ? -180 : 180) : 0;
      const from = flipAngleRef.current;
      leaf.style.transition = "none";
      void leaf.offsetWidth;
      leaf.style.transition = `transform ${animMs}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
      leaf.style.transform = `rotateY(${target}deg)`;
      trackShade(from, target);
      armFlipTimer(commit);
      return;
    }
    logFlip("settle no-leaf → 즉시 commit");
    commitFlip(commit);
  };

  /** fromAngle: 끌기 확정 시 놓은 각도에서 이어 commit (progress 0으로 리셋 금지) */
  const goSpreadBy = useCallback(
    (delta: number, fromAngle?: number) => {
      if (dragRef.current) return;
      if (document.documentElement.dataset.studyWsOpen === "1") return;
      if (document.documentElement.dataset.studyNoteOpen === "1") return;
      const dir: 1 | -1 = delta > 0 ? 1 : -1;
      const handoff =
        typeof fromAngle === "number" && Number.isFinite(fromAngle);
      setSpreadNextBookUi(false);
      if (flipRef.current && !handoff) {
        logFlip(`연속입력 dir=${dir} → 현재 잎 즉시 확정 후 새 넘김`);
        window.clearTimeout(flipTimerRef.current);
        flipTimerRef.current = 0;
        flushSync(() => {
          commitFlip(true);
        });
      }
      if (spreadBlocked(dir)) {
        if (handoff && flipRef.current) settleFlip(false);
        return;
      }
      flipBusyRef.current = false;
      const startAngle = handoff ? fromAngle! : 0;
      flipAngleRef.current = startAngle;
      flipPageWRef.current = Math.max(40, pageWRef.current);
      const leaf = leafRef.current;
      if (leaf) {
        leaf.style.transition = "none";
        leaf.style.transform = `rotateY(${startAngle}deg)`;
        paintShade(startAngle);
      }
      const next = { dir, auto: true as const };
      flipRef.current = next;
      lastFlipStartRef.current = performance.now();
      setFlip(next);
      // release 이후 progress 프레임 → sessionStorage (장 이동 후에도 유지)
      const key = "haruchi/flip-progress-frames";
      const startProg = Math.min(1, Math.abs(startAngle) / 180);
      try {
        const prev = JSON.parse(sessionStorage.getItem(key) || "[]");
        prev.push({
          path: location.pathname,
          dir,
          handoff,
          startProg,
          dips: null,
          mono: null,
          pending: true,
          at: Date.now(),
        });
        sessionStorage.setItem(key, JSON.stringify(prev.slice(-40)));
      } catch {
        /* ignore */
      }
      const frames: { t: number; p: number; src: string }[] = [
        { t: performance.now(), p: startProg, src: handoff ? "handoff" : "go" },
      ];
      hudProgressRef.current = {
        v: dir > 0 ? -startProg : startProg,
        signFlips: hudProgressRef.current.signFlips,
        samples: hudProgressRef.current.samples + 1,
        dragging: false,
      };
      let last = startProg;
      let dips = 0;
      let doneClimb = startProg >= 0.98;
      const animMs = reducedMotion() ? 200 : STUDY_SPREAD_ANIM_MS;
      const t0 = performance.now();
      const tick = () => {
        const elapsed = performance.now() - t0;
        const ang = Math.abs(flipAngleRef.current);
        const p = Math.min(1, ang / 180);
        frames.push({ t: performance.now(), p, src: "raf" });
        // commitFlip 직후 0 리셋은 감소로 치지 않음 — 올라가는 구간만 검사
        if (!doneClimb && p + 0.001 < last) dips += 1;
        if (p >= 0.98) doneClimb = true;
        last = Math.max(last, p);
        hudProgressRef.current.v = dir > 0 ? -p : p;
        if (doneClimb || elapsed >= animMs + 80 || !flipRef.current) {
          // fall through to persist
        } else {
          requestAnimationFrame(tick);
          return;
        }
        try {
          const prev = JSON.parse(sessionStorage.getItem(key) || "[]");
          const i = prev.length - 1;
          if (i >= 0 && prev[i]?.pending) {
            prev[i] = {
              path: location.pathname,
              dir,
              handoff,
              startProg,
              dips,
              mono: dips === 0,
              frames: frames.slice(0, 80),
              at: Date.now(),
            };
          } else {
            prev.push({
              path: location.pathname,
              dir,
              handoff,
              startProg,
              dips,
              mono: dips === 0,
              frames: frames.slice(0, 80),
              at: Date.now(),
            });
          }
          sessionStorage.setItem(key, JSON.stringify(prev.slice(-40)));
        } catch {
          /* ignore */
        }
        logFlip(
          `progress-frames start=${startProg.toFixed(3)} dips=${dips} n=${frames.length} handoff=${handoff ? 1 : 0}`,
        );
      };
      requestAnimationFrame(tick);
      // handoff: measureSpread 이후 layout effect에서 각도 복구+settle
      // 일반 화살표: effect settle + 여기 타이머
      if (handoff) {
        skipAutoSettleRef.current = true;
      } else {
        armFlipTimer(true);
      }
      armFlipWatchdog();
    },
    [chapter, total],
  );

  useLayoutEffect(() => {
    if (!flip?.auto) return;
    // 끌기 확정 handoff: 모든 layout(measureSpread 포함) 뒤에 각도 복구+settle
    if (skipAutoSettleRef.current) {
      skipAutoSettleRef.current = false;
      const ang = flipAngleRef.current;
      Promise.resolve().then(() => {
        if (!flipRef.current?.auto) return;
        flipAngleRef.current = ang;
        const leaf = leafRef.current;
        if (leaf) {
          leaf.style.transition = "none";
          leaf.style.transform = `rotateY(${ang}deg)`;
          paintShade(ang);
        }
        settleFlip(true);
      });
      return;
    }
    let cancel = false;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancel) settleFlip(true);
      });
    });
    return () => {
      cancel = true;
      cancelAnimationFrame(id);
    };
    // 끝 타이머는 goSpreadBy/settleFlip의 flipTimerRef. cleanup에서 지우지 않음.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flip]);

    useEffect(() => {
    return () => {
      window.clearTimeout(flipTimerRef.current);
      flipTimerRef.current = 0;
      window.clearTimeout(flipWatchdogRef.current);
      flipWatchdogRef.current = 0;
    };
  }, []);

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
      if (dragRef.current) return;
      e.preventDefault();
      goSpreadBy(e.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [spreadOn, goSpreadBy]);

  useEffect(() => {
    if (!spreadOn) return;
    const el = spreadVpRef.current;
    if (!el) return;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) + 1) return;
      const ds = document.documentElement.dataset;
      if (dragRef.current || ds.studyWsOpen === "1" || ds.studyNoteOpen === "1")
        return;
      e.preventDefault();
      acc += e.deltaX;
      if (Math.abs(acc) < 72) return;
      const dir: 1 | -1 = acc > 0 ? 1 : -1;
      acc = 0;
      goSpreadBy(dir);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [spreadOn, goSpreadBy]);

  const releaseSpreadCapture = (
    el: HTMLElement,
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

  const hitWsRibbon = (x: number, y: number) => {
    const tab = document.querySelector<HTMLElement>(".study-ws-tab.study-ws-ribbon");
    if (!tab) return false;
    const r = tab.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };

  const onSpreadPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!spreadOn) return;
    const ds = document.documentElement.dataset;
    if (dragRef.current) return;
    if (ds.studyWsOpen === "1") return;
    if (ds.studyNoteOpen === "1") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (hitWsRibbon(e.clientX, e.clientY)) return;
    const t = e.target as HTMLElement;
    if (
      t.closest(
        ".brp-mobile-topbar, .brp-header, [data-no-drawer-swipe], .study-toolbar, .study-ws-root, .study-ws-tab, .study-sel-handle, .study-mark-note-input, .study-spread-pager, .study-vnum",
      )
    )
      return;
    if (
      hitSpreadEdge(
        e.clientX,
        e.currentTarget.getBoundingClientRect(),
        pageWRef.current,
      ) === 0
    ) {
      return;
    }
    if (flipRef.current) {
      logFlip("포인터다운 중 잎 있음 → 즉시 확정 후 새 제스처");
      window.clearTimeout(flipTimerRef.current);
      flipTimerRef.current = 0;
      flushSync(() => {
        commitFlip(true);
      });
    }
    flipMoveCountRef.current = 0;
    const now = performance.now();
    const pageW0 = Math.max(1, pageWRef.current);
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
      pageW: pageW0,
      lastProgress: 0,
      signFlips: 0,
    };
    gesture.timer = window.setTimeout(() => {
      const cur = spreadSwipeRef.current;
      if (!cur || cur.id !== gesture.id || cur.mode !== "pending") return;
      if (cur.moved < 8) cur.mode = "hold";
    }, 350);
    spreadSwipeRef.current = gesture;
    hudProgressRef.current = {
      v: 0,
      signFlips: 0,
      samples: 0,
      dragging: true,
    };
    const edgeEl = t.closest(".study-spread-edge") as HTMLElement | null;
    const capEl = edgeEl ?? e.currentTarget;
    try {
      capEl.setPointerCapture(e.pointerId);
      spreadCaptureIdRef.current = e.pointerId;
      spreadCaptureElRef.current = capEl;
    } catch {
      /* ignore */
    }
    e.currentTarget.classList.add("is-edge-drag");
  };

  const onSpreadPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = spreadSwipeRef.current;
    if (!s || s.id !== e.pointerId || s.done) return;
    flipMoveCountRef.current += 1;
    if (s.mode === "hold" || s.mode === "ignore") return;
    const ds = document.documentElement.dataset;
    if (
      dragRef.current ||
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
          flipPageWRef.current = Math.max(40, pageWRef.current);
          const next = { dir: dragDir, auto: false as const };
          flipRef.current = next;
          lastFlipStartRef.current = performance.now();
          setFlip(next);
          armFlipWatchdog();
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
    const width = Math.max(1, s.pageW);
    let progress = dx / width;
    if (active > 0) progress = Math.min(0, progress);
    else progress = Math.max(0, progress);
    if (
      s.lastProgress !== 0 &&
      progress !== 0 &&
      Math.sign(progress) !== Math.sign(s.lastProgress)
    ) {
      s.signFlips += 1;
    }
    s.lastProgress = progress;
    hudProgressRef.current = {
      v: progress,
      signFlips: s.signFlips,
      samples: hudProgressRef.current.samples + 1,
      dragging: true,
    };
    let angle = progress * 180;
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
    const capEl = spreadCaptureElRef.current ?? e.currentTarget;
    releaseSpreadCapture(capEl, e.pointerId);
    spreadCaptureIdRef.current = null;
    spreadCaptureElRef.current = null;
    e.currentTarget.classList.remove("is-edge-drag");
    hudProgressRef.current.dragging = false;
    const wasDrag = s.mode === "drag";
    const dx = e.clientX - s.x;
    const dir: 1 | -1 =
      flipRef.current?.dir ?? (dx < 0 || (dx === 0 && s.vx < 0) ? 1 : -1);
    resetSpreadDrag();
    if (cancel || !wasDrag) {
      logFlip(
        `swipe-end cancel=${cancel} wasDrag=${wasDrag} type=${e.pointerType} moves=${flipMoveCountRef.current} lostCap=${flipLostCapRef.current}`,
      );
      if (flipRef.current) settleFlip(false);
      if (!cancel && s.mode === "pending" && s.moved < 8) {
        const box = e.currentTarget.getBoundingClientRect();
        const edge = hitSpreadEdge(e.clientX, box, pageWRef.current);
        const target = e.target as HTMLElement | null;
        if (edge !== 0 && !target?.closest?.(".study-vnum")) {
          spreadEdgeTapRef.current = performance.now();
          goSpreadBy(edge);
        }
      }
      return;
    }
    suppressClickRef.current = true;
    spreadEdgeTapRef.current = performance.now();
    const width = Math.max(1, s.pageW); // 끌기 시작 때 고정한 쪽 폭
    const dist = Math.abs(dx);
    const flick =
      dir > 0 ? s.vx < -STUDY_SPREAD_COMMIT_VEL : s.vx > STUDY_SPREAD_COMMIT_VEL;
    const far = dist > width * STUDY_SPREAD_COMMIT_DIST; // 0.5
    const blocked = spreadBlocked(dir);
    const commitIntent = !blocked && (far || flick);
    logFlip(
      `swipe-up cancel=${cancel} type=${e.pointerType} dx=${dx.toFixed(1)} dist=${dist.toFixed(1)} w=${width.toFixed(0)} pageW0=${s.pageW.toFixed(0)} flipW=${flipPageWRef.current} far=${far} thr=${(width * STUDY_SPREAD_COMMIT_DIST).toFixed(0)} vx=${s.vx.toFixed(3)} flick=${flick} commitIntent=${commitIntent} blocked=${blocked} → ${commitIntent ? "goSpreadBy" : "settleFlip(0)"} moves=${flipMoveCountRef.current} lostCap=${flipLostCapRef.current}`,
    );
    // 확정은 ‹›/←→ 와 동일 goSpreadBy. 놓은 각도(fromAngle)를 넘겨 progress 리셋 0 방지.
    if (commitIntent) {
      window.clearTimeout(flipTimerRef.current);
      flipTimerRef.current = 0;
      clearFlipWatchdog();
      const fromAngle = flipAngleRef.current;
      logFlip(
        `swipe-handoff dir=${dir} fromAngle=${fromAngle.toFixed(1)} prog=${(
          Math.abs(fromAngle) / 180
        ).toFixed(3)} type=${e.pointerType}`,
      );
      goSpreadBy(dir, fromAngle);
      return;
    }
    settleFlip(false);
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

  const focusNoteInput = () => {
    const input = editInputRef.current;
    if (!input) return;
    placeNoteInputInViewport();
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
      focusNoteInput();
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
    focusNoteInput();
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

  /** 원어 짝 찾기용 본체 — 길게 눌러 고른 어절이면 그 어절 기준으로 뗀다 */
  const selectionStemQuery = (
    start: number,
    end: number,
    text: string,
  ): { stem: string; verbal: boolean } => {
    const t = text.trim();
    if (!t || /\s/.test(t)) return { stem: t, verbal: false };
    const plain = plainRef.current;
    const corpus =
      bookFullCorpusMap.get(bookId) ?? bookCorpusMap.get(bookId) ?? plain;
    const w = wordAt(words, start);
    if (w && start >= w.start && end <= w.end) {
      const local = stemOf(plain.slice(w.start, w.end), corpus);
      const s0 = w.start + local.start;
      const s1 = w.start + local.end;
      if (s1 > s0 && start <= s0 && end >= s1) {
        return {
          stem: plain.slice(s0, s1),
          verbal: VERBAL_TAIL_RE.test(plain.slice(s1, w.end)),
        };
      }
    }
    const local = stemOf(t, corpus);
    const stem = t.slice(local.start, local.end) || t;
    return { stem, verbal: VERBAL_TAIL_RE.test(t.slice(local.end)) };
  };

  const closeWordStudy = () => {
    setWsOpen(false);
    setWsMatchHint(null);
    setWsSidePanel(null);
    const saved = wsRestoreRef.current;
    wsRestoreRef.current = null;
    const cur = selRef.current;
    if (cur && saved?.toolbar?.kind === "selection") {
      setToolbar(selectionToolbarFor(cur) ?? saved.toolbar);
      return;
    }
    if (saved?.toolbar?.kind === "mark" && saved.range) {
      const m = selectionToolbarFor(saved.range);
      setToolbar(
        m
          ? { kind: "mark", markId: saved.toolbar.markId, x: m.x, rt: m.rt, rb: m.rb }
          : saved.toolbar,
      );
    }
  };

  /** ≥769: 책 쪽 위에 위·아래·바깥 14px 띄운 세로 카드 좌표 */
  const measureWsSidePanel = useCallback(
    (forceSide?: "left" | "right"): WsSidePanel | null => {
      if (!wsCardOn) return null;
      const inset = WS_SIDE_INSET;
      const placeOn = (
        page: DOMRect,
        side: "left" | "right",
      ): WsSidePanel => {
        const top = Math.round(page.top + inset);
        const height = Math.round(Math.max(80, page.height - inset * 2));
        if (side === "right") {
          return {
            side,
            top,
            left: Math.round(page.left),
            width: Math.round(Math.max(80, page.width - inset)),
            height,
          };
        }
        return {
          side,
          top,
          left: Math.round(page.left + inset),
          width: Math.round(Math.max(80, page.width - inset)),
          height,
        };
      };
      if (spreadOn) {
        const vp = spreadVpRef.current;
        if (!vp) return null;
        const leftEl = vp.querySelector<HTMLElement>(
          ".study-sheet.is-left:not(.is-under)",
        );
        const rightEl = vp.querySelector<HTMLElement>(
          ".study-sheet.is-right:not(.is-under)",
        );
        if (!leftEl || !rightEl) return null;
        const leftBox = leftEl.getBoundingClientRect();
        const rightBox = rightEl.getBoundingClientRect();
        const midX =
          (leftBox.left + leftBox.right + rightBox.left + rightBox.right) / 4;
        const rects = selRectsRef.current;
        let selMidX = midX;
        if (rects.length > 0) {
          const vpBox = vp.getBoundingClientRect();
          let sx = 0;
          for (const r of rects) sx += vpBox.left + r.left + r.width / 2;
          selMidX = sx / rects.length;
        } else {
          const range = wsRestoreRef.current?.range;
          if (range) {
            const box = selectionToolbarFor(range);
            if (box) selMidX = box.x;
          }
        }
        const selOnLeft = selMidX < midX;
        const side: "left" | "right" =
          forceSide ?? (selOnLeft ? "right" : "left");
        return placeOn(side === "right" ? rightBox : leftBox, side);
      }
      const pageEl =
        bodyRef.current?.closest<HTMLElement>(".study-page") ??
        (typeof document !== "undefined"
          ? document.querySelector<HTMLElement>(".study-page")
          : null);
      if (!pageEl) return null;
      return placeOn(pageEl.getBoundingClientRect(), forceSide ?? "right");
    },
    [spreadOn, wsCardOn, selectionToolbarFor],
  );

  // 스프레드: 세로 패널 좌표 갱신. 한 쪽: 선택 줄이 가리면 본문 스크롤
  const selectionToolbarForRef = useRef(selectionToolbarFor);
  selectionToolbarForRef.current = selectionToolbarFor;
  useLayoutEffect(() => {
    if (!wsOpen) return;
    if (wsCardOn) {
      const hasSel =
        selRectsRef.current.length > 0 || !!wsRestoreRef.current?.range;
      const force = !hasSel ? wsLast?.side : undefined;
      const panel = measureWsSidePanel(force);
      setWsSidePanel(panel);
      if (panel) {
        debugLogRef.current(
          `[원어] 스프레드 세로 패널 side=${panel.side} ${panel.width}×${panel.height}@${panel.left},${panel.top}`,
        );
      }
      return;
    }
    setWsSidePanel(null);
    const range = wsRestoreRef.current?.range;
    if (!range) return;
    const box = selectionToolbarForRef.current(range);
    const sheet = document.querySelector<HTMLElement>(".study-ws-sheet");
    if (!box || !sheet) return;
    const selTop = box.rt;
    const selBottom = box.rb - SEL_HANDLE_SIZE;
    const vh = window.innerHeight;
    const sheetTop = vh - sheet.getBoundingClientRect().height;
    if (selBottom + WS_REVEAL_GAP <= sheetTop) return;
    let chromeBottom = 0;
    for (const s of [".brp-mobile-topbar", ".brp-header"]) {
      const el = document.querySelector<HTMLElement>(s);
      if (!el || getComputedStyle(el).display === "none") continue;
      chromeBottom = Math.max(chromeBottom, el.getBoundingClientRect().bottom);
    }
    const want = selBottom + WS_REVEAL_GAP - sheetTop;
    const room = selTop - chromeBottom - WS_REVEAL_GAP;
    const dy = Math.max(0, Math.min(want, room));
    if (dy > 0) scrollByY(scrollRootOf(bodyRef.current), dy);
    debugLogRef.current(
      `[원어] 선택 줄 보이게 스크롤 ${Math.round(dy)}px (시트 위 ${Math.round(sheetTop)})`,
    );
  }, [wsOpen, wsCardOn, wsLast?.side, measureWsSidePanel, spreadIndex]);

  useEffect(() => {
    setWsLast(loadWsLast());
  }, []);

  useLayoutEffect(() => {
    // 원어 시트 열린 동안에만 리본 숨김 — wsLast 없어도 오른쪽 고정 표시
    if (wsOpen || !wsLayerOk) {
      setWsTabPos(null);
      return;
    }
    const place = () => {
      const hitW = 44;
      const knobH = 44;
      // 책 서랍 원목 손잡이(중앙) 바로 아래 — 글씨 없는 놋쇠 노브
      const belowPull = 64;
      let page: HTMLElement | null = null;
      if (spreadOn) {
        const vp = spreadVpRef.current;
        const rightEl = vp
          ? vp.querySelector<HTMLElement>(
              ".study-sheet.is-right:not(.is-under)",
            )
          : null;
        const leftEl = vp
          ? vp.querySelector<HTMLElement>(
              ".study-sheet.is-left:not(.is-under)",
            )
          : null;
        page = rightEl ?? leftEl ?? null;
      } else {
        page =
          bodyRef.current?.closest<HTMLElement>(".study-page") ??
          document.querySelector<HTMLElement>(".study-page");
      }
      if (page) {
        const box = page.getBoundingClientRect();
        const viewTop = Math.max(box.top, 0);
        const viewBottom = Math.min(box.bottom, window.innerHeight);
        const midY =
          viewBottom > viewTop
            ? (viewTop + viewBottom) / 2
            : box.top + box.height / 2;
        setWsTabPos({
          top: Math.round(midY + belowPull - knobH / 2),
          left: Math.round(
            Math.min(box.right - hitW, window.innerWidth - hitW),
          ),
        });
        return;
      }
      setWsTabPos({
        top: Math.round(window.innerHeight / 2 + belowPull - knobH / 2),
        left: Math.round(window.innerWidth - hitW),
      });
    };
    place();
    const raf = requestAnimationFrame(() => place());
    const retry = window.setTimeout(place, 120);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(retry);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [wsOpen, wsLayerOk, spreadOn, spreadIndex, chromeOn, verses]);

  const openWordStudyFromLast = () => {
    if (!wsLayerOk) return;
    const last = wsLast ?? loadWsLast();
    if (!last) return;
    const verseToks = tokensInVerse(wsTokens, last.ref);
    const hit =
      verseToks.find((t) => t.strong === last.strong) ??
      verseToks.find((t) => t.word === last.word);
    const initial: WordStudyToken = hit ?? {
      ref: last.ref,
      i: 0,
      word: last.word,
      lemma: last.word,
      strong: last.strong,
      pron: "",
      parse: "",
      parseKo: "",
      glossKo: last.glossKo,
    };
    setWsVerse(last.ref);
    setWsInitial(initial);
    setWsSelectedKo(last.glossKo);
    setWsMatched(true);
    setWsMatchHint(null);
    setWsSidePanel(wsCardOn ? measureWsSidePanel(last.side) : null);
    setWsOpen(true);
  };

  const openWordStudyFromToolbar = () => {
    if (!wsLayerOk) {
      debugLog("[원어] krv 외 레이어 — 원어 공부 비활성");
      return;
    }
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
      wsRestoreRef.current = {
        toolbar: tb,
        range: pick ? { start: pick.start, end: pick.end } : null,
      };
      setWsVerse(verse);
      setWsInitial(opts.initial);
      setWsSelectedKo(selectedKo);
      setWsMatched(opts.matched);
      setWsMatchHint(opts.hint);
      setWsSidePanel(wsCardOn ? measureWsSidePanel() : null);
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
    const absStart =
      pick?.start ??
      (tb?.kind === "selection"
        ? tb.start
        : tb?.kind === "mark"
          ? (marksById.get(tb.markId)?.start ?? 0)
          : 0);
    const absEnd = pick?.end ?? absStart + selectedKo.length;
    const sq = selectionStemQuery(absStart, absEnd, selectedKo);
    const verseText = span
      ? plainRef.current.slice(span.start, span.end)
      : "";
    let occurrence = 0;
    if (span && sq.stem) {
      const before = absStart - span.start;
      for (
        let k = verseText.indexOf(sq.stem);
        k >= 0 && k < before;
        k = verseText.indexOf(sq.stem, k + 1)
      ) {
        occurrence += 1;
      }
    }
    const matchOpts = {
      titleShift: wsTitleShift,
      stem: sq.stem,
      verbal: sq.verbal,
      occurrence,
    };
    const finish = (result: GlossMatchResult) => {
      logMatch(result);
      openSheet({
        initial: result.token,
        matched: result.reason === "ok" && !!result.token,
        hint: result.token
          ? null
          : `'${sq.stem || selectedKo}'에 해당하는 원어를 자동으로 찾지 못했어요. 위 단어 중 하나를 눌러 보세요.`,
      });
    };
    const reasonKo: Record<string, string> = {
      ok: "ok",
      "empty-query": "선택 텍스트 비어 있음",
      "no-file": "파일 없음",
      "no-verse": "절 없음",
      split: "split",
      titleShift: "titleShift",
      "match-zero": "매칭 0",
    };
    const logMatch = (result: GlossMatchResult) => {
      if (result.reason !== "ok" || !result.token) {
        debugLog(
          `[원어] 실패 사유=${reasonKo[result.reason] ?? result.reason} verse=${verse} ko="${selectedKo.slice(0, 24)}" stem="${sq.stem}" verbal=${sq.verbal} score=${result.score}${result.tiedStrongs ? ` tied=${result.tiedStrongs.join("/")}` : ""} → 칩 자동 선택 없음`,
        );
      } else {
        const stageKo =
          result.stage === "gloss"
            ? "①glossKo"
            : result.stage === "krv"
              ? "①-2 krvKo"
              : result.stage === "variant"
                ? "①-3 대응표"
                : "②사전";
        debugLog(
          `[원어] match ok stage=${stageKo} stem="${sq.stem}" strong=${result.token.strong || "-"} word=${result.token.word} score=${result.score} → setWsOpen(true)`,
        );
      }
    };

    const first = matchTokenByGlossDetailed(wsTokens, verse, selectedKo, matchOpts);
    if (first.token || first.tiedStrongs || first.reason === "empty-query" || first.reason === "no-verse") {
      finish(first);
      return;
    }
    const seq = wsActionAtRef.current;
    void matchTokenForSelection(wsTokens, verse, selectedKo, matchOpts).then(
      (result) => {
        if (wsActionAtRef.current !== seq) return;
        finish(result);
      },
    );
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

  const chapterHeads = headingsForChapter(headingMap, chapter);
  const paraStarts = mergeParagraphStarts(
    paragraphStartsForChapter(paraMap, chapter),
    [...chapterHeads.keys()],
    spans[0]?.n ?? 1,
  );
  const useParas = !!paraStarts && paraStarts.length > 0;
  const paraGroups: { key: string; startN: number; verses: VerseSpan[] }[] =
    groupByStarts(spans, paraStarts).map((g) => ({
      key: `p-${g.startN}`,
      startN: g.startN,
      verses: g.items,
    }));

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
          <span className="study-v-gap"> </span>
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

  const renderSubhead = (startN: number, heads: Map<number, string>) => {
    if (startN <= 1) return null;
    const text = heads.get(startN);
    if (!text) return null;
    return <h3 className="study-subhead">{text}</h3>;
  };

  const renderCurrentParas = () =>
    useParas
      ? paraGroups.map((g) => (
          <Fragment key={g.key}>
            {renderSubhead(g.startN, chapterHeads)}
            <p className="study-para">
              {g.verses.map((span, i) => renderVerse(span, i === 0))}
            </p>
          </Fragment>
        ))
      : paraGroups[0]?.verses.map((span, i) => renderVerse(span, i === 0));

  /** 양면 연속: 현재 장 뒤에 2줄 띄우고 다음 장 본문 */
  const renderContPacks = () =>
    contPacks.map((pack) => {
      const heads = headingsForChapter(headingMap, pack.chapter);
      const starts = mergeParagraphStarts(
        paragraphStartsForChapter(paraMap, pack.chapter),
        [...heads.keys()],
        pack.verses[0]?.n ?? 1,
      );
      const groups = groupByStarts(pack.verses, starts);
      const dig = String(pack.chapter).length;
      return (
        <div
          key={`cont-${pack.chapter}`}
          className="study-ch-cont"
          data-cont-ch={pack.chapter}
        >
          <div className="study-ch-cont-gap" aria-hidden />
          <span
            className={`study-drop${dig >= 3 ? " is-wide" : ""}`}
            data-cont-ch={pack.chapter}
            aria-hidden
          >
            <span className="study-drop-num">{pack.chapter}</span>
          </span>
          {pack.title ? (
            <span className="study-chapter-title" data-chapter-anchor="">
              <span className="study-chapter-title-ink">{pack.title}</span>
            </span>
          ) : (
            <span data-chapter-anchor="" className="study-ch-cont-anchor" />
          )}
          {starts && starts.length > 0
            ? groups.map((g) => (
                <Fragment key={`cp-${pack.chapter}-${g.startN}`}>
                  {renderSubhead(g.startN, heads)}
                  <p className="study-para">
                    {g.items.map((v, i) => (
                      <span
                        key={v.n}
                        className="study-verse"
                        data-verse-num={v.n}
                        data-cont-ch={pack.chapter}
                      >
                        {i > 0 ? <span className="study-v-gap"> </span> : null}
                        <span className="study-vnum">{v.n}</span>
                        <span className="study-v-gap"> </span>
                        {v.t}
                      </span>
                    ))}
                  </p>
                </Fragment>
              ))
            : pack.verses.map((v, i) => (
                <span
                  key={v.n}
                  className="study-verse"
                  data-verse-num={v.n}
                  data-cont-ch={pack.chapter}
                >
                  {i > 0 ? <span className="study-v-gap"> </span> : null}
                  <span className="study-vnum">{v.n}</span>
                  <span className="study-v-gap"> </span>
                  {v.t}
                </span>
              ))}
        </div>
      );
    });

  const renderMarkNotes = (): ReactNode => {
    const rows = Object.entries(notePos).map(([nid, pos]) => {
      if (editingMarkId === nid) {
        return (
          <input
            key={`edit-${nid}`}
            ref={editInputRef}
            className="study-mark-note-input is-card"
            style={{
              top: pos.cardTop,
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
      const isDot = pos.mode === "dot" && !expanded;
      const style: CSSProperties = expanded
        ? {
            top: pos.cardTop,
            left: pos.openLeft,
            width: pos.openWidth,
            fontSize: NOTE_FONT_MAX,
          }
        : isBadge || isDot
          ? { top: pos.top, left: pos.left, fontSize: Math.min(14, pos.fontSize || 14) }
          : {
              top: pos.top,
              left: pos.left,
              maxWidth: pos.width,
              fontSize: pos.fontSize,
              lineHeight: 1,
              height: pos.fontSize,
            };
      return (
        <span
          key={`note-${nid}`}
          className={[
            "study-mark-note",
            isBadge ? "is-badge" : "",
            isDot ? "is-dot" : "",
            expanded ? "is-open is-card" : "",
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
              flushSync(() => beginNoteEdit(nid));
              focusNoteInput();
              return;
            }
            const el = e.currentTarget as HTMLElement;
            const truncated =
              isBadge ||
              isDot ||
              el.scrollWidth > el.clientWidth + 1;
            if (truncated || isDot) {
              setExpandedNoteId(nid);
              return;
            }
            flushSync(() => beginNoteEdit(nid));
            focusNoteInput();
          }}
        >
          {isBadge
            ? circledNum(pos.badge ?? 1)
            : isDot
              ? "·"
              : mark.note}
        </span>
      );
    });
    if (editingMarkId && !notePos[editingMarkId]) {
      rows.push(
        <input
          key={`edit-pending-${editingMarkId}`}
          ref={editInputRef}
          className="study-mark-note-input is-card"
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
      style={{
        transform: `translate3d(${-local * pageStridePx}px,0,0)`,
        paddingLeft: `${STUDY_SPREAD_PAD_OUTER}px`,
        paddingRight: `${STUDY_SPREAD_PAD_OUTER}px`,
        paddingTop: "32px",
        paddingBottom: "36px",
      }}
    >
      <span
        className={`study-drop${String(pack.chapter).length >= 3 ? " is-wide" : ""}`}
        aria-hidden
      >
        <span className="study-drop-num">{pack.chapter}</span>
      </span>
      {pack.title ? (
        <span className="study-chapter-title">
          <span className="study-chapter-title-ink">{pack.title}</span>
        </span>
      ) : null}
      <div className="study-body">
        {(() => {
          const heads = headingsForChapter(headingMap, pack.chapter);
          const starts = mergeParagraphStarts(
            paragraphStartsForChapter(paraMap, pack.chapter),
            [...heads.keys()],
            pack.verses[0]?.n ?? 1,
          );
          const groups = groupByStarts(pack.verses, starts);
          if (starts && starts.length > 0) {
            return groups.map((g) => (
              <Fragment key={`pp-${pack.chapter}-${g.startN}`}>
                {renderSubhead(g.startN, heads)}
                <p className="study-para">
                  {g.items.map((v, i) => (
                    <span key={v.n} className="study-verse" data-verse-num={v.n}>
                      {i > 0 ? <span className="study-v-gap"> </span> : null}
                      <span className="study-vnum">{v.n}</span>
                      <span className="study-v-gap"> </span>
                      {v.t}
                    </span>
                  ))}
                </p>
              </Fragment>
            ));
          }
          return pack.verses.map((v, i) => (
            <span key={v.n} className="study-verse" data-verse-num={v.n}>
              {i > 0 ? <span className="study-v-gap"> </span> : null}
              <span className="study-vnum">{v.n}</span>
              <span className="study-v-gap"> </span>
              {v.t}
            </span>
          ));
        })()}
      </div>
    </article>
  );

  const renderCurrentFlow = (pageIndex: number, measure: boolean) => (
    <article
      ref={measure ? spreadFlowRef : undefined}
      className="study-page study-spread-flow"
      data-spread-measure={measure ? "" : undefined}
      data-study-chapter-inner={chapter}
      style={{
        transform: `translate3d(${-pageIndex * pageStridePx}px,0,0)`,
        paddingLeft: `${STUDY_SPREAD_PAD_OUTER}px`,
        paddingRight: `${STUDY_SPREAD_PAD_OUTER}px`,
        paddingTop: "32px",
        paddingBottom: "36px",
      }}
    >
      <span
        className={`study-drop${digLen >= 3 ? " is-wide" : ""}`}
        data-digits={digLen}
        data-cont-ch={chapter}
        data-chapter-anchor={title ? undefined : ""}
        aria-hidden="true"
      >
        <span className="study-drop-num">{chapter}</span>
      </span>
      {title ? (
        <span className="study-chapter-title" data-chapter-anchor="">
          <span className="study-chapter-title-ink">{title}</span>
        </span>
      ) : null}
      <div
        ref={measure ? bodyRef : undefined}
        className={`study-body${dragging ? " is-selecting" : ""}`}
        onPointerDown={onBodyPointerDown}
        onDoubleClick={onBodyDoubleClick}
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
        {renderCurrentParas()}
        {renderContPacks()}
      </div>
    </article>
  );

  const renderFace = (pageIndex: number, measure: boolean) => {
    if (debugOn) gStatsRef.current.renderFace += 1;
    const faceW = flip ? flipPageWRef.current : pageW;
    if (faceW < 40) return <div className="study-page-view" />;
    let inner: ReactNode = null;
    if (pageIndex >= 0 && pageIndex < pageCount) {
      inner = renderCurrentFlow(pageIndex, measure);
    } else if (pageIndex >= pageCount) {
      const over = pageIndex - pageCount;
      const oddBlank = pageCount % 2 === 1;
      const lastInFlow =
        contPacks.length > 0
          ? contPacks[contPacks.length - 1]!.chapter
          : chapter;
      if (oddBlank && over === 0) {
        // 연속 채움 중·가능하면 빈 카드 대신 잠깐 공백(다음 장 붙이면 메워짐)
        if (lastInFlow < total) {
          inner = <div className="study-page-blank" />;
        } else {
          inner = <div className="study-page-blank" />;
        }
      } else if (nextPack && lastInFlow >= total) {
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
  const showNextCard =
    spreadOn && blankRight && lastContChapter() >= total && chapter < total;
  const spreadProgress =
    pageCount > 0 ? Math.min(pageCount, rightPageNum) / pageCount : 0;
  const liftOp = spreadDragging
    ? 0.04 * (1 - Math.abs(2 * spreadPull - 1))
    : 0;
  if (debugOn) gStatsRef.current.renderNb += 1;
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
            <>
              <div className="study-debug-log" aria-live="polite">
                {debugLines.length === 0
                  ? "debug=1 — 원어 로그 대기"
                  : debugLines.join("\n")}
              </div>
              <pre ref={hudRef} className="study-debug-hud" />
            </>,
            document.body,
          )
        : null}
      {!embedded ? (
        <>
          <div className="study-top">
            <Link href="/bible-reading" className="study-top-back">
              ← 읽기
            </Link>
            <div className="study-top-row">
              <button
                type="button"
                className="study-book-title study-loc-trigger"
                aria-label={`${bookMeta.name} ${chapter}장 — 책·장 선택`}
                onClick={() => {
                  const ds = document.documentElement.dataset;
                  if (
                    ds.studySelecting === "1" ||
                    ds.studyWsOpen === "1" ||
                    ds.studyNoteOpen === "1"
                  )
                    return;
                  openStudyLoc();
                }}
              >
                {bookMeta.name}
              </button>
              <button
                type="button"
                className="study-top-count study-loc-trigger"
                aria-label={`${chapter} / ${total} — 책·장 선택`}
                onClick={() => {
                  const ds = document.documentElement.dataset;
                  if (
                    ds.studySelecting === "1" ||
                    ds.studyWsOpen === "1" ||
                    ds.studyNoteOpen === "1"
                  )
                    return;
                  openStudyLoc();
                }}
              >
                {chapter} / {total}
              </button>
            </div>
          </div>
          {/* study-top 밖: 스프레드에서 top display:none 이어도 서랍 호스트 유지 */}
          <StudyLocHost bookId={bookId} chapter={chapter} />
        </>
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
              onPointerUp={(e) => {
                logFlip(
                  `pointerup type=${e.pointerType} moves=${flipMoveCountRef.current}`,
                );
                finishSpreadSwipe(e, false);
              }}
              onPointerLeave={() => {
                /* 끌기 중 leave/out 무시. 끝은 up/cancel/lostcapture만 */
              }}
              onPointerOut={() => {}}
              onPointerCancel={(e) => {
                logFlip(
                  `pointercancel type=${e.pointerType} moves=${flipMoveCountRef.current}`,
                );
                finishSpreadSwipe(e, true);
              }}
              onLostPointerCapture={(e) => {
                flipLostCapRef.current += 1;
                logFlip(
                  `lostpointercapture type=${e.pointerType} pid=${e.pointerId} moves=${flipMoveCountRef.current} → 취소 아님, pointerup로 커밋 판정`,
                );
                finishSpreadSwipe(e, false);
              }}
              onClick={toggleChrome}
            >
              {prevPack && spreadIndex === 0 && !flip ? (
                <div className="study-spread-measure" aria-hidden>
                  {renderPlainFlow(prevPack, 0, true)}
                </div>
              ) : null}
              {flip?.dir === -1 ? (
                <div
                  className="study-sheet is-left is-under"
                  style={{
                    width: `${flipPageWRef.current}px`,
                    minWidth: `${flipPageWRef.current}px`,
                  }}
                >
                  {renderFace(leftPage - 2, false)}
                  <div ref={leafCastRef} className="study-leaf-cast" />
                </div>
              ) : (
                <div className="study-sheet is-left" />
              )}
              {flip?.dir === 1 ? (
                <div
                  className="study-sheet is-right is-under"
                  style={{
                    width: `${flipPageWRef.current}px`,
                    minWidth: `${flipPageWRef.current}px`,
                  }}
                >
                  {renderFace(leftPage + 3, false)}
                  <div ref={leafCastRef} className="study-leaf-cast" />
                </div>
              ) : rightPageNum > pageCount ? (
                <div className="study-sheet is-right">
                  {renderFace(leftPage + 1, false)}
                </div>
              ) : (
                <div className="study-sheet is-right" />
              )}
              <div
                className={`study-spread-master${
                  flip?.dir === 1
                    ? " is-clip-left"
                    : flip?.dir === -1
                      ? " is-clip-right"
                      : ""
                }`}
                style={
                  flip
                    ? ({
                        ["--study-page-w" as string]: `${flipPageWRef.current}px`,
                      } as CSSProperties)
                    : undefined
                }
              >
                {(flip ? flipPageWRef.current : pageW) >= 40
                  ? renderCurrentFlow(leftPage, true)
                  : null}
              </div>
              {flip ? (
                <div
                  ref={leafRef}
                  className={`study-leaf is-hot ${flip.dir === 1 ? "is-next" : "is-prev"}`}
                  style={{
                    width: `${flipPageWRef.current}px`,
                    minWidth: `${flipPageWRef.current}px`,
                  }}
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
                  {selRects.length > 0 && !wsOpen ? (
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
              {!embedded ? (
                <button
                  type="button"
                  className="study-spread-runhead is-left study-loc-trigger"
                  aria-label={`${bookMeta.name} — 책·장 선택`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const ds = document.documentElement.dataset;
                    if (
                      ds.studySelecting === "1" ||
                      ds.studyWsOpen === "1" ||
                      ds.studyNoteOpen === "1"
                    )
                      return;
                    openStudyLoc();
                  }}
                >
                  {bookMeta.name}
                </button>
              ) : (
                <div className="study-spread-runhead is-left" aria-hidden>
                  {bookMeta.name}
                </div>
              )}
              {!embedded ? (
                <button
                  type="button"
                  className="study-spread-runhead is-right study-loc-trigger"
                  aria-label={`${chapter}${bookId === "psalms" ? "편" : "장"} — 책·장 선택`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const ds = document.documentElement.dataset;
                    if (
                      ds.studySelecting === "1" ||
                      ds.studyWsOpen === "1" ||
                      ds.studyNoteOpen === "1"
                    )
                      return;
                    openStudyLoc();
                  }}
                >
                  {chapter}
                  {bookId === "psalms" ? "편" : "장"}
                </button>
              ) : (
                <div className="study-spread-runhead is-right" aria-hidden>
                  {chapter}
                  {bookId === "psalms" ? "편" : "장"}
                </div>
              )}
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
                style={{ width: `${spreadEdgePx(pageW)}px` }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (hitWsRibbon(e.clientX, e.clientY)) return;
                  if (performance.now() - spreadEdgeTapRef.current < 450) return;
                  goSpreadBy(-1);
                }}
              >
                <span className="study-spread-edge-hint" aria-hidden />
                <span className="study-spread-turn" aria-hidden>
                  ‹
                </span>
              </button>
              <button
                type="button"
                className="study-spread-edge is-next"
                aria-label="다음 쪽"
                style={{ width: `${spreadEdgePx(pageW)}px` }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (hitWsRibbon(e.clientX, e.clientY)) return;
                  if (performance.now() - spreadEdgeTapRef.current < 450) return;
                  goSpreadBy(1);
                }}
              >
                <span className="study-spread-edge-hint" aria-hidden />
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
                <span className="study-chapter-title-ink">{title}</span>
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
              {renderCurrentParas()}
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
                {selRects.length > 0 && !wsOpen ? (
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
        verseKo={spans.find((s) => s.n === wsVerse)?.text ?? ""}
        verseOrig={tokensInVerse(wsTokens, wsVerse)
          .map((t) => t.word)
          .filter(Boolean)
          .join(" ")}
        sidePanel={wsSidePanel}
        onLastChange={(row) => {
          saveWsLast(row);
          setWsLast(row);
        }}
        onClose={closeWordStudy}
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

      {!wsOpen && wsLayerOk && typeof document !== "undefined"
        ? createPortal(
            <button
              type="button"
              className={`study-ws-tab study-ws-ribbon${
                wsTabPos ? "" : " is-dock-right"
              }`}
              style={
                wsTabPos
                  ? { top: wsTabPos.top, left: wsTabPos.left }
                  : undefined
              }
              data-no-drawer-swipe=""
              aria-label="원어 사전 열기"
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (wsLast) openWordStudyFromLast();
                else openWordStudyFromToolbar();
              }}
            >
              <span className="study-ws-ribbon-knob" aria-hidden />
            </button>,
            document.body,
          )
        : null}

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
          ".study-vnum, .study-subhead, .study-mark-note, .study-mark-note-input",
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

/**
 * 형광펜·메모 공통: Range.getClientRects 를 줄마다 합친 상자.
 * 요소 getClientRects/getBoundingClientRect 는 CSS columns 펼침 상자라 쓰지 않음.
 */
function collectRangeLineRects(
  bodies: HTMLElement[],
  range: { start: number; end: number },
  spans: VerseSpan[],
  base: DOMRect,
  clipToPage: boolean,
): {
  top: number;
  left: number;
  width: number;
  height: number;
  absTop: number;
  absBottom: number;
  absLeft: number;
  absRight: number;
  clip: DOMRect;
}[] {
  const out: {
    top: number;
    left: number;
    width: number;
    height: number;
    absTop: number;
    absBottom: number;
    absLeft: number;
    absRight: number;
    clip: DOMRect;
  }[] = [];
  for (const body of bodies) {
    const clip =
      (body.closest(".study-page-view") as HTMLElement | null) ??
      (body.closest(".study-spread") as HTMLElement | null) ??
      body;
    const clipBox = clip.getBoundingClientRect();
    const a = offsetToDomPoint(body, range.start, spans, false);
    const b = offsetToDomPoint(body, range.end, spans, true);
    if (!a || !b) continue;
    const dom = document.createRange();
    try {
      dom.setStart(a.node, a.offset);
      dom.setEnd(b.node, b.offset);
    } catch {
      continue;
    }
    for (const r of mergeLineRects(Array.from(dom.getClientRects()))) {
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (clipToPage) {
        if (
          cx < clipBox.left ||
          cx > clipBox.right ||
          cy < clipBox.top ||
          cy > clipBox.bottom
        ) {
          continue;
        }
      }
      out.push({
        top: r.top - base.top,
        left: r.left - base.left,
        width: r.width,
        height: r.height,
        absTop: r.top,
        absBottom: r.bottom,
        absLeft: r.left,
        absRight: r.right,
        clip: clipBox,
      });
    }
  }
  return out;
}

/** 선택 시작 글자의 실제 상자(형광펜과 같은 Range). */
function startGlyphBox(
  bodies: HTMLElement[],
  start: number,
  spans: VerseSpan[],
  clipToPage: boolean,
): DOMRect | null {
  const lines = collectRangeLineRects(
    bodies,
    { start, end: start + 1 },
    spans,
    new DOMRect(0, 0, 0, 0),
    clipToPage,
  );
  const l = lines[0];
  if (!l) return null;
  return new DOMRect(l.absLeft, l.absTop, l.width, l.absBottom - l.absTop);
}

/**
 * 메모·입력 폭 제한용: 줄이 속한 단(쪽) 상자.
 * master 본문은 .study-page-view가 없어 closest(.study-spread)면 펼침 전체가 되므로
 * --study-col-w / --study-col-gap 으로 열을 계산한다.
 */
function noteColumnClip(
  body: HTMLElement,
  absLeft: number,
  absRight: number,
): DOMRect {
  const pageView = body.closest(".study-page-view") as HTMLElement | null;
  if (pageView) return pageView.getBoundingClientRect();

  const spread = body.closest(".study-spread") as HTMLElement | null;
  const flow =
    (body.closest(".study-spread-flow") as HTMLElement | null) ??
    (body.closest(".study-page") as HTMLElement | null) ??
    body;
  if (!spread) {
    const b = (flow ?? body).getBoundingClientRect();
    return b;
  }
  const cs = getComputedStyle(spread);
  const colW =
    parseFloat(cs.getPropertyValue("--study-col-w")) ||
    Math.max(60, body.getBoundingClientRect().width);
  const colGap = parseFloat(cs.getPropertyValue("--study-col-gap")) || 112;
  const padOuter = STUDY_SPREAD_PAD_OUTER;
  const flowBox = flow.getBoundingClientRect();
  const spreadBox = spread.getBoundingClientRect();
  const contentLeft = flowBox.left + padOuter;
  const mid = (absLeft + absRight) / 2;
  const x = mid - contentLeft;
  const stride = Math.max(1, colW + colGap);
  const col = Math.max(0, Math.floor((x + 1) / stride));
  const left = contentLeft + col * stride;
  return new DOMRect(left, spreadBox.top, colW, spreadBox.height);
}

/** 같은 단에서 이 줄 아래에 있는 다음 글자 상단 */
function nextLineInkTop(
  bodies: HTMLElement[],
  line: { absBottom: number; absLeft: number; absRight: number },
  clip: DOMRect,
): number | null {
  let best = Infinity;
  for (const body of bodies) {
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const t = n as Text;
      if (
        t.parentElement?.closest(
          ".study-vnum, .study-subhead, .study-mark-note, .study-mark-note-input",
        )
      ) {
        continue;
      }
      const text = t.data;
      for (let i = 0; i < text.length; i += 1) {
        if (!/[가-힣A-Za-zΑ-ωἀ-῾]/.test(text[i]!)) continue;
        const rng = document.createRange();
        rng.setStart(t, i);
        rng.setEnd(t, i + 1);
        const r = rng.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const cx = r.left + r.width / 2;
        if (cx < clip.left - 1 || cx > clip.right + 1) continue;
        // 같은 줄(세로 겹침)은 건너뛰고 아래 줄만
        if (r.top < line.absBottom - 1) continue;
        if (r.top < best) best = r.top;
        break;
      }
    }
  }
  return Number.isFinite(best) ? best : null;
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
      if (t.parentElement?.closest(".study-vnum, .study-subhead, .study-mark-note, .study-mark-note-input")) {
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

function visibleStudyBodies(
  spread: HTMLElement | null,
  root: HTMLElement,
): HTMLElement[] {
  if (!spread) return [root];
  const found: HTMLElement[] = [];
  const master = spread.querySelector<HTMLElement>(
    ".study-spread-master .study-body",
  );
  if (master && !master.closest(".study-spread-measure")) found.push(master);
  spread.querySelectorAll<HTMLElement>(".study-page-view .study-body").forEach((body) => {
    if (body.closest(".is-covered, .study-spread-measure, .study-leaf")) return;
    if (!found.includes(body)) found.push(body);
  });
  return found.length ? found : [root];
}

/** 브라우저 기본 선택 Range → 장 평문 offset. 드롭캡·장 제목은 제외. */
function nativeSelectionToOffsets(
  root: HTMLElement,
  spans: VerseSpan[],
): { start: number; end: number; rects: DOMRect[] } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount < 1 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const hostEl =
    range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
  const hostBody = hostEl?.closest(".study-body") as HTMLElement | null;
  const scanRoot =
    hostBody &&
    !hostBody.closest(".study-spread-measure, .is-covered, .study-leaf")
      ? hostBody
      : root;
  const blocked = (n: Node | null) =>
    !!(n &&
      (n instanceof Element ? n : n.parentElement)?.closest(
        ".study-drop, .study-drop-num, .study-chapter-title, .study-chapter-title-ink, .study-subhead, .study-vnum",
      ));
  let startNode: Node | null = range.startContainer;
  let startOff = range.startOffset;
  let endNode: Node | null = range.endContainer;
  let endOff = range.endOffset;
  if (!closestVerseText(startNode, scanRoot) || blocked(startNode)) {
    startNode = null;
    for (const node of verseTextNodes(scanRoot)) {
      if (!range.intersectsNode(node) || blocked(node)) continue;
      startNode = node;
      startOff = node === range.startContainer ? range.startOffset : 0;
      break;
    }
  }
  if (!closestVerseText(endNode, scanRoot) || blocked(endNode)) {
    endNode = null;
    const nodes = verseTextNodes(scanRoot);
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const node = nodes[i]!;
      if (!range.intersectsNode(node) || blocked(node)) continue;
      endNode = node;
      endOff = node === range.endContainer ? range.endOffset : node.length;
      break;
    }
  }
  if (!startNode || !endNode) return null;
  const start = domPointToOffset(scanRoot, startNode, startOff, spans);
  const end = domPointToOffset(scanRoot, endNode, endOff, spans);
  if (start == null || end == null || end <= start) return null;
  const blockedBoxes = [
    ...scanRoot.querySelectorAll(
      ".study-subhead, .study-chapter-title, .study-drop",
    ),
  ].map((el) => (el as HTMLElement).getBoundingClientRect());
  const raw = Array.from(range.getClientRects()).filter((r) => {
    if (r.width <= 1 || r.height <= 1) return false;
    return !blockedBoxes.some(
      (b) =>
        r.top < b.bottom &&
        r.bottom > b.top &&
        r.left < b.right &&
        r.right > b.left,
    );
  });
  const rects = mergeLineRects(raw);
  return { start, end, rects };
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
