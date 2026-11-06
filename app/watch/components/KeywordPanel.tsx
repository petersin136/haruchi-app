"use client";

import { memo, useEffect, useState } from "react";
import { BOOKS, isOldTestament, type BookId } from "@/app/bible-reading/books";
import { isHebrew, loadKeywordRows, type Keyword, type KeywordRow } from "./keywords";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "done"; data: KeywordRow[] };

function KeywordPanel({ bookId, chapter }: { bookId: BookId; chapter: number }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let stale = false;
    setState({ status: "loading" });
    loadKeywordRows(bookId, chapter).then(
      (data) => !stale && setState({ status: "done", data }),
      () => !stale && setState({ status: "error" }),
    );
    return () => {
      stale = true;
    };
  }, [bookId, chapter, retry]);

  const total = state.status === "done" ? state.data.reduce((n, r) => n + r.words.length, 0) : 0;
  const hasRows = state.status === "done" && total > 0;

  return (
    <div className="wt-kw">
      <div className="wt-tab-top">
        <span className="wt-tab-kicker">{isOldTestament(bookId) ? "Hebrew" : "Greek"}</span>
        {state.status === "done" && total > 0 && <span className="wt-tab-badge">{total}단어</span>}
      </div>
      <h2 className="wt-tab-title">
        {BOOKS[bookId].name} {chapter}장 원어
      </h2>

      {state.status === "loading" && (
        <div className="wt-tab-skeleton" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      )}

      {state.status === "error" && (
        <div className="wt-xref-empty">
          원어 단어를 불러오지 못했어요.
          <button type="button" className="wt-xref-retry" onClick={() => setRetry((n) => n + 1)}>
            다시 시도
          </button>
        </div>
      )}

      {state.status === "done" && !hasRows && (
        <p className="wt-xref-empty">이 장에는 아직 원어 단어가 없어요.</p>
      )}

      {state.status === "done" && hasRows && (
        <ol className="wt-kw-list">
          {state.data.map((row) => (
            <KeywordVerseRow key={row.verse} row={row} />
          ))}
        </ol>
      )}

      <p className="wt-xref-credit">
        원어:{" "}
        <a href="https://hb.openscriptures.org/" target="_blank" rel="noreferrer">
          OSHB
        </a>{" "}
        / WLC (CC BY 4.0)
      </p>
    </div>
  );
}

const KeywordVerseRow = memo(function KeywordVerseRow({ row }: { row: KeywordRow }) {
  if (row.words.length === 0) {
    return (
      <li className="wt-kw-row is-empty">
        <span className="wt-xref-vnum">{row.verse}</span>
        <span className="wt-kw-none">핵심 단어 없음</span>
      </li>
    );
  }
  const rtl = isHebrew(row.words[0].w);
  return (
    <li className="wt-kw-row">
      <span className="wt-xref-vnum">{row.verse}</span>
      <div className={`wt-kw-cards${rtl ? " is-rtl" : ""}`}>
        {row.words.map((k, i) => (
          <WordCard key={`${k.lemma}-${i}`} word={k} />
        ))}
      </div>
    </li>
  );
});

function WordCard({ word }: { word: Keyword }) {
  const hebrew = isHebrew(word.w);
  return (
    <div className="wt-kw-card">
      <span
        className={`wt-kw-word${hebrew ? " is-hebrew" : ""}`}
        dir={hebrew ? "rtl" : "ltr"}
        lang={hebrew ? "he" : "grc"}
      >
        {word.w}
      </span>
      {word.pron && <span className="wt-kw-pron">{word.pron}</span>}
      {word.mean && <span className="wt-kw-mean">{word.mean}</span>}
      {word.pos && <span className="wt-kw-pos">{word.pos}</span>}
    </div>
  );
}

export default memo(KeywordPanel);
