/**
 * 히브리어 5차: 아버지/형제 문장형 · 합성 어원 · 조사 · 신원 631 · 이스라엘
 *   node scripts/fix-hebrew-notes-round9.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookupTanakh } from "./lib/tanakh-lexicon.mjs";
import {
  loadStrongMeta,
  extractNameEtymEn,
  normH,
} from "./lib/hebrew-strong-meta.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const NOTES = path.join(root, "data/keyword-notes/hebrew.json");
const LEX = path.join(root, "public/word-study/lexicon/hebrew");
const OUT = path.join(root, "public/word-study");
const REPORT = path.join(OUT, "_hebrew-notes-round9-report.json");
const TABLE1 = path.join(OUT, "_hebrew-notes-round9-father-brother-table.json");

function hasBatchim(word) {
  const ch = String(word || "").replace(/[^가-힣]/g, "").slice(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}
function ieya(w) {
  return hasBatchim(w) ? "이에요" : "예요";
}
function eulUl(w) {
  return hasBatchim(w) ? "을" : "를";
}
function eunNeun(w) {
  return hasBatchim(w) ? "은" : "는";
}
function iGa(w) {
  return hasBatchim(w) ? "이" : "가";
}
function gwaWa(w) {
  return hasBatchim(w) ? "과" : "와";
}
function ensurePeriod(s) {
  const t = String(s || "").trim();
  if (!t) return t;
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}
function nameLine(nm, soft = false) {
  if (!nm) return "이름 뜻은 확실하지 않아요.";
  if (soft) return `이름 뜻은 「${nm}」로 보기도 해요.`;
  return `이름 뜻은 「${nm}」${ieya(nm)}.`;
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

function rebuildDef(def, { identity, nm, soft, first }) {
  const parts = [];
  if (identity) parts.push(ensurePeriod(identity));
  parts.push(nameLine(nm, soft));
  if (first) parts.push(first.endsWith(".") ? first : `${first}.`);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function parseParts(def) {
  const raw = String(def || "").replace(/\s+/g, " ").trim();
  const firsts = [...raw.matchAll(/처음 나오는 곳:\s*[^.]+\./g)].map((m) => m[0]);
  const first = firsts[0] || "";
  const nmM = raw.match(/이름 뜻은\s*「([^」]+)」([^.]*)\./);
  const soft = nmM ? /보기도/.test(nmM[2]) : false;
  const unc = /이름 뜻은 확실하지 않아요/.test(raw);
  const nm = nmM ? nmM[1] : "";
  let identity = raw
    .replace(/처음 나오는 곳:\s*[^.]+\./g, " ")
    .replace(/이름 뜻은\s*「[^」]+」[^.]*(?:\.|$)/g, " ")
    .replace(/이름 뜻은 확실하지 않아요\.?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { identity, first, nm, soft, unc };
}

/** 아버지/형제/주 예배자·소유자 → 문장형 */
function translateFatherBrother(src, etym) {
  const s = `${src || ""} ${etym || ""}`;
  // hand-priority patterns
  if (/father \(i\.e\. worshipper\) of Him \(i\.e\. God\)/i.test(s))
    return "그분은 나의 아버지";
  if (/father \(i\.e\. worshipper\) of Jah/i.test(s) || /father \(i\.e\. worshipper\) of Jehovah/i.test(s))
    return "여호와는 나의 아버지";
  if (/brother \(i\.e\. worshipper\) of Jah/i.test(s))
    return "여호와는 나의 형제";
  if (/lord \(i\.e\. worshipper\) of Jah/i.test(s))
    return "여호와는 나의 주";
  if (/father \(i\.e\. possessor\) of God/i.test(s))
    return "하나님은 나의 아버지";
  if (/father \(i\.e\. possessor\) of might/i.test(s))
    return "나의 아버지는 강하시다";
  if (/father \(i\.e\. possessor\) of renown/i.test(s))
    return "나의 아버지는 유명하시다";
  if (/brother \(i\.e\. possessor\) of understanding/i.test(s))
    return "나의 형제는 명철하시다";
  if (/brother \(i\.e\. friend\) of \(his\) father/i.test(s))
    return "아버지의 형제"; // keep kinship, not theophoric inversion
  if (/father of generosity|father of abundance|father of plenty/i.test(s))
    return "나의 아버지는 너그러우시다";
  if (/father of peace/i.test(s)) return "나의 아버지는 평강이시다";
  if (/father of light/i.test(s)) return "나의 아버지는 빛이시다";
  if (/father of joy|father \(i\.e\. source\) of joy/i.test(s))
    return "나의 아버지는 기쁨이시다";
  if (/father of height|father of \(?the\)? height/i.test(s))
    return "나의 아버지는 높으시다";
  if (/father of help/i.test(s)) return "나의 아버지는 도움이시다";
  if (/father of goodness/i.test(s)) return "나의 아버지는 선하시다";
  if (/father of dew/i.test(s)) return "나의 아버지는 이슬이시다";
  if (/father of knowledge/i.test(s)) return "나의 아버지는 지식이시다";
  if (/father of judgment/i.test(s)) return "나의 아버지는 심판이시다";
  if (/father of (?:a )?gift/i.test(s)) return "나의 아버지는 선물이시다";
  if (/father of error/i.test(s)) return "나의 아버지는 오류와 관련되다"; // rare
  if (/father of \(the\) wall/i.test(s)) return "나의 아버지는 성벽이시다";
  if (/father of \(the\) king/i.test(s)) return "나의 아버지는 왕이시다";
  if (/father of \(the\) sea/i.test(s)) return "나의 아버지는 바다와 관련되다";
  if (/father of gathering/i.test(s)) return "나의 아버지는 모으시는 이";
  if (/father of a multitude|father of multitudes/i.test(s))
    return "많은 무리의 아버지"; // Abraham - established
  if (/brother of rising \(i\.e\. high\)/i.test(s)) return "나의 형제는 높으시다";
  if (/brother of anger/i.test(s)) return "나의 형제는 노여움과 관련되다";
  if (/brother of goodness/i.test(s)) return "나의 형제는 선하시다";
  if (/brother of folly/i.test(s)) return "나의 형제는 어리석음과 관련되다";
  if (/brother of wrong/i.test(s)) return "나의 형제는 악과 관련되다";
  if (/brother of \(the\) king/i.test(s)) return "나의 형제는 왕이시다";

  // generic father of X / brother of X from etym
  let m;
  if ((m = String(etym || "").match(/^father(?:\s*\([^)]*\))?\s+of\s+(?:\(the\)\s*)?(.+)$/i))) {
    const rest = m[1].replace(/\s*\([^)]*\)\s*/g, " ").trim();
    if (/jah|jehovah|god|him/i.test(rest)) return "여호와는 나의 아버지";
    // leave non-theophoric for now if already OK
  }
  if ((m = String(etym || "").match(/^brother(?:\s*\([^)]*\))?\s+of\s+(?:\(the\)\s*)?(.+)$/i))) {
    const rest = m[1].replace(/\s*\([^)]*\)\s*/g, " ").trim();
    if (/jah|jehovah|god/i.test(rest)) return "여호와는 나의 형제";
  }
  return "";
}

function isFatherBrotherTarget(src, etym, nm) {
  const s = `${src || ""} ${etym || ""}`;
  if (/father \(i\.e/i.test(s) || /brother \(i\.e/i.test(s) || /lord \(i\.e\.\s*worshipper\)/i.test(s))
    return true;
  if (/(?:^|;)\s*father of /i.test(s) || /(?:^|;)\s*brother of /i.test(s)) return true;
  if (/\bfrom 1 and\b/i.test(src) && /father/i.test(etym || src)) return true;
  if (/\bfrom 251 and\b/i.test(src) && /brother/i.test(etym || src)) return true;
  if (/\bfrom 113 and\b/i.test(src) && /lord|worshipper/i.test(src)) return true;
  if (/여호와의 아버지|하나님의 아버지|하나님의 형제|여호와의 형제|여호와의 주$/.test(nm || ""))
    return true;
  return false;
}

function isForbiddenGodKin(nm) {
  return /여호와의 아버지|하나님의 아버지|하나님의 형제|여호와의 형제(?!.*나의)/.test(
    nm || "",
  );
}

/** Strong 풀이에서 어근 뜻 뽑기 (i.e./괄호/핵심 동사) */
function strongComponentGloss(id, metaMap, notes) {
  const hid = normH(id);
  const meta = metaMap.get(hid);
  const meaning = `${meta?.def || ""} ${meta?.meaning || ""}`.replace(/\s+/g, " ").trim();
  const src = meta?.sourceText || "";

  // specials
  if (hid === "H3384") return "(기초를) 놓다";
  if (hid === "H7999") return "온전하다, 평화롭다";
  if (hid === "H8280") return "겨루어 이기다";
  if (hid === "H410") return "하나님";
  if (hid === "H3068") return "여호와";
  if (hid === "H3050") return "여호와";
  if (hid === "H1") return "아버지";
  if (hid === "H251") return "형제";
  if (hid === "H113") return "주";

  // i.e. preferred
  const ies = [...meaning.matchAll(/i\.e\.\s*([^);]+)/gi)].map((m) => m[1].trim());
  const mapEn = {
    rain: "비 내리다",
    shoot: "쏘다",
    teach: "가르치다",
    "to teach": "가르치다",
    "to lay": "(기초를) 놓다",
    lay: "(기초를) 놓다",
    throw: "던지다",
    "point out": "가리키다",
    rescued: "건져 냄",
    friendly: "친근한",
    liberal: "너그러운",
    warrior: "전사",
    worshipper: "예배자",
    possessor: "소유자",
    blessing: "복",
    high: "높은",
    gracious: "은혜로운",
    promised: "약속하신",
  };
  for (const ie of ies) {
    const low = ie.toLowerCase();
    for (const [en, ko] of Object.entries(mapEn)) {
      if (low.includes(en)) return ko;
    }
  }

  // "to VERB" head
  const toM = meaning.match(/\bto ([a-z]+(?:\s+[a-z]+)?)/i);
  if (toM) {
    const v = toM[1].toLowerCase();
    const verbs = {
      hear: "듣다",
      give: "주다",
      help: "돕다",
      save: "구원하다",
      teach: "가르치다",
      judge: "재판하다",
      remember: "기억하다",
      build: "세우다",
      create: "창조하다",
      prevail: "겨루어 이기다",
      rule: "다스리다",
      contend: "다투다",
      flow: "흐르다",
      rain: "비 내리다",
      lay: "(기초를) 놓다",
      throw: "던지다",
      shoot: "쏘다",
    };
    if (verbs[v]) return verbs[v];
    if (verbs[v.split(/\s+/)[0]]) return verbs[v.split(/\s+/)[0]];
  }

  // existing note gloss
  if (notes[hid]?.nameMeaning) return String(notes[hid].nameMeaning).split(/[,，]/)[0].trim();
  if (notes[hid]?.usageKo) return String(notes[hid].usageKo).split(/[,，]/)[0].trim();
  const tan = lookupTanakh(hid)?.gloss;
  if (tan) return String(tan).replace(/^~/, "").split(/[,，]/)[0].trim();

  const m = (notes[hid]?.defKo || "").match(/주로\s+(.+?)을 말하고/);
  if (m) return m[1];
  const m2 = (notes[hid]?.defKo || "").match(/^(.+?)을 말해요/);
  if (m2) return m2[1];

  return "";
}

/** pointing / pronounced / used after / variation → 재료 아님 */
function materialRoots(sourceText, rootStrongs) {
  const src = String(sourceText || "");
  const exclude = new Set();
  const patterns = [
    /(?:true )?pointing[^.]*?\b(?:of\s+)?(\d{1,5})\b/gi,
    /pronounced(?:\s+by Jews)?\s+as\s+(\d{1,5})/gi,
    /used after\s+(\d{1,5})/gi,
    /variation of\s+(\d{1,5})/gi,
    /corresponding to\s+(\d{1,5})/gi,
    /that of\s+(\d{1,5})/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src)) !== null) exclude.add(normH(m[1]));
  }
  // also: "reading, seems to be that of 3390"
  for (const m of src.matchAll(/\bof\s+(\d{1,5})\b(?=[^;]*pointing|[^;]*reading)/gi)) {
    exclude.add(normH(m[1]));
  }
  return (rootStrongs || []).filter((r) => !exclude.has(normH(r)));
}

function fixParticles(text) {
  let s = String(text || "");
  let n = 0;
  s = s.replace(/([가-힣])」(을|를|이|가|은|는|과|와|이에요|예요)/g, (all, ch, part) => {
    const code = ch.charCodeAt(0) - 0xac00;
    const batchim = code >= 0 && code <= 11171 && code % 28 !== 0;
    let expect = part;
    if (part === "을" || part === "를") expect = batchim ? "을" : "를";
    else if (part === "이" || part === "가") expect = batchim ? "이" : "가";
    else if (part === "은" || part === "는") expect = batchim ? "은" : "는";
    else if (part === "과" || part === "와") expect = batchim ? "과" : "와";
    else if (part === "이에요" || part === "예요") expect = batchim ? "이에요" : "예요";
    if (expect !== part) n += 1;
    return `${ch}」${expect}`;
  });
  return { text: s, n };
}

function main() {
  console.log("[r9] load…");
  const notes = JSON.parse(fs.readFileSync(NOTES, "utf8"));
  const metaMap = loadStrongMeta();

  const beforeSnap = {
    H29: { def: notes.H29?.defKo, nm: notes.H29?.nameMeaning, etym: notes.H29?.etymKo },
    H41: { def: notes.H41?.defKo, nm: notes.H41?.nameMeaning, etym: notes.H41?.etymKo },
    H30: { def: notes.H30?.defKo, nm: notes.H30?.nameMeaning, etym: notes.H30?.etymKo },
    H3389: { def: notes.H3389?.defKo, nm: notes.H3389?.nameMeaning, etym: notes.H3389?.etymKo },
    H3069: { def: notes.H3069?.defKo, nm: notes.H3069?.nameMeaning, etym: notes.H3069?.etymKo },
    H3478: { def: notes.H3478?.defKo, nm: notes.H3478?.nameMeaning, etym: notes.H3478?.etymKo },
  };

  // ----- 1) father/brother -----
  const table1 = [];
  for (const [k, v] of Object.entries(notes)) {
    if (!/^H\d+$/.test(k)) continue;
    const src = metaMap.get(k)?.sourceText || "";
    const etym = extractNameEtymEn(src) || metaMap.get(k)?.nameEtymEn || "";
    const curNm = v.nameMeaning || parseParts(v.defKo || "").nm || "";
    if (!isFatherBrotherTarget(src, etym, curNm) && !isForbiddenGodKin(curNm)) continue;

    const before = curNm;
    let after = translateFatherBrother(src, etym);
    if (!after && isForbiddenGodKin(curNm)) {
      // force fix forbidden
      if (/여호와의 아버지/.test(curNm)) after = "여호와는 나의 아버지";
      else if (/하나님의 아버지/.test(curNm)) after = "하나님은 나의 아버지";
      else if (/여호와의 형제/.test(curNm)) after = "여호와는 나의 형제";
      else if (/하나님의 형제/.test(curNm)) after = "하나님은 나의 형제";
      else if (/여호와의 주/.test(curNm)) after = "여호와는 나의 주";
    }
    if (!after) after = before;
    // hand overrides
    if (k === "H29") after = "여호와는 나의 아버지";
    if (k === "H41") after = "나의 아버지는 너그러우시다";
    if (k === "H30") after = "그분은 나의 아버지";

    const parts = parseParts(v.defKo || "");
    v.nameMeaning = after;
    v.defKo = rebuildDef(v.defKo, {
      identity: parts.identity,
      nm: after,
      soft: false,
      first: parts.first,
    });
    notes[k] = v;
    syncLex(k, v);
    table1.push({
      id: k,
      name: lookupTanakh(k)?.gloss || "",
      source: src.replace(/\s+/g, " ").trim(),
      before,
      after,
    });
  }
  table1.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  fs.writeFileSync(TABLE1, JSON.stringify(table1, null, 2) + "\n");

  // sweep any remaining forbidden
  let forbiddenAfter = 0;
  for (const [k, v] of Object.entries(notes)) {
    if (!/^H\d+$/.test(k)) continue;
    if (isForbiddenGodKin(v.nameMeaning || "") || isForbiddenGodKin(v.defKo || "")) {
      forbiddenAfter += 1;
    }
  }

  // ----- 2) compound 676 -----
  let glossReplaced = 0;
  let numberRemoved = 0;
  let notationExplain = 0;
  const samples2 = [];
  let changed2 = 0;

  for (const [k, v] of Object.entries(notes)) {
    if (!/^H\d+$/.test(k)) continue;
    const before = v.etymKo || "";
    if (!/함께 가리키는|을 이은 이름|다른 표기/.test(before) && k !== "H3069" && k !== "H3389") {
      // only process current compound-style or specials
      if (!/함께 가리키는/.test(before)) continue;
    }
    if (!/함께 가리키는/.test(before) && k !== "H3069") continue;

    const meta = metaMap.get(k);
    const src = meta?.sourceText || "";

    // H3069 special notation
    if (k === "H3069") {
      v.etymKo =
        "H3068의 다른 표기로, 주로 「주」(H136) 뒤에 쓰이고 「하나님」(H430)으로 읽어요.";
      notes[k] = v;
      syncLex(k, v);
      notationExplain += 1;
      changed2 += 1;
      if (samples2.length < 15) {
        samples2.push({ id: k, type: "표기 설명", before, after: v.etymKo });
      }
      continue;
    }

    const rootsAll = meta?.rootStrongs || [];
    const roots = materialRoots(src, rootsAll);
    const removed = rootsAll.filter((r) => !roots.includes(r));
    if (removed.length) numberRemoved += removed.length;

    if (!roots.length) {
      // fallback: keep first real root if any
      v.etymKo = before;
      continue;
    }

    const parts = roots.map((r) => {
      const g = strongComponentGloss(r, metaMap, notes);
      return g ? `${normH(r)} 「${g}」` : normH(r);
    });
    const next = `${k}은 ${parts.join("·")}을 함께 가리키는 합성 이름이에요.`;
    // fix particle later in pass 3

    let type = "뜻 교체";
    if (removed.length) type = "번호 제거+뜻 교체";
    if (next !== before) {
      // detect gloss change
      const oldGlosses = [...before.matchAll(/「([^」]+)」/g)].map((m) => m[1]).join("|");
      const newGlosses = [...next.matchAll(/「([^」]+)」/g)].map((m) => m[1]).join("|");
      if (oldGlosses !== newGlosses) glossReplaced += 1;
      v.etymKo = next;
      notes[k] = v;
      syncLex(k, v);
      changed2 += 1;
      if (samples2.length < 15) {
        samples2.push({ id: k, type, before, after: next, removed });
      }
    } else if (removed.length) {
      v.etymKo = next;
      notes[k] = v;
      syncLex(k, v);
      changed2 += 1;
    }
  }

  // force H3389
  {
    const v = notes.H3389;
    const before = v.etymKo;
    v.etymKo =
      "H3389은 H3384 「(기초를) 놓다」·H7999 「온전하다, 평화롭다」을 함께 가리키는 합성 이름이에요.";
    notes.H3389 = v;
    syncLex("H3389", v);
    if (!samples2.find((x) => x.id === "H3389")) {
      samples2.unshift({
        id: "H3389",
        type: "번호 제거+뜻 교체",
        before,
        after: v.etymKo,
        removed: ["H3390"],
      });
    }
  }

  // ----- 5) H3478 -----
  {
    const v = notes.H3478;
    const parts = parseParts(v.defKo || "");
    v.nameMeaning = "하나님과 겨루어 이기다";
    v.etymKo =
      "H3478은 H8280 「겨루어 이기다」·H410 「하나님」을 함께 가리키는 합성 이름이에요.";
    const identity =
      parts.identity ||
      "이스라엘은 야곱에게 주신 이름이며, 그 자손 백성과 나라를 가리켜요(창 32:28).";
    const extra = "창 32:28에서는 「겨루어 이기었음」으로 그 이름을 설명해요.";
    v.defKo = [
      ensurePeriod(identity),
      nameLine(v.nameMeaning),
      extra,
      parts.first || "처음 나오는 곳: 창 32:28.",
    ]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    notes.H3478 = v;
    syncLex("H3478", v);
  }

  // ----- 3) particles -----
  let particleBefore = 0;
  let particleFixed = 0;
  // count before
  for (const [k, v] of Object.entries(notes)) {
    if (!/^H\d+$/.test(k)) continue;
    const blob = `${v.defKo || ""}\n${v.etymKo || ""}`;
    for (const m of blob.matchAll(/([가-힣])」(을|를|이|가|은|는|과|와|이에요|예요)/g)) {
      const ch = m[1];
      const part = m[2];
      const code = ch.charCodeAt(0) - 0xac00;
      const batchim = code >= 0 && code <= 11171 && code % 28 !== 0;
      let expect = part;
      if (part === "을" || part === "를") expect = batchim ? "을" : "를";
      else if (part === "이" || part === "가") expect = batchim ? "이" : "가";
      else if (part === "은" || part === "는") expect = batchim ? "은" : "는";
      else if (part === "과" || part === "와") expect = batchim ? "과" : "와";
      else if (part === "이에요" || part === "예요") expect = batchim ? "이에요" : "예요";
      if (expect !== part) particleBefore += 1;
    }
  }
  for (const [k, v] of Object.entries(notes)) {
    if (!/^H\d+$/.test(k)) continue;
    const d = fixParticles(v.defKo || "");
    const e = fixParticles(v.etymKo || "");
    if (d.n || e.n) {
      particleFixed += d.n + e.n;
      v.defKo = d.text;
      v.etymKo = e.text;
      notes[k] = v;
      syncLex(k, v);
    }
  }
  let particleAfter = 0;
  for (const [k, v] of Object.entries(notes)) {
    if (!/^H\d+$/.test(k)) continue;
    const blob = `${v.defKo || ""}\n${v.etymKo || ""}`;
    for (const m of blob.matchAll(/([가-힣])」(을|를|이|가|은|는|과|와|이에요|예요)/g)) {
      const ch = m[1];
      const part = m[2];
      const code = ch.charCodeAt(0) - 0xac00;
      const batchim = code >= 0 && code <= 11171 && code % 28 !== 0;
      let expect = part;
      if (part === "을" || part === "를") expect = batchim ? "을" : "를";
      else if (part === "이" || part === "가") expect = batchim ? "이" : "가";
      else if (part === "은" || part === "는") expect = batchim ? "은" : "는";
      else if (part === "과" || part === "와") expect = batchim ? "과" : "와";
      else if (part === "이에요" || part === "예요") expect = batchim ? "이에요" : "예요";
      if (expect !== part) particleAfter += 1;
    }
  }

  // ----- 4) classify 631 without identity -----
  const noId = [];
  for (const [k, v] of Object.entries(notes)) {
    if (!/^H\d+$/.test(k)) continue;
    const d = (v.defKo || "").trim();
    if (!/이름 뜻은|처음 나오는 곳/.test(d)) continue;
    if (/^이름 뜻은/.test(d)) {
      const meta = metaMap.get(k);
      let why = "기타";
      const mean = meta?.meaning || "";
      if (/이름 뜻은 확실하지 않아요/.test(d)) why = "이름뜻 공란(신원 단서 부족)";
      else if (/로 보기도 해요/.test(d)) why = "추정 이름뜻만(신원 단서 부족)";
      else if (/place|city|river|mountain|nation|country|region/i.test(mean))
        why = "지명·지형(짧은 이름뜻만)";
      else if (/name of .+ Israelites?|an Israelite|persons?/i.test(mean))
        why = "인명이나 Strong 신원 문장 생성 실패";
      else if (!mean) why = "Strong meaning 없음";
      else why = "Strong meaning으로 신원 문장 미생성";
      noId.push({
        id: k,
        name: lookupTanakh(k)?.gloss || "",
        why,
        def: d.slice(0, 120),
        meaning: mean.slice(0, 80),
      });
    }
  }
  const whyCounts = {};
  for (const row of noId) whyCounts[row.why] = (whyCounts[row.why] || 0) + 1;

  fs.writeFileSync(NOTES, JSON.stringify(notes, null, 2) + "\n");

  const report = {
    "1_fatherBrother": {
      targetCount: table1.length,
      forbiddenGodKinAfter: forbiddenAfter,
      tableFile: "public/word-study/_hebrew-notes-round9-father-brother-table.json",
      samples15: table1.slice(0, 15),
      H29: notes.H29,
      H41: notes.H41,
      H30: notes.H30,
    },
    "2_compound676": {
      changed: changed2,
      byType: {
        "뜻 교체": glossReplaced,
        "번호 제거(건수)": numberRemoved,
        "표기 설명": notationExplain,
      },
      samples15: samples2.slice(0, 15),
      H3389: { etymKo: notes.H3389?.etymKo, defKo: notes.H3389?.defKo },
      H3069: { etymKo: notes.H3069?.etymKo, defKo: notes.H3069?.defKo },
    },
    "3_particles": {
      before: particleBefore,
      fixed: particleFixed,
      after: particleAfter,
    },
    "4_identity631": {
      total: noId.length,
      byType: whyCounts,
      samples5: noId.slice(0, 5),
      note: "2337개 중 신원 채움 1706, 나머지 631은 이름뜻·처음출현만 두고 신원 문장은 Strong 단서 부족으로 비움(이름뜻으로 시작).",
    },
    "5_H3478": notes.H3478,
    beforeSnap,
    fulltexts: {
      H29: notes.H29,
      H41: notes.H41,
      H30: notes.H30,
      H3389: notes.H3389,
      H3069: notes.H3069,
      H3478: notes.H3478,
    },
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        t1: table1.length,
        forbiddenAfter,
        samples1: table1.filter((x) => ["H29", "H41", "H30", "H22", "H281", "H138"].includes(x.id)),
        t2: { changed2, glossReplaced, numberRemoved, notationExplain, samples2: samples2.slice(0, 5) },
        t3: { particleBefore, particleFixed, particleAfter },
        t4: { n: noId.length, whyCounts, samples: noId.slice(0, 5) },
        full: report.fulltexts,
      },
      null,
      2,
    ),
  );
}

main();
