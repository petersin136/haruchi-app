import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const romansPath = path.resolve(__dirname, "../app/bible-reading/romans.json");

const data = JSON.parse(fs.readFileSync(romansPath, "utf8"));

const targets = {
  3: [17, 18, 26, 30],
  5: [18],
  6: [17, 19, 22],
  8: [10, 31],
  10: [8, 17],
  11: [8, 10],
  12: [15],
  13: [10, 12],
  14: [8, 17, 22],
  15: [5, 10, 11, 21, 29],
  16: [8, 15, 16, 20, 24],
};

for (const [ch, verses] of Object.entries(targets)) {
  const chapter = data.chapters.find((c) => c.chapter === parseInt(ch));
  for (const n of verses) {
    const v = chapter.verses.greekTokens.find((x) => x.n === n);
    if (!v) {
      console.log(`${ch}:${n} — 토큰 없음`);
      continue;
    }
    const words = v.tokens
      .filter((t) => t.w && /[\u0370-\u03ff\u1f00-\u1fff]/.test(t.w))
      .map((t) => t.w);
    console.log(`${ch}:${n} — ${words.join(" | ")}`);
  }
}
