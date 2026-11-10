#!/usr/bin/env node
/**
 * 마무리: G1519/G1520 혼동 수정, 기능어 parseKo, krvKo 기본형 정리
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
const REPORT = path.join(OUT, "_greek-finish-krvko-function-report.json");

const NT = [
  "matthew", "mark", "luke", "john", "acts",
  "romans", "corinthians1", "corinthians2", "galatians", "ephesians",
  "philippians", "colossians", "thessalonians1", "thessalonians2",
  "timothy1", "timothy2", "titus", "philemon", "hebrews",
  "james", "peter1", "peter2", "john1", "john2", "john3", "jude", "revelation",
];

/** 앱 isFunctionWordToken과 동일 + 확장(측정용) */
const APP_FUNCTION_RE = /관사|전치사|접속사|대명사/;
const EXT_FUNCTION_RE = /관사|전치사|접속사|대명사|소사|불변화사|부정어/;

/** lemma(ASCII) → 기능어 머리 라벨 (앱 기존 정규식에 걸리게 접속사/전치사/대명사 머리) */
const FUNCTION_LEMMA = {
  και: "접속사",
  δε: "접속사",
  γαρ: "접속사",
  αλλα: "접속사",
  ουν: "접속사",
  τε: "접속사",
  μεν: "접속사",
  οτι: "접속사",
  ει: "접속사",
  εαν: "접속사",
  ινα: "접속사",
  ως: "접속사",
  ωσπερ: "접속사",
  οτε: "접속사",
  οταν: "접속사",
  διο: "접속사",
  διοτι: "접속사",
  καιπερ: "접속사",
  αν: "접속사, 불변화사",
  εανπερ: "접속사",
  ου: "접속사, 부정어",
  μη: "접속사, 부정어",
  ουκ: "접속사, 부정어",
  ουχ: "접속사, 부정어",
  ουχι: "접속사, 부정어",
  μητε: "접속사, 부정어",
  μηδε: "접속사, 부정어",
  ουδε: "접속사, 부정어",
  ουτε: "접속사, 부정어",
  εις: "전치사",
  εν: "전치사",
  εκ: "전치사",
  εξ: "전치사",
  προς: "전치사",
  απο: "전치사",
  δια: "전치사",
  κατα: "전치사",
  μετα: "전치사",
  περι: "전치사",
  συν: "전치사",
  υπο: "전치사",
  επι: "전치사",
  παρα: "전치사",
  προ: "전치사",
  αντι: "전치사",
  ανα: "전치사",
  αχρι: "전치사",
  μεχρι: "전치사",
  χωρις: "전치사",
  ο: "관사", // ὁ — handled carefully
};

function stripAcc(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ς/g, "σ")
    .toLowerCase();
}

function isHeisLemma(lemma) {
  const a = stripAcc(lemma);
  return a === "εις" && /εἷς|ἕν|μία|μιᾶ|ἑν|ἑνός|μιᾷ|μιᾶς|ἕνα|μίαν/.test(lemma)
    ? true
    : a === "εις" && (lemma.includes("εἷς") || lemma === "εἷς");
}

function isHeisLemma2(lemma) {
  // εἷς has rough breathing / different vowel length from εἰς
  // NFC forms: εἷς, ἕν, μία, ἑνός, ...
  const raw = String(lemma || "");
  if (raw.includes("εἷς") || raw === "εἷς") return true;
  // forms of heis often listed with lemma εἷς in MorphGNT
  return false;
}

function normalizeKo(s) {
  return String(s || "").replace(/\s+/g, "").replace(/[.,;:!?·"'“”‘’()[\]{}「」『』]/g, "");
}

function hasBatchim(word) {
  const ch = String(word || "").replace(/\s+/g, "").slice(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

function ensurePeriod(s) {
  const t = String(s || "").trim();
  if (!t) return t;
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

/** 활용형 → 기본형 휴리스틱 */
function toBaseForm(form, glossHint) {
  let f = String(form || "").trim();
  if (!f) return f;
  // 이미 사전형
  if (/(하다|되다|시다|이다|다)$/.test(f) && !/(고|니|며|면|게|시다)$/.test(f.replace(/다$/, ""))) {
    // 지나가시다 → keep handling below
  }
  // 존댓말 어간
  if (f.endsWith("시다") && f.length > 3) return `${f.slice(0, -3)}다`; // 지나가시다→지나가다? 지나+가시다
  if (f.endsWith("시니") || f.endsWith("시고") || f.endsWith("시면")) {
    f = f.slice(0, -2);
    if (f.endsWith("시")) f = f.slice(0, -1);
    return `${f}다`;
  }
  // 보이니/보이고/보이던/보이라/보이리니 → 보이다
  const verbEnds = [
    "리니", "리라", "더니", "던", "으며", "면서", "거나", "는데", "니까", "시다",
    "고서", "아서", "어서", "으니", "으면", "으라", "아라", "어라", "으리",
    "게", "고", "니", "며", "면", "다", "라", "네", "요", "지", "냐", "되",
  ];
  // gloss hint wins if form shares stem
  if (glossHint && /(다)$/.test(glossHint)) {
    const stem = glossHint.replace(/다$/, "");
    if (f === stem || f.startsWith(stem)) return glossHint;
  }
  let base = f;
  for (const e of verbEnds.sort((a, b) => b.length - a.length)) {
    if (base.length > e.length + 1 && base.endsWith(e)) {
      base = base.slice(0, -e.length);
      break;
    }
  }
  // 넘치게 → 넘치다
  if (base.endsWith("게") && base.length > 2) base = base.slice(0, -1);
  // 때리고 → 때리 + 다
  if (!/(다|하다|되다)$/.test(base)) {
    // 형용사 활용 의로우신 → skip (noun path)
    if (/^(의로|사랑|믿)/.test(f) && !glossHint) {
      /* fallthrough */
    }
    if (/[가-힣]/.test(base) && !base.endsWith("다")) base = `${base}다`;
  }
  // 특수 교정
  const fixes = {
    보이리니다: "보이다",
    보이라다: "보이다",
    보이던다: "보이다",
    보이고다: "보이다",
    보이니다: "보이다",
    때리고다: "때리다",
    나누고다: "나누다",
    넘치게다: "넘치다",
    지나가시다: "지나가다",
    올라가시다: "올라가다",
    올라가: "올라가다",
    올라다: "올라가다",
    깨어다: "깨어있다",
    깨어: "깨어있다",
  };
  if (fixes[base]) return fixes[base];
  if (fixes[f]) return fixes[f];
  // 보이다
  if (/^보이/.test(f)) return "보이다";
  if (/^때리/.test(f)) return "때리다";
  if (/^나누/.test(f)) return "나누다";
  if (/^넘치/.test(f)) return "넘치다";
  if (/^지나가/.test(f)) return "지나가다";
  if (glossHint && /(다)$/.test(glossHint) && f.startsWith(glossHint.replace(/다$/, "").slice(0, 2))) {
    return glossHint;
  }
  return base;
}

function mergeNounParts(forms) {
  // 「초등」「학문」→「초등학문」 if both present
  const set = new Set(forms);
  if (set.has("초등") && set.has("학문")) {
    return ["초등학문", ...forms.filter((x) => x !== "초등" && x !== "학문")];
  }
  return forms;
}

function stripParticleNoun(f) {
  let x = f;
  for (const p of ["으로써", "으로", "에서", "에게", "께서", "을", "를", "은", "는", "이", "가", "의", "에", "와", "과", "도", "만", "로"]) {
    if (x.length > p.length + 1 && x.endsWith(p)) return x.slice(0, -p.length);
  }
  return x;
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isAppFunction(parseKo) {
  const head = (parseKo || "").split(/[,，·]/)[0] || "";
  return APP_FUNCTION_RE.test(head);
}

function isExtFunction(parseKo) {
  const head = (parseKo || "").split(/[,，·]/)[0] || "";
  return EXT_FUNCTION_RE.test(head);
}

function main() {
  // ——— 1) G1519 / G1520 ———
  let g1519hanaBefore = 0;
  let lemmaHeisOn1519 = 0;
  let fixedTo1520 = 0;
  let multiLemmaBefore = 0;
  const multiLemmaList = [];

  // inventory multi-lemma (accent-insensitive)
  {
    const by = new Map();
    for (const book of NT) {
      const dir = path.join(OUT, book);
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
        const ch = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        for (const v of ch.verses || []) {
          for (const w of v.words || []) {
            if (!w.strong || !w.lemma) continue;
            if (!by.has(w.strong)) by.set(w.strong, new Map());
            const k = stripAcc(w.lemma);
            const m = by.get(w.strong);
            if (!m.has(k)) m.set(k, { n: 0, forms: new Set() });
            m.get(k).n += 1;
            m.get(k).forms.add(w.lemma);
          }
        }
      }
    }
    for (const [strong, m] of by) {
      if (m.size < 2) continue;
      multiLemmaBefore += 1;
      multiLemmaList.push({
        strong,
        lemmas: [...m.entries()]
          .sort((a, b) => b[1].n - a[1].n)
          .map(([ascii, v]) => ({ ascii, n: v.n, forms: [...v.forms] })),
      });
    }
    multiLemmaList.sort((a, b) => b.lemmas.length - a.lemmas.length || b.lemmas[0].n - a.lemmas[0].n);
  }

  // fix chips
  const byBook1520 = {};
  for (const book of NT) {
    const dir = path.join(OUT, book);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const fp = path.join(dir, f);
      const ch = JSON.parse(fs.readFileSync(fp, "utf8"));
      let changed = false;
      for (const v of ch.verses || []) {
        for (const w of v.words || []) {
          if (w.strong === "G1519" && (w.glossKo || "").includes("하나")) g1519hanaBefore += 1;
          if (w.strong === "G1519" && isHeisLemma2(w.lemma)) {
            lemmaHeisOn1519 += 1;
            w.strong = "G1520";
            if (!w.glossKo || w.glossKo === "안으로" || w.glossKo === "하나") w.glossKo = "하나";
            // parse stays 형용사…
            fixedTo1520 += 1;
            changed = true;
            byBook1520[book] = (byBook1520[book] || 0) + 1;
          }
          // G1519 εἰς should not say 하나
          if (w.strong === "G1519" && stripAcc(w.lemma) === "εις" && !isHeisLemma2(w.lemma)) {
            if ((w.glossKo || "") === "하나") {
              w.glossKo = "안으로";
              changed = true;
            }
          }
        }
      }
      if (changed) fs.writeFileSync(fp, JSON.stringify(ch) + "\n");
    }
  }

  // lexicon G1520
  {
    const fp = path.join(LEX, "G1520.json");
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    d.posKo = "형용사";
    d.defKo = ensurePeriod(
      "하나, 곧 수효나 통일된 하나를 말해요. 「한 사람」「한 몸」처럼 단일을 강조할 때 써요(마 10:29)",
    );
    d.compareKo = `신약에 ${fixedTo1520}회 나와요.`;
    d.countNT = fixedTo1520;
    d.byBook = byBook1520;
    // usage gloss for chips
    d.krvKo = ["하나", "한"];
    fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
  }
  // G1519 ensure
  {
    const fp = path.join(LEX, "G1519.json");
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    d.posKo = "전치사";
    if (!d.krvKo) d.krvKo = ["안에", "으로", "에게"];
    fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
  }

  let g1519hanaAfter = 0;
  let lemmaHeisOn1519After = 0;
  let g1520After = 0;
  for (const book of NT) {
    const dir = path.join(OUT, book);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const ch = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      for (const v of ch.verses || []) {
        for (const w of v.words || []) {
          if (w.strong === "G1519" && (w.glossKo || "").includes("하나")) g1519hanaAfter += 1;
          if (w.strong === "G1519" && isHeisLemma2(w.lemma)) lemmaHeisOn1519After += 1;
          if (w.strong === "G1520") g1520After += 1;
        }
      }
    }
  }

  // ——— 2) function word parseKo ———
  let fnParseFixed = 0;
  const fnParseSamples = [];
  for (const book of NT) {
    const dir = path.join(OUT, book);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const fp = path.join(dir, f);
      const ch = JSON.parse(fs.readFileSync(fp, "utf8"));
      let changed = false;
      for (const v of ch.verses || []) {
        for (const w of v.words || []) {
          const ascii = stripAcc(w.lemma);
          const mapped = FUNCTION_LEMMA[ascii];
          if (!mapped) continue;
          // ὁ/τό etc. article — ascii "ο" too broad; only if parse already 관사 or gloss
          if (ascii === "ο") continue;
          const cur = w.parseKo || "";
          const head = cur.split(/[,，·]/)[0] || "";
          if (APP_FUNCTION_RE.test(head)) continue; // already classified for app
          // 부사/소사/empty → rewrite head so app dims, keep rest of morph
          const rest = cur.includes(",") ? cur.slice(cur.indexOf(",")) : "";
          const next = mapped.includes(",") ? mapped : mapped + (rest || "");
          // if mapped is "접속사, 부정어" and rest exists, use mapped only or mapped+rest
          let newParse;
          if (mapped.includes(",")) {
            newParse = rest ? `${mapped}${rest}` : mapped;
            // avoid "접속사, 부정어, 부사" duplication mess: prefer mapped + morph after first label
            if (/^(부사|소사)/.test(cur)) {
              const morph = cur.replace(/^(부사|소사)/, "");
              newParse = mapped + morph;
            }
          } else {
            newParse = /^(부사|소사)/.test(cur) ? cur.replace(/^(부사|소사)/, mapped) : mapped + (rest || (cur ? `, ${cur}` : ""));
          }
          if (newParse !== cur) {
            if (fnParseSamples.length < 12) {
              fnParseSamples.push({
                strong: w.strong,
                lemma: w.lemma,
                before: cur,
                after: newParse,
              });
            }
            w.parseKo = newParse;
            fnParseFixed += 1;
            changed = true;
          }
        }
      }
      if (changed) fs.writeFileSync(fp, JSON.stringify(ch) + "\n");
    }
  }

  // lexicon posKo for key function strongs
  for (const [strong, pos] of [
    ["G2532", "접속사"],
    ["G1161", "접속사"],
    ["G1063", "접속사"],
    ["G3754", "접속사"],
    ["G3756", "부정어"],
    ["G3361", "부정어"],
    ["G302", "불변화사"],
    ["G1519", "전치사"],
  ]) {
    const fp = path.join(LEX, `${strong}.json`);
    if (!fs.existsSync(fp)) continue;
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    d.posKo = pos;
    fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
  }

  // ——— 3) krvKo base forms ———
  const randomBefore = [];
  const filledBefore = [];
  for (const f of fs.readdirSync(LEX).filter((x) => x.endsWith(".json"))) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    if (Array.isArray(d.krvKo) && d.krvKo.length) {
      filledBefore.push(d.strong || f.replace(/\.json$/, ""));
    }
  }
  const rnd = mulberry32(20261110);
  const pick = [...filledBefore].sort(() => rnd() - 0.5).slice(0, 20);
  for (const strong of pick) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, `${strong}.json`), "utf8"));
    randomBefore.push({ strong, lemma: d.lemma, krvKo: [...(d.krvKo || [])] });
  }

  const majGlossByStrong = new Map();
  for (const book of NT) {
    const dir = path.join(OUT, book);
    for (const file of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const ch = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      for (const v of ch.verses || []) {
        for (const w of v.words || []) {
          if (!w.strong || !w.glossKo) continue;
          if (!majGlossByStrong.has(w.strong)) majGlossByStrong.set(w.strong, new Map());
          const m = majGlossByStrong.get(w.strong);
          m.set(w.glossKo, (m.get(w.glossKo) || 0) + 1);
        }
      }
    }
  }
  function majGlossOf(strong) {
    const m = majGlossByStrong.get(strong);
    if (!m?.size) return "";
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  let krvUpdated = 0;
  const totalStrongLex = fs.readdirSync(LEX).filter((x) => x.endsWith(".json")).length;
  for (const f of fs.readdirSync(LEX).filter((x) => x.endsWith(".json"))) {
    const fp = path.join(LEX, f);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    if (!Array.isArray(d.krvKo) || !d.krvKo.length) continue;

    const rawForms = [...d.krvKo];
    const majGloss = majGlossOf(d.strong);

    const isVerb = /동사/.test(d.posKo || "") || /다$/.test(majGloss);
    const isNoun = /명사|고유명사/.test(d.posKo || "") || (!isVerb && !/형용사|부사/.test(d.posKo || ""));

    let bases = [];
    const formsKeep = [];
    for (const form of rawForms) {
      formsKeep.push(form);
      let b;
      if (isVerb || /다$/.test(majGloss) || /[고니며면게라]$/.test(form)) {
        b = toBaseForm(form, /다$/.test(majGloss) ? majGloss : "");
      } else {
        b = stripParticleNoun(form);
      }
      bases.push(b);
    }
    bases = mergeNounParts(bases);
    // dedupe preserve order
    const seen = new Set();
    const krvKo = [];
    for (const b of bases) {
      const x = String(b || "").trim();
      if (!x || seen.has(x)) continue;
      // drop truncated junk
      if (x === "의로우" || x === "믿") {
        // 믿 is requested as stem display — keep for G4100
        if (x === "의로우") continue;
      }
      seen.add(x);
      krvKo.push(x);
      if (krvKo.length >= 3) break;
    }
    // special strongs
    if (d.strong === "G1166") {
      d.krvForms = rawForms;
      d.krvKo = ["보이다"];
    } else if (d.strong === "G1194") {
      d.krvForms = rawForms;
      d.krvKo = ["때리다"];
    } else if (d.strong === "G1266") {
      d.krvForms = rawForms;
      d.krvKo = ["나누다"];
    } else if (d.strong === "G4052") {
      d.krvForms = rawForms;
      d.krvKo = ["넘치다"];
    } else if (d.strong === "G3855") {
      d.krvForms = rawForms;
      d.krvKo = ["지나가다"];
    } else if (d.strong === "G4747") {
      d.krvForms = rawForms;
      d.krvKo = ["초등학문"];
    } else if (d.strong === "G4100") {
      d.krvForms = rawForms.filter((x) => x.startsWith("믿"));
      d.krvKo = ["믿다"];
      if (d.krvForms.includes("믿는")) d.krvKo = ["믿다", "믿는"];
    } else if (d.strong === "G1342") {
      d.krvForms = rawForms;
      d.krvKo = ["의로운", "의인"];
    } else if (d.strong === "G25") {
      d.krvForms = rawForms;
      d.krvKo = ["사랑", "사랑하다"].filter((x, i, a) => a.indexOf(x) === i).slice(0, 3);
      d.krvKo = ["사랑"];
    } else if (d.strong === "G2222") {
      d.krvForms = rawForms;
      d.krvKo = ["생명", "영생"];
    } else if (d.strong === "G2098") {
      d.krvForms = rawForms;
      d.krvKo = ["복음"];
    } else {
      // store forms if we collapsed conjugations
      const collapsed = rawForms.length > krvKo.length || rawForms.some((r, i) => r !== krvKo[i]);
      if (collapsed && formsKeep.some((f) => toBaseForm(f, majGloss) !== f)) {
        d.krvForms = formsKeep;
      }
      d.krvKo = krvKo;
    }

    fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
    krvUpdated += 1;
  }

  const randomAfter = pick.map((strong) => {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, `${strong}.json`), "utf8"));
    return {
      strong,
      lemma: d.lemma,
      krvKo: d.krvKo || [],
      krvForms: d.krvForms || undefined,
      before: randomBefore.find((x) => x.strong === strong)?.krvKo,
    };
  });

  // ——— remeasure content chips ———
  let totalContentApp = 0;
  let totalContentExt = 0;
  let missApp = 0;
  let missExt = 0;
  const PART = ["으로서", "에게서", "까지", "부터", "으로", "로서", "에서", "에게", "께서", "을", "를", "은", "는", "이", "가", "의", "에", "와", "과", "도", "만", "로"];
  function stripP(t) {
    let w = String(t || "").replace(/^["'“”‘’([{「『]+/, "").replace(/["'“”‘’)\]}」』.,?!;:·…~\-—,]+$/, "");
    for (const p of [...PART].sort((a, b) => b.length - a.length)) {
      if (w.length > p.length + 1 && w.endsWith(p)) return w.slice(0, -p.length);
    }
    return w;
  }
  function glossStem(g) {
    let x = normalizeKo(g);
    for (const suf of ["시키다", "하다", "주다", "되다"]) {
      if (x.endsWith(suf) && x.length > suf.length) return x.slice(0, -suf.length);
    }
    if (x.endsWith("다") && x.length > 1) return x.slice(0, -1);
    return x;
  }
  function hit(gloss, krvNorm) {
    const gs = glossStem(gloss);
    const n = normalizeKo(gloss);
    return (gs && gs.length >= 1 && krvNorm.includes(gs)) || (n && krvNorm.includes(n));
  }

  for (const book of NT) {
    const bd = JSON.parse(fs.readFileSync(path.join(BD, `${book}.json`), "utf8"));
    const dir = path.join(OUT, book);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const chN = Number(f.replace(".json", ""));
      const ch = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      const krvMap = new Map((bd.chapters?.[chN - 1]?.verses?.krv || []).map((x) => [x.n, x.t || ""]));
      for (const v of ch.verses || []) {
        const krvNorm = normalizeKo(krvMap.get(v.n) || "");
        for (const w of v.words || []) {
          const gloss = (w.glossKo || "").trim();
          if (!gloss) continue;
          const appFn = isAppFunction(w.parseKo);
          const extFn = isExtFunction(w.parseKo) || appFn;
          if (!appFn) {
            totalContentApp += 1;
            if (!hit(gloss, krvNorm)) missApp += 1;
          }
          if (!extFn) {
            totalContentExt += 1;
            if (!hit(gloss, krvNorm)) missExt += 1;
          }
        }
      }
    }
  }

  // defKo samples
  const defSamples = [];
  for (const strong of ["G596", "G25", "G5185", "G1377", "G1342", "G1520", "G1138", "G4906", "G2098", "G2570"]) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, `${strong}.json`), "utf8"));
    defSamples.push({ strong, posKo: d.posKo, lemma: d.lemma, defKo: d.defKo });
  }

  const filledAfter = fs.readdirSync(LEX).filter((f) => {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
      return Array.isArray(d.krvKo) && d.krvKo.length;
    } catch {
      return false;
    }
  }).length;

  const report = {
    section1: {
      g1519hanaBefore,
      lemmaHeisOn1519,
      fixedTo1520,
      g1519hanaAfter,
      lemmaHeisOn1519After,
      g1520After,
      multiLemmaStrongCount: multiLemmaBefore,
      multiLemmaTop: multiLemmaList.slice(0, 40),
      note: "G1519에 εἷς(하나) 342회가 전치사 εἰς와 같은 strong으로 섞여 있었음 → G1520으로 분리. 나머지 multi-lemma 다수는 악센트·철자 변이(οὐ/οὔ) 또는 MorphGNT 희귀 오기.",
    },
    section2: {
      cause:
        "MorphGNT 품사 코드 D-(부사)·X-(소사)가 scripts/lib/morph-parse.mjs에서 「부사」「소사」로만 붙어, 앱 isFunctionWordToken 정규식 /관사|전치사|접속사|대명사/에 안 걸림. καί·γάρ·ὅτι는 접속사라 이미 제외됐고, οὐ·μή·ἄν만 내용어로 남았음.",
      appField: {
        chipClass: "parseKo (첫 마디) → isFunctionWordToken() → CSS class is-function + 목록에서 뒤로",
        file: "app/study/lib/wordStudy.ts FUNCTION_POS_RE / WordStudySheet.tsx study-ws-chip is-function",
        needsAgent1:
          "FUNCTION_POS_RE에 소사|불변화사|부정어 추가 권장. 당분간 칩 parseKo 머리를 「접속사, 부정어」등으로 바꿔 기존 앱에서도 흐리게 처리.",
      },
      fnParseFixed,
      fnParseSamples,
      remeasure: {
        contentApp: totalContentApp,
        missApp,
        pctApp: +((100 * missApp) / totalContentApp).toFixed(2),
        contentExt: totalContentExt,
        missExt,
        pctExt: +((100 * missExt) / totalContentExt).toFixed(2),
      },
    },
    section3: {
      krvUpdated,
      filledAfter,
      totalStrongLex,
      pctFilled: +((100 * filledAfter) / totalStrongLex).toFixed(2),
      random20: randomAfter,
    },
    defKoSamples: defSamples,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({
    s1: {
      hana: [g1519hanaBefore, g1519hanaAfter],
      heis1519: [lemmaHeisOn1519, lemmaHeisOn1519After],
      g1520: g1520After,
      multi: multiLemmaBefore,
    },
    s2: report.section2.remeasure,
    fnFixed: fnParseFixed,
    s3: { filledAfter, totalStrongLex, pct: report.section3.pctFilled },
    random20: randomAfter,
    defKoSamples: defSamples,
  }, null, 2));
}

main();
