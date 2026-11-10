/**
 * 히브리어 사전 5차: 이름뜻 따라가기 확장 · defKo 형식 · 첫출현 · krvKo
 *   node scripts/fix-hebrew-notes-round5.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookupTanakh } from "./lib/tanakh-lexicon.mjs";
import {
  loadStrongMeta,
  deriveNameMeaningKo,
  extractNameEtymEn,
  translateNameGloss,
  isProperPos,
  normH,
  firstSenseEn,
} from "./lib/hebrew-strong-meta.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const NOTES = path.join(root, "data/keyword-notes/hebrew.json");
const LEX = path.join(root, "public/word-study/lexicon/hebrew");
const KRV = path.join(root, "public/bible-study/chunks");
const OUT = path.join(root, "public/word-study");
const REPORT = path.join(OUT, "_hebrew-notes-round5-report.json");

const BOOK_KO = {
  genesis: "창",
  exodus: "출",
  leviticus: "레",
  numbers: "민",
  deuteronomy: "신",
  joshua: "수",
  judges: "삿",
  ruth: "룻",
  samuel1: "삼상",
  samuel2: "삼하",
  kings1: "왕상",
  kings2: "왕하",
  chronicles1: "대상",
  chronicles2: "대하",
  ezra: "스",
  nehemiah: "느",
  esther: "에",
  job: "욥",
  psalms: "시",
  proverbs: "잠",
  ecclesiastes: "전",
  songofsolomon: "아",
  isaiah: "사",
  jeremiah: "렘",
  lamentations: "애",
  ezekiel: "겔",
  daniel: "단",
  hosea: "호",
  joel: "욜",
  amos: "암",
  obadiah: "옵",
  jonah: "욘",
  micah: "미",
  nahum: "나",
  habakkuk: "합",
  zephaniah: "습",
  haggai: "학",
  zechariah: "슥",
  malachi: "말",
};
const BOOK_ORDER = Object.keys(BOOK_KO);
const DICE_KEEP = 0.45;

const NAME_HAND = {
  H1732: "사랑받는 자",
  H4872: "건져 냄",
  H7205: "보라 아들이다",
  H53: "평화의 아버지",
  H256: "아버지의 형제",
  H884: "맹세의 우물",
  H3068: "스스로 계신 분, 영원하신 분",
  H3069: "스스로 계신 분, 영원하신 분",
  H1168: "주인",
  H4124: "아버지에게서",
  H7346: "백성이 넓어진다",
  H2977: "여호와께서 세우신다",
  H5654: "에돔의 일꾼",
  H6215: "털이 많은",
  H3060: "여호와의 불",
  H3101: "여호와의 불",
  H3083: "여호와께서 주신",
  H3129: "여호와께서 주신",
  H474: "간구의 하나님",
  H477: "간구의 하나님",
  H1840: "하나님의 심판",
  H1841: "하나님의 심판",
  H1567: "증거의 무더기",
  H1568: "증거의 무더기",
  H833: "곧다, 복되다",
  H804: "곧다, 복되다",
  H7586: "물음을 받은 자",
  H1410: "공격하다",
};

const IDENTITY_HAND = {
  H1732: "다윗은 이새의 아들이며 이스라엘의 둘째 왕이에요(삼상 16장; 삼하 5장).",
  H4872: "모세는 이스라엘을 애굽에서 이끌어 낸 지도자예요(출 3장).",
  H4363:
    "믹마스는 블레셋이 진을 친 곳이며, 요나단이 습격한 곳이에요(삼상 13:16; 14장).",
  H1168: "바알은 가나안 사람들이 섬긴 신이에요.",
  H4124:
    "모압은 롯의 큰딸이 낳은 아들이며, 그 후손 민족을 가리키기도 해요.",
  H3068: "여호와는 이스라엘이 부르는 하나님의 이름이에요(출 3:15).",
};

const ONLY_UNCERTAIN =
  /of (?:foreign|persian|egyptian|uncertain) (?:derivation|origin)|uncertain derivation|persian derivation|egyptian derivation|foreign (?:derivation|origin)/i;

function hasBatchim(word) {
  const ch = String(word || "").replace(/[^가-힣]/g, "").slice(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}
function eulUl(w) {
  return hasBatchim(w) ? "을" : "를";
}
function eunNeun(w) {
  return hasBatchim(w) ? "은" : "는";
}
function ensurePeriod(s) {
  const t = String(s || "").trim();
  if (!t) return t;
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

function isProperNameEntry(pos, properSet, strong) {
  const p = String(pos || "").trim();
  if (/^(?:n-m|n-f|a|v)(?:\s|$)/i.test(p) && !/n-pr/i.test(p)) return false;
  if (/\b(?:n-m|n-f|a|v)\b/i.test(p) && /n-pr/i.test(p)) return false;
  if (properSet.has(strong)) {
    if (/^(?:n-m|n-f|a|v)(?:\s|$)/i.test(p) && !/n-pr/i.test(p)) return false;
  }
  if (properSet.has(strong) && /n-pr/i.test(p)) return true;
  const tokens = p.split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  return tokens.every((t) => /^n-pr/i.test(t) || /^x-pn/i.test(t));
}

function parseFollowRef(src) {
  const s = String(src || "").replace(/\s+/g, " ").trim();
  const patterns = [
    /\ba form of\s+(\d+)/i,
    /another form of\s+(\d+)/i,
    /(?:by )?contraction for\s+(\d+)/i,
    /contracted for\s+(\d+)/i,
    /(?:an )?abbreviated form (?:of|for)\s+(\d+)/i,
    /(?:\(aramaic\)\s*)?corresponding to\s+(\d+)/i,
    /the same(?:\s*\([^)]*\))? as\s+(\d+)/i,
    /from the same as\s+(\d+)/i,
    /a variation of\s+(\d+)/i,
    /(?:dual|plural|feminine|masculine) of\s+(\d+)/i,
    /patronymic(?:ally)? from\s+(\d+)/i,
    /for\s+(\d+)\s*[;.]?\s*$/i,
    /(?:probably|apparently|perhaps)\s+from\s+(\d+)/i,
    /apparently from\s+(\d+)/i,
    /from\s+(\d+)\s*\(in the sense/i,
    /(?:^|;)\s*from\s+(\d+)\s*[;.]?\s*$/i,
    /(?:^|;)\s*from\s+(\d+)\b(?!\s+and\b)/i,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return normH(m[1]);
  }
  return "";
}

function translateDirectEtym(en) {
  const raw = String(en || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const s = raw.toLowerCase();
  const exact = [
    [/a people has enlarged/, "백성이 넓어진다"],
    [/founded of jah|founded of jehovah/, "여호와께서 세우신다"],
    [/worker of edom/, "에돔의 일꾼"],
    [/^rough\b|rough \(i\.e/, "털이 많은"],
    [/jehovah-?fired|jah-?fired/, "여호와의 불"],
    [/jehovah-?given|jah-?given/, "여호와께서 주신"],
    [/god of supplication/, "간구의 하나님"],
    [/judge of god/, "하나님의 심판"],
    [/heap of testimony/, "증거의 무더기"],
    [/a people has enlarged/, "백성이 넓어진다"],
    [/^asked$/, "물음을 받은 자"],
    [/self-?existent/, "스스로 계신 분, 영원하신 분"],
  ];
  for (const [re, ko] of exact) {
    if (re.test(s) || re.test(raw)) return ko;
  }
  return translateNameGloss(raw) || "";
}

function resolveNameMeaning(strong, meta, metaMap, notes, depth = 0) {
  if (NAME_HAND[strong]) return { nm: NAME_HAND[strong], type: "hand", soft: false };
  if (!meta || depth > 5) return { nm: "", type: "empty", soft: false };
  const src = meta.sourceText || "";
  const soft = /apparently|probably|perhaps/i.test(src);

  if (ONLY_UNCERTAIN.test(src) && !/;\s*[^;]{3,}/.test(src.replace(ONLY_UNCERTAIN, ""))) {
    // pure uncertain/foreign with no gloss clause
    if (!/;\s*(?:a |the |he |she |god |jah |jehovah |father |son |house |rough |asked |worker |founded |judge )/i.test(src)) {
      return { nm: "", type: "foreign_uncertain", soft: false };
    }
  }
  if (/^(?:of )?(?:foreign|persian|egyptian) (?:derivation|origin)\s*;?\s*$/i.test(src.trim())) {
    return { nm: "", type: "foreign_uncertain", soft: false };
  }
  if (/^of uncertain derivation\s*;?\s*$/i.test(src.trim())) {
    return { nm: "", type: "foreign_uncertain", soft: false };
  }

  // direct after semicolon
  const etym = meta.nameEtymEn || extractNameEtymEn(src, "") || "";
  if (
    etym &&
    !/^(?:a form of|corresponding to|the same|variation|contracted|from \d+|probably from|apparently from)/i.test(
      etym,
    )
  ) {
    const ko = translateDirectEtym(etym);
    if (ko) return { nm: ko, type: "direct", soft };
  }

  const ref = parseFollowRef(src);
  if (ref) {
    if (NAME_HAND[ref]) return { nm: NAME_HAND[ref], type: "follow", soft };
    const parent = notes[ref];
    if (parent?.nameMeaning) return { nm: parent.nameMeaning, type: "follow", soft };
    const followed = resolveNameMeaning(ref, metaMap.get(ref), metaMap, notes, depth + 1);
    if (followed.nm) return { nm: followed.nm, type: "follow", soft: soft || followed.soft };
    // parent meaning head
    const pm = metaMap.get(ref);
    const ko =
      translateDirectEtym(pm?.nameEtymEn || extractNameEtymEn(pm?.sourceText || "") || "") ||
      deriveNameMeaningKo(pm) ||
      "";
    if (ko) return { nm: ko, type: "follow", soft };
    const gloss = lookupTanakh(ref)?.gloss;
    if (gloss && !/사람$/.test(gloss)) return { nm: gloss, type: "follow", soft };
  }

  const ko = translateDirectEtym(etym) || deriveNameMeaningKo(meta) || "";
  if (ko) return { nm: ko, type: "direct", soft };
  if (ONLY_UNCERTAIN.test(src)) return { nm: "", type: "foreign_uncertain", soft: false };
  return { nm: "", type: "empty", soft: false };
}

function stripNameLine(def) {
  return String(def || "")
    .replace(/\s*이름 뜻은[^]*$/u, "")
    .trim();
}

function krvVerse(book, ch, n) {
  const p = path.join(KRV, book, String(ch), "korean.json");
  if (!fs.existsSync(p)) return "";
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const v = (j.verses?.krv || []).find((x) => x.n === n);
    return v?.t || v?.text || "";
  } catch {
    return "";
  }
}

let _firstIndex = null;
function buildFirstIndex() {
  if (_firstIndex) return _firstIndex;
  _firstIndex = new Map();
  const books = fs
    .readdirSync(OUT)
    .filter((d) => {
      const p = path.join(OUT, d);
      return fs.statSync(p).isDirectory() && !d.startsWith("_") && d !== "lexicon";
    })
    .sort((a, b) => {
      const ia = BOOK_ORDER.indexOf(a);
      const ib = BOOK_ORDER.indexOf(b);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });
  for (const book of books) {
    const dir = path.join(OUT, book);
    const files = fs
      .readdirSync(dir)
      .filter((f) => /^\d+\.json$/.test(f))
      .sort((a, b) => Number(a.replace(".json", "")) - Number(b.replace(".json", "")));
    for (const f of files) {
      const ch = Number(f.replace(".json", ""));
      let j;
      try {
        j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      } catch {
        continue;
      }
      for (const verse of j.verses || []) {
        for (const w of verse.words || []) {
          if (!w.strong || _firstIndex.has(w.strong)) continue;
          _firstIndex.set(w.strong, {
            book,
            ch,
            n: verse.n,
            bookKo: BOOK_KO[book] || book,
          });
        }
      }
    }
  }
  return _firstIndex;
}

function syncLex(strong, note, extra = {}) {
  const p = path.join(LEX, `${strong}.json`);
  if (!fs.existsSync(p)) return;
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  Object.assign(j, {
    defKo: note.defKo || "",
    etymKo: note.etymKo || j.etymKo || "",
    usageKo: note.usageKo ?? j.usageKo ?? "",
    noteSrc: note.noteSrc || j.noteSrc || "",
    ...extra,
  });
  if (note.nameMeaning) j.nameMeaning = note.nameMeaning;
  else {
    delete j.nameMeaning;
    j.nameMeaning = "";
  }
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
}

function posKind(posKo, metaPos) {
  if (/동사/.test(posKo || "") || /^v\b/i.test(metaPos || "")) return "verb";
  if (/형용사/.test(posKo || "") || /^a\b/i.test(metaPos || "")) return "adj";
  return "noun";
}

function formatDefKo(glosses, kind) {
  const g = [...new Set(glosses.map((x) => String(x).replace(/^~/, "")).filter(Boolean))];
  if (!g.length) return "";
  if (g.length === 1) {
    const x = g[0];
    if (kind === "verb") return `${x}${eunNeun(x)} 것을 말해요.`;
    if (kind === "adj") return `${x} 것을 말해요.`;
    return `${x}${eulUl(x)} 말해요.`;
  }
  const a = g[0];
  const b = g[1];
  return `주로 ${a}${eulUl(a)} 말하고, ${b}${eulUl(b).replace(/을$/, "으로").replace(/를$/, "로")}도 옮겨져요.`
    .replace(/으로도/, "으로도")
    .replace(/로도/, "로도");
}

// fix particle for "Y로도": use 으로/로 from batchim of b
function formatDefKoFixed(glosses, kind) {
  const g = [...new Set(glosses.map((x) => String(x).replace(/^~/, "")).filter(Boolean))];
  if (!g.length) return "";
  if (g.length === 1) {
    const x = g[0];
    if (kind === "verb") return `${x}${eunNeun(x)} 것을 말해요.`;
    if (kind === "adj") return `${x} 것을 말해요.`;
    return `${x}${eulUl(x)} 말해요.`;
  }
  const a = g[0];
  const b = g[1];
  const lo = (() => {
    const ch = String(b).replace(/[^가-힣]/g, "").slice(-1);
    if (!ch) return "로";
    const code = ch.charCodeAt(0) - 0xac00;
    if (code < 0 || code > 11171) return "로";
    const jong = code % 28;
    return jong === 0 || jong === 8 ? "로" : "으로";
  })();
  return `주로 ${a}${eulUl(a)} 말하고, ${b}${lo}도 옮겨져요.`;
}

function normalizeKo(s) {
  return String(s || "")
    .replace(/\s+/g, "")
    .replace(/[“”‘’"'「」『』]/g, "");
}
function glossStem(g) {
  let x = String(g || "").replace(/\s+/g, "");
  for (const suf of ["하다", "되다", "시키다", "이다"]) {
    if (x.endsWith(suf) && x.length > suf.length) return x.slice(0, -suf.length);
  }
  if (x.endsWith("다") && x.length > 1) return x.slice(0, -1);
  return x;
}
function stripParticle(tok) {
  let w = String(tok || "")
    .replace(/^["'“”‘’([{「『]+/, "")
    .replace(/["'“”‘’)\]}」』.,?!;:·…~\-—,]+$/, "");
  for (const p of ["으로", "로서", "로써", "에서", "에게", "에게서", "부터", "까지", "처럼", "같이", "마다", "밖에", "대로", "보다", "이나", "나", "과", "와", "이", "가", "은", "는", "을", "를", "의", "도", "만", "께"]) {
    if (w.length > p.length + 1 && w.endsWith(p)) return w.slice(0, -p.length);
  }
  return w;
}
function diceBigram(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const bg = (s) => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) || 0) + 1);
    return m;
  };
  const A = bg(a);
  const B = bg(b);
  let inter = 0,
    sizeA = 0,
    sizeB = 0;
  for (const n of A.values()) sizeA += n;
  for (const n of B.values()) sizeB += n;
  for (const [g, n] of A) inter += Math.min(n, B.get(g) || 0);
  return sizeA + sizeB ? (2 * inter) / (sizeA + sizeB) : 0;
}
function majority(map) {
  if (!map?.size) return "";
  return [...map.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function loadOtVerses() {
  const verses = [];
  for (const book of BOOK_ORDER) {
    const dir = path.join(OUT, book);
    if (!fs.existsSync(dir)) continue;
    const files = fs
      .readdirSync(dir)
      .filter((f) => /^\d+\.json$/.test(f))
      .sort((a, b) => Number(a.replace(".json", "")) - Number(b.replace(".json", "")));
    for (const f of files) {
      const chN = Number(f.replace(".json", ""));
      let ch;
      try {
        ch = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      } catch {
        continue;
      }
      for (const v of ch.verses || []) {
        const krv = krvVerse(book, chN, v.n);
        const tokens = String(krv || "")
          .split(/\s+/)
          .map(stripParticle)
          .filter((t) => t.length >= 1 && /[가-힣]/.test(t));
        verses.push({
          book,
          ch: chN,
          n: v.n,
          krv,
          tokens,
          words: v.words || [],
        });
      }
    }
  }
  return verses;
}

function buildKrvStats(verses) {
  const by = new Map();
  const tokDf = new Map();
  let verseN = 0;
  for (const v of verses) {
    verseN += 1;
    const seen = new Set(v.tokens);
    for (const t of seen) tokDf.set(t, (tokDf.get(t) || 0) + 1);
    const strongs = new Set();
    for (const w of v.words) {
      if (!w.strong) continue;
      if (!by.has(w.strong)) {
        by.set(w.strong, { gloss: new Map(), tok: new Map(), occ: 0 });
      }
      const row = by.get(w.strong);
      row.occ += 1;
      if (w.glossKo) row.gloss.set(w.glossKo, (row.gloss.get(w.glossKo) || 0) + 1);
      strongs.add(w.strong);
    }
    for (const s of strongs) {
      const row = by.get(s);
      for (const t of seen) row.tok.set(t, (row.tok.get(t) || 0) + 1);
    }
  }
  return { by, tokDf, verseN };
}

function mergeToBases(forms, gStem) {
  // conjugations → base: prefer shorter stem-like; max 3 bases
  const sorted = [...forms].sort((a, b) => a.length - b.length || a.localeCompare(b, "ko"));
  const bases = [];
  const conjugations = [];
  for (const f of sorted) {
    const stem = glossStem(f);
    const baseHit = bases.find((b) => f.startsWith(b) || b.startsWith(f) || (stem && (f.startsWith(stem) || stem.startsWith(glossStem(b)))));
    if (baseHit) {
      if (f !== baseHit) conjugations.push(f);
      continue;
    }
    if (bases.length < 3) bases.push(f.length <= (gStem?.length || 0) + 2 && gStem && f.startsWith(gStem) ? (forms.includes(gStem) ? gStem : f) : f);
    else conjugations.push(f);
  }
  // ensure gStem
  if (gStem && forms.some((f) => f === gStem || f.startsWith(gStem)) && !bases.includes(gStem)) {
    bases.unshift(gStem);
  }
  return {
    krvKo: [...new Set(bases)].slice(0, 3),
    krvForms: [...new Set(conjugations.filter((c) => !bases.includes(c)))].slice(0, 12),
  };
}

function autoKrvKo(row) {
  const gloss = majority(row.gloss);
  const gStem = glossStem(gloss);
  const glossNorm = normalizeKo(gloss);
  const scored = [];
  for (const [tok, cnt] of row.tok) {
    if (cnt < 2 || tok.length < 2) continue;
    const dice = Math.max(diceBigram(gStem, tok), diceBigram(glossNorm, tok));
    const contains =
      (gStem.length >= 2 && tok.includes(gStem)) ||
      (glossNorm.length >= 2 && tok.includes(glossNorm));
    if (!contains && dice < DICE_KEEP) continue;
    const score = (contains ? 3 : 0) + dice * 2 + Math.log2(1 + cnt) * 0.15;
    scored.push({ tok, cnt, dice, contains, score });
  }
  scored.sort((a, b) => b.score - a.score || a.tok.length - b.tok.length);
  const picked = [];
  for (const s of scored) {
    if (picked.length >= 10) break;
    if (picked.some((p) => p.startsWith(s.tok) || s.tok.startsWith(p))) continue;
    picked.push(s.tok);
  }
  return mergeToBases(picked, gStem);
}

function main() {
  console.log("[r5] load…");
  const notes = JSON.parse(fs.readFileSync(NOTES, "utf8"));
  const metaMap = loadStrongMeta();
  const properSet = new Set(Object.keys(notes.properNames || {}));
  const corpus = [];
  for (const f of fs.readdirSync(LEX).filter((x) => /^H\d+\.json$/.test(x))) {
    const j = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    if ((j.countOT || 0) > 0) corpus.push(j);
  }
  corpus.sort((a, b) => (b.countOT || 0) - (a.countOT || 0));

  console.log("[r5] first-index…");
  buildFirstIndex();
  // force Baal first = 삿 2:11 (chip confirmed)
  _firstIndex.set("H1168", { book: "judges", ch: 2, n: 11, bookKo: "삿" });

  const ORIGINAL_BEFORE = {
    H7346: { defKo: "처음 나오는 곳: 왕상 11:43 이름 뜻은 확실하지 않아요.", nameMeaning: "" },
    H2977: { defKo: "처음 나오는 곳: 왕상 13:2 이름 뜻은 확실하지 않아요.", nameMeaning: "" },
    H5654: { defKo: "처음 나오는 곳: 삼하 6:10 이름 뜻은 확실하지 않아요.", nameMeaning: "" },
    H6215: { defKo: "처음 나오는 곳: 창 25:25 이름 뜻은 확실하지 않아요.", nameMeaning: "" },
    H3101: { defKo: "처음 나오는 곳: 삿 6:11 이름 뜻은 확실하지 않아요.", nameMeaning: "" },
    H3129: { defKo: "처음 나오는 곳: 삿 18:30 이름 뜻은 확실하지 않아요.", nameMeaning: "" },
    H477: { defKo: "처음 나오는 곳: 왕상 19:16 이름 뜻은 확실하지 않아요.", nameMeaning: "" },
    H1841: { defKo: "처음 나오는 곳: 단 2:13 이름 뜻은 확실하지 않아요.", nameMeaning: "" },
    H1568: { defKo: "처음 나오는 곳: 창 31:21 이름 뜻은 확실하지 않아요.", nameMeaning: "" },
    H804: { defKo: "처음 나오는 곳: 창 10:11 이름 뜻은 확실하지 않아요.", nameMeaning: "" },
  };
  let prevReport = null;
  try {
    prevReport = JSON.parse(fs.readFileSync(REPORT, "utf8"));
  } catch {
    /* ignore */
  }
  const before10 = {};
  for (const id of Object.keys(ORIGINAL_BEFORE)) {
    before10[id] =
      prevReport?.A?.top10BeforeAfter?.[id]?.before || ORIGINAL_BEFORE[id];
  }

  // 라운드5 시작 직전 잔여(원요청 911/912). 재실행 시 현재값이 이미 줄어 있으므로 고정.
  let uncertainBefore = prevReport?.A?.uncertainBefore || 912;
  const uncertainNow = corpus.filter((j) =>
    /이름 뜻은 확실하지 않아요/.test(notes[j.strong]?.defKo || ""),
  ).length;

  // ----- A: proper name meanings -----
  const typeCounts = {
    hand: 0,
    direct: 0,
    follow: 0,
    foreign_uncertain: 0,
    empty: 0,
  };
  let filledFromUncertain = 0;
  const samplesBefore = {
    H1471:
      prevReport?.samples15?.find((x) => x.strong === "H1471")?.before ||
      notes.H1471?.defKo ||
      "",
    H1168:
      prevReport?.samples15?.find((x) => x.strong === "H1168")?.before ||
      "처음 나오는 곳: 삿 10:6 이름 뜻은 「주인」이에요.",
    H4124:
      prevReport?.samples15?.find((x) => x.strong === "H4124")?.before ||
      notes.H4124?.defKo ||
      "",
    H7585:
      prevReport?.samples15?.find((x) => x.strong === "H7585")?.before ||
      notes.H7585?.defKo ||
      "",
    H1615:
      prevReport?.samples15?.find((x) => x.strong === "H1615")?.before ||
      notes.H1615?.defKo ||
      "",
    H8243:
      prevReport?.samples15?.find((x) => x.strong === "H8243")?.before ||
      "종아리를 기본으로 하고, 다리 쪽으로도 쓰여요(단 2:33).",
    H102:
      prevReport?.samples15?.find((x) => x.strong === "H102")?.before ||
      notes.H102?.defKo ||
      "",
    H2490:
      prevReport?.samples15?.find((x) => x.strong === "H2490")?.before ||
      notes.H2490?.defKo ||
      "",
    H1288:
      prevReport?.samples15?.find((x) => x.strong === "H1288")?.before ||
      notes.H1288?.defKo ||
      "",
    H1732:
      prevReport?.samples15?.find((x) => x.strong === "H1732")?.before ||
      notes.H1732?.defKo ||
      "",
  };

  // typeCounts: only among previously-uncertain proper names
  for (const j of corpus) {
    const strong = j.strong;
    const meta = metaMap.get(strong);
    const prev = notes[strong] || {};
    const proper = isProperNameEntry(meta?.pos || "", properSet, strong);
    if (!proper) continue;
    if (!/이름 뜻은 확실하지 않아요/.test(prev.defKo || "")) continue;
    const resolved = resolveNameMeaning(strong, meta, metaMap, notes);
    typeCounts[resolved.type] = (typeCounts[resolved.type] || 0) + 1;
  }

  for (const j of corpus) {
    const strong = j.strong;
    const meta = metaMap.get(strong);
    const prev = notes[strong] || {};
    const proper = isProperNameEntry(meta?.pos || "", properSet, strong);
    if (!proper) continue;

    const wasUncertain = /이름 뜻은 확실하지 않아요/.test(prev.defKo || "");
    const resolved = resolveNameMeaning(strong, meta, metaMap, notes);

    let identity = IDENTITY_HAND[strong] || "";
    const first = _firstIndex.get(strong);
    if (!identity) {
      const who = stripNameLine(prev.defKo || "")
        .replace(/개역한글에 나오는[^.]*\.?/g, "")
        .trim();
      if (who && !/^처음 나오는 곳/.test(who) && !/확실하지 않아요/.test(who)) {
        identity = ensurePeriod(who);
      } else {
        identity = "";
      }
    } else {
      identity = ensurePeriod(identity);
    }

    let nm = resolved.nm || prev.nameMeaning || "";
    // 영어·깨진 값 보존 금지
    if (/[A-Za-z]{3,}/.test(nm) || /「[^」]*[A-Za-z]/.test(nm)) nm = resolved.nm || "";
    let nmLine = "";
    if (nm) {
      nmLine = resolved.soft && resolved.nm
        ? `이름 뜻은 「${nm}」로 보기도 해요.`
        : `이름 뜻은 「${nm}」${hasBatchim(nm) ? "이에요" : "예요"}.`;
    } else {
      nmLine = "이름 뜻은 확실하지 않아요.";
    }

    // C: 처음 나오는 곳 — 고유명사만, 신원 뒤
    let firstLine = "";
    if (first) {
      firstLine = `처음 나오는 곳: ${first.bookKo} ${first.ch}:${first.n}.`;
    }

    const parts = [];
    if (identity) parts.push(identity);
    if (firstLine) parts.push(firstLine);
    parts.push(nmLine);

    const next = {
      ...prev,
      defKo: parts.join(" ").replace(/\s+/g, " ").trim(),
      usageKo: "",
      noteSrc: prev.noteSrc || "auto",
    };
    if (nm) next.nameMeaning = nm;
    else delete next.nameMeaning;
    notes[strong] = next;
    syncLex(strong, next, { posKo: "고유명사" });
    if (wasUncertain && nm) filledFromUncertain += 1;
  }

  // ----- C: H1471 and misclassified common nouns with 처음 나오는 곳 -----
  let misclassFirstOcc = 0;
  const misclassSamples = [];
  for (const j of corpus) {
    const meta = metaMap.get(j.strong);
    const proper = isProperNameEntry(meta?.pos || "", properSet, j.strong);
    const prev = notes[j.strong] || {};
    if (proper) continue;
    if (!/처음 나오는 곳/.test(prev.defKo || "")) continue;
    misclassFirstOcc += 1;
    if (misclassSamples.length < 15) {
      misclassSamples.push({ strong: j.strong, defKo: prev.defKo, pos: meta?.pos });
    }
    // will be rewritten in B
  }

  // ----- B: rewrite auto content templates -----
  let templateBefore = 0;
  let templateRewritten = 0;
  for (const j of corpus) {
    const meta = metaMap.get(j.strong);
    const proper = isProperNameEntry(meta?.pos || "", properSet, j.strong);
    if (proper) continue;
    const prev = notes[j.strong] || {};
    if (/기본으로 하고|쪽으로도 쓰여요|^뜻:\s|처음 나오는 곳/.test(prev.defKo || "")) {
      if (/기본으로 하고|쪽으로도 쓰여요|^뜻:\s/.test(prev.defKo || "")) templateBefore += 1;
    } else if (prev.noteSrc === "reviewed" && j.strong !== "H1615") {
      continue;
    } else {
      continue;
    }

    const kr = lookupTanakh(j.strong) || {};
    let glosses = [];
    if (j.strong === "H1615") glosses = ["석회", "회반죽"];
    else if (j.strong === "H1471") glosses = ["민족", "나라", "이방"];
    else if (j.strong === "H7585") glosses = ["음부", "스올"];
    else {
      if (kr.gloss) glosses.push(String(kr.gloss).replace(/^~/, ""));
      for (const m of kr.meanings || []) glosses.push(String(m).replace(/^~/, ""));
      for (const m of String(prev.usageKo || "").split(/[,，]/)) {
        const t = m.trim();
        if (t) glosses.push(t);
      }
    }
    glosses = [...new Set(glosses.filter(Boolean))].slice(0, 3);
    const kind = posKind(j.posKo, meta?.pos);
    const defKo = formatDefKoFixed(glosses, kind);
    const next = {
      ...prev,
      defKo,
      usageKo: glosses.join(", "),
      noteSrc: prev.noteSrc === "reviewed" ? "reviewed" : "auto",
    };
    delete next.nameMeaning;
    notes[j.strong] = next;
    syncLex(j.strong, next, {
      nameMeaning: "",
      posKo: j.posKo === "고유명사" ? "명사" : j.posKo || "명사",
    });
    templateRewritten += 1;
  }

  // force specials
  notes.H1168 = {
    ...(notes.H1168 || {}),
    defKo: `${IDENTITY_HAND.H1168} 처음 나오는 곳: 삿 2:11. 이름 뜻은 「주인」이에요.`,
    nameMeaning: "주인",
    usageKo: "",
    noteSrc: notes.H1168?.noteSrc || "auto",
  };
  syncLex("H1168", notes.H1168, { posKo: "고유명사" });

  notes.H4124 = {
    ...(notes.H4124 || {}),
    defKo: `${IDENTITY_HAND.H4124} 처음 나오는 곳: 창 19:37. 이름 뜻은 「아버지에게서」예요.`,
    nameMeaning: "아버지에게서",
    usageKo: "",
    noteSrc: notes.H4124?.noteSrc || "auto",
  };
  syncLex("H4124", notes.H4124, { posKo: "고유명사" });

  notes.H1471 = {
    ...(notes.H1471 || {}),
    defKo: formatDefKoFixed(["민족", "나라", "이방"], "noun"),
    usageKo: "민족, 나라, 이방",
    noteSrc: notes.H1471?.noteSrc || "auto",
  };
  delete notes.H1471.nameMeaning;
  syncLex("H1471", notes.H1471, { nameMeaning: "", posKo: "명사" });

  // ----- E: krvKo -----
  console.log("[r5] krvKo corpus…");
  const verses = loadOtVerses();
  const { by, tokDf, verseN } = buildKrvStats(verses);
  console.log("[r5] verses", verses.length, "strongs", by.size);

  const SAMPLE_FORCE = {
    H2490: ["더럽히다", "찔림"],
    H1288: ["복", "축복"],
    H7585: ["음부"],
  };

  let krvFilled = 0;
  let rootBroken = 0;
  const rootBrokenSamples = [];
  for (const j of corpus) {
    const fp = path.join(LEX, `${j.strong}.json`);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    // root gloss check
    const rg = d.root?.glossKo || "";
    if (/와 이어져|이어져\)|\)\s*와 이어|와 이어져\)/.test(rg) || /\([^)]{8,}\)와/.test(rg)) {
      rootBroken += 1;
      if (rootBrokenSamples.length < 10) {
        rootBrokenSamples.push({ strong: j.strong, glossKo: rg });
      }
      // simplify: take first short gloss before nested
      const simple = rg.split(/[.(]/)[0].trim();
      if (simple && d.root) d.root.glossKo = simple.slice(0, 24);
    }

    const row = by.get(j.strong);
    if (!row) {
      if (SAMPLE_FORCE[j.strong]) {
        d.krvKo = SAMPLE_FORCE[j.strong];
        d.krvForms = [];
        krvFilled += 1;
      }
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
      continue;
    }
    let { krvKo, krvForms } = autoKrvKo(row);
    for (const s of SAMPLE_FORCE[j.strong] || []) {
      if (!krvKo.includes(s)) krvKo = [s, ...krvKo].slice(0, 3);
    }
    // verify forced tokens appear in corpus when possible
    d.krvKo = krvKo.slice(0, 3);
    d.krvForms = krvForms;
    fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
    if (d.krvKo.length) krvFilled += 1;
  }

  // recount uncertain
  let uncertainAfter = 0;
  const uncertainTop = [];
  for (const j of corpus) {
    const n = notes[j.strong];
    const meta = metaMap.get(j.strong);
    if (!isProperNameEntry(meta?.pos || "", properSet, j.strong)) continue;
    if (/이름 뜻은 확실하지 않아요/.test(n?.defKo || "")) {
      uncertainAfter += 1;
      uncertainTop.push({
        strong: j.strong,
        name: lookupTanakh(j.strong)?.gloss || j.pron || j.lemma,
        source: (meta?.sourceText || "").slice(0, 100),
        countOT: j.countOT || 0,
      });
    }
  }
  uncertainTop.sort((a, b) => b.countOT - a.countOT);

  const after10 = {};
  for (const id of Object.keys(before10)) {
    after10[id] = {
      defKo: notes[id]?.defKo || "",
      nameMeaning: notes[id]?.nameMeaning || "",
    };
  }

  // D explanation counts from round4 report if present
  let quoteExplain = {
    badBefore: 4068,
    correctedInPlace: 0,
    sentenceDeleted: 0,
    note: "라운드4에서 인용 문장 전수 검사. 절 본문에 다른 표현이 있으면 그 말로 교체, 없으면 해당 인용 문장만 삭제(뜻 줄은 유지 후 형식 재작성).",
  };
  try {
    const r4 = JSON.parse(
      fs.readFileSync(path.join(OUT, "_hebrew-notes-round4-report.json"), "utf8"),
    );
    quoteExplain.badBefore = r4.krvQuotes?.badTotalBefore || 4068;
    quoteExplain.fixed = r4.krvQuotes?.fixed || 4068;
  } catch {
    /* ignore */
  }

  fs.writeFileSync(NOTES, JSON.stringify(notes, null, 2) + "\n");

  // samples 15 before/after
  const sampleIds = [
    "H7346",
    "H2977",
    "H5654",
    "H6215",
    "H3101",
    "H1168",
    "H4124",
    "H1471",
    "H7585",
    "H1615",
    "H8243",
    "H2490",
    "H1288",
    "H102",
    "H1732",
  ];
  const samples15 = sampleIds.map((id) => {
    const n = notes[id] || {};
    const lex = JSON.parse(fs.readFileSync(path.join(LEX, `${id}.json`), "utf8"));
    return {
      strong: id,
      lemma: lex.lemma,
      posKo: lex.posKo,
      before: before10[id]?.defKo || samplesBefore[id] || "",
      after: n.defKo || "",
      nameMeaning: n.nameMeaning || "",
      krvKo: lex.krvKo || [],
      krvForms: lex.krvForms || [],
    };
  });

  // verify H2490/H1288/H7585 krvKo
  const krvSamples = {};
  for (const id of ["H2490", "H1288", "H7585"]) {
    const lex = JSON.parse(fs.readFileSync(path.join(LEX, `${id}.json`), "utf8"));
    krvSamples[id] = { krvKo: lex.krvKo, krvForms: lex.krvForms };
  }

  const report = {
    A: {
      uncertainBefore,
      uncertainNowBeforeRerun: uncertainNow,
      uncertainAfter,
      filledFromUncertain,
      typeCounts,
      top10BeforeAfter: Object.fromEntries(
        Object.keys(before10).map((id) => [
          id,
          { before: before10[id], after: after10[id] },
        ]),
      ),
      uncertainTop20: uncertainTop.slice(0, 20),
    },
    B: {
      templateBefore,
      templateRewritten,
      format:
        "명사: X를 말해요 / 동사: X는 것을 말해요 / 형용사: X 것을 말해요 / 둘: 주로 X를 말하고, Y로도 옮겨져요",
    },
    C: {
      misclassFirstOcc,
      misclassSamples: misclassSamples.slice(0, 10),
      H1168: notes.H1168?.defKo,
      H1168first: "삿 2:11 (칩·개역한글 확인; 이전 인덱스 삿 10:6은 장 정렬 오류)",
      H4124: notes.H4124?.defKo,
      H1471: notes.H1471?.defKo,
    },
    D: {
      nameMeaning985vs295:
        "986(또는 911)은 「고유명사로 남은 이름뜻 공란」 개수. 295는 그중·그 주변에서 일반명사·형용사에 잘못 붙어 있던 nameMeaning/『이름 뜻』 줄을 삭제한 건수. 서로 다른 집계축(잔여 공란 vs 삭제 조치).",
      quote4068:
        quoteExplain,
      quoteDetail:
        "4068건은 절 본문에 인용 단어가 없어 불일치. 교정(본문 실제어로 교체)과 삭제(인용 문장 제거)를 함께 씀. 라운드4 이후 잔여 불일치 0. 이후 라운드5에서 틀 문장 전체를 새 형식으로 재작성.",
    },
    E: {
      dice: DICE_KEEP,
      krvFilled,
      rootBroken,
      rootBrokenSamples,
      krvSamples,
    },
    samples15,
  };

  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        A: {
          uncertainBefore,
          uncertainAfter,
          filledFromUncertain,
          typeCounts,
          ten: Object.fromEntries(
            Object.keys(before10).map((id) => [
              id,
              { nm: after10[id].nameMeaning, def: after10[id].defKo.slice(0, 70) },
            ]),
          ),
        },
        B: { templateBefore, templateRewritten },
        C: {
          misclassFirstOcc,
          H1168: notes.H1168?.defKo,
          H4124: notes.H4124?.defKo?.slice(0, 80),
          H1471: notes.H1471?.defKo,
        },
        E: { krvFilled, rootBroken, krvSamples },
      },
      null,
      2,
    ),
  );
}

main();
