"use client";

/**
 * GreekChapterV2 — "헬라어 보기" 새 구조 (4복음서 공통).
 *
 * 화면 구조 (절마다):
 *   1) 머리 줄(같은 행): 좌측에 절 번호, 우측 끝에 작은 ▾ 아이콘.
 *      ▾ 가 비어있는 한 줄을 차지하지 않도록 머리 줄에는 단어가 들어가지
 *      않으므로, 헬라어 단어 블록의 첫 줄을 그대로 같은 행에서 시작한다.
 *   2) 헬라어 단어 블록 (3줄 세로): 헬라어 / 한글 발음 / 한 단어 뜻.
 *      블록 단위로 가로 나열 + 자동 줄바꿈 (블록은 절대 쪼개지지 않음).
 *      반응형: 폰 3~4개, 태블릿 5~6개, PC 7~8+개.
 *   3) 단어 블록 클릭 → 그 단어 아래에 상세 카드(사전형/품사/파싱/뜻/노트).
 *   4) ▾ 누르면 한글 의역이 절 "맨 아래" 에 펼쳐진다(단어/상세 다음).
 *
 * 색 규칙(일정):
 *   - 헬라어 본문 줄 : 모든 단어 같은 색(잉크). 예외 없음.
 *   - 발음 줄        : 모든 단어 같은 차분한 톤(슬레이트 블루).
 *   - 뜻 줄          : 모든 단어 같은 차분한 톤(포레스트 그린 옅게).
 *   - 인명/지명 강조 : 헬라어 줄에는 색을 입히지 않는다. 뜻 줄에만 진한
 *                      accent + 굵기로 강조한다. (단어 간 색 일관성 유지).
 *
 * 복사:
 *   - 평소엔 절별 복사 버튼이 보이지 않는다. 절 영역을 길게 누르면(모바일
 *     long press / PC 우클릭 또는 길게 클릭) 복사 메뉴(헬라어만/한글만/
 *     헬라어+한글) 가 뜬다. 한 줄짜리 깔끔한 문장으로 클립보드에 복사된다.
 *   - 장 전체는 헤더의 [장 전체 복사] 버튼으로.
 *
 * 데이터:
 *   - `bookId` 에 따라 `<book>-v2.json` 을 lazy import 한다.
 *   - 각 파일은 수 MB 라서, 컴포넌트 자체도 page.tsx 에서 next/dynamic
 *     (ssr:false) 로 lazy-load 한다. 책을 바꾸면 새 파일을 fetch.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

// 책별 v2 데이터를 동적 import — 페이지가 그 책의 헬라어 모드에 진입할 때
// 만 chunk 가 전송된다.
type GospelId =
  | "matthew"
  | "mark"
  | "luke"
  | "john"
  | "acts"
  | "romans"
  | "corinthians1"
  | "corinthians2"
  | "galatians"
  | "ephesians"
  | "philippians"
  | "colossians"
  | "thessalonians1"
  | "thessalonians2"
  | "timothy1"
  | "timothy2"
  | "titus"
  | "philemon"
  | "hebrews"
  | "james"
  | "peter1"
  | "peter2"
  | "john1"
  | "john2"
  | "john3"
  | "jude"
  | "revelation";

async function loadGospelData(book: GospelId): Promise<V2Data> {
  switch (book) {
    case "matthew":
      return (await import("../matthew-v2.json")).default as V2Data;
    case "mark":
      return (await import("../mark-v2.json")).default as V2Data;
    case "luke":
      return (await import("../luke-v2.json")).default as V2Data;
    case "john":
      return (await import("../john-v2.json")).default as V2Data;
    case "acts":
      return (await import("../acts-v2.json")).default as V2Data;
    case "romans":
      return (await import("../romans-v2.json")).default as V2Data;
    case "corinthians1":
      return (await import("../corinthians1-v2.json")).default as V2Data;
    case "corinthians2":
      return (await import("../corinthians2-v2.json")).default as V2Data;
    case "galatians":
      return (await import("../galatians-v2.json")).default as V2Data;
    case "ephesians":
      return (await import("../ephesians-v2.json")).default as V2Data;
    case "philippians":
      return (await import("../philippians-v2.json")).default as V2Data;
    case "colossians":
      return (await import("../colossians-v2.json")).default as V2Data;
    case "thessalonians1":
      return (await import("../thessalonians1-v2.json")).default as V2Data;
    case "thessalonians2":
      return (await import("../thessalonians2-v2.json")).default as V2Data;
    case "timothy1":
      return (await import("../timothy1-v2.json")).default as V2Data;
    case "timothy2":
      return (await import("../timothy2-v2.json")).default as V2Data;
    case "titus":
      return (await import("../titus-v2.json")).default as V2Data;
    case "philemon":
      return (await import("../philemon-v2.json")).default as V2Data;
    case "hebrews":
      return (await import("../hebrews-v2.json")).default as V2Data;
    case "james":
      return (await import("../james-v2.json")).default as V2Data;
    case "peter1":
      return (await import("../peter1-v2.json")).default as V2Data;
    case "peter2":
      return (await import("../peter2-v2.json")).default as V2Data;
    case "john1":
      return (await import("../john1-v2.json")).default as V2Data;
    case "john2":
      return (await import("../john2-v2.json")).default as V2Data;
    case "john3":
      return (await import("../john3-v2.json")).default as V2Data;
    case "jude":
      return (await import("../jude-v2.json")).default as V2Data;
    case "revelation":
      return (await import("../revelation-v2.json")).default as V2Data;
  }
}

type V2Token = {
  w: string;
  p: string;
  gloss: string;
  lemma: string;
  lemmaP: string;
  pos: string;
  posLabel: string;
  parse: string;
  parseLabel: string;
  parseLabelLong: string;
  meanings: string[];
  nameType: "person" | "place" | null;
  note: string;
};

type V2Verse = {
  n: number;
  copyGreek: string;
  copyKr: string;
  tokens: V2Token[];
};

type V2Chapter = {
  chapter: number;
  verses: V2Verse[];
};

type V2Data = {
  meta: {
    book: string;
    sources: { sblgnt: string; morphgnt: string; kr: string };
  };
  chapters: V2Chapter[];
};

type CopyMode = "greek" | "kr" | "both";
// 복사 대상 — 장 전체, 절 한 줄, 또는 단어 한 개.
//   verseN = "chapter"               → 장 전체
//   verseN = number, tokenIdx = undefined → 그 절 한 줄
//   verseN = number, tokenIdx = number    → 그 절의 그 단어 하나
type CopyTarget = {
  verseN: number | "chapter";
  tokenIdx?: number;
  point: { x: number; y: number };
} | null;

const COPY_MODE_LABEL: Record<CopyMode, string> = {
  greek: "헬라어만",
  kr: "한글만",
  both: "헬라어+한글",
};

// 길게 누르기 임계 — 500ms, 손가락 이동 허용 10px.
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOL = 10;
// 길게 누름이 발동된 직후 600ms 동안은 token click 등 follow-up click 무시.
const SUPPRESS_CLICK_MS = 600;

function buildCopyText(
  mode: CopyMode,
  verses: V2Verse[],
  header?: string,
): string {
  const lines: string[] = [];
  if (header && header.trim()) lines.push(header.trim(), "");
  for (const v of verses) {
    if (mode === "greek") {
      lines.push(`${v.n} ${v.copyGreek}`);
    } else if (mode === "kr") {
      lines.push(`${v.n} ${v.copyKr}`);
    } else {
      lines.push(`${v.n} ${v.copyGreek}`);
      lines.push(`   ${v.copyKr}`);
    }
  }
  return lines.join("\n");
}

// 단어 한 개에 대한 복사 텍스트. 발음·뜻이 비어 있으면 그 항목은 생략.
function buildTokenCopyText(mode: CopyMode, tk: V2Token): string {
  const ko: string[] = [];
  if (tk.p) ko.push(tk.p);
  if (tk.gloss) ko.push(tk.gloss);
  const koStr = ko.join(" · ");
  if (mode === "greek") return tk.w;
  if (mode === "kr") return koStr || tk.w;
  // both
  return koStr ? `${tk.w} — ${koStr}` : tk.w;
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

type CopyMenuProps = {
  point: { x: number; y: number } | null;
  onPick: (mode: CopyMode) => void;
  onClose: () => void;
};

function CopyMenu({ point, onPick, onClose }: CopyMenuProps) {
  // 화면 좌표로 떠 있는 작은 메뉴 + 바깥 클릭/ESC 시 닫힘.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && el.closest('[data-greek-copy-menu="true"]')) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick, true);
    };
  }, [onClose]);

  if (!point) return null;
  // 메뉴 크기 가정: ~150 x ~130. 화면 가장자리 클램프.
  const top = Math.min(
    window.innerHeight - 140,
    Math.max(8, point.y + 6),
  );
  const left = Math.min(
    window.innerWidth - 160,
    Math.max(8, point.x - 70),
  );
  return (
    <div
      className="brp-g2-copy-menu"
      data-greek-copy-menu="true"
      style={{ top, left }}
      role="menu"
      aria-label="복사 옵션"
    >
      {(["greek", "kr", "both"] as CopyMode[]).map((m) => (
        <button
          key={m}
          type="button"
          role="menuitem"
          className="brp-g2-copy-menu-item"
          onClick={() => {
            onPick(m);
          }}
        >
          {COPY_MODE_LABEL[m]}
        </button>
      ))}
    </div>
  );
}

type Props = {
  // 책 id — 어떤 v2.json 을 lazy-load 할지 결정.
  bookId: GospelId;
  // 책/장 라벨 — 복사 텍스트 헤더에 들어감.
  bookLabel?: string;
  chapterLabel?: string;
  // 현재 표시할 장 번호.
  chapter: number;
};

// 한 세션 동안 책별 데이터는 모듈 스코프 캐시에 보관해 책을 다시 펼칠 때
// 재요청·재파싱을 피한다 (5MB 짜리 JSON 의 비용을 한 번만 치름).
const DATA_CACHE = new Map<GospelId, V2Data>();

export default function GreekChapterV2({
  bookId,
  bookLabel = "마태복음",
  chapterLabel,
  chapter,
}: Props) {
  const [data, setData] = useState<V2Data | null>(
    () => DATA_CACHE.get(bookId) ?? null,
  );

  useEffect(() => {
    let alive = true;
    const cached = DATA_CACHE.get(bookId);
    if (cached) {
      setData(cached);
      return () => {
        alive = false;
      };
    }
    setData(null);
    loadGospelData(bookId).then((d) => {
      if (!alive) return;
      DATA_CACHE.set(bookId, d);
      setData(d);
    });
    return () => {
      alive = false;
    };
  }, [bookId]);

  const chapterIndex = useMemo(() => {
    if (!data) return new Map<number, V2Chapter>();
    return new Map<number, V2Chapter>(data.chapters.map((c) => [c.chapter, c]));
  }, [data]);

  const chapterData = chapterIndex.get(chapter);
  const verses = chapterData?.verses ?? [];
  const resolvedChapterLabel = chapterLabel ?? `${chapter}장`;

  // 펼침 상태 — 의역(verseN), 단어 상세(verseN:tokenIdx).
  // Set 은 삽입 순서를 보존하므로, openToken 에 들어간 키 순서가 곧 "유저가
  // 누른 순번"이 된다. 이 순번을 절 단위로 카운트해 단어 블록·상세 카드에
  // 같은 번호로 표시한다.
  const [openKr, setOpenKr] = useState<Set<number>>(() => new Set());
  const [openToken, setOpenToken] = useState<Set<string>>(() => new Set());

  // 토큰 키 → 그 절 안에서 몇 번째로 펼쳤는지 (1부터). 절마다 별도 카운터.
  const tokenOrdinal = useMemo(() => {
    const map = new Map<string, number>();
    const perVerse = new Map<number, number>();
    for (const k of openToken) {
      const vN = parseInt(k.split(":")[0], 10);
      const c = (perVerse.get(vN) ?? 0) + 1;
      perVerse.set(vN, c);
      map.set(k, c);
    }
    return map;
  }, [openToken]);

  // 복사 메뉴 상태.
  const [copyTarget, setCopyTarget] = useState<CopyTarget>(null);
  const [toast, setToast] = useState<string | null>(null);

  // ── 길게 누르기 상태 ────────────────────────────────────────────────────
  // longPressRef: 현재 진행중인 long-press 시도(타이머/시작좌표/발동여부).
  // suppressClickUntilRef: long-press 발동 직후, 같은 제스처에서 따라오는
  //   click(예: 토큰 토글) 을 잠시 무시할 시각(ms).
  const longPressRef = useRef<{
    timer: number;
    startX: number;
    startY: number;
    verseN: number;
    tokenIdx?: number;
    fired: boolean;
  } | null>(null);
  const suppressClickUntilRef = useRef(0);

  const cancelLongPress = useCallback(() => {
    if (longPressRef.current?.timer) {
      window.clearTimeout(longPressRef.current.timer);
    }
    longPressRef.current = null;
  }, []);

  const beginLongPress = useCallback(
    (
      verseN: number,
      tokenIdx: number | undefined,
      e: ReactPointerEvent,
    ) => {
      // PC: 마우스 좌클릭만. 우클릭은 onContextMenu 가 따로 잡는다.
      if (e.pointerType === "mouse" && e.button !== 0) return;
      cancelLongPress();
      const startX = e.clientX;
      const startY = e.clientY;
      const timer = window.setTimeout(() => {
        const cur = longPressRef.current;
        if (!cur) return;
        cur.fired = true;
        suppressClickUntilRef.current = Date.now() + SUPPRESS_CLICK_MS;
        setCopyTarget({
          verseN: cur.verseN,
          tokenIdx: cur.tokenIdx,
          point: { x: cur.startX, y: cur.startY },
        });
        // 모바일 햅틱(가능하면).
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          try {
            (navigator as Navigator & { vibrate?: (p: number) => boolean })
              .vibrate?.(8);
          } catch {
            /* ignore */
          }
        }
      }, LONG_PRESS_MS);
      longPressRef.current = {
        timer,
        startX,
        startY,
        verseN,
        tokenIdx,
        fired: false,
      };
    },
    [cancelLongPress],
  );

  const trackLongPress = useCallback(
    (e: ReactPointerEvent) => {
      const cur = longPressRef.current;
      if (!cur) return;
      const dx = Math.abs(e.clientX - cur.startX);
      const dy = Math.abs(e.clientY - cur.startY);
      if (dx > LONG_PRESS_MOVE_TOL || dy > LONG_PRESS_MOVE_TOL) {
        cancelLongPress();
      }
    },
    [cancelLongPress],
  );

  // 토스트 자동 해제.
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 1400);
    return () => window.clearTimeout(t);
  }, [toast]);

  const handleCopy = useCallback(
    async (
      verseN: number | "chapter",
      mode: CopyMode,
      tokenIdx?: number,
    ) => {
      let text = "";
      let toastMsg = "";
      if (verseN === "chapter") {
        const header = `${bookLabel} ${resolvedChapterLabel}`;
        text = buildCopyText(mode, verses, header);
        toastMsg = `${resolvedChapterLabel} 전체 복사됨 · ${COPY_MODE_LABEL[mode]}`;
      } else if (typeof tokenIdx === "number") {
        const v = verses.find((vv) => vv.n === verseN);
        const tk = v?.tokens[tokenIdx];
        if (!tk) {
          setCopyTarget(null);
          setToast("복사할 단어를 찾지 못했어요");
          return;
        }
        text = buildTokenCopyText(mode, tk);
        toastMsg = `${tk.w} 복사됨 · ${COPY_MODE_LABEL[mode]}`;
      } else {
        const target = verses.filter((vv) => vv.n === verseN);
        text = buildCopyText(mode, target, "");
        toastMsg = `${verseN}절 복사됨 · ${COPY_MODE_LABEL[mode]}`;
      }
      const ok = await writeClipboard(text);
      setCopyTarget(null);
      setToast(ok ? toastMsg : "복사에 실패했어요");
    },
    [bookLabel, resolvedChapterLabel, verses],
  );

  const toggleKr = useCallback((n: number) => {
    setOpenKr((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }, []);

  const toggleToken = useCallback((key: string) => {
    // long-press 가 막 발동된 경우엔 같은 제스처의 click 을 무시.
    if (Date.now() < suppressClickUntilRef.current) {
      suppressClickUntilRef.current = 0;
      return;
    }
    setOpenToken((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const openMenuFromButton = useCallback(
    (verseN: number | "chapter", btn: HTMLButtonElement) => {
      const r = btn.getBoundingClientRect();
      setCopyTarget({
        verseN,
        point: { x: r.right - 70, y: r.bottom + 4 },
      });
    },
    [],
  );

  // 컨테이너 onPointerDown 은 항상 stopPropagation — 본문 측 long-press
  // 선택 모드와 충돌 방지. 컴포넌트 내부에서는 li 단위로 별도 long-press
  // 타이머를 돌린다.
  const stopPointer = useCallback((e: ReactPointerEvent) => {
    e.stopPropagation();
  }, []);

  const totalTokens = useMemo(
    () => verses.reduce((s, v) => s + v.tokens.length, 0),
    [verses],
  );

  // 로딩/빈 상태 — 데이터 자체가 아직 도착하지 않은 경우.
  if (!data) {
    return (
      <section className="brp-g2" aria-busy="true">
        <header className="brp-g2-header">
          <div className="brp-g2-title">
            <strong>{bookLabel} {resolvedChapterLabel}</strong>
            <span className="brp-g2-meta">불러오는 중…</span>
          </div>
        </header>
        <div className="brp-g2-loading">헬라어 본문을 가져오고 있어요…</div>
      </section>
    );
  }

  // 데이터는 도착했지만 그 장 데이터가 없는 경우.
  if (!chapterData) {
    return (
      <section className="brp-g2">
        <header className="brp-g2-header">
          <div className="brp-g2-title">
            <strong>{bookLabel} {resolvedChapterLabel}</strong>
            <span className="brp-g2-meta">자료 없음</span>
          </div>
        </header>
        <div className="brp-g2-loading">이 장의 헬라어 자료가 아직 없어요.</div>
      </section>
    );
  }

  return (
    <section className="brp-g2" aria-label={`${bookLabel} ${resolvedChapterLabel} 헬라어`}>
      <header className="brp-g2-header">
        <div className="brp-g2-title">
          <strong>{bookLabel} {resolvedChapterLabel}</strong>
          <span className="brp-g2-meta">
            {verses.length}절 · 단어 {totalTokens}개
          </span>
        </div>
        <button
          type="button"
          className="brp-g2-chapter-copy"
          onPointerDown={stopPointer}
          onClick={(e) => {
            e.stopPropagation();
            openMenuFromButton("chapter", e.currentTarget);
          }}
          aria-haspopup="menu"
          aria-expanded={copyTarget?.verseN === "chapter"}
        >
          장 전체 복사
        </button>
      </header>

      <ol className="brp-g2-verses">
        {verses.map((v) => {
          const krOpen = openKr.has(v.n);
          return (
            <li
              key={v.n}
              className="brp-g2-verse"
              data-verse-num={v.n}
              onPointerDown={(e) => {
                stopPointer(e);
                beginLongPress(v.n, undefined, e);
              }}
              onPointerMove={trackLongPress}
              onPointerUp={cancelLongPress}
              onPointerCancel={cancelLongPress}
              onPointerLeave={cancelLongPress}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                cancelLongPress();
                suppressClickUntilRef.current =
                  Date.now() + SUPPRESS_CLICK_MS;
                setCopyTarget({
                  verseN: v.n,
                  point: { x: e.clientX, y: e.clientY },
                });
              }}
            >
              {/* grid 좌측 컬럼: 절 숫자 — 일반 본문(.brp-verse) 과 동일한
                  레이아웃/톤. 본문이 wrap 되어도 절 숫자 아래로 콘텐츠가
                  들어가지 않도록 컬럼 자체를 분리한다. */}
              <span className="brp-g2-verse-num" aria-hidden="true">
                {v.n}
              </span>
              {/* grid 우측 컬럼: 본문(단어 블록 + ▾ + 상세 + 의역). */}
              <div className="brp-g2-verse-body">
                <div className="brp-g2-tokens">
                <button
                  type="button"
                  className={`brp-g2-kr-chev ${krOpen ? "is-open" : ""}`}
                  aria-expanded={krOpen}
                  aria-label={`${v.n}절 한글 의역 ${krOpen ? "접기" : "펼치기"}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleKr(v.n);
                  }}
                >
                  <span aria-hidden="true">▾</span>
                </button>
                {v.tokens.map((tk, i) => {
                  const key = `${v.n}:${i}`;
                  const isOpen = openToken.has(key);
                  const ord = tokenOrdinal.get(key);
                  return (
                    <button
                      type="button"
                      key={key}
                      className={`brp-g2-token ${isOpen ? "is-open" : ""} ${
                        tk.nameType ? `is-${tk.nameType}` : ""
                      }`}
                      aria-expanded={isOpen}
                      aria-label={`${tk.w} (${tk.p}) ${
                        isOpen ? "상세 닫기" : "상세 열기"
                      }${ord ? ` · 펼친 순번 ${ord}` : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleToken(key);
                      }}
                      onPointerDown={(e) => {
                        // 단어 단위 long-press — 토큰 위에서 길게 누르면
                        // 그 단어 한 개만 복사 대상이 된다. li 의 절 단위
                        // long-press 가 동시에 시작되지 않도록 stopPropagation.
                        e.stopPropagation();
                        beginLongPress(v.n, i, e);
                      }}
                      onPointerMove={trackLongPress}
                      onPointerUp={cancelLongPress}
                      onPointerCancel={cancelLongPress}
                      onPointerLeave={cancelLongPress}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        cancelLongPress();
                        suppressClickUntilRef.current =
                          Date.now() + SUPPRESS_CLICK_MS;
                        setCopyTarget({
                          verseN: v.n,
                          tokenIdx: i,
                          point: { x: e.clientX, y: e.clientY },
                        });
                      }}
                    >
                      {ord && (
                        <span
                          className="brp-g2-token-ord"
                          aria-hidden="true"
                        >
                          {ord}
                        </span>
                      )}
                      <span className="brp-g2-token-w" lang="grc">{tk.w}</span>
                      <span className="brp-g2-token-p" aria-hidden="true">
                        {tk.p || "\u00A0"}
                      </span>
                      <span className="brp-g2-token-g" aria-hidden="true">
                        {tk.gloss || "\u00A0"}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* 단어 상세 — 펼친 순서(openToken 삽입 순서) 대로 렌더한다.
                  토큰 인덱스 순이 아니라 사용자가 누른 순으로 위→아래. */}
              {(() => {
                const openItems = Array.from(openToken)
                  .filter((k) => k.startsWith(`${v.n}:`))
                  .map((k) => {
                    const i = parseInt(k.split(":")[1], 10);
                    return { k, i, tk: v.tokens[i], ord: tokenOrdinal.get(k)! };
                  });
                if (openItems.length === 0) return null;
                return (
                  <div className="brp-g2-detail-panels">
                    {openItems.map(({ tk, k, ord }) => (
                      <article
                        key={`d-${k}`}
                        className="brp-g2-detail"
                        role="region"
                        aria-label={`${ord}번째로 펼친 단어 ${tk.w} 상세`}
                      >
                        <header className="brp-g2-detail-head">
                          <span className="brp-g2-detail-ord" aria-hidden="true">
                            {ord}
                          </span>
                          <span className="brp-g2-detail-w" lang="grc">{tk.w}</span>
                          <span className="brp-g2-detail-p">{tk.p}</span>
                          {tk.nameType && (
                            <span
                              className={`brp-g2-detail-tag is-${tk.nameType}`}
                            >
                              {tk.nameType === "person" ? "인명" : "지명"}
                            </span>
                          )}
                        </header>
                        <dl className="brp-g2-detail-grid">
                          <dt>사전형</dt>
                          <dd>
                            <span lang="grc">{tk.lemma}</span>
                            {tk.lemmaP && (
                              <span className="brp-g2-mute">
                                {" "}({tk.lemmaP})
                              </span>
                            )}
                          </dd>
                          <dt>품사</dt>
                          <dd>{tk.posLabel}</dd>
                          {tk.parseLabel && (
                            <>
                              <dt>파싱</dt>
                              <dd>{tk.parseLabel}</dd>
                            </>
                          )}
                          {tk.meanings.length > 0 && (
                            <>
                              <dt>뜻</dt>
                              <dd>{tk.meanings.join(" · ")}</dd>
                            </>
                          )}
                          {tk.note && (
                            <>
                              <dt>풀이</dt>
                              <dd>{tk.note}</dd>
                            </>
                          )}
                        </dl>
                      </article>
                    ))}
                  </div>
                );
              })()}

              {/* 한글 의역 — 절의 맨 아래에 펼쳐진다(접힘 기본).
                  앞에는 라인이나 표식 없이 절 번호 텍스트만 prefix. */}
              {krOpen && (
                <p className="brp-g2-kr" lang="ko">
                  <span className="brp-g2-kr-n" aria-hidden="true">
                    {v.n}
                  </span>
                  {v.copyKr}
                </p>
              )}
              </div>{/* /.brp-g2-verse-body */}
            </li>
          );
        })}
      </ol>

      <footer className="brp-g2-footer">
        <small>
          본문 © Society of Biblical Literature, CC BY 4.0 (SBLGNT) · 형태소
          분석 MorphGNT (CC BY-SA 4.0) · 한국어 의역·풀이는 학습용으로 직접
          작성. · 절을 길게 누르면 복사 메뉴가 나옵니다.
        </small>
      </footer>

      {copyTarget && (
        <CopyMenu
          point={copyTarget.point}
          onClose={() => setCopyTarget(null)}
          onPick={(m) => {
            handleCopy(copyTarget.verseN, m, copyTarget.tokenIdx);
          }}
        />
      )}

      {toast && (
        <div className="brp-g2-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      <style jsx>{`
        /* ────────────────────────────────────────────────────────────────
           색 규칙 — 단어 간 일관성 우선.
             · 헬라어 본문 줄 : 모든 단어 같은 잉크. (예외 없음)
             · 발음 줄        : 모든 단어 같은 슬레이트 블루.
             · 뜻 줄          : 모든 단어 같은 차분한 그린.
             · 인명/지명 강조 : 헬라어 줄엔 색을 안 입힌다. 뜻 줄만 진한
                                accent + 굵기로 또렷하게.
           ──────────────────────────────────────────────────────────────── */
        .brp-g2 {
          --g2-ink: var(--ink, #1f1f1f);
          --g2-soft: var(--ink-mute, rgba(0, 0, 0, 0.5));
          /* 발음 — 차분한 슬레이트 블루(중간 톤) */
          --g2-pron: #6c7e9b;
          /* 뜻(글로스) — 본문 accent 옅게(중간 톤) */
          --g2-gloss: color-mix(in srgb, var(--accent, #3b6c47) 55%, var(--ink-mute, rgba(0,0,0,0.5)) 45%);
          /* 강조(뜻 줄 전용) — accent 진한 톤 */
          --g2-hl: color-mix(in srgb, var(--accent, #3b6c47) 100%, #000 12%);
          /* 한글 의역 — 본문 잉크 그대로 */
          --g2-kr-ink: var(--ink, #1f1f1f);
        }

        .brp-g2 {
          /* 헬라어 화면은 일반 본문(--container-reading: 720px) 보다 폭을 더
             넓게 사용한다. 단어 블록 단위로 wrap 되는 구조라 폭이 넓을수록
             한 줄에 더 많은 단어가 들어가고, 절 높이가 낮아져 읽기 효율이
             좋아진다. PC 의 reader 컬럼(약 968px) 안에서 거의 끝까지,
             더 넓은 화면이라면 1080px 까지 확장. 모바일·태블릿은 부모 폭
             100% 그대로(min() 으로 자동). */
          max-width: min(100%, 1080px);
          margin: 0 auto;
          padding: 4px 0 24px;
          color: var(--g2-ink);
          /* 본문(reader) 의 사용자 설정 글자 크기/줄 간격을 그대로 따라간다.
             내부 모든 글자 사이즈는 em(또는 % of parent) 단위라, 이 base 만
             스케일되면 토큰·발음·뜻·상세까지 한꺼번에 같은 비율로 커진다. */
          font-size: calc(clamp(16px, 1.6vw, 19px) * var(--reader-size-scale, 1));
          line-height: var(--reader-text-line-height, 1.55);
        }

        .brp-g2-loading {
          padding: 24px 8px;
          color: var(--g2-soft);
          font-size: 0.95em;
          text-align: center;
        }

        /* ── 장 헤더 ── */
        .brp-g2-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          /* 본문(.brp-g2-tokens) 와 좌우 정렬을 맞추기 위해 좌우 padding 0.
             세로 padding 만 유지. */
          padding: 6px 0 10px;
          border-bottom: 1px dashed var(--line, rgba(0, 0, 0, 0.12));
          margin-bottom: 8px;
        }
        .brp-g2-title {
          display: flex;
          align-items: baseline;
          gap: 10px;
          min-width: 0;
        }
        .brp-g2-title strong { font-size: 1.05em; font-weight: 600; }
        .brp-g2-meta {
          font-size: 0.78em;
          color: var(--g2-soft);
        }
        .brp-g2-chapter-copy {
          appearance: none;
          background: transparent;
          border: 1px solid var(--line, rgba(0, 0, 0, 0.16));
          padding: 4px 10px;
          font: inherit;
          font-size: 0.8em;
          font-weight: 600;
          color: var(--g2-soft);
          border-radius: 999px;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
        }
        .brp-g2-chapter-copy:hover {
          color: var(--g2-ink);
          background: rgba(0, 0, 0, 0.04);
          border-color: var(--line-strong, var(--line));
        }

        /* ── 절 목록 ── */
        .brp-g2-verses {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .brp-g2-verse {
          position: relative;
          /* 일반 본문(.brp-verse) 과 동일한 2-컬럼 grid 구조.
             좌측: 절 숫자(2em 고정), 우측: 본문(min 0, 1fr).
             - 본문 wrap 시 절 숫자 아래로 콘텐츠가 흘러들지 않는다.
             - 절 숫자 컬럼 위치/폭/baseline 정렬이 다른 번역과 정확히 일치. */
          display: grid;
          grid-template-columns: 2em minmax(0, 1fr);
          column-gap: clamp(8px, 1vw, 12px);
          align-items: baseline;
          padding: 2px 0 8px 0;
          border-bottom: 1px solid var(--line, rgba(0, 0, 0, 0.06));
          /* 길게 누르기 동안 텍스트 선택이 끼어드는 것 방지(데스크탑 포함). */
          -webkit-user-select: none;
          user-select: none;
          /* iOS Safari long-press 시스템 메뉴 억제. */
          -webkit-touch-callout: none;
        }
        /* 본문 컬럼 — grid 두 번째 컬럼. min-width: 0 으로 자식 flex(wrap) 가
           정상 동작하도록. 자기 컬럼 폭 안에서만 wrap 되므로 절 숫자 컬럼을
           침범하지 않는다. */
        .brp-g2-verse-body {
          min-width: 0;
        }
        .brp-g2-verse :global(.brp-g2-detail) {
          /* 상세 카드 안의 텍스트는 다시 선택/복사 가능하게 풀어준다. */
          -webkit-user-select: text;
          user-select: text;
        }
        .brp-g2-verse :global(.brp-g2-kr) {
          -webkit-user-select: text;
          user-select: text;
        }
        .brp-g2-verse:last-child { border-bottom: none; }

        /* ── ▾ 토글 — 절 숫자 옆에 inline 으로 (절 좌측 시작부에 위치).
              본문 우측 자리를 차지하지 않아 풀폭을 그대로 사용한다. ── */
        .brp-g2-kr-chev {
          appearance: none;
          background: transparent;
          border: none;
          padding: 2px 4px;
          font: inherit;
          /* 절 숫자(0.95em) 와 비슷한 톤으로 작게. */
          font-size: 0.78em;
          color: var(--g2-soft);
          cursor: pointer;
          line-height: 1;
          border-radius: 4px;
          transition: color 0.15s ease, background 0.15s ease;
          /* 단어 블록(3줄) 들과 같은 행에 위치하되, 첫 줄 baseline 에 자연스럽게
             정렬되도록 self-align center. flex 자식이라 폭은 자기 콘텐츠만큼. */
          align-self: center;
        }
        .brp-g2-kr-chev:hover {
          color: var(--g2-ink);
          background: rgba(0, 0, 0, 0.04);
        }
        .brp-g2-kr-chev > span {
          display: inline-block;
          transform: rotate(0deg);
          transition: transform 0.18s ease;
        }
        .brp-g2-kr-chev.is-open > span { transform: rotate(180deg); }
        .brp-g2-kr-chev.is-open {
          color: var(--g2-hl);
          background: color-mix(in srgb, var(--accent, #3b6c47) 10%, transparent);
        }

        /* ── 절 숫자 — grid 좌측 컬럼. 개역한글/어린이성경의 .brp-verse-number
              톤을 그대로 따른다 (흐린 회색, 1em, 일반 weight). ── */
        .brp-g2-verse-num {
          color: var(--ink-mute);
          font-size: 1em;
          font-weight: 400;
          line-height: inherit;
          text-align: center;
          font-variant-numeric: tabular-nums;
          transition: color 0.25s ease;
        }

        /* ── 한글 의역(절 맨 아래) — 좌측 라인 + 옅은 테마 톤 배경으로 강조 ── */
        .brp-g2-kr {
          margin: 8px 0 2px 0;
          padding: 6px 12px 6px 12px;
          border-left: 3px solid
            color-mix(in srgb, var(--accent, #3b6c47) 60%, transparent);
          background: color-mix(in srgb, var(--accent, #3b6c47) 6%, transparent);
          border-radius: 0 4px 4px 0;
          color: var(--g2-kr-ink);
          font-size: 0.96em;
          line-height: 1.7;
          word-break: keep-all;
          overflow-wrap: break-word;
          text-indent: 0;
        }
        .brp-g2-kr-n {
          display: inline-block;
          font-weight: 600;
          color: var(--g2-hl);
          margin-right: 6px;
          font-size: 0.92em;
        }

        /* ── 단어 블록(3줄) — 빽빽한 그리드 ── */
        .brp-g2-tokens {
          display: flex;
          flex-wrap: wrap;
          /* row × column gap. 가로 간격을 줄여 한 줄에 단어가 더 들어가게,
             세로(행) 간격도 줄여 절 높이를 낮춘다. */
          gap: 6px 4px;
          padding: 2px 0 0;
          /* 토큰의 좌우 padding(5px) 만큼 컨테이너를 좌우로 확장해, 첫 토큰
             (절 숫자) 의 텍스트가 본문 좌측 끝에 정렬되고, 마지막 토큰의 우측
             padding 이 본문 우측 끝 너머로 빠지도록 한다. 이렇게 하면 본문
             가용 폭이 다른 번역(개역한글) 과 시각적으로 동일하게 보인다. */
          margin-left: -5px;
          margin-right: -5px;
        }
        .brp-g2-token {
          appearance: none;
          background: transparent;
          border: 1px solid transparent;
          /* 세로 3줄을 바짝 붙이고 좌우는 살짝만 패딩 — 블록 사이 간격은
             gap 으로만 조절 (한 줄에 많이 들어가야 한다는 요구사항).
             펼침 순번 뱃지를 우측 상단에 띄우기 위해 relative. */
          padding: 2px 5px 3px;
          border-radius: 6px;
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          gap: 1px;
          min-width: 0;
          cursor: pointer;
          font: inherit;
          color: inherit;
          line-height: 1.05; /* 3줄을 위아래로 더 바짝 붙이기 위해 축소 */
          position: relative;
          transition: background 0.12s ease, border-color 0.12s ease;
        }
        /* 펼침 순번 뱃지 — 펼쳐져 있는 단어 블록의 우측 상단에 작은 동그라미.
           같은 번호가 아래 상세 카드 헤더에 다시 나와 매칭을 보여준다. */
        .brp-g2-token-ord {
          position: absolute;
          top: -4px;
          right: -3px;
          min-width: 0.95em;
          height: 0.95em;
          padding: 0 0.25em;
          background: var(--g2-hl);
          color: var(--bg, #fff);
          border-radius: 999px;
          font-size: 0.62em;
          font-weight: 700;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-family: inherit;
          letter-spacing: 0;
          box-shadow: 0 0 0 2px var(--surface, #fff);
        }
        .brp-g2-token:hover { background: rgba(0, 0, 0, 0.035); }
        .brp-g2-token.is-open {
          background: color-mix(in srgb, var(--accent, #3b6c47) 10%, var(--surface, #fff));
          border-color: color-mix(in srgb, var(--accent, #3b6c47) 35%, transparent);
        }
        /* 헬라어 본문 — 모든 단어 같은 잉크 색 (예외 없음, 일관 규칙).
           em 단위라 설정 글자 크기에 함께 스케일. weight 는 개역한글/어린이
           본문(400) 톤과 어긋나지 않도록 EB Garamond 의 자연스러운 500
           정도까지만 (600 은 헬라어 화면만 다른 사이트처럼 진해 보였음). */
        .brp-g2-token-w {
          font-family: "EB Garamond", "Garamond", "Times New Roman", serif;
          font-variant-ligatures: none;
          font-size: 1.18em;
          font-weight: 500;
          color: var(--g2-ink);
          letter-spacing: 0;
          white-space: nowrap;
        }
        /* 발음 — 모든 단어 같은 슬레이트 블루 톤. */
        .brp-g2-token-p {
          font-size: 0.72em;
          color: var(--g2-pron);
          letter-spacing: -0.01em;
          white-space: nowrap;
        }
        /* 뜻 — 모든 단어 같은 차분한 그린 톤. */
        .brp-g2-token-g {
          font-size: 0.72em;
          color: var(--g2-gloss);
          letter-spacing: -0.01em;
          white-space: nowrap;
        }

        /* 고유명사(인명·지명) 강조 — "뜻 줄" 색만 진한 accent.
           굵기는 일부러 주지 않아 한 절 안에서 글자 굵기 규칙이 깨지지
           않게 한다 (헬라어/발음 줄은 다른 단어와 동일 색). */
        .brp-g2-token.is-person .brp-g2-token-g,
        .brp-g2-token.is-place  .brp-g2-token-g {
          color: var(--g2-hl);
        }

        /* ── 단어 상세 카드 — 박스/둥근 모서리 없이 가는 좌측 라인만 ── */
        .brp-g2-detail-panels {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin: 6px 0 4px;
        }
        .brp-g2-detail {
          padding: 2px 0 2px 12px;
          background: transparent;
          border: none;
          border-left: 2px solid
            color-mix(in srgb, var(--accent, #3b6c47) 55%, transparent);
          border-radius: 0;
        }
        .brp-g2-detail-head {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 2px;
          padding-bottom: 0;
          border-bottom: none;
        }
        /* 상세 카드 헤더의 순번 뱃지 — 단어 블록 위 뱃지와 같은 번호.
           살짝 더 크게(읽기 편하게) + 동일한 진한 accent 톤. */
        .brp-g2-detail-ord {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 20px;
          height: 20px;
          padding: 0 6px;
          background: var(--g2-hl);
          color: var(--bg, #fff);
          border-radius: 999px;
          font-size: 0.74em;
          font-weight: 700;
          line-height: 1;
          letter-spacing: 0;
          flex: 0 0 auto;
        }
        /* 상세 카드 — 헬라어 제목은 본문과 동일한 잉크 색 + 아주 옅은
           accent 배경 하이라이트(inline highlighter 느낌). weight 는 본문
           토큰(500) 보다 한 단계 굵게(600) 정도까지만. */
        .brp-g2-detail-w {
          font-family: "EB Garamond", "Garamond", "Times New Roman", serif;
          font-size: 1.18em;
          font-weight: 600;
          color: var(--g2-ink);
          background: color-mix(in srgb, var(--accent, #3b6c47) 8%, transparent);
          padding: 1px 7px 2px;
          border-radius: 4px;
        }
        .brp-g2-detail-p {
          font-size: 0.85em;
          color: var(--g2-pron);
          font-weight: 500;
        }
        /* 인명/지명 칩 — 두 종류 모두 같은 accent 톤으로 통일(혼란 방지). */
        .brp-g2-detail-tag {
          margin-left: auto;
          font-size: 0.72em;
          padding: 2px 8px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--accent, #3b6c47) 18%, transparent);
          color: var(--g2-hl);
          font-weight: 700;
          letter-spacing: 0.01em;
        }
        .brp-g2-detail-grid {
          display: grid;
          grid-template-columns: 56px minmax(0, 1fr);
          column-gap: 12px;
          row-gap: 4px;
          margin: 0;
          font-size: 0.9em;
          line-height: 1.6;
        }
        .brp-g2-detail-grid dt {
          color: var(--g2-soft);
          font-weight: 600;
          font-size: 0.85em;
          padding-top: 1px;
        }
        .brp-g2-detail-grid dd {
          margin: 0;
          color: var(--g2-ink);
          overflow-wrap: break-word;
          word-break: keep-all;
        }
        .brp-g2-mute {
          color: var(--g2-soft);
          font-size: 0.95em;
        }

        /* ── 푸터 출처 ── */
        .brp-g2-footer {
          margin-top: 18px;
          padding-top: 10px;
          border-top: 1px dashed var(--line, rgba(0, 0, 0, 0.12));
          color: var(--g2-soft);
          font-size: 0.74em;
          line-height: 1.55;
        }

        /* ── 토스트 ── */
        .brp-g2-toast {
          position: fixed;
          left: 50%;
          bottom: 140px;
          z-index: 60;
          transform: translateX(-50%);
          background: var(--ink, #1f1f1f);
          color: var(--bg, #fff);
          padding: 9px 18px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: -0.01em;
          box-shadow: 0 8px 22px rgba(0, 0, 0, 0.22);
          pointer-events: none;
          max-width: calc(100vw - 24px);
          white-space: nowrap;
          animation: brp-g2-toast-in 0.16s ease-out;
        }
        @keyframes brp-g2-toast-in {
          from { opacity: 0; transform: translate(-50%, 6px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }

        /* ── 반응형 — 글씨 크기는 그대로, 간격만 더 좁힘 ── */
        @media (max-width: 480px) {
          .brp-g2-tokens {
            gap: 4px 3px;
            /* 모바일은 토큰 좌우 padding 이 4px 이므로 negative margin 도 -4px. */
            margin-left: -4px;
            margin-right: -4px;
          }
          .brp-g2-token { padding: 2px 4px 3px; gap: 1px; }
        }
        @media (min-width: 900px) {
          .brp-g2-tokens { gap: 7px 5px; }
        }
      `}</style>
      <style jsx global>{`
        /* 메뉴는 fixed 위치라 컴포넌트 바깥 z-index 와 충돌하지 않게
           전역으로 한 번만 정의한다. */
        .brp-g2-copy-menu {
          position: fixed;
          z-index: 60;
          min-width: 140px;
          padding: 6px;
          background: var(--surface, #fff);
          border: 1px solid var(--line-strong, var(--line, rgba(0, 0, 0, 0.16)));
          border-radius: 10px;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
          display: flex;
          flex-direction: column;
          gap: 2px;
          animation: brp-g2-menu-in 0.12s ease-out;
        }
        @keyframes brp-g2-menu-in {
          from { opacity: 0; transform: translateY(-4px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .brp-g2-copy-menu-item {
          appearance: none;
          background: transparent;
          border: none;
          padding: 8px 12px;
          font: inherit;
          font-size: 13.5px;
          font-weight: 600;
          color: var(--ink, #1f1f1f);
          text-align: left;
          border-radius: 6px;
          cursor: pointer;
        }
        .brp-g2-copy-menu-item:hover,
        .brp-g2-copy-menu-item:focus-visible {
          background: color-mix(in srgb, var(--accent, #3b6c47) 12%, transparent);
        }
      `}</style>
    </section>
  );
}
