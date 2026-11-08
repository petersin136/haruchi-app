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
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  BOOKS,
  isOldTestament,
  type BookId,
} from "../../bible-reading/books";
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
  /** 사용자가 본문에서 선택한 한글 (매칭 성공 시에만 본문 줄) */
  selectedKo?: string;
  /** gloss 매칭 성공. 실패면 본문 줄을 숨김 */
  matched?: boolean;
  /** 매칭 실패 시 안내 */
  matchHint?: string | null;
  onClose: () => void;
  /** 구절 칩 탭 — 있으면 라우터 대신 이걸로 장 이동 */
  onNavigate?: (bookId: string, chapter: number) => void;
  /** 사전 fetch 실패 등 */
  onError?: (message: string) => void;
  /** ?debug=1 진단 로그 */
  onDebug?: (line: string) => void;
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

function usageChips(raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  const parts = t
    .split(/\s*[·・]\s*|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [t];
}

export default function WordStudySheet({
  open,
  bookId,
  chapter,
  verse,
  tokens,
  initial,
  selectedKo,
  matched = false,
  matchHint = null,
  onClose,
  onNavigate,
  onError,
  onDebug,
}: Props) {
  const router = useRouter();
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onDebugRef = useRef(onDebug);
  onDebugRef.current = onDebug;
  const verseWords = useMemo(
    () => tokensInVerse(tokens, verse),
    [tokens, verse],
  );
  const [active, setActive] = useState<WordStudyToken | null>(initial);
  const [stack, setStack] = useState<NavEntry[]>([]);
  const [lex, setLex] = useState<WordStudyLexicon | null>(null);
  const [lexLoading, setLexLoading] = useState(false);
  const [booksExpanded, setBooksExpanded] = useState(false);
  const [enOpen, setEnOpen] = useState(false);
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
    setActive(initial ?? verseWords[0] ?? null);
    setStack([]);
    setBooksExpanded(false);
  }, [open, initial, verseWords]);

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
    onDebugRef.current?.(
      `[원어] 시트 open state=true verse=${verse} strong=${active.strong || "-"}`,
    );
    let stale = false;
    setLex(null);
    if (!viewStrong) {
      setLexLoading(false);
      return;
    }
    setLexLoading(true);
    const meta: { url: string; status: number | null; error?: string } = {
      url: "",
      status: null,
    };
    loadWordLexicon(viewStrong, meta).then((data) => {
      if (stale) return;
      setLex(data);
      setLexLoading(false);
      onDebugRef.current?.(
        `[원어] fetch ${meta.url} status=${meta.status ?? meta.error ?? "?"}`,
      );
      if (!data) {
        const path = meta.url || `/word-study/lexicon/greek/${viewStrong}.json`;
        const st = meta.status != null ? ` (${meta.status})` : "";
        onErrorRef.current?.(`원어 사전 실패: ${path}${st}`);
      }
    });
    return () => {
      stale = true;
    };
  }, [open, active, viewStrong, verse]);

  const viewKey = `${active?.ref}-${active?.i}-${stack.length}-${top?.strong ?? top?.lemma ?? ""}`;
  useEffect(() => {
    if (!open || lexLoading) return;
    const hasDef = !!((lex?.defKo || lex?.note || "").trim());
    setEnOpen(!hasDef && !!(lex?.defEn || "").trim());
  }, [open, viewKey, lexLoading, lex]);

  useLayoutEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    setBooksExpanded(false);
  }, [viewKey]);

  useLayoutEffect(() => {
    if (!open || !active) return;
    const el = sheetRef.current;
    if (!el) {
      onDebugRef.current?.("[원어] 시트 mount — sheetRef null");
      return;
    }
    const r = el.getBoundingClientRect();
    onDebugRef.current?.(
      `[원어] 시트 mount rect=${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.top)},${Math.round(r.left)} parent=${el.parentElement?.tagName}`,
    );
  }, [open, active, viewKey]);

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

  if (!open) return null;
  if (typeof document === "undefined") return null;

  // 토큰이 전혀 없어도 안내 시트는 연다(무반응 경로 제거)
  if (!active) {
    return createPortal(
      <div
        className="study-ws-root"
        role="dialog"
        aria-label="원어 사전"
        data-no-drawer-swipe=""
      >
        <button
          type="button"
          className="study-ws-backdrop"
          aria-label="닫기"
          onClick={() => closeSheet()}
        />
        <div className="study-ws-sheet" data-no-drawer-swipe="">
          <div className="study-ws-top" data-no-drawer-swipe="">
            <div className="study-ws-handle-hit" data-no-drawer-swipe="">
              <div className="study-ws-handle" aria-hidden="true" />
            </div>
            <p className="study-ws-match-hint" role="status">
              {matchHint || "정확한 단어를 못 찾았어요 · 칩에서 골라 주세요"}
            </p>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  const isInitialChip = (w: WordStudyToken) =>
    !!initial && w.i === initial.i && w.word === initial.word && w.ref === initial.ref;
  const selectedLabel = (selectedKo ?? "").trim();
  const showBodyKo =
    matched && !top && isInitialChip(active) && !!selectedLabel;
  const bodyKo = showBodyKo ? selectedLabel : "";

  const headWord = top ? lex?.lemma || top.lemma : active.word;
  const pron = top ? lex?.pron || top.pron || "" : active.pron || lex?.pron || "";
  const parseKo = top ? lex?.posKo || "" : active.parseKo || lex?.posKo || "";
  const root = lex?.root;
  const defKo = (lex?.defKo || "").trim();
  const defEn = (lex?.defEn || "").trim();
  const usage = usageChips(lex?.usageKo || lex?.compareKo || "");
  const properName =
    /고유명/.test(parseKo) || /고유명/.test(lex?.posKo || "");
  const missingLex = !!top && !lexLoading && !lex;

  const rootShort = shortRootGloss(root?.glossKo);
  const nameMeaning =
    (lex?.nameMeaning || "").trim() ||
    (!defKo && properName && rootShort && !isProseGloss(rootShort)
      ? rootShort
      : "");
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

  const hasPlaces =
    bookEntries.length > 0 ||
    typeof lex?.countNT === "number" ||
    typeof lex?.countOT === "number" ||
    typeof lex?.count1John === "number";

  const showLemma = !top && !!active.lemma && active.lemma !== active.word;

  const rootChips: (NavEntry & { key: string })[] = [];
  if (root?.lemma && root.strong && root.strong !== viewStrong) {
    rootChips.push({
      key: `root-${root.strong}`,
      lemma: root.lemma,
      strong: root.strong,
      pron: root.pron,
      glossKo: rootShort || undefined,
    });
  }
  const familyChips: (NavEntry & { key: string })[] = [];
  const seenFamily = new Set<string>();
  for (const raw of lex?.family ?? []) {
    if (!raw) continue;
    const f = familyItem(raw);
    if (!f.lemma) continue;
    if (f.strong && f.strong === root?.strong) continue;
    const id = f.strong || f.lemma;
    if (seenFamily.has(id)) continue;
    seenFamily.add(id);
    familyChips.push({ key: `fam-${id}`, ...f });
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
    if (onNavigate) {
      closeSheet(() => onNavigate(parsed.book, parsed.chapter));
      return;
    }
    closeSheet(() =>
      router.push(`/study/${parsed.book}/${parsed.chapter}`),
    );
  };

  const pickChip = (w: WordStudyToken) => {
    if (stackRef.current.length > 0) goDepth(0);
    setActive(w);
  };

  const renderChips = (items: (NavEntry & { key: string })[]) => (
    <ul className="study-ws-etym-chips">
      {items.map((c) => {
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
              <span className="study-ws-etym-btn is-static">{inner}</span>
            )}
          </li>
        );
      })}
    </ul>
  );

  const useRtl =
    (Object.prototype.hasOwnProperty.call(BOOKS, bookId) &&
      isOldTestament(bookId as BookId)) ||
    String(active.strong || "")
      .toUpperCase()
      .startsWith("H");

  return createPortal(
    <div
      className="study-ws-root"
      role="dialog"
      aria-label="원어 사전"
      data-no-drawer-swipe=""
    >
      <button
        type="button"
        className="study-ws-backdrop"
        aria-label="닫기"
        onClick={() => closeSheet()}
      />
      <div
        ref={sheetRef}
        className={`study-ws-sheet${useRtl ? " is-rtl" : ""}`}
        dir={useRtl ? "rtl" : undefined}
        data-no-drawer-swipe=""
      >
        <div className="study-ws-top" data-no-drawer-swipe="">
          <div
            className="study-ws-handle-hit"
            data-no-drawer-swipe=""
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div className="study-ws-handle" aria-hidden="true" />
          </div>

          {matchHint ? (
            <p className="study-ws-match-hint" role="status">
              {matchHint}
            </p>
          ) : null}

          {verseWords.length > 0 ? (
            <div
              className="study-ws-chips"
              role="list"
              aria-label="이 절의 원어"
              data-no-drawer-swipe=""
            >
              {verseWords.map((w) => {
                const on = active.i === w.i && active.word === w.word;
                const sub =
                  matched && isInitialChip(w) && selectedLabel
                    ? selectedLabel
                    : w.glossKo;
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
              {showLemma ? (
                <p className="study-ws-lemma">원형 {active.lemma}</p>
              ) : null}
              {missingLex ? (
                <p className="study-ws-lemma">아직 이 단어의 사전이 준비되지 않았어요</p>
              ) : null}
            </header>

            {parseKo ? (
              <section className="study-ws-sec">
                <h3>품사</h3>
                <p className="study-ws-def-ko">{grammarLine(parseKo)}</p>
              </section>
            ) : null}

            {rootChips.length > 0 || rootNote ? (
              <section className="study-ws-sec">
                <h3>어원</h3>
                {rootChips.length > 0 ? renderChips(rootChips) : null}
                {rootNote ? (
                  <p className="study-ws-root-note">{rootNote}</p>
                ) : null}
              </section>
            ) : null}

            {defKo ? (
              <section className="study-ws-sec">
                <h3>단어 정의</h3>
                <p className="study-ws-def-ko">{defKo}</p>
              </section>
            ) : nameMeaning ? (
              <section className="study-ws-sec">
                <h3>이름 뜻</h3>
                <p className="study-ws-def-ko">{nameMeaning}</p>
              </section>
            ) : null}

            {usage.length > 0 ? (
              <section className="study-ws-sec">
                <h3>이렇게 번역됐어요</h3>
                <ul className="study-ws-usage">
                  {usage.map((chip) => (
                    <li key={chip}>{chip}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {hasPlaces ? (
              <section className="study-ws-sec">
                <h3>쓰인 곳</h3>
                <p className="study-ws-counts">
                  {typeof lex?.countOT === "number" ? (
                    <>
                      구약 <strong>{lex.countOT}</strong>회
                    </>
                  ) : null}
                  {typeof lex?.countOT === "number" &&
                  typeof lex?.countNT === "number"
                    ? " · "
                    : null}
                  {typeof lex?.countNT === "number" ? (
                    <>
                      신약 <strong>{lex.countNT}</strong>회
                    </>
                  ) : null}
                  {(typeof lex?.countOT === "number" ||
                    typeof lex?.countNT === "number") &&
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

            {familyChips.length > 0 ? (
              <section className="study-ws-sec">
                <h3>같은 뿌리</h3>
                {renderChips(familyChips)}
              </section>
            ) : null}

            {defEn ? (
              <section className="study-ws-sec">
                <h3>
                  <button
                    type="button"
                    className="study-ws-en-toggle"
                    aria-expanded={enOpen}
                    onClick={() => setEnOpen((v) => !v)}
                  >
                    영어 원문
                  </button>
                </h3>
                {enOpen ? (
                  <p className="study-ws-en">{defEn}</p>
                ) : null}
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

