#!/usr/bin/env node
/**
 * 장별 단락 시작 절 데이터.
 *
 * 입력:
 *   - .cache/web-usfm/*.usfm  — WEB(World English Bible, Public Domain) USFM.
 *     없으면 https://ebible.org/Scriptures/eng-web_usfm.zip 을 받아 풀어 둔다.
 *   - app/bible-reading/books.ts                         — bookId·장 수
 *   - public/bible-study/chunks/{bookId}/{장}/korean.json — 장별 한글 절 수(verses.krv)
 *   - data/paragraph-fix/{bookId}.json (선택)            — 수동 보정, 장 단위로 통째 우선
 *
 * 출력: public/paragraphs/{bookId}.json
 *   { "1": [1, 5, 8], "2": [1, 3, 7] }  // 장별 단락 시작 절, 1절 항상 포함
 *
 * 단락 표시: \p, \pi#, \pc. (\m·\nb는 앞 단락 이어짐이라 제외)
 *
 * 사용: node scripts/build-paragraphs.mjs john1 [bookId …] | --all
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const USFM_DIR = path.join(repoRoot, ".cache", "web-usfm");
const USFM_ZIP_URL = "https://ebible.org/Scriptures/eng-web_usfm.zip";
const BOOKS_TS = path.join(repoRoot, "app", "bible-reading", "books.ts");
const KOREAN_ROOT = path.join(repoRoot, "public", "bible-study", "chunks");
const FIX_DIR = path.join(repoRoot, "data", "paragraph-fix");
const OUT_DIR = path.join(repoRoot, "public", "paragraphs");

/** bookId → USFM \id 코드 */
const USFM_CODE = {
  genesis: "GEN", exodus: "EXO", leviticus: "LEV", numbers: "NUM", deuteronomy: "DEU",
  joshua: "JOS", judges: "JDG", ruth: "RUT", samuel1: "1SA", samuel2: "2SA",
  kings1: "1KI", kings2: "2KI", chronicles1: "1CH", chronicles2: "2CH", ezra: "EZR",
  nehemiah: "NEH", esther: "EST", job: "JOB", psalms: "PSA", proverbs: "PRO",
  ecclesiastes: "ECC", songofsolomon: "SNG", isaiah: "ISA", jeremiah: "JER",
  lamentations: "LAM", ezekiel: "EZK", daniel: "DAN", hosea: "HOS", joel: "JOL",
  amos: "AMO", obadiah: "OBA", jonah: "JON", micah: "MIC", nahum: "NAM",
  habakkuk: "HAB", zephaniah: "ZEP", haggai: "HAG", zechariah: "ZEC", malachi: "MAL",
  matthew: "MAT", mark: "MRK", luke: "LUK", john: "JHN", acts: "ACT", romans: "ROM",
  corinthians1: "1CO", corinthians2: "2CO", galatians: "GAL", ephesians: "EPH",
  philippians: "PHP", colossians: "COL", thessalonians1: "1TH", thessalonians2: "2TH",
  timothy1: "1TI", timothy2: "2TI", titus: "TIT", philemon: "PHM", hebrews: "HEB",
  james: "JAS", peter1: "1PE", peter2: "2PE", john1: "1JN", john2: "2JN",
  john3: "3JN", jude: "JUD", revelation: "REV",
};

function loadBooks() {
  const src = fs.readFileSync(BOOKS_TS, "utf8");
  const re = /(\w+):\s*\{\s*id:\s*"(\w+)",[^}]*?totalChapters:\s*(\d+)/g;
  /** @type {Map<string, number>} */
  const out = new Map();
  let m;
  while ((m = re.exec(src)) !== null) out.set(m[2], Number(m[3]));
  return out;
}

function ensureUsfm() {
  const has = fs.existsSync(USFM_DIR) && fs.readdirSync(USFM_DIR).some((f) => f.endsWith(".usfm"));
  if (has) return;
  fs.mkdirSync(USFM_DIR, { recursive: true });
  const zip = path.join(USFM_DIR, "eng-web_usfm.zip");
  if (!fs.existsSync(zip)) {
    console.log(`[usfm] download ${USFM_ZIP_URL}`);
    execFileSync("curl", ["-sSL", "-o", zip, USFM_ZIP_URL], { stdio: "inherit" });
  }
  execFileSync("unzip", ["-o", "-q", zip, "-d", USFM_DIR], { stdio: "inherit" });
}

function findUsfmFile(code) {
  for (const f of fs.readdirSync(USFM_DIR)) {
    if (!f.endsWith(".usfm")) continue;
    const head = fs.readFileSync(path.join(USFM_DIR, f), "utf8").slice(0, 200);
    if (new RegExp(`^\\\\id\\s+${code}\\b`, "m").test(head)) return path.join(USFM_DIR, f);
  }
  return null;
}

/** 본문 텍스트가 있는지 (USFM 마커·각주·상호참조 제거 후) */
function hasText(s) {
  const t = s
    .replace(/\\f\s[\s\S]*?\\f\*/g, "")
    .replace(/\\x\s[\s\S]*?\\x\*/g, "")
    .replace(/\\w\s([^|\\]*)(\|[^\\]*)?\\w\*/g, "$1")
    .replace(/\\[a-z0-9]+\*?/gi, "")
    .trim();
  return /[A-Za-z]/.test(t);
}

/**
 * USFM → { chapters: Map<ch, { starts: number[], maxVerse: number }>, midVerse: string[] }
 */
function parseUsfm(text) {
  const tokenRe = /\\(c|v)\s+(\d+)(?:-\d+)?|\\(p|pi\d*|pc)(?=[\s\\]|$)/g;
  /** @type {Map<number, { starts: Set<number>, maxVerse: number }>} */
  const chapters = new Map();
  const midVerse = [];
  let ch = 0;
  let verse = 0;
  let pendingPara = false;
  let m;
  const tokens = [];
  while ((m = tokenRe.exec(text)) !== null) tokens.push({ m, index: m.index, end: tokenRe.lastIndex });

  for (let i = 0; i < tokens.length; i++) {
    const { m: t, end } = tokens[i];
    if (t[1] === "c") {
      ch = Number(t[2]);
      verse = 0;
      pendingPara = false;
      chapters.set(ch, { starts: new Set(), maxVerse: 0 });
      continue;
    }
    if (!ch) continue;
    const row = chapters.get(ch);
    if (t[1] === "v") {
      verse = Number(t[2]);
      row.maxVerse = Math.max(row.maxVerse, verse);
      if (pendingPara) {
        row.starts.add(verse);
        pendingPara = false;
      }
      continue;
    }
    // 단락 마커: 다음 \v 전에 본문이 있으면 절 중간에서 시작하는 단락
    const nextIndex = tokens[i + 1]?.index ?? text.length;
    const between = text.slice(end, nextIndex);
    if (verse > 0 && hasText(between)) {
      row.starts.add(verse);
      if (!midVerse.includes(`${ch}:${verse}`)) midVerse.push(`${ch}:${verse}`);
      pendingPara = false;
    } else {
      pendingPara = true;
    }
  }

  const out = new Map();
  for (const [c, row] of chapters) {
    out.set(c, { starts: [...row.starts].sort((a, b) => a - b), maxVerse: row.maxVerse });
  }
  return { chapters: out, midVerse };
}

function koreanVerseCount(bookId, ch) {
  const p = path.join(KOREAN_ROOT, bookId, String(ch), "korean.json");
  if (!fs.existsSync(p)) return null;
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  const krv = d?.verses?.krv;
  if (!Array.isArray(krv) || !krv.length) return null;
  return Math.max(...krv.map((v) => Number(v.n) || 0));
}

function loadFix(bookId) {
  const p = path.join(FIX_DIR, `${bookId}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function buildBook(bookId, totalChapters) {
  const code = USFM_CODE[bookId];
  const report = { bookId, mismatches: [], dropped: [], midVerse: [], fixed: [], missingKorean: [] };
  if (!code) throw new Error(`USFM 코드 없음: ${bookId}`);
  const file = findUsfmFile(code);
  if (!file) throw new Error(`USFM 파일 없음: ${code}`);

  const { chapters, midVerse } = parseUsfm(fs.readFileSync(file, "utf8"));
  report.midVerse = midVerse;
  if (chapters.size !== totalChapters) {
    report.mismatches.push(`장 수: WEB ${chapters.size} / books.ts ${totalChapters}`);
  }
  const fix = loadFix(bookId);

  /** @type {Record<string, number[]>} */
  const out = {};
  for (let ch = 1; ch <= totalChapters; ch++) {
    const web = chapters.get(ch);
    const ko = koreanVerseCount(bookId, ch);
    if (ko == null) report.missingKorean.push(ch);
    if (web && ko != null && web.maxVerse !== ko) {
      report.mismatches.push(`${ch}장 절 수: WEB ${web.maxVerse} / 한글 ${ko}`);
    }

    let starts;
    const fixRow = fix?.[String(ch)];
    if (Array.isArray(fixRow)) {
      starts = fixRow.map(Number).filter((n) => Number.isInteger(n) && n > 0);
      report.fixed.push(ch);
    } else {
      starts = web ? [...web.starts] : [];
    }
    if (ko != null) {
      for (const n of starts) if (n > ko) report.dropped.push(`${ch}:${n}`);
      starts = starts.filter((n) => n <= ko);
    }
    out[String(ch)] = [...new Set([1, ...starts])].sort((a, b) => a - b);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${bookId}.json`), JSON.stringify(out) + "\n");
  return { out, report };
}

function main() {
  const args = process.argv.slice(2);
  const books = loadBooks();
  const ids = args.includes("--all") ? [...books.keys()] : args.filter((a) => !a.startsWith("--"));
  if (!ids.length) {
    console.error("사용: node scripts/build-paragraphs.mjs <bookId …> | --all");
    process.exit(1);
  }
  ensureUsfm();

  const summary = [];
  for (const id of ids) {
    const total = books.get(id);
    if (!total) {
      console.error(`books.ts에 없는 bookId: ${id}`);
      continue;
    }
    const { out, report } = buildBook(id, total);
    const paras = Object.values(out).reduce((n, a) => n + a.length, 0);
    console.log(`[${id}] ${total}장, 단락 ${paras}개 → public/paragraphs/${id}.json`);
    if (ids.length === 1) {
      for (const [ch, starts] of Object.entries(out)) console.log(`  ${ch}장: ${starts.join(", ")}`);
    }
    summary.push(report);
  }

  const issues = summary.filter(
    (r) => r.mismatches.length || r.dropped.length || r.missingKorean.length,
  );
  console.log("\n=== 장절 체계 차이 ===");
  if (!issues.length) console.log("없음");
  for (const r of issues) {
    console.log(`- ${r.bookId}`);
    for (const s of r.mismatches) console.log(`    ${s}`);
    if (r.dropped.length) console.log(`    한글 절 수 초과로 제외: ${r.dropped.join(", ")}`);
    if (r.missingKorean.length) console.log(`    korean.json 없음: ${r.missingKorean.join(", ")}장`);
  }
  const mids = summary.filter((r) => r.midVerse.length);
  if (mids.length) {
    console.log("\n=== 절 중간에서 시작하는 단락 (그 절을 시작 절로 기록) ===");
    for (const r of mids) console.log(`- ${r.bookId}: ${r.midVerse.join(", ")}`);
  }
  const fixed = summary.filter((r) => r.fixed.length);
  if (fixed.length) {
    console.log("\n=== 수동 보정 적용 ===");
    for (const r of fixed) console.log(`- ${r.bookId}: ${r.fixed.join(", ")}장`);
  }
}

main();
