// v2: 람마+활용형 사전을 모두 사용하여 매칭률을 극대화한다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const cacheDir = path.join(repoRoot, ".cache");

const bookId = process.argv[2];
if (!bookId) {
  console.error("Usage: node scripts/auto-generate-greek-content-v2.mjs <bookId>");
  process.exit(1);
}

const wordLex = JSON.parse(fs.readFileSync(path.join(repoRoot, "scripts/_greek-lexicon.json"), "utf8"));
const lemmaLex = JSON.parse(fs.readFileSync(path.join(repoRoot, "scripts/_lemma-lexicon.json"), "utf8"));

function stripDiacritics(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’']/g, "");
}

const SBLGNT_MARKERS = /[\u2E00-\u2E1F]/g;
const GREEK_LETTER = /[\p{Script=Greek}\u0300-\u036f]/u;
function splitWord(rawText) {
  const cleaned = rawText.replace(SBLGNT_MARKERS, "");
  let i = 0;
  while (i < cleaned.length && !GREEK_LETTER.test(cleaned[i])) i++;
  let j = cleaned.length;
  while (j > i && !GREEK_LETTER.test(cleaned[j - 1])) j--;
  return cleaned.slice(i, j);
}

function loadMorphgnt(book) {
  const fp = path.join(cacheDir, `sblgnt-${book}.txt`);
  if (!fs.existsSync(fp)) return null;
  const text = fs.readFileSync(fp, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const verses = new Map();
  for (const line of lines) {
    const cols = line.split(/\s+/);
    if (cols.length < 7) continue;
    const [bcv, , , rawText, , , lemma] = cols;
    if (!bcv || bcv.length < 6) continue;
    const ch = parseInt(bcv.slice(2, 4), 10);
    const v = parseInt(bcv.slice(4, 6), 10);
    const key = `${ch}:${v}`;
    if (!verses.has(key)) verses.set(key, []);
    const word = splitWord(rawText);
    verses.get(key).push({ word, lemma });
  }
  return verses;
}

const COMMON = JSON.parse(fs.readFileSync(path.join(repoRoot, "scripts/_common-lex.json"), "utf8"));

const morph = loadMorphgnt(bookId);
if (!morph) {
  console.error(`SBLGNT cache missing: ${bookId}`);
  process.exit(1);
}

const bookPath = path.join(repoRoot, `app/bible-reading/${bookId}.json`);
const data = JSON.parse(fs.readFileSync(bookPath, "utf8"));

function extractKr(info) {
  if (!info) return null;
  const m = info.match(/'([^']+)'/);
  return m ? m[1] : null;
}

function infoForWord(wordKey, lemmaKey) {
  if (wordLex[wordKey]) return wordLex[wordKey];
  if (COMMON[wordKey]) return COMMON[wordKey];
  const lemmaForms = lemmaLex[lemmaKey];
  if (lemmaForms) {
    if (lemmaForms[wordKey]) return lemmaForms[wordKey];
    let bestInfo = null;
    for (const info of Object.values(lemmaForms)) {
      if (info) { bestInfo = info; break; }
    }
    if (bestInfo) {
      const kr = extractKr(bestInfo);
      if (kr) return `(어형) — '${kr}' (람마 ${lemmaKey} 의 활용형).`;
    }
  }
  return null;
}

let krCount = 0, wordsCount = 0, attached = 0;

for (const ch of data.chapters) {
  if (!ch.verses.greekTokens) continue;
  const krMap = new Map((ch.verses.greekKr ?? []).map((e) => [e.n, e]));
  const wordsMap = new Map((ch.verses.greekWords ?? []).map((e) => [e.n, e]));
  const greekKrArr = ch.verses.greekKr ?? [];
  const greekWordsArr = ch.verses.greekWords ?? [];

  for (const entry of ch.verses.greekTokens) {
    const verseN = entry.n;
    const tokens = entry.tokens;

    const greekToks = tokens.filter((t) => /[\u0370-\u03FF\u1F00-\u1FFF]/.test(t.w ?? ""));
    const morphWords = morph.get(`${ch.chapter}:${verseN}`) ?? [];
    const lemmaByIdx = greekToks.length === morphWords.length ? morphWords.map((m) => m.lemma) : null;

    const krParts = [];
    let greekIdx = 0;
    for (const tok of tokens) {
      if (!tok.w) continue;
      if (!/[\u0370-\u03FF\u1F00-\u1FFF]/.test(tok.w)) continue;
      const wordKey = stripDiacritics(tok.w);
      const lemmaKey = lemmaByIdx ? stripDiacritics(lemmaByIdx[greekIdx]) : null;
      greekIdx += 1;
      let info = tok.info;
      if (!info) {
        info = infoForWord(wordKey, lemmaKey);
        if (info) { tok.info = info; attached += 1; }
      }
      const k = extractKr(info);
      krParts.push(k ?? tok.w);
    }

    if (krParts.length > 0) {
      const krLine = krParts.join(" — ") + ".";
      const existingKr = krMap.get(verseN);
      const hasGreek = (s) => s && /[\u0370-\u03FF\u1F00-\u1FFF]/.test(s);
      if (existingKr) {
        if (!existingKr.t || existingKr.t.length < 3 || hasGreek(existingKr.t)) {
          existingKr.t = krLine;
          krCount += 1;
        }
      } else {
        greekKrArr.push({ n: verseN, t: krLine });
        krCount += 1;
      }

      const wordsLine = `본 절은 ${ch.chapter}장 ${verseN}절. 헬라어 본문을 단어 순서대로 한국어로 옮긴 풀이로, 각 단어의 격·시제·태는 토큰별 풀이에서 확인할 수 있다.`;
      const existingWords = wordsMap.get(verseN);
      const isMechanical = (s) => s && /가운데 \d+개가 어휘 사전에 매칭/.test(s);
      if (existingWords) {
        if (!existingWords.t || existingWords.t.length < 3 || isMechanical(existingWords.t)) {
          existingWords.t = wordsLine;
          wordsCount += 1;
        }
      } else {
        greekWordsArr.push({ n: verseN, t: wordsLine });
        wordsCount += 1;
      }
    }
  }

  greekKrArr.sort((a, b) => a.n - b.n);
  greekWordsArr.sort((a, b) => a.n - b.n);
  ch.verses.greekKr = greekKrArr;
  ch.verses.greekWords = greekWordsArr;
}

fs.writeFileSync(bookPath, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log(`✅ ${bookId}: kr ${krCount}절, words ${wordsCount}절, info ${attached}토큰`);
