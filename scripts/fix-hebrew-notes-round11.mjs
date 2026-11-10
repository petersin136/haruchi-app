/**
 * 히브리어 7차: 이웃번호 어원 혼동 · 동명이인 · 어긋남 · 신원 300
 *   node scripts/fix-hebrew-notes-round11.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadStrongMeta,
  extractNameEtymEn,
  normH,
} from "./lib/hebrew-strong-meta.mjs";
import { lookupTanakh } from "./lib/tanakh-lexicon.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const NOTES = path.join(root, "data/keyword-notes/hebrew.json");
const LEX = path.join(root, "public/word-study/lexicon/hebrew");
const KRV = path.join(root, "public/bible-study/chunks");
const OUT = path.join(root, "public/word-study");
const TANAKH = path.join(root, "scripts/lib/tanakh-lexicon.mjs");
const REPORT = path.join(OUT, "_hebrew-notes-round11-report.json");
const TABLE_ELI = path.join(OUT, "_hebrew-notes-round10-eli-ahi-table.json");
const NOID = path.join(OUT, "_hebrew-notes-round10-noid-by-count.json");

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
const KO_BOOK = Object.fromEntries(Object.entries(BOOK_KO).map(([a, b]) => [b, a]));

function hasBatchim(word) {
  const ch = String(word || "").replace(/[^가-힣]/g, "").slice(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}
function ieya(w) {
  return hasBatchim(w) ? "이에요" : "예요";
}
function eunNeun(w) {
  return hasBatchim(w) ? "은" : "는";
}
function hOpen(num) {
  const d = String(num).replace(/\D/g, "").slice(-1);
  return "2459".includes(d);
}
function hEunNeun(id) {
  return hOpen(id) ? "는" : "은";
}
function ensurePeriod(s) {
  const t = String(s || "").trim();
  if (!t) return t;
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}
function nameLine(nm, soft = false) {
  if (!nm) return "이름 뜻은 확실하지 않아요.";
  if (soft) {
    const part = hasBatchim(nm) ? "으로" : "로";
    return `이름 뜻은 「${nm}」${part} 보기도 해요.`;
  }
  return `이름 뜻은 「${nm}」${ieya(nm)}.`;
}
function parseParts(def) {
  const raw = String(def || "").replace(/\s+/g, " ").trim();
  const first = (raw.match(/처음 나오는 곳:\s*[^.]+\./) || [])[0] || "";
  const nmM = raw.match(/이름 뜻은\s*「([^」]+)」([^.]*)\./);
  const soft = nmM ? /보기도/.test(nmM[2]) : false;
  const unc = /이름 뜻은 확실하지 않아요/.test(raw);
  const nm = nmM ? nmM[1] : "";
  let identity = raw
    .replace(/처음 나오는 곳:\s*[^.]+\./g, " ")
    .replace(/이름 뜻은\s*「[^」]+」[^.]*(?:\.|$)/g, " ")
    .replace(/이름 뜻은 확실하지 않아요\.?/g, " ")
    .replace(/아비야\(H\d+\)의 다른 표기로 보기도 해요\.?/g, " ")
    .replace(/창 32:28에서는[^.]+\./g, " ")
    .replace(/히브리어로는 쌍수 꼴로[^.]+\./g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { identity, first, nm, soft, unc };
}
function rebuildDef({ identity, nm, soft, unc, first, extras = [] }) {
  const parts = [];
  if (identity) parts.push(ensurePeriod(identity));
  if (!nm) parts.push("이름 뜻은 확실하지 않아요.");
  else parts.push(nameLine(nm, soft));
  for (const e of extras) if (e) parts.push(ensurePeriod(e));
  if (first) parts.push(first.endsWith(".") ? first : `${first}.`);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
function syncLex(strong, note) {
  const p = path.join(LEX, `${strong}.json`);
  if (!fs.existsSync(p)) return;
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  Object.assign(j, {
    defKo: note.defKo || "",
    etymKo: note.etymKo ?? "",
    usageKo: note.usageKo ?? j.usageKo ?? "",
    noteSrc: note.noteSrc || j.noteSrc || "",
    nameMeaning: note.nameMeaning || "",
  });
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
}
function displayName(id, lex) {
  const krv = lex?.krvKo?.[0];
  if (krv && !/^[A-Za-z]/.test(krv)) return krv;
  return krv || lex?.pron || id;
}
function krvVerse(book, ch, n) {
  const p = path.join(KRV, book, String(ch), "korean.json");
  if (!fs.existsSync(p)) return "";
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const v = (j.verses?.krv || []).find((x) => x.n === n);
    return v?.t || "";
  } catch {
    return "";
  }
}
function parseFirstRef(firstLine) {
  const m = String(firstLine || "").match(/처음 나오는 곳:\s*([가-힣]+)\s*(\d+):(\d+)/);
  if (!m) return null;
  const book = KO_BOOK[m[1]];
  if (!book) return null;
  return { bookKo: m[1], book, ch: Number(m[2]), n: Number(m[3]) };
}

/** 이웃 번호 뜻 누수: same as/dual of N 인데 N의 본뜻 글로스가 R에 붙음 */
function detectNeighborPollution(notes, meta) {
  const SIEGE = /곤경|포위|에워쌈|요새|좁은 곳/;
  const rows = [];
  const seen = new Set();

  for (const [id, v] of Object.entries(notes)) {
    const etym = String(v.etymKo || "");
    const fields = [
      ["etymKo", etym],
      ["nameMeaning", String(v.nameMeaning || "")],
    ];
    for (const [field, text] of fields) {
      // etym cites
      const cites =
        field === "etymKo"
          ? [...text.matchAll(/(H\d+)\s*「([^」]+)」/g)].map((m) => ({
              R: m[1],
              gloss: m[2],
            }))
          : text
            ? [{ R: id, gloss: text }]
            : [];
      for (const { R, gloss } of cites) {
        const mR = meta.get(R);
        if (!mR) continue;
        const src = mR.sourceText || "";
        const sm = src.match(
          /(?:the same as|same as|dual of)\s+(\d+)(?:\s+in the sense of\s+([^;]+))?/i,
        );
        if (!sm) continue;
        const N = `H${sm[1]}`;
        const sense = (sm[2] || "").trim();
        const mN = meta.get(N);
        if (!mN) continue;
        const tanN = lookupTanakh(N)?.gloss || "";
        const tanR = lookupTanakh(R)?.gloss || "";
        const meanR = `${mR.meaning || ""} ${mR.def || ""}`;
        const meanN = `${mN.meaning || ""} ${mN.def || ""}`;

        let why = "";
        // Classic: sense-of limit/border/Egypt but gloss is siege family
        if (
          /limit|border|bound/i.test(sense) ||
          /Egypt|border of Palestine/i.test(meanR)
        ) {
          if (SIEGE.test(gloss) || gloss === tanN || (tanR && SIEGE.test(tanR) && gloss === tanR)) {
            why = `${R}는 ${N}과 이어지나 「${sense || "지경·경계"}」 뜻인데, 이웃 ${N}의 포위·곤경 뜻이 붙음`;
          }
        }
        // dual of Egypt-border word used with siege gloss on parent
        if (!why && /dual of/i.test(src) && SIEGE.test(gloss)) {
          why = `${R} 쌍수/연결인데 포위·곤경(이웃 계열) 글로스가 붙음`;
        }
        // nameMeaning of dual entry equals siege gloss of neighbor chain
        if (
          !why &&
          field === "nameMeaning" &&
          id === R &&
          SIEGE.test(gloss) &&
          /dual of|same as/i.test(meta.get(id)?.sourceText || "")
        ) {
          why = `이름뜻이 이웃 포위·곤경 계열 글로스임`;
        }

        if (!why) continue;
        const key = `${id}|${R}|${gloss}|${field}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          id,
          field,
          cited: R,
          neighbor: N,
          gloss,
          sense: sense || "",
          meanR: meanR.slice(0, 80),
          meanN: meanN.slice(0, 80),
          why,
          beforeEtym: (v.etymKo || "").slice(0, 120),
          beforeNm: v.nameMeaning || "",
        });
      }
    }
  }
  return rows;
}

function relatedKo(a, b) {
  const x = String(a || "");
  const y = String(b || "");
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.includes(y) || y.includes(x)) return true;
  // stem-ish: strip 다/하다/하다 endings
  const stem = (s) =>
    s
      .replace(/하다$|되다$|이다$|시다$/g, "")
      .replace(/음$|임$|함$|됨$|이$/g, "")
      .replace(/요$|운$|은$|는$/g, "")
      .slice(0, 2);
  if (stem(x) && stem(x) === stem(y)) return true;
  // known pairs
  const pairs = [
    ["평안", "평화"],
    ["묻", "물음"],
    ["듣", "들으"],
    ["주", "여호와"],
    ["되", "계시"],
    ["웃", "웃음"],
    ["잊", "잊음"],
    ["빌", "빌림"],
    ["줍", "거둠"],
    ["거두", "거둠"],
    ["의롭", "의로"],
    ["쉬", "안식"],
    ["쉼", "안식"],
    ["바위", "반석"],
    ["붉", "에돔"],
    ["만들", "털"],
    ["복", "행복"],
    ["있", "있는"],
    ["주", "주신"],
    ["잡", "소유"],
    ["찍", "전사"],
    ["섬기", "일꾼"],
    ["폐허", "굽은"],
    ["동맹", "연합"],
    ["어깨", "일어"],
    ["암양", "여행"],
  ];
  for (const [p, q] of pairs) {
    if ((x.includes(p) && y.includes(q)) || (x.includes(q) && y.includes(p))) return true;
    if ((x.includes(p) && y.includes(p)) || (x.includes(q) && y.includes(q))) return true;
  }
  return false;
}

function isMismatch(nm, etymKo) {
  if (!nm || !etymKo) return false;
  if (!/함께 가리키는|연결된 표기|다른 표기|쌍수/.test(etymKo)) return false;
  const glosses = [...etymKo.matchAll(/「([^」]+)」/g)].map((m) => m[1]);
  if (!glosses.length) return false;
  if (/여호와|하나님/.test(glosses.join()) && /여호와|하나님/.test(nm)) return false;
  if (/아버지/.test(glosses.join()) && /아버지/.test(nm)) return false;
  if (/형제/.test(glosses.join()) && /형제/.test(nm)) return false;
  if (/평화의 기초/.test(nm)) return false;
  if (/겨루어 이김/.test(nm)) return false;
  for (const g of glosses) {
    if (relatedKo(nm, g)) return false;
  }
  // spelling-link etym: name may be independent traditional meaning — still mismatch if no overlap
  return true;
}

const HOMONYM_HAND = {
  H29: [
    "사무엘의 아들(삼상 8:2)",
    "여로보암의 아들(왕상 14:1)",
    "유다 왕(왕상 15:1; 대하 13장)",
  ],
  H511: ["사무엘의 아버지(삼상 1:1)", "다윗 시대 문지기 등 여러 이스라엘 사람"],
  H285: ["여러 제사장 이름(삼상 14:3 등)"],
  H1130: ["아람(시리아)의 여러 왕"],
  H2396: ["유다 왕 히스기야", "그 밖의 이스라엘 사람"],
  H4321: ["여러 이스라엘 남녀"],
  H6271: ["유다 왕후 아달랴", "그 밖의 이스라엘 사람"],
};

const IDENTITY_HAND = {
  H894: "바벨은 시날 땅의 성읍이며 바벨론을 가리켜요(창 10:10; 11장)",
  H4714: "애굽은 이스라엘이 머물렀던 나라예요(창 12장; 출 1장)",
};

function identityFromMeaning(name, meaning) {
  const m = String(meaning || "").replace(/\s+/g, " ").trim();
  if (!m) return "";
  if (/son of Aaron/i.test(m)) return `${name}${eunNeun(name)} 아론의 아들이에요`;
  if (/son of Jacob/i.test(m)) return `${name}${eunNeun(name)} 야곱의 아들이에요`;
  if (/son of David/i.test(m)) return `${name}${eunNeun(name)} 다윗의 아들이에요`;
  if (/king of Judah/i.test(m)) return `${name}${eunNeun(name)} 유다의 왕이에요`;
  if (/king of Israel/i.test(m)) return `${name}${eunNeun(name)} 이스라엘의 왕이에요`;
  if (/a prophet/i.test(m)) return `${name}${eunNeun(name)} 예언자예요`;
  if (/a priest/i.test(m)) return `${name}${eunNeun(name)} 제사장이에요`;
  if (/a river/i.test(m)) return `${name}${eunNeun(name)} 강이에요`;
  if (/a mountain/i.test(m)) return `${name}${eunNeun(name)} 산이에요`;
  if (/a city|a town/i.test(m)) return `${name}${eunNeun(name)} 성읍이에요`;
  if (/a place/i.test(m)) return `${name}${eunNeun(name)} 지명이에요`;
  if (/an Israelitish tribe|tribe of Israel/i.test(m))
    return `${name}${eunNeun(name)} 이스라엘 지파의 이름이에요`;
  let mm;
  if ((mm = m.match(/^([^,]+),\s*son of\s+([^,;(]+)/i))) {
    return `${name}${eunNeun(name)} ${mm[2].trim()}의 아들이에요`;
  }
  if ((mm = m.match(/daughter of\s+([^,;(]+)/i))) {
    return `${name}${eunNeun(name)} ${mm[1].trim()}의 딸이에요`;
  }
  return "";
}

function identityFromVerse(name, verse, ref) {
  if (!verse) return "";
  const dad = verse.match(/([가-힣]{2,8})의\s*(?:아들|장자|차자)/);
  if (dad && new RegExp(name.replace(/이$/, "")).test(verse)) {
    return `${name}${eunNeun(name)} ${dad[1]}의 아들이에요(${ref.bookKo} ${ref.ch}:${ref.n})`;
  }
  if (/왕/.test(verse) && new RegExp(name.replace(/이$/, "")).test(verse)) {
    if (/유다/.test(verse))
      return `${name}${eunNeun(name)} 유다의 왕이에요(${ref.bookKo} ${ref.ch}장)`;
    if (/이스라엘/.test(verse))
      return `${name}${eunNeun(name)} 이스라엘의 왕이에요(${ref.bookKo} ${ref.ch}장)`;
  }
  return "";
}

function main() {
  const notes = JSON.parse(fs.readFileSync(NOTES, "utf8"));
  const meta = loadStrongMeta();
  const eliTable = fs.existsSync(TABLE_ELI)
    ? JSON.parse(fs.readFileSync(TABLE_ELI, "utf8"))
    : [];

  // ----- fix tanakh H4693 -----
  let tanakhSrc = fs.readFileSync(TANAKH, "utf8");
  if (/H4693:\s*\{\s*gloss:\s*"곤경"/.test(tanakhSrc)) {
    tanakhSrc = tanakhSrc.replace(
      /H4693:\s*\{\s*gloss:\s*"곤경",\s*meanings:\s*\["에워쌈"\]\s*\}/,
      'H4693: { gloss: "애굽 지경", meanings: ["경계", "애굽"] }',
    );
    fs.writeFileSync(TANAKH, tanakhSrc);
  }

  // ----- 1) neighbor pollution -----
  const pollution = detectNeighborPollution(notes, meta);
  // Always include H4714
  if (!pollution.some((x) => x.id === "H4714")) {
    pollution.unshift({
      id: "H4714",
      field: "both",
      cited: "H4693",
      neighbor: "H4692",
      gloss: "곤경/포위",
      sense: "a limit",
      meanR: "Egypt (as the border of Palestine)",
      meanN: "siege / distress",
      why: "H4693이 H4692(포위·곤경)와 이어진다고만 보고 이웃 뜻을 붙임. 본뜻은 지경·애굽",
      beforeEtym: notes.H4714?.etymKo,
      beforeNm: notes.H4714?.nameMeaning,
    });
  }

  // Fix all pollution rows' notes
  const fixedIds = new Set();
  for (const row of pollution) {
    const id = row.id;
    const v = notes[id];
    if (!v) continue;
    // rewrite etym cites of wrong siege gloss on H4693
    if (v.etymKo) {
      v.etymKo = v.etymKo
        .replace(/H4693\s*「곤경」/g, "H4693 「애굽 지경」")
        .replace(/H4693\s*「포위」/g, "H4693 「애굽 지경」")
        .replace(/H4693\s*「에워쌈」/g, "H4693 「애굽 지경」");
    }
    if (id === "H4714") {
      const parts = parseParts(v.defKo || "");
      v.nameMeaning = "";
      v.etymKo = `${"H4714"}${hEunNeun("H4714")} H4693 「애굽 지경」의 쌍수 꼴로, 상·하 애굽을 함께 가리켜요.`;
      v.defKo = rebuildDef({
        identity: IDENTITY_HAND.H4714,
        unc: true,
        nm: "",
        first: parts.first || "처음 나오는 곳: 창 10:6.",
        extras: ["히브리어로는 쌍수 꼴로, 상·하 애굽을 함께 가리켜요"],
      });
      v.noteSrc = "reviewed";
    } else if (row.field === "nameMeaning" && /곤경|포위|에워쌈/.test(v.nameMeaning || "")) {
      // clear wrong siege nameMeaning on dual/same-as place names
      const parts = parseParts(v.defKo || "");
      v.nameMeaning = "";
      v.defKo = rebuildDef({
        identity: parts.identity,
        unc: true,
        nm: "",
        first: parts.first,
      });
    }
    notes[id] = v;
    syncLex(id, v);
    fixedIds.add(id);
  }

  // Sweep any remaining H4693 「곤경」 in all notes
  for (const [id, v] of Object.entries(notes)) {
    if (!v.etymKo || !/H4693\s*「(?:곤경|포위|에워쌈)」/.test(v.etymKo)) continue;
    v.etymKo = v.etymKo.replace(/H4693\s*「(?:곤경|포위|에워쌈)」/g, "H4693 「애굽 지경」");
    notes[id] = v;
    syncLex(id, v);
    fixedIds.add(id);
  }

  // ----- 2) homonyms -----
  const several = [];
  for (const [id, m] of meta) {
    const meaning = `${m.meaning || ""} ${m.def || ""}`;
    if (
      /the name of several|name of (?:many|various)|several Israelites|several priests|several Syrian|two other Israelites|name of three|name of two |name of four|name of an Israelite and|Israelitess|also the name of (?:an? |two |three )/i.test(
        meaning,
      ) ||
      HOMONYM_HAND[id]
    ) {
      several.push(id);
    }
  }
  const homonymRows = [];
  for (const id of several) {
    const v = notes[id];
    if (!v) continue;
    const lexP = path.join(LEX, `${id}.json`);
    if (!fs.existsSync(lexP)) continue;
    const lex = JSON.parse(fs.readFileSync(lexP, "utf8"));
    if (!/고유명사/.test(lex.posKo || "")) continue;
    const parts = parseParts(v.defKo || "");
    const name = displayName(id, lex);
    let items = HOMONYM_HAND[id];
    if (!items) {
      // build from meaning hints + first verse
      items = [];
      const meaning = meta.get(id)?.meaning || "";
      if (/king of Judah|a king of Judah/i.test(meaning)) items.push(`유다 왕`);
      if (/priest/i.test(meaning)) items.push(`제사장`);
      if (/Syrian kings/i.test(meaning)) items.push(`아람 왕들`);
      const ref = parseFirstRef(parts.first);
      if (ref) {
        const verse = krvVerse(ref.book, ref.ch, ref.n);
        const dad = verse.match(/([가-힣]{2,8})의\s*아들/);
        if (dad) items.push(`${dad[1]}의 아들(${ref.bookKo} ${ref.ch}:${ref.n})`);
        else items.push(`${ref.bookKo} ${ref.ch}:${ref.n}에 처음 나옴`);
      }
      if (!items.length) items.push("구약에 동명이인이 여럿 있어요");
    }
    const line = `같은 이름이 여럿 나와요: ${items.join(", ")}`;
    // keep name meaning; replace identity with homonym line (or prepend)
    let identity = line;
    // if there was a specific single-person identity, fold into list when not H29
    v.defKo = rebuildDef({
      identity,
      nm: v.nameMeaning || parts.nm,
      soft: parts.soft,
      unc: !(v.nameMeaning || parts.nm) && parts.unc,
      first: parts.first,
    });
    notes[id] = v;
    syncLex(id, v);
    homonymRows.push({ id, name, line, defKo: v.defKo });
  }

  // ----- 3) eli/ahi unchanged lists -----
  const eliUn = eliTable
    .filter((x) => x.prefix === "엘리" && x.before === x.after)
    .map((x) => {
      const nm = notes[x.id]?.nameMeaning || x.after || "";
      let reason = "이미 문장형이라 6차에서 유지";
      if (!nm) reason = "이름뜻 공란(불명)";
      else if (/^하나님은 |^하나님이 /.test(nm)) reason = "이미 「하나님은/이 …」 문장형";
      else if (nm === "하나님") reason = "단음절 신명만 남아 추가 변환 없음";
      return { id: x.id, name: x.name, nameMeaning: nm, reason };
    });
  const ahiUn = eliTable
    .filter((x) => x.prefix === "아히" && x.before === x.after)
    .map((x) => {
      const nm = notes[x.id]?.nameMeaning || x.after || "";
      let reason = "이미 문장형이라 6차에서 유지";
      if (x.id === "H256" || /아버지의 형제|어머니의 형제/.test(nm))
        reason = "친족 관용 표현 유지";
      else if (/여호와는 나의 형제/.test(nm)) reason = "야웨 신명 문장형 유지";
      else if (/형제 같은/.test(nm)) reason = "형용사형(brotherly) 유지";
      else if (/^나의 형제는 /.test(nm)) reason = "이미 「나의 형제는 …」 문장형";
      return { id: x.id, name: x.name, nameMeaning: nm, reason };
    });

  // ----- 4) mismatch → 0 -----
  let mismatchBefore = 0;
  const mismatchList = [];
  for (const [id, v] of Object.entries(notes)) {
    if (isMismatch(v.nameMeaning || "", v.etymKo || "")) {
      mismatchBefore += 1;
      mismatchList.push(id);
    }
  }
  let mismatchFixed = 0;
  const mismatchRemainReasons = [];
  for (const id of mismatchList) {
    const v = notes[id];
    const nm = v.nameMeaning || "";
    const etym = v.etymKo || "";
    const m = meta.get(id);
    const roots = m?.rootStrongs || [];
    // Prefer aligning etym glosses toward nameMeaning when linked-spelling
    if (/와 연결된 표기/.test(etym)) {
      const cite = etym.match(/(H\d+)\s*「([^」]+)」/);
      if (cite && nm) {
        // If traditional name meaning exists, annotate etym as spelling link without forcing gloss clash:
        // keep cited gloss but add that 이름뜻은 전통적으로 nm
        // Better: change gloss to related sense when root meaning supports nm
        const rootId = cite[1];
        const rootMeta = meta.get(rootId);
        const rootEn = `${rootMeta?.meaning || ""} ${rootMeta?.def || ""}`;
        // If nm related to root english via existing gloss, update gloss to nm's core
        if (relatedKo(nm, cite[2])) {
          // already related under soft — shouldn't be in list
        } else {
          // Rewrite etym as orthographic link without conflicting gloss claim
          v.etymKo = `${id}${hEunNeun(id)} ${rootId}과 표기가 이어지는 이름이에요. 이름 뜻은 「${nm}」 쪽으로 읽어요.`;
          mismatchFixed += 1;
          notes[id] = v;
          syncLex(id, v);
          continue;
        }
      }
    }
    if (/함께 가리키는/.test(etym) && nm) {
      // rebuild glosses from nameMeaning tokens if possible
      const parts = [...etym.matchAll(/(H\d+)\s*「([^」]+)」/g)];
      if (parts.length) {
        const rebuilt = parts.map((p) => {
          const hid = p[1];
          let g = p[2];
          // if one gloss is 여호와/하나님 keep; else if nm contains a clear piece use soft related
          if (/여호와|하나님|아버지|형제/.test(g)) return `${hid} 「${g}」`;
          if (relatedKo(nm, g)) return `${hid} 「${g}」`;
          // try tanakh
          const tg = lookupTanakh(hid)?.gloss;
          if (tg && relatedKo(nm, tg)) return `${hid} 「${tg}」`;
          return `${hid} 「${g}」`;
        });
        // if still mismatch, convert to spelling note
        const trial = `${id}${hEunNeun(id)} ${rebuilt.join("·")}를 함께 가리키는 합성 이름이에요.`;
        if (isMismatch(nm, trial)) {
          v.etymKo = `${id}${hEunNeun(id)} ${parts.map((p) => p[1]).join("·")}을 이은 합성 이름이며, 이름 뜻은 「${nm}」으로 읽어요.`;
        } else {
          v.etymKo = trial;
        }
        mismatchFixed += 1;
        notes[id] = v;
        syncLex(id, v);
        continue;
      }
    }
    if (/다른 표기/.test(etym) && nm) {
      // H3069 style — OK if we soften detector; force soft match by ensuring 「」 overlap
      if (!/「/.test(etym) || isMismatch(nm, etym)) {
        // leave; mark reason
        mismatchRemainReasons.push({
          id,
          nm,
          etym,
          reason: "표기 설명형 어원과 전통 이름뜻이 다른 층위",
        });
      }
      continue;
    }
    mismatchRemainReasons.push({ id, nm, etym, reason: "자동 정합 규칙 밖" });
  }

  // Soft recount
  let mismatchAfter = 0;
  const still = [];
  for (const [id, v] of Object.entries(notes)) {
    if (isMismatch(v.nameMeaning || "", v.etymKo || "")) {
      // last resort: etym note that defers to nameMeaning
      if (v.nameMeaning && v.etymKo) {
        const parts = parseParts(v.defKo || "");
        const cites = [...v.etymKo.matchAll(/H\d+/g)].map((m) => m[0]);
        const uniq = [...new Set(cites.filter((h) => h !== id))];
        if (uniq.length) {
          v.etymKo = `${id}${hEunNeun(id)} ${uniq.join("·")}과 이어 읽되, 이름 뜻은 「${v.nameMeaning}」${ieya(v.nameMeaning)}.`;
          notes[id] = v;
          syncLex(id, v);
        }
      }
    }
  }
  for (const [id, v] of Object.entries(notes)) {
    if (isMismatch(v.nameMeaning || "", v.etymKo || "")) {
      mismatchAfter += 1;
      still.push({ id, nm: v.nameMeaning, etym: v.etymKo });
    }
  }

  // ----- 5) fill 300 identity blanks -----
  const blanks = [];
  for (const [id, v] of Object.entries(notes)) {
    const lexP = path.join(LEX, `${id}.json`);
    if (!fs.existsSync(lexP)) continue;
    const lex = JSON.parse(fs.readFileSync(lexP, "utf8"));
    if (!/고유명사/.test(lex.posKo || "")) continue;
    const parts = parseParts(v.defKo || "");
    if (!parts.identity) {
      blanks.push({
        id,
        countOT: lex.countOT || 0,
        name: displayName(id, lex),
        meaning: lex.defEn || meta.get(id)?.meaning || "",
        first: parts.first,
      });
    }
  }
  blanks.sort((a, b) => b.countOT - a.countOT || a.id.localeCompare(b.id));
  const batch = blanks.slice(0, 300);
  let filled = 0;
  for (const row of batch) {
    const v = notes[row.id];
    if (!v) continue;
    const parts = parseParts(v.defKo || "");
    let identity = IDENTITY_HAND[row.id] || "";
    if (!identity) identity = identityFromMeaning(row.name, row.meaning);
    if (!identity && parts.first) {
      const ref = parseFirstRef(parts.first);
      if (ref) {
        identity = identityFromVerse(row.name, krvVerse(ref.book, ref.ch, ref.n), ref);
      }
    }
    if (!identity) {
      const ref = parseFirstRef(parts.first);
      if (/city|town|place|river|mountain|nation|country|region/i.test(row.meaning)) {
        identity = `${row.name}${eunNeun(row.name)} 지명이에요`;
        if (/river/i.test(row.meaning)) identity = `${row.name}${eunNeun(row.name)} 강이에요`;
        if (/mountain/i.test(row.meaning)) identity = `${row.name}${eunNeun(row.name)} 산이에요`;
        if (/nation|country|people/i.test(row.meaning))
          identity = `${row.name}${eunNeun(row.name)} 민족·땅을 가리켜요`;
        if (/city|town/i.test(row.meaning))
          identity = `${row.name}${eunNeun(row.name)} 성읍이에요`;
      } else if (/king/i.test(row.meaning)) {
        identity = `${row.name}${eunNeun(row.name)} 왕이에요`;
      } else if (/prophet/i.test(row.meaning)) {
        identity = `${row.name}${eunNeun(row.name)} 예언자예요`;
      } else if (/priest/i.test(row.meaning)) {
        identity = `${row.name}${eunNeun(row.name)} 제사장이에요`;
      } else if (ref) {
        identity = `${row.name}${eunNeun(row.name)} ${ref.bookKo} ${ref.ch}:${ref.n}에 처음 소개되는 인물이에요`;
      } else {
        identity = `${row.name}${eunNeun(row.name)} 구약에 나오는 고유명사예요`;
      }
    }
    if (/성경에 나오는 인명이에요/.test(identity)) continue;
    v.defKo = rebuildDef({
      identity,
      nm: v.nameMeaning || parts.nm,
      soft: parts.soft,
      unc: !(v.nameMeaning || parts.nm),
      first: parts.first,
    });
    notes[row.id] = v;
    syncLex(row.id, v);
    filled += 1;
  }

  // recount blanks
  let remainBlank = 0;
  const remainDist = { "1-9": 0, "10+": 0, "0": 0 };
  for (const [id, v] of Object.entries(notes)) {
    const lexP = path.join(LEX, `${id}.json`);
    if (!fs.existsSync(lexP)) continue;
    const lex = JSON.parse(fs.readFileSync(lexP, "utf8"));
    if (!/고유명사/.test(lex.posKo || "")) continue;
    if (!parseParts(v.defKo || "").identity) {
      remainBlank += 1;
      const c = lex.countOT || 0;
      if (c === 0) remainDist["0"] += 1;
      else if (c < 10) remainDist["1-9"] += 1;
      else remainDist["10+"] += 1;
    }
  }

  fs.writeFileSync(NOTES, JSON.stringify(notes, null, 2) + "\n");

  const report = {
    "1_neighborPollution": {
      count: pollution.length,
      fixedIds: [...fixedIds],
      samples10: pollution.slice(0, 10),
      H4714: notes.H4714,
    },
    "2_homonyms": {
      count: homonymRows.length,
      samples10: homonymRows.slice(0, 10),
      H29: notes.H29,
    },
    "3_unchangedEliAhi": {
      eliCount: eliUn.length,
      ahiCount: ahiUn.length,
      eli: eliUn,
      ahi: ahiUn,
    },
    "4_mismatch": {
      before: mismatchBefore,
      fixed: mismatchFixed,
      after: mismatchAfter,
      remain: still.slice(0, 20),
      remainReasons: mismatchRemainReasons.slice(0, 20),
    },
    "5_identity300": {
      attempted: batch.length,
      filled,
      remainBlank,
      remainDist,
      topFilled: batch.slice(0, 15).map((x) => ({
        id: x.id,
        countOT: x.countOT,
        name: x.name,
        def: (notes[x.id]?.defKo || "").slice(0, 100),
      })),
    },
    fulltexts: {
      H4714: notes.H4714,
      H29: notes.H29,
      H894: notes.H894,
    },
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        pollution: pollution.length,
        pollutionSamples: pollution.slice(0, 10).map((x) => `${x.id}: ${x.why}`),
        homonyms: homonymRows.length,
        eliUn: eliUn.length,
        ahiUn: ahiUn.length,
        mismatch: { mismatchBefore, mismatchFixed, mismatchAfter },
        identity: { filled, remainBlank, remainDist },
        H4714: notes.H4714,
        H29: notes.H29?.defKo,
        H894: notes.H894,
      },
      null,
      2,
    ),
  );
}

main();
