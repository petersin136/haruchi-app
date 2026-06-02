// =============================================================================
// 성경 단어 검색 — 순수 클라이언트(메모리) 검색.
//   본문 데이터는 이미 정적 JSON(BOOK_DATA 와 동일 소스)으로 번들에 포함돼 있으므로
//   외부 요청 없이 이 모듈 안에서만 검색한다. JSON 내용은 읽기만 한다(변경 없음).
//
//   - 책 순서/이름은 books.ts(BOOK_ORDER / BOOKS) 를 그대로 따른다.
//   - 첫 검색 시 1회 평탄화 인덱스를 만들어 메모이즈(이후 검색은 인덱스 순회만).
//   - 매칭은 대소문자/공백 무시 부분 문자열(정규화 후 includes).
// =============================================================================

import proverbsData from "./proverbs.json";
import matthewData from "./matthew.json";
import markData from "./mark.json";
import lukeData from "./luke.json";
import johnData from "./john.json";
import { BOOKS, BOOK_ORDER, type BookId } from "./books";

export type SearchTranslation = "krv" | "kids";

type RawVerse = { n: number; t: string };
type RawChapter = {
  chapter: number;
  title: string;
  verses: Record<string, RawVerse[]>;
};
type RawBook = {
  translations: Record<string, { label: string; note?: string }>;
  chapters: RawChapter[];
};

const RAW: Record<BookId, RawBook> = {
  proverbs: proverbsData as RawBook,
  matthew: matthewData as RawBook,
  mark: markData as RawBook,
  luke: lukeData as RawBook,
  john: johnData as RawBook,
};

export type SearchResult = {
  bookId: BookId;
  bookName: string;
  chapter: number;
  verseNo: number;
  text: string;
};

export type SearchOutcome = {
  results: SearchResult[];
  total: number; // 정규화 매칭 총 개수
  truncated: boolean; // total > 화면에 담은 results.length
};

type IndexEntry = {
  bookId: BookId;
  bookName: string;
  chapter: number;
  verseNo: number;
  krv: string;
  kids: string;
  krvNorm: string;
  kidsNorm: string;
};

// 대소문자/공백 무시 정규화. (한글은 대소문자 영향 없지만 영문·혼합 검색 대비)
export const normalizeForSearch = (s: string): string =>
  s.toLowerCase().replace(/\s+/g, "");

let INDEX: IndexEntry[] | null = null;

const buildIndex = (): IndexEntry[] => {
  if (INDEX) return INDEX;
  const out: IndexEntry[] = [];
  for (const bookId of BOOK_ORDER) {
    const book = RAW[bookId];
    const bookName = BOOKS[bookId].name;
    for (const ch of book.chapters) {
      const byNo = new Map<number, { krv: string; kids: string }>();
      for (const v of ch.verses.krv ?? []) {
        const e = byNo.get(v.n) ?? { krv: "", kids: "" };
        e.krv = v.t;
        byNo.set(v.n, e);
      }
      for (const v of ch.verses.kids ?? []) {
        const e = byNo.get(v.n) ?? { krv: "", kids: "" };
        e.kids = v.t;
        byNo.set(v.n, e);
      }
      for (const [verseNo, texts] of Array.from(byNo.entries())) {
        out.push({
          bookId,
          bookName,
          chapter: ch.chapter,
          verseNo,
          krv: texts.krv,
          kids: texts.kids,
          krvNorm: normalizeForSearch(texts.krv),
          kidsNorm: normalizeForSearch(texts.kids),
        });
      }
    }
  }
  // 책 순서 → 장 → 절 오름차순 정렬(결과를 성경 순서대로 보여주기 위함).
  out.sort((a, b) => {
    const ai = BOOK_ORDER.indexOf(a.bookId);
    const bi = BOOK_ORDER.indexOf(b.bookId);
    if (ai !== bi) return ai - bi;
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    return a.verseNo - b.verseNo;
  });
  INDEX = out;
  return out;
};

// 결과가 폭발적으로 많을 때(흔한 글자 한 자 등) 렌더 비용 보호용 상한.
// 총 매칭 수(total)는 그대로 세고, 화면 목록만 상한으로 자른다.
export const MAX_SEARCH_RESULTS = 300;

export const searchBible = (
  rawQuery: string,
  translation: SearchTranslation,
): SearchOutcome => {
  const q = normalizeForSearch(rawQuery);
  if (q.length === 0) return { results: [], total: 0, truncated: false };

  const index = buildIndex();
  const results: SearchResult[] = [];
  let total = 0;

  for (const e of index) {
    const hay = translation === "krv" ? e.krvNorm : e.kidsNorm;
    if (hay.length > 0 && hay.includes(q)) {
      total += 1;
      if (results.length < MAX_SEARCH_RESULTS) {
        results.push({
          bookId: e.bookId,
          bookName: e.bookName,
          chapter: e.chapter,
          verseNo: e.verseNo,
          text: translation === "krv" ? e.krv : e.kids,
        });
      }
    }
  }

  return { results, total, truncated: total > results.length };
};

export const getTranslationLabel = (t: SearchTranslation): string =>
  RAW.proverbs.translations[t]?.label ?? (t === "krv" ? "개역한글" : "쉬운말");

// 검색 대상 책 안내 문구용 — "잠언·마태복음·마가복음·누가복음·요한복음"
export const SEARCHABLE_BOOK_NAMES = BOOK_ORDER.map(
  (id) => BOOKS[id].name,
).join("·");
