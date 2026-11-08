/** 가로 태블릿(≥1024 + landscape) 양쪽 페이지 읽기 */

export const STUDY_SPREAD_MQ =
  "(min-width: 1024px) and (orientation: landscape)";

export const STUDY_SPREAD_GAP = 48; /* 가운데 여백(접힘선 영역) */
export const STUDY_SPREAD_ANIM_MS = 280;
export const STUDY_SPREAD_SWIPE_PX = 40;
export const STUDY_SPREAD_EDGE = 0.15;

export function matchStudySpread(
  win: Window | null | undefined = typeof window !== "undefined" ? window : null,
): boolean {
  if (!win || typeof win.matchMedia !== "function") return false;
  return win.matchMedia(STUDY_SPREAD_MQ).matches;
}

/** React 훅 없이 구독 — StudyNotebook / ContinuousKrvReader 공용 */
export function subscribeStudySpread(
  onChange: (on: boolean) => void,
): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    onChange(false);
    return () => {};
  }
  const mql = window.matchMedia(STUDY_SPREAD_MQ);
  const fire = () => onChange(mql.matches);
  fire();
  if (typeof mql.addEventListener === "function") {
    mql.addEventListener("change", fire);
    return () => mql.removeEventListener("change", fire);
  }
  mql.addListener(fire);
  return () => mql.removeListener(fire);
}

export function chapterLabel(bookName: string, chapter: number, bookId: string): string {
  // 시편만 「편」, 나머지는 「장」
  const unit = bookId === "psalms" ? "편" : "장";
  return `${bookName} ${chapter}${unit}`;
}
