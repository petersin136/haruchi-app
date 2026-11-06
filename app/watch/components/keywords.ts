import type { BookId } from "@/app/bible-reading/books";

// public/keywords/{bookId}/{chapter}.json — { "절": [{ w, pron, mean, lemma, pos }] }
export type Keyword = { w: string; pron: string; mean: string; lemma: string; pos: string };
export type KeywordChapter = Record<string, Keyword[]>;
export type KeywordRow = { verse: number; words: Keyword[] };

export const MAX_WORDS = 3;

const HEBREW_RE = /[\u0590-\u05FF\uFB1D-\uFB4F]/;
export const isHebrew = (s: string) => HEBREW_RE.test(s);

function toRows(data: KeywordChapter): KeywordRow[] {
  return Object.keys(data)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((x, y) => x - y)
    .map((verse) => {
      const raw = data[String(verse)];
      const words = Array.isArray(raw) ? raw.filter((k) => k && k.w).slice(0, MAX_WORDS) : [];
      return { verse, words };
    });
}

const cache = new Map<string, Promise<KeywordRow[]>>();

export function loadKeywordRows(book: BookId, chapter: number): Promise<KeywordRow[]> {
  const key = `${book}/${chapter}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = fetch(`/keywords/${book}/${chapter}.json`)
    .then((res) => {
      if (res.status === 404) return {} as KeywordChapter;
      if (!res.ok) throw new Error(`keywords ${key}: ${res.status}`);
      return res.json() as Promise<KeywordChapter>;
    })
    .then(toRows);
  p.catch(() => cache.delete(key));
  cache.set(key, p);
  return p;
}
