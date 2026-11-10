#!/usr/bin/env node
/**
 * BSB \s1 → public/headings/{bookId}.json
 * 영어 원문: .cache/headings-raw/
 *
 * 사용:
 *   node scripts/build-headings.mjs --pilot
 *   node scripts/build-headings.mjs --books exodus,leviticus,...
 *   node scripts/build-headings.mjs --batch 1   # 10권 단위 (파일럿 제외 순서)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadBsbBook, BOOK_TO_BSB } from "./lib-bsb-usfm.mjs";
import {
  titleFromBsbEnglish,
  rememberTitle,
  allMappedTitles,
  normEn,
} from "./heading-ko-from-bsb.mjs";
import {
  missingContentStems,
  sectionBody,
  titleFromKrvVerse,
} from "./lib-heading-krv.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const PARA_DIR = path.join(repoRoot, "public", "paragraphs");
const OUT_DIR = path.join(repoRoot, "public", "headings");
const RAW_DIR = path.join(repoRoot, ".cache", "headings-raw");
const BIBLE_DATA = path.join(repoRoot, "public", "bible-data");
const REPORT_DIR = path.join(repoRoot, ".cache");
const BOOKS_TS = path.join(repoRoot, "app", "bible-reading", "books.ts");

const PILOT = {
  matthew: null,
  genesis: null,
  psalms: { maxChapter: 30 },
  john1: null,
};

const BATCH_SKIP = new Set(Object.keys(PILOT));

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
  if (!fs.existsSync(paraPath)) return 0;
  const para = JSON.parse(fs.readFileSync(paraPath, "utf8"));
  let added = 0;
  for (const [ch, items] of Object.entries(headingsByCh)) {
    const starts = new Set((para[ch] ?? [1]).map(Number));
    for (const verse of Object.keys(items).map(Number)) {
      if (!starts.has(verse)) {
        starts.add(verse);
        added += 1;
      }
    }
    para[ch] = [...starts].sort((a, b) => a - b);
  }
  fs.writeFileSync(paraPath, JSON.stringify(para) + "\n");
  return added;
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

function clip14(s) {
  const chars = [...String(s)];
  if (chars.length > 14) return chars.slice(0, 14).join("").trim();
  return String(s).trim();
}

/**
 * BSB 뜻 + 개역한글 표기. MAP 우선, 실패 시 본문 구절에서 고름.
 */
function makeKoTitle(en, body, firstVerse) {
  let ko = titleFromBsbEnglish(en);
  if (ko !== "본문 단락" && missingContentStems(ko, body).length === 0) {
    return clip14(ko);
  }

  // 본문에서 통과하는 짧은 구절 후보
  const first = String(firstVerse ?? "");
  const parts = first.split(
    /[\,，]| 하고 | 하며 | 하되 | 가로되 | 이르시되 | 하니 | 하시고/,
  );
  /** @type {string[]} */
  const cands = [];
  for (const part of parts) {
    let p = part.trim();
    if (!p) continue;
    const chars = [...p];
    for (let L = Math.min(14, chars.length); L >= 4; L--) {
      let cand = chars.slice(0, L).join("").trim();
      cand = cand.replace(/[은는이가을를의과와에로]$/u, "");
      if ([...cand].length < 4) continue;
      if (missingContentStems(cand, body).length === 0) {
        cands.push(cand);
        break;
      }
    }
  }
  if (!cands.length) {
    const fallback = titleFromKrvVerse(first, 14);
    if (fallback && missingContentStems(fallback, body).length === 0) {
      cands.push(fallback);
    }
  }
  if (!cands.length) {
    // 본문에 있는 연속 2–14음절 그대로
    const compact = first.replace(/\s+/g, "");
    const hangul = (compact.match(/[가-힣]+/g) ?? []).join("");
    for (let L = Math.min(14, hangul.length); L >= 4; L--) {
      const cand = hangul.slice(0, L);
      if (missingContentStems(cand, body).length === 0) {
        cands.push(cand);
        break;
      }
    }
  }

  ko = cands[0] ?? "본문 단락";
  ko = clip14(ko);
  if (en && ko !== "본문 단락") rememberTitle(en, ko);
  return ko;
}

function parseArgs(argv) {
  if (argv.includes("--pilot")) {
    return { mode: "pilot", books: Object.keys(PILOT), opts: PILOT };
  }
  const bi = argv.indexOf("--books");
  if (bi >= 0) {
    const list = (argv[bi + 1] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return { mode: "books", books: list, opts: {} };
  }
  const bati = argv.indexOf("--batch");
  if (bati >= 0) {
    const n = Number(argv[bati + 1] ?? "1");
    const all = loadBookIds().filter((id) => !BATCH_SKIP.has(id));
    const size = 10;
    const start = (n - 1) * size;
    const books = all.slice(start, start + size);
    return { mode: `batch${n}`, books, opts: {}, batchIndex: n, batchTotal: Math.ceil(all.length / size) };
  }
  return null;
}

function buildBook(bookId, opt) {
  const bsb = loadBsbBook(bookId);
  if (!bsb) throw new Error(`BSB 없음: ${bookId}`);

  /** @type {Record<string, Record<string, string>>} */
  const rawEn = {};
  /** @type {Record<string, Record<string, string>>} */
  const koOut = {};
  /** @type {{ ref: string, en: string, ko: string }[]} */
  const samples = [];
  let n = 0;
  let miss = 0;
  /** @type {{ ref: string, title: string, missing: string[], related: string[] }[]} */
  const missRows = [];

  for (const [ch, map] of bsb.s1Titles) {
    if (opt?.maxChapter && ch > opt.maxChapter) continue;
    if (!map.size) continue;
    const krv = loadKrvChapter(bookId, ch);
    if (!krv.size) continue;
    const maxKo = Math.max(...krv.keys());
    const verseList = [...map.keys()].filter((v) => v <= maxKo).sort((a, b) => a - b);
    if (!verseList.length) continue;

    rawEn[String(ch)] = {};
    koOut[String(ch)] = {};

    for (let i = 0; i < verseList.length; i++) {
      const verse = verseList[i];
      const en = map.get(verse);
      const end = i + 1 < verseList.length ? verseList[i + 1] - 1 : maxKo;
      const body = sectionBody(krv, verse, end);
      const ko = makeKoTitle(en, body, krv.get(verse) ?? "");
      rawEn[String(ch)][String(verse)] = en;
      koOut[String(ch)][String(verse)] = ko;
      n += 1;
      const missing = missingContentStems(ko, body);
      if (missing.length) {
        miss += 1;
        missRows.push({
          ref: `${ch}:${verse}`,
          title: ko,
          missing: missing.map((m) => m.stem),
          related: missing.flatMap((m) => m.related).slice(0, 6),
        });
      }
      if (samples.length < 10) {
        samples.push({ ref: `${ch}:${verse}`, en, ko });
      }
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
  const added = ensureParagraphStarts(bookId, koOut);
  return { n, miss, missRows, samples, added };
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed || !parsed.books.length) {
    console.error(
      "사용: node scripts/build-headings.mjs --pilot | --books a,b | --batch N",
    );
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(RAW_DIR, { recursive: true });

  /** @type {Record<string, number>} */
  const counts = {};
  /** @type {Record<string, number>} */
  const missCounts = {};
  /** @type {{ book: string, ref: string, en: string, ko: string }[]} */
  const samples = [];
  let paraAdded = 0;

  for (const bookId of parsed.books) {
    if (!BOOK_TO_BSB[bookId]) {
      console.warn(`[skip] unknown book ${bookId}`);
      continue;
    }
    const opt = parsed.opts[bookId] ?? null;
    const r = buildBook(bookId, opt);
    counts[bookId] = r.n;
    missCounts[bookId] = r.miss;
    paraAdded += r.added;
    for (const s of r.samples) {
      if (samples.length < 10) samples.push({ book: bookId, ...s });
    }
    console.log(
      `[${bookId}] 소제목 ${r.n}개, KRV걸림 ${r.miss}, 단락시작+${r.added}`,
    );
    if (r.missRows.length && r.missRows.length <= 8) {
      for (const row of r.missRows) {
        console.log(
          `  ! ${row.ref} 「${row.title}」 missing=${row.missing.join(",")}`,
        );
      }
    } else if (r.missRows.length) {
      console.log(`  ! KRV 미통과 ${r.missRows.length}건 (보고서 참고)`);
    }
  }

  // README
  fs.writeFileSync(
    path.join(OUT_DIR, "README.md"),
    `# 단락 소제목 (headings)

출처: **Berean Standard Bible (BSB), public domain since 2023-04-30**  
한국어 제목은 BSB 영어 \`\\s1\` 제목의 뜻을 참고하여 **자체 작성**했으며, 개역한글 본문 표기에 맞췄습니다.  
개역개정·새번역 등 다른 한국어 성경의 소제목 문구를 옮기지 않았습니다.

- 원문 영어: \`.cache/headings-raw/{bookId}.json\`
- 형식: \`{ "장": { "절": "한국어 제목" } }\`
`,
  );

  // MAP 스냅샷(축적분)
  const mapPath = path.join(REPORT_DIR, "headings-map-snapshot.json");
  fs.writeFileSync(mapPath, JSON.stringify(allMappedTitles(), null, 2) + "\n");

  const report = {
    mode: parsed.mode,
    books: parsed.books,
    counts,
    missCounts,
    sum: Object.values(counts).reduce((a, b) => a + b, 0),
    missSum: Object.values(missCounts).reduce((a, b) => a + b, 0),
    paragraphStartsAdded: paraAdded,
    samples,
  };
  const reportName =
    parsed.mode === "pilot"
      ? "headings-pilot-report.json"
      : `headings-${parsed.mode}-report.json`;
  fs.writeFileSync(
    path.join(REPORT_DIR, reportName),
    JSON.stringify(report, null, 2) + "\n",
  );

  console.log(`\n합계: ${report.sum}, KRV걸림: ${report.missSum}, 단락+${paraAdded}`);
  console.log("견본:");
  for (const s of samples) {
    console.log(`  ${s.book} ${s.ref} | ${s.en} | ${s.ko}`);
  }
  console.log(`보고서: .cache/${reportName}`);
}

main();
