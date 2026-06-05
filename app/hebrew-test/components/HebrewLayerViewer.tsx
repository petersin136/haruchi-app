"use client";

/**
 * HebrewLayerViewer — 구약 히브리어 PoC 전용 레이어 뷰어 (창세기 한 권).
 *
 * 의존:
 *   - 데이터: `/hebrew-test/<book>.json` (fetch, cache: "default")
 *   - 색상/폰트/간격: 사이트 테마 변수(--ink, --line, --accent, --reader-font-family ...)
 *
 * 신약(LayeredBibleViewer) 과 동일한 UX 를 RTL 환경에 맞게 단순화한 별도 컴포넌트.
 * 신약 뷰어와는 파일·상태키·CSS 클래스 모두 분리되어 서로 영향이 없다.
 *
 * 주요 동작:
 *   - 한 절 = 그 절에서 켠 레이어들의 누적 표시. layerOrder 순서대로 쌓임.
 *   - 토글 드래그(모바일 길게 누름) 로 순서 변경 → localStorage 영속.
 *   - hebrew 레이어는 단어 블록(`dir="rtl"`, flex-wrap) 으로 오른쪽부터 흐름.
 *     단어 클릭 시 그 아래에 원형·Strong's·문법 카드 펼침.
 *   - 절별 복사 버튼: 켠 레이어를 사용자 순서대로 한 줄씩. 히브리는 원문 한 줄.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

// ── 타입 ────────────────────────────────────────────────────────────────────
type LayerId = "krv" | "hebrew" | "hebrewpara" | "kids";

type HebrewWord = {
  word: string;
  pron: string;
  meaning: string;
  lemma: string;
  strong: string;
  morph: string;
};

type TextLayer = { type: "text"; content: string };
type WordblockLayer = { type: "wordblock"; words: HebrewWord[] };
type AnyLayer = TextLayer | WordblockLayer;

type Verse = {
  ref: string;
  layers: Partial<Record<LayerId, AnyLayer>>;
};

type Chapter = {
  chapter: number;
  verses: Verse[];
};

export type HebrewBookData = {
  book: string;
  direction: "rtl";
  layerOrder: LayerId[];
  layerLabels: Partial<Record<LayerId, string>>;
  defaultOn: LayerId[];
  sources?: Partial<Record<LayerId, string>>;
  chapters: Chapter[];
};

// 정본(폴백) 라벨/순서. 데이터가 빠진 필드는 이 값으로 보강.
const DEFAULT_LAYER_ORDER: LayerId[] = ["krv", "hebrew", "hebrewpara", "kids"];
const DEFAULT_LAYER_LABELS: Record<LayerId, string> = {
  krv: "개역한글",
  hebrew: "히브리어",
  hebrewpara: "히브리 풀이/의역",
  kids: "어린이 의역",
};
const DEFAULT_ON: LayerId[] = ["krv", "hebrew"];

// 레이어별 표시 메타 — 색상 점 + 짧은 라벨.
const LAYER_META: Record<LayerId, { dot: string; short: string }> = {
  krv: { dot: "#9A9AA0", short: "개역" },
  hebrew: { dot: "#7A4E2A", short: "히브리" },
  hebrewpara: { dot: "#C29B6A", short: "풀이" },
  kids: { dot: "#B58A2A", short: "어린이" },
};

// 신약 뷰어의 localStorage 와 충돌하지 않도록 별도 키.
const ON_STORAGE_KEY = "haruchi.hebrewPoc.layers";
const ORDER_STORAGE_KEY = "haruchi.hebrewPoc.order";

function loadStoredArray(key: string, valid: LayerId[]): LayerId[] | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((x): x is LayerId => valid.includes(x));
  } catch {
    return null;
  }
}

function mergedOrder(stored: LayerId[] | null, all: LayerId[]): LayerId[] {
  if (!stored || stored.length === 0) return all;
  const seen = new Set<LayerId>();
  const out: LayerId[] = [];
  for (const id of stored) {
    if (!seen.has(id) && all.includes(id)) {
      out.push(id);
      seen.add(id);
    }
  }
  for (const id of all) if (!seen.has(id)) out.push(id);
  return out;
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
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

// 켠 레이어를 사용자 순서로 한 줄씩 텍스트화. 히브리어는 단어 블록이 아니라
// 절의 원문 한 줄(원형 + 닉쿠드) 으로만 복사. 단어 사이는 공백.
function buildVerseCopy(
  verse: Verse,
  onLayers: LayerId[],
  order: LayerId[],
): string {
  const lines: string[] = [verse.ref];
  for (const id of order) {
    if (!onLayers.includes(id)) continue;
    const layer = verse.layers[id];
    if (!layer) continue;
    if (layer.type === "wordblock") {
      const line = layer.words.map((w) => w.word).join(" ").trim();
      if (line) lines.push(line);
    } else if (layer.content.trim()) {
      lines.push(layer.content.trim());
    }
  }
  return lines.join("\n");
}

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 15V5a2 2 0 0 1 2-2h8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

// 드래그 임계값 — 신약 뷰어 정책 동일.
const DRAG_MOUSE_PX = 6;
const DRAG_TOUCH_HOLD_MS = 220;
const DRAG_TOUCH_CANCEL_PX = 10;
const SUPPRESS_CLICK_MS = 500;

type Props = {
  /** `/hebrew-test/<book>.json` 의 책 식별자. 본 PoC 는 "genesis" 만 사용. */
  bookSlug: string;
  /** 표시할 장(1-indexed). 데이터 범위를 벗어나면 마지막 장으로 클램프. */
  chapter: number;
  /** 페이지 헤더에 보일 책 이름. (데이터에서도 받아오지만 SSR 첫 페인트용.) */
  bookLabel: string;
};

export default function HebrewLayerViewer({
  bookSlug,
  chapter,
  bookLabel,
}: Props) {
  const [bookData, setBookData] = useState<HebrewBookData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setBookData(null);
    fetch(`/hebrew-test/${bookSlug}.json`, { cache: "default" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((d: HebrewBookData) => {
        if (!cancelled) setBookData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          console.error("hebrew-test 데이터 로드 실패", e);
          setLoadError(
            e instanceof Error ? e.message : "데이터를 불러오지 못했어요.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bookSlug]);

  // 정본 layerOrder/labels — 데이터가 빠진 부분은 정본으로 보강.
  const layerOrderAll: LayerId[] = useMemo(
    () => bookData?.layerOrder ?? DEFAULT_LAYER_ORDER,
    [bookData],
  );
  const layerLabels = useMemo<Record<LayerId, string>>(
    () => ({ ...DEFAULT_LAYER_LABELS, ...(bookData?.layerLabels ?? {}) }),
    [bookData],
  );

  const currentChapter = useMemo<Chapter | null>(() => {
    if (!bookData) return null;
    const found = bookData.chapters.find((c) => c.chapter === chapter);
    if (found) return found;
    return bookData.chapters[bookData.chapters.length - 1] ?? null;
  }, [bookData, chapter]);

  // SSR 초기값은 정본 — hydration 이후 localStorage 로 동기화.
  const [onLayers, setOnLayers] = useState<LayerId[]>(DEFAULT_ON);
  const [layerOrder, setLayerOrder] = useState<LayerId[]>(DEFAULT_LAYER_ORDER);
  const [openWord, setOpenWord] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [draggingId, setDraggingId] = useState<LayerId | null>(null);

  const itemRefs = useRef<Map<LayerId, HTMLButtonElement>>(new Map());
  const dragRef = useRef<{
    id: LayerId;
    startX: number;
    startY: number;
    pointerType: string;
    pointerId: number;
    longPressTimer: number | null;
    active: boolean;
  } | null>(null);
  const suppressClickUntilRef = useRef(0);

  useEffect(() => {
    const storedOn = loadStoredArray(ON_STORAGE_KEY, layerOrderAll);
    if (storedOn && storedOn.length > 0) setOnLayers(storedOn);
    else setOnLayers(bookData?.defaultOn ?? DEFAULT_ON);
    const storedOrder = loadStoredArray(ORDER_STORAGE_KEY, layerOrderAll);
    setLayerOrder(mergedOrder(storedOrder, layerOrderAll));
    setHydrated(true);
  }, [layerOrderAll, bookData]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(ON_STORAGE_KEY, JSON.stringify(onLayers));
    } catch {
      /* ignore */
    }
  }, [onLayers, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(layerOrder));
    } catch {
      /* ignore */
    }
  }, [layerOrder, hydrated]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 1400);
    return () => window.clearTimeout(t);
  }, [toast]);

  const isOn = useCallback((id: LayerId) => onLayers.includes(id), [onLayers]);

  const toggleLayer = useCallback((id: LayerId) => {
    setOnLayers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const toggleWord = useCallback((key: string) => {
    setOpenWord((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleCopy = useCallback(
    async (verse: Verse) => {
      const text = buildVerseCopy(verse, onLayers, layerOrder);
      const ok = await writeClipboard(text);
      setToast(ok ? `${verse.ref} 복사됨` : "복사에 실패했어요");
    },
    [onLayers, layerOrder],
  );

  // ── 드래그 핸들러 ─────────────────────────────────────────────────────────
  const findIdAt = useCallback(
    (x: number, y: number): LayerId | null => {
      for (const id of layerOrder) {
        const el = itemRefs.current.get(id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id;
      }
      return null;
    },
    [layerOrder],
  );

  const endDrag = useCallback(() => {
    const d = dragRef.current;
    if (d?.longPressTimer != null) window.clearTimeout(d.longPressTimer);
    if (d?.active) {
      suppressClickUntilRef.current = Date.now() + SUPPRESS_CLICK_MS;
    }
    dragRef.current = null;
    setDraggingId(null);
  }, []);

  const onItemPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>, id: LayerId) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (dragRef.current) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const longPressTimer =
        e.pointerType === "touch" || e.pointerType === "pen"
          ? window.setTimeout(() => {
              const d = dragRef.current;
              if (!d || d.active) return;
              d.active = true;
              setDraggingId(d.id);
              try {
                (
                  navigator as Navigator & { vibrate?: (p: number) => boolean }
                ).vibrate?.(12);
              } catch {
                /* ignore */
              }
            }, DRAG_TOUCH_HOLD_MS)
          : null;
      dragRef.current = {
        id,
        startX: e.clientX,
        startY: e.clientY,
        pointerType: e.pointerType,
        pointerId: e.pointerId,
        longPressTimer,
        active: false,
      };
    },
    [],
  );

  const onItemPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const dist = Math.hypot(dx, dy);
      if (!d.active) {
        if (d.pointerType === "mouse" && dist > DRAG_MOUSE_PX) {
          d.active = true;
          setDraggingId(d.id);
        } else if (
          (d.pointerType === "touch" || d.pointerType === "pen") &&
          dist > DRAG_TOUCH_CANCEL_PX
        ) {
          if (d.longPressTimer != null) window.clearTimeout(d.longPressTimer);
          dragRef.current = null;
          return;
        }
      }
      if (!d.active) return;
      e.preventDefault();
      const overId = findIdAt(e.clientX, e.clientY);
      if (!overId || overId === d.id) return;
      setLayerOrder((prev) => {
        const from = prev.indexOf(d.id);
        const to = prev.indexOf(overId);
        if (from < 0 || to < 0 || from === to) return prev;
        const next = prev.slice();
        next.splice(from, 1);
        next.splice(to, 0, d.id);
        return next;
      });
    },
    [findIdAt],
  );

  const onItemClick = useCallback(
    (id: LayerId) => {
      if (Date.now() < suppressClickUntilRef.current) {
        suppressClickUntilRef.current = 0;
        return;
      }
      toggleLayer(id);
    },
    [toggleLayer],
  );

  const visibleLayers = useMemo(
    () => layerOrder.filter((id) => onLayers.includes(id)),
    [layerOrder, onLayers],
  );

  const verses = currentChapter?.verses ?? [];
  const bookName = bookData?.book ?? bookLabel;
  const chapterLabel = currentChapter?.chapter ?? chapter;

  return (
    <section className="hpoc" aria-label={`${bookName} ${chapterLabel}장 (히브리어 PoC)`}>
      <header className="hpoc-top">
        <div className="hpoc-titles">
          <h1 className="hpoc-title">
            {bookName} {chapterLabel}장
          </h1>
          <p className="hpoc-sub">
            토글을 드래그(모바일은 길게 눌러서)하면 절 아래로 쌓이는 순서가 바뀌어요 · 히브리어는 오른쪽 → 왼쪽
          </p>
        </div>

        <div className="hpoc-toggles" role="group" aria-label="역본 토글">
          {layerOrder.map((id) => {
            const active = isOn(id);
            const isDrag = draggingId === id;
            return (
              <button
                key={id}
                ref={(el) => {
                  if (el) itemRefs.current.set(id, el);
                  else itemRefs.current.delete(id);
                }}
                type="button"
                className={`hpoc-toggle ${active ? "is-on" : ""} ${
                  isDrag ? "is-dragging" : ""
                } ${draggingId && !isDrag ? "is-drag-other" : ""}`}
                aria-pressed={active}
                aria-grabbed={isDrag}
                onClick={() => onItemClick(id)}
                onPointerDown={(e) => onItemPointerDown(e, id)}
                onPointerMove={onItemPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                style={{ ["--dot" as string]: LAYER_META[id].dot }}
              >
                <span className="hpoc-toggle-grip" aria-hidden="true">
                  <span />
                  <span />
                </span>
                <span className="hpoc-toggle-dot" aria-hidden="true" />
                {layerLabels[id]}
              </button>
            );
          })}
        </div>
      </header>

      {loadError && (
        <p className="hpoc-empty hpoc-error">
          데이터를 불러오는 중 오류가 발생했어요 — {loadError}
        </p>
      )}
      {!bookData && !loadError && <p className="hpoc-empty">불러오는 중…</p>}
      {bookData && verses.length === 0 && (
        <p className="hpoc-empty">이 장에는 절 데이터가 없어요.</p>
      )}
      {bookData && verses.length > 0 && visibleLayers.length === 0 && (
        <p className="hpoc-empty">위에서 역본을 하나 이상 켜 주세요.</p>
      )}

      <ol className="hpoc-verses">
        {verses.map((verse) => {
          const n = verse.ref.split(":").pop();
          return (
            <li key={verse.ref} className="hpoc-verse">
              <div className="hpoc-verse-head">
                <span className="hpoc-verse-num" aria-hidden="true">
                  {n}
                </span>
                <button
                  type="button"
                  className="hpoc-copy"
                  onClick={() => handleCopy(verse)}
                  aria-label={`${verse.ref} 켠 역본 복사`}
                  title="켠 역본 복사"
                >
                  <CopyIcon />
                </button>
              </div>

              <div className="hpoc-layers">
                {visibleLayers.map((id) => {
                  const layer = verse.layers[id];
                  if (!layer) return null;
                  const meta = LAYER_META[id];
                  return (
                    <div key={id} className={`hpoc-layer hpoc-layer--${id}`}>
                      <span
                        className="hpoc-tag"
                        style={{ ["--dot" as string]: meta.dot }}
                      >
                        <span className="hpoc-tag-dot" aria-hidden="true" />
                        <span className="hpoc-tag-text">{meta.short}</span>
                      </span>

                      {layer.type === "text" ? (
                        <p className="hpoc-text" lang="ko">
                          {layer.content}
                        </p>
                      ) : (
                        <div className="hpoc-hebrew">
                          <div className="hpoc-words" dir="rtl">
                            {layer.words.map((w, i) => {
                              const key = `${verse.ref}#${i}`;
                              const open = openWord.has(key);
                              return (
                                <button
                                  type="button"
                                  key={key}
                                  className={`hpoc-word ${open ? "is-open" : ""}`}
                                  aria-expanded={open}
                                  aria-label={`${w.word} (${w.pron}) 상세 ${
                                    open ? "닫기" : "열기"
                                  }`}
                                  onClick={() => toggleWord(key)}
                                >
                                  <span className="hpoc-word-h" lang="he" dir="rtl">
                                    {w.word}
                                  </span>
                                  <span className="hpoc-word-p" aria-hidden="true">
                                    {w.pron || "\u00A0"}
                                  </span>
                                  <span className="hpoc-word-m" aria-hidden="true">
                                    {w.meaning || "\u00A0"}
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          {layer.words.map((w, i) => {
                            const key = `${verse.ref}#${i}`;
                            if (!openWord.has(key)) return null;
                            return (
                              <article key={`d-${key}`} className="hpoc-detail">
                                <header className="hpoc-detail-head">
                                  <span className="hpoc-detail-w" lang="he" dir="rtl">
                                    {w.word}
                                  </span>
                                  {w.pron && (
                                    <span className="hpoc-detail-p">{w.pron}</span>
                                  )}
                                </header>
                                <dl className="hpoc-detail-grid">
                                  <dt>원형</dt>
                                  <dd lang="he" dir="rtl">
                                    {w.lemma}
                                  </dd>
                                  {w.strong && (
                                    <>
                                      <dt>Strong&apos;s</dt>
                                      <dd>{w.strong}</dd>
                                    </>
                                  )}
                                  {w.morph && (
                                    <>
                                      <dt>문법</dt>
                                      <dd>{w.morph}</dd>
                                    </>
                                  )}
                                  {w.meaning && (
                                    <>
                                      <dt>뜻</dt>
                                      <dd>{w.meaning}</dd>
                                    </>
                                  )}
                                </dl>
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>

      <footer className="hpoc-footer">
        <small>
          히브리어 본문 Westminster Leningrad Codex (퍼블릭 도메인) · 형태 분석
          Open Scriptures Hebrew Bible (CC BY 4.0) · 사전 OSHB HebrewLexicon
          (Strong&apos;s, 퍼블릭 도메인) · 개역한글 (퍼블릭 도메인) · 어린이 의역은
          개역한글 기반으로 직접 제작한 학습용 자료입니다.
        </small>
      </footer>

      {toast && (
        <div className="hpoc-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      <style jsx>{`
        .hpoc {
          --hpoc-ink: var(--ink, #16161a);
          --hpoc-soft: var(--ink-soft, #6b6b70);
          --hpoc-mute: var(--ink-mute, #9a9aa0);
          --hpoc-line: var(--line, #e6e6e2);
          --hpoc-surface: var(--surface, #fff);
          --hpoc-accent: var(--accent, #7a4e2a);
          max-width: min(100%, 820px);
          margin: 0 auto;
          padding: 0 16px 80px;
          color: var(--hpoc-ink);
          font-family: var(--reader-font-family, inherit);
          font-size: 16px;
        }

        .hpoc-top {
          position: sticky;
          top: 0;
          z-index: 5;
          background: color-mix(in srgb, var(--bg, #fafaf8) 92%, transparent);
          backdrop-filter: saturate(1.2) blur(8px);
          padding: 16px 0 12px;
          margin-bottom: 8px;
          border-bottom: 1px solid var(--hpoc-line);
        }
        .hpoc-titles {
          margin-bottom: 12px;
        }
        .hpoc-title {
          margin: 0;
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -0.01em;
        }
        .hpoc-sub {
          margin: 4px 0 0;
          font-size: 13px;
          color: var(--hpoc-soft);
        }
        .hpoc-toggles {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .hpoc-toggle {
          appearance: none;
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 8px 14px 8px 10px;
          font: inherit;
          font-size: 14px;
          font-weight: 600;
          color: var(--hpoc-soft);
          background: var(--hpoc-surface);
          border: 1px solid var(--hpoc-line);
          border-radius: 999px;
          touch-action: none;
          -webkit-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
          cursor: grab;
          transition: background 0.15s ease, color 0.15s ease,
            border-color 0.15s ease, transform 0.18s ease,
            box-shadow 0.18s ease, opacity 0.18s ease;
        }
        .hpoc-toggle:hover {
          border-color: var(--dot);
          color: var(--hpoc-ink);
        }
        .hpoc-toggle.is-on {
          background: color-mix(in srgb, var(--dot) 14%, var(--hpoc-surface));
          border-color: color-mix(in srgb, var(--dot) 55%, transparent);
          color: var(--hpoc-ink);
        }
        .hpoc-toggle.is-dragging {
          cursor: grabbing;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
          transform: translateY(-1px) scale(1.04);
          z-index: 6;
        }
        .hpoc-toggle.is-drag-other {
          opacity: 0.6;
        }
        .hpoc-toggle-grip {
          display: inline-flex;
          flex-direction: column;
          justify-content: center;
          gap: 2px;
          width: 8px;
          height: 12px;
          opacity: 0.45;
        }
        .hpoc-toggle-grip > span {
          display: block;
          height: 2px;
          background: currentColor;
          border-radius: 1px;
        }
        .hpoc-toggle-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: var(--dot);
        }

        .hpoc-empty {
          margin: 24px 0;
          color: var(--hpoc-soft);
          font-size: 14px;
        }
        .hpoc-error {
          color: #a14545;
        }

        .hpoc-verses {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .hpoc-verse {
          padding: 12px 0;
          border-bottom: 1px solid var(--hpoc-line);
        }
        .hpoc-verse-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 6px;
        }
        .hpoc-verse-num {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 22px;
          height: 22px;
          padding: 0 6px;
          background: var(--hpoc-line);
          color: var(--hpoc-soft);
          border-radius: 999px;
          font-size: 12px;
          font-weight: 600;
        }
        .hpoc-copy {
          appearance: none;
          background: transparent;
          border: 1px solid var(--hpoc-line);
          color: var(--hpoc-soft);
          width: 30px;
          height: 30px;
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .hpoc-copy:hover {
          color: var(--hpoc-ink);
          border-color: var(--hpoc-mute);
        }

        .hpoc-layers {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .hpoc-layer {
          display: grid;
          grid-template-columns: 64px 1fr;
          gap: 10px;
          align-items: start;
        }
        .hpoc-tag {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding-top: 4px;
          color: var(--hpoc-soft);
          font-size: 12px;
          font-weight: 600;
        }
        .hpoc-tag-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: var(--dot);
        }

        .hpoc-text {
          margin: 0;
          color: var(--hpoc-ink);
          line-height: var(--line-height, 1.55);
        }

        /* ── 히브리어 단어 블록 (RTL) ── */
        .hpoc-hebrew {
          min-width: 0;
        }
        .hpoc-words {
          display: flex;
          flex-wrap: wrap;
          gap: 7px 5px;
          margin-right: -5px;
        }
        .hpoc-word {
          appearance: none;
          background: transparent;
          border: 1px solid transparent;
          padding: 2px 5px 3px;
          border-radius: 6px;
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          gap: 1px;
          line-height: 1.1;
          cursor: pointer;
          font: inherit;
          color: inherit;
          transition: background 0.12s ease, border-color 0.12s ease;
        }
        .hpoc-word:hover {
          background: rgba(0, 0, 0, 0.04);
        }
        .hpoc-word.is-open {
          background: color-mix(in srgb, var(--hpoc-accent) 10%, var(--hpoc-surface));
          border-color: color-mix(in srgb, var(--hpoc-accent) 35%, transparent);
        }
        .hpoc-word-h {
          /* 히브리어는 SBL Hebrew 등 닉쿠드 지원 폰트 우선. */
          font-family: "SBL Hebrew", "Ezra SIL", "Frank Ruehl CLM",
            "Times New Roman", serif;
          font-size: 20px;
          font-weight: 500;
          color: var(--hpoc-ink);
          white-space: nowrap;
        }
        .hpoc-word-p {
          font-size: 11px;
          color: #6c7e9b;
          white-space: nowrap;
        }
        .hpoc-word-m {
          font-size: 11px;
          color: color-mix(in srgb, var(--hpoc-accent) 60%, var(--hpoc-mute));
          white-space: nowrap;
        }

        /* ── 단어 상세 카드 ── */
        .hpoc-detail {
          margin: 8px 0 2px;
          padding: 2px 0 4px 12px;
          border-left: 2px solid
            color-mix(in srgb, var(--hpoc-accent) 55%, transparent);
        }
        .hpoc-detail-head {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }
        .hpoc-detail-w {
          font-family: "SBL Hebrew", "Ezra SIL", "Frank Ruehl CLM",
            "Times New Roman", serif;
          font-size: 19px;
        }
        .hpoc-detail-p {
          font-size: 12px;
          color: var(--hpoc-soft);
        }
        .hpoc-detail-grid {
          display: grid;
          grid-template-columns: 64px 1fr;
          gap: 2px 10px;
          margin: 0;
          font-size: 13px;
        }
        .hpoc-detail-grid dt {
          color: var(--hpoc-mute);
          font-weight: 600;
        }
        .hpoc-detail-grid dd {
          margin: 0;
        }

        .hpoc-footer {
          margin-top: 24px;
          padding-top: 12px;
          border-top: 1px solid var(--hpoc-line);
          color: var(--hpoc-mute);
          font-size: 11px;
          line-height: 1.5;
        }

        .hpoc-toast {
          position: fixed;
          left: 50%;
          bottom: 24px;
          transform: translateX(-50%);
          background: rgba(0, 0, 0, 0.85);
          color: #fff;
          padding: 8px 14px;
          border-radius: 999px;
          font-size: 13px;
          z-index: 50;
        }

        @media (max-width: 540px) {
          .hpoc-layer {
            grid-template-columns: 52px 1fr;
            gap: 8px;
          }
          .hpoc-tag-text {
            font-size: 11px;
          }
          .hpoc-word-h {
            font-size: 19px;
          }
        }
      `}</style>
    </section>
  );
}
