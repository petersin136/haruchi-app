"use client";

import { useEffect, useState } from "react";
import { verseKey, verseTime, type VerseIndex } from "./verseTimes";

const ANIM_MS = 250;

type Props = {
  open: boolean;
  bookName: string;
  totalChapters: number;
  verseCounts: number[];
  index: VerseIndex;
  currentChapter: number;
  currentVerse: number | null;
  onPick: (chapter: number, verse: number) => void;
  onClose: () => void;
  /** ?dev=1 일 때만 interp 절 점 색 구분 */
  devMode?: boolean;
  /** "1:14" → "interp" 등 */
  verseSrc?: Record<string, string>;
};

export default function VerseSheet({
  open,
  bookName,
  totalChapters,
  verseCounts,
  index,
  currentChapter,
  currentVerse,
  onPick,
  onClose,
  devMode = false,
  verseSrc = {},
}: Props) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [chapter, setChapter] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      setChapter(null);
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
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (chapter !== null) setChapter(null);
      else onClose();
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

  return (
    <div className={`wt-vs-layer${shown ? " is-shown" : ""}`}>
      <button type="button" className="wt-vs-backdrop" aria-label="닫기" onClick={onClose} />
      <div className="wt-vs" role="dialog" aria-modal="true" aria-label="장·절 선택">
        <span className="wt-vs-grip" aria-hidden />

        {chapter === null ? (
          <>
            <div className="wt-vs-head">
              <span className="wt-vs-kicker">chapter</span>
              <h2 className="wt-vs-title">{bookName} · 장 선택</h2>
            </div>
            <div className="wt-vs-grid">
              {Array.from({ length: totalChapters }, (_, i) => i + 1).map((c) => {
                const available = (index.get(c)?.length ?? 0) > 0;
                return (
                  <button
                    key={c}
                    type="button"
                    className={`wt-vs-cell${c === currentChapter ? " is-current" : ""}`}
                    disabled={!available}
                    onClick={() => setChapter(c)}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="wt-vs-head">
              <button type="button" className="wt-vs-back" onClick={() => setChapter(null)}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                  <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                장 선택
              </button>
              <h2 className="wt-vs-title">
                {bookName} {chapter}장
              </h2>
            </div>
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
                    className={`wt-vs-cell${current ? " is-current" : ""}${srcClass}`}
                    data-verse-src={kind || undefined}
                    disabled={!available}
                    onClick={() => onPick(chapter, v)}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
