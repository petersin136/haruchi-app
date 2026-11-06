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

export type StartCheck =
  | { ok: true }
  | { ok: false; reason: "before-prev" | "after-next"; neighbor: ChapterTarget };

/** chapter장 시작을 seconds로 둘 때 앞 장보다 늦고 다음 장보다 이른지(엄격한 오름차순). */
export function checkChapterStart(starts: ChapterStarts, chapter: number, seconds: number): StartCheck {
  const prev = findPrevChapter(chapter, starts);
  if (prev && seconds <= prev.start) return { ok: false, reason: "before-prev", neighbor: prev };
  const next = findNextChapter(chapter, starts);
  if (next && seconds >= next.start) return { ok: false, reason: "after-next", neighbor: next };
  return { ok: true };
}

export function describeStartCheck(chapter: number, seconds: number, check: StartCheck): string {
  if (check.ok) return "";
  const { neighbor } = check;
  return check.reason === "before-prev"
    ? `${chapter}장 시작 ${seconds}초가 ${neighbor.chapter}장 시작 ${neighbor.start}초보다 이르거나 같음`
    : `${chapter}장 시작 ${seconds}초가 ${neighbor.chapter}장 시작 ${neighbor.start}초보다 늦거나 같음`;
}

export function loadChapterStarts(): ChapterStarts {
  if (typeof window === "undefined") return GENESIS_DEFAULT_STARTS;
  try {
    const raw = window.localStorage.getItem(STARTS_STORAGE_KEY);
    if (!raw) return GENESIS_DEFAULT_STARTS;
    const stored: unknown = JSON.parse(raw);
    if (!Array.isArray(stored)) return GENESIS_DEFAULT_STARTS;
    const merged: (number | null)[] = [...GENESIS_DEFAULT_STARTS];
    for (let i = 0; i < merged.length; i += 1) {
      const v: unknown = stored[i];
      if (!isValidStart(v) || v === merged[i]) continue;
      const fallback = merged[i];
      merged[i] = null;
      const check = checkChapterStart(merged, i + 1, v);
      if (check.ok) {
        merged[i] = v;
      } else {
        merged[i] = fallback;
        console.warn(`[watch] 저장된 장 기록 무시: ${describeStartCheck(i + 1, v, check)}`);
      }
    }
    return merged;
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

export type ChapterTarget = { chapter: number; start: number };

/** 기록된 장 시작을 시간순으로 정렬한 배열. */
export function sortedStarts(starts: ChapterStarts): ChapterTarget[] {
  const list: ChapterTarget[] = [];
  starts.forEach((s, i) => {
    if (s !== null) list.push({ chapter: i + 1, start: s });
  });
  return list.sort((a, b) => a.start - b.start || a.chapter - b.chapter);
}

/** 현재 시간 이하인 가장 큰 장 시작의 장(1부터). 첫 기록 이전이면 1장. */
export function chapterAt(seconds: number, starts: ChapterStarts): number {
  const list = sortedStarts(starts);
  let lo = 0;
  let hi = list.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].start <= seconds) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found === -1 ? 1 : list[found].chapter;
}

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
