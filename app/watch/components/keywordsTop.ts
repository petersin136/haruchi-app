import type { BookId } from "@/app/bible-reading/books";

// public/keywords-top/{bookId}/{chapter}.json — 장의 대표 단어 목록.
//   { "words": [{ lemma, word, pron, gloss, pos, posDetail, refs: ["1:1"], inChapter, inTestament, note,
//                 root: { word, pron, gloss, note } | null, rootGloss, rootNote, defKo, defEn }] }
//   (대체 경로: 루트 배열, w/mean/verses/count/total 등 예전 필드명)
export type VerseRef = { chapter: number; verse: number };
export type WordRoot = { w: string; pron: string; mean: string };
export type TopWord = {
  key: string;
  w: string;
  pron: string;
  mean: string;
  lemma: string;
  pos: string;
  posDetail: string;
  root: WordRoot | null;
  rootGloss: string;
  rootNote: string;
  defKo: string;
  defEn: string;
  count: number | null;
  total: number | null;
  verses: VerseRef[];
  note: string;
};

function parseRoot(v: unknown): WordRoot | null {
  if (typeof v === "string") return v.trim() ? { w: v.trim(), pron: "", mean: "" } : null;
  if (!v || typeof v !== "object") return null;
  const o = v as Raw;
  const w = pickStr(o, "word", "w", "lemma");
  return w ? { w, pron: pickStr(o, "pron", "translit"), mean: pickStr(o, "gloss", "mean", "meaning") } : null;
}

type Raw = Record<string, unknown>;

const pickStr = (o: Raw, ...keys: string[]) => {
  for (const k of keys) if (typeof o[k] === "string" && (o[k] as string).trim()) return (o[k] as string).trim();
  return "";
};

const pickNum = (o: Raw, ...keys: string[]) => {
  for (const k of keys) {
    const v = Number(o[k]);
    if (o[k] !== undefined && o[k] !== null && Number.isFinite(v) && v >= 0) return v;
  }
  return null;
};

function parseVerseRef(v: unknown, chapter: number): VerseRef | null {
  if (typeof v === "number" && Number.isInteger(v) && v > 0) return { chapter, verse: v };
  if (typeof v === "string") {
    const m = v.trim().match(/^(?:(\d+):)?(\d+)$/);
    if (m) return { chapter: m[1] ? Number(m[1]) : chapter, verse: Number(m[2]) };
  }
  if (v && typeof v === "object") {
    const o = v as Raw;
    const verse = Number(o.verse ?? o.v);
    const ch = Number(o.chapter ?? o.c ?? chapter);
    if (Number.isInteger(verse) && verse > 0 && Number.isInteger(ch) && ch > 0) return { chapter: ch, verse };
  }
  return null;
}

function normalize(raw: unknown, chapter: number): TopWord[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? ((raw as Raw).words ?? (raw as Raw).keywords ?? (raw as Raw).items ?? []) as unknown[]
      : [];
  if (!Array.isArray(list)) return [];

  return list.flatMap((item, i) => {
    if (!item || typeof item !== "object") return [];
    const o = item as Raw;
    const w = pickStr(o, "word", "w", "hebrew", "greek");
    if (!w) return [];
    const rawVerses = (o.refs ?? o.verses ?? o.occurrences ?? []) as unknown;
    const verses = Array.isArray(rawVerses)
      ? rawVerses.map((v) => parseVerseRef(v, chapter)).filter((v): v is VerseRef => v !== null)
      : [];
    const lemma = pickStr(o, "lemma", "strong");
    const root = parseRoot(o.root);
    const rawRoot = o.root && typeof o.root === "object" ? (o.root as Raw) : {};
    return [
      {
        key: `${lemma || w}-${i}`,
        w,
        pron: pickStr(o, "pron", "translit"),
        mean: pickStr(o, "gloss", "mean", "meaning"),
        lemma,
        pos: pickStr(o, "pos"),
        posDetail: pickStr(o, "posDetail"),
        root,
        rootGloss: pickStr(o, "rootGloss") || root?.mean || "",
        rootNote: pickStr(o, "rootNote") || pickStr(rawRoot, "note"),
        defKo: pickStr(o, "defKo"),
        defEn: pickStr(o, "defEn"),
        count: pickNum(o, "inChapter", "count", "chapterCount") ?? (verses.length || null),
        total: pickNum(o, "inTestament", "total", "testamentCount", "totalCount"),
        verses,
        note: pickStr(o, "note"),
      },
    ];
  });
}

const cache = new Map<string, Promise<TopWord[] | null>>();

/** 파일이 없으면(404) null. */
export function loadTopWords(book: BookId, chapter: number): Promise<TopWord[] | null> {
  const key = `${book}/${chapter}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = fetch(`/keywords-top/${book}/${chapter}.json`)
    .then((res) => {
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`keywords-top ${key}: ${res.status}`);
      return res.json().then((json: unknown) => normalize(json, chapter));
    });
  p.catch(() => cache.delete(key));
  cache.set(key, p);
  return p;
}