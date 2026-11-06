import { BOOKS, type BookId } from "@/app/bible-reading/books";
import { parseRef, type XrefRef } from "./xref";

// public/summary/{bookId}/{chapter}.json
// { title, theme, flow:[{range,text}], keyVerse:"1:1", question }
export type SummaryFlowItem = { range: string; text: string };

export type ChapterSummary = {
  title: string;
  theme: string;
  flow: SummaryFlowItem[];
  keyVerse: string;
  question: string;
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function normalizeFlow(raw: unknown): SummaryFlowItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const range = str(o.range);
      const text = str(o.text);
      if (!range || !text) return null;
      return { range, text };
    })
    .filter((x): x is SummaryFlowItem => x !== null);
}

function normalize(raw: unknown): ChapterSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const summary: ChapterSummary = {
    title: str(o.title),
    theme: str(o.theme),
    flow: normalizeFlow(o.flow),
    keyVerse: str(o.keyVerse),
    question: str(o.question),
  };
  const empty =
    !summary.title &&
    !summary.theme &&
    summary.flow.length === 0 &&
    !summary.keyVerse &&
    !summary.question;
  return empty ? null : summary;
}

const cache = new Map<string, Promise<ChapterSummary | null>>();

/** 파일이 없으면(404) null. */
export function loadSummary(book: BookId, chapter: number): Promise<ChapterSummary | null> {
  const key = `${book}/${chapter}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = fetch(`/summary/${book}/${chapter}.json`)
    .then((res) => {
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`summary ${key}: ${res.status}`);
      return res.json();
    })
    .then(normalize);
  p.catch(() => cache.delete(key));
  cache.set(key, p);
  return p;
}

/** "1:1" · "1:1-3" · "1:1-2:3" → 같은 책 안의 범위. */
export function parseKeyVerse(book: BookId, raw: string): XrefRef | null {
  const m = raw.replace(/\s/g, "").match(/^(\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$/);
  if (!m || !BOOKS[book]) return null;
  const [, c1, v1, c2, v2] = m;
  const from = `${book}.${c1}.${v1}`;
  const to = v2 ? `${book}.${c2 ?? c1}.${v2}` : null;
  return parseRef(to ? `${from}-${to}` : from);
}
