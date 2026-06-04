// SBLGNT 사본상 결락 절(예: 막 7:16, 요 7:53-8:11 등)에 placeholder 채움.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const BOOKS = ["matthew","mark","luke","john","acts","corinthians1","corinthians2","revelation","hebrews"];

const NOTE = "이 절은 SBLGNT(SBL 헬라어 신약) 본문에는 포함되지 않습니다. 다수의 후대 사본에는 등장하나, 더 이른 사본 증거에는 없는 절로 분류됩니다.";

for (const book of BOOKS) {
  const fp = path.join(repoRoot, `app/bible-reading/${book}.json`);
  const data = JSON.parse(fs.readFileSync(fp, "utf8"));
  let added = 0;
  for (const ch of data.chapters) {
    const krMap = new Map((ch.verses.greekKr ?? []).map((e) => [e.n, e]));
    const wordsMap = new Map((ch.verses.greekWords ?? []).map((e) => [e.n, e]));
    const greekArr = ch.verses.greek ?? [];
    const greekKrArr = ch.verses.greekKr ?? [];
    const greekWordsArr = ch.verses.greekWords ?? [];
    for (const verse of ch.verses.krv) {
      const gEntry = greekArr.find((e) => e.n === verse.n);
      if (!gEntry || !gEntry.t || gEntry.t.trim().length === 0) {
        if (!krMap.has(verse.n)) {
          greekKrArr.push({ n: verse.n, t: NOTE });
          added += 1;
        } else if (krMap.get(verse.n).t.trim().length === 0) {
          krMap.get(verse.n).t = NOTE;
          added += 1;
        }
        if (!wordsMap.has(verse.n)) {
          greekWordsArr.push({ n: verse.n, t: NOTE });
        } else if (wordsMap.get(verse.n).t.trim().length === 0) {
          wordsMap.get(verse.n).t = NOTE;
        }
      }
    }
    greekKrArr.sort((a, b) => a.n - b.n);
    greekWordsArr.sort((a, b) => a.n - b.n);
    ch.verses.greekKr = greekKrArr;
    ch.verses.greekWords = greekWordsArr;
  }
  fs.writeFileSync(fp, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`✅ ${book}: ${added}개 결락 절 채움`);
}
