#!/usr/bin/env node
/**
 * 품사 되돌리기 + defKo 문장 정리 + 고유명사 신원 + krvKo 옛활용
 * 범위: scripts/, public/word-study/, data/
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const OUT = path.join(root, "public", "word-study");
const LEX = path.join(OUT, "lexicon", "greek");
const BD = path.join(root, "public", "bible-data");
const REPORT = path.join(OUT, "_greek-pos-defko-names-report.json");

const NT = [
  "matthew", "mark", "luke", "john", "acts",
  "romans", "corinthians1", "corinthians2", "galatians", "ephesians",
  "philippians", "colossians", "thessalonians1", "thessalonians2",
  "timothy1", "timothy2", "titus", "philemon", "hebrews",
  "james", "peter1", "peter2", "john1", "john2", "john3", "jude", "revelation",
];
const BOOK_KO = {
  matthew: "마", mark: "막", luke: "눅", john: "요", acts: "행",
  romans: "롬", corinthians1: "고전", corinthians2: "고후", galatians: "갈",
  ephesians: "엡", philippians: "빌", colossians: "골", thessalonians1: "살전",
  thessalonians2: "살후", timothy1: "딤전", timothy2: "딤후", titus: "딛",
  philemon: "몬", hebrews: "히", james: "약", peter1: "벧전", peter2: "벧후",
  john1: "요일", john2: "요이", john3: "요삼", jude: "유", revelation: "계",
};

const NEG_ASCII = new Set(["ου", "μη", "ουκ", "ουχ", "ουχι", "μητε", "μηδε", "ουδε", "ουτε"]);
const PARTICLE_ASCII = new Set(["αν"]);

/** 수동 신원·뜻 보강 */
const NAME_IDENTITY = {
  G2037: "에라스도는 고린도 성의 재무관이며 바울의 동역자예요(롬 16:23; 딤후 4:20).",
  G2131: "유니게는 디모데의 어머니예요(딤후 1:5).",
  G3526: "니게르는 안디옥 교회의 교사·선지자 가운데 한 사람으로 나와요(행 13:1).",
  G2404: "히에라볼리(히에라폴리스)는 소아시아의 성읍으로, 골로새·라오디게아와 함께 나와요(골 4:13).",
};
const NAME_MEANING_FIX = {
  G2131: "좋은 승리",
};

/** 동사·애매 낱말 목적어 보강 */
const DEF_OVERRIDES = {
  G1001: {
    body: "물 깊이를 재는 것을 말해요",
  },
  G1006: {
    body: "가축을 먹이고 돌보는 것을 말해요",
  },
  G4906: {
    body: "함께 먹는 것, 곧 식탁을 같이하는 일을 말해요",
  },
  G1024: {
    body: "짧은 시간을 말해요",
  },
  G102: {
    body: "불가능한 것을 말해요",
  },
  G101: {
    body: "불가능하게 하는 것을 말해요",
  },
  G506: {
    body: "복종하지 않는 것을 말해요",
  },
};

function stripAcc(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ς/g, "σ")
    .toLowerCase();
}
function hasBatchim(word) {
  const ch = String(word || "").replace(/\s+/g, "").replace(/[「」『』"'"]/g, "").slice(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}
function eunNeun(w) { return hasBatchim(w) ? "은" : "는"; }
function eulReul(w) { return hasBatchim(w) ? "을" : "를"; }
function iGa(w) { return hasBatchim(w) ? "이" : "가"; }
function gwaWa(w) { return hasBatchim(w) ? "과" : "와"; }
function euroRo(w) { return hasBatchim(w) ? "으로" : "로"; }
function iraneunRaneun(w) { return hasBatchim(w) ? "이라는" : "라는"; }
function ensurePeriod(s) {
  const t = String(s || "").trim();
  if (!t) return t;
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}
function normalizeKo(s) {
  return String(s || "").replace(/\s+/g, "").replace(/[.,;:!?·"'“”‘’()[\]{}「」『』]/g, "");
}
function majority(map) {
  if (!map?.size) return "";
  return [...map.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function verbPhrase(gloss) {
  const x = String(gloss || "").trim() || "이 동작";
  if (x.endsWith("하다")) return `${x.slice(0, -2)}하는`;
  if (x.endsWith("되다")) return `${x.slice(0, -2)}되는`;
  if (x.endsWith("시키다")) return `${x.slice(0, -3)}시키는`;
  if (x.endsWith("없다")) return `${x.slice(0, -2)}없는`;
  if (x.endsWith("다")) return `${x.slice(0, -1)}는`;
  return `${x}하는`;
}

function fixParticlesInText(text) {
  let t = String(text || "");
  let n = 0;
  // 「X」라는/이라는 뜻
  t = t.replace(/「([^」]+)」(이?라는) 뜻/g, (_, w, part) => {
    const want = iraneunRaneun(w);
    if (part !== want) n += 1;
    return `「${w}」${want} 뜻`;
  });
  // 「X」라는/이라는 쪽
  t = t.replace(/「([^」]+)」(이?라는) 쪽/g, (_, w, part) => {
    const want = iraneunRaneun(w);
    if (part !== want) n += 1;
    return `「${w}」${want} 쪽`;
  });
  // X을/를 말해요
  t = t.replace(/([가-힣0-9]+)(을|를) 말해요/g, (_, w, p) => {
    const want = eulReul(w);
    if (p !== want) n += 1;
    return `${w}${want} 말해요`;
  });
  // 짧은 고유명사 조사 은/는 (이름 주어)
  t = t.replace(/(^|[.。]\s*)([가-힣]{2,12})(은|는) /g, (full, pre, w, p) => {
    const want = eunNeun(w);
    if (p !== want) n += 1;
    return `${pre}${w}${want} `;
  });
  return { text: t, n };
}

function countParticleErrors(text) {
  let n = 0;
  const t = String(text || "");
  for (const m of t.matchAll(/「([^」]+)」(이?라는) 뜻/g)) {
    if (`「${m[1]}」${iraneunRaneun(m[1])} 뜻` !== m[0]) n += 1;
  }
  for (const m of t.matchAll(/([가-힣A-Za-z0-9)」』]+)(을|를) 말해요/g)) {
    const core = m[1].replace(/[「」『』]/g, "");
    if (eulReul(core) !== m[2]) n += 1;
  }
  // 승리하는」라는 (should be 이라는 if batchim - 하는 has no batchim → 라는 OK)
  // 「승리하는」라는 — 하는 ends with 는 no batchim → 라는 correct
  // 「좋은 승리」라는 — 리 has no batchim? 리 = ㄹ batchim → 이라는
  return n;
}

function extractCiteWindow(krv, needle, maxLen = 70) {
  const text = String(krv || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const n = String(needle || "").trim();
  let idx = -1;
  if (n) {
    idx = text.indexOf(n);
    if (idx < 0) {
      const stem = n.replace(/(하다|되다|다)$/, "");
      if (stem.length >= 2) idx = text.indexOf(stem);
    }
  }
  if (idx < 0) {
    // fallback: start
    return text.length <= maxLen ? text : `${text.slice(0, maxLen - 1)}…`;
  }
  const half = Math.floor((maxLen - n.length) / 2);
  let start = Math.max(0, idx - Math.max(8, half));
  let end = Math.min(text.length, idx + n.length + Math.max(8, half));
  // snap to spaces
  if (start > 0) {
    const sp = text.lastIndexOf(" ", start);
    if (sp > start - 12) start = sp + 1;
  }
  if (end < text.length) {
    const sp = text.indexOf(" ", end);
    if (sp > 0 && sp < end + 12) end = sp;
  }
  // ensure needle inside
  if (start > idx) start = idx;
  if (end < idx + n.length) end = Math.min(text.length, idx + n.length);
  let slice = text.slice(start, end);
  if (start > 0) slice = `…${slice}`;
  if (end < text.length) slice = `${slice}…`;
  // never cut the needle itself
  if (n && !slice.includes(n) && !slice.includes(n.replace(/(하다|다)$/, ""))) {
    slice = text.slice(Math.max(0, idx - 10), Math.min(text.length, idx + n.length + 20));
    if (idx - 10 > 0) slice = `…${slice}`;
    if (idx + n.length + 20 < text.length) slice = `${slice}…`;
  }
  return slice;
}

function isNameOnlyDef(def) {
  const t = String(def || "").trim();
  return (
    /^이름 뜻은 확실하지 않아요\.\s*처음 나오는 곳:[^.]+?\.$/.test(t) ||
    /^[^.]+[은는] 「[^」]+」이?라는 뜻의 이름이에요\.\s*처음 나오는 곳:[^.]+?\.$/.test(t) ||
    /^이름 뜻은 「[^」]+」이?예요\.\s*처음 나오는 곳:[^.]+?\.$/.test(t) ||
    /^처음 나오는 곳:[^.]+?\.$/.test(t)
  );
}

function loadHits() {
  /** @type {Map<string, {book:string,ch:number,n:number,krv:string,gloss:string,word:string}[]>} */
  const hits = new Map();
  const glossMaj = new Map();
  for (const book of NT) {
    const bd = JSON.parse(fs.readFileSync(path.join(BD, `${book}.json`), "utf8"));
    const dir = path.join(OUT, book);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const chN = Number(f.replace(".json", ""));
      const ch = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      const krvMap = new Map((bd.chapters?.[chN - 1]?.verses?.krv || []).map((x) => [x.n, x.t || ""]));
      for (const v of ch.verses || []) {
        const krv = krvMap.get(v.n) || "";
        for (const w of v.words || []) {
          if (!w.strong) continue;
          if (!hits.has(w.strong)) hits.set(w.strong, []);
          if (hits.get(w.strong).length < 5) {
            hits.get(w.strong).push({
              book, ch: chN, n: v.n, krv, gloss: w.glossKo || "", word: w.word || "",
            });
          }
          if (w.glossKo) {
            if (!glossMaj.has(w.strong)) glossMaj.set(w.strong, new Map());
            const m = glossMaj.get(w.strong);
            m.set(w.glossKo, (m.get(w.glossKo) || 0) + 1);
          }
        }
      }
    }
  }
  return { hits, glossMaj };
}

function refOf(h) {
  return `${BOOK_KO[h.book]} ${h.ch}:${h.n}`;
}

function main() {
  const { hits, glossMaj } = loadHits();

  // ========== 1) POS revert ==========
  const posBefore = {
    "접속사, 부정어": 0,
    "접속사, 불변화사": 0,
    부정어: 0,
    불변화사: 0,
    "접속사(neg lemma)": 0,
  };
  const posAfter = { 부정어: 0, 불변화사: 0, 부사: 0, 접속사: 0, other: 0 };

  let posChanged = 0;
  for (const book of NT) {
    const dir = path.join(OUT, book);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const fp = path.join(dir, f);
      const ch = JSON.parse(fs.readFileSync(fp, "utf8"));
      let changed = false;
      for (const v of ch.verses || []) {
        for (const w of v.words || []) {
          const a = stripAcc(w.lemma);
          const p = w.parseKo || "";
          if (/^접속사,\s*부정어/.test(p)) posBefore["접속사, 부정어"] += 1;
          if (/^접속사,\s*불변화사/.test(p)) posBefore["접속사, 불변화사"] += 1;
          if (/^부정어/.test(p)) posBefore["부정어"] += 1;
          if (/^불변화사/.test(p)) posBefore["불변화사"] += 1;
          if (NEG_ASCII.has(a) && /^접속사$/.test(p.split(/[,，·]/)[0] || "")) {
            posBefore["접속사(neg lemma)"] += 1;
          }

          if (NEG_ASCII.has(a)) {
            // 부정어 + morph rest (부사 세부 등)
            let rest = "";
            if (/^접속사,\s*부정어/.test(p)) rest = p.replace(/^접속사,\s*부정어/, "");
            else if (/^접속사/.test(p)) rest = p.replace(/^접속사/, "");
            else if (/^부정어/.test(p)) rest = p.replace(/^부정어/, "");
            else if (/^부사/.test(p)) rest = p.replace(/^부사/, "");
            else if (/^소사/.test(p)) rest = p.replace(/^소사/, "");
            const next = `부정어${rest}`;
            if (next !== p) {
              w.parseKo = next;
              posChanged += 1;
              changed = true;
            }
          } else if (PARTICLE_ASCII.has(a)) {
            let rest = "";
            if (/^접속사,\s*불변화사/.test(p)) rest = p.replace(/^접속사,\s*불변화사/, "");
            else if (/^접속사/.test(p)) rest = p.replace(/^접속사/, "");
            else if (/^불변화사/.test(p)) rest = p.replace(/^불변화사/, "");
            else if (/^소사/.test(p)) rest = p.replace(/^소사/, "");
            const next = `불변화사${rest}`;
            if (next !== p) {
              w.parseKo = next;
              posChanged += 1;
              changed = true;
            }
          }
          // content adverbs untouched
        }
      }
      if (changed) fs.writeFileSync(fp, JSON.stringify(ch) + "\n");
    }
  }

  // recount after
  for (const book of NT) {
    const dir = path.join(OUT, book);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const ch = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      for (const v of ch.verses || []) {
        for (const w of v.words || []) {
          const a = stripAcc(w.lemma);
          const p = w.parseKo || "";
          const head = (p.split(/[,，·]/)[0] || "").trim();
          if (NEG_ASCII.has(a) || PARTICLE_ASCII.has(a)) {
            if (head === "부정어") posAfter["부정어"] += 1;
            else if (head === "불변화사") posAfter["불변화사"] += 1;
            else if (head === "부사") posAfter["부사"] += 1;
            else if (head === "접속사") posAfter["접속사"] += 1;
            else posAfter.other += 1;
          }
        }
      }
    }
  }

  // lexicon posKo for neg/particle strongs
  for (const [s, pos] of [["G3756", "부정어"], ["G3361", "부정어"], ["G302", "불변화사"]]) {
    const fp = path.join(LEX, `${s}.json`);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    d.posKo = pos;
    fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
  }

  // G1519 / G1520 lexicon
  {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, "G1519.json"), "utf8"));
    d.posKo = "전치사";
    d.glossKo = "안으로";
    d.krvKo = ["으로", "안으로", "에게"];
    if (!/전치사|안으로|으로/.test(d.defKo || "")) {
      d.defKo =
        "대격과 함께 쓰는 전치사로, '~안으로, ~으로, ~을 향해'처럼 도달·방향을 말해요. 시간·목적·결과로도 확장돼요.";
    }
    fs.writeFileSync(path.join(LEX, "G1519.json"), JSON.stringify(d, null, 2) + "\n");
  }
  {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, "G1520.json"), "utf8"));
    d.posKo = "수사";
    d.glossKo = "하나";
    d.krvKo = ["하나", "한"];
    d.defKo = "하나(수사)를 말해요. 「한 사람」「한 몸」처럼 단일을 강조할 때 써요. 「한 마리」…(마 10:29).";
    // will reformat below in def pass
    fs.writeFileSync(path.join(LEX, "G1520.json"), JSON.stringify(d, null, 2) + "\n");
  }

  // ========== 2) defKo ==========
  const errBefore = {
    verbAssembly: 0,
    ambiguousNoObj: 0,
    citeCutMissingWord: 0,
    multiRef: 0,
    particle: 0,
  };
  const errAfter = { ...errBefore };

  const AMBIGUOUS_VERBS = new Set(["G1006", "G1001", "G1172", "G138", "G4906"]);

  function analyzeDefErrors(def, strong, gloss) {
    const e = { verbAssembly: 0, ambiguousNoObj: 0, citeCutMissingWord: 0, multiRef: 0, particle: 0 };
    const t = def || "";
    if (/동사/.test("") /* filled by caller */) { /* */ }
    if (/^[가-힣()]+는 것을 말해요|^[가-힣()]+하는 것을 말해요/.test(t.replace(/\s*\([^)]*\)\s*/, " "))) {
      e.verbAssembly += 1;
    }
    // 불가능하는 / 수심재는 / 치는 것을 without space object
    if (/말해요/.test(t) && /(치는|재는|취하는|가는) 것을 말해요/.test(t)) e.ambiguousNoObj += 1;
    if (/「[^」]*…」/.test(t)) {
      const m = t.match(/「([^」]+)」/);
      const cite = m?.[1] || "";
      const stem = glossStemSafe(gloss);
      if (stem && !normalizeKo(cite).includes(normalizeKo(stem)) && !cite.includes(stem.slice(0, Math.min(2, stem.length)))) {
        e.citeCutMissingWord += 1;
      } else if (/…/.test(cite) && stem && !cite.includes(stem) && stem.length >= 2) {
        // ellipsis but word present OK
      }
      if (/…/.test(cite) && gloss && !cite.includes(String(gloss).slice(0, 2))) {
        // check key content words for known cases
      }
    }
    // 공회원 missing in G1010
    if (strong === "G1010" && /「/.test(t) && !/공회원/.test(t)) e.citeCutMissingWord += 1;
    const refs = [...t.matchAll(/\(([가-힣]+)\s*\d+:\d+[–\-]?\d*\)/g)];
    if (refs.length >= 2) e.multiRef += 1;
    e.particle += countParticleErrors(t);
    return e;
  }
  function glossStemSafe(g) {
    let x = normalizeKo(g);
    for (const suf of ["시키다", "하다", "주다", "되다"]) {
      if (x.endsWith(suf) && x.length > suf.length) return x.slice(0, -suf.length);
    }
    if (x.endsWith("다") && x.length > 1) return x.slice(0, -1);
    return x;
  }

  // first pass count before
  for (const f of fs.readdirSync(LEX).filter((x) => x.endsWith(".json"))) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    const gloss = majority(glossMaj.get(d.strong)) || "";
    const e = analyzeDefErrors(d.defKo || "", d.strong, gloss);
    if (/동사/.test(d.posKo || "") && /는 것을 말해요|하는 것을 말해요/.test(d.defKo || "")) {
      if (/^[^.「]{1,25}(는|하는) 것을 말해요/.test((d.defKo || "").trim())) errBefore.verbAssembly += 1;
    }
    if (AMBIGUOUS_VERBS.has(d.strong) && /말해요|뜻해요/.test(d.defKo || "")) {
      if (d.strong === "G1006" && !/가축|먹이|돌보/.test(d.defKo || "")) errBefore.ambiguousNoObj += 1;
      if (d.strong === "G1001" && !/물|깊이/.test(d.defKo || "")) errBefore.ambiguousNoObj += 1;
    }
    if (/「[^」]*…」/.test(d.defKo || "")) {
      errBefore.citeCutMissingWord += 1; // candidates; refine after
    }
    if ([...(d.defKo || "").matchAll(/\(([가-힣]+)\s*\d+:\d+/g)].length >= 2) errBefore.multiRef += 1;
    errBefore.particle += countParticleErrors(d.defKo || "");
  }

  // Load NAME_FACTS from round3/900 by reading files if needed — embed key ones
  const nameFacts = { ...NAME_IDENTITY };
  try {
    const p900 = path.join(root, "scripts", "polish-greek-defko-900.mjs");
    const txt = fs.readFileSync(p900, "utf8");
    const m = txt.match(/const NAME_FACTS = \{([\s\S]*?)\n\};/);
    if (m) {
      // crude extract G####: "..."
      for (const mm of m[1].matchAll(/G(\d+):\s*"([^"]+)"/g)) {
        nameFacts[`G${mm[1]}`] = mm[2];
      }
    }
  } catch { /* */ }
  try {
    const p3 = path.join(root, "scripts", "polish-greek-defko-round3.mjs");
    const txt = fs.readFileSync(p3, "utf8");
    for (const mm of txt.matchAll(/G(\d+):\s*\n?\s*"([^"]+)"/g)) {
      if (!nameFacts[`G${mm[1]}`]) nameFacts[`G${mm[1]}`] = mm[2];
    }
  } catch { /* */ }
  Object.assign(nameFacts, NAME_IDENTITY);

  let nameOnlyBefore = 0;
  let nameOnlyAfter = 0;
  let defRewritten = 0;

  for (const f of fs.readdirSync(LEX).filter((x) => x.endsWith(".json"))) {
    const fp = path.join(LEX, f);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    const strong = d.strong || f.replace(/\.json$/, "");
    const gloss = majority(glossMaj.get(strong)) || d.glossKo || "";
    const hit = hits.get(strong)?.[0];
    let def = (d.defKo || "").trim();
    let changed = false;

    if (NAME_MEANING_FIX[strong]) {
      d.nameMeaning = NAME_MEANING_FIX[strong];
      changed = true;
    }

    if (isNameOnlyDef(def)) nameOnlyBefore += 1;

    // name identity
    if (isNameOnlyDef(def) || (nameFacts[strong] && /뜻의 이름이에요|처음 나오는 곳:|이름 뜻은/.test(def))) {
      const nm = NAME_MEANING_FIX[strong] || d.nameMeaning || "";
      const name = gloss || d.lemma || strong;
      if (nameFacts[strong]) {
        let body = nameFacts[strong];
        // ensure meaning if we have nm
        if (nm && !/「/.test(body)) {
          def = ensurePeriod(`${body} 이름 뜻은 「${nm}」${iraneunRaneun(nm)} 쪽이에요`);
        } else {
          def = ensurePeriod(body);
        }
        // add first occurrence if missing
        if (hit && !/처음 나오는 곳:/.test(def)) {
          def = ensurePeriod(`${def.replace(/\.$/, "")}. 처음 나오는 곳: ${refOf(hit)}`);
        }
        changed = true;
      } else if (isNameOnlyDef(def)) {
        // build minimal identity from gloss + first KRV
        const nm2 = nm || "확실하지 않음";
        const first = hit ? refOf(hit) : "(본문 사례 없음)";
        const who = hit?.krv
          ? `${name}${eunNeun(name)} 신약에 나오는 이름이에요`
          : `${name}${eunNeun(name)} 신약에 나오는 이름이에요`;
        def = ensurePeriod(
          `${who}. 이름 뜻은 「${nm2}」${iraneunRaneun(String(nm2))} 뜻으로 읽혀요. 처음 나오는 곳: ${first}`,
        );
        changed = true;
      }
    }

    // template 말해요 / 뜻해요 rewrite for short defs
    const isTpl =
      /말해요|뜻해요/.test(def) &&
      (def.length < 220 || /「/.test(def)) &&
      (/을 말해요|를 말해요|것을 말해요|일을 뜻해요|일을 말해요/.test(def) || DEF_OVERRIDES[strong]);

    if (isTpl || DEF_OVERRIDES[strong]) {
      const ov = DEF_OVERRIDES[strong];
      let body;
      if (ov?.body) body = ov.body;
      else if (/동사/.test(d.posKo || "")) body = `${verbPhrase(gloss)} 것을 말해요`;
      else if (/형용사|부사/.test(d.posKo || "")) {
        const g = gloss || "이런";
        body = /은$|는$|운$|한$|인$/.test(g) ? `${g} 것을 말해요` : `${g} 상태를 말해요`;
      } else if (/수사/.test(d.posKo || "")) {
        body = `${gloss || "하나"}${eulReul(gloss || "하나")} 말해요`;
      } else {
        const g = gloss || "이것";
        body = `${g}${eulReul(g)} 말해요`;
      }

      // citation
      let cite = "";
      let ref = "";
      if (hit) {
        ref = refOf(hit);
        const needle =
          (Array.isArray(d.krvKo) && d.krvKo[0]) ||
          glossStemSafe(gloss) ||
          gloss ||
          "";
        // special needles
        let needles = [needle];
        if (strong === "G1010") needles = ["공회원", "의원", needle];
        if (strong === "G1001") needles = ["재어", "재니", "물"];
        if (strong === "G1006") needles = ["먹고", "돼지", needle];
        if (strong === "G4906") needles = ["함께", "먹", needle];
        if (strong === "G506") needles = ["복종치", "복종"];
        let window = "";
        for (const nd of needles) {
          window = extractCiteWindow(hit.krv, nd, 80);
          if (nd && window.includes(nd)) break;
        }
        if (window) cite = window;
      }

      def = cite
        ? ensurePeriod(`${body}. 「${cite}」(${ref})`)
        : ref
          ? ensurePeriod(`${body}(${ref})`)
          : ensurePeriod(body);
      // single ref only — strip duplicate trailing refs inside body
      def = def.replace(/\s*\(([가-힣]+)\s*\d+:\d+[–\-]?\d*\)\s*\./g, ".");
      // ensure one ref at end if cite present
      if (cite && ref && !def.includes(`(${ref})`)) {
        def = ensurePeriod(`${def.replace(/\.$/, "")}(${ref})`);
      }
      changed = true;
      defRewritten += 1;
    }

    // particle fix on all defs
    const pf = fixParticlesInText(def);
    if (pf.text !== def) {
      def = pf.text;
      changed = true;
    }

    // G1520 format unify
    if (strong === "G1520") {
      const h = hit || hits.get(strong)?.[0];
      const ref = h ? refOf(h) : "마 10:29";
      const cite = h ? extractCiteWindow(h.krv, "한", 70) : "참새 두 마리가 한 앗사리온에 팔리는 것이 아니냐";
      def = ensurePeriod(`하나를 말해요. 「${cite}」(${ref})`);
      d.posKo = "수사";
      d.glossKo = "하나";
      changed = true;
    }
    if (strong === "G1519") {
      d.glossKo = "안으로";
      d.posKo = "전치사";
      // keep rich def but ensure particle OK
      if (!/전치사/.test(def) && !/안으로/.test(def)) {
        def =
          "대격과 함께 쓰는 전치사로, '~안으로, ~으로, ~을 향해'처럼 도달·방향을 말해요.";
        changed = true;
      }
    }

    if (changed) {
      d.defKo = def;
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
    }
  }

  // recount name only + errors after
  for (const f of fs.readdirSync(LEX).filter((x) => x.endsWith(".json"))) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    if (isNameOnlyDef(d.defKo || "")) nameOnlyAfter += 1;
    const gloss = majority(glossMaj.get(d.strong)) || "";
    if (/동사/.test(d.posKo || "") && /^[^.「]{1,25}(는|하는) 것을 말해요/.test((d.defKo || "").trim())) {
      errAfter.verbAssembly += 1;
    }
    if (d.strong === "G1006" && /말해요/.test(d.defKo || "") && !/가축|먹이|돌보/.test(d.defKo || "")) {
      errAfter.ambiguousNoObj += 1;
    }
    if (d.strong === "G1001" && /말해요/.test(d.defKo || "") && !/물|깊이/.test(d.defKo || "")) {
      errAfter.ambiguousNoObj += 1;
    }
    if (/「[^」]*…」/.test(d.defKo || "")) {
      const cite = (d.defKo.match(/「([^」]+)」/) || [])[1] || "";
      const stem = glossStemSafe(gloss);
      if (d.strong === "G1010" && !/공회원/.test(d.defKo || "")) errAfter.citeCutMissingWord += 1;
      else if (stem && stem.length >= 2 && !normalizeKo(cite).includes(normalizeKo(stem)) && !cite.includes(stem.slice(0, 2))) {
        errAfter.citeCutMissingWord += 1;
      }
    }
    if ([...(d.defKo || "").matchAll(/\(([가-힣]+)\s*\d+:\d+/g)].length >= 2) errAfter.multiRef += 1;
    errAfter.particle += countParticleErrors(d.defKo || "");
  }

  // refine citeCut before: G1010 style
  // already set broadly

  // ========== 4) krvKo chi forms ==========
  let chiBefore = 0;
  let chiAfter = 0;
  const chiMap = {
    복종치: "복종하지 않는",
    믿지아니: "믿지 않는",
    믿지: "믿다",
  };
  for (const f of fs.readdirSync(LEX).filter((x) => x.endsWith(".json"))) {
    const fp = path.join(LEX, f);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    if (!Array.isArray(d.krvKo) || !d.krvKo.length) continue;
    const before = [...d.krvKo];
    if (before.some((x) => /치$|치\s|아니하|복종치/.test(x))) chiBefore += 1;
    const gloss = majority(glossMaj.get(d.strong)) || "";
    let next = before.map((x) => {
      if (chiMap[x]) return chiMap[x];
      if (/치$/.test(x) && x.length >= 3) {
        // 복종치 → 복종하지 않는 / 가르침 from 명사 keep
        if (/명사/.test(d.posKo || "")) return x; // 잔치 etc
        const stem = x.replace(/치$/, "");
        if (gloss.includes("복종") || stem === "복종") return "복종하지 않는";
        if (stem.endsWith("하")) return `${stem}지 않는`;
        return `${stem}하지 않는`;
      }
      if (/아니하/.test(x)) return x.replace(/치\s*아니하.*/, "하지 않는").replace(/아니하.*/, "아니하는");
      return x;
    });
    // specials
    if (d.strong === "G506") {
      d.krvForms = before;
      next = ["복종하지 않는"];
    }
    next = [...new Set(next)].slice(0, 3);
    if (next.join("|") !== before.join("|")) {
      if (!d.krvForms) d.krvForms = before;
      d.krvKo = next;
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
    }
  }
  for (const f of fs.readdirSync(LEX).filter((x) => x.endsWith(".json"))) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    if ((d.krvKo || []).some((x) => /치$|복종치|아니하/.test(x))) chiAfter += 1;
  }

  // krvKo coverage rates
  let filledStrong = 0;
  let totalStrong = 0;
  let occFilled = 0;
  let occTotal = 0;
  const hasKrv = new Set();
  for (const f of fs.readdirSync(LEX).filter((x) => x.endsWith(".json"))) {
    totalStrong += 1;
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    if (Array.isArray(d.krvKo) && d.krvKo.length) {
      filledStrong += 1;
      hasKrv.add(d.strong);
    }
  }
  for (const book of NT) {
    const dir = path.join(OUT, book);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const ch = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      for (const v of ch.verses || []) {
        for (const w of v.words || []) {
          if (!w.strong) continue;
          occTotal += 1;
          if (hasKrv.has(w.strong)) occFilled += 1;
        }
      }
    }
  }

  // random 20 defKo samples mixed
  const buckets = { 명사: [], 동사: [], 형용사: [], 고유명사: [] };
  for (const f of fs.readdirSync(LEX).filter((x) => x.endsWith(".json"))) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    const def = d.defKo || "";
    if (!def || def.length < 10) continue;
    let b = null;
    if (nameFacts[d.strong] || /이름이에요|어머니|동역|왕이에요|성읍/.test(def)) b = "고유명사";
    else if (/동사/.test(d.posKo || "")) b = "동사";
    else if (/형용사|수사/.test(d.posKo || "")) b = "형용사";
    else if (/명사|전치사/.test(d.posKo || "")) b = "명사";
    if (b && buckets[b].length < 5) buckets[b].push({ strong: d.strong, posKo: d.posKo, lemma: d.lemma, defKo: def });
  }
  const random20 = [...buckets.명사, ...buckets.동사, ...buckets.형용사, ...buckets.고유명사].slice(0, 20);

  // force include key samples
  for (const s of ["G1001", "G1006", "G1010", "G4906", "G2037", "G2131", "G1520", "G506"]) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, `${s}.json`), "utf8"));
    if (!random20.find((x) => x.strong === s)) {
      random20.unshift({ strong: s, posKo: d.posKo, lemma: d.lemma, defKo: d.defKo });
    }
  }

  const g1519 = JSON.parse(fs.readFileSync(path.join(LEX, "G1519.json"), "utf8"));
  const g1520 = JSON.parse(fs.readFileSync(path.join(LEX, "G1520.json"), "utf8"));

  const report = {
    section1: {
      posBefore,
      posChanged,
      posAfter,
      g1519: { glossKo: g1519.glossKo, posKo: g1519.posKo, krvKo: g1519.krvKo, defKo: g1519.defKo },
      g1520: { glossKo: g1520.glossKo, posKo: g1520.posKo, krvKo: g1520.krvKo, defKo: g1520.defKo },
    },
    section2: {
      errBefore,
      errAfter,
      defRewritten,
    },
    section3: {
      nameOnlyBefore,
      nameOnlyAfter,
      note: "지난 172→0은 「처음 나오는 곳」만 패턴. 이번은 「뜻+처음 나오는 곳」만 있고 신원(역할) 문장 없는 항목을 따로 셈.",
      g2131: JSON.parse(fs.readFileSync(path.join(LEX, "G2131.json"), "utf8")).defKo,
      nameMeaning: JSON.parse(fs.readFileSync(path.join(LEX, "G2131.json"), "utf8")).nameMeaning,
    },
    section4: {
      chiBefore,
      chiAfter,
      filledStrong,
      totalStrong,
      pctStrong: +((100 * filledStrong) / totalStrong).toFixed(2),
      occFilled,
      occTotal,
      pctOcc: +((100 * occFilled) / occTotal).toFixed(2),
      g506: JSON.parse(fs.readFileSync(path.join(LEX, "G506.json"), "utf8")).krvKo,
    },
    random20: random20.slice(0, 20),
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}

main();
