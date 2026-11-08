// data/verse-times-fix/_review.json 생성
// interp 3절 이상 연속 + 라벨 없는 장(align-log)
// 사용: node scripts/build-verse-times-review.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const watchDir = path.join(root, "public", "watch-times");
const logDir = path.join(root, ".cache", "watch-manifest");
const outPath = path.join(root, "data", "verse-times-fix", "_review.json");

const books = fs
  .readdirSync(watchDir)
  .filter((f) => f.endsWith(".json") && f !== "manifest.json")
  .map((f) => f.replace(/\.json$/, ""))
  .sort();

/** @type {Record<string, string[]>} */
const review = {};

for (const bookId of books) {
  const j = JSON.parse(fs.readFileSync(path.join(watchDir, `${bookId}.json`), "utf8"));
  const items = [];

  for (const [ch, c] of Object.entries(j.chapters || {})) {
    let run = null;
    const flush = () => {
      if (run && run.to - run.from + 1 >= 3) items.push(`${ch}:${run.from}-${run.to}`);
      run = null;
    };
    for (let i = 0; i < (c.src || []).length; i++) {
      if (c.src[i] === "interp") {
        if (!run) run = { from: i + 1, to: i + 1 };
        else run.to = i + 1;
      } else flush();
    }
    flush();
  }

  const logPath = path.join(logDir, `${bookId}-align-log.json`);
  if (fs.existsSync(logPath)) {
    const log = JSON.parse(fs.readFileSync(logPath, "utf8"));
    for (const e of log.exceptions || []) {
      if (
        e.type === "unlabeled-prev-end" ||
        e.type === "verse-fallback" ||
        e.type === "midpoint-fallback"
      ) {
        items.push(`ch${e.ch}-unlabeled`);
      }
    }
  }

  if (!items.length) continue;
  items.sort((a, b) => {
    const na = a.startsWith("ch") ? Number(a.match(/\d+/)?.[0]) : Number(a.split(":")[0]);
    const nb = b.startsWith("ch") ? Number(b.match(/\d+/)?.[0]) : Number(b.split(":")[0]);
    return na - nb || a.localeCompare(b);
  });
  review[bookId] = [...new Set(items)];
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(review, null, 2) + "\n");
console.log(`wrote ${outPath} (${Object.keys(review).length} books)`);
