/**
 * 히브리어 13차: 이름뜻 비문 · 처음출현 누락 · KRV표기 · 비중인물 · 인원 · 어원 문구
 *   node scripts/fix-hebrew-notes-round13.mjs
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
const REPORT = path.join(OUT, "_hebrew-notes-round13-report.json");

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
function hasBatchimChar(ch) {
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}
function ieya(w) {
  return hasBatchim(w) ? "이에요" : "예요";
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
  const firstM = raw.match(/처음 나오는 곳:\s*([가-힣]+)\s*(\d+):(\d+)\.?/);
  const first = firstM ? `처음 나오는 곳: ${firstM[1]} ${firstM[2]}:${firstM[3]}.` : "";
  const firstRef = firstM ? `${firstM[1]} ${firstM[2]}:${firstM[3]}` : "";
  const nmM = raw.match(/이름 뜻은\s*「([^」]+)」/);
  const nm = nmM ? nmM[1] : "";
  let identity = raw
    .replace(/처음 나오는 곳:\s*[^.]+\./g, " ")
    .replace(/이름 뜻은\s*「[^」]+」[^.]*(?:\.|$)/g, " ")
    .replace(/이름 뜻은 확실하지 않아요\.?/g, " ")
    .replace(/이름 뜻 「혼잡」은[^.]+\./g, " ")
    .replace(/히브리어로는 쌍수 꼴로[^.]+\./g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { identity, first, firstRef, firstBook: firstM?.[1], firstCh: firstM?.[2], firstN: firstM?.[3], nm };
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

function krvVerse(book, ch, n) {
  const p = path.join(KRV, book, String(ch), "korean.json");
  if (!fs.existsSync(p)) return "";
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return (j.verses?.krv || []).find((x) => x.n === n)?.t || "";
  } catch {
    return "";
  }
}

function identityFromVerse(verse, firstRef) {
  if (!verse) return "";
  // 아들
  const son = verse.match(/([가-힣]{2,10})의\s*(?:아들|장자|차자)/);
  if (son) return `${son[1]}의 아들(${firstRef})`;
  // 딸
  const dau = verse.match(/([가-힣]{2,10})의\s*딸/);
  if (dau) return `${dau[1]}의 딸(${firstRef})`;
  // 왕
  if (/유다\s*왕|유다\s*왕이/.test(verse)) return `유다 왕(${firstRef})`;
  if (/이스라엘\s*왕/.test(verse)) return `이스라엘 왕(${firstRef})`;
  if (/블레셋/.test(verse) && /왕/.test(verse)) return `블레셋 왕(${firstRef})`;
  if (/왕/.test(verse)) return `왕(${firstRef})`;
  // 제사장/선지자
  if (/제사장/.test(verse)) return `제사장(${firstRef})`;
  if (/선지자|예언자/.test(verse)) return /선지자/.test(verse) ? `선지자(${firstRef})` : `예언자(${firstRef})`;
  // 자손
  const clan = verse.match(/([가-힣]{2,10})\s*자손/);
  if (clan) return `${clan[1]} 자손(${firstRef})`;
  // 이름만
  const named = verse.match(/이름은\s*([가-힣]{2,10})/);
  if (named) return `${firstRef}의 ${named[1]}`;
  return `${firstRef}에 나오는 이`;
}

/** 「여호와의 강하게 된」류 → 문장형 */
function fixAwkwardNameMeaning(nm) {
  const x = String(nm || "").trim();
  if (!x) return x;
  const map = {
    "여호와의 강하게 된": "여호와께서 강하게 하신다",
    "하나님의 강하게 된": "하나님이 강하게 하신다",
  };
  if (map[x]) return map[x];
  // generic: 여호와의 X된 / 하나님의 X된 / 여호와의 X한
  let m = x.match(/^(여호와)의\s+(.+?)된$/);
  if (m) return `${m[1]}께서 ${m[2]}하신다`.replace(/하게하/, "하게 하");
  m = x.match(/^(하나님)의\s+(.+?)된$/);
  if (m) return `${m[1]}이 ${m[2]}하신다`.replace(/하게하/, "하게 하");
  m = x.match(/^(여호와)의\s+(.+?)한$/);
  if (m) return `${m[1]}께서 ${m[2]}하시다`;
  m = x.match(/^(하나님)의\s+(.+?)한$/);
  if (m) return `${m[1]}이 ${m[2]}하시다`;
  // X의 Y된 (non-kinship)
  if (/^(?!아버지|어머니|많은 무리).+의\s+.+(된|한)$/.test(x) && !/형제|아버지$|어머니$/.test(x)) {
    m = x.match(/^(.+)의\s+(.+)된$/);
    if (m) return `${m[1]}께서 ${m[2]}하신다`.replace(/하게하/, "하게 하");
    m = x.match(/^(.+)의\s+(.+)한$/);
    if (m) return `${m[1]}이 ${m[2]}하시다`;
  }
  return x;
}

function isAwkwardNameMeaning(nm) {
  const x = String(nm || "").trim();
  if (!x) return false;
  if (/아버지의 형제|어머니의 형제|많은 무리의 아버지/.test(x)) return false;
  if (/^(여호와|하나님)의\s+.+(된|한)$/.test(x)) return true;
  if (/.+의\s+.+(된|한)$/.test(x) && !/형제$|아버지$|어머니$|집$|성읍$|아들$|딸$/.test(x))
    return true;
  return false;
}

function listHasFirstRef(identity, firstRef) {
  if (!identity || !firstRef) return true;
  const [book, cn] = firstRef.split(" ");
  const [ch, n] = (cn || "").split(":");
  if (identity.includes(firstRef)) return true;
  if (identity.includes(`${book} ${ch}장`)) return true;
  // allow 출 6:24 style already
  if (cn && identity.includes(cn) && identity.includes(book)) return true;
  return false;
}

function insertFirstPerson(identity, firstItem) {
  // If already "같은 이름이 여럿 나와요: A, B"
  if (/^같은 이름이 여럿 나와요:/.test(identity)) {
    const rest = identity.replace(/^같은 이름이 여럿 나와요:\s*/, "");
    // avoid duplicate similar
    if (rest.includes(firstItem.replace(/\([^)]+\)/g, "").trim().slice(0, 6))) {
      // ensure ref present: rebuild with firstItem if ref missing
      if (firstItem.match(/\(([^)]+)\)/) && !listHasFirstRef(identity, firstItem.match(/\(([^)]+)\)/)[1])) {
        // append firstItem after first known or at end before 그 밖의
        if (/그 밖의|그 밖에/.test(rest)) {
          return `같은 이름이 여럿 나와요: ${rest.replace(/(그 밖의|그 밖에)/, `${firstItem}, $1`)}`;
        }
        return `같은 이름이 여럿 나와요: ${rest}, ${firstItem}`;
      }
      return identity;
    }
    // put first-occurrence after the lead (most frequent) item if present
    const parts = rest.split(/,\s*/).filter(Boolean);
    if (parts.length === 0) return `같은 이름이 여럿 나와요: ${firstItem}`;
    // insert as 2nd (keep frequency-first), unless lead is empty/그 밖의 only
    if (/^그 밖의|^그 밖에/.test(parts[0])) {
      return `같은 이름이 여럿 나와요: ${firstItem}, ${parts.join(", ")}`;
    }
    const head = parts[0];
    const tail = parts.slice(1);
    // remove vague 그 밖의 if we're adding specifics
    return `같은 이름이 여럿 나와요: ${[head, firstItem, ...tail].join(", ")}`;
  }
  if (/땅 이름이자 사람/.test(identity)) {
    // ensure firstRef appears in 땅으로는 or 사람으로는
    if (!identity.includes(firstItem) && firstItem) {
      return `${identity.replace(/\.?$/, "")}. 처음 본문에 나오는 이는 ${firstItem}`;
    }
    return identity;
  }
  return identity;
}

function main() {
  const notes = JSON.parse(fs.readFileSync(NOTES, "utf8"));
  const meta = loadStrongMeta();

  // ----- 1) awkward name meanings -----
  const awkwardBefore = [];
  for (const [id, v] of Object.entries(notes)) {
    const nm = v.nameMeaning || parseParts(v.defKo || "").nm || "";
    if (isAwkwardNameMeaning(nm)) awkwardBefore.push({ id, before: nm });
  }
  let awkwardFixed = 0;
  for (const row of awkwardBefore) {
    const v = notes[row.id];
    const parts = parseParts(v.defKo || "");
    const next = fixAwkwardNameMeaning(row.before);
    if (next === row.before) continue;
    v.nameMeaning = next;
    v.defKo = rebuildDef({
      identity: parts.identity,
      nm: next,
      first: parts.first,
      extras: idExtras(row.id, parts),
    });
    notes[row.id] = v;
    syncLex(row.id, v);
    awkwardFixed += 1;
  }
  // force H2396
  {
    const v = notes.H2396;
    const parts = parseParts(v.defKo || "");
    v.nameMeaning = "여호와께서 강하게 하신다";
    v.defKo = rebuildDef({
      identity: parts.identity,
      nm: v.nameMeaning,
      first: parts.first,
    });
    notes.H2396 = v;
    syncLex("H2396", v);
  }

  function idExtras(id, parts) {
    if (id === "H894") {
      return [
        "이름 뜻 「혼잡」은 창 11:9에서 여호와께서 온 땅의 언어를 혼잡케 하신 이야기와 이어져요",
      ];
    }
    return [];
  }

  // ----- hand fixes 3–5 -----
  // H511
  {
    const v = notes.H511;
    const parts = parseParts(v.defKo || "");
    v.defKo = rebuildDef({
      identity:
        "같은 이름이 여럿 나와요: 사무엘의 아버지(삼상 1:1), 고라의 아들(출 6:24), 그 밖의 이스라엘 사람",
      nm: v.nameMeaning || parts.nm || "하나님이 얻으셨다",
      first: parts.first || "처음 나오는 곳: 출 6:24.",
    });
    notes.H511 = v;
    syncLex("H511", v);
  }
  // H8050 — KRV 민34:20 = 스므엘
  {
    const v = notes.H8050;
    const parts = parseParts(v.defKo || "");
    const verse = krvVerse("numbers", 34, 20);
    // confirm
    const krvForm = (verse.match(/암미훗의 아들\s+([가-힣]+)/) || [])[1] || "스므엘";
    v.defKo = rebuildDef({
      identity: `같은 이름이 여럿 나와요: 선지자 사무엘(삼상 1:20; 3장), 암미훗의 아들 ${krvForm}(민 34:20, 개역한글 「${krvForm}」)`,
      nm: v.nameMeaning || "하나님이 들으셨다",
      first: parts.first || "처음 나오는 곳: 민 34:20.",
    });
    notes.H8050 = v;
    syncLex("H8050", v);
  }
  // H40 — include Gideon' s son, not 그 밖의
  {
    const v = notes.H40;
    const parts = parseParts(v.defKo || "");
    v.defKo = rebuildDef({
      identity:
        "같은 이름이 여럿 나와요: 블레셋 왕 아비멜렉(창 20:2), 기드온(여룹바알)의 아들 아비멜렉(삿 9장), 그 밖의 블레셋 왕·이스라엘 사람",
      nm: v.nameMeaning || parts.nm || "나의 아버지는 왕이시다",
      first: parts.first || "처음 나오는 곳: 창 20:2.",
    });
    notes.H40 = v;
    syncLex("H40", v);
  }
  // H452 — 3 others
  {
    const v = notes.H452;
    const parts = parseParts(v.defKo || "");
    v.defKo = rebuildDef({
      identity:
        "같은 이름이 여럿 나와요: 예언자 엘리야(왕상 17:1), 여로함의 아들(대상 8:27), 하림 자손(스 10:21), 엘람 자손(스 10:26)",
      nm: v.nameMeaning || "나의 하나님은 여호와",
      first: parts.first || "처음 나오는 곳: 왕상 17:1.",
    });
    notes.H452 = v;
    syncLex("H452", v);
  }

  // ----- 2) first-occurrence audit for all homonyms -----
  let missingBefore = 0;
  let missingFixed = 0;
  const missingSamples = [];
  for (const [id, v] of Object.entries(notes)) {
    const parts = parseParts(v.defKo || "");
    if (!/같은 이름이 여럿|땅 이름이자 사람/.test(parts.identity)) continue;
    if (!parts.firstRef) continue;
    const ok = listHasFirstRef(parts.identity, parts.firstRef);
    if (ok) continue;
    missingBefore += 1;

    const book = KO_BOOK[parts.firstBook];
    const verse = book
      ? krvVerse(book, Number(parts.firstCh), Number(parts.firstN))
      : "";
    let firstItem = identityFromVerse(verse, parts.firstRef);
    // special cases already hand-fixed
    if (id === "H511") firstItem = "고라의 아들(출 6:24)";
    if (id === "H8050") continue; // done
    if (id === "H40") continue;
    if (id === "H452") continue;

    if (!firstItem) firstItem = `${parts.firstRef}에 나오는 이`;

    // For place+person: ensure firstRef in text
    let identity = parts.identity;
    if (/땅 이름이자 사람/.test(identity)) {
      if (!identity.includes(parts.firstRef)) {
        identity = identity.replace(
          /땅으로는 ([^.]+)/,
          (m, g) =>
            g.includes(parts.firstRef)
              ? m
              : `땅으로는 ${g.replace(/\([^)]+\)/, `(${parts.firstRef})`)}`,
        );
        if (!identity.includes(parts.firstRef)) {
          identity = `${identity.replace(/\.?$/, "")}. 처음 본문(${parts.firstRef})에 땅·사람으로 이어져요`;
        }
      }
    } else {
      identity = insertFirstPerson(identity, firstItem);
      // final ensure
      if (!listHasFirstRef(identity, parts.firstRef)) {
        identity = identity.replace(
          /같은 이름이 여럿 나와요:\s*/,
          `같은 이름이 여럿 나와요: ${firstItem}, `,
        );
      }
    }

    v.defKo = rebuildDef({
      identity,
      nm: v.nameMeaning || parts.nm,
      first: parts.first,
      extras: idExtras(id, parts),
    });
    notes[id] = v;
    syncLex(id, v);
    missingFixed += 1;
    if (missingSamples.length < 15) {
      missingSamples.push({ id, firstRef: parts.firstRef, firstItem, after: identity });
    }
  }

  // recount missing
  let missingAfter = 0;
  for (const [id, v] of Object.entries(notes)) {
    const parts = parseParts(v.defKo || "");
    if (!/같은 이름이 여럿|땅 이름이자 사람/.test(parts.identity)) continue;
    if (!parts.firstRef) continue;
    if (!listHasFirstRef(parts.identity, parts.firstRef)) missingAfter += 1;
  }

  // ----- 6) etymKo phrase -----
  let etymBefore = 0;
  let etymFixed = 0;
  for (const [id, v] of Object.entries(notes)) {
    const e = v.etymKo || "";
    if (!/함께 가리키는 합성 이름/.test(e)) continue;
    etymBefore += 1;
    const next = e.replace(
      /([가-힣])」([을를]) 함께 가리키는 합성 이름이에요/g,
      (all, ch) => {
        const part = hasBatchimChar(ch) ? "이" : "가";
        return `${ch}」${part} 합쳐진 이름이에요`;
      },
    );
    // fallback if pattern slightly different
    const next2 = next
      .replace(/을 함께 가리키는 합성 이름이에요/g, "이 합쳐진 이름이에요")
      .replace(/를 함께 가리키는 합성 이름이에요/g, "가 합쳐진 이름이에요");
    if (next2 !== e) {
      v.etymKo = next2;
      notes[id] = v;
      syncLex(id, v);
      etymFixed += 1;
    }
  }
  let etymAfter = 0;
  for (const v of Object.values(notes)) {
    if (/함께 가리키는 합성 이름/.test(v.etymKo || "")) etymAfter += 1;
  }

  // awkward after
  let awkwardAfter = 0;
  const awkwardAfterList = [];
  for (const [id, v] of Object.entries(notes)) {
    const nm = v.nameMeaning || parseParts(v.defKo || "").nm || "";
    if (isAwkwardNameMeaning(nm)) {
      awkwardAfter += 1;
      awkwardAfterList.push({ id, nm });
    }
  }

  fs.writeFileSync(NOTES, JSON.stringify(notes, null, 2) + "\n");

  const sampleIds = [
    "H2396",
    "H511",
    "H8050",
    "H40",
    "H452",
    "H3169",
    "H5815",
    "H29",
    "H1568",
    "H2275",
  ];
  const samples10 = sampleIds
    .filter((id) => notes[id])
    .map((id) => ({ id, defKo: notes[id].defKo, etymKo: notes[id].etymKo, nameMeaning: notes[id].nameMeaning }));

  const report = {
    "1_awkwardName": {
      before: awkwardBefore.length,
      fixed: awkwardFixed,
      after: awkwardAfter,
      listBefore: awkwardBefore,
      remain: awkwardAfterList,
    },
    "2_firstOccurrence": {
      missingBefore,
      fixed: missingFixed,
      missingAfter,
      samples: missingSamples,
    },
    "3_H8050_krv": {
      verse: krvVerse("numbers", 34, 20),
      note: "개역한글 민 34:20 = 스므엘",
      defKo: notes.H8050?.defKo,
    },
    "4_H40": notes.H40,
    "5_H452": {
      others: ["대상 8:27", "스 10:21", "스 10:26"],
      countOthers: 3,
      defKo: notes.H452?.defKo,
    },
    "6_etymPhrase": { before: etymBefore, fixed: etymFixed, after: etymAfter },
    samples10Full: samples10,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        awkward: { before: awkwardBefore.length, fixed: awkwardFixed, after: awkwardAfter },
        first: { missingBefore, fixed: missingFixed, missingAfter },
        etym: { before: etymBefore, fixed: etymFixed, after: etymAfter },
        H2396: notes.H2396,
        H511: notes.H511.defKo,
        H8050: notes.H8050.defKo,
        H40: notes.H40.defKo,
        H452: notes.H452.defKo,
        samples: samples10.map((s) => s.id + "\n" + s.defKo + "\n" + s.etymKo),
      },
      null,
      2,
    ),
  );
}

main();
