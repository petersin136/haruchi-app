// =============================================================================
// 성경 본문 데이터 단일 진입점 — lazy fetch 기반.
//
//   이전(2026-06): 66권 JSON 을 정적 import 해 `BOOK_DATA: Record<BookId, BibleData>`
//                  를 메모리에 상시 로드. client bundle 에 약 40MB 의 JSON 이 들어가
//                  bible-reading 페이지의 dev 컴파일/hydration 이 매우 무거웠다
//                  (4.4s / 750 modules · 첫 진입 후 "클릭해야 화면이 뜨는" 증상의
//                  근본 원인 중 하나).
//
//   현재: JSON 파일은 `public/bible-data/<bookId>.json` 정적 자산으로 옮기고,
//        본 모듈은 `loadBookData(bookId)` 비동기 함수로만 노출한다. 모듈 레벨
//        Map 캐시로 같은 책은 두 번 fetch 하지 않는다.
//
//   사용 측:
//     - page.tsx (읽기): `useBookData(bookId)` (page.tsx 안 hook) → 현재 보는
//                         한 권만 fetch. 같은 책으로 돌아오면 캐시로 즉시.
//     - bibleSearch.ts (검색): `loadAllBooks()` → 첫 검색 시 1회 66권 fetch +
//                              평탄화 인덱스 빌드 + 캐시. 이후 검색은 인덱스 순회.
//
// ─────────────────────────────────────────────────────────────────────────────
//  데이터 라이선스 / 출처  ── 자세한 내용은 app/bible-reading/DATA-LICENSE.md
// ─────────────────────────────────────────────────────────────────────────────
//   본문: 성경전서 개역한글판 (KRV, 대한성서공회, 1961).
//
//   라이선스 근거:
//     대한성서공회(bskorea.or.kr) 공식 저작권 FAQ —
//     "성경전서 개역한글판은 저작재산권 보호기간 50년이 경과되어
//      저작권료 지급 없이 사용 가능"
//     (※ 개역개정판 NKRV 는 해당되지 않으므로 본 앱은 절대 NKRV 를 쓰지 않는다.)
//
//   데이터 출처:
//     scrollmapper/bible_databases (GitHub) — 2025-languages branch
//     sources/ko/KorRV/KorRV.json (저장소 README: License = Public Domain)
// =============================================================================

import { BOOK_ORDER, type BookId } from "./books";

// 토글에 노출되는 번역(번역본) 키.
//   - krv:   개역한글 (66권 전부 보유)
//   - kids:  어린이 (기존 5권만 보유, 나머지는 빈 배열)
//   - greek: "원어 묵상" 모드. 이 모드에서는 KRV 본문은 화면에 표시하지 않고,
//            대신 한국어 의역(`greekKr`) 을 본문 자리에 두고, 그 아래에 헬라어
//            단어 토큰(`greekTokens`) 을 표시한다. 각 토큰의 한글 발음을
//            클릭하면 그 단어의 상세 정보가 펼쳐지고, 줄 오른쪽의 ▾ 갈매기를
//            누르면 절 전체 풀이(`greekWords`) 가 펼쳐진다. 현재 마태복음 1장만.
//
// 데이터 키 (verses.* — 모두 옵셔널):
//   - greek       : SBLGNT 헬라어 원문 (평문, 데이터로만 보존)
//   - greekKr     : 원어를 참고한 한국어 의역 (원어 모드의 본문 자리)
//   - greekTokens : 절을 단어 단위로 쪼갠 토큰 배열 — 각 토큰은 헬라어 단어 + 한글
//                   발음 + (선택) 상세 정보. UI 에서 ruby 형태로 발음을 단어
//                   아래에 작게 표시하고, 발음 클릭 시 정보 드롭다운을 펼친다.
//   - greekWords  : 절 전체 풀이 줄글. UI 에서 ▾ 갈매기 버튼을 눌러야 펼쳐진다.
export type TranslationKey = "krv" | "kids" | "greek";

export type Verse = {
  n: number;
  t: string;
};

// 헬라어 토큰: 한 단어(또는 구두점) 단위.
//   w    : 헬라어 단어(원문 그대로 — 강세·기식 포함)
//   p    : 한글 발음 — 빈 문자열이면 단어 아래에 발음을 표시하지 않는다
//          (예: 마침표·세미콜론 등 구두점 토큰).
//   info : 선택. 들어 있으면 발음이 점선 밑줄로 표시되고 클릭 가능해진다.
//          비어 있으면 클릭 비활성(평범한 작은 회색 글씨).
export type GreekToken = { w: string; p: string; info?: string };

export type GreekVerseTokens = { n: number; tokens: GreekToken[] };

export type Chapter = {
  chapter: number;
  title: string;
  // krv 는 모든 책에서 보장되지만(검증된 공공저작물 데이터셋), kids 및 원어 관련 키는
  // 책마다 유무가 다르므로 옵셔널로 둔다. 호출부에선 `verses.kids?.length ?? 0` 처럼 접근.
  verses: {
    krv: Verse[];
    kids?: Verse[];
    greek?: Verse[];
    greekKr?: Verse[];
    greekTokens?: GreekVerseTokens[];
    greekWords?: Verse[];
  };
};

export type BibleData = {
  // 번역 메타정보도 같은 이유로 부분 집합. 라벨이 없는 키는 UI 토글에 노출되지 않는다.
  translations: Partial<Record<TranslationKey, { label: string; note?: string }>>;
  chapters: Chapter[];
};

// ── 안전 폴백 ──────────────────────────────────────────────────────────────
// fetch 가 도착하기 전(또는 실패) 에도 호출부가 동기 인터페이스로 안전하게
// 다룰 수 있도록 빈 BibleData 한 개를 노출한다. chapters=[] 라 verses 접근부
// (`?? []`) 가 모두 빈 배열로 흘러 자연스럽게 "본문 없음" 상태가 된다.
export const EMPTY_BIBLE_DATA: BibleData = {
  translations: {
    krv: { label: "개역한글" },
  },
  chapters: [],
};

// ── 모듈 레벨 캐시 ─────────────────────────────────────────────────────────
// 같은 책의 JSON 은 한 번만 받는다. 재마운트 사이에서도 유지되어, 모드 토글로
// 컴포넌트가 잠깐 사라졌다 돌아와도 즉시 그려진다.
const bookCache = new Map<BookId, Promise<BibleData>>();

// 전체 66권을 받은 적이 있는지(검색 인덱스 빌드용 1회 트리거).
let allBooksPromise: Promise<Record<BookId, BibleData>> | null = null;

export async function loadBookData(bookId: BookId): Promise<BibleData> {
  const cached = bookCache.get(bookId);
  if (cached) return cached;
  const p = (async () => {
    // `cache: "default"` 로 두면 브라우저 HTTP 캐시(ETag) 가 자연스럽게 동작.
    // dev 에서 데이터 갱신 후 hard reload 가 필요할 수 있으나 일반 사용에는 안전.
    const res = await fetch(`/bible-data/${bookId}.json`, { cache: "default" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} — ${bookId}.json 을 불러오지 못했어요`);
    }
    return (await res.json()) as BibleData;
  })();
  bookCache.set(bookId, p);
  // 실패 시 같은 책을 다시 시도할 수 있도록 캐시에서 제거.
  p.catch(() => bookCache.delete(bookId));
  return p;
}

// 검색 인덱스 빌드용 — 66권을 한꺼번에 fetch. 이미 받은 책은 캐시 재사용.
// 한 번만 시작되고, 같은 promise 를 모든 호출자가 공유한다.
export function loadAllBooks(): Promise<Record<BookId, BibleData>> {
  if (allBooksPromise) return allBooksPromise;
  allBooksPromise = (async () => {
    const entries = await Promise.all(
      BOOK_ORDER.map(async (id) => [id, await loadBookData(id)] as const),
    );
    const out = {} as Record<BookId, BibleData>;
    for (const [id, data] of entries) out[id] = data;
    return out;
  })();
  // 실패 시 다음 호출에서 다시 시도할 수 있게 promise 자체는 보관하되,
  // 실패한 book 은 loadBookData 안에서 이미 개별로 cache 가 비워진다.
  allBooksPromise.catch(() => {
    allBooksPromise = null;
  });
  return allBooksPromise;
}
