// =============================================================================
// 헬라어 모드 한국어 의역체(greekKr)의 mechanical 짝대기 정리.
//
// 규칙:
//   - 한 절 안에 ' — ' 가 2개 이상이면 mechanical 으로 간주하고 모두 공백으로
//     치환한다. (로마서·복음서처럼 부연용 1개짜리 짝대기는 보존)
//   - 짝대기 제거 이후 연속 공백을 단일 공백으로 정리하고, 구두점 앞 공백 제거.
//   - 절 양끝의 공백·짝대기는 다듬는다.
//
// 옵션:
//   --dry-run        : 파일 변경 없이 통계만 출력
//   --book=<id>      : 특정 책만 처리 (없으면 전체)
//   --preview=<id>:<ch>:<v>[,<v>...] : 변경 전/후 비교 출력
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const BOOKS = [
  "matthew",
  "mark",
  "luke",
  "john",
  "acts",
  "romans",
  "corinthians1",
  "corinthians2",
  "galatians",
  "ephesians",
  "philippians",
  "colossians",
  "thessalonians1",
  "thessalonians2",
  "timothy1",
  "timothy2",
  "titus",
  "philemon",
  "hebrews",
  "james",
  "peter1",
  "peter2",
  "john1",
  "john2",
  "john3",
  "jude",
  "revelation",
];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const bookArg = args.find((a) => a.startsWith("--book="));
const previewArg = args.find((a) => a.startsWith("--preview="));

const targets = bookArg ? [bookArg.slice("--book=".length)] : BOOKS;

const previewMap = new Map();
if (previewArg) {
  const spec = previewArg.slice("--preview=".length);
  for (const piece of spec.split("|")) {
    const m = piece.match(/^([^:]+):(\d+):([\d,]+)$/);
    if (!m) continue;
    const [, book, ch, verses] = m;
    const key = `${book}:${ch}`;
    const arr = previewMap.get(key) ?? new Set();
    for (const v of verses.split(",")) arr.add(Number(v));
    previewMap.set(key, arr);
  }
}

function cleanVerse(t) {
  const dashCount = (t.match(/ — /g) || []).length;
  if (dashCount < 2) return t;
  let next = t.replace(/ — /g, " ");
  next = next.replace(/—/g, "");
  next = next.replace(/\[([^\[\]]*)\]/g, (_, inner) => inner);
  next = next.replace(/ +/g, " ");
  next = next.replace(/ ([,.!?:;])/g, "$1");
  next = next.replace(/\(\s+/g, "(");
  next = next.replace(/\s+\)/g, ")");
  return next.trim();
}

let grandUpdated = 0;
let grandFiles = 0;
for (const book of targets) {
  const filePath = path.join(repoRoot, "app", "bible-reading", `${book}.json`);
  if (!fs.existsSync(filePath)) {
    console.warn(`skip: ${book} (not found)`);
    continue;
  }
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  let changed = 0;
  for (const ch of data.chapters) {
    const arr = ch.verses.greekKr ?? [];
    const pvKey = `${book}:${ch.chapter}`;
    const pvSet = previewMap.get(pvKey);
    for (const entry of arr) {
      const before = entry.t;
      const after = cleanVerse(before);
      if (after !== before) {
        if (pvSet && pvSet.has(entry.n)) {
          console.log(`\n--- ${book} ${ch.chapter}:${entry.n}`);
          console.log("BEFORE:", before);
          console.log("AFTER :", after);
        }
        entry.t = after;
        changed += 1;
      }
    }
  }
  if (changed > 0 && !dryRun) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
    grandFiles += 1;
  }
  if (changed > 0) {
    console.log(`${book.padEnd(15)} ${changed}절 정리${dryRun ? " (dry-run)" : ""}`);
    grandUpdated += changed;
  }
}

console.log(`\n총 ${grandUpdated}절 정리 / ${grandFiles}개 파일 수정${dryRun ? " (dry-run)" : ""}`);
