#!/usr/bin/env node
/**
 * 헬라어 lexicon krvKo 자동 생성 + 옛말/번역어 대응표 + 어긋남 재측정.
 * 칩 glossKo는 수정하지 않음.
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
const VARIANTS_DATA = path.join(root, "data", "krv-variants.json");
const VARIANTS_PUBLIC = path.join(OUT, "krv-variants.json");
const REPORT = path.join(OUT, "_greek-krvko-report.json");

const NT = [
  "matthew", "mark", "luke", "john", "acts",
  "romans", "corinthians1", "corinthians2", "galatians", "ephesians",
  "philippians", "colossians", "thessalonians1", "thessalonians2",
  "timothy1", "timothy2", "titus", "philemon", "hebrews",
  "james", "peter1", "peter2", "john1", "john2", "john3", "jude", "revelation",
];

const FUNCTION_POS_RE = /관사|전치사|접속사|대명사/;

/** 견본 — 기존 수동분과 함께 보호(덮어쓰지 않음) */
const SAMPLE_KRV = {
  G596: ["곡간"],
  G1377: ["핍박"],
  G5185: ["소경"],
  G3015: ["문둥병", "문둥이"],
};

/** 지난 라운드 수동 33개 — 자동 결과와 비교만, 덮어쓰지 않음 */
const PROTECTED_STRONGS = new Set(
  `G281,G571,G596,G782,G907,G1188,G1201,G1375,G1377,G1515,G1605,G1839,G1887,G2279,G2284,G2288,G2296,G2360,G2570,G2614,G3015,G3500,G4413,G4422,G4459,G4561,G4567,G5054,G5185,G5273,G5353,G5438,G5456`.split(
    ",",
  ),
);

/** 옛말: 뜻이 같고 표기만 옛말 */
const YETMAL = {
  곳간: ["곡간"],
  박해: ["핍박"],
  쫓다: ["핍박"],
  맹인: ["소경"],
  나병: ["문둥병"],
  나병자: ["문둥이", "문둥병"],
  사탄: ["사단"],
  오른편: ["우편"],
  다음날: ["이튿날"],
  어떻게: ["어찌"],
  감옥: ["옥"],
  죽음: ["사망"],
  평화: ["평강"],
  육체: ["육신"],
  소리: ["음성"],
  위선자: ["외식"],
  진실로: ["아멘"],
};

/** 번역어: 같은 자리에서 다른 낱말을 고른 경우 */
const BEONYEOK = {
  좋은: ["선한"],
  인사하다: ["문안"],
  놀라다: ["기이히"],
  첫째: ["먼저"],
  믿음없는: ["믿지"],
};

/** koStem.ts KO_STEM_SUFFIXES — 긴 것부터 */
const KO_STEM_SUFFIXES = [
  "하였더라", "하였으니", "이었더라", "이니라", "이로다",
  "에게서", "으로서", "하시니", "하리라", "였더라", "었더라",
  "이라", "이심", "이니", "이요", "이며", "에게", "께서",
  "으로", "로서", "에서", "하는", "하여", "하고", "하며", "하라",
  "께", "로", "에", "와", "과", "을", "를", "이", "가", "은", "는",
  "의", "도", "만", "들", "히", "케",
].sort((a, b) => b.length - a.length || a.localeCompare(b));

function normalizeKo(s) {
  return String(s || "")
    .replace(/\s+/g, "")
    .replace(/[.,;:!?·"'“”‘’()[\]{}「」『』]/g, "");
}

/** glossKo 몸통: -하다/-주다/-되다/-다 떼기 */
function glossStem(g) {
  let x = normalizeKo(g);
  for (const suf of ["시키다", "당하다", "돌리다", "전하다", "하다", "주다", "되다"]) {
    if (x.endsWith(suf) && x.length > suf.length) return x.slice(0, -suf.length);
  }
  if (x.endsWith("다") && x.length > 1) return x.slice(0, -1);
  return x;
}

function stripSuffixOnce(word) {
  for (const suf of KO_STEM_SUFFIXES) {
    if (word.length > suf.length && word.endsWith(suf)) return word.slice(0, -suf.length);
  }
  return null;
}

/** 개역 어절 → 몸통 (koStem 규칙 간이판) */
function eojeolStem(eojeol) {
  let w = String(eojeol || "").replace(/^["'“”‘’([{「『]+/, "").replace(/["'“”‘’)\]}」』.,?!;:·…~\-—,]+$/, "");
  if (!w) return "";
  // 「세례를」「핍박하거든」— 하/되/시키/케 앞이 길이≥2면 후보
  for (const v of ["시키", "하", "되", "케"]) {
    const i = w.indexOf(v);
    if (i >= 2) {
      const head = w.slice(0, i);
      if (/^[가-힣]+$/.test(head)) return head;
    }
  }
  let cur = w;
  for (let stage = 0; stage < 2; stage++) {
    const next = stripSuffixOnce(cur);
    if (!next || next === cur) break;
    cur = next;
  }
  return cur;
}

function verseStems(krvText) {
  const toks = String(krvText || "").split(/\s+/).filter(Boolean);
  const stems = [];
  const seen = new Set();
  for (const tok of toks) {
    const s = eojeolStem(tok);
    if (s.length < 1) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    stems.push(s);
  }
  return stems;
}

function diceBigram(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const bg = (s) => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) || 0) + 1);
    }
    return m;
  };
  const A = bg(a);
  const B = bg(b);
  let inter = 0;
  let sizeA = 0;
  let sizeB = 0;
  for (const n of A.values()) sizeA += n;
  for (const n of B.values()) sizeB += n;
  for (const [g, n] of A) inter += Math.min(n, B.get(g) || 0);
  if (sizeA + sizeB === 0) return 0;
  return (2 * inter) / (sizeA + sizeB);
}

function isFunctionWord(w) {
  const head = ((w.parseKo || "").split(/[,，·]/)[0] || "").trim();
  return FUNCTION_POS_RE.test(head);
}

function isFunctionStrong(posKo, parses) {
  if (FUNCTION_POS_RE.test(posKo || "")) return true;
  if (!parses || !parses.size) return false;
  let fn = 0;
  let tot = 0;
  for (const [p, n] of parses) {
    tot += n;
    if (FUNCTION_POS_RE.test((p || "").split(/[,，·]/)[0] || "")) fn += n;
  }
  return tot > 0 && fn / tot >= 0.6;
}

function formsHitStems(forms, stems, krvNorm) {
  for (const f of forms) {
    const n = normalizeKo(f);
    const s = glossStem(f);
    if (s && stems.includes(s)) return true;
    if (n && stems.includes(n)) return true;
    if (s && s.length >= 2 && krvNorm.includes(s)) return true;
    if (n && n.length >= 2 && krvNorm.includes(n)) return true;
  }
  return false;
}

function glossHitsVerse(gloss, stems, krvNorm) {
  return formsHitStems([gloss], stems, krvNorm);
}

function loadCorpus() {
  /** @type {{book:string,ch:number,n:number,krv:string,krvNorm:string,stems:string[],words:any[]}[]} */
  const verses = [];
  for (const book of NT) {
    const bd = JSON.parse(fs.readFileSync(path.join(BD, `${book}.json`), "utf8"));
    const dir = path.join(OUT, book);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const chN = Number(f.replace(".json", ""));
      const ch = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      const krvMap = new Map((bd.chapters?.[chN - 1]?.verses?.krv || []).map((x) => [x.n, x.t || ""]));
      for (const v of ch.verses || []) {
        const krv = krvMap.get(v.n) || "";
        verses.push({
          book,
          ch: chN,
          n: v.n,
          krv,
          krvNorm: normalizeKo(krv),
          stems: verseStems(krv),
          words: v.words || [],
        });
      }
    }
  }
  return verses;
}

function buildStrongStats(verses) {
  /** @type {Map<string, {gloss:Map<string,number>, parse:Map<string,number>, stemInVerse:Map<string,number>, occ:number}>} */
  const by = new Map();
  /** @type {Map<string, number>} */
  const stemDf = new Map();
  let verseN = 0;

  for (const v of verses) {
    verseN += 1;
    const stemSeen = new Set(v.stems);
    for (const s of stemSeen) stemDf.set(s, (stemDf.get(s) || 0) + 1);

    const strongsInVerse = new Set();
    for (const w of v.words) {
      if (!w.strong) continue;
      if (!by.has(w.strong)) {
        by.set(w.strong, {
          gloss: new Map(),
          parse: new Map(),
          stemInVerse: new Map(),
          occ: 0,
        });
      }
      const row = by.get(w.strong);
      row.occ += 1;
      if (w.glossKo) row.gloss.set(w.glossKo, (row.gloss.get(w.glossKo) || 0) + 1);
      if (w.parseKo) row.parse.set(w.parseKo, (row.parse.get(w.parseKo) || 0) + 1);
      strongsInVerse.add(w.strong);
    }
    for (const strong of strongsInVerse) {
      const row = by.get(strong);
      for (const s of stemSeen) {
        row.stemInVerse.set(s, (row.stemInVerse.get(s) || 0) + 1);
      }
    }
  }
  return { by, stemDf, verseN };
}

function majority(map) {
  if (!map || !map.size) return "";
  return [...map.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

const STEM_STOP = new Set(
  `그,이,저,것,수,줄,때,곳,안,못,아니,않,없,있,하,되,위,등,또,및,곧,잘,더,말,사람,예수,그리스도,하나님,주,저희,자기,우리,너희,내가,네가,이는,자는,모든,하나,같이,위해,대하,통하,인하,따라,따라,중에,앞에,뒤에,위에,아래,안에,밖에,또한,다시,이제,이미,바로,하니라,하더라,가로되,이르되,있느니라,없느니라,이루느니라,어디,어디서든지,다니사,참예한,전할`.split(
    ",",
  ),
);

function coveredByGloss(stem, gStem, glossNorm) {
  if (!stem) return true;
  if (stem === gStem || stem === glossNorm) return true;
  // gloss 몸통이 이미 어절 앞에 있으면 ①단계 substring 매칭으로 충분
  if (gStem.length >= 2 && stem.startsWith(gStem)) return true;
  if (glossNorm.length >= 2 && stem.startsWith(glossNorm)) return true;
  if (gStem.length >= 2 && gStem.startsWith(stem) && stem.length >= 2) return true;
  return false;
}

function autoKrvKoForStrong(strong, row, stemDf, verseN, posKo) {
  if (isFunctionStrong(posKo, row.parse)) return [];
  const gloss = majority(row.gloss);
  const gStem = glossStem(gloss);
  const glossNorm = normalizeKo(gloss);
  const scored = [];
  for (const [stemRaw, cnt] of row.stemInVerse) {
    if (cnt < 2) continue;
    let stem = stemRaw;
    const reduced = eojeolStem(stem) || stem;
    if (reduced.length >= 2) stem = reduced;
    // 어미 잔여(닫고→닫, 믿고→믿)
    for (const suf of ["으로써", "까지", "부터", "면서", "으며", "거나", "든지", "느니", "리라", "도다", "하고", "하며", "하여", "하니", "하면", "하라", "인즉"]) {
      if (stem.endsWith(suf) && stem.length - suf.length >= 2) stem = stem.slice(0, -suf.length);
    }
    for (const suf of ["고", "며", "니", "면", "다", "라", "네", "요", "지", "냐", "게", "치", "신", "심", "실"]) {
      if (stem.endsWith(suf) && stem.length - suf.length >= 2) {
        stem = stem.slice(0, -suf.length);
        break;
      }
    }
    if (stem.length < 2) continue;
    if (STEM_STOP.has(stem) || STEM_STOP.has(stemRaw)) continue;
    if (coveredByGloss(stem, gStem, glossNorm)) continue;

    const dice = Math.max(
      diceBigram(gStem, stem),
      diceBigram(glossNorm, stem),
      gStem.length >= 2 && stem.slice(0, 2) === gStem.slice(0, 2) ? 0.4 : 0,
    );
    const pStem = ((stemDf.get(stemRaw) || stemDf.get(stem) || 1) + 0.5) / (verseN + 1);
    const pJoint = (cnt + 0.5) / (row.occ + 1);
    const pmi = Math.log2(pJoint / pStem);
    const coverage = cnt / Math.max(1, row.occ);
    // Dice 유사형, 또는 절 커버가 높은 PMI 대응어
    const keep =
      dice >= 0.5 ||
      (dice >= 0.4 && cnt >= 3) ||
      (pmi >= 2.2 && coverage >= 0.25 && cnt >= 3);
    if (!keep) continue;
    const score = dice * 2.4 + Math.max(0, pmi) * 0.3 + coverage * 0.8 + Math.log2(1 + cnt) * 0.1;
    scored.push({ stem, cnt, dice: +dice.toFixed(3), pmi: +pmi.toFixed(3), score });
  }
  scored.sort((a, b) => b.score - a.score || b.cnt - a.cnt);
  const top = [];
  const seen = new Set();
  for (const s of scored) {
    if (top.length >= 5) break;
    if (seen.has(s.stem)) continue;
    // 더 짧은 동이 접두가 이미 있으면 스킵
    if ([...seen].some((x) => s.stem.startsWith(x) || x.startsWith(s.stem))) continue;
    seen.add(s.stem);
    top.push(s.stem);
  }
  return top;
}

function measure(verses, krvKoMap, yetmal, beonyeok) {
  let total = 0;
  let missing = 0;
  let ga = 0;
  let na = 0;
  let da = 0;
  /** after: gloss OR krvKo */
  let missingAfter = 0;

  for (const v of verses) {
    for (const w of v.words) {
      if (isFunctionWord(w)) continue;
      const gloss = (w.glossKo || "").trim();
      if (!gloss) continue;
      total += 1;
      const hit = glossHitsVerse(gloss, v.stems, v.krvNorm);
      const forms = (w.strong && krvKoMap?.get(w.strong)) || [];
      const hitKrv = forms.length > 0 && formsHitStems(forms, v.stems, v.krvNorm);
      if (!hit && !hitKrv) missingAfter += 1;
      if (hit) continue;
      missing += 1;
      const g = normalizeKo(gloss);
      const gs = glossStem(gloss);
      const yet = yetmal[gloss] || yetmal[g] || yetmal[gs] || [];
      const beon = beonyeok[gloss] || beonyeok[g] || beonyeok[gs] || [];
      if (yet.length && formsHitStems(yet, v.stems, v.krvNorm)) ga += 1;
      else if (beon.length && formsHitStems(beon, v.stems, v.krvNorm)) na += 1;
      else {
        // (나) 표에 없어도, 절 안 다른 몸통과 Dice≥0.45이면 다른 낱말 선택으로 봄
        let alt = false;
        for (const s of v.stems) {
          if (s === gs) continue;
          if (diceBigram(gs, s) >= 0.45) {
            alt = true;
            break;
          }
        }
        if (alt) na += 1;
        else da += 1;
      }
    }
  }
  return {
    totalContent: total,
    missing,
    pct: +((100 * missing) / total).toFixed(2),
    classes: { 가_옛말: ga, 나_다른낱말: na, 다_대응없음: da },
    missingAfter,
    pctAfter: +((100 * missingAfter) / total).toFixed(2),
  };
}

function mattSamples(krvKoMap) {
  const bd = JSON.parse(fs.readFileSync(path.join(BD, "matthew.json"), "utf8"));
  const pick = (chFile, n, word) => {
    const ch = JSON.parse(fs.readFileSync(path.join(OUT, "matthew", chFile), "utf8"));
    const v = ch.verses.find((x) => x.n === n);
    const w = (v?.words || []).find((x) => x.word === word);
    const krv = bd.chapters[ch.chapter - 1]?.verses?.krv?.find((x) => x.n === n)?.t || "";
    const stems = verseStems(krv);
    const krvNorm = normalizeKo(krv);
    const strong = w?.strong || "";
    const krvKo = krvKoMap.get(strong) || [];
    return {
      ref: `마 ${ch.chapter}:${n}`,
      word: w?.word,
      strong,
      glossKo: w?.glossKo,
      krvKo,
      glossInKrv: glossHitsVerse(w?.glossKo || "", stems, krvNorm),
      krvKoInKrv: formsHitStems(krvKo, stems, krvNorm),
    };
  };
  return [
    pick("3.json", 12, "ἀποθήκην"),
    pick("5.json", 10, "δεδιωγμένοι"),
    pick("10.json", 23, "διώκωσιν"),
  ];
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function main() {
  console.log("[0] paths…");
  const pathReport = {
    krvKoFiles: "public/word-study/lexicon/greek/G*.json  (앱 fetch: /word-study/lexicon/greek/{strong}.json — 동일)",
    variantsData: "data/krv-variants.json (원본)",
    variantsPublic: "public/word-study/krv-variants.json (웹 fetch 사본)",
  };
  console.log(pathReport);

  const variantsDoc = {
    옛말: YETMAL,
    번역어: BEONYEOK,
    // 앱 parseKrvVariants 호환: variants 키가 있으면 평탄 합본을 씀
    variants: { ...YETMAL, ...BEONYEOK },
  };
  fs.writeFileSync(VARIANTS_DATA, JSON.stringify(variantsDoc, null, 2) + "\n");
  fs.writeFileSync(VARIANTS_PUBLIC, JSON.stringify(variantsDoc, null, 2) + "\n");
  console.log("[3] wrote variants data+public", {
    옛말: Object.keys(YETMAL).length,
    번역어: Object.keys(BEONYEOK).length,
  });

  console.log("[load] corpus…");
  const verses = loadCorpus();
  const { by, stemDf, verseN } = buildStrongStats(verses);

  // 기존 수동 33개 스냅샷(보호)
  /** @type {Map<string, string[]>} */
  const protectedMap = new Map();
  for (const strong of PROTECTED_STRONGS) {
    const fp = path.join(LEX, `${strong}.json`);
    if (!fs.existsSync(fp)) continue;
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    protectedMap.set(strong, Array.isArray(d.krvKo) ? [...d.krvKo] : []);
  }
  console.log("[protect] existing krvKo strongs:", protectedMap.size);

  console.log("[1] measure before (norm)…");
  const before = measure(verses, null, YETMAL, BEONYEOK);
  console.log(JSON.stringify(before));

  console.log("[2] auto-generate krvKo…");
  /** @type {Map<string, string[]>} */
  const krvKoMap = new Map();
  const protectedDiff = [];
  let filledNew = 0;
  let filledTotal = 0;
  let emptiedFn = 0;

  for (const f of fs.readdirSync(LEX).filter((x) => x.endsWith(".json"))) {
    const fp = path.join(LEX, f);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    const strong = d.strong || f.replace(/\.json$/, "");
    const row = by.get(strong);
    if (!row) {
      // 신약 칩에 없음 — 기존 유지
      if (Array.isArray(d.krvKo) && d.krvKo.length) krvKoMap.set(strong, d.krvKo);
      continue;
    }

    const auto = autoKrvKoForStrong(strong, row, stemDf, verseN, d.posKo);
    if (PROTECTED_STRONGS.has(strong)) {
      // 보호: 덮어쓰지 않음. 견본 보강만(없는 항목 추가)
      const prev = protectedMap.get(strong) || [];
      const sample = SAMPLE_KRV[strong] || [];
      const merged = [...prev];
      for (const s of sample) if (!merged.includes(s)) merged.push(s);
      const setEq =
        auto.length === merged.length && auto.every((x) => merged.includes(x));
      if (!setEq) {
        protectedDiff.push({
          strong,
          lemma: d.lemma,
          glossKo: majority(row.gloss),
          kept: merged,
          auto,
        });
      }
      d.krvKo = merged;
      krvKoMap.set(strong, merged);
      filledTotal += 1;
      if (merged.join("|") !== prev.join("|")) {
        fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
      }
      continue;
    }

    if (isFunctionStrong(d.posKo, row.parse)) {
      if (Array.isArray(d.krvKo) && d.krvKo.length) {
        delete d.krvKo;
        fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
        emptiedFn += 1;
      }
      krvKoMap.set(strong, []);
      continue;
    }

    if (!auto.length) {
      if (Array.isArray(d.krvKo)) {
        delete d.krvKo;
        fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
      }
      krvKoMap.set(strong, []);
      continue;
    }

    d.krvKo = auto;
    fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
    krvKoMap.set(strong, auto);
    filledNew += 1;
    filledTotal += 1;
  }

  // 견본 보장(보호분에도)
  for (const [strong, forms] of Object.entries(SAMPLE_KRV)) {
    const fp = path.join(LEX, `${strong}.json`);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    const cur = Array.isArray(d.krvKo) ? [...d.krvKo] : [];
    for (const f of forms) if (!cur.includes(f)) cur.push(f);
    d.krvKo = cur;
    fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
    krvKoMap.set(strong, cur);
  }

  console.log("[1'] measure after…");
  const after = measure(verses, krvKoMap, YETMAL, BEONYEOK);

  // 검증 견본 + 무작위 30
  const verifyIds = ["G25", "G2222", "G4100", "G1342", "G2098"];
  const verifyTable = verifyIds.map((strong) => {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, `${strong}.json`), "utf8"));
    const row = by.get(strong);
    return {
      strong,
      lemma: d.lemma,
      glossKo: majority(row?.gloss) || d.glossKo || "",
      krvKo: d.krvKo || [],
    };
  });

  const filledIds = [...krvKoMap.entries()].filter(([, v]) => v.length).map(([k]) => k);
  const rnd = mulberry32(20261110);
  const shuffled = [...filledIds].sort(() => rnd() - 0.5);
  const random30 = shuffled.slice(0, 30).map((strong) => {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, `${strong}.json`), "utf8"));
    const row = by.get(strong);
    return {
      strong,
      lemma: d.lemma,
      glossKo: majority(row?.gloss) || "",
      krvKo: d.krvKo || [],
    };
  });

  const matt = mattSamples(krvKoMap);

  const report = {
    paths: pathReport,
    beforeNorm: before,
    afterNorm: {
      totalContent: after.totalContent,
      missingGlossOnly: after.missing,
      pctGlossOnly: after.pct,
      missingGlossOrKrvKo: after.missingAfter,
      pctGlossOrKrvKo: after.pctAfter,
      classes: after.classes,
    },
    krvKo: {
      protectedKept: protectedMap.size,
      filledNew,
      filledTotal,
      emptiedFunction: emptiedFn,
      protectedDiffCount: protectedDiff.length,
      protectedDiff: protectedDiff.slice(0, 80),
    },
    sampleKrvKo: Object.fromEntries(
      Object.keys(SAMPLE_KRV).map((s) => [s, krvKoMap.get(s)]),
    ),
    verifySamples: verifyTable,
    random30,
    variants: {
      옛말: Object.keys(YETMAL).length,
      번역어: Object.keys(BEONYEOK).length,
      removedByNorm: [{ gloss: "세례를 주다", krv: "세례", reason: "정규화(-주다)로 일치" }],
    },
    mattSamples: matt,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");

  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify({
    paths: pathReport,
    before: before,
    after: report.afterNorm,
    filledTotal,
    filledNew,
    protectedDiff: protectedDiff.length,
    variants: report.variants,
    verifySamples: verifyTable,
    random30,
    matt,
    sampleKrvKo: report.sampleKrvKo,
  }, null, 2));
}

main();
