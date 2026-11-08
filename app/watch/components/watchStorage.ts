import type { WatchBookId } from "../data/books";

/** 배속 팝오버 전체 목록 (1 = 보통) */
export const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export type SpeedOption = (typeof SPEED_OPTIONS)[number];
export const DEFAULT_SPEED: SpeedOption = 1.5;

/** 예전 공통 배속 키 — 창세기 마이그레이션용으로만 읽는다. */
const LEGACY_SPEED_KEY = "haruchi:watch:speed";

const speedKey = (book: WatchBookId) => `haruchi:watch:${book}:speed`;
const positionKey = (book: WatchBookId) => `haruchi:watch:${book}:position`;

export type WatchPosition = {
  /** 현재 영상 안 초 */
  t: number;
  /** 마지막으로 본 장(1부터). 없으면 시간만으로 추정 */
  c: number;
};

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* noop */
  }
}

function parseSpeed(raw: string | null): SpeedOption | null {
  const v = Number(raw);
  return (SPEED_OPTIONS as readonly number[]).includes(v) ? (v as SpeedOption) : null;
}

export function loadSpeed(book: WatchBookId): SpeedOption {
  const own = parseSpeed(read(speedKey(book)));
  if (own !== null) return own;
  // 창세기: 예전 공통 키에 있던 값을 그대로 이어 쓴다.
  if (book === "genesis") {
    const legacy = parseSpeed(read(LEGACY_SPEED_KEY));
    if (legacy !== null) return legacy;
  }
  return DEFAULT_SPEED;
}

export function saveSpeed(book: WatchBookId, speed: SpeedOption): void {
  write(speedKey(book), String(speed));
}

export function loadPosition(book: WatchBookId): WatchPosition {
  const raw = read(positionKey(book));
  if (!raw) return { t: 0, c: 0 };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const o = parsed as { t?: unknown; c?: unknown };
      const t = Number(o.t);
      const c = Number(o.c);
      return {
        t: Number.isFinite(t) && t > 0 ? t : 0,
        c: Number.isInteger(c) && c > 0 ? c : 0,
      };
    }
  } catch {
    /* 예전 형식: 초만 숫자 문자열 */
  }
  const t = Number(raw);
  return { t: Number.isFinite(t) && t > 0 ? t : 0, c: 0 };
}

export function savePosition(book: WatchBookId, seconds: number, chapter?: number): void {
  const t = Math.floor(seconds);
  if (chapter && chapter > 0) {
    write(positionKey(book), JSON.stringify({ t, c: chapter }));
  } else {
    write(positionKey(book), String(t));
  }
}

export function clearPosition(book: WatchBookId): void {
  write(positionKey(book), null);
}

export function formatTime(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
