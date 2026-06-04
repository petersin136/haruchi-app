// 마태복음 어휘집 누락 lemma 를 빈도순으로 출력.
// 사용: node scripts/dump-missing-lemmas.mjs > .cache/matt-missing.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const dataPath = path.join(repoRoot, "app/bible-reading/matthew-v2.json");

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const count = new Map();
const samples = new Map();
for (const c of data.chapters) {
  for (const v of c.verses) {
    for (const tk of v.tokens) {
      if (tk.gloss && tk.gloss.length > 0) continue;
      const lemma = tk.lemma;
      count.set(lemma, (count.get(lemma) ?? 0) + 1);
      if (!samples.has(lemma)) {
        samples.set(lemma, {
          w: tk.w,
          p: tk.p,
          posLabel: tk.posLabel,
          firstAt: `${c.chapter}:${v.n}`,
        });
      }
    }
  }
}
const arr = [...count.entries()]
  .map(([lemma, c]) => ({ lemma, count: c, ...samples.get(lemma) }))
  .sort((a, b) => b.count - a.count || a.lemma.localeCompare(b.lemma));

console.log(JSON.stringify({ total: arr.length, items: arr }, null, 2));
