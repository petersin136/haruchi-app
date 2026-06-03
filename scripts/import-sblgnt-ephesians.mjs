// =============================================================================
// 에베소서 "원어 묵상" 인프라 — SBLGNT 본문 + 토큰 자동 주입.
//
// 출력:
//   ephesians.json 의 각 1~6장 chapter.verses 에
//     - greek       : 절별 헬라어 본문 (평문, 결합 부호·SBLGNT 마커 정리)
//     - greekTokens : 절별 단어 토큰 배열 [{ w, p, info? }, ...]
//   를 새로 만들어 넣는다(이미 있어도 덮어쓴다).
//   greekKr / greekWords 는 별개의 정성 작성 스크립트에서 다룬다(여기선 손대지 않음).
//
// 입력:
//   morphgnt/sblgnt GitHub 의 70-Eph-morphgnt.txt (CC BY-SA 4.0).
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookupPron } from "./lib/greek-pron.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const cacheDir = path.join(repoRoot, ".cache");
const sblgntPath = path.join(cacheDir, "sblgnt-ephesians.txt");
const ephesiansPath = path.join(repoRoot, "app/bible-reading/ephesians.json");

const SBLGNT_MARKERS = /[\u2E00-\u2E1F]/g;
const GREEK_LETTER = /[\p{Script=Greek}\u0300-\u036f]/u;

function loadMorphgnt() {
  if (!fs.existsSync(sblgntPath)) {
    throw new Error(
      `SBLGNT cache missing: ${sblgntPath}\n` +
        `다음 명령으로 받아주세요:\n` +
        `  curl -sL https://raw.githubusercontent.com/morphgnt/sblgnt/master/70-Eph-morphgnt.txt -o ${sblgntPath}`,
    );
  }
  const text = fs.readFileSync(sblgntPath, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const verses = new Map();
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

function splitWordAndPunct(rawText) {
  const cleaned = rawText.replace(SBLGNT_MARKERS, "");
  let i = 0;
  while (i < cleaned.length && !GREEK_LETTER.test(cleaned[i])) i++;
  const leading = cleaned.slice(0, i);
  let j = cleaned.length;
  while (j > i && !GREEK_LETTER.test(cleaned[j - 1])) j--;
  const word = cleaned.slice(i, j);
  const trailing = cleaned.slice(j);
  return { leading, word, trailing };
}

function buildVerse(words) {
  const tokens = [];
  const textParts = [];
  const missing = [];
  for (const w of words) {
    const { leading, word, trailing } = splitWordAndPunct(w.rawText);
    if (leading) {
      for (const ch of leading) tokens.push({ w: ch, p: "" });
    }
    if (word) {
      const pron = lookupPron(word, w.lemma);
      if (!pron) missing.push({ word, lemma: w.lemma });
      tokens.push({ w: word, p: pron ?? "" });
      textParts.push(word + trailing);
    }
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
  const raw = fs.readFileSync(ephesiansPath, "utf8");
  const data = JSON.parse(raw);

  if (!data.translations.greek) {
    data.translations.greek = {
      label: "원어묵상",
      note: "SBLGNT (SBL Greek New Testament) — © Society of Biblical Literature, Logos Bible Software (CC BY 4.0). 형태소 분석은 MorphGNT (CC BY-SA 4.0). 한국어 의역·단어 풀이는 본 앱이 직접 작성한 학습용 자료입니다.",
    };
  }

  let totalVerses = 0;
  let totalTokens = 0;
  let totalWithPron = 0;
  const missingAgg = new Map();
  for (const ch of data.chapters) {
    const greekArr = [];
    const tokensArr = [];
    for (const krvVerse of ch.verses.krv) {
      const key = `${ch.chapter}:${krvVerse.n}`;
      const wordList = verses.get(key);
      if (!wordList) {
        console.warn(
          `⚠️  ${ch.chapter}장 ${krvVerse.n}절 — 헬라어 데이터 없음`,
        );
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

  fs.writeFileSync(ephesiansPath, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`✅ ${ephesiansPath} 갱신 완료`);
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
    console.warn(
      `⚠️  발음 누락 ${missingAgg.size} 종 (총 ${arr.reduce((s, x) => s + x.c, 0)} 회)`,
    );
    console.warn(`   상위 30개 (빈도순):`);
    for (const { k, c } of arr.slice(0, 30)) {
      const [word, lemma] = k.split("|");
      console.warn(`     ${c.toString().padStart(3)}회  ${word}  (lemma: ${lemma})`);
    }
  }
}

main();
