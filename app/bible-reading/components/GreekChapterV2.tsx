"use client";

/**
 * GreekChapterV2 — "헬라어 보기" 새 구조 (테스트용, 마태복음 1장 한정).
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
 * 데이터: app/bible-reading/matthew1-v2.json (build-matt1-v2.mjs 산출).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
// 마태복음 전체(28장) v2 데이터. 5MB 가량이므로 이 컴포넌트는 page.tsx
// 에서 next/dynamic 으로 lazy-load 해 헬라어 모드 진입 시에만 받는다.
import matthewData from "../matthew-v2.json";

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

const DATA = matthewData as V2Data;
const CHAPTER_INDEX = new Map<number, V2Chapter>(
  DATA.chapters.map((c) => [c.chapter, c]),
);

type CopyMode = "greek" | "kr" | "both";
type CopyTarget = {
  verseN: number | "chapter";
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
  // 책/장 라벨 — 복사 텍스트 헤더에 들어감.
  bookLabel?: string;
  chapterLabel?: string;
  // 현재 표시할 장 번호 (예: 1, 2, …, 28).
  chapter: number;
};

export default function GreekChapterV2({
  bookLabel = "마태복음",
  chapterLabel,
  chapter,
}: Props) {
  const chapterData = CHAPTER_INDEX.get(chapter);
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
    (verseN: number, e: ReactPointerEvent<HTMLLIElement>) => {
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
          verseN,
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
        fired: false,
      };
    },
    [cancelLongPress],
  );

  const trackLongPress = useCallback(
    (e: ReactPointerEvent<HTMLLIElement>) => {
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
    async (verseN: number | "chapter", mode: CopyMode) => {
      let header = "";
      let target: V2Verse[] = [];
      if (verseN === "chapter") {
        header = `${bookLabel} ${resolvedChapterLabel}`;
        target = verses;
      } else {
        header = "";
        target = verses.filter((v) => v.n === verseN);
      }
      const text = buildCopyText(mode, target, header);
      const ok = await writeClipboard(text);
      setCopyTarget(null);
      if (ok) {
        if (verseN === "chapter") {
          setToast(`${resolvedChapterLabel} 전체 복사됨 · ${COPY_MODE_LABEL[mode]}`);
        } else {
          setToast(`${verseN}절 복사됨 · ${COPY_MODE_LABEL[mode]}`);
        }
      } else {
        setToast("복사에 실패했어요");
      }
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
                beginLongPress(v.n, e);
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
              {/* ▾ 토글 — 절 우측 상단 absolute 배치. 머리 줄을 따로
                  차지하지 않으므로, 단어 블록이 절 숫자 바로 옆부터 시작한다. */}
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

              {/* 단어 블록(3줄) — 컨테이너 첫 자식에 절 숫자를 두어 첫 단어
                  바로 옆부터 시작되게 한다. 절 숫자는 클릭 비활성. */}
              <div className="brp-g2-tokens">
                <span
                  className="brp-g2-token brp-g2-token--num"
                  aria-hidden="true"
                >
                  <span className="brp-g2-token-w brp-g2-verse-n">{v.n}</span>
                  <span className="brp-g2-token-p">{"\u00A0"}</span>
                  <span className="brp-g2-token-g">{"\u00A0"}</span>
                </span>
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
            handleCopy(copyTarget.verseN, m);
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
          max-width: var(--container-reading, 760px);
          margin: 0 auto;
          padding: 4px 0 24px;
          color: var(--g2-ink);
        }

        /* ── 장 헤더 ── */
        .brp-g2-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 6px 4px 10px;
          border-bottom: 1px dashed var(--line, rgba(0, 0, 0, 0.12));
          margin-bottom: 8px;
        }
        .brp-g2-title {
          display: flex;
          align-items: baseline;
          gap: 10px;
          min-width: 0;
        }
        .brp-g2-title strong { font-size: 1.05em; font-weight: 700; }
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
          /* ▾ 버튼 영역(우측 약 26px) 만큼만 우측 패딩. 단어 블록 자체는
             절의 좌측 끝부터 시작하므로 절 숫자 앞에 빈 줄/공간이 없다. */
          padding: 2px 28px 8px 0;
          border-bottom: 1px solid var(--line, rgba(0, 0, 0, 0.06));
          /* 길게 누르기 동안 텍스트 선택이 끼어드는 것 방지(데스크탑 포함). */
          -webkit-user-select: none;
          user-select: none;
          /* iOS Safari long-press 시스템 메뉴 억제. */
          -webkit-touch-callout: none;
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

        /* ── ▾ 토글 — 절 우측 상단 absolute, 머리 줄을 차지하지 않음 ── */
        .brp-g2-kr-chev {
          position: absolute;
          top: 0;
          right: 0;
          appearance: none;
          background: transparent;
          border: none;
          padding: 4px 6px;
          font: inherit;
          font-size: 0.9em;
          color: var(--g2-soft);
          cursor: pointer;
          line-height: 1;
          border-radius: 6px;
          transition: color 0.15s ease, background 0.15s ease;
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

        /* ── 절 숫자 토큰(클릭 비활성, 헬라어 자리에 숫자만 표시) ── */
        .brp-g2-token--num {
          cursor: default;
          /* button 처럼 hover/open 배경 없음. 헬라어와 같은 padding 으로
             다른 토큰과 baseline 이 정확히 맞도록. */
        }
        .brp-g2-token--num:hover { background: transparent; }
        .brp-g2-verse-n {
          /* 헬라어 자리에 놓이지만 serif 가 아닌 sans, 사이즈도 본문 단어보다
             살짝 작아 시각적으로 "번호" 임을 구분. */
          font-family: inherit !important;
          font-variant-ligatures: normal !important;
          font-size: 0.95rem;
          font-weight: 700;
          color: var(--g2-hl);
          line-height: inherit;
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
          font-weight: 700;
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
          min-width: 15px;
          height: 15px;
          padding: 0 4px;
          background: var(--g2-hl);
          color: var(--bg, #fff);
          border-radius: 999px;
          font-size: 0.62rem;
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
        /* 헬라어 본문 — 모든 단어 같은 잉크 색 (예외 없음, 일관 규칙). */
        .brp-g2-token-w {
          font-family: "EB Garamond", "Garamond", "Times New Roman", serif;
          font-variant-ligatures: none;
          font-size: 1.18rem;
          font-weight: 600;
          color: var(--g2-ink);
          letter-spacing: 0;
          white-space: nowrap;
        }
        /* 발음 — 모든 단어 같은 슬레이트 블루 톤. */
        .brp-g2-token-p {
          font-size: 0.72rem;
          color: var(--g2-pron);
          letter-spacing: -0.01em;
          white-space: nowrap;
        }
        /* 뜻 — 모든 단어 같은 차분한 그린 톤. */
        .brp-g2-token-g {
          font-size: 0.72rem;
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
           accent 배경 하이라이트(inline highlighter 느낌). */
        .brp-g2-detail-w {
          font-family: "EB Garamond", "Garamond", "Times New Roman", serif;
          font-size: 1.18em;
          font-weight: 700;
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
          .brp-g2-tokens { gap: 4px 3px; }
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
