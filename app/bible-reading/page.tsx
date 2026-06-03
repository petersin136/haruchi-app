"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import prayersJson from "./prayers.json";
import {
  BOOKS,
  NT_BOOK_IDS,
  OT_BOOK_IDS,
  type BookId,
} from "./books";
import { BOOK_DATA } from "./bibleData";
import StudentIdentityBar, {
  type StudentIdentityBarHandle,
} from "./components/StudentIdentityBar";
import Dropdown, { type DropdownOption } from "./components/Dropdown";
import {
  fetchCompletedChapters,
  flushPendingLogs,
  recordChapterCompletion,
  type IdentifiedStudent,
} from "../lib/bibleReadingProgress";
import Wordmark from "../components/Wordmark";
import { useSettings } from "../components/SettingsProvider";
import { SCROLL_SPEED_MULTIPLIER } from "../lib/userSettings";
import SearchOverlay, { type SearchSelection } from "./SearchOverlay";

// 화면 토글에 노출되는 번역본 키.
//   - krv:   개역한글
//   - kids:  어린이
//   - greek: "원어 묵상" 모드. KRV 본문을 화면에서 숨기고, 원어 의역(greekKr)
//           을 본문 자리에 두며, 그 아래에 헬라어 단어 토큰(greekTokens) 을
//           헬라어/한글 발음의 ruby 형태로 표시한다. 발음에 점선 밑줄이 있는
//           단어를 클릭하면 그 단어의 상세 정보 드롭다운이 펼쳐지고, 헬라어
//           줄 오른쪽의 ▾ 갈매기를 누르면 절 전체 풀이(greekWords) 가 펼쳐진다.
//           현재 마태복음 1장만 새 디자인으로 채워져 있다.
type TranslationKey = "krv" | "kids" | "greek";

type PrayerGradeKey = "lower" | "upper";

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

type BibleData = {
  translations: Partial<Record<TranslationKey, { label: string; note?: string }>>;
  chapters: Chapter[];
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

// BOOK_DATA 는 bibleData.ts (단일 진입점) 에서 import.
// 같은 객체를 검색(bibleSearch.ts)과 공유해 본문이 번들에 중복되지 않게 한다.

const prayersData = prayersJson as PrayersData;

const doneKey = (bookId: BookId, chapter: number) =>
  `bible_done_${bookId}_${chapter}`;
const verseProgressKey = (bookId: BookId, chapter: number) =>
  `bible_verse_progress_${bookId}_${chapter}`;
const celebratedKey = (bookId: BookId, chapter: number) =>
  `bible_celebrated_${bookId}_${chapter}`;
const CURRENT_BOOK_KEY = "bible_current_book";
const currentChapterKey = (bookId: BookId) =>
  `bible_current_chapter_${bookId}`;
const MIGRATION_V1_KEY = "bible_migrated_v1";
const READING_MODE_KEY = "bible_reading_mode";
const TRANSLATION_KEY = "bible_translation";

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
const buildVerseTrigger = (verseText: string): string[] => {
  const all = verseText
    .split(/\s+/)
    .map(normalizeKorean)
    .filter(Boolean);
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
): number => {
  if (startIdx >= triggers.length) return startIdx;

  const spokenWords = transcript
    .split(/\s+/)
    .map(normalizeKorean)
    .filter(Boolean);

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
  const [bookId, setBookId] = useState<BookId>("proverbs");
  const [chapterNumber, setChapterNumber] = useState(1);
  const [translation, setTranslation] = useState<TranslationKey>("krv");
  const [readingMode, setReadingMode] = useState<ReadingMode>("mic");
  const [readVerseCount, setReadVerseCount] = useState(0);
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
  const [prayerGrade, setPrayerGrade] = useState<PrayerGradeKey>("lower");
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
  const [flashVerse, setFlashVerse] = useState<number | null>(null);
  const { settings } = useSettings();

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
  // 헤더는 80px 이상 스크롤되면 계속 숨김 (가독성 확보).
  // 미니바는 그 위에 추가 조건 — 본문(reader) 카드가 뷰포트 안에 보이는 동안만.
  // readerProgress: reader 카드 top 이 뷰포트 상단을 얼마나 지나갔는지 비율 (0~1).
  //   본문 안에서 좌→우 에너지바 채움의 width 로 쓰임.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onScroll = () => {
      const past = window.scrollY > 80;
      setScrolled(past);
      const reader = readerSectionRef.current;
      if (!reader) {
        setMiniVisible(false);
        setReaderProgress(0);
        return;
      }
      const rect = reader.getBoundingClientRect();
      // reader 카드 하단이 뷰포트 상단(=0)보다 위에 있으면 본문은 다 지나간 것.
      const readerStillInView = rect.bottom > 0;
      setMiniVisible(past && readerStillInView);
      // 본문 진행도 (0~1):
      //   0%  → reader 상단이 뷰포트 상단에 닿은 시점 (=막 읽기 시작).
      //   100% → reader 하단(=마지막 줄)이 뷰포트 하단에 닿은 시점.
      //   즉 "스크롤 가능한 본문 길이" 기준으로 계산해, 본문 마지막 줄이
      //   화면에 보이는 순간 정확히 100%. 그 이후 더 스크롤해도 1 로 고정.
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const scrollable = rect.height - vh;
      let ratio: number;
      if (scrollable <= 0) {
        // reader 가 뷰포트보다 짧음 → reader.top 이 0 이하로 내려오면 100%.
        ratio = rect.top <= 0 ? 1 : 0;
      } else {
        ratio = Math.max(0, Math.min(1, -rect.top / scrollable));
      }
      setReaderProgress(ratio);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const handleStudentChange = useCallback(
    (next: IdentifiedStudent | null) => {
      setCurrentStudent(next);
    },
    [],
  );

  const bookMeta = BOOKS[bookId];
  const data = BOOK_DATA[bookId];
  const chapter =
    data.chapters.find((item) => item.chapter === chapterNumber) ??
    data.chapters[0];
  const hasKrv = (chapter.verses.krv?.length ?? 0) > 0;
  const hasKids = (chapter.verses.kids?.length ?? 0) > 0;
  // "원어묵상" 모드는 본문 자리에 들어갈 의역(greekKr) 이 있어야 활성된다.
  // (헬라어 토큰/절 풀이만 있고 의역이 없으면 화면이 비어 보이므로 비활성)
  const hasGreekKr = (chapter.verses.greekKr?.length ?? 0) > 0;
  const hasGreekTokens = (chapter.verses.greekTokens?.length ?? 0) > 0;
  const hasGreekWords = (chapter.verses.greekWords?.length ?? 0) > 0;
  const hasGreek = hasGreekKr;
  // 사용자가 선택한 번역이 현재 책/장에 없으면 다른 번역으로 자동 폴백.
  //   - 신규 61권은 어린이 번역이 없음 → 어린이 선택 시 개역한글로 표시.
  //   - 원어묵상(greek) 자료가 없는 책/장이면 → 개역한글로 폴백.
  //   - 기존 5권은 krv/kids 양쪽 모두 있어 영향 없음.
  const effectiveTranslation: TranslationKey =
    translation === "greek" && !hasGreek
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
  const verses =
    effectiveTranslation === "greek"
      ? chapter.verses.greekKr ?? []
      : chapter.verses[effectiveTranslation] ?? [];
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

  const totalVerses = verses.length;
  const progress = totalVerses > 0
    ? Math.min(100, (readVerseCount / totalVerses) * 100)
    : 0;
  const hasFilledText = totalVerses > 0;

  const stopListening = useCallback(() => {
    listeningRef.current = false;
    setListening(false);
    recognitionRef.current?.abort();
  }, []);

  const finalizeChapter = useCallback(() => {
    stopListening();
    setReadVerseCount(totalVerses);
    readVerseCountRef.current = totalVerses;
    window.localStorage.setItem(doneKey(bookId, chapterNumber), "true");
    window.localStorage.setItem(
      verseProgressKey(bookId, chapterNumber),
      String(totalVerses),
    );
    setDoneChapters((prev) => new Set(prev).add(chapterNumber));

    const student = currentStudentRef.current;
    if (student) {
      void (async () => {
        // br_complete_chapter RPC 는 PIN 이 필요. 보관 PIN 이 없거나(만료/탭 새로 열림)
        // 서버에서 PIN 불일치(bad_pin)가 떨어지면 학생 식별 모달을 다시 띄워 PIN 을 재요청.
        const result = await recordChapterCompletion({
          student,
          book: bookId,
          chapter: chapterNumber,
          // Supabase RPC 는 현재 krv/kids 만 허용. 헬라어로 읽었더라도
          // 진도 기록상으로는 krv 로 남긴다(스키마 확장 전 임시).
          translation:
            effectiveTranslation === "greek" ? "krv" : effectiveTranslation,
        });
        if (result === "needs_pin" || result === "bad_pin") {
          identityRef.current?.promptPin();
        }
      })();
    }

    const alreadyCelebrated =
      window.localStorage.getItem(celebratedKey(bookId, chapterNumber)) === "true";
    if (!alreadyCelebrated) {
      window.localStorage.setItem(celebratedKey(bookId, chapterNumber), "true");
      setCompleteVisible(true);
    }
  }, [bookId, chapterNumber, effectiveTranslation, stopListening, totalVerses]);

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
    window.localStorage.removeItem(doneKey(bookId, chapterNumber));
    window.localStorage.removeItem(verseProgressKey(bookId, chapterNumber));
    setDoneChapters((prev) => {
      if (!prev.has(chapterNumber)) return prev;
      const next = new Set(prev);
      next.delete(chapterNumber);
      return next;
    });
  }, [bookId, chapterNumber, stopListening]);

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
    () => verses.map((v) => buildVerseTrigger(v.t)),
    [verses],
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
      );
      if (newVerseIdx <= startVerseIdx) return;

      readVerseCountRef.current = newVerseIdx;
      setReadVerseCount(newVerseIdx);
      window.localStorage.setItem(
        verseProgressKey(bookId, chapterNumber),
        String(newVerseIdx),
      );
    },
    [bookId, chapterNumber, hasFilledText, verseTriggers],
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
      setChapterNumber(chapter);
      setCompleteVisible(false);
      setQuizOpen(false);
      setQuizSubmitted(false);
      setQuizAnswers([]);
      setQuizQuestions([]);
      setFlashVerse(verseNo);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(TRANSLATION_KEY, nextTr);
        window.localStorage.setItem(CURRENT_BOOK_KEY, nextBook);
        window.localStorage.setItem(
          currentChapterKey(nextBook),
          String(chapter),
        );
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
    recognition.lang = "ko-KR";
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
  }, [hasFilledText, processTranscript, totalVerses]);

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

  const changeBook = useCallback(
    (nextBookId: BookId) => {
      if (nextBookId === bookId) return;
      stopListening();
      setCompleteVisible(false);
      setQuizOpen(false);
      setQuizSubmitted(false);
      setQuizAnswers([]);
      setQuizQuestions([]);
      setBookId(nextBookId);
      const savedChapter = window.localStorage.getItem(
        currentChapterKey(nextBookId),
      );
      const next = savedChapter ? Number(savedChapter) : 1;
      const meta = BOOKS[nextBookId];
      const safeChapter =
        Number.isFinite(next) && next >= 1 && next <= meta.totalChapters
          ? next
          : 1;
      setChapterNumber(safeChapter);
      window.localStorage.setItem(CURRENT_BOOK_KEY, nextBookId);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [bookId, stopListening],
  );

  useEffect(() => {
    migrateLegacyKeys();

    const savedBook = window.localStorage.getItem(CURRENT_BOOK_KEY);
    if (
      savedBook === "proverbs" ||
      savedBook === "matthew" ||
      savedBook === "mark" ||
      savedBook === "luke" ||
      savedBook === "john"
    ) {
      setBookId(savedBook);
      const savedChapter = window.localStorage.getItem(
        currentChapterKey(savedBook),
      );
      const meta = BOOKS[savedBook];
      const next = savedChapter ? Number(savedChapter) : 1;
      if (Number.isFinite(next) && next >= 1 && next <= meta.totalChapters) {
        setChapterNumber(next);
      }
    }

    const savedMode = window.localStorage.getItem(READING_MODE_KEY);
    if (savedMode === "mic" || savedMode === "scroll") {
      setReadingMode(savedMode);
    }

    const savedTranslation = window.localStorage.getItem(TRANSLATION_KEY);
    if (
      savedTranslation === "krv" ||
      savedTranslation === "kids" ||
      savedTranslation === "greek"
    ) {
      setTranslation(savedTranslation);
    }

    // 클라이언트에서 실제 Web Speech API 지원 여부를 확정한다.
    setSpeechSupported(getSpeechRecognition() !== null);
  }, []);

  useEffect(() => {
    const done = new Set<number>();
    data.chapters.forEach((item) => {
      if (
        window.localStorage.getItem(doneKey(bookId, item.chapter)) === "true"
      ) {
        done.add(item.chapter);
      }
    });
    setDoneChapters(done);

    if (!currentStudent) return;
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
  }, [bookId, currentStudent, data]);

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
    const savedDone =
      window.localStorage.getItem(doneKey(bookId, chapterNumber)) === "true";
    const savedProgress = Number(
      window.localStorage.getItem(verseProgressKey(bookId, chapterNumber)) ??
        "0",
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
    const verseCount = verses.length;
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
    verses,
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
    if (savedGrade === "lower" || savedGrade === "upper") {
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
  // - PC/태블릿 가로(≥960) 에서만 적용 (모바일은 display: contents 라 무효).
  // - 사이드바 높이가 viewport 보다 작으면: 일반 sticky (top: 80px).
  // - 사이드바 높이가 viewport 보다 크면: top 을 음수로 설정해 element 가
  //   viewport 위로 빠지면서 바닥(prayer 카드 끝)이 viewport 안에 들어오게.
  //   → 본문(reader) 스크롤하는 동안 사이드바는 viewport 에 고정된 채로
  //     함께 움직이며, reader 가 끝까지 스크롤되면 그 시점에 사이드바
  //     바닥도 자연스럽게 페이지 바닥과 맞아 떨어짐.
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
      } ${scrolled && !miniVisible ? "is-past-reader" : ""}`}
    >
      <header className={`brp-header ${scrolled ? "is-hidden" : ""}`}>
        <a className="brp-brand" href="/" aria-label="하루치 홈으로">
          <Wordmark size="lg" />
        </a>
        {/* 데스크탑/태블릿 (≥640px) — 풀 네비. 톱니바퀴 + 텍스트 링크들이 한 줄. */}
        <nav className="brp-nav brp-nav--desktop" aria-label="Account links">
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
          {!currentStudent ? (
            <button
              type="button"
              className="brp-nav-link brp-nav-text-link"
              onClick={() => identityRef.current?.promptIdentify()}
            >
              Login
            </button>
          ) : null}
          <a className="brp-nav-link brp-nav-text-link" href="/signup">
            Join us
          </a>
          <a className="brp-nav-link brp-nav-text-link" href="/login">
            Admin
          </a>
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
                <span>Login</span>
              </button>
            ) : null}
            <a
              className="brp-mobile-menu-item"
              href="/signup"
              onClick={() => setNavMenuOpen(false)}
            >
              <span className="brp-mobile-menu-icon" aria-hidden="true">
                <span className="brp-mobile-menu-bullet" />
              </span>
              <span>Join us</span>
            </a>
            <a
              className="brp-mobile-menu-item"
              href="/login"
              onClick={() => setNavMenuOpen(false)}
            >
              <span className="brp-mobile-menu-icon" aria-hidden="true">
                <span className="brp-mobile-menu-bullet" />
              </span>
              <span>Admin</span>
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
        defaultTranslation={effectiveTranslation === "greek" ? "krv" : effectiveTranslation}
        onClose={() => setSearchOpen(false)}
        onSelect={goToSearchResult}
      />

      {/* 스크롤 시 헤더 대신 떠 있는 반투명 미니바 — 책·장·소제목 + 본문 진행도.
          본문(reader) 카드가 뷰포트에 보이는 동안만 표시.
          내부 .brp-mini-fill 이 왼쪽→오른쪽 에너지바처럼 채워짐. */}
      <div
        className={`brp-mini-bar ${miniVisible ? "is-visible" : ""}`}
        aria-hidden={!miniVisible}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(readerProgress * 100)}
      >
        <span
          className="brp-mini-fill"
          aria-hidden="true"
          style={{ width: `${readerProgress * 100}%` }}
        />
        <span className="brp-mini-content">
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
      </div>

      <StudentIdentityBar ref={identityRef} onChange={handleStudentChange} />

      {/* 메인 캔버스 — 모바일/태블릿 세로: flex column + CSS order 로 기존 순서 유지.
          태블릿 가로/PC(≥960px): grid 2-col 로 좌측(hero+reader), 우측(.brp-side
          sticky 컨테이너 안에 chrome + progress + prayer) 배치.
          우측 컨테이너가 sticky 라서 본문 스크롤해도 컨트롤 카드들이 함께 따라옴. */}
      <div className="brp-canvas">

      <section className="brp-hero">
        <h1>{bookMeta.name}</h1>
      </section>

      {/* 우측 컬럼 wrapper — 모바일에선 display: contents 로 layout 영향 0,
          자식들은 캔버스 직속 flex item 처럼 동작 + CSS order 로 기존 순서 유지.
          PC(≥960) 에선 sticky 컨테이너로 변신, 본문(reader) 스크롤해도 컨트롤·
          진도·기도 카드가 함께 따라옴. sticky top 은 JS 가 사이드바 높이를
          측정해 동적으로 결정(useEffect 참조). */}
      <aside ref={sideRef} className="brp-side" aria-label="읽기 컨트롤 및 진도">

      {/* Row 1: [번역 토글] + [읽기 모드 토글] — 한 줄, 1:1 분할.
          왼쪽: 개역한글 / 어린이 / 원어묵상. 오른쪽: 낭독 / 묵독.
          두 컨트롤 모두 같은 pill 톤 + 슬라이딩 인디케이터로 시각 톤 통일. */}
      <section className="brp-top-row" aria-label="번역과 읽기 모드 선택">
        {(() => {
          // 슬라이딩 인디케이터: 활성 버튼의 인덱스/개수를 CSS 변수로 넘겨
          // 인디케이터(.brp-toggle-indicator) 위치/폭을 계산하도록 한다.
          // 이렇게 하면 두 버튼이 동시에 배경을 cross-fade 하지 않고,
          // 하나의 pill 이 좌↔우로 매끄럽게 슬라이드한다 (사각 프레임 아티팩트 제거).
          const translationKeys = Object.keys(
            data.translations,
          ) as TranslationKey[];
          const activeIdx = Math.max(
            0,
            translationKeys.indexOf(effectiveTranslation),
          );
          return (
            <div
              className="brp-translation brp-translation--sm brp-toggle"
              style={{
                ["--brp-toggle-count" as string]: translationKeys.length,
                ["--brp-toggle-active" as string]: activeIdx,
              } as React.CSSProperties}
            >
              <span className="brp-toggle-indicator" aria-hidden="true" />
              {translationKeys.map((key) => {
                const isKrvDisabled = key === "krv" && !hasKrv;
                const isKidsDisabled = key === "kids" && !hasKids;
                const isGreekDisabled = key === "greek" && !hasGreek;
                const isDisabled =
                  isKrvDisabled || isKidsDisabled || isGreekDisabled;
                const disabledTitle = isKrvDisabled
                  ? "이 책의 개역한글 본문은 아직 준비되지 않았어요."
                  : isKidsDisabled
                    ? "이 책의 어린이 번역은 준비 중입니다."
                    : isGreekDisabled
                      ? "이 장의 원어 묵상 자료는 아직 준비되지 않았어요."
                      : undefined;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`${
                      effectiveTranslation === key ? "is-active" : ""
                    } ${isDisabled ? "is-disabled" : ""}`}
                    disabled={isDisabled}
                    title={disabledTitle}
                    onClick={() => handleTranslationChange(key)}
                  >
                    {data.translations[key]?.label ?? key}
                  </button>
                );
              })}
            </div>
          );
        })()}

        <div
          className="brp-mode-tabs brp-mode-tabs--sm brp-toggle"
          role="tablist"
          aria-label="읽기 모드 선택"
          style={{
            ["--brp-toggle-count" as string]: 2,
            ["--brp-toggle-active" as string]: readingMode === "scroll" ? 1 : 0,
          } as React.CSSProperties}
        >
          <span className="brp-toggle-indicator" aria-hidden="true" />
          <button
            type="button"
            role="tab"
            aria-selected={readingMode === "mic"}
            className={`brp-mode-tab ${readingMode === "mic" ? "is-active" : ""}`}
            onClick={() => handleReadingModeChange("mic")}
          >
            낭독
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={readingMode === "scroll"}
            className={`brp-mode-tab ${readingMode === "scroll" ? "is-active" : ""}`}
            onClick={() => handleReadingModeChange("scroll")}
          >
            묵독
          </button>
        </div>
      </section>

      {/* Row 2: [구약 책 드롭다운] + [신약 책 드롭다운] — 한 줄, 1:1 분할.
          현재 선택된 책이 속하지 않은 쪽 드롭다운은 "구약" / "신약" placeholder 로
          표시되며(옅은 톤), 옵션을 고르는 즉시 changeBook 으로 전환된다. */}
      <section className="brp-top-row" aria-label="성경 책 선택 (구약 / 신약)">
        <Dropdown<BookId>
          value={bookId}
          options={OT_BOOK_IDS.map<DropdownOption<BookId>>((id) => ({
            value: id,
            label: BOOKS[id].name,
          }))}
          onChange={(next) => changeBook(next)}
          ariaLabel="구약 책 선택"
          placeholderLabel="구약"
          align="center"
          size="md"
        />
        <Dropdown<BookId>
          value={bookId}
          options={NT_BOOK_IDS.map<DropdownOption<BookId>>((id) => ({
            value: id,
            label: BOOKS[id].name,
          }))}
          onChange={(next) => changeBook(next)}
          ariaLabel="신약 책 선택"
          placeholderLabel="신약"
          align="center"
          size="md"
        />
      </section>

      {/* Row 3: 장 스위처 */}
      <section className="brp-toolbar" aria-label="장 선택">
        <div className="brp-chapter-switcher">
          <button type="button" onClick={() => moveChapter(chapterNumber - 1)} aria-label="이전 장">
            ←
          </button>
          <div className="brp-chapter-select-wrap">
            <Dropdown<number>
              value={chapterNumber}
              options={data.chapters.map<DropdownOption<number>>((item) => ({
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
          {data.chapters.map((item) => (
            <button
              key={item.chapter}
              type="button"
              className={`${item.chapter === chapterNumber ? "is-current" : ""} ${
                doneChapters.has(item.chapter) ? "is-done" : ""
              }`}
              onClick={() => moveChapter(item.chapter)}
              aria-label={`${bookMeta.name} ${item.chapter}장으로 이동`}
            >
              {item.chapter}
            </button>
          ))}
        </div>
      </section>

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

          <div
            className="brp-prayer-toggle brp-toggle"
            role="tablist"
            aria-label="학년 선택"
            style={{
              ["--brp-toggle-count" as string]: 2,
              ["--brp-toggle-active" as string]: prayerGrade === "upper" ? 1 : 0,
            } as React.CSSProperties}
          >
            <span className="brp-toggle-indicator" aria-hidden="true" />
            <button
              type="button"
              role="tab"
              aria-selected={prayerGrade === "lower"}
              className={prayerGrade === "lower" ? "is-active" : ""}
              onClick={() => handlePrayerGradeChange("lower")}
            >
              저학년
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={prayerGrade === "upper"}
              className={prayerGrade === "upper" ? "is-active" : ""}
              onClick={() => handlePrayerGradeChange("upper")}
            >
              고학년
            </button>
          </div>
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

      </aside>{/* /.brp-side */}

      {/* 본문(reader) — source 상 우측 sidebar(.brp-side) 뒤에 위치.
          모바일: CSS order 로 toolbar 와 progress 사이(시각 순서 5)에 표시.
          PC: grid-area: reader 로 좌측 컬럼 차지. */}
      <section
        ref={readerSectionRef}
        className="brp-reader"
        aria-label={`${bookMeta.name} ${chapterNumber}장 본문`}
      >
        {!hasFilledText && (
          <p className="brp-reader-empty">
            이 장의{" "}
            {translation === "krv"
              ? "개역한글"
              : translation === "kids"
                ? "어린이 쉬운"
                : "원어 묵상"}{" "}
            본문이 아직 준비되지 않았어요. 다른 번역을 선택해 보세요.
          </p>
        )}
        {verses.map((verse, idx) => {
          // 스크롤 모드는 "스크롤 + 최소 시간 + 퀴즈"가 모두 끝나
          // 장 자체가 완료(readVerseCount === totalVerses)됐을 때만
          // 절 색을 바꾼다. 그 외에는 절별 진행 색을 절대 표시하지 않는다.
          //
          // 음성(verse-mic) 모드는 새 트리거 매칭으로 동작 — 절을 통째로
          // 한 번에 "읽음" 처리한다. "지금 기다리는 다음 절" 을 미리 회색으로
          // 깔아 보여주는 is-current 표시는 사용자가 아직 현재 절을 다 읽기도
          // 전에 다음 절이 강조되어 보여 혼란을 주므로 의도적으로 제거.
          const chapterFullyRead =
            totalVerses > 0 && readVerseCount >= totalVerses;
          const isRead =
            readingMode === "scroll"
              ? chapterFullyRead
              : idx < readVerseCount;
          const isSelected = selectedVerses.has(verse.n);
          return (
            <div
              key={`${bookId}-${chapterNumber}-${effectiveTranslation}-${verse.n}`}
              data-verse-num={verse.n}
              className={`brp-verse ${isRead ? "is-read" : ""} ${
                selectionMode ? "is-selecting" : ""
              } ${isSelected ? "is-selected" : ""} ${
                flashVerse === verse.n ? "is-flash" : ""
              }`}
              onPointerDown={(e) => handleVersePointerDown(verse.n, e)}
              onPointerMove={handleVersePointerMove}
              onPointerUp={cancelLongPress}
              onPointerCancel={cancelLongPress}
              onPointerLeave={cancelLongPress}
              onClick={() => handleVerseClick(verse.n)}
              role={selectionMode ? "button" : undefined}
              aria-pressed={selectionMode ? isSelected : undefined}
              aria-label={
                selectionMode
                  ? `${verse.n}절 ${isSelected ? "선택 해제" : "선택"}`
                  : undefined
              }
            >
              <span className="brp-verse-number">{verse.n}</span>
              <p className="brp-verse-text">{verse.t}</p>
              {/* 원어묵상 모드 — 본문(verse.t) 자체가 이미 "원어 의역" 이다.
                  그 아래에 헬라어 단어 토큰을 ruby 형태로(헬라어/한글 발음)
                  렌더링하고, 오른쪽에 ▾ 갈매기로 절 전체 풀이를 펼친다.
                  pointer 이벤트는 절 카드의 long-press 선택과 충돌하지
                  않도록 모두 stopPropagation 한다. */}
              {effectiveTranslation === "greek" &&
                greekTokensMap &&
                greekTokensMap.has(verse.n) &&
                (() => {
                  const tokens = greekTokensMap.get(verse.n)!;
                  const isDrawerOpen = openWordDrawers.has(verse.n);
                  const hasDrawer =
                    greekWordsMap?.has(verse.n) ?? false;
                  return (
                    <div className="brp-greek-block">
                      <div className="brp-greek-line">
                        <div className="brp-greek-tokens">
                          {tokens.map((tk, i) => {
                            const tokenKey = `${verse.n}:${i}`;
                            const isInfoOpen = openTokenInfos.has(tokenKey);
                            const hasInfo = !!tk.info;
                            return (
                              <span
                                key={tokenKey}
                                className="brp-greek-token"
                              >
                                <span className="brp-greek-token-word">
                                  {tk.w}
                                </span>
                                {tk.p && (
                                  hasInfo ? (
                                    <button
                                      type="button"
                                      className={`brp-greek-token-pron is-clickable ${
                                        isInfoOpen ? "is-open" : ""
                                      }`}
                                      aria-expanded={isInfoOpen}
                                      aria-label={`${tk.w} (${tk.p}) 정보 ${
                                        isInfoOpen ? "닫기" : "보기"
                                      }`}
                                      onPointerDown={(e) =>
                                        e.stopPropagation()
                                      }
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenTokenInfos((prev) => {
                                          const next = new Set(prev);
                                          if (next.has(tokenKey))
                                            next.delete(tokenKey);
                                          else next.add(tokenKey);
                                          return next;
                                        });
                                      }}
                                    >
                                      {tk.p}
                                    </button>
                                  ) : (
                                    <span className="brp-greek-token-pron">
                                      {tk.p}
                                    </span>
                                  )
                                )}
                                {hasInfo && isInfoOpen && (
                                  <span
                                    className="brp-greek-token-info"
                                    role="region"
                                    aria-label={`${tk.w} 단어 풀이`}
                                  >
                                    <span className="brp-greek-token-info-head">
                                      <span className="brp-greek-token-info-w">
                                        {tk.w}
                                      </span>
                                      <span className="brp-greek-token-info-p">
                                        {tk.p}
                                      </span>
                                    </span>
                                    <span className="brp-greek-token-info-body">
                                      {tk.info}
                                    </span>
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                        {hasDrawer && (
                          <button
                            type="button"
                            className={`brp-greek-drawer-toggle ${
                              isDrawerOpen ? "is-open" : ""
                            }`}
                            aria-expanded={isDrawerOpen}
                            aria-label={`${verse.n}절 원어 풀이 ${
                              isDrawerOpen ? "닫기" : "열기"
                            }`}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenWordDrawers((prev) => {
                                const next = new Set(prev);
                                if (next.has(verse.n))
                                  next.delete(verse.n);
                                else next.add(verse.n);
                                return next;
                              });
                            }}
                          >
                            <span
                              className="brp-greek-drawer-chevron"
                              aria-hidden="true"
                            >
                              ▾
                            </span>
                          </button>
                        )}
                      </div>
                      {hasDrawer && isDrawerOpen && (
                        <p className="brp-verse-greek-words">
                          {greekWordsMap!.get(verse.n)}
                        </p>
                      )}
                    </div>
                  );
                })()}
            </div>
          );
        })}
      </section>

      </div>{/* /.brp-canvas */}

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

      <style jsx>{`
        .brp-page {
          min-height: 100vh;
          background: var(--bg);
          color: var(--ink);
          font-family: var(--font-noto-sans-kr), -apple-system, BlinkMacSystemFont,
            "Segoe UI", system-ui, sans-serif;
          padding: 88px clamp(16px, 4vw, 40px) 96px;
        }

        .brp-header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 20;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 12px clamp(18px, 5vw, 72px);
          background: var(--bg-translucent);
          backdrop-filter: saturate(180%) blur(20px);
          -webkit-backdrop-filter: saturate(180%) blur(20px);
          border-bottom: 1px solid var(--line);
          min-height: 60px;
          box-sizing: border-box;
          transform: translateY(0);
          opacity: 1;
          transition: transform 0.28s ease, opacity 0.28s ease;
        }
        .brp-header.is-hidden {
          transform: translateY(-100%);
          opacity: 0;
          pointer-events: none;
        }

        /* 미니바 — 스크롤 시 헤더 대신 떠 있는 반투명 한 줄. 책·장·소제목만.
           베이스는 완전 투명, 그 위에 옐로우 틴트 레이어만 살짝.
           backdrop-filter 없음 → 뒤 내용이 그대로 비치고 색만 옅게 입혀짐. */
        .brp-mini-bar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 19;
          min-height: 40px;
          background: rgba(0, 0, 0, 0.78);
          backdrop-filter: saturate(180%) blur(14px);
          -webkit-backdrop-filter: saturate(180%) blur(14px);
          border-bottom: 1px solid rgba(0, 0, 0, 0.6);
          font-size: 13px;
          color: #ffffff;
          letter-spacing: -0.005em;
          transform: translateY(-100%);
          opacity: 0;
          transition: transform 0.28s ease, opacity 0.28s ease;
          pointer-events: none;
          overflow: hidden;
        }
        .brp-mini-bar.is-visible {
          transform: translateY(0);
          opacity: 1;
          pointer-events: auto;
        }
        /* 좌→우로 채워지는 에너지바 — readerProgress(0~1) × 100% width.
           색은 사용자 테마의 accent 를 따른다. color-mix 로 알파만 입혀
           기존 그린 톤(0.55→0.85)과 동일한 명도 진행. */
        .brp-mini-fill {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 0;
          background: linear-gradient(
            90deg,
            color-mix(in srgb, var(--accent) 55%, transparent) 0%,
            color-mix(in srgb, var(--accent) 85%, transparent) 100%
          );
          transition: width 0.12s linear;
          pointer-events: none;
        }
        .brp-mini-content {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 0 16px;
          min-height: 40px;
        }
        .brp-mini-book {
          font-weight: 700;
          color: #ffffff;
        }
        .brp-mini-chapter {
          font-weight: 700;
          color: #ffffff;
        }
        .brp-mini-title {
          color: var(--accent-warm);
          font-weight: 600;
          max-width: 50vw;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .brp-mini-divider {
          color: rgba(255, 255, 255, 0.5);
        }

        .brp-brand {
          display: inline-flex;
          align-items: center;
          color: var(--ink);
          padding: 6px 10px;
          margin-left: -8px;
          border-radius: var(--radius-pill);
          transition: background 0.15s ease;
          text-decoration: none;
        }
        .brp-brand:hover {
          background: var(--surface-alt);
        }

        .brp-nav {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        .brp-nav-link {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          height: 32px;
          padding: 0 10px;
          border-radius: var(--radius-pill);
          font-size: 13px;
          font-weight: 500;
          line-height: 1;
          white-space: nowrap;
          letter-spacing: 0;
          text-decoration: none;
          font-family: inherit;
          background: transparent;
          border: 1px solid transparent;
          cursor: pointer;
          transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
        }

        .brp-nav-text {
          display: inline-block;
        }

        .brp-nav-arrow {
          display: inline-block;
          transition: transform 0.18s ease;
          font-weight: 500;
          opacity: 0.7;
        }

        .brp-nav-link:hover .brp-nav-arrow {
          transform: translateX(2px);
          opacity: 1;
        }

        /* 1차 CTA — outlined accent, hover 시 채워짐. */
        /* 헤더 어른용 진입은 1차 액션이 아님 → ghost. */
        .brp-nav-cta {
          color: var(--ink);
          background: transparent;
          border: 1px solid var(--line);
        }
        .brp-nav-cta:hover {
          background: var(--surface-alt);
          border-color: var(--line-strong);
        }

        /* 2차 — 차분한 텍스트 링크 */
        .brp-nav-text-link {
          color: var(--ink-soft);
          background: transparent;
          border: 1px solid transparent;
        }
        .brp-nav-text-link:hover {
          color: var(--ink);
          background: var(--surface-alt);
        }

        /* 설정 톱니바퀴 — 32x32 라운드 버튼. 텍스트 링크와 같은 라인에 정렬. */
        .brp-nav-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          padding: 0;
          border-radius: var(--radius-pill);
          background: transparent;
          border: 1px solid transparent;
          color: var(--ink-soft);
          cursor: pointer;
          font: inherit;
          flex-shrink: 0;
          transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease;
        }
        .brp-nav-icon:hover {
          background: var(--surface-alt);
          color: var(--ink);
        }
        .brp-nav-icon:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }

        /* ─────────────────────────────────────────────────────────────
           햄버거 버튼 + 모바일 메뉴
           - 기본은 숨김(데스크탑은 .brp-nav--desktop 가 보임).
           - <640px 에서만 햄버거 노출 + 데스크탑 nav 숨김.
           ────────────────────────────────────────────────────────────── */
        .brp-hamburger {
          display: none;
          position: relative;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          padding: 0;
          border-radius: var(--radius-pill);
          background: transparent;
          border: 1px solid transparent;
          color: var(--ink);
          cursor: pointer;
          font: inherit;
          flex-shrink: 0;
          transition: background 0.18s ease, border-color 0.18s ease;
        }
        .brp-hamburger:hover {
          background: var(--surface-alt);
        }
        .brp-hamburger:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
        .brp-hamburger > span {
          position: absolute;
          left: 9px;
          right: 9px;
          height: 2px;
          background: currentColor;
          border-radius: 2px;
          transition: transform 0.22s ease, opacity 0.18s ease, top 0.22s ease;
        }
        .brp-hamburger > span:nth-child(1) { top: 11px; }
        .brp-hamburger > span:nth-child(2) { top: 17px; }
        .brp-hamburger > span:nth-child(3) { top: 23px; }
        .brp-hamburger.is-open > span:nth-child(1) {
          top: 17px;
          transform: rotate(45deg);
        }
        .brp-hamburger.is-open > span:nth-child(2) {
          opacity: 0;
        }
        .brp-hamburger.is-open > span:nth-child(3) {
          top: 17px;
          transform: rotate(-45deg);
        }

        /* 모바일 메뉴 backdrop — 헤더 아래 전체 영역을 덮어 바깥클릭으로 닫힘.
           투명한 dim + 살짝 blur 만. 작은 시트가 헤더 우측 아래에서 떨어진다. */
        .brp-mobile-menu-backdrop {
          position: fixed;
          inset: 0;
          z-index: 25;
          background: rgba(22, 22, 26, 0.32);
          backdrop-filter: blur(2px);
          -webkit-backdrop-filter: blur(2px);
          animation: brp-mm-fade 0.16s ease;
        }
        @keyframes brp-mm-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .brp-mobile-menu {
          position: absolute;
          top: 64px;
          right: 16px;
          min-width: 200px;
          padding: 6px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-2);
          animation: brp-mm-pop 0.18s cubic-bezier(0.32, 0.72, 0.24, 1);
          transform-origin: top right;
        }
        @keyframes brp-mm-pop {
          from { transform: scale(0.96) translateY(-4px); opacity: 0; }
          to   { transform: scale(1) translateY(0); opacity: 1; }
        }
        .brp-mobile-menu-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 11px 12px;
          border-radius: var(--radius-sm);
          background: transparent;
          border: 0;
          color: var(--ink);
          font: inherit;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: -0.005em;
          text-align: left;
          text-decoration: none;
          cursor: pointer;
          width: 100%;
          transition: background 0.16s ease;
        }
        .brp-mobile-menu-item:hover {
          background: var(--surface-alt);
        }
        .brp-mobile-menu-item:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: -2px;
        }
        /* 아이콘 슬롯 — 톱니바퀴/불릿이 같은 폭(18px)에 가운데 정렬되도록.
           톱니바퀴 svg 가 flex 안에서 찌그러지지 않게 고정 폭 + flex-shrink:0. */
        .brp-mobile-menu-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          flex-shrink: 0;
          color: var(--ink-soft);
        }
        .brp-mobile-menu-icon :global(svg) {
          display: block;
          width: 17px;
          height: 17px;
          flex-shrink: 0;
        }
        .brp-mobile-menu-bullet {
          display: inline-block;
          width: 5px;
          height: 5px;
          border-radius: 999px;
          background: var(--ink-mute);
        }
        .brp-mobile-menu-divider {
          display: block;
          height: 1px;
          margin: 4px 8px;
          background: var(--line);
        }

        /* 모바일 우상단 액션 묶음(검색 + 햄버거). 데스크탑에선 숨김. */
        .brp-mobile-actions {
          display: none;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
        }
        /* 모바일 검색 버튼 — 햄버거와 같은 36x36 라운드 톤. */
        .brp-mobile-search {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          padding: 0;
          border-radius: var(--radius-pill);
          background: transparent;
          border: 1px solid transparent;
          color: var(--ink);
          cursor: pointer;
          font: inherit;
          flex-shrink: 0;
          transition: background 0.18s ease, border-color 0.18s ease;
        }
        .brp-mobile-search:hover {
          background: var(--surface-alt);
        }
        .brp-mobile-search:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }

        /* ≥640px: 데스크탑 nav 보임, 햄버거/모바일액션 숨김. */
        @media (min-width: 640px) {
          .brp-nav--desktop { display: inline-flex; }
          .brp-hamburger { display: none !important; }
          .brp-mobile-actions { display: none !important; }
          .brp-mobile-menu-backdrop { display: none; }
        }
        /* <640px: 데스크탑 nav 숨김, 모바일 액션(검색+햄버거) 보임. */
        @media (max-width: 639.98px) {
          .brp-nav--desktop { display: none; }
          .brp-mobile-actions { display: inline-flex; }
          .brp-hamburger { display: inline-flex; }
        }

        /* 상단 2px 진도 바(.brp-progress)는 제거됨 — 본문 진행도는 미니바
           내부 그린 fill(.brp-mini-fill)이 좌→우 에너지바로 표시. */

        .brp-hero {
          max-width: var(--container-reading);
          margin: 28px auto 24px;
          text-align: center;
        }

        .brp-section-label {
          margin: 0 0 14px;
          font-size: 12px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--ink-soft);
        }

        /* 책 이름 타이틀 — 편집(에디토리얼) 디스플레이 톤.
           시스템 세리프(애플=AppleSDGothicNeo→Serif, 윈도=맑은고딕→Times) 우선,
           세리프 fallback 까지 두어 OS 어디서나 부드러운 톤. */
        .brp-hero h1 {
          margin: 0;
          font-family: var(--font-noto-serif-kr), "Nanum Myeongjo",
            "Apple SD Gothic Neo", "Iowan Old Style", "Times New Roman", serif;
          font-size: clamp(28px, 5vw, 44px);
          font-weight: 500;
          letter-spacing: -0.025em;
          line-height: 1.15;
          color: var(--ink);
        }

        /* 장 스위처 단독 — 본문 폭 안에서 자연 가운데 정렬 */
        .brp-toolbar {
          max-width: var(--container-reading);
          margin: 0 auto 28px;
          display: flex;
          justify-content: center;
        }

        .brp-translation {
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-pill);
          padding: 5px;
          min-height: 52px;
          box-sizing: border-box;
        }

        /* 장 스위처 — 슬림 44px. 1장 좌측, 부제목 인라인. */
        .brp-chapter-switcher {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          width: 100%;
          max-width: var(--container-reading);
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-pill);
          padding: 4px;
          min-height: 44px;
          box-sizing: border-box;
        }

        /* 번역 토글: 컨테이너 flex/stretch + 버튼 자체도 flex 로 내부 텍스트 정확히 중앙. */
        .brp-translation {
          display: flex;
          align-items: stretch;
          gap: 6px;
        }

        .brp-translation button,
        .brp-chapter-switcher button,
        .brp-dock button,
        .brp-grid button,
        .brp-complete button {
          border: 0;
          cursor: pointer;
          font: inherit;
        }

        .brp-translation button {
          position: relative;
          z-index: 1;
          flex: 1 1 0;
          min-width: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 14px;
          border-radius: var(--radius-pill);
          background: transparent;
          color: var(--ink-soft);
          font-size: 14px;
          font-weight: 600;
          letter-spacing: -0.01em;
          line-height: 1;
          transition: color 0.22s ease;
        }

        .brp-translation button:hover:not(:disabled):not(.is-active) {
          color: var(--ink);
        }

        .brp-translation button.is-active {
          background: transparent;
          color: var(--accent-ink);
        }

        .brp-chapter-switcher button {
          width: 32px;
          height: 32px;
          flex-shrink: 0;
          border-radius: 50%;
          background: transparent;
          color: var(--ink-soft);
          border: 1px solid var(--line);
          font-size: 15px;
          transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease;
        }

        .brp-chapter-switcher button:hover {
          background: var(--surface-alt);
          color: var(--ink);
          border-color: var(--line-strong);
        }

        /* 장 스위처 내부 — Dropdown 컴포넌트를 감싸는 flex 래퍼.
           prev/next 버튼 사이 남은 공간을 채우고, Dropdown 트리거가 100% 폭으로
           가운데에 깔끔히 정렬되도록 함. */
        .brp-chapter-select-wrap {
          flex: 1 1 0;
          min-width: 0;
          display: flex;
          align-items: stretch;
        }

        /* (deprecated) 장 번호 + 부제목 — 네이티브 select 시절 스타일.
           이제 Dropdown 컴포넌트가 처리하므로 매칭되는 엘리먼트 없음. */
        .brp-chapter-select {
          position: relative;
          flex: 1;
          min-width: 0;
          display: inline-flex;
          align-items: baseline;
          justify-content: flex-start;
          gap: 10px;
          padding: 0 10px 0 14%;
          cursor: pointer;
          overflow: hidden;
        }

        .brp-chapter-select select {
          flex-shrink: 0;
          width: auto;
          appearance: none;
          -webkit-appearance: none;
          border: 0;
          border-radius: 0;
          background: transparent;
          background-image: none;
          color: var(--ink);
          cursor: pointer;
          font: inherit;
          font-size: 14px;
          font-weight: 700;
          line-height: 1.25;
          text-align: left;
          text-align-last: left;
          outline: none;
          padding: 0;
        }

        .brp-chapter-select select::-ms-expand {
          display: none;
        }

        .brp-select-title {
          /* 장(select) 글씨 크기와 동일하게 맞춰 균형 잡힌 한 줄. */
          font-size: 14px;
          font-weight: 600;
          line-height: 1.25;
          color: var(--accent-warm);
          letter-spacing: -0.005em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
        }

        .brp-chapter-select:focus-within .brp-select-title {
          color: var(--accent-warm);
        }

        .brp-reader,
        .brp-progress-grid,
        .brp-prayer {
          max-width: var(--container-reading);
          margin: 0 auto;
        }

        .brp-reader {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-lg);
          padding: clamp(20px, 3vw, 28px) clamp(6px, 1vw, 10px);
          overflow: hidden;
          /* 사용자 폰트 설정 — 본문(reader) 영역에만 적용. UI 폰트(.brp-page)는 항상 Pretendard. */
          font-family: var(--reader-font-family, inherit);
        }

        .brp-verse {
          display: grid;
          /* 절 번호 컬럼 — 2자리(예: 10, 99) 까지 컬럼 안에 여유 있게 들어가
             자리수가 달라도 본문 텍스트 시작 x 가 일관되게 보이도록 2em 으로
             고정. 본문 첫 줄과는 column-gap 으로 명확히 띄움. */
          grid-template-columns: 2em minmax(0, 1fr);
          column-gap: clamp(8px, 1vw, 12px);
          /* 번호는 본문 첫 줄의 baseline 에 정렬 — 절이 여러 줄이어도
             숫자가 텍스트 첫 줄과 자연스럽게 맞물려 보임. */
          align-items: baseline;
          /* 절 사이 간격 — 사용자 설정(절 사이 간격) 의 값. */
          margin: 0 0 var(--reader-verse-gap, 10px);
          padding: 2px 0;
          border-radius: var(--radius-md);
          /* 기본 16~19px clamp 에 사용자 글자 크기 배수 곱. */
          font-size: calc(clamp(16px, 1.6vw, 19px) * var(--reader-size-scale, 1));
          /* 텍스트 줄 간격 — 사용자 설정. */
          line-height: var(--reader-text-line-height, 1.55);
          font-weight: 400;
          color: var(--ink);
          word-break: keep-all;
          overflow-wrap: normal;
          transition: background 0.3s ease, color 0.3s ease;
        }

        .brp-verse.is-read {
          /* 읽은 절 — 그린은 가독성이 떨어져 트렌디한 웜 레드로.
             부제목 톤(accent-warm)과 묶여 따뜻한 강조 라인으로 통일. */
          color: var(--accent-warm);
        }

        .brp-verse.is-read .brp-verse-number {
          color: var(--accent-warm);
          opacity: 0.75;
        }

        .brp-verse.is-read .brp-verse-text {
          /* font-weight 를 바꾸면 글자 폭이 변해 줄바꿈 위치가 흔들리므로,
             동일 weight 를 유지하고 text-shadow 로만 "살짝 굵어진 느낌"을 표현.
             글자 박스 크기 변화 0 → reflow 없음. */
          text-shadow: 0 0 0.35px currentColor;
        }

        /* (deprecated) .brp-verse.is-current 회색 하이라이트 — 트리거 매칭은
           현재 절을 빠르게 통과 처리하므로 "다음에 기다리는 절" 이 미리 강조되어
           사용자가 헷갈리는 문제가 있어 의도적으로 제거함. */

        /* 선택 모드 진행 중인 절 — 디바이스에서 길게 눌러 진입한 이후
           탭으로 토글하기 위해 텍스트 선택(드래그) 을 일시 차단하고
           포인터 커서를 명시 (모드가 끝나면 자연스럽게 원상 복구). */
        .brp-verse.is-selecting {
          cursor: pointer;
          user-select: none;
          -webkit-user-select: none;
          -webkit-touch-callout: none;
        }

        /* 선택된 절(복사 대상) — 옅은 어센트 면만으로 차분히 강조.
           왼쪽 어센트 바/외곽 outline 같은 "선" 류는 일부러 쓰지 않는다.
           background + radius 만으로 둥근 highlight chip 느낌. layout-safe
           (reader 좌우 padding 이 좁은 모바일에서도 한 칸 밖으로 튀어나가지 않게
           padding/negative margin 같은 트릭은 쓰지 않음).
           음성 읽기 완료(.is-read, --accent-warm) 와는 톤(웜레드 vs 액센트
           그린)이 분명히 달라 시각적으로 헷갈리지 않음. */
        .brp-verse.is-selected {
          background: var(--accent-soft);
          border-radius: var(--radius-md);
        }
        .brp-verse.is-selected .brp-verse-number {
          color: var(--accent);
          font-weight: 700;
        }

        /* 검색 결과로 이동했을 때 그 절을 잠깐 강조(약 2초). 본문 글자 폭/줄바꿈에
           영향 주지 않도록 배경 + box-shadow 만 사용(텍스트 박스 크기 변화 0). */
        .brp-verse.is-flash {
          background: var(--accent-soft);
          border-radius: var(--radius-md);
          box-shadow: inset 3px 0 0 0 var(--accent);
          animation: brp-verse-flash 2s ease;
        }
        @keyframes brp-verse-flash {
          0% {
            background: color-mix(in srgb, var(--accent) 22%, transparent);
          }
          100% {
            background: var(--accent-soft);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .brp-verse.is-flash {
            animation: none;
          }
        }

        /* 절 번호 — 표시만. 클릭/선택은 .brp-verse 컨테이너의 long-press +
           click 핸들러가 담당하므로 별도 인터랙션 스타일은 두지 않는다.
           정렬: text-align: center + tabular-nums — 1자리/2자리 모두 컬럼(2em)
           안에 가운데 정렬. 본문 텍스트와의 간격은 .brp-verse 의 column-gap
           이 책임지므로 자리수가 달라도 일정한 여백을 유지한다. */
        .brp-verse-number {
          color: var(--ink-mute);
          font-size: 1em;
          line-height: inherit;
          text-align: center;
          font-variant-numeric: tabular-nums;
          transition: color 0.25s ease;
        }

        .brp-verse-text {
          min-width: 0;
          margin: 0;
          overflow-wrap: break-word;
          /* 강조 시 weight 가 아닌 text-shadow 로 처리하므로 부드럽게 페이드. */
          transition: text-shadow 0.25s ease, color 0.25s ease;
        }

        /* ─────────────────────────────────────────────────────────────
           원어 묵상 모드 — 본문(verse.t) 은 이미 한국어 "원어 의역" 이고,
           그 아래에 헬라어 토큰 라인(ruby 형태: 헬라어 위 / 한글 발음 아래)
           과 ▾ 갈매기로 절 전체 풀이가 펼쳐진다. 모든 부속 요소는
           grid-column: 2 로 절 번호 칸을 비우고 본문 칸 안에 들어간다.
           ────────────────────────────────────────────────────────────── */

        /* 헬라어 블록 전체 컨테이너 — 토큰 라인 + (펼쳐졌을 때) 절 풀이. */
        .brp-greek-block {
          grid-column: 2;
          margin: 8px 0 2px;
        }

        /* 헬라어 토큰 라인 — 왼쪽에 토큰들, 오른쪽에 ▾ 갈매기. */
        .brp-greek-line {
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }
        .brp-greek-tokens {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-wrap: wrap;
          gap: 4px 10px;
          line-height: 1.4;
        }

        /* 한 단어 토큰 — 위에는 헬라어, 아래에는 작은 회색 발음.
           inline-flex column 으로 발음을 단어 정확히 아래에 둔다. */
        .brp-greek-token {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          position: relative;
        }
        .brp-greek-token-word {
          font-size: 1em;
          color: var(--ink);
          font-variant-ligatures: none;
          /* 헬라어 강세·기식 폴리토닉이 깨지지 않게 라틴 fallback 우선 */
          font-family: "EB Garamond", "Garamond", "Times New Roman", serif;
        }
        .brp-greek-token-pron {
          margin-top: 2px;
          font-size: 0.7em;
          line-height: 1;
          color: var(--ink-mute);
          letter-spacing: -0.01em;
        }
        /* 정보가 있는 토큰의 발음은 점선 밑줄 + 클릭 가능. */
        button.brp-greek-token-pron {
          appearance: none;
          background: transparent;
          border: none;
          padding: 2px 1px 1px;
          cursor: pointer;
          border-bottom: 1px dotted var(--ink-mute, rgba(0, 0, 0, 0.35));
          transition: color 0.15s ease, border-color 0.15s ease;
          font-family: inherit;
        }
        button.brp-greek-token-pron:hover,
        button.brp-greek-token-pron.is-open {
          color: var(--ink);
          border-bottom-color: var(--ink);
        }

        /* 단어 정보 팝오버 — 그 토큰 바로 아래에 새 줄로 펼쳐진다.
           flex-wrap container 안의 한 줄을 통째로 차지하도록 100% width
           + flex-basis 100% 트릭. 너무 넓어지지 않게 max-width 제한. */
        .brp-greek-token-info {
          flex-basis: 100%;
          width: 100%;
          order: 1;
          margin: 6px 0 4px;
          padding: 10px 12px;
          background: rgba(0, 0, 0, 0.035);
          border-left: 2px solid var(--line-strong, rgba(0, 0, 0, 0.25));
          border-radius: 0 6px 6px 0;
          color: var(--ink);
          font-size: 0.85em;
          line-height: 1.65;
          text-align: left;
          display: block;
        }
        .brp-greek-token-info-head {
          display: flex;
          align-items: baseline;
          gap: 8px;
          margin-bottom: 4px;
          padding-bottom: 4px;
          border-bottom: 1px dashed var(--line, rgba(0, 0, 0, 0.12));
        }
        .brp-greek-token-info-w {
          font-family: "EB Garamond", "Garamond", "Times New Roman", serif;
          font-size: 1.05em;
          font-weight: 600;
          color: var(--ink);
        }
        .brp-greek-token-info-p {
          font-size: 0.85em;
          color: var(--ink-mute);
        }
        .brp-greek-token-info-body {
          display: block;
          color: var(--ink);
          overflow-wrap: break-word;
        }

        /* 절 전체 풀이 ▾ 갈매기 — 텍스트 없이 chevron 만. */
        .brp-greek-drawer-toggle {
          appearance: none;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 999px;
          width: 28px;
          height: 28px;
          flex: 0 0 auto;
          padding: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--ink-mute);
          cursor: pointer;
          transition: color 0.2s ease, background 0.2s ease, border-color 0.2s ease;
        }
        .brp-greek-drawer-toggle:hover {
          color: var(--ink);
          background: rgba(0, 0, 0, 0.04);
        }
        .brp-greek-drawer-toggle.is-open {
          color: var(--ink);
          background: rgba(0, 0, 0, 0.05);
          border-color: var(--line, rgba(0, 0, 0, 0.12));
        }
        .brp-greek-drawer-chevron {
          display: inline-block;
          font-size: 0.95em;
          line-height: 1;
          transition: transform 0.2s ease;
        }
        .brp-greek-drawer-toggle.is-open .brp-greek-drawer-chevron {
          transform: rotate(180deg);
        }

        /* 절 전체 풀이 본문 — 갈매기를 눌렀을 때만 보임. */
        .brp-verse-greek-words {
          margin: 8px 0 2px;
          padding: 10px 12px;
          border-left: 2px solid var(--line, rgba(0, 0, 0, 0.12));
          color: var(--ink-mute);
          font-size: 0.88em;
          line-height: 1.75;
          overflow-wrap: break-word;
          font-variant-ligatures: none;
        }

        /* ─────────────────────────────────────────────────────────────
           절 복사 — dock 위에 떠 있는 컴팩트 액션 바 + 짧은 토스트.
           선택된 절이 1개 이상일 때만 표시되며, "복사" 한 번으로 헤더와
           함께 클립보드에 들어간다 (포맷: "{책} {장}장\n\n{n} {본문}\n...").
           ────────────────────────────────────────────────────────────── */
        .brp-copy-bar {
          position: fixed;
          left: 50%;
          bottom: 80px; /* dock(.brp-dock bottom 16 + 약 48 + 여유) 위 */
          z-index: 23;
          transform: translateX(-50%);
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 8px 6px 14px;
          background: var(--surface-translucent, var(--surface));
          border: 1px solid var(--line-strong, var(--line));
          border-radius: var(--radius-pill);
          backdrop-filter: saturate(180%) blur(18px);
          -webkit-backdrop-filter: saturate(180%) blur(18px);
          box-shadow: var(--shadow-1);
          font-size: 13.5px;
          font-weight: 600;
          color: var(--ink);
          max-width: calc(100vw - 24px);
          white-space: nowrap;
        }
        .brp-copy-count {
          padding-left: 2px;
          color: var(--ink);
        }
        .brp-copy-btn {
          appearance: none;
          background: var(--accent);
          color: var(--accent-ink);
          border: 1px solid var(--accent);
          padding: 7px 16px;
          font: inherit;
          font-weight: 700;
          border-radius: var(--radius-pill);
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .brp-copy-btn:hover {
          background: var(--accent-hover, var(--accent));
          border-color: var(--accent-hover, var(--accent));
        }
        /* 보조 액션 — ghost 톤. "전체"(전체 선택), "선택 취소"(모드 종료) 공통. */
        .brp-copy-all,
        .brp-copy-cancel {
          appearance: none;
          background: transparent;
          border: 1px solid var(--line);
          padding: 6px 12px;
          font: inherit;
          font-weight: 600;
          color: var(--ink-soft);
          border-radius: var(--radius-pill);
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
        }
        .brp-copy-all:hover,
        .brp-copy-cancel:hover {
          background: var(--surface-alt);
          color: var(--ink);
          border-color: var(--line-strong, var(--line));
        }

        .brp-copy-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .brp-copy-toast {
          position: fixed;
          left: 50%;
          bottom: 140px;
          z-index: 24;
          transform: translateX(-50%);
          background: var(--ink);
          color: var(--bg);
          padding: 10px 18px;
          border-radius: var(--radius-pill);
          font-size: 13px;
          font-weight: 600;
          letter-spacing: -0.01em;
          box-shadow: 0 8px 22px rgba(0, 0, 0, 0.22);
          pointer-events: none;
          max-width: calc(100vw - 24px);
          white-space: nowrap;
          animation: brp-copy-toast-in 0.18s ease-out;
        }
        @keyframes brp-copy-toast-in {
          from { opacity: 0; transform: translate(-50%, 6px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }

        /* (deprecated) .brp-verse-word / .brp-verse-word.is-read — 절 내부
           단어 단위 가라오케 fill 용 스타일. 트리거 매칭으로 전환되며 절을
           통째로 한 번에 색칠하는 방식이 되어 더 이상 렌더링되지 않음. */

        /* ─────────────────────────────────────────────────────────────
           Top row: [책 드롭다운] + [번역 토글] — 한 줄, 컴팩트 40px.
           ────────────────────────────────────────────────────────────── */
        /* 책 드롭다운 + 번역 토글 — 항상 한 줄, 1:1 분할. */
        .brp-top-row {
          max-width: var(--container-reading);
          margin: 0 auto 8px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          align-items: stretch;
          box-sizing: border-box;
        }

        /* 책 드롭다운 — 네이티브 select 를 pill 컨테이너로 감쌈. 텍스트 중앙 정렬. */
        .brp-book-picker {
          position: relative;
          display: flex;
          align-items: center;
          height: 40px;
          padding: 0;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-pill);
          box-sizing: border-box;
          cursor: pointer;
          transition: border-color 0.15s ease, background 0.15s ease;
        }

        .brp-book-picker:hover {
          background: var(--surface-alt);
          border-color: var(--line-strong);
        }

        .brp-book-picker select {
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          width: 100%;
          border: 0;
          background: transparent;
          color: var(--ink);
          font: inherit;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: -0.01em;
          line-height: 1;
          cursor: pointer;
          outline: none;
          /* 좌우 동일 패딩 — text-align center 일 때 시각적으로도 진짜 가운데. */
          text-align: center;
          text-align-last: center;
          padding: 0 16px;
        }

        /* 셰브론 — 절대 위치라 select 의 가운데 정렬에 영향 X */
        .brp-book-picker::after {
          content: "";
          position: absolute;
          right: 16px;
          top: 50%;
          width: 7px;
          height: 7px;
          border-right: 1.5px solid var(--ink-soft);
          border-bottom: 1.5px solid var(--ink-soft);
          transform: translateY(-65%) rotate(45deg);
          pointer-events: none;
        }

        .brp-sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        /* 컴팩트 번역 토글 — 책 드롭다운(.brp-book-picker)과 시각적으로
           동일한 pill 로 보이도록 inner padding/gap 을 0 으로. 슬라이딩
           인디케이터(.brp-toggle-indicator)가 활성 영역을 그려주고, 버튼은
           항상 투명한 상태로 텍스트 색만 전환되어 매끄러운 슬라이드 전환. */
        .brp-translation--sm {
          position: relative;
          isolation: isolate;
          height: 40px;
          min-height: 40px;
          padding: 0;
          gap: 0;
          overflow: hidden;
        }
        .brp-translation--sm button {
          height: 100%;
          padding: 0 12px;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: -0.01em;
          border-radius: var(--radius-pill);
          /* 좁은 모바일 폭에서도 "개역한글"이 두 줄로 깨지지 않도록 */
          white-space: nowrap;
        }

        /* 공통 토글 슬라이딩 인디케이터. 컨테이너에 다음 CSS 변수가
           전달된다는 가정으로 위치/폭이 계산된다:
             --brp-toggle-count  : 버튼 개수 (정수)
             --brp-toggle-active : 활성 인덱스 (0..count-1)
           overflow: hidden 컨테이너 안에서 pill 모양 그대로 슬라이드한다. */
        .brp-toggle {
          position: relative;
          isolation: isolate;
        }
        .brp-toggle-indicator {
          position: absolute;
          top: 0;
          left: 0;
          bottom: 0;
          width: calc(100% / var(--brp-toggle-count, 2));
          background: var(--accent);
          border-radius: var(--radius-pill);
          transform: translate3d(
            calc(var(--brp-toggle-active, 0) * 100%),
            0,
            0
          );
          transition: transform 0.34s cubic-bezier(0.32, 0.72, 0.24, 1);
          will-change: transform;
          pointer-events: none;
          z-index: 0;
        }
        @media (prefers-reduced-motion: reduce) {
          .brp-toggle-indicator {
            transition: none;
          }
        }

        .brp-translation button.is-disabled,
        .brp-translation button:disabled {
          color: var(--ink-mute);
          cursor: not-allowed;
          background: transparent;
        }

        .brp-reader-empty {
          margin: 0 0 20px;
          padding: 18px 20px;
          border-radius: var(--radius-md);
          background: var(--surface-alt);
          color: var(--ink-soft);
          font-size: 14.5px;
          line-height: 1.7;
          text-align: center;
        }

        /* 모드 탭 — pill 컨테이너 + 슬라이딩 인디케이터.
           슬림 변형(--sm)은 36px 높이, 번역 토글과 동일하게 edge-to-edge
           (padding/gap 0) 로 베젤 없이 깔끔하게 보인다. */
        .brp-mode-tabs {
          max-width: var(--container-reading);
          margin: 0 auto 14px;
          position: relative;
          isolation: isolate;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-pill);
          padding: 0;
          min-height: 52px;
          box-sizing: border-box;
          align-items: stretch;
          overflow: hidden;
        }

        /* 읽기 모드 탭 — 옆에 놓인 번역 토글(40px)과 동일한 높이로 맞춰
           한 줄 안에서 두 컨트롤이 같은 톤의 pill 띠처럼 보이게 한다. */
        .brp-mode-tabs--sm {
          height: 40px;
          min-height: 40px;
          padding: 0;
          gap: 0;
          margin-bottom: 0;
        }

        /* .brp-top-row(1fr 1fr 그리드) 안에 들어가는 경우 — 본인의 max-width
           / 가운데 마진을 리셋해 그리드 셀에 가득 차도록. */
        .brp-top-row > .brp-mode-tabs {
          max-width: none;
          margin: 0;
        }

        .brp-mode-tab {
          all: unset;
          position: relative;
          z-index: 1;
          cursor: pointer;
          box-sizing: border-box;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 9px 18px;
          border-radius: var(--radius-pill);
          background: transparent;
          color: var(--ink-soft);
          font-size: 15px;
          font-weight: 600;
          letter-spacing: -0.01em;
          transition: color 0.22s ease;
        }

        .brp-mode-tabs--sm .brp-mode-tab {
          padding: 5px 14px;
          font-size: 13px;
        }

        .brp-mode-tab:hover:not(.is-active) {
          color: var(--ink);
        }

        .brp-mode-tab.is-active {
          background: transparent;
          color: var(--accent-ink);
        }

        .brp-scroll-status {
          display: inline-flex;
          align-items: center;
          padding: 12px 14px;
          color: var(--ink-soft);
          font-size: 13px;
          font-weight: 500;
          white-space: nowrap;
        }

        .brp-scroll-status.is-ready {
          color: var(--ink);
        }

        .brp-quiz {
          position: fixed;
          inset: 0;
          z-index: 32;
          display: grid;
          place-items: center;
          padding: 16px;
          background: rgba(22, 22, 26, 0.42);
          backdrop-filter: saturate(180%) blur(8px);
          -webkit-backdrop-filter: saturate(180%) blur(8px);
        }

        .brp-quiz-card {
          width: min(94vw, 520px);
          max-height: 88vh;
          overflow-y: auto;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-lg);
          padding: clamp(20px, 4vw, 28px);
          box-shadow: var(--shadow-2);
        }

        .brp-quiz-eyebrow {
          margin: 0 0 8px;
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--ink-mute);
          font-weight: 600;
        }

        .brp-quiz-card h2 {
          margin: 0 0 6px;
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: var(--ink);
        }

        .brp-quiz-sub {
          margin: 0 0 20px;
          font-size: 14px;
          color: var(--ink-soft);
          line-height: 1.6;
        }

        .brp-quiz-list {
          list-style: none;
          margin: 0 0 18px;
          padding: 0;
          display: grid;
          gap: 14px;
        }

        .brp-quiz-item {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-lg);
          padding: 16px 16px 14px;
        }

        .brp-quiz-prompt {
          margin: 0 0 8px;
          font-size: 13px;
          color: var(--ink-soft);
        }

        .brp-quiz-prompt strong {
          color: var(--ink);
          font-weight: 700;
        }

        .brp-quiz-blanked {
          margin: 0 0 14px;
          font-size: 15.5px;
          line-height: 1.7;
          color: var(--ink);
          word-break: keep-all;
        }

        .brp-quiz-options {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .brp-quiz-opt {
          border: 1px solid var(--line);
          border-radius: var(--radius-pill);
          padding: 10px 14px;
          background: transparent;
          color: var(--ink);
          font: inherit;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          text-align: center;
          transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
        }

        .brp-quiz-opt:hover:not(:disabled):not(.is-selected) {
          background: var(--surface-alt);
          border-color: var(--line-strong);
        }

        /* 선택 상태 — 강조 그린은 안 씀(3곳 외). grayscale 채움으로 위계만 표현. */
        .brp-quiz-opt.is-selected {
          background: var(--surface-alt);
          border-color: var(--ink);
          color: var(--ink);
          font-weight: 700;
        }

        .brp-quiz-opt.is-correct {
          background: rgba(56, 142, 60, 0.15);
          border-color: rgba(56, 142, 60, 0.7);
          color: #2e7d32;
        }

        .brp-quiz-opt.is-wrong {
          background: rgba(180, 63, 63, 0.12);
          border-color: rgba(180, 63, 63, 0.5);
          color: #b43f3f;
        }

        .brp-quiz-opt:disabled {
          cursor: default;
        }

        .brp-quiz-result {
          margin: 0 0 14px;
          padding: 10px 12px;
          border-radius: var(--radius-md);
          font-size: 13.5px;
          font-weight: 600;
          text-align: center;
        }

        .brp-quiz-result.is-pass {
          background: rgba(56, 142, 60, 0.12);
          color: #2e7d32;
        }

        .brp-quiz-result.is-fail {
          background: rgba(180, 63, 63, 0.1);
          color: #b43f3f;
        }

        .brp-quiz-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }

        .brp-quiz-cancel,
        .brp-quiz-submit {
          border: 0;
          cursor: pointer;
          font: inherit;
          border-radius: var(--radius-pill);
          padding: 11px 20px;
          font-size: 14px;
        }

        .brp-quiz-cancel {
          background: transparent;
          color: var(--ink-soft);
          border: 1px solid var(--line);
          font-weight: 600;
        }

        .brp-quiz-cancel:hover {
          background: var(--surface-alt);
          color: var(--ink);
        }

        /* 퀴즈 제출 — 1차 액션. 그린. */
        .brp-quiz-submit {
          background: var(--accent);
          color: var(--accent-ink);
          font-weight: 600;
          transition: background 0.18s ease;
        }

        .brp-quiz-submit:hover:not(:disabled) {
          background: var(--accent-hover);
        }

        .brp-quiz-submit:disabled {
          background: var(--surface-alt);
          color: var(--ink-mute);
          cursor: not-allowed;
        }

        .brp-progress-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 20px;
          margin-top: 48px;
          padding-top: 36px;
          border-top: 1px solid var(--line);
        }

        @media (min-width: 720px) {
          .brp-progress-grid {
            grid-template-columns: 180px 1fr;
            gap: 28px;
            align-items: start;
          }
        }

        .brp-progress-grid h2,
        .brp-prayer h2 {
          margin: 0;
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: var(--ink);
        }

        .brp-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 8px;
        }

        @media (min-width: 480px) {
          .brp-grid {
            grid-template-columns: repeat(8, 1fr);
            gap: 10px;
          }
        }

        .brp-grid button {
          /* 그리드 셀이 넓어도 칩(동그라미)은 항상 일정 크기로 유지 — 가로폭이
             넓은 태블릿/PC 에서 한 셀이 커져서 동그라미가 거대해지는 현상 방지.
             셀 안에선 margin: 0 auto 로 가운데 정렬. */
          width: 100%;
          max-width: 40px;
          aspect-ratio: 1;
          margin: 0 auto;
          border-radius: 50%;
          background: var(--surface);
          color: var(--ink-soft);
          border: 1px solid var(--line);
          font-size: 13px;
          font-weight: 600;
          transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
        }

        .brp-grid button:hover:not(.is-done) {
          border-color: var(--ink-mute);
          color: var(--ink);
        }

        .brp-grid button.is-current {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }

        .brp-grid button.is-done {
          background: var(--accent);
          color: var(--accent-ink);
          border-color: var(--accent);
        }

        .brp-prayer {
          margin-top: 56px;
          padding-top: 36px;
          border-top: 1px solid var(--line);
        }

        .brp-prayer-header {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 14px;
          margin-bottom: 18px;
        }

        @media (min-width: 600px) {
          .brp-prayer-header {
            flex-direction: row;
            align-items: flex-end;
            justify-content: space-between;
            gap: 20px;
          }
        }

        .brp-prayer-heading h2 {
          margin: 0;
        }

        .brp-prayer-meta {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin: 8px 0 0;
          font-size: 13px;
          color: var(--ink-soft);
          font-variant-numeric: tabular-nums;
        }

        .brp-prayer-divider {
          color: var(--ink-mute);
        }

        .brp-prayer-count {
          color: var(--ink);
          font-weight: 700;
        }

        /* 학년 토글 — 번역/모드 토글과 동일하게 슬라이딩 인디케이터 패턴.
           컨테이너 안 padding 없음 → 베젤 없이 edge-to-edge pill 한 줄.
           높이는 height 로 명시 고정 (min-height 만 있으면 자식 button 의
           내재 높이가 줄어들 때 pill 이 작아져 의도와 다르게 보일 수 있음). */
        .brp-prayer-toggle {
          display: inline-flex;
          align-items: stretch;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-pill);
          padding: 0;
          height: 44px;
          overflow: hidden;
          position: relative;
          isolation: isolate;
          flex-shrink: 0;
        }

        .brp-prayer-toggle button {
          position: relative;
          z-index: 1;
          border: 0;
          margin: 0;
          cursor: pointer;
          font: inherit;
          /* native <button> 기본 padding/margin 0 리셋. flex 가운데 정렬은
             기본으로 두고, Pretendard 한글 글리프가 line-box 위쪽으로 약간
             치우쳐 보이는 metric 보정은 line-height 를 넉넉히 줘서 line-box
             안에서 자연스럽게 중앙에 앉도록 한다. height: 100% 로 pill 전체
             높이를 그대로 채움. */
          display: flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          width: auto;
          height: 100%;
          line-height: 1.5;
          padding: 0 16px;
          border-radius: var(--radius-pill);
          background: transparent;
          color: var(--ink-soft);
          font-size: 13px;
          font-weight: 600;
          letter-spacing: -0.01em;
          transition: color 0.2s ease;
        }

        .brp-prayer-toggle button.is-active {
          background: transparent;
          color: var(--accent-ink);
        }

        .brp-prayer-bar {
          height: 2px;
          background: var(--surface-alt);
          border-radius: var(--radius-pill);
          margin-bottom: 20px;
          overflow: hidden;
        }

        .brp-prayer-bar span {
          display: block;
          height: 100%;
          background: var(--accent);
          transition: width 0.3s ease;
        }

        .brp-prayer-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 10px;
        }

        .brp-prayer-item {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-lg);
          transition: border-color 0.2s ease, background 0.2s ease;
          min-width: 0;
          overflow: hidden;
        }

        .brp-prayer-item.is-open {
          background: var(--surface);
          border-color: var(--ink-mute);
        }

        .brp-prayer-item.is-done .brp-prayer-no {
          color: var(--ink-mute);
          text-decoration: line-through;
        }

        .brp-prayer-item.is-done .brp-prayer-theme {
          color: var(--ink-soft);
        }

        .brp-prayer-trigger {
          all: unset;
          box-sizing: border-box;
          display: grid;
          grid-template-columns: 40px 1fr 28px;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 16px 18px;
          cursor: pointer;
          font-size: 16px;
        }

        .brp-prayer-trigger:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }

        .brp-prayer-no {
          font-size: 12px;
          letter-spacing: 0.12em;
          color: var(--ink-mute);
          font-variant-numeric: tabular-nums;
          font-weight: 600;
        }

        .brp-prayer-theme {
          font-weight: 600;
          color: var(--ink);
          letter-spacing: -0.01em;
        }

        .brp-prayer-mark {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: 1px solid var(--line-strong, var(--ink-mute));
          color: var(--ink-soft);
          background: transparent;
        }

        .brp-prayer-item.is-done .brp-prayer-mark {
          background: var(--accent);
          border-color: var(--accent);
          color: var(--accent-ink);
        }

        .brp-prayer-mark-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--ink-mute);
        }

        .brp-prayer-body {
          padding: 4px 20px 22px;
          border-top: 1px solid var(--line);
          display: grid;
          gap: 20px;
          min-width: 0;
        }

        .brp-prayer-body > * {
          min-width: 0;
        }

        .brp-prayer-verse {
          /* 좌측 컬러바 제거 — 대신 본문 흐름과 살짝 떨어뜨려 들여쓴 인용처럼 처리.
             상단에 옅은 1px 라인 + 작은 캡션 라벨로 에디토리얼 톤. */
          margin: 22px 0 0;
          padding: 18px 0 0;
          border-top: 1px solid var(--line);
          color: var(--ink);
        }

        .brp-prayer-verse p {
          margin: 0;
          font-family: var(--font-noto-serif-kr), "Nanum Myeongjo",
            "Apple SD Gothic Neo", "Iowan Old Style", "Times New Roman", serif;
          font-size: 16.5px;
          line-height: 1.85;
          letter-spacing: -0.005em;
          color: var(--ink);
          word-break: keep-all;
          overflow-wrap: anywhere;
        }

        .brp-prayer-verse cite {
          display: block;
          margin-top: 10px;
          font-style: normal;
          font-size: 11.5px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ink-mute);
        }

        .brp-prayer-section {
          display: grid;
          gap: 8px;
        }

        .brp-prayer-label {
          margin: 0;
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--ink-mute);
          font-weight: 600;
        }

        .brp-prayer-think,
        .brp-prayer-text {
          margin: 0;
          color: var(--ink);
          font-size: 15px;
          line-height: 1.85;
          word-break: keep-all;
          overflow-wrap: anywhere;
          min-width: 0;
        }

        .brp-prayer-text-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
        }

        .brp-prayer-word-count {
          font-size: 12px;
          color: var(--ink-soft);
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }

        .brp-prayer-text-line {
          margin-bottom: 6px;
        }

        .brp-prayer-text-line:last-child {
          margin-bottom: 0;
        }

        .brp-prayer-word {
          display: inline;
          margin-right: 0.28em;
          color: var(--ink);
          transition: color 0.25s ease, font-weight 0.25s ease;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .brp-prayer-word.is-read {
          color: var(--accent);
          font-weight: 700;
        }

        .brp-prayer-blank {
          color: var(--ink-mute);
          font-style: italic;
          font-size: 0.92em;
          padding: 0 2px;
        }

        .brp-prayer-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .brp-prayer-mic,
        .brp-prayer-check,
        .brp-prayer-next,
        .brp-prayer-restart,
        .brp-prayer-reset {
          border: 0;
          cursor: pointer;
          font: inherit;
          border-radius: var(--radius-pill);
          padding: 11px 18px;
          font-size: 14px;
          white-space: nowrap;
        }

        .brp-prayer-mic {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: var(--surface);
          color: var(--ink);
          border: 1px solid var(--line);
          font-weight: 600;
          transition: background 0.18s ease, border-color 0.18s ease;
        }

        .brp-prayer-mic:hover:not(:disabled):not(.is-listening) {
          background: var(--surface-alt);
          border-color: var(--line-strong);
        }

        .brp-prayer-mic.is-listening {
          background: var(--danger);
          color: #fff;
          border-color: var(--danger);
        }

        .brp-prayer-mic:disabled {
          cursor: not-allowed;
          background: var(--surface-alt);
          color: var(--ink-mute);
          border-color: var(--line);
        }

        .brp-prayer-mic-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: currentColor;
        }

        .brp-prayer-mic.is-listening .brp-prayer-mic-dot {
          animation: brpPulse 1.2s ease infinite;
        }

        .brp-prayer-restart {
          background: transparent;
          color: var(--ink-soft);
          border: 1px solid var(--line);
          font-size: 13px;
          font-weight: 600;
          padding: 10px 14px;
        }

        .brp-prayer-restart:hover {
          color: var(--ink);
          background: var(--surface-alt);
        }

        .brp-prayer-check {
          background: transparent;
          color: var(--ink);
          border: 1px solid var(--line);
          font-weight: 600;
        }

        .brp-prayer-check.is-done {
          background: var(--surface-alt);
          color: var(--ink-soft);
          border: 1px solid var(--line);
        }

        .brp-prayer-next {
          background: transparent;
          color: var(--ink);
          border: 1px solid var(--line);
          font-weight: 600;
        }

        .brp-prayer-next:hover,
        .brp-prayer-check:hover {
          background: var(--surface-alt);
          color: var(--ink);
        }

        .brp-prayer-lords {
          /* 좌측 컬러바 제거 — 카드 자체를 깔끔한 하나의 패널로.
             옅은 표면 + 라운드만으로 충분히 "선택된" 카드 느낌. */
          margin-top: 24px;
          padding: 22px 22px 24px;
          background: var(--surface-alt);
          border: 1px solid var(--line);
          border-radius: var(--radius-lg);
        }

        .brp-prayer-lords p:last-child {
          margin: 14px 0 0;
          color: var(--ink);
          font-family: var(--font-noto-serif-kr), "Nanum Myeongjo",
            "Apple SD Gothic Neo", "Iowan Old Style", "Times New Roman", serif;
          font-size: 15.5px;
          line-height: 1.95;
          letter-spacing: -0.005em;
          word-break: keep-all;
        }

        .brp-prayer-foot {
          display: flex;
          justify-content: flex-end;
          margin-top: 18px;
        }

        .brp-prayer-reset {
          background: transparent;
          color: var(--ink-soft);
          border: 1px solid var(--line);
          font-size: 13px;
          font-weight: 600;
          padding: 9px 14px;
        }

        .brp-prayer-reset:hover {
          color: var(--ink);
          background: var(--surface-alt);
        }

        .brp-dock {
          position: fixed;
          left: 50%;
          bottom: 16px;
          z-index: 22;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px;
          border-radius: var(--radius-pill);
          background: var(--surface-translucent);
          border: 1px solid var(--line);
          backdrop-filter: saturate(180%) blur(18px);
          -webkit-backdrop-filter: saturate(180%) blur(18px);
          box-shadow: var(--shadow-1);
          max-width: calc(100vw - 32px);
        }

        /* 도크 1차 액션 — "다 읽었어요" 챕터 완료. 강조 그린. */
        .brp-manual {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border-radius: var(--radius-pill);
          padding: 8px 16px;
          background: var(--accent);
          color: var(--accent-ink);
          border: 1px solid var(--accent);
          font-size: 13.5px;
          font-weight: 600;
          white-space: nowrap;
          transition: background 0.18s ease, border-color 0.18s ease;
        }

        .brp-manual:hover:not(:disabled):not(.is-pending) {
          background: var(--accent-hover);
          border-color: var(--accent-hover);
        }

        /* 아직 80% 미만 읽음 → 1차 액션은 비활성처럼 보이게 (ghost) */
        .brp-manual.is-pending {
          background: transparent;
          color: var(--ink-mute);
          border-color: var(--line);
        }

        .brp-manual.is-pending:hover {
          background: var(--surface-alt);
        }

        /* 도크 2차 액션들 — 마이크 토글, 처음부터 다시. ghost. */
        .brp-mic,
        .brp-reset {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border-radius: var(--radius-pill);
          padding: 7px 14px;
          background: transparent;
          color: var(--ink);
          border: 1px solid var(--line);
          font-size: 12.5px;
          font-weight: 600;
          white-space: nowrap;
          transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
        }

        .brp-mic:hover:not(:disabled):not(.is-listening),
        .brp-reset:hover:not(:disabled) {
          background: var(--surface-alt);
          border-color: var(--line-strong);
        }

        .brp-mic:disabled,
        .brp-manual:disabled,
        .brp-reset:disabled {
          cursor: not-allowed;
          background: transparent;
          color: var(--ink-mute);
          border-color: var(--line);
        }

        .brp-mic span {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: currentColor;
        }

        .brp-mic.is-listening span {
          animation: brpPulse 1.2s ease infinite;
        }

        /* 마이크 ON 상태만 강조 — 듣고 있다는 능동 신호. danger 톤. */
        .brp-mic.is-listening {
          background: var(--danger);
          color: #fff;
          border-color: var(--danger);
        }

        .brp-count {
          color: var(--ink-soft);
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          padding: 0 8px;
        }

        .brp-speech-message {
          /* 한 줄 토스트 — 본문 가독성을 가리지 않게 콤팩트하게.
             3 초 뒤 자동 페이드아웃 (useEffect 에서 빈 문자열로 설정). */
          position: fixed;
          left: 50%;
          bottom: 88px;
          z-index: 22;
          transform: translateX(-50%);
          margin: 0;
          padding: 8px 16px;
          background: var(--ink);
          color: var(--surface);
          border-radius: var(--radius-pill);
          font-size: 12.5px;
          font-weight: 500;
          letter-spacing: -0.005em;
          white-space: nowrap;
          max-width: calc(100vw - 32px);
          overflow: hidden;
          text-overflow: ellipsis;
          animation: brp-toast-in 0.18s ease-out;
          box-shadow: var(--shadow-2);
        }

        @keyframes brp-toast-in {
          from {
            opacity: 0;
            transform: translate(-50%, 6px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }

        .brp-complete {
          position: fixed;
          inset: 0;
          z-index: 30;
          display: grid;
          place-items: center;
          background: rgba(22, 22, 26, 0.42);
          backdrop-filter: saturate(180%) blur(16px);
          -webkit-backdrop-filter: saturate(180%) blur(16px);
          padding: 16px;
        }

        .brp-complete div {
          width: min(94vw, 440px);
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-lg);
          padding: clamp(28px, 5vw, 40px);
          text-align: center;
          box-shadow: var(--shadow-2);
        }

        .brp-complete p {
          margin: 0 0 10px;
          color: var(--ink-mute);
          letter-spacing: 0.16em;
          text-transform: uppercase;
          font-size: 12px;
          font-weight: 600;
        }

        .brp-complete h2 {
          margin: 0 0 22px;
          font-size: clamp(22px, 4vw, 28px);
          font-weight: 700;
          letter-spacing: -0.02em;
          color: var(--ink);
        }

        .brp-complete button {
          border-radius: var(--radius-pill);
          padding: 12px 24px;
          background: var(--accent);
          color: var(--accent-ink);
          font-weight: 600;
          font-size: 14px;
          border: 0;
          cursor: pointer;
          transition: background 0.18s ease;
        }

        .brp-complete button:hover {
          background: var(--accent-hover);
        }

        @keyframes brpPulse {
          0% {
            box-shadow: 0 0 0 0 rgba(180, 63, 63, 0.35);
          }
          100% {
            box-shadow: 0 0 0 12px rgba(180, 63, 63, 0);
          }
        }

        /* ─────────────────────────────────────────────────────────────
           메인 캔버스(.brp-canvas) + 우측 사이드(.brp-side)
           - 모바일/태블릿 세로(<960px): canvas 는 flex column, side 는
             display:contents 로 layout 영향 0. 자식들은 캔버스 직속 flex
             item 처럼 동작 → CSS order 로 기존 모바일 순서 유지
             (hero → top-row → mode-tabs → toolbar → reader → progress → prayer).
           - 태블릿 가로 + PC(≥960px): canvas 는 grid 2-col. side 는 우측
             컬럼(grid-area: side)을 차지하는 flex column + position:sticky
             → 본문 스크롤해도 컨트롤·진도·기도 카드가 함께 따라옴.
           ────────────────────────────────────────────────────────────── */
        .brp-canvas {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .brp-side {
          /* 모바일: 컨테이너 자체를 layout 에서 제거 — 자식들이 canvas 직속 flex item.
             PC 에선 grid item 으로 살아남음(미디어 쿼리에서 override). */
          display: contents;
        }
        /* CSS order — 모바일/태블릿 세로 시각 순서. side 가 display: contents 라
           내부 자식들이 canvas 의 flex item 으로 평탄화 → order 로 배치 가능. */
        .brp-canvas > .brp-hero,
        .brp-canvas .brp-hero          { order: 1; }
        .brp-canvas .brp-top-row       { order: 2; }
        .brp-canvas .brp-mode-tabs     { order: 3; }
        .brp-canvas .brp-toolbar       { order: 4; }
        .brp-canvas > .brp-reader,
        .brp-canvas .brp-reader        { order: 5; }
        .brp-canvas .brp-progress-grid { order: 6; }
        .brp-canvas .brp-prayer        { order: 7; }

        /* ─────────────────────────────────────────────────────────────
           태블릿 세로 (≥600px) — 챕터 그리드 살짝 더 많은 칸, 리더 패딩 확장
           ────────────────────────────────────────────────────────────── */
        @media (min-width: 600px) {
          .brp-reader {
            padding: clamp(24px, 3vw, 32px) clamp(14px, 2vw, 22px);
          }
          .brp-grid {
            grid-template-columns: repeat(10, 1fr);
            gap: 10px;
          }
        }

        /* ─────────────────────────────────────────────────────────────
           태블릿 가로 + PC (≥960px) — 2-column 레이아웃 활성화.
           좌측 컬럼: 책 제목(hero) + 본문(reader)
           우측 컬럼(사이드바): 책 드롭다운/번역(top-row) → 읽기 모드(mode-tabs)
                              → 장 스위처(toolbar) → 진도 → 기도
           ────────────────────────────────────────────────────────────── */
        @media (min-width: 960px) {
          .brp-page {
            padding: 60px clamp(16px, 2vw, 24px) 88px;
          }
          /* 헤더 좌우 패딩을 캔버스 폭(1300px)과 동기화 — 뷰포트가 캔버스보다 넓을 땐
             (viewport - 1300)/2 만큼 들여 캔버스 양끝과 일치, 좁을 땐 최소 20px 유지. */
          .brp-header {
            padding: 6px max(20px, calc((100vw - 1300px) / 2));
            min-height: 44px;
          }

          /* 캔버스 = 2-col grid. 좌측 1fr(min 0), 우측 sidebar 300px.
             태블릿 범위(960~1199)에서 reader 폭을 충분히 확보하기 위해
             사이드바를 컴팩트한 300px 로 유지 (사이드 내부 컴포넌트도 본래
             "좁은 300px 폭" 기준으로 디자인되어 있어 내부 비례도 자연스럽다).
             ≥1200px 부터는 아래 @media 에서 940/460 으로 시원하게 확장.

             컨테이너 max 1300 ≈ ~960(reader) + 32(gap) + 300(side).
             hero 는 row 1 양쪽 컬럼 span (윗선만 차지). row 2 부터 reader 와
             side 가 같은 높이에서 시작 → 정렬 깔끔. */
          .brp-canvas {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 300px;
            grid-template-areas:
              "hero    hero"
              "reader  side";
            column-gap: 32px;
            row-gap: 14px;
            max-width: 1300px;
            margin: 8px auto 0;
            align-items: start;
          }
          /* grid area 매핑 — hero, reader, side 세 영역만. max-width/margin 리셋. */
          .brp-canvas > .brp-hero {
            grid-area: hero;
            max-width: none;
            margin: 0;
            padding-right: calc(300px + 32px);
            padding-bottom: 4px;
            text-align: center;
          }
          .brp-canvas > .brp-reader {
            grid-area: reader;
            max-width: none;
            margin: 0;
            align-self: start;
          }
          /* ⭐️ 우측 컬럼 wrapper — sticky 컨테이너.
             내부 스크롤 없음. 본문(reader) 스크롤하면 페이지 전체와 함께
             움직이는 것처럼 보이지만, 실제로는 viewport 상단 기준
             var(--brp-side-top) 위치에 고정됨.
             - 사이드바 < viewport: top 80px → 항상 같은 위치에 고정.
             - 사이드바 > viewport: JS 가 top 을 음수(viewport - sideHeight
               - margin) 로 설정 → 사이드바가 viewport 위로 일부 빠지며
               바닥(prayer 카드)이 viewport 안에 들어옴. 본문이 끝까지
               스크롤되는 동안 사이드바 바닥은 계속 보이고, 페이지 끝에
               도달하면 사이드바도 자연스럽게 캔버스 바닥과 함께 멈춤. */
          .brp-side {
            grid-area: side;
            display: flex;
            flex-direction: column;
            gap: 14px;
            position: sticky;
            top: var(--brp-side-top, 80px);
            align-self: start;
          }
          /* 사이드 내부 자식들 — grid area 매핑 불필요(flex item).
             order 리셋 (모바일용 order 가 PC 에선 의미 없게). */
          .brp-side > .brp-top-row,
          .brp-side > .brp-mode-tabs,
          .brp-side > .brp-toolbar,
          .brp-side > .brp-progress-grid,
          .brp-side > .brp-prayer {
            order: 0;
            max-width: none;
            margin: 0;
          }

          /* 좌측 reader — 본문은 항상 충분히 시원한 padding */
          .brp-reader {
            padding: clamp(28px, 3vw, 36px) clamp(22px, 2.5vw, 32px);
          }

          /* 사이드 내 컨트롤 — 좁은 300px 폭에 맞춰 살짝 컴팩트 */
          .brp-side .brp-top-row {
            grid-template-columns: 1fr 1fr;
            gap: 6px;
          }
          .brp-side .brp-mode-tabs--sm {
            /* 사이드 내에서도 위 row(40px, base 높이) 와 동일 높이 유지 */
            height: 40px;
            min-height: 40px;
          }
          .brp-side .brp-toolbar {
            justify-content: stretch;
          }
          .brp-side .brp-chapter-switcher {
            min-height: 40px;
            max-width: none;
          }

          /* 사이드 내 진도 + 기도 — 카드 톤(surface + border + radius)으로 통일.
             border-top 구분선 대신 카드 형태로. */
          .brp-side > .brp-progress-grid,
          .brp-side > .brp-prayer {
            padding: 20px 18px;
            background: var(--surface);
            border: 1px solid var(--line);
            border-radius: var(--radius-lg);
            border-top: none;
            padding-top: 20px;
          }
          /* 진도 — 사이드바 좁은 폭에선 1 컬럼 stack */
          .brp-side > .brp-progress-grid {
            grid-template-columns: 1fr;
            gap: 14px;
          }
          .brp-side > .brp-progress-grid h2 {
            font-size: 17px;
          }
          .brp-side > .brp-progress-grid .brp-section-label {
            margin-bottom: 6px;
            font-size: 11px;
          }
          /* 사이드바 안 챕터 칩 그리드 — 좁은 폭에 맞춰 6칸 */
          .brp-side > .brp-progress-grid .brp-grid {
            grid-template-columns: repeat(6, 1fr);
            gap: 6px;
          }
          .brp-side > .brp-progress-grid .brp-grid button {
            font-size: 12px;
          }
          /* 기도 카드 — 사이드바 좁은 폭에 맞춘 컴팩트 톤 */
          .brp-side > .brp-prayer h2 {
            font-size: 18px;
          }
          .brp-side > .brp-prayer .brp-prayer-header {
            flex-direction: column;
            align-items: stretch;
            gap: 12px;
          }
          .brp-side > .brp-prayer .brp-prayer-toggle {
            align-self: stretch;
            justify-content: center;
          }
          .brp-side > .brp-prayer .brp-prayer-toggle button {
            flex: 1;
            text-align: center;
          }
          .brp-side > .brp-prayer .brp-prayer-trigger {
            padding: 13px 14px;
            font-size: 15px;
            grid-template-columns: 30px 1fr 24px;
            gap: 10px;
          }
          .brp-side > .brp-prayer .brp-prayer-body {
            padding: 4px 14px 16px;
            gap: 16px;
          }
          .brp-side > .brp-prayer .brp-prayer-verse p,
          .brp-side > .brp-prayer .brp-prayer-think,
          .brp-side > .brp-prayer .brp-prayer-text {
            font-size: 14.5px;
            line-height: 1.8;
          }
          .brp-side > .brp-prayer .brp-prayer-lords {
            padding: 16px 14px;
          }
          .brp-side > .brp-prayer .brp-prayer-actions {
            flex-direction: column-reverse;
            align-items: stretch;
          }
          .brp-side > .brp-prayer .brp-prayer-mic,
          .brp-side > .brp-prayer .brp-prayer-check,
          .brp-side > .brp-prayer .brp-prayer-next,
          .brp-side > .brp-prayer .brp-prayer-restart {
            width: 100%;
            justify-content: center;
            padding: 10px 12px;
            font-size: 13px;
          }

          /* 하단 dock / speech message — 본문(좌측 컬럼) 가운데 정렬.
             캔버스 중심에서 좌측 컬럼 가운데 = 중심 - (gap + side)/2 = (32+300)/2 = 166px */
          .brp-dock,
          .brp-speech-message {
            left: calc(50% - 166px);
          }
          .brp-dock {
            max-width: 900px;
          }
        }

        /* 가로 태블릿의 짧은 세로 높이 (≈768h) — 헤더·dock 더 압축 */
        @media (min-width: 960px) and (max-height: 820px) {
          .brp-page {
            padding-top: 52px;
            padding-bottom: 72px;
          }
          .brp-header {
            padding-top: 5px;
            padding-bottom: 5px;
            min-height: 40px;
          }
          .brp-canvas {
            margin-top: 0;
            row-gap: 10px;
          }
          .brp-hero h1 {
            font-size: clamp(24px, 4vw, 34px);
          }
          .brp-dock {
            bottom: 10px;
            padding: 5px;
          }
          .brp-mic,
          .brp-manual,
          .brp-reset {
            padding: 7px 14px;
            font-size: 13px;
          }
        }

        /* ─────────────────────────────────────────────────────────────
           PC (≥1200px) — 본문/사이드바 폭 시원하게 확장
           ────────────────────────────────────────────────────────────── */
        @media (min-width: 1200px) {
          .brp-page {
            padding: 92px clamp(20px, 2vw, 32px) 112px;
          }
          /* 헤더 좌우 패딩을 PC 캔버스 폭(1460px)과 동기화. */
          .brp-header {
            padding: 6px max(24px, calc((100vw - 1460px) / 2));
          }
          .brp-canvas {
            grid-template-columns: minmax(0, 940px) 460px;
            column-gap: 60px;
            max-width: 1460px;
            margin-top: 16px;
          }
          /* hero — PC sidebar(460 + gap 60) 폭만큼 우측 비움 → reader 컬럼 가운데 정렬 */
          .brp-canvas > .brp-hero {
            padding-right: calc(460px + 60px);
          }
          .brp-side {
            gap: 16px;
          }
          .brp-side > .brp-progress-grid,
          .brp-side > .brp-prayer {
            padding: 22px 20px;
          }
          .brp-side > .brp-prayer h2 {
            font-size: 19px;
          }

          /* dock — 좌측 컬럼(940) 가운데 = 캔버스(1460) 중심 - (60+460)/2 = 260px */
          .brp-dock,
          .brp-speech-message {
            left: calc(50% - 260px);
          }
          .brp-dock {
            max-width: 900px;
          }
        }

        /* 대형 PC (≥1440px) — 여백 시원 */
        @media (min-width: 1440px) {
          .brp-page {
            padding-top: 100px;
            padding-bottom: 120px;
          }
          .brp-canvas {
            margin-top: 24px;
          }
        }

        /* ─────────────────────────────────────────────────────────────
           단일 컬럼 구간(PC 2-단 시작 960px 미만) — 책+번역, 읽기 모드,
           장 스위처 "세 줄"을 모두 캔버스 폭에 가득(edge-to-edge) 채우고
           동일 폭 + 동일 높이(40px) + 좁은 줄간격(6px)으로 통일.
           기본 룰의 max-width: 720px 가운데 정렬을 이 구간에서만 해제하고,
           캔버스의 flex gap(14px) 도 6px 로 줄여 row 사이 총 간격을 6px 로
           수렴시킨다 (flex 에선 gap + margin 이 합산되므로 row margin-bottom
           은 0 으로 리셋). */
        @media (max-width: 959px) {
          .brp-canvas {
            gap: 6px;
          }
          .brp-top-row,
          .brp-mode-tabs,
          .brp-toolbar,
          .brp-reader,
          .brp-progress-grid,
          .brp-prayer {
            max-width: none;
            width: 100%;
            margin: 0;
          }
          .brp-chapter-switcher {
            max-width: none;
            width: 100%;
            min-height: 40px;
          }
          /* 세 줄 모두 같은 높이로 — 책 드롭다운/번역 토글/모드 탭 */
          .brp-book-picker {
            height: 40px;
          }
          .brp-translation--sm {
            height: 40px;
            min-height: 40px;
          }
          .brp-mode-tabs--sm {
            height: 40px;
            min-height: 40px;
          }
          /* hero(책 제목) 와 첫 row 사이도 컴팩트 */
          .brp-hero {
            margin: 0 0 8px;
          }
        }

        @media (max-width: 760px) {
          .brp-page {
            padding-top: 60px;
            padding-left: 4px;
            padding-right: 4px;
            padding-bottom: 76px;
          }

          .brp-header {
            flex-direction: row;
            align-items: center;
            gap: 10px;
            padding: 10px 14px;
            min-height: 52px;
          }

          .brp-brand {
            padding: 4px 6px;
            margin-left: -6px;
            min-width: 0;
            flex: 0 1 auto;
          }

          .brp-mini-bar {
            min-height: 36px;
            font-size: 12.5px;
          }
          .brp-mini-content {
            min-height: 36px;
            padding: 0 12px;
            gap: 6px;
          }
          .brp-mini-title {
            max-width: 45vw;
          }

          .brp-nav {
            gap: 6px;
            flex-shrink: 0;
          }

          .brp-nav-link {
            height: 30px;
            padding: 0 9px;
            font-size: 12px;
            border-radius: var(--radius-pill);
            gap: 3px;
          }

          .brp-progress-grid {
            grid-template-columns: 1fr;
          }

          /* .brp-toolbar margin-bottom 은 위 (max-width: 959px) 통일(6px). */

          .brp-hero {
            margin-top: 14px;
            /* margin-bottom 은 위 (max-width: 959px) 통일(8px). */
          }

          .brp-section-label {
            margin-bottom: 8px;
            font-size: 10.5px;
            letter-spacing: 0.16em;
          }

          .brp-hero h1 {
            font-size: clamp(26px, 7vw, 34px);
            letter-spacing: -0.03em;
            line-height: 1.15;
          }

          /* .brp-chapter-switcher 의 min-height/width/margin 은 위 (max-width: 959px)
             블록에서 40px 풀폭으로 일괄 통일됨. 여기선 좌우 화살표 버튼 사이즈만 축소. */
          .brp-chapter-switcher button {
            width: 30px;
            height: 30px;
            font-size: 14px;
          }

          .brp-chapter-select select {
            font-size: 13.5px;
          }
          .brp-select-title {
            font-size: 13.5px;
          }

          .brp-reader {
            padding: 14px 2px;
            border-radius: var(--radius-lg);
          }

          .brp-verse {
            /* 모바일도 데스크탑과 동일한 정책: 2자리 절 번호가 컬럼 안에
               넉넉히 들어가고 본문과 명확히 띄어지도록 폭/간격 확보. */
            grid-template-columns: 1.9em minmax(0, 1fr);
            column-gap: 8px;
            /* margin-bottom / font-size / line-height 는 사용자 설정의
               CSS 변수로 결정 — 모바일에서 별도 하드코딩하지 않는다. */
            padding: 2px 0;
          }

          /* 책 드롭다운 — 모바일 내부 텍스트만 살짝 작게. 높이/풀폭/마진은
             위 (max-width: 959px) 블록에서 40px 풀폭으로 일괄 통일됨. */
          .brp-book-picker {
            padding: 0;
          }
          .brp-book-picker select {
            font-size: 14px;
            padding: 0 14px;
          }
          .brp-book-picker::after {
            right: 14px;
          }

          /* 모드 탭 — 내부 라벨만 살짝 작게. 높이/풀폭/마진은 위 (959px) 통일. */
          .brp-mode-tabs--sm .brp-mode-tab {
            padding: 5px 12px;
            font-size: 13px;
          }

          .brp-quiz {
            padding: 12px;
          }

          .brp-quiz-card {
            padding: 20px 18px;
            border-radius: var(--radius-lg);
          }

          .brp-quiz-card h2 {
            font-size: 19px;
          }

          .brp-quiz-sub {
            font-size: 12.5px;
            margin-bottom: 18px;
          }

          .brp-quiz-item {
            padding: 14px 14px 12px;
          }

          .brp-quiz-blanked {
            font-size: 14.5px;
            line-height: 1.7;
          }

          .brp-quiz-options {
            grid-template-columns: 1fr 1fr;
            gap: 6px;
          }

          .brp-quiz-opt {
            padding: 10px 8px;
            font-size: 13.5px;
          }

          .brp-quiz-actions {
            gap: 6px;
          }

          .brp-quiz-cancel,
          .brp-quiz-submit {
            padding: 10px 14px;
            font-size: 13px;
          }

          .brp-scroll-status {
            padding: 10px 8px;
            font-size: 12px;
          }

          .brp-progress-grid {
            margin-top: 36px;
            padding: 20px 16px;
            background: var(--surface);
            border: 1px solid var(--line);
            border-radius: var(--radius-lg);
            border-top: 1px solid var(--line);
            gap: 16px;
          }

          .brp-progress-grid h2,
          .brp-prayer h2 {
            font-size: 19px;
          }

          .brp-grid {
            grid-template-columns: repeat(6, 1fr);
            gap: 10px;
          }

          .brp-grid button {
            font-size: 13px;
          }

          .brp-prayer {
            margin-top: 24px;
            padding: 20px 16px;
            background: var(--surface);
            border: 1px solid var(--line);
            border-radius: var(--radius-lg);
            border-top: 1px solid var(--line);
          }

          .brp-prayer-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 14px;
            margin-bottom: 16px;
          }

          .brp-prayer-bar {
            margin-bottom: 18px;
          }

          .brp-prayer-toggle {
            align-self: stretch;
            justify-content: center;
          }

          .brp-prayer-toggle button {
            flex: 1;
            text-align: center;
          }

          .brp-prayer-list {
            gap: 12px;
          }

          .brp-prayer-item {
            border-radius: var(--radius-lg);
          }

          .brp-prayer-trigger {
            grid-template-columns: 32px 1fr 26px;
            gap: 10px;
            padding: 14px 14px;
            font-size: 15.5px;
          }

          .brp-prayer-body {
            padding: 4px 14px 18px;
            gap: 18px;
          }

          .brp-prayer-verse p,
          .brp-prayer-think,
          .brp-prayer-text,
          .brp-prayer-lords p:last-child {
            font-size: 15px;
            line-height: 1.85;
          }

          .brp-prayer-lords {
            padding: 20px 18px;
          }

          .brp-prayer-actions {
            flex-direction: column-reverse;
            align-items: stretch;
          }

          .brp-prayer-mic,
          .brp-prayer-check,
          .brp-prayer-next,
          .brp-prayer-restart {
            width: 100%;
            text-align: center;
            padding: 12px 14px;
            justify-content: center;
          }

          .brp-dock {
            width: calc(100% - 16px);
            flex-wrap: nowrap;
            justify-content: center;
            gap: 4px;
            padding: 5px 6px;
            border-radius: var(--radius-pill);
            bottom: 10px;
          }

          /* 모바일에서 dock 이 위로 올라간 만큼 복사 바도 자연스럽게 위로. */
          .brp-copy-bar {
            bottom: 62px;
            padding: 5px 8px 5px 12px;
            gap: 6px;
            font-size: 12.5px;
          }
          .brp-copy-btn {
            padding: 6px 12px;
            font-size: 12.5px;
          }
          .brp-copy-all,
          .brp-copy-cancel {
            padding: 5px 10px;
            font-size: 12px;
          }
          .brp-copy-toast {
            bottom: 110px;
            padding: 9px 16px;
            font-size: 12.5px;
          }

          .brp-count {
            display: none;
          }

          .brp-mic,
          .brp-manual {
            flex: 1 1 0;
            min-width: 0;
            justify-content: center;
            padding: 7px 8px;
            font-size: 12.5px;
            gap: 4px;
          }

          .brp-reset {
            flex: 1 1 0;
            min-width: 0;
            justify-content: center;
            padding: 7px 8px;
            font-size: 12px;
          }

          .brp-mic span {
            width: 6px;
            height: 6px;
          }
        }

        @media (max-width: 380px) {
          .brp-dock {
            gap: 4px;
            padding: 7px 8px;
          }

          .brp-mic,
          .brp-manual,
          .brp-reset {
            padding: 9px 6px;
            font-size: 11.5px;
            letter-spacing: -0.02em;
          }

          .brp-mic {
            gap: 4px;
          }
        }
      `}</style>
    </main>
  );
}
