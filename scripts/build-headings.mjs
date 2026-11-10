#!/usr/bin/env node
/**
 * BSB \s1 → public/headings/{bookId}.json
 * 사용:
 *   node scripts/build-headings.mjs --all
 *   node scripts/build-headings.mjs --books exodus,isaiah
 *   node scripts/build-headings.mjs --batch N
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadBsbBook, BOOK_TO_BSB } from "./lib-bsb-usfm.mjs";
import { titleFromBsbEnglish } from "./heading-ko-from-bsb.mjs";
import {
  checkHeadingTitle,
  sectionVerseTexts,
} from "./lib-heading-check.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const PARA_DIR = path.join(repoRoot, "public", "paragraphs");
const OUT_DIR = path.join(repoRoot, "public", "headings");
const RAW_DIR = path.join(repoRoot, ".cache", "headings-raw");
const BIBLE_DATA = path.join(repoRoot, "public", "bible-data");
const REPORT_DIR = path.join(repoRoot, ".cache");
const BOOKS_TS = path.join(repoRoot, "app", "bible-reading", "books.ts");

function loadBookIds() {
  const src = fs.readFileSync(BOOKS_TS, "utf8");
  const re = /(\w+):\s*\{\s*id:\s*"(\w+)",[^}]*?totalChapters:\s*(\d+)/g;
  /** @type {string[]} */
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[2]);
  return out;
}

function ensureParagraphStarts(bookId, headingsByCh) {
  const paraPath = path.join(PARA_DIR, `${bookId}.json`);
  if (!fs.existsSync(paraPath)) return { added: 0, missing: 0 };
  const para = JSON.parse(fs.readFileSync(paraPath, "utf8"));
  let added = 0;
  let headingVerses = 0;
  let present = 0;
  for (const [ch, items] of Object.entries(headingsByCh)) {
    const starts = new Set((para[ch] ?? [1]).map(Number));
    for (const verse of Object.keys(items).map(Number)) {
      headingVerses += 1;
      if (starts.has(verse)) present += 1;
      else {
        starts.add(verse);
        added += 1;
      }
    }
    para[ch] = [...starts].sort((a, b) => a - b);
  }
  fs.writeFileSync(paraPath, JSON.stringify(para) + "\n");
  return { added, missing: headingVerses - present, headingVerses };
}

function loadKrvChapter(bookId, ch) {
  const p = path.join(BIBLE_DATA, `${bookId}.json`);
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  const chapter = d.chapters.find((c) => c.chapter === ch);
  /** @type {Map<number, string>} */
  const krv = new Map();
  for (const v of chapter?.verses?.krv ?? []) krv.set(Number(v.n), String(v.t ?? ""));
  return krv;
}

function parseArgs(argv) {
  if (argv.includes("--all")) {
    return { mode: "all", books: loadBookIds() };
  }
  const bi = argv.indexOf("--books");
  if (bi >= 0) {
    const list = (argv[bi + 1] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return { mode: "books", books: list };
  }
  const bati = argv.indexOf("--batch");
  if (bati >= 0) {
    const n = Number(argv[bati + 1] ?? "1");
    const all = loadBookIds();
    const size = 10;
    const start = (n - 1) * size;
    return {
      mode: `batch${n}`,
      books: all.slice(start, start + size),
      batchIndex: n,
    };
  }
  if (argv.includes("--pilot")) {
    return {
      mode: "pilot",
      books: ["matthew", "genesis", "psalms", "john1"],
    };
  }
  return null;
}

function buildBook(bookId, opt = {}) {
  const bsb = loadBsbBook(bookId);
  if (!bsb) throw new Error(`BSB 없음: ${bookId}`);

  /** @type {Record<string, Record<string, string>>} */
  const rawEn = {};
  /** @type {Record<string, Record<string, string>>} */
  const koOut = {};
  /** @type {{ ref: string, en: string, ko: string }[]} */
  const samples = [];
  let n = 0;
  let fail = 0;
  /** @type {{ ref: string, title: string, reasons: string[], en: string }[]} */
  const failRows = [];

  for (const [ch, map] of bsb.s1Titles) {
    if (opt?.maxChapter && ch > opt.maxChapter) continue;
    if (!map.size) continue;
    const krv = loadKrvChapter(bookId, ch);
    if (!krv.size) continue;
    const maxKo = Math.max(...krv.keys());
    const verseList = [...map.keys()]
      .filter((v) => v <= maxKo)
      .sort((a, b) => a - b);
    if (!verseList.length) continue;

    rawEn[String(ch)] = {};
    koOut[String(ch)] = {};

    for (let i = 0; i < verseList.length; i++) {
      const verse = verseList[i];
      const en = map.get(verse);
      const end = i + 1 < verseList.length ? verseList[i + 1] - 1 : maxKo;
      const texts = sectionVerseTexts(krv, verse, end);
      const ko = titleFromBsbEnglish(en);
      rawEn[String(ch)][String(verse)] = en;
      koOut[String(ch)][String(verse)] = ko;
      n += 1;
      const chk = checkHeadingTitle(ko, texts);
      if (!chk.ok) {
        fail += 1;
        failRows.push({
          ref: `${ch}:${verse}`,
          title: ko,
          reasons: chk.reasons,
          en,
        });
      }
      if (samples.length < 10) samples.push({ ref: `${ch}:${verse}`, en, ko });
    }
  }

  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(RAW_DIR, `${bookId}.json`),
    JSON.stringify(rawEn, null, 2) + "\n",
  );
  fs.writeFileSync(
    path.join(OUT_DIR, `${bookId}.json`),
    JSON.stringify(koOut, null, 2) + "\n",
  );
  const para = ensureParagraphStarts(bookId, koOut);
  return { n, fail, failRows, samples, para };
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed || !parsed.books.length) {
    console.error(
      "사용: node scripts/build-headings.mjs --all | --batch N | --books a,b",
    );
    process.exit(1);
  }

  // 오염된 스냅샷 제거
  const snap = path.join(REPORT_DIR, "headings-map-snapshot.json");
  if (fs.existsSync(snap)) fs.unlinkSync(snap);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(RAW_DIR, { recursive: true });

  /** @type {Record<string, number>} */
  const counts = {};
  /** @type {Record<string, number>} */
  const failCounts = {};
  /** @type {{ book: string, ref: string, en: string, ko: string }[]} */
  const samples = [];
  let paraAdded = 0;
  let paraMissingBefore = 0;
  let headingTotal = 0;
  /** @type {any[]} */
  const allFails = [];

  for (const bookId of parsed.books) {
    if (!BOOK_TO_BSB[bookId]) {
      console.warn(`[skip] ${bookId}`);
      continue;
    }
    const opt =
      parsed.mode === "pilot" && bookId === "psalms"
        ? { maxChapter: null }
        : {};
    const r = buildBook(bookId, opt);
    counts[bookId] = r.n;
    failCounts[bookId] = r.fail;
    paraAdded += r.para.added;
    paraMissingBefore += r.para.missing;
    headingTotal += r.n;
    allFails.push(...r.failRows.map((x) => ({ book: bookId, ...x })));
    for (const s of r.samples) {
      if (samples.length < 10) samples.push({ book: bookId, ...s });
    }
    console.log(
      `[${bookId}] 소제목 ${r.n}, 규칙실패 ${r.fail}, 단락시작+${r.para.added}`,
    );
  }

  fs.writeFileSync(
    path.join(OUT_DIR, "README.md"),
    `# 단락 소제목 (headings)

출처: **Berean Standard Bible (BSB), public domain since 2023-04-30**  
한국어 제목은 BSB 영어 \`\\s1\` 제목의 뜻을 참고하여 **자체 작성**했습니다.  
개역개정·새번역 등 다른 한국어 성경의 소제목 문구를 옮기지 않았습니다.

- 원문 영어: \`.cache/headings-raw/{bookId}.json\`
- 형식: \`{ "장": { "절": "한국어 제목" } }\`
`,
  );

  const report = {
    mode: parsed.mode,
    books: parsed.books,
    counts,
    failCounts,
    sum: Object.values(counts).reduce((a, b) => a + b, 0),
    failSum: Object.values(failCounts).reduce((a, b) => a + b, 0),
    paragraphStartsAdded: paraAdded,
    paragraphMissingBeforeFix: paraMissingBefore,
    headingTotal,
    samples,
    failSample: allFails.slice(0, 40),
  };
  const reportName =
    parsed.mode === "all"
      ? "headings-all-report.json"
      : `headings-${parsed.mode}-report.json`;
  fs.writeFileSync(
    path.join(REPORT_DIR, reportName),
    JSON.stringify(report, null, 2) + "\n",
  );

  console.log(
    `\n합계 ${report.sum}, 규칙실패 ${report.failSum}, 단락시작 보강 ${paraAdded} (이전 누락 ${paraMissingBefore})`,
  );
  console.log("견본:");
  for (const s of samples) {
    console.log(`  ${s.book} ${s.ref} | ${s.en} | ${s.ko}`);
  }
  console.log(`보고서: .cache/${reportName}`);
}

main();
