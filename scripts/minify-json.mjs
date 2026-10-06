// JSON 들여쓰기·공백만 제거한다. 파싱된 값(키 순서 포함)은 그대로 둔다.
//
// 대상:
//   public/bible-data
//   public/bible-v2
//   public/bible-kjv
//   public/bible-study/chunks
//
// 검증: JSON.parse(변환 후) 가 JSON.parse(변환 전) 과 깊은 비교로 같아야 한다.
// 하나라도 다르면 그 파일은 쓰지 않고 종료 코드 1.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DIRS = [
  "public/bible-data",
  "public/bible-v2",
  "public/bible-kjv",
  "public/bible-study/chunks",
];

function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith(".json")) out.push(p);
  }
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i += 1) {
    if (keysA[i] !== keysB[i]) return false;
    if (!deepEqual(a[keysA[i]], b[keysB[i]])) return false;
  }
  return true;
}

function formatMb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const stats = new Map();
let files = 0;
let rewritten = 0;
let failed = 0;

for (const rel of DIRS) {
  const abs = path.join(repoRoot, rel);
  const list = [];
  walk(abs, list);
  let before = 0;
  let after = 0;
  for (const file of list) {
    const raw = fs.readFileSync(file);
    before += raw.length;
    let original;
    try {
      original = JSON.parse(raw.toString("utf8"));
    } catch (e) {
      console.error(`parse 실패: ${path.relative(repoRoot, file)} — ${e.message}`);
      failed += 1;
      continue;
    }
    const minified = JSON.stringify(original);
    let parsed;
    try {
      parsed = JSON.parse(minified);
    } catch (e) {
      console.error(`재파싱 실패: ${path.relative(repoRoot, file)} — ${e.message}`);
      failed += 1;
      continue;
    }
    if (!deepEqual(original, parsed)) {
      console.error(`값 불일치: ${path.relative(repoRoot, file)}`);
      failed += 1;
      continue;
    }
    after += Buffer.byteLength(minified, "utf8");
    if (raw.toString("utf8") !== minified) {
      fs.writeFileSync(file, minified);
      rewritten += 1;
    }
    files += 1;
  }
  stats.set(rel, { files: list.length, before, after });
}

console.log("\n폴더별 용량");
let totalBefore = 0;
let totalAfter = 0;
for (const [rel, s] of stats) {
  totalBefore += s.before;
  totalAfter += s.after;
  const saved = s.before - s.after;
  const pct = s.before ? ((saved / s.before) * 100).toFixed(1) : "0.0";
  console.log(
    `${rel.padEnd(32)} ${String(s.files).padStart(5)}개  ${formatMb(s.before).padStart(10)} → ${formatMb(s.after).padStart(10)}  (−${pct}%)`,
  );
}
const totalSaved = totalBefore - totalAfter;
const totalPct = totalBefore ? ((totalSaved / totalBefore) * 100).toFixed(1) : "0.0";
console.log(
  `${"합계".padEnd(32)} ${String(files).padStart(5)}개  ${formatMb(totalBefore).padStart(10)} → ${formatMb(totalAfter).padStart(10)}  (−${totalPct}%)`,
);
console.log(`다시 쓴 파일 ${rewritten}개, 검증 실패 ${failed}개`);
if (failed > 0) process.exit(1);
