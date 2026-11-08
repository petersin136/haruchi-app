"use client";

import { useEffect, useState } from "react";
import { isChapterDone } from "@/app/lib/readLog";
import { verseKey, verseTime, type VerseIndex } from "./verseTimes";
import {
  canSelectChapter,
  type VideoSegment,
  type WatchBookId,
} from "../data/books";
import type { ChapterStarts } from "../data/chapterStarts";

const ANIM_MS = 250;

type Props = {
  open: boolean;
  bookId: WatchBookId;
  bookName: string;
  totalChapters: number;
  verseCounts: number[];
  index: VerseIndex;
  starts: ChapterStarts;
  segments: readonly VideoSegment[];
  /** false 면 절 격자 대신 「절 시간 준비 중」 */
  hasVerseTimes: boolean;
  currentChapter: number;
  currentVerse: number | null;
  /** 장 선택 → 즉시 재생 (시트는 절 단계로 유지) */
  onPickChapter: (chapter: number) => void;
  /** 절 선택 → 이동 + 시트 닫힘 */
  onPickVerse: (chapter: number, verse: number) => void;
  onClose: () => void;
  /** ?dev=1 일 때만 interp 절 점 색 구분 */
  devMode?: boolean;
  /** "1:14" → "interp" 등 */
  verseSrc?: Record<string, string>;
};

export default function VerseSheet({
  open,
  bookId,
  bookName,
  totalChapters,
  verseCounts,
  index,
  starts,
  segments,
  hasVerseTimes,
  currentChapter,
  currentVerse,
  onPickChapter,
  onPickVerse,
  onClose,
  devMode = false,
  verseSrc = {},
}: Props) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [chapter, setChapter] = useState<number | null>(null);
  const [justStarted, setJustStarted] = useState(false);
  const [doneChapters, setDoneChapters] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    if (open) {
      setChapter(null);
      setJustStarted(false);
      const done = new Set<number>();
      for (let c = 1; c <= totalChapters; c += 1) {
        if (isChapterDone(bookId, c)) done.add(c);
      }
      setDoneChapters(done);
      setMounted(true);
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    setShown(false);
    const id = window.setTimeout(() => setMounted(false), ANIM_MS);
    return () => window.clearTimeout(id);
  }, [open, bookId, totalChapters]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (chapter !== null) {
        setChapter(null);
        setJustStarted(false);
      } else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, chapter, onClose]);

  if (!mounted) return null;

  const verseTotal =
    chapter === null
      ? 0
      : verseCounts[chapter - 1] ||
        Math.max(0, ...(index.get(chapter) ?? []).map((e) => e.verse));

  const pickChapter = (c: number) => {
    onPickChapter(c);
    setChapter(c);
    setJustStarted(true);
  };

  const backToChapters = () => {
    setChapter(null);
    setJustStarted(false);
  };

  return (
    <div className={`wt-vs-layer${shown ? " is-shown" : ""}`}>
      <button type="button" className="wt-vs-backdrop" aria-label="닫기" onClick={onClose} />
      <div className="wt-vs" role="dialog" aria-modal="true" aria-label="장·절 선택">
        <span className="wt-vs-grip" aria-hidden />

        {chapter === null ? (
          <>
            <div className="wt-vs-head">
              <div className="wt-vs-head-row">
                <h2 className="wt-vs-title">{bookName} · 장 선택</h2>
                <button type="button" className="wt-vs-close" onClick={onClose}>
                  닫기
                </button>
              </div>
            </div>
            <div className="wt-vs-grid">
              {Array.from({ length: totalChapters }, (_, i) => i + 1).map((c) => {
                const available = canSelectChapter(starts, segments, c, hasVerseTimes);
                const done = doneChapters.has(c);
                return (
                  <button
                    key={c}
                    type="button"
                    className={`wt-vs-cell${c === currentChapter ? " is-current" : ""}${
                      done ? " is-done" : ""
                    }`}
                    disabled={!available}
                    onClick={() => pickChapter(c)}
                  >
                    {c}
                    {done ? <span className="wt-vs-done-dot" aria-hidden /> : null}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="wt-vs-head">
              <div className="wt-vs-head-row">
                <button type="button" className="wt-vs-back" onClick={backToChapters}>
                  ← 장 목록
                </button>
                <button type="button" className="wt-vs-close" onClick={onClose}>
                  닫기
                </button>
              </div>
              {justStarted && (
                <p className="wt-vs-playing" role="status">
                  {chapter}장 처음부터 재생 중
                </p>
              )}
              <h2 className="wt-vs-title">
                {bookName} {chapter}장
              </h2>
            </div>
            {!hasVerseTimes ? (
              <p className="wt-vs-pending" role="status">
                절 시간 준비 중
              </p>
            ) : (
              <div className="wt-vs-grid">
                {Array.from({ length: verseTotal }, (_, i) => i + 1).map((v) => {
                  const available = verseTime(index, chapter, v) !== null;
                  const current = chapter === currentChapter && v === currentVerse;
                  const kind = devMode ? verseSrc[verseKey(chapter, v)] : undefined;
                  const srcClass =
                    kind === "interp" ||
                    kind === "seg" ||
                    kind === "fix" ||
                    kind === "word"
                      ? ` is-src-${kind}`
                      : "";
                  return (
                    <button
                      key={v}
                      type="button"
                      className={`wt-vs-cell${current ? " is-verse-current" : ""}${srcClass}`}
                      data-verse-src={kind || undefined}
                      disabled={!available}
                      onClick={() => onPickVerse(chapter, v)}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
