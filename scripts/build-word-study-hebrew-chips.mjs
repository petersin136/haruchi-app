#!/usr/bin/env node
/**
 * 히브리어 word-study 시범 보완 빌드.
 *
 * - 칩 = 본단어 1개 (접두·대명접미는 parts[] 로 칩 안 분해)
 * - 절 매핑 = OSHB XML 의 <note>KJV:…</note> 만 사용 (손 목록 없음)
 * - 음역 = 유성 셰바·다게쉬 보정 (기존 hebrew-pron 을 수정하지 않고 여기 보정)
 * - 출력: public/word-study/{book}/{ch}.json , lexicon/hebrew/
 *
 *   node scripts/build-word-study-hebrew-chips.mjs           # 시 1–30 + 창 1–3
 *   node scripts/build-word-study-hebrew-chips.mjs --all   # 승인 후
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";

import { pron as basePron, stripHebrewAccents } from "./lib/hebrew-pron.mjs";
import { decodeMorph, PREFIX_LEMMA } from "./lib/hebrew-morph-parse.mjs";
import { normalizeStrong, lookupTanakh } from "./lib/tanakh-lexicon.mjs";
import {
  isPrefixLemma,
  isSuffixMorph,
  parseSuffixCode,
  suffixGlossKo,
} from "./lib/hebrew-suffix-gloss.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const OSHB_DIR = path.join(repoRoot, ".cache", "oshb");
const OUT_ROOT = path.join(repoRoot, "public", "word-study");
const OUT_LEX = path.join(OUT_ROOT, "lexicon", "hebrew");
const NOTES_PATH = path.join(repoRoot, "data", "keyword-notes", "hebrew.json");
const KRV_CHUNKS = path.join(repoRoot, "public", "bible-study", "chunks");
const ENRICHED = path.join(OSHB_DIR, "strong-he-enriched.json");
const STRONG_CACHE = path.join(OSHB_DIR, "strong-he.json");

const MORPHHB_BASE =
  "https://raw.githubusercontent.com/openscriptures/morphhb/master/wlc";

const DEF_EN_MAX = 160;
const FAMILY_MAX = 6;
const PHRASE_MIN = 3;
const PHRASE_MAX = 5;
const PHRASE_REFS_MAX = 12;

const BOOKS = [
  { id: "genesis", osis: "Gen" },
  { id: "exodus", osis: "Exod" },
  { id: "leviticus", osis: "Lev" },
  { id: "numbers", osis: "Num" },
  { id: "deuteronomy", osis: "Deut" },
  { id: "joshua", osis: "Josh" },
  { id: "judges", osis: "Judg" },
  { id: "ruth", osis: "Ruth" },
  { id: "samuel1", osis: "1Sam" },
  { id: "samuel2", osis: "2Sam" },
  { id: "kings1", osis: "1Kgs" },
  { id: "kings2", osis: "2Kgs" },
  { id: "chronicles1", osis: "1Chr" },
  { id: "chronicles2", osis: "2Chr" },
  { id: "ezra", osis: "Ezra" },
  { id: "nehemiah", osis: "Neh" },
  { id: "esther", osis: "Esth" },
  { id: "job", osis: "Job" },
  { id: "psalms", osis: "Ps" },
  { id: "proverbs", osis: "Prov" },
  { id: "ecclesiastes", osis: "Eccl" },
  { id: "songofsolomon", osis: "Song" },
  { id: "isaiah", osis: "Isa" },
  { id: "jeremiah", osis: "Jer" },
  { id: "lamentations", osis: "Lam" },
  { id: "ezekiel", osis: "Ezek" },
  { id: "daniel", osis: "Dan" },
  { id: "hosea", osis: "Hos" },
  { id: "joel", osis: "Joel" },
  { id: "amos", osis: "Amos" },
  { id: "obadiah", osis: "Obad" },
  { id: "jonah", osis: "Jonah" },
  { id: "micah", osis: "Mic" },
  { id: "nahum", osis: "Nah" },
  { id: "habakkuk", osis: "Hab" },
  { id: "zephaniah", osis: "Zeph" },
  { id: "haggai", osis: "Hag" },
  { id: "zechariah", osis: "Zech" },
  { id: "malachi", osis: "Mal" },
];

const PILOT = [
  { id: "psalms", chapters: range(1, 30) },
  { id: "genesis", chapters: range(1, 3) },
];

/** KJV OSIS book code → 우리 bookId (OSHB note 용) */
const KJV_BOOK = Object.fromEntries(BOOKS.map((b) => [b.osis, b.id]));
// OSHB 노트에 Ps / Gen 등 단축형
for (const b of BOOKS) {
  KJV_BOOK[b.osis] = b.id;
}
Object.assign(KJV_BOOK, {
  Gen: "genesis",
  Exod: "exodus",
  Lev: "leviticus",
  Num: "numbers",
  Deut: "deuteronomy",
  Josh: "joshua",
  Judg: "judges",
  Ruth: "ruth",
  "1Sam": "samuel1",
  "2Sam": "samuel2",
  "1Kgs": "kings1",
  "2Kgs": "kings2",
  "1Chr": "chronicles1",
  "2Chr": "chronicles2",
  Ezra: "ezra",
  Neh: "nehemiah",
  Esth: "esther",
  Job: "job",
  Ps: "psalms",
  Prov: "proverbs",
  Eccl: "ecclesiastes",
  Song: "songofsolomon",
  Isa: "isaiah",
  Jer: "jeremiah",
  Lam: "lamentations",
  Ezek: "ezekiel",
  Dan: "daniel",
  Hos: "hosea",
  Joel: "joel",
  Amos: "amos",
  Obad: "obadiah",
  Jonah: "jonah",
  Mic: "micah",
  Nah: "nahum",
  Hab: "habakkuk",
  Zeph: "zephaniah",
  Hag: "haggai",
  Zech: "zechariah",
  Mal: "malachi",
});

function range(a, b) {
  const o = [];
  for (let i = a; i <= b; i++) o.push(i);
  return o;
}
function clip(s, n) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + "…";
}
function padNum(n) {
  return String(n).replace(/\D/g, "").replace(/^0+/, "") || "0";
}
function normH(id) {
  if (!id) return "";
  const m = String(id).match(/(\d+)/);
  return m ? `H${padNum(m[1])}` : "";
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          httpsGet(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`GET ${url} → ${res.statusCode}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

async function ensureOshbXml(osis) {
  fs.mkdirSync(OSHB_DIR, { recursive: true });
  const dest = path.join(OSHB_DIR, `${osis}.xml`);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return dest;
  const buf = await httpsGet(`${MORPHHB_BASE}/${osis}.xml`);
  fs.writeFileSync(dest, buf);
  console.log(`[oshb] ${osis}.xml ${(buf.length / 1024).toFixed(0)} KB`);
  return dest;
}

function loadStrongLex() {
  const p = fs.existsSync(ENRICHED) ? ENRICHED : STRONG_CACHE;
  if (!fs.existsSync(p)) throw new Error(`Strong's 없음: ${p}`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function loadNotes() {
  if (!fs.existsSync(NOTES_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(NOTES_PATH, "utf8"));
  } catch {
    return {};
  }
}
function krvVerseCount(bookId, ch) {
  const p = path.join(KRV_CHUNKS, bookId, String(ch), "korean.json");
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")).verses?.krv?.length ?? null;
}

// ── 음역 보정 (유성 셰바·다게쉬) ────────────────────────────────────────────
const PRON_OVERRIDE = {
  // 골격(니쿠드 제거) → 교정
  מזמור: "미즈모르",
  למנצח: "라메낫체아흐",
  מנצח: "메낫체아흐",
  יענך: "야아네카",
  ישגבך: "예삭게브카",
};

function skeleton(heb) {
  return stripHebrewAccents(heb || "")
    .replace(/[\u05B0-\u05C7]/g, "")
    .replace(/[־/'״\u05F3\u05F4]/g, "")
    .replace(/\//g, "");
}

/**
 * 유성 셰바: 자음+셰바 뒤에 모음 있는 음절이 오면 받침 흡수하지 않고 '으/에'로 읽기.
 * 기존 basePron 결과가 어색하면 조각별로 다시 조합.
 */
export function pronFixed(raw) {
  if (!raw) return "";
  const full = String(raw).replace(/\//g, "");
  const sk = skeleton(full);
  if (PRON_OVERRIDE[sk]) return PRON_OVERRIDE[sk];

  // 조각별 음역 후 연결 (접두/접미 분해 표시용)
  const parts = String(raw).split("/").filter(Boolean);
  if (parts.length > 1) {
    return parts.map((p) => pronFixed(p)).join("");
  }

  let p = basePron(full);
  // 밋모르 → 미즈모르 (זְ 유성 셰바)
  p = p.replace(/밋모/g, "미즈모").replace(/밋모르/g, "미즈모르");
  // 람낫 → 라메낫 (מְ 유성)
  p = p.replace(/람낫/g, "라메낫").replace(/^람메낫/, "라메낫");
  // 예삭겝 → 예삭게브
  p = p.replace(/예삭겝/g, "예삭게브");
  // 야안카 → 야아네카 (응답+2ms)
  if (/יענ/.test(sk)) {
    p = p.replace(/야안카/g, "야아네카");
    if (p === "야안" || p.startsWith("야안")) p = p.replace(/^야안/, "야아네");
  }
  return p;
}

// ── OSHB 파서 + KJV 노트 매핑 ───────────────────────────────────────────────
function parseOshbXml(xmlPath) {
  const xml = fs.readFileSync(xmlPath, "utf8");
  const verseRe = /<verse osisID="([^"]+)">([\s\S]*?)<\/verse>/g;
  /** @type {{wlcCh:number,wlcV:number,kjv:null|{book:string,ch:number,v:number},rows:object[]}[]} */
  const list = [];
  let m;
  while ((m = verseRe.exec(xml)) !== null) {
    const parts = m[1].split(".");
    const wlcCh = parseInt(parts[1], 10);
    const wlcV = parseInt(parts[2], 10);
    if (!Number.isFinite(wlcCh) || !Number.isFinite(wlcV)) continue;
    const body = m[2];
    const kjvM = body.match(
      /<note[^>]*>\s*KJV:([A-Za-z0-9]+)\.(\d+)\.(\d+)\s*<\/note>/,
    );
    const rows = [];
    const wRe = /<w\b([^>]*)>([\s\S]*?)<\/w>/g;
    let wm;
    while ((wm = wRe.exec(body)) !== null) {
      const attrs = wm[1];
      const inner = wm[2].replace(/<[^>]+>/g, "").trim();
      if (!inner) continue;
      rows.push({
        word: inner,
        lemma: attr(attrs, "lemma"),
        morph: attr(attrs, "morph"),
      });
    }
    list.push({
      wlcCh,
      wlcV,
      kjv: kjvM
        ? { book: kjvM[1], ch: +kjvM[2], v: +kjvM[3] }
        : null,
      rows,
    });
  }
  return list;
}
function attr(a, n) {
  return a.match(new RegExp(`\\b${n}="([^"]*)"`))?.[1] || "";
}

/**
 * OSHB KJV 노트만으로 KRV 좌표에 모은다. 손 목록 없음.
 *
 * 규칙:
 *  - KJV 노트 있으면 → 그 좌표
 *  - 같은 WLC 장에서 «첫 KJV 노트보다 앞선» 노트 없는 절 → 표제(다음 KJV 절에 병합)
 *  - 그 밖의 노트 없는 절 → WLC=KRV 1:1
 */
function mapBookByKjvNotes(bookId, verseList) {
  /** @type {Map<string, object[]>} key = `${ch}:${v}` */
  const buckets = new Map();
  const ensure = (ch, v) => {
    const k = `${ch}:${v}`;
    if (!buckets.has(k)) buckets.set(k, []);
    return buckets.get(k);
  };

  /** 장 → 첫 KJV 노트 WLC 절 번호 */
  const firstKjvWlcV = new Map();
  for (const row of verseList) {
    if (!row.kjv) continue;
    if (!firstKjvWlcV.has(row.wlcCh) || row.wlcV < firstKjvWlcV.get(row.wlcCh)) {
      firstKjvWlcV.set(row.wlcCh, row.wlcV);
    }
  }

  /** @type {object[]} */
  let pending = [];
  for (const row of verseList) {
    if (row.kjv) {
      const targetBook = KJV_BOOK[row.kjv.book] || bookId;
      if (targetBook !== bookId) {
        pending = [];
        continue;
      }
      const bag = ensure(row.kjv.ch, row.kjv.v);
      for (const p of pending) bag.push(...p.rows);
      bag.push(...row.rows);
      pending = [];
      continue;
    }

    const first = firstKjvWlcV.get(row.wlcCh);
    // 표제: 이 장에 KJV 노트가 있고, 아직 첫 노트 절에 도달하기 전
    if (first != null && row.wlcV < first) {
      pending.push(row);
    } else {
      // 1:1 (노트 없는 본문 절)
      ensure(row.wlcCh, row.wlcV).push(...row.rows);
    }
  }
  if (pending.length) {
    for (const p of pending) ensure(p.wlcCh, 1).push(...p.rows);
  }

  /** @type {Map<number, Map<number, object[]>>} */
  const byCh = new Map();
  for (const [k, rows] of buckets) {
    const [ch, v] = k.split(":").map(Number);
    if (!byCh.has(ch)) byCh.set(ch, new Map());
    byCh.get(ch).set(v, rows);
  }
  return byCh;
}

// ── 칩 빌드 ─────────────────────────────────────────────────────────────────
function isParticipleMorph(morph) {
  // OSHM: 분사 능동/수동 — 활용 자리 r/s
  return /\/V[a-zA-Z]*[rs]/.test(`/${morph}`) || /V[a-zA-Z][rs]/.test(morph);
}

function stemGloss(strong, morph, meanings) {
  const kr = lookupTanakh(strong);
  const note = meanings?.note;
  let gloss = kr?.gloss || "";
  const alts = kr?.meanings || [];

  if (strong === "H5329") gloss = isParticipleMorph(morph) ? "지휘자" : gloss || "지휘하다";
  else if (strong === "H7462") gloss = "목자";
  else if (strong === "H1254") gloss = "창조하다";
  else if (strong === "H6030") gloss = "응답하다";
  else if (isParticipleMorph(morph)) {
    const nounish = alts.find((m) => /자$|이$|인$/.test(m)) || "";
    if (nounish) gloss = nounish;
    else if (gloss.endsWith("하다")) gloss = gloss.replace(/하다$/, "하는 이");
  }
  return gloss || alts[0] || "";
}

function composeChipGloss({ prefixes, stemGlossKo, suffixCode, host, morph }) {
  const pref = prefixes
    .map((p) => p.code)
    .filter(Boolean);
  let g = stemGlossKo || "";

  // ל + 분사 → "~를 따라 / 위하여"
  if (pref.includes("l") && isParticipleMorph(morph) && g) {
    if (g === "지휘자") return "지휘자를 따라";
    if (!g.endsWith("를 따라") && !g.endsWith("위하여")) {
      return `${g}를 따라`;
    }
  }
  if (pref.includes("b") && g && !suffixCode) {
    // 단순 전치사 칩이 아니라 본단어 칩이므로 뜻을 과도히 바꾸지 않음
  }

  if (suffixCode) {
    const sg = suffixGlossKo(suffixCode, host);
    if (host === "noun" && sg) {
      return `${sg} ${g}`.trim();
    }
    if (host === "verb" && sg) {
      // "너를/너에게" + "응답하다" → "너에게 응답하다"
      const dat = sg.includes("/") ? sg.split("/")[1] || sg.split("/")[0] : sg;
      if (g.endsWith("하다")) return `${dat} ${g}`.trim();
      return `${dat} ${g}`.trim();
    }
  }
  return g;
}

function buildChip(row, strongLex, notes) {
  const surfaces = String(row.word || "").split("/");
  const lemmas = String(row.lemma || "").split("/");
  const morphs = String(row.morph || "").split("/");
  const n = Math.max(surfaces.length, lemmas.length, 1);

  /** @type {object[]} */
  const segs = [];
  for (let i = 0; i < n; i++) {
    const surface = (surfaces[i] ?? "").trim();
    const lemmaRaw = (lemmas[i] ?? "").trim();
    let morphRaw = (morphs[i] ?? "").trim();
    if (morphRaw && morphRaw[0] !== "H" && morphRaw[0] !== "A") {
      morphRaw = `H${morphRaw}`;
    }
    if (!surface && !lemmaRaw) continue;

    if (isPrefixLemma(lemmaRaw)) {
      const px = PREFIX_LEMMA[lemmaRaw] || {};
      segs.push({
        role: "prefix",
        code: lemmaRaw,
        word: surface,
        pron: pronFixed(surface),
        glossKo: px.gloss || "",
        strong: "",
        morph: morphRaw,
      });
    } else if (isSuffixMorph(morphRaw) || isSuffixMorph(lemmaRaw)) {
      const code = parseSuffixCode(morphRaw) || parseSuffixCode(lemmaRaw);
      segs.push({
        role: "suffix",
        code,
        word: surface,
        pron: pronFixed(surface),
        glossKo: "", // host 결정 후 채움
        strong: "",
        morph: morphRaw,
      });
    } else {
      const strong = normalizeStrong(lemmaRaw);
      segs.push({
        role: "stem",
        code: "",
        word: surface,
        pron: "",
        glossKo: "",
        strong,
        lemmaRaw,
        morph: morphRaw,
      });
    }
  }

  // 단독 접두만 있는 토큰 → 칩 1개 (전치사/접속사 자체)
  const stem = segs.find((s) => s.role === "stem");
  const prefixes = segs.filter((s) => s.role === "prefix");
  const suffixes = segs.filter((s) => s.role === "suffix");

  if (!stem) {
    const only = segs[0];
    const fullWord = surfaces.join("") || only?.word || "";
    return {
      word: fullWord.replace(/\//g, ""),
      lemma: only?.code || fullWord,
      strong: "",
      pron: pronFixed(fullWord),
      parseKo: PREFIX_LEMMA[only?.code]?.role || "접두사",
      glossKo: only?.glossKo || "",
      parts: segs.map(({ role, word, pron, glossKo }) => ({
        role,
        word,
        pron,
        glossKo,
      })),
      _chip: true,
      _mainChip: false,
    };
  }

  const strong = stem.strong;
  const note = notes[strong] || {};
  const en = strongLex[strong];
  const morphAll = row.morph || stem.morph;
  const morphInfo = decodeMorph(morphAll);
  // 분사·명사 + 접미 → 소유격(나의 목자). 정형 동사 + 접미 → 목적/여격.
  const host =
    morphInfo.posLabel === "명사" ||
    morphInfo.posLabel === "형용사" ||
    isParticipleMorph(morphAll) ||
    strong === "H7462"
      ? "noun"
      : "verb";

  const gStem = stemGloss(strong, morphAll, { note });
  stem.glossKo = gStem;
  stem.pron = pronFixed(stem.word);
  stem.lemma = en?.word || stem.lemmaRaw || strong;

  for (const sx of suffixes) {
    sx.glossKo = suffixGlossKo(sx.code, host);
  }

  const fullWord = surfaces.join("").replace(/\//g, "");
  const chipPron = pronFixed(surfaces.join("/")) || pronFixed(fullWord);
  const suffixCode = suffixes[0]?.code || null;
  const glossKo = composeChipGloss({
    prefixes,
    stemGlossKo: gStem,
    suffixCode,
    host,
    morph: morphAll,
  });

  const parseKo = [morphInfo.posLabel, morphInfo.parseLabel]
    .filter(Boolean)
    .join(", ")
    .replace(/\s+/g, " ")
    .trim();

  const parts = [...prefixes, stem, ...suffixes].map((s) => ({
    role: s.role,
    word: s.word,
    pron: s.pron || pronFixed(s.word),
    glossKo: s.glossKo || "",
    ...(s.strong ? { strong: s.strong } : {}),
    ...(s.code && s.role === "suffix" ? { suffix: s.code } : {}),
    ...(s.code && s.role === "prefix" ? { prefix: s.code } : {}),
  }));

  return {
    word: fullWord,
    lemma: stem.lemma,
    strong: strong || "",
    pron: chipPron,
    parseKo,
    glossKo,
    parts,
    _chip: true,
    _mainChip: !!strong,
    _posKo: morphInfo.posLabel || "",
  };
}

function bump(map, key, bookId) {
  if (!map.has(key)) map.set(key, { total: 0, byBook: {} });
  const row = map.get(key);
  row.total += 1;
  row.byBook[bookId] = (row.byBook[bookId] || 0) + 1;
}

function buildFamily(strong, strongLex) {
  const self = normH(strong);
  const entry = strongLex[self];
  const root = normH(entry?.rootStrong) || self;
  const out = [];
  for (const [id, e] of Object.entries(strongLex)) {
    const hid = normH(id);
    if (hid === self || !e?.word) continue;
    const r = normH(e.rootStrong) || hid;
    if (r === root || hid === root || r === self) out.push(hid);
  }
  return [...new Set(out)]
    .sort((a, b) => Number(padNum(a)) - Number(padNum(b)))
    .slice(0, FAMILY_MAX);
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

/** 개역한글 단어 ↔ 칩 연결 검사 */
function findChipForKr(chapterJson, krWord, strongHint) {
  const hits = [];
  for (const v of chapterJson.verses || []) {
    for (const w of v.words || []) {
      const g = w.glossKo || "";
      const okStrong = strongHint ? w.strong === strongHint : true;
      const okGloss =
        g.includes(krWord.replace(/하시고|하시니라|하시다/g, "")) ||
        (krWord.includes("응답") && /응답/.test(g)) ||
        (krWord.includes("창조") && /창조/.test(g)) ||
        (krWord.includes("목자") && /목자/.test(g));
      if (okStrong && (okGloss || w.strong === strongHint)) {
        hits.push({
          ref: w.ref,
          i: w.i,
          word: w.word,
          pron: w.pron,
          glossKo: w.glossKo,
          strong: w.strong,
          parts: w.parts,
        });
      }
    }
  }
  return hits;
}

async function main() {
  const all = process.argv.includes("--all");
  console.log("[he-chips] OSHB KJV-notes → chip-per-lexeme → public/word-study/");

  const strongLex = loadStrongLex();
  const notes = loadNotes();
  const targets = all
    ? BOOKS.map((b) => ({ id: b.id, chapters: null }))
    : PILOT;

  for (const t of targets) {
    const meta = BOOKS.find((b) => b.id === t.id);
    await ensureOshbXml(meta.osis);
  }

  const strongCounts = new Map();
  const strongPos = new Map();
  const strongLemma = new Map();
  const strongGloss = new Map();
  const strongPron = new Map();
  const phrasesByStrong = new Map();
  const mismatchChapters = [];
  const emitStats = [];

  for (const t of targets) {
    const meta = BOOKS.find((b) => b.id === t.id);
    const list = parseOshbXml(path.join(OSHB_DIR, `${meta.osis}.xml`));
    const byCh = mapBookByKjvNotes(meta.id, list);

    // 스캔(집계): 매핑된 전체 장
    const scanChapters = [...byCh.keys()].sort((a, b) => a - b);
    for (const ch of scanChapters) {
      const vmap = byCh.get(ch);
      for (const [v, rows] of vmap) {
        const ref = `${meta.id} ${ch}:${v}`;
        const chips = rows.map((r) => buildChip(r, strongLex, notes));
        const main = chips.filter((c) => c._mainChip);
        for (const c of main) {
          bump(strongCounts, c.strong, meta.id);
          if (!strongLemma.has(c.strong)) strongLemma.set(c.strong, c.lemma);
          if (!strongGloss.has(c.strong) && c.glossKo) strongGloss.set(c.strong, c.glossKo);
          if (!strongPron.has(c.strong) && c.pron) strongPron.set(c.strong, c.pron);
          if (c._posKo) {
            if (!strongPos.has(c.strong)) strongPos.set(c.strong, new Map());
            const pm = strongPos.get(c.strong);
            pm.set(c._posKo, (pm.get(c._posKo) || 0) + 1);
          }
        }
        for (let n = 2; n <= 3; n++) {
          for (let i = 0; i + n <= main.length; i++) {
            const slice = main.slice(i, i + n);
            const key = slice.map((w) => w.strong).join(" ");
            const heb = slice.map((w) => w.word).join(" ");
            for (const w of slice) {
              if (!phrasesByStrong.has(w.strong)) phrasesByStrong.set(w.strong, new Map());
              const bag = phrasesByStrong.get(w.strong);
              if (!bag.has(key)) bag.set(key, { hebVotes: new Map(), count: 0, refs: [] });
              const row = bag.get(key);
              row.count += 1;
              row.hebVotes.set(heb, (row.hebVotes.get(heb) || 0) + 1);
              if (row.refs.length < PHRASE_REFS_MAX && !row.refs.includes(ref)) row.refs.push(ref);
            }
          }
        }
      }
    }

    // 불일치 장 자동 출력
    for (const ch of scanChapters) {
      const mapped = byCh.get(ch)?.size || 0;
      const krv = krvVerseCount(meta.id, ch);
      if (krv != null && mapped !== krv) {
        mismatchChapters.push({
          book: meta.id,
          ch,
          mappedVerses: mapped,
          krvVerses: krv,
          delta: mapped - krv,
        });
      }
    }

    const outChapters = t.chapters || scanChapters;
    const outBook = path.join(OUT_ROOT, meta.id);
    fs.mkdirSync(outBook, { recursive: true });

    for (const ch of outChapters) {
      if (!byCh.has(ch)) {
        console.warn(`[skip] ${meta.id} ${ch}`);
        continue;
      }
      const vmap = byCh.get(ch);
      const verses = [];
      let wordCount = 0;
      for (const [v, rows] of [...vmap.entries()].sort((a, b) => a[0] - b[0])) {
        const words = [];
        let i = 0;
        for (const row of rows) {
          const chip = buildChip(row, strongLex, notes);
          words.push({
            ref: `${ch}:${v}`,
            i,
            word: chip.word,
            lemma: chip.lemma,
            strong: chip.strong,
            pron: chip.pron,
            parseKo: chip.parseKo,
            glossKo: chip.glossKo,
            parts: chip.parts,
          });
          i += 1;
          wordCount += 1;
        }
        verses.push({ n: v, words });
      }
      const out = {
        book: meta.id,
        chapter: ch,
        sources: {
          wlc: "Westminster Leningrad Codex (Public Domain)",
          morphhb: "Open Scriptures Hebrew Bible morphhb (CC BY 4.0)",
          verseMap: "OSHB inline <note>KJV:Book.ch.v</note>",
          lexicon: "OSHB HebrewLexicon / Strong's (Public Domain)",
        },
        verses,
      };
      fs.writeFileSync(path.join(outBook, `${ch}.json`), JSON.stringify(out) + "\n");
      emitStats.push({ book: meta.id, ch, verses: verses.length, chips: wordCount });
      console.log(`[${meta.id}] ch ${ch} → ${verses.length}v / ${wordCount} chips`);
    }
  }

  // lexicon
  const emitted = new Set();
  for (const st of emitStats) {
    const j = JSON.parse(fs.readFileSync(path.join(OUT_ROOT, st.book, `${st.ch}.json`), "utf8"));
    for (const v of j.verses) {
      for (const w of v.words) {
        if (w.strong && /^H\d+/.test(w.strong)) emitted.add(w.strong);
      }
    }
  }
  for (const s of [...emitted]) {
    for (const f of buildFamily(s, strongLex)) emitted.add(f);
    const root = normH(strongLex[s]?.rootStrong);
    if (root) emitted.add(root);
  }

  fs.mkdirSync(OUT_LEX, { recursive: true });
  let lexN = 0;
  for (const strong of [...emitted].sort((a, b) => Number(padNum(a)) - Number(padNum(b)))) {
    const entry = strongLex[strong];
    const note = notes[strong] || {};
    const counts = strongCounts.get(strong) || { total: 0, byBook: {} };
    const posMap = strongPos.get(strong);
    const posKo = posMap
      ? [...posMap.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : "";
    const lemma = strongLemma.get(strong) || entry?.word || strong;
    const rootStrong = normH(entry?.rootStrong);
    let root = null;
    if (rootStrong && rootStrong !== strong) {
      root = {
        lemma: strongLex[rootStrong]?.word || rootStrong,
        strong: rootStrong,
        glossKo: notes[strong]?.rootNote || lookupTanakh(rootStrong)?.gloss || "",
      };
    }
    const family = buildFamily(strong, strongLex)
      .filter((id) => emitted.has(id))
      .map((id) => ({
        lemma: strongLemma.get(id) || strongLex[id]?.word || id,
        strong: id,
        pron: notes[id]?.pron || strongPron.get(id) || "",
        glossKo: strongGloss.get(id) || lookupTanakh(id)?.gloss || "",
      }));

    let phrases = [];
    const bag = phrasesByStrong.get(strong);
    if (bag) {
      const rows = [];
      for (const [key, row] of bag) {
        if (row.count < PHRASE_MIN) continue;
        const strongs = key.split(" ");
        if (strongs.length < 2 || strongs.length > 3) continue;
        const heb = [...row.hebVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
        const forms = heb.split(" ");
        rows.push({
          hebrew: heb,
          pron: strongs
            .map((s, i) => notes[s]?.pron || strongPron.get(s) || pronFixed(forms[i] || ""))
            .join(" "),
          lemmas: strongs.map((s) => strongLemma.get(s) || strongLex[s]?.word || s),
          words: strongs.map((s, i) => ({
            word: forms[i] || "",
            lemma: strongLemma.get(s) || strongLex[s]?.word || s,
            strong: s,
            pron: notes[s]?.pron || strongPron.get(s) || "",
          })),
          count: row.count,
          refs: row.refs.slice(0, PHRASE_REFS_MAX),
          glossKo: "",
        });
      }
      rows.sort((a, b) => b.count - a.count || a.hebrew.localeCompare(b.hebrew, "he"));
      phrases = rows.slice(0, PHRASE_MAX);
    }

    const obj = {
      lemma,
      pron: note.pron || strongPron.get(strong) || (entry?.word ? pronFixed(entry.word) : ""),
      strong,
      posKo,
      root,
      family,
      defEn: clip(note.defEn || entry?.defEn || "", DEF_EN_MAX),
      defKo: note.defKo || "",
      countOT: counts.total,
      byBook: Object.fromEntries(
        Object.entries(counts.byBook).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      ),
      phrases,
    };
    fs.writeFileSync(path.join(OUT_LEX, `${strong}.json`), JSON.stringify(obj, null, 2) + "\n");
    lexN += 1;
  }

  // 연결 확인
  const ps20 = JSON.parse(fs.readFileSync(path.join(OUT_ROOT, "psalms", "20.json"), "utf8"));
  const ps23 = JSON.parse(fs.readFileSync(path.join(OUT_ROOT, "psalms", "23.json"), "utf8"));
  const gen1 = JSON.parse(fs.readFileSync(path.join(OUT_ROOT, "genesis", "1.json"), "utf8"));

  const link = {
    "시20:1 응답하시고": findChipForKr(ps20, "응답", "H6030"),
    "창1:1 창조하시니라": findChipForKr(gen1, "창조", "H1254"),
    "시23:1 목자": findChipForKr(ps23, "목자", "H7462"),
  };

  const ps20v1 = ps20.verses.find((v) => v.n === 1);
  const report = {
    mode: all ? "all" : "pilot",
    verseMapSource: "OSHB <note>KJV:Book.ch.v</note> only (no hand list)",
    mismatchVsKrv: mismatchChapters,
    mismatchInPilotEmit: mismatchChapters.filter((m) =>
      emitStats.some((e) => e.book === m.book && e.ch === m.ch),
    ),
    emit: emitStats,
    lexiconFiles: lexN,
    sizes: {
      psalms: dirSize(path.join(OUT_ROOT, "psalms")),
      genesis: dirSize(path.join(OUT_ROOT, "genesis")),
      lexicon: dirSize(OUT_LEX),
    },
    pronChecks: {
      מזמור: pronFixed("מִזְמ֥וֹר"),
      ישגבך: pronFixed("יְ֝שַׂגֶּבְ/ךָ֗"),
      מנצח: pronFixed("מְנַצֵּ֗חַ"),
      למנצח: pronFixed("לַ/מְנַצֵּ֗חַ"),
      יענך: pronFixed("יַֽעַנְ/ךָ֣"),
    },
    psalm20_1_sample: (ps20v1?.words || []).slice(0, 6).map((w) => ({
      word: w.word,
      pron: w.pron,
      glossKo: w.glossKo,
      parts: w.parts,
    })),
    krChipLinks: link,
  };

  const reportPath = path.join(OUT_ROOT, "_hebrew-chips-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log("\n=== REPORT ===");
  console.log(JSON.stringify(report, null, 2));
  console.log(`[report] ${reportPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
