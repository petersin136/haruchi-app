/** SBL↔개역한글 절 차이 — public/word-study/_greek-verse-diff-report.json */

export type GreekVerseKind = "omit" | "split";

type DiffRow = {
  book?: string;
  ch?: number;
  kind?: string;
  krv?: number | number[];
  into?: { book?: string; ch?: number; v?: number };
};

export const GREEK_SBL_OMIT_HINT =
  "이 절은 SBL 헬라어 본문에 없어요 (후대 사본에만 있는 구절)";

let cache: Promise<Map<string, GreekVerseKind>> | null = null;

function key(book: string, ch: number, v: number) {
  return `${book}/${ch}/${v}`;
}

function addKrv(
  map: Map<string, GreekVerseKind>,
  book: string,
  ch: number,
  krv: number | number[] | undefined,
  kind: GreekVerseKind,
) {
  if (typeof krv === "number" && Number.isFinite(krv)) {
    map.set(key(book, ch, krv), kind);
    return;
  }
  if (Array.isArray(krv)) {
    for (const n of krv) {
      if (typeof n === "number" && Number.isFinite(n)) {
        map.set(key(book, ch, n), kind);
      }
    }
  }
}

function buildMap(diffs: DiffRow[]): Map<string, GreekVerseKind> {
  const map = new Map<string, GreekVerseKind>();
  for (const d of diffs) {
    const book = d.book;
    const ch = d.ch;
    if (!book || !Number.isFinite(ch)) continue;
    if (d.kind === "krvOnlyOmit" || d.kind === "krvEmpty") {
      addKrv(map, book, ch as number, d.krv, "omit");
      continue;
    }
    if (
      d.kind === "sblCoversKrv" ||
      d.kind === "splitPair" ||
      d.kind === "sblMergedIn"
    ) {
      addKrv(map, book, ch as number, d.krv, "split");
      continue;
    }
    if (d.kind === "sblMergeAway" && d.into?.book && d.into.ch != null && d.into.v != null) {
      map.set(key(d.into.book, d.into.ch, d.into.v), "split");
    }
  }
  return map;
}

export function loadGreekVerseDiffMap(): Promise<Map<string, GreekVerseKind>> {
  if (!cache) {
    cache = fetch("/word-study/_greek-verse-diff-report.json", {
      cache: "default",
    })
      .then(async (res) => {
        if (!res.ok) return new Map<string, GreekVerseKind>();
        const json = (await res.json()) as { diffs?: DiffRow[] };
        return buildMap(Array.isArray(json.diffs) ? json.diffs : []);
      })
      .catch(() => new Map<string, GreekVerseKind>());
  }
  return cache;
}

export function greekVerseKind(
  map: Map<string, GreekVerseKind> | null | undefined,
  book: string,
  chapter: number,
  verse: number,
): GreekVerseKind | null {
  if (!map) return null;
  return map.get(key(book, chapter, verse)) ?? null;
}
