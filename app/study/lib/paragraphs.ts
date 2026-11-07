/** 장별 단락 시작 절 — public/paragraphs/{bookId}.json */

export type ParagraphMap = Record<string, number[]>;

const cache = new Map<string, Promise<ParagraphMap | null>>();

/** 파일 없거나 파싱 실패면 null (호출측이 이어쓰기로 폴백). */
export function loadParagraphMap(bookId: string): Promise<ParagraphMap | null> {
  const hit = cache.get(bookId);
  if (hit) return hit;

  const p = (async () => {
    try {
      const res = await fetch(`/paragraphs/${bookId}.json`, { cache: "force-cache" });
      if (!res.ok) return null;
      const json = (await res.json()) as unknown;
      if (!json || typeof json !== "object" || Array.isArray(json)) return null;
      const out: ParagraphMap = {};
      for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
        if (!Array.isArray(v)) continue;
        const nums = v
          .map((n) => (typeof n === "number" ? n : Number(n)))
          .filter((n) => Number.isFinite(n) && n >= 1);
        if (nums.length > 0) out[k] = nums;
      }
      return Object.keys(out).length > 0 ? out : null;
    } catch {
      return null;
    }
  })();

  cache.set(bookId, p);
  return p;
}

export function paragraphStartsForChapter(
  map: ParagraphMap | null | undefined,
  chapter: number,
): number[] | null {
  if (!map) return null;
  const raw = map[String(chapter)] ?? map[chapter as unknown as string];
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw;
}
