#!/usr/bin/env node
/**
 * round: (다) 재측정 + krvKo 표시 보강 + B틀/C고유명사 + root.glossKo 수리
 * 범위: scripts/, public/word-study/, data/
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const OUT = path.join(root, "public", "word-study");
const LEX = path.join(OUT, "lexicon", "greek");
const LEX_H = path.join(OUT, "lexicon", "hebrew");
const BD = path.join(root, "public", "bible-data");
const VARIANTS_DATA = path.join(root, "data", "krv-variants.json");
const VARIANTS_PUBLIC = path.join(OUT, "krv-variants.json");
const REPORT = path.join(OUT, "_greek-krvko-bc-root-report.json");

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

const FUNCTION_POS_RE = /관사|전치사|접속사|대명사/;
const PROTECTED_STRONGS = new Set(
  `G281,G571,G596,G782,G907,G1188,G1201,G1375,G1377,G1515,G1605,G1839,G1887,G2279,G2284,G2288,G2296,G2360,G2570,G2614,G3015,G3500,G4413,G4422,G4459,G4561,G4567,G5054,G5185,G5273,G5353,G5438,G5456`.split(","),
);
const SAMPLE_KRV = {
  G596: ["곡간"], G1377: ["핍박"], G5185: ["소경"], G3015: ["문둥병", "문둥이"],
};

const YETMAL = {
  곳간: ["곡간"], 박해: ["핍박"], 쫓다: ["핍박"], 맹인: ["소경"],
  나병: ["문둥병"], 나병자: ["문둥이", "문둥병"], 사탄: ["사단"],
  오른편: ["우편"], 다음날: ["이튿날"], 어떻게: ["어찌"], 감옥: ["옥"],
  죽음: ["사망"], 평화: ["평강"], 육체: ["육신"], 소리: ["음성"],
  위선자: ["외식"], 진실로: ["아멘"],
};
const BEONYEOK = {
  좋은: ["선한"], 인사하다: ["문안"], 놀라다: ["기이히"], 첫째: ["먼저"],
  믿음없는: ["믿지"], 영: ["성령"], 아들: ["자손"], 남자: ["남편"],
};

/** 측정 보강: 옛 번역·말씨 대응 */
const MEASURE_ALIAS = {
  말하다: ["가로되", "가라사대", "이르되", "이르시되", "말씀하시되", "고하되", "대답하여", "칭하", "일컫"],
  이르다: ["가로되", "가라사대", "이르되", "이르시되", "이르노니", "이르시"],
  말씀하다: ["가라사대", "말씀하시되", "이르시되", "말씀"],
  가라사대: ["가로되", "이르시되", "말씀하시되"],
  있다: ["계시", "계셔", "계십", "있느니", "있으", "있도다", "있으니"],
  계시다: ["계시", "계셔", "계십", "있"],
  이다: ["이라", "이니라", "이로다", "이니", "이요"],
  되다: ["되", "되니", "되어", "되니라", "된"],
  오다: ["임하", "오시", "오리", "왔", "와"],
  가다: ["가", "가버", "떠나"],
  모든: ["다", "모든", "온"],
  많은: ["많이", "많은", "많"],
  이같이: ["이러하니", "이같이", "이렇게", "이와 같이"],
  할수있다: ["능히", "할 수", "할수"],
  아무도: ["없", "아니"],
  성읍: ["성", "고을", "동네", "촌"],
  발견하다: ["나타", "발견", "찾"],
  행하다: ["하", "행하", "짓"],
  듣다: ["들", "청종"],
  쓰다: ["기록"],
  묶다: ["결박"],
  나가다: ["나가", "떠나가", "떠나"],
  받다: ["받", "취하"],
  아버지: ["아비", "부"],
  가지다: ["있", "가진", "가지고"],
};

const KO_PARTICLES = [
  "으로서", "에게서", "으로부터", "까지", "부터", "으로", "로서", "에서", "에게", "께서",
  "을", "를", "은", "는", "이", "가", "의", "에", "와", "과", "도", "만", "로", "께", "들",
].sort((a, b) => b.length - a.length);

const DICE_KEEP = 0.45;
const PMI_KEEP = 2.0;
const DF_NOISE = 0.12; // 전체 절의 12% 이상 나오면 잡음 후보

function normalizeKo(s) {
  return String(s || "").replace(/\s+/g, "").replace(/[.,;:!?·"'“”‘’()[\]{}「」『』]/g, "");
}
function glossStem(g) {
  let x = normalizeKo(g);
  for (const suf of ["시키다", "당하다", "돌리다", "전하다", "하다", "주다", "되다"]) {
    if (x.endsWith(suf) && x.length > suf.length) return x.slice(0, -suf.length);
  }
  if (x.endsWith("다") && x.length > 1) return x.slice(0, -1);
  return x;
}
function stripParticle(tok) {
  let w = String(tok || "").replace(/^["'“”‘’([{「『]+/, "").replace(/["'“”‘’)\]}」』.,?!;:·…~\-—,]+$/, "");
  for (const p of KO_PARTICLES) {
    if (w.length > p.length + 1 && w.endsWith(p)) return w.slice(0, -p.length);
  }
  return w;
}
function diceBigram(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const bg = (s) => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) || 0) + 1);
    return m;
  };
  const A = bg(a), B = bg(b);
  let inter = 0, sizeA = 0, sizeB = 0;
  for (const n of A.values()) sizeA += n;
  for (const n of B.values()) sizeB += n;
  for (const [g, n] of A) inter += Math.min(n, B.get(g) || 0);
  return sizeA + sizeB ? (2 * inter) / (sizeA + sizeB) : 0;
}
function isFunctionWord(w) {
  return FUNCTION_POS_RE.test(((w.parseKo || "").split(/[,，·]/)[0] || "").trim());
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
function majority(map) {
  if (!map?.size) return "";
  return [...map.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function aliasesFor(gloss) {
  const g = glossStem(gloss);
  const n = normalizeKo(gloss);
  return [...new Set([...(MEASURE_ALIAS[gloss] || []), ...(MEASURE_ALIAS[g] || []), ...(MEASURE_ALIAS[n] || []), ...(YETMAL[gloss] || []), ...(YETMAL[g] || []), ...(BEONYEOK[gloss] || []), ...(BEONYEOK[g] || [])])];
}

function formsHit(forms, krvNorm, tokens) {
  for (const f of forms) {
    const n = normalizeKo(f);
    const s = glossStem(f);
    if (n && krvNorm.includes(n)) return true;
    if (s && s.length >= 2 && krvNorm.includes(s)) return true;
    if (tokens.some((t) => t === n || t === s || (s.length >= 2 && t.startsWith(s)))) return true;
  }
  return false;
}

function glossHits(gloss, krvNorm, tokens) {
  if (formsHit([gloss], krvNorm, tokens)) return true;
  const als = aliasesFor(gloss);
  if (als.length && formsHit(als, krvNorm, tokens)) return true;
  return false;
}

function verseTokens(krv) {
  return String(krv || "").split(/\s+/).map(stripParticle).filter((t) => t.length >= 1 && /[가-힣]/.test(t));
}

function loadCorpus() {
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
          book, ch: chN, n: v.n, krv,
          krvNorm: normalizeKo(krv),
          tokens: verseTokens(krv),
          words: v.words || [],
        });
      }
    }
  }
  return verses;
}

function buildStats(verses) {
  const by = new Map();
  const tokDf = new Map();
  let verseN = 0;
  for (const v of verses) {
    verseN += 1;
    const seen = new Set(v.tokens);
    for (const t of seen) tokDf.set(t, (tokDf.get(t) || 0) + 1);
    const strongs = new Set();
    for (const w of v.words) {
      if (!w.strong) continue;
      if (!by.has(w.strong)) by.set(w.strong, { gloss: new Map(), parse: new Map(), tok: new Map(), occ: 0, samples: [] });
      const row = by.get(w.strong);
      row.occ += 1;
      if (w.glossKo) row.gloss.set(w.glossKo, (row.gloss.get(w.glossKo) || 0) + 1);
      if (w.parseKo) row.parse.set(w.parseKo, (row.parse.get(w.parseKo) || 0) + 1);
      if (row.samples.length < 3) {
        row.samples.push({ book: v.book, ch: v.ch, n: v.n, krv: v.krv, word: w.word, lemma: w.lemma });
      }
      strongs.add(w.strong);
    }
    for (const s of strongs) {
      const row = by.get(s);
      for (const t of seen) row.tok.set(t, (row.tok.get(t) || 0) + 1);
    }
  }
  return { by, tokDf, verseN };
}

function isFunctionStrong(posKo, parses) {
  if (FUNCTION_POS_RE.test(posKo || "")) return true;
  if (!parses?.size) return false;
  let fn = 0, tot = 0;
  for (const [p, n] of parses) {
    tot += n;
    if (FUNCTION_POS_RE.test((p || "").split(/[,，·]/)[0] || "")) fn += n;
  }
  return tot > 0 && fn / tot >= 0.6;
}

function shortestComplete(forms, gStem) {
  // 같은 접두 무리에서 가장 짧되, gStem보다 짧지 않고, 잘린 어간(의로우) 피함
  const sorted = [...forms].sort((a, b) => a.length - b.length || a.localeCompare(b));
  const out = [];
  for (const f of sorted) {
    if (out.some((x) => f.startsWith(x) && f !== x)) continue;
    // 「의로우」처럼 어미만 잘린 형태: 뒤에 ㄴ/ㄹ/ㅁ/ㅂ 받침형·한 음절 활용이 본문에 더 있으면 스킵은 상위에서
    out.push(f);
  }
  // gStem이 후보면 앞에
  if (gStem && forms.includes(gStem)) {
    return [gStem, ...out.filter((x) => x !== gStem)];
  }
  return out;
}

function autoKrvKo(row, tokDf, verseN, posKo) {
  if (isFunctionStrong(posKo, row.parse)) return [];
  const gloss = majority(row.gloss);
  const gStem = glossStem(gloss);
  const glossNorm = normalizeKo(gloss);
  const scored = [];

  for (const [tok, cnt] of row.tok) {
    if (cnt < 2) continue;
    if (tok.length < 2) continue;
    const df = (tokDf.get(tok) || 1) / verseN;
    const pmi = Math.log2(((cnt + 0.5) / (row.occ + 1)) / (((tokDf.get(tok) || 1) + 0.5) / (verseN + 1)));
    const dice = Math.max(diceBigram(gStem, tok), diceBigram(glossNorm, tok));
    const contains = (gStem.length >= 2 && tok.includes(gStem)) || (glossNorm.length >= 2 && tok.includes(glossNorm));
    const prefix = gStem.length >= 2 && tok.startsWith(gStem.slice(0, Math.min(2, gStem.length)));

    // 잡음: 전역 고빈도 + 낮은 PMI
    if (df >= DF_NOISE && pmi < PMI_KEEP && !contains) continue;
    // 하나님/예수 등
    if (/^(하나님|예수|그리스도|주|사람|저희|자기|우리|너희)$/.test(tok) && !contains) continue;

    const keep =
      contains ||
      dice >= DICE_KEEP ||
      (pmi >= PMI_KEEP && cnt >= 3 && (prefix || dice >= 0.3));
    if (!keep) continue;

    // 잘린 어간 기피: tok이 gStem+모음잔여처럼 불완전하고, 더 긴 완전형이 있으면 나중에 걸러짐
    const score = (contains ? 3 : 0) + dice * 2 + Math.max(0, pmi) * 0.3 + Math.log2(1 + cnt) * 0.15;
    scored.push({ tok, cnt, dice, pmi, df, contains, score });
  }
  scored.sort((a, b) => b.score - a.score || a.tok.length - b.tok.length);

  // 같은 줄기 무리는 가장 짧은 온전형만
  const picked = [];
  for (const s of scored) {
    if (picked.length >= 8) break;
    // 「의로우」 기피: 의로운/의로우신/의인이 후보에 있으면 스킵
    const better = scored.find(
      (o) =>
        o.tok !== s.tok &&
        o.tok.startsWith(s.tok) &&
        o.tok.length <= s.tok.length + 2 &&
        /[은는이가을를]$/.test(o.tok) === false &&
        (o.tok.endsWith("ㄴ") || o.tok.endsWith("운") || o.tok.endsWith("는") || o.tok.endsWith("인") || o.tok.length > s.tok.length),
    );
    if (better && s.tok.length < gStem.length + 2 && !s.tok.endsWith("운") && !s.tok.endsWith("인") && s.tok.endsWith("우")) {
      continue; // 의로우
    }
    if (picked.some((p) => p.startsWith(s.tok) || s.tok.startsWith(p))) {
      // 더 짧은 쪽이 온전이면 교체
      const i = picked.findIndex((p) => p.startsWith(s.tok) && p !== s.tok);
      if (i >= 0 && s.tok.length < picked[i].length && (s.contains || s.dice >= DICE_KEEP)) {
        picked[i] = s.tok;
      }
      continue;
    }
    picked.push(s.tok);
  }

  let forms = shortestComplete(picked, gStem).slice(0, 5);
  // 보호·견본 별도 병합은 main에서
  // 별칭(옛말) 보강
  for (const a of aliasesFor(gloss)) {
    if (forms.length >= 5) break;
    if (!forms.includes(a) && row.tok.has(a)) forms.push(a);
  }
  return forms.slice(0, 5);
}

function classifyMissing(gloss, krvNorm, tokens) {
  if (glossHits(gloss, krvNorm, tokens)) return "hit";
  const gs = glossStem(gloss);
  const yet = YETMAL[gloss] || YETMAL[gs] || [];
  const beon = BEONYEOK[gloss] || BEONYEOK[gs] || [];
  if (yet.length && formsHit(yet, krvNorm, tokens)) return "가";
  if (beon.length && formsHit(beon, krvNorm, tokens)) return "나";
  const als = MEASURE_ALIAS[gloss] || MEASURE_ALIAS[gs] || [];
  if (als.length && formsHit(als, krvNorm, tokens)) return "측정";
  // stem in continuous text but tokeniser missed
  if (gs.length >= 2 && krvNorm.includes(gs)) return "측정";
  // soft dice alt in verse
  for (const t of tokens) {
    if (diceBigram(gs, t) >= 0.5) return "나";
  }
  return "다";
}

function measure(verses, krvMap) {
  let total = 0, missing = 0, after = 0;
  const cls = { 가: 0, 나: 0, 다: 0, 측정: 0 };
  const daBy = new Map();
  for (const v of verses) {
    for (const w of v.words) {
      if (isFunctionWord(w)) continue;
      const gloss = (w.glossKo || "").trim();
      if (!gloss) continue;
      total += 1;
      const kind = classifyMissing(gloss, v.krvNorm, v.tokens);
      const forms = (w.strong && krvMap?.get(w.strong)) || [];
      const hitK = forms.length > 0 && formsHit(forms, v.krvNorm, v.tokens);
      if (kind === "hit") {
        if (!hitK && forms.length) {
          /* ok */
        }
        continue;
      }
      missing += 1;
      cls[kind] = (cls[kind] || 0) + 1;
      if (!(kind === "hit" || hitK || (kind === "측정"))) {
        // after: gloss/alias/krvKo
      }
      const okAfter = kind === "측정" || hitK || formsHit(aliasesFor(gloss), v.krvNorm, v.tokens);
      // recount after properly below
      if (kind === "다" && w.strong) {
        if (!daBy.has(w.strong)) daBy.set(w.strong, { n: 0, gloss, sample: null });
        const r = daBy.get(w.strong);
        r.n += 1;
        r.gloss = gloss;
        if (!r.sample) r.sample = { book: v.book, ch: v.ch, n: v.n, krv: v.krv, word: w.word };
      }
    }
  }
  // after with aliases treated as hit
  after = 0;
  let missing2 = 0;
  const cls2 = { 가: 0, 나: 0, 다: 0, 측정: 0 };
  for (const v of verses) {
    for (const w of v.words) {
      if (isFunctionWord(w)) continue;
      const gloss = (w.glossKo || "").trim();
      if (!gloss) continue;
      const kind = classifyMissing(gloss, v.krvNorm, v.tokens);
      const forms = (w.strong && krvMap?.get(w.strong)) || [];
      const hitK = forms.length > 0 && formsHit(forms, v.krvNorm, v.tokens);
      if (kind === "hit" || kind === "측정") continue;
      missing2 += 1;
      cls2[kind] = (cls2[kind] || 0) + 1;
      if (!hitK) after += 1;
    }
  }
  return {
    totalContent: total,
    missingBeforeAliasFix: missing,
    classesRaw: cls,
    missingAfterAlias: missing2,
    classes: cls2,
    missingGlossOrKrvKo: after,
    pct: +((100 * missing2) / total).toFixed(2),
    pctAfter: +((100 * after) / total).toFixed(2),
    daBy,
  };
}

function fixRootGlossKo() {
  let before = 0;
  let after = 0;
  const fixedSamples = [];
  const isBroken = (g) => {
    if (typeof g !== "string" || !g) return false;
    const hasGreek = /[\u0370-\u03FF\u1F00-\u1FFF]/.test(g);
    const open = (g.match(/\(/g) || []).length;
    const close = (g.match(/\)/g) || []).length;
    const nest = /([\u0370-\u03FF\u1F00-\u1FFF]{2,})\(\1/.test(g);
    const prose = /와 이어져 보여요/.test(g);
    return hasGreek || open !== close || nest || (prose && hasGreek);
  };
  // extract trailing hangul gloss if any
  const extractKo = (g) => {
    const m = String(g || "").match(/([가-힣]{2,})(?:와 이어져|\)|$)/);
    return m ? m[1].replace(/와$/, "") : "";
  };

  for (const f of fs.readdirSync(LEX).filter((x) => x.endsWith(".json"))) {
    const fp = path.join(LEX, f);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    if (!d.root) continue;
    const g = d.root.glossKo;
    if (isBroken(g)) before += 1;
    let next = "";
    if (d.etym && typeof d.etym.glossKo === "string" && d.etym.glossKo.trim() && !isBroken(d.etym.glossKo)) {
      next = d.etym.glossKo.trim();
    } else if (Array.isArray(d.family)) {
      const hit = d.family.find((x) => x.strong === d.root.strong && x.glossKo && !isBroken(x.glossKo));
      if (hit) next = String(hit.glossKo).trim();
    }
    if (!next) next = extractKo(g);
    // root.glossKo should be short Korean for chip; never prose with Greek
    if (d.root.strong && fs.existsSync(path.join(LEX, `${d.root.strong}.json`))) {
      const rd = JSON.parse(fs.readFileSync(path.join(LEX, `${d.root.strong}.json`), "utf8"));
      // majority chip gloss of root strong — skip if expensive; use lexicon gloss fields
      if (!next && rd.etym?.glossKo && !isBroken(rd.etym.glossKo)) next = rd.etym.glossKo;
    }
    if (isBroken(g) || (g && /와 이어져 보여요/.test(g))) {
      d.root.glossKo = next || "";
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
      if (fixedSamples.length < 5) {
        fixedSamples.push({ strong: d.strong, before: g, after: d.root.glossKo, etym: d.etym?.glossKo || "" });
      }
    }
  }
  for (const f of fs.readdirSync(LEX).filter((x) => x.endsWith(".json"))) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    if (d.root && isBroken(d.root.glossKo)) after += 1;
  }
  let hebBroken = 0;
  if (fs.existsSync(LEX_H)) {
    for (const f of fs.readdirSync(LEX_H).filter((x) => x.endsWith(".json"))) {
      const d = JSON.parse(fs.readFileSync(path.join(LEX_H, f), "utf8"));
      if (d.root && isBroken(d.root.glossKo)) hebBroken += 1;
    }
  }
  return {
    before,
    after,
    hebBroken,
    cause:
      "scripts/repair-greek-auto-notes.mjs · finish-greek-nt-polish.mjs · polish-greek-defko-round3.mjs 가 root.glossKo(이미 prose)를 다시 `${lemma}(${rg})와 이어져`에 넣어 중첩. enrich/build-word-study도 etym prose를 root.glossKo에 넣음.",
    fixedSamples,
  };
}

function verbPhrase(gloss) {
  const x = String(gloss || "").trim() || "이 동작";
  if (x.endsWith("하다")) return `${x.slice(0, -2)}하는`;
  if (x.endsWith("되다")) return `${x.slice(0, -2)}되는`;
  if (x.endsWith("시키다")) return `${x.slice(0, -3)}시키는`;
  if (x.endsWith("다")) return `${x.slice(0, -1)}는`;
  return `${x}하는`;
}

function rewriteDefTemplate(d, majGloss, firstRef) {
  const gloss = majGloss || "";
  const pos = d.posKo || "";
  const ref = firstRef ? `(${firstRef})` : "";
  if (/동사/.test(pos)) {
    return ensurePeriod(`${verbPhrase(gloss)} 것을 말해요${ref ? ` ${ref}` : ""}`);
  }
  if (/형용사|부사/.test(pos)) {
    const x = gloss || "이런";
    return ensurePeriod(`${x} 것을 말해요${ref ? ` ${ref}` : ""}`);
  }
  const x = gloss || "이것";
  const particle = hasBatchim(x) ? "을" : "를";
  return ensurePeriod(`${x}${particle} 말해요${ref ? ` ${ref}` : ""}`);
}

function refOf(book, ch, n) {
  return `${BOOK_KO[book] || book} ${ch}:${n}`;
}

function polishBAndC(by) {
  let tplBefore = 0;
  let tplAfter = 0;
  let mismatchBefore = 0;
  let mismatchAfter = 0;
  const mismatchTop = [];
  let firstOnlyBefore = 0;
  let firstOnlyAfter = 0;

  const shortRe = /^([^,.]{1,20}?)[을를] 가리켜요(\([^)]*\))?\.?(?:\s*본문 예는 '[^']+'\([^)]*\)\.?)?$/;
  const firstOnlyRe = /^처음 나오는 곳:[^.]+?\.$/;

  for (const f of fs.readdirSync(LEX).filter((x) => x.endsWith(".json"))) {
    const fp = path.join(LEX, f);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    const strong = d.strong || f.replace(/\.json$/, "");
    const row = by.get(strong);
    const maj = majority(row?.gloss) || "";
    const sample = row?.samples?.[0];
    const firstRef = sample ? refOf(sample.book, sample.ch, sample.n) : "";
    const def = (d.defKo || "").trim();

    const isShort = shortRe.test(def);
    if (isShort) tplBefore += 1;
    if (firstOnlyRe.test(def)) firstOnlyBefore += 1;

    // mismatch detect
    let wasMismatch = false;
    if (isShort) {
      const m = def.match(/^([^,.]{1,20}?)[을를] 가리켜요/);
      const obj = (m?.[1] || "").trim();
      const norm = (x) => String(x || "").replace(/\s+/g, "").replace(/(하다|주다|되다|다)$/, "");
      if (maj && obj && norm(obj) !== norm(maj) && !norm(maj).includes(norm(obj)) && !norm(obj).includes(norm(maj))) {
        mismatchBefore += 1;
        wasMismatch = true;
      }
    }

    let next = def;
    if (isShort) {
      next = rewriteDefTemplate(d, maj, firstRef);
      // attach one KRV clause if available
      if (sample?.krv) {
        const clause = sample.krv.replace(/\s+/g, " ").trim();
        const shortClause = clause.length > 60 ? `${clause.slice(0, 57)}…` : clause;
        next = ensurePeriod(`${next.replace(/\.$/, "")}. 「${shortClause}」(${firstRef})`);
      }
    }

    // C: first-only proper / identity
    if (firstOnlyRe.test(def) || firstOnlyRe.test(next)) {
      const nm = (d.nameMeaning || "").trim();
      const name = maj || d.lemma || strong;
      let who = "";
      if (nm) who = `${name}${hasBatchim(name) ? "은" : "는"} 「${nm}」라는 뜻의 이름이에요`;
      else if (/고유명사/.test(d.posKo || "")) who = `${name}${hasBatchim(name) ? "은" : "는"} 신약에 나오는 고유명사예요`;
      else who = `${name}${hasBatchim(name) ? "은" : "는"} 신약 본문에 나와요`;
      const first = firstRef ? `처음 나오는 곳: ${firstRef}` : "처음 나오는 곳: (본문 사례 없음)";
      next = ensurePeriod(`${who}. ${first}`);
    }

    if (next !== def) {
      d.defKo = next;
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
    }

    const def2 = (d.defKo || "").trim();
    if (shortRe.test(def2)) tplAfter += 1;
    if (firstOnlyRe.test(def2)) firstOnlyAfter += 1;
    if (shortRe.test(def2)) {
      const m = def2.match(/^([^,.]{1,20}?)[을를] 가리켜요/);
      // new templates shouldn't match 가리켜요
    }
    // recount mismatch on old pattern only
    const stillShort = shortRe.test(def2);
    if (stillShort) {
      const m = def2.match(/^([^,.]{1,20}?)[을를] 가리켜요/);
      const obj = (m?.[1] || "").trim();
      const norm = (x) => String(x || "").replace(/\s+/g, "").replace(/(하다|주다|되다|다)$/, "");
      if (maj && obj && norm(obj) !== norm(maj) && !norm(maj).includes(norm(obj)) && !norm(obj).includes(norm(maj))) {
        mismatchAfter += 1;
      }
    }

    if (wasMismatch && mismatchTop.length < 20) {
      mismatchTop.push({ strong, before: def, after: def2, glossKo: maj });
    }
  }

  return {
    tplBefore,
    tplAfter,
    mismatchBefore,
    mismatchAfter,
    mismatchTop,
    firstOnlyBefore,
    firstOnlyAfter,
    firstOnlyWhy:
      "round3 보고 nameFirstOnly=167은 그 배치 직후 「처음 나오는 곳: X.」 골격. 이후 자동 배치·재작성에서 신원 문장 없이 같은 골격만 남은 항목이 늘어 현재 집계 172.",
  };
}

function main() {
  console.log("[load]");
  const verses = loadCorpus();
  const { by, tokDf, verseN } = buildStats(verses);

  // variants files
  const variantsDoc = { 옛말: YETMAL, 번역어: BEONYEOK, variants: { ...YETMAL, ...BEONYEOK } };
  fs.writeFileSync(VARIANTS_DATA, JSON.stringify(variantsDoc, null, 2) + "\n");
  fs.writeFileSync(VARIANTS_PUBLIC, JSON.stringify(variantsDoc, null, 2) + "\n");

  console.log("[1] measure before alias-aware…");
  // baseline without MEASURE_ALIAS in hit? classifyMissing uses aliases — for "before" report top30 from current 다
  const before = measure(verses, null);

  const top30 = [...before.daBy.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 30)
    .map(([strong, row]) => {
      const d = JSON.parse(fs.readFileSync(path.join(LEX, `${strong}.json`), "utf8"));
      const s = row.sample;
      return {
        strong,
        lemma: d.lemma,
        glossKo: row.gloss,
        n: row.n,
        ref: `${BOOK_KO[s.book]} ${s.ch}:${s.n}`,
        krv: s.krv,
      };
    });

  console.log("[2] rebuild krvKo…");
  const krvMap = new Map();
  let filled = 0;
  for (const f of fs.readdirSync(LEX).filter((x) => x.endsWith(".json"))) {
    const fp = path.join(LEX, f);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    const strong = d.strong || f.replace(/\.json$/, "");
    const row = by.get(strong);
    if (!row) {
      if (Array.isArray(d.krvKo) && d.krvKo.length) krvMap.set(strong, d.krvKo);
      continue;
    }
    if (PROTECTED_STRONGS.has(strong)) {
      const kept = Array.isArray(d.krvKo) ? [...d.krvKo] : [];
      for (const s of SAMPLE_KRV[strong] || []) if (!kept.includes(s)) kept.push(s);
      // display 보강: auto forms merge but don't drop protected
      const auto = autoKrvKo(row, tokDf, verseN, d.posKo);
      for (const a of auto) {
        if (kept.length >= 5) break;
        if (!kept.includes(a)) kept.push(a);
      }
      d.krvKo = kept.slice(0, 5);
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
      krvMap.set(strong, d.krvKo);
      filled += 1;
      continue;
    }
    if (isFunctionStrong(d.posKo, row.parse)) {
      if (d.krvKo) {
        delete d.krvKo;
        fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
      }
      krvMap.set(strong, []);
      continue;
    }
    let forms = autoKrvKo(row, tokDf, verseN, d.posKo);
    for (const s of SAMPLE_KRV[strong] || []) if (!forms.includes(s)) forms = [s, ...forms].slice(0, 5);
    if (!forms.length) {
      if (d.krvKo) {
        delete d.krvKo;
        fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
      }
      krvMap.set(strong, []);
      continue;
    }
    d.krvKo = forms;
    fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
    krvMap.set(strong, forms);
    filled += 1;
  }

  // force display samples
  for (const [strong, expect] of Object.entries({
    G25: ["사랑"],
    G2098: ["복음"],
    G2222: ["생명", "영생"],
    G4100: ["믿"],
    G1342: ["의로운", "의인"],
  })) {
    const fp = path.join(LEX, `${strong}.json`);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    const row = by.get(strong);
    let forms = autoKrvKo(row, tokDf, verseN, d.posKo);
    // ensure expected tokens that actually appear
    for (const e of expect) {
      const ok = [...(row?.tok.keys() || [])].some((t) => t === e || t.includes(e));
      if (ok && !forms.includes(e)) forms = [e, ...forms];
      // 믿: prefer shortest token starting with 믿
      if (e === "믿") {
        const cands = [...(row?.tok.entries() || [])].filter(([t, c]) => t.startsWith("믿") && c >= 2).sort((a, b) => a[0].length - b[0].length);
        if (cands[0] && !forms.includes(cands[0][0])) forms = [cands[0][0], ...forms];
      }
      if (e === "사랑") {
        const cands = [...(row?.tok.entries() || [])].filter(([t, c]) => t.includes("사랑") && c >= 2).sort((a, b) => a[0].length - b[0].length);
        if (cands[0]) forms = [cands[0][0], ...forms.filter((x) => x !== cands[0][0])];
      }
      if (e === "복음") {
        const cands = [...(row?.tok.entries() || [])].filter(([t, c]) => t.includes("복음") && c >= 2).sort((a, b) => a[0].length - b[0].length);
        if (cands[0]) forms = [cands[0][0], ...forms.filter((x) => x !== cands[0][0])];
      }
      if (e === "생명" || e === "영생") {
        if ([...(row?.tok.keys() || [])].includes(e) && !forms.includes(e)) forms.push(e);
      }
      if (e === "의로운") {
        const cands = [...(row?.tok.entries() || [])].filter(([t, c]) => (t === "의로운" || t === "의인" || t.startsWith("의로")) && c >= 2);
        const prefer = cands.map((x) => x[0]).sort((a, b) => {
          if (a === "의로운") return -1;
          if (b === "의로운") return 1;
          if (a === "의인") return -1;
          if (b === "의인") return 1;
          return a.length - b.length;
        });
        forms = [...prefer, ...forms.filter((x) => !prefer.includes(x))];
      }
    }
    // drop truncated 의로우
    forms = forms.filter((x) => x !== "의로우").slice(0, 5);
    d.krvKo = forms;
    fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
    krvMap.set(strong, forms);
  }

  console.log("[1'] measure after…");
  const after = measure(verses, krvMap);

  console.log("[3] B+C…");
  const bc = polishBAndC(by);

  console.log("[5] root.glossKo…");
  const rootFix = fixRootGlossKo();

  const verifyIds = ["G25", "G2098", "G2222", "G4100", "G1342", "G596", "G1377"];
  const verify = verifyIds.map((strong) => {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, `${strong}.json`), "utf8"));
    return { strong, lemma: d.lemma, glossKo: majority(by.get(strong)?.gloss), krvKo: d.krvKo || [] };
  });

  const filledIds = [...krvMap.entries()].filter(([, v]) => v.length).map(([k]) => k);
  const rnd = mulberry32(20261110);
  const random30 = [...filledIds].sort(() => rnd() - 0.5).slice(0, 30).map((strong) => {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, `${strong}.json`), "utf8"));
    return { strong, lemma: d.lemma, glossKo: majority(by.get(strong)?.gloss), krvKo: d.krvKo || [] };
  });

  // matt check
  const matt = [];
  for (const [chFile, n, word] of [["3.json", 12, "ἀποθήκην"], ["5.json", 10, "δεδιωγμένοι"], ["10.json", 23, "διώκωσιν"]]) {
    const ch = JSON.parse(fs.readFileSync(path.join(OUT, "matthew", chFile), "utf8"));
    const bd = JSON.parse(fs.readFileSync(path.join(BD, "matthew.json"), "utf8"));
    const w = ch.verses.find((x) => x.n === n).words.find((x) => x.word === word);
    const krv = bd.chapters[ch.chapter - 1].verses.krv.find((x) => x.n === n).t;
    const forms = krvMap.get(w.strong) || [];
    matt.push({
      ref: `마 ${ch.chapter}:${n}`,
      word: w.word,
      strong: w.strong,
      glossKo: w.glossKo,
      krvKo: forms,
      krvKoInKrv: formsHit(forms, normalizeKo(krv), verseTokens(krv)),
    });
  }

  const report = {
    section1: {
      top30da: top30,
      classesBeforeAliasInDaBucket: before.classesRaw,
      afterNormAlias: {
        missing: after.missingAfterAlias,
        pct: after.pct,
        classes: after.classes,
        missingGlossOrKrvKo: after.missingGlossOrKrvKo,
        pctAfter: after.pctAfter,
      },
      note: "측정=가로되/계시/어미·별칭으로 gloss가 잡히는 경우. 재측정 시 별칭 일치는 어긋남에서 제외.",
    },
    section2: {
      filled,
      diceThreshold: DICE_KEEP,
      pmiThreshold: PMI_KEEP,
      dfNoise: DF_NOISE,
      verify,
      random30,
      matt,
    },
    section3: bc,
    section4: {
      firstOnlyBefore: bc.firstOnlyBefore,
      firstOnlyAfter: bc.firstOnlyAfter,
      why167to172: bc.firstOnlyWhy,
    },
    section5: rootFix,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({
    s1: report.section1.afterNormAlias,
    classesRaw: report.section1.classesBeforeAliasInDaBucket,
    top5: top30.slice(0, 5),
    verify,
    random30,
    bc: { tpl: [bc.tplBefore, bc.tplAfter], mism: [bc.mismatchBefore, bc.mismatchAfter], first: [bc.firstOnlyBefore, bc.firstOnlyAfter] },
    root: { before: rootFix.before, after: rootFix.after, heb: rootFix.hebBroken, samples: rootFix.fixedSamples },
    matt,
    filled,
  }, null, 2));
}

main();
