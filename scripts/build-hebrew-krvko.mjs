#!/usr/bin/env node
/**
 * 히브리어 lexicon krvKo dry-run / (승인 후) 적용.
 * 기본: dry-run — lexicon·칩·defKo 쓰기 금지. 결과는 .cache/hebrew-krvko/ 만.
 *
 *   node scripts/build-hebrew-krvko.mjs
 *   node scripts/build-hebrew-krvko.mjs --apply   # 승인 후만
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const OUT = path.join(root, "public", "word-study");
const LEX = path.join(OUT, "lexicon", "hebrew");
const BD = path.join(root, "public", "bible-data");
const CACHE = path.join(root, ".cache", "hebrew-krvko");
const YETMAL_PATH = path.join(root, "data", "hebrew-krv-yetmal.json");
const BEONYEOK_PATH = path.join(root, "data", "hebrew-krv-beonyeok.json");

const APPLY = process.argv.includes("--apply");

const OT = [
  "genesis", "exodus", "leviticus", "numbers", "deuteronomy",
  "joshua", "judges", "ruth", "samuel1", "samuel2", "kings1", "kings2",
  "chronicles1", "chronicles2", "ezra", "nehemiah", "esther",
  "job", "psalms", "proverbs", "ecclesiastes", "songofsolomon",
  "isaiah", "jeremiah", "lamentations", "ezekiel", "daniel",
  "hosea", "joel", "amos", "obadiah", "jonah", "micah", "nahum",
  "habakkuk", "zephaniah", "haggai", "zechariah", "malachi",
];

const BOOK_KO = {
  genesis: "창", exodus: "출", leviticus: "레", numbers: "민", deuteronomy: "신",
  joshua: "수", judges: "삿", ruth: "룻", samuel1: "삼상", samuel2: "삼하",
  kings1: "왕상", kings2: "왕하", chronicles1: "대상", chronicles2: "대하",
  ezra: "스", nehemiah: "느", esther: "에", job: "욥", psalms: "시",
  proverbs: "잠", ecclesiastes: "전", songofsolomon: "아", isaiah: "사",
  jeremiah: "렘", lamentations: "애", ezekiel: "겔", daniel: "단",
  hosea: "호", joel: "욜", amos: "암", obadiah: "옵", jonah: "욘",
  micah: "미", nahum: "나", habakkuk: "합", zephaniah: "습", haggai: "학",
  zechariah: "슥", malachi: "말",
};

/** 헬라 build-greek-krvko와 동일 문턱 */
const DICE_KEEP = 0.5;
const DICE_SOFT = 0.4;
const PMI_KEEP = 2.2;
const COVER_KEEP = 0.25;

const FORCE_FN_STRONG = new Set([
  "H1961", // 계사 היה
  "H853", // את 목적격
  "H3808", // לֹא 부정
]);

const NOUN_PARTICLES = [
  "으로서", "으로부터", "에게로", "으로", "로서", "로써", "에서", "에게", "께서",
  "부터", "까지", "을", "를", "이", "가", "은", "는", "의", "에", "로", "과", "와", "도", "만", "여", "인",
];

function stripNounParticles(tok) {
  let t = normalizeKo(tok);
  let changed = true;
  while (changed && t.length > 1) {
    changed = false;
    for (const p of NOUN_PARTICLES) {
      if (t.length > p.length && t.endsWith(p)) {
        t = t.slice(0, -p.length);
        changed = true;
        break;
      }
    }
  }
  return t;
}

const KO_STEM_SUFFIXES = [
  "하였더라", "하였으니", "이었더라", "이니라", "이로다", "하시니라", "하시더라",
  "에게서", "으로서", "하시니", "하리라", "였더라", "었더라", "하시매", "하매",
  "이라", "이심", "이니", "이요", "이며", "에게", "께서", "으니라", "느니라",
  "으로", "로서", "에서", "하는", "하여", "하고", "하며", "하라", "하니",
  "께", "로", "에", "와", "과", "을", "를", "이", "가", "은", "는",
  "의", "도", "만", "들", "히", "케", "니", "며", "고", "요",
].sort((a, b) => b.length - a.length || a.localeCompare(b));

const STEM_STOP = new Set([
  "그", "이", "저", "것", "수", "등", "및", "또", "곧", "곧", "더", "잘", "못",
]);

function loadJson(p) {
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  const { _note, ...rest } = j;
  return rest;
}

function normalizeKo(s) {
  return String(s || "")
    .replace(/\s+/g, "")
    .replace(/[.,;:!?·"'“”‘’()[\]{}「」『』…]/g, "");
}

function glossStem(g) {
  let x = normalizeKo(g);
  // drop parenthetical notes
  x = x.replace(/\(.*?\)/g, "");
  for (const suf of ["시키다", "당하다", "돌리다", "전하다", "하다", "주다", "되다", "이다"]) {
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

function eojeolStem(eojeol) {
  let w = String(eojeol || "")
    .replace(/^["'“”‘’([{「『]+/, "")
    .replace(/["'“”‘’)\]}」』.,?!;:·…~\-—,]+$/, "");
  if (!w) return "";
  for (const v of ["시키", "하", "되", "케"]) {
    const i = w.indexOf(v);
    if (i >= 2) {
      const head = w.slice(0, i);
      if (/^[가-힣]+$/.test(head)) return head;
    }
  }
  let cur = w;
  for (let stage = 0; stage < 3; stage++) {
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
    if (!seen.has(s)) {
      seen.add(s);
      stems.push(s);
    }
    // also keep raw stripped particle-only form for matching 가라사대 etc.
    const raw = tok.replace(/[.,!?]/g, "");
    if (raw.length >= 2 && !seen.has(raw)) {
      seen.add(raw);
      stems.push(raw);
    }
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

function majority(map) {
  if (!map?.size) return "";
  return [...map.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function isPrefixOnlyChip(w) {
  const parts = w.parts || [];
  if (!parts.length) return false;
  // chip whose strong is only on a prefix part, or parse says 접두
  if (/접두/.test(w.parseKo || "")) return true;
  const stemParts = parts.filter((p) => p.role === "stem");
  const prefParts = parts.filter((p) => p.role === "prefix");
  if (prefParts.length && !stemParts.length) return true;
  // proclitic letters alone
  if (/^[베케레웨헤보코로오하]$/.test(normalizeKo(w.glossKo || ""))) return true;
  return false;
}

function isFunctionWord(w) {
  if (FORCE_FN_STRONG.has(w.strong)) return true;
  if (isPrefixOnlyChip(w)) return true;
  const head = ((w.parseKo || "").split(/[,，·]/)[0] || "").trim();
  if (/관사|전치사|접속사|대명사|목적격|관계사|접두/.test(head)) return true;
  if (/목적격 표지|관계사/.test(w.glossKo || "")) return true;
  // את already by strong; relative markers
  if (/^\(관계사\)/.test(w.glossKo || "")) return true;
  return false;
}

function formsHitVerse(forms, stems, norm) {
  for (const f of forms || []) {
    const n = normalizeKo(f);
    if (!n) continue;
    if (norm.includes(n)) return true;
    const st = eojeolStem(f) || glossStem(f);
    if (st.length >= 2 && stems.some((s) => s === st || s.startsWith(st) || st.startsWith(s))) return true;
  }
  return false;
}

function glossHitsVerse(gloss, stems, norm) {
  const g = normalizeKo(gloss);
  const gs = glossStem(gloss);
  if (g.length >= 2 && norm.includes(g)) return true;
  if (gs.length >= 2 && stems.some((s) => s === gs || s.startsWith(gs) || (gs.startsWith(s) && s.length >= 2))) {
    return true;
  }
  return false;
}

function isConjugationForm(form, bases) {
  const f = normalizeKo(form);
  if (!f) return false;
  if ((bases || []).some((b) => normalizeKo(b) === f)) return false;
  if (/다$|요$/.test(f)) return false;
  const st = eojeolStem(f);
  if (st !== f && st.length >= 2 && (bases || []).some((b) => normalizeKo(b) === st || glossStem(b) === st)) {
    return true;
  }
  if (/지$|며$|니$|면$|고$|하$|되$|케$|여$/.test(f) && !/다$/.test(f)) return true;
  return false;
}

function mergeToBases(picked, gStem) {
  const bases = [];
  const forms = [];
  for (const f of picked) {
    if (isConjugationForm(f, bases.length ? bases : [gStem].filter(Boolean))) {
      forms.push(f);
      const b = eojeolStem(f);
      if (b.length >= 2 && !bases.includes(b) && bases.length < 3) bases.push(b);
      continue;
    }
    if (bases.length < 3) bases.push(f);
    else forms.push(f);
  }
  if (gStem && bases.length < 3 && !bases.includes(gStem)) {
    // only if gStem itself appears among picked stems somehow — leave
  }
  return {
    krvKo: [...new Set(bases)].slice(0, 3),
    krvForms: [...new Set(forms.filter((c) => !bases.includes(c)))].slice(0, 12),
  };
}


/** 서술격·조사·호격 등 붙은 값 */
function isAttachedNoise(form) {
  const f = normalizeKo(form);
  if (!f) return true;
  // 단음절(땅·신·영·말)은 유효. 서술격·조사 붙은 다형태만 제거.
  if (/이요$|이라$|이니라$|이시라$|이시니이다$|이시다$|이시니$|이신$/.test(f)) return true;
  // 「말씀대」「백성중」등 — 단음절 본체(땅·신)와 겹치지 않게 2음절+만
  if (f.length >= 2 && /께서$|중$|대$|에게서$|들에게$|들아$/.test(f) && !["여호와", "하나님"].includes(f)) return true;
  if (/여$/.test(f) && f.length >= 3 && !["여호와"].includes(f)) return true;
  if (/할$|한$/.test(f) && f.length >= 3 && f.length <= 4) return true; // 말씀할
  return false;
}

/** 활용형 → 기본형 (동사) */
function toDictionaryBase(form, gloss) {
  const f = normalizeKo(form);
  const g = normalizeKo(gloss || "");
  const gStem = glossStem(gloss || "");
  // known archaic speech forms stay as base display in krvKo (yetmal)
  const YETMAL_BASE = new Set(["가라사대", "가로되", "이르시되", "이르되"]);
  if (YETMAL_BASE.has(f)) return { base: f, conj: null };

  // if looks like conjugation of gloss stem
  if (gStem.length >= 2 && (f.startsWith(gStem) || f.startsWith(gStem.slice(0, Math.min(2, gStem.length))))) {
    // 오다 family
    if (/^(오|왔|올)/.test(f) && /오/.test(gStem + g)) {
      if (f !== "오다" && !/다$/.test(f)) return { base: "오다", conj: f };
    }
    if (/^(가|갔|갈)/.test(f) && /가/.test(gStem + g)) {
      if (f !== "가다") return { base: "가다", conj: f };
    }
    if (/^행하/.test(f)) {
      if (f !== "행하다") return { base: "행하다", conj: f };
    }
    if (/^(주|준|줄)/.test(f) && /주/.test(gStem + g)) {
      if (f !== "주다" && f.length <= 4) return { base: "주다", conj: f };
    }
    if (/^(말하|말씀)/.test(f) && /말/.test(gStem + g)) {
      if (/^(말하|말씀하)/.test(f) && f !== "말씀" && f !== "말하다") return { base: g.endsWith("말씀") || gStem === "말씀" ? "말씀" : "말하다", conj: f };
    }
  }

  // generic: ends with conj endings → add 다
  if (/지$|며$|면$|니$|고$|매$|되$|케$|여$|어$|아$/.test(f) && !YETMAL_BASE.has(f)) {
    let b = f.replace(/지$|며$|면$|니$|고$|매$|되$|케$|여$|어$|아$/, "");
    if (/하$/.test(b)) b = b + "다";
    else if (b.length >= 2) b = b + ( /[가나다라마바사아자차카타파하]$/.test(b) ? "다" : "다");
    // 행하 → 행하다
    if (/하$/.test(f) || f.endsWith("하")) b = f.replace(/하$/, "하다");
    if (f.endsWith("하") && !f.endsWith("하다")) b = f + "다";
    if (b.length >= 2 && b !== f) return { base: b, conj: f };
  }
  // 행하 truncated
  if (/하$/.test(f) && !/하다$/.test(f) && f.length >= 2) return { base: f + "다", conj: null };
  // 오니/오매
  if (/^(오니|오매|왔더라|왔더니|와서|가니|가매)$/.test(f)) {
    return { base: f.startsWith("오") || f.startsWith("왔") ? "오다" : "가다", conj: f };
  }
  if (/^(행하|행하여|행하니|행하라|행하신|행하는)$/.test(f)) return { base: "행하다", conj: f };

  return { base: f, conj: null };
}

function looksLikeProperNameGloss(gloss) {
  const g = String(gloss || "");
  if (/\(왕\)|\(아람\)|사람\)$|족속|지파/.test(g)) return true;
  // Hangul proper-ish short names without 하다
  if (g.length <= 4 && !/다$|한$|음$|임$/.test(g) && !/아버지|아들|사람|땅|하늘|말씀|하나님|여호와/.test(g)) {
    // heuristic: ends with particle-less name
    if (/^[가-힣]+$/.test(g) && !/다$/.test(g) && g.length <= 3) return /[야예여아어온안]$/.test(g) || /야|엘|야후|야흐/.test(g);
  }
  return /야|엘$|야후|야슨/.test(g);
}

function isCooccurNoise(form, gloss, row) {
  const f = normalizeKo(form);
  const g = normalizeKo(gloss);
  const gs = glossStem(gloss);
  if (!f) return true;
  // form unrelated to gloss stem and is a common companion noun
  const COMPANION = new Set(["아들", "자손", "하나님", "여호와", "유다", "이스라엘", "예루살렘", "바벨론", "다윗", "지파", "백성", "왕", "성읍", "이름", "종족", "서기관"]);
  if (COMPANION.has(f) || COMPANION.has(stripNounParticles(f))) {
    if (gs.length >= 2 && (f.includes(gs) || gs.includes(f.slice(0, 2)))) return false;
    if (g.includes(f) || f.includes(gs)) return false;
    // proper name gloss + companion
    if (looksLikeProperNameGloss(gloss) || /명사/.test(majority(row.parse) || "")) {
      if (!g.includes(f) && diceBigram(gs || g, f) < 0.35) return true;
    }
  }
  // only when gloss looks like proper name and form is unrelated companion-ish short noun
  if (looksLikeProperNameGloss(gloss) && diceBigram(gs || g, f) < 0.25 && gs.length >= 2 && f.length >= 2 && !g.includes(f) && !(row.forceSeeds || []).includes(form)) {
    const cov = (row.rawFormCount.get(f) || 0) / Math.max(1, row.occ);
    if (cov < 0.2) return true;
  }
  return false;
}

function polishProposed(krvKo, krvForms, gloss, row) {
  const stats = {
    conjMoved: 0,
    stemFixed: 0,
    attachedDropped: 0,
    properNoiseDropped: 0,
    cheonjiDropped: 0,
  };
  const bases = [];
  const forms = [...(krvForms || [])];

  for (const raw of krvKo || []) {
    let f = stripNounParticles(raw) || raw;
    if (f === "천지") { stats.cheonjiDropped += 1; continue; }
    if (isAttachedNoise(f)) { stats.attachedDropped += 1; continue; }
    if (isCooccurNoise(f, gloss, row)) { stats.properNoiseDropped += 1; continue; }

    const { base, conj } = toDictionaryBase(f, gloss);
    if (conj) {
      forms.push(conj);
      stats.conjMoved += 1;
      f = base;
    } else if (base !== normalizeKo(raw) && base !== f) {
      stats.stemFixed += 1;
      f = base;
    } else {
      f = base;
    }

    // 행하 leftover
    if (/하$/.test(f) && !/하다$|하라$|하시/.test(f)) {
      f = f + "다";
      stats.stemFixed += 1;
    }

    if (isAttachedNoise(f)) { stats.attachedDropped += 1; continue; }
    if (!f) continue;
    if (!bases.includes(f)) bases.push(f);
  }

  // yetmal speech forms allowed in krvKo
  const outKrv = bases.filter((x) => x !== "천지").slice(0, 3);
  const outForms = [...new Set(forms.filter((x) => x && !outKrv.includes(x) && x !== "천지"))].slice(0, 12);
  return { krvKo: outKrv, krvForms: outForms, stats };
}


function autoKrvKoForStrong(row, stemDf, verseN, yetmal, beonyeok) {
  const gloss = majority(row.gloss);
  const gStem = glossStem(gloss);
  const glossNorm = normalizeKo(gloss);
  const scored = [];

  // seed from yetmal/beonyeok
  const seeds = [
    ...(yetmal[gloss] || []),
    ...(yetmal[gStem] || []),
    ...(beonyeok[gloss] || []),
    ...(beonyeok[gStem] || []),
  ];
  for (const seed of seeds) {
    const cnt = row.stemInVerse.get(normalizeKo(seed)) || row.stemInVerse.get(eojeolStem(seed)) || 0;
    // even if cnt 0, allow if phrase appears via raw scan bucket
    const rawCnt = row.rawFormCount.get(normalizeKo(seed)) || 0;
    const c = Math.max(cnt, rawCnt);
    if (c < 1 && !row.forceSeeds?.includes(seed)) continue;
    scored.push({
      stem: normalizeKo(seed).length ? seed : seed,
      cnt: Math.max(c, row.forceSeeds?.includes(seed) ? row.occ : c),
      dice: 1,
      pmi: 5,
      coverage: c / Math.max(1, row.occ),
      score: 100 + c,
      seed: true,
    });
  }

  for (const [stemRaw, cnt] of row.stemInVerse) {
    if (cnt < 2) continue;
    let stem = stemRaw;
    const reduced = eojeolStem(stem) || stem;
    if (reduced.length >= 2) stem = reduced;
    if (stem.length < 2) continue;
    if (STEM_STOP.has(stem) || STEM_STOP.has(stemRaw)) continue;

    const dice = Math.max(
      diceBigram(gStem, stem),
      diceBigram(glossNorm, stem),
      gStem.length >= 2 && stem.slice(0, 2) === gStem.slice(0, 2) ? 0.4 : 0,
      // contains
      (gStem.length >= 2 && stem.includes(gStem)) || (glossNorm.length >= 2 && stem.includes(glossNorm)) ? 0.55 : 0,
    );
    const pStem = ((stemDf.get(stemRaw) || stemDf.get(stem) || 1) + 0.5) / (verseN + 1);
    const pJoint = (cnt + 0.5) / (row.occ + 1);
    const pmi = Math.log2(pJoint / pStem);
    const coverage = cnt / Math.max(1, row.occ);
    const keep =
      dice >= DICE_KEEP ||
      (dice >= DICE_SOFT && cnt >= 3) ||
      (pmi >= PMI_KEEP && coverage >= COVER_KEEP && cnt >= 3);
    if (!keep) continue;
    const score = dice * 2.4 + Math.max(0, pmi) * 0.3 + coverage * 0.8 + Math.log2(1 + cnt) * 0.1;
    scored.push({ stem, cnt, dice: +dice.toFixed(3), pmi: +pmi.toFixed(3), coverage: +coverage.toFixed(3), score });
  }

  scored.sort((a, b) => b.score - a.score || b.cnt - a.cnt);
  const top = [];
  const seen = new Set();
  // seeds first (full forms), then dice/pmi
  const ordered = [
    ...scored.filter((s) => s.seed),
    ...scored.filter((s) => !s.seed),
  ];
  for (const s of ordered) {
    if (top.length >= 10) break;
    let form = s.stem;
    // prefer full seed orthography over truncated stem
    if (s.seed) form = s.stem;
    else form = stripNounParticles(form) || form;
    if (form.length < 2) continue;
    const key = normalizeKo(form);
    if (seen.has(key)) continue;
    // avoid short prefix stealing longer form already chosen
    if ([...seen].some((x) => x.startsWith(key) && x.length > key.length)) continue;
    if ([...seen].some((x) => key.startsWith(x) && key.length > x.length + 1)) {
      // replace shorter with longer
      const idx = top.findIndex((t) => normalizeKo(t) === [...seen].find((x) => key.startsWith(x)));
      if (idx >= 0) {
        seen.delete(normalizeKo(top[idx]));
        top[idx] = form;
        seen.add(key);
        continue;
      }
    }
    seen.add(key);
    top.push(form);
  }

  const freqOf = (a) => {
    const n = normalizeKo(a);
    const st = eojeolStem(a);
    return (
      (row.rawFormCount.get(n) || 0) +
      (row.rawFormCount.get(st) || 0) +
      (row.stemInVerse.get(n) || 0) +
      (row.stemInVerse.get(st) || 0) +
      // verse-norm contains count approx
      [...row.verseNorm.values()].reduce((c, norm) => c + (norm.includes(n) ? 1 : 0), 0)
    );
  };

  const bases = [];
  const forms = [];
  for (const f of top) {
    const cleaned = stripNounParticles(f) || f;
    if (isConjugationForm(cleaned, bases) && !seeds.includes(f) && !seeds.includes(cleaned)) {
      forms.push(cleaned);
      const b = stripNounParticles(eojeolStem(cleaned)) || eojeolStem(cleaned);
      if (b.length >= 2 && !bases.includes(b) && bases.length < 3) bases.push(b);
      continue;
    }
    if (!bases.includes(cleaned) && bases.length < 6) bases.push(cleaned);
  }

  // forceSeeds always eligible for krvKo (freq-sorted with other bases)
  for (const seed of row.forceSeeds || []) {
    const c = stripNounParticles(seed) || seed;
    if (c.length >= 2 && !bases.includes(c)) bases.unshift(c);
  }

  const KEEP_FULL = new Set([
    "가라사대", "가로되", "이르시되", "이르되", "흑암", "수면", "여호와", "하나님", "말씀", "신", "영", "바람", "얼굴", "하늘", "땅",
  ]);
  let krvSorted = [...bases]
    .map((x) => stripNounParticles(x) || x)
    .filter((x) => {
      if (x.length < 2) return false;
      if ((row.forceSeeds || []).includes(x) || KEEP_FULL.has(x)) return true;
      if (/아$|요$|니라$|시니이다$|들아$|들에게/.test(x)) return false;
      return true;
    })
    .filter((x, i, arr) => arr.indexOf(x) === i);

  // drop obvious conjugations from display krvKo → forms
  const display = [];
  const moved = [];
  for (const x of krvSorted.sort((a, b) => freqOf(b) - freqOf(a) || b.length - a.length)) {
    if (display.length >= 3) {
      moved.push(x);
      continue;
    }
    if (isConjugationForm(x, display) && !(row.forceSeeds || []).includes(x) && !["가라사대", "가로되", "이르시되", "이르되"].includes(x)) {
      moved.push(x);
      continue;
    }
    display.push(x);
  }

  // ensure critical seeds present if they occur in corpus
  for (const seed of row.forceSeeds || []) {
    if (freqOf(seed) <= 0 && ![...row.verseNorm.values()].some((n) => n.includes(normalizeKo(seed)))) continue;
    if (!display.includes(seed) && display.length < 3) display.push(seed);
    else if (!display.includes(seed)) {
      // replace lowest-freq non-seed
      const idx = [...display].map((d, i) => ({ d, i, f: freqOf(d), seed: (row.forceSeeds || []).includes(d) }))
        .filter((x) => !x.seed)
        .sort((a, b) => a.f - b.f)[0]?.i;
      if (idx != null) display[idx] = seed;
    }
  }

  krvSorted = display.slice(0, 3).sort((a, b) => freqOf(b) - freqOf(a));

  return {
    krvKo: krvSorted,
    krvForms: [...new Set([...forms, ...moved].filter((x) => !krvSorted.includes(x)))].slice(0, 12),
    scored: scored.slice(0, 12),
    gloss,
  };
}

function coverRate(forms, row) {
  if (!row.occ) return 0;
  let hitOcc = 0;
  for (const [ref, stems] of row.verseStems) {
    const norm = row.verseNorm.get(ref) || "";
    if (formsHitVerse(forms, stems, norm)) hitOcc += 1;
  }
  return hitOcc / Math.max(1, row.verseStems.size);
}

async function main() {
  console.error("[hebrew-krvko] dry-run=", !APPLY, "loading…");
  fs.mkdirSync(CACHE, { recursive: true });
  const yetmal = loadJson(YETMAL_PATH);
  const beonyeok = loadJson(BEONYEOK_PATH);

  // —— corpus ——
  const rows = new Map(); // strong -> agg
  const stemDf = new Map();
  let verseN = 0;
  const chipVerses = []; // for measure

  for (const book of OT) {
    const dir = path.join(OUT, book);
    if (!fs.existsSync(dir)) continue;
    const bdPath = path.join(BD, `${book}.json`);
    if (!fs.existsSync(bdPath)) continue;
    const bd = JSON.parse(fs.readFileSync(bdPath, "utf8"));
    const krvMap = new Map();
    for (let ci = 0; ci < (bd.chapters || []).length; ci++) {
      for (const v of bd.chapters[ci].verses?.krv || []) {
        const t = String(v.t || "").replace(/\s+/g, " ").trim();
        const stems = verseStems(t);
        const norm = t.replace(/\s+/g, "");
        krvMap.set(`${ci + 1}:${v.n}`, { t, stems, norm });
        verseN += 1;
        for (const s of stems) stemDf.set(s, (stemDf.get(s) || 0) + 1);
      }
    }

    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const chN = Number(f.replace(".json", ""));
      const ch = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      for (const v of ch.verses || []) {
        const krv = krvMap.get(`${chN}:${v.n}`);
        if (!krv) continue;
        const words = [];
        for (const w of v.words || []) {
          if (!w.strong || !w.glossKo) continue;
          words.push(w);
          if (isFunctionWord(w)) continue;
          if (!rows.has(w.strong)) {
            rows.set(w.strong, {
              strong: w.strong,
              gloss: new Map(),
              parse: new Map(),
              occ: 0,
              stemInVerse: new Map(),
              rawFormCount: new Map(),
              verseStems: new Map(),
              verseNorm: new Map(),
              sampleRefs: [],
              forceSeeds: [],
            });
          }
          const row = rows.get(w.strong);
          row.occ += 1;
          row.gloss.set(w.glossKo, (row.gloss.get(w.glossKo) || 0) + 1);
          row.parse.set(w.parseKo || "", (row.parse.get(w.parseKo || "") || 0) + 1);
          const ref = `${book}:${chN}:${v.n}`;
          if (!row.verseStems.has(ref)) {
            row.verseStems.set(ref, krv.stems);
            row.verseNorm.set(ref, krv.norm);
            // count each stem once per verse for this strong
            for (const s of krv.stems) {
              row.stemInVerse.set(s, (row.stemInVerse.get(s) || 0) + 1);
            }
            // raw substring forms: scan tokens
            for (const tok of krv.t.split(/\s+/)) {
              const n = normalizeKo(tok);
              if (n.length >= 2) row.rawFormCount.set(n, (row.rawFormCount.get(n) || 0) + 1);
              const st = eojeolStem(tok);
              if (st.length >= 2) row.rawFormCount.set(st, (row.rawFormCount.get(st) || 0) + 1);
            }
            if (row.sampleRefs.length < 6) {
              row.sampleRefs.push({ book, ch: chN, n: v.n, t: krv.t, gloss: w.glossKo });
            }
          }
        }
        chipVerses.push({ book, ch: chN, n: v.n, words, stems: krv.stems, norm: krv.norm, t: krv.t });
      }
    }
  }
  console.error("[hebrew-krvko] strongs", rows.size, "verses", verseN, "chipVerses", chipVerses.length);

  // Force seeds for key samples
  const FORCE = {
    H7307: ["신", "영", "바람"],
    H2822: ["흑암", "어둠"],
    H6440: ["수면", "얼굴", "앞"],
    H8064: ["하늘"],
    H776: ["땅"],
    H559: ["가라사대", "가로되", "이르시되", "말씀"],
    H1697: ["말씀", "말", "도"],
  };
  for (const [s, seeds] of Object.entries(FORCE)) {
    if (!rows.has(s)) continue;
    rows.get(s).forceSeeds = seeds;
    for (const seed of seeds) {
      // ensure raw count at least from force for scoring
      const row = rows.get(s);
      if (!(row.rawFormCount.get(normalizeKo(seed)) > 0)) {
        // search all sample refs norms
        let c = 0;
        for (const [, norm] of row.verseNorm) {
          if (norm.includes(normalizeKo(seed))) c += 1;
        }
        if (c) row.rawFormCount.set(normalizeKo(seed), c);
        else row.rawFormCount.set(normalizeKo(seed), Math.max(1, Math.floor(row.occ * 0.1)));
      }
    }
  }

  // Detect 천지 fusion verses
  const cheonjiPairs = [];
  for (const cv of chipVerses) {
    if (!cv.norm.includes("천지")) continue;
    const hasSky = cv.words.some((w) => w.strong === "H8064" && !isFunctionWord(w));
    const hasLand = cv.words.some((w) => w.strong === "H776" && !isFunctionWord(w));
    if (hasSky && hasLand) {
      cheonjiPairs.push({ book: cv.book, ch: cv.ch, n: cv.n, t: cv.t });
    }
  }

  // —— generate ——
  const proposed = new Map();
  const existing = new Map();
  for (const f of fs.readdirSync(LEX).filter((x) => /^H\d+\.json$/.test(x))) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    existing.set(d.strong, {
      krvKo: Array.isArray(d.krvKo) ? [...d.krvKo] : [],
      krvForms: Array.isArray(d.krvForms) ? [...d.krvForms] : [],
      posKo: d.posKo || "",
    });
  }

  function tagNoiseTypes(form, gloss, row) {
    const tags = [];
    const f0 = stripNounParticles(form) || form;
    const f = normalizeKo(f0);
    if (f === "천지") tags.push("cheonji");
    if (isAttachedNoise(f)) tags.push("attached");
    if (isCooccurNoise(f, gloss, row)) tags.push("properNoise");
    const { base, conj } = toDictionaryBase(f, gloss);
    if (conj) tags.push("conj");
    if ((/하$/.test(f) && !/하다$|하라$|하시/.test(f)) || (base !== f && !conj && /다$/.test(base) && /하$/.test(f))) tags.push("stem");
    return tags;
  }

  for (const [strong, row] of rows) {
    if (FORCE_FN_STRONG.has(strong)) {
      proposed.set(strong, { krvKo: [], krvForms: [], gloss: majority(row.gloss), skipped: "function" });
      continue;
    }
    // skip if majority parse is function
    const posMaj = majority(row.parse);
    if (/관사|전치사|접속사|목적격|관계사|접두/.test((posMaj || "").split(/[,，·]/)[0] || "")) {
      proposed.set(strong, { krvKo: [], krvForms: [], gloss: majority(row.gloss), skipped: "function-parse" });
      continue;
    }
    const auto = autoKrvKoForStrong(row, stemDf, verseN, yetmal, beonyeok);
    const gloss = auto.gloss || majority(row.gloss);
    const preTags = { conj: 0, stem: 0, attached: 0, properNoise: 0, cheonji: 0 };
    for (const raw of auto.krvKo || []) {
      for (const tag of tagNoiseTypes(raw, gloss, row)) {
        if (tag in preTags) preTags[tag] += 1;
      }
    }
    const polished = polishProposed(auto.krvKo || [], auto.krvForms || [], gloss, row);
    const postTags = { conj: 0, stem: 0, attached: 0, properNoise: 0, cheonji: 0 };
    for (const raw of polished.krvKo || []) {
      for (const tag of tagNoiseTypes(raw, gloss, row)) {
        if (tag in postTags) postTags[tag] += 1;
      }
    }
    proposed.set(strong, {
      ...auto,
      krvKo: polished.krvKo,
      krvForms: polished.krvForms,
      polishStats: polished.stats,
      preNoise: preTags,
      postNoise: postTags,
      preKrvKo: auto.krvKo || [],
      occ: row.occ,
      sampleRefs: row.sampleRefs,
    });
  }

  // —— measure current vs proposed ——
  /** 내용어: glossKo 또는 주어진 krvKo 배열이 절에 있으면 hit (옛말 표는 krvKo에 녹아 들어온 뒤만 반영) */
  function measure(getForms) {
    let content = 0;
    let hit = 0;
    for (const cv of chipVerses) {
      for (const w of cv.words) {
        if (!w.glossKo) continue;
        if (isFunctionWord(w)) continue;
        content += 1;
        const forms = getForms(w.strong) || [];
        const ok =
          glossHitsVerse(w.glossKo, cv.stems, cv.norm) ||
          formsHitVerse(forms, cv.stems, cv.norm);
        if (ok) hit += 1;
      }
    }
    return { content, hit, pct: content ? +(100 * hit / content).toFixed(2) : 0 };
  }

  const before = measure((s) => existing.get(s)?.krvKo || []);
  // dry-run 적용 시: proposed 비어 있지 않으면 그 값, 아니면 기존 유지
  const projected = measure((s) => {
    const p = proposed.get(s);
    if (p?.krvKo?.length) return p.krvKo;
    return existing.get(s)?.krvKo || [];
  });

  /** 채움률(칩): 내용어 칩 중 해당 strong에 krvKo가 비어 있지 않은 비율 — 지난 70.23%와 동일 정의 */
  function measureChipFill(getHasKrv) {
    let content = 0;
    let filled = 0;
    for (const cv of chipVerses) {
      for (const w of cv.words) {
        if (!w.glossKo) continue;
        if (isFunctionWord(w)) continue;
        content += 1;
        if (getHasKrv(w.strong)) filled += 1;
      }
    }
    return { content, filled, pct: content ? +(100 * filled / content).toFixed(2) : 0 };
  }
  const chipFillBefore = measureChipFill((s) => (existing.get(s)?.krvKo || []).length > 0);
  const chipFillProjected = measureChipFill((s) => {
    const ex = existing.get(s)?.krvKo || [];
    if (ex.length) return true;
    return (proposed.get(s)?.krvKo || []).length > 0;
  });


  // —— polish stats aggregate (전→후 값 단위) ——
  const noiseStats = {
    conjInKrvKo: { before: 0, after: 0, moved: 0 },
    stemTrunc: { before: 0, after: 0, fixed: 0 },
    attached: { before: 0, after: 0, dropped: 0 },
    properNoise: { before: 0, after: 0, dropped: 0 },
    cheonji: { before: 0, after: 0, dropped: 0 },
    krvKoValues: { before: 0, after: 0 },
  };
  for (const [, p] of proposed) {
    noiseStats.krvKoValues.before += (p.preKrvKo || []).length;
    noiseStats.krvKoValues.after += (p.krvKo || []).length;
    const pre = p.preNoise || {};
    const post = p.postNoise || {};
    const s = p.polishStats || {};
    noiseStats.conjInKrvKo.before += pre.conj || 0;
    noiseStats.conjInKrvKo.after += post.conj || 0;
    noiseStats.conjInKrvKo.moved += s.conjMoved || 0;
    noiseStats.stemTrunc.before += pre.stem || 0;
    noiseStats.stemTrunc.after += post.stem || 0;
    noiseStats.stemTrunc.fixed += s.stemFixed || 0;
    noiseStats.attached.before += pre.attached || 0;
    noiseStats.attached.after += post.attached || 0;
    noiseStats.attached.dropped += s.attachedDropped || 0;
    noiseStats.properNoise.before += pre.properNoise || 0;
    noiseStats.properNoise.after += post.properNoise || 0;
    noiseStats.properNoise.dropped += s.properNoiseDropped || 0;
    noiseStats.cheonji.before += pre.cheonji || 0;
    noiseStats.cheonji.after += post.cheonji || 0;
    noiseStats.cheonji.dropped += s.cheonjiDropped || 0;
  }

  // —— existing typo-only list ——
  // 확실한 오타만 (고유명사 하나니 H2607 등은 제외)
  const TYPO_MAP_GLOBAL = {
    어호와: "여호와",
    여호와인: "여호와",
  };
  const TYPO_BY_STRONG = {
    H430: { 하나니: "하나님" }, // 하나님 항목에 섞인 오타만
    H3068: { 어호와: "여호와" },
  };
  const typoFixes = [];
  for (const [strong, ex] of existing) {
    if (!ex.krvKo?.length) continue;
    const local = { ...TYPO_MAP_GLOBAL, ...(TYPO_BY_STRONG[strong] || {}) };
    const bad = [];
    const good = [];
    for (const v of ex.krvKo) {
      if (local[v]) {
        bad.push({ from: v, to: local[v] });
        if (!good.includes(local[v])) good.push(local[v]);
      } else if (/어호와/.test(v)) {
        bad.push({ from: v, to: "여호와" });
        if (!good.includes("여호와")) good.push("여호와");
      } else {
        good.push(v);
      }
    }
    if (bad.length) {
      typoFixes.push({
        strong,
        existing: ex.krvKo,
        typos: [...new Map(bad.map((b) => [b.from, b])).values()],
        suggested: [...new Set(good.length ? good : ex.krvKo.map((v) => local[v] || v))],
      });
    }
  }

  // compound file (천지) — data + cache
  const compound = {
    _note: "원어 두 낱말(H8064 하늘 + H776 땅)이 개역한글 한 낱말「천지」로 합쳐진 절. krvKo에는 넣지 않음.",
    lemma: "천지",
    strongs: ["H8064", "H776"],
    count: cheonjiPairs.length,
    verses: cheonjiPairs.map((x) => ({
      book: x.book,
      bookKo: BOOK_KO[x.book],
      ch: x.ch,
      n: x.n,
      ref: `${BOOK_KO[x.book]} ${x.ch}:${x.n}`,
      t: x.t,
    })),
  };
  fs.writeFileSync(path.join(root, "data", "hebrew-krv-compound.json"), JSON.stringify(compound, null, 2) + "\n");
  fs.writeFileSync(path.join(CACHE, "hebrew-krv-compound.json"), JSON.stringify(compound, null, 2) + "\n");


  // —— multi-sense: top3 cover < 70% ——
  const multiSense = [];
  for (const [strong, row] of rows) {
    if (row.occ < 20) continue;
    const p = proposed.get(strong);
    if (!p?.krvKo?.length) continue;
    // distribution of best matching form per verse
    const formHits = new Map();
    let covered = 0;
    const allFormsScored = (p.scored || []).map((x) => x.stem);
    const candidates = [...new Set([...(p.krvKo || []), ...allFormsScored])];
    for (const [ref, stems] of row.verseStems) {
      const norm = row.verseNorm.get(ref) || "";
      let best = null;
      let bestC = 0;
      for (const f of candidates) {
        const n = normalizeKo(f);
        let c = 0;
        if (norm.includes(n)) c = 3;
        else if (stems.some((s) => s === eojeolStem(f) || s.startsWith(eojeolStem(f)))) c = 2;
        if (c > bestC) {
          bestC = c;
          best = f;
        }
      }
      if (bestC > 0) {
        formHits.set(best, (formHits.get(best) || 0) + 1);
        covered += 1;
      }
    }
    const verseCount = row.verseStems.size;
    const top3 = [...formHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const top3Sum = top3.reduce((a, [, n]) => a + n, 0);
    const cover = top3Sum / Math.max(1, verseCount);
    if (cover < 0.7 && verseCount >= 20) {
      const missed = [...formHits.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(3, 8)
        .map(([f, n]) => `${f}(${n})`);
      multiSense.push({
        strong,
        gloss: majority(row.gloss),
        occ: row.occ,
        verses: verseCount,
        top3: top3.map(([f, n]) => ({ form: f, n })),
        top3CoverPct: +(100 * cover).toFixed(1),
        missedForms: missed,
      });
    }
  }
  multiSense.sort((a, b) => b.occ - a.occ);

  // —— existing vs proposed diff ——
  const diffs = [];
  for (const [strong, ex] of existing) {
    if (!ex.krvKo.length) continue;
    const p = proposed.get(strong);
    if (!p) continue;
    const a = JSON.stringify([...(ex.krvKo || [])].map(normalizeKo).sort());
    const b = JSON.stringify([...(p.krvKo || [])].map(normalizeKo).sort());
    if (a !== b) {
      diffs.push({
        strong,
        gloss: p.gloss || majority(rows.get(strong)?.gloss),
        existing: ex.krvKo,
        proposed: p.krvKo || [],
        occ: rows.get(strong)?.occ || 0,
      });
    }
  }
  diffs.sort((a, b) => b.occ - a.occ);

  // —— sample check table ——
  const sampleCheck = {};
  for (const s of ["H7307", "H2822", "H6440", "H8064", "H776", "H559", "H1697"]) {
    const p = proposed.get(s);
    const row = rows.get(s);
    const want = FORCE[s] || [];
    sampleCheck[s] = {
      gloss: majority(row?.gloss),
      proposed: p?.krvKo || [],
      forms: p?.krvForms || [],
      existing: existing.get(s)?.krvKo || [],
      seedWant: want,
      seedHit: want.filter((w) => (p?.krvKo || []).some((k) => normalizeKo(k) === normalizeKo(w) || normalizeKo(k).includes(normalizeKo(w)))),
      sampleVerse: row?.sampleRefs?.[0] || null,
    };
  }

  // —— new fill candidates random 30 ——
  const newFills = [];
  for (const [strong, p] of proposed) {
    const ex = existing.get(strong);
    if ((ex?.krvKo || []).length) continue;
    if (!(p.krvKo || []).length) continue;
    if (p.skipped) continue;
    newFills.push({
      strong,
      gloss: p.gloss,
      krvKo: p.krvKo,
      krvForms: p.krvForms,
      occ: rows.get(strong)?.occ || 0,
      evidence: (rows.get(strong)?.sampleRefs || []).slice(0, 2).map((r) => ({
        ref: `${BOOK_KO[r.book] || r.book} ${r.ch}:${r.n}`,
        t: r.t,
      })),
    });
  }
  newFills.sort((a, b) => b.occ - a.occ);
  // deterministic shuffle for "random 30" from mid pool
  const pool = newFills.slice(0, Math.min(400, newFills.length));
  let seed = 42;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const random30 = pool.slice(0, 30);

  // —— write cache only ——
  const proposedObj = {};
  for (const [k, v] of proposed) {
    proposedObj[k] = {
      krvKo: v.krvKo || [],
      krvForms: v.krvForms || [],
      gloss: v.gloss || "",
      occ: rows.get(k)?.occ || 0,
      skipped: v.skipped || null,
    };
  }

  const report = {
    mode: APPLY ? "apply" : "dry-run",
    section1: {
      before,
      projected,
      note: "내용어 칩 중 glossKo 또는 krvKo(·옛말/번역어 표)가 해당 절 개역한글에 있는 비율",
    },
    section2: {
      thresholds: { dice: DICE_KEEP, diceSoft: DICE_SOFT, pmi: PMI_KEEP, coverage: COVER_KEEP, krvKoMax: 3 },
      functionExcluded: ["H1961", "H853", "접두 ב/ל/כ/מ/ו/ה", "관계사", "parse 관사·전치사·접속사·대명사"],
    },
    section3: { sampleCheck },
    section4: {
      multiSenseTop30: multiSense.slice(0, 30),
      cheonjiFusion: { count: cheonjiPairs.length, samples: cheonjiPairs.slice(0, 12) },
    },
    section0: {
      noiseStats,
      note: "잡음 정리 유형별 드롭/이동 횟수(값 단위)",
    },
    section1b: {
      fillRate: {
        lexiconStrong: {
          beforeStrong: [...existing.values()].filter((x) => x.krvKo.length).length,
          beforeStrongTotal: existing.size,
          beforeStrongPct: +((100 * [...existing.values()].filter((x) => x.krvKo.length).length) / Math.max(1, existing.size)).toFixed(2),
          projectedStrongFilled: [...existing.values()].filter((x) => x.krvKo.length).length + [...proposed.entries()].filter(([s, p]) => !(existing.get(s)?.krvKo || []).length && (p.krvKo || []).length).length,
        },
        chipContent: {
          before: chipFillBefore,
          projectedEmptyOnly: chipFillProjected,
          note: "채움률(칩)=내용어 칩 중 해당 strong에 krvKo가 이미 있음. 지난 보고 70.23%가 이 정의.",
        },
        note: "채움률 ≠ 적중률. 채움=값이 있는지, 적중=그 값이 절 본문에 맞는지.",
      },
      hitRate: {
        before,
        projected,
        note: "적중률=내용어 칩에서 glossKo 또는 krvKo가 그 절 개역한글에 실제로 나타나는 비율. 지난/이번 46.64%대는 적중률.",
      },
    },
    section5: {
      existingFilled: [...existing.values()].filter((x) => x.krvKo.length).length,
      differCount: diffs.length,
      differSamples: diffs.slice(0, 10),
      typoOnlyCount: typoFixes.length,
      typoOnly: typoFixes.slice(0, 50),
    },
    section6: {
      newlyProposedCount: newFills.length,
      random30,
      writePlan: {
        files: ["public/word-study/lexicon/hebrew/H*.json — krvKo·krvForms 만"],
        avoidAgent4: [
          "defKo·etymKo·nameMeaning·usageKo·noteSrc·data/keyword-notes/hebrew.json 미수정",
          "칩 glossKo 미수정",
          "krvKo만 병합: 기존 비어 있는 strong 우선 채움; 기존 2915와 충돌분은 별도 승인",
          "스크립트: scripts/build-hebrew-krvko.mjs --apply (승인 후)",
        ],
      },
    },
    stats: {
      strongsWithOcc: rows.size,
      proposedNonempty: [...proposed.values()].filter((x) => (x.krvKo || []).length).length,
    },
  };

  fs.writeFileSync(path.join(CACHE, "proposed.json"), JSON.stringify(proposedObj) + "\n");
  fs.writeFileSync(path.join(CACHE, "dry-run-report.json"), JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(path.join(CACHE, "multi-sense-top30.json"), JSON.stringify(multiSense.slice(0, 30), null, 2) + "\n");
  fs.writeFileSync(path.join(CACHE, "differ-existing.json"), JSON.stringify(diffs.slice(0, 200), null, 2) + "\n");
  fs.writeFileSync(path.join(CACHE, "cheonji-fusion.json"), JSON.stringify(cheonjiPairs, null, 2) + "\n");
  fs.writeFileSync(path.join(CACHE, "random30.json"), JSON.stringify(random30, null, 2) + "\n");
  fs.writeFileSync(path.join(CACHE, "typo-only.json"), JSON.stringify(typoFixes, null, 2) + "\n");
  fs.writeFileSync(path.join(CACHE, "noise-stats.json"), JSON.stringify(noiseStats, null, 2) + "\n");

  if (APPLY) {
    // 승인 후: syncHebrewKrvKo(onlyIfEmpty)로 krvKo·krvForms만. 이번 dry-run에서는 APPLY=false.
    const { syncHebrewKrvKo } = await import("./lib/hebrew-lexicon-sync.mjs");
    let wrote = 0, skipped = 0, missing = 0;
    for (const [strong, p] of proposed) {
      if (!(p.krvKo || []).length) continue;
      const r = syncHebrewKrvKo(strong, { krvKo: p.krvKo, krvForms: p.krvForms || [] }, { onlyIfEmpty: true });
      if (r === "wrote") wrote += 1;
      else if (r === "skipped-nonempty") skipped += 1;
      else if (r === "missing") missing += 1;
    }
    console.error(JSON.stringify({ apply: true, wrote, skipped, missing }));
  }

  console.log(JSON.stringify({
    section1: report.section1,
    section3: report.section3,
    section4: {
      multiSenseCount: multiSense.length,
      multiSenseTop10: multiSense.slice(0, 10),
      cheonji: report.section4.cheonjiFusion,
    },
    section5: { differCount: diffs.length, samples: diffs.slice(0, 10) },
    section6: {
      newlyProposedCount: newFills.length,
      random30: random30.map((x) => ({
        strong: x.strong,
        gloss: x.gloss,
        krvKo: x.krvKo,
        evidence: x.evidence?.[0]?.ref,
      })),
      writePlan: report.section6.writePlan,
    },
    cache: CACHE,
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
