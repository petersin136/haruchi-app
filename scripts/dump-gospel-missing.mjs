// 신약 누락 lemma 통합 리포트.
// 사용: node scripts/dump-gospel-missing.mjs > .cache/gospel-missing.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const NT_BOOKS = [
  "matthew",
  "mark",
  "luke",
  "john",
  "acts",
  "romans",
  "corinthians1",
  "corinthians2",
  "galatians",
  "ephesians",
  "philippians",
  "colossians",
  "thessalonians1",
  "thessalonians2",
];
const files = NT_BOOKS
  .map((id) => [id, path.join(repoRoot, `app/bible-reading/${id}-v2.json`)])
  .filter(([, p]) => fs.existsSync(p));

const total = new Map();
const samples = new Map();
const perBook = new Map();
for (const [bookId, file] of files) {
  if (!fs.existsSync(file)) continue;
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const c of data.chapters) {
    for (const v of c.verses) {
      for (const tk of v.tokens) {
        if (tk.gloss && tk.gloss.length > 0) continue;
        const key = tk.lemma;
        total.set(key, (total.get(key) ?? 0) + 1);
        if (!perBook.has(key)) perBook.set(key, {});
        const pb = perBook.get(key);
        pb[bookId] = (pb[bookId] ?? 0) + 1;
        if (!samples.has(key)) {
          samples.set(key, {
            w: tk.w,
            p: tk.p,
            posLabel: tk.posLabel,
            parseLabel: tk.parseLabel,
            firstAt: `${bookId} ${c.chapter}:${v.n}`,
          });
        }
      }
    }
  }
}

const arr = [...total.entries()]
  .map(([lemma, c]) => ({
    lemma,
    count: c,
    perBook: perBook.get(lemma),
    ...samples.get(lemma),
  }))
  .sort((a, b) => b.count - a.count || a.lemma.localeCompare(b.lemma));

console.log(JSON.stringify({ total: arr.length, items: arr }, null, 2));
