/** BSB USFM helpers (.cache/bsb-usfm/bsb_usfm/*.usfm) */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BSB_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".cache",
  "bsb-usfm",
  "bsb_usfm",
);

export const BOOK_TO_BSB = {
  genesis: "GEN",
  exodus: "EXO",
  leviticus: "LEV",
  numbers: "NUM",
  deuteronomy: "DEU",
  joshua: "JOS",
  judges: "JDG",
  ruth: "RUT",
  samuel1: "1SA",
  samuel2: "2SA",
  kings1: "1KI",
  kings2: "2KI",
  chronicles1: "1CH",
  chronicles2: "2CH",
  ezra: "EZR",
  nehemiah: "NEH",
  esther: "EST",
  job: "JOB",
  psalms: "PSA",
  proverbs: "PRO",
  ecclesiastes: "ECC",
  songofsolomon: "SNG",
  isaiah: "ISA",
  jeremiah: "JER",
  lamentations: "LAM",
  ezekiel: "EZK",
  daniel: "DAN",
  hosea: "HOS",
  joel: "JOL",
  amos: "AMO",
  obadiah: "OBA",
  jonah: "JON",
  micah: "MIC",
  nahum: "NAM",
  habakkuk: "HAB",
  zephaniah: "ZEP",
  haggai: "HAG",
  zechariah: "ZEC",
  malachi: "MAL",
  matthew: "MAT",
  mark: "MRK",
  luke: "LUK",
  john: "JHN",
  acts: "ACT",
  romans: "ROM",
  corinthians1: "1CO",
  corinthians2: "2CO",
  galatians: "GAL",
  ephesians: "EPH",
  philippians: "PHP",
  colossians: "COL",
  thessalonians1: "1TH",
  thessalonians2: "2TH",
  timothy1: "1TI",
  timothy2: "2TI",
  titus: "TIT",
  philemon: "PHM",
  hebrews: "HEB",
  james: "JAS",
  peter1: "1PE",
  peter2: "2PE",
  john1: "1JN",
  john2: "2JN",
  john3: "3JN",
  jude: "JUD",
  revelation: "REV",
};

export function bsbPath(bookId) {
  const code = BOOK_TO_BSB[bookId];
  if (!code) return null;
  const p = path.join(BSB_DIR, `${code}.usfm`);
  return fs.existsSync(p) ? p : null;
}

/** 장별 최대 절 번호 */
export function bsbVerseMaxByChapter(text) {
  /** @type {Map<number, number>} */
  const out = new Map();
  let ch = 0;
  for (const m of text.matchAll(/\\c\s+(\d+)|\\v\s+(\d+)/g)) {
    if (m[1]) {
      ch = Number(m[1]);
      if (!out.has(ch)) out.set(ch, 0);
    } else if (ch) {
      out.set(ch, Math.max(out.get(ch) ?? 0, Number(m[2])));
    }
  }
  return out;
}

/**
 * BSB 마커: 다음 절에 붙는 s1/s2/p/b
 * @returns {{
 *   starts: Map<number, Map<number, Set<string>>>,
 *   s1Titles: Map<number, Map<number, string>>,
 *   counts: { s1: number, s2: number, p: number }
 * }}
 */
export function parseBsbMarkers(text) {
  const tokenRe =
    /\\c\s+(\d+)|\\v\s+(\d+)|\\(s1|s2)\s+([^\n\\]+)|\\(p|b|m|pi\d*)(?=[\s\\]|$)/g;

  /** @type {Map<number, Map<number, Set<string>>>} */
  const starts = new Map();
  /** @type {Map<number, Map<number, string>>} */
  const s1Titles = new Map();
  const counts = { s1: 0, s2: 0, p: 0 };

  let ch = 0;
  /** @type {Set<string>} */
  let pending = new Set();
  /** @type {string|null} */
  let pendingS1Title = null;

  let m;
  while ((m = tokenRe.exec(text)) !== null) {
    if (m[1]) {
      ch = Number(m[1]);
      pending = new Set();
      pendingS1Title = null;
      if (!starts.has(ch)) starts.set(ch, new Map());
      if (!s1Titles.has(ch)) s1Titles.set(ch, new Map());
      continue;
    }
    if (m[2]) {
      const verse = Number(m[2]);
      if (!ch) continue;
      if (pending.size) {
        const row = starts.get(ch);
        const prev = row.get(verse) ?? new Set();
        for (const t of pending) prev.add(t);
        row.set(verse, prev);
        pending = new Set();
      }
      if (pendingS1Title != null) {
        s1Titles.get(ch).set(verse, pendingS1Title);
        pendingS1Title = null;
      }
      continue;
    }
    if (m[3]) {
      const tag = m[3];
      counts[tag] += 1;
      pending.add(tag);
      if (tag === "s1") {
        pendingS1Title = m[4].replace(/\s+/g, " ").trim();
      }
      continue;
    }
    if (m[5]) {
      const raw = m[5];
      if (raw === "p") counts.p += 1;
      const tag = raw === "b" ? "b" : raw.startsWith("pi") || raw === "m" ? "p" : "p";
      pending.add(tag === "b" ? "b" : "p");
    }
  }

  return { starts, s1Titles, counts };
}

export function loadBsbBook(bookId) {
  const p = bsbPath(bookId);
  if (!p) return null;
  const text = fs.readFileSync(p, "utf8");
  const { starts, s1Titles, counts } = parseBsbMarkers(text);
  const verseMax = bsbVerseMaxByChapter(text);
  return { starts, s1Titles, counts, verseMax, path: p };
}
