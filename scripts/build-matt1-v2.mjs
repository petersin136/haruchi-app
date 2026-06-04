// =============================================================================
// 마태복음 1장 — "헬라어 보기" v2 데이터 빌더 (테스트용).
//
// 산출물:
//   app/bible-reading/matthew1-v2.json
//
// 입력:
//   - .cache/sblgnt-matthew.txt    (MorphGNT, SBLGNT 본문 + 형태소 분석)
//   - scripts/lib/matt1-lexicon.mjs (lemma → 한글 글로스/뜻 목록/노트)
//   - scripts/lib/greek-pron.mjs    (헬라어 → 한글 발음 룩업)
//   - scripts/lib/morph-parse.mjs   (parse code → 한국어 라벨)
//   - app/bible-reading/matthew.json 의 verses.greekKr (한글 의역 — 절별 1줄)
//
// 출력 데이터 구조(상단 V2_HEADER 와 함께 docs 로 보존):
// {
//   "meta": {
//     "book": "matthew",
//     "chapter": 1,
//     "sources": {
//       "sblgnt": "SBLGNT © Society of Biblical Literature (CC BY 4.0)",
//       "morphgnt": "MorphGNT (CC BY-SA 4.0)",
//       "kr": "개역한글 참고 의역(본 앱 직접 작성, 학습용)"
//     }
//   },
//   "verses": [
//     {
//       "n": 1,
//       "copyGreek": "Βίβλος γενέσεως Ἰησοῦ χριστοῦ ...",
//       "copyKr":    "아브라함과 다윗의 자손이신 ...",
//       "tokens": [
//         {
//           "w": "Βίβλος",
//           "p": "비블로스",
//           "gloss": "책",
//           "lemma": "βίβλος",
//           "lemmaP": "비블로스",
//           "pos": "N-",
//           "posLabel": "명사",
//           "parse": "----NSF-",
//           "parseLabel": "여성 단수 주격",
//           "parseLabelLong": "주격 · 단수 · 여성",
//           "meanings": ["책", "두루마리", "기록"],
//           "note": "고대에는 파피루스 ..."
//         }, ...
//       ]
//     }, ...
//   ]
// }
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookupPron, stripDiacritics, PRON } from "./lib/greek-pron.mjs";
import { decodeMorph } from "./lib/morph-parse.mjs";
import { MATT1_LEXICON } from "./lib/matt1-lexicon.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const sblgntPath = path.join(repoRoot, ".cache/sblgnt-matthew.txt");
const matthewJsonPath = path.join(repoRoot, "app/bible-reading/matthew.json");
const outPath = path.join(repoRoot, "app/bible-reading/matthew1-v2.json");

const SBLGNT_MARKERS = /[\u2E00-\u2E1F]/g;
const GREEK_LETTER = /[\p{Script=Greek}\u0300-\u036f]/u;

function loadMorph() {
  const text = fs.readFileSync(sblgntPath, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const out = new Map();
  for (const line of lines) {
    const cols = line.split(/\s+/);
    if (cols.length < 7) continue;
    const [bcv, pos, parse, rawText, word, norm, lemma] = cols;
    if (!bcv || bcv.length < 6) continue;
    const ch = parseInt(bcv.slice(2, 4), 10);
    if (ch !== 1) continue; // matt 1 만
    const v = parseInt(bcv.slice(4, 6), 10);
    const key = v;
    if (!out.has(key)) out.set(key, []);
    out.get(key).push({ pos, parse, rawText, word, norm, lemma });
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

// 굴절형 PRON 룩업 — 케이스/디아크리틱 차이를 모두 무시해 PRON 키와 매칭.
// 매칭이 안 되면 null. (lemma 폴백은 호출측에서 별도로 한다.)
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

function main() {
  const morph = loadMorph();
  const matthew = JSON.parse(fs.readFileSync(matthewJsonPath, "utf8"));
  const ch1 = matthew.chapters.find((c) => c.chapter === 1);
  const greekKrMap = new Map((ch1.verses.greekKr ?? []).map((v) => [v.n, v.t]));

  const verseNumbers = Array.from(morph.keys()).sort((a, b) => a - b);

  const verses = [];
  const missingLex = new Map();

  for (const n of verseNumbers) {
    const rows = morph.get(n);
    const tokens = [];
    const greekParts = [];
    for (const r of rows) {
      const { word, trailing } = splitPunct(r.rawText);
      if (!word) continue;
      const p = pron(word, r.lemma);
      const lex = MATT1_LEXICON[r.lemma];
      if (!lex) missingLex.set(r.lemma, (missingLex.get(r.lemma) ?? 0) + 1);
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
    verses.push({
      n,
      copyGreek: greekParts.join(" "),
      copyKr: greekKrMap.get(n) ?? "",
      tokens,
    });
  }

  const output = {
    meta: {
      book: "matthew",
      chapter: 1,
      sources: {
        sblgnt:
          "SBLGNT © Society of Biblical Literature & Logos Bible Software (CC BY 4.0)",
        morphgnt: "MorphGNT (CC BY-SA 4.0)",
        kr: "개역한글 참고 의역(본 앱 직접 작성, 학습용)",
      },
    },
    verses,
  };

  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n", "utf8");
  const totalTokens = verses.reduce((s, v) => s + v.tokens.length, 0);
  console.log(
    `✅ ${path.relative(repoRoot, outPath)} 갱신 — ${verses.length}절, 토큰 ${totalTokens}개`,
  );
  if (missingLex.size > 0) {
    console.warn(
      `⚠️  어휘집(MATT1_LEXICON) 누락 ${missingLex.size}개 (gloss 빈 칸으로 출력됨):`,
    );
    for (const [k, c] of [...missingLex.entries()].sort((a, b) => b[1] - a[1])) {
      console.warn(`     ${c.toString().padStart(3)}회  ${k}`);
    }
  }
}

main();
