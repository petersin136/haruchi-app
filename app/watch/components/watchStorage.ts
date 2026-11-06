export const SPEED_OPTIONS = [1.25, 1.5, 1.75, 2] as const;
export type SpeedOption = (typeof SPEED_OPTIONS)[number];
export const DEFAULT_SPEED: SpeedOption = 1.5;

const SPEED_KEY = "haruchi:watch:speed";
const POSITION_KEY = "haruchi:watch:genesis:position";

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

export function loadSpeed(): SpeedOption {
  const v = Number(read(SPEED_KEY));
  return (SPEED_OPTIONS as readonly number[]).includes(v) ? (v as SpeedOption) : DEFAULT_SPEED;
}

export function saveSpeed(speed: SpeedOption): void {
  write(SPEED_KEY, String(speed));
}

export function loadPosition(): number {
  const v = Number(read(POSITION_KEY));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

export function savePosition(seconds: number): void {
  write(POSITION_KEY, String(Math.floor(seconds)));
}

export function clearPosition(): void {
  write(POSITION_KEY, null);
}

export function formatTime(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
