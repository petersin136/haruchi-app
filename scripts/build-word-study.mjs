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
import { PRON, LEMMA_PRON, lookupPron, stripDiacritics } from "./lib/greek-pron.mjs";

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
  ["μοιχάομαι", "μοιχάω"],
  ["γαμίζω", "γαμίσκω"],
  ["κράβαττος", "κράββατος"],
  ["τεσσεράκοντα", "τεσσαράκοντα"],
  ["ἐνενήκοντα", "ἐννενηκονταεννέα"],
  ["τετραάρχης", "τετράρχης"],
  ["ἄρσην", "ἄῤῥην"],
  ["Ἰσκαριώθ", "Ἰσκαριώτης"],
  ["γένημα", "γέννημα"],
  ["Μαριάμ", "Μαρία"],
  ["νοέω", "νοιέω"],
  ["Μωϋσῆς", "Μωσεύς"],
  ["σιδηροῦς", "σιδήρεος"],
  ["μέλει", "μέλω"],
]);

const GREEK_BOOKS = [
  "matthew", "mark", "luke", "john", "acts",
  "romans", "corinthians1", "corinthians2", "galatians", "ephesians",
  "philippians", "colossians", "thessalonians1", "thessalonians2",
  "timothy1", "timothy2", "titus", "philemon", "hebrews",
  "james", "peter1", "peter2", "john1", "john2", "john3", "jude", "revelation",
];

// ── 에라스무스식 한글 발음 (greek-pron.mjs 머리말 규칙)
//   α=아 ε,η=에 ι=이 ο,ω=오 υ=위(어말 우) αι=아이 ει=에이 οι=오이 αυ=아우 ευ=에우 ου=우
//   θ=ㅌ φ=ㅍ χ=ㅋ ξ=크ㅅ ψ=프ㅅ, 기식(῾)=ㅎ, γγ/γκ/γχ/γξ의 γ=ㅇ받침,
//   ν·μ·λ은 받침, 모음 사이 λ은 ㄹㄹ, 나머지 자음 단독은 ㅡ를 붙인다.
const KO_INITIALS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const KO_MEDIALS = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
const KO_FINALS = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

function hangul(initial, medial, final = "") {
  const i = KO_INITIALS.indexOf(initial);
  const m = KO_MEDIALS.indexOf(medial);
  const f = KO_FINALS.indexOf(final);
  if (i < 0 || m < 0 || f < 0) return "";
  return String.fromCharCode(0xac00 + (i * 21 + m) * 28 + f);
}

const EL_CONS = {
  β: "ㅂ", γ: "ㄱ", δ: "ㄷ", ζ: "ㅈ", θ: "ㅌ", κ: "ㅋ", λ: "ㄹ", μ: "ㅁ", ν: "ㄴ",
  π: "ㅍ", ρ: "ㄹ", σ: "ㅅ", τ: "ㅌ", φ: "ㅍ", χ: "ㅋ",
};
const EL_VOWEL = { α: ["ㅏ"], ε: ["ㅔ"], η: ["ㅔ"], ι: ["ㅣ"], ο: ["ㅗ"], ω: ["ㅗ"], υ: ["ㅟ"] };
const EL_DIPH = {
  αι: ["ㅏ", "ㅣ"], ει: ["ㅔ", "ㅣ"], οι: ["ㅗ", "ㅣ"], υι: ["ㅟ"],
  αυ: ["ㅏ", "ㅜ"], ευ: ["ㅔ", "ㅜ"], ηυ: ["ㅔ", "ㅜ"], ου: ["ㅜ"],
};
const CODA_OK = { ㄴ: "ㄴ", ㅁ: "ㅁ", ㄹ: "ㄹ", ㅇ: "ㅇ" };

/** NFD 분석: 글자 + 기식(῾)·분음(¨) 표시 */
function greekLetters(raw) {
  const out = [];
  for (const ch of String(raw || "").normalize("NFD")) {
    const code = ch.codePointAt(0);
    if (code >= 0x300 && code <= 0x36f) {
      const last = out[out.length - 1];
      if (!last) continue;
      if (code === 0x314) last.rough = true;
      if (code === 0x308) last.diaeresis = true;
      continue;
    }
    const c = ch.toLowerCase().replace("ς", "σ");
    if (/[α-ω]/.test(c)) out.push({ c, rough: false, diaeresis: false });
  }
  return out;
}

export function erasmianKo(raw) {
  const L = greekLetters(raw);
  if (!L.length) return "";
  // 1) 단위 분해: {type:'v', meds:[...]} | {type:'c', jamo, double?}
  const units = [];
  let firstVowelSeen = false;
  for (let i = 0; i < L.length; i++) {
    const a = L[i];
    const b = L[i + 1];
    if (EL_VOWEL[a.c]) {
      let meds = EL_VOWEL[a.c];
      let rough = a.rough;
      let step = 1;
      if (b && EL_DIPH[a.c + b.c] && !b.diaeresis) {
        meds = EL_DIPH[a.c + b.c];
        rough = rough || b.rough;
        step = 2;
      }
      if (!firstVowelSeen && rough && !units.length) units.push({ type: "c", jamo: "ㅎ" });
      firstVowelSeen = true;
      units.push({ type: "v", meds: [...meds] });
      i += step - 1;
      continue;
    }
    if (a.c === "ξ") { units.push({ type: "c", jamo: "ㅋ" }, { type: "c", jamo: "ㅅ" }); continue; }
    if (a.c === "ψ") { units.push({ type: "c", jamo: "ㅍ" }, { type: "c", jamo: "ㅅ" }); continue; }
    if (a.c === "γ" && b && "γκχξ".includes(b.c)) { units.push({ type: "c", jamo: "ㅇ", nasal: true }); continue; }
    const jamo = EL_CONS[a.c];
    if (!jamo) continue;
    // 같은 자음 반복(ππ, σσ, ττ …)은 하나로. λλ·μμ·νν은 받침+초성으로 살림.
    if (b && b.c === a.c && !"λμν".includes(a.c)) continue;
    units.push({ type: "c", jamo, letter: a.c });
  }
  // 어말 단독 υ → 우
  const lastU = units[units.length - 1];
  if (lastU?.type === "v" && lastU.meds.length === 1 && lastU.meds[0] === "ㅟ" && units.length > 1) {
    const prev = units[units.length - 2];
    if (prev.type === "c") lastU.meds = ["ㅜ"];
  }

  // 2) 음절 조립
  /** @type {{ini:string, med:string, fin:string}[]} */
  const syl = [];
  let pending = []; // 아직 붙지 않은 자음들
  const flushStandalone = (cons) => {
    for (const c of cons) syl.push({ ini: c.jamo === "ㅇ" ? "ㅇ" : c.jamo, med: "ㅡ", fin: "" });
  };
  for (let u = 0; u < units.length; u++) {
    const unit = units[u];
    if (unit.type === "c") { pending.push(unit); continue; }
    // 모음: 마지막 자음이 초성, 그 앞 자음은 이전 음절 받침(가능하면) 또는 단독 음절
    let onset = "ㅇ";
    if (pending.length) {
      const last = pending[pending.length - 1];
      onset = last.jamo;
      pending = pending.slice(0, -1);
    }
    // 남은 자음: 첫 자음이 받침 가능(ν μ λ, 비음 γ)하고 직전 음절이 받침 없으면 받침으로
    if (pending.length) {
      const first = pending[0];
      const prev = syl[syl.length - 1];
      if (prev && !prev.fin && first.letter !== "ρ" && CODA_OK[first.jamo]) {
        prev.fin = CODA_OK[first.jamo];
        pending = pending.slice(1);
      }
      flushStandalone(pending);
      pending = [];
    }
    if (onset === "ㄹ" && units[u - 1]?.letter === "λ") {
      // 초성 λ → 앞 음절에 ㄹ받침 (알레테이아, 에클레시아)
      const prev = syl[syl.length - 1];
      if (prev && !prev.fin) prev.fin = "ㄹ";
    }
    const [m0, ...rest] = unit.meds;
    syl.push({ ini: onset, med: m0, fin: "" });
    for (const m of rest) syl.push({ ini: "ㅇ", med: m, fin: "" });
  }
  // 어말 자음
  if (pending.length) {
    const prev = syl[syl.length - 1];
    if (prev && !prev.fin && ["ν", "μ", "λ"].includes(pending[0].letter)) {
      prev.fin = pending[0].jamo;
      pending = pending.slice(1);
    }
    flushStandalone(pending);
  }
  return syl.map((s) => hangul(s.ini, s.med, s.fin)).join("");
}

function buildStrippedMap(dict) {
  const m = new Map();
  for (const [k, v] of Object.entries(dict)) {
    const s = stripDiacritics(k).toLowerCase();
    if (!m.has(s)) m.set(s, v);
  }
  return m;
}
const PRON_STRIP = buildStrippedMap(PRON);
const LEMMA_PRON_STRIP = buildStrippedMap(LEMMA_PRON);

/** 굴절형 발음: 사전(PRON) 우선 → 규칙 음역 */
function wordPron(word) {
  if (!word) return "";
  if (PRON[word]) return PRON[word];
  const s = stripDiacritics(word).toLowerCase();
  return PRON_STRIP.get(s) || erasmianKo(word);
}

/** 표제어 발음: LEMMA_PRON → PRON → 규칙 음역 */
function lemmaPron(lemma) {
  if (!lemma) return "";
  if (LEMMA_PRON[lemma]) return LEMMA_PRON[lemma];
  const s = stripDiacritics(lemma).toLowerCase();
  return LEMMA_PRON_STRIP.get(s) || PRON[lemma] || PRON_STRIP.get(s) || erasmianKo(lemma.replace(/\([^)]*\)/g, ""));
}

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
  // SBLGNT ↔ Strong 철자 차이 (디포넌트, λημπ/ληπ, θθ/τθ, σσ/ττ, -νυμι/-νύω, ει/ι)
  const s = stripDiacritics(bare).toLowerCase();
  const variants = [
    s.replace(/ομαι$/, "ω"),
    s.replace(/αομαι$/, "αω"),
    s.replace(/εομαι$/, "εω"),
    s.replace(/ω$/, "ομαι"),
    s.replace(/υμι$/, "υω"),
    s.replace(/ημι$/, "αω"),
    s.replace(/μαι$/, ""),
    s.replace(/λημπ/g, "ληπ"),
    s.replace(/θθ/g, "τθ"),
    s.replace(/σσ/g, "ττ"),
    s.replace(/ττ/g, "σσ"),
    s.replace(/ει/g, "ι"),
    s.replace(/ι/g, "ει"),
    s.replace(/ρ(?!ρ)/g, "ρρ"),
    s.replace(/ρρ/g, "ρ"),
    s.replace(/υι/g, "υ"),
    s.replace(/ϊ/g, "ι"),
    s.replace(/μπιμπ/g, "μπιπ"),
    s.replace(/ου?ς$/, "εος"),
  ];
  for (const v of variants) if (v && v !== s) candidates.push(v);
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
      // 구두점·생략 부호 제거한 형태로 집계
      const g = greekWords.map((w) => w.replace(/[^\p{L}\p{M}]/gu, "")).join(" ");
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

/** Strong 번호 → 같은 뿌리 Strong 번호 (최대 FAMILY_MAX) */
function buildFamilyStrongs(lex, strong, rootIndex) {
  const self = normStrong(strong);
  const selfRoot = normStrong(getLexEntry(lex, strong).entry?.rootStrong) || self;
  const ids = new Set([
    selfRoot,
    ...(rootIndex.get(selfRoot) || []),
    ...(rootIndex.get(self) || []),
  ]);
  ids.delete(self);
  const selfWord = stripDiacritics(getLexEntry(lex, strong).entry?.word || "").toLowerCase();
  const seen = new Set();
  const out = [];
  for (const id of [...ids].sort((a, b) => Number(padStrongNum(a)) - Number(padStrongNum(b)))) {
    const word = getLexEntry(lex, id).entry?.word || "";
    if (!word) continue;
    const k = stripDiacritics(word).toLowerCase();
    if (k === selfWord || seen.has(k)) continue;
    seen.add(k);
    out.push(id);
    if (out.length >= FAMILY_MAX) break;
  }
  return out;
}

function buildPhrases(lemma, phrasesByLemma, lemmaPos, lemmaStrong) {
  const bag = phrasesByLemma.get(lemma);
  if (!bag) return [];
  const rows = [];
  for (const [lemmaKey, row] of bag.entries()) {
    if (row.count < PHRASE_MIN_COUNT) continue;
    const lemmas = lemmaKey.split(" ");
    if (!lemmas.includes(lemma)) continue;
    // 관사·접속 소사·전치사만 붙은 표현 제외 → 내용어 ≥ 2
    if (contentLemmaCount(lemmas, lemmaPos) < 2) continue;
    const greek = pickGreek(row.greekVotes);
    const forms = greek.split(" ");
    const words = lemmas.map((L, i) => ({
      word: forms[i] || "",
      lemma: L,
      strong: lemmaStrong.get(L) || "",
      pron: wordPron(forms[i] || L),
    }));
    rows.push({
      greek,
      pron: words.map((w) => w.pron).join(" "),
      lemmas,
      words,
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

/**
 * 신약 lemma 전체 + Strong's 전체 → lexicon/greek/{strong}.json
 * (family·phrases·root가 가리키는 strong 파일이 항상 존재하도록)
 */
function writeLexicon(scan, lex, notes) {
  fs.rmSync(OUT_LEX, { recursive: true, force: true });
  fs.mkdirSync(OUT_LEX, { recursive: true });

  // strong → NT lemma 목록 (빈도 내림차순; 첫 번째가 대표)
  /** @type {Map<string, string[]>} */
  const strongLemmas = new Map();
  for (const [lemma, s] of scan.lemmaStrong.entries()) {
    if (!strongLemmas.has(s)) strongLemmas.set(s, []);
    strongLemmas.get(s).push(lemma);
  }
  for (const list of strongLemmas.values()) {
    list.sort((a, b) => (scan.lemmaCounts.get(b)?.total || 0) - (scan.lemmaCounts.get(a)?.total || 0));
  }

  // rootStrong → 자식 strong
  /** @type {Map<string, string[]>} */
  const rootIndex = new Map();
  for (const [rawId, entry] of Object.entries(lex)) {
    const r = normStrong(entry?.rootStrong);
    if (!r) continue;
    if (!rootIndex.has(r)) rootIndex.set(r, []);
    rootIndex.get(r).push(normStrong(rawId));
  }

  const allStrongs = new Set([
    ...Object.keys(lex).map(normStrong),
    ...strongLemmas.keys(),
  ]);

  const headLemma = (s) =>
    strongLemmas.get(s)?.[0] || getLexEntry(lex, s).entry?.word || "";
  const headPron = (s) => {
    const note = notes[s] || {};
    return note.pron || lemmaPron(headLemma(s));
  };
  const headGloss = (s) => {
    const L = strongLemmas.get(s)?.[0];
    return (L && scan.lemmaGloss.get(L)) || notes[s]?.glossKo || "";
  };

  const written = [];
  for (const strong of [...allStrongs].sort((a, b) => Number(padStrongNum(a)) - Number(padStrongNum(b)))) {
    const lemmas = strongLemmas.get(strong) || [];
    const lemma = headLemma(strong);
    if (!lemma) continue;
    const { entry } = getLexEntry(lex, strong);
    const note = notes[strong] || notes[lemma] || {};

    const counts = { total: 0, byBook: {} };
    const posMap = new Map();
    for (const L of lemmas) {
      const c = scan.lemmaCounts.get(L);
      if (c) {
        counts.total += c.total;
        for (const [b, n] of Object.entries(c.byBook)) counts.byBook[b] = (counts.byBook[b] || 0) + n;
      }
      for (const [p, n] of scan.lemmaPos.get(L) || []) posMap.set(p, (posMap.get(p) || 0) + n);
    }

    const pron = headPron(strong);
    const defEn = clip(note.defEn || entry?.defEn || "", DEF_EN_MAX);

    const rootStrong = normStrong(entry?.rootStrong);
    let root = null;
    if (rootStrong && allStrongs.has(rootStrong) && headLemma(rootStrong)) {
      root = { lemma: headLemma(rootStrong), strong: rootStrong };
      const rg = note.rootNote || note.rootGloss || headGloss(rootStrong);
      if (rg) root.glossKo = rg;
    }

    const family = buildFamilyStrongs(lex, strong, rootIndex)
      .filter((s) => allStrongs.has(s))
      .map((s) => ({
        lemma: headLemma(s),
        strong: s,
        pron: headPron(s),
        glossKo: headGloss(s),
      }));

    let phrases = lemmas.length
      ? buildPhrases(lemmas[0], scan.phrasesByLemma, scan.lemmaPos, scan.lemmaStrong)
      : [];
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
      posKo: topPos(posMap) || "",
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
  const written = writeLexicon(scan, lex, notes);

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
