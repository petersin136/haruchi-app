"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BOOKS,
  NT_BOOK_IDS,
  OT_BOOK_IDS,
  isOldTestament,
  type BookId,
} from "./books";
import { loadKoreanChapter, loadKoreanIndex } from "./bibleData";
import Dropdown, { type DropdownOption } from "./components/Dropdown";
import VerseList from "./components/VerseList";
import Link from "next/link";
import MobileTopBar, {
  watchHrefFor,
} from "./components/MobileTopBar";
import BookChapterDrawer from "./components/BookChapterDrawer";
import BottomTabBar from "../components/BottomTabBar";
import {
  appendReadLog,
  doneKey,
  isChapterDone,
  markChapterDone,
  removeReadLog,
  unmarkChapterDone,
  type ReadingScope,
} from "../lib/readLog";
// 새 "헬라어 보기 v2" 구조 — 신약 27권 전체, 히브리어는 구약 39권 전체.
// 본문 데이터(`*-v2.json`)는 `public/bible-v2/` 에서 런타임 fetch 로 받는다.
// (webpack dynamic import 로 묶으면 66권 합 ~150MB 가 의존성 그래프에 들어가
// dev 컴파일 시 V8 힙이 폭발한다.)
import nextDynamic from "next/dynamic";
import "./bible-reading.css";
import "./mobile.css";

// dynamic chunk 로드 전에 자리에 보이는 짧은 인라인 안내. `loading` 을
// 비워두면 ssr:false dynamic 컴포넌트의 자리가 첫 진입 시 잠깐 비어
// "화면이 멈춘 듯한" 인상을 만든다. 한 줄짜리 부드러운 표시로 대체.
const DynamicViewLoading = () => (
  <p className="brp-dynamic-loading" role="status" aria-busy="true">
    <span className="brp-dynamic-loading-dot" aria-hidden="true" />
    화면을 준비하는 중…
  </p>
);

const HebrewChapterV2 = nextDynamic(
  () => import("./components/HebrewChapterV2"),
  { ssr: false, loading: DynamicViewLoading },
);
const GreekChapterV2 = nextDynamic(
  () => import("./components/GreekChapterV2"),
  { ssr: false, loading: DynamicViewLoading },
);
// "성경 공부" 모드(다중 역본 레이어 뷰어) + 영어(WEB) 단일 역본 뷰는 신약
// 27권 전체에서 동작한다. 다른 모드와 마찬가지로 lazy-load — 사용자가
// 드롭다운에서 그 모드를 골랐을 때에만 chunk 가 받아진다.
const LayeredBibleViewer = nextDynamic(
  () => import("../bible-study/components/LayeredBibleViewer"),
  { ssr: false, loading: DynamicViewLoading },
);
const EnglishOnlyView = nextDynamic(
  () => import("../bible-study/components/EnglishOnlyView"),
  { ssr: false, loading: DynamicViewLoading },
);
const SearchOverlay = nextDynamic(() => import("./SearchOverlay"), {
  ssr: false,
});
const StudyNotebook = nextDynamic(
  () => import("../study/components/StudyNotebook"),
  { ssr: false, loading: DynamicViewLoading },
);
// 성경 공부/영어(WEB) 두 모드가 지원하는 책 ID 집합. NT 27권 + OT 39권.
// 사용자가 어느 책에 있든 모드를 누르면 그 책 그대로 모드 진입.
const STUDY_NT_BOOK_IDS: readonly string[] = [
  "matthew",
  "mark",
  "luke",
  "john",
  "acts",
  "romans",
  "corinthians1",
  "corinthians2",
  "galatians",
  "ephesians",
  "philippians",
  "colossians",
  "thessalonians1",
  "thessalonians2",
  "timothy1",
  "timothy2",
  "titus",
  "philemon",
  "hebrews",
  "james",
  "peter1",
  "peter2",
  "john1",
  "john2",
  "john3",
  "jude",
  "revelation",
];
const STUDY_OT_BOOK_IDS: readonly string[] = [
  "genesis",
  "exodus",
  "leviticus",
  "numbers",
  "deuteronomy",
  "joshua",
  "judges",
  "ruth",
  "samuel1",
  "samuel2",
  "kings1",
  "kings2",
  "chronicles1",
  "chronicles2",
  "ezra",
  "nehemiah",
  "esther",
  "job",
  "psalms",
  "proverbs",
  "ecclesiastes",
  "songofsolomon",
  "isaiah",
  "jeremiah",
  "lamentations",
  "ezekiel",
  "daniel",
  "hosea",
  "joel",
  "amos",
  "obadiah",
  "jonah",
  "micah",
  "nahum",
  "habakkuk",
  "zephaniah",
  "haggai",
  "zechariah",
  "malachi",
];
const STUDY_BOOK_IDS: readonly string[] = [
  ...STUDY_NT_BOOK_IDS,
  ...STUDY_OT_BOOK_IDS,
];
type StudyNTBookId =
  | "matthew"
  | "mark"
  | "luke"
  | "john"
  | "acts"
  | "romans"
  | "corinthians1"
  | "corinthians2"
  | "galatians"
  | "ephesians"
  | "philippians"
  | "colossians"
  | "thessalonians1"
  | "thessalonians2"
  | "timothy1"
  | "timothy2"
  | "titus"
  | "philemon"
  | "hebrews"
  | "james"
  | "peter1"
  | "peter2"
  | "john1"
  | "john2"
  | "john3"
  | "jude"
  | "revelation";
type StudyOTBookId =
  | "genesis"
  | "exodus"
  | "leviticus"
  | "numbers"
  | "deuteronomy"
  | "joshua"
  | "judges"
  | "ruth"
  | "samuel1"
  | "samuel2"
  | "kings1"
  | "kings2"
  | "chronicles1"
  | "chronicles2"
  | "ezra"
  | "nehemiah"
  | "esther"
  | "job"
  | "psalms"
  | "proverbs"
  | "ecclesiastes"
  | "songofsolomon"
  | "isaiah"
  | "jeremiah"
  | "lamentations"
  | "ezekiel"
  | "daniel"
  | "hosea"
  | "joel"
  | "amos"
  | "obadiah"
  | "jonah"
  | "micah"
  | "nahum"
  | "habakkuk"
  | "zephaniah"
  | "haggai"
  | "zechariah"
  | "malachi";
type StudyBookId = StudyNTBookId | StudyOTBookId;
import Wordmark from "../components/Wordmark";
import type { SearchSelection } from "./SearchOverlay";

// 화면 토글에 노출되는 번역본 키.
//   - krv:   개역한글
//   - kids:  어린이
//   - greek: "원어 묵상" 모드. KRV 본문을 화면에서 숨기고, 원어 의역(greekKr)
//           을 본문 자리에 두며, 그 아래에 헬라어 단어 토큰(greekTokens) 을
//           헬라어/한글 발음의 ruby 형태로 표시한다. 발음에 점선 밑줄이 있는
//           단어를 클릭하면 그 단어의 상세 정보 드롭다운이 펼쳐지고, 헬라어
//           줄 오른쪽의 ▾ 갈매기를 누르면 절 전체 풀이(greekWords) 가 펼쳐진다.
//           현재 마태복음 1장만 새 디자인으로 채워져 있다.
type TranslationKey = "krv" | "kids" | "greek" | "hebrew";

// 히브리어 보기 모드가 지원되는 책 id. 헬라어가 신약 27권 전체를 커버하는 것과
// 동일하게, 히브리어는 구약 39권 전체를 커버한다 (OSHB/WLC + morphhb 기반).
const HEBREW_BOOK_IDS: ReadonlyArray<string> = [
  "genesis",
  "exodus",
  "leviticus",
  "numbers",
  "deuteronomy",
  "joshua",
  "judges",
  "ruth",
  "samuel1",
  "samuel2",
  "kings1",
  "kings2",
  "chronicles1",
  "chronicles2",
  "ezra",
  "nehemiah",
  "esther",
  "job",
  "psalms",
  "proverbs",
  "ecclesiastes",
  "songofsolomon",
  "isaiah",
  "jeremiah",
  "lamentations",
  "ezekiel",
  "daniel",
  "hosea",
  "joel",
  "amos",
  "obadiah",
  "jonah",
  "micah",
  "nahum",
  "habakkuk",
  "zephaniah",
  "haggai",
  "zechariah",
  "malachi",
];

type TanakhBookId =
  | "genesis"
  | "exodus"
  | "leviticus"
  | "numbers"
  | "deuteronomy"
  | "joshua"
  | "judges"
  | "ruth"
  | "samuel1"
  | "samuel2"
  | "kings1"
  | "kings2"
  | "chronicles1"
  | "chronicles2"
  | "ezra"
  | "nehemiah"
  | "esther"
  | "job"
  | "psalms"
  | "proverbs"
  | "ecclesiastes"
  | "songofsolomon"
  | "isaiah"
  | "jeremiah"
  | "lamentations"
  | "ezekiel"
  | "daniel"
  | "hosea"
  | "joel"
  | "amos"
  | "obadiah"
  | "jonah"
  | "micah"
  | "nahum"
  | "habakkuk"
  | "zephaniah"
  | "haggai"
  | "zechariah"
  | "malachi";

// 모드 전환 드롭다운 값.
//   - krv / kids / greek : 기존 단일 역본 읽기(아무 책/장).
//   - english            : 영어(WEB) 단일 역본 읽기 — 로마서 1장 전용.
//   - study              : 다중 역본 레이어 뷰어(성경 공부) — 로마서 1장 전용.
// english / kjv / study 를 고르면 그 책의 영어(또는 공부) 화면으로 들어간다.
type ModeChoice = TranslationKey | "english" | "kjv" | "study";
type ViewMode = "reader" | "english" | "kjv" | "study";

type Verse = {
  n: number;
  t: string;
};

const EMPTY_VERSES: Verse[] = [];

// 헬라어 단어 토큰. UI 에서 단어/발음 ruby 와 단어별 정보 드롭다운에 쓴다.
//   w    : 헬라어 원문 단어(강세·기식 포함)
//   p    : 한글 발음. 빈 문자열이면 발음 줄에 아무것도 그리지 않는다(구두점용).
//   info : 있으면 발음에 점선 밑줄이 붙고 클릭 시 정보 드롭다운이 열린다.
//          없으면 단순 텍스트.
type GreekToken = { w: string; p: string; info?: string };
type GreekVerseTokens = { n: number; tokens: GreekToken[] };

type Chapter = {
  chapter: number;
  title: string;
  // krv 는 모든 책 보장. 그 외(어린이·원어 관련)는 책마다 유무 다르므로 옵셔널.
  //   greek        : SBLGNT 헬라어 원문 평문 (현재 UI 직접 노출 X, 데이터 보존)
  //   greekKr      : 원어 의역 — 원어 모드에서 본문 자리에 표시되는 한국어 문장
  //   greekTokens  : 절을 단어 단위로 쪼갠 토큰 배열 — 단어/발음 ruby + 단어별 정보
  //   greekWords   : 절 전체 풀이 줄글 — ▾ 갈매기 버튼을 눌렀을 때만 펼쳐짐
  verses: {
    krv: Verse[];
    kids?: Verse[];
    greek?: Verse[];
    greekKr?: Verse[];
    greekTokens?: GreekVerseTokens[];
    greekWords?: Verse[];
  };
};

// 읽기 본문은 장 단위 `korean.json` 만 받는다. 검색은 검색창을 열 때
// `loadAllBooks()` 로 책 전체 `/bible-data/<bookId>.json` 을 받는다.

const readingScopeOf = (mode: ViewMode): ReadingScope =>
  mode === "english" ? "web" : mode === "kjv" ? "kjv" : "reader";

const isEnglishReadingMode = (mode: ViewMode) =>
  mode === "english" || mode === "kjv";

const CURRENT_BOOK_KEY = "bible_current_book";
// 양쪽 드롭다운(구약/신약)이 서로의 마지막 선택을 잊지 않도록, 각 testament 별
// "마지막으로 본 책" 을 따로 보관한다. 사용자가 구약 어디를 보고 있을 때도
// 신약 드롭다운에는 직전에 봤던 신약 책 이름이 그대로 떠 있어, 두 testament
// 사이를 오갈 때마다 매번 처음부터 다시 찾을 필요가 없다.
const LAST_OT_BOOK_KEY = "bible_last_ot_book";
const LAST_NT_BOOK_KEY = "bible_last_nt_book";
const currentChapterKey = (bookId: BookId) =>
  `bible_current_chapter_${bookId}`;
const MIGRATION_V1_KEY = "bible_migrated_v1";
const TRANSLATION_KEY = "bible_translation";
// 모드 드롭다운(reader/english/study) 의 마지막 선택을 보관.
//   reader 가 기본값(기존 호환). 새로고침해도 마지막 모드를 복구한다.
const VIEW_MODE_KEY = "bible_view_mode";

// 책+장 단위 마지막 스크롤 위치를 in-memory 로 기억한다.
//   - 사용자가 다른 testament 로 잠깐 갔다가 신약/구약 드롭다운 트리거를 눌러
//     "보던 책으로 즉시 복귀" 할 때, 그 안에서 보고 있던 위치 그대로 살려준다.
//   - localStorage 가 아닌 모듈 레벨 Map — 새로고침 시에는 깨끗히 리셋
//     (cold start 에서 임의의 위치로 점프하면 오히려 어색하기 때문).
const scrollMemoryByChapter = new Map<string, number>();
const scrollMemoryKey = (b: BookId, c: number) => `${b}-${c}`;

const migrateLegacyKeys = () => {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(MIGRATION_V1_KEY) === "true") return;
  for (let i = 1; i <= 31; i += 1) {
    const oldDone = window.localStorage.getItem(`proverbs_done_${i}`);
    if (oldDone !== null) {
      window.localStorage.setItem(`bible_done_proverbs_${i}`, oldDone);
    }
    const oldProgress = window.localStorage.getItem(
      `proverbs_verse_progress_${i}`,
    );
    if (oldProgress !== null) {
      window.localStorage.setItem(
        `bible_verse_progress_proverbs_${i}`,
        oldProgress,
      );
    }
  }
  window.localStorage.setItem(MIGRATION_V1_KEY, "true");
};

// 톱니바퀴 아이콘 — 데스크탑 nav 와 모바일 메뉴 둘 다에서 재사용.
// currentColor 로 그려져 다크/라이트 모드를 자동으로 따라간다.
function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export default function BibleReadingPage() {
  // bookId 는 항상 유효한 값으로 유지 — 데이터/메모 계산 로직이 한 곳에서
  // 분기 처리되지 않도록(creep prevention). bookConfirmed 는 본문/컨트롤
  // 표시 여부. 첫 화면부터 본문이 보이도록 기본은 true(잠언 1장).
  // 이전 방문 책은 mount 시 useEffect 에서 복구한다.
  const [bookId, setBookId] = useState<BookId>("proverbs");
  const [bookConfirmed, setBookConfirmed] = useState(true);
  // 두 드롭다운이 각자 마지막 선택을 기억하도록, 활성 bookId 와는 별도로
  // testament 별 "마지막 책" 을 추적한다. 양쪽이 동시에 책 이름을 띄울 수
  // 있어, 사용자는 구약↔신약 사이를 다시 검색하지 않고 즉시 전환 가능.
  //   - null  : 그쪽 testament 를 아직 한 번도 안 골랐음 → placeholder.
  //   - BookId: 그 책 이름이 트리거에 표시됨(현재 보는 활성 책과 무관).
  const [lastOtBookId, setLastOtBookId] = useState<BookId | null>(null);
  const [lastNtBookId, setLastNtBookId] = useState<BookId | null>(null);
  const [chapterNumber, setChapterNumber] = useState(1);
  const [translation, setTranslation] = useState<TranslationKey>("krv");
  // 화면 모드 — "reader" 는 기존 단일 역본 reader, "english" 는 로마서 1장
  // 영어(WEB) 단일 역본, "study" 는 로마서 1장 다중 역본 레이어 뷰어.
  // 후 두 모드는 로마서 1장 전용이라, 진입 시 자동으로 로마서 1장으로 이동.
  const [viewMode, setViewMode] = useState<ViewMode>("reader");
  const viewModeRef = useRef<ViewMode>("reader");
  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);
  // 원어묵상 모드 — 절 전체 풀이 서랍(▾ 갈매기)이 펼쳐진 절 번호 집합.
  // 책/장/번역이 바뀌면 자동으로 비워진다(useEffect 아래).
  const [openWordDrawers, setOpenWordDrawers] = useState<Set<number>>(
    () => new Set(),
  );
  // 원어묵상 모드 — 단어별 정보 팝오버가 열린 토큰 키 집합.
  //   key = `${verseNumber}:${tokenIndex}` 형식. 책/장/번역 변경 시 비워짐.
  const [openTokenInfos, setOpenTokenInfos] = useState<Set<string>>(
    () => new Set(),
  );
  const [doneChapters, setDoneChapters] = useState<Set<number>>(new Set());
  // 절 다중 선택 + 복사 — 별도 "선택 모드" 레이어.
  //   1) 본문(.brp-verse) 어디든 약 500ms 길게 누르면 selectionMode 진입 + 그 절 자동 선택.
  //   2) 모드 중에는 다른 절을 그냥 탭하면 선택/해제 토글 (길게 누를 필요 없음).
  //   3) 모든 절을 해제하거나 "선택 취소" 를 누르면 selectionMode 종료.
  //   4) "복사" 누르면 클립보드에 "{책} {장}:{절} {본문}\n..." 형식으로 들어감.
  //   5) ESC / 책·장·번역 전환 시 자동 해제.
  // 길게 누르기는 본문 스크롤과 충돌하지 않도록 10px 이동 시 타이머 취소.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedVerses, setSelectedVerses] = useState<Set<number>>(new Set());
  const [copyToast, setCopyToast] = useState<string>("");
  // 장 끝 도달 자동 완료 토스트 — "✓ {책} {장}장 완료 · 되돌리기"
  const [doneToast, setDoneToast] = useState<{
    bookId: BookId;
    chapter: number;
    bookName: string;
  } | null>(null);
  // 되돌리기 후 같은 자리에서 다시 끝 도달을 감지하려면 센티널을 리마운트.
  const [endSentinelNonce, setEndSentinelNonce] = useState(0);
  // 스크롤 다운 시 헤더는 사라지고, 책·장·소제목만 표시하는 반투명 미니바가 떠 있음.
  // scrolled: 페이지가 헤더 영역을 지나 스크롤됐는지 (헤더 숨김 토글에 사용).
  // miniVisible: 미니바 표시 여부 (본문 카드가 뷰포트에 보이는 동안만).
  // readerProgress: 본문(reader) 카드 안에서 얼마나 진행했는지 0~1.
  //   미니바 내부 좌→우 에너지바 fill 의 width 로 사용됨.
  const [scrolled, setScrolled] = useState(false);
  const [miniVisible, setMiniVisible] = useState(false);
  const [readerProgress, setReaderProgress] = useState(0);
  // 새로고침 시 FOUC 방지: SSR/하이드레이션이 끝나기 전까지는 globals.css
  // 의 .brp-page 규칙이 페이지를 숨겨두고, 마운트 후에만 brp-page--ready
  // 클래스를 붙여 부드럽게 fade-in. 모든 styled-jsx 가 적용된 시점에만
  // 화면이 노출되므로 default 브라우저 스타일이 보이는 깜빡임이 사라진다.
  const [mounted, setMounted] = useState(false);
  const [navMenuOpen, setNavMenuOpen] = useState(false);
  // 성경 단어 검색 — 독립 기능. 음성/스크롤/기도/선택 흐름과 분리.
  //   searchOpen: 검색 오버레이 표시 여부.
  //   flashVerse: 검색 결과로 이동했을 때 잠깐 강조(스크롤 타겟)할 절 번호.
  const [searchOpen, setSearchOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [flashVerse, setFlashVerse] = useState<number | null>(null);

  // ─── 절 선택/복사용 ref들 ─────────────────────────────────────────────
  // long-press 타이머와 시작 위치. 본문 스크롤 의도로 손가락이 10px 넘게
  // 움직이면 즉시 취소 → 의도치 않은 선택 모드 진입 방지.
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  // long-press 가 실제로 발동되어 selectionMode 로 진입했을 때, 그 직후 따라오는
  // click 이 같은 절을 즉시 토글-해제 하는 것을 막기 위한 일회성 플래그.
  const suppressNextClickRef = useRef(false);
  // 복사 토스트 자동 사라짐 타이머 — 연속 복사 시 이전 타이머 클리어.
  const copyToastTimerRef = useRef<number | null>(null);
  const readerSectionRef = useRef<HTMLElement | null>(null);
  const sideRef = useRef<HTMLElement | null>(null);
  // 장 끝 센티널 — 진입 시각 / 현재 교차 여부 / 지연 완료 타이머.
  const chapterEnteredAtRef = useRef<number>(Date.now());
  const endVisibleRef = useRef(false);
  const endFinalizeTimerRef = useRef<number | null>(null);
  const doneChaptersRef = useRef<Set<number>>(new Set());

  // 다음 (bookId, chapterNumber) 가 적용된 직후 적용할 scrollY.
  //   quickJumpToBook 에서 세팅 → 그 직후 useLayoutEffect 에서 한 번 소비 후 null.
  //   null 이면 스크롤을 손대지 않음(panel pick 은 별도로 scrollTo 0 호출).
  const pendingScrollRestoreRef = useRef<number | null>(null);

  // 설정 페이지 미리보기가 본문 폭을 1:1 로 복제할 수 있도록,
  // 실제 .brp-reader 의 렌더 폭(border-box)을 localStorage 에 기록한다.
  // (설정 페이지는 별도 네비게이션이라 mount 시 이 값을 읽어 동일 폭으로 렌더 →
  //  같은 폰트/배수/그리드와 합쳐져 줄바꿈이 메인과 정확히 일치)
  useEffect(() => {
    const el = readerSectionRef.current;
    if (!el || typeof window === "undefined" || typeof ResizeObserver === "undefined")
      return;
    const store = () => {
      try {
        window.localStorage.setItem(
          "haruchi:reader-width",
          String(Math.round(el.getBoundingClientRect().width))
        );
      } catch {
        /* localStorage 비활성 환경 무시 */
      }
    };
    store();
    const ro = new ResizeObserver(store);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 하이드레이션 + styled-jsx 적용이 끝난 직후 .brp-page--ready 부착 →
  // globals.css 의 visibility: hidden 이 해제되며 페이지가 fade-in.
  // useEffect 는 React commit 이후에 실행되므로 이 시점엔 styled-jsx 의
  // <style> 태그도 이미 DOM 에 주입돼 있다 (FOUC 없음).
  useEffect(() => {
    setMounted(true);
  }, []);


  // 스크롤 위치에 따라 헤더 ↔ 미니바 토글 + 본문 진행도 계산.
  //
  // 두 가지 스크롤 컨텍스트 모두 지원 (브레이크포인트에 따라 자동 감지):
  //   A) 모바일 / 태블릿 portrait — 페이지 자체가 스크롤(window). hero·reader 가
  //      flex 흐름으로 함께 위로 사라진다.
  //   B) 태블릿 가로 / PC (≥960px) — .brp-page 가 height:100vh + overflow:hidden
  //      이라 window 는 스크롤 불가. 대신 .brp-reader 가 자기 overflow-y:auto
  //      안에서 독립 스크롤 (Gmail/Notion 식 2-pane). 이 모드에서 window.scrollY
  //      는 항상 0 이므로 미니바가 영원히 안 떴음 → reader.scrollTop 으로 보정.
  //
  // 감지 방법: reader.scrollHeight > clientHeight + 4 이면 reader 가 스크롤
  // 컨테이너(=모드 B). 한 핸들러로 두 모드 모두 처리.
  //
  // 헤더는 80px 이상 스크롤되면 계속 숨김 (가독성 확보).
  // 미니바는 그 위에 추가 조건 — 본문(reader) 카드가 뷰포트 안에 보이는 동안만.
  // readerProgress: 본문 안에서 좌→우 에너지바 채움의 scaleX(0~1) 로 쓰임.
  //
  // 성능: 스크롤 이벤트는 모바일에서 초당 60~120회 발생 → 매번 setState 3개
  // 갱신하면 React reconciliation 부담이 큼 (특히 iOS 에선 jank). rAF 로
  // 다음 paint 직전 한 번만 계산하도록 throttle — 부드러운 60fps 유지.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let rafId: number | null = null;
    let pending = false;

    const compute = () => {
      pending = false;
      rafId = null;
      const reader = readerSectionRef.current;
      const winScroll = window.scrollY;
      const readerScroll = reader?.scrollTop ?? 0;
      // 활성 스크롤 컨텍스트의 진행량 — 헤더/미니바 토글의 단일 임계값.
      const effectiveScroll = Math.max(winScroll, readerScroll);
      const past = effectiveScroll > 80;
      setScrolled(past);

      if (!reader) {
        setMiniVisible(false);
        setReaderProgress(0);
        return;
      }

      // 모드 B (≥960px 독립 스크롤) — reader 자체가 overflow scrollable.
      const readerIsScrollContainer =
        reader.scrollHeight > reader.clientHeight + 4;

      if (readerIsScrollContainer) {
        // reader 컨테이너는 viewport 안에 fixed 위치라 항상 보임 → past 만으로 OK.
        setMiniVisible(past);
        // 진행도: 내부 scrollTop / 가능한 최대 scrollTop.
        const scrollable = reader.scrollHeight - reader.clientHeight;
        const ratio =
          scrollable > 0
            ? Math.max(0, Math.min(1, reader.scrollTop / scrollable))
            : 0;
        setReaderProgress(ratio);
        return;
      }

      // 모드 A (모바일/포트레이트) — 페이지(window) 스크롤.
      const rect = reader.getBoundingClientRect();
      // reader 카드 하단이 뷰포트 상단(=0)보다 위에 있으면 본문은 다 지나간 것.
      const readerStillInView = rect.bottom > 0;
      setMiniVisible(past && readerStillInView);
      // 본문 진행도 (0~1):
      //   0%  → reader 상단이 뷰포트 상단에 닿은 시점 (=막 읽기 시작).
      //   100% → reader 하단(=마지막 줄)이 뷰포트 하단에 닿은 시점.
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const scrollable = rect.height - vh;
      let ratio: number;
      if (scrollable <= 0) {
        ratio = rect.top <= 0 ? 1 : 0;
      } else {
        ratio = Math.max(0, Math.min(1, -rect.top / scrollable));
      }
      setReaderProgress(ratio);
    };

    // requestAnimationFrame 스로틀 — 같은 프레임 내 여러 scroll 이벤트는 한 번만 계산.
    const onScroll = () => {
      if (pending) return;
      pending = true;
      rafId = window.requestAnimationFrame(compute);
    };

    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // reader 가 마운트(bookConfirmed=true)된 뒤에야 ref 가 채워짐. 그 시점부터
    // 내부 스크롤도 듣도록 동적 부착. bookConfirmed 가 다시 false 가 되면
    // reader 가 unmount 되어 listener 도 함께 GC. 안전을 위해 cleanup 에서도 제거.
    const reader = readerSectionRef.current;
    reader?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      reader?.removeEventListener("scroll", onScroll);
    };
  }, [bookConfirmed]);

  const bookMeta = BOOKS[bookId];

  // 읽기 본문은 지금 장만 받는다. 장 목록·제목은 korean-index.json.
  // 검색은 그대로 책 전체 bible-data 를 쓴다.
  const [loadedChapter, setLoadedChapter] = useState<Chapter | null>(null);
  const [titleByChapter, setTitleByChapter] = useState<Record<number, string>>(
    {},
  );
  const [bookDataLoading, setBookDataLoading] = useState(false);
  const [bookDataError, setBookDataError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setTitleByChapter({});
    loadKoreanIndex(bookId)
      .then((index) => {
        if (cancelled) return;
        const next: Record<number, string> = {};
        for (const item of index.chapters) next[item.chapter] = item.title;
        setTitleByChapter(next);
      })
      .catch(() => {
        /* 제목이 없어도 장 번호 목록은 books.ts 로 그린다. */
      });
    return () => {
      cancelled = true;
    };
  }, [bookId]);
  useEffect(() => {
    let cancelled = false;
    setBookDataError(null);
    setBookDataLoading(true);
    setLoadedChapter(null);
    loadKoreanChapter(bookId, chapterNumber)
      .then((chapter) => {
        if (cancelled) return;
        setLoadedChapter(chapter);
        setBookDataLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadedChapter(null);
        setBookDataError(
          e instanceof Error ? e.message : "본문 데이터를 불러오지 못했어요.",
        );
        setBookDataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, chapterNumber]);

  const chapterList = useMemo(() => {
    const items: { chapter: number; title: string }[] = [];
    for (let n = 1; n <= bookMeta.totalChapters; n++) {
      items.push({ chapter: n, title: titleByChapter[n] ?? "" });
    }
    return items;
  }, [bookMeta.totalChapters, titleByChapter]);

  const fallbackChapter = useMemo<Chapter>(
    () => ({
      chapter: chapterNumber,
      title: titleByChapter[chapterNumber] ?? "",
      verses: { krv: EMPTY_VERSES },
    }),
    [chapterNumber, titleByChapter],
  );
  const chapter =
    loadedChapter && loadedChapter.chapter === chapterNumber
      ? loadedChapter
      : fallbackChapter;
  const hasKrv = (chapter.verses.krv?.length ?? 0) > 0;
  const hasKids = (chapter.verses.kids?.length ?? 0) > 0;
  // "원어묵상" 모드는 본문 자리에 들어갈 의역(greekKr) 이 있어야 활성된다.
  // (헬라어 토큰/절 풀이만 있고 의역이 없으면 화면이 비어 보이므로 비활성)
  const hasGreekKr = (chapter.verses.greekKr?.length ?? 0) > 0;
  const hasGreekTokens = (chapter.verses.greekTokens?.length ?? 0) > 0;
  const hasGreekWords = (chapter.verses.greekWords?.length ?? 0) > 0;
  const hasGreek = hasGreekKr;
  // 히브리어 보기 — 책 id 가 HEBREW_BOOK_IDS 에 들어 있으면 활성. 데이터는
  // HebrewChapterV2 가 자체 lazy-load 하므로 page 쪽에 별도 verse 배열은 없다.
  const hasHebrew = HEBREW_BOOK_IDS.includes(bookId);
  // 사용자가 선택한 번역이 현재 책/장에 없으면 다른 번역으로 자동 폴백.
  //   - 신규 61권은 어린이 번역이 없음 → 어린이 선택 시 개역한글로 표시.
  //   - 원어묵상(greek) 자료가 없는 책/장이면 → 개역한글로 폴백.
  //   - 히브리어(hebrew) 자료가 없는 책이면 → 개역한글로 폴백.
  //   - 기존 5권은 krv/kids 양쪽 모두 있어 영향 없음.
  const effectiveTranslation: TranslationKey =
    translation === "greek" && !hasGreek
      ? hasKrv
        ? "krv"
        : hasKids
          ? "kids"
          : "krv"
      : translation === "hebrew" && !hasHebrew
        ? hasKrv
          ? "krv"
          : hasKids
            ? "kids"
            : "krv"
        : translation === "krv" && !hasKrv && hasKids
          ? "kids"
          : translation === "kids" && !hasKids && hasKrv
            ? "krv"
            : translation;
  // 본문 표시용 절 배열. 원어 모드에서는 KRV 가 아닌 "원어 의역(greekKr)" 을
  // 본문 자리에 두어, 음성/스크롤 진도와 단어 토큰화도 의역 기준으로 동작하게 한다.
  const verses = useMemo(() => {
    if (effectiveTranslation === "greek") {
      return chapter.verses.greekKr ?? EMPTY_VERSES;
    }
    if (effectiveTranslation === "hebrew") {
      // 히브리어 모드는 HebrewChapterV2 가 절을 그린다. 빈 배열은 모듈 상수라
      // 렌더마다 새 참조가 생기지 않는다.
      return EMPTY_VERSES;
    }
    return chapter.verses[effectiveTranslation] ?? EMPTY_VERSES;
  }, [chapter, effectiveTranslation]);
  // 영어(WEB/KJV) 화면의 절. EnglishOnlyView 가 청크를 받은 뒤 올려준다.
  // 0/N 진도는 이 배열을 쓰고, 개역한글 verses 는 그대로 둔다.
  const [englishVerses, setEnglishVerses] = useState<Verse[]>([]);
  const handleEnglishVerses = useCallback((next: { n: number; t: string }[]) => {
    setEnglishVerses(next);
  }, []);
  const englishReading = isEnglishReadingMode(viewMode);
  const activeVerses = englishReading ? englishVerses : verses;
  // greek 모드에서만 쓰는 보조 맵 — 절 번호 → 토큰 배열 / 절 전체 풀이.
  const greekTokensMap = useMemo(() => {
    if (effectiveTranslation !== "greek") return null;
    const list = chapter.verses.greekTokens ?? [];
    const map = new Map<number, GreekToken[]>();
    for (const v of list) map.set(v.n, v.tokens);
    return map;
  }, [effectiveTranslation, chapter.verses.greekTokens]);
  const greekWordsMap = useMemo(() => {
    if (effectiveTranslation !== "greek") return null;
    const list = chapter.verses.greekWords ?? [];
    const map = new Map<number, string>();
    for (const w of list) map.set(w.n, w.t);
    return map;
  }, [effectiveTranslation, chapter.verses.greekWords]);

  const totalVerses = activeVerses.length;
  const hasFilledText = totalVerses > 0;

  useEffect(() => {
    doneChaptersRef.current = doneChapters;
  }, [doneChapters]);

  // 장·모드 진입 시각 리셋 — 짧은 장이 열자마자 완료되지 않게 3초 게이트.
  useEffect(() => {
    chapterEnteredAtRef.current = Date.now();
    endVisibleRef.current = false;
    if (endFinalizeTimerRef.current !== null) {
      window.clearTimeout(endFinalizeTimerRef.current);
      endFinalizeTimerRef.current = null;
    }
  }, [bookId, chapterNumber, viewMode, effectiveTranslation]);

  const undoChapterCompletion = useCallback(
    (targetBook: BookId, targetChapter: number) => {
      unmarkChapterDone(targetBook, targetChapter, readingScopeOf(viewMode));
      removeReadLog(targetBook, targetChapter);
      setDoneChapters((prev) => {
        if (!prev.has(targetChapter)) return prev;
        const next = new Set(prev);
        next.delete(targetChapter);
        return next;
      });
      setDoneToast(null);
      chapterEnteredAtRef.current = Date.now();
      endVisibleRef.current = false;
      setEndSentinelNonce((n) => n + 1);
    },
    [viewMode],
  );

  const finalizeChapter = useCallback(() => {
    const scope = readingScopeOf(viewMode);
    if (isChapterDone(bookId, chapterNumber, scope)) return;
    if (doneChaptersRef.current.has(chapterNumber)) return;

    markChapterDone(bookId, chapterNumber, scope);
    appendReadLog(bookId, chapterNumber);
    setDoneChapters((prev) => new Set(prev).add(chapterNumber));
    setDoneToast({
      bookId,
      chapter: chapterNumber,
      bookName: BOOKS[bookId].name,
    });
  }, [bookId, chapterNumber, viewMode]);

  const attemptFinalizeFromEnd = useCallback(() => {
    if (!endVisibleRef.current) return;
    if (!bookConfirmed) return;
    if (viewMode === "study") return;
    if (doneChaptersRef.current.has(chapterNumber)) return;
    if (isChapterDone(bookId, chapterNumber, readingScopeOf(viewMode))) {
      return;
    }

    const wait = 3000 - (Date.now() - chapterEnteredAtRef.current);
    if (wait > 0) {
      if (endFinalizeTimerRef.current !== null) {
        window.clearTimeout(endFinalizeTimerRef.current);
      }
      endFinalizeTimerRef.current = window.setTimeout(() => {
        endFinalizeTimerRef.current = null;
        attemptFinalizeFromEnd();
      }, wait);
      return;
    }

    finalizeChapter();
  }, [bookConfirmed, bookId, chapterNumber, finalizeChapter, viewMode]);

  const handleEndVisibilityChange = useCallback(
    (visible: boolean) => {
      const was = endVisibleRef.current;
      endVisibleRef.current = visible;
      if (visible && !was) {
        attemptFinalizeFromEnd();
      } else if (!visible && endFinalizeTimerRef.current !== null) {
        window.clearTimeout(endFinalizeTimerRef.current);
        endFinalizeTimerRef.current = null;
      }
    },
    [attemptFinalizeFromEnd],
  );

  useEffect(() => {
    if (!doneToast) return;
    const t = window.setTimeout(() => setDoneToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [doneToast]);

  // ─── 절 다중 선택 + 복사 ──────────────────────────────────────────────
  // long-press 타이머 정리 (이동/up/cancel 시 공통 호출).
  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedVerses(new Set());
  }, []);

  const selectAllVerses = useCallback(() => {
    if (verses.length === 0) return;
    setSelectionMode(true);
    setSelectedVerses(new Set(verses.map((v) => v.n)));
  }, [verses]);

  const flashCopyToast = useCallback((msg: string) => {
    setCopyToast(msg);
    if (copyToastTimerRef.current !== null) {
      window.clearTimeout(copyToastTimerRef.current);
    }
    copyToastTimerRef.current = window.setTimeout(() => {
      setCopyToast("");
      copyToastTimerRef.current = null;
    }, 2200);
  }, []);

  // 본문 절 위에서 pointer down — long-press 타이머 시작. 이미 selectionMode
  // 라면 길게 누르기 로직은 의미가 없으므로(탭만으로 토글) 타이머를 걸지 않는다.
  const handleVersePointerDown = useCallback(
    (verseN: number, e: React.PointerEvent<HTMLDivElement>) => {
      // 주 버튼(좌클릭) / 터치 / 펜만 long-press 트리거. 우클릭·보조 버튼은 무시.
      if (e.button !== 0) return;
      if (selectionMode) return;
      cancelLongPress();
      longPressStartRef.current = { x: e.clientX, y: e.clientY };
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        longPressStartRef.current = null;
        // long-press 발동 → 선택 모드 진입 + 그 절 선택. 직후 발생할 click 은 1회 무시.
        suppressNextClickRef.current = true;
        setSelectionMode(true);
        setSelectedVerses((prev) => {
          if (prev.has(verseN)) return prev;
          const next = new Set(prev);
          next.add(verseN);
          return next;
        });
        // 안드로이드 등에서 가벼운 햅틱 — 지원 없는 환경(iOS 등)에선 조용히 무시.
        if (
          typeof navigator !== "undefined" &&
          typeof (navigator as Navigator & { vibrate?: (n: number) => boolean }).vibrate === "function"
        ) {
          try {
            (navigator as Navigator & { vibrate: (n: number) => boolean }).vibrate(15);
          } catch {
            /* noop */
          }
        }
      }, 500);
    },
    [cancelLongPress, selectionMode],
  );

  // 손가락이 10px 넘게 움직이면 = 스크롤 의도로 보고 long-press 타이머 취소.
  const handleVersePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = longPressStartRef.current;
      if (!start || longPressTimerRef.current === null) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (dx * dx + dy * dy > 100) {
        cancelLongPress();
      }
    },
    [cancelLongPress],
  );

  // 절 클릭 — selectionMode 일 때만 토글. long-press 직후의 click 은 1회 흡수.
  const handleVerseClick = useCallback(
    (verseN: number) => {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        return;
      }
      if (!selectionMode) return;
      setSelectedVerses((prev) => {
        const next = new Set(prev);
        if (next.has(verseN)) {
          next.delete(verseN);
        } else {
          next.add(verseN);
        }
        return next;
      });
    },
    [selectionMode],
  );

  const copySelectedVerses = useCallback(async () => {
    if (selectedVerses.size === 0) return;
    // 절 번호 오름차순(= verses 원본 순서)으로 정렬.
    const picked = verses.filter((v) => selectedVerses.has(v.n));
    if (picked.length === 0) return;

    // 헤더 한 줄: "{책} {장}장 {구간}절"
    //   - 선택된 절 번호를 보고 연속 구간은 "n-m" 으로 묶고, 떨어진 구간은 ", " 로 잇는다.
    //     예) [2,3,4]       → "2-4"
    //          [2,3,5]       → "2-3, 5"
    //          [2,5,7]       → "2, 5, 7"
    //          [2]           → "2"
    const nums = picked.map((v) => v.n);
    const rangeParts: string[] = [];
    let rangeStart = nums[0]!;
    let rangeEnd = rangeStart;
    for (let i = 1; i < nums.length; i += 1) {
      const n = nums[i]!;
      if (n === rangeEnd + 1) {
        rangeEnd = n;
      } else {
        rangeParts.push(
          rangeStart === rangeEnd
            ? String(rangeStart)
            : `${rangeStart}-${rangeEnd}`,
        );
        rangeStart = n;
        rangeEnd = n;
      }
    }
    rangeParts.push(
      rangeStart === rangeEnd ? String(rangeStart) : `${rangeStart}-${rangeEnd}`,
    );

    const header = `${bookMeta.name} ${chapterNumber}장 ${rangeParts.join(", ")}절`;
    // 본문: 절마다 "{번호} {본문}" — 책 이름은 헤더에만 한 번.
    //
    // 헤더 ↔ 본문 구분자 — 디바이스별로 다르게 처리:
    //   ─ 데스크탑(macOS Notes/Pages 등): U+2028 (LINE SEPARATOR) 사용.
    //     일반 \n 은 단락 간격(paragraph-after) 을 만들어 시각적 빈 줄로 보이는데,
    //     U+2028 은 "단락 안 줄바꿈(Shift+Enter)" 으로 해석되어 간격 없이 붙는다.
    //   ─ 모바일(iOS / Android Notes): 일반 \n 사용.
    //     iOS Notes 는 U+2028 을 지원하지 않아 그대로 □(missing glyph) 로 출력하고
    //     줄바꿈도 안 된다. 다행히 모바일 Notes 는 \n 에 단락 간격을 추가하지
    //     않으므로 \n 만으로 헤더 바로 다음 줄에 본문이 깔끔히 붙는다.
    // 절 사이 줄바꿈은 항상 \n (모든 환경에서 동일하게 한 줄씩 차곡차곡).
    const isMobileUA =
      typeof navigator !== "undefined" &&
      /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const headerSep = isMobileUA ? "\n" : "\u2028";
    const body = picked.map((v) => `${v.n} ${v.t}`).join("\n");
    const payload = `${header}${headerSep}${body}`;

    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(payload);
      } else {
        // 폴백 (iOS Safari 일부 / 비 secure context / 구형 브라우저):
        // 보이지 않는 textarea 에 텍스트를 넣고 execCommand("copy") 로 복사.
        const ta = document.createElement("textarea");
        ta.value = payload;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.top = "-9999px";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        // iOS 에서 select() 만으론 안 잡힐 때 setSelectionRange 보강.
        if (typeof ta.setSelectionRange === "function") {
          ta.setSelectionRange(0, payload.length);
        }
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (!ok) throw new Error("execCommand copy failed");
      }
      flashCopyToast(
        picked.length === 1 ? "복사되었습니다" : `${picked.length}개 절을 복사했어요`,
      );
    } catch {
      flashCopyToast(
        "복사할 수 없는 환경이에요. 본문을 직접 길게 눌러 선택해 주세요.",
      );
    }
  }, [bookMeta.name, chapterNumber, flashCopyToast, selectedVerses, verses]);

  // 선택이 모두 해제되면 selectionMode 자동 종료(스펙 요구).
  useEffect(() => {
    if (selectionMode && selectedVerses.size === 0) {
      setSelectionMode(false);
    }
  }, [selectionMode, selectedVerses]);

  // 책/장/번역 전환 시 선택/모드 자동 해제 — 이전 장의 절 번호가 다음 장으로
  // 새어 들어가지 않도록.
  useEffect(() => {
    setSelectionMode(false);
    setSelectedVerses(new Set());
    cancelLongPress();
    suppressNextClickRef.current = false;
  }, [bookId, cancelLongPress, chapterNumber, effectiveTranslation]);

  // ESC 키로 선택 모드 종료 — 모드일 때만 리스너를 단다(전역 키 충돌 최소화).
  useEffect(() => {
    if (!selectionMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitSelectionMode();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [exitSelectionMode, selectionMode]);

  // 언마운트 시 타이머 정리.
  useEffect(() => {
    return () => {
      if (copyToastTimerRef.current !== null) {
        window.clearTimeout(copyToastTimerRef.current);
      }
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);
  // ─── /절 다중 선택 + 복사 ─────────────────────────────────────────────

  // 번역(개역한글/어린이) 선택을 localStorage 에 저장. 새로고침해도 마지막
  // 선택이 유지되도록 한다. 단, 현재 책에서 지원하지 않는 번역이면 무시.
  const handleTranslationChange = useCallback(
    (next: TranslationKey) => {
      if (next === translation) return;
      setTranslation(next);
      window.localStorage.setItem(TRANSLATION_KEY, next);
    },
    [translation],
  );

  // 모드 드롭다운 — 5개 항목(개역한글/어린이/영어/헬라어/성경 공부) 통합 핸들러.
  //   - krv / kids / greek / hebrew : viewMode 를 reader 로 되돌리고 그 번역으로 전환.
  //   - english / study             : 구약 39 + 신약 27권 전 범위 지원.
  //     현재 책이 지원 목록 안이면 그대로 머물고, 그 외(미선택 등) 일 때만
  //     안전한 기본(로마서 1장) 으로 옮긴 뒤 모드 전환.
  // 이동 로직은 changeBook(저장된 장 복원 동작) 을 우회하고 직접 setState +
  // localStorage 기록을 한다.
  const handleModeChange = useCallback(
    (next: ModeChoice) => {
      if (
        next === "krv" ||
        next === "kids" ||
        next === "greek" ||
        next === "hebrew"
      ) {
        if (viewMode !== "reader") setViewMode("reader");
        handleTranslationChange(next);
        return;
      }
      // english / kjv / study — 현재 책이 NT/OT 어느 쪽이든 지원 목록 안이면 유지.
      // 그 외(미선택 등) 일 때만 로마서 1장으로 폴백.
      const supported = STUDY_BOOK_IDS.includes(bookId);
      if (!supported) {
        setBookId("romans" as BookId);
        setBookConfirmed(true);
        setChapterNumber(1);
        setLastNtBookId("romans" as BookId);
        try {
          window.localStorage.setItem(CURRENT_BOOK_KEY, "romans");
          window.localStorage.setItem(
            currentChapterKey("romans" as BookId),
            "1",
          );
          window.localStorage.setItem(LAST_NT_BOOK_KEY, "romans");
        } catch {
          /* ignore */
        }
      }
      setViewMode(next);
    },
    [
      viewMode,
      handleTranslationChange,
      bookId,
    ],
  );

  // 드롭다운에 현재 보이는 값. study/english 가 우선, 그 외에는 현재 번역.
  const currentModeChoice: ModeChoice =
    viewMode === "study"
      ? "study"
      : viewMode === "kjv"
        ? "kjv"
        : viewMode === "english"
          ? "english"
          : translation;

  // 검색 결과 클릭 → 해당 책/장/번역으로 이동 + 그 절을 잠깐 강조(flashVerse).
  //   기존 책·장·번역 전환과 동일한 state/localStorage 키를 재사용한다.
  //   (changeBook 은 저장된 장을 불러오는 early-return 이 있어, 여기선 명시적으로
  //    book + chapter 를 직접 세팅한다.)
  const goToSearchResult = useCallback(
    (sel: SearchSelection) => {
      const {
        bookId: nextBook,
        chapter,
        verseNo,
        translation: nextTr,
      } = sel;
      setSearchOpen(false);
      setNavMenuOpen(false);
      setTranslation(nextTr);
      setBookId(nextBook);
      setBookConfirmed(true);
      setChapterNumber(chapter);
      setFlashVerse(verseNo);
      // 도착한 책이 속한 testament 의 last 만 갱신. 반대쪽 testament 의
      // 드롭다운은 직전 마지막 책을 그대로 유지한다.
      if (isOldTestament(nextBook)) {
        setLastOtBookId(nextBook);
      } else {
        setLastNtBookId(nextBook);
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem(TRANSLATION_KEY, nextTr);
        window.localStorage.setItem(CURRENT_BOOK_KEY, nextBook);
        window.localStorage.setItem(
          currentChapterKey(nextBook),
          String(chapter),
        );
        try {
          window.localStorage.setItem(
            isOldTestament(nextBook) ? LAST_OT_BOOK_KEY : LAST_NT_BOOK_KEY,
            nextBook,
          );
        } catch {
          /* ignore */
        }
      }
    },
    [],
  );

  // flashVerse 가 설정되면, 새 장이 렌더된 뒤 그 절로 스크롤하고 잠깐 강조 후 해제.
  useEffect(() => {
    if (flashVerse == null) return;
    const raf = window.requestAnimationFrame(() => {
      const root = readerSectionRef.current;
      const el = root?.querySelector<HTMLElement>(
        `[data-verse-num="${flashVerse}"]`,
      );
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const clear = window.setTimeout(() => setFlashVerse(null), 2000);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(clear);
    };
  }, [flashVerse, bookId, chapterNumber, effectiveTranslation]);


  const moveChapter = (next: number) => {
    const clamped = Math.min(bookMeta.totalChapters, Math.max(1, next));
    setChapterNumber(clamped);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        currentChapterKey(bookId),
        String(clamped),
      );
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const moveChapterRef = useRef(moveChapter);
  moveChapterRef.current = moveChapter;
  const onSelectChapter = useCallback((n: number) => {
    moveChapterRef.current(n);
  }, []);

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // 공부 노트 선택이 시작되면 반쯤 열린 서랍을 바로 닫음
  useEffect(() => {
    const onStudySelecting = () => setDrawerOpen(false);
    window.addEventListener("haruchi:study-selecting", onStudySelecting);
    return () =>
      window.removeEventListener("haruchi:study-selecting", onStudySelecting);
  }, []);

  // 책 전환의 두 가지 의도를 구분한다 ─
  //
  // (1) "보던 책으로 돌아가기" (resume / quick-jump)
  //     예: 신약을 읽다가 잠깐 구약으로 갔다, 신약 드롭다운 트리거에 떠 있던
  //         "요한복음" 라벨을 다시 누름.
  //     → 마지막 장 복원, 그 안의 스크롤 위치까지 그대로 복귀. 부드럽게.
  //
  // (2) "다른 책 새로 펼치기" (fresh / panel pick)
  //     예: 드롭다운을 펼쳐 다른 책을 클릭.
  //     → 1장 1절 / 페이지 최상단으로 이동.
  //
  // 공통 부분(상태 리셋, testament 별 last 갱신, 저장)은 헬퍼로 모은다.
  const applyBookChangeShared = useCallback(
    (nextBookId: BookId) => {
      setBookId(nextBookId);
      setBookConfirmed(true);
      // 그 testament 쪽의 "마지막 책" 도 갱신. 반대쪽은 그대로 유지되어,
      // 양쪽 드롭다운이 각자 마지막 선택을 계속 보여준다.
      if (isOldTestament(nextBookId)) {
        setLastOtBookId(nextBookId);
        try {
          window.localStorage.setItem(LAST_OT_BOOK_KEY, nextBookId);
        } catch {
          /* ignore */
        }
      } else {
        setLastNtBookId(nextBookId);
        try {
          window.localStorage.setItem(LAST_NT_BOOK_KEY, nextBookId);
        } catch {
          /* ignore */
        }
      }
      window.localStorage.setItem(CURRENT_BOOK_KEY, nextBookId);
    },
    [],
  );

  // (1) 트리거 라벨에 떠 있는 "보던 책" 으로 빠르게 복귀.
  //     - 마지막 장은 localStorage 에서 복원.
  //     - 그 (책, 장) 의 마지막 스크롤 Y 가 메모리에 있으면 그 위치로 복원.
  //       없으면 그대로 두고(=현재 scroll 유지) — 사용자 의도대로 스크롤 안 건드림.
  //     - bookConfirmed=true 인데 같은 책이면 no-op.
  const quickJumpToBook = useCallback(
    (nextBookId: BookId) => {
      if (bookConfirmed && nextBookId === bookId) return;
      const savedChapterRaw = window.localStorage.getItem(
        currentChapterKey(nextBookId),
      );
      const meta = BOOKS[nextBookId];
      const candidate = savedChapterRaw ? Number(savedChapterRaw) : 1;
      const safeChapter =
        Number.isFinite(candidate) &&
        candidate >= 1 &&
        candidate <= meta.totalChapters
          ? candidate
          : 1;
      // 다음 (book, chapter) 가 렌더된 직후 useLayoutEffect 에서 이 값을
      // window.scrollTo 로 적용. 메모리에 없으면 null → 스크롤 손대지 않음.
      const remembered = scrollMemoryByChapter.get(
        scrollMemoryKey(nextBookId, safeChapter),
      );
      pendingScrollRestoreRef.current =
        remembered != null ? remembered : null;
      applyBookChangeShared(nextBookId);
      setChapterNumber(safeChapter);
    },
    [bookConfirmed, bookId, applyBookChangeShared],
  );

  // (2) 드롭다운 패널에서 다른 책을 고른 경우. 항상 1장 1절 / 최상단.
  const pickBookFromPanel = useCallback(
    (nextBookId: BookId) => {
      if (bookConfirmed && nextBookId === bookId) return;
      applyBookChangeShared(nextBookId);
      setChapterNumber(1);
      try {
        window.localStorage.setItem(currentChapterKey(nextBookId), "1");
      } catch {
        /* ignore */
      }
      // 새 책 1장의 scroll memory 도 깨끗이 비워, 혹시 이전 세션에서 남아 있던
      // 위치로 자동 복원되지 않게 한다. 다음 quickJump 까지는 항상 top.
      scrollMemoryByChapter.delete(scrollMemoryKey(nextBookId, 1));
      pendingScrollRestoreRef.current = null;
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [bookConfirmed, bookId, applyBookChangeShared],
  );

  // 모바일 서랍: 다른 책+특정 장
  // (pickBookFromPanel → 1장 리셋 후 setTimeout 으로 onSelectChapter).
  const selectDrawerBookChapter = useCallback(
    (nextBook: BookId, chapter: number) => {
      if (nextBook === bookId) {
        onSelectChapter(chapter);
      } else {
        pickBookFromPanel(nextBook);
        window.setTimeout(() => onSelectChapter(chapter), 0);
      }
      setDrawerOpen(false);
    },
    [bookId, onSelectChapter, pickBookFromPanel],
  );

  // 스크롤 저장 — 현재 (책, 장) 의 scrollY 를 RAF 디바운스로 메모리에 기록.
  //   quickJumpToBook 으로 다른 책에 잠깐 갔다 돌아왔을 때, 그 안에서 보고
  //   있던 위치를 그대로 복원하기 위함. 모듈 레벨 Map 이라 새로고침 시 리셋.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let raf: number | null = null;
    const onScroll = () => {
      if (raf != null) return;
      raf = window.requestAnimationFrame(() => {
        raf = null;
        scrollMemoryByChapter.set(
          scrollMemoryKey(bookId, chapterNumber),
          window.scrollY,
        );
      });
    };
    // mount 직후의 scrollY 도 한 번 기록(이후 quick-jump 했다가 돌아올 때 가능
    // 한 한 동일 위치로 복귀).
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf != null) window.cancelAnimationFrame(raf);
    };
  }, [bookId, chapterNumber]);

  // quickJumpToBook 이 세팅한 pendingScrollRestoreRef 를 새 (책, 장) 렌더
  // 직후 한 번 소비. useLayoutEffect 라 paint 전에 적용되어 깜박임 없음.
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const target = pendingScrollRestoreRef.current;
    if (target == null) return;
    pendingScrollRestoreRef.current = null;
    window.scrollTo(0, target);
  }, [bookId, chapterNumber]);

  useEffect(() => {
    migrateLegacyKeys();

    // 이전 방문에서 골랐던 책을 복구. 없으면 기본 잠언 1장을 바로 보여 주고
    // 그 선택을 저장한다(빈 "책 고르기" 안내 화면을 쓰지 않는다).
    const savedBook = window.localStorage.getItem(CURRENT_BOOK_KEY);
    let activeBook: BookId = "proverbs";
    if (savedBook && savedBook in BOOKS) {
      activeBook = savedBook as BookId;
      setBookId(activeBook);
      const savedChapter = window.localStorage.getItem(
        currentChapterKey(activeBook),
      );
      const meta = BOOKS[activeBook];
      const next = savedChapter ? Number(savedChapter) : 1;
      if (Number.isFinite(next) && next >= 1 && next <= meta.totalChapters) {
        setChapterNumber(next);
      }
    } else {
      setBookId("proverbs");
      setChapterNumber(1);
      try {
        window.localStorage.setItem(CURRENT_BOOK_KEY, "proverbs");
        window.localStorage.setItem(currentChapterKey("proverbs"), "1");
      } catch {
        /* ignore */
      }
    }
    setBookConfirmed(true);

    // URL ?book=&chapter= — 읽기표 등 외부 진입. 유효할 때만 덮어쓰고,
    // 잘못된 값이면 위에서 복구한 localStorage 상태를 그대로 둔다.
    try {
      const params = new URLSearchParams(window.location.search);
      const qBook = params.get("book");
      const qChapterRaw = params.get("chapter");
      if (qBook && qBook in BOOKS) {
        const qMeta = BOOKS[qBook as BookId];
        const qChapter = qChapterRaw != null ? Number(qChapterRaw) : 1;
        if (
          Number.isFinite(qChapter) &&
          qChapter >= 1 &&
          qChapter <= qMeta.totalChapters
        ) {
          activeBook = qBook as BookId;
          setBookId(activeBook);
          setChapterNumber(qChapter);
          setBookConfirmed(true);
          try {
            window.localStorage.setItem(CURRENT_BOOK_KEY, activeBook);
            window.localStorage.setItem(
              currentChapterKey(activeBook),
              String(qChapter),
            );
            if (isOldTestament(activeBook)) {
              window.localStorage.setItem(LAST_OT_BOOK_KEY, activeBook);
            } else {
              window.localStorage.setItem(LAST_NT_BOOK_KEY, activeBook);
            }
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* ignore */
    }

    // testament 별 "마지막 책" 복구. 별도 키가 없으면 활성 bookId 를 채운다.
    const savedOt = window.localStorage.getItem(LAST_OT_BOOK_KEY);
    if (savedOt && savedOt in BOOKS && isOldTestament(savedOt as BookId)) {
      setLastOtBookId(savedOt as BookId);
    } else if (isOldTestament(activeBook)) {
      setLastOtBookId(activeBook);
    }
    const savedNt = window.localStorage.getItem(LAST_NT_BOOK_KEY);
    if (savedNt && savedNt in BOOKS && !isOldTestament(savedNt as BookId)) {
      setLastNtBookId(savedNt as BookId);
    } else if (!isOldTestament(activeBook)) {
      setLastNtBookId(activeBook);
    }


    const savedTranslation = window.localStorage.getItem(TRANSLATION_KEY);
    if (
      savedTranslation === "krv" ||
      savedTranslation === "kids" ||
      savedTranslation === "greek" ||
      savedTranslation === "hebrew"
    ) {
      setTranslation(savedTranslation);
    }

    // 모드 드롭다운 복구. URL 쿼리(?view=study|english) 가 가장 우선
    // (메뉴 링크 / 외부 진입), 없으면 localStorage 의 마지막 선택을 따른다.
    // study/english 는 이제 NT 27 + OT 39 = 66권 전체를 지원하므로(STUDY_BOOK_IDS)
    // 위에서 복구된 사용자의 마지막 책/장을 그대로 유지한다. 옛 동작(=무조건
    // 로마서 1장으로 끌고 오기)은 사용자가 레위기 히브리어 같은 다른 책에
    // 머무르고 있다가 이 effect 가 다시 돌 때 본문이 갑자기 로마서로 "튕겨
    // 나가는" 버그를 일으켰다. 안전 폴백은 STUDY_BOOK_IDS 에 없는 책일 때만
    // 발동(현재는 사실상 일어나지 않음). URL 파라미터는 적용 후
    // history.replaceState 로 정리해 다음 새로고침에서 다시 끌려오지 않게 한다.
    let initialView: ViewMode | null = null;
    let urlParamApplied = false;
    try {
      const qp = new URLSearchParams(window.location.search).get("view");
      if (qp === "study" || qp === "english" || qp === "kjv" || qp === "reader") {
        initialView = qp;
        urlParamApplied = true;
      }
    } catch {
      /* ignore */
    }
    if (!initialView) {
      const savedView = window.localStorage.getItem(VIEW_MODE_KEY);
      if (
        savedView === "study" ||
        savedView === "english" ||
        savedView === "kjv" ||
        savedView === "reader"
      ) {
        initialView = savedView;
      }
    }
    if (initialView && initialView !== "reader") {
      setViewMode(initialView);
      // 위에서 복구된 사용자의 마지막 책(= savedBook)이 study/english 가
      // 지원하는 66권 안에 있으면 그 책 그대로 둔다. 아주 예외적인 경우
      // (저장값 없음/잘못된 값으로 bookId 가 기본 "proverbs" 인 상태에서
      // proverbs 가 어떻게든 빠진다든지) 에만 로마서 1장 폴백을 적용.
      const currentBook =
        savedBook && savedBook in BOOKS ? (savedBook as BookId) : null;
      const keepBook = currentBook !== null && STUDY_BOOK_IDS.includes(currentBook);
      if (!keepBook) {
        setBookId("romans" as BookId);
        setBookConfirmed(true);
        setChapterNumber(1);
        // 신약 드롭다운에 로마서 표시. 구약 쪽 last 는 위에서 복구된 값을 보존.
        setLastNtBookId("romans" as BookId);
        try {
          window.localStorage.setItem(CURRENT_BOOK_KEY, "romans");
          window.localStorage.setItem(currentChapterKey("romans" as BookId), "1");
          window.localStorage.setItem(LAST_NT_BOOK_KEY, "romans");
        } catch {
          /* ignore */
        }
      }
    }
    // view / book / chapter 쿼리는 한 번 적용한 뒤 URL 에서 제거
    // (새로고침 때 다시 덮어쓰지 않도록).
    try {
      const url = new URL(window.location.href);
      let changed = false;
      if (urlParamApplied && url.searchParams.has("view")) {
        url.searchParams.delete("view");
        changed = true;
      }
      if (url.searchParams.has("book")) {
        url.searchParams.delete("book");
        changed = true;
      }
      if (url.searchParams.has("chapter")) {
        url.searchParams.delete("chapter");
        changed = true;
      }
      if (changed) {
        window.history.replaceState(
          window.history.state,
          "",
          url.pathname + (url.search ? url.search : "") + url.hash,
        );
      }
    } catch {
      /* ignore */
    }

  }, []);

  // viewMode 변경을 localStorage 에 영구 보관.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  // english/study 모드는 신약 27권 전체에서 동작한다. 사용자가 구약(또는
  // 미선택) 으로 이동하면 자동으로 reader 모드로 빠져나오게 한다 — 그쪽은
  // 학습 데이터가 없다.
  // 성경 공부/영어 모드 진입 후 학습 데이터가 없는 책으로 이동하면 자동으로
  // reader 모드로 되돌린다. NT 27 + OT 39권 모두 지원하므로 사실상 정상 책은
  // 그대로 유지된다.
  useEffect(() => {
    if (viewMode === "reader") return;
    if (!STUDY_BOOK_IDS.includes(bookId)) {
      setViewMode("reader");
    }
  }, [bookId, viewMode]);

  useEffect(() => {
    const scope = readingScopeOf(viewMode);
    const done = new Set<number>();
    for (let n = 1; n <= bookMeta.totalChapters; n++) {
      if (isChapterDone(bookId, n, scope)) done.add(n);
    }
    setDoneChapters(done);
  }, [bookId, bookMeta.totalChapters, viewMode]);

  // 책/장/번역이 바뀌면 펼쳐 둔 절 풀이 서랍과 단어 정보 팝오버를 모두 닫는다.
  useEffect(() => {
    setOpenWordDrawers(new Set());
    setOpenTokenInfos(new Set());
  }, [bookId, chapterNumber, effectiveTranslation]);

  // ───────────────────────────────────────────────────────────────────
  // 우측 사이드바(.brp-side) sticky-top 계산.
  //
  // ⚠️ DEPRECATED — 2-pane 독립 스크롤 전환(≥960px) 후로는 .brp-side 의
  //   position: sticky 가 제거되어, 여기서 설정하는 CSS 변수
  //   --brp-side-top 은 더 이상 어떤 스타일에도 참조되지 않는다.
  //   삭제하지 않고 남겨둔 이유: 만약 모바일/태블릿 세로(<960px) 에서
  //   다시 sticky 모드를 도입하거나, A/B 테스트로 sticky 모드를 옵션화할
  //   때 다시 살릴 수 있도록 한다. 현재로서는 effective-no-op.
  // ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const update = () => {
      const el = sideRef.current;
      if (!el) return;
      // 모바일(<960px) 에선 .brp-side 가 display: contents — sticky 무효.
      if (typeof window === "undefined" || window.innerWidth < 960) {
        el.style.removeProperty("--brp-side-top");
        return;
      }
      const headerOffset = 80; // 헤더 / 미니바 위 여백
      const bottomMargin = 20; // viewport 하단과 사이드바 바닥 사이 여유
      const sideHeight = el.scrollHeight;
      const viewport = window.innerHeight;
      if (sideHeight + headerOffset + bottomMargin > viewport) {
        // 사이드바가 viewport 보다 큼 → top 을 음수로
        const top = viewport - sideHeight - bottomMargin;
        el.style.setProperty("--brp-side-top", `${top}px`);
      } else {
        el.style.setProperty("--brp-side-top", `${headerOffset}px`);
      }
    };
    update();
    window.addEventListener("resize", update);
    // 사이드바 콘텐츠(특히 prayer 카드 열림/닫힘, 책 변경) 가 바뀌면 재계산.
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (ro && sideRef.current) ro.observe(sideRef.current);
    return () => {
      window.removeEventListener("resize", update);
      if (ro) ro.disconnect();
    };
  }, []);

  return (
    <main
      className={`brp-page ${mounted ? "brp-page--ready" : ""} ${
        miniVisible ? "is-scrolled" : ""
      } ${scrolled && !miniVisible ? "is-past-reader" : ""}`}
    >
      <MobileTopBar
        bookId={bookId}
        bookName={bookMeta.name}
        chapterNumber={chapterNumber}
        bookConfirmed={bookConfirmed}
        modeChoice={currentModeChoice}
        onModeChange={handleModeChange}
        onSearch={openSearch}
        onOpenDrawer={openDrawer}
      />
      <BookChapterDrawer
        open={drawerOpen}
        onOpen={openDrawer}
        onClose={closeDrawer}
        bookId={bookId}
        chapterNumber={chapterNumber}
        bookConfirmed={bookConfirmed}
        disabled={searchOpen || selectionMode}
        onSelectBookChapter={selectDrawerBookChapter}
      />
      <header className={`brp-header ${scrolled ? "is-hidden" : ""}`}>
        <a className="brp-brand" href="/" aria-label="하루치 홈으로">
          <Wordmark size="lg" />
        </a>
        {/* 데스크탑/태블릿 (≥640px) — 풀 네비. 톱니바퀴 + 텍스트 링크들이 한 줄. */}
        <nav className="brp-nav brp-nav--desktop" aria-label="Account links">
          <Link
            href={watchHrefFor(bookId, chapterNumber)}
            className="brp-nav-text-link brp-nav-link"
          >
            영상으로 보기
          </Link>
          <Link href="/plan" className="brp-nav-text-link brp-nav-link">
            읽기표
          </Link>
          <Link href="/prayer" className="brp-nav-text-link brp-nav-link">
            기도
          </Link>
          <Link href="/study/john1/1" className="brp-nav-text-link brp-nav-link">
            공부 노트
          </Link>
          <button
            type="button"
            className="brp-nav-icon"
            onClick={() => setSearchOpen(true)}
            aria-label="성경 단어 검색"
            title="성경 단어 검색"
          >
            <SearchIcon />
          </button>
          <a
            href="/settings"
            className="brp-nav-icon"
            aria-label="설정 열기"
            title="설정"
          >
            <GearIcon />
          </a>
          {/* "성경 공부" 진입점은 모드 드롭다운(개역한글/어린이/영어/헬라어/히브리어/성경 공부)
              안으로 통합되었다. 헤더에서 별도 링크는 중복이라 제거. */}
        </nav>

        {/* 모바일 (<640px) — 검색 + 햄버거. 햄버거는 우상단 시트 드롭다운. */}
        <div className="brp-mobile-actions">
          <button
            type="button"
            className="brp-mobile-search"
            onClick={() => setSearchOpen(true)}
            aria-label="성경 단어 검색"
          >
            <SearchIcon />
          </button>
          <button
            type="button"
            className={`brp-hamburger ${navMenuOpen ? "is-open" : ""}`}
            onClick={() => setNavMenuOpen((v) => !v)}
            aria-label={navMenuOpen ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={navMenuOpen}
            aria-controls="brp-mobile-menu"
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* 모바일 메뉴 — 햄버거 클릭 시 헤더 아래로 슬라이드 다운.
          바깥(어둡게 처리된 backdrop) 클릭 또는 메뉴 항목 선택 시 닫힘. */}
      {navMenuOpen && (
        <div
          className="brp-mobile-menu-backdrop"
          role="presentation"
          onClick={() => setNavMenuOpen(false)}
        >
          <nav
            id="brp-mobile-menu"
            className="brp-mobile-menu"
            aria-label="Account links"
            onClick={(e) => e.stopPropagation()}
          >
            {/* "성경 공부" 진입점은 모드 드롭다운으로 통합됨 — 모바일 메뉴에서도 제거. */}
            <a
              href="/settings"
              className="brp-mobile-menu-item"
              onClick={() => setNavMenuOpen(false)}
            >
              <span className="brp-mobile-menu-icon" aria-hidden="true">
                <span className="brp-mobile-menu-bullet" />
              </span>
              <span>설정</span>
            </a>
          </nav>
        </div>
      )}

      {/* 성경 단어 검색 오버레이 — 독립 기능. BOOK_DATA(메모리) 안에서만 검색.
          검색은 KRV / 어린이만 지원하므로 greek 선택 중이면 krv 로 폴백. */}
      <SearchOverlay
        open={searchOpen}
        defaultTranslation={
          effectiveTranslation === "greek" || effectiveTranslation === "hebrew"
            ? "krv"
            : effectiveTranslation
        }
        onClose={() => setSearchOpen(false)}
        onSelect={goToSearchResult}
      />

      {/* 스크롤 시 헤더 대신 떠 있는 반투명 미니바 — 책·장·소제목 + 본문 진행도.
          본문(reader) 카드가 뷰포트에 보이는 동안만 표시.
          내부 .brp-mini-fill 이 왼쪽→오른쪽 에너지바처럼 채워짐.
          책 미선택 상태에서는 책 이름/장 정보 자체가 의미 없으므로 통째로 숨김.

          성경 공부 모드(viewMode === "study") 일 때는 레이아웃이 바뀐다 —
          제목은 왼쪽으로 몰리고, 오른쪽에 역본 토글 슬롯(`#brp-mini-toggles-slot`)
          이 자리잡아 LayeredBibleViewer 가 React Portal 로 컴팩트 토글을
          꽂아 넣는다(스크롤한 채로도 역본을 켜고 끌 수 있게). */}
      <div
        className={`brp-mini-bar ${
          bookConfirmed && miniVisible ? "is-visible" : ""
        } ${viewMode === "study" ? "brp-mini-bar--study" : ""}`}
        aria-hidden={!bookConfirmed || !miniVisible}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(readerProgress * 100)}
      >
        <span
          className="brp-mini-fill"
          aria-hidden="true"
          /* width 가 아닌 transform: scaleX 사용 — GPU compositor 합성.
             iOS Safari 에서 width transition 은 메인 스레드 reflow 라 60fps 못
             내고 끊겨 보이는데, scaleX 는 paint 없이 합성만 일어나 부드럽다.
             scaleX(0)→scaleX(1) 로 좌→우 채움 (transform-origin: left). */
          style={{ transform: `scaleX(${readerProgress})` }}
        />
        <span className="brp-mini-content">
          <span className="brp-mini-text">
            <span className="brp-mini-book">{bookMeta.name}</span>
            <span className="brp-mini-divider" aria-hidden="true">·</span>
            <span className="brp-mini-chapter">제 {chapterNumber} 장</span>
            {chapter.title ? (
              <>
                <span className="brp-mini-divider" aria-hidden="true">·</span>
                <span className="brp-mini-title">{chapter.title}</span>
              </>
            ) : null}
          </span>
          {viewMode === "study" ? (
            <span
              id="brp-mini-toggles-slot"
              className="brp-mini-toggles-slot"
              aria-label="역본 토글 (스크롤 중)"
            />
          ) : null}
        </span>
      </div>

      {/* 메인 캔버스 — 모바일/태블릿 세로: flex column + CSS order 로 기존 순서 유지.
          태블릿 가로/PC(≥960px): grid 2-col 로 좌측(hero+reader), 우측(.brp-side
          sticky 컨테이너 안에 chrome + progress + prayer) 배치.
          우측 컨테이너가 sticky 라서 본문 스크롤해도 컨트롤 카드들이 함께 따라옴. */}
      <div className="brp-canvas">

      {/* 우측 컬럼 wrapper — 모바일에선 display: contents 로 layout 영향 0,
          자식들은 캔버스 직속 flex item 처럼 동작 + CSS order 로 기존 순서 유지.
          PC(≥960) 에선 sticky 컨테이너로 변신, 본문(reader) 스크롤해도 컨트롤·
          진도·기도 카드가 함께 따라옴. sticky top 은 JS 가 사이드바 높이를
          측정해 동적으로 결정(useEffect 참조). */}
      <aside ref={sideRef} className="brp-side" aria-label="읽기 컨트롤 및 진도">

      {/* Row 1: 모드 드롭다운. 책 미선택 시 숨김. */}
      {bookConfirmed && (
      <section className="brp-top-row" aria-label="모드 선택">
        <Dropdown<ModeChoice>
          value={currentModeChoice}
          options={[
            { value: "krv", label: "개역한글" },
            { value: "kids", label: "어린이 의역" },
            { value: "english", label: "영어(WEB)" },
            { value: "kjv", label: "영어(KJV)" },
            { value: "greek", label: "헬라어 보기" },
            { value: "hebrew", label: "히브리어 보기" },
            { value: "study", label: "성경 공부" },
          ]}
          onChange={handleModeChange}
          ariaLabel="모드 선택"
          align="center"
          size="sm"
        />
      </section>
      )}

      {/* Row 2: [구약 책 드롭다운] + [신약 책 드롭다운] — 한 줄, 1:1 분할.
          - 첫 방문 등 책 미선택(bookConfirmed=false) 상태: 양쪽 모두 "구약" / "신약"
            placeholder 로 표시(value=null).
          - 책 선택 후: 그 책이 속한 쪽만 책 이름 표시, 반대쪽은 placeholder 로 회귀.
          - 옵션 클릭 시 changeBook → bookConfirmed=true 로 전환. */}
      <section className="brp-top-row" aria-label="성경 책 선택 (구약 / 신약)">
        {/* 트리거 라벨이 "현재 활성 책" 과 다르면(=다른 testament 책을 보고
            있는 상태) 첫 탭은 그 책으로 빠르게 복귀(스크롤 위치 보존). 한 번
            더 누르면 트리거가 활성 책과 같아져 평소처럼 패널이 열린다. 패널
            에서 다른 책을 선택하면 항상 1장 1절 / 최상단으로 시작. */}
        <Dropdown<BookId>
          value={bookConfirmed ? lastOtBookId : null}
          options={OT_BOOK_IDS.map<DropdownOption<BookId>>((id) => ({
            value: id,
            label: BOOKS[id].name,
          }))}
          onChange={(next) => pickBookFromPanel(next)}
          onTriggerClick={() => {
            if (lastOtBookId && lastOtBookId !== bookId) {
              quickJumpToBook(lastOtBookId);
              return true;
            }
            return false;
          }}
          ariaLabel="구약 책 선택"
          placeholderLabel="구약"
          align="center"
          size="md"
        />
        <Dropdown<BookId>
          value={bookConfirmed ? lastNtBookId : null}
          options={NT_BOOK_IDS.map<DropdownOption<BookId>>((id) => ({
            value: id,
            label: BOOKS[id].name,
          }))}
          onChange={(next) => pickBookFromPanel(next)}
          onTriggerClick={() => {
            if (lastNtBookId && lastNtBookId !== bookId) {
              quickJumpToBook(lastNtBookId);
              return true;
            }
            return false;
          }}
          ariaLabel="신약 책 선택"
          placeholderLabel="신약"
          align="center"
          size="md"
        />
      </section>

      {/* Row 3: 장 스위처 — 책이 정해진 뒤에만 의미. 책 미선택 시 숨김. */}
      {bookConfirmed && (
      <section className="brp-toolbar" aria-label="장 선택">
        <div className="brp-chapter-switcher">
          <button type="button" onClick={() => moveChapter(chapterNumber - 1)} aria-label="이전 장">
            ←
          </button>
          <div className="brp-chapter-select-wrap">
            <Dropdown<number>
              value={chapterNumber}
              options={chapterList.map<DropdownOption<number>>((item) => ({
                value: item.chapter,
                label: `제 ${item.chapter} 장`,
                sub: item.title || undefined,
              }))}
              onChange={(next) => moveChapter(next)}
              ariaLabel={`${bookMeta.name} 장 선택`}
              align="center"
              variant="ghost"
              size="sm"
              showTriggerSub
            />
          </div>
          <button type="button" onClick={() => moveChapter(chapterNumber + 1)} aria-label="다음 장">
            →
          </button>
        </div>
      </section>
      )}

      {bookConfirmed && (
      <section
        className="brp-progress-grid"
        aria-label={`${bookMeta.name} 통독 진도`}
      >
        <div>
          <p className="brp-section-label">진도</p>
          <h2>
            {bookMeta.totalChapters}장 {bookMeta.name} 읽기
          </h2>
        </div>
        <div className="brp-grid">
          <ProgressGrid
            chapters={chapterList}
            chapterNumber={chapterNumber}
            doneChapters={doneChapters}
            bookName={bookMeta.name}
            onSelectChapter={onSelectChapter}
          />
        </div>
      </section>
      )}

      {bookConfirmed && (
      <section className="brp-prayer" aria-label="오늘의 기도">
        <header className="brp-prayer-header">
          <div className="brp-prayer-heading">
            <p className="brp-section-label">오늘의 기도</p>
            <h2>
              {prayerAllDone ? "오늘의 기도 완료" : "7가지 기도를 차례로 따라해요"}
            </h2>
            <p className="brp-prayer-meta">
              <span className="brp-prayer-count">{prayerDone} / {prayerTotal} 마침</span>
              <span className="brp-prayer-divider" aria-hidden>·</span>
              <span className="brp-prayer-date">{prayerDate}</span>
            </p>
          </div>

          <SlidingToggle
            className="brp-prayer-toggle brp-toggle"
            ariaLabel="대상 선택"
            role="tablist"
            activeKey={prayerGrade}
            onSelect={handlePrayerGradeChange}
            items={PRAYER_GRADES.map((key) => ({
              key,
              label: PRAYER_GRADE_LABELS[key],
            }))}
          />
        </header>

        <div className="brp-prayer-bar" aria-hidden="true">
          <span style={{ width: `${prayerPercent}%` }} />
        </div>

        <ol className="brp-prayer-list">
          {prayerCard.prayers.map((prayer) => {
            const isOpen = openPrayer === prayer.no;
            const isDone = prayerChecks.has(prayer.no);
            return (
              <li
                key={prayer.no}
                className={`brp-prayer-item ${isOpen ? "is-open" : ""} ${
                  isDone ? "is-done" : ""
                }`}
              >
                <button
                  type="button"
                  className="brp-prayer-trigger"
                  aria-expanded={isOpen}
                  onClick={() => setOpenPrayer(isOpen ? null : prayer.no)}
                >
                  <span className="brp-prayer-no">
                    {String(prayer.no).padStart(2, "0")}
                  </span>
                  <span className="brp-prayer-theme">{prayer.theme}</span>
                  <span className="brp-prayer-mark" aria-hidden="true">
                    {isDone ? (
                      <svg viewBox="0 0 20 20" width="14" height="14">
                        <path
                          d="M4.5 10.5l3.2 3.2L15.5 6"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <span className="brp-prayer-mark-dot" />
                    )}
                  </span>
                </button>

                {isOpen && (
                  <div className="brp-prayer-body">
                    <blockquote className="brp-prayer-verse">
                      <p>{prayer.verse}</p>
                      <cite>{prayer.ref}</cite>
                    </blockquote>

                    <div className="brp-prayer-section">
                      <p className="brp-prayer-label">생각해보기</p>
                      <p className="brp-prayer-think">{prayer.think}</p>
                    </div>

                    <div className="brp-prayer-section">
                      <p className="brp-prayer-label">따라서 기도해요</p>
                      <div className="brp-prayer-text">
                        {prayer.pray.split("\n").map((line, lineIdx) => {
                          const segments = line.split(/(\([^)]*\))/g);
                          return (
                            <div key={lineIdx} className="brp-prayer-text-line">
                              {segments.map((segment, segIdx) => {
                                if (!segment) return null;
                                if (/^\([^)]*\)$/.test(segment)) {
                                  return (
                                    <span
                                      key={segIdx}
                                      className="brp-prayer-blank"
                                      aria-label="직접 채워 넣어요"
                                    >
                                      {segment}
                                    </span>
                                  );
                                }
                                return <span key={segIdx}>{segment}</span>;
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="brp-prayer-actions">
                      <button
                        type="button"
                        className={`brp-prayer-check ${isDone ? "is-done" : ""}`}
                        onClick={() => togglePrayerCheck(prayer.no)}
                      >
                        {isDone ? "체크 해제" : "이 기도 마쳤어요"}
                      </button>
                      {prayer.no < prayerTotal && (
                        <button
                          type="button"
                          className="brp-prayer-next"
                          onClick={() => setOpenPrayer(prayer.no + 1)}
                        >
                          다음 기도 →
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <div className="brp-prayer-lords">
          <p className="brp-prayer-label">주기도문 (마태복음 6:9-13)</p>
          <p>{prayerCard.lordsPrayer}</p>
        </div>

        {prayerDone > 0 && (
          <div className="brp-prayer-foot">
            <button type="button" className="brp-prayer-reset" onClick={resetPrayers}>
              오늘 기도 다시하기
            </button>
          </div>
        )}
      </section>
      )}

      </aside>{/* /.brp-side */}

      {/* 본문(reader) — source 상 우측 sidebar(.brp-side) 뒤에 위치.
          모바일: CSS order 로 toolbar 와 progress 사이(시각 순서 5)에 표시.
          PC: grid-area: reader 로 좌측 컬럼 차지.
          책 미선택 상태에서도 section 자체는 살려둔다(readerSectionRef·grid 자리
          유지 + 진입 안내 메시지를 placeholder 로 표시). */}
      <section
        ref={readerSectionRef}
        className="brp-reader"
        aria-label={
          bookConfirmed
            ? `${bookMeta.name} ${chapterNumber}장 본문`
            : "성경 본문 — 책 선택 필요"
        }
      >
        {/* hero(책 제목) — reader 카드 최상단으로 이동.
            왜 reader 안으로?
            ① 태블릿/PC(≥960px) 독립 스크롤 모드에서 hero 가 grid 1행으로
               떠있으면 헤더 아래 상시 노출되어 시각적 빈 공간이 커진다.
               reader 안에 두면 본문이 위로 올라갈 때 자연스럽게 함께 사라지고,
               미니바(.brp-mini-bar)로 책·장·소제목이 인계됨.
            ② 모바일에서도 큰 차이는 없음 — 카드 안 첫 영역으로 보일 뿐.
            ③ 책 미선택 시에도 "오늘은 어떤 말씀..." placeholder 가 카드 안에
               떠 있어, 페이지 전체의 시선 흐름이 같은 한 카드로 모인다. */}
        <header className="brp-reader-hero">
          <h1>{bookConfirmed ? bookMeta.name : "오늘은 어떤 말씀을 읽어볼까요?"}</h1>
        </header>
        {/* viewMode 분기 — "성경 공부" 또는 "영어(WEB)" 모드를 선택하면
            기존 reader 본문 자리에 그 전용 컴포넌트를 렌더하고, 나머지
            기존 번역 렌더링은 모두 건너뛴다. 두 모드는 신약 27권 전체에서
            동작하며, 책/장이 바뀌면 그에 맞는 데이터를 lazy load 한다.
            사용자가 구약 책에 있는 상태로 모드를 활성화한 경우(이론상 일어나지
            않음 — handleModeChange 가 자동으로 신약으로 옮긴다) 데이터 없는
            안전 fallback 으로 로마서를 사용한다. */}
        {viewMode === "study" ? (
          <LayeredBibleViewer
            embedded
            bookId={
              STUDY_BOOK_IDS.includes(bookId)
                ? (bookId as StudyBookId)
                : "romans"
            }
            chapter={chapterNumber}
          />
        ) : viewMode === "english" || viewMode === "kjv" ? (
          <EnglishOnlyView
            bookId={
              STUDY_BOOK_IDS.includes(bookId)
                ? (bookId as StudyBookId)
                : "romans"
            }
            chapter={chapterNumber}
            translation={viewMode === "kjv" ? "kjv" : "web"}
            onVerses={handleEnglishVerses}
            onEndVisibilityChange={handleEndVisibilityChange}
            endSentinelNonce={endSentinelNonce}
          />
        ) : (
        <>
        {!bookConfirmed && (
          <p className="brp-reader-empty">
            먼저 위에서 <strong>구약</strong> 또는 <strong>신약</strong> 중
            오늘 읽을 책을 골라주세요.
          </p>
        )}
        {bookConfirmed &&
          !hasFilledText &&
          !bookDataLoading &&
          // 히브리어 모드는 HebrewChapterV2 가 자체 본문을 렌더하므로 page 측의
          // verses=[] 가 비어있다고 해서 "본문 준비 안 됨" 안내를 띄우면 잘못된
          // 신호가 된다. 같은 이유로 헬라어 v2 도 해당 신약 책에서는 별도로
          // 컴포넌트가 본문을 그린다(아래 분기 참고).
          !(effectiveTranslation === "hebrew" && hasHebrew) && (
            <p className="brp-reader-empty">
              이 장의{" "}
              {translation === "krv"
                ? "개역한글"
                : translation === "kids"
                  ? "어린이 쉬운"
                  : translation === "hebrew"
                    ? "히브리어"
                    : "헬라어"}{" "}
              본문이 아직 준비되지 않았어요. 다른 번역을 선택해 보세요.
            </p>
          )}
        {/* 히브리어 보기 — 헬라어 v2 와 동일 구조의 단어 블록(3줄) + 상세 카드.
            RTL/Niqqud/Strong's 등은 HebrewChapterV2 내부에서 처리한다.
            지원 책 목록은 HEBREW_BOOK_IDS 참고. */}
        {bookConfirmed &&
          effectiveTranslation === "hebrew" &&
          hasHebrew && (
            <HebrewChapterV2
              bookId={bookId as TanakhBookId}
              bookLabel={bookMeta.name}
              chapter={chapterNumber}
              chapterLabel={`${chapterNumber}장`}
              onEndVisibilityChange={handleEndVisibilityChange}
              endSentinelNonce={endSentinelNonce}
            />
          )}

        {/* 4복음서·사도행전·로마·고전·고후 + 헬라어 모드일 때 새 "단어
            블록(3줄)" 구조로 절 단위 표시. 장 단위 컴포넌트 안에서 절·복사·
            상세를 모두 처리하므로 verse-card 기반의 long-press 선택 모드와는
            분리된다. 그 외 책의 헬라어 모드는 기존 ruby UI(.brp-greek-block)
            유지.                                                          */}
        {bookConfirmed &&
          effectiveTranslation === "greek" &&
          (bookId === "matthew" ||
            bookId === "mark" ||
            bookId === "luke" ||
            bookId === "john" ||
            bookId === "acts" ||
            bookId === "romans" ||
            bookId === "corinthians1" ||
            bookId === "corinthians2" ||
            bookId === "galatians" ||
            bookId === "ephesians" ||
            bookId === "philippians" ||
            bookId === "colossians" ||
            bookId === "thessalonians1" ||
            bookId === "thessalonians2" ||
            bookId === "timothy1" ||
            bookId === "timothy2" ||
            bookId === "titus" ||
            bookId === "philemon" ||
            bookId === "hebrews" ||
            bookId === "james" ||
            bookId === "peter1" ||
            bookId === "peter2" ||
            bookId === "john1" ||
            bookId === "john2" ||
            bookId === "john3" ||
            bookId === "jude" ||
            bookId === "revelation") && (
            <GreekChapterV2
              bookId={
                bookId as
                  | "matthew"
                  | "mark"
                  | "luke"
                  | "john"
                  | "acts"
                  | "romans"
                  | "corinthians1"
                  | "corinthians2"
                  | "galatians"
                  | "ephesians"
                  | "philippians"
                  | "colossians"
                  | "thessalonians1"
                  | "thessalonians2"
                  | "timothy1"
                  | "timothy2"
                  | "titus"
                  | "philemon"
                  | "hebrews"
                  | "james"
                  | "peter1"
                  | "peter2"
                  | "john1"
                  | "john2"
                  | "john3"
                  | "jude"
                  | "revelation"
              }
              bookLabel={bookMeta.name}
              chapter={chapterNumber}
              chapterLabel={`${chapterNumber}장`}
              onEndVisibilityChange={handleEndVisibilityChange}
              endSentinelNonce={endSentinelNonce}
            />
          )}
        {bookConfirmed &&
          !(
            effectiveTranslation === "greek" &&
            (bookId === "matthew" ||
              bookId === "mark" ||
              bookId === "luke" ||
              bookId === "john" ||
              bookId === "acts" ||
              bookId === "romans" ||
              bookId === "corinthians1" ||
              bookId === "corinthians2" ||
              bookId === "galatians" ||
              bookId === "ephesians" ||
              bookId === "philippians" ||
              bookId === "colossians" ||
              bookId === "thessalonians1" ||
              bookId === "thessalonians2" ||
              bookId === "timothy1" ||
              bookId === "timothy2" ||
              bookId === "titus" ||
              bookId === "philemon" ||
              bookId === "hebrews" ||
              bookId === "james" ||
              bookId === "peter1" ||
              bookId === "peter2" ||
              bookId === "john1" ||
              bookId === "john2" ||
              bookId === "john3" ||
              bookId === "jude" ||
              bookId === "revelation")
          ) &&
          (effectiveTranslation === "krv" ? (
            <StudyNotebook
              bookId={bookId}
              chapter={chapterNumber}
              embedded
              flashVerse={flashVerse}
              onEndVisibilityChange={handleEndVisibilityChange}
              endSentinelNonce={endSentinelNonce}
              onMoveChapter={moveChapter}
            />
          ) : (
            <VerseList
              verses={verses}
              bookId={bookId}
              chapterNumber={chapterNumber}
              effectiveTranslation={effectiveTranslation}
              selectionMode={selectionMode}
              selectedVerses={selectedVerses}
              flashVerse={flashVerse}
              greekTokensMap={greekTokensMap}
              greekWordsMap={greekWordsMap}
              openWordDrawers={openWordDrawers}
              openTokenInfos={openTokenInfos}
              onVersePointerDown={handleVersePointerDown}
              onVersePointerMove={handleVersePointerMove}
              onVersePointerCancel={cancelLongPress}
              onVerseClick={handleVerseClick}
              setOpenTokenInfos={setOpenTokenInfos}
              setOpenWordDrawers={setOpenWordDrawers}
              onEndVisibilityChange={handleEndVisibilityChange}
              endSentinelNonce={endSentinelNonce}
            />
          ))}
        </>
        )}
      </section>

      </div>{/* /.brp-canvas */}

      {/* 선택 모드 액션 바 — 본문 절을 길게 눌러 진입한 selectionMode 동안만 표시.
          디자인 토큰만 사용한다:
            - 컨테이너: --surface(-translucent) + --line + --radius-pill + --shadow-1
            - 메인 액션(복사): --accent / --accent-ink 채움
            - 보조(선택 취소): ghost 톤(--surface-alt 호버 + --ink-soft)
          본문 컨테이너(720px) 기준 가운데 정렬, 모바일에선 화면 폭에 안전하게
          맞도록 max-width: calc(100vw - 24px). */}
      {selectionMode && (
        <div
          className="brp-copy-bar"
          role="region"
          aria-label={`${selectedVerses.size}개 절 선택됨, 복사 가능`}
        >
          <span className="brp-copy-count">
            {selectedVerses.size}개 선택됨
          </span>
          {selectedVerses.size < verses.length && (
            <button
              type="button"
              className="brp-copy-all"
              onClick={selectAllVerses}
              title="이 장 전체 절 선택"
            >
              전체
            </button>
          )}
          <button
            type="button"
            className="brp-copy-btn"
            onClick={() => {
              void copySelectedVerses();
            }}
            disabled={selectedVerses.size === 0}
          >
            복사
          </button>
          <button
            type="button"
            className="brp-copy-cancel"
            onClick={exitSelectionMode}
            title="선택 모드 종료 (ESC)"
          >
            선택 취소
          </button>
        </div>
      )}

      {copyToast && (
        <div className="brp-copy-toast" role="status" aria-live="polite">
          {copyToast}
        </div>
      )}

      {doneToast && (
        <div className="brp-done-toast" role="status" aria-live="polite">
          <span>
            ✓ {doneToast.bookName} {doneToast.chapter}장 완료
          </span>
          <button
            type="button"
            className="brp-done-toast-undo"
            onClick={() =>
              undoChapterCompletion(doneToast.bookId, doneToast.chapter)
            }
          >
            되돌리기
          </button>
        </div>
      )}

      {/* ⚠️ global 스코프 필수.
          하위 컴포넌트(SlidingToggle, Dropdown 등)가 별도 파일로 분리돼 있어
          기본 <style jsx>(컴포넌트 스코프)로는 그 안의 button/요소까지 스타일이
          닿지 않는다 — 결과적으로 토글이 UA 기본 button 으로 보이는 버그.
          모든 셀렉터가 .brp-* 로 네임스페이스 돼 있어 global 사용해도 안전. */}
    </main>
  );
}
