import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const romansPath = path.resolve(__dirname, "../app/bible-reading/romans.json");

const data = JSON.parse(fs.readFileSync(romansPath, "utf8"));

console.log("info 가 0개인 절 목록 (절 번호와 token 단어들):");
console.log("=".repeat(70));

for (const chapter of data.chapters) {
  const missing = [];
  for (const tv of chapter.verses.greekTokens ?? []) {
    const tokensWithInfo = tv.tokens.filter((t) => t.info).length;
    if (tokensWithInfo === 0) {
      const words = tv.tokens
        .filter((t) => t.w && /[\u0370-\u03ff\u1f00-\u1fff]/.test(t.w))
        .map((t) => t.w)
        .join(" ");
      missing.push({ n: tv.n, words });
    }
  }
  if (missing.length > 0) {
    console.log(`\n[${chapter.chapter}장] — ${missing.length} 절 누락`);
    for (const m of missing) {
      console.log(`  ${chapter.chapter}:${m.n} — ${m.words}`);
    }
  }
}
