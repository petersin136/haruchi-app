/** 장·절 소제목 — public/headings/{bookId}.json */

export type HeadingMap = Record<string, Record<string, string>>;

const cache = new Map<string, Promise<HeadingMap | null>>();

/** 파일 없거나 비어 있으면 null (호출측이 소제목 없이 표시). */
export function loadHeadingMap(bookId: string): Promise<HeadingMap | null> {
  const hit = cache.get(bookId);
  if (hit) return hit;

  const p = (async () => {
    try {
      const res = await fetch(`/headings/${bookId}.json`, {
        cache: "default",
      });
      if (!res.ok) return null;
      const json = (await res.json()) as unknown;
      if (!json || typeof json !== "object" || Array.isArray(json)) return null;
      const out: HeadingMap = {};
      for (const [ch, verses] of Object.entries(
        json as Record<string, unknown>,
      )) {
        if (!verses || typeof verses !== "object" || Array.isArray(verses)) {
          continue;
        }
        const inner: Record<string, string> = {};
        for (const [n, title] of Object.entries(
          verses as Record<string, unknown>,
        )) {
          if (typeof title !== "string") continue;
          const text = title.trim();
          if (!text) continue;
          inner[n] = text;
        }
        if (Object.keys(inner).length > 0) out[ch] = inner;
      }
      return Object.keys(out).length > 0 ? out : null;
    } catch {
      return null;
    }
  })();

  cache.set(bookId, p);
  p.then(
    (v) => {
      if (v == null) cache.delete(bookId);
    },
    () => cache.delete(bookId),
  );
  return p;
}

/** 해당 장의 절 번호 → 소제목. 1절도 포함(표시는 호출측에서 걸러냄). */
export function headingsForChapter(
  map: HeadingMap | null | undefined,
  chapter: number,
): Map<number, string> {
  const out = new Map<number, string>();
  if (!map) return out;
  const raw = map[String(chapter)] ?? map[chapter as unknown as string];
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) {
    const n = Number(k);
    if (!Number.isFinite(n) || n < 1) continue;
    if (typeof v !== "string") continue;
    const text = v.trim();
    if (!text) continue;
    out.set(n, text);
  }
  return out;
}
