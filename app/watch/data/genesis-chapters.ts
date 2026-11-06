// 리딩지저스 창세기 영상의 장별 시작 시간(초).
// 비어 있는 장(null)은 /watch/genesis?dev=1 의 기록 버튼으로 채운 뒤
// 콘솔에 출력된 배열을 GENESIS_DEFAULT_STARTS 에 옮겨 붙이면 된다.

export const GENESIS_VIDEO_ID = "YslfYAunGF4";
export const GENESIS_TOTAL_CHAPTERS = 50;

export type ChapterStarts = ReadonlyArray<number | null>;

const KNOWN_STARTS: number[] = [7, 314, 538, 808, 1076, 1245];

export const GENESIS_DEFAULT_STARTS: ChapterStarts = Array.from(
  { length: GENESIS_TOTAL_CHAPTERS },
  (_, i) => KNOWN_STARTS[i] ?? null,
);

const STARTS_STORAGE_KEY = "haruchi:watch:genesis:chapter-starts";

const isValidStart = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

export function loadChapterStarts(): ChapterStarts {
  if (typeof window === "undefined") return GENESIS_DEFAULT_STARTS;
  try {
    const raw = window.localStorage.getItem(STARTS_STORAGE_KEY);
    if (!raw) return GENESIS_DEFAULT_STARTS;
    const stored: unknown = JSON.parse(raw);
    if (!Array.isArray(stored)) return GENESIS_DEFAULT_STARTS;
    return GENESIS_DEFAULT_STARTS.map((fallback, i) =>
      isValidStart(stored[i]) ? stored[i] : fallback,
    );
  } catch {
    return GENESIS_DEFAULT_STARTS;
  }
}

export function saveChapterStarts(starts: ChapterStarts): void {
  try {
    window.localStorage.setItem(STARTS_STORAGE_KEY, JSON.stringify(starts));
  } catch {
    /* 저장 공간 부족·사생활 모드 — 무시 */
  }
}

export function clearChapterStarts(): void {
  try {
    window.localStorage.removeItem(STARTS_STORAGE_KEY);
  } catch {
    /* noop */
  }
}

/** 현재 시간이 속한 장(1부터). 첫 기록 이전이면 1장. */
export function chapterAt(seconds: number, starts: ChapterStarts): number {
  let current = 1;
  for (let i = 0; i < starts.length; i += 1) {
    const s = starts[i];
    if (s !== null && s <= seconds) current = i + 1;
  }
  return current;
}

export type ChapterTarget = { chapter: number; start: number };

export function findNextChapter(chapter: number, starts: ChapterStarts): ChapterTarget | null {
  for (let i = chapter; i < starts.length; i += 1) {
    const s = starts[i];
    if (s !== null) return { chapter: i + 1, start: s };
  }
  return null;
}

export function findPrevChapter(chapter: number, starts: ChapterStarts): ChapterTarget | null {
  for (let i = chapter - 2; i >= 0; i -= 1) {
    const s = starts[i];
    if (s !== null) return { chapter: i + 1, start: s };
  }
  return null;
}

export function firstEmptyChapter(starts: ChapterStarts): number | null {
  const i = starts.findIndex((s) => s === null);
  return i === -1 ? null : i + 1;
}
