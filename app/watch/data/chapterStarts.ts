// 장별 시작 시간(초) 해석·개발 모드 기록.
// 기준값은 public/watch-times/{book}.json 의 chapters[n].start 이고,
// books.ts 의 defaultStarts 는 파일을 못 받을 때(또는 파일에 빠진 장)의 대체값이다.
// /watch/{book}?dev=1 의 기록 버튼으로 남긴 값은 장별 덮어쓰기로 localStorage 에 쌓인다.

import { WATCH_BOOKS, type ChapterStarts, type WatchBookId } from "./books";

export type { ChapterStarts };
/** 개발 모드 기록값. { 장: 초 } */
export type StartOverrides = Readonly<Record<number, number>>;

const isValidStart = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

const startsKey = (book: WatchBookId) => `haruchi:watch:${book}:chapter-starts`;

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

/** value 를 chapter장 시작으로 끼워 넣되 순서가 깨지면 경고 후 기존 값을 둔다. */
function placeStart(starts: (number | null)[], chapter: number, value: number, label: string): void {
  const i = chapter - 1;
  if (starts[i] === value) return;
  const kept = starts[i];
  starts[i] = null;
  const check = checkChapterStart(starts, chapter, value);
  if (check.ok) {
    starts[i] = value;
  } else {
    starts[i] = kept;
    console.warn(`[watch] ${label} 무시: ${describeStartCheck(chapter, value, check)}`);
  }
}

/**
 * 장 시작 배열 = 파일 값(없으면 대체값) + 개발 모드 기록값.
 * fileStarts 가 null 이면 파일을 못 받은 것으로 보고 대체값만 쓴다.
 */
export function resolveChapterStarts(
  book: WatchBookId,
  fileStarts: ChapterStarts | null,
  overrides: StartOverrides,
): ChapterStarts {
  const { totalChapters, defaultStarts } = WATCH_BOOKS[book];
  const hasFile = !!fileStarts && fileStarts.some(isValidStart);
  const merged: (number | null)[] = hasFile
    ? Array.from({ length: totalChapters }, () => null)
    : [...defaultStarts];
  if (hasFile) {
    fileStarts!.slice(0, totalChapters).forEach((v, i) => {
      if (isValidStart(v)) placeStart(merged, i + 1, v, "파일 장 시작");
    });
    defaultStarts.forEach((v, i) => {
      if (merged[i] === null && v !== null) placeStart(merged, i + 1, v, "대체 장 시작");
    });
  }
  for (const [k, v] of Object.entries(overrides)) {
    const chapter = Number(k);
    if (Number.isInteger(chapter) && chapter >= 1 && chapter <= totalChapters && isValidStart(v)) {
      placeStart(merged, chapter, v, "저장된 장 기록");
    }
  }
  return merged;
}

export function loadStartOverrides(book: WatchBookId): StartOverrides {
  if (typeof window === "undefined") return {};
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(startsKey(book)) ?? "{}");
    const out: Record<number, number> = {};
    const defaults = WATCH_BOOKS[book].defaultStarts;
    if (Array.isArray(stored)) {
      // 예전 형식(창세기): 대체값을 포함한 전체 배열 — 대체값과 다른 칸만 기록값으로 본다.
      stored.forEach((v, i) => {
        if (isValidStart(v) && v !== defaults[i]) out[i + 1] = v;
      });
    } else if (stored && typeof stored === "object") {
      for (const [k, v] of Object.entries(stored as Record<string, unknown>)) {
        if (/^\d+$/.test(k) && isValidStart(v)) out[Number(k)] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveStartOverrides(book: WatchBookId, overrides: StartOverrides): void {
  try {
    window.localStorage.setItem(startsKey(book), JSON.stringify(overrides));
  } catch {
    /* 저장 공간 부족·사생활 모드 — 무시 */
  }
}

export function clearChapterStarts(book: WatchBookId): void {
  try {
    window.localStorage.removeItem(startsKey(book));
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
