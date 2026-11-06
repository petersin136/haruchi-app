#!/usr/bin/env node
/**
 * public/plans/{year365,days90,days30}.json 생성.
 * BOOKS·BOOK_ORDER 장 수를 평탄 나열한 뒤 일수 N으로 고르게 분할한다.
 * 책 경계를 넘는 하루 분량은 허용.
 *
 *   node scripts/build-plans.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "plans");

/** app/bible-reading/books.ts 와 동일 — 스크립트 단독 실행용 복사본. */
const BOOKS = {
  genesis: 50,
  exodus: 40,
  leviticus: 27,
  numbers: 36,
  deuteronomy: 34,
  joshua: 24,
  judges: 21,
  ruth: 4,
  samuel1: 31,
  samuel2: 24,
  kings1: 22,
  kings2: 25,
  chronicles1: 29,
  chronicles2: 36,
  ezra: 10,
  nehemiah: 13,
  esther: 10,
  job: 42,
  psalms: 150,
  proverbs: 31,
  ecclesiastes: 12,
  songofsolomon: 8,
  isaiah: 66,
  jeremiah: 52,
  lamentations: 5,
  ezekiel: 48,
  daniel: 12,
  hosea: 14,
  joel: 3,
  amos: 9,
  obadiah: 1,
  jonah: 4,
  micah: 7,
  nahum: 3,
  habakkuk: 3,
  zephaniah: 3,
  haggai: 2,
  zechariah: 14,
  malachi: 4,
  matthew: 28,
  mark: 16,
  luke: 24,
  john: 21,
  acts: 28,
  romans: 16,
  corinthians1: 16,
  corinthians2: 13,
  galatians: 6,
  ephesians: 6,
  philippians: 4,
  colossians: 4,
  thessalonians1: 5,
  thessalonians2: 3,
  timothy1: 6,
  timothy2: 4,
  titus: 3,
  philemon: 1,
  hebrews: 13,
  james: 5,
  peter1: 5,
  peter2: 3,
  john1: 5,
  john2: 1,
  john3: 1,
  jude: 1,
  revelation: 22,
};

const BOOK_ORDER = Object.keys(BOOKS);

function flattenChapters() {
  /** @type {{ book: string, ch: number }[]} */
  const out = [];
  for (const book of BOOK_ORDER) {
    const n = BOOKS[book];
    for (let ch = 1; ch <= n; ch += 1) out.push({ book, ch });
  }
  return out;
}

/**
 * @param {{ book: string, ch: number }[]} slice
 * @returns {{ book: string, chapters: number[] }[]}
 */
function groupReadings(slice) {
  /** @type {{ book: string, chapters: number[] }[]} */
  const readings = [];
  for (const { book, ch } of slice) {
    const last = readings[readings.length - 1];
    if (last && last.book === book) last.chapters.push(ch);
    else readings.push({ book, chapters: [ch] });
  }
  return readings;
}

/**
 * @param {string} id
 * @param {string} title
 * @param {number} dayCount
 */
function buildPlan(id, title, dayCount) {
  const all = flattenChapters();
  const total = all.length;
  /** @type {{ day: number, readings: { book: string, chapters: number[] }[] }[]} */
  const days = [];
  for (let d = 0; d < dayCount; d += 1) {
    const start = Math.floor((d * total) / dayCount);
    const end = Math.floor(((d + 1) * total) / dayCount);
    const slice = all.slice(start, end);
    days.push({ day: d + 1, readings: groupReadings(slice) });
  }
  return { id, title, days };
}

function avgChapters(plan) {
  const sums = plan.days.map((d) =>
    d.readings.reduce((acc, r) => acc + r.chapters.length, 0),
  );
  const avg = sums.reduce((a, b) => a + b, 0) / sums.length;
  return { avg, min: Math.min(...sums), max: Math.max(...sums), total: sums.reduce((a, b) => a + b, 0) };
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const specs = [
  ["year365.json", "year365", "1년 1독", 365],
  ["days90.json", "days90", "90일 1독", 90],
  ["days30.json", "days30", "30일 1독", 30],
];

for (const [file, id, title, n] of specs) {
  const plan = buildPlan(id, title, n);
  const stats = avgChapters(plan);
  const outPath = path.join(OUT_DIR, file);
  fs.writeFileSync(outPath, `${JSON.stringify(plan)}\n`, "utf8");
  console.log(
    `${file}: days=${plan.days.length} chapters=${stats.total} avg=${stats.avg.toFixed(2)} min=${stats.min} max=${stats.max}`,
  );
}

console.log(`Wrote plans to ${OUT_DIR}`);
