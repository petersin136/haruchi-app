"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import proverbsData from "./proverbs.json";
import matthewData from "./matthew.json";
import markData from "./mark.json";
import lukeData from "./luke.json";
import johnData from "./john.json";
import prayersJson from "./prayers.json";
import { BOOKS, BOOK_ORDER, type BookId } from "./books";
import StudentIdentityBar, {
  type StudentIdentityBarHandle,
} from "./components/StudentIdentityBar";
import {
  fetchCompletedChapters,
  flushPendingLogs,
  recordChapterCompletion,
  type IdentifiedStudent,
} from "../lib/bibleReadingProgress";
import Wordmark from "../components/Wordmark";

type TranslationKey = "krv" | "kids";

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

type Chapter = {
  chapter: number;
  title: string;
  verses: Record<TranslationKey, Verse[]>;
};

type BibleData = {
  translations: Record<TranslationKey, { label: string; note?: string }>;
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

const BOOK_DATA: Record<BookId, BibleData> = {
  proverbs: proverbsData as BibleData,
  matthew: matthewData as BibleData,
  mark: markData as BibleData,
  luke: lukeData as BibleData,
  john: johnData as BibleData,
};

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
  // 현재 듣고 있는 (= 아직 다 안 읽은 첫 번째) 절 안에서, 노래방 가사처럼
  // 왼쪽부터 색이 차오르도록 단어 단위 진행도를 따로 추적한다.
  const [currentVerseWordIndex, setCurrentVerseWordIndex] = useState(0);
  const [doneChapters, setDoneChapters] = useState<Set<number>>(new Set());
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
  // SSR 환경에서는 window가 없어 false가 되며, HMR/하이드레이션 도중 그 값이 굳어
  // 마이크 버튼이 disabled 상태로 멈춰버리는 일이 있다. 기본값을 true로 두고
  // 클라이언트 마운트 후 실제 API 지원 여부로 보정한다.
  const [speechSupported, setSpeechSupported] = useState(true);
  const [currentStudent, setCurrentStudent] = useState<IdentifiedStudent | null>(
    null,
  );

  const listeningRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const readVerseCountRef = useRef(0);
  const currentVerseWordIndexRef = useRef(0);
  const minReadTimeRef = useRef(0);
  const reachedBottomRef = useRef(false);
  const readerSectionRef = useRef<HTMLElement | null>(null);
  const prayerListeningRef = useRef<number | null>(null);
  const prayerRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const prayerReadCountRefs = useRef<Record<number, number>>({});
  const currentStudentRef = useRef<IdentifiedStudent | null>(null);
  const identityRef = useRef<StudentIdentityBarHandle | null>(null);

  useEffect(() => {
    currentStudentRef.current = currentStudent;
  }, [currentStudent]);

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
      // 본문 진행도 — top 이 0 일 때 0%, bottom 이 0 일 때 100%.
      const total = rect.height;
      const passed = Math.max(0, Math.min(total, -rect.top));
      const ratio = total > 0 ? passed / total : 0;
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
  const hasKrv = chapter.verses.krv.length > 0;
  const hasKids = chapter.verses.kids.length > 0;
  const effectiveTranslation: TranslationKey =
    translation === "krv" && !hasKrv && hasKids ? "kids" : translation;
  const verses = chapter.verses[effectiveTranslation];

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
          translation: effectiveTranslation,
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
    currentVerseWordIndexRef.current = 0;
    setCurrentVerseWordIndex(0);
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

  // 장 전체 단어를 평탄화한 토큰 리스트.
  // 단어 단위 advance 후 절/절 안 인덱스로 역산해서 노래방 가사처럼
  // 왼쪽부터 차오르고, "다음 절의 단어가 잡히기 시작할 때" 비로소
  // 이전 절이 통째로 '읽음' 처리되도록 한다.
  const chapterTokens = useMemo<WordToken[]>(() => {
    return verses.flatMap((verse) =>
      verse.t
        .split(/\s+/)
        .map((w) => w.trim())
        .filter(Boolean)
        .map((word, index) => ({
          id: `verse-${verse.n}-${index}`,
          verse: verse.n,
          text: word,
          normalized: normalizeKorean(word),
        })),
    );
  }, [verses]);

  const verseWordCounts = useMemo(
    () =>
      verses.map(
        (v) =>
          v.t
            .split(/\s+/)
            .map((w) => w.trim())
            .filter(Boolean).length,
      ),
    [verses],
  );

  const wordIndexFromVerseProgress = useCallback(
    (verseCount: number, wordInVerse: number) => {
      let total = 0;
      const cap = Math.min(verseCount, verseWordCounts.length);
      for (let i = 0; i < cap; i += 1) total += verseWordCounts[i];
      return total + wordInVerse;
    },
    [verseWordCounts],
  );

  const verseProgressFromWordIndex = useCallback(
    (wordIdx: number) => {
      let vc = 0;
      let remaining = wordIdx;
      for (const c of verseWordCounts) {
        if (remaining >= c) {
          vc += 1;
          remaining -= c;
        } else {
          break;
        }
      }
      return { verseCount: vc, wordInVerse: remaining };
    },
    [verseWordCounts],
  );

  const processTranscript = useCallback(
    (transcript: string) => {
      if (!hasFilledText || chapterTokens.length === 0) return;
      const startGlobalIdx = wordIndexFromVerseProgress(
        readVerseCountRef.current,
        currentVerseWordIndexRef.current,
      );
      if (startGlobalIdx >= chapterTokens.length) return;

      const newGlobalIdx = advanceReadIndex(
        transcript,
        chapterTokens,
        startGlobalIdx,
      );
      if (newGlobalIdx <= startGlobalIdx) return;

      const { verseCount: newVerseCount, wordInVerse: newWordInVerse } =
        verseProgressFromWordIndex(newGlobalIdx);

      if (newVerseCount !== readVerseCountRef.current) {
        readVerseCountRef.current = newVerseCount;
        setReadVerseCount(newVerseCount);
        window.localStorage.setItem(
          verseProgressKey(bookId, chapterNumber),
          String(newVerseCount),
        );
      }
      if (newWordInVerse !== currentVerseWordIndexRef.current) {
        currentVerseWordIndexRef.current = newWordInVerse;
        setCurrentVerseWordIndex(newWordInVerse);
      }
    },
    [
      bookId,
      chapterNumber,
      chapterTokens,
      hasFilledText,
      verseProgressFromWordIndex,
      wordIndexFromVerseProgress,
    ],
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
    currentVerseWordIndexRef.current = 0;
    setCurrentVerseWordIndex(0);
    setScrollReady(false);
    setScrollReachedBottom(false);
    reachedBottomRef.current = false;

    // 장마다 최소 읽기 시간: "한 줄(절) 당 0.5초" 가 사용자 합의된 속도.
    // 빠르게 훑는 사람도 거의 막히지 않도록.
    // - 절 한 줄 = 0.5초
    // - 최소 2초 (1~3절짜리 단편도 너무 빨리 넘어가지 않도록)
    const verseCount = verses.length;
    const computedSeconds = Math.max(2, Math.ceil(verseCount * 0.5));
    setChapterMinSeconds(computedSeconds);
    setScrollSecondsLeft(computedSeconds);
    minReadTimeRef.current = Date.now() + computedSeconds * 1000;
  }, [bookId, chapterNumber, totalVerses, translation, verses]);

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
      className={`brp-page ${miniVisible ? "is-scrolled" : ""} ${
        scrolled && !miniVisible ? "is-past-reader" : ""
      }`}
    >
      <header className={`brp-header ${scrolled ? "is-hidden" : ""}`}>
        <a className="brp-brand" href="/" aria-label="하루치 홈으로">
          <Wordmark size="lg" />
        </a>
        <nav className="brp-nav" aria-label="Account links">
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
      </header>

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

      <section className="brp-hero">
        <h1>{bookMeta.name}</h1>
      </section>

      {/* Row 1: [책 드롭다운] [번역 토글] — 한 줄, 컴팩트 */}
      <section className="brp-top-row" aria-label="성경 책과 번역 선택">
        <label className="brp-book-picker">
          <span className="brp-sr-only">성경 책</span>
          <select
            value={bookId}
            onChange={(event) => changeBook(event.target.value as BookId)}
            aria-label="성경 책 선택"
          >
            {BOOK_ORDER.map((id) => (
              <option key={id} value={id}>
                {BOOKS[id].name}
              </option>
            ))}
          </select>
        </label>

        <div className="brp-translation brp-translation--sm">
          {(Object.keys(data.translations) as TranslationKey[]).map((key) => {
            const isKrvDisabled = key === "krv" && !hasKrv;
            return (
              <button
                key={key}
                type="button"
                className={`${
                  effectiveTranslation === key ? "is-active" : ""
                } ${isKrvDisabled ? "is-disabled" : ""}`}
                disabled={isKrvDisabled}
                title={
                  isKrvDisabled
                    ? "이 책의 개역한글 본문은 아직 준비되지 않았어요."
                    : undefined
                }
                onClick={() => setTranslation(key)}
              >
                {data.translations[key].label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Row 2: 읽기 모드 — 슬림 */}
      <section
        className="brp-mode-tabs brp-mode-tabs--sm"
        role="tablist"
        aria-label="읽기 모드 선택"
      >
        <button
          type="button"
          role="tab"
          aria-selected={readingMode === "mic"}
          className={`brp-mode-tab ${readingMode === "mic" ? "is-active" : ""}`}
          onClick={() => handleReadingModeChange("mic")}
        >
          직접 읽기
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={readingMode === "scroll"}
          className={`brp-mode-tab ${readingMode === "scroll" ? "is-active" : ""}`}
          onClick={() => handleReadingModeChange("scroll")}
        >
          스크롤로 읽기
        </button>
      </section>

      {/* Row 3: 장 스위처 */}
      <section className="brp-toolbar" aria-label="장 선택">
        <div className="brp-chapter-switcher">
          <button type="button" onClick={() => moveChapter(chapterNumber - 1)} aria-label="이전 장">
            ←
          </button>
          <label className="brp-chapter-select">
            <select
              value={chapterNumber}
              onChange={(event) => moveChapter(Number(event.target.value))}
              aria-label={`${bookMeta.name} 장 선택`}
            >
              {data.chapters.map((item) => (
                <option key={item.chapter} value={item.chapter}>
                  제 {item.chapter} 장
                </option>
              ))}
            </select>
            {chapter.title ? (
              <span className="brp-select-title">· {chapter.title}</span>
            ) : null}
          </label>
          <button type="button" onClick={() => moveChapter(chapterNumber + 1)} aria-label="다음 장">
            →
          </button>
        </div>
      </section>

      <section
        ref={readerSectionRef}
        className="brp-reader"
        aria-label={`${bookMeta.name} ${chapterNumber}장 본문`}
      >
        {!hasFilledText && (
          <p className="brp-reader-empty">
            이 장의 {translation === "krv" ? "개역한글" : "어린이 쉬운"} 본문이
            아직 준비되지 않았어요. 다른 번역을 선택해 보세요.
          </p>
        )}
        {verses.map((verse, idx) => {
          // 스크롤 모드는 "스크롤 + 최소 시간 + 퀴즈"가 모두 끝나
          // 장 자체가 완료(readVerseCount === totalVerses)됐을 때만
          // 절 색을 바꾼다. 그 외에는 절별 진행 색을 절대 표시하지 않는다.
          const chapterFullyRead =
            totalVerses > 0 && readVerseCount >= totalVerses;
          const isRead =
            readingMode === "scroll"
              ? chapterFullyRead
              : idx < readVerseCount;
          const isCurrent =
            readingMode === "mic" &&
            listening &&
            !isRead &&
            idx === readVerseCount;
          const karaokeWords = isCurrent
            ? verse.t.split(/\s+/).filter(Boolean)
            : null;
          return (
            <div
              key={`${bookId}-${chapterNumber}-${effectiveTranslation}-${verse.n}`}
              className={`brp-verse ${isRead ? "is-read" : ""} ${
                isCurrent ? "is-current" : ""
              }`}
            >
              <span className="brp-verse-number">{verse.n}</span>
              {karaokeWords ? (
                <p className="brp-verse-text">
                  {karaokeWords.map((word, wIdx) => (
                    <span
                      key={`${verse.n}-${wIdx}`}
                      className={`brp-verse-word ${
                        wIdx < currentVerseWordIndex ? "is-read" : ""
                      }`}
                    >
                      {word}
                    </span>
                  ))}
                </p>
              ) : (
                <p className="brp-verse-text">{verse.t}</p>
              )}
            </div>
          );
        })}
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
            className="brp-prayer-toggle"
            role="tablist"
            aria-label="학년 선택"
          >
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
          font-family: Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui,
            sans-serif;
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
          background: rgba(250, 250, 248, 0.85);
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
        /* 좌→우로 채워지는 그린 에너지바 — readerProgress(0~1) × 100% width. */
        .brp-mini-fill {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 0;
          background: linear-gradient(
            90deg,
            rgba(46, 93, 75, 0.55) 0%,
            rgba(46, 93, 75, 0.85) 100%
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
          font-family: "Noto Serif KR", "AppleSDGothicNeoSerif", "Apple SD Gothic Neo",
            "Nanum Myeongjo", "Source Han Serif K", "Iowan Old Style", "Times New Roman",
            "Pretendard Variable", Pretendard, serif;
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
          transition: background 0.18s ease, color 0.18s ease;
        }

        .brp-translation button:hover:not(:disabled):not(.is-active) {
          background: var(--surface-alt);
          color: var(--ink);
        }

        .brp-translation button.is-active {
          background: var(--accent);
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

        /* 장 번호 + 부제목 한 줄. 화살표와 살짝 떨어지면서, 컨텐츠는 중앙 가까이
           쏠리도록 좌측 패딩 크게(완전 정중앙은 아님). */
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
        }

        .brp-verse {
          display: grid;
          grid-template-columns: 1.4em minmax(0, 1fr);
          column-gap: clamp(4px, 0.6vw, 8px);
          align-items: start;
          margin: 0 0 20px;
          padding: 4px 0;
          border-radius: var(--radius-md);
          font-size: clamp(16px, 1.6vw, 19px);
          line-height: 1.9;
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

        .brp-verse.is-current {
          /* 현재 듣고 있는 절 — 좌측 컬러바 같은 AI 풍 액센트 대신,
             옅은 표면 톤 + 부드러운 글로우만으로 차분히 강조. */
          background: var(--surface-alt);
          border-radius: 6px;
        }

        .brp-verse-number {
          color: var(--ink-mute);
          font-size: 1em;
          line-height: inherit;
          text-align: right;
          font-variant-numeric: tabular-nums;
          transition: color 0.3s ease;
        }

        .brp-verse-text {
          min-width: 0;
          margin: 0;
          overflow-wrap: break-word;
          /* 강조 시 weight 가 아닌 text-shadow 로 처리하므로 부드럽게 페이드. */
          transition: text-shadow 0.25s ease, color 0.25s ease;
        }

        .brp-verse-word {
          display: inline;
          margin-right: 0.28em;
          color: inherit;
          transition: color 0.28s ease, font-weight 0.28s ease;
        }

        .brp-verse-word.is-read {
          color: var(--accent-warm);
          /* 같은 이유로 weight 변경하지 않음 — 가라오케 진행 중에 줄바꿈이
             밀려나지 않도록 text-shadow 로 약한 볼드 흉내. */
          text-shadow: 0 0 0.35px currentColor;
        }

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

        /* 컴팩트 번역 토글 — 같은 40px 높이. 내부 버튼은 flex stretch 로 정확히 중앙. */
        .brp-translation--sm {
          height: 40px;
          min-height: 40px;
          padding: 4px;
        }
        .brp-translation--sm button {
          padding: 0 12px;
          font-size: 13px;
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

        /* 모드 탭 — pill 컨테이너 + pill 버튼. 슬림 변형(--sm)은 36px 높이. */
        .brp-mode-tabs {
          max-width: var(--container-reading);
          margin: 0 auto 14px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-pill);
          padding: 5px;
          min-height: 52px;
          box-sizing: border-box;
          align-items: stretch;
        }

        .brp-mode-tabs--sm {
          min-height: 36px;
          padding: 3px;
          gap: 4px;
          margin-bottom: 10px;
        }

        .brp-mode-tab {
          all: unset;
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
          transition: background 0.18s ease, color 0.18s ease;
        }

        .brp-mode-tabs--sm .brp-mode-tab {
          padding: 5px 14px;
          font-size: 13px;
        }

        .brp-mode-tab:hover:not(.is-active) {
          background: var(--surface-alt);
          color: var(--ink);
        }

        .brp-mode-tab.is-active {
          background: var(--accent);
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
          aspect-ratio: 1;
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

        .brp-prayer-toggle {
          display: inline-flex;
          align-items: center;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-pill);
          padding: 4px;
          flex-shrink: 0;
        }

        .brp-prayer-toggle button {
          border: 0;
          cursor: pointer;
          font: inherit;
          padding: 7px 14px;
          border-radius: var(--radius-pill);
          background: transparent;
          color: var(--ink-soft);
          font-size: 13px;
          font-weight: 600;
          letter-spacing: -0.01em;
        }

        .brp-prayer-toggle button.is-active {
          background: var(--accent);
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
          font-family: "Noto Serif KR", "Apple SD Gothic Neo", "Nanum Myeongjo",
            "Iowan Old Style", "Times New Roman", serif;
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
          font-family: "Noto Serif KR", "Apple SD Gothic Neo", "Nanum Myeongjo",
            "Iowan Old Style", "Times New Roman", serif;
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
          background: rgba(255, 255, 255, 0.92);
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

          .brp-toolbar {
            margin-bottom: 18px;
          }

          .brp-hero {
            margin-top: 18px;
            margin-bottom: 20px;
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

          .brp-chapter-switcher {
            min-height: 40px;
          }

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
            grid-template-columns: 1.2em minmax(0, 1fr);
            column-gap: 4px;
            margin-bottom: 14px;
            padding: 3px 0;
            font-size: 16.5px;
            line-height: 1.8;
          }

          /* 책 드롭다운 — 모바일 살짝 더 작은 높이, 중앙 정렬 유지 */
          .brp-book-picker {
            height: 38px;
            padding: 0;
          }
          .brp-book-picker select {
            font-size: 14px;
            padding: 0 14px;
          }
          .brp-book-picker::after {
            right: 14px;
          }

          /* 컴팩트 번역 토글 — 모바일에서도 같은 폭 비율 유지 */
          .brp-translation--sm {
            height: 38px;
            min-height: 38px;
          }
          .brp-translation--sm button {
            padding: 0 8px;
            font-size: 12.5px;
          }

          .brp-mode-tabs--sm {
            min-height: 34px;
            padding: 3px;
            margin-bottom: 10px;
          }
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
