/** 가로 태블릿(≥1024 + landscape) 양쪽 페이지 읽기 */

export const STUDY_SPREAD_MQ =
  "(min-width: 1024px) and (orientation: landscape)";

/** 가운데 여백(접힘선이 들어가는 골) */
export const STUDY_SPREAD_GAP = 48;
/** 쪽 바깥쪽 안여백 */
export const STUDY_SPREAD_PAD_OUTER = 40;
/** 쪽 접힘쪽 안여백 */
export const STUDY_SPREAD_PAD_FOLD = 32;
/** 펼침 상자 좌우 바깥 여백 */
export const STUDY_SPREAD_OUTER = 20;
export const STUDY_SPREAD_TOPBAR = 46;
export const STUDY_SPREAD_BAR_H = 30;
export const STUDY_SPREAD_PGNUM_H = 28;
export const STUDY_SPREAD_ANIM_MS = 420;
export const STUDY_SPREAD_SWIPE_PX = 40;
/** 놓을 때 넘김으로 보는 각도 */
export const STUDY_SPREAD_COMMIT_DEG = 70;
/** 놓을 때 넘김으로 보는 속도(px/ms) */
export const STUDY_SPREAD_COMMIT_VEL = 0.35;
export const STUDY_SPREAD_PERSPECTIVE = 1800;
/** 좌우 가장자리 탭 영역 (펼침 폭 대비) */
export const STUDY_SPREAD_EDGE = 0.18;

export function matchStudySpread(
  win: Window | null | undefined = typeof window !== "undefined" ? window : null,
): boolean {
  if (!win || typeof win.matchMedia !== "function") return false;
  return win.matchMedia(STUDY_SPREAD_MQ).matches;
}

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

export function chapterLabel(
  bookName: string,
  chapter: number,
  bookId: string,
): string {
  const unit = bookId === "psalms" ? "편" : "장";
  return `${bookName} ${chapter}${unit}`;
}

/** 펼침 높이·쪽 폭 계산 (px) */
export function calcSpreadGeometry(viewportWidth: number, viewportHeight: number) {
  const gap = STUDY_SPREAD_GAP;
  const outer = STUDY_SPREAD_OUTER;
  const padOuter = STUDY_SPREAD_PAD_OUTER;
  const padFold = STUDY_SPREAD_PAD_FOLD;
  const spreadW = Math.max(200, viewportWidth);
  const spreadH = Math.max(120, viewportHeight);
  /** 한 쪽 폭 = (펼침 폭 − 가운데 여백) / 2 — 바깥 여백은 펼침 폭에 이미 제외 */
  const pageW = Math.max(100, (spreadW - gap) / 2);
  /** 열에 흐르는 본문 폭(쪽 안여백 제외) */
  const colW = Math.max(60, pageW - padOuter - padFold);
  /** 열 간격 = 접힘쪽 여백 + 가운데 골 + 접힘쪽 여백 */
  const colGap = padFold + gap + padFold;
  return {
    outer,
    gap,
    padOuter,
    padFold,
    spreadW,
    spreadH,
    pageW,
    colW,
    colGap,
  /** 한 쪽(한 열) 이동 거리 */
  pageStride: colW + colGap,
  /** 한 펼침 이동 = 쪽 이동 × 2 */
  spreadStride: (colW + colGap) * 2,
};
}
