/**
 * 히브리어 8차: 동명이인 신원·빈도순 · 땅/사람 · 바벨 · 공란 60
 *   node scripts/fix-hebrew-notes-round12.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadStrongMeta } from "./lib/hebrew-strong-meta.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const NOTES = path.join(root, "data/keyword-notes/hebrew.json");
const LEX = path.join(root, "public/word-study/lexicon/hebrew");
const KRV = path.join(root, "public/bible-study/chunks");
const OUT = path.join(root, "public/word-study");
const REPORT = path.join(OUT, "_hebrew-notes-round12-report.json");

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
function ensurePeriod(s) {
  const t = String(s || "").trim();
  if (!t) return t;
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}
function nameLine(nm) {
  if (!nm) return "이름 뜻은 확실하지 않아요.";
  return `이름 뜻은 「${nm}」${ieya(nm)}.`;
}
function parseParts(def) {
  const raw = String(def || "").replace(/\s+/g, " ").trim();
  const first = (raw.match(/처음 나오는 곳:\s*[^.]+\./) || [])[0] || "";
  const nmM = raw.match(/이름 뜻은\s*「([^」]+)」/);
  const nm = nmM ? nmM[1] : "";
  const unc = /이름 뜻은 확실하지 않아요/.test(raw);
  let identity = raw
    .replace(/처음 나오는 곳:\s*[^.]+\./g, " ")
    .replace(/이름 뜻은\s*「[^」]+」[^.]*(?:\.|$)/g, " ")
    .replace(/이름 뜻은 확실하지 않아요\.?/g, " ")
    .replace(/히브리어로는 쌍수 꼴로[^.]+\./g, " ")
    .replace(/창 11:9[^.]+\./g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { identity, first, nm, unc };
}
function rebuildDef({ identity, nm, first, extras = [] }) {
  const parts = [];
  if (identity) parts.push(ensurePeriod(identity));
  if (!nm) parts.push("이름 뜻은 확실하지 않아요.");
  else parts.push(nameLine(nm));
  for (const e of extras) if (e) parts.push(ensurePeriod(e));
  if (first) parts.push(first.endsWith(".") ? first : `${first}.`);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
function syncLex(id, note) {
  const p = path.join(LEX, `${id}.json`);
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
function displayName(lex) {
  const krv = lex?.krvKo?.[0];
  if (krv && !/^[A-Za-z]/.test(krv)) return krv;
  return krv || lex?.pron || "";
}

/** Load KRV hits for a Korean name (cached per name) */
const _nameHits = new Map();
function krvHitsForName(name) {
  if (!name || name.length < 2) return [];
  if (_nameHits.has(name)) return _nameHits.get(name);
  const hits = [];
  for (const book of BOOK_ORDER) {
    const dir = path.join(KRV, book);
    if (!fs.existsSync(dir)) continue;
    for (const chName of fs.readdirSync(dir)) {
      const p = path.join(dir, chName, "korean.json");
      if (!fs.existsSync(p)) continue;
      let j;
      try {
        j = JSON.parse(fs.readFileSync(p, "utf8"));
      } catch {
        continue;
      }
      const ch = Number(chName);
      for (const v of j.verses?.krv || []) {
        const t = v.t || "";
        if (!t.includes(name)) continue;
        hits.push({ book, bookKo: BOOK_KO[book], ch, n: v.n, t });
      }
    }
  }
  _nameHits.set(name, hits);
  return hits;
}

function extractIdentities(name, hits) {
  const map = new Map(); // key -> {label, ref, count}
  const short = name.replace(/이$/, "");
  for (const h of hits) {
    const t = h.t;
    const ref = `${h.bookKo} ${h.ch}:${h.n}`;
    let label = "";

    // 왕
    if (
      new RegExp(`${short}.{0,12}왕|왕.{0,8}${short}`).test(t) ||
      /유다 왕|이스라엘 왕|왕이 되고|대신하여 왕이/.test(t)
    ) {
      if (/유다/.test(t)) label = `유다 왕(${ref})`;
      else if (/이스라엘/.test(t)) label = `이스라엘 왕(${ref})`;
      else if (/블레셋/.test(t)) label = `블레셋 왕(${ref})`;
      else label = `왕(${ref})`;
    }
    // 예언자/선지자
    if (!label && /선지자|예언자/.test(t) && t.includes(short)) {
      label = /선지자/.test(t) ? `선지자(${ref})` : `예언자(${ref})`;
    }
    // 제사장
    if (!label && /제사장/.test(t) && t.includes(short)) {
      label = `제사장(${ref})`;
    }
    // 사사
    if (!label && /사사/.test(t) && t.includes(short)) {
      label = `사사(${ref})`;
    }
    // 아들/딸
    if (!label) {
      const dad = t.match(
        new RegExp(`([가-힣]{2,8})의\\s*(?:아들|장자|차자).{0,20}${short}|${short}.{0,10}([가-힣]{2,8})의\\s*아들`),
      );
      // simpler: X의 아들 NAME / NAME ... X의 아들
      const m1 = t.match(
        new RegExp(`([가-힣]{2,8})의\\s*(?:아들|장자|차자)\\s*${short}`),
      );
      const m2 = t.match(
        new RegExp(`${short}[은는이가을를와과]?\\s*([가-힣]{2,8})의\\s*아들`),
      );
      const m3 = t.match(
        new RegExp(`아들[의]?\\s*이름은\\s*${short}|이름은\\s*${short}`),
      );
      if (m1) label = `${m1[1]}의 아들(${ref})`;
      else if (m2) label = `${m2[1]}의 아들(${ref})`;
      else {
        const m4 = t.match(/([가-힣]{2,8})의\s*(?:아들|장자|차자)/);
        if (m4 && t.includes(short)) label = `${m4[1]}의 아들(${ref})`;
      }
      if (!label) {
        const dau = t.match(
          new RegExp(`([가-힣]{2,8})의\\s*딸\\s*${short}|${short}.{0,8}([가-힣]{2,8})의\\s*딸`),
        );
        if (dau) label = `${dau[1] || dau[2]}의 딸(${ref})`;
      }
    }
    // 어머니
    if (!label && /모친의 이름은/.test(t) && t.includes(short)) {
      label = `왕의 어머니(${ref})`;
    }

    if (!label) continue;

    // normalize label key without ref for clustering
    const key = label.replace(/\([^)]+\)/g, "").trim();
    const prev = map.get(key);
    if (!prev) map.set(key, { key, label, ref, count: 1 });
    else {
      prev.count += 1;
      // keep earliest ref in book order already roughly by scan order
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function countExpectedPeople(meaning) {
  const m = String(meaning || "");
  let n = 0;
  const several = m.match(/several/i);
  if (several) n = 3;
  const num = m.match(
    /(?:name of |the name of )?(?:two|three|four|five) (?:other )?(?:Israelites|Israelitesses|women|men|priests|kings|Tyrians|Syrians|places)/i,
  );
  if (num) {
    const map = { two: 2, three: 3, four: 4, five: 5 };
    const w = (num[0].match(/two|three|four|five/i) || [""])[0].toLowerCase();
    n = Math.max(n, map[w] || 0);
  }
  if (/famous prophet and of two other/i.test(m)) n = 3;
  if (/two Philistine kings and of two Israelites/i.test(m)) n = 4;
  if (/three women and a place/i.test(m)) n = 3;
  if (/two Israelites/i.test(m)) n = Math.max(n, 2);
  if (/three Israelites/i.test(m)) n = Math.max(n, 3);
  if (/four Israelites/i.test(m)) n = Math.max(n, 4);
  return n || 2;
}

function isPlaceAndPerson(meaning) {
  const m = String(meaning || "");
  const place = /place|region|city|town|country|East of the Jordan/i.test(m);
  const person = /Israelite|Israelitess|women|man|men|person|prophet|king/i.test(m);
  return place && person;
}
function isPlaceOnly(meaning) {
  const m = String(meaning || "");
  return (
    /place|region|city|town/i.test(m) &&
    !/Israelite|Israelitess|women|prophet|king|man\b/i.test(m)
  );
}

function placeLabel(meaning, firstRef) {
  if (/East of the Jordan|Gilad/i.test(meaning)) return `요단 동쪽 지역(${firstRef})`;
  if (/Chebron|Hebron/i.test(meaning)) return `가나안 성읍(${firstRef})`;
  if (/place in Palestine/i.test(meaning)) return `가나안 지명(${firstRef})`;
  if (/region/i.test(meaning)) return `지역 이름(${firstRef})`;
  return `지명(${firstRef})`;
}

/** Hand-crafted priority lists (most frequent first) */
const HAND = {
  H8050: {
    kind: "people",
    items: [
      "선지자 사무엘(삼상 1:20; 3장)",
      "암미훗의 아들(민 34:20)",
    ],
    other: 0,
  },
  H452: {
    kind: "people",
    items: [
      "예언자 엘리야(왕상 17:1)",
      "그 밖의 이스라엘 사람 2명",
    ],
  },
  H2396: {
    kind: "people",
    items: [
      "유다 왕 히스기야(왕하 16:20; 18장)",
      "그 밖의 이스라엘 사람",
    ],
  },
  H29: {
    kind: "people",
    items: [
      "사무엘의 아들(삼상 8:2)",
      "여로보암의 아들(왕상 14:1)",
      "유다 왕(왕상 15:1; 대하 13장)",
    ],
  },
  H1568: {
    kind: "placePerson",
    place: "요단 동쪽 길르앗 지역(창 31:21)",
    people: ["사람 이름으로도 여럿 나와요"],
  },
  H2275: {
    kind: "placePerson",
    place: "가나안 성읍 헤브론(창 13:18)",
    people: ["사람 이름으로도 두 명이 나와요"],
  },
  H40: {
    kind: "people",
    items: [
      "블레셋 왕 아비멜렉(창 20:2)",
      "그 밖의 블레셋 왕·이스라엘 사람",
    ],
  },
  H511: {
    kind: "people",
    items: [
      "사무엘의 아버지(삼상 1:1)",
      "그 밖의 이스라엘 사람",
    ],
  },
  H1130: {
    kind: "people",
    items: ["아람(시리아)의 여러 왕(왕상 15:18 등)"],
  },
  H285: {
    kind: "people",
    items: ["제사장 아히둡(삼상 14:3)", "그 밖의 제사장들"],
  },
};

function buildHomonymIdentity(id, name, meaning, firstLine, lex) {
  const firstRef = (firstLine.match(/처음 나오는 곳:\s*([가-힣]+\s*\d+:\d+)/) || [])[1] || "";
  const hand = HAND[id];

  if (hand?.kind === "placePerson") {
    return `${name}${eunNeun(name)} 땅 이름이자 사람 이름이에요. 땅으로는 ${hand.place}. 사람으로는 ${hand.people.join(", ")}`;
  }
  if (hand?.kind === "people") {
    return `같은 이름이 여럿 나와요: ${hand.items.join(", ")}`;
  }

  if (isPlaceAndPerson(meaning)) {
    const hits = krvHitsForName(name);
    const people = extractIdentities(name, hits).slice(0, 3);
    const place = placeLabel(meaning, firstRef || "본문");
    const peoplePart =
      people.length > 0
        ? people.map((p) => p.label).join(", ")
        : "사람 이름으로도 나와요";
    return `${name}${eunNeun(name)} 땅 이름이자 사람 이름이에요. 땅으로는 ${place}. 사람으로는 ${peoplePart}`;
  }

  if (isPlaceOnly(meaning)) {
    const n = countExpectedPeople(meaning);
    return `${name}${eunNeun(name)} 같은 지명이 여럿 있어요(${n}곳). 그 가운데 ${firstRef || "본문"}에 나와요`;
  }

  // people: extract from KRV
  const hits = krvHitsForName(name);
  const people = extractIdentities(name, hits);
  const expected = countExpectedPeople(meaning);

  // Prefer famous role labels first already by count
  const items = [];
  for (const p of people) {
    items.push(p.label);
    if (items.length >= 4) break;
  }

  // If still empty, use Strong hints
  if (!items.length) {
    if (/prophet/i.test(meaning)) items.push(`예언자(${firstRef})`);
    else if (/priest/i.test(meaning)) items.push(`제사장(${firstRef})`);
    else if (/king/i.test(meaning)) items.push(`왕(${firstRef})`);
    else if (firstRef) {
      // try one verse identity
      const hit = hits.find((h) => `${h.bookKo} ${h.ch}:${h.n}` === firstRef) || hits[0];
      if (hit) {
        const dad = hit.t.match(/([가-힣]{2,8})의\s*(?:아들|장자|차자)/);
        if (dad) items.push(`${dad[1]}의 아들(${firstRef})`);
      }
    }
  }

  const known = items.length;
  const other = Math.max(0, expected - known);
  if (other > 0) {
    items.push(`그 밖에 ${other}명`);
  } else if (known === 0) {
    items.push(`구약에 동명이인이 여럿 있어요`);
  } else if (known === 1 && expected > 1) {
    items.push(`그 밖에 ${expected - 1}명`);
  }

  return `같은 이름이 여럿 나와요: ${items.join(", ")}`;
}

function isWeakHomonym(identity) {
  if (!identity) return false;
  if (!/같은 이름이 여럿|땅 이름이자 사람/.test(identity)) return false;
  // weak if only "XX에 처음 나옴" without role/son
  if (/에 처음 나옴/.test(identity) && !/아들|딸|왕|예언|선지|제사장|사사|땅으로는|기럇|어머니/.test(identity))
    return true;
  // also weak: "구약에 동명이인이 여럿" as only content after colon without specific person
  if (
    /같은 이름이 여럿 나와요:\s*[가-힣]+\s*\d+:\d+에 처음 나옴/.test(identity)
  )
    return true;
  return false;
}

function main() {
  const notes = JSON.parse(fs.readFileSync(NOTES, "utf8"));
  const meta = loadStrongMeta();

  // ----- 1–3) homonyms -----
  const beforeWeak = [];
  const homoIds = [];
  for (const [id, v] of Object.entries(notes)) {
    const parts = parseParts(v.defKo || "");
    if (/같은 이름이 여럿|땅 이름이자 사람/.test(parts.identity)) {
      homoIds.push(id);
      if (isWeakHomonym(parts.identity)) beforeWeak.push({ id, before: parts.identity });
    }
  }

  let fixedWeak = 0;
  const afterSamples = [];

  // Also rewrite ALL homonyms for order/placePerson quality (not only weak)
  for (const id of homoIds) {
    const v = notes[id];
    const lexP = path.join(LEX, `${id}.json`);
    if (!fs.existsSync(lexP)) continue;
    const lex = JSON.parse(fs.readFileSync(lexP, "utf8"));
    const parts = parseParts(v.defKo || "");
    const wasWeak = isWeakHomonym(parts.identity);
    const name = displayName(lex) || id;
    const meaning = meta.get(id)?.meaning || lex.defEn || "";
    const identity = buildHomonymIdentity(id, name, meaning, parts.first, lex);
    v.defKo = rebuildDef({
      identity,
      nm: v.nameMeaning || parts.nm,
      first: parts.first,
    });
    notes[id] = v;
    syncLex(id, v);
    if (wasWeak) fixedWeak += 1;
  }

  // Force HAND keys even if not previously tagged
  for (const id of Object.keys(HAND)) {
    const v = notes[id];
    if (!v) continue;
    const lex = JSON.parse(fs.readFileSync(path.join(LEX, `${id}.json`), "utf8"));
    const parts = parseParts(v.defKo || "");
    const name = displayName(lex) || id;
    const meaning = meta.get(id)?.meaning || "";
    const identity = buildHomonymIdentity(id, name, meaning, parts.first, lex);
    v.defKo = rebuildDef({
      identity,
      nm: v.nameMeaning || parts.nm,
      first: parts.first,
    });
    notes[id] = v;
    syncLex(id, v);
  }

  // recount weak
  let afterWeak = 0;
  const weakLeft = [];
  for (const [id, v] of Object.entries(notes)) {
    const parts = parseParts(v.defKo || "");
    if (isWeakHomonym(parts.identity)) {
      afterWeak += 1;
      weakLeft.push({ id, identity: parts.identity });
    }
  }

  // samples 10 full defs (include required + mix)
  const sampleIds = [
    "H8050",
    "H452",
    "H2396",
    "H29",
    "H1568",
    "H2275",
    "H40",
    "H511",
    "H285",
    "H1130",
  ];
  for (const id of sampleIds) {
    if (notes[id]) afterSamples.push({ id, defKo: notes[id].defKo });
  }

  // ----- 4) H894 -----
  {
    const v = notes.H894;
    const parts = parseParts(v.defKo || "");
    v.defKo = rebuildDef({
      identity:
        parts.identity ||
        "바벨은 시날 땅의 성읍이며 바벨론을 가리켜요(창 10:10; 11장)",
      nm: "혼잡",
      first: parts.first || "처음 나오는 곳: 창 10:10.",
      extras: ["이름 뜻 「혼잡」은 창 11:9에서 여호와께서 온 땅의 언어를 혼잡케 하신 이야기와 이어져요"],
    });
    v.nameMeaning = "혼잡";
    v.noteSrc = "reviewed";
    notes.H894 = v;
    syncLex("H894", v);
  }

  // ----- 5) fill 60 blanks -----
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
        name: displayName(lex) || id,
        meaning: lex.defEn || meta.get(id)?.meaning || "",
        first: parts.first,
      });
    }
  }
  blanks.sort((a, b) => b.countOT - a.countOT || a.id.localeCompare(b.id));
  let filled = 0;
  for (const row of blanks) {
    const v = notes[row.id];
    const parts = parseParts(v.defKo || "");
    const name = row.name;
    let identity = "";
    const m = row.meaning || "";
    if (/son of /i.test(m)) {
      const mm = m.match(/son of\s+([^,;(]+)/i);
      if (mm) identity = `${name}${eunNeun(name)} ${mm[1].trim()}의 아들이에요`;
    } else if (/daughter of /i.test(m)) {
      const mm = m.match(/daughter of\s+([^,;(]+)/i);
      if (mm) identity = `${name}${eunNeun(name)} ${mm[1].trim()}의 딸이에요`;
    } else if (/a place|city|town|region/i.test(m)) {
      identity = `${name}${eunNeun(name)} 지명이에요`;
    } else if (/king/i.test(m)) {
      identity = `${name}${eunNeun(name)} 왕이에요`;
    } else if (/prophet/i.test(m)) {
      identity = `${name}${eunNeun(name)} 예언자예요`;
    } else if (/priest/i.test(m)) {
      identity = `${name}${eunNeun(name)} 제사장이에요`;
    } else if (/deity|god\b/i.test(m)) {
      identity = `${name}${eunNeun(name)} 이방 신 이름이에요`;
    } else {
      const ref = (parts.first.match(/처음 나오는 곳:\s*([가-힣]+\s*\d+:\d+)/) || [])[1];
      if (ref) identity = `${name}${eunNeun(name)} ${ref}에 나오는 고유명사예요`;
      else identity = `${name}${eunNeun(name)} 구약에 나오는 고유명사예요`;
    }
    v.defKo = rebuildDef({
      identity,
      nm: v.nameMeaning || parts.nm,
      first: parts.first,
    });
    notes[row.id] = v;
    syncLex(row.id, v);
    filled += 1;
  }

  let remainBlank = 0;
  for (const [id, v] of Object.entries(notes)) {
    const lexP = path.join(LEX, `${id}.json`);
    if (!fs.existsSync(lexP)) continue;
    const lex = JSON.parse(fs.readFileSync(lexP, "utf8"));
    if (!/고유명사/.test(lex.posKo || "")) continue;
    if (!parseParts(v.defKo || "").identity) remainBlank += 1;
  }

  fs.writeFileSync(NOTES, JSON.stringify(notes, null, 2) + "\n");

  const report = {
    "1_weakHomonym": {
      before: beforeWeak.length,
      fixed: fixedWeak,
      after: afterWeak,
      weakLeft: weakLeft.slice(0, 10),
      samples10Full: afterSamples,
    },
    "4_H894": notes.H894,
    "5_blanks": { before: blanks.length, filled, remainBlank },
    fulltexts: {
      H8050: notes.H8050,
      H452: notes.H452,
      H2275: notes.H2275,
      H1568: notes.H1568,
      H894: notes.H894,
    },
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        weakBefore: beforeWeak.length,
        weakAfter: afterWeak,
        filled,
        remainBlank,
        H8050: notes.H8050.defKo,
        H452: notes.H452.defKo,
        H2396: notes.H2396.defKo,
        H1568: notes.H1568.defKo,
        H2275: notes.H2275.defKo,
        H894: notes.H894.defKo,
        samples: afterSamples.map((s) => s.id + ": " + s.defKo),
      },
      null,
      2,
    ),
  );
}

main();
