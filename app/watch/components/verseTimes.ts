import type { BookId } from "@/app/bible-reading/books";

// public/watch-times/{bookId}.json — 절 시작 시간(초).
//   { videoId, chapters: { "1": { start, end, verses: [9.0, …] } }, missing: [6, 7, …] }
//   start = 장 시작 초, verses[i] = (i+1)절 시작 초. missing 장은 시간 데이터가 없는 장.
//   (대체 경로: 평면 { "1:14": 121.3 } / 장별 중첩 { "1": { "14": 121.3 } })
// 개발 모드에서 기록한 보정값은 localStorage 에 { "1:14": 121.3 } 형태로 쌓이고,
// "JSON 복사" 결과를 data/verse-times-fix/{bookId}.json 에 붙여 쓴다.

export type VerseTimeMap = Record<string, number>;
/** "1:14" → "interp" | "match" | … (파일에 있을 때만) */
export type VerseSrcMap = Record<string, string>;
/** starts[i] = (i+1)장 시작 초. 파일에 없으면 null. */
export type WatchTimes = {
  times: VerseTimeMap;
  missing: number[];
  starts: (number | null)[];
  src: VerseSrcMap;
  /** public/watch-times/{book}.json 을 실제로 받았는지(404면 false) */
  present: boolean;
};
export type VerseEntry = { verse: number; t: number; explicit: boolean };
export type VerseIndex = Map<number, VerseEntry[]>;
export type VersePos = { chapter: number; verse: number };

/** 절·장 시작 seek 시 앞당기는 여유(초). 현재 절 표시에도 동일 기준. */
export const VERSE_LEAD_S = 0.3;
/** seek 후 위치가 목표와 이만큼(초) 이상 어긋나면 한 번 더 seek */
export const SEEK_VERIFY_TOLERANCE_S = 1;
export const SEEK_VERIFY_DELAY_MS = 500;
/** dev 미세 조정 단위(초) */
export const VERSE_NUDGE_S = 0.2;

export const verseKey = (chapter: number, verse: number) => `${chapter}:${verse}`;

function parseKey(key: string): VersePos | null {
  const m = key.match(/^(\d+):(\d+)$/);
  return m ? { chapter: Number(m[1]), verse: Number(m[2]) } : null;
}

const validTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

function normalizeTimes(raw: unknown): VerseTimeMap {
  const out: VerseTimeMap = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (validTime(v) && parseKey(k)) out[k] = v;
    else if (/^\d+$/.test(k) && v && typeof v === "object") {
      for (const [vk, t] of Object.entries(v as Record<string, unknown>)) {
        if (/^\d+$/.test(vk) && validTime(t)) out[verseKey(Number(k), Number(vk))] = t;
      }
    }
  }
  return out;
}

function readVerseItem(
  item: unknown,
): { t: number; src?: string } | null {
  if (validTime(item)) return { t: item };
  if (!item || typeof item !== "object") return null;
  const o = item as { t?: unknown; src?: unknown };
  if (!validTime(o.t)) return null;
  return {
    t: o.t,
    src: typeof o.src === "string" && o.src ? o.src : undefined,
  };
}

/** 절·장 시작 시각 데이터가 있는지(파일 존재 + 내용). */
export function hasVerseTimingData(w: WatchTimes): boolean {
  if (!w.present) return false;
  if (Object.keys(w.times).length > 0) return true;
  return w.starts.some((s) => s !== null);
}

function emptyWatchTimes(present: boolean): WatchTimes {
  return { times: {}, missing: [], starts: [], src: {}, present };
}

function normalizeWatchTimes(raw: unknown, present: boolean): WatchTimes {
  if (!raw || typeof raw !== "object") {
    return emptyWatchTimes(present);
  }
  const o = raw as Record<string, unknown>;
  if (!o.chapters || typeof o.chapters !== "object") {
    const times = normalizeTimes(raw);
    return {
      times,
      missing: [],
      starts: [],
      src: {},
      present: present && Object.keys(times).length > 0,
    };
  }

  const times: VerseTimeMap = {};
  const src: VerseSrcMap = {};
  const starts: (number | null)[] = [];
  for (const [ck, info] of Object.entries(o.chapters as Record<string, unknown>)) {
    const chapter = Number(ck);
    if (!Number.isInteger(chapter) || chapter < 1 || !info || typeof info !== "object") continue;
    const { start, verses, src: srcList } = info as {
      start?: unknown;
      verses?: unknown;
      src?: unknown;
    };
    if (validTime(start)) {
      while (starts.length < chapter) starts.push(null);
      starts[chapter - 1] = start;
    }
    if (!Array.isArray(verses)) continue;
    // 장마다 verses 와 같은 길이의 src[] (word/seg/interp/fix)
    const parallelSrc = Array.isArray(srcList) ? srcList : null;
    verses.forEach((item, i) => {
      const parsed = readVerseItem(item);
      if (!parsed) return;
      const key = verseKey(chapter, i + 1);
      times[key] = parsed.t;
      // {t,src} 객체 형태가 있으면 우선, 없으면 chapters[n].src[i]
      const fromParallel =
        parallelSrc && typeof parallelSrc[i] === "string" && parallelSrc[i]
          ? (parallelSrc[i] as string)
          : undefined;
      const kind = parsed.src ?? fromParallel;
      if (kind) src[key] = kind;
    });
  }
  const missing = Array.isArray(o.missing)
    ? o.missing.filter((n): n is number => Number.isInteger(n) && n > 0)
    : [];
  const hasContent =
    Object.keys(times).length > 0 || starts.some((s) => s !== null);
  return { times, missing, starts, src, present: present && hasContent };
}

// ── 원본 데이터 ──────────────────────────────────────────────────────────────

const timesCache = new Map<string, Promise<WatchTimes>>();

export function loadWatchTimes(book: BookId): Promise<WatchTimes> {
  const hit = timesCache.get(book);
  if (hit) return hit;
  const p = fetch(`/watch-times/${book}.json`)
    .then(async (res) => {
      if (res.status === 404) return normalizeWatchTimes({}, false);
      if (!res.ok) throw new Error(`watch-times ${book}: ${res.status}`);
      const raw: unknown = await res.json();
      return normalizeWatchTimes(raw, true);
    });
  p.catch(() => timesCache.delete(book));
  timesCache.set(book, p);
  return p;
}

const countsCache = new Map<string, Promise<number[]>>();

/** 장별 절 수(index 0 = 1장). */
export function loadVerseCounts(book: BookId): Promise<number[]> {
  const hit = countsCache.get(book);
  if (hit) return hit;
  const p = fetch(`/bible-study/chunks/${book}/manifest.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`manifest ${book}: ${res.status}`);
      return res.json() as Promise<{ chapters?: { chapter: number; verseCount: number }[] }>;
    })
    .then((json) => {
      const counts: number[] = [];
      for (const c of json.chapters ?? []) counts[c.chapter - 1] = c.verseCount;
      return Array.from(counts, (n) => n ?? 0);
    });
  p.catch(() => countsCache.delete(book));
  countsCache.set(book, p);
  return p;
}

// ── 개발용 보정값 ────────────────────────────────────────────────────────────

const fixKey = (book: BookId) => `haruchi:watch:${book}:verse-times-fix`;

export function loadVerseFix(book: BookId): VerseTimeMap {
  try {
    return normalizeTimes(JSON.parse(window.localStorage.getItem(fixKey(book)) ?? "{}"));
  } catch {
    return {};
  }
}

export function saveVerseFix(book: BookId, fix: VerseTimeMap): void {
  try {
    window.localStorage.setItem(fixKey(book), JSON.stringify(fix));
  } catch {
    /* noop */
  }
}

export function clearVerseFix(book: BookId): void {
  try {
    window.localStorage.removeItem(fixKey(book));
  } catch {
    /* noop */
  }
}

/** 장·절 순으로 정렬한 { "1:14": 121.3 } JSON. */
export function verseFixJson(fix: VerseTimeMap): string {
  const sorted = Object.keys(fix)
    .map((k) => ({ k, p: parseKey(k)! }))
    .sort((a, b) => a.p.chapter - b.p.chapter || a.p.verse - b.p.verse);
  const out: VerseTimeMap = {};
  for (const { k } of sorted) out[k] = Math.round(fix[k] * 10) / 10;
  return JSON.stringify(out, null, 2);
}

// ── 조회 ─────────────────────────────────────────────────────────────────────

/**
 * 파일 + 보정값을 합쳐 장별 인덱스를 만든다. 보정값이 우선.
 * 절 시간이 없고 missing 도 아닌 장은 장 시작 시간을 1절로 쓴다(explicit=false, 화면 표시는 안 함).
 * missing 장은 보정값이 있을 때만 인덱스에 들어간다.
 */
export function buildVerseIndex(
  file: WatchTimes,
  fix: VerseTimeMap,
  chapterStarts: ReadonlyArray<number | null>,
): VerseIndex {
  const missing = new Set(file.missing);
  const merged = { ...file.times, ...fix };
  const index: VerseIndex = new Map();
  for (const [k, t] of Object.entries(merged)) {
    const p = parseKey(k);
    if (!p) continue;
    const list = index.get(p.chapter) ?? [];
    list.push({ verse: p.verse, t, explicit: true });
    index.set(p.chapter, list);
  }
  chapterStarts.forEach((start, i) => {
    const chapter = i + 1;
    if (start === null || missing.has(chapter)) return;
    const list = index.get(chapter) ?? [];
    if (!list.some((e) => e.verse === 1)) list.push({ verse: 1, t: start, explicit: false });
    index.set(chapter, list);
  });
  for (const list of index.values()) list.sort((a, b) => a.verse - b.verse);
  return index;
}

export function verseTime(index: VerseIndex, chapter: number, verse: number): number | null {
  return index.get(chapter)?.find((e) => e.verse === verse)?.t ?? null;
}

/** 현재 장 안에서 time 이전에 시작한 마지막 절. */
export function entryAt(index: VerseIndex, chapter: number, time: number): VerseEntry | null {
  let found: VerseEntry | null = null;
  for (const e of index.get(chapter) ?? []) {
    if (e.t <= time && (!found || e.t >= found.t)) found = e;
  }
  return found;
}
