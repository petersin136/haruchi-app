// =============================================================================
// 빌립보서·골로새서 — info 미매칭 보정 (소수 절).
//
// 본 콘텐츠 작성 시 키의 격·수·시제 가 본문과 어긋나 부착이 안 된 절들을
// 본문 inflection 그대로의 키로 다시 부착한다.
//
// 빌 4:21 — ἅγιον (단수 대격)
//          본 콘텐츠에서는 ἁγίοις (복수 여격) 키로 작성 → 미매칭
// 골 3:25 — ἠδίκησεν (부정과거 능동) / κομίσεται (미래 중간)
//          본 콘텐츠에서는 ἀδίκημα (명사) 키로 작성 → 미매칭
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

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
  philippians: {
    4: {
      21: {
        "ἅγιον": "ἅγιος 형용사 남성 단수 대격 — '한 성도라도'. 본 편지의 결정적 마지막 호명. 1:1 의 ἁγίοις(복수 여격, '성도들') 가 본 절에서 단수 대격으로 다시 — 한 사람 한 사람의 결정적 호명. 사도가 빌립보 교회의 어느 한 성도도 빠뜨리지 않으려는 결정적 목회적 정.",
      },
    },
  },
  colossians: {
    3: {
      25: {
        "ἠδίκησεν": "ἀδικέω 3인칭 단수 부정과거 능동 — '부당하게 행했다'. ἄδικος(불의한) 의 동사형. 본 절의 결정적 시간 어휘 — 부정과거 — 한 번 끝난 행위. 그러나 그 결과를 받음(κομίσεται) 은 미래. 행위는 끝났으나 보응은 남아 있다는 결정적 신적 정의.",
        "κομίσεται": "κομίζω 3인칭 단수 미래 중간 — '받을 것이다'. '거두어 들임, 돌려받음' 의 어휘. 한 번 보낸 것이 결국 자기 자신에게로 돌아옴 — 갈 6:7 의 '심은 것을 거둠' 의 결정적 메아리.",
      },
    },
  },
};

function main() {
  let totalAttached = 0;
  for (const [bookId, chapterMap] of Object.entries(FIXES)) {
    const bookPath = path.join(repoRoot, `app/bible-reading/${bookId}.json`);
    const data = JSON.parse(fs.readFileSync(bookPath, "utf8"));
    let bookAttached = 0;
    for (const ch of data.chapters) {
      const chFix = chapterMap[ch.chapter];
      if (!chFix) continue;
      for (const entry of ch.verses.greekTokens ?? []) {
        const infos = chFix[entry.n];
        if (!infos) continue;
        console.log(`  ${bookId} ${ch.chapter}장 ${entry.n}절`);
        bookAttached += applyInfoToTokens(entry.tokens, infos);
      }
    }
    fs.writeFileSync(
      bookPath,
      JSON.stringify(data, null, 2) + "\n",
      "utf8",
    );
    console.log(`✅ ${bookId}.json — ${bookAttached} 토큰 부착`);
    totalAttached += bookAttached;
  }
  console.log(`\n총 부착: ${totalAttached} 토큰`);
}

main();
