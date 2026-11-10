#!/usr/bin/env node
/**
 * 에이전트 5 — 5차 refine
 * 1) 장 단위: 검토 필요 남는 장은 후보 치환도 되돌림
 * 2) 검토 100안 맞음/틀림 분류(미반영)
 * 3) 숫자 괄호 원복 + KRV 대조 표
 * 4) greek 29절 가/나/다
 *
 *   node scripts/versions-refine-kids-v2.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const OUT = path.join(root, ".cache", "versions");
const KIDS_V2 = path.join(root, "public", "bible-kids-v2");
const BD = path.join(root, "public", "bible-data");
const V2 = path.join(root, "public", "bible-v2");

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

const POETRY_BOOKS = new Set(["psalms", "lamentations", "songofsolomon"]);
const WISDOM_BOOKS = new Set(["job", "proverbs", "ecclesiastes"]);
const LIT_BOOKS = new Set([...POETRY_BOOKS, ...WISDOM_BOOKS]);
const EPISTLE_BOOKS = new Set([
  "romans", "corinthians1", "corinthians2", "galatians", "ephesians",
  "philippians", "colossians", "thessalonians1", "thessalonians2", "timothy1",
  "timothy2", "titus", "philemon", "hebrews", "james",
  "peter1", "peter2", "john1", "john2", "john3", "jude",
]);
const PRAYER_CHAPTERS = new Set([
  "habakkuk:3", "jonah:2", "samuel1:2", "kings1:8", "nehemiah:9", "daniel:9",
]);

const SPEECH_CUE_RE =
  /(?:가라사대|가로되|이르시되|이르되|말씀하시되|말씀하되|말하노라|말하되|대답하되|대답하여\s*가로되|고하여\s*가로되|고하되|창화하여\s*가로되|노래하여\s*가로되|맹세하여\s*가로되|물어\s*가로되|청하여\s*가로되|전하되|외쳐\s*가로되|불러\s*가로되|명하여\s*가로되|기도하여\s*가로되|축복하여\s*가로되|저주하여\s*가로되|생각하여\s*가로되)/;
const SPEECH_CUE_KIDS_RE =
  /(?:말씀하(?:셨|시)?(?:어요|습니다|다)?|말하(?:셨|였|했)?(?:어요|습니다|다)?|이르(?:셨|셨)?(?:어요|습니다|다)?|대답하(?:셨|였|했)?(?:어요|습니다|다)?|외치(?:셨|었)?(?:어요|습니다|다)?|물으(?:셨)?(?:어요|습니다|다)?|명하(?:셨)?(?:어요|습니다|다)?)\s*[\.。]?\s*[""「]?/;

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
}
function loadBibleData(bookId) {
  return readJson(path.join(BD, `${bookId}.json`));
}
function emptyTone() {
  return { haeyo: 0, hamnida: 0, haetda: 0, imperative: 0, other: 0, units: 0 };
}
function stripTrailingPunct(s) {
  return s.replace(/[.!?。！？…,，;；:：)）」』"”'’\s]+$/g, "").trim();
}
function sentenceUnits(text) {
  const t = String(text || "").trim();
  if (!t) return [];
  const parts = t
    .split(/(?<=[.!?。！？…])\s+|(?<=[.!?。！？…])(?=[^\s])/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [t];
}
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function classifyEnding(unit) {
  const raw = String(unit || "").trim();
  if (!raw) return "other";
  const s = stripTrailingPunct(raw);
  if (!s) return "other";
  if (
    /(?:어라|아라|여라|너라|거라|으라|으려무나|려무나|말아라|말라|마라|하라|해라|하시오|하십시오|세요|십시오)$/.test(
      s,
    )
  )
    return "imperative";
  if (/요$/.test(s) || /까요$/.test(s) || /죠$/.test(s)) return "haeyo";
  if (/(?:합니다|입니다|습니다|습니까)$/.test(s) || /니다$/.test(s)) return "hamnida";
  if (
    /(?:었|았|였|셨)다$/.test(s) ||
    /(?:한다|된다|이다|아니다)$/.test(s) ||
    /다$/.test(s)
  )
    return "haetda";
  return "other";
}
function toneStats(text) {
  const out = emptyTone();
  for (const u of sentenceUnits(text)) {
    out[classifyEnding(u)] += 1;
    out.units += 1;
  }
  return out;
}

function unwrapDecorativeVerseQuotes(t) {
  const s = String(t || "").trim();
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("\u201c") && s.endsWith("\u201d") && s.length >= 2)
  ) {
    const inner = s.slice(1, -1);
    if (((inner.match(/"/g) || []).length) % 2 === 0) return inner;
  }
  if (s.startsWith("「") && s.endsWith("」") && s.length >= 2) return s.slice(1, -1);
  return s;
}

function analyzeChapterQuotes(verseTexts, opts = {}) {
  const results = [];
  let openDq = 0;
  let openJq = 0;
  const poetryBook = !!opts.poetryBook;
  for (const { n, t: rawT } of verseTexts) {
    let t = poetryBook ? unwrapDecorativeVerseQuotes(rawT) : String(rawT || "");
    const openAtStart = openDq + openJq > 0;
    if (openAtStart) {
      const cont = t.match(/^"(.*)"(\s*[（(][^）)]*[）)])?\s*$/s);
      if (cont) t = cont[1] + (cont[2] || "");
      else if (t.startsWith('"') && !t.slice(1).includes('"')) t = t.slice(1);
    }
    const quoteParts = [];
    const nonQuoteParts = [];
    let buf = "";
    let mode = openAtStart ? "in" : "out";
    const flush = (to) => {
      if (!buf) return;
      if (to === "in") quoteParts.push(buf);
      else nonQuoteParts.push(buf);
      buf = "";
    };
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (mode === "out") {
        if (ch === '"' || ch === "\u201c") {
          flush("out");
          openDq += 1;
          mode = "in";
        } else if (ch === "「") {
          flush("out");
          openJq += 1;
          mode = "in";
        } else buf += ch;
      } else {
        if ((ch === '"' || ch === "\u201d") && openDq > 0) {
          flush("in");
          openDq -= 1;
          mode = openDq + openJq > 0 ? "in" : "out";
        } else if (ch === "」" && openJq > 0) {
          flush("in");
          openJq -= 1;
          mode = openDq + openJq > 0 ? "in" : "out";
        } else if (ch === '"' || ch === "\u201c") {
          buf += ch;
          openDq += 1;
        } else if (ch === "「") {
          buf += ch;
          openJq += 1;
        } else buf += ch;
      }
    }
    flush(mode === "in" ? "in" : "out");
    results.push({
      n,
      t: rawT,
      openAtStart,
      openAtEnd: openDq + openJq > 0,
      quoteText: quoteParts.join(" "),
      nonQuoteText: nonQuoteParts.join(" "),
    });
  }
  return results;
}

function classifyVerseDiscourse({
  bookId,
  chapter,
  quoteText,
  nonQuoteText,
  krvText,
  estimatedOpen,
}) {
  const isLitBook = LIT_BOOKS.has(bookId);
  const isEpistle = EPISTLE_BOOKS.has(bookId);
  const isPrayer = PRAYER_CHAPTERS.has(`${bookId}:${chapter}`);
  let estimated = "";
  let narrative = nonQuoteText;
  let dialogue = quoteText;
  let nextEstimatedOpen = estimatedOpen;
  const cueMatch = SPEECH_CUE_RE.exec(krvText || nonQuoteText);
  if (cueMatch) {
    const kidsCue = SPEECH_CUE_KIDS_RE.exec(nonQuoteText);
    if (kidsCue) {
      narrative = nonQuoteText.slice(0, kidsCue.index).trim();
      estimated = nonQuoteText.slice(kidsCue.index + kidsCue[0].length).trim();
    } else {
      const units = sentenceUnits(nonQuoteText);
      if (units.length <= 1) {
        if (/말씀|말하|이르|가라사|가로|외쳤|대답/.test(nonQuoteText)) {
          narrative = nonQuoteText;
          estimated = "";
        } else {
          narrative = "";
          estimated = nonQuoteText;
        }
      } else {
        narrative = units[0];
        estimated = units.slice(1).join(" ");
      }
    }
    nextEstimatedOpen = true;
  } else if (estimatedOpen && !isLitBook && !isEpistle && !isPrayer) {
    estimated = nonQuoteText;
    narrative = "";
    nextEstimatedOpen = true;
  }
  let wisdom = "";
  let epistle = "";
  let prayer = "";
  if (isLitBook) {
    wisdom = [dialogue, narrative, estimated].filter(Boolean).join(" ");
    dialogue = narrative = estimated = "";
    nextEstimatedOpen = false;
  } else if (isEpistle) {
    epistle = [dialogue, narrative, estimated].filter(Boolean).join(" ");
    dialogue = narrative = estimated = "";
    nextEstimatedOpen = false;
  } else if (isPrayer) {
    prayer = [dialogue, narrative, estimated].filter(Boolean).join(" ");
    dialogue = narrative = estimated = "";
    nextEstimatedOpen = false;
  }
  const buckets = {
    dialogue: dialogue.trim(),
    estimatedSpeech: estimated.trim(),
    wisdom: wisdom.trim(),
    epistle: epistle.trim(),
    prayer: prayer.trim(),
    narrative: narrative.trim(),
  };
  const order = ["dialogue", "estimatedSpeech", "wisdom", "epistle", "prayer", "narrative"];
  const present = order.filter((k) => buckets[k]);
  let primary = "empty";
  if (present.length === 1) primary = present[0];
  else if (present.length > 1) {
    primary = order
      .map((k) => [k, buckets[k].length])
      .sort((a, b) => b[1] - a[1])[0][0];
  }
  return { buckets, primary, nextEstimatedOpen };
}

function applyUnitReplace(verseText, now, candidate) {
  if (!now || !candidate || now === candidate) return { text: verseText, ok: false };
  const idx = verseText.indexOf(now);
  if (idx >= 0) {
    const text =
      verseText.slice(0, idx) + candidate + verseText.slice(idx + now.length);
    return { text, ok: text !== verseText };
  }
  const nowCore = stripTrailingPunct(now);
  const candCore = stripTrailingPunct(candidate);
  const idx2 = verseText.indexOf(nowCore);
  if (idx2 < 0) return { text: verseText, ok: false };
  const text =
    verseText.slice(0, idx2) + candCore + verseText.slice(idx2 + nowCore.length);
  return { text, ok: text !== verseText };
}

function applyParenB(verseText, paren, after) {
  if (!paren || !verseText.includes(paren)) return { text: verseText, ok: false };
  let next =
    after === ""
      ? verseText.replace(paren, "").replace(/\s{2,}/g, " ").trim()
      : verseText.replace(paren, after).replace(/\s{2,}/g, " ");
  return { text: next, ok: next !== verseText };
}

function isNumericParen(paren) {
  const i = String(paren || "")
    .replace(/^[（(]|[）)]$/g, "")
    .trim();
  if (/절/.test(i)) return false;
  if (/^[이그저]$/.test(i)) return false;
  if (/^[0-9０-９,\.]+만?$/.test(i)) return true;
  if (/^약\s*[0-9０-９]/.test(i) && i.length <= 12) return true;
  if (/^[일이삼사오육칠팔구십백천만억]+만?$/.test(i) && i.length >= 2) return true;
  if (/^[0-9]+년/.test(i) && i.length <= 15) return true;
  return false;
}

function chapterKey(bookId, chapter) {
  return `${bookId}:${chapter}`;
}

// ── load prior artifacts ─────────────────────────────────────────────────
const haeyo = readJson(path.join(OUT, "kids-haeyo-candidates.json"));
const parenDoc = readJson(path.join(OUT, "v4-narrative-parens.json"));
const reviewDoc = readJson(path.join(OUT, "kids-review-batch1.json"));
const greekDoc = readJson(path.join(OUT, "greek-variant-verses.json"));

const candidates = haeyo.candidates || [];
const needsReview = haeyo.needsReview || [];

/** 장별 후보/검토 */
const byChapter = new Map();
function bump(map, key, field, item) {
  if (!map.has(key)) map.set(key, { candidates: [], needsReview: [] });
  map.get(key)[field].push(item);
}
for (const c of candidates) bump(byChapter, chapterKey(c.bookId, c.chapter), "candidates", c);
for (const c of needsReview) bump(byChapter, chapterKey(c.bookId, c.chapter), "needsReview", c);

const eligibleChapters = new Set();
const blockedChapters = new Set();
for (const [key, bag] of byChapter) {
  if (bag.needsReview.length === 0 && bag.candidates.length > 0) {
    eligibleChapters.add(key);
  } else if (bag.needsReview.length > 0) {
    blockedChapters.add(key);
  }
}

/** 숫자 괄호 — 원복 대상 */
const numericParens = (parenDoc.allB || []).filter((x) => isNumericParen(x.paren));
const numericKeys = new Set(
  numericParens.map((x) => `${x.bookId}:${x.chapter}:${x.n}:${x.paren}`),
);

/** (b) 적용 목록 — 숫자 제외, 보호 칸 제외 */
const parenBApply = (parenDoc.allB || []).filter((x) => {
  if (isNumericParen(x.paren)) return false;
  if (EPISTLE_BOOKS.has(x.bookId)) return false;
  if (LIT_BOOKS.has(x.bookId)) return false;
  if (PRAYER_CHAPTERS.has(`${x.bookId}:${x.chapter}`)) return false;
  return true;
});

// ── rebuild kids-v2 ──────────────────────────────────────────────────────
console.log("rebuilding kids-v2 (chapter-gated)…");
const changeLog = [];
let chaptersApplied = 0;
let chaptersBlocked = 0;

for (const bookId of BOOK_ORDER) {
  const bd = loadBibleData(bookId);
  const outChapters = [];
  for (const ch of bd.chapters) {
    const key = chapterKey(bookId, ch.chapter);
    const allowTone = eligibleChapters.has(key);
    if (allowTone) chaptersApplied += 1;
    else if (blockedChapters.has(key)) chaptersBlocked += 1;

    const kidsArr = (ch.verses?.kids || []).map((v) => ({
      n: v.n,
      t: String(v.t || ""),
    }));
    const outVerses = [];
    for (const v of kidsArr) {
      let t = v.t;
      const rules = [];

      if (allowTone) {
        const bag = byChapter.get(key);
        const cands = [...(bag?.candidates || [])].filter(
          (c) => c.n === v.n,
        );
        cands.sort((a, b) => b.now.length - a.now.length);
        for (const c of cands) {
          const r = applyUnitReplace(t, c.now, c.candidate);
          if (r.ok) {
            t = r.text;
            rules.push(c.rule);
          }
        }
      }

      // paren B (non-numeric) — 장 게이트와 무관하게, 보호 책만 제외
      for (const p of parenBApply) {
        if (p.bookId !== bookId || p.chapter !== ch.chapter || p.n !== v.n)
          continue;
        const r = applyParenB(t, p.paren, p.after);
        if (r.ok) {
          t = r.text;
          rules.push(p.rule);
        }
      }

      if (t !== v.t) {
        changeLog.push({
          ref: `${BOOK_KO[bookId]} ${ch.chapter}:${v.n}`,
          bookId,
          chapter: ch.chapter,
          n: v.n,
          before: v.t,
          after: t,
          rules,
          chapterEligible: allowTone,
        });
      }
      outVerses.push({ n: v.n, t });
    }
    outChapters.push({ chapter: ch.chapter, verses: outVerses });
  }
  writeJson(path.join(KIDS_V2, `${bookId}.json`), {
    bookId,
    bookKo: BOOK_KO[bookId],
    source: "bible-data.kids + chapter-gated candidates + paren_b(non-numeric)",
    chapters: outChapters,
  });
}

writeJson(path.join(OUT, "kids-v2-changes.json"), {
  generatedAt: new Date().toISOString(),
  agent: 5,
  round: 5,
  policy:
    "장 단위: 검토 필요가 0인 장만 후보 치환. 숫자 괄호 (b)는 원복(미적용).",
  beforeChangedVerses: 292,
  changedVerses: changeLog.length,
  chaptersApplied: [...eligibleChapters].length,
  chaptersBlocked: [...blockedChapters].length,
  changes: changeLog.map((c) => ({
    ref: c.ref,
    before: c.before,
    after: c.after,
    rules: c.rules,
  })),
});

// ── mixed recount on kids-v2 ─────────────────────────────────────────────
function analyzeKidsV2Mixed() {
  let mixed = 0;
  const list = [];
  for (const bookId of BOOK_ORDER) {
    const src = readJson(path.join(KIDS_V2, `${bookId}.json`));
    const bd = loadBibleData(bookId);
    for (const ch of src.chapters) {
      const bdCh = bd.chapters.find((c) => c.chapter === ch.chapter);
      const krvMap = new Map(
        (bdCh?.verses?.krv || []).map((v) => [v.n, v.t || ""]),
      );
      const verses = (ch.verses || []).map((v) => ({
        n: v.n,
        t: String(v.t || ""),
      }));
      const q = analyzeChapterQuotes(verses, {
        poetryBook: POETRY_BOOKS.has(bookId),
      });
      let estOpen = false;
      const tones = new Set();
      for (const row of q) {
        const disc = classifyVerseDiscourse({
          bookId,
          chapter: ch.chapter,
          quoteText: row.quoteText,
          nonQuoteText: row.nonQuoteText,
          krvText: krvMap.get(row.n) || "",
          estimatedOpen: estOpen && !row.openAtStart,
        });
        if (row.openAtStart) disc.buckets.estimatedSpeech = "";
        estOpen = disc.nextEstimatedOpen && !row.openAtEnd;
        if (row.openAtEnd) estOpen = false;
        const narrTone = toneStats(disc.buckets.narrative);
        if (narrTone.haeyo) tones.add("haeyo");
        if (narrTone.haetda || narrTone.hamnida) tones.add("plain");
      }
      if (tones.has("haeyo") && tones.has("plain")) {
        mixed += 1;
        list.push(`${bookId} ${ch.chapter}`);
      }
    }
  }
  return { mixed, list };
}

const mixedAfter = analyzeKidsV2Mixed();

// ── numeric paren KRV check ──────────────────────────────────────────────
const numericTable = numericParens.map((x) => {
  const bd = loadBibleData(x.bookId);
  const ch = bd.chapters.find((c) => c.chapter === x.chapter);
  const krv = (ch?.verses?.krv || []).find((v) => v.n === x.n)?.t || "";
  const kids = (ch?.verses?.kids || []).find((v) => v.n === x.n)?.t || "";
  const inner = x.paren.replace(/^[（(]|[）)]$/g, "").trim();
  // KRV에 같은 숫자/수사가 괄호 없이 있는지
  const krvHasBare =
    krv.includes(inner) && !new RegExp(`[（(]\\s*${inner.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[）)]`).test(krv);
  // 오만 ↔ 5만 매핑
  const alt =
    inner === "5만"
      ? /오만|5만|五萬/.test(krv)
      : inner.includes("3년")
        ? /한\s*때|반\s*때|3년|삼년/.test(krv)
        : false;
  const krvHasInParen = new RegExp(
    `[（(][^）)]*${inner === "5만" ? "(?:5만|오만)" : inner.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^（(]*[）)]`,
  ).test(krv);
  return {
    ref: x.ref,
    paren: x.paren,
    kidsSnippet: kids.slice(0, 120),
    krvSnippet: krv.slice(0, 120),
    krvHasSameNumberBare: krvHasBare,
    krvHasNumberSomewhere: alt || krv.includes(inner) || (inner === "5만" && /오만/.test(krv)),
    krvHasInParen,
    decision: "원복_유지(확인전·괄호유지)",
    note:
      inner === "5만"
        ? "KRV도 「(오만)」 괄호 표기. 괄호 없는 동일 숫자 없음."
        : inner.includes("3년")
          ? "KRV는 「한 때와 두 때와 반 때」만 있고 「3년 반」은 해석 덧붙임."
          : "",
  };
});

writeJson(path.join(OUT, "numeric-parens.json"), {
  generatedAt: new Date().toISOString(),
  agent: 5,
  note: "숫자 괄호 전수. 확인 전 kids-v2에서 풀지 않음(원복).",
  count: numericTable.length,
  items: numericTable,
});

// ── review batch judge ───────────────────────────────────────────────────
function judgeReviewItem(item) {
  const now = item.now || "";
  const prop = item.proposed;
  if (prop == null || prop === "") {
    return {
      verdict: "보류",
      reason: item.note || "고친 안 없음(목록·수동)",
    };
  }
  const sNow = stripTrailingPunct(now);
  const sProp = stripTrailingPunct(prop);

  // 명백히 틀린 기계 치환
  if (/(?:없요|있요|하요|된요|한요|간요|진요|운요|일요)(?:\.|$)/.test(prop)) {
    return { verdict: "틀림", reason: "어간+요 잘못(없어요/있어요/해요 형태 깨짐)" };
  }
  if (/이예요/.test(prop) && /몫이예/.test(prop)) {
    return { verdict: "틀림", reason: "몫+이다 → 몫이에요가 맞음(이예요 오표기)" };
  }
  if (/마거예요/.test(prop)) {
    return { verdict: "틀림", reason: "마리이다→마거예요 오변환" };
  }
  if (/없음예요|없음이로다/.test(prop) && /없음이예/.test(prop)) {
    return { verdict: "틀림", reason: "이로다→예요 오변환" };
  }
  if (/들을세요|기울이에요/.test(prop)) {
    return { verdict: "틀림", reason: "지어다 명령→잘못된 해요" };
  }
  if (/자식예요|것예요|로다/.test(sNow) && /예요$/.test(sProp) && /이로다|리로다|로다$/.test(sNow)) {
    if (/자식예요|것예요/.test(prop))
      return { verdict: "틀림", reason: "고전 이로다/리로다 처리 부적절" };
  }
  if (/하요\.|이러하요/.test(prop)) {
    return { verdict: "틀림", reason: "하다→하요 (이래요/해요가 맞음)" };
  }
  if (/번제요\.|화제요\.|규례요\.|절기요\.|냄새요\.|여호와요\./.test(prop)) {
    return {
      verdict: "맞음",
      reason: "체언+다→요 종결, 해요체 서술로 무난",
    };
  }
  if (/돼요\.|거예요\./.test(prop) && /된다\.|것이다\./.test(now) === false) {
    // 인용 안 된다→돼요 등
    if (item.rule === "haetda_doenda" || /되게 돼요/.test(prop) || /있게 돼요/.test(prop)) {
      return { verdict: "맞음", reason: "된다→돼요 규칙 적절" };
    }
  }
  if (/몫이에요|몫이예요/.test(prop)) {
    if (/몫이예요/.test(prop))
      return { verdict: "틀림", reason: "받침 있음→이에요" };
    return { verdict: "맞음", reason: "이다 받침 규칙" };
  }
  if (/군요\./.test(prop) && /도다|로다/.test(sNow)) {
    return {
      verdict: "맞음",
      reason: "고전 감탄 종결→군요 (아이들이 읽기 무난, 문체 차이는 있음)",
    };
  }
  if (/나이다$/.test(sNow) && /어요$|었어요$|졌어요$/.test(sProp)) {
    return { verdict: "맞음", reason: "나이다→어요체 자연스러움" };
  }
  if (/세요\./.test(prop) && /지어다/.test(sNow)) {
    return { verdict: "틀림", reason: "할지어다류→세요는 어색, 하세요/들으세요 필요" };
  }
  // 기본: 다→요만 바뀌고 어간이 보존되면 맞음 쪽
  if (sNow.endsWith("다") && sProp === sNow.slice(0, -1) + "요") {
    const stem = sNow.slice(0, -1);
    if (/(?:없|있|하|된|한|진|운|렵|겁|럽|웠|웠|됩)$/.test(stem)) {
      return { verdict: "틀림", reason: "용언 어간+요 불완전(어요/해요/려워요 필요)" };
    }
    if (/(?:하다)$/.test(sNow) || /이러하|저러하|어떠하/.test(sNow)) {
      return { verdict: "틀림", reason: "하다→하요 (이래요/해요가 맞음)" };
    }
    // 규례다/절기다/화제다 등 체언+다
    if (
      /(?:규례|절기|번제|화제|소제|속죄제|몫|냄새|말씀|경고|묵시|환상|여호와|하나님)$/.test(
        stem,
      ) ||
      /제\)$/.test(stem)
    ) {
      return { verdict: "맞음", reason: "체언성 종결 다→요" };
    }
    return { verdict: "맞음", reason: "다→요 단순 치환 허용" };
  }
  if (item.note === "규칙재적용" && prop.endsWith("요.") || prop.endsWith("예요.")) {
    return { verdict: "맞음", reason: "규칙 재적용 후보" };
  }
  return { verdict: "틀림", reason: "고친 안이 어색하거나 규칙 불충분" };
}

const reviewJudged = (reviewDoc.items || []).map((item) => {
  const j = judgeReviewItem(item);
  return {
    ref: item.ref,
    krv: item.krv,
    now: item.now,
    proposed: item.proposed,
    verdict: j.verdict,
    reason: j.reason,
    rule: item.rule,
  };
});
const reviewOk = reviewJudged.filter((x) => x.verdict === "맞음");
const reviewBad = reviewJudged.filter((x) => x.verdict === "틀림");
const reviewHold = reviewJudged.filter((x) => x.verdict === "보류");

writeJson(path.join(OUT, "kids-review-batch1-judge.json"), {
  generatedAt: new Date().toISOString(),
  agent: 5,
  note: "미반영. 승인 후 반영.",
  counts: {
    total: reviewJudged.length,
    ok: reviewOk.length,
    bad: reviewBad.length,
    hold: reviewHold.length,
  },
  ok: reviewOk,
  bad: reviewBad,
  hold: reviewHold,
});

// ── greek 29 classify ────────────────────────────────────────────────────
const morphPath = path.join(root, ".cache/morphgnt/66-Ro-morphgnt.txt");
const morphTxt = fs.existsSync(morphPath)
  ? fs.readFileSync(morphPath, "utf8")
  : "";
const morphRom1625 = morphTxt.split(/\n/).filter((l) => /^06162[5-7]/.test(l));
const morphRom16verses = [
  ...new Set(
    morphTxt
      .split(/\n/)
      .filter((l) => /^0616/.test(l))
      .map((l) => l.slice(0, 6)),
  ),
].sort();

function loadCopyKr(bookId, ch, n) {
  const p = path.join(V2, `${bookId}-v2.json`);
  if (!fs.existsSync(p)) return null;
  const v2 = readJson(p);
  const c = v2.chapters.find((x) => x.chapter === ch);
  const v = (c?.verses || []).find((x) => x.n === n);
  return v ? String(v.copyKr || "") : null;
}
function loadKrv(bookId, ch, n) {
  const bd = loadBibleData(bookId);
  const c = bd.chapters.find((x) => x.chapter === ch);
  return (c?.verses?.krv || []).find((v) => v.n === n)?.t || "";
}

const laterMsHint = /후대 사본|SBLGNT.*포함되지|더 이른 사본/;
const classified = { ga: [], na: [], da: [], other: [] };

for (const item of greekDoc.ntOnlyInGreekKr || []) {
  const g = item.greekKr || "";
  const krv = loadKrv(item.bookId, item.chapter, item.verse);
  const copy = loadCopyKr(item.bookId, item.chapter, item.verse);
  const prevCopy = loadCopyKr(item.bookId, item.chapter, item.verse - 1);
  const prevKrv = loadKrv(item.bookId, item.chapter, item.verse - 1);

  let bucket = "ga";
  let reason = "";

  // (나) 번호만 다름 — 사용자 지정 확인 항
  if (item.bookId === "corinthians2" && item.chapter === 13 && item.verse === 14) {
    bucket = "na";
    reason =
      "KRV 13:14 빈칸. 축도 본문은 KRV/copyKr 13:13에 있음(개역 13절 번호).";
  } else if (item.bookId === "acts" && item.chapter === 19 && item.verse === 41) {
    bucket = "na";
    reason =
      "KRV 19:41 「모임을 흩어지게」. copyKr 19:40 끝에 해산 서술 포함, 41 슬롯 없음.";
  } else if (item.bookId === "romans" && item.chapter === 16 && item.verse >= 25 && item.verse <= 27) {
    // MorphGNT 확인
    const hasMorph = morphRom1625.some((l) => l.startsWith(`0616${item.verse}`));
    if (hasMorph) {
      bucket = "da";
      reason = "MorphGNT 66-Ro에 해당 절 있음, copyKr 슬롯 없음.";
    } else {
      bucket = "other";
      reason =
        "MorphGNT 66-Ro에 16:25–27 줄 없음(파일 마지막 절 061624). copyKr도 슬롯 없음. KRV·greekKr만 본문 있음. (다) 미해당.";
    }
  } else if (laterMsHint.test(g) || g.includes("[중단된 본문]")) {
    bucket = "ga";
    reason = "greekKr가 후대 사본/미포함으로 명시(또는 중단 표기).";
  } else if (g.startsWith("[") && g.endsWith("]")) {
    bucket = "ga";
    reason = "괄호·대괄호 부가 본문(후대/이문 성격).";
  } else {
    bucket = "ga";
    reason = "copyKr 없고 greekKr만 존재(후대·이문 처리 기본).";
  }

  const row = {
    ref: item.ref,
    bookId: item.bookId,
    chapter: item.chapter,
    verse: item.verse,
    bucket,
    reason,
    krvEmpty: !String(krv || "").trim(),
    copyKr: copy === null ? "(슬롯없음)" : copy ? copy.slice(0, 80) : "(빈칸)",
    prevCopyKrTail: prevCopy ? String(prevCopy).slice(-60) : null,
    greekKrHead: g.slice(0, 80),
  };
  classified[bucket === "ga" ? "ga" : bucket === "na" ? "na" : bucket === "da" ? "da" : "other"].push(row);
}

writeJson(path.join(OUT, "greek-variant-verses.json"), {
  ...greekDoc,
  generatedAt: new Date().toISOString(),
  agent: 5,
  round: 5,
  classification: {
    ga_laterManuscriptOnly: classified.ga,
    na_numberingMerged: classified.na,
    da_inSblgntMissingCopyKr: classified.da,
    otherOrUnchecked: classified.other,
    counts: {
      ga: classified.ga.length,
      na: classified.na.length,
      da: classified.da.length,
      other: classified.other.length,
    },
  },
  morphgntRomans16: {
    file: ".cache/morphgnt/66-Ro-morphgnt.txt",
    versesPresent: morphRom16verses,
    linesFor_16_25_27: morphRom1625.length
      ? morphRom1625
      : ["(없음 — 061625/061626/061627로 시작하는 줄 0개)"],
    lastVerseCode: morphRom16verses[morphRom16verses.length - 1] || null,
  },
});

// ── random 20 from new changes ───────────────────────────────────────────
const rand = mulberry32(20261113);
const sample20 = [];
{
  const used = new Set();
  while (sample20.length < 20 && used.size < changeLog.length) {
    const i = Math.floor(rand() * changeLog.length);
    if (used.has(i)) continue;
    used.add(i);
    const c = changeLog[i];
    sample20.push({
      ref: c.ref,
      before: c.before,
      after: c.after,
      rules: c.rules,
    });
  }
}

writeJson(path.join(OUT, "v5-report.json"), {
  generatedAt: new Date().toISOString(),
  agent: 5,
  round: 5,
  mixedChapters: {
    before: 70,
    after: mixedAfter.mixed,
    listSample: mixedAfter.list.slice(0, 40),
  },
  changedVerses: { before: 292, after: changeLog.length },
  chapterGate: {
    eligible: [...eligibleChapters].sort(),
    blockedCount: blockedChapters.size,
    eligibleCount: eligibleChapters.size,
  },
  reviewJudge: {
    ok: reviewOk.length,
    bad: reviewBad.length,
    hold: reviewHold.length,
  },
  numericParens: numericTable,
  greekCounts: {
    ga: classified.ga.length,
    na: classified.na.length,
    da: classified.da.length,
    other: classified.other.length,
  },
  sample20,
});

console.log(
  JSON.stringify(
    {
      mixed: { before: 70, after: mixedAfter.mixed },
      changed: { before: 292, after: changeLog.length },
      eligibleChapters: eligibleChapters.size,
      blockedChapters: blockedChapters.size,
      review: {
        ok: reviewOk.length,
        bad: reviewBad.length,
        hold: reviewHold.length,
      },
      numeric: numericTable.map((x) => x.ref + " " + x.paren),
      greek: {
        ga: classified.ga.length,
        na: classified.na.map((x) => x.ref),
        da: classified.da.map((x) => x.ref),
        other: classified.other.map((x) => x.ref),
      },
      morphRom1625: morphRom1625.length
        ? morphRom1625.slice(0, 3)
        : "(없음)",
      morphLast: morphRom16verses.slice(-3),
      sample5: sample20.slice(0, 5).map((x) => x.ref),
    },
    null,
    2,
  ),
);
