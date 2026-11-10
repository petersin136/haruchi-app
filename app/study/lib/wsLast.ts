/** 원어 세로 패널을 닫은 뒤 가장자리 탭으로 다시 열 때 */

export const WS_LAST_KEY = "haruchi/ws-last";

export type WsLast = {
  lang: string;
  strong: string;
  word: string;
  glossKo: string;
  ref: number;
  side: "left" | "right";
};

export function loadWsLast(): WsLast | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(WS_LAST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    const side = o.side === "left" || o.side === "right" ? o.side : null;
    const strong = typeof o.strong === "string" ? o.strong : "";
    const word = typeof o.word === "string" ? o.word : "";
    const ref = typeof o.ref === "number" && Number.isFinite(o.ref) ? o.ref : 0;
    if (!side || !strong || !word || ref < 1) return null;
    return {
      lang: typeof o.lang === "string" ? o.lang : "",
      strong,
      word,
      glossKo: typeof o.glossKo === "string" ? o.glossKo : "",
      ref,
      side,
    };
  } catch {
    return null;
  }
}

export function saveWsLast(row: WsLast | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!row) {
      window.localStorage.removeItem(WS_LAST_KEY);
      return;
    }
    window.localStorage.setItem(WS_LAST_KEY, JSON.stringify(row));
  } catch {
    /* ignore */
  }
}

export function glossSnippet(glossKo: string, max = 2): string {
  const t = (glossKo || "").replace(/\s+/g, "");
  if (!t) return "";
  return [...t].slice(0, max).join("");
}
