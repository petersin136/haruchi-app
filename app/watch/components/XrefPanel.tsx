"use client";

import { memo, useEffect, useState } from "react";
import type { BookId } from "@/app/bible-reading/books";
import {
  loadPreview,
  loadXrefRows,
  type Preview,
  type XrefRef,
  type XrefRow,
} from "./xref";
import { VerseLink } from "./VerseSeek";
import "./xref.css";

type LoadState<T> =
  | { status: "loading" }
  | { status: "error" }
  | { status: "done"; data: T };

function XrefPanel({ bookId, chapter }: { bookId: BookId; chapter: number }) {
  const [state, setState] = useState<LoadState<XrefRow[]>>({ status: "loading" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let stale = false;
    setState({ status: "loading" });
    loadXrefRows(bookId, chapter).then(
      (data) => !stale && setState({ status: "done", data }),
      () => !stale && setState({ status: "error" }),
    );
    return () => {
      stale = true;
    };
  }, [bookId, chapter, retry]);

  return (
    <div className="wt-xref">
      <h2 className="wt-xref-title">{chapter}장 관주</h2>

      {state.status === "loading" && (
        <div className="wt-xref-skeleton" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      )}

      {state.status === "error" && (
        <div className="wt-xref-empty">
          관주를 불러오지 못했어요.
          <button type="button" className="wt-xref-retry" onClick={() => setRetry((n) => n + 1)}>
            다시 시도
          </button>
        </div>
      )}

      {state.status === "done" && state.data.length === 0 && (
        <p className="wt-xref-empty">준비 중</p>
      )}

      {state.status === "done" && state.data.length > 0 && (
        <ol className="wt-xref-list" key={`${bookId}/${chapter}`}>
          {state.data.map((row) => (
            <XrefVerseRow key={row.verse} chapter={chapter} row={row} />
          ))}
        </ol>
      )}

      <p className="wt-xref-credit">
        관주:{" "}
        <a href="https://www.openbible.info/labs/cross-references/" target="_blank" rel="noreferrer">
          OpenBible.info
        </a>{" "}
        (CC BY)
      </p>
    </div>
  );
}

const XrefVerseRow = memo(function XrefVerseRow({ chapter, row }: { chapter: number; row: XrefRow }) {
  const [open, setOpen] = useState<XrefRef | null>(null);

  return (
    <li className="wt-xref-row">
      <VerseLink chapter={chapter} verse={row.verse} className="wt-xref-vnum">
        {row.verse}
      </VerseLink>
      <div className="wt-xref-body">
        <p className="wt-xref-refs">
          {row.refs.map((ref, i) => {
            const active = open?.key === ref.key;
            return (
              <span key={ref.key}>
                {i > 0 && <span className="wt-xref-sep"> · </span>}
                <button
                  type="button"
                  className={`wt-xref-link${active ? " is-open" : ""}`}
                  aria-expanded={active}
                  onClick={() => setOpen(active ? null : ref)}
                >
                  {ref.label}
                </button>
              </span>
            );
          })}
        </p>
        <div className="wt-xref-drawer" data-open={open ? "" : undefined} aria-hidden={!open}>
          <div className="wt-xref-drawer-inner">
            {open && <XrefPreview key={open.key} refItem={open} />}
          </div>
        </div>
      </div>
    </li>
  );
});

function XrefPreview({ refItem }: { refItem: XrefRef }) {
  const [state, setState] = useState<LoadState<Preview>>({ status: "loading" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let stale = false;
    setState({ status: "loading" });
    loadPreview(refItem).then(
      (data) => !stale && setState({ status: "done", data }),
      () => !stale && setState({ status: "error" }),
    );
    return () => {
      stale = true;
    };
  }, [refItem, retry]);

  const multiChapter = refItem.from.chapter !== refItem.to.chapter;

  return (
    <div className="wt-xref-preview">
      <span className="wt-xref-preview-ref">{refItem.label}</span>

      {state.status === "loading" && (
        <div className="wt-xref-preview-loading" aria-hidden>
          <span />
          <span />
        </div>
      )}

      {state.status === "error" && (
        <p className="wt-xref-preview-text">
          본문을 불러오지 못했어요.{" "}
          <button type="button" className="wt-xref-retry" onClick={() => setRetry((n) => n + 1)}>
            다시 시도
          </button>
        </p>
      )}

      {state.status === "done" &&
        (state.data.verses.length === 0 ? (
          <p className="wt-xref-preview-text">본문을 찾을 수 없어요.</p>
        ) : (
          <p className="wt-xref-preview-text">
            {state.data.verses.map((v) => (
              <span key={`${v.chapter}:${v.verse}`} className="wt-xref-pv">
                <sup>{multiChapter ? `${v.chapter}:${v.verse}` : v.verse}</sup>
                {v.text}{" "}
              </span>
            ))}
            {state.data.more && <span className="wt-xref-more">…</span>}
          </p>
        ))}
    </div>
  );
}

export default memo(XrefPanel);
