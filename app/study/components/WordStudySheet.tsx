"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import { BOOKS, type BookId } from "../../bible-reading/books";
import {
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
  onClose: () => void;
};

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
  onClose,
}: Props) {
  const router = useRouter();
  const verseWords = useMemo(
    () => tokensInVerse(tokens, verse),
    [tokens, verse],
  );
  const [active, setActive] = useState<WordStudyToken | null>(initial);
  const [lex, setLex] = useState<WordStudyLexicon | null>(null);
  const [booksExpanded, setBooksExpanded] = useState(false);
  const [phraseExpanded, setPhraseExpanded] = useState<Record<string, boolean>>(
    {},
  );
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragY = useRef(0);
  const startY = useRef(0);
  const dragging = useRef(false);

  useEffect(() => {
    if (!open) return;
    setActive(initial);
    setBooksExpanded(false);
    setPhraseExpanded({});
  }, [open, initial]);

  useEffect(() => {
    if (!open || !active) {
      setLex(null);
      return;
    }
    let stale = false;
    setLex(null);
    if (active.strong) {
      loadWordLexicon(active.strong).then((data) => {
        if (!stale) setLex(data);
      });
    }
    return () => {
      stale = true;
    };
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !active) return null;

  const pron = lex?.pron || active.pron;
  const parseKo = active.parseKo || lex?.posKo || "";
  const root = lex?.root;
  const family = (lex?.family ?? []).filter(Boolean);
  const defKo = lex?.defKo || lex?.note || "";
  const defEn = lex?.defEn || "";
  const compare = lex?.compareKo || lex?.compare || "";

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

  const showLemma =
    !!active.lemma && active.lemma !== active.word;

  const etymologyChips: { key: string; greek: string; gloss?: string }[] = [];
  if (root?.lemma) {
    etymologyChips.push({
      key: `root-${root.lemma}`,
      greek: root.lemma,
      gloss: rootShort || undefined,
    });
  }
  for (const f of family) {
    if (root?.lemma && f === root.lemma) continue;
    etymologyChips.push({ key: `fam-${f}`, greek: f });
  }

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
      onClose();
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
    onClose();
    if (parsed.book === bookId || parsed.book === "john1") {
      router.push(`/study/john1/${parsed.chapter}`);
    } else {
      router.push(
        `/bible-reading?book=${encodeURIComponent(parsed.book)}&chapter=${parsed.chapter}`,
      );
    }
  };

  return (
    <div className="study-ws-root" role="dialog" aria-label="원어 사전">
      <button
        type="button"
        className="study-ws-backdrop"
        aria-label="닫기"
        onClick={onClose}
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
                return (
                  <button
                    key={`${w.ref}-${w.i}-${w.word}`}
                    type="button"
                    role="listitem"
                    className={`study-ws-chip${on ? " is-active" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActive(w);
                    }}
                  >
                    <span className="study-ws-chip-w">{w.word}</span>
                    {w.glossKo ? (
                      <span className="study-ws-chip-g">{w.glossKo}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="study-ws-body">
          <header className="study-ws-hero">
            <div className="study-ws-hero-row">
              <p className="study-ws-word" lang="grc">
                {active.word}
              </p>
              {pron ? <span className="study-ws-pron">{pron}</span> : null}
            </div>
            {parseKo ? (
              <p className="study-ws-grammar">{grammarLine(parseKo)}</p>
            ) : null}
            {showLemma ? (
              <p className="study-ws-lemma">원형 {active.lemma}</p>
            ) : null}
          </header>

          {etymologyChips.length > 0 || rootNote ? (
            <section className="study-ws-sec">
              <h3>어원 · 같은 뿌리</h3>
              {etymologyChips.length > 0 ? (
                <ul className="study-ws-etym-chips">
                  {etymologyChips.map((c) => (
                    <li key={c.key}>
                      <span lang="grc">{c.greek}</span>
                      {c.gloss ? <em>{c.gloss}</em> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {rootNote ? <p className="study-ws-root-note">{rootNote}</p> : null}
            </section>
          ) : null}

          {defKo || defEn || active.glossKo ? (
            <section className="study-ws-sec">
              <h3>뜻</h3>
              {defKo ? (
                <p className="study-ws-def-ko">{defKo}</p>
              ) : active.glossKo ? (
                <p className="study-ws-def-ko">{active.glossKo}</p>
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
                return (
                  <div key={ph.greek} className="study-ws-phrase">
                    <p className="study-ws-phrase-head">
                      <span className="study-ws-phrase-g" lang="grc">
                        {ph.greek}
                      </span>
                      {gloss ? (
                        <span className="study-ws-phrase-ko">{gloss}</span>
                      ) : null}
                      {typeof ph.count === "number" ? (
                        <span className="study-ws-phrase-n">{ph.count}회</span>
                      ) : null}
                    </p>
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
  );
}
