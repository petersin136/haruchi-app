"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { type BookId } from "@/app/bible-reading/books";
import { loadSummary, parseKeyVerse, type ChapterSummary } from "./summary";
import { VerseLink } from "./VerseSeek";
import { loadPreview, type Preview } from "./xref";
import "./summary.css";

type LoadState<T> =
  | { status: "loading" }
  | { status: "error" }
  | { status: "done"; data: T };

function SummaryPanel({ bookId, chapter }: { bookId: BookId; chapter: number }) {
  const [state, setState] = useState<LoadState<ChapterSummary | null>>({ status: "loading" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let stale = false;
    setState({ status: "loading" });
    loadSummary(bookId, chapter).then(
      (data) => !stale && setState({ status: "done", data }),
      () => !stale && setState({ status: "error" }),
    );
    return () => {
      stale = true;
    };
  }, [bookId, chapter, retry]);

  const summary = state.status === "done" ? state.data : null;

  return (
    <div className="wt-sum">
      {state.status === "loading" && (
        <div className="wt-sum-skeleton" aria-hidden>
          <span />
          <span />
        </div>
      )}

      {state.status === "error" && (
        <p className="wt-sum-empty">
          요약을 불러오지 못했어요.
          <button type="button" className="wt-sum-retry" onClick={() => setRetry((n) => n + 1)}>
            다시 시도
          </button>
        </p>
      )}

      {state.status === "done" && !summary && <p className="wt-sum-empty">준비 중</p>}

      {summary && <SummaryBody key={`${bookId}/${chapter}`} bookId={bookId} summary={summary} />}
    </div>
  );
}

function SummaryBody({ bookId, summary }: { bookId: BookId; summary: ChapterSummary }) {
  return (
    <div className="wt-sum-body">
      <span className="wt-sum-kicker">summary</span>
      {summary.title && <h2 className="wt-sum-title">{summary.title}</h2>}
      {summary.theme && <p className="wt-sum-theme">{summary.theme}</p>}

      {summary.flow.length > 0 && (
        <ol className="wt-sum-flow">
          {summary.flow.map((item, i) => (
            <li key={`${item.range}-${i}`} className="wt-sum-flow-item">
              <span className="wt-sum-flow-dot" aria-hidden />
              <span className="wt-sum-flow-range">{item.range}</span>
              <span className="wt-sum-flow-text">{item.text}</span>
            </li>
          ))}
        </ol>
      )}

      {summary.keyVerse && <KeyVerse bookId={bookId} raw={summary.keyVerse} />}

      {summary.question && (
        <section className="wt-sum-ask">
          <span className="wt-sum-ask-label">생각해 보기</span>
          <p className="wt-sum-question">{summary.question}</p>
        </section>
      )}
    </div>
  );
}

function KeyVerse({ bookId, raw }: { bookId: BookId; raw: string }) {
  const ref = useMemo(() => parseKeyVerse(bookId, raw), [bookId, raw]);
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    if (!ref) return;
    let stale = false;
    setPreview(null);
    loadPreview(ref).then(
      (data) => !stale && setPreview(data),
      () => undefined,
    );
    return () => {
      stale = true;
    };
  }, [ref]);

  const cite = raw.replace(/\s/g, "");

  return (
    <figure className="wt-sum-key">
      <span className="wt-sum-key-mark" aria-hidden>
        “
      </span>
      {preview && preview.verses.length > 0 && (
        <blockquote className="wt-sum-key-text">
          {preview.verses.map((v) => v.text).join(" ")}
          {preview.more && " …"}
        </blockquote>
      )}
      <figcaption className="wt-sum-key-ref">
        {ref ? (
          <VerseLink chapter={ref.from.chapter} verse={ref.from.verse} className="wt-sum-key-link">
            {cite}
          </VerseLink>
        ) : (
          cite
        )}
      </figcaption>
    </figure>
  );
}

export default memo(SummaryPanel);
