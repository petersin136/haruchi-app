// =============================================================================
// OpenBible.info 관주(cross references) → 장별 관주 JSON.
//
// 원본:
//   .cache/openbible/cross-references.zip  (없으면 1회 다운로드 후 압축 해제)
//   https://a.openbible.info/data/cross-references.zip
//   License: CC BY (www.openbible.info) — public/xref/ATTRIBUTION.txt 참고
//
// 원본 스키마 (TSV, 첫 줄 헤더):
//   From Verse \t To Verse \t Votes
//   Gen.1.1    \t Rev.4.11  \t 209
//   Gen.1.1    \t Prov.8.22-Prov.8.30 \t 78    ← 범위 관주
//
// 산출:
//   public/xref/<bookId>/<chapter>.json
//     { "<verse>": [{ "to": "john.1.1", "votes": N }, ...], ... }
//   - 절마다 votes 내림차순 최대 5개 (동점은 원본 순서 유지)
//   - votes < 0 제외
//   - 범위 관주는 "proverbs.8.22-proverbs.8.30" 처럼 양끝 그대로 유지
//   - 본문 텍스트는 넣지 않고 위치만
//
// 사용:
//   node scripts/build-xref.mjs genesis          # 지정 책만
//   node scripts/build-xref.mjs genesis exodus
//   node scripts/build-xref.mjs --all            # 66권 전체
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const SOURCE_URL = "https://a.openbible.info/data/cross-references.zip";
const cacheDir = path.join(repoRoot, ".cache", "openbible");
const zipPath = path.join(cacheDir, "cross-references.zip");
const txtPath = path.join(cacheDir, "cross_references.txt");
const outRoot = path.join(repoRoot, "public", "xref");

const MAX_PER_VERSE = 5;

// OpenBible(OSIS) 약어 → app/bible-reading/books.ts 의 BookId
const OSIS_TO_BOOK_ID = {
  Gen: "genesis",
  Exod: "exodus",
  Lev: "leviticus",
  Num: "numbers",
  Deut: "deuteronomy",
  Josh: "joshua",
  Judg: "judges",
  Ruth: "ruth",
  "1Sam": "samuel1",
  "2Sam": "samuel2",
  "1Kgs": "kings1",
  "2Kgs": "kings2",
  "1Chr": "chronicles1",
  "2Chr": "chronicles2",
  Ezra: "ezra",
  Neh: "nehemiah",
  Esth: "esther",
  Job: "job",
  Ps: "psalms",
  Prov: "proverbs",
  Eccl: "ecclesiastes",
  Song: "songofsolomon",
  Isa: "isaiah",
  Jer: "jeremiah",
  Lam: "lamentations",
  Ezek: "ezekiel",
  Dan: "daniel",
  Hos: "hosea",
  Joel: "joel",
  Amos: "amos",
  Obad: "obadiah",
  Jonah: "jonah",
  Mic: "micah",
  Nah: "nahum",
  Hab: "habakkuk",
  Zeph: "zephaniah",
  Hag: "haggai",
  Zech: "zechariah",
  Mal: "malachi",
  Matt: "matthew",
  Mark: "mark",
  Luke: "luke",
  John: "john",
  Acts: "acts",
  Rom: "romans",
  "1Cor": "corinthians1",
  "2Cor": "corinthians2",
  Gal: "galatians",
  Eph: "ephesians",
  Phil: "philippians",
  Col: "colossians",
  "1Thess": "thessalonians1",
  "2Thess": "thessalonians2",
  "1Tim": "timothy1",
  "2Tim": "timothy2",
  Titus: "titus",
  Phlm: "philemon",
  Heb: "hebrews",
  Jas: "james",
  "1Pet": "peter1",
  "2Pet": "peter2",
  "1John": "john1",
  "2John": "john2",
  "3John": "john3",
  Jude: "jude",
  Rev: "revelation",
};
const ALL_BOOK_IDS = Object.values(OSIS_TO_BOOK_ID);

async function ensureSource() {
  if (fs.existsSync(txtPath)) return;
  fs.mkdirSync(cacheDir, { recursive: true });
  if (!fs.existsSync(zipPath)) {
    console.log(`다운로드: ${SOURCE_URL}`);
    const res = await fetch(SOURCE_URL);
    if (!res.ok) throw new Error(`다운로드 실패: ${res.status}`);
    fs.writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
  }
  execFileSync("unzip", ["-o", "-q", zipPath, "-d", cacheDir]);
}

const unmapped = new Map(); // OSIS 약어 → 등장 횟수

// "Gen.1.1" → { bookId, chapter, verse, id: "genesis.1.1" } | null
function mapRef(osis) {
  const m = /^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)$/.exec(osis);
  if (!m) {
    unmapped.set(osis, (unmapped.get(osis) ?? 0) + 1);
    return null;
  }
  const bookId = OSIS_TO_BOOK_ID[m[1]];
  if (!bookId) {
    unmapped.set(m[1], (unmapped.get(m[1]) ?? 0) + 1);
    return null;
  }
  const chapter = Number(m[2]);
  const verse = Number(m[3]);
  return { bookId, chapter, verse, id: `${bookId}.${chapter}.${verse}` };
}

// "Prov.8.22-Prov.8.30" → "proverbs.8.22-proverbs.8.30"
function mapTarget(osis) {
  const parts = osis.split("-");
  const mapped = parts.map(mapRef);
  if (mapped.some((r) => r === null)) return null;
  return mapped.map((r) => r.id).join("-");
}

async function main() {
  const args = process.argv.slice(2);
  const targets = args.includes("--all") ? ALL_BOOK_IDS : args;
  if (targets.length === 0) {
    console.error("사용법: node scripts/build-xref.mjs <bookId...> | --all");
    process.exit(1);
  }
  const badIds = targets.filter((id) => !ALL_BOOK_IDS.includes(id));
  if (badIds.length) throw new Error(`알 수 없는 bookId: ${badIds.join(", ")}`);
  const targetSet = new Set(targets);

  await ensureSource();
  const lines = fs.readFileSync(txtPath, "utf8").split("\n").slice(1);

  // bookId → chapter → verse → [{ to, votes, order }]
  const data = new Map();
  let order = 0;
  let skippedNegative = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    const [fromRaw, toRaw, votesRaw] = line.split("\t");
    const from = mapRef(fromRaw.trim());
    const to = mapTarget(toRaw.trim());
    if (!from || !to) continue;
    if (!targetSet.has(from.bookId)) continue;
    const votes = Number(votesRaw);
    if (!Number.isFinite(votes) || votes < 0) {
      skippedNegative++;
      continue;
    }
    if (!data.has(from.bookId)) data.set(from.bookId, new Map());
    const chapters = data.get(from.bookId);
    if (!chapters.has(from.chapter)) chapters.set(from.chapter, new Map());
    const verses = chapters.get(from.chapter);
    if (!verses.has(from.verse)) verses.set(from.verse, []);
    verses.get(from.verse).push({ to, votes, order: order++ });
  }

  let totalBytes = 0;
  let totalFiles = 0;
  for (const bookId of targets) {
    const chapters = data.get(bookId);
    if (!chapters) {
      console.warn(`[${bookId}] 관주 없음`);
      continue;
    }
    const bookDir = path.join(outRoot, bookId);
    fs.mkdirSync(bookDir, { recursive: true });
    let bookBytes = 0;
    const chapterNums = [...chapters.keys()].sort((a, b) => a - b);
    for (const ch of chapterNums) {
      const verses = chapters.get(ch);
      const out = {};
      for (const v of [...verses.keys()].sort((a, b) => a - b)) {
        out[String(v)] = verses
          .get(v)
          .sort((a, b) => b.votes - a.votes || a.order - b.order)
          .slice(0, MAX_PER_VERSE)
          .map(({ to, votes }) => ({ to, votes }));
      }
      const json = JSON.stringify(out);
      fs.writeFileSync(path.join(bookDir, `${ch}.json`), json);
      bookBytes += Buffer.byteLength(json);
      totalFiles++;
    }
    totalBytes += bookBytes;
    console.log(`[${bookId}] ${chapterNums.length}장, ${(bookBytes / 1024).toFixed(1)} KB`);
  }

  console.log(`\n합계: ${totalFiles}개 파일, ${(totalBytes / 1024).toFixed(1)} KB`);
  console.log(`음수 votes 제외: ${skippedNegative}건 (대상 책 기준)`);
  if (unmapped.size) {
    console.log("매핑 실패:");
    for (const [name, n] of unmapped) console.log(`  ${name}: ${n}건`);
  } else {
    console.log("매핑 실패: 없음");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
