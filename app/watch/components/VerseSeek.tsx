"use client";

import { createContext, useContext, type ReactNode } from "react";

export type VerseSeekApi = {
  canSeek: (chapter: number, verse: number) => boolean;
  seek: (chapter: number, verse: number) => void;
};

export const VerseSeekContext = createContext<VerseSeekApi | null>(null);

export const useVerseSeek = () => useContext(VerseSeekContext);

/** 시간 데이터가 있는 절이면 누르면 영상이 그 절로 이동하는 버튼, 없으면 그냥 글자. */
export function VerseLink({
  chapter,
  verse,
  className,
  children,
}: {
  chapter: number;
  verse: number;
  className?: string;
  children: ReactNode;
}) {
  const api = useVerseSeek();
  if (!api || !api.canSeek(chapter, verse)) {
    return <span className={className}>{children}</span>;
  }
  return (
    <button
      type="button"
      className={`${className ?? ""} wt-verse-link`}
      aria-label={`${chapter}장 ${verse}절로 영상 이동`}
      onClick={(e) => {
        e.stopPropagation();
        api.seek(chapter, verse);
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {children}
    </button>
  );
}
