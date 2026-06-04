// =============================================================================
// 마태복음 전체(28장) — "헬라어 보기 v2" 데이터 빌더.
//
// 산출물:
//   app/bible-reading/matthew-v2.json
//
// 입력:
//   - .cache/sblgnt-matthew.txt        (MorphGNT 형태소 + SBLGNT 본문)
//   - scripts/lib/matt-lexicon.mjs     (1장 어휘집 + 빈도 상위 ~230)
//   - scripts/lib/greek-pron.mjs       (헬라어 → 한글 발음)
//   - scripts/lib/morph-parse.mjs      (parse code → 한국어 라벨)
//   - app/bible-reading/matthew.json   (verses.greekKr — 한글 의역)
//
// 출력 구조:
// {
//   "meta": { "book": "matthew", "sources": {...} },
//   "chapters": [
//     { "chapter": 1, "verses": [{ n, copyGreek, copyKr, tokens: [...] }, ...] },
//     { "chapter": 2, "verses": [...] },
//     ... (28장)
//   ]
// }
//
// 어휘집(MATT_LEXICON) 에 없는 lemma 는 gloss 빈 칸으로 출력된다(블록 3번째
// 줄이 비어 보일 뿐, 화면은 정상 동작). 누락은 stderr 에 빈도 순으로 보고
// 되어 점진적으로 어휘를 추가하기 좋다.
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookupPron, stripDiacritics, PRON } from "./lib/greek-pron.mjs";
import { decodeMorph } from "./lib/morph-parse.mjs";
import { MATT_LEXICON } from "./lib/matt-lexicon.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const sblgntPath = path.join(repoRoot, ".cache/sblgnt-matthew.txt");
const matthewJsonPath = path.join(repoRoot, "app/bible-reading/matthew.json");
const outPath = path.join(repoRoot, "app/bible-reading/matthew-v2.json");

const SBLGNT_MARKERS = /[\u2E00-\u2E1F]/g;
const GREEK_LETTER = /[\p{Script=Greek}\u0300-\u036f]/u;

function loadMorph() {
  const text = fs.readFileSync(sblgntPath, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  // ch -> v -> [rows]
  const out = new Map();
  for (const line of lines) {
    const cols = line.split(/\s+/);
    if (cols.length < 7) continue;
    const [bcv, pos, parse, rawText, word, norm, lemma] = cols;
    if (!bcv || bcv.length < 6) continue;
    const ch = parseInt(bcv.slice(2, 4), 10);
    const v = parseInt(bcv.slice(4, 6), 10);
    if (!out.has(ch)) out.set(ch, new Map());
    const ver = out.get(ch);
    if (!ver.has(v)) ver.set(v, []);
    ver.get(v).push({ pos, parse, rawText, word, norm, lemma });
  }
  return out;
}

function splitPunct(rawText) {
  const cleaned = rawText.replace(SBLGNT_MARKERS, "");
  let i = 0;
  while (i < cleaned.length && !GREEK_LETTER.test(cleaned[i])) i++;
  let j = cleaned.length;
  while (j > i && !GREEK_LETTER.test(cleaned[j - 1])) j--;
  return {
    leading: cleaned.slice(0, i),
    word: cleaned.slice(i, j),
    trailing: cleaned.slice(j),
  };
}

// PRON 키를 케이스·디아크리틱 무시로 빠르게 찾기 위한 정규화 캐시.
const PRON_LC_NORM = new Map(
  Object.keys(PRON).map((k) => [stripDiacritics(k).toLowerCase(), PRON[k]]),
);

function pronWord(word) {
  if (PRON[word]) return PRON[word];
  const key = stripDiacritics(word).toLowerCase();
  return PRON_LC_NORM.get(key) ?? null;
}

function pron(word, lemma) {
  return pronWord(word) || lookupPron(word, lemma) || "";
}

function lemmaPron(lemma) {
  return pron(lemma, lemma);
}

function buildVerse(rows, n) {
  const tokens = [];
  const greekParts = [];
  const missingLex = [];
  for (const r of rows) {
    const { word, trailing } = splitPunct(r.rawText);
    if (!word) continue;
    const p = pron(word, r.lemma);
    const lex = MATT_LEXICON[r.lemma];
    if (!lex) missingLex.push(r.lemma);
    const { posLabel, parseLabel, parseLabelLong } = decodeMorph(r.pos, r.parse);
    tokens.push({
      w: word,
      p,
      gloss: lex?.gloss ?? "",
      lemma: r.lemma,
      lemmaP: lemmaPron(r.lemma),
      pos: r.pos,
      posLabel,
      parse: r.parse,
      parseLabel,
      parseLabelLong,
      meanings: lex?.meanings ?? [],
      nameType: lex?.nameType ?? null,
      note: lex?.note ?? "",
    });
    greekParts.push(word + trailing);
  }
  return {
    verse: { n, copyGreek: greekParts.join(" "), copyKr: "", tokens },
    missingLex,
  };
}

function main() {
  const morph = loadMorph();
  const matthew = JSON.parse(fs.readFileSync(matthewJsonPath, "utf8"));

  // ch -> verse -> kr
  const krByCh = new Map();
  for (const c of matthew.chapters) {
    const m = new Map((c.verses.greekKr ?? []).map((v) => [v.n, v.t]));
    krByCh.set(c.chapter, m);
  }

  const chapterNumbers = Array.from(morph.keys()).sort((a, b) => a - b);
  const chapters = [];
  let totalTokens = 0;
  let totalVerses = 0;
  const missingAgg = new Map();

  for (const ch of chapterNumbers) {
    const verseMap = morph.get(ch);
    const krMap = krByCh.get(ch) ?? new Map();
    const verseNumbers = Array.from(verseMap.keys()).sort((a, b) => a - b);
    const verses = [];
    for (const n of verseNumbers) {
      const { verse, missingLex } = buildVerse(verseMap.get(n), n);
      verse.copyKr = krMap.get(n) ?? "";
      verses.push(verse);
      totalTokens += verse.tokens.length;
      totalVerses += 1;
      for (const lemma of missingLex) {
        missingAgg.set(lemma, (missingAgg.get(lemma) ?? 0) + 1);
      }
    }
    chapters.push({ chapter: ch, verses });
  }

  const output = {
    meta: {
      book: "matthew",
      sources: {
        sblgnt:
          "SBLGNT © Society of Biblical Literature & Logos Bible Software (CC BY 4.0)",
        morphgnt: "MorphGNT (CC BY-SA 4.0)",
        kr: "개역한글 참고 의역(본 앱 직접 작성, 학습용)",
      },
    },
    chapters,
  };

  fs.writeFileSync(outPath, JSON.stringify(output) + "\n", "utf8");
  console.log(
    `✅ ${path.relative(repoRoot, outPath)} 갱신 — ${chapters.length}장, ${totalVerses}절, 토큰 ${totalTokens}개`,
  );
  // 어휘 누락 통계 (빈도 상위 60 까지만 노출).
  if (missingAgg.size > 0) {
    const arr = [...missingAgg.entries()].sort((a, b) => b[1] - a[1]);
    const totalMissingTokens = arr.reduce((s, [, c]) => s + c, 0);
    console.warn(
      `⚠️  어휘집(MATT_LEXICON) 누락 lemma ${arr.length}종 (총 ${totalMissingTokens} 토큰).`,
    );
    console.warn(`   상위 30 (빈도순):`);
    for (const [lemma, c] of arr.slice(0, 30)) {
      console.warn(`     ${c.toString().padStart(4)}회  ${lemma}`);
    }
    const coverage = (
      ((totalTokens - totalMissingTokens) / totalTokens) *
      100
    ).toFixed(1);
    console.log(`   gloss 커버리지: ${coverage}% (${totalTokens - totalMissingTokens}/${totalTokens})`);
  }
}

main();
