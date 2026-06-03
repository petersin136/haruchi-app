// =============================================================================
// 갈라디아서 — info 미매칭 보정.
//
// 갈 2:19 — 한국어 성경은 'Χριστῷ συνεσταύρωμαι' 를 2:20 시작으로 분절하지만
//          SBLGNT 는 2:19 의 끝으로 둠. 본 절 자체의 결정적 두 단어를 직접 부착.
// 갈 4:29 — 본 콘텐츠 키는 ἐδίωκεν 였으나 SBLGNT 본문은 ἐδίωκε (ν 없음).
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const bookPath = path.join(repoRoot, "app/bible-reading/galatians.json");

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
  2: {
    19: {
      "Χριστῷ": "Χριστός 남성 단수 여격 — '그리스도와 (함께)'. SBLGNT 본문 분절상 본 절의 마지막에 위치(한국어 성경은 2:20 시작으로 분절). 본 한 단어로 사도의 결정적 '함께 십자가에 못 박힘' 의 결정적 대상.",
      "συνεσταύρωμαι": "συσταυρόω 1인칭 단수 완료 수동 — '나는 함께 십자가에 못 박혔다'. σύν(함께) + σταυρόω. 완료형 — 한 번 일어나 결정적으로 계속되는 상태. 본 편지의 결정적 자기 정체성. 5:24 의 같은 동사가 신자 전체에 적용.",
    },
  },
  4: {
    29: {
      "ἐδίωκε": "διώκω 3인칭 단수 미완료 — '박해했다'. 1:13, 23 의 같은 동사. 미완료 — 결정적 지속된 행위. 옛적 이스마엘이 이삭을 결정적 박해함이 율법주의자들의 결정적 신자 박해의 결정적 패턴.",
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
  console.log(`✅ galatians.json — ${total} 토큰 부착`);
}

main();
