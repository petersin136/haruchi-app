"use client";

import { memo } from "react";

type ChapterItem = {
  chapter: number;
  title?: string;
};

type ProgressGridProps = {
  chapters: ChapterItem[];
  chapterNumber: number;
  doneChapters: Set<number>;
  bookName: string;
  onSelectChapter: (n: number) => void;
};

const ProgressGrid = memo(function ProgressGrid({
  chapters,
  chapterNumber,
  doneChapters,
  bookName,
  onSelectChapter,
}: ProgressGridProps) {
  return (
    <>
      {chapters.map((item) => (
        <button
          key={item.chapter}
          type="button"
          className={`${item.chapter === chapterNumber ? "is-current" : ""} ${
            doneChapters.has(item.chapter) ? "is-done" : ""
          }`}
          onClick={() => onSelectChapter(item.chapter)}
          aria-label={`${bookName} ${item.chapter}장으로 이동`}
        >
          {item.chapter}
        </button>
      ))}
    </>
  );
});

export default ProgressGrid;
