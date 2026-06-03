// =============================================================================
// 로마서 "원어 묵상" 인프라 — SBLGNT 본문 + 토큰 자동 주입.
//
// 출력:
//   romans.json 의 각 1~16장 chapter.verses 에
//     - greek       : 절별 헬라어 본문 (평문, 결합 부호·SBLGNT 마커 정리)
//     - greekTokens : 절별 단어 토큰 배열 [{ w, p, info? }, ...]
//   를 새로 만들어 넣는다(이미 있어도 덮어쓴다).
//   greekKr / greekWords 는 별개의 정성 작성 스크립트에서 다룬다(여기선 손대지 않음).
//
// 입력:
//   morphgnt/sblgnt GitHub 의 66-Ro-morphgnt.txt (CC BY-SA 4.0).
//   포맷: "BBCCVV PoS Parsing Text Word Norm Lemma" (공백 구분, UTF-8).
//   - BBCCVV: 06CCVV — book 06 = Romans
//   - Text  : 본문 단어(구두점·강세·결합 부호 포함; SBLGNT 의 ⸀⸁⸂⸃⸄⸅⸆⸇ 마커)
//   - Word  : 단어만(구두점 제외)
//   - Lemma : 표제어
//
// 토큰화:
//   - 단어 토큰: { w: 단어(원형 그대로), p: 발음, info?: ... }  (구두점은 단어에서 분리)
//   - 구두점 토큰: { w: ",", p: "" } 처럼 별도. 시각적으로 사이에 끼워 자연스럽게.
//
// 본문 재구성:
//   같은 절의 Text 컬럼들을 공백으로 join. 결합 부호(SBLGNT 마커)는 제거.
//   (마태복음 1장의 greek 형식과 동일한 톤)
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRON, LEMMA_PRON, lookupPron, stripDiacritics } from "./lib/greek-pron.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const cacheDir = path.join(repoRoot, ".cache");
const sblgntPath = path.join(cacheDir, "sblgnt-romans.txt");
const romansPath = path.join(repoRoot, "app/bible-reading/romans.json");

// SBLGNT 본문 마커(번역상 부가 표시) — 화면 표시에서는 제거.
const SBLGNT_MARKERS = /[\u2E00-\u2E1F]/g; // ⸀⸁⸂⸃⸄⸅⸆⸇ 등 supplemental punctuation 영역.

// 헬라어 글자(악센트·기식 포함) 범위.
const GREEK_LETTER = /[\p{Script=Greek}\u0300-\u036f]/u;

function loadMorphgnt() {
  if (!fs.existsSync(sblgntPath)) {
    throw new Error(
      `SBLGNT cache missing: ${sblgntPath}\n` +
        `다음 명령으로 받아주세요:\n` +
        `  curl -sL https://raw.githubusercontent.com/morphgnt/sblgnt/master/66-Ro-morphgnt.txt -o ${sblgntPath}`,
    );
  }
  const text = fs.readFileSync(sblgntPath, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const verses = new Map(); // key: `${ch}:${v}` → { rawTexts: string[], words: Array<{text, word, lemma}> }
  for (const line of lines) {
    const cols = line.split(/\s+/);
    if (cols.length < 7) continue;
    const [bcv, _pos, _parse, rawText, word, _norm, lemma] = cols;
    if (!bcv || bcv.length < 6) continue;
    const ch = parseInt(bcv.slice(2, 4), 10);
    const v = parseInt(bcv.slice(4, 6), 10);
    const key = `${ch}:${v}`;
    if (!verses.has(key)) verses.set(key, []);
    verses.get(key).push({ rawText, word, lemma });
  }
  return verses;
}

// 한 단어 raw text 에서 SBLGNT 마커 제거 + 구두점 분리.
//   "⸂Χριστοῦ" → letters: "Χριστοῦ", trailingPunct: ""
//   "Ἰησοῦ⸃,"  → letters: "Ἰησοῦ",   trailingPunct: ","
//   "θεοῦ."    → letters: "θεοῦ",    trailingPunct: "."
// 마커는 letters 에 포함되지 않게 정리.
function splitWordAndPunct(rawText) {
  const cleaned = rawText.replace(SBLGNT_MARKERS, "");
  // 앞쪽 비-글자(구두점 등) 분리.
  let i = 0;
  while (i < cleaned.length && !GREEK_LETTER.test(cleaned[i])) i++;
  const leading = cleaned.slice(0, i);
  let j = cleaned.length;
  while (j > i && !GREEK_LETTER.test(cleaned[j - 1])) j--;
  const word = cleaned.slice(i, j);
  const trailing = cleaned.slice(j);
  return { leading, word, trailing };
}

// 한 절의 morphgnt 단어 배열 → 토큰 배열 + 본문 문자열.
function buildVerse(words) {
  const tokens = [];
  const textParts = [];
  const missing = [];
  const seenInfo = new Set();
  for (const w of words) {
    const { leading, word, trailing } = splitWordAndPunct(w.rawText);
    // 선행 구두점(드물지만 ‘ ʼ 같은 게 단어 앞에 붙는 케이스)을 별도 토큰으로.
    if (leading) {
      for (const ch of leading) tokens.push({ w: ch, p: "" });
    }
    if (word) {
      const pron = lookupPron(word, w.lemma);
      if (!pron) missing.push({ word, lemma: w.lemma });
      tokens.push({ w: word, p: pron ?? "" });
      textParts.push(word + trailing);
    } else if (trailing) {
      // 글자 없이 구두점만 있는 토큰(예: 어떤 절 끝 마크). 무시.
    }
    // 후행 구두점도 별도 토큰으로 시각화.
    if (trailing) {
      for (const ch of trailing) tokens.push({ w: ch, p: "" });
    }
  }
  return {
    text: textParts.join(" "),
    tokens,
    missing,
  };
}

function main() {
  const verses = loadMorphgnt();
  const raw = fs.readFileSync(romansPath, "utf8");
  const data = JSON.parse(raw);

  // translations.greek 메타가 없으면 추가.
  if (!data.translations.greek) {
    data.translations.greek = {
      label: "원어묵상",
      note: "SBLGNT (SBL Greek New Testament) — © Society of Biblical Literature, Logos Bible Software (CC BY 4.0). 형태소 분석은 MorphGNT (CC BY-SA 4.0). 한국어 의역·단어 풀이는 본 앱이 직접 작성한 학습용 자료입니다.",
    };
  }

  let totalVerses = 0;
  let totalTokens = 0;
  let totalWithPron = 0;
  const missingAgg = new Map(); // word|lemma → count
  for (const ch of data.chapters) {
    const greekArr = [];
    const tokensArr = [];
    for (const krvVerse of ch.verses.krv) {
      const key = `${ch.chapter}:${krvVerse.n}`;
      const wordList = verses.get(key);
      if (!wordList) {
        console.warn(`⚠️  ${ch.chapter}장 ${krvVerse.n}절 — 헬라어 데이터 없음`);
        greekArr.push({ n: krvVerse.n, t: "" });
        tokensArr.push({ n: krvVerse.n, tokens: [] });
        continue;
      }
      const built = buildVerse(wordList);
      greekArr.push({ n: krvVerse.n, t: built.text });
      tokensArr.push({ n: krvVerse.n, tokens: built.tokens });
      totalVerses += 1;
      totalTokens += built.tokens.length;
      totalWithPron += built.tokens.filter((t) => t.p).length;
      for (const m of built.missing) {
        const k = `${m.word}|${m.lemma}`;
        missingAgg.set(k, (missingAgg.get(k) ?? 0) + 1);
      }
    }
    ch.verses.greek = greekArr;
    ch.verses.greekTokens = tokensArr;
  }

  fs.writeFileSync(romansPath, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`✅ ${romansPath} 갱신 완료`);
  console.log(
    `   절 ${totalVerses}개, 토큰 ${totalTokens}개, 발음 매핑 ${totalWithPron}개 (${(
      (totalWithPron / totalTokens) *
      100
    ).toFixed(1)}%)`,
  );

  if (missingAgg.size > 0) {
    const arr = Array.from(missingAgg.entries())
      .map(([k, c]) => ({ k, c }))
      .sort((a, b) => b.c - a.c);
    console.warn(`⚠️  발음 누락 ${missingAgg.size} 종 (총 ${arr.reduce((s, x) => s + x.c, 0)} 회)`);
    console.warn(`   상위 50개 (빈도순):`);
    for (const { k, c } of arr.slice(0, 50)) {
      const [word, lemma] = k.split("|");
      console.warn(`     ${c.toString().padStart(3)}회  ${word}  (lemma: ${lemma})`);
    }
  }
}

main();
