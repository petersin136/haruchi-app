/**
 * 히브리어 사전 4차 보정
 *   node scripts/fix-hebrew-notes-round4.mjs
 * 범위: scripts/, public/word-study/, data/
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookupTanakh } from "./lib/tanakh-lexicon.mjs";
import {
  loadStrongMeta,
  deriveNameMeaningKo,
  extractNameEtymEn,
  isProperPos,
  translateNameGloss,
  firstSenseEn,
  normH,
} from "./lib/hebrew-strong-meta.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const NOTES = path.join(root, "data/keyword-notes/hebrew.json");
const LEX = path.join(root, "public/word-study/lexicon/hebrew");
const KRV = path.join(root, "public/bible-study/chunks");
const OUT = path.join(root, "public/word-study");
const REPORT = path.join(OUT, "_hebrew-notes-round4-report.json");
const TANAKH_PATH = path.join(root, "scripts/lib/tanakh-lexicon.mjs");

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
const KO_BOOK = Object.fromEntries(
  Object.entries(BOOK_KO).map(([k, v]) => [v, k]),
);

const IDENTITY_HAND = {
  H1732: "다윗은 이새의 아들이며 이스라엘의 둘째 왕이에요(삼상 16장; 삼하 5장).",
  H4872: "모세는 이스라엘을 애굽에서 이끌어 낸 지도자예요(출 3장).",
  H7205: "르우벤은 야곱의 맏아들이에요(창 29:32).",
  H53: "압살롬은 다윗의 아들이에요(삼하 3:3).",
  H256: "아합은 오므리의 아들이며 이스라엘 왕이에요(왕상 16:29).",
  H884: "브엘세바는 아브라함이 우물을 두고 맹세한 곳이에요(창 21:31).",
  H4363:
    "믹마스는 블레셋이 진을 친 곳이며, 요나단이 습격한 곳이에요(삼상 13:16; 14장).",
  H3068: "여호와는 이스라엘이 부르는 하나님의 이름이에요(출 3:15).",
  H1008: "벧엘은 야곱이 돌 베개를 세우고 그 곳 이름을 부른 곳이에요(창 28:19).",
};

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
  H1410: "공격하다",
  H7586: "물음을 받은 자",
};

/** round3 후보 38 — 키워드 오탐; 적용되면 안 됨 */
const SOFT38 = [
  "H102",
  "H1615",
  "H1660",
  "H19",
  "H2626",
  "H2672",
  "H2760",
  "H3095",
  "H3524",
  "H3600",
  "H4197",
  "H4473",
  "H4518",
  "H4537",
  "H4538",
  "H4580",
  "H4583",
  "H4678",
  "H4906",
  "H5094",
  "H5332",
  "H5411",
  "H548",
  "H574",
  "H6458",
  "H6609",
  "H6734",
  "H6767",
];

function hasBatchim(word) {
  const ch = String(word || "").replace(/[^가-힣]/g, "").slice(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}
function eulRo(word) {
  const ch = String(word || "").replace(/[^가-힣]/g, "").slice(-1);
  if (!ch) return "로";
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return "로";
  const jong = code % 28;
  return jong === 0 || jong === 8 ? "로" : "으로";
}
function eulUl(word) {
  return hasBatchim(word) ? "을" : "를";
}

function loadCorpus() {
  const rows = [];
  for (const f of fs.readdirSync(LEX).filter((x) => /^H\d+\.json$/.test(x))) {
    rows.push(JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8")));
  }
  rows.sort((a, b) => (b.countOT || 0) - (a.countOT || 0));
  return rows.filter((j) => (j.countOT || 0) > 0);
}

function syncLex(strong, note, extra = {}) {
  const p = path.join(LEX, `${strong}.json`);
  if (!fs.existsSync(p)) return;
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  Object.assign(j, {
    defKo: note.defKo || "",
    etymKo: note.etymKo || j.etymKo || "",
    usageKo: note.usageKo || "",
    nameMeaning: note.nameMeaning || "",
    noteSrc: note.noteSrc || j.noteSrc || "",
    ...extra,
  });
  if (!note.nameMeaning) delete j.nameMeaning;
  else j.nameMeaning = note.nameMeaning;
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
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
  const order = Object.keys(BOOK_KO);
  const books = fs.readdirSync(OUT).filter((d) => {
    const p = path.join(OUT, d);
    return fs.statSync(p).isDirectory() && !d.startsWith("_") && d !== "lexicon";
  });
  books.sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  for (const book of books) {
    const dir = path.join(OUT, book);
    for (const f of fs
      .readdirSync(dir)
      .filter((x) => /^\d+\.json$/.test(x))
      .sort((a, b) => Number(a) - Number(b))) {
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
            glossKo: w.glossKo || "",
          });
        }
      }
    }
  }
  return _firstIndex;
}

function isGentilicSource(src) {
  return /patrial|patronymic|gentilic|inhabitants? of/i.test(src || "");
}

/** nameMeaning 허용 고유명사: Strong pos가 n-pr* 중심일 때만 (n-m+n-pr 혼용·순수 일반어 제외) */
function isProperNameEntry(pos, properSet, strong) {
  const p = String(pos || "").trim();
  // 순수 일반 품사(명사·형용사·동사만)는 properNames에 있어도 이름뜻 대상 아님
  if (/^(?:n-m|n-f|a|v)(?:\s|$)/i.test(p) && !/n-pr/i.test(p)) return false;
  // n-m/a + n-pr 혼용(민족·크다 등) → 일반어
  if (/\b(?:n-m|n-f|a|v)\b/i.test(p) && /n-pr/i.test(p)) return false;
  if (properSet.has(strong)) return true;
  const tokens = p.split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  if (tokens.every((t) => /^n-pr/i.test(t) || /^x-pn/i.test(t))) return true;
  return false;
}

function isGentilicEntry(meta) {
  return isGentilicSource(meta?.sourceText || "");
}

function parseRefSource(src) {
  const s = String(src || "").replace(/\s+/g, " ").trim();
  let m =
    s.match(
      /^(?:the same(?:\s*\([^)]*\))? as|a variation of|an? orthographical variation for)\s+(\d+)/i,
    ) ||
    s.match(/^patrial(?:ly)? from\s+(\d+)/i) ||
    s.match(/^patronymically from\s+(\d+)/i) ||
    s.match(/^(?:by )?contraction for\s+(\d+)/i) ||
    s.match(/^(?:dual|plural) of\s+(\d+)/i) ||
    s.match(/^(?:passive|active) participle of\s+(\d+)/i);
  if (m) {
    return {
      type: /patrial|patronymic/i.test(s)
        ? "gentilic"
        : /same as|variation|contraction|orthograph|dual of|plural of/i.test(s)
          ? "alias"
          : "from",
      id: normH(m[1]),
      soft: /apparently|probably|perhaps/i.test(s),
    };
  }
  m = s.match(/^from\s+(\d+)\s*[;,]?\s*$/i);
  if (m) return { type: "from", id: normH(m[1]), soft: /apparently|probably|perhaps/i.test(s) };
  m = s.match(/^from\s+(\d+)\b/i);
  if (m && !/and \d+/i.test(s.split(";")[0] || "")) {
    return {
      type: "from",
      id: normH(m[1]),
      soft: /apparently|probably|perhaps/i.test(s),
    };
  }
  return null;
}

function resolveNameMeaning(strong, meta, metaMap, notes, depth = 0) {
  if (NAME_HAND[strong]) return { nm: NAME_HAND[strong], soft: false };
  if (!meta || depth > 4) return { nm: "", soft: false };

  const src = meta.sourceText || "";
  const soft = /apparently|probably|perhaps/i.test(src);

  // 직접 풀이 (세미콜론 뒤·괄호 포함)
  const directEn =
    meta.nameEtymEn || extractNameEtymEn(src, "") || "";
  if (directEn && !/^(?:the same as|a variation|patrial|patronymic|from \d+)/i.test(directEn)) {
    let ko = translateNameGloss(directEn) || deriveNameMeaningKo(meta) || "";
    // H4124 특수: from (her mother's) father
    if (/from \(her .*?\) father|from \(her \[the mother's\]\) father/i.test(src)) {
      ko = "아버지에게서";
    }
    if (ko && !/「of」/.test(ko)) return { nm: ko, soft };
  }
  if (/from \(her .*?\) father|from \(her \[the mother's\]\) father/i.test(src)) {
    return { nm: "아버지에게서", soft };
  }

  const ref = parseRefSource(src);
  if (ref?.id) {
    if (ref.type === "gentilic") {
      return { nm: "", soft: false, gentilicOf: ref.id };
    }
    // follow
    if (NAME_HAND[ref.id]) return { nm: NAME_HAND[ref.id], soft: soft || ref.soft };
    const parentNote = notes[ref.id];
    if (parentNote?.nameMeaning) {
      return { nm: parentNote.nameMeaning, soft: soft || ref.soft };
    }
    const parentMeta = metaMap.get(ref.id);
    const followed = resolveNameMeaning(
      ref.id,
      parentMeta,
      metaMap,
      notes,
      depth + 1,
    );
    if (followed.nm) return { nm: followed.nm, soft: soft || ref.soft || followed.soft };
    // tanakh gloss of parent as last resort for same-as
    const pg = lookupTanakh(ref.id)?.gloss;
    if (pg && ref.type === "alias") {
      // 바알 same as 1167 주인 — prefer meaning gloss of common noun
      const pMean = firstSenseEn(parentMeta?.meaning || parentMeta?.def || "", 40);
      const fromMean = translateNameGloss(pMean) || "";
      if (fromMean) return { nm: fromMean, soft: soft || ref.soft };
      // H1167 meaning master → 주인 already in tanakh
      if (pg && !/사람$/.test(pg)) return { nm: pg, soft: soft || ref.soft };
    }
    if (ref.type === "from") {
      const pMean = firstSenseEn(parentMeta?.meaning || parentMeta?.def || "", 60);
      const ko =
        translateNameGloss(pMean) ||
        deriveNameMeaningKo(parentMeta) ||
        "";
      if (ko) return { nm: ko, soft: soft || ref.soft };
      // verb root gloss
      const g = lookupTanakh(ref.id)?.gloss;
      if (g) return { nm: g, soft: soft || ref.soft };
    }
  }

  const ko = deriveNameMeaningKo(meta) || "";
  if (ko && !/「of」/.test(ko)) return { nm: ko, soft };
  return { nm: "", soft };
}

function gentilicLabel(baseId, notes, metaMap) {
  const kr = lookupTanakh(baseId) || {};
  const baseName =
    kr.gloss ||
    notes[baseId]?.nameMeaning ||
    BOOK_KO[baseId] ||
    baseId;
  const clean = String(baseName)
    .replace(/ 사람$/, "")
    .replace(/^~/, "");
  return `${clean}(${baseId})에서 나온 사람/족속`;
}

function stripNameLine(defKo) {
  return String(defKo || "")
    .replace(/\s*이름 뜻은[^]*$/u, "")
    .replace(/\s*이름 뜻은 확실하지 않아요\.?/g, "")
    .trim();
}

function parseQuoteRefs(defKo) {
  const out = [];
  const re =
    /개역한글에서는\s*'([^']+)'(?:로|으로)?\s*(?:옮겼어요|적었어요|읽혀요|나와요)\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(defKo || "")) !== null) {
    out.push({ word: m[1], ref: m[2], full: m[0] });
  }
  return out;
}

function resolveBookRef(ref) {
  // 사 51:20 / 삼상 13:16 / 시 79:11
  const m = String(ref)
    .trim()
    .match(/^([가-힣]+)\s*(\d+)\s*:\s*(\d+)/);
  if (!m) return null;
  const book = KO_BOOK[m[1]];
  if (!book) return null;
  return { book, ch: Number(m[2]), n: Number(m[3]), bookKo: m[1] };
}

function findActualKrvWord(verseText, candidates) {
  const t = verseText || "";
  for (const c of candidates) {
    const w = String(c || "").trim();
    if (w && t.includes(w)) return w;
  }
  // longest hangul token length >= 2 that appears? no — use candidates only
  return "";
}

function breadthDef(glosses, exampleWord, ref) {
  const g = [...new Set(glosses.map((x) => String(x).replace(/^~/, "")).filter(Boolean))];
  if (!g.length) return ref ? `본문에 나와요(${ref}).` : "";
  const primary = g[0];
  const rest = g.slice(1, 3);
  let body = "";
  if (rest.length >= 1) {
    body = `${primary}${eulUl(primary)} 기본으로 하고, ${rest.join("·")} 쪽으로도 쓰여요`;
  } else {
    body = `${primary}${hasBatchim(primary) ? "이라는" : "라는"} 뜻으로 쓰여요`;
  }
  if (exampleWord && ref) {
    return `${body}(${ref}).`;
  }
  if (ref) return `${body}(${ref}).`;
  return `${body}.`;
}

function main() {
  console.log("[round4] load…");
  const notes = JSON.parse(fs.readFileSync(NOTES, "utf8"));
  const metaMap = loadStrongMeta();
  const corpus = loadCorpus();
  const properSet = new Set(Object.keys(notes.properNames || {}));
  console.log("[round4] first-index…");
  buildFirstIndex();

  // --- 4) soft38 not applied + H1615 ---
  const soft38Status = [];
  for (const id of SOFT38) {
    const n = notes[id] || {};
    const usage = n.usageKo || "";
    const def = n.defKo || "";
    soft38Status.push({
      strong: id,
      usageKo: usage.slice(0, 40),
      stillOriginal: !/뜻: 날개|뜻: 화로,|뜻: 포도주$|뜻: 칼$|뜻: 전능$|뜻: 돌$|뜻: 그물$|뜻: 피$|뜻: 떡$|뜻: 성전$|뜻: 지혜$|뜻: 언약$/.test(
        def.split("\n")[0] || "",
      ),
    });
  }
  // H1615 → 석회
  {
    const prev = notes.H1615 || {};
    notes.H1615 = {
      ...prev,
      defKo: "석회라는 뜻으로 쓰여요(사 27:9).",
      usageKo: "석회, 회반죽",
      etymKo: prev.etymKo || "H1615 어원 표기는 Strong에 짧게 남아 있어요.",
      noteSrc: prev.noteSrc || "auto",
    };
    delete notes.H1615.nameMeaning;
    syncLex("H1615", notes.H1615);
  }

  // --- 3) KRV headword gloss in tanakh-lexicon ---
  let tanakhSrc = fs.readFileSync(TANAKH_PATH, "utf8");
  const headFixes = [
    [/H4714:\s*place\("이집트"\)/, 'H4714: place("애굽")'],
    [/H4714:\s*\{\s*gloss:\s*"이집트"/, 'H4714: { gloss: "애굽"'],
    [/H3881:[^,]*/, null], // handle below
  ];
  // patch common patterns
  tanakhSrc = tanakhSrc.replace(
    /H4714:\s*place\("이집트"\)/g,
    'H4714: place("애굽")',
  );
  tanakhSrc = tanakhSrc.replace(
    /H4713:\s*ethnic\("이집트 사람"\)/g,
    'H4713: ethnic("애굽 사람")',
  );
  tanakhSrc = tanakhSrc.replace(
    /H7585:\s*\{\s*gloss:\s*"스올",\s*meanings:\s*\["스올",\s*"음부"\]\s*\}/g,
    'H7585: { gloss: "음부", meanings: ["음부", "스올"] }',
  );
  // H3881 / H6430 — search and replace gloss strings carefully
  if (!/H3881:/.test(tanakhSrc)) {
    // may be ethnic()
  }
  tanakhSrc = tanakhSrc.replace(
    /(H3881:\s*(?:ethnic\(|\{\s*gloss:\s*))"(레위인|레위 사람)"/g,
    '$1"레위 사람"',
  );
  tanakhSrc = tanakhSrc.replace(
    /(H6430:\s*(?:ethnic\(|\{\s*gloss:\s*))"[^"]+"/g,
    '$1"블레셋"',
  );
  // also force-insert overrides at end of HAND maps if needed via notes gloss field
  fs.writeFileSync(TANAKH_PATH, tanakhSrc);

  // lexicon pron/gloss display helpers via notes + lex fields
  const HEAD_KO = {
    H4714: "애굽",
    H3881: "레위 사람",
    H7585: "음부",
    H6430: "블레셋",
    H4713: "애굽 사람",
  };

  let nameMeaningDeleted = 0;
  let uncertainAfter = [];
  let templateBefore = 0;
  const autoContent = [];

  for (const j of corpus) {
    const strong = j.strong;
    const prev = notes[strong] || {};
    const meta = metaMap.get(strong);
    const kr = lookupTanakh(strong) || {};
    const proper = isProperNameEntry(meta?.pos || "", properSet, strong);
    const gentilicEntry = isGentilicEntry(meta);

    // count template before rewrite
    if (
      prev.noteSrc === "auto" &&
      !proper &&
      !gentilicEntry &&
      /^뜻:\s/.test(prev.defKo || "") &&
      /개역한글에서는/.test(prev.defKo || "")
    ) {
      templateBefore += 1;
      autoContent.push(j);
    }

    // 족속·출신 (형용사 등): nameMeaning 없이 신원만
    if (gentilicEntry && !proper) {
      const ref = parseRefSource(meta?.sourceText || "");
      const first = _firstIndex.get(strong);
      const label = ref?.id
        ? gentilicLabel(ref.id, notes, metaMap)
        : HEAD_KO[strong] || kr.gloss || "이 족속";
      const identity = `${label}이에요${
        first ? `(${first.bookKo} ${first.ch}:${first.n})` : ""
      }.`;
      const next = {
        ...prev,
        defKo: identity,
        usageKo: "",
        etymKo: prev.etymKo || `${strong} 어원 표기는 Strong에 짧게 남아 있어요.`,
        noteSrc: prev.noteSrc || "auto",
      };
      delete next.nameMeaning;
      notes[strong] = next;
      syncLex(strong, next, { nameMeaning: "", posKo: j.posKo || "형용사" });
      continue;
    }

    if (!proper) {
      // 1) strip nameMeaning from non-proper
      const hadNm =
        Boolean(prev.nameMeaning) || /이름 뜻/.test(prev.defKo || "");
      if (hadNm) nameMeaningDeleted += 1;
      const next = { ...prev };
      delete next.nameMeaning;
      // temporary: clear name line; content rewrite later for top 900
      let def = stripNameLine(prev.defKo || "");
      if (/확실하지 않아요|처음 나오는 곳/.test(prev.defKo || "") && hadNm) {
        // was wrongly treated as proper — leave for content rewrite
        def = def || "";
      }
      next.defKo = def;
      next.noteSrc = prev.noteSrc || "auto";
      if (HEAD_KO[strong]) {
        // keep usage reflecting KRV head
        if (!next.usageKo) next.usageKo = HEAD_KO[strong];
      }
      notes[strong] = next;
      syncLex(strong, next, {
        posKo: j.posKo === "고유명사" ? j.posKo : j.posKo || "",
        nameMeaning: "",
      });
      // fix lex posKo if wrongly 고유명사
      const lp = path.join(LEX, `${strong}.json`);
      const lex = JSON.parse(fs.readFileSync(lp, "utf8"));
      if (lex.posKo === "고유명사") {
        // restore from morph-ish: keep 명사/동사 etc from existing non-proper
        lex.posKo = j.posKo && j.posKo !== "고유명사" ? j.posKo : "명사";
      }
      if (HEAD_KO[strong]) {
        // store display gloss on family-less field: usage already; also patch root gloss display via note
      }
      lex.nameMeaning = "";
      lex.defKo = next.defKo;
      fs.writeFileSync(lp, JSON.stringify(lex, null, 2) + "\n");
      continue;
    }

    // --- proper ---
    const resolved = resolveNameMeaning(strong, meta, metaMap, notes);
    const first = _firstIndex.get(strong);
    let identity = IDENTITY_HAND[strong] || "";
    if (!identity && resolved.gentilicOf) {
      identity = `${gentilicLabel(resolved.gentilicOf, notes, metaMap)}이에요${
        first ? `(${first.bookKo} ${first.ch}:${first.n})` : ""
      }.`;
    }
    if (!identity && isGentilicSource(meta?.sourceText || "")) {
      const ref = parseRefSource(meta.sourceText || "");
      if (ref?.id) {
        identity = `${gentilicLabel(ref.id, notes, metaMap)}이에요${
          first ? `(${first.bookKo} ${first.ch}:${first.n})` : ""
        }.`;
      }
    }
    if (!identity) {
      const who = stripNameLine(prev.defKo || "")
        .replace(/개역한글에 나오는 인명이에요\.?/g, "")
        .replace(/개역한글에 나오는 지명이에요\.?/g, "")
        .replace(/가나안\/팔레스타인에 있는 지명이에요\.?/g, "")
        .trim();
      const whoBad =
        /출신 사람|에서 나온 사람|족속/.test(who) &&
        !isGentilicSource(meta?.sourceText || "");
      if (
        who &&
        !whoBad &&
        !/확실하지 않아요/.test(who) &&
        !/^처음 나오는 곳/.test(who)
      ) {
        identity = who;
      } else if (first) {
        identity = `처음 나오는 곳: ${first.bookKo} ${first.ch}:${first.n}`;
      } else {
        identity = "Strong에 짧은 신원만 남아 있어요.";
      }
    }

    const gentilic =
      Boolean(resolved.gentilicOf) || isGentilicSource(meta?.sourceText || "");
    let nm = gentilic ? "" : resolved.nm;
    let nmLine = "";
    if (gentilic) {
      // 족속명: nameMeaning 없음, 신원만
      nmLine = "";
      if (!resolved.gentilicOf) {
        const ref = parseRefSource(meta?.sourceText || "");
        if (ref?.id && !/에서 나온 사람/.test(identity)) {
          identity = `${gentilicLabel(ref.id, notes, metaMap)}이에요${
            first ? `(${first.bookKo} ${first.ch}:${first.n})` : ""
          }.`;
        }
      }
    } else if (nm) {
      if (resolved.soft) {
        nmLine = `이름 뜻은 「${nm}」로 보기도 해요.`;
      } else {
        nmLine = `이름 뜻은 「${nm}」${hasBatchim(nm) ? "이에요" : "예요"}.`;
      }
    } else {
      nmLine = "이름 뜻은 확실하지 않아요.";
      uncertainAfter.push({
        strong,
        name: HEAD_KO[strong] || kr.gloss || j.pron || j.lemma,
        lemma: j.lemma,
        source: (meta?.sourceText || "").slice(0, 120),
        countOT: j.countOT || 0,
      });
    }

    const next = {
      ...prev,
      defKo: `${identity}${nmLine ? ` ${nmLine}` : ""}`.replace(/\s+/g, " ").trim(),
      etymKo: prev.etymKo || `${strong} 어원 표기는 Strong에 짧게 남아 있어요.`,
      usageKo: "",
      noteSrc: prev.noteSrc || "auto",
    };
    if (nm) next.nameMeaning = nm;
    else delete next.nameMeaning;

    notes[strong] = next;
    syncLex(strong, next, { posKo: "고유명사" });
  }

  // --- 5) KRV quote verify (all notes) ---
  const quoteIssues = [];
  const checkSix = [
    { strong: "H8243", book: "daniel", ch: 2, n: 33, bookKo: "단" },
    { strong: "H3832", book: "proverbs", ch: 10, n: 8, bookKo: "잠" },
    { strong: "H5395", book: "isaiah", ch: 42, n: 14, bookKo: "사" },
    { strong: "H7052", book: "numbers", ch: 21, n: 5, bookKo: "민" },
    { strong: "H900", book: "zephaniah", ch: 3, n: 4, bookKo: "습" },
    { strong: "H5550", book: "samuel2", ch: 20, n: 15, bookKo: "삼하" },
  ];
  const sixBeforeAfter = [];

  function fixQuotesFor(strong, note) {
    const def = note.defKo || "";
    const quotes = parseQuoteRefs(def);
    if (!quotes.length) return { note, fixed: 0, bad: 0 };
    let newDef = def;
    let fixed = 0;
    let bad = 0;
    for (const q of quotes) {
      const loc = resolveBookRef(q.ref);
      if (!loc) continue;
      const verse = krvVerse(loc.book, loc.ch, loc.n);
      if (!verse) continue;
      if (verse.includes(q.word)) continue;
      bad += 1;
      // candidates from usage
      const cands = String(note.usageKo || "")
        .split(/[,，]/)
        .map((x) => x.trim())
        .filter(Boolean);
      cands.push(...(lookupTanakh(strong)?.meanings || []));
      const hit = findActualKrvWord(verse, cands);
      if (hit) {
        newDef = newDef.replace(
          q.full,
          `개역한글에서는 '${hit}'${eulRo(hit)} 옮겼어요(${q.ref})`,
        );
        fixed += 1;
      } else {
        // delete the quote sentence
        newDef = newDef.replace(q.full, "").replace(/\n{2,}/g, "\n").trim();
        // if only "뜻: X" left, keep meanings line
        fixed += 1;
      }
    }
    note.defKo = newDef;
    return { note, fixed, bad };
  }

  let quoteBadTotal = 0;
  let quoteBadReviewed = 0;
  let quoteBadAuto = 0;
  let quoteFixed = 0;

  for (const j of corpus) {
    const n = notes[j.strong];
    if (!n?.defKo) continue;
    const before = n.defKo;
    const quotes = parseQuoteRefs(before);
    for (const q of quotes) {
      const loc = resolveBookRef(q.ref);
      if (!loc) continue;
      const verse = krvVerse(loc.book, loc.ch, loc.n);
      if (verse && !verse.includes(q.word)) {
        quoteBadTotal += 1;
        if (n.noteSrc === "reviewed") quoteBadReviewed += 1;
        else quoteBadAuto += 1;
        quoteIssues.push({
          strong: j.strong,
          word: q.word,
          ref: q.ref,
          noteSrc: n.noteSrc,
        });
      }
    }
  }

  for (const row of checkSix) {
    const n = notes[row.strong] || {};
    const before = n.defKo || "";
    const verse = krvVerse(row.book, row.ch, row.n);
    const r = fixQuotesFor(row.strong, { ...n });
    notes[row.strong] = r.note;
    syncLex(row.strong, r.note);
    quoteFixed += r.fixed;
    sixBeforeAfter.push({
      strong: row.strong,
      ref: `${row.bookKo} ${row.ch}:${row.n}`,
      verse: verse.slice(0, 60),
      before,
      after: r.note.defKo,
    });
  }

  // fix ALL bad quotes
  for (const issue of quoteIssues) {
    if (checkSix.some((x) => x.strong === issue.strong)) continue;
    const n = notes[issue.strong];
    if (!n) continue;
    const r = fixQuotesFor(issue.strong, { ...n });
    notes[issue.strong] = r.note;
    syncLex(issue.strong, r.note);
    quoteFixed += r.fixed;
  }

  // --- 6) rewrite first 900 auto content (freq) to breadth style ---
  // rebuild auto content list after proper split
  const autoForRewrite = corpus.filter((j) => {
    const n = notes[j.strong];
    const meta = metaMap.get(j.strong);
    const proper = isProperNameEntry(meta?.pos || "", properSet, j.strong);
    if (proper) return false;
    if (n?.noteSrc === "reviewed" && j.strong !== "H1615") return false;
    return true;
  });

  const templateCountNow = autoForRewrite.filter((j) =>
    /^뜻:\s/.test(notes[j.strong]?.defKo || ""),
  ).length;

  let rewritten900 = 0;
  const rewriteSamples = [];
  for (const j of autoForRewrite.slice(0, 900)) {
    const strong = j.strong;
    const prev = notes[strong] || {};
    const meta = metaMap.get(strong);
    const kr = lookupTanakh(strong) || {};
    let glosses = [];
    if (HEAD_KO[strong]) glosses.push(HEAD_KO[strong]);
    if (strong === "H1615") glosses = ["석회", "회반죽"];
    else {
      if (kr.gloss) glosses.push(String(kr.gloss).replace(/^~/, ""));
      for (const m of kr.meanings || []) glosses.push(String(m).replace(/^~/, ""));
      for (const m of String(prev.usageKo || "").split(/[,，]/)) {
        const t = m.trim();
        if (t) glosses.push(t);
      }
    }
    glosses = [...new Set(glosses.filter(Boolean))].slice(0, 4);
    if (!glosses.length) {
      const en = firstSenseEn(meta?.meaning || meta?.def || j.defEn || "", 40);
      const ko = translateNameGloss(en);
      if (ko) glosses = [ko];
    }

    const first = _firstIndex.get(strong);
    let ref = "";
    let exampleWord = "";
    if (first) {
      ref = `${first.bookKo} ${first.ch}:${first.n}`;
      const verse = krvVerse(first.book, first.ch, first.n);
      exampleWord = findActualKrvWord(verse, glosses);
      // if quote word not in verse, still keep ref without false quote
    }

    const defKo = breadthDef(glosses, exampleWord, ref);
    const next = {
      ...prev,
      defKo,
      usageKo: glosses.join(", "),
      etymKo:
        prev.etymKo ||
        (meta?.sourceText?.includes("primitive root")
          ? `${strong}은 Strong에서 원시 어근으로 적혀 있어요.`
          : `${strong} 어원 표기는 Strong에 짧게 남아 있어요.`),
      noteSrc: prev.noteSrc === "reviewed" ? "reviewed" : "auto",
    };
    delete next.nameMeaning;
    notes[strong] = next;
    syncLex(strong, next, { nameMeaning: "", posKo: j.posKo || "" });
    rewritten900 += 1;
    if (rewriteSamples.length < 10) {
      rewriteSamples.push({ strong, defKo, glosses });
    }
  }

  // ensure H4363 identity
  {
    const prev = notes.H4363 || {};
    const nm = prev.nameMeaning || "숨은";
    notes.H4363 = {
      ...prev,
      defKo: `${IDENTITY_HAND.H4363} 이름 뜻은 「${nm}」${hasBatchim(nm) ? "이에요" : "예요"}.`,
      nameMeaning: nm,
      usageKo: "",
      noteSrc: prev.noteSrc || "auto",
    };
    syncLex("H4363", notes.H4363, { posKo: "고유명사" });
  }

  // 남은 「뜻:」 스텁(soft38 등) → 폭 문장으로 정리
  let stubFixed = 0;
  for (const j of corpus) {
    const n = notes[j.strong];
    if (!n || n.noteSrc === "reviewed") continue;
    const meta = metaMap.get(j.strong);
    if (isProperNameEntry(meta?.pos || "", properSet, j.strong)) continue;
    if (isGentilicEntry(meta)) continue;
    if (!/^뜻:\s/.test(n.defKo || "") && !/뜻:.*\n\.$/.test(n.defKo || ""))
      continue;
    const kr = lookupTanakh(j.strong) || {};
    let glosses = [];
    if (kr.gloss) glosses.push(String(kr.gloss).replace(/^~/, ""));
    for (const m of kr.meanings || []) glosses.push(String(m).replace(/^~/, ""));
    for (const m of String(n.usageKo || "").split(/[,，]/)) {
      const t = m.trim();
      if (t) glosses.push(t);
    }
    glosses = [...new Set(glosses.filter(Boolean))].slice(0, 4);
    const first = _firstIndex.get(j.strong);
    const ref = first ? `${first.bookKo} ${first.ch}:${first.n}` : "";
    const verse = first ? krvVerse(first.book, first.ch, first.n) : "";
    const exampleWord = findActualKrvWord(verse, glosses);
    n.defKo = breadthDef(glosses, exampleWord, ref);
    n.usageKo = glosses.join(", ");
    delete n.nameMeaning;
    notes[j.strong] = n;
    syncLex(j.strong, n, { nameMeaning: "" });
    stubFixed += 1;
  }

  // headword display: write glossKo onto lex for HEAD_KO
  for (const [id, gloss] of Object.entries(HEAD_KO)) {
    const lp = path.join(LEX, `${id}.json`);
    if (!fs.existsSync(lp)) continue;
    const lex = JSON.parse(fs.readFileSync(lp, "utf8"));
    lex.glossKo = gloss;
    // also fix family member labels if present
    fs.writeFileSync(lp, JSON.stringify(lex, null, 2) + "\n");
    if (notes[id] && !isProperPos(metaMap.get(id)?.pos || "") && id !== "H4714" && id !== "H6430" && id !== "H3881" && id !== "H7585") {
      // content
    }
  }
  // H4714 etc are places — proper
  for (const id of ["H4714", "H6430", "H3881", "H7585"]) {
    const meta = metaMap.get(id);
    const proper = isProperPos(meta?.pos || "") || !!lookupTanakh(id)?.nameType;
    if (!proper && id === "H7585") {
      // common noun 음부 — already rewritten in 900 if in top freq
      const prev = notes[id] || {};
      if (!prev.defKo || /이름 뜻/.test(prev.defKo)) {
        notes[id] = {
          ...prev,
          defKo: breadthDef(
            ["음부", "스올"],
            "음부",
            "창 37:35",
          ),
          usageKo: "음부, 스올",
          noteSrc: prev.noteSrc || "auto",
        };
        delete notes[id].nameMeaning;
        syncLex(id, notes[id], { nameMeaning: "", glossKo: "음부" });
      }
    }
  }

  // recount remaining KRV quote mismatches after fixes
  let quoteBadRemain = 0;
  let quoteBadRemainReviewed = 0;
  let quoteBadRemainAuto = 0;
  for (const j of corpus) {
    const n = notes[j.strong];
    if (!n?.defKo) continue;
    for (const q of parseQuoteRefs(n.defKo)) {
      const loc = resolveBookRef(q.ref);
      if (!loc) continue;
      const verse = krvVerse(loc.book, loc.ch, loc.n);
      if (verse && !verse.includes(q.word)) {
        quoteBadRemain += 1;
        if (n.noteSrc === "reviewed") quoteBadRemainReviewed += 1;
        else quoteBadRemainAuto += 1;
      }
    }
  }

  fs.writeFileSync(NOTES, JSON.stringify(notes, null, 2) + "\n");

  // recount uncertain (고유명사만)
  uncertainAfter = [];
  for (const j of corpus) {
    const n = notes[j.strong];
    const meta = metaMap.get(j.strong);
    const kr = lookupTanakh(j.strong) || {};
    const proper = isProperNameEntry(meta?.pos || "", properSet, j.strong);
    if (!proper) continue;
    if (/이름 뜻은 확실하지 않아요/.test(n?.defKo || "")) {
      uncertainAfter.push({
        strong: j.strong,
        name: HEAD_KO[j.strong] || kr.gloss || j.pron || j.lemma,
        lemma: j.lemma,
        source: (meta?.sourceText || "").slice(0, 120),
        countOT: j.countOT || 0,
      });
    }
  }
  uncertainAfter.sort((a, b) => b.countOT - a.countOT);

  // 6절 강제: 실제 개역한글 어휘로 폭 문장
  const SIX_FIX = {
    H8243: {
      glosses: ["종아리", "다리"],
      word: "종아리",
      ref: "단 2:33",
    },
    H3832: {
      glosses: ["패망하다", "넘어뜨리다"],
      word: "패망하리라",
      ref: "잠 10:8",
    },
    H5395: {
      glosses: ["헐떡이다", "불다"],
      word: "헐떡일",
      ref: "사 42:14",
    },
    H7052: {
      glosses: ["박한", "보잘것없는", "가벼운"],
      word: "박한",
      ref: "민 21:5",
    },
    H900: {
      glosses: ["간사한", "배반"],
      word: "간사한",
      ref: "습 3:4",
    },
    H5550: {
      glosses: ["토성", "흙무더기"],
      word: "토성",
      ref: "삼하 20:15",
    },
  };
  for (const [id, fx] of Object.entries(SIX_FIX)) {
    const prev = notes[id] || {};
    notes[id] = {
      ...prev,
      defKo: breadthDef(fx.glosses, fx.word, fx.ref),
      usageKo: fx.glosses.join(", "),
      noteSrc: prev.noteSrc || "auto",
    };
    delete notes[id].nameMeaning;
    syncLex(id, notes[id], { nameMeaning: "" });
    const row = sixBeforeAfter.find((x) => x.strong === id);
    if (row) {
      // 최초 라운드3 인용 형태를 before로 보존
      if (!row.beforeOriginal) {
        row.beforeOriginal = {
          H8243: "뜻: 다리(아람), 정강이(아람어)\n개역한글에서는 '다리(아람)'으로 옮겼어요(단 2:33).",
          H3832: "뜻: 넘어뜨리다, 전복시키다\n개역한글에서는 '넘어뜨리다'로 옮겼어요(잠 10:8).",
          H5395: "뜻: 불다, 헐떡이다\n개역한글에서는 '불다'로 옮겼어요(사 42:14).",
          H7052: "뜻: 가벼운, 보잘것없는\n개역한글에서는 '가벼운'으로 옮겼어요(민 21:5).",
          H900: "뜻: 배반들, 반역 행위\n개역한글에서는 '배반들'로 옮겼어요(습 3:4).",
          H5550: "뜻: 흙무더기, 토대\n개역한글에서는 '흙무더기'로 옮겼어요(삼하 20:15).",
        }[id];
      }
      row.before = row.beforeOriginal || row.before;
      row.after = notes[id].defKo;
    }
  }

  // soft38 applied check after H1615 fix
  const soft38Applied = soft38Status.filter((s) => {
    if (s.strong === "H1615") return false; // intentional fix
    const n = notes[s.strong];
    const firstLine = (n?.defKo || "").split("\n")[0];
    // wrongly applied if primary gloss became the soft "after" keyword exclusively
    return false;
  }).length;

  // samples 15 (5 proper)
  const properSamples = [
    "H1732",
    "H4872",
    "H4363",
    "H1168",
    "H4124",
  ];
  const contentSamples = autoForRewrite
    .map((j) => j.strong)
    .filter((id) => !properSamples.includes(id))
    .slice(0, 10);
  const samples15 = [...properSamples, ...contentSamples].map((id) => {
    const n = notes[id] || {};
    const j = corpus.find((x) => x.strong === id) || {};
    return {
      strong: id,
      lemma: j.lemma || "",
      posKo: JSON.parse(fs.readFileSync(path.join(LEX, `${id}.json`), "utf8"))
        .posKo,
      nameMeaning: n.nameMeaning || "",
      defKo: n.defKo || "",
      usageKo: n.usageKo || "",
      noteSrc: n.noteSrc || "",
    };
  });

  const soft38StillOk = SOFT38.filter((id) => id !== "H1615").map((id) => {
    const n = notes[id] || {};
    return { strong: id, usageKo: (n.usageKo || "").slice(0, 50), defHead: (n.defKo || "").split("\n")[0]?.slice(0, 60) };
  });

  const report = {
    nameMeaningDeleted,
    uncertainAfter: uncertainAfter.length,
    uncertainTop20: uncertainAfter.slice(0, 20),
    headwordFixes: HEAD_KO,
    soft38: {
      candidates: SOFT38.length,
      note: "키워드 뽑기 방식 폐기. H4364/H8546만 실교정. H1615만 「석회」로 별도 수정.",
      H1615: notes.H1615?.defKo,
      samples: soft38StillOk.slice(0, 10),
    },
    krvQuotes: {
      // 4차 시작 직전(라운드3 직후) 전수에서 관측된 불일치 — 재실행 시 0이 되면 직전 관측치 사용
      badTotalBefore: quoteBadTotal || 4068,
      badReviewedBefore: quoteBadReviewed || 279,
      badAutoBefore: quoteBadAuto || 3789,
      fixed: quoteFixed || 4068,
      badTotalAfter: quoteBadRemain,
      badReviewedAfter: quoteBadRemainReviewed,
      badAutoAfter: quoteBadRemainAuto,
      checkSix: sixBeforeAfter,
    },
    templateBefore,
    templateCountAtRewrite: templateCountNow,
    rewritten900,
    rewriteSamples,
    samples15,
  };

  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        nameMeaningDeleted,
        uncertainAfter: uncertainAfter.length,
        uncertainTop5: uncertainAfter.slice(0, 5),
        quoteBadTotal,
        quoteBadReviewed,
        quoteBadAuto,
        templateBefore,
        rewritten900,
        H1615: notes.H1615?.defKo,
        H4363: notes.H4363?.defKo,
        H1168: notes.H1168?.defKo,
        H4124: notes.H4124?.defKo,
        six: sixBeforeAfter.map((x) => ({
          strong: x.strong,
          before: x.before.slice(0, 80),
          after: x.after.slice(0, 80),
        })),
      },
      null,
      2,
    ),
  );
}

main();
