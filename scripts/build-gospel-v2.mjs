// =============================================================================
// 4복음서(마태/마가/누가/요한) — "헬라어 보기 v2" 데이터 빌더 (일반화).
//
// 사용:
//   node scripts/build-gospel-v2.mjs            # 4권 모두 빌드
//   node scripts/build-gospel-v2.mjs matthew    # 특정 책만
//
// 산출물:
//   app/bible-reading/matthew-v2.json
//   app/bible-reading/mark-v2.json
//   app/bible-reading/luke-v2.json
//   app/bible-reading/john-v2.json
//
// 입력:
//   - .cache/sblgnt-<book>.txt        (MorphGNT 형태소 + SBLGNT 본문)
//   - scripts/lib/gospel-lexicon.mjs  (4복음서 공통 어휘집)
//   - scripts/lib/greek-pron.mjs
//   - scripts/lib/morph-parse.mjs
//   - app/bible-reading/<book>.json   (verses.greekKr — 한글 의역)
//
// 어휘집(GOSPEL_LEXICON) 에 없는 lemma 는 gloss 빈 칸으로 출력된다(블록
// 3번째 줄이 비어 보일 뿐, 화면은 정상 동작). 누락은 stderr 에 책별로 빈도
// 순 보고 + 4권 통합 빈도 리포트도 출력해 점진적 보강에 활용한다.
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookupPron, stripDiacritics, PRON } from "./lib/greek-pron.mjs";
import { decodeMorph } from "./lib/morph-parse.mjs";
import { GOSPEL_LEXICON } from "./lib/gospel-lexicon.mjs";

// lemma 매칭은 케이스 무시 + 디아크리틱 무시 보조 인덱스를 함께 사용한다.
// (SBLGNT 의 lemma 는 인명/지명이 대문자로 시작하므로 어휘집 소문자 키와
// 직접 매칭되지 않아 누락이 과대 집계되던 문제를 해결.)
const LEX_LC = new Map();
const LEX_LC_NORM = new Map();
for (const [k, v] of Object.entries(GOSPEL_LEXICON)) {
  const lc = k.toLowerCase();
  if (!LEX_LC.has(lc)) LEX_LC.set(lc, v);
  const norm = stripDiacritics(k).toLowerCase();
  if (!LEX_LC_NORM.has(norm)) LEX_LC_NORM.set(norm, v);
}
function lookupLex(lemma) {
  if (!lemma) return null;
  return (
    GOSPEL_LEXICON[lemma] ??
    LEX_LC.get(lemma.toLowerCase()) ??
    LEX_LC_NORM.get(stripDiacritics(lemma).toLowerCase()) ??
    null
  );
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const BOOKS = [
  { id: "matthew", label: "마태복음" },
  { id: "mark", label: "마가복음" },
  { id: "luke", label: "누가복음" },
  { id: "john", label: "요한복음" },
];

const SBLGNT_MARKERS = /[\u2E00-\u2E1F]/g;
const GREEK_LETTER = /[\p{Script=Greek}\u0300-\u036f]/u;

function loadMorph(sblgntPath) {
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
    const lex = lookupLex(r.lemma);
    if (!lex || !lex.gloss) missingLex.push(r.lemma);
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

function buildBook({ id, label }) {
  const sblgntPath = path.join(repoRoot, `.cache/sblgnt-${id}.txt`);
  const bookJsonPath = path.join(repoRoot, `app/bible-reading/${id}.json`);
  const outPath = path.join(repoRoot, `app/bible-reading/${id}-v2.json`);

  if (!fs.existsSync(sblgntPath)) {
    console.warn(`⚠️  ${id}: sblgnt 데이터(${sblgntPath}) 없음 — 빌드 생략`);
    return null;
  }

  const morph = loadMorph(sblgntPath);
  const bookData = fs.existsSync(bookJsonPath)
    ? JSON.parse(fs.readFileSync(bookJsonPath, "utf8"))
    : { chapters: [] };

  // ch -> verse -> kr
  const krByCh = new Map();
  for (const c of bookData.chapters ?? []) {
    const m = new Map((c.verses?.greekKr ?? []).map((v) => [v.n, v.t]));
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
      book: id,
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
  const totalMissingTokens = [...missingAgg.values()].reduce((s, c) => s + c, 0);
  const coverage = totalTokens > 0
    ? (((totalTokens - totalMissingTokens) / totalTokens) * 100).toFixed(1)
    : "0.0";
  console.log(
    `✅ ${label}(${id}) — ${chapters.length}장 · ${totalVerses}절 · 토큰 ${totalTokens} · 커버리지 ${coverage}% (누락 lemma ${missingAgg.size}종 / ${totalMissingTokens} 토큰)`,
  );
  return { id, label, missingAgg, totalTokens, totalMissingTokens };
}

function main() {
  const onlyId = process.argv[2];
  const targets = onlyId ? BOOKS.filter((b) => b.id === onlyId) : BOOKS;
  if (onlyId && targets.length === 0) {
    console.error(`알 수 없는 책 id: ${onlyId}`);
    process.exit(1);
  }
  const reports = [];
  for (const book of targets) {
    const r = buildBook(book);
    if (r) reports.push(r);
  }

  // ─ 4권 통합 누락 빈도 리포트 (어휘 보강 우선순위 산정용) ─
  if (reports.length >= 2) {
    const merged = new Map();
    for (const r of reports) {
      for (const [lemma, c] of r.missingAgg) {
        merged.set(lemma, (merged.get(lemma) ?? 0) + c);
      }
    }
    const totalT = reports.reduce((s, r) => s + r.totalTokens, 0);
    const totalM = reports.reduce((s, r) => s + r.totalMissingTokens, 0);
    const cov = (((totalT - totalM) / totalT) * 100).toFixed(1);
    console.log(
      `\n📊 4복음서 합계 — 토큰 ${totalT} · 커버리지 ${cov}% · 누락 lemma ${merged.size}종 (${totalM} 토큰)`,
    );
    const arr = [...merged.entries()].sort((a, b) => b[1] - a[1]);
    console.log(`   통합 누락 상위 30 (빈도순):`);
    for (const [lemma, c] of arr.slice(0, 30)) {
      console.log(`     ${c.toString().padStart(4)}회  ${lemma}`);
    }
  }
}

main();
