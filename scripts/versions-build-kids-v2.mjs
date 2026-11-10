#!/usr/bin/env node
/**
 * 에이전트 5 — 4차
 * - 이다→이에요/예요 받침 규칙
 * - 편지서·기도문 칸 / 명령·권면 제외
 * - 서술 괄호 a/b/c
 * - public/bible-kids-v2/ 생성 (후보 + (b)만)
 * - 검토 100개 KRV 기반 안 (파일 미반영)
 * - greek-variant-verses.json
 *
 *   node scripts/versions-build-kids-v2.mjs
 *
 * 기존 bible-data · bible-v2 · chunks · bible-greekpara-v2 수정 없음.
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
const GPARA = path.join(root, "public", "bible-greekpara-v2");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(KIDS_V2, { recursive: true });

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
/** 롬~유 */
const EPISTLE_BOOKS = new Set([
  "romans", "corinthians1", "corinthians2", "galatians", "ephesians",
  "philippians", "colossians", "thessalonians1", "thessalonians2", "timothy1",
  "timothy2", "titus", "philemon", "hebrews", "james",
  "peter1", "peter2", "john1", "john2", "john3", "jude",
]);
/** 합(하박국) 3장 같은 기도문 장 */
const PRAYER_CHAPTERS = new Set([
  "habakkuk:3",
  "jonah:2",
  "samuel1:2", // 한나의 기도
  "kings1:8", // 솔로몬 봉헌 기도(장 단위)
  "nehemiah:9",
  "daniel:9",
]);

const SPEECH_CUE_RE =
  /(?:가라사대|가로되|이르시되|이르되|말씀하시되|말씀하되|말하노라|말하되|대답하되|대답하여\s*가로되|고하여\s*가로되|고하되|창화하여\s*가로되|노래하여\s*가로되|맹세하여\s*가로되|물어\s*가로되|청하여\s*가로되|전하되|외쳐\s*가로되|불러\s*가로되|명하여\s*가로되|기도하여\s*가로되|축복하여\s*가로되|저주하여\s*가로되|생각하여\s*가로되)/;
const SPEECH_CUE_KIDS_RE =
  /(?:말씀하(?:셨|시)?(?:어요|습니다|다)?|말하(?:셨|였|했)?(?:어요|습니다|다)?|이르(?:셨|셨)?(?:어요|습니다|다)?|대답하(?:셨|였|했)?(?:어요|습니다|다)?|외치(?:셨|었)?(?:어요|습니다|다)?|물으(?:셨)?(?:어요|습니다|다)?|명하(?:셨)?(?:어요|습니다|다)?)\s*[\.。]?\s*[""「]?/;

const NT = BOOK_ORDER.slice(39);

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
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

/** 한글 음절 받침 유무 */
function hasBatchim(ch) {
  if (!ch || ch.length < 1) return false;
  const code = ch.codePointAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}
/** 「이다/입니다」 직전 한글 음절 */
function lastHangulBefore(s, suffixLen) {
  const before = s.slice(0, s.length - suffixLen);
  const chars = [...before].filter((c) => {
    const cp = c.codePointAt(0);
    return cp >= 0xac00 && cp <= 0xd7a3;
  });
  return chars.length ? chars[chars.length - 1] : null;
}
function idaChoice(s, suffix /* 이다|입니다 */) {
  const last = lastHangulBefore(s, suffix.length);
  if (!last) return "예요";
  return hasBatchim(last) ? "이에요" : "예요";
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

/** 명령·권면 — 바꿀 대상에서 제외 */
function isExhortationOrImperative(unit) {
  const s = stripTrailingPunct(unit);
  if (!s) return false;
  if (classifyEnding(unit) === "imperative") return true;
  // 죽여야 한다 / 드려야 한다 / 해야 한다 등
  if (/(?:해야|하여야|하셔야|여야|아야|려야|해야만|하지\s*말아야|말아야|지\s*말아야)\s*한다$/.test(s))
    return true;
  if (/야\s*한다$/.test(s)) return true;
  if (/(?:지\s*말라|지\s*마라|지\s*말지니라)$/.test(s)) return true;
  if (/(?:합시다|하십시다)$/.test(s)) return true;
  if (/(?:하시기\s*바랍니다|바랍니다)$/.test(s)) return true;
  return false;
}

function unwrapDecorativeVerseQuotes(t) {
  const s = String(t || "").trim();
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("\u201c") && s.endsWith("\u201d") && s.length >= 2)
  ) {
    const inner = s.slice(1, -1);
    const dq = (inner.match(/"/g) || []).length;
    if (dq % 2 === 0) return inner;
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
        } else if (ch === "\u201d" || ch === "」") buf += ch;
        else buf += ch;
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

/**
 * @param opts.mode 'v4' = 편지·기도 분리, 'v3narr' = 3차와 동일(편지·기도도 서술칸) — 괄호 233 재분류용
 */
function classifyVerseDiscourse({
  bookId,
  chapter,
  quoteText,
  nonQuoteText,
  krvText,
  estimatedOpen,
  mode = "v4",
}) {
  const isLitBook = LIT_BOOKS.has(bookId);
  const isEpistle = mode === "v4" && EPISTLE_BOOKS.has(bookId);
  const isPrayer = mode === "v4" && PRAYER_CHAPTERS.has(`${bookId}:${chapter}`);
  let estimated = "";
  let narrative = nonQuoteText;
  let dialogue = quoteText;
  let nextEstimatedOpen = estimatedOpen;

  const cueSrc = krvText || nonQuoteText;
  const cueMatch = SPEECH_CUE_RE.exec(cueSrc);

  if (cueMatch) {
    const kidsCue = SPEECH_CUE_KIDS_RE.exec(nonQuoteText);
    if (kidsCue) {
      narrative = nonQuoteText.slice(0, kidsCue.index).trim();
      estimated = nonQuoteText.slice(kidsCue.index + kidsCue[0].length).trim();
    } else {
      const units = sentenceUnits(nonQuoteText);
      if (units.length <= 1) {
        if (/말씀|말하|이르|가라사|가로|외쳤|대답/.test(nonQuoteText) && units[0]) {
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
    dialogue = "";
    narrative = "";
    estimated = "";
    nextEstimatedOpen = false;
  } else if (isEpistle) {
    epistle = [dialogue, narrative, estimated].filter(Boolean).join(" ");
    dialogue = "";
    narrative = "";
    estimated = "";
    nextEstimatedOpen = false;
  } else if (isPrayer) {
    prayer = [dialogue, narrative, estimated].filter(Boolean).join(" ");
    dialogue = "";
    narrative = "";
    estimated = "";
    nextEstimatedOpen = false;
  }

  if (cueMatch && !estimated && !dialogue) nextEstimatedOpen = true;

  const buckets = {
    dialogue: dialogue.trim(),
    estimatedSpeech: estimated.trim(),
    wisdom: wisdom.trim(),
    epistle: epistle.trim(),
    prayer: prayer.trim(),
    narrative: narrative.trim(),
  };

  let primary = "narrative";
  const order = ["dialogue", "estimatedSpeech", "wisdom", "epistle", "prayer", "narrative"];
  const present = order.filter((k) => buckets[k]);
  if (present.length === 0) primary = "empty";
  else if (present.length === 1) primary = present[0];
  else {
    primary = order
      .map((k) => [k, buckets[k].length])
      .sort((a, b) => b[1] - a[1])[0][0];
  }

  return { buckets, primary, nextEstimatedOpen, hadCue: !!cueMatch };
}

function toneStats(text) {
  const out = emptyTone();
  for (const u of sentenceUnits(text)) {
    out[classifyEnding(u)] += 1;
    out.units += 1;
  }
  return out;
}
function addTone(a, b) {
  for (const k of Object.keys(a)) a[k] += b[k] || 0;
}

function loadBibleData(bookId) {
  return readJson(path.join(BD, `${bookId}.json`));
}

/**
 * proposeHaeyo — opts.idaBatchim: true면 받침 규칙 (4차)
 */
function proposeHaeyo(unit, opts = {}) {
  const useBatchim = opts.idaBatchim !== false;
  const raw = String(unit || "").trim();
  const punct = (raw.match(/[.!?。！？…]*$/) || [""])[0];
  const core = raw.slice(0, raw.length - punct.length);
  const s = core.trim();
  if (!s) return null;

  if (
    /(?:느니라|도다|리로다|이로다|리이다|시리이다|나이다|옵나이다|할지어다|일지어다|지어다|로다)$/.test(
      s,
    )
  ) {
    return {
      candidate: null,
      rule: "haetda_nida_classical",
      review: true,
      reason: "고전·기도 종결",
    };
  }

  const rules = [
    {
      name: "hamnida_seumnida",
      re: /습니다$/,
      to: (x) => x.replace(/습니다$/, "어요"),
    },
    {
      name: "hamnida_imnida",
      re: /입니다$/,
      to: (x) =>
        useBatchim
          ? x.replace(/입니다$/, idaChoice(x, "입니다"))
          : x.replace(/입니다$/, "이에요"),
    },
    {
      name: "hamnida_hamnida",
      re: /합니다$/,
      to: (x) => x.replace(/합니다$/, "해요"),
    },
    {
      name: "hamnida_doemnida",
      re: /됩니다$/,
      to: (x) => x.replace(/됩니다$/, "돼요"),
    },
    {
      name: "hamnida_seumnikka",
      re: /습니까$/,
      to: (x) => x.replace(/습니까$/, "어요?"),
    },
    { name: "haetda_getda", re: /겠다$/, to: (x) => x.replace(/겠다$/, "겠어요") },
    { name: "haetda_eotda", re: /었다$/, to: (x) => x.replace(/었다$/, "었어요") },
    { name: "haetda_atda", re: /았다$/, to: (x) => x.replace(/았다$/, "았어요") },
    { name: "haetda_yeotda", re: /였다$/, to: (x) => x.replace(/였다$/, "였어요") },
    { name: "haetda_syeotda", re: /셨다$/, to: (x) => x.replace(/셨다$/, "셨어요") },
    { name: "haetda_haetda", re: /했다$/, to: (x) => x.replace(/했다$/, "했어요") },
    {
      name: "haetda_doeeotda",
      re: /되었다$/,
      to: (x) => x.replace(/되었다$/, "되었어요"),
    },
    {
      name: "haetda_doeeotda2",
      re: /됐다$/,
      to: (x) => x.replace(/됐다$/, "됐어요"),
    },
    {
      name: "haetda_geosida",
      re: /것이다$/,
      to: (x) => x.replace(/것이다$/, "거예요"),
    },
    {
      name: "haetda_ida",
      re: /아니다$/,
      to: (x) => x.replace(/아니다$/, "아니에요"),
    },
    {
      name: "haetda_ida2",
      re: /이다$/,
      to: (x) =>
        useBatchim
          ? x.replace(/이다$/, idaChoice(x, "이다"))
          : x.replace(/이다$/, "이에요"),
      reviewIf: (x) => /(?:자|몫|띠|땅|날|소리)이다$/.test(x),
      reviewReason: "명사+이다(목록·단위) 가능",
    },
    { name: "haetda_handa", re: /한다$/, to: (x) => x.replace(/한다$/, "해요") },
    { name: "haetda_doenda", re: /된다$/, to: (x) => x.replace(/된다$/, "돼요") },
    { name: "haetda_inda", re: /인다$/, to: (x) => x.replace(/인다$/, "여요") },
  ];

  for (const rule of rules) {
    if (!rule.re.test(s)) continue;
    if (rule.reviewIf && rule.reviewIf(s)) {
      return {
        candidate: rule.to ? rule.to(s) + (punct || ".") : null,
        rule: rule.name,
        review: true,
        reason: rule.reviewReason || "규칙_불확신",
      };
    }
    return {
      candidate: rule.to(s) + (punct || "."),
      rule: rule.name,
      review: false,
    };
  }

  if (/다$/.test(s)) {
    if (/[\"'「『]/.test(s)) {
      return {
        candidate: null,
        rule: "haetda_da_generic",
        review: true,
        reason: "인용 의심",
      };
    }
    if (/(?:자|척|큐빗)다$/.test(s) || s.length <= 3) {
      return {
        candidate: null,
        rule: "haetda_da_generic",
        review: true,
        reason: "단위·과단",
      };
    }
    if (/(?:고|며)$/.test(s.slice(0, -1))) {
      return {
        candidate: null,
        rule: "haetda_da_generic",
        review: true,
        reason: "연결 의심",
      };
    }
    return {
      candidate: s.replace(/다$/, "요") + (punct || "."),
      rule: "haetda_da_generic",
      review: true,
      reason: "일반_다_요_불확신",
    };
  }
  return null;
}

function needsReviewUnit(unit, verseNarrativeTone) {
  const reasons = [];
  if (/[\"'「『」』]/.test(unit)) reasons.push("조각에_따옴표");
  if (
    verseNarrativeTone.haeyo > 0 &&
    (verseNarrativeTone.haetda > 0 || verseNarrativeTone.hamnida > 0)
  )
    reasons.push("절내_말투_혼합");
  if (
    /,\s*$/.test(unit.trim()) ||
    /(?:고|며|요|으며)\s*$/.test(stripTrailingPunct(unit))
  )
    reasons.push("목록·미종결_의심");
  return reasons;
}

function analyzeBookKids(bookId, mode = "v4") {
  const bd = loadBibleData(bookId);
  const verseRows = [];
  const byBookTone = emptyTone();
  const byBookBuckets = {
    narrative: 0,
    dialogue: 0,
    estimatedSpeech: 0,
    wisdom: 0,
    epistle: 0,
    prayer: 0,
  };
  let mixedNarrativeChapters = 0;
  const mixedList = [];

  for (const ch of bd.chapters) {
    const arr = ch.verses?.kids || [];
    const krvMap = new Map((ch.verses?.krv || []).map((v) => [v.n, v.t || ""]));
    const verses = arr.map((v) => ({ n: v.n, t: String(v.t || "") }));
    verses.sort((a, b) => a.n - b.n);
    const q = analyzeChapterQuotes(verses, {
      poetryBook: POETRY_BOOKS.has(bookId),
    });
    let estOpen = false;
    const chapterNarrativeTones = new Set();
    for (const row of q) {
      const disc = classifyVerseDiscourse({
        bookId,
        chapter: ch.chapter,
        quoteText: row.quoteText,
        nonQuoteText: row.nonQuoteText,
        krvText: krvMap.get(row.n) || "",
        estimatedOpen: estOpen && !row.openAtStart,
        mode,
      });
      if (row.openAtStart) disc.buckets.estimatedSpeech = "";
      estOpen = disc.nextEstimatedOpen && !row.openAtEnd;
      if (row.openAtEnd) estOpen = false;

      const narrTone = toneStats(disc.buckets.narrative);
      addTone(byBookTone, narrTone);
      if (narrTone.haeyo) chapterNarrativeTones.add("haeyo");
      if (narrTone.haetda || narrTone.hamnida) chapterNarrativeTones.add("plain");

      for (const bk of Object.keys(byBookBuckets)) {
        byBookBuckets[bk] += sentenceUnits(disc.buckets[bk] || "").length;
      }

      verseRows.push({
        bookId,
        chapter: ch.chapter,
        n: row.n,
        text: row.t,
        krv: krvMap.get(row.n) || "",
        primary: disc.primary,
        openAtStart: row.openAtStart,
        openAtEnd: row.openAtEnd,
        buckets: disc.buckets,
        narrativeTone: narrTone,
      });
    }
    if (
      chapterNarrativeTones.has("haeyo") &&
      chapterNarrativeTones.has("plain")
    ) {
      mixedNarrativeChapters += 1;
      mixedList.push(`${bookId} ${ch.chapter}`);
    }
  }
  return {
    bookId,
    narrativeTone: byBookTone,
    bucketUnits: byBookBuckets,
    mixedNarrativeChapters,
    mixedList,
    verseRows,
  };
}

function collectCandidates(verseRows, idaBatchim, excludeExhortation) {
  const candidates = [];
  const needsReview = [];
  const ruleCounts = {};
  for (const row of verseRows) {
    if (row.primary !== "narrative") continue;
    if (LIT_BOOKS.has(row.bookId)) continue;
    if (EPISTLE_BOOKS.has(row.bookId)) continue;
    if (PRAYER_CHAPTERS.has(`${row.bookId}:${row.chapter}`)) continue;
    const narr = row.buckets.narrative || "";
    if (!narr.trim()) continue;

    const units = sentenceUnits(narr);
    const toneClassesInVerse = new Set(
      units
        .map((u) => classifyEnding(u))
        .filter((c) => c === "haeyo" || c === "haetda" || c === "hamnida"),
    );
    const multiTone = toneClassesInVerse.size > 1;

    for (const unit of units) {
      const cls = classifyEnding(unit);
      if (cls !== "haetda" && cls !== "hamnida") continue;
      if (excludeExhortation && isExhortationOrImperative(unit)) continue;

      const prop = proposeHaeyo(unit, { idaBatchim });
      const reviewReasons = needsReviewUnit(unit, row.narrativeTone);
      if (multiTone) reviewReasons.push("절내_말투_둘이상");
      const ref = `${BOOK_KO[row.bookId]} ${row.chapter}:${row.n}`;
      if (!prop) {
        needsReview.push({
          ref,
          bookId: row.bookId,
          chapter: row.chapter,
          n: row.n,
          now: unit,
          candidate: null,
          rule: "no_rule",
          reviewReasons,
          krv: row.krv,
        });
        continue;
      }
      ruleCounts[prop.rule] = (ruleCounts[prop.rule] || 0) + 1;
      const entry = {
        ref,
        bookId: row.bookId,
        chapter: row.chapter,
        n: row.n,
        now: unit,
        candidate: prop.candidate,
        rule: prop.rule,
        reviewReasons: prop.review
          ? [...reviewReasons, prop.reason || "규칙_불확신"]
          : reviewReasons,
        krv: row.krv,
      };
      if (prop.review || reviewReasons.length) needsReview.push(entry);
      else candidates.push(entry);
    }
  }
  return { candidates, needsReview, ruleCounts };
}

// ── 괄호 a/b/c ───────────────────────────────────────────────────────────
function classifyNarrativeParen(parenInner, fullParen, contextBefore, verseText) {
  const inner = parenInner.trim();
  // (c) 시 표기
  if (/^없음$/.test(inner)) return "c_marker";
  if (/셀라|음악적\s*쉼|음악/.test(inner)) return "c_selah";
  // (a) 이름·낱말 뜻풀이
  if (
    /(?:이라는\s*뜻|라는\s*뜻|뜻임|의미|히브리|아람|헬라|그리스|곧\s|이름)/.test(
      inner,
    )
  )
    return "a_glossary";
  if (/(?:라는\s*말|한\s*뜻|뜻으로)/.test(inner)) return "a_glossary";
  const looksLikeAside =
    /^(?:다시|그때|그때에|이제|또한|그러나|이것은|사실|실제로|어떤\s*사본|12절|5만|먼저|참된|특정한|감옥에)/.test(
      inner,
    );
  const hasClauseVerb =
    /(?:했어요|합니다|입니다|습니다|이다|된다|한다|였다|었다|았다|셨다|나요|까요|있어요)/.test(
      inner,
    );
  // "이름"(풀이)을/를… — 조사 앞 동격·뜻풀이
  const esc = inner.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (
    verseText &&
    new RegExp(
      `[\"」』]\\s*\\(${esc}\\)(?:을|를|이|가|은|는|과|와|이라|라고|라\\s)`,
    ).test(verseText) &&
    !hasClauseVerb &&
    !looksLikeAside
  ) {
    return "a_glossary";
  }
  // 직전이 닫는 따옴표·한글이고 서술 동사가 없으면 뜻풀이
  const prev = contextBefore.slice(-1);
  if (
    /[가-힣"'」』]/.test(prev) &&
    inner.length <= 48 &&
    !/[.!?。]/.test(inner) &&
    !looksLikeAside &&
    !hasClauseVerb
  ) {
    return "a_glossary";
  }
  // (b) 끼워 넣은 말
  return "b_insert";
}

function findBalancedParens(text) {
  const out = [];
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "(" && s[i] !== "（") continue;
    const open = s[i];
    const close = open === "(" ? ")" : "）";
    let depth = 0;
    for (let j = i; j < s.length; j++) {
      if (s[j] === open) depth += 1;
      else if (s[j] === close) {
        depth -= 1;
        if (depth === 0) {
          out.push({
            index: i,
            full: s.slice(i, j + 1),
            inner: s.slice(i + 1, j),
          });
          i = j;
          break;
        }
      }
    }
  }
  return out;
}

/** 비균형 매칭이 중첩에서 잘린 경우, 절 텍스트에서 균형 괄호로 확장 */
function resolveParenSpan(verse, fullParen, inner) {
  if (!inner.includes("(") || inner.includes(")")) {
    return { full: fullParen, inner };
  }
  const needle = fullParen.slice(0, Math.min(24, fullParen.length));
  const start = String(verse || "").indexOf(needle);
  if (start < 0) return { full: fullParen, inner };
  const found = findBalancedParens(verse).find((p) => p.index === start);
  if (!found) return { full: fullParen, inner };
  return { full: found.full, inner: found.inner };
}

function fixParenB(fullParen, inner, verse) {
  const resolved = resolveParenSpan(verse, fullParen, inner);
  // 원문에 바깥 닫힘이 없어 비균형 매칭만 된 경우: 연 괄호만 제거
  if (
    resolved.full === fullParen &&
    inner.includes("(") &&
    !inner.includes(")")
  ) {
    return {
      after: fullParen.slice(1),
      rule: "paren_b_drop_open_only",
      paren: fullParen,
    };
  }
  const t = resolved.inner.trim();
  if (/^없음$/.test(t))
    return { after: "", rule: "paren_b_remove_empty", paren: resolved.full };
  if (/[.!?。]$/.test(t) || t.length >= 12) {
    return { after: t, rule: "paren_b_unwrap_clause", paren: resolved.full };
  }
  return { after: t, rule: "paren_b_unwrap_word", paren: resolved.full };
}

function collectNarrativeParens(verseRows) {
  const items = [];
  // 3차와 동일: 비균형 \([^)]+\) — 총 233 유지
  const re = /\([^)]+\)|（[^）]+）/g;
  for (const row of verseRows) {
    const text = row.buckets.narrative || "";
    if (!text) continue;
    let m;
    const reLocal = new RegExp(re.source, "g");
    while ((m = reLocal.exec(text))) {
      const before = text.slice(Math.max(0, m.index - 1), m.index);
      if (/[가-힣ㄱ-ㅎㅏ-ㅣ一-龯]/.test(before)) continue;
      const rawFull = m[0];
      const rawInner = rawFull.slice(1, -1);
      const ctxBefore = text.slice(Math.max(0, m.index - 24), m.index);
      const resolved = resolveParenSpan(row.text || text, rawFull, rawInner);
      const cls = classifyNarrativeParen(
        resolved.inner,
        resolved.full,
        ctxBefore,
        row.text || "",
      );
      const fix =
        cls === "b_insert"
          ? fixParenB(rawFull, rawInner, row.text || text)
          : null;
      items.push({
        ref: `${BOOK_KO[row.bookId]} ${row.chapter}:${row.n}`,
        bookId: row.bookId,
        chapter: row.chapter,
        n: row.n,
        paren: fix?.paren || resolved.full,
        inner: resolved.inner,
        class: cls,
        now: fix?.paren || resolved.full,
        after: fix ? fix.after : resolved.full,
        rule: fix ? fix.rule : cls,
        context: text.slice(
          Math.max(0, m.index - 20),
          m.index + rawFull.length + 20,
        ),
        verse: row.text,
      });
    }
  }
  return items;
}

// ── kids-v2 빌드 ─────────────────────────────────────────────────────────
function applyUnitReplace(verseText, now, candidate) {
  if (!now || !candidate || now === candidate) return { text: verseText, ok: false };
  const idx = verseText.indexOf(now);
  if (idx < 0) {
    // punct-insensitive: try strip trailing punct variants
    const nowCore = stripTrailingPunct(now);
    const candCore = stripTrailingPunct(candidate);
    const idx2 = verseText.indexOf(nowCore);
    if (idx2 < 0) return { text: verseText, ok: false };
    const text =
      verseText.slice(0, idx2) +
      candCore +
      verseText.slice(idx2 + nowCore.length);
    return { text, ok: text !== verseText };
  }
  const text =
    verseText.slice(0, idx) + candidate + verseText.slice(idx + now.length);
  return { text, ok: text !== verseText };
}

function applyParenB(verseText, paren, after) {
  if (!paren || !verseText.includes(paren)) return { text: verseText, ok: false };
  let next;
  if (after === "") {
    next = verseText
      .replace(paren, "")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([.!?。,])/g, "$1")
      .trim();
  } else {
    next = verseText.replace(paren, after);
    next = next.replace(/\s{2,}/g, " ");
  }
  return { text: next, ok: next !== verseText };
}

function craftReviewFix(krv, now) {
  // 검토 필요 → KRV 참고 해요체 안 (bible-kids-v2 미반영)
  const raw = String(now || "").trim();
  // 이름 나열·미종결
  if (/,\s*$/.test(raw) || /(?:와|과|및)\s*$/.test(raw)) {
    return {
      proposed: null,
      note: "목록·미종결_수동필요",
      krvHint: String(krv || "").slice(0, 120),
    };
  }
  const prop = proposeHaeyo(now, { idaBatchim: true });
  if (prop?.candidate && !prop.review) {
    return { proposed: prop.candidate, note: "규칙재적용" };
  }
  const s = stripTrailingPunct(now);
  if (s.length <= 4 && !/다$/.test(s)) {
    return { proposed: null, note: "과단_수동필요", krvHint: String(krv || "").slice(0, 80) };
  }
  const classicalMap = [
    [/옵나이다$/, "어요"],
    [/나이다$/, "어요"],
    [/시리이다$/, "실 거예요"],
    [/리이다$/, "거예요"],
    [/할지어다$/, "하세요"],
    [/일지어다$/, "이에요"],
    [/지어다$/, "세요"],
    [/느니라$/, "어요"],
    [/리로다$/, "군요"],
    [/이로다$/, "예요"],
    [/로다$/, "군요"],
    [/도다$/, "군요"],
  ];
  for (const [re, to] of classicalMap) {
    if (re.test(s)) {
      return {
        proposed: s.replace(re, to) + ".",
        note: "고전→해요(KRV참고_검수필요)",
      };
    }
  }
  // 인용·목록 안 ~다
  if (/[\"'「『]/.test(s) && /다$/.test(s)) {
    return {
      proposed: s.replace(/다$/, "요") + ".",
      note: "인용내부_종결만_해요(검수필요)",
    };
  }
  if (/다$/.test(s)) {
    const batchimProp = proposeHaeyo(s.replace(/다$/, "이다"), { idaBatchim: true });
    if (/이다$/.test(s)) {
      return {
        proposed: (batchimProp?.candidate || s.replace(/이다$/, "예요")).replace(/\.\.$/, "."),
        note: "이다_받침규칙_강제",
      };
    }
    return {
      proposed: s.replace(/다$/, "요") + ".",
      note: "일반다→요(KRV참고_검수필요)",
    };
  }
  return {
    proposed: null,
    note: "자동안_불가_수동필요",
  };
}

// ── greek variants ───────────────────────────────────────────────────────
function buildGreekVariants() {
  const matthewMissingInGpara = [];
  const bdMatt = loadBibleData("matthew");
  const gparaPath = path.join(GPARA, "matthew.json");
  const gpara = fs.existsSync(gparaPath) ? readJson(gparaPath) : null;
  for (const ch of bdMatt.chapters) {
    const krv = ch.verses?.krv || [];
    const gch = gpara?.chapters?.find((c) => c.chapter === ch.chapter);
    const gmap = new Map((gch?.verses || []).map((v) => [v.n, String(v.t || "").trim()]));
    for (const v of krv) {
      const kt = String(v.t || "").trim();
      if (!kt) continue;
      const gt = gmap.get(v.n);
      if (gt === undefined || gt === "") {
        matthewMissingInGpara.push({
          ref: `마태복음 ${ch.chapter}:${v.n}`,
          bookId: "matthew",
          chapter: ch.chapter,
          verse: v.n,
          krv: kt.slice(0, 100),
          greekpara: gt === undefined ? "(슬롯없음)" : "(빈칸)",
        });
      }
    }
  }

  const onlyInGreekKr = [];
  for (const bookId of NT) {
    const bd = loadBibleData(bookId);
    const v2p = path.join(V2, `${bookId}-v2.json`);
    if (!fs.existsSync(v2p)) continue;
    const v2 = readJson(v2p);
    for (const ch of bd.chapters) {
      const gkrMap = new Map(
        (ch.verses?.greekKr || []).map((v) => [v.n, String(v.t || "").trim()]),
      );
      const v2ch = v2.chapters.find((c) => c.chapter === ch.chapter);
      const ckrMap = new Map(
        (v2ch?.verses || []).map((v) => [v.n, String(v.copyKr || "").trim()]),
      );
      for (const [n, a] of gkrMap) {
        if (!a) continue;
        const b = ckrMap.get(n);
        if (b === undefined || b === "") {
          onlyInGreekKr.push({
            ref: `${BOOK_KO[bookId]} ${ch.chapter}:${n}`,
            bookId,
            chapter: ch.chapter,
            verse: n,
            greekKr: a.slice(0, 120),
            copyKr: b === undefined ? "(슬롯없음)" : "(빈칸)",
          });
        }
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    agent: 5,
    note: "수정 금지·참고용. 에이전트 1 전달.",
    matthewKrvPresentButGreekparaMissing: matthewMissingInGpara,
    matthewExpected: ["마태복음 17:21", "마태복음 18:11", "마태복음 23:14"],
    ntOnlyInGreekKr: onlyInGreekKr,
    counts: {
      matthewMissing: matthewMissingInGpara.length,
      ntOnlyInGreekKr: onlyInGreekKr.length,
    },
  };
}

// ════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════
console.log("analyzing books…");
const parts = BOOK_ORDER.map((id) => analyzeBookKids(id, "v4"));
const allRows = parts.flatMap((p) => p.verseRows);
/** 3차와 동일 서술칸(편지·기도 미분리) — 괄호 233 재분류용 */
const partsV3n = BOOK_ORDER.map((id) => analyzeBookKids(id, "v3narr"));
const allRowsV3n = partsV3n.flatMap((p) => p.verseRows);

const bucketUnits = {
  narrative: 0,
  dialogue: 0,
  estimatedSpeech: 0,
  wisdom: 0,
  epistle: 0,
  prayer: 0,
};
const narrativeTone = emptyTone();
let mixed = 0;
const mixedList = [];
for (const p of parts) {
  addTone(narrativeTone, p.narrativeTone);
  for (const k of Object.keys(bucketUnits)) bucketUnits[k] += p.bucketUnits[k];
  mixed += p.mixedNarrativeChapters;
  mixedList.push(...p.mixedList);
}
const wrongToneAfter = narrativeTone.haetda + narrativeTone.hamnida;

// before: v3 numbers (epistle still in narrative) — recompute with old scope for fair before
const beforeRowsTone = emptyTone();
for (const row of allRows) {
  // v3-like: lit excluded from narrative already in buckets; epistles currently in epistle bucket
  // For "before" we need v3 count 798: narrative without epistle/prayer split
  // Re-aggregate: take epistle+prayer+narrative tones from raw?
}
// Use stored v3 report
let wrongToneBefore = 798;
try {
  const v3 = readJson(path.join(OUT, "v3-report.json"));
  wrongToneBefore =
    v3.kids.trueNarrativeTone.haetda + v3.kids.trueNarrativeTone.hamnida;
} catch {
  /* keep 798 */
}

// Candidates BEFORE (ida always 이에요, no exhortation exclude, but WITH epistle/prayer still in narrative?)
// User: 규칙 수정 전→후 for candidates; 분류 보완 for 했다+합니다
// So candidate before = v3 totals; after = new rules + new buckets + exhortation exclude
/** 3차 kids-haeyo-candidates 확정값 (파일이 4차로 덮여도 고정) */
const candBefore = { candidates: 393, needsReview: 329 };

const afterCand = collectCandidates(allRows, true, true);
const candAfter = {
  candidates: afterCand.candidates.length,
  needsReview: afterCand.needsReview.length,
  byRule: afterCand.ruleCounts,
};

writeJson(path.join(OUT, "kids-haeyo-candidates.json"), {
  generatedAt: new Date().toISOString(),
  agent: 5,
  round: 4,
  scope:
    "진짜 서술만. 대사·추정·시·지혜·편지(롬~유)·기도장·명령·권면 제외. 이다 받침 규칙.",
  before: candBefore,
  totals: {
    candidates: candAfter.candidates,
    needsReview: candAfter.needsReview,
    byRule: candAfter.byRule,
  },
  candidates: afterCand.candidates,
  needsReview: afterCand.needsReview,
});

// ── parens (3차 진짜서술 233 기준) ───────────────────────────────────────
const narrParens = collectNarrativeParens(allRowsV3n);
const parenCounts = { a_glossary: 0, b_insert: 0, c_selah: 0, c_marker: 0, other: 0 };
for (const it of narrParens) {
  if (it.class === "a_glossary") parenCounts.a_glossary += 1;
  else if (it.class === "b_insert") parenCounts.b_insert += 1;
  else if (it.class === "c_selah") parenCounts.c_selah += 1;
  else if (it.class === "c_marker") parenCounts.c_marker += 1;
  else parenCounts.other += 1;
}
const bItems = narrParens.filter((x) => x.class === "b_insert");
/** 견본은 kids-v2에 실제로 적용되는 범위(편지·시·기도 제외) 우선 */
const bItemsApplyScope = bItems.filter(
  (x) =>
    !EPISTLE_BOOKS.has(x.bookId) &&
    !LIT_BOOKS.has(x.bookId) &&
    !PRAYER_CHAPTERS.has(`${x.bookId}:${x.chapter}`),
);
const randP = mulberry32(20261110);
const bSamples = [];
{
  const pool = bItemsApplyScope.length >= 15 ? bItemsApplyScope : bItems;
  const used = new Set();
  while (bSamples.length < 15 && used.size < pool.length) {
    const i = Math.floor(randP() * pool.length);
    if (used.has(i)) continue;
    used.add(i);
    const it = pool[i];
    const verseAfter = applyParenB(it.verse, it.paren, it.after).text;
    bSamples.push({
      ref: it.ref,
      now: it.paren,
      after: it.after,
      rule: it.rule,
      verseNow: it.verse.slice(0, 140),
      verseAfter: verseAfter.slice(0, 140),
    });
  }
}
writeJson(path.join(OUT, "v4-narrative-parens.json"), {
  totalNarrativeInsertParens: narrParens.length,
  counts: {
    a_glossary_keep: parenCounts.a_glossary,
    b_insert_fix: parenCounts.b_insert,
    c_selah_keep: parenCounts.c_selah,
    c_marker_keep: parenCounts.c_marker,
    c_total: parenCounts.c_selah + parenCounts.c_marker,
  },
  samplesB15: bSamples,
  allB: bItems.map((x) => ({
    ref: x.ref,
    bookId: x.bookId,
    chapter: x.chapter,
    n: x.n,
    paren: x.paren,
    after: x.after,
    rule: x.rule,
  })),
});

// ── build kids-v2 ────────────────────────────────────────────────────────
console.log("building bible-kids-v2…");
const changeLog = [];
const changeKey = new Set(); // book:ch:n
const candidateByVerse = new Map(); // key -> [entries]
for (const c of afterCand.candidates) {
  const k = `${c.bookId}:${c.chapter}:${c.n}`;
  if (!candidateByVerse.has(k)) candidateByVerse.set(k, []);
  candidateByVerse.get(k).push(c);
}
const parenBByVerse = new Map();
for (const it of bItems) {
  const k = `${it.bookId}:${it.chapter}:${it.n}`;
  if (!parenBByVerse.has(k)) parenBByVerse.set(k, []);
  parenBByVerse.get(k).push(it);
}

const protectedHits = { dialogue: 0, wisdom: 0, epistle: 0, prayer: 0, estimatedSpeech: 0 };
const primaryByKey = new Map();
for (const row of allRows) {
  primaryByKey.set(`${row.bookId}:${row.chapter}:${row.n}`, row.primary);
}

for (const bookId of BOOK_ORDER) {
  const bd = loadBibleData(bookId);
  const outChapters = [];
  for (const ch of bd.chapters) {
    const kidsArr = (ch.verses?.kids || []).map((v) => ({
      n: v.n,
      t: String(v.t || ""),
    }));
    const outVerses = [];
    for (const v of kidsArr) {
      let t = v.t;
      const key = `${bookId}:${ch.chapter}:${v.n}`;
      const primary = primaryByKey.get(key) || "narrative";
      const rulesApplied = [];

      // (가) 후보 치환 — 보호 칸이면 스킵
      const protectedPrimary = [
        "dialogue",
        "wisdom",
        "epistle",
        "prayer",
        "estimatedSpeech",
      ].includes(primary);
      if (!protectedPrimary) {
        const cands = candidateByVerse.get(key) || [];
        // longer first to avoid partial overlap
        cands.sort((a, b) => b.now.length - a.now.length);
        for (const c of cands) {
          const r = applyUnitReplace(t, c.now, c.candidate);
          if (r.ok) {
            t = r.text;
            rulesApplied.push(c.rule);
          }
        }
      }

      // (나) 괄호 (b) — 서술 칸에서 수집된 것만 (이미 narrative bucket)
      // 편지/시/대사 primary면 적용하지 않음
      if (!protectedPrimary && !LIT_BOOKS.has(bookId) && !EPISTLE_BOOKS.has(bookId)) {
        const ps = parenBByVerse.get(key) || [];
        for (const p of ps) {
          const r = applyParenB(t, p.paren, p.after);
          if (r.ok) {
            t = r.text;
            rulesApplied.push(p.rule);
          }
        }
      }

      if (t !== v.t) {
        if (protectedPrimary) {
          protectedHits[primary] = (protectedHits[primary] || 0) + 1;
        }
        changeLog.push({
          ref: `${BOOK_KO[bookId]} ${ch.chapter}:${v.n}`,
          bookId,
          chapter: ch.chapter,
          n: v.n,
          before: v.t,
          after: t,
          rules: rulesApplied,
          primary,
        });
        changeKey.add(key);
      }
      outVerses.push({ n: v.n, t });
    }
    outChapters.push({ chapter: ch.chapter, verses: outVerses });
  }
  writeJson(path.join(KIDS_V2, `${bookId}.json`), {
    bookId,
    bookKo: BOOK_KO[bookId],
    source: "bible-data.kids + haeyo candidates + paren_b",
    chapters: outChapters,
  });
}

writeJson(path.join(OUT, "kids-v2-changes.json"), {
  generatedAt: new Date().toISOString(),
  agent: 5,
  round: 4,
  changedVerses: changeLog.length,
  changes: changeLog.map((c) => ({
    ref: c.ref,
    before: c.before,
    after: c.after,
    rules: c.rules,
  })),
});

// ── review batch 1 (첫 100, 파일 미반영) ─────────────────────────────────
const reviewBatch = afterCand.needsReview.slice(0, 100).map((item) => {
  const crafted = craftReviewFix(item.krv, item.now);
  return {
    ref: item.ref,
    krv: item.krv || "",
    now: item.now,
    proposed: crafted.proposed,
    note: crafted.note,
    rule: item.rule,
    reviewReasons: item.reviewReasons,
  };
});
writeJson(path.join(OUT, "kids-review-batch1.json"), {
  generatedAt: new Date().toISOString(),
  agent: 5,
  note: "검토 필요 첫 100개. bible-kids-v2에는 아직 넣지 않음.",
  count: reviewBatch.length,
  items: reviewBatch,
});

// ── validation: re-analyze kids-v2 narrative mix ─────────────────────────
console.log("validating…");
function analyzeKidsV2Book(bookId) {
  const src = readJson(path.join(KIDS_V2, `${bookId}.json`));
  const bd = loadBibleData(bookId);
  let mixedCh = 0;
  const mixedL = [];
  const rows = [];
  for (const ch of src.chapters) {
    const bdCh = bd.chapters.find((c) => c.chapter === ch.chapter);
    const krvMap = new Map(
      (bdCh?.verses?.krv || []).map((v) => [v.n, v.t || ""]),
    );
    const verses = (ch.verses || []).map((v) => ({ n: v.n, t: String(v.t || "") }));
    const q = analyzeChapterQuotes(verses, {
      poetryBook: POETRY_BOOKS.has(bookId),
    });
    let estOpen = false;
    const chapterNarrativeTones = new Set();
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
      if (narrTone.haeyo) chapterNarrativeTones.add("haeyo");
      if (narrTone.haetda || narrTone.hamnida) chapterNarrativeTones.add("plain");
      rows.push({
        bookId,
        chapter: ch.chapter,
        n: row.n,
        text: row.t,
        primary: disc.primary,
        buckets: disc.buckets,
      });
    }
    if (
      chapterNarrativeTones.has("haeyo") &&
      chapterNarrativeTones.has("plain")
    ) {
      mixedCh += 1;
      mixedL.push(`${bookId} ${ch.chapter}`);
    }
  }
  return { mixedCh, mixedL, rows };
}

let mixedAfter = 0;
const mixedAfterList = [];
const v2Rows = [];
for (const bookId of BOOK_ORDER) {
  const r = analyzeKidsV2Book(bookId);
  mixedAfter += r.mixedCh;
  mixedAfterList.push(...r.mixedL);
  v2Rows.push(...r.rows);
}

// protected zone changes
const zoneChanges = { dialogue: 0, wisdom: 0, epistle: 0, prayer: 0, estimatedSpeech: 0, litBook: 0 };
for (const c of changeLog) {
  if (c.primary === "dialogue") zoneChanges.dialogue += 1;
  if (c.primary === "wisdom") zoneChanges.wisdom += 1;
  if (c.primary === "epistle") zoneChanges.epistle += 1;
  if (c.primary === "prayer") zoneChanges.prayer += 1;
  if (c.primary === "estimatedSpeech") zoneChanges.estimatedSpeech += 1;
  if (LIT_BOOKS.has(c.bookId)) zoneChanges.litBook += 1;
}

// random 30 changed
const rand = mulberry32(20261112);
const sample30 = [];
{
  const used = new Set();
  while (sample30.length < 30 && used.size < changeLog.length) {
    const i = Math.floor(rand() * changeLog.length);
    if (used.has(i)) continue;
    used.add(i);
    const c = changeLog[i];
    sample30.push({
      ref: c.ref,
      before: c.before,
      after: c.after,
      rules: c.rules,
    });
  }
}

// Rev 18 full before/after
const revBd = loadBibleData("revelation");
const revV2 = readJson(path.join(KIDS_V2, "revelation.json"));
const rev18bd = revBd.chapters.find((c) => c.chapter === 18);
const rev18v2 = revV2.chapters.find((c) => c.chapter === 18);
const rev18 = [];
const krv18 = new Map((rev18bd.verses.krv || []).map((v) => [v.n, v.t || ""]));
const kids18 = new Map((rev18bd.verses.kids || []).map((v) => [v.n, v.t || ""]));
const v218 = new Map((rev18v2.verses || []).map((v) => [v.n, v.t || ""]));
const q18 = analyzeChapterQuotes(
  [...kids18.entries()].map(([n, t]) => ({ n, t })).sort((a, b) => a.n - b.n),
);
for (const row of q18) {
  rev18.push({
    n: row.n,
    primaryHint: row.openAtStart || row.quoteText ? "dialogue-ish" : "narrative-ish",
    openAtStart: row.openAtStart,
    openAtEnd: row.openAtEnd,
    before: kids18.get(row.n) || "",
    after: v218.get(row.n) || "",
    unchanged: (kids18.get(row.n) || "") === (v218.get(row.n) || ""),
    quoteText: row.quoteText.slice(0, 40),
  });
}

const greekVar = buildGreekVariants();
writeJson(path.join(OUT, "greek-variant-verses.json"), greekVar);

const mixedBeforeV3 = 28;
writeJson(path.join(OUT, "v4-report.json"), {
  generatedAt: new Date().toISOString(),
  agent: 5,
  round: 4,
  buckets: bucketUnits,
  trueNarrativeTone: narrativeTone,
  wrongTone: {
    before_v3: wrongToneBefore,
    after_v4: wrongToneAfter,
    delta: wrongToneAfter - wrongToneBefore,
  },
  candidates: {
    before: candBefore,
    after: {
      candidates: candAfter.candidates,
      needsReview: candAfter.needsReview,
      byRule: candAfter.byRule,
    },
  },
  parens: {
    total: narrParens.length,
    counts: parenCounts,
    samplesB15: bSamples,
  },
  kidsV2: {
    changedVerses: changeLog.length,
    zoneChanges,
    mixedChapters: {
      before_v3: mixedBeforeV3,
      after_classify_only: mixed,
      after_kids_v2: mixedAfter,
      afterList: mixedAfterList.slice(0, 40),
    },
    sample30,
    rev18,
  },
  greekVariants: greekVar.counts,
  prayerChapters: [...PRAYER_CHAPTERS],
});

console.log(
  JSON.stringify(
    {
      wrongTone: { before: wrongToneBefore, after: wrongToneAfter },
      candidates: { before: candBefore, after: { c: candAfter.candidates, r: candAfter.needsReview } },
      byRule: candAfter.byRule,
      buckets: bucketUnits,
      parens: { total: narrParens.length, ...parenCounts },
      changedVerses: changeLog.length,
      zoneChanges,
      mixed: { before_v3: mixedBeforeV3, after_classify: mixed, after_kids_v2: mixedAfter },
      greek: greekVar.counts,
      matthewMissing: greekVar.matthewKrvPresentButGreekparaMissing.map((x) => x.ref),
      ntOnlyGreekKr: greekVar.ntOnlyInGreekKr.map((x) => x.ref),
      sample5: sample30.slice(0, 5).map((x) => `${x.ref}: ${x.rules}`),
      rev18changed: rev18.filter((x) => !x.unchanged).map((x) => x.n),
      bSamples: bSamples.slice(0, 5),
      idaSamples: afterCand.candidates
        .filter((x) => x.rule === "haetda_ida2")
        .slice(0, 8)
        .map((x) => `${x.now} → ${x.candidate}`),
    },
    null,
    2,
  ),
);
