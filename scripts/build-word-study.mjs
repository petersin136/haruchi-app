#!/usr/bin/env node
/**
 * 요한일서 원어 단어 연구 데이터 빌드.
 *
 * 입력 (프로젝트 우선, 없으면 .cache 다운로드):
 *   - public/bible-v2/chapters/*  (MorphGNT/SBLGNT 토큰; CC BY-SA 4.0 / CC BY 4.0)
 *   - .cache/strongs-greek/strong-el.json  (또는 strongsgreek.xml)
 *   - data/keyword-notes/greek.json       (있으면 병합; Agent 4)
 *   - scripts/lib/greek-pron.mjs          (에라스무스식 한글)
 *
 * 출력 (신규 폴더만):
 *   - public/word-study/john1/{장}.json
 *   - public/word-study/lexicon/greek/{strong}.json
 *
 * 설치·커밋·기존 파일 수정 금지.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookupPron, stripDiacritics } from "./lib/greek-pron.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const SRC_ROOT = path.join(repoRoot, "public", "bible-v2", "chapters");
const OUT_BOOK = path.join(repoRoot, "public", "word-study", "john1");
const OUT_LEX = path.join(repoRoot, "public", "word-study", "lexicon", "greek");
const GREEK_CACHE = path.join(repoRoot, ".cache", "strongs-greek", "strong-el.json");
const GREEK_XML = path.join(repoRoot, ".cache", "strongs-greek", "strongsgreek.xml");
const NOTES_PATH = path.join(repoRoot, "data", "keyword-notes", "greek.json");

const BOOK_ID = "john1";
const DEF_EN_MAX = 160;
const FAMILY_MAX = 6;
const PHRASE_MIN_COUNT = 3;
const PHRASE_MAX = 5;
const PHRASE_REFS_MAX = 12;

/** MorphGNT lemma → Strong 표제어 정규화 (디포넌트·이형태) */
const LEMMA_ALIASES = new Map([
  ["οἶδα", "εἴδω"],
  ["φοβέομαι", "φοβέω"],
  ["ἐπαγγέλλομαι", "ἐπαγγέλλω"],
  ["οὕτω(ς)", "οὕτω"],
  ["οὕτως", "οὕτω"],
]);

const GREEK_BOOKS = [
  "matthew", "mark", "luke", "john", "acts",
  "romans", "corinthians1", "corinthians2", "galatians", "ephesians",
  "philippians", "colossians", "thessalonians1", "thessalonians2",
  "timothy1", "timothy2", "titus", "philemon", "hebrews",
  "james", "peter1", "peter2", "john1", "john2", "john3", "jude", "revelation",
];

function clip(s, n) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1).trimEnd() + "…";
}

function padStrongNum(n) {
  const digits = String(n).replace(/\D/g, "");
  return digits.replace(/^0+/, "") || "0";
}

/** G02222 / G2222 / 2222 → G2222 */
function normStrong(id) {
  if (id == null || id === "") return "";
  const m = String(id).match(/(\d+)/);
  if (!m) return "";
  return `G${padStrongNum(m[1])}`;
}

function ensureGreekLexicon() {
  if (fs.existsSync(GREEK_CACHE)) {
    return JSON.parse(fs.readFileSync(GREEK_CACHE, "utf8"));
  }
  if (!fs.existsSync(GREEK_XML)) {
    throw new Error(
      `Strong's Greek 없음: ${GREEK_CACHE} 또는 ${GREEK_XML}\n` +
        "공개 자료(Open Scriptures strongsgreek.xml, public domain)를 .cache/strongs-greek/ 에 두세요.",
    );
  }
  const xml = fs.readFileSync(GREEK_XML, "utf8");
  const entryRe = /<entry\b[^>]*\bstrongs="(\d+)"[^>]*>([\s\S]*?)<\/entry>/g;
  const out = {};
  let m;
  while ((m = entryRe.exec(xml)) !== null) {
    const id = `G${m[1]}`;
    const body = m[2];
    const greek =
      body.match(/<greek\b[^>]*\bunicode="([^"]+)"/)?.[1] || "";
    const pron =
      body.match(/<pronunciation\b[^>]*\bstrongs="([^"]+)"/)?.[1] || "";
    const defRaw =
      body.match(/<strongs_def>([\s\S]*?)<\/strongs_def>/)?.[1] ||
      body.match(/<kjv_def>([\s\S]*?)<\/kjv_def>/)?.[1] ||
      "";
    const defEn = clip(
      defRaw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      DEF_EN_MAX,
    );
    const der = body.match(/<strongs_derivation>([\s\S]*?)<\/strongs_derivation>/)?.[1] || "";
    const rootMatch = der.match(/strongs="(\d+)"/);
    const rootStrong = rootMatch ? `G${rootMatch[1]}` : null;
    out[id] = { word: greek, xlit: "", pronEn: pron, rootStrong, defEn, usage: "" };
  }
  fs.mkdirSync(path.dirname(GREEK_CACHE), { recursive: true });
  fs.writeFileSync(GREEK_CACHE, JSON.stringify(out));
  console.log(`[lexicon] Greek ${Object.keys(out).length} → ${GREEK_CACHE}`);
  return out;
}

function loadNotes() {
  if (!fs.existsSync(NOTES_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(NOTES_PATH, "utf8"));
  } catch {
    return {};
  }
}

/** strong-el → lemma(정규화) → strong 목록 */
function buildLemmaIndex(lex) {
  /** @type {Map<string, string[]>} */
  const byNorm = new Map();
  for (const [rawId, entry] of Object.entries(lex)) {
    const id = normStrong(rawId);
    const word = entry?.word || "";
    if (!word || !id) continue;
    const key = stripDiacritics(word).toLowerCase();
    if (!byNorm.has(key)) byNorm.set(key, []);
    const list = byNorm.get(key);
    if (!list.includes(id)) list.push(id);
  }
  return byNorm;
}

function resolveStrong(lemma, lemmaIndex, preferred) {
  if (preferred) return normStrong(preferred);
  if (!lemma) return "";
  const candidates = [lemma];
  if (LEMMA_ALIASES.has(lemma)) candidates.push(LEMMA_ALIASES.get(lemma));
  // οὕτω(ς) → οὕτω / οὕτως
  const bare = lemma.replace(/\([^)]*\)/g, "");
  if (bare && bare !== lemma) candidates.push(bare);
  for (const cand of candidates) {
    const key = stripDiacritics(cand).toLowerCase();
    const hits = lemmaIndex.get(key) || [];
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) {
      return [...hits].sort((a, b) => Number(padStrongNum(a)) - Number(padStrongNum(b)))[0];
    }
  }
  return "";
}

function getLexEntry(lex, strong) {
  const n = padStrongNum(strong);
  const candidates = [
    `G${n.padStart(5, "0")}`,
    `G${n}`,
    strong,
    `G${n.padStart(4, "0")}`,
  ];
  for (const k of candidates) {
    if (lex[k]) return { key: k, entry: lex[k] };
  }
  // 선형 폴백
  for (const [k, v] of Object.entries(lex)) {
    if (normStrong(k) === normStrong(strong)) return { key: k, entry: v };
  }
  return { key: strong, entry: null };
}

/** posLabel + parseLabel → "명사, 여성, 단수, 주격" */
function toParseKo(posLabel, parseLabel) {
  const pos = (posLabel || "").trim();
  const parts = (parseLabel || "")
    .split(/[·,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out = [];
  if (pos) out.push(pos);
  for (const p of parts) {
    if (!out.includes(p)) out.push(p);
  }
  return out.join(", ");
}

function listChapters(bookId) {
  const dir = path.join(SRC_ROOT, bookId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d+\.json$/.test(f))
    .map((f) => Number(f.replace(/\.json$/, "")))
    .sort((a, b) => a - b);
}

function readChapter(bookId, ch) {
  const p = path.join(SRC_ROOT, bookId, `${ch}.json`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/**
 * NT 전체 스캔: lemma 빈도 + 2~3그램 구문.
 * @returns {{
 *   lemmaCounts: Map<string, { total: number, byBook: Record<string, number> }>,
 *   lemmaStrong: Map<string, string>,
 *   lemmaPos: Map<string, Map<string, number>>,
 *   lemmaPron: Map<string, string>,
 *   lemmaGloss: Map<string, string>,
 *   phrasesByLemma: Map<string, Map<string, { greekVotes: Map<string, number>, count: number, refs: string[] }>>,
 * }}
 */
function scanNt(lemmaIndex) {
  const lemmaCounts = new Map();
  const lemmaStrong = new Map();
  const lemmaPos = new Map();
  const lemmaPron = new Map();
  const lemmaGloss = new Map();
  /** @type {Map<string, Map<string, { greekVotes: Map<string, number>, count: number, refs: string[] }>>} */
  const phrasesByLemma = new Map();

  function bumpLemma(lemma, bookId) {
    if (!lemmaCounts.has(lemma)) {
      lemmaCounts.set(lemma, { total: 0, byBook: {} });
    }
    const row = lemmaCounts.get(lemma);
    row.total += 1;
    row.byBook[bookId] = (row.byBook[bookId] || 0) + 1;
  }

  function bumpPos(lemma, posLabel) {
    if (!posLabel) return;
    if (!lemmaPos.has(lemma)) lemmaPos.set(lemma, new Map());
    const m = lemmaPos.get(lemma);
    m.set(posLabel, (m.get(posLabel) || 0) + 1);
  }

  function addPhrase(lemmas, greekWords, ref) {
    const key = lemmas.join(" ");
    for (const L of new Set(lemmas)) {
      if (!phrasesByLemma.has(L)) phrasesByLemma.set(L, new Map());
      const bag = phrasesByLemma.get(L);
      if (!bag.has(key)) {
        bag.set(key, { greekVotes: new Map(), count: 0, refs: [] });
      }
      const row = bag.get(key);
      row.count += 1;
      const g = greekWords.join(" ");
      row.greekVotes.set(g, (row.greekVotes.get(g) || 0) + 1);
      if (row.refs.length < PHRASE_REFS_MAX && !row.refs.includes(ref)) {
        row.refs.push(ref);
      }
    }
  }

  for (const bookId of GREEK_BOOKS) {
    const chapters = listChapters(bookId);
    if (!chapters.length) continue;
    for (const ch of chapters) {
      const data = readChapter(bookId, ch);
      for (const verse of data.verses || []) {
        const tokens = verse.tokens || [];
        const ref = `${bookId} ${ch}:${verse.n}`;
        const lemmas = [];
        const words = [];
        for (const t of tokens) {
          const lemma = t.lemma || "";
          if (!lemma) continue;
          bumpLemma(lemma, bookId);
          bumpPos(lemma, t.posLabel || "");
          if (!lemmaStrong.has(lemma)) {
            const s = resolveStrong(lemma, lemmaIndex, t.strong);
            if (s) lemmaStrong.set(lemma, s);
          }
          if (!lemmaPron.has(lemma)) {
            const pron =
              t.lemmaP ||
              lookupPron(t.w || lemma, lemma) ||
              "";
            if (pron) lemmaPron.set(lemma, pron);
          }
          if (!lemmaGloss.has(lemma) && t.gloss) {
            lemmaGloss.set(lemma, t.gloss);
          }
          lemmas.push(lemma);
          words.push(t.w || "");
        }
        // 2~3그램
        for (let n = 2; n <= 3; n++) {
          for (let i = 0; i + n <= lemmas.length; i++) {
            addPhrase(lemmas.slice(i, i + n), words.slice(i, i + n), ref);
          }
        }
      }
    }
  }

  return {
    lemmaCounts,
    lemmaStrong,
    lemmaPos,
    lemmaPron,
    lemmaGloss,
    phrasesByLemma,
  };
}

function topPos(posMap) {
  if (!posMap || !posMap.size) return "";
  return [...posMap.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function pickGreek(votes) {
  return [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

/** 관사·καί·δέ·γάρ·전치사 — 구문 내용어 카운트에서 제외 */
const PHRASE_PARTICLE_LEMMAS = new Set(["ὁ", "καί", "δέ", "γάρ"]);

function isPhraseFunctionWord(lemma, lemmaPos) {
  if (!lemma) return true;
  if (PHRASE_PARTICLE_LEMMAS.has(lemma)) return true;
  const bare = stripDiacritics(lemma).toLowerCase();
  if (bare === "ο" || bare === "και" || bare === "δε" || bare === "γαρ") return true;
  const pos = topPos(lemmaPos?.get(lemma));
  if (pos === "전치사") return true;
  return false;
}

/** 내용어(비기능어) 2개 이상인 표현만 유지. 예: τῆς ζωῆς ✗, ζωὴ αἰώνιος ✓, ἄρτος τῆς ζωῆς ✓ */
function contentLemmaCount(lemmas, lemmaPos) {
  let n = 0;
  for (const L of lemmas) {
    if (!isPhraseFunctionWord(L, lemmaPos)) n += 1;
  }
  return n;
}

function buildFamily(lex, strong, selfLemma) {
  const self = normStrong(strong);
  const selfRoot = normStrong(getLexEntry(lex, strong).entry?.rootStrong) || self;
  const selfLemmaKey = stripDiacritics(selfLemma || "").toLowerCase();
  const members = [];
  for (const [rawId, entry] of Object.entries(lex)) {
    const id = normStrong(rawId);
    const entryRoot = normStrong(entry?.rootStrong);
    // 같은 어근: 공통 root, 또는 상대가 나를 root로 보거나 내가 상대를 root로 봄
    const same =
      id === selfRoot ||
      entryRoot === selfRoot ||
      entryRoot === self ||
      id === self;
    if (!same) continue;
    const lemma = entry?.word || "";
    if (!lemma) continue;
    if (id === self) continue;
    if (stripDiacritics(lemma).toLowerCase() === selfLemmaKey) continue;
    members.push({ lemma, strong: id, n: Number(padStrongNum(id)) });
  }
  const seen = new Set();
  const out = [];
  for (const m of members.sort((a, b) => a.n - b.n)) {
    const k = stripDiacritics(m.lemma).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m.lemma);
    if (out.length >= FAMILY_MAX) break;
  }
  return out;
}

function buildRoot(lex, strong, notes, glossFallback) {
  const { entry } = getLexEntry(lex, strong);
  const rootStrong = normStrong(entry?.rootStrong);
  if (!rootStrong) return null;
  const root = getLexEntry(lex, rootStrong);
  if (!root.entry) {
    return { lemma: "", strong: rootStrong };
  }
  const note = notes[rootStrong] || notes[normStrong(rootStrong)] || notes[root.key] || {};
  const obj = {
    lemma: root.entry.word || "",
    strong: rootStrong,
  };
  const glossKo =
    glossFallback ||
    note.rootNote ||
    note.rootGloss ||
    note.glossKo ||
    "";
  if (glossKo) obj.glossKo = glossKo;
  return obj;
}

function buildPhrases(lemma, phrasesByLemma, lemmaPos) {
  const bag = phrasesByLemma.get(lemma);
  if (!bag) return [];
  const rows = [];
  for (const [lemmaKey, row] of bag.entries()) {
    if (row.count < PHRASE_MIN_COUNT) continue;
    const lemmas = lemmaKey.split(" ");
    if (!lemmas.includes(lemma)) continue;
    // 관사·접속 소사·전치사만 붙은 표현 제외 → 내용어 ≥ 2
    if (contentLemmaCount(lemmas, lemmaPos) < 2) continue;
    rows.push({
      greek: pickGreek(row.greekVotes),
      lemmas,
      count: row.count,
      refs: row.refs.slice(0, PHRASE_REFS_MAX),
      glossKo: "", // Agent 4
    });
  }
  rows.sort((a, b) => b.count - a.count || a.greek.localeCompare(b.greek, "el"));
  return rows.slice(0, PHRASE_MAX);
}

function writeJohn1Chapters(lemmaIndex, lemmaStrong) {
  fs.mkdirSync(OUT_BOOK, { recursive: true });
  const chapters = listChapters(BOOK_ID);
  let wordCount = 0;
  const uniqueLemmas = new Set();

  for (const ch of chapters) {
    const data = readChapter(BOOK_ID, ch);
    const verses = [];
    for (const verse of data.verses || []) {
      const words = [];
      let i = 0;
      for (const t of verse.tokens || []) {
        const lemma = t.lemma || "";
        const strong =
          resolveStrong(lemma, lemmaIndex, t.strong) ||
          lemmaStrong.get(lemma) ||
          "";
        if (lemma) uniqueLemmas.add(lemma);
        const pron =
          t.p ||
          lookupPron(t.w || "", lemma) ||
          t.lemmaP ||
          "";
        words.push({
          ref: `${ch}:${verse.n}`,
          i,
          word: t.w || "",
          lemma,
          strong,
          pron,
          parse: t.parse || "",
          parseKo: toParseKo(t.posLabel || "", t.parseLabel || ""),
          glossKo: t.gloss || "",
        });
        i += 1;
        wordCount += 1;
      }
      verses.push({ n: verse.n, words });
    }
    const out = {
      book: BOOK_ID,
      chapter: ch,
      sources: data.meta?.sources || {
        sblgnt: "SBLGNT © Society of Biblical Literature & Logos Bible Software (CC BY 4.0)",
        morphgnt: "MorphGNT (CC BY-SA 4.0)",
      },
      verses,
    };
    const outPath = path.join(OUT_BOOK, `${ch}.json`);
    fs.writeFileSync(outPath, JSON.stringify(out) + "\n");
    console.log(`[john1] ch ${ch} → ${wordsInChapter(verses)} words → ${outPath}`);
  }

  return { chapters: chapters.length, wordCount, uniqueLemmas };
}

function wordsInChapter(verses) {
  return verses.reduce((n, v) => n + (v.words?.length || 0), 0);
}

function writeLexicon(uniqueLemmas, scan, lex, notes) {
  fs.mkdirSync(OUT_LEX, { recursive: true });
  const written = [];

  for (const lemma of [...uniqueLemmas].sort((a, b) => a.localeCompare(b, "el"))) {
    const strong =
      scan.lemmaStrong.get(lemma) ||
      resolveStrong(lemma, buildLemmaIndex(lex), null);
    if (!strong) {
      console.warn(`[lex] strong 없음: ${lemma}`);
      continue;
    }
    const { entry } = getLexEntry(lex, strong);
    const note =
      notes[strong] ||
      notes[normStrong(strong)] ||
      notes[lemma] ||
      {};
    const counts = scan.lemmaCounts.get(lemma) || { total: 0, byBook: {} };
    const posKo = topPos(scan.lemmaPos.get(lemma)) || "";
    const pron =
      note.pron ||
      scan.lemmaPron.get(lemma) ||
      lookupPron(lemma, lemma) ||
      "";
    const defEn = clip(note.defEn || entry?.defEn || "", DEF_EN_MAX);
    const root = buildRoot(lex, strong, notes, note.rootNote || note.rootGloss || "");
    const family = buildFamily(lex, strong, lemma);
    let phrases = buildPhrases(lemma, scan.phrasesByLemma, scan.lemmaPos);
    // phraseNotes (Agent 4) → 해당 greek 구문에 note 병합
    if (note.phraseNotes && typeof note.phraseNotes === "object") {
      const pn = note.phraseNotes;
      phrases = phrases.map((p) => {
        const hit =
          pn[p.greek] ||
          pn[p.lemmas.join(" ")] ||
          Object.entries(pn).find(([k]) => stripDiacritics(k) === stripDiacritics(p.greek))?.[1];
        return hit ? { ...p, noteKo: hit } : p;
      });
    }

    const obj = {
      lemma,
      pron,
      strong,
      posKo,
      root,
      family,
      defEn,
      // Agent 4 notes 병합 (없으면 빈 문자열)
      defKo: note.defKo || "",
      compareKo: note.compare || note.compareKo || note.note || "",
      countNT: counts.total,
      byBook: Object.fromEntries(
        Object.entries(counts.byBook).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      ),
      count1John: counts.byBook[BOOK_ID] || 0,
      phrases,
    };

    const outPath = path.join(OUT_LEX, `${strong}.json`);
    fs.writeFileSync(outPath, JSON.stringify(obj, null, 2) + "\n");
    written.push(strong);
  }

  return written;
}

function dirSize(dir) {
  if (!fs.existsSync(dir)) return { files: 0, bytes: 0 };
  let files = 0;
  let bytes = 0;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isFile()) {
      files += 1;
      bytes += st.size;
    } else if (st.isDirectory()) {
      const sub = dirSize(p);
      files += sub.files;
      bytes += sub.bytes;
    }
  }
  return { files, bytes };
}

function main() {
  console.log("[word-study] Strong's Greek + MorphGNT(bible-v2) → public/word-study/");
  const lex = ensureGreekLexicon();
  const notes = loadNotes();
  const lemmaIndex = buildLemmaIndex(lex);
  console.log(`[word-study] strong entries ${Object.keys(lex).length}, lemma keys ${lemmaIndex.size}`);
  if (Object.keys(notes).length) {
    console.log(`[word-study] notes merge ${Object.keys(notes).length} from ${NOTES_PATH}`);
  } else {
    console.log(`[word-study] notes 없음 (defKo/compareKo 빈 문자열) — ${NOTES_PATH}`);
  }

  console.log("[word-study] NT scan…");
  const scan = scanNt(lemmaIndex);
  console.log(`[word-study] lemmas in NT: ${scan.lemmaCounts.size}`);

  const { chapters, wordCount, uniqueLemmas } = writeJohn1Chapters(
    lemmaIndex,
    scan.lemmaStrong,
  );
  const written = writeLexicon(uniqueLemmas, scan, lex, notes);

  const johnStat = dirSize(OUT_BOOK);
  const lexStat = dirSize(OUT_LEX);
  const zoePath = path.join(OUT_LEX, "G2222.json");
  let zoe = null;
  if (fs.existsSync(zoePath)) {
    zoe = JSON.parse(fs.readFileSync(zoePath, "utf8"));
  } else {
    // lemma 파일명 폴백 탐색
    for (const f of fs.readdirSync(OUT_LEX)) {
      const j = JSON.parse(fs.readFileSync(path.join(OUT_LEX, f), "utf8"));
      if (j.lemma === "ζωή" || stripDiacritics(j.lemma) === "ζωη") {
        zoe = j;
        break;
      }
    }
  }

  const report = {
    john1Chapters: chapters,
    john1Words: wordCount,
    uniqueLemmas: uniqueLemmas.size,
    lexiconFiles: written.length,
    sizes: {
      john1: johnStat,
      lexicon: lexStat,
      totalBytes: johnStat.bytes + lexStat.bytes,
      totalFiles: johnStat.files + lexStat.files,
    },
    zoe,
  };
  console.log("\n=== REPORT ===");
  console.log(JSON.stringify(report, null, 2));
}

main();
