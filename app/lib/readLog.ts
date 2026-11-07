/**
 * 장 완료·읽기 로그 localStorage 헬퍼.
 *
 *   bible_done_{book}_{chapter}            = "true"   (한글 reader)
 *   bible_done_{book}_{chapter}_{web|kjv}  = "true"   (영어 모드)
 *   haruchi/read-log = [{ book, ch, at }]             (ISO 시각, book+ch 당 최신 1건)
 */

export const READ_LOG_KEY = "haruchi/read-log";

export type ReadLogEntry = {
  book: string;
  ch: number;
  at: string;
};

export type ReadingScope = "reader" | "web" | "kjv";

export function doneKey(
  bookId: string,
  chapter: number,
  scope: ReadingScope = "reader",
): string {
  return scope === "reader"
    ? `bible_done_${bookId}_${chapter}`
    : `bible_done_${bookId}_${chapter}_${scope}`;
}

export function isChapterDone(
  bookId: string,
  chapter: number,
  scope: ReadingScope = "reader",
): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(doneKey(bookId, chapter, scope)) === "true";
  } catch {
    return false;
  }
}

/** 플랜 하루 분량의 모든 장이 완료됐는지. */
export function areReadingsDone(
  readings: { book: string; chapters: number[] }[],
  scope: ReadingScope = "reader",
): boolean {
  for (const r of readings) {
    for (const ch of r.chapters) {
      if (!isChapterDone(r.book, ch, scope)) return false;
    }
  }
  return readings.length > 0;
}

export function loadReadLog(): ReadLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(READ_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is ReadLogEntry =>
        !!row &&
        typeof row === "object" &&
        typeof (row as ReadLogEntry).book === "string" &&
        typeof (row as ReadLogEntry).ch === "number" &&
        typeof (row as ReadLogEntry).at === "string",
    );
  } catch {
    return [];
  }
}

/** book+ch 당 최신 1건만 남기고 시각을 지금으로 갱신. */
export function appendReadLog(book: string, ch: number): void {
  if (typeof window === "undefined") return;
  try {
    const next = loadReadLog().filter((row) => !(row.book === book && row.ch === ch));
    next.push({ book, ch, at: new Date().toISOString() });
    window.localStorage.setItem(READ_LOG_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
}

export function removeReadLog(book: string, ch: number): void {
  if (typeof window === "undefined") return;
  try {
    const next = loadReadLog().filter((row) => !(row.book === book && row.ch === ch));
    window.localStorage.setItem(READ_LOG_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
}

export function markChapterDone(
  bookId: string,
  chapter: number,
  scope: ReadingScope = "reader",
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(doneKey(bookId, chapter, scope), "true");
  } catch {
    /* noop */
  }
}

export function unmarkChapterDone(
  bookId: string,
  chapter: number,
  scope: ReadingScope = "reader",
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(doneKey(bookId, chapter, scope));
  } catch {
    /* noop */
  }
}

/** 로컬 캘린더 날짜 YYYY-MM-DD */
export function toLocalDateKey(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 날짜 → 그날 완료한 장 수 (read-log 기준) */
export function activityByDate(
  log: ReadLogEntry[] = loadReadLog(),
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of log) {
    const key = toLocalDateKey(row.at);
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

/**
 * 오늘(로컬)부터 거슬러 올라가며, 읽은 날이 연속인 일수.
 * 오늘 읽지 않았으면 어제부터 센다 (연속이 끊기지 않은 직전 streak).
 */
export function computeStreak(
  log: ReadLogEntry[] = loadReadLog(),
  today: Date = new Date(),
): number {
  const active = activityByDate(log);
  if (active.size === 0) return 0;

  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayKey = toLocalDateKey(cursor);
  if (!active.has(todayKey)) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  for (;;) {
    const key = toLocalDateKey(cursor);
    if (!active.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** 최근 `weeks`주(기본 12 = 84일) 날짜 키 배열 — 오래된 날 → 오늘. */
export function lastNDateKeys(weeks = 12, today: Date = new Date()): string[] {
  const n = weeks * 7;
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    keys.push(toLocalDateKey(d));
  }
  return keys;
}
