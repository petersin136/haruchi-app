// 완성된 책의 greekTokens.info 를 모아 lemma/단어 -> 한국어 설명 사전을 생성한다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const dataDir = path.join(repoRoot, "app/bible-reading");
const outPath = path.join(repoRoot, "scripts/_greek-lexicon.json");

const COMPLETED = [
  "romans", "galatians", "ephesians", "philippians", "colossians",
  "thessalonians1", "thessalonians2", "timothy1", "timothy2", "titus",
  "philemon", "hebrews", "james", "peter1", "peter2",
  "john1", "john2", "john3", "jude",
];

function stripDiacritics(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’']/g, "");
}

const wordToInfos = new Map();

for (const book of COMPLETED) {
  const fp = path.join(dataDir, `${book}.json`);
  if (!fs.existsSync(fp)) continue;
  const data = JSON.parse(fs.readFileSync(fp, "utf8"));
  for (const ch of data.chapters) {
    if (!ch.verses.greekTokens) continue;
    for (const entry of ch.verses.greekTokens) {
      for (const tok of entry.tokens) {
        if (!tok.info || !tok.w) continue;
        const key = stripDiacritics(tok.w);
        if (!wordToInfos.has(key)) wordToInfos.set(key, new Map());
        const m = wordToInfos.get(key);
        m.set(tok.info, (m.get(tok.info) ?? 0) + 1);
      }
    }
  }
}

const dict = {};
for (const [key, infos] of wordToInfos.entries()) {
  let best = null, bestCount = 0;
  for (const [info, count] of infos.entries()) {
    if (count > bestCount) { best = info; bestCount = count; }
  }
  dict[key] = best;
}

fs.writeFileSync(outPath, JSON.stringify(dict, null, 0) + "\n", "utf8");
console.log(`✅ ${Object.keys(dict).length} 단어 사전 작성: ${outPath}`);
