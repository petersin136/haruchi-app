export type BookId = "proverbs" | "matthew" | "mark" | "luke" | "john";

export type BookMeta = {
  id: BookId;
  name: string;
  shortName: string;
  totalChapters: number;
};

export const BOOKS: Record<BookId, BookMeta> = {
  proverbs: {
    id: "proverbs",
    name: "잠언",
    shortName: "잠",
    totalChapters: 31,
  },
  matthew: {
    id: "matthew",
    name: "마태복음",
    shortName: "마",
    totalChapters: 28,
  },
  mark: {
    id: "mark",
    name: "마가복음",
    shortName: "막",
    totalChapters: 16,
  },
  luke: {
    id: "luke",
    name: "누가복음",
    shortName: "눅",
    totalChapters: 24,
  },
  john: {
    id: "john",
    name: "요한복음",
    shortName: "요",
    totalChapters: 21,
  },
};

export const BOOK_ORDER: BookId[] = [
  "proverbs",
  "matthew",
  "mark",
  "luke",
  "john",
];
