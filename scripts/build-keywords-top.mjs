// =============================================================================
// 원어 탭 "장별 핵심 단어" JSON 생성.
//
// 원본: public/bible-v2/chapters/<bookId>/<chapter>.json
// 신학 핵심어: scripts/lib/key-terms.json
// 사전:
//   .cache/oshb/HebrewStrong.xml → 캐시 .cache/oshb/strong-he-enriched.json
//   .cache/strongs-greek/strongsgreek.xml → 캐시 .cache/strongs-greek/strong-el.json
//     (헬라어는 같은 필드 구조만 준비, NT 생성 시 사용)
// 수동 우선: data/keyword-picks/<bookId>.json
//
// 산출: public/keywords-top/<bookId>/<chapter>.json
//
// 사용:
//   node scripts/build-keywords-top.mjs genesis --chapters 1-3
//   node scripts/build-keywords-top.mjs --all
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeMorph } from "./lib/hebrew-morph-parse.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const SRC_ROOT = path.join(repoRoot, "public", "bible-v2", "chapters");
const OUT_ROOT = path.join(repoRoot, "public", "keywords-top");
const PICKS_ROOT = path.join(repoRoot, "data", "keyword-picks");
const KEY_TERMS_PATH = path.join(__dirname, "lib", "key-terms.json");

const OSHB_XML = path.join(repoRoot, ".cache", "oshb", "HebrewStrong.xml");
const OSHB_CACHE = path.join(repoRoot, ".cache", "oshb", "strong-he-enriched.json");
const GREEK_XML = path.join(repoRoot, ".cache", "strongs-greek", "strongsgreek.xml");
const GREEK_CACHE = path.join(repoRoot, ".cache", "strongs-greek", "strong-el.json");

const MIN_WORDS = 5;
const MAX_WORDS = 9;

const ALLOWED_POS = new Set(["명사", "동사", "형용사", "고유명사"]);

const BLOCKED_POS = new Set([
  "접속사",
  "전치사",
  "대명사",
  "접미대명사",
  "소사",
  "부사",
  "정관사",
  "인칭대명사",
  "지시대명사",
  "관계대명사",
  "의문/부정 대명사",
]);

const EXCLUDE_STRONG = new Set([
  "H1961",
  "H559",
  "H834",
  "H853",
  "H413",
  "H5921",
  "H3588",
  "H3808",
  "H3605",
  "H935",
  "H5414",
  "H3947",
  "H7200",
  "H6213",
  "H1980",
  "H7121",
  "H2009",
  "H1571",
  "H4480",
  "H5704",
  "H996",
  "H854",
  "H3651",
  "H3541",
  "H2088",
  "H1931",
  "H589",
  "H859",
  "H3205",
  "H1121",
  "H1",
  "H251",
  "H8033",
  "H3117",
]);

const EXCLUDE_LEMMA_GREEK = new Set([
  "καί",
  "ὁ",
  "εἰμί",
  "ἔχω",
  "μέλλω",
  "δύναμαι",
  "θέλω",
  "δεῖ",
  "λέγω",
  "αὐτός",
  "ἐγώ",
  "σύ",
  "οὐ",
  "μή",
  "ὅτι",
  "δέ",
  "οὖν",
  "γάρ",
  "ἀλλά",
  "εἰ",
  "ὡς",
  "ἵνα",
  "μέν",
  "τε",
  "οὖτος",
  "ὅς",
  "τίς",
  "τις",
  "ἐν",
  "εἰς",
  "ἐκ",
  "πρός",
  "διά",
  "ἀπό",
  "κατά",
  "μετά",
  "περί",
  "ὑπό",
  "ἐπί",
  "παρά",
  "σύν",
  "ἔρχομαι",
  "ποιέω",
  "δίδωμι",
  "ὁράω",
  "γίνομαι",
  "ἀκούω",
  "οἶδα",
  "πᾶς",
  "εἷς",
  "πολύς",
]);

/** OSHB 어간 → 한국어 "○형" */
const STEM_KO = {
  Qal: "칼형",
  Niphal: "니팔형",
  Piel: "피엘형",
  Pual: "푸알형",
  Hiphil: "히필형",
  Hophal: "호팔형",
  Hithpael: "히트파엘형",
  Polel: "폴렐형",
  Polal: "폴랄형",
  Hithpolel: "히트폴렐형",
  Poel: "포엘형",
  Poal: "포알형",
  "Qal pass.": "칼수동형",
};

const keyTermsFile = JSON.parse(fs.readFileSync(KEY_TERMS_PATH, "utf8"));
const KEY_TERM_IDS = new Set(keyTermsFile.terms.map((t) => t.id));

const ALL_BOOK_IDS = fs
  .readdirSync(SRC_ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

function stripTags(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clip120(s) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= 120) return t;
  return t.slice(0, 117).trimEnd() + "…";
}

/** HebrewStrong.xml → enriched lexicon (defEn, rootStrong, …) */
function ensureHebrewLexicon() {
  if (fs.existsSync(OSHB_CACHE)) {
    return JSON.parse(fs.readFileSync(OSHB_CACHE, "utf8"));
  }
  if (!fs.existsSync(OSHB_XML)) {
    throw new Error(
      `OSHB 사전 없음: ${OSHB_XML}\nOpen Scriptures HebrewLexicon HebrewStrong.xml 을 두세요.`,
    );
  }
  const xml = fs.readFileSync(OSHB_XML, "utf8");
  const entryRe = /<entry id="(H\d+)">([\s\S]*?)<\/entry>/g;
  const out = {};
  let m;
  while ((m = entryRe.exec(xml)) !== null) {
    const id = m[1];
    const body = m[2];
    const wMatch = body.match(/<w\b[^>]*>([\s\S]*?)<\/w>/);
    const hebrew = wMatch ? stripTags(wMatch[1]) : "";
    const xlit = body.match(/<w\b[^>]*\bxlit="([^"]*)"/)?.[1] || "";
    const pron = body.match(/<w\b[^>]*\bpron="([^"]*)"/)?.[1] || "";
    const sourceBody = body.match(/<source>([\s\S]*?)<\/source>/)?.[1] || "";
    const rootStrong = sourceBody.match(/\bsrc="(H\d+)"/)?.[1] || null;
    const defs = [...body.matchAll(/<def>([\s\S]*?)<\/def>/g)].map((x) =>
      stripTags(x[1]),
    );
    const meaning = stripTags(body.match(/<meaning>([\s\S]*?)<\/meaning>/)?.[1] || "");
    const usage = stripTags(body.match(/<usage>([\s\S]*?)<\/usage>/)?.[1] || "");
    let defEn = defs.length ? defs.join("; ") : meaning || usage;
    defEn = clip120(defEn);
    out[id] = {
      word: hebrew,
      xlit,
      pronEn: pron,
      rootStrong,
      defEn,
      usage,
    };
  }
  fs.mkdirSync(path.dirname(OSHB_CACHE), { recursive: true });
  fs.writeFileSync(OSHB_CACHE, JSON.stringify(out));
  console.log(`[lexicon] Hebrew enriched ${Object.keys(out).length} → ${OSHB_CACHE}`);
  return out;
}

/**
 * Strong's Greek XML → 동일 필드 구조 캐시 (지금은 NT 미생성, 구조만).
 * entry strongs="3056" …
 */
function ensureGreekLexicon() {
  if (fs.existsSync(GREEK_CACHE)) {
    return JSON.parse(fs.readFileSync(GREEK_CACHE, "utf8"));
  }
  if (!fs.existsSync(GREEK_XML)) {
    console.warn(`[lexicon] Greek XML 없음 (구조만 스킵): ${GREEK_XML}`);
    return {};
  }
  const xml = fs.readFileSync(GREEK_XML, "utf8");
  const entryRe = /<entry\b[^>]*\bstrongs="(\d+)"[^>]*>([\s\S]*?)<\/entry>/g;
  const out = {};
  let m;
  while ((m = entryRe.exec(xml)) !== null) {
    const id = `G${m[1]}`;
    const body = m[2];
    const greek =
      body.match(/<greek\b[^>]*\bunicode="([^"]+)"/)?.[1] ||
      stripTags(body.match(/<greek\b[^>]*\/?>/)?.[0] || "") ||
      "";
    const pron =
      body.match(/<pronunciation\b[^>]*\bstrongs="([^"]+)"/)?.[1] ||
      stripTags(body.match(/<pronunciation[^>]*>([\s\S]*?)<\/pronunciation>/)?.[1] || "");
    const defEn = clip120(
      stripTags(body.match(/<strongs_def>([\s\S]*?)<\/strongs_def>/)?.[1] || "") ||
        stripTags(body.match(/<kjv_def>([\s\S]*?)<\/kjv_def>/)?.[1] || ""),
    );
    const der = body.match(/<strongs_derivation>([\s\S]*?)<\/strongs_derivation>/)?.[1] || "";
    const rootStrong = der.match(/strongs="(\d+)"/)?.[1]
      ? `G${der.match(/strongs="(\d+)"/)[1]}`
      : null;
    out[id] = { word: greek, xlit: "", pronEn: pron, rootStrong, defEn, usage: "" };
  }
  fs.mkdirSync(path.dirname(GREEK_CACHE), { recursive: true });
  fs.writeFileSync(GREEK_CACHE, JSON.stringify(out));
  console.log(`[lexicon] Greek ${Object.keys(out).length} → ${GREEK_CACHE}`);
  return out;
}

const HE_LEX = ensureHebrewLexicon();
const EL_LEX = ensureGreekLexicon(); // 구조 준비

function isHebrewBook(bookId) {
  const sample = path.join(SRC_ROOT, bookId, "1.json");
  if (!fs.existsSync(sample)) return false;
  const meta = JSON.parse(fs.readFileSync(sample, "utf8")).meta || {};
  return meta.lang === "he";
}

function cleanW(w) {
  return String(w || "")
    .replace(/\//g, "")
    .replace(/[\u0591-\u05AF\u05BD\u05BF\u05C0\u05C3-\u05C5\u05C7]/g, "")
    .trim();
}

function posFromParse(parse) {
  if (!parse) return "";
  const parts = String(parse).split("/");
  const last = parts[parts.length - 1] || "";
  if (/(?:^|[^A-Za-z])Np(?:$|[^a-z])/.test(last) || last.includes("Np")) {
    return "고유명사";
  }
  const core = last.replace(/^H/, "");
  if (core.startsWith("V")) return "동사";
  if (core.startsWith("N")) return "명사";
  if (core.startsWith("A")) return "형용사";
  return "";
}

function contentPos(token) {
  if (token.nameType) return "고유명사";
  if (token.parse && /\bNp\b|HNp/.test(token.parse)) return "고유명사";
  const label = token.posLabel || "";
  if (label === "명사" || label === "동사" || label === "형용사") return label;
  if (label && BLOCKED_POS.has(label)) return "";
  const fromParse = posFromParse(token.parse);
  if (fromParse === "고유명사" || ALLOWED_POS.has(fromParse)) return fromParse;
  if (token.pos === "N-") return "명사";
  if (token.pos === "V-") return "동사";
  if (token.pos === "A-") return "형용사";
  return "";
}

function isHebrewToken(token) {
  return typeof token.strong === "string" && /^H\d+$/.test(token.strong);
}

function lemmaKey(token) {
  if (isHebrewToken(token)) return token.strong;
  return token.lemma || "";
}

function isProperName(token) {
  if (token.nameType === "person" || token.nameType === "place") return true;
  if (contentPos(token) === "고유명사") return true;
  if (token.parse && /\bNp\b|HNp/.test(token.parse)) return true;
  return false;
}

function isContentCandidate(token) {
  const key = lemmaKey(token);
  if (!key) return false;
  if (isHebrewToken(token)) {
    if (EXCLUDE_STRONG.has(token.strong)) return false;
  } else if (EXCLUDE_LEMMA_GREEK.has(token.lemma)) {
    return false;
  }
  if (token.posLabel && BLOCKED_POS.has(token.posLabel)) return false;
  if (/^(RA|C-|P-|RP|RD|RR|RI)$/.test(token.pos || "")) return false;
  const pos = contentPos(token);
  if (!pos || !ALLOWED_POS.has(pos)) return false;
  return true;
}

/** OSHB morph → "명사, 남성" / "동사, 칼형" */
function formatPosDetail(parse, pos) {
  if (pos === "고유명사") return "고유명사";
  if (!parse) return pos || "";
  const lang = parse[0] === "A" ? "A" : "H";
  const parts = String(parse)
    .split("/")
    .map((p) => (p && (p[0] === "H" || p[0] === "A") ? p : lang + p));
  const posLetter = (p) => (p || "").replace(/^[HA]/, "")[0] || "";
  // 접두·접미가 섞여 있으면 동사 > 명사/형용사 > 마지막
  const main =
    parts.find((p) => posLetter(p) === "V") ||
    parts.find((p) => posLetter(p) === "N" || posLetter(p) === "A") ||
    parts[parts.length - 1] ||
    "";
  const rest = main.replace(/^[HA]/, "");
  const posC = rest[0];
  if (posC === "V") {
    const decoded = decodeMorph(main);
    const stemEn = (decoded.parseLabel || "").split(" ")[0] || "";
    const stemKo = STEM_KO[stemEn] || (stemEn ? `${stemEn}형` : "");
    return stemKo ? `동사, ${stemKo}` : "동사";
  }
  if (posC === "N" || posC === "A") {
    // N c m s c → type, gender, number, state
    const g = { m: "남성", f: "여성", b: "공성", c: "공성" }[rest[2]] || "";
    const label = posC === "N" ? "명사" : "형용사";
    if (rest[1] === "p") return "고유명사";
    return g ? `${label}, ${g}` : label;
  }
  return pos || "";
}

function parseChaptersArg(args) {
  const i = args.indexOf("--chapters");
  if (i < 0 || !args[i + 1]) return null;
  const spec = args[i + 1];
  if (spec.includes("-")) {
    const [a, b] = spec.split("-").map(Number);
    const out = [];
    for (let n = a; n <= b; n++) out.push(n);
    return out;
  }
  return spec.split(",").map(Number);
}

function listChapterFiles(bookId) {
  return fs
    .readdirSync(path.join(SRC_ROOT, bookId))
    .filter((f) => /^\d+\.json$/.test(f))
    .map((f) => Number(f.replace(".json", "")))
    .sort((a, b) => a - b);
}

function loadChapter(bookId, ch) {
  return JSON.parse(
    fs.readFileSync(path.join(SRC_ROOT, bookId, `${ch}.json`), "utf8"),
  );
}

/**
 * 구약/신약 전체: 총빈도 + 책별 개수 + Strong→한글음역/원형 맵
 */
function buildTestamentIndex(hebrew) {
  const books = ALL_BOOK_IDS.filter((id) => isHebrewBook(id) === hebrew);
  const freq = new Map();
  /** @type {Map<string, Record<string, number>>} */
  const byBook = new Map();
  const pronByStrong = new Map();
  const wordByStrong = new Map();

  for (const bookId of books) {
    for (const ch of listChapterFiles(bookId)) {
      const data = loadChapter(bookId, ch);
      for (const v of data.verses || []) {
        for (const t of v.tokens || []) {
          const key = lemmaKey(t);
          if (!key) continue;
          freq.set(key, (freq.get(key) || 0) + 1);
          if (!byBook.has(key)) byBook.set(key, {});
          const rb = byBook.get(key);
          rb[bookId] = (rb[bookId] || 0) + 1;
          if (isHebrewToken(t)) {
            if (!pronByStrong.has(key) && (t.lemmaP || t.p)) {
              pronByStrong.set(key, t.lemmaP || t.p);
            }
            if (!wordByStrong.has(key) && t.lemma) {
              wordByStrong.set(key, cleanW(t.lemma));
            }
          }
        }
      }
    }
  }
  return { freq, byBook, pronByStrong, wordByStrong };
}

function rarityScore(inTestament) {
  if (inTestament <= 3) return 45;
  if (inTestament <= 8) return 35;
  if (inTestament <= 20) return 25;
  if (inTestament <= 50) return 15;
  if (inTestament <= 120) return 8;
  if (inTestament <= 300) return 2;
  return -10;
}

function repeatScore(inChapter) {
  if (inChapter >= 2) return 25 + Math.min(inChapter, 8) * 4;
  return 0;
}

function scoreCandidate({ inChapter, inTestament, isKey, isProper, firstProper }) {
  if (isProper && !firstProper) return -Infinity;
  if (!isKey && !isProper && inChapter < 2 && inTestament > 400) return -Infinity;
  if (!isKey && !isProper && inTestament > 800) return -Infinity;

  let s = 0;
  s += repeatScore(inChapter);
  s += rarityScore(inTestament);
  if (isKey) {
    s += 40;
    if (inChapter === 1 && inTestament <= 20) s += 20;
  }
  if (isProper && firstProper) s += 18;
  if (isKey && inChapter >= 20 && inTestament > 1000) s -= 25;
  if (inChapter === 1 && inTestament > 200 && !isKey) s -= 15;
  return s;
}

function collectChapterLemmas(data, ch) {
  const map = new Map();
  for (const v of data.verses || []) {
    const ref = `${ch}:${v.n}`;
    for (const t of v.tokens || []) {
      if (!isContentCandidate(t)) continue;
      const key = lemmaKey(t);
      let entry = map.get(key);
      if (!entry) {
        const lemmaWord = isHebrewToken(t)
          ? cleanW(t.lemma || t.w)
          : t.lemma || cleanW(t.w);
        entry = {
          lemma: key,
          word: lemmaWord,
          pron: t.lemmaP || t.p || "",
          gloss: (t.gloss && String(t.gloss).trim()) || (t.meanings && t.meanings[0]) || "",
          pos: contentPos(t),
          parse: t.parse || "",
          refs: [],
          inChapter: 0,
          isProper: isProperName(t),
          nameType: t.nameType || null,
          hebrew: isHebrewToken(t),
        };
        map.set(key, entry);
      }
      entry.inChapter += 1;
      if (!entry.refs.includes(ref)) entry.refs.push(ref);
    }
  }
  return map;
}

function buildFirstProperChapter(bookId) {
  const first = new Map();
  for (const ch of listChapterFiles(bookId)) {
    const data = loadChapter(bookId, ch);
    for (const v of data.verses || []) {
      for (const t of v.tokens || []) {
        if (!isProperName(t)) continue;
        const key = lemmaKey(t);
        if (!key || first.has(key)) continue;
        first.set(key, ch);
      }
    }
  }
  return first;
}

function loadPicks(bookId) {
  const p = path.join(PICKS_ROOT, `${bookId}.json`);
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function buildRoot(strongId, index) {
  const lex = HE_LEX[strongId];
  if (!lex?.rootStrong) return null;
  const rs = lex.rootStrong;
  const rootLex = HE_LEX[rs];
  return {
    strong: rs,
    word: rootLex?.word || index.wordByStrong.get(rs) || "",
    pron: index.pronByStrong.get(rs) || "",
    gloss: "",
  };
}

function enrichWord(entry, index) {
  const strong = entry.hebrew ? entry.lemma : entry.lemma; // H#### or greek lemma
  const lex = entry.hebrew ? HE_LEX[strong] : null;
  // 헬라어는 구조만 — EL_LEX[G####] 는 lemma 가 그리스 원형일 때 나중에 매핑
  const defEn = lex?.defEn || "";
  const refsAll = index.byBook.get(entry.lemma) || { [entry._bookId || ""]: entry.inChapter };
  // 책 키만 남기고 0 제거
  const refsClean = {};
  for (const [b, n] of Object.entries(refsAll)) {
    if (n > 0) refsClean[b] = n;
  }

  return {
    lemma: entry.lemma,
    word: entry.word,
    pron: entry.pron,
    gloss: entry.gloss,
    pos: entry.pos,
    strong: entry.hebrew ? entry.lemma : "",
    posDetail: formatPosDetail(entry.parse, entry.pos),
    root: entry.hebrew ? buildRoot(entry.lemma, index) : null,
    defEn,
    defKo: "",
    refs: entry.refs,
    refsAll: refsClean,
    inChapter: entry.inChapter,
    inTestament: entry.inTestament,
    note: "",
  };
}

function pickForChapter({
  chapterMap,
  index,
  firstProper,
  chapterNum,
  picks,
  bookId,
}) {
  const include = new Set(picks?.include || []);
  const exclude = new Set(picks?.exclude || []);
  const { freq } = index;

  const scored = [];
  for (const [lemma, entry] of chapterMap) {
    if (exclude.has(lemma)) continue;
    const inTestament = freq.get(lemma) || entry.inChapter;
    const isKey = KEY_TERM_IDS.has(lemma);
    const firstProperOk = !entry.isProper || firstProper.get(lemma) === chapterNum;
    const score = scoreCandidate({
      inChapter: entry.inChapter,
      inTestament,
      isKey,
      isProper: entry.isProper,
      firstProper: firstProperOk,
    });
    if (score === -Infinity && !include.has(lemma)) continue;
    scored.push({
      ...entry,
      inTestament,
      _bookId: bookId,
      score: include.has(lemma) ? score + 1000 : score,
      forced: include.has(lemma),
    });
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.inChapter - a.inChapter ||
      a.inTestament - b.inTestament ||
      a.lemma.localeCompare(b.lemma),
  );

  const positive = scored.filter((x) => x.score > 0 || x.forced);
  let target = Math.min(MAX_WORDS, Math.max(MIN_WORDS, Math.min(7, positive.length || MIN_WORDS)));
  if (positive.length >= 9) target = 9;
  else if (positive.length >= 7) target = 7;
  else if (positive.length >= 5) target = 5;
  else target = Math.min(MAX_WORDS, Math.max(positive.length, Math.min(MIN_WORDS, scored.length)));

  return scored.slice(0, target).map((e) => enrichWord(e, index));
}

function buildBook(bookId, chapterFilter) {
  const hebrew = isHebrewBook(bookId);
  console.log(`[${bookId}] ${hebrew ? "구약" : "신약"} 빈도·책별 집계 중…`);
  // EL_LEX 참조로 미사용 경고 방지 + 구조 로드 확인
  if (!hebrew && Object.keys(EL_LEX).length === 0) {
    console.warn(`[${bookId}] Greek lexicon empty — strong/defEn 등은 비울 수 있음`);
  }
  const index = buildTestamentIndex(hebrew);
  const firstProper = buildFirstProperChapter(bookId);
  const picksAll = loadPicks(bookId);

  const chapters = listChapterFiles(bookId).filter((ch) =>
    chapterFilter ? chapterFilter.includes(ch) : true,
  );

  const outDir = path.join(OUT_ROOT, bookId);
  fs.mkdirSync(outDir, { recursive: true });

  const report = [];
  for (const ch of chapters) {
    const data = loadChapter(bookId, ch);
    const chapterMap = collectChapterLemmas(data, ch);
    const words = pickForChapter({
      chapterMap,
      index,
      firstProper,
      chapterNum: ch,
      picks: picksAll[String(ch)] || picksAll[ch],
      bookId,
    });
    const json = JSON.stringify({ words });
    fs.writeFileSync(path.join(outDir, `${ch}.json`), json);
    const bytes = Buffer.byteLength(json);
    report.push({ ch, words, bytes });
    console.log(
      `[${bookId} ${ch}] ${words.length}개, ${(bytes / 1024).toFixed(1)} KB — ` +
        words.map((w) => w.pron || w.lemma).join(", "),
    );
  }
  return report;
}

function main() {
  const args = process.argv.slice(2);
  const chapterFilter = parseChaptersArg(args);
  const bookArgs = args.filter((a, i, arr) => {
    if (a === "--all" || a === "--chapters") return false;
    if (arr[i - 1] === "--chapters") return false;
    return true;
  });
  const targets = args.includes("--all") ? ALL_BOOK_IDS : bookArgs;

  if (targets.length === 0) {
    console.error(
      "사용법: node scripts/build-keywords-top.mjs <bookId> [--chapters 1-3] | --all",
    );
    process.exit(1);
  }

  for (const bookId of targets) {
    buildBook(bookId, chapterFilter);
  }
}

main();
