#!/usr/bin/env node
/**
 * 장별 단락 시작 절 데이터 (WEB USFM → public/paragraphs/{bookId}.json).
 *
 * 입력:
 *   - .cache/web-usfm/*.usfm  — WEB(World English Bible, Public Domain) USFM.
 *     없으면 https://ebible.org/Scriptures/eng-web_usfm.zip 을 받아 풀어 둔다.
 *   - app/bible-reading/books.ts           — bookId·장 수 (읽기만)
 *   - public/bible-data/{bookId}.json      — 개역한글 장별 절 수
 *   - data/paragraph-fix/{bookId}.json (선택) — 수동 보정, 장 단위로 통째 우선
 *
 * 출력: public/paragraphs/{bookId}.json
 *   { "1": [1, 5, 8], "2": [1, 3, 7] }  // 장별 단락 시작 절, 1절 항상 포함
 *
 * 규칙:
 *   - 산문: \p, \m, \pi#, \s(소제목) 다음 첫 절 = 단락 시작
 *   - \p 등이 절 중간에 있으면 그 절이 아니라 다음 절부터 새 단락
 *   - 시가서(시·잠·욥·전·아·애): \q 무시, \b·소제목(\s/\d)만
 *   - 개역한글에 없는 절 번호는 제외
 *   - john1.json 은 덮어쓰지 않고 비교만
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
const BIBLE_DATA = path.join(repoRoot, "public", "bible-data");
const FIX_DIR = path.join(repoRoot, "data", "paragraph-fix");
const OUT_DIR = path.join(repoRoot, "public", "paragraphs");
const EXISTING_JOHN1 = path.join(OUT_DIR, "john1.json");

/** 시가서 — \q 로 나누지 않음 */
const POETRY = new Set([
  "job",
  "psalms",
  "proverbs",
  "ecclesiastes",
  "songofsolomon",
  "lamentations",
]);

/** bookId → USFM \id 코드 */
const USFM_CODE = {
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
  const has =
    fs.existsSync(USFM_DIR) &&
    fs.readdirSync(USFM_DIR).some((f) => f.endsWith(".usfm"));
  if (has) {
    console.log(`[usfm] reuse ${USFM_DIR}`);
    return;
  }
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
    const head = fs.readFileSync(path.join(USFM_DIR, f), "utf8").slice(0, 240);
    if (new RegExp(`^\\\\id\\s+${code}\\b`, "m").test(head)) {
      return path.join(USFM_DIR, f);
    }
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
 * USFM → chapters Map + midVerseBreaks(절 중간 마커 → 다음 절로 넘긴 목록)
 * @param {string} text
 * @param {boolean} poetry
 */
function parseUsfm(text, poetry) {
  // 산문: p / m / pi# / s# · 시가: b / s# / d(소제목)
  const marker = poetry
    ? String.raw`(b|s\d*|d)`
    : String.raw`(p|m|pi\d*|pc|s\d*)`;
  const tokenRe = new RegExp(
    String.raw`\\(c|v)\s+(\d+)(?:-\d+)?|\\${marker}(?=[\s\\]|$)`,
    "g",
  );

  /** @type {Map<number, { starts: Set<number>, maxVerse: number }>} */
  const chapters = new Map();
  /** @type {string[]} */
  const midVerseBreaks = [];
  let ch = 0;
  let verse = 0;
  let pendingPara = false;

  /** @type {{ m: RegExpExecArray, end: number }[]} */
  const tokens = [];
  let m;
  while ((m = tokenRe.exec(text)) !== null) {
    tokens.push({ m, end: tokenRe.lastIndex });
  }

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

    // 단락/소제목/연 구분 마커
    const nextIndex = tokens[i + 1]?.m.index ?? text.length;
    const between = text.slice(end, nextIndex);
    // 절 중간에 마커가 있으면(앞에 본문) → 다음 절부터 새 단락
    if (verse > 0 && hasText(between)) {
      midVerseBreaks.push(`${ch}:${verse}`);
    }
    pendingPara = true;
  }

  /** @type {Map<number, { starts: number[], maxVerse: number }>} */
  const out = new Map();
  for (const [c, row] of chapters) {
    out.set(c, {
      starts: [...row.starts].sort((a, b) => a - b),
      maxVerse: row.maxVerse,
    });
  }
  return { chapters: out, midVerseBreaks };
}

function koreanVerseCount(bookId, ch) {
  const p = path.join(BIBLE_DATA, `${bookId}.json`);
  if (!fs.existsSync(p)) return null;
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  const list = d?.chapters;
  if (!Array.isArray(list)) return null;
  const chapter = list.find((c) => Number(c.chapter) === ch);
  const krv = chapter?.verses?.krv;
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
  const report = {
    bookId,
    totalChapters,
    paragraphCount: 0,
    mismatches: /** @type {string[]} */ ([]),
    dropped: /** @type {string[]} */ ([]),
    midVerseBreaks: /** @type {string[]} */ ([]),
    fixed: /** @type {number[]} */ ([]),
    missingKorean: /** @type {number[]} */ ([]),
    singleVerseParas: /** @type {{ ch: number, singles: number, total: number }[]} */ ([]),
  };
  if (!code) throw new Error(`USFM 코드 없음: ${bookId}`);
  const file = findUsfmFile(code);
  if (!file) throw new Error(`USFM 파일 없음: ${code}`);

  const poetry = POETRY.has(bookId);
  const { chapters, midVerseBreaks } = parseUsfm(
    fs.readFileSync(file, "utf8"),
    poetry,
  );
  report.midVerseBreaks = midVerseBreaks;
  if (chapters.size !== totalChapters) {
    report.mismatches.push(
      `장 수: WEB ${chapters.size} / books.ts ${totalChapters}`,
    );
  }
  const fix = loadFix(bookId);

  /** @type {Record<string, number[]>} */
  const out = {};
  for (let ch = 1; ch <= totalChapters; ch++) {
    const web = chapters.get(ch);
    const ko = koreanVerseCount(bookId, ch);
    if (ko == null) report.missingKorean.push(ch);
    if (web && ko != null && web.maxVerse !== ko) {
      report.mismatches.push(
        `${ch}장 절 수: WEB ${web.maxVerse} / 한글 ${ko}`,
      );
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
    const final = [...new Set([1, ...starts])].sort((a, b) => a - b);
    out[String(ch)] = final;

    // 1절짜리 단락이 많은 장 점검
    const ends = [...final, (ko ?? web?.maxVerse ?? final.at(-1) ?? 1) + 1];
    let singles = 0;
    for (let i = 0; i < final.length; i++) {
      if (ends[i + 1] - final[i] === 1) singles += 1;
    }
    if (singles >= 3 && singles / final.length >= 0.5) {
      report.singleVerseParas.push({
        ch,
        singles,
        total: final.length,
      });
    }
  }

  report.paragraphCount = Object.values(out).reduce((n, a) => n + a.length, 0);
  return { out, report };
}

function diffJohn1(generated) {
  if (!fs.existsSync(EXISTING_JOHN1)) {
    return { exists: false };
  }
  const existing = JSON.parse(fs.readFileSync(EXISTING_JOHN1, "utf8"));
  /** @type {Record<string, { onlyOld: number[], onlyNew: number[], same: boolean }>} */
  const perChapter = {};
  const keys = new Set([...Object.keys(existing), ...Object.keys(generated)]);
  let sameBooks = true;
  for (const k of [...keys].sort((a, b) => Number(a) - Number(b))) {
    const oldA = existing[k] ?? [];
    const newA = generated[k] ?? [];
    const oldS = new Set(oldA);
    const newS = new Set(newA);
    const onlyOld = oldA.filter((n) => !newS.has(n));
    const onlyNew = newA.filter((n) => !oldS.has(n));
    const same =
      onlyOld.length === 0 &&
      onlyNew.length === 0 &&
      oldA.length === newA.length;
    if (!same) sameBooks = false;
    perChapter[k] = { onlyOld, onlyNew, same };
  }
  return { exists: true, identical: sameBooks, perChapter, existing, generated };
}

function main() {
  const args = process.argv.slice(2);
  const books = loadBooks();
  const ids = args.includes("--all")
    ? [...books.keys()]
    : args.filter((a) => !a.startsWith("--"));
  if (!ids.length) {
    console.error("사용: node scripts/build-paragraphs.mjs <bookId …> | --all");
    process.exit(1);
  }
  ensureUsfm();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  /** @type {ReturnType<typeof buildBook>["report"][]} */
  const summary = [];
  /** @type {{ bookId: string, chapters: number, paragraphs: number }[]} */
  const table = [];
  let john1Diff = null;

  for (const id of ids) {
    const total = books.get(id);
    if (!total) {
      console.error(`books.ts에 없는 bookId: ${id}`);
      continue;
    }
    const { out, report } = buildBook(id, total);
    summary.push(report);
    table.push({
      bookId: id,
      chapters: total,
      paragraphs: report.paragraphCount,
    });

    if (id === "john1") {
      john1Diff = diffJohn1(out);
      console.log(
        `[john1] ${total}장, 단락 ${report.paragraphCount}개 — 기존 파일 유지(덮어쓰지 않음)`,
      );
    } else {
      fs.writeFileSync(
        path.join(OUT_DIR, `${id}.json`),
        JSON.stringify(out) + "\n",
      );
      console.log(
        `[${id}] ${total}장, 단락 ${report.paragraphCount}개 → public/paragraphs/${id}.json`,
      );
    }

    if (ids.length === 1 && id !== "john1") {
      for (const [ch, starts] of Object.entries(out)) {
        console.log(`  ${ch}장: ${starts.join(", ")}`);
      }
    }
  }

  // ── 보고 ──────────────────────────────────────────────────────────────
  console.log("\n=== 66권 생성 표 ===");
  console.log("bookId\t장수\t단락수");
  for (const row of table) {
    console.log(`${row.bookId}\t${row.chapters}\t${row.paragraphs}`);
  }
  console.log(
    `합계\t${table.reduce((n, r) => n + r.chapters, 0)}\t${table.reduce((n, r) => n + r.paragraphs, 0)}`,
  );

  console.log("\n=== 장절 체계 차이 (WEB vs 개역한글) ===");
  const issues = summary.filter(
    (r) => r.mismatches.length || r.dropped.length || r.missingKorean.length,
  );
  if (!issues.length) console.log("없음");
  for (const r of issues) {
    console.log(`- ${r.bookId}`);
    for (const s of r.mismatches) console.log(`    ${s}`);
    if (r.dropped.length) {
      console.log(`    한글 절 수 초과로 제외: ${r.dropped.join(", ")}`);
    }
    if (r.missingKorean.length) {
      console.log(`    bible-data 없음: ${r.missingKorean.join(", ")}장`);
    }
  }

  const fine = summary.filter((r) => r.singleVerseParas.length);
  if (fine.length) {
    console.log("\n=== 1절짜리 단락이 많은 장 (≥3개 & ≥50%) ===");
    for (const r of fine) {
      const bits = r.singleVerseParas
        .map((x) => `${x.ch}장(${x.singles}/${x.total})`)
        .join(", ");
      console.log(`- ${r.bookId}: ${bits}`);
    }
  }

  if (john1Diff?.exists) {
    console.log("\n=== john1 기존 vs 새 결과 ===");
    if (john1Diff.identical) {
      console.log("동일");
    } else {
      for (const [ch, d] of Object.entries(john1Diff.perChapter)) {
        if (d.same) continue;
        console.log(
          `  ${ch}장: 기존만 [${d.onlyOld.join(", ")}] / 새만 [${d.onlyNew.join(", ")}]`,
        );
        console.log(
          `         기존 ${JSON.stringify(john1Diff.existing[ch])} → 새 ${JSON.stringify(john1Diff.generated[ch])}`,
        );
      }
    }
  } else if (ids.includes("john1")) {
    console.log("\n=== john1 기존 파일 없음 — 비교 생략 ===");
  }

  // 샘플 장
  const samples = [
    ["genesis", "30"],
    ["psalms", "23"],
    ["romans", "8"],
  ];
  console.log("\n=== 샘플 단락 시작 절 ===");
  for (const [id, ch] of samples) {
    const p = path.join(OUT_DIR, `${id}.json`);
    if (!fs.existsSync(p)) {
      console.log(`- ${id} ${ch}장: (파일 없음)`);
      continue;
    }
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    console.log(`- ${id} ${ch}장: ${(data[ch] ?? []).join(", ")}`);
  }
}

main();
