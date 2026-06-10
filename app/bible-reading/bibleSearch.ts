// =============================================================================
// 성경 단어 검색 — lazy fetch 기반 클라이언트 인덱스 검색.
//
//   이전에는 본문 데이터(`BOOK_DATA`) 가 정적 import 로 메모리에 상시 로드돼
//   있어 검색이 동기 함수였다. 정적 import 가 client bundle 을 약 40MB 키우는
//   부작용이 있어, 본문은 모두 정적 자산(`public/bible-data/<bookId>.json`)
//   으로 옮기고 fetch 로 받게 바뀌었다(2026-06).
//
//   그래서 검색도 비동기로 바뀐다:
//     - `prepareSearchIndex()` 가 처음 호출되면 66권을 fetch 하고 평탄화
//       인덱스를 빌드한다. 같은 promise 를 모든 호출자가 공유한다.
//     - `searchBible(...)` 은 `prepareSearchIndex()` 를 await 한 뒤 동일한
//       알고리즘으로 인덱스를 순회한다. 첫 검색만 살짝 기다리고, 이후엔
//       지금처럼 즉시 결과가 나온다.
//
//   책 순서/이름은 books.ts(BOOK_ORDER / BOOKS) 를 그대로 따른다.
//   매칭은 대소문자/공백 무시 부분 문자열(정규화 후 includes).
//
//   본문 라이선스/출처: 개역한글판(KRV, 대한성서공회 1961, 보호기간 50년 경과
//     공공저작물). 데이터 출처: scrollmapper/bible_databases (KorRV, Public
//     Domain). 상세는 app/bible-reading/DATA-LICENSE.md.
// =============================================================================

import { BOOKS, BOOK_ORDER, type BookId } from "./books";
import { loadAllBooks, type BibleData } from "./bibleData";

// 검색은 KRV / 어린이 두 본문만 대상으로 한다.
// 헬라어(greek) 본문도 데이터로는 존재하지만(현재 마태복음 1~5장만), 검색 UX 가
// 한국어 위주이므로 현 시점 검색 대상에서는 제외한다.
export type SearchTranslation = "krv" | "kids";

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

// 인덱스 빌드 promise — 한 번만 시작되고, 같은 promise 를 모든 호출자가 공유한다.
// 빌드 자체는 fetch 응답이 도착한 직후 동기 루프로 끝나 매우 빠르다.
let indexPromise: Promise<IndexEntry[]> | null = null;
// 메타(=라벨용) 책 한 권 캐시. 잠언이 KRV/어린이를 모두 갖고 있어 가장 안전한
// 라벨 출처지만, 정적 import 가 사라졌으니 역시 lazy 로 받는다.
let labelDataPromise: Promise<BibleData> | null = null;

const buildIndexFromAllBooks = (
  all: Record<BookId, BibleData>,
): IndexEntry[] => {
  const out: IndexEntry[] = [];
  for (const bookId of BOOK_ORDER) {
    const book = all[bookId];
    if (!book) continue; // 데이터 누락 — 안전하게 건너뜀.
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
  return out;
};

// 검색 인덱스 준비 — 처음 호출되면 66권을 fetch 하고 평탄화 인덱스를 빌드한다.
// SearchOverlay 가 열릴 때 미리 호출해 두면, 사용자가 입력을 시작할 즈음
// 인덱스가 거의 또는 이미 준비돼 있다.
export const prepareSearchIndex = (): Promise<IndexEntry[]> => {
  if (indexPromise) return indexPromise;
  indexPromise = (async () => {
    const all = await loadAllBooks();
    return buildIndexFromAllBooks(all);
  })();
  // 실패 시 다음 호출에서 다시 시도할 수 있게.
  indexPromise.catch(() => {
    indexPromise = null;
  });
  return indexPromise;
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

const EMPTY_OUTCOME: SearchOutcome = {
  results: [],
  total: 0,
  occurrences: 0,
  truncated: false,
  byBook: [],
};

// 비동기 검색 — 인덱스를 await 한 뒤 동기 루프로 결과를 만든다.
// 같은 검색어/번역/필터 조합을 호출자(SearchOverlay)가 useEffect 안에서
// 디바운싱 하므로, 본 함수 자체에는 추가 디바운스를 두지 않는다.
export const searchBible = async (
  rawQuery: string,
  translation: SearchTranslation,
  // 특정 책만 목록에 담고 싶을 때(개요의 책 칩 클릭 필터). 집계(total/occurrences/
  // byBook)는 항상 전체 기준 — 사용자가 다른 책으로 자유롭게 전환할 수 있도록.
  bookFilter: BookId | null = null,
): Promise<SearchOutcome> => {
  const q = normalizeForSearch(rawQuery);
  if (q.length === 0) return EMPTY_OUTCOME;

  const index = await prepareSearchIndex();
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

// 인덱스가 이미 준비됐는지(=다음 검색이 즉시 결과를 줄 수 있는지) 외부에서
// 한 줄로 알 수 있게 해 두는 헬퍼. SearchOverlay 가 "인덱스 준비 중" 안내를
// 보일지 결정할 때 사용.
export const isSearchIndexReady = (): boolean => indexPromise !== null;

// 번역 라벨 — 잠언 책 메타(translations)에서 가져온다. 본 모듈은 lazy 라
// 라벨이 도착하기 전에는 한국어 기본 라벨을 폴백으로 돌려준다. 도착 후에는
// 항상 정확한 라벨이 나온다.
const FALLBACK_LABELS: Record<SearchTranslation, string> = {
  krv: "개역한글",
  kids: "어린이",
};
let labelData: BibleData | null = null;

const ensureLabelData = (): Promise<BibleData> => {
  if (labelDataPromise) return labelDataPromise;
  // 검색 인덱스 빌드와 같은 흐름을 활용 — `loadAllBooks()` 가 이미 시작됐다면
  // 곧 도착할 잠언 데이터를 그대로 쓰면 된다. 한 번만 시작.
  labelDataPromise = (async () => {
    const all = await loadAllBooks();
    labelData = all.proverbs;
    return all.proverbs;
  })();
  labelDataPromise.catch(() => {
    labelDataPromise = null;
  });
  return labelDataPromise;
};

export const getTranslationLabel = (t: SearchTranslation): string => {
  if (labelData) {
    return labelData.translations[t]?.label ?? FALLBACK_LABELS[t];
  }
  // 도착 전이면 일단 폴백을 반환하고, 다음 호출을 위해 lazy 로 받기 시작.
  void ensureLabelData();
  return FALLBACK_LABELS[t];
};

// 검색 대상 책 안내 문구용. 66권 전체이므로 가독성을 위해
// 책 목록 대신 권 수 요약 문자열을 제공한다.
//   예) "성경 전체 66권 (개역한글)"
export const SEARCHABLE_BOOK_NAMES = `성경 전체 ${BOOK_ORDER.length}권 (개역한글)`;
