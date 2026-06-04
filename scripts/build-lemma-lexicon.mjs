// SBLGNT 람마 기반 사전 생성.
// 완성된 책의 토큰별 info 를 람마와 매칭하여 lemma -> info 매핑을 만든다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const dataDir = path.join(repoRoot, "app/bible-reading");
const cacheDir = path.join(repoRoot, ".cache");
const outPath = path.join(repoRoot, "scripts/_lemma-lexicon.json");

const COMPLETED = [
  "romans", "galatians", "ephesians", "philippians", "colossians",
  "thessalonians1", "thessalonians2", "timothy1", "timothy2", "titus",
  "philemon", "hebrews", "james", "peter1", "peter2",
  "john1", "john2", "john3", "jude",
];

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

const lemmaInfos = new Map();

for (const book of COMPLETED) {
  const fp = path.join(dataDir, `${book}.json`);
  if (!fs.existsSync(fp)) continue;
  const morph = loadMorphgnt(book);
  if (!morph) continue;
  const data = JSON.parse(fs.readFileSync(fp, "utf8"));
  for (const ch of data.chapters) {
    if (!ch.verses.greekTokens) continue;
    for (const entry of ch.verses.greekTokens) {
      const key = `${ch.chapter}:${entry.n}`;
      const morphWords = morph.get(key);
      if (!morphWords) continue;
      const greekToks = entry.tokens.filter((t) => /[\u0370-\u03FF\u1F00-\u1FFF]/.test(t.w ?? ""));
      if (greekToks.length !== morphWords.length) continue;
      for (let i = 0; i < greekToks.length; i++) {
        const tok = greekToks[i];
        if (!tok.info) continue;
        const lemma = morphWords[i].lemma;
        const wordKey = stripDiacritics(tok.w);
        const lemmaKey = stripDiacritics(lemma);
        if (!lemmaInfos.has(lemmaKey)) lemmaInfos.set(lemmaKey, new Map());
        const wm = lemmaInfos.get(lemmaKey);
        if (!wm.has(wordKey)) wm.set(wordKey, new Map());
        const infos = wm.get(wordKey);
        infos.set(tok.info, (infos.get(tok.info) ?? 0) + 1);
      }
    }
  }
}

const out = {};
for (const [lemma, wordMap] of lemmaInfos.entries()) {
  out[lemma] = {};
  for (const [word, infos] of wordMap.entries()) {
    let best = null, bestCount = 0;
    for (const [info, count] of infos.entries()) {
      if (count > bestCount) { best = info; bestCount = count; }
    }
    out[lemma][word] = best;
  }
}

fs.writeFileSync(outPath, JSON.stringify(out, null, 0) + "\n", "utf8");
console.log(`✅ ${Object.keys(out).length} 람마 사전 저장: ${outPath}`);
