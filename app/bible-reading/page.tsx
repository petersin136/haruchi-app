"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import prayersJson from "./prayers.json";
import {
  BOOKS,
  NT_BOOK_IDS,
  OT_BOOK_IDS,
  isOldTestament,
  type BookId,
} from "./books";
import { loadKoreanChapter, loadKoreanIndex } from "./bibleData";
import type { StudentIdentityBarHandle } from "./components/StudentIdentityBar";
import Dropdown, { type DropdownOption } from "./components/Dropdown";
import SlidingToggle from "./components/SlidingToggle";
import VerseList from "./components/VerseList";
import ProgressGrid from "./components/ProgressGrid";
import MobileTopBar from "./components/MobileTopBar";
import BookChapterDrawer from "./components/BookChapterDrawer";
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
const StudentIdentityBar = nextDynamic(
  () => import("./components/StudentIdentityBar"),
  { ssr: false },
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
import {
  fetchCompletedChapters,
  flushPendingLogs,
  recordChapterCompletion,
  type IdentifiedStudent,
} from "../lib/bibleReadingProgress";
import Wordmark from "../components/Wordmark";
import { useSettings } from "../components/SettingsProvider";
import { SCROLL_SPEED_MULTIPLIER } from "../lib/userSettings";
import type { SearchSelection } from "./SearchOverlay";
import { normalizeEnglishSpeech } from "./englishSpeech";

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
type ReadingScope = "reader" | "web" | "kjv";

type PrayerGradeKey = "children" | "youth" | "youngadult" | "adult";

// 기도 대상(탭) 순서 + 라벨. 저학년/고학년 2단계에서 4단계로 확장.
const PRAYER_GRADES: PrayerGradeKey[] = [
  "children",
  "youth",
  "youngadult",
  "adult",
];
const PRAYER_GRADE_LABELS: Record<PrayerGradeKey, string> = {
  children: "어린이",
  youth: "청소년",
  youngadult: "청년",
  adult: "장년",
};
const isPrayerGradeKey = (value: unknown): value is PrayerGradeKey =>
  value === "children" ||
  value === "youth" ||
  value === "youngadult" ||
  value === "adult";

type PrayerEntry = {
  no: number;
  theme: string;
  verse: string;
  ref: string;
  think: string;
  pray: string;
};

type PrayerCardData = {
  grade: PrayerGradeKey;
  title: string;
  prayers: PrayerEntry[];
  lordsPrayer: string;
};

type PrayersData = Record<PrayerGradeKey, PrayerCardData>;

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

type WordToken = {
  id: string;
  verse: number;
  text: string;
  normalized: string;
};

type ReadingMode = "mic" | "scroll";

type QuizQuestion = {
  verseNum: number;
  blanked: string;
  correct: string;
  options: string[];
};

type SpeechRecognitionResultLike = {
  length: number;
  isFinal: boolean;
  [index: number]: { transcript: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

// 읽기 본문은 장 단위 `korean.json` 만 받는다. 검색은 검색창을 열 때
// `loadAllBooks()` 로 책 전체 `/bible-data/<bookId>.json` 을 받는다.

const prayersData = prayersJson as PrayersData;

const doneKey = (
  bookId: BookId,
  chapter: number,
  scope: ReadingScope = "reader",
) =>
  scope === "reader"
    ? `bible_done_${bookId}_${chapter}`
    : `bible_done_${bookId}_${chapter}_${scope}`;
const verseProgressKey = (
  bookId: BookId,
  chapter: number,
  scope: ReadingScope = "reader",
) =>
  scope === "reader"
    ? `bible_verse_progress_${bookId}_${chapter}`
    : `bible_verse_progress_${bookId}_${chapter}_${scope}`;

const readingScopeOf = (mode: ViewMode): ReadingScope =>
  mode === "english" ? "web" : mode === "kjv" ? "kjv" : "reader";

const isEnglishReadingMode = (mode: ViewMode) =>
  mode === "english" || mode === "kjv";
const celebratedKey = (
  bookId: BookId,
  chapter: number,
  scope: ReadingScope = "reader",
) =>
  scope === "reader"
    ? `bible_celebrated_${bookId}_${chapter}`
    : `bible_celebrated_${bookId}_${chapter}_${scope}`;
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
const READING_MODE_KEY = "bible_reading_mode";
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

const PRAYER_GRADE_KEY = "prayer_grade";
const prayerChecksKey = (date: string, grade: PrayerGradeKey) =>
  `prayer_checks_${date}_${grade}`;

const getTodayKey = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const PARTICLE_REGEX =
  /(으로|에게|에서|부터|까지|처럼|보다|은|는|이|가|을|를|에|의|와|과|도|만|로|께|야|아)$/u;

const normalizeKorean = (value: string) => {
  let text = value
    .toLowerCase()
    .replace(/[^\u3131-\u318e\uac00-\ud7a3a-z0-9]/g, "")
    .trim();

  // 조사 최대 2번까지 떼되, 절대 빈 문자열로 만들지 않는다.
  // (예: "이는" → "이" 까지만, 더 떼면 "" 이 되어 매칭이 불가능해짐)
  for (let i = 0; i < 2; i += 1) {
    const stripped = text.replace(PARTICLE_REGEX, "");
    if (!stripped || stripped === text) break;
    text = stripped;
  }

  return text;
};

// 머리 음절이 몇 개나 연속으로 일치하는지 센다.
const countLeadingMatch = (a: string, b: string) => {
  const len = Math.min(a.length, b.length);
  let matched = 0;
  for (let i = 0; i < len; i += 1) {
    if (a[i] !== b[i]) break;
    matched += 1;
  }
  return matched;
};

// 일반(절 내부) 매칭. 음성 인식 잡음을 어느 정도 흡수하되,
// "앞 2글자만 같으면 통과" 같은 과도한 허용은 제거해 오매칭을 줄인다.
const isLooseMatch = (spoken: string, target: string) => {
  if (!spoken || !target) return false;
  if (spoken === target) return true;

  const shorter = Math.min(spoken.length, target.length);

  // 한쪽이 다른 쪽의 접두사 (조사/어미 차이) — 최소 2음절 이상 공유해야 인정
  if (shorter >= 2 && (spoken.startsWith(target) || target.startsWith(spoken))) {
    return true;
  }

  // 아주 짧은 단어(1음절)는 첫 음절이 같고 길이 차가 1 이내일 때만
  if (target.length <= 1 || spoken.length <= 1) {
    return spoken[0] === target[0] && Math.abs(spoken.length - target.length) <= 1;
  }

  // 머리 음절 60% 이상(최소 2음절) 연속 일치
  const matched = countLeadingMatch(spoken, target);
  const need = Math.max(2, Math.ceil(shorter * 0.6));
  return matched >= need;
};

// 강한 매칭. 절 경계를 넘어 "다음 절의 첫 단어"로 진입할 때만 사용한다.
// 다음 절로 넘어가는 판정이라 보수적으로(거의 정확히) 일치할 때만 허용한다.
const isStrongMatch = (spoken: string, target: string) => {
  if (!spoken || !target) return false;
  if (spoken === target) return true;

  const shorter = Math.min(spoken.length, target.length);

  if (shorter >= 2 && (spoken.startsWith(target) || target.startsWith(spoken))) {
    return true;
  }

  const matched = countLeadingMatch(spoken, target);
  // 1~2음절 단어는 전부 일치해야 하고, 그 이상은 머리 70% 이상 일치해야 한다.
  if (target.length <= 2) return matched >= target.length;
  return matched >= Math.ceil(target.length * 0.7);
};

const getSpeechRecognition = (): SpeechRecognitionConstructor | null => {
  if (typeof window === "undefined") return null;
  const win = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
};

// =============================================================================
// 음성인식 디버그 로그 — 개발 환경에서만 활성화.
// Next.js 가 production 빌드 시 `process.env.NODE_ENV` 를 정적 치환하므로
// 아래 if 블록은 production 번들에서 dead-code 로 제거됨.
// 매칭 로직 자체는 절대 변경하지 않고, 관찰만을 위한 로그.
// =============================================================================
const STT_DEBUG =
  typeof process !== "undefined" && process.env.NODE_ENV === "development";
const sttLog = (...args: unknown[]) => {
  if (STT_DEBUG) console.log("[stt]", ...args);
};

// 절 단위 매칭. 음성에서 각 절의 "첫 의미 단어"가 순차적으로 등장하면
// 그 절을 "읽음"으로 처리한다. 짧은 단어/조사만 있을 때는 두 번째
// 단어까지 한 절 범위 내에 함께 등장해야 인정한다.
const stripToHangulOnly = (value: string) =>
  value.toLowerCase().replace(/[^\u3131-\u318e\uac00-\ud7a3]/g, "");

const extractVerseSignatures = (verseText: string): string[] => {
  return verseText
    .split(/\s+/)
    .map((word) => normalizeKorean(word))
    .filter((word) => word.length >= 2);
};

const countReadVerses = (transcript: string, verses: Verse[]): number => {
  if (verses.length === 0) return 0;
  const stream = stripToHangulOnly(transcript);
  if (!stream) return 0;

  let count = 0;
  let cursor = 0;

  for (const verse of verses) {
    const sigs = extractVerseSignatures(verse.t);

    if (sigs.length === 0) {
      // 표지(sig) 단어가 없으면(아주 짧은 절) 그냥 통과
      count += 1;
      continue;
    }

    const first = sigs[0];
    const second = sigs.length >= 2 ? sigs[1] : null;

    // 1차: 첫 단어 정확 매칭
    let firstIdx = stream.indexOf(first, cursor);

    // 2차: 음성 인식 누락 대비 prefix 매칭 (3자 이상일 때만)
    if (firstIdx === -1 && first.length >= 3) {
      const prefix = first.slice(0, 2);
      firstIdx = stream.indexOf(prefix, cursor);
    }

    if (firstIdx === -1) break;

    // 두 번째 단어가 있다면 절 길이 안쪽에 함께 등장해야 한다.
    // 그래야 우연히 첫 단어만 잡힌 경우(이전 절 잔여물)를 거른다.
    if (second) {
      const verseLen = stripToHangulOnly(verse.t).length;
      const windowEnd = Math.min(
        stream.length,
        firstIdx + Math.max(verseLen * 2 + 8, second.length + 10),
      );
      let secondIdx = stream.indexOf(second, firstIdx + first.length);
      if (secondIdx === -1 && second.length >= 3) {
        secondIdx = stream.indexOf(second.slice(0, 2), firstIdx + first.length);
      }
      if (secondIdx === -1 || secondIdx > windowEnd) {
        break;
      }
      cursor = secondIdx + second.length;
    } else {
      cursor = firstIdx + first.length;
    }

    count += 1;
  }

  return count;
};

const KOREAN_PARTICLE_TAIL =
  /(으로|에게|에서|부터|까지|처럼|보다|에서는|에서도|에는|에도|이라|이라도|이다|이나|이며|이고|은|는|이|가|을|를|에|의|와|과|도|만|로|께|야|아|라|며|고|도다|니라|이여)$/u;

const stripParticleSuffix = (word: string) => {
  let text = word;
  for (let i = 0; i < 2; i += 1) {
    const stripped = text.replace(KOREAN_PARTICLE_TAIL, "");
    if (!stripped || stripped === text) break;
    text = stripped;
  }
  return text;
};

const shuffleArray = <T,>(arr: T[]): T[] => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const collectQuizWordPool = (verses: Verse[]): string[] => {
  const pool = new Set<string>();
  verses.forEach((verse) => {
    verse.t.split(/\s+/).forEach((rawWord) => {
      const hangul = rawWord.replace(/[^\u3131-\u318e\uac00-\ud7a3]/g, "");
      if (hangul.length >= 2 && hangul.length <= 6) {
        pool.add(hangul);
      }
    });
  });
  return Array.from(pool);
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

const generateChapterQuiz = (verses: Verse[]): QuizQuestion[] => {
  if (verses.length === 0) return [];
  const wordPool = collectQuizWordPool(verses);

  // 4단어 이상 가진 절 중에서 2~3개 무작위 선택
  const longEnough = verses.filter((verse) => {
    const tokens = verse.t.split(/\s+/).filter((token) => {
      const hangul = token.replace(/[^\u3131-\u318e\uac00-\ud7a3]/g, "");
      return hangul.length >= 2;
    });
    return tokens.length >= 4;
  });

  const usable = longEnough.length >= 2 ? longEnough : verses;
  // 문제 수: 2 또는 3 (랜덤). 사용 가능한 절이 부족하면 그만큼만.
  const desired = Math.random() < 0.5 ? 2 : 3;
  const count = Math.min(desired, usable.length);
  const picked = shuffleArray(usable).slice(0, count);

  const questions: QuizQuestion[] = [];

  for (const verse of picked) {
    const tokens = verse.t.split(/\s+/);
    const candidates = tokens
      .map((token, idx) => {
        const hangul = token.replace(/[^\u3131-\u318e\uac00-\ud7a3]/g, "");
        return { token, hangul, idx };
      })
      .filter((item) => item.hangul.length >= 2 && item.hangul.length <= 5);

    if (candidates.length === 0) continue;

    const target = candidates[Math.floor(Math.random() * candidates.length)];
    const targetRoot = stripParticleSuffix(target.hangul);

    const blanked = tokens
      .map((token, idx) => (idx === target.idx ? "____" : token))
      .join(" ");

    const distractors: string[] = [];
    const usedRoots = new Set<string>([targetRoot]);
    const shuffled = shuffleArray(wordPool);
    for (const candidate of shuffled) {
      if (distractors.length >= 3) break;
      const root = stripParticleSuffix(candidate);
      if (!root || root.length < 2) continue;
      if (usedRoots.has(root)) continue;
      usedRoots.add(root);
      distractors.push(candidate);
    }

    // 풀이 너무 작으면 정답만 들어가는 경우가 없게 placeholder 채워두기
    while (distractors.length < 3) {
      distractors.push(`보기${distractors.length + 1}`);
    }

    const options = shuffleArray([target.token, ...distractors]);

    questions.push({
      verseNum: verse.n,
      blanked,
      correct: target.token,
      options,
    });
  }

  return questions;
};

// =============================================================================
// 절별 "앞단어 트리거" 매칭 시스템 — 음성 읽기 모드(verse mic) 전용.
//
// 기존 토큰 단위 순차 매칭(advanceReadIndex) 은 한 번에 한 단어씩만 전진해
// 빠른 낭독을 못 따라잡고 절 경계에서 자주 멈추는 문제가 있었다. 그래서
// 본문 매칭 흐름은 "절 단위 트리거" 방식으로 교체했다(advanceReadIndex 는
// 기도(prayer) 매칭에서 그대로 사용 중이라 제거하지 않고 보존).
//
// 동작 요약:
//   1) 절마다 앞 3개 단어(normalizeKorean 적용, 빈 토큰 제외)를 트리거
//      시퀀스로 미리 만들어 둔다. 단어가 3개 미만이면 있는 만큼.
//   2) 첫 단어가 1음절(신뢰도 낮음)이면 한 단어 더 포함해 길이를 확보.
//   3) onresult 의 transcript 를 normalizeKorean 처리해 단어 단위로 쪼갠 뒤,
//      "지금 기다리는 절(currentVerseIdx)" 의 트리거가 spoken 단어 안에서
//      순서대로(in-order) 등장하는지 본다. 단어 비교는 기존 isLooseMatch.
//   4) 트리거 3 단어 중 2개 이상이 순서대로 잡히면 PASS. 트리거가 1~2 단어인
//      짧은 절은 그 개수만큼 전부 잡혀야 PASS.
//   5) PASS 되면 그 절 전체를 한 번에 "읽음" 처리하고 currentVerseIdx 를
//      한 칸 앞으로. 같은 transcript 에 다음 절 트리거가 이어서 잡히면
//      연속으로 통과시킨다(다중 절 fast-pass).
//   6) 순서 강제: 현재 절 트리거가 잡히기 전엔 절대 뒤 절로 건너뛰지 않는다.
// =============================================================================
const buildVerseTrigger = (
  verseText: string,
  normalize: (value: string) => string = normalizeKorean,
): string[] => {
  const all = verseText.split(/\s+/).map(normalize).filter(Boolean);
  if (all.length === 0) return [];

  // 기본 앞 3 단어 (단어 수가 더 적으면 있는 만큼).
  const trigger = all.slice(0, 3);

  // 첫 단어가 1음절 이하면 신뢰도가 낮으므로 한 단어 더 포함해 길이 확보.
  // 원본 단어가 부족하면(이미 다 쓴 경우) 그대로 둔다.
  if (
    trigger[0] !== undefined &&
    trigger[0].length <= 1 &&
    all.length > trigger.length
  ) {
    trigger.push(all[trigger.length]!);
  }

  return trigger;
};

const advanceVerseIndexByTriggers = (
  transcript: string,
  triggers: string[][],
  startIdx: number,
  normalize: (value: string) => string = normalizeKorean,
): number => {
  if (startIdx >= triggers.length) return startIdx;

  const spokenWords = transcript.split(/\s+/).map(normalize).filter(Boolean);

  if (spokenWords.length === 0) return startIdx;

  if (STT_DEBUG) {
    sttLog("triggerScan start", {
      startIdx,
      totalVerses: triggers.length,
      spoken: spokenWords,
      transcriptRaw: transcript,
    });
  }

  let verseIdx = startIdx;
  let spokenCursor = 0;

  while (verseIdx < triggers.length && spokenCursor < spokenWords.length) {
    const trig = triggers[verseIdx];

    // 트리거를 만들 수 없는(빈/공백뿐인) 절은 자동 통과.
    if (!trig || trig.length === 0) {
      if (STT_DEBUG) {
        sttLog("triggerScan PASS (empty verse, auto)", { verseIdx });
      }
      verseIdx += 1;
      continue;
    }

    // 3 단어 이상이면 2 of 3, 1~2 단어인 짧은 절은 가진 개수만큼 전부.
    const required = trig.length >= 3 ? 2 : trig.length;

    let scanCursor = spokenCursor;
    let matched = 0;
    let lastMatchedSpokenIdx = spokenCursor - 1;
    const matchedTrace: {
      trigIdx: number;
      target: string;
      spokenIdx: number;
      spoken: string;
    }[] = [];
    const missedTrace: { trigIdx: number; target: string }[] = [];

    // 트리거 단어들을 순서대로(in-order) 찾는다. 각 트리거 단어는 이전
    // 매치 위치보다 뒤에서만 찾을 수 있어 자연스럽게 순서가 강제된다.
    for (let i = 0; i < trig.length; i += 1) {
      const target = trig[i]!;
      let foundAt = -1;
      for (let s = scanCursor; s < spokenWords.length; s += 1) {
        if (isLooseMatch(spokenWords[s]!, target)) {
          foundAt = s;
          break;
        }
      }
      if (foundAt === -1) {
        if (STT_DEBUG) missedTrace.push({ trigIdx: i, target });
        continue;
      }
      matched += 1;
      lastMatchedSpokenIdx = foundAt;
      scanCursor = foundAt + 1;
      if (STT_DEBUG) {
        matchedTrace.push({
          trigIdx: i,
          target,
          spokenIdx: foundAt,
          spoken: spokenWords[foundAt]!,
        });
      }
    }

    if (matched >= required) {
      if (STT_DEBUG) {
        sttLog("triggerScan PASS", {
          verseIdx,
          trigger: trig,
          required,
          matched,
          matchedTrace,
          missedTrace,
        });
      }
      verseIdx += 1;
      // 다음 절은 마지막 매치 직후부터 검색 (앞 절 트리거와 겹치지 않도록).
      spokenCursor = lastMatchedSpokenIdx + 1;
    } else {
      if (STT_DEBUG) {
        sttLog("triggerScan WAIT", {
          verseIdx,
          trigger: trig,
          required,
          matched,
          matchedTrace,
          missedTrace,
        });
      }
      // 현재 절 트리거가 안 잡히면 더 진행하지 않는다(순서 강제).
      break;
    }
  }

  if (STT_DEBUG) {
    sttLog("triggerScan end", {
      startIdx,
      finalIdx: verseIdx,
      advanced: verseIdx - startIdx,
    });
  }

  return verseIdx;
};

// 기존 토큰 단위 순차 매칭 — 본문 음성 모드에서는 더 이상 사용하지 않지만,
// 기도(prayer) 음성 매칭 흐름(processPrayerTranscript) 이 그대로 사용 중이므로
// 그대로 보존. 본문 매칭은 위 advanceVerseIndexByTriggers 가 담당.
const advanceReadIndex = (
  transcript: string,
  words: WordToken[],
  startIndex: number,
): number => {
  if (words.length === 0) return startIndex;

  const spokenWords = transcript
    .split(/\s+/)
    .map(normalizeKorean)
    .filter(Boolean);

  if (STT_DEBUG) {
    sttLog("advanceReadIndex start", {
      startIndex,
      totalWords: words.length,
      spoken: spokenWords,
      transcriptRaw: transcript,
    });
  }

  const skipEmpty = (idx: number) => {
    let i = idx;
    while (i < words.length && words[i] && words[i].normalized === "") {
      i += 1;
    }
    return i;
  };

  let nextIndex = skipEmpty(startIndex);

  // 해당 인덱스의 단어가 "새로운 절의 첫 단어"인지 판단한다.
  const startsNewVerse = (idx: number) => {
    if (idx <= 0) return false;
    let prev = idx - 1;
    while (prev >= 0 && words[prev] && words[prev].normalized === "") prev -= 1;
    if (prev < 0) return false;
    const cur = words[idx];
    const before = words[prev];
    if (!cur || !before) return false;
    return cur.verse !== before.verse;
  };

  // words[idx] 단어를 "읽음"으로 소비할 수 있는지. 절 경계를 넘는
  // (= 다음 절의 첫 단어) 경우에는 강한 일치가 있어야만 진입을 허용한다.
  const acceptsStep = (spoken: string, idx: number) => {
    const w = words[idx];
    if (!w) return false;
    const boundary = startsNewVerse(idx);
    const matcher = boundary ? "strong" : "loose";
    const ok = boundary
      ? isStrongMatch(spoken, w.normalized)
      : isLooseMatch(spoken, w.normalized);
    if (STT_DEBUG) {
      sttLog("step", {
        idx,
        verse: w.verse,
        target: w.normalized,
        spoken,
        matcher,
        result: ok ? "match" : "miss",
      });
    }
    return ok;
  };

  const canJumpTo = (toIndex: number) => {
    if (toIndex <= nextIndex) return false;
    const seen = new Set<string>();
    for (let i = nextIndex; i <= toIndex; i += 1) {
      const w = words[i];
      if (!w) return false;
      if (w.normalized === "") continue;
      if (seen.has(w.normalized)) return false;
      seen.add(w.normalized);
    }
    return true;
  };

  // 매칭에 실패한 음성 단어가 연속으로 누적되면 더 이상 진행하지 않는다.
  // (이전 절 음성 잔여물이 다음 절 단어와 부분 일치해 과도하게 advance 되는 것 방지)
  let consecutiveMisses = 0;
  const MAX_CONSECUTIVE_MISSES = 6;

  for (const spoken of spokenWords) {
    if (consecutiveMisses >= MAX_CONSECUTIVE_MISSES) break;
    nextIndex = skipEmpty(nextIndex);
    if (nextIndex >= words.length) break;

    if (acceptsStep(spoken, nextIndex)) {
      nextIndex = skipEmpty(nextIndex + 1);
      consecutiveMisses = 0;
      continue;
    }

    if (spoken.length < 2) {
      // 너무 짧은 음절은 그냥 흘려보낸다 (오매칭 위험 큼).
      continue;
    }

    // 점프는 "같은 절 안에서만" 최대 2칸까지 허용한다.
    // 절 경계를 점프로 건너뛰면 안 된다(현재 절의 뒷부분을 건너뛰고
    // 다음 절로 미끄러져 들어가는 현상의 원인).
    let jumped = false;
    const baseVerse = words[nextIndex] ? words[nextIndex].verse : -1;
    for (let offset = 1; offset <= 2; offset += 1) {
      const candidate = words[nextIndex + offset];
      if (!candidate) break;
      if (candidate.verse !== baseVerse) break;
      if (!canJumpTo(nextIndex + offset)) break;
      const jumpOk = isLooseMatch(spoken, candidate.normalized);
      if (STT_DEBUG) {
        sttLog("jump-try", {
          fromIdx: nextIndex,
          offset,
          verse: candidate.verse,
          target: candidate.normalized,
          spoken,
          matcher: "loose",
          result: jumpOk ? "match" : "miss",
        });
      }
      if (jumpOk) {
        nextIndex = skipEmpty(nextIndex + offset + 1);
        jumped = true;
        break;
      }
    }

    if (jumped) {
      consecutiveMisses = 0;
    } else {
      consecutiveMisses += 1;
      if (STT_DEBUG) {
        sttLog("miss++", { spoken, consecutiveMisses });
      }
    }
  }

  const finalIndex = skipEmpty(nextIndex);
  if (STT_DEBUG) {
    sttLog("advanceReadIndex end", {
      startIndex,
      finalIndex,
      advanced: finalIndex - startIndex,
    });
  }
  return finalIndex;
};

const getMicrophonePermissionState = async () => {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return "unknown";
  }

  try {
    const status = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    return status.state;
  } catch {
    return "unknown";
  }
};

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
  const [readingMode, setReadingMode] = useState<ReadingMode>("mic");
  const [readVerseCount, setReadVerseCount] = useState(0);

  // ─── TTS (음성 합성) ────────────────────────────────────────────────────
  // 브라우저 기본 SpeechSynthesis API 만 사용 (외부 유료 TTS 사용 안 함).
  // 낭독 모드(readingMode === "mic")에서 현재 장 본문을 위에서부터 한 절씩
  // ko-KR 로 읽어주고, 현재 절을 시각적으로 하이라이트 + 자동 스크롤.
  //   ttsState        : "idle" | "speaking" | "paused"
  //   ttsVerseN       : 현재 읽고 있는 절 번호 (하이라이트·스크롤 트리거)
  //   ttsRate         : 0.8 ~ 1.5 (사용자 조절)
  //   ttsSupported    : 브라우저가 window.speechSynthesis 를 제공하는지
  //   ttsRateRef      : ttsRate ref (utterance 생성 시 closure stale 방지)
  //   ttsIndexRef     : 현재 읽는 verses 인덱스 (재시작/속도 변경 시 위치 유지)
  //   ttsActiveRef    : 정지/취소 이후 늦게 도착하는 onend 콜백 가드
  //   ttsVersesRef    : 현재 verses 배열 ref (콜백 안에서 최신 verses 참조)
  const [ttsState, setTtsState] = useState<"idle" | "speaking" | "paused">(
    "idle",
  );
  const [ttsVerseN, setTtsVerseN] = useState<number | null>(null);
  const [ttsRate, setTtsRate] = useState(1.0);
  const [ttsSupported, setTtsSupported] = useState(true);
  const ttsRateRef = useRef(1.0);
  const ttsIndexRef = useRef(0);
  const ttsActiveRef = useRef(false);
  // 목소리 / 음높이 / 음량 — 사용자 선호. 모두 localStorage 에 영속.
  //   ttsVoices       : 현재 기기/브라우저에서 사용 가능한 voice 목록.
  //                     voiceschanged 이벤트로 늦게 로드되는 케이스 대응.
  //   ttsVoiceURI     : 선택된 voice 의 voiceURI. null 이면 브라우저 기본.
  //   ttsPitch        : 0.5 ~ 1.5 (utterance.pitch)
  //   ttsVolume       : 0.0 ~ 1.0 (utterance.volume)
  //   ttsSettingsOpen : 설정 팝오버(목소리·슬라이더) 열림 상태.
  // ref 들은 speakOne(=콜백 closure) 안에서 stale 값 참조를 피하기 위함.
  const [ttsVoices, setTtsVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [ttsVoiceURI, setTtsVoiceURI] = useState<string | null>(null);
  const [ttsPitch, setTtsPitch] = useState(1.0);
  const [ttsVolume, setTtsVolume] = useState(1.0);
  const [ttsSettingsOpen, setTtsSettingsOpen] = useState(false);
  const ttsVoiceURIRef = useRef<string | null>(null);
  const ttsPitchRef = useRef(1.0);
  const ttsVolumeRef = useRef(1.0);
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
  // (구) 현재 듣고 있는 절 안의 단어 단위 진행도. 새 트리거 매칭은 절 단위로
  // 한 번에 통과 처리하므로 더 이상 사용하지 않음. 관련 state/ref 도 제거.
  const [doneChapters, setDoneChapters] = useState<Set<number>>(new Set());
  // 절 다중 선택 + 복사 — 별도 "선택 모드" 레이어. 음성 인식 읽기·하이라이트
  // 흐름은 일절 건드리지 않고 위에 얹는다.
  //   1) 본문(.brp-verse) 어디든 약 500ms 길게 누르면 selectionMode 진입 + 그 절 자동 선택.
  //   2) 모드 중에는 다른 절을 그냥 탭하면 선택/해제 토글 (길게 누를 필요 없음).
  //   3) 모든 절을 해제하거나 "선택 취소" 를 누르면 selectionMode 종료.
  //   4) "복사" 누르면 클립보드에 "{책} {장}:{절} {본문}\n..." 형식으로 들어감.
  //   5) ESC / 책·장·번역 전환 시 자동 해제.
  // 길게 누르기는 본문 스크롤과 충돌하지 않도록 10px 이동 시 타이머 취소.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedVerses, setSelectedVerses] = useState<Set<number>>(new Set());
  const [copyToast, setCopyToast] = useState<string>("");
  const [listening, setListening] = useState(false);
  const [speechMessage, setSpeechMessage] = useState("");
  const [scrollReady, setScrollReady] = useState(false);
  const [scrollReachedBottom, setScrollReachedBottom] = useState(false);
  const [scrollSecondsLeft, setScrollSecondsLeft] = useState(0);
  const [chapterMinSeconds, setChapterMinSeconds] = useState(3);
  const [completeVisible, setCompleteVisible] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<(string | null)[]>([]);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [prayerGrade, setPrayerGrade] = useState<PrayerGradeKey>("children");
  const [prayerDate, setPrayerDate] = useState<string>(() => getTodayKey());
  const [prayerChecks, setPrayerChecks] = useState<Set<number>>(new Set());
  const [openPrayer, setOpenPrayer] = useState<number | null>(null);
  const [prayerListeningNo, setPrayerListeningNo] = useState<number | null>(null);
  const [prayerReadCounts, setPrayerReadCounts] = useState<Record<number, number>>({});
  const [prayerSpeechMessage, setPrayerSpeechMessage] = useState("");
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
  // SSR 환경에서는 window가 없어 false가 되며, HMR/하이드레이션 도중 그 값이 굳어
  // 마이크 버튼이 disabled 상태로 멈춰버리는 일이 있다. 기본값을 true로 두고
  // 클라이언트 마운트 후 실제 API 지원 여부로 보정한다.
  const [speechSupported, setSpeechSupported] = useState(true);
  const [currentStudent, setCurrentStudent] = useState<IdentifiedStudent | null>(
    null,
  );
  const [navMenuOpen, setNavMenuOpen] = useState(false);
  // 성경 단어 검색 — 독립 기능. 음성/스크롤/기도/선택 흐름과 분리.
  //   searchOpen: 검색 오버레이 표시 여부.
  //   flashVerse: 검색 결과로 이동했을 때 잠깐 강조(스크롤 타겟)할 절 번호.
  const [searchOpen, setSearchOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [flashVerse, setFlashVerse] = useState<number | null>(null);
  const { settings } = useSettings();

  // ─── 읽기 모드(몰입 모드) ──────────────────────────────────────────────
  // 본문 외 chrome(헤더/사이드/미니바)을 모두 숨기고, 본문을 책처럼 가운데로
  // 모아 큰 글자/넉넉한 줄간격으로 보여주는 별도 레이어. 일반 읽기와 성경 공부
  // 양쪽 모두에서 활성 가능. 진입/해제·글자 배율·라이트/다크 테마는 localStorage
  // 에 영속화된다. (책·장·번역·켜둔 레이어 등 본문 상태는 기존 state 를 그대로
  // 공유한다 — 따로 저장하지 않는다.)
  //   immersive          : 읽기 모드 ON/OFF
  //   immFontScale       : 본문 글자 배율 (0.85 ~ 1.5, 0.05 단위)
  //   immTheme           : "light" | "dark"
  //   immBarVisible      : 상단 컨트롤 바의 표시 여부 — 활동 감지 시 true,
  //                        idle 타이머 만료 시 false. 마우스가 화면 상단 80px
  //                        안에 있을 때는 idle 카운트가 시작되지 않는다.
  const [immersive, setImmersive] = useState(false);
  const [immFontScale, setImmFontScale] = useState(1.0);
  const [immTheme, setImmTheme] = useState<"light" | "dark">("light");
  const [immBarVisible, setImmBarVisible] = useState(true);
  const immBarTimerRef = useRef<number | null>(null);
  const immBarHoverRef = useRef(false);
  // 책·장·절 선택 패널 — 오른쪽 슬라이드 인. 책 컬럼에서 책을 선택하면 그 책의
  // 장 컬럼으로 미리보기(=immSelectorBookId)만 갱신되고, 실제 책 전환은 장
  // 클릭 순간 확정된다. 패널 안에서 책만 바꾸고 닫으면 본문은 바뀌지 않음.
  const [immSelectorOpen, setImmSelectorOpen] = useState(false);
  const [immSelectorBookId, setImmSelectorBookId] = useState<BookId | null>(
    null,
  );
  const [immSelectorTestament, setImmSelectorTestament] = useState<
    "ot" | "nt"
  >("nt");
  const [immVerseInput, setImmVerseInput] = useState("");

  const listeningRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const readVerseCountRef = useRef(0);
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
  const minReadTimeRef = useRef(0);
  const reachedBottomRef = useRef(false);
  const readerSectionRef = useRef<HTMLElement | null>(null);
  const sideRef = useRef<HTMLElement | null>(null);
  const prayerListeningRef = useRef<number | null>(null);
  const prayerRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const prayerReadCountRefs = useRef<Record<number, number>>({});
  const currentStudentRef = useRef<IdentifiedStudent | null>(null);
  const identityRef = useRef<StudentIdentityBarHandle | null>(null);

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

  useEffect(() => {
    currentStudentRef.current = currentStudent;
  }, [currentStudent]);

  // 하이드레이션 + styled-jsx 적용이 끝난 직후 .brp-page--ready 부착 →
  // globals.css 의 visibility: hidden 이 해제되며 페이지가 fade-in.
  // useEffect 는 React commit 이후에 실행되므로 이 시점엔 styled-jsx 의
  // <style> 태그도 이미 DOM 에 주입돼 있다 (FOUC 없음).
  useEffect(() => {
    setMounted(true);
  }, []);

  // ─── 읽기 모드 영속화 / 키보드 / 자동 숨김 ─────────────────────────────
  // 마운트 시 localStorage 에서 상태 복원. 한 번만 실행.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const onRaw = window.localStorage.getItem("haruchi/brp-immersive");
      const fsRaw = window.localStorage.getItem("haruchi/brp-immersive-font");
      const thRaw = window.localStorage.getItem("haruchi/brp-immersive-theme");
      if (onRaw === "1") setImmersive(true);
      if (fsRaw) {
        const v = Number(fsRaw);
        if (Number.isFinite(v) && v >= 0.85 && v <= 1.5) setImmFontScale(v);
      }
      if (thRaw === "dark" || thRaw === "light") setImmTheme(thRaw);
    } catch {
      /* localStorage 비활성 환경 무시 */
    }
  }, []);

  // 변경 시 localStorage 에 즉시 반영. 빠른 토글에도 안전(동기 쓰기).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        "haruchi/brp-immersive",
        immersive ? "1" : "0",
      );
    } catch {
      /* ignore */
    }
  }, [immersive]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        "haruchi/brp-immersive-font",
        String(immFontScale),
      );
    } catch {
      /* ignore */
    }
  }, [immFontScale]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("haruchi/brp-immersive-theme", immTheme);
    } catch {
      /* ignore */
    }
  }, [immTheme]);

  // 다크 테마는 body 에도 클래스를 부착해 portal / fixed overlay 까지 색을 따라
  // 가게 한다(검색 오버레이, 토스트 등). 읽기 모드 OFF 또는 라이트면 떼어낸다.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const cls = "brp-immersive-dark";
    const on = immersive && immTheme === "dark";
    document.body.classList.toggle(cls, on);
    return () => {
      document.body.classList.remove(cls);
    };
  }, [immersive, immTheme]);

  // 읽기 모드 진입/종료 동기화.
  //   · body 에 .brp-immersive 클래스 부착 — 이 클래스로 body 배경, 헤더 숨김,
  //     immersive 바 표시 등이 활성화된다.
  //   · 진입 시 body scrollY 를 0 으로 초기화하고, 직전 일반 모드의 scroll
  //     위치를 ref 에 저장해 종료 후 복원한다. 이렇게 안 하면 사용자가 일반
  //     모드에서 어딘가 스크롤한 뒤 몰입 진입 시 그 위치 그대로 나타나서
  //     "왜 챕터 제목이 안 보이지?" 하게 된다.
  //   · 예전엔 body 를 overflow:hidden 으로 잠갔지만 그러면 본문 자체가
  //     스크롤 안 되어 위로 스크롤이 막히는 버그가 있었다. 이제 본문은
  //     native body scroll 그대로 사용한다.
  const preImmersiveScrollRef = useRef<number>(0);
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (immersive) {
      preImmersiveScrollRef.current = window.scrollY || 0;
      document.body.classList.add("brp-immersive");
      window.scrollTo({ top: 0, behavior: "auto" });
    } else {
      document.body.classList.remove("brp-immersive");
      const restore = preImmersiveScrollRef.current;
      if (restore > 0) {
        window.scrollTo({ top: restore, behavior: "auto" });
      }
    }
    return () => {
      document.body.classList.remove("brp-immersive");
    };
  }, [immersive]);

  // 선택 패널이 열릴 때마다 현재 활성 책으로 미리보기 책 동기화.
  // 패널 안에서 OT/NT 탭도 현재 책 소속에 맞춰 자동 전환.
  useEffect(() => {
    if (!immSelectorOpen) return;
    setImmSelectorBookId(bookConfirmed ? bookId : null);
    setImmSelectorTestament(isOldTestament(bookId) ? "ot" : "nt");
    setImmVerseInput("");
  }, [immSelectorOpen, bookId, bookConfirmed]);

  // ─── 읽기 모드 스와이프 ──────────────────────────────────────────────
  // 오른쪽 → 왼쪽 스와이프: 책·장·절 패널 열기
  // 왼쪽 → 오른쪽 스와이프(패널 열린 상태): 패널 닫기
  // 조건: 가로 이동 ≥ 60px, 세로 이동 ≤ 50px(=가로 우세), 시작점이 화면 우측
  //       60% 안이어야 함(좌측 가장자리 시작은 운영체제 back-swipe 와 충돌).
  useEffect(() => {
    if (!immersive) return;
    if (typeof window === "undefined") return;
    let startX = 0;
    let startY = 0;
    let startedFromOk = false;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        startedFromOk = false;
        return;
      }
      const t = e.touches[0];
      // 패널이 닫힌 상태: 화면 우측 60% 안에서 시작해야 인식.
      //   (좌측 시작은 iOS back-swipe, 안드로이드 system gesture 와 충돌)
      // 패널이 열린 상태: 패널 안에서의 swipe(오른쪽 → 왼쪽 등)는 일반 스크롤
      //   목적일 수 있으므로 우측 30% 안에서 시작했을 때만 닫기 swipe 로 본다.
      if (!immSelectorOpen) {
        if (t.clientX < window.innerWidth * 0.4) {
          startedFromOk = false;
          return;
        }
      } else {
        // 패널 닫힘은 패널 영역(우측 부분) 안에서 시작한 swipe 만.
        if (t.clientX < window.innerWidth * 0.55) {
          startedFromOk = false;
          return;
        }
      }
      startX = t.clientX;
      startY = t.clientY;
      startedFromOk = true;
    };
    const onEnd = (e: TouchEvent) => {
      if (!startedFromOk) return;
      startedFromOk = false;
      const t = e.changedTouches?.[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dy) > 50) return;
      if (Math.abs(dx) < 60) return;
      if (!immSelectorOpen && dx < 0) {
        // 우 → 좌 → 패널 열기
        setImmSelectorOpen(true);
      } else if (immSelectorOpen && dx > 0) {
        // 좌 → 우 → 패널 닫기
        setImmSelectorOpen(false);
      }
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [immersive, immSelectorOpen]);

  // ESC 로 읽기 모드 나가기. 단, 책 선택 패널이 열려 있으면 먼저 패널만 닫고
  // immersive 모드는 유지. 입력 요소 포커스 시에는 가로채지 않는다.
  useEffect(() => {
    if (!immersive) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || t?.isContentEditable) return;
      if (immSelectorOpen) {
        setImmSelectorOpen(false);
        return;
      }
      setImmersive(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [immersive, immSelectorOpen]);

  // 상단 바 자동 숨김: 마우스 이동/터치/키보드 활동 → 표시 + 2.5초 idle 후 숨김.
  // 마우스가 상단 80px 안(또는 바 위)에 있으면 idle 타이머가 시작되지 않아 계속
  // 보임. 모바일에서는 본문을 탭하면 다시 표시된다.
  //
  // ⚠️ 모바일 "탭으로 토글" 버그 주의:
  //   과거에는 어디든 탭하면 바가 토글되었는데, 그러면 X 닫기 버튼을 누른 순간
  //   같은 touchend 가 window 까지 버블 → 바가 hidden 상태로 토글되면서
  //   바에 transform: translateY(-110%) + pointer-events: none 가 240ms 트랜지션과
  //   함께 즉시 적용됨. 그 사이 click 이 dispatch 되면 X 버튼이 더 이상 hit-test
  //   대상이 아니라 setImmersive(false) 가 호출되지 못함 → "읽기 모드에서 나갈 수
  //   없음" 증상. 그래서:
  //     1) 바·피커·버튼 등 인터랙티브 영역의 탭은 토글하지 않고 "표시 + 타이머
  //        리셋" 만 한다 (X / 책장 선택 / 글자크기 등 모든 컨트롤이 안전).
  //     2) 본문 탭은 "표시" 만 (숨김으로 토글하지 않음). 숨김은 오직 2.5초 idle
  //        타이머만 담당 — 사용자가 연속 탭해도 바가 깜빡이지 않는다.
  useEffect(() => {
    if (!immersive) return;
    if (typeof window === "undefined") return;
    const arm = () => {
      if (immBarTimerRef.current) window.clearTimeout(immBarTimerRef.current);
      immBarTimerRef.current = window.setTimeout(() => {
        if (immBarHoverRef.current) return;
        setImmBarVisible(false);
      }, 2500);
    };
    const onMove = (e: MouseEvent) => {
      const nearTop = e.clientY <= 80;
      immBarHoverRef.current = nearTop;
      setImmBarVisible(true);
      if (!nearTop) arm();
    };
    // 터치는 "탭" 일 때만 처리. swipe(가로/세로 큰 이동) 도중에는 바가 흔들리지
    // 않도록 touchstart/touchend 좌표 차이를 본다.
    let tStartX = 0;
    let tStartY = 0;
    const INTERACTIVE_SELECTOR =
      'button, a, input, textarea, select, [role="button"], [role="dialog"], [role="toolbar"]';
    const CHROME_SELECTOR =
      ".brp-immersive-bar, .brp-imm-picker, .brp-imm-picker-backdrop";
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      tStartX = e.touches[0].clientX;
      tStartY = e.touches[0].clientY;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const t = e.changedTouches?.[0];
      if (!t) return;
      const dx = Math.abs(t.clientX - tStartX);
      const dy = Math.abs(t.clientY - tStartY);
      if (dx > 12 || dy > 12) return; // swipe/스크롤은 무시
      const target = e.target as HTMLElement | null;
      const onChrome = !!target?.closest?.(CHROME_SELECTOR);
      const onInteractive = !!target?.closest?.(INTERACTIVE_SELECTOR);
      if (onChrome || onInteractive) {
        // 바·피커·버튼 위 탭은 토글하지 않는다. 사용자가 X 등을 누르는 도중에
        // 바가 사라져 click 이 취소되는 것을 방지. 대신 표시 상태를 유지하고
        // idle 타이머를 다시 건다.
        setImmBarVisible(true);
        arm();
        return;
      }
      // 본문 탭: 바를 "표시" 만 한다. 숨김은 idle 타이머에만 맡긴다.
      setImmBarVisible(true);
      arm();
    };
    const onKey = () => {
      setImmBarVisible(true);
      arm();
    };
    // 스크롤(휠·트랙패드·터치 swipe) 도 활동으로 본다. 트랙패드로만 스크롤
    // 하는 사용자는 mousemove/touchstart 가 안 떠서 바가 안 보일 수 있다.
    // immersive 모드는 native body scroll 을 사용하므로 window.scroll 이
    // 그대로 떠 추가 capture 가 필요 없지만, 혹시 모를 자식 컨테이너 scroll
    // 도 잡도록 capture 단계를 사용한다.
    const onScroll = () => {
      setImmBarVisible(true);
      arm();
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("wheel", onScroll, { passive: true });
    setImmBarVisible(true);
    arm();
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("wheel", onScroll);
      if (immBarTimerRef.current) {
        window.clearTimeout(immBarTimerRef.current);
        immBarTimerRef.current = null;
      }
    };
  }, [immersive]);

  // 음성 안내 토스트(speechMessage / prayerSpeechMessage)는 3 초 뒤 자동으로 사라짐.
  // 본문 가독성을 가리지 않도록 짧게만 노출.
  useEffect(() => {
    if (!speechMessage) return;
    const t = window.setTimeout(() => setSpeechMessage(""), 3000);
    return () => window.clearTimeout(t);
  }, [speechMessage]);
  useEffect(() => {
    if (!prayerSpeechMessage) return;
    const t = window.setTimeout(() => setPrayerSpeechMessage(""), 3000);
    return () => window.clearTimeout(t);
  }, [prayerSpeechMessage]);

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

  const handleStudentChange = useCallback(
    (next: IdentifiedStudent | null) => {
      setCurrentStudent(next);
    },
    [],
  );

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
  // 낭독 인식·TTS·0/N 진도는 이 배열을 쓰고, 개역한글 verses 는 그대로 둔다.
  const [englishVerses, setEnglishVerses] = useState<Verse[]>([]);
  const handleEnglishVerses = useCallback((next: { n: number; t: string }[]) => {
    setEnglishVerses(next);
  }, []);
  const englishReading = isEnglishReadingMode(viewMode);
  const speechNormalize = englishReading ? normalizeEnglishSpeech : normalizeKorean;
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
  const progress = totalVerses > 0
    ? Math.min(100, (readVerseCount / totalVerses) * 100)
    : 0;
  const hasFilledText = totalVerses > 0;

  // ─── TTS: 콜백 + 가드 + cleanup ───────────────────────────────────────
  // verses 가 매 렌더 새 배열로 만들어지므로 ref 로 잡아 콜백 closure 안에서
  // 항상 최신 verses 를 참조하도록 한다.
  const ttsVersesRef = useRef(activeVerses);
  useEffect(() => {
    ttsVersesRef.current = activeVerses;
  }, [activeVerses]);

  // 브라우저가 SpeechSynthesis 를 지원하지 않으면(예: 일부 임베디드 웹뷰)
  // 컨트롤 자체를 disable. mount 시 1회 체크.
  // 동시에 voices 목록을 로드하고 ttsVoices state 에 반영. 일부 브라우저는
  // 첫 getVoices() 가 빈 배열을 반환하고 voiceschanged 이벤트 이후에야 채워
  // 지므로 이벤트 리스너로 재로드.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    setTtsSupported(typeof synth !== "undefined");
    if (!synth) return;
    const loadVoices = () => {
      const list = synth.getVoices();
      // 안정적 정렬: 한국어 → 영어 → 그 외, 같은 그룹 안에서 name 알파벳순.
      const ranked = list.slice().sort((a, b) => {
        const score = (v: SpeechSynthesisVoice) =>
          v.lang.toLowerCase().startsWith("ko")
            ? 0
            : v.lang.toLowerCase().startsWith("en")
              ? 1
              : 2;
        const sa = score(a);
        const sb = score(b);
        if (sa !== sb) return sa - sb;
        return a.name.localeCompare(b.name);
      });
      setTtsVoices(ranked);
    };
    loadVoices();
    synth.addEventListener?.("voiceschanged", loadVoices);
    return () => {
      synth.removeEventListener?.("voiceschanged", loadVoices);
    };
  }, []);

  // voices 가 새로 로드되면, 저장된 voiceURI 가 새 목록에 없는지 검증.
  // 없으면(=다른 기기에서 저장된 voice 등) null 로 떨어뜨려 브라우저 기본을 사용.
  // 처음 로드 시 한국어 voice 가 하나라도 있고 사용자가 아직 선택하지 않았다면
  // (= ttsVoiceURIRef.current 가 null) 자동으로 첫 한국어 voice 를 기본값으로 잡는다.
  useEffect(() => {
    if (ttsVoices.length === 0) return;
    const saved = ttsVoiceURIRef.current;
    if (saved) {
      const exists = ttsVoices.some((v) => v.voiceURI === saved);
      if (!exists) {
        setTtsVoiceURI(null);
        ttsVoiceURIRef.current = null;
      }
      return;
    }
    const firstKo = ttsVoices.find((v) =>
      v.lang.toLowerCase().startsWith("ko"),
    );
    if (firstKo) {
      setTtsVoiceURI(firstKo.voiceURI);
      ttsVoiceURIRef.current = firstKo.voiceURI;
    }
  }, [ttsVoices]);

  // ─── localStorage 영속 ───────────────────────────────────────────────
  // mount 시 1회 hydration. 잘못 저장된 값(범위 밖)은 무시.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const v = window.localStorage.getItem("haruchi/tts-voice");
      if (v) {
        setTtsVoiceURI(v);
        ttsVoiceURIRef.current = v;
      }
      const p = window.localStorage.getItem("haruchi/tts-pitch");
      if (p) {
        const n = parseFloat(p);
        if (Number.isFinite(n) && n >= 0.5 && n <= 1.5) {
          setTtsPitch(n);
          ttsPitchRef.current = n;
        }
      }
      const vol = window.localStorage.getItem("haruchi/tts-volume");
      if (vol) {
        const n = parseFloat(vol);
        if (Number.isFinite(n) && n >= 0 && n <= 1) {
          setTtsVolume(n);
          ttsVolumeRef.current = n;
        }
      }
    } catch {
      // 사파리 사생활 보호 모드 등에서 throw 가능 — 무시.
    }
  }, []);
  // 각 값이 바뀔 때마다 저장.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (ttsVoiceURI) {
        window.localStorage.setItem("haruchi/tts-voice", ttsVoiceURI);
      } else {
        window.localStorage.removeItem("haruchi/tts-voice");
      }
    } catch {}
  }, [ttsVoiceURI]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("haruchi/tts-pitch", String(ttsPitch));
    } catch {}
  }, [ttsPitch]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("haruchi/tts-volume", String(ttsVolume));
    } catch {}
  }, [ttsVolume]);
  // ref 동기화 — 콜백 closure 안에서 항상 최신 값 사용.
  useEffect(() => {
    ttsVoiceURIRef.current = ttsVoiceURI;
  }, [ttsVoiceURI]);
  useEffect(() => {
    ttsPitchRef.current = ttsPitch;
  }, [ttsPitch]);
  useEffect(() => {
    ttsVolumeRef.current = ttsVolume;
  }, [ttsVolume]);

  // ttsRate 가 바뀌면 ref 동기화. 재생 중 속도가 바뀐 경우엔 아래 별도 effect
  // 가 현재 절부터 새 속도로 재시작.
  useEffect(() => {
    ttsRateRef.current = ttsRate;
  }, [ttsRate]);

  // 한 절씩 차례로 발화. startIdx 부터 시작하고, 끝나면 onend 에서 다음 절로
  // 자동 진행. 정지/취소 후 늦게 도착하는 onend 가 새 발화를 다시 시작시키지
  // 않도록 ttsActiveRef 로 보호.
  const speakFromIndex = useCallback((startIdx: number) => {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    const currentVerses = ttsVersesRef.current;
    if (!currentVerses.length) return;
    // 항상 이전 발화를 깨끗이 비우고 시작 — 중간 진입(속도 변경 등)에도 안전.
    synth.cancel();
    ttsActiveRef.current = true;
    ttsIndexRef.current = Math.max(
      0,
      Math.min(startIdx, currentVerses.length - 1),
    );
    const speakOne = (idx: number) => {
      if (!ttsActiveRef.current) return; // 정지된 뒤 도착한 늦은 콜백 차단
      const list = ttsVersesRef.current;
      if (idx >= list.length) {
        // 장 끝까지 다 읽음 → 자연 종료
        ttsActiveRef.current = false;
        setTtsState("idle");
        setTtsVerseN(null);
        ttsIndexRef.current = 0;
        return;
      }
      const v = list[idx];
      const u = new SpeechSynthesisUtterance(v.t);
      const englishSpeech = isEnglishReadingMode(viewModeRef.current);
      u.lang = englishSpeech ? "en-US" : "ko-KR";
      u.rate = ttsRateRef.current;
      u.pitch = ttsPitchRef.current;
      u.volume = ttsVolumeRef.current;
      // 선택된 voice 적용. voiceURI 로 현재 getVoices() 안에서 찾는다.
      // (voice 객체는 페이지 reload 사이에 동일 instance 가 아니므로 URI 비교)
      const voiceURI = ttsVoiceURIRef.current;
      const voices = synth.getVoices();
      if (englishSpeech) {
        const selected = voiceURI
          ? voices.find((vv) => vv.voiceURI === voiceURI)
          : undefined;
        const voice =
          selected && selected.lang.toLowerCase().startsWith("en")
            ? selected
            : voices.find((vv) => vv.lang.toLowerCase().startsWith("en"));
        if (voice) {
          u.voice = voice;
          u.lang = voice.lang;
        }
      } else if (voiceURI) {
        const voice = voices.find((vv) => vv.voiceURI === voiceURI);
        if (voice) {
          u.voice = voice;
          // 명시적으로 voice 가 잡힌 경우 voice.lang 우선 — 일부 엔진은
          // utterance.lang 과 voice.lang 가 다르면 voice 를 무시한다.
          u.lang = voice.lang;
        }
      }
      u.onstart = () => {
        if (!ttsActiveRef.current) return;
        ttsIndexRef.current = idx;
        setTtsVerseN(v.n);
        setTtsState("speaking");
      };
      u.onend = () => {
        if (!ttsActiveRef.current) return;
        speakOne(idx + 1);
      };
      u.onerror = (ev: SpeechSynthesisErrorEvent) => {
        // cancel 시 'canceled' / 'interrupted' 가 정상 종료이므로 무시.
        if (ev.error === "canceled" || ev.error === "interrupted") return;
        ttsActiveRef.current = false;
        setTtsState("idle");
        setTtsVerseN(null);
      };
      synth.speak(u);
    };
    speakOne(ttsIndexRef.current);
  }, []);

  // 재생 (정지 상태 → 처음부터 / 일시정지 상태 → 이어 듣기).
  const playTts = useCallback(() => {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (ttsState === "paused") {
      synth.resume();
      setTtsState("speaking");
      return;
    }
    if (ttsState === "idle") {
      speakFromIndex(0);
    }
  }, [ttsState, speakFromIndex]);

  // 일시정지 — 현재 발화 중인 절의 중간 지점에서 멈추고, 재생 시 그 지점부터 이어짐.
  const pauseTts = useCallback(() => {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (ttsState === "speaking") {
      synth.pause();
      setTtsState("paused");
    }
  }, [ttsState]);

  // 정지 — 큐 비우고 처음 상태로. ttsActiveRef 를 먼저 false 로 두어 늦게
  // 도착하는 onend 의 자동 진행을 차단.
  const stopTts = useCallback(() => {
    if (typeof window === "undefined") return;
    ttsActiveRef.current = false;
    window.speechSynthesis?.cancel();
    setTtsState("idle");
    setTtsVerseN(null);
    ttsIndexRef.current = 0;
  }, []);

  // Web Speech 는 발화 도중 rate/voice/pitch/volume 변경을 지원하지 않는다.
  // 재생/일시정지 상태에서 설정이 바뀌면 현재 절부터 새 설정으로 재시작.
  //   - ttsActiveRef 를 false 로 떨군 뒤 cancel — 진행 중인 onend 가
  //     다음 절을 시작하는 race condition 차단.
  //   - 다음 tick 으로 미뤄 cancel() 의 큐 비우기 지연을 흡수.
  const restartIfActive = useCallback(() => {
    if (ttsState !== "speaking" && ttsState !== "paused") return;
    const idx = ttsIndexRef.current;
    ttsActiveRef.current = false;
    window.speechSynthesis?.cancel();
    window.setTimeout(() => speakFromIndex(idx), 50);
  }, [ttsState, speakFromIndex]);

  // 속도 — 0.5 ~ 2.0 (UI 는 0.8/1.0/1.25/1.5 4단계 노출).
  const changeTtsRate = useCallback(
    (newRate: number) => {
      const clamped = Math.max(0.5, Math.min(2, newRate));
      setTtsRate(clamped);
      ttsRateRef.current = clamped;
      restartIfActive();
    },
    [restartIfActive],
  );

  // 목소리 — voiceURI 문자열. null 이면 브라우저 기본 voice 사용.
  const changeTtsVoice = useCallback(
    (uri: string | null) => {
      setTtsVoiceURI(uri);
      ttsVoiceURIRef.current = uri;
      restartIfActive();
    },
    [restartIfActive],
  );

  // 음 높낮이 — 0.5 ~ 1.5 (utterance.pitch).
  const changeTtsPitch = useCallback(
    (p: number) => {
      const clamped = Math.max(0.5, Math.min(1.5, p));
      setTtsPitch(clamped);
      ttsPitchRef.current = clamped;
      restartIfActive();
    },
    [restartIfActive],
  );

  // 음량 — 0 ~ 1 (utterance.volume).
  const changeTtsVolume = useCallback(
    (vol: number) => {
      const clamped = Math.max(0, Math.min(1, vol));
      setTtsVolume(clamped);
      ttsVolumeRef.current = clamped;
      restartIfActive();
    },
    [restartIfActive],
  );

  // 목소리 목록을 한국어 / 그 외 두 그룹으로 미리 나눠 둠 — drop-down optgroup
  // 렌더링용. 이미 위 voices 로딩 effect 에서 ko 우선 정렬됐으므로 단순 분리.
  const { koreanVoices, otherVoices } = useMemo(() => {
    const ko: SpeechSynthesisVoice[] = [];
    const other: SpeechSynthesisVoice[] = [];
    for (const v of ttsVoices) {
      if (v.lang.toLowerCase().startsWith("ko")) ko.push(v);
      else other.push(v);
    }
    return { koreanVoices: ko, otherVoices: other };
  }, [ttsVoices]);

  // 설정 팝오버 외부 클릭 시 닫기. brp-tts-bar 안쪽(=기어 버튼/팝오버 자체) 클릭은
  // 닫지 않는다. mount/unmount 는 ttsSettingsOpen 토글로만 일어남.
  useEffect(() => {
    if (!ttsSettingsOpen) return;
    if (typeof document === "undefined") return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".brp-tts-bar")) return;
      setTtsSettingsOpen(false);
    };
    // mousedown 으로 잡으면 click 보다 먼저 발생해 같은 click 의 일부로
    // 닫혀버리는 케이스가 있어 click 으로 사용. 다음 tick 등록은 불필요
    // (state 가 true 가 된 이후에야 effect 가 돌므로 안전).
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [ttsSettingsOpen]);

  // 책/장/번역/모드 가 바뀌면 자동 정지. 읽고 있던 위치도 초기화.
  // ESLint react-hooks/exhaustive-deps 는 stopTts 가 안정한 callback 이므로 안전.
  useEffect(() => {
    if (typeof window === "undefined") return;
    ttsActiveRef.current = false;
    window.speechSynthesis?.cancel();
    setTtsState("idle");
    setTtsVerseN(null);
    ttsIndexRef.current = 0;
  }, [bookId, chapterNumber, effectiveTranslation, readingMode]);

  // 화면 벗어남(unmount) / 탭 전환 시 자동 정지.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onVisibility = () => {
      if (document.hidden) {
        ttsActiveRef.current = false;
        window.speechSynthesis?.cancel();
        setTtsState("idle");
        setTtsVerseN(null);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      ttsActiveRef.current = false;
      window.speechSynthesis?.cancel();
    };
  }, []);

  // 현재 읽고 있는 절을 화면 가운데로 부드럽게 스크롤.
  // 일반 reader 스크롤 컨테이너와 immersive(.brp-page--immersive) 컨테이너 둘 다
  // scrollIntoView 가 자동으로 가까운 스크롤 부모를 따라가므로 그대로 사용.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (ttsVerseN == null) return;
    const el = document.querySelector<HTMLElement>(
      `[data-verse-num="${ttsVerseN}"]`,
    );
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [ttsVerseN]);

  const stopListening = useCallback(() => {
    listeningRef.current = false;
    setListening(false);
    recognitionRef.current?.abort();
  }, []);

  const finalizeChapter = useCallback(() => {
    stopListening();
    setReadVerseCount(totalVerses);
    readVerseCountRef.current = totalVerses;
    window.localStorage.setItem(
      doneKey(bookId, chapterNumber, readingScopeOf(viewMode)),
      "true",
    );
    window.localStorage.setItem(
      verseProgressKey(bookId, chapterNumber, readingScopeOf(viewMode)),
      String(totalVerses),
    );
    setDoneChapters((prev) => new Set(prev).add(chapterNumber));

    const student = currentStudentRef.current;
    if (student && !isEnglishReadingMode(viewMode)) {
      void (async () => {
        // br_complete_chapter RPC 는 PIN 이 필요. 보관 PIN 이 없거나(만료/탭 새로 열림)
        // 서버에서 PIN 불일치(bad_pin)가 떨어지면 학생 식별 모달을 다시 띄워 PIN 을 재요청.
        const result = await recordChapterCompletion({
          student,
          book: bookId,
          chapter: chapterNumber,
          // Supabase RPC 는 현재 krv/kids 만 허용. 헬라어/히브리어로 읽었더라도
          // 진도 기록상으로는 krv 로 남긴다(스키마 확장 전 임시).
          translation:
            effectiveTranslation === "greek" || effectiveTranslation === "hebrew"
              ? "krv"
              : effectiveTranslation,
        });
        if (result === "needs_pin" || result === "bad_pin") {
          identityRef.current?.promptPin();
        }
      })();
    }

    const scope = readingScopeOf(viewMode);
    const alreadyCelebrated =
      window.localStorage.getItem(celebratedKey(bookId, chapterNumber, scope)) ===
      "true";
    if (!alreadyCelebrated) {
      window.localStorage.setItem(
        celebratedKey(bookId, chapterNumber, scope),
        "true",
      );
      setCompleteVisible(true);
    }
  }, [bookId, chapterNumber, effectiveTranslation, stopListening, totalVerses, viewMode]);

  const openChapterQuiz = useCallback(() => {
    if (!hasFilledText) return;
    const generated = generateChapterQuiz(verses);
    if (generated.length === 0) {
      finalizeChapter();
      return;
    }
    setQuizQuestions(generated);
    setQuizAnswers(new Array(generated.length).fill(null));
    setQuizSubmitted(false);
    setQuizOpen(true);
  }, [finalizeChapter, hasFilledText, verses]);

  const handleManualFinish = useCallback(() => {
    if (!hasFilledText) return;

    // 이미 다 읽은 장에서 "다 읽었어요"를 다시 누르면, 모달/퀴즈 없이 바로 다음 장으로 넘어간다.
    if (totalVerses > 0 && readVerseCountRef.current >= totalVerses) {
      setCompleteVisible(false);
      if (chapterNumber < bookMeta.totalChapters) {
        const next = chapterNumber + 1;
        setChapterNumber(next);
        setQuizOpen(false);
        setQuizSubmitted(false);
        setQuizAnswers([]);
        setQuizQuestions([]);
        stopListening();
        window.localStorage.setItem(currentChapterKey(bookId), String(next));
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }

    if (readingMode === "mic") {
      // 음성 모드: 절을 80% 이상 잡았으면 바로 완료
      const threshold = Math.max(1, Math.floor(totalVerses * 0.8));
      if (readVerseCountRef.current >= threshold) {
        finalizeChapter();
      } else {
        setSpeechMessage(
          "아직 본문을 다 읽지 않았어요. 절을 끝까지 읽어 주세요.",
        );
      }
      return;
    }

    // 스크롤 모드: 본문 끝까지 + 최소 시간 모두 충족해야 퀴즈로 진행
    if (!reachedBottomRef.current) {
      setSpeechMessage(
        "아직 본문을 다 보지 않았어요. 마지막 절까지 내려서 읽어 주세요.",
      );
      return;
    }
    const remainingMs = minReadTimeRef.current - Date.now();
    if (remainingMs > 0) {
      const sec = Math.ceil(remainingMs / 1000);
      setSpeechMessage(
        `조금만 더 천천히 읽어 주세요. ${sec}초 후에 다시 눌러주세요.`,
      );
      return;
    }
    setSpeechMessage("");
    openChapterQuiz();
  }, [
    bookId,
    bookMeta.totalChapters,
    chapterNumber,
    finalizeChapter,
    hasFilledText,
    openChapterQuiz,
    readingMode,
    stopListening,
    totalVerses,
  ]);

  const resetChapter = useCallback(() => {
    stopListening();
    readVerseCountRef.current = 0;
    setReadVerseCount(0);
    setCompleteVisible(false);
    setSpeechMessage("");
    setQuizOpen(false);
    setQuizSubmitted(false);
    setQuizAnswers([]);
    setQuizQuestions([]);
    window.localStorage.removeItem(
      doneKey(bookId, chapterNumber, readingScopeOf(viewMode)),
    );
    window.localStorage.removeItem(
      verseProgressKey(bookId, chapterNumber, readingScopeOf(viewMode)),
    );
    setDoneChapters((prev) => {
      if (!prev.has(chapterNumber)) return prev;
      const next = new Set(prev);
      next.delete(chapterNumber);
      return next;
    });
  }, [bookId, chapterNumber, stopListening, viewMode]);

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

  // 절별 "앞단어 트리거" 시퀀스 (음성 본문 매칭 전용).
  // 정의/동작 규칙은 buildVerseTrigger 주석 참조.
  // 현재 장의 모든 절에 대해 미리 계산해 두고, 매 transcript 마다
  // advanceVerseIndexByTriggers 가 "지금 기다리는 절" 의 트리거부터
  // 차례로 본다.
  const verseTriggers = useMemo<string[][]>(
    () => activeVerses.map((v) => buildVerseTrigger(v.t, speechNormalize)),
    [activeVerses, speechNormalize],
  );

  const processTranscript = useCallback(
    (transcript: string) => {
      if (!hasFilledText || verseTriggers.length === 0) return;
      const startVerseIdx = readVerseCountRef.current;
      if (startVerseIdx >= verseTriggers.length) return;

      const newVerseIdx = advanceVerseIndexByTriggers(
        transcript,
        verseTriggers,
        startVerseIdx,
        speechNormalize,
      );
      if (newVerseIdx <= startVerseIdx) return;

      readVerseCountRef.current = newVerseIdx;
      setReadVerseCount(newVerseIdx);
      window.localStorage.setItem(
        verseProgressKey(bookId, chapterNumber, readingScopeOf(viewMode)),
        String(newVerseIdx),
      );
    },
    [bookId, chapterNumber, hasFilledText, speechNormalize, verseTriggers, viewMode],
  );

  const handleReadingModeChange = useCallback(
    (next: ReadingMode) => {
      if (next === readingMode) return;
      setReadingMode(next);
      window.localStorage.setItem(READING_MODE_KEY, next);
      setSpeechMessage("");
      if (next === "scroll") {
        // 마이크 모드에서 켜져있던 인식 종료
        listeningRef.current = false;
        setListening(false);
        recognitionRef.current?.abort();
      }
    },
    [readingMode],
  );

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
      stopListening();
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
      stopListening,
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
      stopListening();
      setSearchOpen(false);
      setNavMenuOpen(false);
      setTranslation(nextTr);
      setBookId(nextBook);
      setBookConfirmed(true);
      setChapterNumber(chapter);
      setCompleteVisible(false);
      setQuizOpen(false);
      setQuizSubmitted(false);
      setQuizAnswers([]);
      setQuizQuestions([]);
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
    [stopListening],
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

  const startListening = useCallback(() => {
    if (!hasFilledText) {
      setSpeechMessage("본문을 먼저 채워 넣으면 음성 읽기를 시작할 수 있어요.");
      return;
    }

    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      setSpeechMessage("이 브라우저는 음성인식을 지원하지 않아 스크롤 백업을 사용해 주세요.");
      return;
    }

    if (prayerListeningRef.current !== null) {
      prayerListeningRef.current = null;
      setPrayerListeningNo(null);
      prayerRecognitionRef.current?.abort();
    }

    const recognition = new Recognition();
    recognition.lang = isEnglishReadingMode(viewMode) ? "en-US" : "ko-KR";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    recognition.onresult = (event) => {
      // Concatenate the best alternative of each chunk, then run the matcher
      // again with the secondary alternatives merged in. This gives the loose
      // matcher more chances to catch syllables the primary guess missed.
      let primary = "";
      let merged = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        primary += result[0].transcript;
        if (STT_DEBUG) {
          const alts: string[] = [];
          for (let alt = 0; alt < result.length; alt += 1) {
            alts.push(result[alt].transcript);
          }
          sttLog("verse-onresult chunk", { chunkIndex: i, alts });
        }
        for (let alt = 0; alt < Math.min(result.length, 3); alt += 1) {
          merged += " " + result[alt].transcript;
        }
      }
      if (STT_DEBUG) {
        sttLog("verse-onresult combined", {
          primary,
          merged,
          willRunMerged: merged.trim() !== "" && merged.trim() !== primary.trim(),
        });
      }
      processTranscript(primary);
      if (merged.trim() && merged.trim() !== primary.trim()) {
        processTranscript(merged);
      }
    };
    recognition.onerror = async (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        const currentPermissionState = await getMicrophonePermissionState();
        setSpeechMessage(
          currentPermissionState === "denied"
            ? "마이크 권한이 차단되어 있어요. 주소창 왼쪽 권한 설정에서 허용해 주세요."
            : `Chrome 음성인식이 막혔어요. 새로고침 후 다시 눌러 주세요. (${event.error})`,
        );
        listeningRef.current = false;
        setListening(false);
        return;
      }

      if (event.error === "no-speech") {
        setSpeechMessage("소리가 잘 들리지 않았어요. 조금 더 가까이에서 다시 읽어 주세요.");
      }
    };
    recognition.onend = () => {
      if (listeningRef.current && readVerseCountRef.current < totalVerses) {
        window.setTimeout(() => {
          if (!listeningRef.current) return;
          try {
            recognition.start();
          } catch {
            setSpeechMessage("음성인식이 멈췄어요. 버튼을 다시 눌러 시작해 주세요.");
            listeningRef.current = false;
            setListening(false);
          }
        }, 250);
      }
    };

    recognitionRef.current = recognition;
    listeningRef.current = true;
    setListening(true);
    setSpeechMessage("듣고 있어요. 또박또박 읽어 주세요.");

    try {
      recognition.start();
    } catch {
      setSpeechMessage("음성인식을 시작하지 못했어요. 잠시 후 다시 눌러 주세요.");
      setListening(false);
      listeningRef.current = false;
    }
  }, [hasFilledText, processTranscript, totalVerses, viewMode]);

  const moveChapter = (next: number) => {
    const clamped = Math.min(bookMeta.totalChapters, Math.max(1, next));
    setChapterNumber(clamped);
    setCompleteVisible(false);
    setQuizOpen(false);
    setQuizSubmitted(false);
    setQuizAnswers([]);
    setQuizQuestions([]);
    stopListening();
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
  const enterImmersive = useCallback(() => setImmersive(true), []);
  const promptIdentify = useCallback(() => {
    identityRef.current?.promptIdentify();
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
      stopListening();
      setCompleteVisible(false);
      setQuizOpen(false);
      setQuizSubmitted(false);
      setQuizAnswers([]);
      setQuizQuestions([]);
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
    [stopListening],
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

  // 모바일 서랍: 다른 책+특정 장 — immersive 피커와 동일
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

    const savedMode = window.localStorage.getItem(READING_MODE_KEY);
    if (savedMode === "mic" || savedMode === "scroll") {
      setReadingMode(savedMode);
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
    if (urlParamApplied) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("view");
        window.history.replaceState(
          window.history.state,
          "",
          url.pathname + (url.search ? url.search : "") + url.hash,
        );
      } catch {
        /* ignore */
      }
    }

    // 클라이언트에서 실제 Web Speech API 지원 여부를 확정한다.
    setSpeechSupported(getSpeechRecognition() !== null);
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
      if (
        window.localStorage.getItem(doneKey(bookId, n, scope)) === "true"
      ) {
        done.add(n);
      }
    }
    setDoneChapters(done);

    // 서버 완료 기록은 개역한글/어린이 읽기만 반영한다.
    // 영어(WEB/KJV) 완료를 같은 키에 쓰면 개역한글 진도가 바뀐다.
    if (scope !== "reader" || !currentStudent) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchCompletedChapters(currentStudent.id, bookId);
        if (cancelled) return;
        if (rows.length === 0) return;
        setDoneChapters((prev) => {
          const next = new Set(prev);
          rows.forEach((r) => next.add(r.chapter));
          return next;
        });
        rows.forEach((r) => {
          window.localStorage.setItem(doneKey(bookId, r.chapter), "true");
        });
      } catch (e) {
        console.warn("Failed to load server completions", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId, bookMeta.totalChapters, currentStudent, viewMode]);

  useEffect(() => {
    if (!currentStudent) return;
    void flushPendingLogs();
    const onOnline = () => {
      void flushPendingLogs();
    };
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
    };
  }, [currentStudent]);

  // 책/장/번역이 바뀌면 펼쳐 둔 절 풀이 서랍과 단어 정보 팝오버를 모두 닫는다.
  useEffect(() => {
    setOpenWordDrawers(new Set());
    setOpenTokenInfos(new Set());
  }, [bookId, chapterNumber, effectiveTranslation]);

  useEffect(() => {
    const scope = readingScopeOf(viewMode);
    const savedDone =
      window.localStorage.getItem(doneKey(bookId, chapterNumber, scope)) ===
      "true";
    const savedProgress = Number(
      window.localStorage.getItem(
        verseProgressKey(bookId, chapterNumber, scope),
      ) ?? "0",
    );
    const nextCount =
      savedDone && totalVerses > 0
        ? totalVerses
        : Math.min(Math.max(0, savedProgress), totalVerses);

    readVerseCountRef.current = nextCount;
    setReadVerseCount(nextCount);
    setScrollReady(false);
    setScrollReachedBottom(false);
    reachedBottomRef.current = false;

    // 장마다 최소 읽기 시간: "한 줄(절) 당 0.5초" 가 기본. 사용자 설정
    // (settings.scrollSpeed) 의 배수를 곱해 더 빠르게/천천히 조정한다.
    //   - fast(0.5x) → 절당 0.25초
    //   - normal(1x) → 절당 0.5초 (기본)
    //   - slow / slowest 는 충분히 천천히 읽도록.
    // 최소 2초 (1~3절짜리 단편도 너무 빨리 넘어가지 않도록).
    const verseCount = activeVerses.length;
    const speedMultiplier = SCROLL_SPEED_MULTIPLIER[settings.scrollSpeed] ?? 1;
    const computedSeconds = Math.max(
      2,
      Math.ceil(verseCount * 0.5 * speedMultiplier),
    );
    setChapterMinSeconds(computedSeconds);
    setScrollSecondsLeft(computedSeconds);
    minReadTimeRef.current = Date.now() + computedSeconds * 1000;
  }, [
    bookId,
    chapterNumber,
    settings.scrollSpeed,
    totalVerses,
    translation,
    viewMode,
    activeVerses,
  ]);

  useEffect(() => {
    if (
      readingMode === "mic" &&
      totalVerses > 0 &&
      readVerseCount >= totalVerses
    ) {
      finalizeChapter();
    }
  }, [finalizeChapter, readVerseCount, readingMode, totalVerses]);

  useEffect(() => {
    const savedGrade = window.localStorage.getItem(PRAYER_GRADE_KEY);
    if (isPrayerGradeKey(savedGrade)) {
      setPrayerGrade(savedGrade);
    }
  }, []);

  useEffect(() => {
    const today = getTodayKey();
    setPrayerDate(today);
    const raw = window.localStorage.getItem(prayerChecksKey(today, prayerGrade));
    if (!raw) {
      setPrayerChecks(new Set());
      return;
    }
    try {
      const parsed = JSON.parse(raw) as number[];
      setPrayerChecks(new Set(Array.isArray(parsed) ? parsed : []));
    } catch {
      setPrayerChecks(new Set());
    }
  }, [prayerGrade]);

  const togglePrayerCheck = useCallback(
    (no: number) => {
      setPrayerChecks((prev) => {
        const next = new Set(prev);
        if (next.has(no)) {
          next.delete(no);
        } else {
          next.add(no);
        }
        window.localStorage.setItem(
          prayerChecksKey(prayerDate, prayerGrade),
          JSON.stringify(Array.from(next).sort((a, b) => a - b)),
        );
        return next;
      });
    },
    [prayerDate, prayerGrade],
  );

  const handlePrayerGradeChange = useCallback((grade: PrayerGradeKey) => {
    setPrayerGrade(grade);
    setOpenPrayer(null);
    window.localStorage.setItem(PRAYER_GRADE_KEY, grade);
  }, []);

  const resetPrayers = useCallback(() => {
    window.localStorage.removeItem(prayerChecksKey(prayerDate, prayerGrade));
    setPrayerChecks(new Set());
    setOpenPrayer(null);
  }, [prayerDate, prayerGrade]);

  const prayerCard = prayersData[prayerGrade];
  const prayerTotal = prayerCard.prayers.length;
  const prayerDone = prayerChecks.size;
  const prayerAllDone = prayerTotal > 0 && prayerDone >= prayerTotal;
  const prayerPercent = prayerTotal > 0 ? (prayerDone / prayerTotal) * 100 : 0;

  const prayerWordsByNo = useMemo(() => {
    const map: Record<number, WordToken[]> = {};
    prayerCard.prayers.forEach((p) => {
      const stripped = p.pray.replace(/\([^)]*\)/g, " ");
      map[p.no] = stripped
        .split(/\s+/)
        .map((w) => w.trim())
        .filter(Boolean)
        .map((word, index) => ({
          id: `prayer-${prayerGrade}-${p.no}-${index}`,
          verse: p.no,
          text: word,
          normalized: normalizeKorean(word),
        }));
    });
    return map;
  }, [prayerCard, prayerGrade]);

  const stopPrayerListening = useCallback(() => {
    prayerListeningRef.current = null;
    setPrayerListeningNo(null);
    prayerRecognitionRef.current?.abort();
  }, []);

  useEffect(() => {
    setPrayerReadCounts({});
    prayerReadCountRefs.current = {};
    stopPrayerListening();
  }, [prayerGrade, stopPrayerListening]);

  useEffect(() => {
    if (
      prayerListeningRef.current !== null &&
      prayerListeningRef.current !== openPrayer
    ) {
      stopPrayerListening();
    }
  }, [openPrayer, stopPrayerListening]);

  const processPrayerTranscript = useCallback(
    (no: number, transcript: string) => {
      const words = prayerWordsByNo[no];
      if (!words || words.length === 0) return;
      const startIndex = prayerReadCountRefs.current[no] ?? 0;
      const nextIndex = advanceReadIndex(transcript, words, startIndex);
      if (nextIndex === startIndex) return;

      prayerReadCountRefs.current[no] = nextIndex;
      setPrayerReadCounts((prev) => ({ ...prev, [no]: nextIndex }));

      const threshold = Math.max(1, Math.floor(words.length * 0.8));
      if (nextIndex >= threshold) {
        setPrayerChecks((prev) => {
          if (prev.has(no)) return prev;
          const next = new Set(prev);
          next.add(no);
          window.localStorage.setItem(
            prayerChecksKey(prayerDate, prayerGrade),
            JSON.stringify(Array.from(next).sort((a, b) => a - b)),
          );
          return next;
        });
      }
    },
    [prayerDate, prayerGrade, prayerWordsByNo],
  );

  const startPrayerListening = useCallback(
    (no: number) => {
      const Recognition = getSpeechRecognition();
      if (!Recognition) {
        setPrayerSpeechMessage("이 브라우저는 음성인식을 지원하지 않아 직접 체크해 주세요.");
        return;
      }

      if (listeningRef.current) {
        listeningRef.current = false;
        setListening(false);
        recognitionRef.current?.abort();
      }

      if (prayerListeningRef.current !== null) {
        prayerListeningRef.current = null;
        prayerRecognitionRef.current?.abort();
      }

      const recognition = new Recognition();
      recognition.lang = "ko-KR";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 3;
      recognition.onresult = (event) => {
        const targetNo = prayerListeningRef.current;
        if (targetNo == null) return;
        let primary = "";
        let merged = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          primary += result[0].transcript;
          if (STT_DEBUG) {
            const alts: string[] = [];
            for (let alt = 0; alt < result.length; alt += 1) {
              alts.push(result[alt].transcript);
            }
            sttLog("prayer-onresult chunk", {
              prayerNo: targetNo,
              chunkIndex: i,
              alts,
            });
          }
          for (let alt = 0; alt < Math.min(result.length, 3); alt += 1) {
            merged += " " + result[alt].transcript;
          }
        }
        if (STT_DEBUG) {
          sttLog("prayer-onresult combined", {
            prayerNo: targetNo,
            primary,
            merged,
            willRunMerged:
              merged.trim() !== "" && merged.trim() !== primary.trim(),
          });
        }
        processPrayerTranscript(targetNo, primary);
        if (merged.trim() && merged.trim() !== primary.trim()) {
          processPrayerTranscript(targetNo, merged);
        }
      };
      recognition.onerror = async (event) => {
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          const currentPermissionState = await getMicrophonePermissionState();
          setPrayerSpeechMessage(
            currentPermissionState === "denied"
              ? "마이크 권한이 차단되어 있어요. 주소창 왼쪽 권한 설정에서 허용해 주세요."
              : `Chrome 음성인식이 막혔어요. 새로고침 후 다시 눌러 주세요. (${event.error})`,
          );
          prayerListeningRef.current = null;
          setPrayerListeningNo(null);
          return;
        }
        if (event.error === "no-speech") {
          setPrayerSpeechMessage("소리가 잘 들리지 않았어요. 조금 더 가까이에서 다시 읽어 주세요.");
        }
      };
      recognition.onend = () => {
        if (prayerListeningRef.current === no) {
          window.setTimeout(() => {
            if (prayerListeningRef.current !== no) return;
            try {
              recognition.start();
            } catch {
              setPrayerSpeechMessage("음성인식이 멈췄어요. 버튼을 다시 눌러 시작해 주세요.");
              prayerListeningRef.current = null;
              setPrayerListeningNo(null);
            }
          }, 250);
        }
      };

      prayerRecognitionRef.current = recognition;
      prayerListeningRef.current = no;
      setPrayerListeningNo(no);
      setPrayerSpeechMessage("듣고 있어요. 기도문을 천천히 따라 읽어 주세요.");
      setOpenPrayer(no);

      try {
        recognition.start();
      } catch {
        setPrayerSpeechMessage("음성인식을 시작하지 못했어요. 잠시 후 다시 눌러 주세요.");
        prayerListeningRef.current = null;
        setPrayerListeningNo(null);
      }
    },
    [processPrayerTranscript],
  );

  const resetPrayerProgress = useCallback((no: number) => {
    prayerReadCountRefs.current[no] = 0;
    setPrayerReadCounts((prev) => {
      if (!prev[no]) return prev;
      const next = { ...prev };
      next[no] = 0;
      return next;
    });
  }, []);

  useEffect(() => {
    const tick = () => {
      // 본문(.brp-reader)의 마지막 줄을 지나면 "바닥 도달"로 본다.
      // 기도카드까지 끝까지 내려갈 필요 없이, 그 장의 마지막 절을 보기만 하면 활성화.
      const reader = readerSectionRef.current;
      if (reader) {
        const rect = reader.getBoundingClientRect();
        const viewportH = window.innerHeight;
        // 본문 박스의 하단이 뷰포트 하단보다 약간 위까지 올라왔으면(=마지막 절을 보고 있다는 뜻) 활성화.
        if (rect.bottom <= viewportH - 80) {
          if (!reachedBottomRef.current) {
            reachedBottomRef.current = true;
            setScrollReachedBottom(true);
          }
        }
      } else {
        // ref가 아직 안 잡혔으면 fallback: 페이지 바닥 근처
        const bottomDistance =
          document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
        if (bottomDistance < 160) {
          if (!reachedBottomRef.current) {
            reachedBottomRef.current = true;
            setScrollReachedBottom(true);
          }
        }
      }

      const remainingMs = Math.max(0, minReadTimeRef.current - Date.now());
      const remainingSec = Math.ceil(remainingMs / 1000);
      setScrollSecondsLeft(remainingSec);

      if (reachedBottomRef.current && remainingMs === 0) {
        setScrollReady(true);
      }
    };

    // 첫 렌더 직후 한 번 호출 — 본문이 매우 짧아 처음부터 화면에 다 들어오는 경우 대비
    tick();

    window.addEventListener("scroll", tick, { passive: true });
    const timer = window.setInterval(tick, 500);

    return () => {
      window.removeEventListener("scroll", tick);
      window.clearInterval(timer);
    };
  }, [chapterNumber, translation, bookId]);

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

  const handleQuizAnswer = useCallback((idx: number, option: string) => {
    setQuizAnswers((prev) => {
      const next = [...prev];
      next[idx] = option;
      return next;
    });
  }, []);

  const quizAllCorrect = useMemo(() => {
    if (quizQuestions.length === 0) return false;
    return quizQuestions.every((q, i) => quizAnswers[i] === q.correct);
  }, [quizAnswers, quizQuestions]);

  const handleQuizSubmit = useCallback(() => {
    if (quizAnswers.some((a) => !a)) return;
    setQuizSubmitted(true);
    const allCorrect = quizQuestions.every((q, i) => quizAnswers[i] === q.correct);
    if (allCorrect) {
      window.setTimeout(() => {
        setQuizOpen(false);
        finalizeChapter();
      }, 1100);
    }
  }, [finalizeChapter, quizAnswers, quizQuestions]);

  const handleQuizRetry = useCallback(() => {
    setQuizSubmitted(false);
    setQuizAnswers(new Array(quizQuestions.length).fill(null));
  }, [quizQuestions.length]);

  const handleQuizClose = useCallback(() => {
    setQuizOpen(false);
    setQuizSubmitted(false);
  }, []);

  return (
    <main
      className={`brp-page ${mounted ? "brp-page--ready" : ""} ${
        miniVisible ? "is-scrolled" : ""
      } ${scrolled && !miniVisible ? "is-past-reader" : ""} ${
        immersive ? "brp-page--immersive" : ""
      } ${
        immersive && immTheme === "dark" ? "brp-page--imm-dark" : ""
      } ${
        immersive && !immBarVisible ? "brp-page--imm-idle" : ""
      }`}
      style={
        immersive
          ? ({
              ["--brp-imm-font" as string]: String(immFontScale),
            } as React.CSSProperties)
          : undefined
      }
    >
      {!immersive && (
        <MobileTopBar
          bookName={bookMeta.name}
          chapterNumber={chapterNumber}
          bookConfirmed={bookConfirmed}
          modeChoice={currentModeChoice}
          onModeChange={handleModeChange}
          onSearch={openSearch}
          onOpenDrawer={openDrawer}
          onEnterImmersive={enterImmersive}
          showStudentSelect={!currentStudent}
          onPromptIdentify={promptIdentify}
        />
      )}
      <BookChapterDrawer
        open={drawerOpen}
        onOpen={openDrawer}
        onClose={closeDrawer}
        bookId={bookId}
        chapterNumber={chapterNumber}
        bookConfirmed={bookConfirmed}
        disabled={immersive || searchOpen || selectionMode}
        onSelectBookChapter={selectDrawerBookChapter}
      />
      <header className={`brp-header ${scrolled ? "is-hidden" : ""}`}>
        <a className="brp-brand" href="/" aria-label="하루치 홈으로">
          <Wordmark size="lg" />
        </a>
        {/* 데스크탑/태블릿 (≥640px) — 풀 네비. 톱니바퀴 + 텍스트 링크들이 한 줄. */}
        <nav className="brp-nav brp-nav--desktop" aria-label="Account links">
          {/* 읽기 모드(몰입) 진입 — 헤더 좌측(검색·설정 옆)에 책 아이콘 버튼.
              일반 읽기 / 성경 공부 양쪽 viewMode 에서 동일하게 사용 가능.
              해제는 immersive 바의 ✕ 또는 ESC. */}
          <button
            type="button"
            className="brp-nav-icon brp-immersive-enter-icon-btn"
            onClick={() => setImmersive(true)}
            aria-label="읽기 모드 (몰입)"
            title="읽기 모드"
          >
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
              <path
                d="M3 4.2A1.2 1.2 0 0 1 4.2 3H9v13H4.2A1.2 1.2 0 0 1 3 14.8V4.2zm14 0A1.2 1.2 0 0 0 15.8 3H11v13h4.8a1.2 1.2 0 0 0 1.2-1.2V4.2z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path
                d="M5 17h10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
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
          {!currentStudent ? (
            <button
              type="button"
              className="brp-nav-link brp-nav-text-link"
              onClick={() => identityRef.current?.promptIdentify()}
            >
              학생 선택
            </button>
          ) : null}
          <a className="brp-nav-link brp-nav-text-link" href="/login">
            관리자·교사 로그인
          </a>
        </nav>

        {/* 모바일 (<640px) — 검색 + 햄버거. 햄버거는 우상단 시트 드롭다운. */}
        <div className="brp-mobile-actions">
          <button
            type="button"
            className="brp-mobile-search brp-immersive-enter-icon-btn"
            onClick={() => setImmersive(true)}
            aria-label="읽기 모드 (몰입)"
            title="읽기 모드"
          >
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
              <path
                d="M3 4.2A1.2 1.2 0 0 1 4.2 3H9v13H4.2A1.2 1.2 0 0 1 3 14.8V4.2zm14 0A1.2 1.2 0 0 0 15.8 3H11v13h4.8a1.2 1.2 0 0 0 1.2-1.2V4.2z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path
                d="M5 17h10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
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
            {!currentStudent ? (
              <button
                type="button"
                className="brp-mobile-menu-item"
                onClick={() => {
                  setNavMenuOpen(false);
                  identityRef.current?.promptIdentify();
                }}
              >
                <span className="brp-mobile-menu-icon" aria-hidden="true">
                  <span className="brp-mobile-menu-bullet" />
                </span>
                <span>학생 선택</span>
              </button>
            ) : null}
            <a
              className="brp-mobile-menu-item"
              href="/login"
              onClick={() => setNavMenuOpen(false)}
            >
              <span className="brp-mobile-menu-icon" aria-hidden="true">
                <span className="brp-mobile-menu-bullet" />
              </span>
              <span>관리자·교사 로그인</span>
            </a>
            <span className="brp-mobile-menu-divider" aria-hidden="true" />
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

      {/* 읽기 모드(몰입) 상단 바 — immersive=true 때만 fixed top 에 떠 있고,
          마우스가 위쪽 80px 안에 있거나 최근 활동이 있을 때만 보임(2.5초 idle 시 페이드 아웃).
          모바일에서는 본문을 탭하면 토글된다.

          내부 컨트롤: 책(구약/신약) / 장 prev·next / 역본 모드 / 절 이동(jump)
                       글자 크기 −/+ / 라이트·다크 / 닫기(✕).
          성경 공부(viewMode==="study") 일 때는 LayeredBibleViewer 의 미니 역본
          토글이 #brp-mini-toggles-slot 으로 들어가 있으므로(미니바와 슬롯 공유)
          이 바와는 별도로 mini-bar 가 함께 노출되어 레이어 on/off 가 가능하다. */}
      {immersive && (
        <div
          className={`brp-immersive-bar ${
            immBarVisible ? "is-visible" : "is-hidden"
          }`}
          role="toolbar"
          aria-label="읽기 모드 컨트롤"
          onMouseEnter={() => {
            immBarHoverRef.current = true;
            setImmBarVisible(true);
          }}
          onMouseLeave={() => {
            immBarHoverRef.current = false;
          }}
        >
          <div className="brp-immersive-bar-inner">
            {/* 좌측: 책·장 통합 트리거 + 이전/다음 장 화살표 + 역본 모드 */}
            <div className="brp-immersive-section">
              <button
                type="button"
                className="brp-immersive-arrow"
                onClick={() => moveChapter(chapterNumber - 1)}
                aria-label="이전 장"
                disabled={!bookConfirmed || chapterNumber <= 1}
              >
                ←
              </button>
              <button
                type="button"
                className="brp-immersive-trigger"
                onClick={() => setImmSelectorOpen((v) => !v)}
                aria-haspopup="dialog"
                aria-expanded={immSelectorOpen}
                aria-label="책 / 장 / 절 선택 열기"
                title="책 / 장 / 절 선택"
              >
                <span className="brp-immersive-trigger-text">
                  {bookConfirmed ? (
                    <>
                      <span className="brp-immersive-trigger-book">
                        {bookMeta.name}
                      </span>
                      <span className="brp-immersive-trigger-chapter">
                        {chapterNumber} 장
                      </span>
                    </>
                  ) : (
                    <span className="brp-immersive-trigger-placeholder">
                      책 선택
                    </span>
                  )}
                </span>
                <span className="brp-immersive-trigger-caret" aria-hidden="true">
                  ▾
                </span>
              </button>
              <button
                type="button"
                className="brp-immersive-arrow"
                onClick={() => moveChapter(chapterNumber + 1)}
                aria-label="다음 장"
                disabled={!bookConfirmed || chapterNumber >= bookMeta.totalChapters}
              >
                →
              </button>
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
                ariaLabel="모드 선택 (읽기 모드)"
                align="left"
                size="sm"
              />
            </div>

            {/* 우측: 글자 크기 / 테마 / 닫기 */}
            <div className="brp-immersive-section brp-immersive-section--end">
              <div
                className="brp-immersive-font"
                role="group"
                aria-label="글자 크기"
              >
                <button
                  type="button"
                  className="brp-immersive-icon"
                  onClick={() =>
                    setImmFontScale((v) =>
                      Math.max(0.85, Math.round((v - 0.05) * 100) / 100),
                    )
                  }
                  aria-label="글자 작게"
                  disabled={immFontScale <= 0.85}
                  title="글자 작게"
                >
                  <span className="brp-immersive-font-small" aria-hidden="true">
                    가
                  </span>
                </button>
                <span
                  className="brp-immersive-font-value"
                  aria-live="polite"
                  title={`현재 ${Math.round(immFontScale * 100)}%`}
                >
                  {Math.round(immFontScale * 100)}%
                </span>
                <button
                  type="button"
                  className="brp-immersive-icon"
                  onClick={() =>
                    setImmFontScale((v) =>
                      Math.min(1.5, Math.round((v + 0.05) * 100) / 100),
                    )
                  }
                  aria-label="글자 크게"
                  disabled={immFontScale >= 1.5}
                  title="글자 크게"
                >
                  <span className="brp-immersive-font-large" aria-hidden="true">
                    가
                  </span>
                </button>
              </div>
              <button
                type="button"
                className="brp-immersive-icon"
                onClick={() =>
                  setImmTheme((t) => (t === "dark" ? "light" : "dark"))
                }
                aria-label={immTheme === "dark" ? "라이트 모드" : "다크 모드"}
                title={immTheme === "dark" ? "라이트 모드" : "다크 모드"}
              >
                {immTheme === "dark" ? (
                  <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                    <circle cx="10" cy="10" r="3.4" fill="currentColor" />
                    <g
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    >
                      <path d="M10 2v2.2M10 15.8V18M2 10h2.2M15.8 10H18M4.4 4.4l1.6 1.6M14 14l1.6 1.6M4.4 15.6L6 14M14 6l1.6-1.6" />
                    </g>
                  </svg>
                ) : (
                  <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                    <path
                      d="M14.5 12.6A6 6 0 0 1 7.4 5.5a.6.6 0 0 0-.85-.7A7.2 7.2 0 1 0 15.2 13.4a.6.6 0 0 0-.7-.85z"
                      fill="currentColor"
                    />
                  </svg>
                )}
              </button>
              <button
                type="button"
                className="brp-immersive-close"
                onClick={() => setImmersive(false)}
                aria-label="읽기 모드 끝내기 (ESC)"
                title="읽기 모드 나가기 (ESC)"
              >
                <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
                  <path
                    d="M5 5l10 10M15 5L5 15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 책 / 장 / 절 선택 패널 — 읽기 모드의 immersive 바 트리거(상단 "책 N장 ▾")
          또는 오른쪽 → 왼쪽 swipe 제스처로 열린다. 오른쪽에서 슬라이드 인.
          2 열 (책 목록 | 장 목록) + 하단 절 이동 입력.
          책 목록은 OT/NT 탭으로 전환. 책을 누르면 미리보기(=immSelectorBookId)만
          바뀌고, 장을 누르면 그 시점에 책 + 장이 함께 확정되어 본문 이동. */}
      {immersive && immSelectorOpen && (
        <>
          <div
            className="brp-imm-picker-backdrop"
            role="presentation"
            onClick={() => setImmSelectorOpen(false)}
          />
          {(() => {
            const previewBook =
              immSelectorBookId ?? (bookConfirmed ? bookId : null);
            const previewMeta = previewBook ? BOOKS[previewBook] : null;
            const previewTotal = previewMeta?.totalChapters ?? 0;
            const chapterList: number[] = Array.from(
              { length: previewTotal },
              (_, i) => i + 1,
            );
            const list =
              immSelectorTestament === "ot" ? OT_BOOK_IDS : NT_BOOK_IDS;
            const commitJumpVerse = () => {
              const n = Number(immVerseInput);
              if (!Number.isFinite(n) || n <= 0) {
                setImmVerseInput("");
                return;
              }
              if (previewBook && previewBook !== bookId) {
                pickBookFromPanel(previewBook);
                window.setTimeout(() => {
                  moveChapter(chapterNumber);
                  setFlashVerse(n);
                }, 0);
              } else {
                setFlashVerse(n);
              }
              setImmVerseInput("");
              setImmSelectorOpen(false);
            };
            return (
              <aside
                className="brp-imm-picker"
                role="dialog"
                aria-modal="true"
                aria-label="성경 책·장·절 선택"
              >
                <header className="brp-imm-picker-head">
                  <SlidingToggle<"ot" | "nt">
                    className="brp-imm-picker-tabs brp-toggle"
                    buttonClassName="brp-imm-picker-tab"
                    role="tablist"
                    ariaLabel="구약 / 신약 선택"
                    activeKey={immSelectorTestament}
                    onSelect={(k) => setImmSelectorTestament(k)}
                    items={[
                      { key: "ot", label: "구약" },
                      { key: "nt", label: "신약" },
                    ]}
                  />
                  <button
                    type="button"
                    className="brp-imm-picker-close"
                    onClick={() => setImmSelectorOpen(false)}
                    aria-label="선택 패널 닫기"
                  >
                    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                      <path
                        d="M5 5l10 10M15 5L5 15"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </header>

                <div className="brp-imm-picker-body">
                  {/* 좌: 책 목록 */}
                  <ul
                    className="brp-imm-picker-books"
                    role="listbox"
                    aria-label="책 목록"
                  >
                    {list.map((id) => {
                      const isActive = previewBook === id;
                      const isCurrent = bookConfirmed && bookId === id;
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            className={`brp-imm-picker-book ${
                              isActive ? "is-active" : ""
                            } ${isCurrent ? "is-current" : ""}`}
                            onClick={() => setImmSelectorBookId(id)}
                            role="option"
                            aria-selected={isActive}
                          >
                            {BOOKS[id].name}
                          </button>
                        </li>
                      );
                    })}
                  </ul>

                  {/* 우: 장 그리드 + 절 이동 */}
                  <div className="brp-imm-picker-chapters-wrap">
                    {previewBook ? (
                      <>
                        <ul
                          className="brp-imm-picker-chapters"
                          role="listbox"
                          aria-label={`${previewMeta?.name ?? ""} 장 목록`}
                        >
                          {chapterList.map((n) => {
                            const isCurrent =
                              previewBook === bookId && n === chapterNumber;
                            return (
                              <li key={n}>
                                <button
                                  type="button"
                                  className={`brp-imm-picker-chapter ${
                                    isCurrent ? "is-current" : ""
                                  }`}
                                  onClick={() => {
                                    if (previewBook !== bookId) {
                                      pickBookFromPanel(previewBook);
                                      window.setTimeout(() => moveChapter(n), 0);
                                    } else {
                                      moveChapter(n);
                                    }
                                    setImmSelectorOpen(false);
                                  }}
                                  role="option"
                                  aria-selected={isCurrent}
                                >
                                  {n}
                                </button>
                              </li>
                            );
                          })}
                        </ul>

                        <div className="brp-imm-picker-verse-jump">
                          <label
                            className="brp-imm-picker-verse-label"
                            htmlFor="brp-imm-verse-input"
                          >
                            절 이동
                          </label>
                          <div className="brp-imm-picker-verse-row">
                            <input
                              id="brp-imm-verse-input"
                              type="number"
                              inputMode="numeric"
                              min={1}
                              className="brp-imm-picker-verse-input"
                              placeholder={
                                previewBook === bookId
                                  ? `${chapterNumber}장 안에서 절`
                                  : "1장 1절로 이동 후"
                              }
                              value={immVerseInput}
                              onChange={(e) => setImmVerseInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  commitJumpVerse();
                                }
                              }}
                            />
                            <button
                              type="button"
                              className="brp-imm-picker-verse-go"
                              onClick={commitJumpVerse}
                              disabled={!immVerseInput}
                              aria-label="해당 절로 이동"
                            >
                              이동
                            </button>
                          </div>
                          <p className="brp-imm-picker-verse-hint">
                            * 장 위 숫자를 누르면 그 장 1절부터 시작
                          </p>
                        </div>
                      </>
                    ) : (
                      <p className="brp-imm-picker-empty">
                        왼쪽에서 책을 먼저 선택해 주세요.
                      </p>
                    )}
                  </div>
                </div>
              </aside>
            );
          })()}
        </>
      )}

      <StudentIdentityBar ref={identityRef} onChange={handleStudentChange} />

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

      {/* Row 1: [모드 드롭다운] + [읽기 모드 토글] — 한 줄, 1:1 분할.
          왼쪽: 5개 모드 드롭다운(개역한글 / 어린이 / 영어 / 헬라어 / 성경 공부).
                기존 단일 역본 토글을 드롭다운으로 대체해, '성경 공부(로마서 1장
                레이어 뷰어)' 진입점을 같은 자리에 통합했다. english/study 항목은
                고르면 자동으로 로마서 1장으로 이동한다.
          오른쪽: 낭독 / 묵독.
          책 미선택(bookConfirmed=false) 상태에서는 의미가 없는 컨트롤이라 통째로
          숨겨, "책부터 골라주세요" 라는 시선 흐름을 자연스럽게 유도. */}
      {bookConfirmed && (
      <section className="brp-top-row" aria-label="모드와 읽기 모드 선택">
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

        <SlidingToggle<ReadingMode>
          className="brp-mode-tabs brp-mode-tabs--sm brp-toggle"
          buttonClassName="brp-mode-tab"
          role="tablist"
          ariaLabel="읽기 모드 선택"
          activeKey={readingMode}
          onSelect={handleReadingModeChange}
          items={[
            { key: "mic", label: "낭독" },
            { key: "scroll", label: "묵독" },
          ]}
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
                      <div className="brp-prayer-text-head">
                        <p className="brp-prayer-label">따라서 기도해요</p>
                        {(() => {
                          const totalPrayerWords = (prayerWordsByNo[prayer.no] ?? []).length;
                          const readPrayerWords = prayerReadCounts[prayer.no] ?? 0;
                          if (totalPrayerWords === 0) return null;
                          return (
                            <span className="brp-prayer-word-count">
                              {readPrayerWords} / {totalPrayerWords} 단어
                            </span>
                          );
                        })()}
                      </div>
                      <div className="brp-prayer-text">
                        {(() => {
                          const readUpTo = prayerReadCounts[prayer.no] ?? 0;
                          let globalIdx = 0;
                          return prayer.pray.split("\n").map((line, lineIdx) => {
                            const segments = line.split(/(\([^)]*\))/g);
                            return (
                              <div key={lineIdx} className="brp-prayer-text-line">
                                {segments.flatMap((segment, segIdx) => {
                                  if (!segment) return [];
                                  if (/^\([^)]*\)$/.test(segment)) {
                                    return [
                                      <span
                                        key={`p-${segIdx}`}
                                        className="brp-prayer-blank"
                                        aria-label="직접 채워 넣어요"
                                      >
                                        {segment}
                                      </span>,
                                    ];
                                  }
                                  const tokens = segment.split(/\s+/).filter(Boolean);
                                  return tokens.map((token, tokenIdx) => {
                                    const idx = globalIdx;
                                    globalIdx += 1;
                                    return (
                                      <span
                                        key={`w-${segIdx}-${tokenIdx}`}
                                        className={`brp-prayer-word ${
                                          idx < readUpTo ? "is-read" : ""
                                        }`}
                                      >
                                        {token}
                                      </span>
                                    );
                                  });
                                })}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>

                    <div className="brp-prayer-actions">
                      <button
                        type="button"
                        className={`brp-prayer-mic ${
                          prayerListeningNo === prayer.no ? "is-listening" : ""
                        }`}
                        onClick={() =>
                          prayerListeningNo === prayer.no
                            ? stopPrayerListening()
                            : startPrayerListening(prayer.no)
                        }
                        disabled={!speechSupported}
                      >
                        <span className="brp-prayer-mic-dot" />
                        {prayerListeningNo === prayer.no ? "듣는 중지" : "기도 따라하기"}
                      </button>
                      <button
                        type="button"
                        className={`brp-prayer-check ${isDone ? "is-done" : ""}`}
                        onClick={() => togglePrayerCheck(prayer.no)}
                      >
                        {isDone ? "체크 해제" : "이 기도 마쳤어요"}
                      </button>
                      {(prayerReadCounts[prayer.no] ?? 0) > 0 && (
                        <button
                          type="button"
                          className="brp-prayer-restart"
                          onClick={() => resetPrayerProgress(prayer.no)}
                        >
                          처음부터
                        </button>
                      )}
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
            readVerseCount={readVerseCount}
            speakingVerse={ttsVerseN}
            onVerses={handleEnglishVerses}
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
          ) && (
          <VerseList
            verses={verses}
            bookId={bookId}
            chapterNumber={chapterNumber}
            effectiveTranslation={effectiveTranslation}
            readingMode={readingMode}
            readVerseCount={readVerseCount}
            totalVerses={totalVerses}
            selectionMode={selectionMode}
            selectedVerses={selectedVerses}
            flashVerse={flashVerse}
            ttsVerseN={ttsVerseN}
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
          />
          )}
        </>
        )}
      </section>

      </div>{/* /.brp-canvas */}

      {/* 음성 재생 컨트롤(브라우저 SpeechSynthesis) — 낭독 모드에서만 노출.
          묵독(scroll) 모드에서는 숨김. dock 위쪽(bottom: 76px) 에 떠 있는 별도
          알약. 책/장이 정해졌고 본문(verses) 이 있는 상태에서만 의미 있음. */}
      {bookConfirmed && readingMode === "mic" && hasFilledText && (
        <div className="brp-tts-bar" role="region" aria-label="본문 음성 재생">
          <button
            type="button"
            className={`brp-tts-btn brp-tts-btn--primary ${
              ttsState === "speaking" ? "is-playing" : ""
            }`}
            onClick={ttsState === "speaking" ? pauseTts : playTts}
            disabled={!ttsSupported}
            aria-label={
              ttsState === "speaking"
                ? "음성 재생 일시정지"
                : ttsState === "paused"
                  ? "음성 재생 이어 듣기"
                  : "음성 재생 시작"
            }
            title={
              !ttsSupported
                ? "이 브라우저는 음성 합성을 지원하지 않습니다"
                : ttsState === "speaking"
                  ? "일시정지"
                  : ttsState === "paused"
                    ? "이어 듣기"
                    : "처음부터 재생"
            }
          >
            {ttsState === "speaking" ? (
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <rect x="3.5" y="2.5" width="3" height="11" rx="1" fill="currentColor" />
                <rect x="9.5" y="2.5" width="3" height="11" rx="1" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="M3.5 2.5v11l10-5.5-10-5.5z" fill="currentColor" />
              </svg>
            )}
            <span>
              {ttsState === "speaking"
                ? "일시정지"
                : ttsState === "paused"
                  ? "이어 듣기"
                  : "음성 재생"}
            </span>
          </button>
          <button
            type="button"
            className="brp-tts-btn"
            onClick={stopTts}
            disabled={!ttsSupported || ttsState === "idle"}
            aria-label="음성 재생 정지"
            title="정지"
          >
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <rect x="3" y="3" width="10" height="10" rx="1.2" fill="currentColor" />
            </svg>
          </button>
          {/* 속도 — 0.8 / 1.0 / 1.25 / 1.5. 활성 속도는 갈색 fill. */}
          <div
            className="brp-tts-rates"
            role="group"
            aria-label="읽기 속도 선택"
          >
            {[0.8, 1.0, 1.25, 1.5].map((r) => (
              <button
                key={r}
                type="button"
                className={`brp-tts-rate ${
                  Math.abs(ttsRate - r) < 0.001 ? "is-active" : ""
                }`}
                onClick={() => changeTtsRate(r)}
                disabled={!ttsSupported}
                aria-pressed={Math.abs(ttsRate - r) < 0.001}
                aria-label={`읽기 속도 ${r}배속`}
              >
                {r === 1.0 ? "1.0×" : `${r}×`}
              </button>
            ))}
          </div>
          {/* 진행 표시 — 현재 절 번호. ttsVerseN 이 없으면 "대기" */}
          <span className="brp-tts-progress" aria-live="polite">
            {ttsVerseN != null
              ? `${ttsVerseN}절`
              : ttsSupported
                ? "대기"
                : "미지원"}
          </span>
          {/* 설정 — 목소리 / 음 높낮이 / 음량. 기어 버튼 토글로 팝오버를 띄운다. */}
          <button
            type="button"
            className={`brp-tts-btn brp-tts-settings-btn ${
              ttsSettingsOpen ? "is-open" : ""
            }`}
            onClick={() => setTtsSettingsOpen((o) => !o)}
            disabled={!ttsSupported}
            aria-label="음성 설정"
            aria-expanded={ttsSettingsOpen}
            title="목소리 / 음 높낮이 / 음량"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path
                d="M8 5.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6zm5.4 3.7-1.4-.32a4.2 4.2 0 0 0-.38-.92l.78-1.22a.4.4 0 0 0-.05-.5l-.78-.78a.4.4 0 0 0-.5-.05L9.84 5.9a4.2 4.2 0 0 0-.92-.38l-.32-1.4a.4.4 0 0 0-.4-.32h-1.1a.4.4 0 0 0-.4.32l-.32 1.4a4.2 4.2 0 0 0-.92.38l-1.22-.78a.4.4 0 0 0-.5.05l-.78.78a.4.4 0 0 0-.05.5l.78 1.22a4.2 4.2 0 0 0-.38.92l-1.4.32a.4.4 0 0 0-.32.4v1.1c0 .2.13.36.32.4l1.4.32c.1.32.22.63.38.92l-.78 1.22a.4.4 0 0 0 .05.5l.78.78c.13.13.34.16.5.05l1.22-.78c.29.16.6.28.92.38l.32 1.4c.04.19.2.32.4.32h1.1a.4.4 0 0 0 .4-.32l.32-1.4c.32-.1.63-.22.92-.38l1.22.78a.4.4 0 0 0 .5-.05l.78-.78a.4.4 0 0 0 .05-.5L12.62 9.84c.16-.29.28-.6.38-.92l1.4-.32a.4.4 0 0 0 .32-.4v-1.1a.4.4 0 0 0-.32-.4z"
                fill="currentColor"
              />
            </svg>
          </button>
          {ttsSettingsOpen && ttsSupported && (
            <div
              className="brp-tts-settings"
              role="dialog"
              aria-label="음성 설정"
            >
              {/* 목소리 선택 — 한국어 우선 optgroup. 음성이 없으면 disabled. */}
              <label className="brp-tts-field">
                <span className="brp-tts-field-row">
                  <span className="brp-tts-field-label">목소리</span>
                  <span className="brp-tts-field-hint">
                    {koreanVoices.length > 0
                      ? `한국어 ${koreanVoices.length}개`
                      : "한국어 음성 없음"}
                  </span>
                </span>
                <select
                  className="brp-tts-select"
                  value={ttsVoiceURI ?? ""}
                  onChange={(e) => changeTtsVoice(e.target.value || null)}
                  disabled={ttsVoices.length === 0}
                >
                  <option value="">기본 (브라우저 자동)</option>
                  {koreanVoices.length > 0 && (
                    <optgroup label="한국어">
                      {koreanVoices.map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {v.name}
                          {v.localService ? "" : " (네트워크)"}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {otherVoices.length > 0 && (
                    <optgroup label="기타 언어">
                      {otherVoices.map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {v.name} · {v.lang}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>
              {/* 음 높낮이 — 0.5 ~ 1.5, 0.1 단위 슬라이더 */}
              <label className="brp-tts-field">
                <span className="brp-tts-field-row">
                  <span className="brp-tts-field-label">음 높낮이</span>
                  <span className="brp-tts-field-value">
                    {ttsPitch.toFixed(1)}
                  </span>
                </span>
                <input
                  className="brp-tts-range"
                  type="range"
                  min={0.5}
                  max={1.5}
                  step={0.1}
                  value={ttsPitch}
                  onChange={(e) => changeTtsPitch(parseFloat(e.target.value))}
                  aria-label="음 높낮이"
                />
                <span className="brp-tts-range-scale">
                  <span>낮음</span>
                  <span>기본</span>
                  <span>높음</span>
                </span>
              </label>
              {/* 음량 — 0 ~ 1, 0.1 단위 */}
              <label className="brp-tts-field">
                <span className="brp-tts-field-row">
                  <span className="brp-tts-field-label">음량</span>
                  <span className="brp-tts-field-value">
                    {Math.round(ttsVolume * 100)}%
                  </span>
                </span>
                <input
                  className="brp-tts-range"
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={ttsVolume}
                  onChange={(e) => changeTtsVolume(parseFloat(e.target.value))}
                  aria-label="음량"
                />
              </label>
            </div>
          )}
        </div>
      )}

      {/* 하단 고정 컨트롤 — 마이크/스크롤 상태, 카운터, "다 읽었어요" 버튼.
          모두 책+장이 정해진 뒤에만 의미 있는 액션이라 책 미선택 시 통째로 숨김. */}
      {bookConfirmed && (
      <div className="brp-dock" role="region" aria-label="읽기 컨트롤">
        {readingMode === "mic" ? (
          <button
            type="button"
            className={`brp-mic ${listening ? "is-listening" : ""}`}
            onClick={() => (listening ? stopListening() : startListening())}
            disabled={!hasFilledText || !speechSupported}
          >
            <span />
            {listening ? "듣는 중지" : "마이크 시작"}
          </button>
        ) : (
          <span
            className={`brp-scroll-status ${scrollReady ? "is-ready" : ""}`}
            aria-live="polite"
            title={`이 장 최소 ${chapterMinSeconds}초`}
          >
            {scrollReady
              ? "다 읽었어요를 눌러주세요"
              : !scrollReachedBottom
              ? `본문 끝까지 (≥${chapterMinSeconds}초)`
              : `${scrollSecondsLeft}초만 더 천천히`}
          </span>
        )}
        <span className="brp-count">
          {readVerseCount} / {totalVerses || 0} 절
        </span>
        <button
          type="button"
          className="brp-reset"
          onClick={resetChapter}
          disabled={!hasFilledText || readVerseCount === 0}
          aria-label="이 장 처음부터 다시"
        >
          처음부터 다시
        </button>
        <button
          type="button"
          className={`brp-manual ${
            (
              readingMode === "mic"
                ? readVerseCount < Math.max(1, Math.floor(totalVerses * 0.8))
                : !scrollReady
            )
              ? "is-pending"
              : ""
          }`}
          onClick={handleManualFinish}
          disabled={!hasFilledText}
          aria-disabled={
            readingMode === "mic"
              ? readVerseCount < Math.max(1, Math.floor(totalVerses * 0.8))
              : !scrollReady
          }
        >
          다 읽었어요
        </button>
      </div>
      )}

      {/* 선택 모드 액션 바 — 본문 절을 길게 눌러 진입한 selectionMode 동안만 표시.
          dock(마이크/리셋/다읽었어요) 위에 떠 있고, 디자인 토큰만 사용한다:
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

      {(() => {
        const showPrayer = prayerListeningNo !== null || (prayerSpeechMessage && !speechMessage);
        const msg = showPrayer ? prayerSpeechMessage : speechMessage;
        if (!msg) return null;
        return <p className="brp-speech-message">{msg}</p>;
      })()}

      {completeVisible && (
        <div className="brp-complete" role="dialog" aria-modal="true">
          <div>
            <p>완료</p>
            <h2>{chapterNumber}장을 다 읽었어요</h2>
            <button
              type="button"
              onClick={() => {
                setCompleteVisible(false);
                if (chapterNumber < bookMeta.totalChapters) {
                  moveChapter(chapterNumber + 1);
                }
              }}
            >
              {chapterNumber < bookMeta.totalChapters ? "다음 장으로 →" : "닫기"}
            </button>
          </div>
        </div>
      )}

      {quizOpen && quizQuestions.length > 0 && (
        <div className="brp-quiz" role="dialog" aria-modal="true">
          <div className="brp-quiz-card">
            <p className="brp-quiz-eyebrow">읽기 확인</p>
            <h2>{bookMeta.name} {chapterNumber}장 짧은 퀴즈</h2>
            <p className="brp-quiz-sub">
              두 문제 모두 맞히면 완료로 처리해요. 본문을 다시 보고 와도 괜찮아요.
            </p>

            <ol className="brp-quiz-list">
              {quizQuestions.map((q, idx) => {
                const selected = quizAnswers[idx];
                return (
                  <li key={`${q.verseNum}-${idx}`} className="brp-quiz-item">
                    <p className="brp-quiz-prompt">
                      <strong>{q.verseNum}절</strong> 빈칸에 들어갈 단어는?
                    </p>
                    <p className="brp-quiz-blanked">"{q.blanked}"</p>
                    <div className="brp-quiz-options">
                      {q.options.map((opt) => {
                        const isSelected = selected === opt;
                        const isCorrect = q.correct === opt;
                        const showCorrect = quizSubmitted && isCorrect;
                        const showWrong =
                          quizSubmitted && isSelected && !isCorrect;
                        return (
                          <button
                            key={opt}
                            type="button"
                            className={`brp-quiz-opt ${
                              isSelected ? "is-selected" : ""
                            } ${showCorrect ? "is-correct" : ""} ${
                              showWrong ? "is-wrong" : ""
                            }`}
                            disabled={quizSubmitted}
                            onClick={() => handleQuizAnswer(idx, opt)}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ol>

            {quizSubmitted && (
              <p
                className={`brp-quiz-result ${
                  quizAllCorrect ? "is-pass" : "is-fail"
                }`}
              >
                {quizAllCorrect
                  ? "잘했어요! 이 장을 완료로 처리할게요."
                  : "조금 더 읽고 다시 도전해 주세요."}
              </p>
            )}

            <div className="brp-quiz-actions">
              <button
                type="button"
                className="brp-quiz-cancel"
                onClick={handleQuizClose}
              >
                나중에
              </button>
              {!quizSubmitted ? (
                <button
                  type="button"
                  className="brp-quiz-submit"
                  disabled={quizAnswers.some((a) => !a)}
                  onClick={handleQuizSubmit}
                >
                  제출하기
                </button>
              ) : quizAllCorrect ? (
                <button
                  type="button"
                  className="brp-quiz-submit"
                  onClick={handleQuizClose}
                >
                  닫기
                </button>
              ) : (
                <button
                  type="button"
                  className="brp-quiz-submit"
                  onClick={handleQuizRetry}
                >
                  다시 풀기
                </button>
              )}
            </div>
          </div>
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
