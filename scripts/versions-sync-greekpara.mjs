#!/usr/bin/env node
/**
 * 에이전트 5 — bible-v2 copyKr → public/bible-greekpara-v2/ (새 경로만)
 * 기존 bible-data / bible-v2 / chunks 는 수정하지 않음.
 *
 *   node scripts/versions-sync-greekpara.mjs
 *   node scripts/versions-sync-greekpara.mjs --compare-only
 *
 * 기본: 마태만 생성. 신약 26권은 copyKr↔greekKr 차이 표만 .cache/versions/ 에 기록.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const BD = path.join(root, "public", "bible-data");
const V2 = path.join(root, "public", "bible-v2");
const OUT = path.join(root, "public", "bible-greekpara-v2");
const CACHE = path.join(root, ".cache", "versions");
fs.mkdirSync(CACHE, { recursive: true });

const NT = [
  "matthew", "mark", "luke", "john", "acts",
  "romans", "corinthians1", "corinthians2", "galatians", "ephesians",
  "philippians", "colossians", "thessalonians1", "thessalonians2", "timothy1",
  "timothy2", "titus", "philemon", "hebrews", "james",
  "peter1", "peter2", "john1", "john2", "john3", "jude", "revelation",
];

const BOOK_KO = {
  matthew: "마태복음", mark: "마가복음", luke: "누가복음", john: "요한복음",
  acts: "사도행전", romans: "로마서", corinthians1: "고린도전서",
  corinthians2: "고린도후서", galatians: "갈라디아서", ephesians: "에베소서",
  philippians: "빌립보서", colossians: "골로새서", thessalonians1: "데살로니가전서",
  thessalonians2: "데살로니가후서", timothy1: "디모데전서", timothy2: "디모데후서",
  titus: "디도서", philemon: "빌레몬서", hebrews: "히브리서", james: "야고보서",
  peter1: "베드로전서", peter2: "베드로후서", john1: "요한일서", john2: "요한이서",
  john3: "요한삼서", jude: "유다서", revelation: "요한계시록",
};

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function compareBook(bookId) {
  const bd = readJson(path.join(BD, `${bookId}.json`));
  const v2p = path.join(V2, `${bookId}-v2.json`);
  if (!fs.existsSync(v2p)) {
    return {
      bookId,
      bookKo: BOOK_KO[bookId],
      error: "bible-v2 없음",
      same: 0,
      different: 0,
      onlyInGreekKr: 0,
      onlyInCopyKr: 0,
      samples: [],
    };
  }
  const v2 = readJson(v2p);
  let same = 0;
  let different = 0;
  let onlyInGreekKr = 0;
  let onlyInCopyKr = 0;
  const samples = [];
  const chapterDiffs = [];

  for (const ch of bd.chapters) {
    const gkrMap = new Map(
      (ch.verses?.greekKr || []).map((v) => [v.n, String(v.t || "").trim()]),
    );
    const v2ch = v2.chapters.find((c) => c.chapter === ch.chapter);
    const ckrMap = new Map(
      (v2ch?.verses || []).map((v) => [v.n, String(v.copyKr || "").trim()]),
    );
    const nums = new Set([...gkrMap.keys(), ...ckrMap.keys()]);
    let chDiff = 0;
    for (const n of [...nums].sort((a, b) => a - b)) {
      const a = gkrMap.get(n);
      const b = ckrMap.get(n);
      const hasA = a !== undefined;
      const hasB = b !== undefined;
      if (hasA && hasB) {
        if (a === b) same += 1;
        else {
          different += 1;
          chDiff += 1;
          if (samples.length < 5) {
            samples.push({
              ref: `${BOOK_KO[bookId]} ${ch.chapter}:${n}`,
              greekKr: a.slice(0, 120),
              copyKr: b.slice(0, 120),
            });
          }
        }
      } else if (hasA && !hasB) {
        onlyInGreekKr += 1;
        chDiff += 1;
      } else if (!hasA && hasB) {
        onlyInCopyKr += 1;
        chDiff += 1;
        if (samples.length < 5 && b) {
          samples.push({
            ref: `${BOOK_KO[bookId]} ${ch.chapter}:${n}`,
            greekKr: "(없음)",
            copyKr: b.slice(0, 120),
          });
        }
      }
    }
    if (chDiff > 0) {
      chapterDiffs.push({
        chapter: ch.chapter,
        greekKrFilled: [...gkrMap.values()].filter(Boolean).length,
        copyKrFilled: [...ckrMap.values()].filter(Boolean).length,
        diffUnits: chDiff,
      });
    }
  }

  return {
    bookId,
    bookKo: BOOK_KO[bookId],
    same,
    different,
    onlyInGreekKr,
    onlyInCopyKr,
    totalMismatch: different + onlyInGreekKr + onlyInCopyKr,
    samples,
    chapterDiffs: chapterDiffs.slice(0, 10),
  };
}

function buildMatthewFromV2() {
  const v2 = readJson(path.join(V2, "matthew-v2.json"));
  const chapters = v2.chapters.map((ch) => ({
    chapter: ch.chapter,
    verses: (ch.verses || []).map((v) => ({
      n: v.n,
      t: String(v.copyKr || ""),
    })),
  }));
  const out = {
    bookId: "matthew",
    book: "마태복음",
    source: "public/bible-v2/matthew-v2.json → copyKr",
    note: "에이전트 5 동기화. bible-data 미수정. 앱 연결은 에이전트 1.",
    generatedAt: new Date().toISOString(),
    chapters,
  };
  fs.mkdirSync(OUT, { recursive: true });
  const dest = path.join(OUT, "matthew.json");
  fs.writeFileSync(dest, JSON.stringify(out, null, 2) + "\n", "utf8");
  const verseCount = chapters.reduce((s, c) => s + c.verses.length, 0);
  const filled = chapters.reduce(
    (s, c) => s + c.verses.filter((v) => v.t.trim()).length,
    0,
  );
  return { dest, chapters: chapters.length, verseCount, filled };
}

const compareOnly = process.argv.includes("--compare-only");

// 1장 가드(재확인)
const mattCmp = compareBook("matthew");
const ch1 = (() => {
  const bd = readJson(path.join(BD, "matthew.json"));
  const v2 = readJson(path.join(V2, "matthew-v2.json"));
  const g = new Map(
    (bd.chapters[0].verses.greekKr || []).map((v) => [v.n, (v.t || "").trim()]),
  );
  const c = new Map(
    (v2.chapters.find((x) => x.chapter === 1)?.verses || []).map((v) => [
      v.n,
      String(v.copyKr || "").trim(),
    ]),
  );
  let same = 0;
  let diff = 0;
  const samples = [];
  for (const n of [...new Set([...g.keys(), ...c.keys()])].sort((a, b) => a - b)) {
    if ((g.get(n) || "") === (c.get(n) || "")) same += 1;
    else {
      diff += 1;
      if (samples.length < 5)
        samples.push({ n, greekKr: g.get(n), copyKr: c.get(n) });
    }
  }
  return { same, diff, samples };
})();

if (ch1.diff > 0) {
  console.error(
    JSON.stringify(
      {
        stop: true,
        reason: "마태 1장 greekKr≠copyKr — 동기화 중단",
        ch1,
      },
      null,
      2,
    ),
  );
  process.exit(2);
}

const comparisons = NT.map(compareBook);
fs.writeFileSync(
  path.join(CACHE, "greekpara-nt-compare.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      matthewCh1: ch1,
      books: comparisons,
    },
    null,
    2,
  ),
);

let sync = null;
if (!compareOnly) {
  sync = buildMatthewFromV2();
}

console.log(
  JSON.stringify(
    {
      matthewCh1: ch1,
      sync,
      ntSummary: comparisons.map((b) => ({
        bookId: b.bookId,
        same: b.same,
        different: b.different,
        onlyInGreekKr: b.onlyInGreekKr,
        onlyInCopyKr: b.onlyInCopyKr,
        totalMismatch: b.totalMismatch,
      })),
    },
    null,
    2,
  ),
);
