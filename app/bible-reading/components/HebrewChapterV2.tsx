"use client";

/**
 * HebrewChapterV2 — "히브리어 보기" 새 구조 (구약 책별 공통).
 *
 * 화면 구조는 GreekChapterV2 와 동일하다(절마다 3줄 단어 블록 + ▾ 한글 의역
 * + 단어 클릭 시 상세 카드). 차이점은 두 가지:
 *
 *   1) 본문은 오른쪽 → 왼쪽 (RTL). 단어 블록 안에서 히브리어 줄은 자체
 *      `dir="rtl"` 로 자모를 자연스럽게 배열하고, 단어 블록을 담는 flex
 *      컨테이너에도 `direction: rtl` 을 주어 단어 자체도 오른쪽에서 흐른다.
 *      발음/뜻 줄은 한국어이므로 자체적으로 `dir="ltr"` 로 다시 뒤집어
 *      한국어 사용자의 시각 흐름을 유지한다.
 *   2) 출처 표기는 OSHB(CC BY 4.0) + WLC(공개 도메인) + HebrewLexicon
 *      (Strong's, 공개 도메인) 으로 변경.
 *
 * 데이터:
 *   - `bookId` 에 따라 `<book>-v2.json` 을 lazy import. 헬라어와 동일 형태이지만
 *     `copyHebrew` 필드를 사용한다.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

type TanakhId =
  | "genesis"
  | "exodus"
  | "leviticus"
  | "numbers"
  | "deuteronomy"
  | "joshua"
  | "judges"
  | "ruth"
  | "samuel1"
  | "samuel2"
  | "kings1"
  | "kings2"
  | "chronicles1"
  | "chronicles2"
  | "ezra"
  | "nehemiah"
  | "esther"
  | "job"
  | "psalms"
  | "proverbs"
  | "ecclesiastes"
  | "songofsolomon"
  | "isaiah"
  | "jeremiah"
  | "lamentations"
  | "ezekiel"
  | "daniel"
  | "hosea"
  | "joel"
  | "amos"
  | "obadiah"
  | "jonah"
  | "micah"
  | "nahum"
  | "habakkuk"
  | "zephaniah"
  | "haggai"
  | "zechariah"
  | "malachi";

async function loadTanakhData(book: TanakhId): Promise<V2Data> {
  switch (book) {
    case "genesis":
      return (await import("../genesis-v2.json")).default as V2Data;
    case "exodus":
      return (await import("../exodus-v2.json")).default as V2Data;
    case "leviticus":
      return (await import("../leviticus-v2.json")).default as V2Data;
    case "numbers":
      return (await import("../numbers-v2.json")).default as V2Data;
    case "deuteronomy":
      return (await import("../deuteronomy-v2.json")).default as V2Data;
    case "joshua":
      return (await import("../joshua-v2.json")).default as V2Data;
    case "judges":
      return (await import("../judges-v2.json")).default as V2Data;
    case "ruth":
      return (await import("../ruth-v2.json")).default as V2Data;
    case "samuel1":
      return (await import("../samuel1-v2.json")).default as V2Data;
    case "samuel2":
      return (await import("../samuel2-v2.json")).default as V2Data;
    case "kings1":
      return (await import("../kings1-v2.json")).default as V2Data;
    case "kings2":
      return (await import("../kings2-v2.json")).default as V2Data;
    case "chronicles1":
      return (await import("../chronicles1-v2.json")).default as V2Data;
    case "chronicles2":
      return (await import("../chronicles2-v2.json")).default as V2Data;
    case "ezra":
      return (await import("../ezra-v2.json")).default as V2Data;
    case "nehemiah":
      return (await import("../nehemiah-v2.json")).default as V2Data;
    case "esther":
      return (await import("../esther-v2.json")).default as V2Data;
    case "job":
      return (await import("../job-v2.json")).default as V2Data;
    case "psalms":
      return (await import("../psalms-v2.json")).default as V2Data;
    case "proverbs":
      return (await import("../proverbs-v2.json")).default as V2Data;
    case "ecclesiastes":
      return (await import("../ecclesiastes-v2.json")).default as V2Data;
    case "songofsolomon":
      return (await import("../songofsolomon-v2.json")).default as V2Data;
    case "isaiah":
      return (await import("../isaiah-v2.json")).default as V2Data;
    case "jeremiah":
      return (await import("../jeremiah-v2.json")).default as V2Data;
    case "lamentations":
      return (await import("../lamentations-v2.json")).default as V2Data;
    case "ezekiel":
      return (await import("../ezekiel-v2.json")).default as V2Data;
    case "daniel":
      return (await import("../daniel-v2.json")).default as V2Data;
    case "hosea":
      return (await import("../hosea-v2.json")).default as V2Data;
    case "joel":
      return (await import("../joel-v2.json")).default as V2Data;
    case "amos":
      return (await import("../amos-v2.json")).default as V2Data;
    case "obadiah":
      return (await import("../obadiah-v2.json")).default as V2Data;
    case "jonah":
      return (await import("../jonah-v2.json")).default as V2Data;
    case "micah":
      return (await import("../micah-v2.json")).default as V2Data;
    case "nahum":
      return (await import("../nahum-v2.json")).default as V2Data;
    case "habakkuk":
      return (await import("../habakkuk-v2.json")).default as V2Data;
    case "zephaniah":
      return (await import("../zephaniah-v2.json")).default as V2Data;
    case "haggai":
      return (await import("../haggai-v2.json")).default as V2Data;
    case "zechariah":
      return (await import("../zechariah-v2.json")).default as V2Data;
    case "malachi":
      return (await import("../malachi-v2.json")).default as V2Data;
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
  strong?: string;
};

type V2Verse = {
  n: number;
  copyHebrew: string;
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
    lang?: string;
    dir?: string;
    sources: Record<string, string>;
  };
  chapters: V2Chapter[];
};

type CopyMode = "hebrew" | "kr" | "both";
type CopyTarget = {
  verseN: number | "chapter";
  tokenIdx?: number;
  point: { x: number; y: number };
} | null;

const COPY_MODE_LABEL: Record<CopyMode, string> = {
  hebrew: "히브리어만",
  kr: "한글만",
  both: "히브리어+한글",
};

const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOL = 10;
const SUPPRESS_CLICK_MS = 600;

function buildCopyText(
  mode: CopyMode,
  verses: V2Verse[],
  header?: string,
): string {
  const lines: string[] = [];
  if (header && header.trim()) lines.push(header.trim(), "");
  for (const v of verses) {
    if (mode === "hebrew") {
      lines.push(`${v.n} ${v.copyHebrew}`);
    } else if (mode === "kr") {
      lines.push(`${v.n} ${v.copyKr}`);
    } else {
      lines.push(`${v.n} ${v.copyHebrew}`);
      lines.push(`   ${v.copyKr}`);
    }
  }
  return lines.join("\n");
}

function buildTokenCopyText(mode: CopyMode, tk: V2Token): string {
  const ko: string[] = [];
  if (tk.p) ko.push(tk.p);
  if (tk.gloss) ko.push(tk.gloss);
  const koStr = ko.join(" · ");
  if (mode === "hebrew") return tk.w;
  if (mode === "kr") return koStr || tk.w;
  return koStr ? `${tk.w} — ${koStr}` : tk.w;
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall-through */
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && el.closest('[data-hebrew-copy-menu="true"]')) return;
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
  const top = Math.min(window.innerHeight - 140, Math.max(8, point.y + 6));
  const left = Math.min(window.innerWidth - 170, Math.max(8, point.x - 80));
  return (
    <div
      className="brp-h2-copy-menu"
      data-hebrew-copy-menu="true"
      style={{ top, left }}
      role="menu"
      aria-label="복사 옵션"
    >
      {(["hebrew", "kr", "both"] as CopyMode[]).map((m) => (
        <button
          key={m}
          type="button"
          role="menuitem"
          className="brp-h2-copy-menu-item"
          onClick={() => onPick(m)}
        >
          {COPY_MODE_LABEL[m]}
        </button>
      ))}
    </div>
  );
}

type Props = {
  bookId: TanakhId;
  bookLabel?: string;
  chapterLabel?: string;
  chapter: number;
};

const DATA_CACHE = new Map<TanakhId, V2Data>();

export default function HebrewChapterV2({
  bookId,
  bookLabel = "창세기",
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
    loadTanakhData(bookId).then((d) => {
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
    return new Map<number, V2Chapter>(
      data.chapters.map((c) => [c.chapter, c]),
    );
  }, [data]);

  const chapterData = chapterIndex.get(chapter);
  const verses = chapterData?.verses ?? [];
  const resolvedChapterLabel = chapterLabel ?? `${chapter}장`;

  const [openKr, setOpenKr] = useState<Set<number>>(() => new Set());
  const [openToken, setOpenToken] = useState<Set<string>>(() => new Set());

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

  const [copyTarget, setCopyTarget] = useState<CopyTarget>(null);
  const [toast, setToast] = useState<string | null>(null);

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

  const stopPointer = useCallback((e: ReactPointerEvent) => {
    e.stopPropagation();
  }, []);

  const totalTokens = useMemo(
    () => verses.reduce((s, v) => s + v.tokens.length, 0),
    [verses],
  );

  if (!data) {
    return (
      <section className="brp-h2" aria-busy="true">
        <header className="brp-h2-header">
          <div className="brp-h2-title">
            <strong>
              {bookLabel} {resolvedChapterLabel}
            </strong>
            <span className="brp-h2-meta">불러오는 중…</span>
          </div>
        </header>
        <div className="brp-h2-loading">히브리어 본문을 가져오고 있어요…</div>
      </section>
    );
  }

  if (!chapterData) {
    return (
      <section className="brp-h2">
        <header className="brp-h2-header">
          <div className="brp-h2-title">
            <strong>
              {bookLabel} {resolvedChapterLabel}
            </strong>
            <span className="brp-h2-meta">자료 없음</span>
          </div>
        </header>
        <div className="brp-h2-loading">이 장의 히브리어 자료가 아직 없어요.</div>
      </section>
    );
  }

  return (
    <section
      className="brp-h2"
      aria-label={`${bookLabel} ${resolvedChapterLabel} 히브리어`}
    >
      <header className="brp-h2-header">
        <div className="brp-h2-title">
          <strong>
            {bookLabel} {resolvedChapterLabel}
          </strong>
          <span className="brp-h2-meta">
            {verses.length}절 · 단어 {totalTokens}개
          </span>
        </div>
        <button
          type="button"
          className="brp-h2-chapter-copy"
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

      <ol className="brp-h2-verses">
        {verses.map((v) => {
          const krOpen = openKr.has(v.n);
          return (
            <li
              key={v.n}
              className="brp-h2-verse"
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
              <span className="brp-h2-verse-num" aria-hidden="true">
                {v.n}
              </span>
              <div className="brp-h2-verse-body">
                {/* RTL 단어 컨테이너 — flex 가 오른쪽부터 흐름. ▾ 버튼은 LTR
                    톤이라 컨테이너 안에서 시각적으로 좌측 끝에 보이도록
                    배치 (DOM 상 가장 마지막). */}
                <div className="brp-h2-tokens" dir="rtl">
                  {v.tokens.map((tk, i) => {
                    const key = `${v.n}:${i}`;
                    const isOpen = openToken.has(key);
                    const ord = tokenOrdinal.get(key);
                    return (
                      <button
                        type="button"
                        key={key}
                        className={`brp-h2-token ${isOpen ? "is-open" : ""} ${
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
                            className="brp-h2-token-ord"
                            aria-hidden="true"
                          >
                            {ord}
                          </span>
                        )}
                        <span className="brp-h2-token-w" lang="he" dir="rtl">
                          {tk.w}
                        </span>
                        <span
                          className="brp-h2-token-p"
                          aria-hidden="true"
                          dir="ltr"
                        >
                          {tk.p || "\u00A0"}
                        </span>
                        <span
                          className="brp-h2-token-g"
                          aria-hidden="true"
                          dir="ltr"
                        >
                          {tk.gloss || "\u00A0"}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className={`brp-h2-kr-chev ${krOpen ? "is-open" : ""}`}
                    aria-expanded={krOpen}
                    aria-label={`${v.n}절 한글 의역 ${
                      krOpen ? "접기" : "펼치기"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleKr(v.n);
                    }}
                    dir="ltr"
                  >
                    <span aria-hidden="true">▾</span>
                  </button>
                </div>

                {(() => {
                  const openItems = Array.from(openToken)
                    .filter((k) => k.startsWith(`${v.n}:`))
                    .map((k) => {
                      const i = parseInt(k.split(":")[1], 10);
                      return {
                        k,
                        i,
                        tk: v.tokens[i],
                        ord: tokenOrdinal.get(k)!,
                      };
                    });
                  if (openItems.length === 0) return null;
                  return (
                    <div className="brp-h2-detail-panels">
                      {openItems.map(({ tk, k, ord }) => (
                        <article
                          key={`d-${k}`}
                          className="brp-h2-detail"
                          role="region"
                          aria-label={`${ord}번째로 펼친 단어 ${tk.w} 상세`}
                        >
                          <header className="brp-h2-detail-head">
                            <span
                              className="brp-h2-detail-ord"
                              aria-hidden="true"
                            >
                              {ord}
                            </span>
                            <span
                              className="brp-h2-detail-w"
                              lang="he"
                              dir="rtl"
                            >
                              {tk.w}
                            </span>
                            <span className="brp-h2-detail-p">{tk.p}</span>
                            {tk.nameType && (
                              <span
                                className={`brp-h2-detail-tag is-${tk.nameType}`}
                              >
                                {tk.nameType === "person" ? "인명" : "지명"}
                              </span>
                            )}
                          </header>
                          <dl className="brp-h2-detail-grid">
                            <dt>사전형</dt>
                            <dd>
                              <span lang="he" dir="rtl">
                                {tk.lemma}
                              </span>
                              {tk.lemmaP && (
                                <span className="brp-h2-mute">
                                  {" "}
                                  ({tk.lemmaP})
                                </span>
                              )}
                              {tk.strong && (
                                <span className="brp-h2-mute">
                                  {" "}
                                  · Strong's {tk.strong}
                                </span>
                              )}
                            </dd>
                            <dt>품사</dt>
                            <dd>{tk.posLabel || "—"}</dd>
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

                {krOpen && (
                  <p className="brp-h2-kr" lang="ko">
                    <span className="brp-h2-kr-n" aria-hidden="true">
                      {v.n}
                    </span>
                    {v.copyKr}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <footer className="brp-h2-footer">
        <small>
          본문 · 형태 분석 © Open Scriptures Hebrew Bible (WLC + morphhb,
          CC BY 4.0) · 사전 © OSHB HebrewLexicon (Strong's, Public Domain) ·
          한국어 의역·풀이는 학습용으로 직접 작성. · 절을 길게 누르면 복사 메뉴가
          나옵니다.
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
        <div className="brp-h2-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      <style jsx>{`
        .brp-h2 {
          --h2-ink: var(--ink, #1f1f1f);
          --h2-soft: var(--ink-mute, rgba(0, 0, 0, 0.5));
          --h2-pron: #6c7e9b;
          --h2-gloss: color-mix(
            in srgb,
            var(--accent, #3b6c47) 55%,
            var(--ink-mute, rgba(0, 0, 0, 0.5)) 45%
          );
          --h2-hl: color-mix(
            in srgb,
            var(--accent, #3b6c47) 100%,
            #000 12%
          );
          --h2-kr-ink: var(--ink, #1f1f1f);
        }
        .brp-h2 {
          max-width: min(100%, 1080px);
          margin: 0 auto;
          padding: 4px 0 24px;
          color: var(--h2-ink);
          font-size: calc(
            clamp(16px, 1.6vw, 19px) * var(--reader-size-scale, 1)
          );
          line-height: var(--reader-text-line-height, 1.55);
        }
        .brp-h2-loading {
          padding: 24px 8px;
          color: var(--h2-soft);
          font-size: 0.95em;
          text-align: center;
        }
        .brp-h2-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 6px 0 10px;
          border-bottom: 1px dashed var(--line, rgba(0, 0, 0, 0.12));
          margin-bottom: 8px;
        }
        .brp-h2-title {
          display: flex;
          align-items: baseline;
          gap: 10px;
          min-width: 0;
        }
        .brp-h2-title strong {
          font-size: 1.05em;
          font-weight: 600;
        }
        .brp-h2-meta {
          font-size: 0.78em;
          color: var(--h2-soft);
        }
        .brp-h2-chapter-copy {
          appearance: none;
          background: transparent;
          border: 1px solid var(--line, rgba(0, 0, 0, 0.16));
          padding: 4px 10px;
          font: inherit;
          font-size: 0.8em;
          font-weight: 600;
          color: var(--h2-soft);
          border-radius: 999px;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease,
            border-color 0.15s ease;
        }
        .brp-h2-chapter-copy:hover {
          color: var(--h2-ink);
          background: rgba(0, 0, 0, 0.04);
          border-color: var(--line-strong, var(--line));
        }
        .brp-h2-verses {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .brp-h2-verse {
          position: relative;
          display: grid;
          grid-template-columns: 2em minmax(0, 1fr);
          column-gap: clamp(8px, 1vw, 12px);
          align-items: baseline;
          padding: 2px 0 8px 0;
          border-bottom: 1px solid var(--line, rgba(0, 0, 0, 0.06));
          -webkit-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
        }
        .brp-h2-verse-body {
          min-width: 0;
        }
        .brp-h2-verse :global(.brp-h2-detail) {
          -webkit-user-select: text;
          user-select: text;
        }
        .brp-h2-verse :global(.brp-h2-kr) {
          -webkit-user-select: text;
          user-select: text;
        }
        .brp-h2-verse:last-child {
          border-bottom: none;
        }
        .brp-h2-kr-chev {
          appearance: none;
          background: transparent;
          border: none;
          padding: 2px 4px;
          font: inherit;
          font-size: 0.78em;
          color: var(--h2-soft);
          cursor: pointer;
          line-height: 1;
          border-radius: 4px;
          transition: color 0.15s ease, background 0.15s ease;
          align-self: center;
        }
        .brp-h2-kr-chev:hover {
          color: var(--h2-ink);
          background: rgba(0, 0, 0, 0.04);
        }
        .brp-h2-kr-chev > span {
          display: inline-block;
          transform: rotate(0deg);
          transition: transform 0.18s ease;
        }
        .brp-h2-kr-chev.is-open > span {
          transform: rotate(180deg);
        }
        .brp-h2-kr-chev.is-open {
          color: var(--h2-hl);
          background: color-mix(
            in srgb,
            var(--accent, #3b6c47) 10%,
            transparent
          );
        }
        .brp-h2-verse-num {
          color: var(--ink-mute);
          font-size: 1em;
          font-weight: 400;
          line-height: inherit;
          text-align: center;
          font-variant-numeric: tabular-nums;
          transition: color 0.25s ease;
        }
        .brp-h2-kr {
          margin: 8px 0 2px 0;
          padding: 6px 12px 6px 12px;
          border-left: 3px solid
            color-mix(in srgb, var(--accent, #3b6c47) 60%, transparent);
          background: color-mix(
            in srgb,
            var(--accent, #3b6c47) 6%,
            transparent
          );
          border-radius: 0 4px 4px 0;
          color: var(--h2-kr-ink);
          font-size: 0.96em;
          line-height: 1.7;
          word-break: keep-all;
          overflow-wrap: break-word;
          text-indent: 0;
        }
        .brp-h2-kr-n {
          display: inline-block;
          font-weight: 600;
          color: var(--h2-hl);
          margin-right: 6px;
          font-size: 0.92em;
        }
        /* ── RTL 단어 컨테이너 ──
           히브리어 문장은 오른쪽 → 왼쪽 흐름. flex-wrap 은 그대로 사용해도
           direction: rtl 환경에서 행은 오른쪽 끝에서 시작해 왼쪽으로 흐르고
           wrap 시 다음 행도 오른쪽 끝부터 채워진다. */
        .brp-h2-tokens {
          display: flex;
          flex-wrap: wrap;
          gap: 6px 4px;
          padding: 2px 0 0;
          margin-left: -5px;
          margin-right: -5px;
          /* direction: rtl 은 inline 속성으로 dir="rtl" 이 이미 켜져 있어
             기본 layout 도 RTL. 자식 토큰은 자체 dir 을 명시해 안전. */
        }
        .brp-h2-token {
          appearance: none;
          background: transparent;
          border: 1px solid transparent;
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
          line-height: 1.05;
          position: relative;
          transition: background 0.12s ease, border-color 0.12s ease;
          /* 각 토큰 안쪽은 다시 LTR (Hangul/Latin 발음·뜻 줄이 자연 정렬). */
          direction: ltr;
        }
        .brp-h2-token-ord {
          position: absolute;
          top: -4px;
          /* RTL 컨테이너에서 토큰 자체는 LTR — 순번 뱃지를 시각적 우측(읽기
             기준 끝쪽) 에 두기 위해 left:auto/right:-3px. */
          right: -3px;
          left: auto;
          min-width: 0.95em;
          height: 0.95em;
          padding: 0 0.25em;
          background: var(--h2-hl);
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
        .brp-h2-token:hover {
          background: rgba(0, 0, 0, 0.035);
        }
        .brp-h2-token.is-open {
          background: color-mix(
            in srgb,
            var(--accent, #3b6c47) 10%,
            var(--surface, #fff)
          );
          border-color: color-mix(
            in srgb,
            var(--accent, #3b6c47) 35%,
            transparent
          );
        }
        .brp-h2-token-w {
          /* 히브리어용 글꼴 폴백 체인. macOS·iOS 의 SBL Hebrew 가 있으면 우선,
             없으면 Times New Roman 의 히브리 글리프를 사용. */
          font-family: "SBL Hebrew", "Ezra SIL", "Frank Ruehl CLM",
            "Times New Roman", "Arial Hebrew", serif;
          font-variant-ligatures: none;
          font-size: 1.22em;
          font-weight: 500;
          color: var(--h2-ink);
          letter-spacing: 0;
          white-space: nowrap;
          line-height: 1.25;
          /* 칸틸레이션 마크 일부는 글자 위로 솟는다 — 윗줄과 겹치지 않게 살짝
             패딩. */
          padding-top: 0.05em;
        }
        .brp-h2-token-p {
          font-size: 0.72em;
          color: var(--h2-pron);
          letter-spacing: -0.01em;
          white-space: nowrap;
        }
        .brp-h2-token-g {
          font-size: 0.72em;
          color: var(--h2-gloss);
          letter-spacing: -0.01em;
          white-space: nowrap;
        }
        .brp-h2-token.is-person .brp-h2-token-g,
        .brp-h2-token.is-place .brp-h2-token-g {
          color: var(--h2-hl);
        }
        .brp-h2-detail-panels {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin: 6px 0 4px;
        }
        .brp-h2-detail {
          padding: 2px 0 2px 12px;
          background: transparent;
          border: none;
          border-left: 2px solid
            color-mix(in srgb, var(--accent, #3b6c47) 55%, transparent);
          border-radius: 0;
        }
        .brp-h2-detail-head {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 2px;
        }
        .brp-h2-detail-ord {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 20px;
          height: 20px;
          padding: 0 6px;
          background: var(--h2-hl);
          color: var(--bg, #fff);
          border-radius: 999px;
          font-size: 0.74em;
          font-weight: 700;
          line-height: 1;
          flex: 0 0 auto;
        }
        .brp-h2-detail-w {
          font-family: "SBL Hebrew", "Ezra SIL", "Times New Roman",
            "Arial Hebrew", serif;
          font-size: 1.2em;
          font-weight: 600;
          color: var(--h2-ink);
          background: color-mix(
            in srgb,
            var(--accent, #3b6c47) 8%,
            transparent
          );
          padding: 1px 7px 2px;
          border-radius: 4px;
        }
        .brp-h2-detail-p {
          font-size: 0.85em;
          color: var(--h2-pron);
          font-weight: 500;
        }
        .brp-h2-detail-tag {
          margin-left: auto;
          font-size: 0.72em;
          padding: 2px 8px;
          border-radius: 999px;
          background: color-mix(
            in srgb,
            var(--accent, #3b6c47) 18%,
            transparent
          );
          color: var(--h2-hl);
          font-weight: 700;
          letter-spacing: 0.01em;
        }
        .brp-h2-detail-grid {
          display: grid;
          grid-template-columns: 56px minmax(0, 1fr);
          column-gap: 12px;
          row-gap: 4px;
          margin: 0;
          font-size: 0.9em;
          line-height: 1.6;
        }
        .brp-h2-detail-grid dt {
          color: var(--h2-soft);
          font-weight: 600;
          font-size: 0.85em;
          padding-top: 1px;
        }
        .brp-h2-detail-grid dd {
          margin: 0;
          color: var(--h2-ink);
          overflow-wrap: break-word;
          word-break: keep-all;
        }
        .brp-h2-mute {
          color: var(--h2-soft);
          font-size: 0.95em;
        }
        .brp-h2-footer {
          margin-top: 18px;
          padding-top: 10px;
          border-top: 1px dashed var(--line, rgba(0, 0, 0, 0.12));
          color: var(--h2-soft);
          font-size: 0.74em;
          line-height: 1.55;
        }
        .brp-h2-toast {
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
          animation: brp-h2-toast-in 0.16s ease-out;
        }
        @keyframes brp-h2-toast-in {
          from {
            opacity: 0;
            transform: translate(-50%, 6px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
        @media (max-width: 480px) {
          .brp-h2-tokens {
            gap: 4px 3px;
            margin-left: -4px;
            margin-right: -4px;
          }
          .brp-h2-token {
            padding: 2px 4px 3px;
            gap: 1px;
          }
        }
        @media (min-width: 900px) {
          .brp-h2-tokens {
            gap: 7px 5px;
          }
        }
      `}</style>
      <style jsx global>{`
        .brp-h2-copy-menu {
          position: fixed;
          z-index: 60;
          min-width: 150px;
          padding: 6px;
          background: var(--surface, #fff);
          border: 1px solid var(--line-strong, var(--line, rgba(0, 0, 0, 0.16)));
          border-radius: 10px;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
          display: flex;
          flex-direction: column;
          gap: 2px;
          animation: brp-h2-menu-in 0.12s ease-out;
        }
        @keyframes brp-h2-menu-in {
          from {
            opacity: 0;
            transform: translateY(-4px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .brp-h2-copy-menu-item {
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
        .brp-h2-copy-menu-item:hover,
        .brp-h2-copy-menu-item:focus-visible {
          background: color-mix(
            in srgb,
            var(--accent, #3b6c47) 12%,
            transparent
          );
        }
      `}</style>
    </section>
  );
}
