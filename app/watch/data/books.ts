import { BOOKS, type BookId } from "@/app/bible-reading/books";

export type WatchBookId = Extract<BookId, "genesis" | "exodus">;
export type ChapterStarts = ReadonlyArray<number | null>;

export type WatchBookConfig = {
  id: WatchBookId;
  /** YouTube videoId */
  videoId: string;
  totalChapters: number;
  name: string;
  /** 헤더 부제: "{name} 함께 보기" */
  watchTitle: string;
  /**
   * watch-times 파일을 못 받을 때(또는 파일에 빠진 장)의 장 시작 대체값.
   * 길이는 totalChapters. null = 모름.
   */
  defaultStarts: ChapterStarts;
};

const genesisKnown: number[] = [7, 314, 538, 808, 1076, 1245];

export const WATCH_BOOKS: Record<WatchBookId, WatchBookConfig> = {
  genesis: {
    id: "genesis",
    videoId: "YslfYAunGF4",
    totalChapters: BOOKS.genesis.totalChapters,
    name: BOOKS.genesis.name,
    watchTitle: `${BOOKS.genesis.name} 함께 보기`,
    defaultStarts: Array.from(
      { length: BOOKS.genesis.totalChapters },
      (_, i) => genesisKnown[i] ?? null,
    ),
  },
  exodus: {
    id: "exodus",
    videoId: "qN0W1g2wpmk",
    totalChapters: BOOKS.exodus.totalChapters,
    name: BOOKS.exodus.name,
    watchTitle: `${BOOKS.exodus.name} 함께 보기`,
    defaultStarts: Array.from({ length: BOOKS.exodus.totalChapters }, () => null),
  },
};

export function isWatchBookId(id: string): id is WatchBookId {
  return Object.prototype.hasOwnProperty.call(WATCH_BOOKS, id);
}
