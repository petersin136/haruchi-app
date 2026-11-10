/**
 * 히브리어 사전 6차 마무리: 이름뜻 종결·동사원형·복합 from·깨진 틀·직역투
 *   node scripts/fix-hebrew-notes-round6-finish.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookupTanakh } from "./lib/tanakh-lexicon.mjs";
import {
  loadStrongMeta,
  extractNameEtymEn,
  deriveNameMeaningKo,
  translateNameGloss,
  normH,
} from "./lib/hebrew-strong-meta.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const NOTES = path.join(root, "data/keyword-notes/hebrew.json");
const LEX = path.join(root, "public/word-study/lexicon/hebrew");
const OUT = path.join(root, "public/word-study");
const REPORT = path.join(OUT, "_hebrew-notes-round6-report.json");

const FOREIGN_RE =
  /(?:^|;)\s*(?:of )?(?:foreign|persian|egyptian) (?:derivation|origin)|of uncertain derivation|uncertain \(perhaps foreign\)|foreign origin|persian origin|egyptian origin/i;

const VERB_TO_NOUN = {
  찬송하다: "찬송",
  포위하다: "포위",
  내려가다: "내려감",
  잊다: "잊음",
  감추다: "감춤",
  공격하다: "공격",
  연합하다: "연합",
  빌리다: "빌림",
  재판하다: "재판",
  희다: "흰 자",
  의롭다: "의로움",
  거두다: "거둠",
  듣다: "들음",
  굽다: "굽은 곳",
  생각하다: "생각",
  다스리다: "다스림",
  지키다: "지킴",
  지치다: "지침",
  건너다: "건넘",
  감싸다: "감쌈",
  평안하다: "평안",
  바라보다: "바라봄",
  치료하다: "치료",
  "혼잡케 하다": "혼잡",
  "마음에 새기다": "마음에 새김",
  곧다: "곧음",
  복되다: "복됨",
  주다: "주심",
  더하다: "더하심",
  보다: "봄",
  정탐하다: "정탐",
  위로하다: "위로",
  다투다: "다툼",
};

const ENGY_MAP = {
  보충병력: "군대",
  병력: "군대",
};

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
function loRo(w) {
  const ch = String(w).replace(/[^가-힣]/g, "").slice(-1);
  if (!ch) return "로";
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return "로";
  const jong = code % 28;
  return jong === 0 || jong === 8 ? "로" : "으로";
}
function ieya(w) {
  return hasBatchim(w) ? "이에요" : "예요";
}

/** 명사 종결 vs 문장·꾸밈말 */
function isSentenceOrModifier(nm) {
  const x = String(nm || "").trim();
  if (!x) return false;
  if (/다$/.test(x)) return true; // …하다 / …다
  if (/다,\s*|다·/.test(x)) return true;
  if (/(?:은|는|이|가|을|를|의|로|으로|와|과)\s/.test(x) && /다$|다\b/.test(x))
    return true;
  // 꾸밈말: 털이 많은, 여호와께서 주신, …
  if (
    /(?:은|는|이|가|을|를)\s/.test(x) ||
    /께서\s/.test(x) ||
    /(?:많은|한|인|된|은|는)$/.test(x) ||
    /다가$|는다$|니다$/.test(x)
  )
    return true;
  if (/\s/.test(x) && !/^[가-힣]+(?:·[가-힣]+)?$/.test(x)) {
    // 공백 있는 짧은 명사구(평화의 아버지)는 명사 취급
    if (/(?:의|과|와)\s*[가-힣]+$/.test(x) && !/(?:다|많은|한|인)$/.test(x))
      return false;
    if (/(?:많은|한|인|된)$/.test(x)) return true;
  }
  return false;
}

function nameMeaningLine(nm, soft = false) {
  const x = String(nm || "").trim();
  if (!x) return "이름 뜻은 확실하지 않아요.";
  if (soft) return `이름 뜻은 「${x}」로 보기도 해요.`;
  if (isSentenceOrModifier(x)) return `이름 뜻은 「${x}」라는 뜻이에요.`;
  return `이름 뜻은 「${x}」${ieya(x)}.`;
}

function replaceNameLine(def, nm, soft = false) {
  const line = nameMeaningLine(nm, soft);
  if (/이름 뜻은/.test(def || "")) {
    return String(def)
      .replace(/이름 뜻은[^]*?(?=\.|$)/u, line.replace(/\.$/, ""))
      .replace(/이름 뜻은[^.]*(?:\.|$)/u, `${line}`)
      .replace(/\.\s*\./g, ".")
      .trim();
  }
  return `${String(def || "").trim()} ${line}`.trim();
}

function formatDefFromGlosses(glosses, kind = "noun") {
  const g = [...new Set(glosses.map((x) => String(x).replace(/^~/, "")).filter(Boolean))];
  if (!g.length) return "";
  if (g.length === 1) {
    const x = g[0];
    if (kind === "verb") return `${x}${eunNeun(x)} 것을 말해요.`;
    if (kind === "adj") return `${x} 것을 말해요.`;
    return `${x}${eulUl(x)} 말해요.`;
  }
  return `주로 ${g[0]}${eulUl(g[0])} 말하고, ${g[1]}${loRo(g[1])}도 옮겨져요.`;
}

function parentGloss(id, notes, metaMap) {
  const hid = normH(id);
  if (notes[hid]?.nameMeaning) return notes[hid].nameMeaning;
  const tan = lookupTanakh(hid);
  if (tan?.gloss && !/사람$/.test(tan.gloss)) return String(tan.gloss).replace(/^~/, "");
  const m = metaMap.get(hid);
  return (
    translateNameGloss(m?.nameEtymEn || extractNameEtymEn(m?.sourceText || "") || "") ||
    deriveNameMeaningKo(m) ||
    (tan?.gloss ? String(tan.gloss).replace(/^~/, "") : "") ||
    ""
  );
}

function verbishToSense(nm) {
  const raw = String(nm || "").trim();
  if (VERB_TO_NOUN[raw]) return VERB_TO_NOUN[raw];
  // A, B 형태
  if (/,/.test(raw)) {
    const parts = raw.split(/\s*,\s*/).map((p) => verbishToSense(p) || p);
    if (parts.every((p) => p && !/다$/.test(p))) return parts.join(", ");
    return ""; // 외래·불통 → 확실하지 않아요
  }
  // 여호와께서 …하신다/신 → 유지(문장형)
  if (/여호와께서|하나님(?:이|은|의)|께서/.test(raw)) return raw;
  if (/다$/.test(raw)) {
    // …하다 → …함 / 어간
    if (raw.endsWith("하다")) return raw.slice(0, -2);
    if (raw.endsWith("되다")) return raw.slice(0, -2) + "됨";
    if (raw.endsWith("가다")) return raw.slice(0, -2) + "감";
    if (raw.endsWith("오다")) return raw.slice(0, -2) + "옴";
    // 단음절 어간 동사: 듣다→들음 등은 맵에 없으면 서술형 유지해 「라는 뜻」으로
    return raw;
  }
  return raw;
}

function combineParents(pa, pb, etymEn) {
  const en = String(etymEn || "").trim();
  if (en) {
    const ko =
      translateNameGloss(en) ||
      (() => {
        // lightweight patterns
        let m;
        if ((m = en.match(/^(.+?)\s+of\s+(?:Jah|Jehovah)$/i))) {
          const a = translateNameGloss(m[1]) || parentNoun(m[1]);
          if (a) return `여호와의 ${a}`;
        }
        if ((m = en.match(/^(.+?)\s+of\s+God$/i))) {
          const a = translateNameGloss(m[1]) || parentNoun(m[1]);
          if (a) return `하나님의 ${a}`;
        }
        if ((m = en.match(/^God\s*\((?:is(?: the)?)?\)\s*(.+)$/i))) {
          const a = translateNameGloss(m[1]) || parentNoun(m[1]);
          if (a) return `하나님은 ${a}`;
        }
        if ((m = en.match(/^God of\s+(.+)$/i))) {
          const a = translateNameGloss(m[1]) || parentNoun(m[1]);
          if (a) return `${a}의 하나님`;
        }
        if ((m = en.match(/^village of\s+(?:\(the\)\s*)?(.+)$/i))) {
          const a = translateNameGloss(m[1]) || parentNoun(m[1]) || "여우";
          return `${a}의 마을`;
        }
        if ((m = en.match(/^fountain of\s+(?:a\s+)?(.+)$/i))) {
          const a = translateNameGloss(m[1]) || parentNoun(m[1]);
          if (a) return `${a}의 샘`;
        }
        if ((m = en.match(/^brother of\s+(.+)$/i))) {
          const a = translateNameGloss(m[1]) || parentNoun(m[1]);
          if (a) return `${a}의 형제`;
        }
        if ((m = en.match(/^man of\s+(?:a\s+)?(.+)$/i))) {
          const a = translateNameGloss(m[1]) || parentNoun(m[1]);
          if (a) return `${a}의 사람`;
        }
        if ((m = en.match(/^meadow of\s+(.+)$/i))) {
          const a = translateNameGloss(m[1]) || parentNoun(m[1]);
          if (a) return `${a}의 초원`;
        }
        if ((m = en.match(/^father-in-law of\s+(.+)$/i))) {
          const a = translateNameGloss(m[1]) || parentNoun(m[1]);
          if (a) return `${a}의 장인`;
        }
        if ((m = en.match(/^fortress of\s+(.+)$/i))) {
          const a = translateNameGloss(m[1]) || parentNoun(m[1]);
          if (a) return `${a}의 요새`;
        }
        if ((m = en.match(/^beheld of God$/i))) return "하나님이 보신";
        if ((m = en.match(/^mouth of the gorges$/i))) return "골짜기들의 입";
        if ((m = en.match(/^consolation of Jah$/i))) return "여호와의 위로";
        return "";
      })();
    if (ko) return ko;
  }
  const a = tidyParent(pa);
  const b = tidyParent(pb);
  if (!a || !b) return "";
  if (a === "하나님" || a === "여호와") return `${b}의 ${a}`.replace(/다의/, "의");
  if (b === "하나님" || b === "여호와" || b.includes("영원")) {
    const bb = b.includes("영원") ? "여호와" : b;
    return `${a}의 ${bb}`.replace(/하다의|다의/, "의");
  }
  return `${a}와 ${b}`;
}

function parentNoun(en) {
  const map = {
    giver: "주시는 이",
    gatherer: "모으는 이",
    treasure: "보배",
    fox: "여우",
    traveller: "나그네",
    dart: "창",
    dancing: "춤",
    dew: "이슬",
    wrong: "악",
    earthenware: "질그릇",
    consolation: "위로",
  };
  return map[String(en || "").toLowerCase().trim()] || "";
}

function tidyParent(g) {
  let x = String(g || "").trim();
  if (!x) return "";
  if (VERB_TO_NOUN[x]) return VERB_TO_NOUN[x];
  if (x.endsWith("하다")) return x.slice(0, -2);
  if (/스스로 계신|영원하신/.test(x)) return "여호와";
  return x;
}

function rebuildEtymKo(strong, meta, notes) {
  const src = meta?.sourceText || "";
  const root = meta?.rootStrong || "";
  const roots = meta?.rootStrongs || [];
  const top = `${strong}은`;
  if (roots.length >= 2) {
    const parts = roots.slice(0, 3).map((r) => {
      const gloss = notes[normH(r)]?.nameMeaning || lookupTanakh(normH(r))?.gloss || "";
      return gloss ? `${normH(r)} 「${String(gloss).replace(/^~/, "")}」` : normH(r);
    });
    return `${top} ${parts.join("·")}을 이은 이름이에요.`;
  }
  if (root) {
    const gloss =
      notes[normH(root)]?.nameMeaning ||
      lookupTanakh(normH(root))?.gloss ||
      "";
    if (gloss) return `${top} ${normH(root)} 「${String(gloss).replace(/^~/, "")}」에서 이어진 표기예요.`;
    return `${top} ${normH(root)}에서 이어진 표기예요.`;
  }
  if (/primitive root/i.test(src)) {
    return `${top} 더 나눌 뿌리 없이 원시 어근으로 적혀 있어요.`;
  }
  if (/of uncertain|foreign|persian|egyptian/i.test(src)) {
    return `${top} 어원 단서가 짧거나 불확실해요.`;
  }
  return `${top} 어원 단서가 짧게만 적혀 있어요.`;
}

function syncLex(strong, note, extra = {}) {
  const p = path.join(LEX, `${strong}.json`);
  if (!fs.existsSync(p)) return;
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  Object.assign(j, {
    defKo: note.defKo || "",
    etymKo: note.etymKo ?? j.etymKo ?? "",
    usageKo: note.usageKo ?? j.usageKo ?? "",
    noteSrc: note.noteSrc || j.noteSrc || "",
    ...extra,
  });
  if (note.nameMeaning) j.nameMeaning = note.nameMeaning;
  else j.nameMeaning = "";
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
}

function main() {
  console.log("[r6] load…");
  const notes = JSON.parse(fs.readFileSync(NOTES, "utf8"));
  const metaMap = loadStrongMeta();

  const beforeSnap = {
    H6215: notes.H6215?.defKo,
    H7346: notes.H7346?.defKo,
    H804: notes.H804?.defKo,
    H102: notes.H102?.defKo,
    H5553: { def: notes.H5553?.defKo, etym: notes.H5553?.etymKo },
    H348: notes.H348?.defKo,
    H494: notes.H494?.defKo,
    H5166: notes.H5166?.defKo,
    H2705: notes.H2705?.defKo,
    H3063: notes.H3063?.defKo,
  };

  // ----- counts before -----
  let endingNeedFix = 0;
  let verbInfBefore = 0;
  let brokenEtymBefore = 0;
  let defColonBefore = 0;
  let defTtBefore = 0; // 라는 뜻으로 쓰여요
  let engBefore = 0;

  for (const [k, v] of Object.entries(notes)) {
    if (!/^H\d+$/.test(k)) continue;
    const def = v.defKo || "";
    const etym = v.etymKo || "";
    const m = def.match(/이름 뜻은 「([^」]+)」([^「\n]*)/);
    if (m) {
      const nm = m[1];
      const tail = m[2];
      const wantSentence = isSentenceOrModifier(nm);
      const hasSentenceTail = /라는 뜻/.test(tail);
      const hasNounTail = /예요|이에요/.test(tail) && !hasSentenceTail;
      if (wantSentence && !hasSentenceTail) endingNeedFix += 1;
      if (!wantSentence && hasSentenceTail) endingNeedFix += 1;
      if (/(?:^|, |·)[가-힣]*다(?:$|,|·)/.test(nm) || /다,/.test(nm) || /다$/.test(nm)) {
        // pure verb infinitive (not …께서 …신다 narrative already sentence)
        if (!/께서|하나님이 |하나님은 |백성이 /.test(nm) || /다$/.test(nm)) {
          if (/다$/.test(nm) || /다,/.test(nm)) verbInfBefore += 1;
        }
      }
    }
    if (/Strong에 짧게 남아|Strong에 짝게 남아|Strong에서 원시 어근으로 적혀/.test(etym)) {
      brokenEtymBefore += 1;
    }
    if (/(?:^|\n)뜻:\s/.test(def) || /^뜻:\s/.test(def.trim())) defColonBefore += 1;
    if (/라는 뜻으로 쓰여요/.test(def)) defTtBefore += 1;
    for (const w of Object.keys(ENGY_MAP)) {
      if (def.includes(w) || (v.usageKo || "").includes(w)) {
        engBefore += 1;
        break;
      }
    }
  }

  // compound before list
  const compoundBefore = [];
  for (const [k, v] of Object.entries(notes)) {
    if (!/^H\d+$/.test(k)) continue;
    if (!/확실하지 않아요/.test(v.defKo || "")) continue;
    const src = metaMap.get(k)?.sourceText || "";
    if (FOREIGN_RE.test(src)) continue;
    const m = src.match(/from\s+(\d+)\s+and\s+(?:[^\d;]{0,60})?(\d+)/i);
    if (!m) continue;
    compoundBefore.push({
      strong: k,
      a: m[1],
      b: m[2],
      defKo: v.defKo,
      etym: extractNameEtymEn(src) || "",
    });
  }

  let endingFixed = 0;
  let verbFixed = 0;
  let verbToUncertain = 0;
  let compoundFilled = 0;
  let brokenEtymFixed = 0;
  let defColonFixed = 0;
  let defTtFixed = 0;
  let engFixed = 0;
  const compoundSamples = [];
  const samples = [];

  // ----- 2+1: verb infinitives & ending format (all name meanings) -----
  for (const [k, v] of Object.entries(notes)) {
    if (!/^H\d+$/.test(k)) continue;
    if (!/이름 뜻은/.test(v.defKo || "")) continue;
    const meta = metaMap.get(k);
    const soft = /로 보기도 해요/.test(v.defKo || "");
    let nm = v.nameMeaning || "";
    const m = (v.defKo || "").match(/이름 뜻은 「([^」]+)」/);
    if (!nm && m) nm = m[1];
    if (!nm) continue;

    const beforeNm = nm;
    const beforeDef = v.defKo;

    // H804 / foreign-ish verb roots as name → uncertain
    if (k === "H804" || (FOREIGN_RE.test(meta?.sourceText || "") && /다$/.test(nm))) {
      nm = "";
      verbToUncertain += 1;
    } else if (/다$/.test(nm) || /다,/.test(nm)) {
      // keep narrative sentences like 여호와께서 세우신다
      if (/께서|백성이 |하나님이 |하나님은 |누가 /.test(nm) && !/,/.test(nm)) {
        // sentence form OK
      } else {
        const converted = verbishToSense(nm);
        if (!converted || (converted === nm && /다$/.test(nm) && !/께서|백성이 |하나님/.test(nm))) {
          // single verb lemma used as PN meaning — convert to noun-ish or uncertain
          if (VERB_TO_NOUN[nm]) {
            nm = VERB_TO_NOUN[nm];
            verbFixed += 1;
          } else if (nm.endsWith("하다")) {
            nm = nm.slice(0, -2);
            verbFixed += 1;
          } else if (/다$/.test(nm) && nm.length <= 4) {
            // 듣다/잊다 등 — 「들음」류 실패 시 서술 유지하되 라는 뜻으로
            verbFixed += 1; // counted as format fix via ending
          } else if (/다,/.test(nm)) {
            nm = "";
            verbToUncertain += 1;
          } else {
            verbFixed += 1;
          }
        } else if (converted !== nm) {
          nm = converted;
          verbFixed += 1;
        }
      }
    }

    // special cases
    if (k === "H6215") nm = "털이 많은 이";
    if (k === "H7346") nm = "백성이 넓어진다";

    let nextDef;
    if (!nm) {
      nextDef = replaceNameLine(v.defKo, "", false).replace(/이름 뜻은 「」[^.]*/g, "이름 뜻은 확실하지 않아요");
      nextDef = String(v.defKo || "")
        .replace(/이름 뜻은[^.]*(?:\.|$)/u, "이름 뜻은 확실하지 않아요.")
        .replace(/\s+/g, " ")
        .trim();
      delete v.nameMeaning;
    } else {
      const wantSoft = soft && nm === beforeNm;
      nextDef = String(v.defKo || "")
        .replace(/이름 뜻은[^.]*(?:\.|$)/u, nameMeaningLine(nm, wantSoft))
        .replace(/\s+/g, " ")
        .trim();
      v.nameMeaning = nm;
      if (beforeNm !== nm || beforeDef !== nextDef) {
        if (isSentenceOrModifier(nm) || isSentenceOrModifier(beforeNm)) endingFixed += 1;
        else if (nameMeaningLine(beforeNm) !== nameMeaningLine(nm) || !/라는 뜻|예요|이에요/.test(beforeDef))
          endingFixed += 1;
      }
      // count ending style corrections even when nm unchanged
      const prevTailSentence = /라는 뜻/.test(beforeDef);
      const nowSentence = isSentenceOrModifier(nm);
      if (nowSentence !== prevTailSentence || (nowSentence && !prevTailSentence)) {
        // already in endingFixed potentially
      }
    }

    // ensure ending style count for sentence forms that still had 예요
    if (nm && isSentenceOrModifier(nm) && /이름 뜻은 「[^」]+」(예요|이에요)/.test(beforeDef)) {
      // fixed by rewrite
    }

    v.defKo = nextDef;
    notes[k] = v;
    syncLex(k, v, { posKo: "고유명사" });
  }

  // recount endingFixed properly: re-pass for any still wrong
  endingFixed = 0;
  for (const [k, v] of Object.entries(notes)) {
    if (!/^H\d+$/.test(k)) continue;
    const m = (v.defKo || "").match(/이름 뜻은 「([^」]+)」([^「\n.]*)/);
    if (!m) continue;
    const nm = m[1];
    const tail = m[2];
    const want = isSentenceOrModifier(nm);
    const has = /라는 뜻/.test(tail);
    if (want && !has) {
      v.defKo = String(v.defKo)
        .replace(/이름 뜻은[^.]*(?:\.|$)/u, nameMeaningLine(nm, /보기도/.test(tail)))
        .replace(/\s+/g, " ")
        .trim();
      notes[k] = v;
      syncLex(k, v);
      endingFixed += 1;
    } else if (!want && has && !/보기도/.test(tail)) {
      v.defKo = String(v.defKo)
        .replace(/이름 뜻은[^.]*(?:\.|$)/u, nameMeaningLine(nm, false))
        .replace(/\s+/g, " ")
        .trim();
      notes[k] = v;
      syncLex(k, v);
      endingFixed += 1;
    }
  }

  // force examples
  for (const [id, nm] of [
    ["H6215", "털이 많은 이"],
    ["H7346", "백성이 넓어진다"],
  ]) {
    const v = notes[id];
    if (!v) continue;
    v.nameMeaning = nm;
    v.defKo = String(v.defKo || "")
      .replace(/이름 뜻은[^.]*(?:\.|$)/u, nameMeaningLine(nm))
      .replace(/\s+/g, " ")
      .trim();
    notes[id] = v;
    syncLex(id, v, { posKo: "고유명사" });
  }
  // H804 uncertain
  {
    const v = notes.H804 || {};
    v.defKo = String(v.defKo || "")
      .replace(/이름 뜻은[^.]*(?:\.|$)/u, "이름 뜻은 확실하지 않아요.")
      .replace(/\s+/g, " ")
      .trim();
    delete v.nameMeaning;
    notes.H804 = v;
    syncLex("H804", v, { nameMeaning: "", posKo: "고유명사" });
  }

  // ----- 3: compound from N+M -----
  for (const row of compoundBefore) {
    const k = row.strong;
    const meta = metaMap.get(k);
    const src = meta?.sourceText || "";
    const pa = parentGloss(row.a, notes, metaMap);
    const pb = parentGloss(row.b, notes, metaMap);
    const etym = extractNameEtymEn(src) || row.etym || "";
    let nm = combineParents(pa, pb, etym);
    if (!nm) continue;
    // verbish clean
    if (/다$/.test(nm) && !/께서|하나님|백성이|누가 /.test(nm)) {
      nm = verbishToSense(nm) || nm;
    }
    if (/[A-Za-z]{3,}/.test(nm)) continue;
    const prev = notes[k] || {};
    const soft = /apparently|probably|perhaps/i.test(src);
    const nextDef = String(prev.defKo || "")
      .replace(/이름 뜻은[^.]*(?:\.|$)/u, nameMeaningLine(nm, soft))
      .replace(/\s+/g, " ")
      .trim();
    notes[k] = { ...prev, defKo: nextDef, nameMeaning: nm, usageKo: "", noteSrc: prev.noteSrc || "auto" };
    syncLex(k, notes[k], { posKo: "고유명사" });
    compoundFilled += 1;
    if (compoundSamples.length < 5) {
      compoundSamples.push({
        strong: k,
        before: row.defKo,
        after: nextDef,
        from: `H${row.a}+H${row.b}`,
        parents: `${pa} + ${pb}`,
        nameMeaning: nm,
      });
    }
  }

  // ----- 4: broken etym + 뜻: / 라는 뜻으로 -----
  for (const [k, v] of Object.entries(notes)) {
    if (!/^H\d+$/.test(k)) continue;
    const meta = metaMap.get(k);
    let changed = false;
    if (/Strong에 짧게 남아|Strong에 짝게 남아|Strong에서 원시 어근으로 적혀/.test(v.etymKo || "")) {
      v.etymKo = rebuildEtymKo(k, meta, notes);
      brokenEtymFixed += 1;
      changed = true;
    }
    if (/(?:^|\n)뜻:\s/.test(v.defKo || "") || /^뜻:\s/.test((v.defKo || "").trim())) {
      const meanings = String(v.defKo)
        .replace(/^뜻:\s*/, "")
        .split(/[,，]/)
        .map((x) => x.trim())
        .filter(Boolean);
      v.defKo = formatDefFromGlosses(meanings.slice(0, 3), "noun");
      v.usageKo = meanings.slice(0, 3).join(", ");
      defColonFixed += 1;
      changed = true;
    }
    if (/라는 뜻으로 쓰여요/.test(v.defKo || "")) {
      const mm = v.defKo.match(/^(.+?)라는 뜻으로 쓰여요/);
      const word = mm ? mm[1].trim() : (v.usageKo || "").split(/[,，]/)[0]?.trim();
      if (word) {
        v.defKo = formatDefFromGlosses([word], /사람$/.test(word) ? "noun" : "noun");
        if (!v.usageKo) v.usageKo = word;
        defTtFixed += 1;
        changed = true;
      }
    }
    if (changed) {
      notes[k] = v;
      syncLex(k, v);
    }
  }

  // H5553 ensure
  {
    const v = notes.H5553 || {};
    v.defKo = "주로 바위를 말하고, 반석으로도 옮겨져요.";
    v.usageKo = "바위, 반석";
    v.etymKo = rebuildEtymKo("H5553", metaMap.get("H5553"), notes);
    delete v.nameMeaning;
    notes.H5553 = v;
    syncLex("H5553", v, { nameMeaning: "", posKo: "명사" });
  }

  // ----- 5: Englishy -----
  for (const [k, v] of Object.entries(notes)) {
    if (!/^H\d+$/.test(k)) continue;
    let def = v.defKo || "";
    let usage = v.usageKo || "";
    let hit = false;
    for (const [bad, good] of Object.entries(ENGY_MAP)) {
      if (def.includes(bad) || usage.includes(bad)) {
        def = def.split(bad).join(good);
        usage = usage.split(bad).join(good);
        hit = true;
      }
    }
    if (k === "H102") {
      def = "군대를 말해요.";
      usage = "군대";
      hit = true;
    }
    if (hit) {
      v.defKo = def;
      v.usageKo = usage;
      notes[k] = v;
      syncLex(k, v);
      engFixed += 1;
    }
  }

  // after counts
  let brokenEtymAfter = 0;
  let defColonAfter = 0;
  let defTtAfter = 0;
  let verbInfAfter = 0;
  let endingBadAfter = 0;
  let engAfter = 0;
  let compoundUncertainAfter = 0;
  for (const [k, v] of Object.entries(notes)) {
    if (!/^H\d+$/.test(k)) continue;
    if (/Strong에 짧게 남아|Strong에 짝게 남아|Strong에서 원시 어근으로 적혀/.test(v.etymKo || ""))
      brokenEtymAfter += 1;
    if (/(?:^|\n)뜻:\s/.test(v.defKo || "") || /^뜻:\s/.test((v.defKo || "").trim()))
      defColonAfter += 1;
    if (/라는 뜻으로 쓰여요/.test(v.defKo || "")) defTtAfter += 1;
    const m = (v.defKo || "").match(/이름 뜻은 「([^」]+)」([^「\n.]*)/);
    if (m) {
      const nm = m[1];
      const tail = m[2];
      if (isSentenceOrModifier(nm) !== /라는 뜻/.test(tail) && !/보기도/.test(tail))
        endingBadAfter += 1;
      if ((/다$/.test(nm) || /다,/.test(nm)) && !/께서|백성이 |하나님이 |하나님은 |누가 /.test(nm))
        verbInfAfter += 1;
    }
    for (const w of Object.keys(ENGY_MAP)) {
      if ((v.defKo || "").includes(w) || (v.usageKo || "").includes(w)) {
        engAfter += 1;
        break;
      }
    }
    if (/확실하지 않아요/.test(v.defKo || "")) {
      const src = metaMap.get(k)?.sourceText || "";
      if (!FOREIGN_RE.test(src) && /from\s+\d+\s+and\s+/i.test(src))
        compoundUncertainAfter += 1;
    }
  }

  fs.writeFileSync(NOTES, JSON.stringify(notes, null, 2) + "\n");

  const sampleIds = [
    "H6215",
    "H7346",
    "H804",
    "H102",
    "H5553",
    "H348",
    "H494",
    "H5166",
    "H2705",
    "H3063",
  ];
  const samples10 = sampleIds.map((id) => {
    const n = notes[id] || {};
    return {
      strong: id,
      before:
        typeof beforeSnap[id] === "object"
          ? `def:${beforeSnap[id].def} | etym:${beforeSnap[id].etym}`
          : beforeSnap[id] || "",
      after:
        id === "H5553"
          ? `def:${n.defKo} | etym:${n.etymKo}`
          : n.defKo || "",
      nameMeaning: n.nameMeaning || "",
    };
  });

  const report = {
    "1_ending": {
      needFixBefore: endingNeedFix,
      fixed: endingFixed,
      badAfter: endingBadAfter,
      rule: "명사→예요/이에요 / 문장·꾸밈말→라는 뜻이에요",
    },
    "2_verbInf": {
      before: verbInfBefore,
      fixedToSense: verbFixed,
      toUncertain: verbToUncertain,
      afterBareVerb: verbInfAfter,
      H804: notes.H804?.defKo,
    },
    "3_compound": {
      before: compoundBefore.length,
      filled: compoundFilled,
      uncertainAfter: compoundUncertainAfter,
      samples5: compoundSamples,
    },
    "4_broken": {
      etymBrokenBefore: brokenEtymBefore,
      etymBrokenAfter: brokenEtymAfter,
      etymFixed: brokenEtymFixed,
      defColonBefore,
      defColonAfter,
      defColonFixed,
      defTturoBefore: defTtBefore,
      defTturoAfter: defTtAfter,
      defTturoFixed: defTtFixed,
      note: "「뜻:」 리터럴은 이미 0. 같은 계열 「X라는 뜻으로 쓰여요」도 「말해요」로 정리. 어원 Strong에 짧게/원시어근 틀 교체.",
    },
    "5_engy": {
      before: engBefore,
      fixed: engFixed,
      after: engAfter,
      H102: notes.H102?.defKo,
    },
    samples10,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}

main();
