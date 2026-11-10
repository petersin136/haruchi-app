/** /study 장 서랍 open — StudyNotebook setState 없이 호스트만 구독 */

type Listener = () => void;

let open = false;
const listeners = new Set<Listener>();

export function getStudyLocOpen() {
  return open;
}

export function setStudyLocOpen(next: boolean) {
  if (open === next) return;
  open = next;
  listeners.forEach((l) => l());
}

/** 제목/런헤드: 항상 열기(토글 금지 — 잔여 open=true면 첫 탭이 닫기로 먹는 버그 방지) */
export function openStudyLoc() {
  setStudyLocOpen(true);
}

export function toggleStudyLocOpen() {
  setStudyLocOpen(!open);
}

export function subscribeStudyLoc(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
