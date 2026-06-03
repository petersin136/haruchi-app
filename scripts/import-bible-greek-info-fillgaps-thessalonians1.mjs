// =============================================================================
// 데살로니가 전서 — info 미매칭 보정.
//
// 살전 1:2~3 — SBLGNT 분절상 ἀδιαλείπτως 가 1:2 끝(한국어 성경은 1:3 시작).
// 살전 2:6~7 — SBLGNT 분절상 βάρει, ἀπόστολοι 가 2:7 시작(한국어 성경은 2:6 끝).
//             그리고 νήπιοι(어린아이) 대신 ἤπιοι(온유한 자) — 사본 변형.
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const bookPath = path.join(repoRoot, "app/bible-reading/thessalonians1.json");

function stripDiacritics(s) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "");
}

function applyInfoToTokens(tokens, infos) {
  if (!infos) return 0;
  let attached = 0;
  const remaining = new Map();
  for (const [k, v] of Object.entries(infos))
    remaining.set(stripDiacritics(k), v);
  for (const tok of tokens) {
    if (tok.info) continue;
    if (!tok.w) continue;
    const k = stripDiacritics(tok.w);
    if (remaining.has(k)) {
      tok.info = remaining.get(k);
      remaining.delete(k);
      attached += 1;
    }
  }
  if (remaining.size > 0) {
    console.warn(
      `   ⚠️  매칭 안 됨: ${Array.from(remaining.keys()).join(", ")}`,
    );
  }
  return attached;
}

const FIXES = {
  1: {
    2: {
      "ἀδιαλείπτως": "ἀδιαλείπτως 부사 — '끊임없이'. SBLGNT 분절상 본 절의 마지막 단어(한국어 성경은 1:3 시작). 5:17 의 같은 어휘 — 결정적 그리스도인의 결정적 기도 자세.",
    },
  },
  2: {
    7: {
      "βάρει": "βάρος 중성 단수 여격 — '무거움으로'. SBLGNT 분절상 본 절 시작(한국어 성경은 2:6 끝). '무거운 자' — 사도가 결정적 권위로 결정적 부담이 될 수 있었음을 함의.",
      "ἀπόστολοι": "ἀπόστολος 남성 복수 주격 — '사도들'. SBLGNT 분절상 본 절 시작. 사도가 결정적 권리를 결정적 포기한 결정적 자기 비움.",
      "ἤπιοι": "ἤπιος 형용사 남성 복수 주격 — '온유한 자들'. 사본 변형 — SBLGNT/NA28 은 ἤπιοι(온유한 자), 다수 사본은 νήπιοι(어린아이). 어느 쪽이든 결정적 결정적 부드러운 사도의 결정적 자기 묘사.",
    },
  },
};

function main() {
  const data = JSON.parse(fs.readFileSync(bookPath, "utf8"));
  let total = 0;
  for (const ch of data.chapters) {
    const chFix = FIXES[ch.chapter];
    if (!chFix) continue;
    for (const entry of ch.verses.greekTokens ?? []) {
      const infos = chFix[entry.n];
      if (!infos) continue;
      console.log(`  ${ch.chapter}장 ${entry.n}절`);
      total += applyInfoToTokens(entry.tokens, infos);
    }
  }
  fs.writeFileSync(bookPath, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`✅ thessalonians1.json — ${total} 토큰 부착`);
}

main();
