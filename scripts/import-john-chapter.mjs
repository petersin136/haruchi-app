// 요한복음 정성 풀이 분할 임포트.
//   사용: node scripts/import-john-chapter.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const bookPath = path.join(repoRoot, "app/bible-reading/john.json");

function stripDiacritics(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’']/g, "");
}
function applyInfoToTokens(tokens, infos) {
  if (!infos) return 0;
  let attached = 0;
  const remaining = new Map();
  for (const [k, v] of Object.entries(infos)) remaining.set(stripDiacritics(k), v);
  for (const tok of tokens) {
    if (!tok.w) continue;
    const k = stripDiacritics(tok.w);
    if (remaining.has(k)) { tok.info = remaining.get(k); remaining.delete(k); attached += 1; }
  }
  return attached;
}

const CONTENT = {};

function main() {
  const data = JSON.parse(fs.readFileSync(bookPath, "utf8"));
  let totalVerses = 0, totalAttached = 0;
  for (const ch of data.chapters) {
    const chCnt = CONTENT[ch.chapter];
    if (!chCnt) continue;
    const greekKrArr = ch.verses.greekKr ?? [];
    const greekWordsArr = ch.verses.greekWords ?? [];
    const greekKrMap = new Map(greekKrArr.map((e) => [e.n, e]));
    const greekWordsMap = new Map(greekWordsArr.map((e) => [e.n, e]));
    for (const verse of ch.verses.krv) {
      const vc = chCnt[verse.n];
      if (vc) {
        if (greekKrMap.has(verse.n)) greekKrMap.get(verse.n).t = vc.kr;
        else greekKrArr.push({ n: verse.n, t: vc.kr });
        if (greekWordsMap.has(verse.n)) greekWordsMap.get(verse.n).t = vc.words;
        else greekWordsArr.push({ n: verse.n, t: vc.words });
        totalVerses += 1;
      }
    }
    greekKrArr.sort((a, b) => a.n - b.n);
    greekWordsArr.sort((a, b) => a.n - b.n);
    ch.verses.greekKr = greekKrArr;
    ch.verses.greekWords = greekWordsArr;
    for (const tokensEntry of ch.verses.greekTokens ?? []) {
      const vc = chCnt[tokensEntry.n];
      if (!vc?.infos) continue;
      totalAttached += applyInfoToTokens(tokensEntry.tokens, vc.infos);
    }
  }
  fs.writeFileSync(bookPath, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`✅ 요한복음 갱신: ${totalVerses}절 / info ${totalAttached}토큰`);
}

main();
