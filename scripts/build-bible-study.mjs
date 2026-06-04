// =============================================================================
// "성경 공부" 5-레이어 스터디 데이터 빌더 — 신약 27권 일괄 생성.
//
// 원본 데이터(이미 보유):
//   - English (WEB)        : .cache/web/<bookId>.json (TehShrike WEB JSON)
//   - 개역한글             : app/bible-reading/<bookId>.json — verses.krv
//   - 헬라어 wordblock     : app/bible-reading/<bookId>-v2.json — chapters[].verses[].tokens
//                              (token 마다 lemma/품사/문법/뜻/주 모두 포함)
//   - 헬라 의역(greekpara) : app/bible-reading/<bookId>.json — verses.greekKr
//   - 어린이 의역(kids)    : app/bible-reading/<bookId>.json — verses.kids
//
// 출력:
//   public/bible-study/data/<bookId>.json
//
// public/ 에 두는 이유:
//   webpack 이 정적 import 로 27개 큰 JSON 을 모두 chunk 로 만들면 dev/build
//   메모리가 폭발한다. 컴포넌트는 fetch("/bible-study/data/<bookId>.json") 으로
//   런타임에 받아오고, 브라우저 캐시가 자연스럽게 동작한다.
//
// 출력 스키마 (책 단위, 모든 장 포함):
//   {
//     book: "로마서",
//     bookId: "romans",
//     layerOrder: ["english","krv","greek","greekpara","kids"],
//     layerLabels: { english: "영어(WEB)", krv: "개역한글", ... },
//     defaultOn: ["english","krv"],
//     sources: { ... },
//     chapters: [
//       {
//         chapter: 1,
//         verses: [
//           {
//             ref: "로마서 1:1",
//             layers: {
//               english:   { type: "text", content: "..." },
//               krv:       { type: "text", content: "..." },
//               greek:     { type: "wordblock", text: "...", words: [...] },
//               greekpara: { type: "text", content: "..." },
//               kids:      { type: "text", content: "..." }
//             }
//           }
//         ]
//       }
//     ]
//   }
//
// 비어있는 절(예: WEB 이 다른 절과 묶음 처리한 케이스) 은 그 layer 만 빠진 채
// 출력. 화면 토글이 그 자리만 안 보이게 자연스럽게 흐른다.
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const NT_BOOKS = [
  { id: "matthew", name: "마태복음" },
  { id: "mark", name: "마가복음" },
  { id: "luke", name: "누가복음" },
  { id: "john", name: "요한복음" },
  { id: "acts", name: "사도행전" },
  { id: "romans", name: "로마서" },
  { id: "corinthians1", name: "고린도전서" },
  { id: "corinthians2", name: "고린도후서" },
  { id: "galatians", name: "갈라디아서" },
  { id: "ephesians", name: "에베소서" },
  { id: "philippians", name: "빌립보서" },
  { id: "colossians", name: "골로새서" },
  { id: "thessalonians1", name: "데살로니가전서" },
  { id: "thessalonians2", name: "데살로니가후서" },
  { id: "timothy1", name: "디모데전서" },
  { id: "timothy2", name: "디모데후서" },
  { id: "titus", name: "디도서" },
  { id: "philemon", name: "빌레몬서" },
  { id: "hebrews", name: "히브리서" },
  { id: "james", name: "야고보서" },
  { id: "peter1", name: "베드로전서" },
  { id: "peter2", name: "베드로후서" },
  { id: "john1", name: "요한일서" },
  { id: "john2", name: "요한이서" },
  { id: "john3", name: "요한삼서" },
  { id: "jude", name: "유다서" },
  { id: "revelation", name: "요한계시록" },
];

const LAYER_ORDER = ["english", "krv", "greek", "greekpara", "kids"];
const LAYER_LABELS = {
  english: "영어(WEB)",
  krv: "개역한글",
  greek: "헬라어",
  greekpara: "헬라 의역",
  kids: "어린이 의역",
};
const DEFAULT_ON = ["english", "krv"];
const SOURCES = {
  english: "World English Bible (WEB) — 퍼블릭 도메인",
  krv: "성경전서 개역한글판 — 퍼블릭 도메인",
  greek:
    "SBLGNT — © Society of Biblical Literature, CC BY 4.0 · 형태소 분석 MorphGNT (CC BY-SA 4.0)",
  greekpara: "헬라 의역 — 개역한글 기반 직접 제작한 학습용 2차 저작물",
  kids: "어린이 의역 — 개역한글 기반 직접 제작한 학습용 2차 저작물",
};

const dataOutDir = path.join(repoRoot, "public", "bible-study", "data");
fs.mkdirSync(dataOutDir, { recursive: true });

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// v2 token → wordblock word. v2 의 풍부한 필드를 LayeredBibleViewer 가
// 기대하는 7개 필드로 정리.
//   word    ← w
//   pron    ← p
//   meaning ← gloss (없으면 빈 문자열)
//   lemma   ← lemma
//   morph   ← parseLabel
//   pos     ← posLabel (없으면 생략)
//   meanings ← meanings 배열 (있을 때만)
//   nameType ← nameType (null 이면 생략)
//   note    ← note (빈 문자열이면 생략)
function tokenToWord(t) {
  const w = {
    word: t.w,
    pron: t.p || "",
    meaning: t.gloss || "",
    lemma: t.lemma || t.w,
    morph: t.parseLabel || "",
  };
  if (t.posLabel) w.pos = t.posLabel;
  if (Array.isArray(t.meanings) && t.meanings.length > 0) {
    w.meanings = t.meanings.slice();
  }
  if (t.nameType === "person" || t.nameType === "place") {
    w.nameType = t.nameType;
  }
  if (typeof t.note === "string" && t.note.trim()) {
    w.note = t.note.trim();
  }
  return w;
}

function buildBook(book) {
  const bookJsonPath = path.join(repoRoot, "app/bible-reading", `${book.id}.json`);
  const bookV2Path = path.join(
    repoRoot,
    "app/bible-reading",
    `${book.id}-v2.json`,
  );
  const webPath = path.join(repoRoot, ".cache/web", `${book.id}.json`);
  if (!fs.existsSync(bookJsonPath))
    throw new Error(`missing ${bookJsonPath}`);
  if (!fs.existsSync(bookV2Path))
    throw new Error(`missing ${bookV2Path} (run build-gospel-v2.mjs first)`);
  if (!fs.existsSync(webPath))
    throw new Error(`missing ${webPath} (run fetch-web-english.mjs first)`);

  const krvData = readJson(bookJsonPath);
  const v2Data = readJson(bookV2Path);
  const webData = readJson(webPath);

  // v2 chapter+verse 인덱스: ch -> v -> { copyGreek, tokens }.
  const v2Index = new Map();
  for (const c of v2Data.chapters || []) {
    const m = new Map();
    for (const v of c.verses || []) {
      m.set(v.n, v);
    }
    v2Index.set(c.chapter, m);
  }
  // WEB chapter+verse 인덱스.
  const webIndex = new Map();
  for (const c of webData.chapters || []) {
    const m = new Map();
    for (const v of c.verses || []) {
      m.set(v.n, v);
    }
    webIndex.set(c.chapter, m);
  }

  const out = {
    book: book.name,
    bookId: book.id,
    layerOrder: LAYER_ORDER.slice(),
    layerLabels: { ...LAYER_LABELS },
    defaultOn: DEFAULT_ON.slice(),
    sources: { ...SOURCES },
    chapters: [],
  };

  let totalVerses = 0;
  let missing = { english: 0, krv: 0, greek: 0, greekpara: 0, kids: 0 };
  for (const ch of krvData.chapters || []) {
    const chNo = ch.chapter;
    const krvArr = ch.verses?.krv || [];
    const greekKrArr = ch.verses?.greekKr || [];
    const kidsArr = ch.verses?.kids || [];
    const greekKrMap = new Map(greekKrArr.map((v) => [v.n, v.t]));
    const kidsMap = new Map(kidsArr.map((v) => [v.n, v.t]));
    const v2ChMap = v2Index.get(chNo) || new Map();
    const webChMap = webIndex.get(chNo) || new Map();

    const verses = [];
    for (const v of krvArr) {
      const ref = `${book.name} ${chNo}:${v.n}`;
      const layers = {};

      const enT = webChMap.get(v.n)?.t?.trim();
      if (enT) layers.english = { type: "text", content: enT };
      else missing.english += 1;

      const krvT = (v.t || "").trim();
      if (krvT) layers.krv = { type: "text", content: krvT };
      else missing.krv += 1;

      const v2v = v2ChMap.get(v.n);
      if (v2v && v2v.tokens && v2v.tokens.length > 0) {
        layers.greek = {
          type: "wordblock",
          text: (v2v.copyGreek || "").trim(),
          words: v2v.tokens.map(tokenToWord),
        };
      } else {
        missing.greek += 1;
      }

      const gp = greekKrMap.get(v.n);
      if (gp && gp.trim()) {
        layers.greekpara = { type: "text", content: gp.trim() };
      } else {
        missing.greekpara += 1;
      }

      const kt = kidsMap.get(v.n);
      if (kt && kt.trim()) {
        layers.kids = { type: "text", content: kt.trim() };
      } else {
        missing.kids += 1;
      }

      verses.push({ ref, layers });
      totalVerses += 1;
    }
    out.chapters.push({ chapter: chNo, verses });
  }

  const outPath = path.join(dataOutDir, `${book.id}.json`);
  fs.writeFileSync(outPath, JSON.stringify(out) + "\n", "utf8");
  const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);

  const cov = {};
  for (const k of LAYER_ORDER) {
    const have = totalVerses - missing[k];
    cov[k] = `${((have / totalVerses) * 100).toFixed(1)}%`;
  }
  console.log(
    `✅ ${book.name.padEnd(8)} (${book.id}) — ${out.chapters.length}장 ${totalVerses}절 ${sizeKb}KB`,
  );
  console.log(
    `   en ${cov.english} · krv ${cov.krv} · grk ${cov.greek} · gpara ${cov.greekpara} · kids ${cov.kids}`,
  );
  return { book: book.id, totalVerses, missing, sizeKb };
}

function main() {
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const only = onlyArg ? onlyArg.slice("--only=".length).split(",") : null;
  const list = only ? NT_BOOKS.filter((b) => only.includes(b.id)) : NT_BOOKS;
  const stats = [];
  for (const b of list) {
    try {
      stats.push(buildBook(b));
    } catch (e) {
      console.error(`❌ ${b.id}:`, e.message);
    }
  }
  // 합계.
  const totalVerses = stats.reduce((s, x) => s + x.totalVerses, 0);
  const totalKb = stats.reduce((s, x) => s + parseFloat(x.sizeKb), 0);
  console.log(
    `\n📊 합계 — ${stats.length}권 · ${totalVerses.toLocaleString()}절 · ${totalKb.toFixed(0)}KB (${(totalKb / 1024).toFixed(1)}MB)`,
  );
  for (const k of LAYER_ORDER) {
    const m = stats.reduce((s, x) => s + x.missing[k], 0);
    console.log(
      `   ${k.padEnd(10)} 누락 ${m}절 (${((1 - m / totalVerses) * 100).toFixed(2)}%)`,
    );
  }
}

main();
