#!/usr/bin/env node
/**
 * 에이전트 5 — 역본 데이터 조사·집계 (읽기 전용).
 * 출력: .cache/versions/*.json  (기존 public/ 데이터는 수정하지 않음)
 *
 *   node scripts/versions-audit-report.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const OUT = path.join(root, ".cache", "versions");
fs.mkdirSync(OUT, { recursive: true });

const BOOK_ORDER = [
  "genesis", "exodus", "leviticus", "numbers", "deuteronomy",
  "joshua", "judges", "ruth", "samuel1", "samuel2",
  "kings1", "kings2", "chronicles1", "chronicles2", "ezra",
  "nehemiah", "esther", "job", "psalms", "proverbs",
  "ecclesiastes", "songofsolomon", "isaiah", "jeremiah", "lamentations",
  "ezekiel", "daniel", "hosea", "joel", "amos",
  "obadiah", "jonah", "micah", "nahum", "habakkuk",
  "zephaniah", "haggai", "zechariah", "malachi",
  "matthew", "mark", "luke", "john", "acts",
  "romans", "corinthians1", "corinthians2", "galatians", "ephesians",
  "philippians", "colossians", "thessalonians1", "thessalonians2", "timothy1",
  "timothy2", "titus", "philemon", "hebrews", "james",
  "peter1", "peter2", "john1", "john2", "john3",
  "jude", "revelation",
];

const BOOK_KO = {
  genesis: "창세기", exodus: "출애굽기", leviticus: "레위기", numbers: "민수기",
  deuteronomy: "신명기", joshua: "여호수아", judges: "사사기", ruth: "룻기",
  samuel1: "사무엘상", samuel2: "사무엘하", kings1: "열왕기상", kings2: "열왕기하",
  chronicles1: "역대상", chronicles2: "역대하", ezra: "에스라", nehemiah: "느헤미야",
  esther: "에스더", job: "욥기", psalms: "시편", proverbs: "잠언",
  ecclesiastes: "전도서", songofsolomon: "아가", isaiah: "이사야", jeremiah: "예레미야",
  lamentations: "예레미야애가", ezekiel: "에스겔", daniel: "다니엘", hosea: "호세아",
  joel: "요엘", amos: "아모스", obadiah: "오바댜", jonah: "요나", micah: "미가",
  nahum: "나훔", habakkuk: "하박국", zephaniah: "스바냐", haggai: "학개",
  zechariah: "스가랴", malachi: "말라기", matthew: "마태복음", mark: "마가복음",
  luke: "누가복음", john: "요한복음", acts: "사도행전", romans: "로마서",
  corinthians1: "고린도전서", corinthians2: "고린도후서", galatians: "갈라디아서",
  ephesians: "에베소서", philippians: "빌립보서", colossians: "골로새서",
  thessalonians1: "데살로니가전서", thessalonians2: "데살로니가후서", timothy1: "디모데전서",
  timothy2: "디모데후서", titus: "디도서", philemon: "빌레몬서", hebrews: "히브리서",
  james: "야고보서", peter1: "베드로전서", peter2: "베드로후서", john1: "요한일서",
  john2: "요한이서", john3: "요한삼서", jude: "유다서", revelation: "요한계시록",
};

const OT = new Set(BOOK_ORDER.slice(0, 39));
const NT = new Set(BOOK_ORDER.slice(39));

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function exists(p) {
  return fs.existsSync(p);
}

function verseMap(list) {
  const m = new Map();
  for (const v of list || []) {
    const n = Number(v.n ?? v.verse);
    if (!Number.isFinite(n)) continue;
    m.set(n, String(v.t ?? v.content ?? "").trim());
  }
  return m;
}

function chunkVerseMap(chunk) {
  const m = new Map();
  const verses = chunk?.verses;
  if (!verses || typeof verses !== "object") return m;
  for (const [ref, obj] of Object.entries(verses)) {
    const mRef = /:(\d+)\s*$/.exec(ref);
    if (!mRef) continue;
    const n = Number(mRef[1]);
    const t = String(obj?.content ?? "").trim();
    m.set(n, t);
  }
  return m;
}

function loadKrvBook(bookId) {
  const p = path.join(root, "public/bible-data", `${bookId}.json`);
  const d = readJson(p);
  const chapters = new Map();
  for (const ch of d.chapters) {
    chapters.set(ch.chapter, verseMap(ch.verses?.krv));
  }
  return { chapters, raw: d };
}

function loadKidsFromBibleData(bookId, raw) {
  const chapters = new Map();
  for (const ch of raw.chapters) {
    chapters.set(ch.chapter, verseMap(ch.verses?.kids));
  }
  return chapters;
}

function loadGreekKrFromBibleData(bookId, raw) {
  const chapters = new Map();
  for (const ch of raw.chapters) {
    chapters.set(ch.chapter, verseMap(ch.verses?.greekKr));
  }
  return chapters;
}

function loadGreekFromBibleData(raw) {
  const chapters = new Map();
  for (const ch of raw.chapters) {
    chapters.set(ch.chapter, verseMap(ch.verses?.greek));
  }
  return chapters;
}

function loadKjvBook(bookId) {
  const p = path.join(root, "public/bible-kjv", `${bookId}.json`);
  if (!exists(p)) return null;
  const d = readJson(p);
  const chapters = new Map();
  for (const ch of d.chapters) {
    chapters.set(ch.chapter, verseMap(ch.verses));
  }
  return chapters;
}

function loadWebFromChunks(bookId) {
  const dir = path.join(root, "public/bible-study/chunks", bookId);
  if (!exists(dir)) return null;
  const chapters = new Map();
  for (const name of fs.readdirSync(dir)) {
    if (!/^\d+$/.test(name)) continue;
    const p = path.join(dir, name, "english.json");
    if (!exists(p)) continue;
    chapters.set(Number(name), chunkVerseMap(readJson(p)));
  }
  return chapters;
}

function loadHebrewParaFromV2(bookId) {
  const p = path.join(root, "public/bible-v2", `${bookId}-v2.json`);
  if (!exists(p)) return null;
  const d = readJson(p);
  const chapters = new Map();
  for (const ch of d.chapters) {
    const m = new Map();
    for (const v of ch.verses || []) {
      m.set(Number(v.n), String(v.copyHebrewpara ?? "").trim());
    }
    chapters.set(ch.chapter, m);
  }
  return chapters;
}

function loadHebrewFromV2(bookId) {
  const p = path.join(root, "public/bible-v2", `${bookId}-v2.json`);
  if (!exists(p)) return null;
  const d = readJson(p);
  const chapters = new Map();
  for (const ch of d.chapters) {
    const m = new Map();
    for (const v of ch.verses || []) {
      m.set(Number(v.n), String(v.copyHebrew ?? "").trim());
    }
    chapters.set(ch.chapter, m);
  }
  return chapters;
}

function compareToKrv(krvChapters, otherChapters, label) {
  const missing = [];
  const extra = [];
  const empty = [];
  let krvVerseCount = 0;
  let otherVerseCount = 0;
  let otherChapterCount = 0;

  const krvChapterNums = [...krvChapters.keys()].sort((a, b) => a - b);
  const otherChapterNums = otherChapters
    ? [...otherChapters.keys()].sort((a, b) => a - b)
    : [];

  for (const c of otherChapterNums) {
    if (!krvChapters.has(c)) {
      for (const n of otherChapters.get(c).keys()) {
        extra.push(`${c}:${n}`);
      }
    }
  }

  for (const c of krvChapterNums) {
    const krv = krvChapters.get(c);
    krvVerseCount += krv.size;
    const oth = otherChapters?.get(c);
    if (!oth) {
      for (const n of krv.keys()) missing.push(`${c}:${n}`);
      continue;
    }
    otherChapterCount += 1;
    otherVerseCount += oth.size;
    for (const n of krv.keys()) {
      if (!oth.has(n)) missing.push(`${c}:${n}`);
      else if (!oth.get(n)) empty.push(`${c}:${n}`);
    }
    for (const n of oth.keys()) {
      if (!krv.has(n)) extra.push(`${c}:${n}`);
    }
  }

  return {
    label,
    krvChapters: krvChapterNums.length,
    otherChapters: otherChapterCount,
    krvVerses: krvVerseCount,
    otherVerses: otherVerseCount,
    missingCount: missing.length,
    extraCount: extra.length,
    emptyCount: empty.length,
    missingSample: missing.slice(0, 10),
    extraSample: extra.slice(0, 10),
    emptySample: empty.slice(0, 10),
    missing,
    extra,
    empty,
  };
}

/** 따옴표 안/밖 분리 (ASCII ", curly “”, 「」, 『』) */
function splitQuotes(text) {
  const outside = [];
  const inside = [];
  let buf = "";
  let mode = "out"; // out | dq | jq | kj
  const flush = () => {
    if (!buf) return;
    if (mode === "out") outside.push(buf);
    else inside.push(buf);
    buf = "";
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (mode === "out") {
      if (ch === '"' || ch === "\u201c") {
        flush();
        mode = "dq";
      } else if (ch === "「") {
        flush();
        mode = "jq";
      } else if (ch === "『") {
        flush();
        mode = "kj";
      } else buf += ch;
    } else if (mode === "dq") {
      if (ch === '"' || ch === "\u201d") {
        flush();
        mode = "out";
      } else buf += ch;
    } else if (mode === "jq") {
      if (ch === "」") {
        flush();
        mode = "out";
      } else buf += ch;
    } else if (mode === "kj") {
      if (ch === "』") {
        flush();
        mode = "out";
      } else buf += ch;
    }
  }
  flush();
  return { outside: outside.join(" "), inside: inside.join(" ") };
}

function sentenceUnits(text) {
  const t = String(text || "").trim();
  if (!t) return [];
  // 문장 종결 구두점 기준 분할. 빈 조각 제거.
  const parts = t
    .split(/(?<=[.!?。！？…])\s+|(?<=[.!?。！？…])(?=[^\s])/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [t];
}

function stripTrailingPunct(s) {
  return s.replace(/[.!?。！？…,，;；:：)\」』"”'’\s]+$/g, "").trim();
}

/**
 * 끝맺음 분류
 * - haeyo: 해요체 (…요)
 * - hamnida: 합니다체 (~습니다/~ㅂ니다) — 헬라·히브리 의역의 주 말투
 * - haetda: 했다체/평서 (~었다/~이다/~한다/~다, 요·습니다 없음)
 * - imperative: 명령형
 * - other: 기타 (목록형·미종결·의문 등)
 */
function classifyEnding(unit) {
  const raw = String(unit || "").trim();
  if (!raw) return "other";
  const s = stripTrailingPunct(raw);
  if (!s) return "other";

  // 명령형 (요 없는 구어 명령 / 고전 명령)
  if (
    /(?:어라|아라|여라|너라|거라|으라|으려무나|려무나|말아라|말라|마라|하라|해라|하시오|하십시오|세요|십시오)$/.test(
      s,
    )
  ) {
    return "imperative";
  }

  // 해요체
  if (/요$/.test(s) || /까요$/.test(s) || /죠$/.test(s)) return "haeyo";

  // 합니다체 (격식 존대) — 했다체와 분리
  // 합니다/입니다/습니다/습니까 등
  if (/(?:합니다|입니다|습니다|습니까|ㅂ니다)$/.test(s) || /니다$/.test(s)) {
    return "hamnida";
  }

  // 했다체 / 평서 종결 (요·습니다 없음)
  if (
    /(?:었|았|였|셨)다$/.test(s) ||
    /(?:한다|된다|이다|아니다|인다|운다|간다|온다|준다|든다|본다|산다|난다|안다|모른다)$/.test(
      s,
    ) ||
    /다$/.test(s)
  ) {
    return "haetda";
  }

  return "other";
}

const STYLE_KEYS = ["haeyo", "hamnida", "haetda", "imperative", "other", "units"];

function emptyStyleBucket() {
  return { haeyo: 0, hamnida: 0, haetda: 0, imperative: 0, other: 0, units: 0 };
}

function countParens(text) {
  return countParensDetailed(text).total;
}

/** 괄호 유형: glossary=직전 한글 단어에 붙은 뜻풀이, narrative=그 외 삽입 */
function countParensDetailed(text) {
  const s = String(text || "");
  let total = 0;
  let glossary = 0;
  let narrative = 0;
  const re = /\([^)]+\)|（[^）]+）/g;
  let m;
  while ((m = re.exec(s))) {
    total += 1;
    const before = s.slice(Math.max(0, m.index - 1), m.index);
    // 직전이 한글/한자면 태초(맨 처음) 형태
    if (/[가-힣ㄱ-ㅎㅏ-ㅣ一-龯]/.test(before)) glossary += 1;
    else narrative += 1;
  }
  return { total, glossary, narrative };
}

function analyzeStyleCorpus(bookChapters, bookId) {
  const totals = {
    outside: emptyStyleBucket(),
    inside: emptyStyleBucket(),
    parenCount: 0,
    glossaryParenCount: 0, // 단어(설명) 형태
    narrativeParenCount: 0, // 그 외 괄호
    verseCount: 0,
    emptyVerses: 0,
  };
  const byBook = {};
  let mixedChapters = 0;
  const mixedChapterList = [];
  const verseClassifications = []; // for samples

  for (const [c, verses] of [...bookChapters.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    const chapterStyles = new Set();
    for (const [n, t] of [...verses.entries()].sort((a, b) => a[0] - b[0])) {
      totals.verseCount += 1;
      if (!t) {
        totals.emptyVerses += 1;
        continue;
      }
      const pc = countParensDetailed(t);
      totals.parenCount += pc.total;
      totals.glossaryParenCount += pc.glossary;
      totals.narrativeParenCount += pc.narrative;
      const { outside, inside } = splitQuotes(t);
      const outUnits = sentenceUnits(outside);
      const inUnits = sentenceUnits(inside);

      const verseOut = { haeyo: 0, hamnida: 0, haetda: 0, imperative: 0, other: 0 };
      for (const u of outUnits) {
        const cls = classifyEnding(u);
        totals.outside[cls] += 1;
        totals.outside.units += 1;
        verseOut[cls] += 1;
        // 장 혼합: 해요체 vs (했다체|합니다체) 서술 말투가 한 장에 공존
        if (cls === "haeyo" || cls === "haetda" || cls === "hamnida") {
          chapterStyles.add(cls === "haeyo" ? "haeyo" : "plain");
        }
      }
      for (const u of inUnits) {
        const cls = classifyEnding(u);
        totals.inside[cls] += 1;
        totals.inside.units += 1;
      }

      // 절 대표 끝맺음: 따옴표 밖 마지막 문장 단위
      let verseEndClass = "other";
      if (outUnits.length) verseEndClass = classifyEnding(outUnits[outUnits.length - 1]);
      else if (inUnits.length) verseEndClass = classifyEnding(inUnits[inUnits.length - 1]);

      verseClassifications.push({
        bookId,
        ref: `${c}:${n}`,
        text: t,
        verseEndClass,
        outside: verseOut,
        paren: pc,
      });
    }
    if (chapterStyles.has("haeyo") && chapterStyles.has("plain")) {
      mixedChapters += 1;
      mixedChapterList.push(`${bookId} ${c}`);
    }
  }

  byBook[bookId] = {
    outside: { ...totals.outside },
    inside: { ...totals.inside },
    parenCount: totals.parenCount,
    glossaryParenCount: totals.glossaryParenCount,
    narrativeParenCount: totals.narrativeParenCount,
    verseCount: totals.verseCount,
    emptyVerses: totals.emptyVerses,
    mixedChapters,
  };

  return { totals, byBook, mixedChapters, mixedChapterList, verseClassifications };
}

function mergeStyle(acc, part) {
  for (const side of ["outside", "inside"]) {
    for (const k of STYLE_KEYS) {
      acc[side][k] += part.totals[side][k];
    }
  }
  acc.parenCount += part.totals.parenCount;
  acc.glossaryParenCount += part.totals.glossaryParenCount;
  acc.narrativeParenCount += part.totals.narrativeParenCount;
  acc.verseCount += part.totals.verseCount;
  acc.emptyVerses += part.totals.emptyVerses;
  acc.mixedChapters += part.mixedChapters;
  acc.mixedChapterList.push(...part.mixedChapterList);
  Object.assign(acc.byBook, part.byBook);
  acc.verseClassifications.push(...part.verseClassifications);
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function estimateFixability(style, alignmentEmpty, target = "haeyo") {
  const ruleTone =
    target === "haeyo"
      ? style.outside.haetda + style.outside.hamnida
      : target === "hamnida"
        ? style.outside.haeyo + style.outside.haetda
        : style.outside.haeyo + style.outside.hamnida;
  return {
    targetTone: target,
    ruleBased: {
      wrongToneOutsideApprox: ruleTone,
      narrativeParenApprox: style.narrativeParenCount || 0,
      emptyVerses: alignmentEmpty,
      note:
        "종결어미 일괄 치환·서술 괄호 제거·빈 절 채움은 규칙 자동화 후보. 검수 필수.",
    },
    humanNeeded: {
      otherOutsideApprox: style.outside.other,
      imperativeOutsideApprox: style.outside.imperative,
      mixedChapters: style.mixedChapters,
      glossaryParenKeepOrRewrite: style.glossaryParenCount || 0,
      note:
        "목록·미종결·따옴표 교차 절·뜻풀이 괄호 유지 여부·의미 보정은 사람 수정.",
    },
  };
}

// ── main ──────────────────────────────────────────────────────────────────
const pathsReport = {
  runtime: [
    {
      menu: "개역한글",
      runtimePaths: [
        "public/bible-data/<bookId>.json → verses.krv[] {n,t}",
        "public/bible-study/chunks/<bookId>/<ch>/korean.json → verses.krv[] {n,t}",
        "public/bible-study/chunks/<bookId>/<ch>/krv.json → verses{ref:{type,content}}",
      ],
      fields: ["n", "t"] ,
      buildScripts: [
        "scripts/import-bible-krv.mjs",
        "scripts/split-chapter-files.mjs",
        "scripts/build-bible-study.mjs",
        "scripts/split-bible-chunks.mjs",
      ],
    },
    {
      menu: "어린이 의역",
      runtimePaths: [
        "public/bible-data/<bookId>.json → verses.kids[] {n,t}  (읽기 목록 모드)",
        "public/bible-study/chunks/<bookId>/<ch>/korean.json → verses.kids[] {n,t}",
        "public/bible-study/chunks/<bookId>/<ch>/kids.json → verses{ref:{type,content}}",
      ],
      fields: ["n", "t"] ,
      buildScripts: [
        "scripts/build-bible-study.mjs (bible-data.kids → study layers)",
        "scripts/split-chapter-files.mjs / scripts/split-bible-chunks.mjs",
        "kids 본문 생성 전용 scripts/* 는 저장소에 없음 — bible-data 가 원본",
      ],
    },
    {
      menu: "영어 WEB",
      runtimePaths: [
        "public/bible-study/chunks/<bookId>/<ch>/english.json → verses{ref:{type,content}}",
        "원천 캐시(빌드용): .cache/web/<bookId>.json (현재 워크스페이스에 폴더 없음)",
      ],
      fields: ["content"] ,
      buildScripts: [
        "scripts/fetch-web-english.mjs",
        "scripts/build-bible-study.mjs",
        "scripts/split-bible-chunks.mjs",
      ],
    },
    {
      menu: "영어 KJV",
      runtimePaths: [
        "public/bible-kjv/<bookId>.json → chapters[].verses[] {n,t}",
        "public/bible-study/chunks/<bookId>/<ch>/kjv.json → verses{ref:{type,content}}",
        "원천 캐시: .cache/kjv/<bookId>.json",
      ],
      fields: ["n", "t"] ,
      buildScripts: ["scripts/convert-kjv.mjs", "scripts/split-bible-chunks.mjs"],
    },
    {
      menu: "헬라어 보기",
      runtimePaths: [
        "public/bible-v2/chapters/<bookId>/<ch>.json (GreekChapterV2 런타임)",
        "public/bible-v2/<bookId>-v2.json",
        "원문 평문(보존): public/bible-data/<bookId>.json → verses.greek[] {n,t}",
      ],
      fields: ["tokens / copyGreek 계열", "bible-data: greek {n,t}"] ,
      buildScripts: [
        "scripts/build-gospel-v2.mjs / build-matthew-v2.mjs 등",
        "scripts/auto-generate-greek-content*.mjs",
        "scripts/import-bible-greek-content-*.mjs",
      ],
    },
    {
      menu: "헬라 의역 (greekKr / greekpara)",
      runtimePaths: [
        "public/bible-data/<bookId>.json → verses.greekKr[] {n,t}",
        "public/bible-study/chunks/<bookId>/<ch>/greekpara.json",
        "public/bible-study/chunks/<bookId>/<ch>/korean.json → verses.greekKr",
      ],
      fields: ["n", "t"] ,
      buildScripts: [
        "scripts/build-greek-krvko.mjs",
        "scripts/finish-greek-krvko-function.mjs",
        "scripts/build-bible-study.mjs",
      ],
    },
    {
      menu: "히브리어 보기",
      runtimePaths: [
        "public/bible-v2/chapters/<bookId>/<ch>.json (HebrewChapterV2)",
        "public/bible-v2/<bookId>-v2.json → copyHebrew + tokens",
        "public/bible-study/chunks/<bookId>/<ch>/hebrew.json",
      ],
      fields: ["copyHebrew", "tokens"] ,
      buildScripts: ["scripts/build-tanakh-v2.mjs", "scripts/build-hebrew-poc.mjs"],
    },
    {
      menu: "히브리 의역 (hebrewpara)",
      runtimePaths: [
        "public/bible-v2/<bookId>-v2.json → copyHebrewpara",
        "public/bible-study/chunks/<bookId>/<ch>/hebrewpara.json",
        "public/hebrew-test/<book>.json · hebrew-test/chunks (PoC)",
        "수동 오버레이: public/hebrew-test/*.manual.json",
      ],
      fields: ["copyHebrewpara", "layers.hebrewpara.content"] ,
      buildScripts: [
        "scripts/build-tanakh-v2.mjs",
        "scripts/build-hebrew-poc.mjs",
        "scripts/build-bible-study.mjs",
      ],
    },
    {
      menu: "성경 공부",
      runtimePaths: [
        "public/bible-study/chunks/<bookId>/manifest.json",
        "public/bible-study/chunks/<bookId>/<ch>/{english,krv,greek,greekpara,hebrew,hebrewpara,kids,kjv,korean}.json",
        "책 단위: public/bible-study/data/<bookId>.json",
      ],
      fields: ["layer content / wordblock"] ,
      buildScripts: [
        "scripts/build-bible-study.mjs",
        "scripts/split-bible-chunks.mjs",
        "scripts/split-chapter-files.mjs",
      ],
    },
  ],
};

const alignment = {};
function newStyleAcc() {
  return {
    outside: emptyStyleBucket(),
    inside: emptyStyleBucket(),
    parenCount: 0,
    glossaryParenCount: 0,
    narrativeParenCount: 0,
    verseCount: 0,
    emptyVerses: 0,
    mixedChapters: 0,
    mixedChapterList: [],
    byBook: {},
    verseClassifications: [],
  };
}
const kidsStyleAll = newStyleAcc();
const greekStyleAll = newStyleAcc();
const hebrewStyleAll = newStyleAcc();

const kidsTextsForSample = []; // {bookId,ref,krv,kids}

for (const bookId of BOOK_ORDER) {
  const { chapters: krvCh, raw } = loadKrvBook(bookId);
  const kidsCh = loadKidsFromBibleData(bookId, raw);
  const greekKrCh = loadGreekKrFromBibleData(bookId, raw);
  const greekCh = loadGreekFromBibleData(raw);
  const kjvCh = loadKjvBook(bookId);
  const webCh = loadWebFromChunks(bookId);
  const hebParaCh = OT.has(bookId) ? loadHebrewParaFromV2(bookId) : null;
  const hebCh = OT.has(bookId) ? loadHebrewFromV2(bookId) : null;

  alignment[bookId] = {
    kids: compareToKrv(krvCh, kidsCh, "kids"),
    greekKr: compareToKrv(krvCh, greekKrCh, "greekKr"),
    greek: compareToKrv(krvCh, greekCh, "greek"),
    web: compareToKrv(krvCh, webCh, "web"),
    kjv: compareToKrv(krvCh, kjvCh, "kjv"),
    hebrew: hebCh ? compareToKrv(krvCh, hebCh, "hebrew") : null,
    hebrewpara: hebParaCh
      ? compareToKrv(krvCh, hebParaCh, "hebrewpara")
      : null,
  };

  // style
  const kidsPart = analyzeStyleCorpus(kidsCh, bookId);
  mergeStyle(kidsStyleAll, kidsPart);

  if (NT.has(bookId)) {
    const gPart = analyzeStyleCorpus(greekKrCh, bookId);
    mergeStyle(greekStyleAll, gPart);
  }
  if (OT.has(bookId) && hebParaCh) {
    const hPart = analyzeStyleCorpus(hebParaCh, bookId);
    mergeStyle(hebrewStyleAll, hPart);
  }

  // collect for random sample
  for (const [c, km] of krvCh) {
    const kidsMap = kidsCh.get(c) || new Map();
    for (const [n, kt] of km) {
      kidsTextsForSample.push({
        bookId,
        ref: `${BOOK_KO[bookId]} ${c}:${n}`,
        krv: kt,
        kids: kidsMap.get(n) ?? "",
      });
    }
  }
}

// Revelation 18:1-12 classification table
const rev18 = [];
{
  const raw = readJson(path.join(root, "public/bible-data/revelation.json"));
  const ch = raw.chapters.find((c) => c.chapter === 18);
  const kids = verseMap(ch.verses.kids);
  const krv = verseMap(ch.verses.krv);
  for (let n = 1; n <= 12; n++) {
    const t = kids.get(n) || "";
    const { outside, inside } = splitQuotes(t);
    const outUnits = sentenceUnits(outside);
    const endUnit = outUnits.length
      ? outUnits[outUnits.length - 1]
      : sentenceUnits(inside).slice(-1)[0] || t;
    rev18.push({
      verse: n,
      krv: krv.get(n) || "",
      kids: t,
      outsideEndUnit: endUnit,
      outsideEndClass: classifyEnding(endUnit),
      outsideAll: outUnits.map((u) => ({
        unit: u,
        class: classifyEnding(u),
      })),
      insideUnits: sentenceUnits(inside).map((u) => ({
        unit: u,
        class: classifyEnding(u),
      })),
      parenCount: countParens(t),
    });
  }
}

// random 20 with problem type
const rand = mulberry32(20261110);
const problemPool = kidsStyleAll.verseClassifications.filter((v) => {
  if (!v.text) return true;
  if (v.outside.haetda > 0 || v.outside.hamnida > 0) return true;
  if ((v.paren?.narrative || 0) > 0) return true;
  if (v.outside.haeyo > 0 && (v.outside.haetda > 0 || v.outside.hamnida > 0))
    return true;
  if (
    v.outside.other > 0 &&
    v.outside.haeyo + v.outside.haetda + v.outside.hamnida > 0
  )
    return true;
  return false;
});
const pool = problemPool.length >= 20 ? problemPool : kidsStyleAll.verseClassifications;
const picks = [];
const used = new Set();
while (picks.length < 20 && picks.length < pool.length) {
  const i = Math.floor(rand() * pool.length);
  if (used.has(i)) continue;
  used.add(i);
  const v = pool[i];
  const sample = kidsTextsForSample.find(
    (x) => x.bookId === v.bookId && x.ref.endsWith(` ${v.ref}`),
  ) || kidsTextsForSample.find(
    (x) => x.bookId === v.bookId && x.ref.split(" ").pop() === v.ref,
  );
  const problems = [];
  if (!v.text) problems.push("빈 문자열");
  if (v.outside.haetda > 0) problems.push("따옴표밖 했다체");
  if (v.outside.hamnida > 0) problems.push("따옴표밖 합니다체");
  if (v.outside.imperative > 0) problems.push("따옴표밖 명령형");
  if ((v.paren?.narrative || 0) > 0) problems.push("서술 괄호 삽입");
  if ((v.paren?.glossary || 0) > 0) problems.push("뜻풀이 괄호");
  if (v.outside.other > 0) problems.push("따옴표밖 기타(미종결 등)");
  if (
    v.outside.haeyo > 0 &&
    (v.outside.haetda > 0 || v.outside.hamnida > 0)
  )
    problems.push("절내 말투 혼합");
  if (!problems.length && v.verseEndClass === "haeyo") problems.push("(정상 해요체)");
  picks.push({
    ref: sample?.ref || `${BOOK_KO[v.bookId]} ${v.ref}`,
    krv: sample?.krv || "",
    kids: v.text,
    problems: problems.join(" · ") || v.verseEndClass,
  });
}

// alignment summaries
function summarizeAlignment(key) {
  const byBook = [];
  let missing = 0,
    extra = 0,
    empty = 0;
  const missingSamples = [];
  const extraSamples = [];
  const emptySamples = [];
  for (const bookId of BOOK_ORDER) {
    const row = alignment[bookId][key];
    if (!row) continue;
    missing += row.missingCount;
    extra += row.extraCount;
    empty += row.emptyCount;
    byBook.push({
      bookId,
      bookKo: BOOK_KO[bookId],
      krvVerses: row.krvVerses,
      otherVerses: row.otherVerses,
      missing: row.missingCount,
      extra: row.extraCount,
      empty: row.emptyCount,
      missingSample: row.missingSample,
      extraSample: row.extraSample,
      emptySample: row.emptySample,
    });
    for (const s of row.missingSample) {
      if (missingSamples.length < 10)
        missingSamples.push(`${BOOK_KO[bookId]} ${s}`);
    }
    for (const s of row.extraSample) {
      if (extraSamples.length < 10)
        extraSamples.push(`${BOOK_KO[bookId]} ${s}`);
    }
    for (const s of row.emptySample) {
      if (emptySamples.length < 10)
        emptySamples.push(`${BOOK_KO[bookId]} ${s}`);
    }
  }
  return {
    totals: { missing, extra, empty },
    samples: { missing: missingSamples, extra: extraSamples, empty: emptySamples },
    byBook,
  };
}

const alignmentSummary = {
  kids: summarizeAlignment("kids"),
  greekKr: summarizeAlignment("greekKr"),
  greek: summarizeAlignment("greek"),
  web: summarizeAlignment("web"),
  kjv: summarizeAlignment("kjv"),
  hebrew: summarizeAlignment("hebrew"),
  hebrewpara: summarizeAlignment("hebrewpara"),
};

const kidsFix = estimateFixability(
  kidsStyleAll,
  alignmentSummary.kids.totals.empty,
  "haeyo",
);
const greekFix = estimateFixability(
  greekStyleAll,
  alignmentSummary.greekKr.totals.empty,
  "hamnida",
);
const hebrewFix = estimateFixability(
  hebrewStyleAll,
  alignmentSummary.hebrewpara.totals.empty,
  "hamnida",
);

const proposedPaths = {
  kids: "public/bible-kids-v2/<bookId>.json  (+ chunks: public/bible-study/chunks-kids-v2/... 는 화면 연동 시)",
  greekpara: "public/bible-greekpara-v2/<bookId>.json",
  hebrewpara: "public/bible-hebrewpara-v2/<bookId>.json",
  auditCache: ".cache/versions/",
  auditScript: "scripts/versions-*.mjs",
};

function slimStyle(s) {
  const sideSlim = (side) => ({
    haeyo: side.haeyo,
    hamnida: side.hamnida,
    haetda: side.haetda,
    imperative: side.imperative,
    other: side.other,
    units: side.units,
  });
  return {
    totals: {
      outside: sideSlim(s.outside),
      inside: sideSlim(s.inside),
      parenCount: s.parenCount,
      glossaryParenCount: s.glossaryParenCount,
      narrativeParenCount: s.narrativeParenCount,
      verseCount: s.verseCount,
      emptyVerses: s.emptyVerses,
      mixedChapters: s.mixedChapters,
    },
    mixedChapterSample: s.mixedChapterList.slice(0, 30),
    byBook: Object.fromEntries(
      Object.entries(s.byBook).map(([id, b]) => [
        id,
        {
          bookKo: BOOK_KO[id],
          outside: sideSlim(b.outside),
          inside: sideSlim(b.inside),
          parenCount: b.parenCount,
          glossaryParenCount: b.glossaryParenCount,
          narrativeParenCount: b.narrativeParenCount,
          verseCount: b.verseCount,
          emptyVerses: b.emptyVerses,
          mixedChapters: b.mixedChapters,
        },
      ]),
    ),
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  agent: 5,
  paths: pathsReport,
  alignment: alignmentSummary,
  kidsStyle: slimStyle(kidsStyleAll),
  greekKrStyle: slimStyle(greekStyleAll),
  hebrewparaStyle: slimStyle(hebrewStyleAll),
  revelation18_1_12: rev18,
  random20: picks,
  fixProposal: {
    kids: kidsFix,
    greekKr: greekFix,
    hebrewpara: hebrewFix,
    proposedOutputPaths: proposedPaths,
  },
};

fs.writeFileSync(
  path.join(OUT, "audit-report.json"),
  JSON.stringify(report, null, 2),
);
fs.writeFileSync(
  path.join(OUT, "alignment-by-book.json"),
  JSON.stringify(alignmentSummary, null, 2),
);
fs.writeFileSync(
  path.join(OUT, "kids-style-by-book.json"),
  JSON.stringify(slimStyle(kidsStyleAll), null, 2),
);
fs.writeFileSync(
  path.join(OUT, "greekkr-style-by-book.json"),
  JSON.stringify(slimStyle(greekStyleAll), null, 2),
);
fs.writeFileSync(
  path.join(OUT, "hebrewpara-style-by-book.json"),
  JSON.stringify(slimStyle(hebrewStyleAll), null, 2),
);
fs.writeFileSync(
  path.join(OUT, "revelation-18-1-12.json"),
  JSON.stringify(rev18, null, 2),
);
fs.writeFileSync(
  path.join(OUT, "random20.json"),
  JSON.stringify(picks, null, 2),
);
fs.writeFileSync(
  path.join(OUT, "paths.json"),
  JSON.stringify(pathsReport, null, 2),
);

// human-readable summary markdown (cache only)
const md = [];
md.push("# 역본 감사 요약 (에이전트 5)");
md.push(`생성: ${report.generatedAt}`);
md.push("");
md.push("## 절 대응 totals (개역한글 기준)");
for (const [k, v] of Object.entries(alignmentSummary)) {
  md.push(
    `- **${k}**: missing=${v.totals.missing}, extra=${v.totals.extra}, empty=${v.totals.empty}`,
  );
}
md.push("");
md.push("## 어린이 의역 말투 (따옴표 밖 문장 단위)");
md.push(
  `- 해요 ${kidsStyleAll.outside.haeyo} / 합니다 ${kidsStyleAll.outside.hamnida} / 했다 ${kidsStyleAll.outside.haetda} / 명령 ${kidsStyleAll.outside.imperative} / 기타 ${kidsStyleAll.outside.other} (units=${kidsStyleAll.outside.units})`,
);
md.push(
  `- 따옴표 안: 해요 ${kidsStyleAll.inside.haeyo} / 합니다 ${kidsStyleAll.inside.hamnida} / 했다 ${kidsStyleAll.inside.haetda} / 명령 ${kidsStyleAll.inside.imperative} / 기타 ${kidsStyleAll.inside.other}`,
);
md.push(
  `- 괄호: 전체 ${kidsStyleAll.parenCount} (뜻풀이 ${kidsStyleAll.glossaryParenCount} / 서술 ${kidsStyleAll.narrativeParenCount})`,
);
md.push(`- 말투 혼합 장: ${kidsStyleAll.mixedChapters}`);
md.push("");
md.push("## 헬라 의역(greekKr) 말투 (따옴표 밖)");
md.push(
  `- 해요 ${greekStyleAll.outside.haeyo} / 합니다 ${greekStyleAll.outside.hamnida} / 했다 ${greekStyleAll.outside.haetda} / 명령 ${greekStyleAll.outside.imperative} / 기타 ${greekStyleAll.outside.other}`,
);
md.push(
  `- 괄호: ${greekStyleAll.parenCount} (뜻풀이 ${greekStyleAll.glossaryParenCount} / 서술 ${greekStyleAll.narrativeParenCount}), 혼합 장: ${greekStyleAll.mixedChapters}`,
);
md.push("");
md.push("## 히브리 의역(hebrewpara) 말투 (따옴표 밖)");
md.push(
  `- 해요 ${hebrewStyleAll.outside.haeyo} / 합니다 ${hebrewStyleAll.outside.hamnida} / 했다 ${hebrewStyleAll.outside.haetda} / 명령 ${hebrewStyleAll.outside.imperative} / 기타 ${hebrewStyleAll.outside.other}`,
);
md.push(
  `- 괄호: ${hebrewStyleAll.parenCount} (뜻풀이 ${hebrewStyleAll.glossaryParenCount} / 서술 ${hebrewStyleAll.narrativeParenCount}), 혼합 장: ${hebrewStyleAll.mixedChapters}`,
);
fs.writeFileSync(path.join(OUT, "SUMMARY.md"), md.join("\n"));

console.log(JSON.stringify({
  out: OUT,
  alignmentTotals: Object.fromEntries(
    Object.entries(alignmentSummary).map(([k, v]) => [k, v.totals]),
  ),
  kidsOutside: kidsStyleAll.outside,
  kidsInside: kidsStyleAll.inside,
  kidsParen: {
    total: kidsStyleAll.parenCount,
    glossary: kidsStyleAll.glossaryParenCount,
    narrative: kidsStyleAll.narrativeParenCount,
  },
  kidsMixedChapters: kidsStyleAll.mixedChapters,
  greekOutside: greekStyleAll.outside,
  greekParen: {
    total: greekStyleAll.parenCount,
    glossary: greekStyleAll.glossaryParenCount,
    narrative: greekStyleAll.narrativeParenCount,
  },
  greekMixed: greekStyleAll.mixedChapters,
  hebrewOutside: hebrewStyleAll.outside,
  hebrewParen: {
    total: hebrewStyleAll.parenCount,
    glossary: hebrewStyleAll.glossaryParenCount,
    narrative: hebrewStyleAll.narrativeParenCount,
  },
  hebrewMixed: hebrewStyleAll.mixedChapters,
  rev18classes: rev18.map((r) => `${r.verse}:${r.outsideEndClass}`),
}, null, 2));
