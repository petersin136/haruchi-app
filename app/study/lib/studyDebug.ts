/** ?debug=1 원어 진단 — 장 윈도우가 여러 개여도 로그 상자 하나 */

type Listener = (lines: string[]) => void;

const listeners = new Set<Listener>();
let lines: string[] = [];

export function isStudyDebugOn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("debug") === "1";
  } catch {
    return false;
  }
}

export function pushStudyDebug(line: string) {
  if (typeof window === "undefined") return;
  if (!isStudyDebugOn()) return;
  const stamp = new Date().toISOString().slice(11, 23);
  lines = [...lines.slice(-9), `${stamp} ${line}`];
  listeners.forEach((l) => l(lines));
}

export function subscribeStudyDebug(listener: Listener): () => void {
  listeners.add(listener);
  listener(lines);
  return () => {
    listeners.delete(listener);
  };
}
