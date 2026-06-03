// =============================================================================
// 성경 단어 검색 — 순수 클라이언트(메모리) 검색.
//   본문 데이터는 이미 정적 JSON(BOOK_DATA 와 동일 소스)으로 번들에 포함돼 있으므로
//   외부 요청 없이 이 모듈 안에서만 검색한다. JSON 내용은 읽기만 한다(변경 없음).
//
//   - 책 순서/이름은 books.ts(BOOK_ORDER / BOOKS) 를 그대로 따른다.
//   - 본문은 bibleData.ts 의 BOOK_DATA 단일 진입점을 공유한다(번들 중복 방지).
//   - 첫 검색 시 1회 평탄화 인덱스를 만들어 메모이즈(이후 검색은 인덱스 순회만).
//   - 매칭은 대소문자/공백 무시 부분 문자열(정규화 후 includes).
//
//   본문 라이선스/출처: 개역한글판(KRV, 대한성서공회 1961, 보호기간 50년 경과
//     공공저작물). 데이터 출처: scrollmapper/bible_databases (KorRV, Public
//     Domain). 상세는 app/bible-reading/DATA-LICENSE.md.
// =============================================================================

import { BOOKS, BOOK_ORDER, type BookId } from "./books";
import { BOOK_DATA, type BibleData } from "./bibleData";

// 검색은 KRV / 쉬운말 두 본문만 대상으로 한다.
// 헬라어(greek) 본문도 데이터로는 존재하지만(현재 마태복음 1~5장만), 검색 UX 가
// 한국어 위주이므로 현 시점 검색 대상에서는 제외한다.
export type SearchTranslation = "krv" | "kids";

// bibleData.ts 의 BibleData 와 동일 구조를 그대로 사용한다.
const RAW: Record<BookId, BibleData> = BOOK_DATA;

export type SearchResult = {
  bookId: BookId;
  bookName: string;
  chapter: number;
  verseNo: number;
  text: string;
};

export type BookCount = {
  bookId: BookId;
  bookName: string;
  count: number; // 그 책에서 매칭된 구절 수
};

export type SearchOutcome = {
  results: SearchResult[];
  total: number; // 매칭된 구절 총 개수
  occurrences: number; // 단어가 등장한 총 횟수(한 구절에 여러 번 가능)
  truncated: boolean; // total > 화면에 담은 results.length
  byBook: BookCount[]; // 책별 매칭 구절 수(매칭 있는 책만, 성경 순서)
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

// 정규화 문자열에서 검색어가 몇 번 등장하는지(비중첩) 센다.
const countOccurrences = (hay: string, needle: string): number => {
  let count = 0;
  let idx = hay.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = hay.indexOf(needle, idx + needle.length);
  }
  return count;
};

export const searchBible = (
  rawQuery: string,
  translation: SearchTranslation,
  // 특정 책만 목록에 담고 싶을 때(개요의 책 칩 클릭 필터). 집계(total/occurrences/
  // byBook)는 항상 전체 기준 — 사용자가 다른 책으로 자유롭게 전환할 수 있도록.
  bookFilter: BookId | null = null,
): SearchOutcome => {
  const q = normalizeForSearch(rawQuery);
  if (q.length === 0) {
    return { results: [], total: 0, occurrences: 0, truncated: false, byBook: [] };
  }

  const index = buildIndex();
  const results: SearchResult[] = [];
  let total = 0;
  let occurrences = 0;
  const perBook = new Map<BookId, number>();

  for (const e of index) {
    const hay = translation === "krv" ? e.krvNorm : e.kidsNorm;
    if (hay.length > 0 && hay.includes(q)) {
      total += 1;
      occurrences += countOccurrences(hay, q);
      perBook.set(e.bookId, (perBook.get(e.bookId) ?? 0) + 1);
      const passesFilter = bookFilter === null || e.bookId === bookFilter;
      if (passesFilter && results.length < MAX_SEARCH_RESULTS) {
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

  // 매칭 있는 책만, 성경(BOOK_ORDER) 순서로 정렬해 분포 제공.
  const byBook: BookCount[] = BOOK_ORDER.filter(
    (id) => (perBook.get(id) ?? 0) > 0,
  ).map((id) => ({
    bookId: id,
    bookName: BOOKS[id].name,
    count: perBook.get(id) ?? 0,
  }));

  // 목록 기준 매칭 수(필터 적용 시 그 책의 구절 수) 대비 표시 개수로 truncated 판정.
  const listTotal = bookFilter === null ? total : perBook.get(bookFilter) ?? 0;

  return {
    results,
    total,
    occurrences,
    truncated: listTotal > results.length,
    byBook,
  };
};

export const getTranslationLabel = (t: SearchTranslation): string =>
  RAW.proverbs.translations[t]?.label ?? (t === "krv" ? "개역한글" : "쉬운말");

// (note) RAW.proverbs.translations 는 Partial 이지만 KRV/쉬운말은 잠언에 항상 존재한다.

// 검색 대상 책 안내 문구용. 66권 전체이므로 가독성을 위해
// 책 목록 대신 권 수 요약 문자열을 제공한다.
//   예) "성경 전체 66권 (개역한글)"
export const SEARCHABLE_BOOK_NAMES = `성경 전체 ${BOOK_ORDER.length}권 (개역한글)`;
