"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import { BOOKS, type BookId } from "../../bible-reading/books";
import {
  familyItem,
  loadWordLexicon,
  parsePhraseRef,
  tokensInVerse,
  type WordStudyLexicon,
  type WordStudyToken,
} from "../lib/wordStudy";

type Props = {
  open: boolean;
  bookId: string;
  chapter: number;
  verse: number;
  tokens: WordStudyToken[];
  initial: WordStudyToken | null;
  /** 사용자가 본문에서 선택한 한글 (initial 칩과 연결) */
  selectedKo?: string;
  onClose: () => void;
};

/** 시트 안에서 따라 들어간 단어 */
type NavEntry = {
  lemma: string;
  strong?: string;
  pron?: string;
  glossKo?: string;
};

/** wsSheet = 이번에 연 시트의 id. 새로고침 등으로 남은 옛 기록과 구분 */
type HistState = { wsSheet: string; wsDepth: number };

function isHistState(s: unknown, id: string): s is HistState {
  return (
    !!s &&
    typeof s === "object" &&
    (s as HistState).wsSheet === id &&
    typeof (s as HistState).wsDepth === "number"
  );
}

function pronStrongLine(pron?: string, strong?: string): string {
  return [pron, strong].filter(Boolean).join(" · ");
}

function isProseGloss(s: string): boolean {
  return s.length > 24 || /[.。!?]/.test(s) || /이에요|습니다|해요|예요/.test(s);
}

/** 짧은 뜻: 그대로 쓰거나, 긴 문장이면 괄호 안 단어(살다)만 */
function shortRootGloss(glossKo?: string): string {
  if (!glossKo) return "";
  if (!isProseGloss(glossKo)) return glossKo;
  const m = glossKo.match(/[（(]([^）)]{1,12})[）)]/);
  return m?.[1]?.trim() ?? "";
}

function bookShort(id: string): string {
  if (Object.prototype.hasOwnProperty.call(BOOKS, id)) {
    return BOOKS[id as BookId].shortName;
  }
  return id;
}

function formatRefKo(ref: string, currentBook: string): string {
  const parsed = parsePhraseRef(ref, currentBook);
  if (!parsed) return ref;
  const short = bookShort(parsed.book);
  if (parsed.verse != null) return `${short} ${parsed.chapter}:${parsed.verse}`;
  return `${short} ${parsed.chapter}`;
}

function grammarLine(parseKo: string): string {
  return parseKo
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" · ");
}

export default function WordStudySheet({
  open,
  bookId,
  chapter,
  verse,
  tokens,
  initial,
  selectedKo,
  onClose,
}: Props) {
  const router = useRouter();
  const verseWords = useMemo(
    () => tokensInVerse(tokens, verse),
    [tokens, verse],
  );
  const [active, setActive] = useState<WordStudyToken | null>(initial);
  const [stack, setStack] = useState<NavEntry[]>([]);
  const [lex, setLex] = useState<WordStudyLexicon | null>(null);
  const [lexLoading, setLexLoading] = useState(false);
  const [booksExpanded, setBooksExpanded] = useState(false);
  const [phraseExpanded, setPhraseExpanded] = useState<Record<string, boolean>>(
    {},
  );
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const dragY = useRef(0);
  const startY = useRef(0);
  const dragging = useRef(false);
  const stackRef = useRef<NavEntry[]>([]);
  stackRef.current = stack;
  const pushedRef = useRef(false);
  const sessionRef = useRef("");
  const closingRef = useRef<{ after: (() => void) | null } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    setActive(initial);
    setStack([]);
    setBooksExpanded(false);
    setPhraseExpanded({});
  }, [open, initial]);

  // 시트 열림 = 기록 한 칸. 단어를 따라 들어갈 때마다 한 칸씩 더 쌓음
  useEffect(() => {
    if (!open) {
      pushedRef.current = false;
      closingRef.current = null;
      return;
    }
    if (!pushedRef.current) {
      pushedRef.current = true;
      sessionRef.current = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const st: HistState = { wsSheet: sessionRef.current, wsDepth: 0 };
      window.history.pushState(st, "");
    }
    const onPop = (e: PopStateEvent) => {
      const closing = closingRef.current;
      if (closing) {
        closingRef.current = null;
        pushedRef.current = false;
        onCloseRef.current();
        closing.after?.();
        return;
      }
      if (isHistState(e.state, sessionRef.current)) {
        const depth = e.state.wsDepth;
        setStack((s) => s.slice(0, depth));
        return;
      }
      pushedRef.current = false;
      onCloseRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open]);

  /** 쌓아 둔 기록을 걷어낸 뒤 닫기 (닫힌 뒤 할 일은 after) */
  const closeSheet = useCallback((after?: () => void) => {
    if (!pushedRef.current) {
      onCloseRef.current();
      after?.();
      return;
    }
    if (closingRef.current) return;
    closingRef.current = { after: after ?? null };
    window.history.go(-(stackRef.current.length + 1));
  }, []);

  const top = stack.length > 0 ? stack[stack.length - 1] : null;
  const viewStrong = top ? top.strong : active?.strong;

  useEffect(() => {
    if (!open || !active) {
      setLex(null);
      setLexLoading(false);
      return;
    }
    let stale = false;
    setLex(null);
    if (!viewStrong) {
      setLexLoading(false);
      return;
    }
    setLexLoading(true);
    loadWordLexicon(viewStrong).then((data) => {
      if (stale) return;
      setLex(data);
      setLexLoading(false);
    });
    return () => {
      stale = true;
    };
  }, [open, active, viewStrong]);

  const viewKey = `${active?.ref}-${active?.i}-${stack.length}-${top?.strong ?? top?.lemma ?? ""}`;
  useLayoutEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    setBooksExpanded(false);
    setPhraseExpanded({});
  }, [viewKey]);

  useEffect(() => {
    if (!open) return;
    sheetRef.current
      ?.querySelector<HTMLElement>(".study-ws-chip.is-active")
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSheet();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeSheet]);

  if (!open || !active) return null;

  const isInitialChip = (w: WordStudyToken) =>
    !!initial && w.i === initial.i && w.word === initial.word && w.ref === initial.ref;
  const selectedLabel = (selectedKo ?? "").trim();
  const bodyKo = !top
    ? isInitialChip(active) && selectedLabel
      ? selectedLabel
      : active.glossKo
    : "";

  const headWord = top ? lex?.lemma || top.lemma : active.word;
  const pron = top ? lex?.pron || top.pron || "" : active.pron || lex?.pron || "";
  const parseKo = top ? lex?.posKo || "" : active.parseKo || lex?.posKo || "";
  const root = lex?.root;
  const defKo = lex?.defKo || lex?.note || "";
  const defEn = lex?.defEn || "";
  const fallbackGloss = top ? top.glossKo || "" : active.glossKo;
  const compare = lex?.compareKo || lex?.compare || "";
  const missingLex = !!top && !lexLoading && !lex;

  const rootShort = shortRootGloss(root?.glossKo);
  const rootNote =
    (typeof (lex as { rootNote?: string } | null)?.rootNote === "string"
      ? (lex as { rootNote?: string }).rootNote
      : "") ||
    (root?.glossKo && isProseGloss(root.glossKo) ? root.glossKo : "");

  const byBook = lex?.byBook ?? {};
  const bookEntries = Object.entries(byBook)
    .filter(([, n]) => typeof n === "number" && n > 0)
    .sort((a, b) => b[1] - a[1]);
  const maxBook = bookEntries.reduce((m, [, n]) => Math.max(m, n), 0);
  const visibleBooks = booksExpanded
    ? bookEntries
    : bookEntries.slice(0, 6);
  const hiddenBookCount = Math.max(0, bookEntries.length - 6);

  const phrases = (lex?.phrases ?? []).filter(
    (p) => p && p.greek && Array.isArray(p.refs) && p.refs.length > 0,
  );
  const hasUsage =
    bookEntries.length > 0 ||
    typeof lex?.countNT === "number" ||
    typeof lex?.count1John === "number";

  const showLemma = !top && !!active.lemma && active.lemma !== active.word;

  const etymologyChips: (NavEntry & { key: string })[] = [];
  const seenLemma = new Set<string>([lex?.lemma || headWord]);
  if (root?.lemma && !seenLemma.has(root.lemma)) {
    seenLemma.add(root.lemma);
    etymologyChips.push({
      key: `root-${root.lemma}`,
      lemma: root.lemma,
      strong: root.strong,
      pron: root.pron,
      glossKo: rootShort || undefined,
    });
  }
  for (const raw of lex?.family ?? []) {
    if (!raw) continue;
    const f = familyItem(raw);
    if (!f.lemma) continue;
    const dup = etymologyChips.find((c) => c.lemma === f.lemma);
    if (dup) {
      dup.strong ||= f.strong;
      dup.pron ||= f.pron;
      dup.glossKo ||= f.glossKo;
      continue;
    }
    if (seenLemma.has(f.lemma)) continue;
    seenLemma.add(f.lemma);
    etymologyChips.push({ key: `fam-${f.lemma}`, ...f });
  }

  /** 표현 속 lemma → strong: 표현 words, 같은 뿌리, 이 장 본문 토큰에서 찾기 */
  const strongByLemma = new Map<string, { strong: string; pron?: string }>();
  for (const t of tokens) {
    if (t.lemma && t.strong && !strongByLemma.has(t.lemma)) {
      strongByLemma.set(t.lemma, { strong: t.strong });
    }
  }
  for (const c of etymologyChips) {
    if (c.strong) strongByLemma.set(c.lemma, { strong: c.strong, pron: c.pron });
  }
  if (lex?.lemma && lex.strong) {
    strongByLemma.set(lex.lemma, { strong: lex.strong, pron: lex.pron });
  }

  const goWord = (entry: NavEntry) => {
    if (!entry.strong && !entry.lemma) return;
    if (entry.strong && entry.strong === viewStrong) return;
    const st: HistState = {
      wsSheet: sessionRef.current,
      wsDepth: stackRef.current.length + 1,
    };
    window.history.pushState(st, "");
    setStack((s) => [...s, entry]);
  };

  /** 경로의 k단계로 (0 = 본문 단어) */
  const goDepth = (k: number) => {
    const n = stackRef.current.length - k;
    if (n > 0) window.history.go(-n);
  };

  const pathLabels = [
    bodyKo || selectedLabel || active.glossKo || active.word,
    ...stack.map((s) => s.lemma),
  ];
  const pathStart = Math.max(0, pathLabels.length - 3);

  const onPointerDown = (e: ReactPointerEvent) => {
    dragging.current = true;
    startY.current = e.clientY;
    dragY.current = 0;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!dragging.current || !sheetRef.current) return;
    const dy = Math.max(0, e.clientY - startY.current);
    dragY.current = dy;
    sheetRef.current.style.transform = `translateY(${dy}px)`;
  };
  const onPointerUp = () => {
    if (!dragging.current || !sheetRef.current) return;
    dragging.current = false;
    if (dragY.current > 110) {
      sheetRef.current.style.transform = "";
      closeSheet();
      return;
    }
    sheetRef.current.style.transition = "transform 180ms ease";
    sheetRef.current.style.transform = "translateY(0)";
    window.setTimeout(() => {
      if (sheetRef.current) sheetRef.current.style.transition = "";
    }, 200);
  };

  const goRef = (ref: string) => {
    const parsed = parsePhraseRef(ref, bookId);
    if (!parsed) return;
    const href =
      parsed.book === bookId || parsed.book === "john1"
        ? `/study/john1/${parsed.chapter}`
        : `/bible-reading?book=${encodeURIComponent(parsed.book)}&chapter=${parsed.chapter}`;
    closeSheet(() => router.push(href));
  };

  const pickChip = (w: WordStudyToken) => {
    if (stackRef.current.length > 0) goDepth(0);
    setActive(w);
  };

  return (
    <div className="study-ws-root" role="dialog" aria-label="원어 사전">
      <button
        type="button"
        className="study-ws-backdrop"
        aria-label="닫기"
        onClick={() => closeSheet()}
      />
      <div ref={sheetRef} className="study-ws-sheet">
        <div className="study-ws-top">
          <div
            className="study-ws-handle-hit"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div className="study-ws-handle" aria-hidden="true" />
          </div>

          {verseWords.length > 0 ? (
            <div
              className="study-ws-chips"
              role="list"
              aria-label="이 절의 헬라어"
            >
              {verseWords.map((w) => {
                const on = active.i === w.i && active.word === w.word;
                const sub =
                  isInitialChip(w) && selectedLabel ? selectedLabel : w.glossKo;
                return (
                  <button
                    key={`${w.ref}-${w.i}-${w.word}`}
                    type="button"
                    role="listitem"
                    className={`study-ws-chip${on ? " is-active" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      pickChip(w);
                    }}
                  >
                    <span className="study-ws-chip-w">{w.word}</span>
                    {sub ? <span className="study-ws-chip-g">{sub}</span> : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {stack.length > 0 ? (
            <div className="study-ws-nav">
              <button
                type="button"
                className="study-ws-back"
                onClick={() => window.history.back()}
              >
                ← 이전 단어
              </button>
              <nav className="study-ws-path" aria-label="단어 경로">
                {pathStart > 0 ? (
                  <span className="study-ws-path-sep">… ›</span>
                ) : null}
                {pathLabels.slice(pathStart).map((label, idx) => {
                  const depth = pathStart + idx;
                  const isLast = depth === pathLabels.length - 1;
                  return (
                    <Fragment key={`${depth}-${label}`}>
                      {idx > 0 ? (
                        <span className="study-ws-path-sep">›</span>
                      ) : null}
                      {isLast ? (
                        <span className="study-ws-path-cur" lang={depth > 0 ? "grc" : undefined}>
                          {label}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="study-ws-path-step"
                          lang={depth > 0 ? "grc" : undefined}
                          onClick={() => goDepth(depth)}
                        >
                          {label}
                        </button>
                      )}
                    </Fragment>
                  );
                })}
              </nav>
            </div>
          ) : null}
        </div>

        <div ref={bodyRef} className="study-ws-body">
          <div key={viewKey} className="study-ws-view">
            <header className="study-ws-hero">
              <div className="study-ws-hero-row">
                <p className="study-ws-word" lang="grc">
                  {headWord}
                </p>
                {pron ? <span className="study-ws-pron">{pron}</span> : null}
                {viewStrong ? (
                  <span className="study-ws-strong">{viewStrong}</span>
                ) : null}
              </div>
              {bodyKo ? (
                <p className="study-ws-bodyko">
                  본문: <strong>{bodyKo}</strong>
                </p>
              ) : null}
              {parseKo ? (
                <p className="study-ws-grammar">{grammarLine(parseKo)}</p>
              ) : null}
              {showLemma ? (
                <p className="study-ws-lemma">원형 {active.lemma}</p>
              ) : null}
              {missingLex ? (
                <p className="study-ws-lemma">아직 이 단어의 사전이 준비되지 않았어요</p>
              ) : null}
            </header>

            {etymologyChips.length > 0 || rootNote ? (
              <section className="study-ws-sec">
                <h3>어원 · 같은 뿌리</h3>
                {etymologyChips.length > 0 ? (
                  <ul className="study-ws-etym-chips">
                    {etymologyChips.map((c) => {
                      const meta = pronStrongLine(c.pron, c.strong);
                      const inner = (
                        <>
                          <span className="study-ws-etym-top">
                            <span lang="grc">{c.lemma}</span>
                            {c.glossKo ? <em>{c.glossKo}</em> : null}
                          </span>
                          <span className="study-ws-etym-meta">{meta}</span>
                        </>
                      );
                      return (
                        <li key={c.key}>
                          {c.strong ? (
                            <button
                              type="button"
                              className="study-ws-etym-btn"
                              onClick={() => goWord(c)}
                            >
                              {inner}
                            </button>
                          ) : (
                            <span className="study-ws-etym-btn is-static">
                              {inner}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {rootNote ? (
                  <p className="study-ws-root-note">{rootNote}</p>
                ) : null}
              </section>
            ) : null}

            {defKo || defEn || fallbackGloss ? (
              <section className="study-ws-sec">
                <h3>뜻</h3>
                {defKo ? (
                  <p className="study-ws-def-ko">{defKo}</p>
                ) : fallbackGloss ? (
                  <p className="study-ws-def-ko">{fallbackGloss}</p>
                ) : null}
                {defEn ? (
                  <p className="study-ws-en">
                    <span className="study-ws-en-label">EN</span>
                    {defEn}
                  </p>
                ) : null}
              </section>
            ) : null}

            {hasUsage ? (
              <section className="study-ws-sec">
                <h3>쓰인 곳</h3>
                <p className="study-ws-counts">
                  {typeof lex?.countNT === "number" ? (
                    <>
                      신약 <strong>{lex.countNT}</strong>회
                    </>
                  ) : null}
                  {typeof lex?.countNT === "number" &&
                  typeof lex?.count1John === "number"
                    ? " · "
                    : null}
                  {typeof lex?.count1John === "number" ? (
                    <>
                      요한일서 <strong>{lex.count1John}</strong>회
                    </>
                  ) : null}
                </p>
                {bookEntries.length > 0 ? (
                  <>
                    <ul className="study-ws-bars">
                      {visibleBooks.map(([book, n]) => (
                        <li key={book}>
                          <span className="study-ws-bar-label">
                            {bookShort(book)}
                          </span>
                          <span className="study-ws-bar-track">
                            <span
                              className={`study-ws-bar-fill${book === bookId ? " is-current" : ""}`}
                              style={{
                                width: `${maxBook ? (n / maxBook) * 100 : 0}%`,
                              }}
                            />
                          </span>
                          <span className="study-ws-bar-n">{n}</span>
                        </li>
                      ))}
                    </ul>
                    {!booksExpanded && hiddenBookCount > 0 ? (
                      <button
                        type="button"
                        className="study-ws-more"
                        onClick={() => setBooksExpanded(true)}
                      >
                        더 보기
                      </button>
                    ) : null}
                  </>
                ) : null}
              </section>
            ) : null}

            {phrases.length > 0 ? (
              <section className="study-ws-sec">
                <h3>성경 표현</h3>
                {phrases.map((ph) => {
                  const expanded = !!phraseExpanded[ph.greek];
                  const refs = ph.refs;
                  const shown = expanded ? refs : refs.slice(0, 6);
                  const rest = refs.length - 6;
                  const gloss =
                    typeof (ph as { glossKo?: string }).glossKo === "string"
                      ? (ph as { glossKo?: string }).glossKo
                      : "";
                  const surface = ph.greek.split(/\s+/).filter(Boolean);
                  const words =
                    Array.isArray(ph.words) && ph.words.length > 0
                      ? ph.words.map((w) => {
                          const hit = w.lemma ? strongByLemma.get(w.lemma) : undefined;
                          return {
                            word: w.word,
                            lemma: w.lemma ?? w.word,
                            strong: w.strong || hit?.strong,
                            pron: w.pron,
                          };
                        })
                      : surface.map((word, idx) => {
                          const lemma = ph.lemmas?.[idx] ?? word;
                          const hit =
                            surface.length === (ph.lemmas?.length ?? -1)
                              ? strongByLemma.get(lemma)
                              : undefined;
                          return { word, lemma, strong: hit?.strong, pron: undefined };
                        });
                  const phPron =
                    ph.pron ||
                    (words.every((w) => w.pron)
                      ? words.map((w) => w.pron).join(" ")
                      : "");
                  return (
                    <div key={ph.greek} className="study-ws-phrase">
                      <p className="study-ws-phrase-head">
                        <span className="study-ws-phrase-g" lang="grc">
                          {words.map((w, idx) => (
                            <Fragment key={`${idx}-${w.word}`}>
                              {idx > 0 ? " " : null}
                              {w.strong && w.strong !== viewStrong ? (
                                <button
                                  type="button"
                                  className="study-ws-phrase-word"
                                  onClick={() =>
                                    goWord({
                                      lemma: w.lemma,
                                      strong: w.strong,
                                      pron: w.lemma === w.word ? w.pron : undefined,
                                    })
                                  }
                                >
                                  {w.word}
                                </button>
                              ) : (
                                <span>{w.word}</span>
                              )}
                            </Fragment>
                          ))}
                        </span>
                        {gloss ? (
                          <span className="study-ws-phrase-ko">{gloss}</span>
                        ) : null}
                        {typeof ph.count === "number" ? (
                          <span className="study-ws-phrase-n">{ph.count}회</span>
                        ) : null}
                      </p>
                      {phPron ? (
                        <p className="study-ws-phrase-pron">{phPron}</p>
                      ) : null}
                      <div className="study-ws-ref-chips">
                        {shown.map((ref) => (
                          <button
                            key={ref}
                            type="button"
                            className="study-ws-ref-chip"
                            onClick={(e) => {
                              e.stopPropagation();
                              goRef(ref);
                            }}
                          >
                            {formatRefKo(ref, bookId)}
                          </button>
                        ))}
                        {!expanded && rest > 0 ? (
                          <button
                            type="button"
                            className="study-ws-ref-more"
                            onClick={() =>
                              setPhraseExpanded((prev) => ({
                                ...prev,
                                [ph.greek]: true,
                              }))
                            }
                          >
                            +{rest}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </section>
            ) : null}

            {compare ? (
              <section className="study-ws-sec">
                <h3>비교</h3>
                <p className="study-ws-def-ko">{compare}</p>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

