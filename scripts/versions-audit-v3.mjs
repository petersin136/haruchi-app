#!/usr/bin/env node
/**
 * 에이전트 5 — 3차: 시·지혜서 칸 + 해요 후보 + 서술괄호 + 빈절 목록
 * (담화 분류는 2차 로직 + 잠언·전도서·욥기 → 시·지혜서)
 *
 *   node scripts/versions-audit-v3.mjs
 * 출력: .cache/versions/v3-* , kids-haeyo-candidates.json, blank-verses.json
 * 원본 public/bible-data 등 수정 없음.
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

/** 시·애가·아가 */
const POETRY_BOOKS = new Set(["psalms", "lamentations", "songofsolomon"]);
/** 잠언·전도서·욥기 — 3차에서 시·지혜서 칸으로 이동 */
const WISDOM_BOOKS = new Set(["job", "proverbs", "ecclesiastes"]);
/** 시·지혜서 통합 (서술 집계에서 제외) */
const LIT_BOOKS = new Set([...POETRY_BOOKS, ...WISDOM_BOOKS]);

/** 개역한글 말하기 도입 동사/구 (대사 추정 단서) */
const SPEECH_CUE_RE =
  /(?:가라사대|가로되|이르시되|이르되|말씀하시되|말씀하되|말하노라|말하되|대답하되|대답하여\s*가로되|고하여\s*가로되|고하되|창화하여\s*가로되|노래하여\s*가로되|맹세하여\s*가로되|물어\s*가로되|청하여\s*가로되|전하되|외쳐\s*가로되|불러\s*가로되|명하여\s*가로되|기도하여\s*가로되|축복하여\s*가로되|저주하여\s*가로되|생각하여\s*가로되)/;

const SPEECH_CUE_KIDS_RE =
  /(?:말씀하(?:셨|시)?(?:어요|습니다|다)?|말하(?:셨|였|했)?(?:어요|습니다|다)?|이르(?:셨|셨)?(?:어요|습니다|다)?|대답하(?:셨|였|했)?(?:어요|습니다|다)?|외치(?:셨|었)?(?:어요|습니다|다)?|물으(?:셨)?(?:어요|습니다|다)?|명하(?:셨)?(?:어요|습니다|다)?)\s*[\.。]?\s*[""「]?/;

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function emptyTone() {
  return { haeyo: 0, hamnida: 0, haetda: 0, imperative: 0, other: 0, units: 0 };
}

function stripTrailingPunct(s) {
  return s.replace(/[.!?。！？…,，;；:：)）」』"”'’\s]+$/g, "").trim();
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

function sentenceUnits(text) {
  const t = String(text || "").trim();
  if (!t) return [];
  const parts = t
    .split(/(?<=[.!?。！？…])\s+|(?<=[.!?。！？…])(?=[^\s])/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [t];
}

function countParensDetailed(text) {
  const s = String(text || "");
  let total = 0,
    glossary = 0,
    narrative = 0;
  const re = /\([^)]+\)|（[^）]+）/g;
  let m;
  while ((m = re.exec(s))) {
    total += 1;
    const before = s.slice(Math.max(0, m.index - 1), m.index);
    if (/[가-힣ㄱ-ㅎㅏ-ㅣ一-龯]/.test(before)) glossary += 1;
    else narrative += 1;
  }
  return { total, glossary, narrative };
}

/** 절 전체를 감싼 장식용 따옴표("…"/「…」) 제거 — 시편 kids 관행 */
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
  if (s.startsWith("「") && s.endsWith("」") && s.length >= 2) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * 장 단위 따옴표 상태머신.
 * @param verseTexts [{n,t}]
 * @param opts.poetryBook 시·애가·아가 — 절 전체 장식 따옴표 제거
 */
function analyzeChapterQuotes(verseTexts, opts = {}) {
  const results = [];
  let openDq = 0;
  let openJq = 0;
  const poetryBook = !!opts.poetryBook;

  for (const { n, t: rawT } of verseTexts) {
    let t = poetryBook ? unwrapDecorativeVerseQuotes(rawT) : String(rawT || "");
    const openAtStart = openDq + openJq > 0;
    // 장 추적 중인데 이어지는 절이 다시 "…"(셀라) 형태로 감싸진 경우:
    // 겉따옴표는 depth 토글에 넣지 않고 내용만 대사로 유지.
    if (openAtStart) {
      const cont = t.match(/^"(.*)"(\s*[（(][^）)]*[）)])?\s*$/s);
      if (cont) t = cont[1] + (cont[2] || "");
      else if (t.startsWith('"') && !t.slice(1).includes('"')) {
        // 열림만 또 있는 이어짐 — 중복 열림 따옴표 제거
        t = t.slice(1);
      }
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

    if (openAtStart) mode = "in";

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
        } else if (ch === "\u201d" || ch === "」") {
          buf += ch;
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
    const openAtEnd = openDq + openJq > 0;
    results.push({
      n,
      t: rawT,
      tUnwrapped: t,
      openAtStart,
      openAtEnd,
      quoteText: quoteParts.join(" "),
      nonQuoteText: nonQuoteParts.join(" "),
    });
  }
  return results;
}

/**
 * 말하기 동사 뒤 대사 추정.
 * - KRV 단서가 있으면 그 절의 비따옴표 본문 중 단서 이후를 estimatedSpeech 로.
 * - 단서 절에서 추정이 열리면, 따옴표가 없고 다음 절들도 서술로 보이면
 *   연속 추정은 같은 장에서 「명시적 닫힘」(또 다른 서술 도입 없이 해요/했다 서술만)까지.
 * 단순 규칙: 단서 매칭 절에서 단서 이후 nonQuote → estimated.
 *   이어서 openEstimated=true 이고 따옴표 depth=0 인 다음 절은,
 *   그 절 nonQuote 전체가 estimated 로 가되,
 *   (a) 새 서술 전환 단서 없이 평서만 이어지면 유지
 *   (b) 명시적 따옴표가 열리면 quote 우선
 *   (c) 최대 연속은 같은 장, 그리고 「여호와께서…가라사대」류 율법·선지 본문은
 *       단서 절 이후 연속 절을 estimated로 유지하되, 다음 SPEECH_CUE 가 나오면 재시작.
 *
 * 더 보수적·명확한 규칙 (이번 집계):
 * 1) 따옴표 안(장 추적) = dialogue
 * 2) 시·애가·아가 책 전체 = poetry (따옴표 안은 dialogue 우선)
 * 3) KRV에 말하기 단서가 있는 절: 단서 이후 nonQuote = estimatedSpeech
 * 4) 단서 절에서 추정이 「열림」이고 닫는 따옴표가 없으면, 이후 절(따옴표 밖)을
 *    다음 말하기 단서 또는 장 끝까지 estimatedSpeech 로 연속
 * 5) 나머지 nonQuote = narrative
 */
function classifyVerseDiscourse({
  bookId,
  quoteText,
  nonQuoteText,
  krvText,
  estimatedOpen,
}) {
  const isPoetryBook = POETRY_BOOKS.has(bookId);
  const isLitBook = LIT_BOOKS.has(bookId); // 시·지혜서
  let estimated = "";
  let narrative = nonQuoteText;
  let dialogue = quoteText;
  let nextEstimatedOpen = estimatedOpen;

  const cueSrc = krvText || nonQuoteText;
  const cueMatch = SPEECH_CUE_RE.exec(cueSrc);

  if (cueMatch) {
    // split nonQuote by approximate position: use kids/target nonQuote with kids cue or whole after first sentence containing speech
    // Prefer: if KRV cue exists, mark from cue end in KRV-aligned way — take nonQuote after last speech-ish phrase in nonQuote
    const kidsCue = SPEECH_CUE_KIDS_RE.exec(nonQuoteText);
    if (kidsCue) {
      const idx = kidsCue.index + kidsCue[0].length;
      narrative = nonQuoteText.slice(0, kidsCue.index).trim();
      estimated = nonQuoteText.slice(idx).trim();
    } else {
      // KRV cue but kids may have already put speech in quotes or rewritten —
      // if nonQuote still has substantial text and no quotes covering it, treat ALL nonQuote after a short intro as estimated when cue in KRV
      // Heuristic: first sentence of nonQuote stays narrative (speech frame), rest estimated
      const units = sentenceUnits(nonQuoteText);
      if (units.length <= 1) {
        // single unit: if it looks like pure speech frame ending with speech verb, narrative only; else estimated
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
    // open continuation if KRV cue and this verse didn't close a quote-block for that speech
    nextEstimatedOpen = true;
  } else if (estimatedOpen && !isLitBook) {
    // continuation of estimated speech (no new cue, still outside quotes)
    // 시·지혜서는 장 연속 추정 금지
    estimated = nonQuoteText;
    narrative = "";
    nextEstimatedOpen = true;
  }

  // 시·지혜서: 따옴표/추정도 시·지혜서 칸으로 통합 (진짜 서술에서 제외)
  let wisdom = "";
  if (isLitBook) {
    wisdom = [dialogue, narrative, estimated].filter(Boolean).join(" ");
    dialogue = "";
    narrative = "";
    estimated = "";
    nextEstimatedOpen = false;
  }

  // closing estimated: if this verse introduced no cue and we had open, keep open
  // close when a clear narrative-only frame without speech content? keep simple: close on new chapter only
  // But if cueMatch and estimated empty and narrative is only frame, still open for next verses
  if (cueMatch && !estimated && !dialogue) {
    nextEstimatedOpen = true;
  }
  // If verse is pure dialogue close and no continuation markers, don't specially close estimated
  // Close estimated when we see a verse that is clearly a new narrative without speech and without prior open from cue —
  // actually user wants 율법 본문 after 가라사대 to stay estimated. Keep open until chapter end or new cue resets.

  // If both estimated empty and we were open but this verse has only narrative frame words — still continuation empty ok

  // Job: dialogues are heavy with quotes sometimes; poetry-like speeches without quotes use cues — ok

  const buckets = {
    dialogue: dialogue.trim(),
    estimatedSpeech: estimated.trim(),
    wisdom: wisdom.trim(),
    narrative: narrative.trim(),
  };

  // primary label for the verse (for sampling)
  let primary = "narrative";
  if (buckets.dialogue && !buckets.narrative && !buckets.estimatedSpeech && !buckets.wisdom)
    primary = "dialogue";
  else if (buckets.wisdom && !buckets.narrative && !buckets.estimatedSpeech)
    primary = "wisdom";
  else if (buckets.estimatedSpeech && !buckets.narrative && !buckets.wisdom)
    primary = "estimatedSpeech";
  else if (buckets.narrative && !buckets.dialogue && !buckets.estimatedSpeech && !buckets.wisdom)
    primary = "narrative";
  else if (
    buckets.dialogue ||
    buckets.estimatedSpeech ||
    buckets.wisdom ||
    buckets.narrative
  ) {
    const order = ["dialogue", "estimatedSpeech", "wisdom", "narrative"];
    primary = order
      .map((k) => [k, buckets[k].length])
      .sort((a, b) => b[1] - a[1])[0][0];
  } else primary = "empty";

  return { buckets, primary, nextEstimatedOpen, hadCue: !!cueMatch };
}

function toneStats(text) {
  const out = emptyTone();
  for (const u of sentenceUnits(text)) {
    const c = classifyEnding(u);
    out[c] += 1;
    out.units += 1;
  }
  return out;
}

function addTone(a, b) {
  for (const k of Object.keys(a)) a[k] += b[k] || 0;
}

function loadBibleData(bookId) {
  return readJson(path.join(root, "public/bible-data", `${bookId}.json`));
}

function loadHebrewPara(bookId) {
  const p = path.join(root, "public/bible-v2", `${bookId}-v2.json`);
  if (!fs.existsSync(p)) return null;
  return readJson(p);
}

function analyzeBook(bookId, mode /* kids|greekKr|hebrewpara */) {
  const byBookTone = emptyTone();
  const byBookBuckets = {
    narrative: 0,
    dialogue: 0,
    estimatedSpeech: 0,
    wisdom: 0,
  };
  const verseRows = [];
  let mixedNarrativeChapters = 0;
  const mixedList = [];
  let parenNarrative = 0;
  let parenGlossary = 0;

  if (mode === "hebrewpara") {
    const v2 = loadHebrewPara(bookId);
    if (!v2) return null;
    const bd = loadBibleData(bookId);
    for (const ch of v2.chapters) {
      const krvCh = bd.chapters.find((c) => c.chapter === ch.chapter);
      const krvMap = new Map(
        (krvCh?.verses?.krv || []).map((v) => [v.n, v.t || ""]),
      );
      const verses = (ch.verses || []).map((v) => ({
        n: v.n,
        t: String(v.copyHebrewpara || ""),
      }));
      const q = analyzeChapterQuotes(verses, {
        poetryBook: POETRY_BOOKS.has(bookId),
      });
      let estOpen = false;
      const chapterNarrativeTones = new Set();
      for (const row of q) {
        const disc = classifyVerseDiscourse({
          bookId,
          quoteText: row.quoteText,
          nonQuoteText: row.nonQuoteText,
          krvText: krvMap.get(row.n) || "",
          estimatedOpen: estOpen && !row.openAtStart,
        });
        // if quote is open from prev, estimated continuation suppressed
        if (row.openAtStart) {
          disc.buckets.estimatedSpeech = "";
          // nonQuote while inside multi-verse quote already in quoteText
        }
        estOpen = disc.nextEstimatedOpen && !row.openAtEnd;
        if (row.openAtEnd) estOpen = false; // quote takes over

        const pc = countParensDetailed(row.t);
        parenGlossary += pc.glossary;
        parenNarrative += pc.narrative;

        for (const [bk, text] of Object.entries(disc.buckets)) {
          if (!text) continue;
          byBookBuckets[bk] += 1; // verse-aspect count later; better count units
        }

        const narrTone = toneStats(disc.buckets.narrative);
        addTone(byBookTone, narrTone);
        if (narrTone.haeyo) chapterNarrativeTones.add("haeyo");
        if (narrTone.haetda || narrTone.hamnida)
          chapterNarrativeTones.add("plain");

        verseRows.push({
          bookId,
          chapter: ch.chapter,
          n: row.n,
          text: row.t,
          primary: disc.primary,
          openAtStart: row.openAtStart,
          openAtEnd: row.openAtEnd,
          buckets: disc.buckets,
          narrativeTone: narrTone,
          paren: pc,
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
  } else {
    const bd = loadBibleData(bookId);
    for (const ch of bd.chapters) {
      const field = mode === "kids" ? "kids" : "greekKr";
      const arr = ch.verses?.[field] || [];
      const krvMap = new Map((ch.verses?.krv || []).map((v) => [v.n, v.t || ""]));
      const verses = arr.map((v) => ({ n: v.n, t: String(v.t || "") }));
      // ensure sorted
      verses.sort((a, b) => a.n - b.n);
      const q = analyzeChapterQuotes(verses, {
        poetryBook: POETRY_BOOKS.has(bookId),
      });
      let estOpen = false;
      const chapterNarrativeTones = new Set();
      for (const row of q) {
        const disc = classifyVerseDiscourse({
          bookId,
          quoteText: row.quoteText,
          nonQuoteText: row.nonQuoteText,
          krvText: krvMap.get(row.n) || "",
          estimatedOpen: estOpen && !row.openAtStart,
        });
        if (row.openAtStart) {
          disc.buckets.estimatedSpeech = "";
        }
        estOpen = disc.nextEstimatedOpen && !row.openAtEnd;
        if (row.openAtEnd) estOpen = false;

        const pc = countParensDetailed(row.t);
        parenGlossary += pc.glossary;
        parenNarrative += pc.narrative;

        const narrTone = toneStats(disc.buckets.narrative);
        addTone(byBookTone, narrTone);
        if (narrTone.haeyo) chapterNarrativeTones.add("haeyo");
        if (narrTone.haetda || narrTone.hamnida)
          chapterNarrativeTones.add("plain");

        // bucket unit counts
        for (const bk of Object.keys(byBookBuckets)) {
          const units = sentenceUnits(disc.buckets[bk] || "");
          byBookBuckets[bk] += units.length;
        }

        verseRows.push({
          bookId,
          chapter: ch.chapter,
          n: row.n,
          text: row.t,
          primary: disc.primary,
          openAtStart: row.openAtStart,
          openAtEnd: row.openAtEnd,
          buckets: disc.buckets,
          narrativeTone: narrTone,
          paren: pc,
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
  }

  // hebrewpara bucket units (fix path that counted verses)
  if (mode === "hebrewpara") {
    byBookBuckets.narrative = 0;
    byBookBuckets.dialogue = 0;
    byBookBuckets.estimatedSpeech = 0;
    byBookBuckets.wisdom = 0;
    for (const row of verseRows) {
      for (const bk of Object.keys(byBookBuckets)) {
        byBookBuckets[bk] += sentenceUnits(row.buckets[bk] || "").length;
      }
    }
  }

  return {
    bookId,
    narrativeTone: byBookTone,
    bucketUnits: byBookBuckets,
    mixedNarrativeChapters,
    mixedList,
    parenGlossary,
    parenNarrative,
    verseRows,
  };
}

function mergeBooks(parts) {
  const tone = emptyTone();
  const buckets = {
    narrative: 0,
    dialogue: 0,
    estimatedSpeech: 0,
    wisdom: 0,
  };
  let mixed = 0;
  const mixedList = [];
  const byBook = {};
  const verseRows = [];
  let parenGlossary = 0;
  let parenNarrative = 0;
  for (const p of parts) {
    if (!p) continue;
    addTone(tone, p.narrativeTone);
    for (const k of Object.keys(buckets)) buckets[k] += p.bucketUnits[k];
    mixed += p.mixedNarrativeChapters;
    mixedList.push(...p.mixedList);
    parenGlossary += p.parenGlossary;
    parenNarrative += p.parenNarrative;
    byBook[p.bookId] = {
      bookKo: BOOK_KO[p.bookId],
      narrativeTone: p.narrativeTone,
      bucketUnits: p.bucketUnits,
      mixedNarrativeChapters: p.mixedNarrativeChapters,
      parenGlossary: p.parenGlossary,
      parenNarrative: p.parenNarrative,
    };
    verseRows.push(...p.verseRows);
  }
  return {
    narrativeTone: tone,
    bucketUnits: buckets,
    mixedNarrativeChapters: mixed,
    mixedList,
    byBook,
    verseRows,
    parenGlossary,
    parenNarrative,
  };
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Rev 18 quote spanning check ───────────────────────────────────────────
function rev18QuoteCheck() {
  const bd = loadBibleData("revelation");
  const ch = bd.chapters.find((c) => c.chapter === 18);
  const verses = (ch.verses.kids || []).map((v) => ({
    n: v.n,
    t: String(v.t || ""),
  }));
  const q = analyzeChapterQuotes(verses);
  const rows = [];
  for (const row of q.filter((r) => r.n >= 1 && r.n <= 12)) {
    rows.push({
      verse: row.n,
      openAtStart: row.openAtStart,
      openAtEnd: row.openAtEnd,
      quotePreview: row.quoteText.slice(0, 60),
      nonQuotePreview: row.nonQuoteText.slice(0, 60),
      inQuote: row.openAtStart || !!row.quoteText.trim(),
      kids: row.t,
    });
  }
  // specifically 2-3 and 4-8
  const span23 = q.filter((r) => r.n >= 2 && r.n <= 3).map((r) => ({
    n: r.n,
    openAtStart: r.openAtStart,
    openAtEnd: r.openAtEnd,
    classifiedAsIn:
      r.n === 2
        ? !!(r.quoteText || r.openAtEnd)
        : r.openAtStart || !!r.quoteText,
    quoteText: r.quoteText,
    nonQuoteText: r.nonQuoteText,
  }));
  const span48 = q.filter((r) => r.n >= 4 && r.n <= 8).map((r) => ({
    n: r.n,
    openAtStart: r.openAtStart,
    openAtEnd: r.openAtEnd,
    classifiedAsIn: r.openAtStart || !!r.quoteText,
    quoteText: r.quoteText,
    nonQuoteText: r.nonQuoteText,
  }));
  return { rows1to12: rows, span23, span48 };
}

// ── empty 11 verdicts ─────────────────────────────────────────────────────
function emptyVerseVerdicts() {
  const items = [
    {
      ref: "psalms 72:20",
      expect: "이새의 아들 다윗의 기도가 필하다",
    },
    { ref: "isaiah 30:2", expect: null },
    { ref: "isaiah 48:2", expect: null },
    { ref: "jeremiah 21:2", expect: null },
    { ref: "ezekiel 24:5", expect: null },
    {
      ref: "acts 8:37",
      expect: "빌립이 가로되 네가 마음을 온전히 하여",
    },
    { ref: "acts 15:26", expect: null },
    {
      ref: "acts 15:34",
      expect: "실라는 저희와 함께 유하기를",
    },
    {
      ref: "acts 28:29",
      expect: "이 말을 한즉 유대인들이",
    },
    { ref: "corinthians2 13:14", expect: null },
    { ref: "revelation 12:18", expect: null },
  ];
  const out = [];
  for (const it of items) {
    const [book, rest] = it.ref.split(" ");
    const [c, n] = rest.split(":").map(Number);
    const bd = loadBibleData(book);
    const ch = bd.chapters.find((x) => x.chapter === c);
    const krv = Object.fromEntries(
      (ch.verses.krv || []).map((v) => [v.n, v.t || ""]),
    );
    const kids = Object.fromEntries(
      (ch.verses.kids || []).map((v) => [v.n, v.t || ""]),
    );
    const prev = krv[n - 1] || "";
    const cur = krv[n] || "";
    const next = krv[n + 1] || "";
    let verdict = "미정";
    let reason = "";
    if (it.expect && prev.includes(it.expect.slice(0, 12))) {
      verdict = "앞 절에 합쳐진 절";
      reason = `기대 문구가 ${c}:${n - 1} KRV 끝에 포함. ${c}:${n} KRV/kids 모두 빈 문자열.`;
    } else if (it.expect && !prev.includes(it.expect.slice(0, 10)) && !cur) {
      verdict = "데이터가 빠진 절";
      reason = `전통 KRV에 있을 법한 문구("${it.expect.slice(0, 20)}…")가 앞·뒷절에 없고 ${c}:${n}만 빈 칸.`;
    } else if (!cur && prev.length > 80 && n === Object.keys(krv).map(Number).sort((a,b)=>a-b).pop()) {
      // last verse empty — often numbering leftover
      verdict = "앞 절에 합쳐진 절(또는 번호만 남은 칸)";
      reason = `장 마지막 빈 칸. 본문은 ${c}:${n - 1}에 있음.`;
    } else if (!cur && prev.length >= (krv[n + 1] || "").length) {
      // heuristic: long previous likely absorbed
      verdict = "앞 절에 합쳐진 절";
      reason = `${c}:${n} KRV/kids 빈 칸. ${c}:${n - 1}이 비정상적으로 길고 내용이 이어짐(합본 정황).`;
    } else {
      verdict = "데이터가 빠진 절";
      reason = `${c}:${n}만 비어 있고 합쳐진 흔적이 분명치 않음.`;
    }
    // special overrides with clearer notes
    if (book === "psalms" && c === 72 && n === 20) {
      verdict = "앞 절에 합쳐진 절";
      reason =
        "KRV 72:19 끝 「…아멘 아멘 이새의 아들 다윗의 기도가 필하다」에 20절 본문이 붙어 있음. 72:20 슬롯은 KRV·kids 모두 ''. (사용자 지적: 개역한글에 20절로 있어야 할 내용이 19에 합쳐진 데이터 오류)";
    }
    if (book === "acts" && c === 8 && n === 37) {
      verdict = "데이터가 빠진 절";
      reason =
        "전통 개역한글 행 8:37(빌립의 신앙 고백 요구)이 8:36·8:38 어디에도 없고 슬롯만 ''. 비잔틴/KRV 계열 절이 누락된 칸.";
    }
    if (book === "acts" && c === 15 && n === 26) {
      verdict = "앞 절에 합쳐진 절";
      reason =
        "KRV 15:25에 「사람을 택하여…바나바와 바울과 함께…가결하였노라」가 들어 있어 전통 26절 내용이 25에 합쳐진 형태. 26은 빈 칸.";
    }
    if (book === "acts" && c === 15 && n === 34) {
      verdict = "데이터가 빠진 절";
      reason =
        "전통 행 15:34(실라 잔류)가 33·35에 없고 빈 칸. (일부 사본/판본 생략 절 — 자리만 남김)";
    }
    if (book === "acts" && c === 28 && n === 29) {
      verdict = "데이터가 빠진 절";
      reason =
        "전통 행 28:29(유대인 변론 후 떠남)가 28·30에 없고 빈 칸.";
    }
    if (book === "corinthians2" && c === 13 && n === 14) {
      verdict = "앞 절에 합쳐진 절(번호 체계)";
      reason =
        "축도 본문이 KRV 13:13에 있고 13:14는 빈 칸. 개역한글은 고후 13장을 13절로 두는 번호(일부 영어 14=우리 13).";
    }
    if (book === "revelation" && c === 12 && n === 18) {
      verdict = "앞 절에 합쳐진 절";
      reason =
        "「바다 모래 위에 섰더라」가 KRV 12:17 끝에 포함. 12:18 슬롯만 빈 칸(일부 판본 번호).";
    }
    if (book === "isaiah" && c === 30 && n === 2) {
      verdict = "앞 절에 합쳐진 절";
      reason =
        "30:1 KRV가 「…애굽의 그늘에 피하려 하여 애굽으로 내려갔으되…죄에 죄를 더하도다」까지 포함 — 전통 30:2 내용이 1절에 합쳐짐.";
    }
    if (book === "isaiah" && c === 48 && n === 2) {
      verdict = "앞 절에 합쳐진 절";
      reason =
        "48:1 KRV 끝에 「…여호와의 이름으로 맹세하며 이스라엘의 하나님을 부르는 너희는 들을지어다」 — 전통 48:2 취지 포함. 2절 슬롯 빈 칸.";
    }
    if (book === "jeremiah" && c === 21 && n === 2) {
      verdict = "앞 절에 합쳐진 절";
      reason =
        "21:1 KRV에 사신 파견+「여호와께 간구하라…떠나리라」요청 본문까지 포함. 전통 21:2가 1에 합쳐짐.";
    }
    if (book === "ezekiel" && c === 24 && n === 5) {
      verdict = "앞 절에 합쳐진 절";
      reason =
        "24:4 KRV가 「…가마속의 뼈가 무르도록 삶을지어다」까지 포함 — 전통 24:5 삶는 지시가 4에 합쳐짐.";
    }

    out.push({
      ref: `${BOOK_KO[book]} ${c}:${n}`,
      bookId: book,
      chapter: c,
      verse: n,
      krvEmpty: !cur.trim(),
      kidsEmpty: !(kids[n] || "").trim(),
      prevKrvTail: prev.slice(-100),
      verdict,
      reason,
    });
  }
  return out;
}

// ── Matthew greekKr gap investigation ─────────────────────────────────────
function matthewGapReport() {
  const bd = loadBibleData("matthew");
  const v2 = readJson(path.join(root, "public/bible-v2/matthew-v2.json"));
  const byCh = [];
  for (const ch of bd.chapters) {
    const gkr = (ch.verses.greekKr || []).filter((v) => (v.t || "").trim());
    const greek = (ch.verses.greek || []).filter((v) => (v.t || "").trim());
    const tok = (ch.verses.greekTokens || []).length;
    const v2ch = v2.chapters.find((c) => c.chapter === ch.chapter);
    const copyKr = (v2ch?.verses || []).filter((v) =>
      String(v.copyKr || "").trim(),
    ).length;
    byCh.push({
      chapter: ch.chapter,
      bibleData_greekKr: gkr.length,
      bibleData_greek: greek.length,
      bibleData_greekTokens: tok,
      bibleV2_copyKr: copyKr,
    });
  }
  const importPath = "scripts/import-matthew-chapter.mjs";
  const importExists = fs.existsSync(path.join(root, importPath));
  return {
    summary:
      "bible-data 마태 greekKr는 1장(25절)만 채움. bible-v2 copyKr는 1–28장 전부 채워져 있음. study chunks greekpara 2–28은 빈 파일.",
    byCh,
    cause: [
      "헬라 의역 본문은 책별 import-*-chapter.mjs / import-bible-greek-content-*.mjs 로 bible-data.verses.greekKr 에 기록되는 구조.",
      "scripts/import-matthew-chapter.mjs 는 CONTENT에 2–28장이 있으나 출력 경로가 app/bible-reading/matthew.json (구경로)이라, public/bible-data/matthew.json 으로 이전된 뒤에는 재실행·동기화가 안 된 것으로 보임.",
      "build-matthew-v2 / build-gospel-v2 는 이미 있는 greekKr(또는 우선 소스)로 copyKr를 채움 — v2에는 28장 copyKr가 있어, 한때 구경로 matthew.json 에는 2–28이 있었거나 v2가 별도 소스로 채워짐.",
      "scripts/build-greek-krvko.mjs 는 lexicon krvKo(단어 뜻) 생성기이며 greekKr 절 의역을 만들지 않음.",
    ],
    planWithoutExternalAPI: [
      "1) (승인 후) public/bible-v2/matthew-v2.json 의 copyKr 를 public/bible-data/matthew.json verses.greekKr 로 동기화하는 새 스크립트 scripts/versions-sync-matthew-greekkr-from-v2.mjs 작성 — 기존 파일 덮어쓰기 대신 bible-greekpara-v2 또는 명시적 승인 하에 bible-data 갱신.",
      "2) 또는 import-matthew-chapter.mjs 의 bookPath 를 public/bible-data/matthew.json 으로 바꾼 뒤 CONTENT(2–28) 재임포트(역시 승인 필요). v2 copyKr와 문구가 다를 수 있으니 diff 검수.",
      "3) build-bible-study.mjs / split-bible-chunks.mjs 로 greekpara·korean 청크 재생성.",
      "4) build-greek-krvko.mjs 로는 불가 — 계획에서 제외. 입력 자료(SBLGNT/v2 tokens) 문제는 아님; 의역 텍스트는 v2에 이미 존재.",
    ],
    importMatthewPath: importPath,
    importExists,
  };
}

function webCacheReport() {
  const webDir = path.join(root, ".cache/web");
  const webUsfm = path.join(root, ".cache/web-usfm");
  const gi = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
  return {
    cacheWebExists: fs.existsSync(webDir),
    cacheWebUsfmExists: fs.existsSync(webUsfm),
    gitignoreCachesAll: /^\.cache\//m.test(gi) || /\.cache\//.test(gi),
    reason: [
      ".gitignore 가 `.cache/` 전체를 무시하므로 .cache/web 은 저장소에 커밋되지 않음.",
      "현재 워크스페이스에 .cache/web 디렉터리 자체가 없음(미생성·삭제·다른 머신에서 안 받음).",
      "대신 .cache/web-usfm/ (USFM 원천)과 런타임용 public/bible-study/chunks/.../english.json 은 존재.",
      "scripts/fetch-web-english.mjs 는 TehShrike/world-english-bible GitHub raw JSON을 받아 .cache/web/<bookId>.json 으로 저장하도록 작성됨 — 네트워크만 되면 재수신 가능.",
      "재수신 명령(실행하지 않음): node scripts/fetch-web-english.mjs   또는 --ot / --nt / --only=genesis",
    ],
    canRefetchWithoutInstall: true,
    note: "이번 작업에서는 fetch 실행하지 않음.",
  };
}

// ── 해요체 후보 변환 규칙 ────────────────────────────────────────────────
function proposeHaeyo(unit) {
  const raw = String(unit || "").trim();
  const punct = (raw.match(/[.!?。！？…]*$/) || [""])[0];
  const core = raw.slice(0, raw.length - punct.length);
  const s = core.trim();
  if (!s) return null;

  // 고전·기도체 → 검토
  if (/(?:느니라|도다|리로다|이로다|리이다|시리이다|나이다|옵나이다|할지어다|일지어다|지어다|로다)$/.test(s)) {
    return {
      candidate: null,
      rule: "haetda_nida_classical",
      review: true,
      reason: "고전·기도 종결",
    };
  }

  const rules = [
    { name: "hamnida_seumnida", re: /습니다$/, to: (x) => x.replace(/습니다$/, "어요") },
    { name: "hamnida_imnida", re: /입니다$/, to: (x) => x.replace(/입니다$/, "이에요") },
    { name: "hamnida_hamnida", re: /합니다$/, to: (x) => x.replace(/합니다$/, "해요") },
    { name: "hamnida_doemnida", re: /됩니다$/, to: (x) => x.replace(/됩니다$/, "돼요") },
    { name: "hamnida_seumnikka", re: /습니까$/, to: (x) => x.replace(/습니까$/, "어요?") },
    { name: "haetda_getda", re: /겠다$/, to: (x) => x.replace(/겠다$/, "겠어요") },
    { name: "haetda_eotda", re: /었다$/, to: (x) => x.replace(/었다$/, "었어요") },
    { name: "haetda_atda", re: /았다$/, to: (x) => x.replace(/았다$/, "았어요") },
    { name: "haetda_yeotda", re: /였다$/, to: (x) => x.replace(/였다$/, "였어요") },
    { name: "haetda_syeotda", re: /셨다$/, to: (x) => x.replace(/셨다$/, "셨어요") },
    { name: "haetda_haetda", re: /했다$/, to: (x) => x.replace(/했다$/, "했어요") },
    { name: "haetda_doeeotda", re: /되었다$/, to: (x) => x.replace(/되었다$/, "되었어요") },
    { name: "haetda_doeeotda2", re: /됐다$/, to: (x) => x.replace(/됐다$/, "됐어요") },
    { name: "haetda_geosida", re: /것이다$/, to: (x) => x.replace(/것이다$/, "거예요") },
    { name: "haetda_ida", re: /아니다$/, to: (x) => x.replace(/아니다$/, "아니에요") },
    // 「이다」만 — 자·몫·띠 등 명사+이다는 이에요, 단 한 글자 체언은 검토
    {
      name: "haetda_ida2",
      re: /이다$/,
      to: (x) => x.replace(/이다$/, "이에요"),
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
    const next = rule.to(s) + (punct || ".");
    return { candidate: next, rule: rule.name, review: false };
  }

  // 일반 ~다 (단위·목록·측정 「자다」 등 제외)
  if (/다$/.test(s)) {
    if (/[\"'「『]/.test(s)) {
      return { candidate: null, rule: "haetda_da_generic", review: true, reason: "인용 의심" };
    }
    if (/(?:자|척|큐빗)다$/.test(s) || s.length <= 3) {
      return { candidate: null, rule: "haetda_da_generic", review: true, reason: "단위·과단" };
    }
    if (/(?:고|며)$/.test(s.slice(0, -1))) {
      return { candidate: null, rule: "haetda_da_generic", review: true, reason: "연결 의심" };
    }
    // 「할 것이다」류는 위에서 처리. 남은 ~다 → ~요 는 검토로
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
  if ((verseNarrativeTone.haeyo > 0) && (verseNarrativeTone.haetda > 0 || verseNarrativeTone.hamnida > 0))
    reasons.push("절내_말투_혼합");
  if (/,\s*$/.test(unit.trim()) || /(?:고|며|요|으며)\s*$/.test(stripTrailingPunct(unit)))
    reasons.push("목록·미종결_의심");
  return reasons;
}

// ── main ──────────────────────────────────────────────────────────────────
const kidsParts = [];
for (const bookId of BOOK_ORDER) {
  kidsParts.push(analyzeBook(bookId, "kids"));
}
const kids = mergeBooks(kidsParts);

const v2ref = {
  wrongTone: 1193,
  mixedChapters: 28,
  note: "2차: 시·애가·아가만 시·기도, 잠언·전도·욥은 서술에 포함",
};
const v3wrong = kids.narrativeTone.haetda + kids.narrativeTone.hamnida;

// ── haeyo candidates (true narrative only) ───────────────────────────────
const candidates = [];
const needsReview = [];
const ruleCounts = {};

for (const row of kids.verseRows) {
  if (row.primary !== "narrative") continue;
  const narr = row.buckets.narrative || "";
  if (!narr.trim()) continue;
  // skip wisdom/dialogue/estimated by primary already; also skip if lit book
  if (LIT_BOOKS.has(row.bookId)) continue;

  const units = sentenceUnits(narr);
  const toneClassesInVerse = new Set(
    units.map((u) => classifyEnding(u)).filter((c) => c === "haeyo" || c === "haetda" || c === "hamnida"),
  );
  const multiTone = toneClassesInVerse.size > 1;

  for (const unit of units) {
    const cls = classifyEnding(unit);
    if (cls !== "haetda" && cls !== "hamnida") continue;

    const prop = proposeHaeyo(unit);
    const reviewReasons = needsReviewUnit(unit, row.narrativeTone);
    if (multiTone) reviewReasons.push("절내_말투_둘이상");
    if (!prop) {
      needsReview.push({
        ref: `${BOOK_KO[row.bookId]} ${row.chapter}:${row.n}`,
        now: unit,
        candidate: null,
        rule: "no_rule",
        reviewReasons,
      });
      continue;
    }
    ruleCounts[prop.rule] = (ruleCounts[prop.rule] || 0) + 1;
    const entry = {
      ref: `${BOOK_KO[row.bookId]} ${row.chapter}:${row.n}`,
      now: unit,
      candidate: prop.candidate,
      rule: prop.rule,
      reviewReasons: prop.review
        ? [...reviewReasons, prop.reason || "규칙_불확신"]
        : reviewReasons,
    };
    if (prop.review || reviewReasons.length) {
      needsReview.push(entry);
    } else {
      candidates.push(entry);
    }
  }
}

const rand = mulberry32(20261110);
const sample30 = [];
const used = new Set();
while (sample30.length < 30 && used.size < candidates.length) {
  const i = Math.floor(rand() * candidates.length);
  if (used.has(i)) continue;
  used.add(i);
  sample30.push(candidates[i]);
}

const haeyoDoc = {
  generatedAt: new Date().toISOString(),
  agent: 5,
  round: 3,
  scope:
    "진짜 서술만. 대사·대사추정·시·지혜서(시편·애가·아가·욥·잠언·전도) 제외. 원본 미수정.",
  totals: {
    candidates: candidates.length,
    needsReview: needsReview.length,
    byRule: ruleCounts,
  },
  candidates,
  needsReview,
  random30: sample30,
};
fs.writeFileSync(
  path.join(OUT, "kids-haeyo-candidates.json"),
  JSON.stringify(haeyoDoc, null, 2),
);

// ── 서술 괄호: 담화 칸별 재집계 ──────────────────────────────────────────
const parenByBucket = {
  narrative: { count: 0, samples: [] },
  dialogue: { count: 0, samples: [] },
  estimatedSpeech: { count: 0, samples: [] },
  wisdom: { count: 0, samples: [] },
};
function collectParenInText(text, bucket, ref, full) {
  const re = /\([^)]+\)|（[^）]+）/g;
  let m;
  while ((m = re.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 1), m.index);
    const glossary = /[가-힣ㄱ-ㅎㅏ-ㅣ一-龯]/.test(before);
    if (glossary) continue; // 뜻풀이 유지 — 서술 삽입만
    parenByBucket[bucket].count += 1;
    if (parenByBucket[bucket].samples.length < 40) {
      parenByBucket[bucket].samples.push({
        ref,
        paren: m[0],
        bucket,
        context: text.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20),
        verse: full.slice(0, 100),
      });
    }
  }
}
for (const row of kids.verseRows) {
  const ref = `${BOOK_KO[row.bookId]} ${row.chapter}:${row.n}`;
  for (const bk of ["narrative", "dialogue", "estimatedSpeech", "wisdom"]) {
    const t = row.buckets[bk] || "";
    if (t) collectParenInText(t, bk, ref, row.text || "");
  }
}
const narrParenSamples = parenByBucket.narrative.samples.slice();
const rand2 = mulberry32(20261111);
const paren20 = [];
const usedP = new Set();
while (paren20.length < 20 && usedP.size < narrParenSamples.length) {
  const i = Math.floor(rand2() * narrParenSamples.length);
  if (usedP.has(i)) continue;
  usedP.add(i);
  paren20.push(narrParenSamples[i]);
}

// ── blank verses ─────────────────────────────────────────────────────────
const blankVerses = {
  generatedAt: new Date().toISOString(),
  agent: 5,
  note: "에이전트 1 전달용. public/bible-data 기준 KRV·kids 모두 빈 칸.",
  originallyAbsent: [
    {
      ref: "사도행전 8:37",
      bookId: "acts",
      chapter: 8,
      verse: 37,
      reason: "전통 KRV 서방 본문 절이 데이터에 없고 슬롯만 빈 칸(앞·뒷절에 내용 없음)",
    },
    {
      ref: "사도행전 15:34",
      bookId: "acts",
      chapter: 15,
      verse: 34,
      reason: "전통 실라 잔류 절이 33·35에 없고 빈 슬롯",
    },
    {
      ref: "사도행전 28:29",
      bookId: "acts",
      chapter: 28,
      verse: 29,
      reason: "전통 유대인 변론·떠남 절이 28·30에 없고 빈 슬롯",
    },
  ],
  mergedIntoPrevious: [
    {
      ref: "시편 72:20",
      bookId: "psalms",
      chapter: 72,
      verse: 20,
      mergedInto: "72:19",
      reason: "「이새의 아들 다윗의 기도가 필하다」가 72:19 끝에 합쳐짐",
    },
    {
      ref: "이사야 30:2",
      bookId: "isaiah",
      chapter: 30,
      verse: 2,
      mergedInto: "30:1",
      reason: "애굽 피함·죄 더함 내용이 30:1에 포함",
    },
    {
      ref: "이사야 48:2",
      bookId: "isaiah",
      chapter: 48,
      verse: 2,
      mergedInto: "48:1",
      reason: "맹세·호칭 내용이 48:1에 포함",
    },
    {
      ref: "예레미야 21:2",
      bookId: "jeremiah",
      chapter: 21,
      verse: 2,
      mergedInto: "21:1",
      reason: "간구 요청 본문이 21:1에 포함",
    },
    {
      ref: "에스겔 24:5",
      bookId: "ezekiel",
      chapter: 24,
      verse: 5,
      mergedInto: "24:4",
      reason: "삶는 지시가 24:4에 포함",
    },
    {
      ref: "사도행전 15:26",
      bookId: "acts",
      chapter: 15,
      verse: 26,
      mergedInto: "15:25",
      reason: "바나바·바울 파송 내용이 15:25에 포함",
    },
    {
      ref: "고린도후서 13:14",
      bookId: "corinthians2",
      chapter: 13,
      verse: 14,
      mergedInto: "13:13",
      reason: "축도가 13:13에 있음(개역 13절 번호 체계)",
    },
    {
      ref: "요한계시록 12:18",
      bookId: "revelation",
      chapter: 12,
      verse: 18,
      mergedInto: "12:17",
      reason: "바다 모래 위에 섰다 내용이 12:17 끝에 포함",
    },
  ],
};
fs.writeFileSync(
  path.join(OUT, "blank-verses.json"),
  JSON.stringify(blankVerses, null, 2),
);

const report = {
  generatedAt: new Date().toISOString(),
  agent: 5,
  round: 3,
  kids: {
    bucketUnits: kids.bucketUnits,
    trueNarrativeTone: kids.narrativeTone,
    mixedNarrativeChapters: kids.mixedNarrativeChapters,
    mixedSample: kids.mixedList.slice(0, 30),
    comparisonToV2: {
      v2_wrongToneInTrueNarrative: v2ref.wrongTone,
      v3_wrongToneInTrueNarrative: v3wrong,
      delta_wrongTone: v3wrong - v2ref.wrongTone,
      v2_mixedNarrativeChapters: v2ref.mixedChapters,
      v3_mixedNarrativeChapters: kids.mixedNarrativeChapters,
      delta_mixed: kids.mixedNarrativeChapters - v2ref.mixedChapters,
      change: "잠언·전도서·욥기 → 시·지혜서(wisdom) 칸",
    },
    byBook: kids.byBook,
  },
  haeyoCandidates: {
    candidates: candidates.length,
    needsReview: needsReview.length,
    byRule: ruleCounts,
    random30: sample30,
  },
  narrativeParens: {
    byBucket: {
      narrative: parenByBucket.narrative.count,
      dialogue: parenByBucket.dialogue.count,
      estimatedSpeech: parenByBucket.estimatedSpeech.count,
      wisdom: parenByBucket.wisdom.count,
      total:
        parenByBucket.narrative.count +
        parenByBucket.dialogue.count +
        parenByBucket.estimatedSpeech.count +
        parenByBucket.wisdom.count,
    },
    note: "뜻풀이형 단어(설명) 제외, 서술 삽입 괄호만",
    trueNarrativeSamples20: paren20,
  },
  blankVersesSummary: {
    originallyAbsent: blankVerses.originallyAbsent.length,
    mergedIntoPrevious: blankVerses.mergedIntoPrevious.length,
  },
};

fs.writeFileSync(
  path.join(OUT, "v3-report.json"),
  JSON.stringify(report, null, 2),
);
fs.writeFileSync(
  path.join(OUT, "v3-kids-by-book.json"),
  JSON.stringify(kids.byBook, null, 2),
);
fs.writeFileSync(
  path.join(OUT, "v3-narrative-parens.json"),
  JSON.stringify(
    { byBucket: report.narrativeParens.byBucket, samples20: paren20 },
    null,
    2,
  ),
);

console.log(
  JSON.stringify(
    {
      kidsNarrativeTone: kids.narrativeTone,
      kidsBuckets: kids.bucketUnits,
      kidsMixed: kids.mixedNarrativeChapters,
      comparisonToV2: report.kids.comparisonToV2,
      haeyo: report.haeyoCandidates,
      parens: report.narrativeParens.byBucket,
      blank: report.blankVersesSummary,
      sample30preview: sample30.slice(0, 5).map((x) => `${x.ref}: ${x.now} → ${x.candidate} [${x.rule}]`),
      paren20preview: paren20.slice(0, 5),
    },
    null,
    2,
  ),
);
