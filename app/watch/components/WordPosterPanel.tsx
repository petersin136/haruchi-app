"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { BOOKS, isOldTestament, type BookId } from "@/app/bible-reading/books";
import { isHebrew } from "./keywords";
import { loadTopWords, type TopWord } from "./keywordsTop";
import { VerseLink } from "./VerseSeek";

type LoadState<T> =
  | { status: "loading" }
  | { status: "error" }
  | { status: "done"; data: T };

function WordPosterPanel({ bookId, chapter }: { bookId: BookId; chapter: number }) {
  const [state, setState] = useState<LoadState<TopWord[] | null>>({ status: "loading" });
  const [retry, setRetry] = useState(0);
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    setState({ status: "loading" });
    setOpenKey(null);
    loadTopWords(bookId, chapter).then(
      (data) => !stale && setState({ status: "done", data }),
      () => !stale && setState({ status: "error" }),
    );
    return () => {
      stale = true;
    };
  }, [bookId, chapter, retry]);

  const toggle = useCallback((key: string) => setOpenKey((k) => (k === key ? null : key)), []);

  const ot = isOldTestament(bookId);
  const words = state.status === "done" ? state.data : null;

  return (
    <div className="wt-wp">
      <span className="wt-wp-kicker">{ot ? "hebrew" : "greek"}</span>
      <h2 className="wt-wp-title">
        {BOOKS[bookId].name} {chapter}장의 단어
      </h2>

      {state.status === "loading" && (
        <div className="wt-wp-skeleton" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      )}

      {state.status === "error" && (
        <p className="wt-wp-empty">
          단어를 불러오지 못했어요.
          <button type="button" className="wt-wp-retry" onClick={() => setRetry((n) => n + 1)}>
            다시 시도
          </button>
        </p>
      )}

      {state.status === "done" && (!words || words.length === 0) && (
        <p className="wt-wp-empty">준비 중</p>
      )}

      {words && words.length > 0 && (
        <ol className="wt-wp-list">
          {words.map((word) => (
            <WordBlock
              key={word.key}
              word={word}
              testament={ot ? "구약" : "신약"}
              open={openKey === word.key}
              onToggle={toggle}
            />
          ))}
        </ol>
      )}

      {ot && <p className="wt-wp-credit">원어: OSHB / WLC (CC BY 4.0)</p>}
    </div>
  );
}

const WordBlock = memo(function WordBlock({
  word,
  testament,
  open,
  onToggle,
}: {
  word: TopWord;
  testament: string;
  open: boolean;
  onToggle: (key: string) => void;
}) {
  const hebrew = isHebrew(word.w);
  const rootHebrew = word.root ? isHebrew(word.root.w) : false;
  const usage = [
    word.count !== null ? `이 장 ${word.count}번` : null,
    word.total !== null ? `${testament} ${word.total}번` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className={`wt-wp-item${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="wt-wp-head"
        aria-expanded={open}
        onClick={() => onToggle(word.key)}
      >
        <span className="wt-wp-gloss">
          {word.pron && <span className="wt-wp-pron">{word.pron}</span>}
          {word.pron && word.mean && <span className="wt-wp-dot"> · </span>}
          {word.mean && <strong className="wt-wp-mean">{word.mean}</strong>}
        </span>
        <span className="wt-wp-word" dir={hebrew ? "rtl" : "ltr"} lang={hebrew ? "he" : "grc"}>
          {word.w}
        </span>
        <svg className="wt-wp-caret" viewBox="0 0 24 24" width="14" height="14" aria-hidden>
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="wt-wp-drawer" data-open={open || undefined} aria-hidden={!open}>
        <div className="wt-wp-drawer-inner">
          <dl className="wt-wp-details">
            {word.pos && (
              <div className="wt-wp-field">
                <dt>품사</dt>
                <dd>{word.pos}</dd>
              </div>
            )}

            {word.root && (
              <div className="wt-wp-field">
                <dt>어원</dt>
                <dd>
                  <span
                    className="wt-wp-root"
                    dir={rootHebrew ? "rtl" : "ltr"}
                    lang={rootHebrew ? "he" : "grc"}
                  >
                    {word.root.w}
                  </span>
                  {word.root.pron && <span className="wt-wp-root-pron">{word.root.pron}</span>}
                  {word.root.mean && <span className="wt-wp-root-mean">{word.root.mean}</span>}
                </dd>
              </div>
            )}

            {(word.defKo || word.defEn) && (
              <div className="wt-wp-field">
                <dt>뜻</dt>
                <dd>
                  {word.defKo || word.defEn}
                  {word.defKo && word.defEn && <span className="wt-wp-def-en">{word.defEn}</span>}
                </dd>
              </div>
            )}

            {(usage || word.verses.length > 0) && (
              <div className="wt-wp-field">
                <dt>쓰인 곳</dt>
                <dd>
                  {usage && <span className="wt-wp-usage">{usage}</span>}
                  {word.verses.length > 0 && (
                    <span className="wt-wp-chips">
                      {word.verses.map((r) => (
                        <VerseLink
                          key={`${r.chapter}:${r.verse}`}
                          chapter={r.chapter}
                          verse={r.verse}
                          className="wt-wp-chip"
                        >
                          {r.chapter}:{r.verse}
                        </VerseLink>
                      ))}
                    </span>
                  )}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </li>
  );
});

export default memo(WordPosterPanel);
