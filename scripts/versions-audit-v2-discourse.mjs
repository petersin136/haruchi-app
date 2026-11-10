#!/usr/bin/env node
/**
 * 에이전트 5 — 2차 조사: 담화 유형 분리 집계 (읽기 전용)
 * - 장 단위 따옴표 추적
 * - 말하기 동사 뒤 「대사 추정」
 * - 시·애가·기도 별도
 * - 「진짜 서술」만 말투 집계
 *
 *   node scripts/versions-audit-v2-discourse.mjs
 * 출력: .cache/versions/v2-*
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

/** 시·애가·기도(사람이 하나님께 드리는 글) 책 — 절 단위로 poetry 칸 */
const POETRY_BOOKS = new Set(["psalms", "lamentations", "songofsolomon"]);

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
  } else if (estimatedOpen && !isPoetryBook) {
    // continuation of estimated speech (no new cue, still outside quotes)
    // 시·애가·아가는 장식 따옴표/기도문 위주라 장 연속 추정 금지
    estimated = nonQuoteText;
    narrative = "";
    nextEstimatedOpen = true;
  }

  // poetry book: 시·애가·아가는 따옴표/추정도 기도·시 칸으로 통합
  // (화자 대사는 「대화」가 아니라 시·기도 문체로 취급)
  let poetry = "";
  if (isPoetryBook) {
    poetry = [dialogue, narrative, estimated].filter(Boolean).join(" ");
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
    poetry: poetry.trim(),
    narrative: narrative.trim(),
  };

  // primary label for the verse (for sampling)
  let primary = "narrative";
  if (buckets.dialogue && !buckets.narrative && !buckets.estimatedSpeech && !buckets.poetry)
    primary = "dialogue";
  else if (buckets.poetry && !buckets.narrative && !buckets.estimatedSpeech)
    primary = "poetry";
  else if (buckets.estimatedSpeech && !buckets.narrative && !buckets.poetry)
    primary = "estimatedSpeech";
  else if (buckets.narrative && !buckets.dialogue && !buckets.estimatedSpeech && !buckets.poetry)
    primary = "narrative";
  else if (
    buckets.dialogue ||
    buckets.estimatedSpeech ||
    buckets.poetry ||
    buckets.narrative
  ) {
    // mixed verse — primary = largest non-empty by length preference narrative last
    const order = ["dialogue", "estimatedSpeech", "poetry", "narrative"];
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
    poetry: 0,
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
    byBookBuckets.poetry = 0;
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
    poetry: 0,
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

// ── main ──────────────────────────────────────────────────────────────────
const kidsParts = [];
const greekParts = [];
const hebParts = [];

for (const bookId of BOOK_ORDER) {
  kidsParts.push(analyzeBook(bookId, "kids"));
  if (NT.has(bookId)) greekParts.push(analyzeBook(bookId, "greekKr"));
  if (OT.has(bookId)) hebParts.push(analyzeBook(bookId, "hebrewpara"));
}

const kids = mergeBooks(kidsParts);
const greek = mergeBooks(greekParts);
const hebrew = mergeBooks(hebParts);

const rev18 = rev18QuoteCheck();
const empties = emptyVerseVerdicts();
const matthewGap = matthewGapReport();
const webCache = webCacheReport();

// previous random 20 reclassify
const PREV20 = [
  ["psalms", 66, 14],
  ["psalms", 40, 1],
  ["ezekiel", 20, 28],
  ["samuel1", 16, 16],
  ["chronicles1", 25, 5],
  ["exodus", 34, 24],
  ["leviticus", 27, 14],
  ["exodus", 3, 21],
  ["zechariah", 5, 11],
  ["psalms", 33, 15],
  ["leviticus", 20, 7],
  ["psalms", 128, 5],
  ["psalms", 22, 13],
  ["songofsolomon", 5, 8],
  ["ezekiel", 20, 15],
  ["psalms", 37, 31],
  ["deuteronomy", 5, 25],
  ["numbers", 26, 48],
  ["psalms", 80, 12],
  ["psalms", 118, 9],
];

function findVerse(rows, bookId, c, n) {
  return rows.find((r) => r.bookId === bookId && r.chapter === c && r.n === n);
}

const prev20reclass = PREV20.map(([bookId, c, n]) => {
  const row = findVerse(kids.verseRows, bookId, c, n);
  const bd = loadBibleData(bookId);
  const ch = bd.chapters.find((x) => x.chapter === c);
  const krv = (ch.verses.krv || []).find((v) => v.n === n)?.t || "";
  const kidsT = (ch.verses.kids || []).find((v) => v.n === n)?.t || "";
  return {
    ref: `${BOOK_KO[bookId]} ${c}:${n}`,
    primary: row?.primary || "?",
    openAtStart: row?.openAtStart,
    narrativeLen: (row?.buckets.narrative || "").length,
    dialogueLen: (row?.buckets.dialogue || "").length,
    estimatedLen: (row?.buckets.estimatedSpeech || "").length,
    poetryLen: (row?.buckets.poetry || "").length,
    narrativeToneEnd: row
      ? classifyEnding(
          sentenceUnits(row.buckets.narrative).slice(-1)[0] || "",
        )
      : null,
    krv,
    kids: kidsT,
  };
});

// new random 20 from true narrative only (narrative bucket non-empty, primary narrative or has narrative tone units)
const narrPool = kids.verseRows.filter((r) => {
  if (r.primary !== "narrative") return false;
  const t = (r.buckets.narrative || "").trim();
  if (!t) return false;
  const tone = r.narrativeTone;
  // prefer problematic narrative tones
  return tone.haetda > 0 || tone.hamnida > 0 || tone.other > 0;
});
const rand = mulberry32(20261110);
const picks = [];
const used = new Set();
while (picks.length < 20 && used.size < narrPool.length) {
  const i = Math.floor(rand() * narrPool.length);
  if (used.has(i)) continue;
  used.add(i);
  const r = narrPool[i];
  const bd = loadBibleData(r.bookId);
  const ch = bd.chapters.find((x) => x.chapter === r.chapter);
  const krv = (ch.verses.krv || []).find((v) => v.n === r.n)?.t || "";
  const problems = [];
  if (r.narrativeTone.haetda) problems.push("서술-했다체");
  if (r.narrativeTone.hamnida) problems.push("서술-합니다체");
  if (r.narrativeTone.other) problems.push("서술-기타");
  if (r.paren.narrative) problems.push("서술괄호");
  if (r.narrativeTone.haeyo && (r.narrativeTone.haetda || r.narrativeTone.hamnida))
    problems.push("서술내혼합");
  picks.push({
    ref: `${BOOK_KO[r.bookId]} ${r.chapter}:${r.n}`,
    krv,
    kids: r.text,
    narrativeOnly: r.buckets.narrative,
    problems: problems.join(" · ") || "서술-해요",
    primary: r.primary,
  });
}

// comparison with v1
const v1 = {
  wrongToneOutsideApprox: 7850,
  mixedChapters: 386,
  note: "1차: 절 단위 따옴표(장 미추적), 따옴표밖 전부 서술로 간주",
};
const v2kidsWrong =
  kids.narrativeTone.haetda + kids.narrativeTone.hamnida;

const report = {
  generatedAt: new Date().toISOString(),
  agent: 5,
  round: 2,
  targetTonePolicy: {
    kids: "서술=해요체 / 대사=화자에 맞게 / 시·기도=합니다체 허용 / 뜻풀이괄호 유지·서술괄호만 정리",
    greekKr: "합니다체 기본(참고)",
    hebrewpara: "합니다체 기본(참고)",
  },
  rev18QuoteSpan: rev18,
  kids: {
    bucketUnits: kids.bucketUnits,
    trueNarrativeTone: kids.narrativeTone,
    mixedNarrativeChapters: kids.mixedNarrativeChapters,
    mixedSample: kids.mixedList.slice(0, 40),
    parenGlossary: kids.parenGlossary,
    parenNarrative: kids.parenNarrative,
    byBook: kids.byBook,
    comparisonToV1: {
      v1_wrongToneOutside: v1.wrongToneOutsideApprox,
      v2_wrongToneInTrueNarrative: v2kidsWrong,
      delta_wrongTone: v2kidsWrong - v1.wrongToneOutsideApprox,
      v1_mixedChapters: v1.mixedChapters,
      v2_mixedNarrativeChapters: kids.mixedNarrativeChapters,
      delta_mixed: kids.mixedNarrativeChapters - v1.mixedChapters,
    },
  },
  greekKr: {
    bucketUnits: greek.bucketUnits,
    trueNarrativeTone: greek.narrativeTone,
    mixedNarrativeChapters: greek.mixedNarrativeChapters,
    mixedSample: greek.mixedList.slice(0, 20),
    parenGlossary: greek.parenGlossary,
    parenNarrative: greek.parenNarrative,
    byBook: greek.byBook,
  },
  hebrewpara: {
    bucketUnits: hebrew.bucketUnits,
    trueNarrativeTone: hebrew.narrativeTone,
    mixedNarrativeChapters: hebrew.mixedNarrativeChapters,
    mixedSample: hebrew.mixedList.slice(0, 20),
    parenGlossary: hebrew.parenGlossary,
    parenNarrative: hebrew.parenNarrative,
    byBook: hebrew.byBook,
  },
  prev20reclass,
  newRandom20fromNarrative: picks,
  empty11: empties,
  matthewGreekKrGap: matthewGap,
  webCache,
};

fs.writeFileSync(
  path.join(OUT, "v2-discourse-report.json"),
  JSON.stringify(report, null, 2),
);
fs.writeFileSync(
  path.join(OUT, "v2-kids-by-book.json"),
  JSON.stringify(kids.byBook, null, 2),
);
fs.writeFileSync(
  path.join(OUT, "v2-greek-by-book.json"),
  JSON.stringify(greek.byBook, null, 2),
);
fs.writeFileSync(
  path.join(OUT, "v2-hebrew-by-book.json"),
  JSON.stringify(hebrew.byBook, null, 2),
);
fs.writeFileSync(
  path.join(OUT, "v2-rev18-quote-span.json"),
  JSON.stringify(rev18, null, 2),
);
fs.writeFileSync(
  path.join(OUT, "v2-empty11.json"),
  JSON.stringify(empties, null, 2),
);
fs.writeFileSync(
  path.join(OUT, "v2-prev20-reclass.json"),
  JSON.stringify(prev20reclass, null, 2),
);
fs.writeFileSync(
  path.join(OUT, "v2-random20-narrative.json"),
  JSON.stringify(picks, null, 2),
);
fs.writeFileSync(
  path.join(OUT, "v2-matthew-gap.json"),
  JSON.stringify(matthewGap, null, 2),
);
fs.writeFileSync(
  path.join(OUT, "v2-web-cache.json"),
  JSON.stringify(webCache, null, 2),
);

console.log(
  JSON.stringify(
    {
      kidsNarrativeTone: kids.narrativeTone,
      kidsBuckets: kids.bucketUnits,
      kidsMixed: kids.mixedNarrativeChapters,
      comparison: report.kids.comparisonToV1,
      greekNarrativeTone: greek.narrativeTone,
      greekBuckets: greek.bucketUnits,
      greekMixed: greek.mixedNarrativeChapters,
      hebrewNarrativeTone: hebrew.narrativeTone,
      hebrewBuckets: hebrew.bucketUnits,
      hebrewMixed: hebrew.mixedNarrativeChapters,
      rev18_2_3: rev18.span23.map((x) => `${x.n}:in=${x.classifiedAsIn}:openS=${x.openAtStart}:openE=${x.openAtEnd}`),
      rev18_4_8: rev18.span48.map((x) => `${x.n}:in=${x.classifiedAsIn}:openS=${x.openAtStart}:openE=${x.openAtEnd}`),
      emptyVerdicts: empties.map((e) => `${e.ref}: ${e.verdict}`),
      web: { exists: webCache.cacheWebExists, canRefetch: webCache.canRefetchWithoutInstall },
    },
    null,
    2,
  ),
);
