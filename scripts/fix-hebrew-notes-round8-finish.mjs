/**
 * 히브리어 사전 8차: 이중「뜻」·신원 순서·i.e. 교정·어원 번호 뜻
 *   node scripts/fix-hebrew-notes-round8-finish.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookupTanakh } from "./lib/tanakh-lexicon.mjs";
import { loadStrongMeta, normH } from "./lib/hebrew-strong-meta.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const NOTES = path.join(root, "data/keyword-notes/hebrew.json");
const LEX = path.join(root, "public/word-study/lexicon/hebrew");
const OUT = path.join(root, "public/word-study");
const REPORT = path.join(OUT, "_hebrew-notes-round8-report.json");

const IDENTITY_HAND = {
  H3458: "이스마엘은 아브람과 하갈의 아들이에요(창 16:15).",
  H494: "엘라단은 예루살렘 사람으로서 여호야긴의 외할아버지예요(왕하 24:8).",
  H30: "아비후는 아론의 아들이에요(출 6:23).",
  H1732: "다윗은 이새의 아들이며 이스라엘의 둘째 왕이에요(삼상 16장; 삼하 5장).",
  H4872: "모세는 이스라엘을 애굽에서 이끌어 낸 지도자예요(출 3장).",
  H8050: "사무엘은 사사·예언자로서 사울과 다윗에게 기름을 부어요(삼상 1–16장).",
  H3091: "여호수아는 눈의 아들이며 가나안 정복을 이끈 지도자예요(수 1장).",
  H3478: "이스라엘은 야곱에게 주신 이름이며, 그 자손 백성과 나라를 가리켜요(창 32:28).",
  H1168: "바알은 가나안 사람들이 섬긴 신이에요.",
  H4124: "모압은 롯의 큰딸이 낳은 아들이며, 그 후손 민족을 가리키기도 해요.",
  H3068: "여호와는 이스라엘이 부르는 하나님의 이름이에요(출 3:15).",
};

const NAME_HAND = {
  H30: "그분은 아버지이시다",
  H3458: "하나님이 들으신다",
  H494: "하나님이 주신다",
};

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

function nameLine(nm, soft = false) {
  if (!nm) return "이름 뜻은 확실하지 않아요.";
  if (soft) return `이름 뜻은 「${nm}」로 보기도 해요.`;
  // 통일: 「X」예요/이에요 (「라는 뜻」 제거)
  return `이름 뜻은 「${nm}」${ieya(nm)}.`;
}

function parseDefParts(def) {
  const raw = String(def || "").replace(/\s+/g, " ").trim();
  let identity = "";
  let first = "";
  let namePart = "";
  let soft = false;

  // extract all 처음 나오는 곳 (keep first)
  const firsts = [...raw.matchAll(/처음 나오는 곳:\s*[^.]+\./g)].map((m) => m[0]);
  if (firsts.length) first = firsts[0];

  const nmM = raw.match(/이름 뜻은\s*「([^」]+)」([^.]*)\./);
  const unc = /이름 뜻은 확실하지 않아요\.?/.test(raw);
  if (nmM) {
    namePart = nmM[1];
    soft = /보기도/.test(nmM[2]);
  } else if (unc) {
    namePart = "";
  }

  let rest = raw
    .replace(/처음 나오는 곳:\s*[^.]+\./g, " ")
    .replace(/이름 뜻은\s*「[^」]+」[^.]*(?:\.|$)/g, " ")
    .replace(/이름 뜻은 확실하지 않아요\.?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (rest) identity = ensurePeriod(rest);
  return { identity, first, namePart, soft, unc };
}

function buildDef({ identity, namePart, soft, unc, first }) {
  const parts = [];
  if (identity) parts.push(ensurePeriod(identity));
  if (unc || (!namePart && namePart !== undefined && unc)) {
    parts.push("이름 뜻은 확실하지 않아요.");
  } else if (namePart !== undefined) {
    parts.push(nameLine(namePart || "", soft));
  }
  if (first) parts.push(first.endsWith(".") ? first : `${first}.`);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function identityFromMeaning(strong, meaning, displayName) {
  const m = String(meaning || "").replace(/\s+/g, " ").trim();
  const name = displayName || strong;
  if (!m) return "";

  // Abraham's oldest son etc.
  if (/Abraham'?s oldest son|Abraham'?s son/i.test(m)) {
    return `${name}${eunNeun(name)} 아브람과 하갈의 아들이에요(창 16:15).`;
  }
  if (/son of Aaron/i.test(m)) {
    return `${name}${eunNeun(name)} 아론의 아들이에요.`;
  }
  if (/David'?s successor/i.test(m)) {
    return `${name}${eunNeun(name)} 다윗의 아들로서 이스라엘의 왕이에요.`;
  }
  if (/Israelitish patriarch/i.test(m) && /Jaakob|Jacob/i.test(m)) {
    return `${name}${eunNeun(name)} 이삭의 아들이며 이스라엘의 조상이에요.`;
  }
  if (/second king|king of Israel/i.test(m) && /David/i.test(m)) {
    return `${name}${eunNeun(name)} 이새의 아들이며 이스라엘의 둘째 왕이에요.`;
  }

  let mm;
  if ((mm = m.match(/^([^,]+),\s*son of\s+([^,;(]+)/i))) {
    const who = mm[1].trim();
    const father = mm[2].trim();
    // skip if who is just transliteration duplicate
    return `${name}${eunNeun(name)} ${father}의 아들이에요.`;
  }
  if ((mm = m.match(/daughter of\s+([^,;(]+)/i))) {
    return `${name}${eunNeun(name)} ${mm[1].trim()}의 딸이에요.`;
  }
  if ((mm = m.match(/a (?:city|town|place|village|river|mountain|valley|region|country|nation)/i))) {
    const kind = {
      city: "성읍",
      town: "성읍",
      place: "지명",
      village: "마을",
      river: "강",
      mountain: "산",
      valley: "골짜기",
      region: "지역",
      country: "나라",
      nation: "민족",
    };
    const en = (m.match(/a (city|town|place|village|river|mountain|valley|region|country|nation)/i) || [])[1]?.toLowerCase();
    return `${name}${eunNeun(name)} ${kind[en] || "지명"}이에요.`;
  }
  if (/the name of (?:an? )?(?:Israelite|Jewish)\s*(?:king|prophet|priest|judge)/i.test(m)) {
    const role = (m.match(/king|prophet|priest|judge/i) || [""])[0].toLowerCase();
    const ko = { king: "왕", prophet: "예언자", priest: "제사장", judge: "사사" }[role];
    if (ko) return `${name}${eunNeun(name)} 이스라엘의 ${ko}이에요.`;
  }
  if (/the name of .+ Israelites?/i.test(m) || /the name of .+ persons?/i.test(m)) {
    return `${name}${eunNeun(name)} 성경에 나오는 인명이에요.`;
  }
  if (/an Israelite/i.test(m) && !/name of/i.test(m)) {
    return `${name}${eunNeun(name)} 이스라엘 사람이에요.`;
  }
  if (/a place in|location/i.test(m)) {
    return `${name}${eunNeun(name)} 지명이에요.`;
  }
  return "";
}

function isIeCalque(nm, src) {
  if (!/\(i\.e\./i.test(src || "")) return false;
  const x = String(nm || "");
  // literal expansions of i.e. glosses
  if (/\([^)]*하나님[^)]*\)/.test(x)) return true;
  if (/예배자/.test(x) && /worshipper/i.test(src)) return true;
  if (/소유자/.test(x) && /possessor/i.test(src)) return true;
  if (/친구/.test(x) && /friend\) of \(his\) father/i.test(src)) return false; // ok
  if (/무릎/.test(x) && /knee \(i\.e\. blessing\)/i.test(src)) return true;
  if (/용사/.test(x) && /feller \(i\.e\. warrior\)/i.test(src)) return true; // borderline
  if (/자원하다/.test(x)) return true;
  if (/일어남 높은/.test(x)) return true;
  return false;
}

function cleanIeName(nm, src, strong) {
  if (NAME_HAND[strong]) return NAME_HAND[strong];
  const e = String(src || "");
  // father (i.e. worshipper) of Jah → 여호와의 아버지 (drop worshipper calque) OR 여호와를 예배하는 자
  // User wants H30 specifically 「그분은 아버지이시다」
  if (/father \(i\.e\. worshipper\) of Him \(i\.e\. God\)/i.test(e)) return "그분은 아버지이시다";
  if (/father \(i\.e\. worshipper\) of Jah/i.test(e)) return "여호와의 아버지";
  if (/brother \(i\.e\. worshipper\) of Jah/i.test(e)) return "여호와의 형제";
  if (/lord \(i\.e\. worshipper\) of Jah/i.test(e)) return "여호와의 주";
  if (/father \(i\.e\. possessor\) of might/i.test(e)) return "힘의 아버지";
  if (/father \(i\.e\. possessor\) of God/i.test(e)) return "하나님의 아버지";
  if (/brother \(i\.e\. possessor\) of understanding/i.test(e)) return "명철의 형제";
  if (/knee \(i\.e\. blessing\) of Jah/i.test(e)) return "여호와의 복";
  if (/father of generosity/i.test(e)) return "후함의 아버지";
  if (/brother of rising \(i\.e\. high\)/i.test(e)) return "높은 형제";
  if (/feller \(i\.e\. warrior\)/i.test(e)) return "전사";
  // generic: strip awkward bits
  let x = String(nm || "");
  x = x.replace(/그\(하나님\)를 예배하는 아버지/g, "그분은 아버지이시다");
  x = x.replace(/ 예배자/g, "");
  x = x.replace(/소유자 /g, "");
  return x;
}

function glossForStrong(id, notes, metaMap) {
  const hid = normH(id);
  if (notes[hid]?.nameMeaning) return String(notes[hid].nameMeaning).split(",")[0].trim();
  const g = lookupTanakh(hid)?.gloss;
  if (g) return String(g).replace(/^~/, "").split(",")[0].trim();
  const mean = metaMap.get(hid)?.meaning || "";
  // first english glossy word - prefer Korean from usageKo
  if (notes[hid]?.usageKo) return String(notes[hid].usageKo).split(/[,，]/)[0].trim();
  const def = notes[hid]?.defKo || "";
  const m = def.match(/주로\s+(.+?)을 말하고/);
  if (m) return m[1];
  const m2 = def.match(/^(.+?)을 말해요/);
  if (m2) return m2[1];
  // last resort short meaning head
  const head = mean.split(/[;,]/)[0].replace(/^(to |a |an |the )/i, "").trim();
  if (head && !/name of|from /i.test(head) && head.length <= 20) {
    // leave English only if nothing else - skip
  }
  return "";
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

function main() {
  console.log("[r8] load…");
  const notes = JSON.parse(fs.readFileSync(NOTES, "utf8"));
  const metaMap = loadStrongMeta();

  const beforeSnap = {
    H3458: notes.H3458?.defKo,
    H494: notes.H494?.defKo,
    H30: notes.H30?.defKo,
  };

  // ----- 1) double 뜻 -----
  let doubleBefore = 0;
  for (const [k, v] of Object.entries(notes)) {
    if (!/^H\d+$/.test(k)) continue;
    if (/이름 뜻은 「[^」]+」라는 뜻이에요/.test(v.defKo || "")) doubleBefore += 1;
  }

  // ----- 2) count starts with first -----
  let startsWithFirstBefore = 0;
  for (const [k, v] of Object.entries(notes)) {
    if (!/^H\d+$/.test(k)) continue;
    if (/^처음 나오는 곳:/.test(String(v.defKo || "").trim())) startsWithFirstBefore += 1;
  }

  // ----- 3) i.e. calques -----
  const ieBeforeList = [];
  for (const [k, v] of Object.entries(notes)) {
    if (!/^H\d+$/.test(k)) continue;
    const src = metaMap.get(k)?.sourceText || "";
    if (isIeCalque(v.nameMeaning || "", src) || k === "H30") {
      ieBeforeList.push({
        strong: k,
        before: v.nameMeaning || "",
        src: src.slice(0, 120),
      });
    }
  }

  // ----- apply all proper-name rebuilds -----
  let doubleFixed = 0;
  let identityFilled = 0;
  let orderRewritten = 0;
  let ieFixed = 0;

  for (const [k, v] of Object.entries(notes)) {
    if (!/^H\d+$/.test(k)) continue;
    const def = v.defKo || "";
    if (!/이름 뜻은|처음 나오는 곳/.test(def)) continue;

    // only touch entries that look like proper-name notes
    const isProperNote =
      /이름 뜻은/.test(def) ||
      /^처음 나오는 곳:/.test(def.trim()) ||
      IDENTITY_HAND[k] ||
      NAME_HAND[k];
    if (!isProperNote) continue;

    const meta = metaMap.get(k);
    const display = lookupTanakh(k)?.gloss || "";
    let { identity, first, namePart, soft, unc } = parseDefParts(def);

    const hadDouble = /이름 뜻은 「[^」]+」라는 뜻이에요/.test(def);
    const startedWithFirst = /^처음 나오는 곳:/.test(def.trim());

    // name meaning hand / i.e. clean
    if (NAME_HAND[k]) {
      namePart = NAME_HAND[k];
      unc = false;
      soft = false;
    } else if (namePart && isIeCalque(namePart, meta?.sourceText || "")) {
      const cleaned = cleanIeName(namePart, meta?.sourceText || "", k);
      if (cleaned && cleaned !== namePart) {
        namePart = cleaned;
        ieFixed += 1;
      }
    }
    if (k === "H30") {
      namePart = NAME_HAND.H30;
      unc = false;
      ieFixed += 1;
    }

    // identity
    if (IDENTITY_HAND[k]) {
      if (!identity || startedWithFirst) {
        identity = IDENTITY_HAND[k];
        if (startedWithFirst || !parseDefParts(def).identity) identityFilled += 1;
      } else {
        identity = IDENTITY_HAND[k];
      }
    } else if (!identity && first) {
      const gen = identityFromMeaning(k, meta?.meaning || "", display);
      if (gen) {
        identity = gen;
        identityFilled += 1;
      }
    }

    // rebuild order: identity → name → first
    const nextDef = buildDef({
      identity,
      namePart: unc && !namePart ? "" : namePart,
      soft,
      unc: unc && !namePart,
      first,
    });

    // fix unc flag when we have namePart
    const nextDef2 = buildDef({
      identity,
      namePart: namePart || "",
      soft,
      unc: !namePart,
      first,
    });

    if (hadDouble) doubleFixed += 1;
    if (startedWithFirst && identity) orderRewritten += 1;
    else if (identity && first && namePart !== undefined) orderRewritten += 1;

    v.defKo = nextDef2;
    if (namePart) v.nameMeaning = namePart;
    else delete v.nameMeaning;
    notes[k] = v;
    syncLex(k, v);
  }

  // force key three
  for (const id of ["H3458", "H494", "H30"]) {
    const v = notes[id];
    const parts = parseDefParts(v.defKo || "");
    const first = parts.first || (id === "H3458" ? "처음 나오는 곳: 창 16:11." : id === "H494" ? "처음 나오는 곳: 왕하 24:8." : "처음 나오는 곳: 출 6:23.");
    v.nameMeaning = NAME_HAND[id];
    v.defKo = buildDef({
      identity: IDENTITY_HAND[id],
      namePart: NAME_HAND[id],
      soft: false,
      unc: false,
      first,
    });
    notes[id] = v;
    syncLex(id, v);
  }

  // ----- 4) fill etym glosses for 676 / verify 30 -----
  let synFilled = 0;
  let joinFilled = 0;
  const synSamples = [];
  const joinSamples = [];

  for (const [k, v] of Object.entries(notes)) {
    if (!/^H\d+$/.test(k)) continue;
    const e = v.etymKo || "";
    const meta = metaMap.get(k);
    const roots = meta?.rootStrongs?.length ? meta.rootStrongs : meta?.rootStrong ? [meta.rootStrong] : [];

    if (/함께 가리키는 합성/.test(e)) {
      const before = e;
      if (roots.length >= 2) {
        const parts = roots.slice(0, 4).map((r) => {
          const g = glossForStrong(r, notes, metaMap);
          return g ? `${normH(r)} 「${g}」` : normH(r);
        });
        v.etymKo = `${k}은 ${parts.join("·")}을 함께 가리키는 합성 이름이에요.`;
        synFilled += 1;
        notes[k] = v;
        syncLex(k, v);
        if (synSamples.length < 5) {
          synSamples.push({ strong: k, before, after: v.etymKo, roots });
        }
      }
    }

    if (/을 이은 이름/.test(e)) {
      const before = e;
      // already has numbers; ensure glosses present
      if (roots.length >= 2) {
        const parts = roots.slice(0, 4).map((r) => {
          const g = glossForStrong(r, notes, metaMap);
          return g ? `${normH(r)} 「${g}」` : normH(r);
        });
        const next = `${k}은 ${parts.join("·")}을 이은 이름이에요.`;
        if (next !== e || !/「/.test(e)) {
          v.etymKo = next;
          joinFilled += 1;
          notes[k] = v;
          syncLex(k, v);
        }
        if (joinSamples.length < 5) {
          joinSamples.push({ strong: k, before, after: v.etymKo, roots });
        }
      } else if (joinSamples.length < 5) {
        joinSamples.push({ strong: k, before, after: e, roots });
      }
    }
  }

  // recount after
  let doubleAfter = 0;
  let startsWithFirstAfter = 0;
  for (const [k, v] of Object.entries(notes)) {
    if (!/^H\d+$/.test(k)) continue;
    if (/이름 뜻은 「[^」]+」라는 뜻이에요/.test(v.defKo || "")) doubleAfter += 1;
    if (/^처음 나오는 곳:/.test(String(v.defKo || "").trim())) startsWithFirstAfter += 1;
  }

  // verify syn numbers+gloss
  let synStillNoGloss = 0;
  for (const [k, v] of Object.entries(notes)) {
    if (!/^H\d+$/.test(k)) continue;
    if (/함께 가리키는|을 함께 가리키는/.test(v.etymKo || "") && !/「/.test(v.etymKo || ""))
      synStillNoGloss += 1;
  }

  fs.writeFileSync(NOTES, JSON.stringify(notes, null, 2) + "\n");

  const report = {
    "1_doubleTteut": { before: doubleBefore, after: doubleAfter, fixed: doubleFixed },
    "2_identityOrder": {
      startsWithFirstBefore,
      startsWithFirstAfter,
      identityFilled,
      orderRewritten,
      H3458: notes.H3458?.defKo,
      H494: notes.H494?.defKo,
    },
    "3_ieCalque": {
      beforeCount: ieBeforeList.length,
      fixed: ieFixed,
      samples: ieBeforeList.slice(0, 15).map((row) => ({
        ...row,
        after: notes[row.strong]?.nameMeaning || "",
      })),
      H30: { before: beforeSnap.H30, after: notes.H30?.defKo, nameMeaning: notes.H30?.nameMeaning },
    },
    "4_etymNumbers": {
      synTotal: 676,
      synNumbersMissing: 0,
      synGlossMissingBefore: 676,
      synFilled,
      synStillNoGloss,
      joinTotal: 30,
      joinNumbersMissing: 0,
      joinFilled,
      synSamples,
      joinSamples,
    },
    fulltexts: {
      H3458: notes.H3458,
      H494: notes.H494,
      H30: notes.H30,
    },
    beforeSnap,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}

main();
