import { BOOK_ORDER, BOOKS, type BookId } from "@/app/bible-reading/books";

/** /watch 는 66권 공통. 라우트 파라미터 = BookId. */
export type WatchBookId = BookId;
export type ChapterStarts = ReadonlyArray<number | null>;

/** manifest.json 한 권의 영상 구간. from~to 장(포함)이 같은 videoId. */
export type VideoSegment = {
  videoId: string;
  from: number;
  to: number;
};

export type WatchManifest = Partial<Record<BookId, VideoSegment[]>>;

/**
 * 창세기만 — watch-times 파일을 못 받을 때(또는 빠진 장)의 장 시작 대체값.
 * 다른 책은 대체값 없음(null).
 */
const GENESIS_DEFAULT_STARTS: number[] = [7, 314, 538, 808, 1076, 1245];

export function defaultStartsFor(book: BookId): ChapterStarts {
  const total = BOOKS[book].totalChapters;
  if (book !== "genesis") {
    return Array.from({ length: total }, () => null);
  }
  return Array.from(
    { length: total },
    (_, i) => GENESIS_DEFAULT_STARTS[i] ?? null,
  );
}

export function isWatchBookId(id: string): id is WatchBookId {
  return Object.prototype.hasOwnProperty.call(BOOKS, id);
}

export function watchTitleFor(book: BookId): string {
  return `${BOOKS[book].name} 함께 보기`;
}

/** 시편만 「편」, 나머지는 「장」 */
export function chapterUnit(book: BookId): "장" | "편" {
  return book === "psalms" ? "편" : "장";
}

export function chapterLabel(book: BookId, chapter: number): string {
  return `${chapter}${chapterUnit(book)}`;
}

let manifestPromise: Promise<WatchManifest> | null = null;

function normalizeSegments(raw: unknown): VideoSegment[] {
  if (!Array.isArray(raw)) return [];
  const out: VideoSegment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const videoId = typeof o.videoId === "string" ? o.videoId.trim() : "";
    const from = Number(o.from);
    const to = Number(o.to);
    if (
      !videoId ||
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 1 ||
      to < from
    ) {
      continue;
    }
    out.push({ videoId, from, to });
  }
  return out.sort((a, b) => a.from - b.from);
}

function normalizeManifest(raw: unknown): WatchManifest {
  if (!raw || typeof raw !== "object") return {};
  const out: WatchManifest = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isWatchBookId(k)) continue;
    const segs = normalizeSegments(v);
    if (segs.length > 0) out[k] = segs;
  }
  return out;
}

/** public/watch-times/manifest.json */
export function loadWatchManifest(): Promise<WatchManifest> {
  if (manifestPromise) return manifestPromise;
  manifestPromise = fetch("/watch-times/manifest.json")
    .then((res) => {
      if (!res.ok) throw new Error(`watch manifest: ${res.status}`);
      return res.json();
    })
    .then(normalizeManifest)
    .catch((err) => {
      manifestPromise = null;
      throw err;
    });
  return manifestPromise;
}

export function segmentsFor(
  manifest: WatchManifest | null,
  book: BookId,
): VideoSegment[] {
  return manifest?.[book] ?? [];
}

export function isBookInManifest(
  manifest: WatchManifest | null,
  book: BookId,
): boolean {
  return segmentsFor(manifest, book).length > 0;
}

export function segmentForChapter(
  segments: readonly VideoSegment[],
  chapter: number,
): VideoSegment | null {
  for (const s of segments) {
    if (chapter >= s.from && chapter <= s.to) return s;
  }
  return null;
}

export function videoIdForChapter(
  segments: readonly VideoSegment[],
  chapter: number,
): string | null {
  return segmentForChapter(segments, chapter)?.videoId ?? null;
}

/** BOOK_ORDER 기준, manifest 에 있는 다음 책. */
export function nextBookInManifest(
  manifest: WatchManifest | null,
  book: BookId,
): BookId | null {
  if (!manifest) return null;
  const i = BOOK_ORDER.indexOf(book);
  if (i < 0) return null;
  for (let j = i + 1; j < BOOK_ORDER.length; j += 1) {
    const id = BOOK_ORDER[j];
    if (isBookInManifest(manifest, id)) return id;
  }
  return null;
}

/** BOOK_ORDER 기준, manifest 에 있는 이전 책. */
export function prevBookInManifest(
  manifest: WatchManifest | null,
  book: BookId,
): BookId | null {
  if (!manifest) return null;
  const i = BOOK_ORDER.indexOf(book);
  if (i < 0) return null;
  for (let j = i - 1; j >= 0; j -= 1) {
    const id = BOOK_ORDER[j];
    if (isBookInManifest(manifest, id)) return id;
  }
  return null;
}

/**
 * 장 시작 초. 파일·대체값에 있으면 그대로.
 * 없고 해당 영상 구간의 첫 장이면 0 (영상 머리).
 */
export function chapterSeekStart(
  starts: ChapterStarts,
  segments: readonly VideoSegment[],
  chapter: number,
): number | null {
  const s = starts[chapter - 1];
  if (typeof s === "number") return s;
  const seg = segmentForChapter(segments, chapter);
  if (seg && seg.from === chapter) return 0;
  return null;
}

/**
 * 절 시간 JSON 이 없으면 장 선택 비활성(시작 시각 모름 → 엉뚱한 seek 금지).
 * 있을 때만 파일·대체 시작 시각이 있는 장 선택 가능.
 */
export function canSelectChapter(
  starts: ChapterStarts,
  segments: readonly VideoSegment[],
  chapter: number,
  hasVerseTimes: boolean,
): boolean {
  if (!hasVerseTimes) return false;
  if (!segmentForChapter(segments, chapter)) return false;
  return chapterSeekStart(starts, segments, chapter) !== null;
}

/** 절 시간이 없으면 null — 장 seek 하지 않음(영상 처음만 재생). */
export function resolveChapterSeekStart(
  starts: ChapterStarts,
  segments: readonly VideoSegment[],
  chapter: number,
  hasVerseTimes: boolean,
): number | null {
  if (!hasVerseTimes) return null;
  return chapterSeekStart(starts, segments, chapter);
}
