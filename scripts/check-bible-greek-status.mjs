import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const bookId = process.argv[2] ?? "romans";
const bookPath = path.resolve(__dirname, `../app/bible-reading/${bookId}.json`);

if (!fs.existsSync(bookPath)) {
  console.error(`❌ ${bookPath} 없음`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(bookPath, "utf8"));

let totalVerses = 0;
let totalGreek = 0;
let totalGreekKr = 0;
let totalGreekWords = 0;
let totalTokenVerses = 0;
let totalInfoVerses = 0;
let totalInfoTokens = 0;

console.log(
  "| 장 | 절 | greek | greekKr | greekWords | tokens | info절 | info토큰 |",
);
console.log("|---:|---:|---:|---:|---:|---:|---:|---:|");

for (const chapter of data.chapters) {
  const krv = chapter.verses.krv?.length ?? 0;
  const greek = chapter.verses.greek?.filter((v) => v.t?.trim()).length ?? 0;
  const greekKr =
    chapter.verses.greekKr?.filter((v) => v.t?.trim()).length ?? 0;
  const greekWords =
    chapter.verses.greekWords?.filter((v) => v.t?.trim()).length ?? 0;
  const tokenVerses =
    chapter.verses.greekTokens?.filter((tv) => (tv.tokens?.length ?? 0) > 0)
      .length ?? 0;
  let infoVerses = 0;
  let infoTokens = 0;
  for (const tv of chapter.verses.greekTokens ?? []) {
    const tokensWithInfo = (tv.tokens ?? []).filter((t) => t.info).length;
    if (tokensWithInfo > 0) infoVerses += 1;
    infoTokens += tokensWithInfo;
  }
  totalVerses += krv;
  totalGreek += greek;
  totalGreekKr += greekKr;
  totalGreekWords += greekWords;
  totalTokenVerses += tokenVerses;
  totalInfoVerses += infoVerses;
  totalInfoTokens += infoTokens;
  console.log(
    `| ${chapter.chapter} | ${krv} | ${greek} | ${greekKr} | ${greekWords} | ${tokenVerses} | ${infoVerses}/${krv} | ${infoTokens} |`,
  );
}

console.log(
  `\n총계 — krv ${totalVerses} / greek ${totalGreek} / greekKr ${totalGreekKr} / greekWords ${totalGreekWords} / info절 ${totalInfoVerses}/${totalVerses} / info토큰 ${totalInfoTokens}`,
);

const krPct = totalVerses ? ((totalGreekKr / totalVerses) * 100).toFixed(1) : 0;
const wordsPct = totalVerses
  ? ((totalGreekWords / totalVerses) * 100).toFixed(1)
  : 0;
const infoPct = totalVerses
  ? ((totalInfoVerses / totalVerses) * 100).toFixed(1)
  : 0;
console.log(
  `   greekKr ${krPct}% / greekWords ${wordsPct}% / info verses ${infoPct}%`,
);
