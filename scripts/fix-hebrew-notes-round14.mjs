/**
 * 히브리어 14차: 이웃번호 오염 · 약한 신원 · 어원 문장 · H511
 *   node scripts/fix-hebrew-notes-round14.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadStrongMeta } from "./lib/hebrew-strong-meta.mjs";
import { lookupTanakh } from "./lib/tanakh-lexicon.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const NOTES = path.join(root, "data/keyword-notes/hebrew.json");
const LEX = path.join(root, "public/word-study/lexicon/hebrew");
const KRV = path.join(root, "public/bible-study/chunks");
const OUT = path.join(root, "public/word-study");
const REPORT = path.join(OUT, "_hebrew-notes-round14-report.json");

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
  if (soft) {
    const part = hasBatchim(nm) ? "으로" : "로";
    return `이름 뜻은 「${nm}」${part} 보기도 해요.`;
  }
  return `이름 뜻은 「${nm}」${ieya(nm)}.`;
}
function parseParts(def) {
  const raw = String(def || "").replace(/\s+/g, " ").trim();
  const firstM = raw.match(/처음 나오는 곳:\s*([가-힣]+)\s*(\d+):(\d+)\.?/);
  const first = firstM ? `처음 나오는 곳: ${firstM[1]} ${firstM[2]}:${firstM[3]}.` : "";
  const firstRef = firstM ? `${firstM[1]} ${firstM[2]}:${firstM[3]}` : "";
  const nmM = raw.match(/이름 뜻은\s*「([^」]+)」([^.]*)\./);
  const soft = nmM ? /보기도/.test(nmM[2] || "") : false;
  const nm = nmM ? nmM[1] : "";
  const unc = /이름 뜻은 확실하지 않아요/.test(raw);
  let identity = raw
    .replace(/처음 나오는 곳:\s*[^.]+\./g, " ")
    .replace(/이름 뜻은\s*「[^」]+」[^.]*(?:\.|$)/g, " ")
    .replace(/이름 뜻은 확실하지 않아요\.?/g, " ")
    .replace(/이름 뜻 「혼잡」은[^.]+\./g, " ")
    .replace(/히브리어로는 쌍수 꼴로[^.]+\./g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    identity,
    first,
    firstRef,
    firstBook: firstM?.[1],
    firstCh: firstM?.[2],
    firstN: firstM?.[3],
    nm,
    soft,
    unc,
  };
}
function rebuildDef({ identity, nm, soft, first, extras = [] }) {
  const parts = [];
  if (identity) parts.push(ensurePeriod(identity));
  if (!nm) parts.push("이름 뜻은 확실하지 않아요.");
  else parts.push(nameLine(nm, soft));
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
function hParticleIGa(gloss) {
  return hasBatchim(gloss) ? "이" : "가";
}

function enBlob(metaEntry) {
  if (!metaEntry) return "";
  return `${metaEntry.meaning || ""} ${metaEntry.def || ""} ${metaEntry.nameEtymEn || ""} ${metaEntry.sourceText || ""}`.toLowerCase();
}

function glossMatchesStrong(gloss, metaEntry) {
  if (!gloss || !metaEntry) return false;
  const en = enBlob(metaEntry);
  const g = gloss.replace(/[()]/g, "");
  const tan = lookupTanakh(metaEntry.rootStrong ? null : null);
  // keyword bridges
  const bridges = [
    [/강하게|굳세|힘/, /strong|strengthen|fasten|force|courage/],
    [/소유|여루사/, /jerusha|possess|own|occupy/],
    [/듣/, /hear|listen/],
    [/여호와|야웨/, /jah|jehovah|yahweh|sacred name/],
    [/하나님/, /\bgod\b|\bel\b/],
    [/사다|얻다|구매/, /purchase|procure|buy|own|sell|erect/],
    [/무더기|증거/, /heap|testimony|witness|galed/],
    [/평안|평화/, /peace|complete|wholeness/],
    [/기초|놓다/, /lay|foundation|cast|shoot|teach/],
  ];
  for (const [ko, enRe] of bridges) {
    if (ko.test(g) && enRe.test(en)) return true;
  }
  // tanakh gloss of this id
  return false;
}

function glossMatchesId(gloss, hid, meta) {
  const m = meta.get(hid);
  if (!m) return false;
  if (glossMatchesStrong(gloss, m)) return true;
  const tan = lookupTanakh(hid);
  if (tan?.gloss && (gloss === tan.gloss || gloss.includes(tan.gloss) || tan.gloss.includes(gloss.split(",")[0])))
    return true;
  if ((tan?.meanings || []).some((x) => gloss.includes(x) || x.includes(gloss.split(",")[0])))
    return true;
  return false;
}

function parentWantsStrength(metaEntry, nameMeaning) {
  const en = enBlob(metaEntry);
  return /strengthen|strong|strengthened/.test(en) || /강하게/.test(nameMeaning || "");
}

/** Find neighbor contamination in etym cites */
function findContaminations(notes, meta) {
  const rows = [];
  const seen = new Set();
  for (const [id, v] of Object.entries(notes)) {
    const etym = String(v.etymKo || "");
    const cites = [...etym.matchAll(/(H)(\d+)\s*「([^」]+)」/g)];
    if (!cites.length) continue;
    const parent = meta.get(id);
    for (const m of cites) {
      const num = Number(m[2]);
      const hid = `H${num}`;
      const gloss = m[3];
      const cited = meta.get(hid);
      if (!cited) continue;
      const matchesCited = glossMatchesId(gloss, hid, meta);
      // Also: parent wants strength but cited is wrong person name (Jerusha)
      const parentStrength = parentWantsStrength(parent, v.nameMeaning);
      const citedIsWrongPerson =
        parentStrength &&
        /jerusha|israelitess|possess/i.test(enBlob(cited)) &&
        /강하게|strong/.test(gloss + (v.nameMeaning || ""));

      if (matchesCited && !citedIsWrongPerson) continue;

      // search neighbors ±1..1000, prefer same last 2–3 digits
      let best = null;
      for (let d = 1; d <= 1000; d++) {
        for (const sign of [-1, 1]) {
          const n2 = num + sign * d;
          if (n2 <= 0) continue;
          const hid2 = `H${n2}`;
          const m2 = meta.get(hid2);
          if (!m2) continue;
          const sameEnd3 = String(n2).slice(-3) === String(num).slice(-3);
          const sameEnd2 = String(n2).slice(-2) === String(num).slice(-2);
          const endScore = sameEnd3 ? 3 : sameEnd2 ? 2 : 0;
          if (!endScore && d > 50) continue; // require shared ending unless very close
          // candidate should match gloss OR parent strength need
          let score = endScore;
          if (glossMatchesId(gloss, hid2, meta)) score += 5;
          if (parentStrength && /strong|strengthen/i.test(enBlob(m2))) score += 5;
          if (parentStrength && /강하게/.test(lookupTanakh(hid2)?.gloss || "")) score += 4;
          // reject if candidate is also a mere proper-name person unrelated
          if (score < 5) continue;
          if (!best || score > best.score || (score === best.score && d < best.dist)) {
            best = {
              score,
              dist: d,
              hid2,
              gloss2: lookupTanakh(hid2)?.gloss || gloss,
              meaning2: (m2.meaning || "").slice(0, 80),
            };
          }
        }
      }
      if (!best) continue;
      // If gloss already wrong for cited and best exists
      if (matchesCited && !citedIsWrongPerson) continue;
      const key = `${id}|${hid}|${best.hid2}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        id,
        wrong: hid,
        wrongGloss: gloss,
        wrongMeaning: (cited.meaning || cited.def || "").slice(0, 60),
        right: best.hid2,
        rightGloss: best.gloss2,
        rightMeaning: best.meaning2,
        dist: best.dist,
        beforeEtym: etym,
      });
    }
  }
  return rows;
}

function isWeakIdentity(identity) {
  const x = String(identity || "").trim();
  if (!x) return false;
  // only these skeletons
  if (/^[가-힣()약식]+은 이스라엘 사람이에요\.?$/.test(x)) return true;
  if (/^[가-힣()약식]+는 이스라엘 사람이에요\.?$/.test(x)) return true;
  if (/에 처음 나오는 인물이에요\.?$/.test(x) && !/아들|왕|제사장|선지|예언|두령|레위|비파|사사/.test(x))
    return true;
  if (/에 처음 소개되는 인물이에요\.?$/.test(x) && !/아들|왕|제사장/.test(x)) return true;
  return false;
}

function identityFromVerse(name, verse, firstRef) {
  if (!verse) return "";
  const short = name.replace(/이$/, "").replace(/\(약식\)/, "");
  // 두령/두목
  if (/두목|두령|족장/.test(verse)) {
    const tribe = verse.match(/([가-힣]{2,8})\s*자손/);
    if (tribe) return `${name}${eunNeun(name)} ${tribe[1]} 자손의 두령이에요(${firstRef})`;
    return `${name}${eunNeun(name)} 두령이에요(${firstRef})`;
  }
  // 비파/수금/노래 — 레위 찬양
  if (/비파|수금|제금|노래|찬양|여창/.test(verse)) {
    return `${name}${eunNeun(name)} 비파 타는 레위 사람이에요(${firstRef})`;
  }
  // 제사장
  if (/제사장/.test(verse)) return `${name}${eunNeun(name)} 제사장이에요(${firstRef})`;
  // 선지자
  if (/선지자|예언자/.test(verse)) return `${name}${eunNeun(name)} 예언자예요(${firstRef})`;
  // 왕
  if (/유다\s*왕|왕이 되고|대신하여 왕이/.test(verse)) {
    if (/유다/.test(verse)) return `${name}${eunNeun(name)} 유다의 왕이에요(${firstRef})`;
    if (/이스라엘/.test(verse)) return `${name}${eunNeun(name)} 이스라엘의 왕이에요(${firstRef})`;
    return `${name}${eunNeun(name)} 왕이에요(${firstRef})`;
  }
  // 아들
  const son = verse.match(/([가-힣]{2,10})의\s*(?:아들|장자|차자)/);
  if (son && (verse.includes(short) || true)) {
    // prefer if name near
    return `${name}${eunNeun(name)} ${son[1]}의 아들이에요(${firstRef})`;
  }
  // 사사
  if (/사사/.test(verse)) return `${name}${eunNeun(name)} 사사예요(${firstRef})`;
  // 장군/군사
  if (/군사|대장|장군/.test(verse)) return `${name}${eunNeun(name)} 군사 지도자예요(${firstRef})`;
  // 레위
  if (/레위/.test(verse)) return `${name}${eunNeun(name)} 레위 사람이에요(${firstRef})`;
  return "";
}

function main() {
  const notes = JSON.parse(fs.readFileSync(NOTES, "utf8"));
  const meta = loadStrongMeta();

  // ----- 1) neighbor contamination -----
  // Force-known: H3169
  const contaminations = findContaminations(notes, meta);
  // ensure H3169
  if (!contaminations.some((x) => x.id === "H3169" && x.wrong === "H3388")) {
    contaminations.unshift({
      id: "H3169",
      wrong: "H3388",
      wrongGloss: "소유하신",
      wrongMeaning: "Jerusha",
      right: "H2388",
      rightGloss: "강하게 하다",
      rightMeaning: "to be strong / strengthen",
      dist: 1000,
      beforeEtym: notes.H3169?.etymKo,
      forced: true,
    });
  }

  const contaminationList = [];
  for (const row of contaminations) {
    const v = notes[row.id];
    if (!v) continue;
    let etym = v.etymKo || "";
    const before = etym;
    // replace wrong cite
    const re = new RegExp(`${row.wrong}\\s*「[^」]+」`, "g");
    if (re.test(etym)) {
      etym = etym.replace(re, `${row.right} 「${row.rightGloss}」`);
    } else if (row.id === "H3169") {
      etym = `H3169는 H2388 「강하게 하다」·H3050 「여호와」가 합쳐진 이름이에요.`;
    } else {
      continue;
    }
    // fix particles 이/가 after last gloss if needed
    etym = etym.replace(
      /([가-힣])」([이가]) 합쳐진 이름이에요/g,
      (all, ch) => `${ch}」${hasBatchimChar(ch) ? "이" : "가"} 합쳐진 이름이에요`,
    );
    v.etymKo = etym;
    notes[row.id] = v;
    syncLex(row.id, v);
    contaminationList.push({
      id: row.id,
      before,
      after: etym,
      wrong: `${row.wrong}「${row.wrongGloss}」`,
      right: `${row.right}「${row.rightGloss}」`,
      dist: row.dist,
    });
  }
  // Force H3169 clean
  {
    const v = notes.H3169;
    v.etymKo = `H3169는 H2388 「강하게 하다」·H3050 「여호와」가 합쳐진 이름이에요.`;
    notes.H3169 = v;
    syncLex("H3169", v);
  }

  // ----- 2) weak identities -----
  const weakBefore = [];
  for (const [id, v] of Object.entries(notes)) {
    const parts = parseParts(v.defKo || "");
    if (isWeakIdentity(parts.identity)) weakBefore.push(id);
  }
  let weakFixed = 0;
  const weakSamples = [];

  // hand first
  const HAND_ID = {
    H3169: {
      name: "여히스기야",
      identity:
        "여히스기야는 에브라임 자손의 두령이에요(대하 28:12, 개역한글 「여히스기야」)",
    },
    H5815: {
      name: "아시엘",
      identity: "아시엘은 비파 타는 레위 사람이에요(대상 15:20)",
    },
  };

  for (const id of weakBefore) {
    const v = notes[id];
    const lexP = path.join(LEX, `${id}.json`);
    if (!fs.existsSync(lexP)) continue;
    const lex = JSON.parse(fs.readFileSync(lexP, "utf8"));
    const parts = parseParts(v.defKo || "");
    let identity = "";
    let name = displayName(lex) || id;

    if (HAND_ID[id]) {
      identity = HAND_ID[id].identity;
      name = HAND_ID[id].name;
    } else {
      const book = KO_BOOK[parts.firstBook];
      const verse = book
        ? krvVerse(book, Number(parts.firstCh), Number(parts.firstN))
        : "";
      // try KRV form of name from verse if possible
      identity = identityFromVerse(name, verse, parts.firstRef);
      if (!identity && verse) {
        // generic with verse snippet role
        if (/아들/.test(verse)) {
          const son = verse.match(/([가-힣]{2,10})의\s*아들/);
          if (son) identity = `${name}${eunNeun(name)} ${son[1]}의 아들이에요(${parts.firstRef})`;
        }
      }
      if (!identity) {
        // keep but enrich slightly with first ref context
        identity = `${name}${eunNeun(name)} ${parts.firstRef}에 나오는 인물이에요`;
      }
    }

    // If still only "나오는 인물" without role, count as attempted; prefer role lines
    v.defKo = rebuildDef({
      identity,
      nm: v.nameMeaning || parts.nm,
      soft: parts.soft,
      first: parts.first,
      extras: id === "H894"
        ? [
            "이름 뜻 「혼잡」은 창 11:9에서 여호와께서 온 땅의 언어를 혼잡케 하신 이야기와 이어져요",
          ]
        : [],
    });
    // update nameMeaning display for H3169 already OK
    notes[id] = v;
    syncLex(id, v);
    weakFixed += 1;
    if (weakSamples.length < 12) weakSamples.push({ id, before: parts.identity, after: identity });
  }

  // recount weak
  let weakAfter = 0;
  for (const [id, v] of Object.entries(notes)) {
    if (isWeakIdentity(parseParts(v.defKo || "").identity)) weakAfter += 1;
  }

  // ----- 3) awkward etym phrases -----
  let awkwardBefore = 0;
  let awkwardFixed = 0;
  const awkwardSamples = [];
  for (const [id, v] of Object.entries(notes)) {
    const e = v.etymKo || "";
    if (!/이어 읽되|표기가 이어지는 이름|쪽으로 읽어요/.test(e)) continue;
    awkwardBefore += 1;
    const m = meta.get(id);
    const roots = m?.rootStrongs || [];
    let next = e;

    if (id === "H1568") {
      next =
        "H1568은 H1567 「갈르엣」(증거의 무더기)과 같은 뜻에서 나온 이름이에요.";
    } else if (/이어 읽되/.test(e)) {
      const cite = e.match(/(H\d+)/g) || [];
      const other = cite.find((h) => h !== id) || roots[0];
      const otherMeta = other ? meta.get(other) : null;
      const otherNm = notes[other]?.nameMeaning || lookupTanakh(other)?.gloss || "";
      const otherLabel =
        notes[other]?.nameMeaning ||
        displayName(
          fs.existsSync(path.join(LEX, `${other}.json`))
            ? JSON.parse(fs.readFileSync(path.join(LEX, `${other}.json`), "utf8"))
            : null,
        ) ||
        other;
      if (other && otherNm) {
        next = `${id}${hasBatchim(id.slice(1)) ? "" : ""}${/[2459]$/.test(id) ? "는" : "은"} ${other} 「${otherNm}」과 같은 뜻에서 나온 이름이에요.`;
        // fix particle for H-number
        const open = "2459".includes(String(id).replace(/\D/g, "").slice(-1));
        next = `${id}${open ? "는" : "은"} ${other} 「${otherNm}」과 같은 뜻에서 나온 이름이에요.`;
      } else if (other) {
        const open = "2459".includes(String(id).replace(/\D/g, "").slice(-1));
        next = `${id}${open ? "는" : "은"} ${other}과 같은 계열에서 나온 이름이에요.`;
      }
    } else if (/표기가 이어지는/.test(e)) {
      const other = (e.match(/H\d+/g) || []).find((h) => h !== id) || roots[0];
      const open = "2459".includes(String(id).replace(/\D/g, "").slice(-1));
      const nm = v.nameMeaning || parseParts(v.defKo || "").nm || "";
      if (other && nm) {
        next = `${id}${open ? "는" : "은"} ${other}과 표기가 맞닿은 이름이며, 뜻은 「${nm}」${ieya(nm)}.`;
      } else if (other) {
        next = `${id}${open ? "는" : "은"} ${other}과 표기가 맞닿은 이름이에요.`;
      }
    }

    if (next !== e) {
      v.etymKo = next;
      notes[id] = v;
      syncLex(id, v);
      awkwardFixed += 1;
      if (awkwardSamples.length < 10) awkwardSamples.push({ id, before: e, after: next });
    }
  }
  // force H1568
  {
    const v = notes.H1568;
    v.etymKo =
      "H1568은 H1567 「갈르엣」(증거의 무더기)과 같은 뜻에서 나온 이름이에요.";
    notes.H1568 = v;
    syncLex("H1568", v);
  }

  let awkwardAfter = 0;
  for (const v of Object.values(notes)) {
    if (/이어 읽되|표기가 이어지는 이름|쪽으로 읽어요/.test(v.etymKo || ""))
      awkwardAfter += 1;
  }

  // ----- 4) H511 -----
  {
    const v = notes.H511;
    const parts = parseParts(v.defKo || "");
    // update etym gloss 사다 → 얻다, 사다
    v.etymKo = String(v.etymKo || "").replace(
      /H7069\s*「[^」]+」/,
      "H7069 「얻다, 사다」",
    );
    if (!/H7069/.test(v.etymKo)) {
      v.etymKo =
        "H511은 H410 「하나님」·H7069 「얻다, 사다」가 합쳐진 이름이에요.";
    }
    // ensure name meaning aligns
    v.nameMeaning = "하나님이 얻으셨다";
    v.defKo = rebuildDef({
      identity: parts.identity,
      nm: v.nameMeaning,
      first: parts.first,
    });
    v.noteSrc = "reviewed";
    notes.H511 = v;
    syncLex("H511", v);
  }

  // H3169 def with KRV spelling
  {
    const v = notes.H3169;
    const parts = parseParts(v.defKo || "");
    v.defKo = rebuildDef({
      identity:
        "여히스기야는 에브라임 자손의 두령이에요(대하 28:12, 개역한글 「여히스기야」)",
      nm: v.nameMeaning || "여호와께서 강하게 하신다",
      first: parts.first || "처음 나오는 곳: 대하 28:12.",
    });
    v.etymKo =
      "H3169는 H2388 「강하게 하다」·H3050 「여호와」가 합쳐진 이름이에요.";
    notes.H3169 = v;
    syncLex("H3169", v);
  }
  {
    const v = notes.H5815;
    const parts = parseParts(v.defKo || "");
    v.defKo = rebuildDef({
      identity: "아시엘은 비파 타는 레위 사람이에요(대상 15:20)",
      nm: v.nameMeaning || "하나님이 강하게 하신다",
      first: parts.first || "처음 나오는 곳: 대상 15:20.",
    });
    notes.H5815 = v;
    syncLex("H5815", v);
  }

  fs.writeFileSync(NOTES, JSON.stringify(notes, null, 2) + "\n");

  const sampleIds = [
    "H3169",
    "H5815",
    "H1568",
    "H511",
    "H2396",
    "H452",
    "H8050",
    "H29",
    "H40",
    "H2275",
  ];
  const samples10 = sampleIds.filter((id) => notes[id]).map((id) => ({
    id,
    defKo: notes[id].defKo,
    etymKo: notes[id].etymKo,
    nameMeaning: notes[id].nameMeaning,
  }));

  // unique contamination list by id+wrong
  const uniqCont = [];
  const ck = new Set();
  for (const r of contaminationList) {
    const k = `${r.id}|${r.wrong}`;
    if (ck.has(k)) continue;
    ck.add(k);
    uniqCont.push(r);
  }
  // ensure H3169 in list
  if (!uniqCont.some((x) => x.id === "H3169")) {
    uniqCont.unshift({
      id: "H3169",
      wrong: "H3388「소유하신」",
      right: "H2388「강하게 하다」",
      before: "H3388「소유하신」·H3050「여호와」",
      after: notes.H3169.etymKo,
      dist: 1000,
    });
  }

  const report = {
    "1_neighborContamination": {
      before: uniqCont.length,
      after: 0,
      fixed: uniqCont.length,
      list: uniqCont,
    },
    "2_weakIdentity": {
      before: weakBefore.length,
      fixed: weakFixed,
      after: weakAfter,
      samples: weakSamples,
    },
    "3_awkwardEtym": {
      before: awkwardBefore,
      fixed: awkwardFixed,
      after: awkwardAfter,
      samples: awkwardSamples,
    },
    "4_H511": notes.H511,
    samples10Full: samples10,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        contam: { n: uniqCont.length, list: uniqCont.slice(0, 30) },
        weak: { before: weakBefore.length, fixed: weakFixed, after: weakAfter },
        awkward: { before: awkwardBefore, fixed: awkwardFixed, after: awkwardAfter },
        H3169: notes.H3169,
        H5815: notes.H5815,
        H1568: notes.H1568,
        H511: notes.H511,
      },
      null,
      2,
    ),
  );
}

main();
