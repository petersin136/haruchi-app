import { BOOKS, type BookId } from "@/app/bible-reading/books";

// public/xref/{bookId}/{chapter}.json — { "절": [{ to: "john.1.1-john.1.3", votes }] }
export type XrefEntry = { to: string; votes: number };
export type XrefChapter = Record<string, XrefEntry[]>;

export type VersePoint = { book: BookId; chapter: number; verse: number };
export type XrefRef = { key: string; from: VersePoint; to: VersePoint; label: string; fullLabel: string };
export type XrefRow = { verse: number; refs: XrefRef[] };

export const MAX_CHIPS = 5;
export const MAX_PREVIEW_VERSES = 3;

const isBookId = (v: string): v is BookId => Object.prototype.hasOwnProperty.call(BOOKS, v);

function parsePoint(raw: string): VersePoint | null {
  const [book, c, v] = raw.split(".");
  const chapter = Number(c);
  const verse = Number(v);
  if (!book || !isBookId(book) || !Number.isInteger(chapter) || !Number.isInteger(verse)) return null;
  return { book, chapter, verse };
}

function formatRange(from: VersePoint, to: VersePoint, name: (b: BookId) => string): string {
  const head = `${name(from.book)} ${from.chapter}:${from.verse}`;
  if (from.book !== to.book) return `${head}-${name(to.book)} ${to.chapter}:${to.verse}`;
  if (from.chapter !== to.chapter) return `${head}-${to.chapter}:${to.verse}`;
  if (from.verse !== to.verse) return `${head}-${to.verse}`;
  return head;
}

export function parseRef(to: string): XrefRef | null {
  const [a, b] = to.split("-");
  const from = parsePoint(a);
  if (!from) return null;
  const end = b ? parsePoint(b) : from;
  if (!end) return null;
  return {
    key: to,
    from,
    to: end,
    label: formatRange(from, end, (id) => BOOKS[id].shortName),
    fullLabel: formatRange(from, end, (id) => BOOKS[id].name),
  };
}

export function toRows(data: XrefChapter): XrefRow[] {
  return Object.keys(data)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((x, y) => x - y)
    .map((verse) => ({
      verse,
      refs: (data[String(verse)] ?? [])
        .slice(0, MAX_CHIPS)
        .map((e) => parseRef(e.to))
        .filter((r): r is XrefRef => r !== null),
    }))
    .filter((row) => row.refs.length > 0);
}

// ── fetch + 캐시 ─────────────────────────────────────────────────────────────

const xrefCache = new Map<string, Promise<XrefRow[]>>();

export function loadXrefRows(book: BookId, chapter: number): Promise<XrefRow[]> {
  const key = `${book}/${chapter}`;
  const hit = xrefCache.get(key);
  if (hit) return hit;
  const p = fetch(`/xref/${book}/${chapter}.json`)
    .then((res) => {
      if (res.status === 404) return {} as XrefChapter;
      if (!res.ok) throw new Error(`xref ${key}: ${res.status}`);
      return res.json() as Promise<XrefChapter>;
    })
    .then(toRows);
  p.catch(() => xrefCache.delete(key));
  xrefCache.set(key, p);
  return p;
}

type KrvVerse = { n: number; t: string };
type KoreanChunk = { verses?: { krv?: KrvVerse[] } };

const krvCache = new Map<string, Promise<Map<number, string>>>();

export function loadKrvChapter(book: BookId, chapter: number): Promise<Map<number, string>> {
  const key = `${book}/${chapter}`;
  const hit = krvCache.get(key);
  if (hit) return hit;
  const p = fetch(`/bible-study/chunks/${book}/${chapter}/korean.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`krv ${key}: ${res.status}`);
      return res.json() as Promise<KoreanChunk>;
    })
    .then((json) => new Map((json.verses?.krv ?? []).map((v) => [v.n, v.t])));
  p.catch(() => krvCache.delete(key));
  krvCache.set(key, p);
  return p;
}

export type PreviewVerse = { chapter: number; verse: number; text: string };
export type Preview = { verses: PreviewVerse[]; more: boolean };

/** 범위의 앞 MAX_PREVIEW_VERSES 절만 모은다. 장을 넘는 범위는 필요한 장만 순서대로 받는다. */
export async function loadPreview(ref: XrefRef): Promise<Preview> {
  const { from, to } = ref;
  const lastChapter = from.book === to.book ? to.chapter : from.chapter;
  const verses: PreviewVerse[] = [];

  for (let ch = from.chapter; ch <= lastChapter; ch += 1) {
    const text = await loadKrvChapter(from.book, ch);
    const startV = ch === from.chapter ? from.verse : 1;
    const endV = ch === lastChapter && from.book === to.book ? to.verse : Math.max(0, ...text.keys());
    for (let v = startV; v <= endV; v += 1) {
      const t = text.get(v);
      if (t === undefined) continue;
      if (verses.length === MAX_PREVIEW_VERSES) return { verses, more: true };
      verses.push({ chapter: ch, verse: v, text: t });
    }
  }
  return { verses, more: false };
}
