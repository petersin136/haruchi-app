#!/usr/bin/env node
/**
 * krvKo 전수 점검 + defKo 문장 정리 + 잘린 인용 49건
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
const REPORT = path.join(OUT, "_greek-krvko-final-audit-report.json");

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

const NOISE = new Set([
  "없는", "있는", "하는", "되는", "같은", "된", "한", "할", "할것",
  "그", "이", "저", "및", "또", "곧", "더", "다", "것", "수", "등", "자", "들",
  "아니", "않", "못", "이미", "이제", "다시", "모든", "어떤", "아무",
]);

const PARTICLES = [
  "으로서", "으로부터", "에서부터", "까지도", "부터는", "으로는", "에게로",
  "으로", "로서", "로써", "에서", "에게", "께서", "부터", "까지", "처럼",
  "같이", "대로", "마다", "밖에", "보다", "따라",
  "을", "를", "이", "가", "은", "는", "의", "에", "로", "과", "와", "도", "만", "나", "요", "여", "라", "니", "며", "고", "면",
];

const APP_FN = /관사|전치사|접속사|대명사|부정어|불변화사/;

function ensurePeriod(s) {
  const t = String(s || "").trim();
  if (!t) return t;
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}
function hasBatchim(word) {
  const ch = String(word || "").replace(/\s+/g, "").replace(/[「」()]/g, "").slice(-1);
  const code = ch?.charCodeAt(0);
  if (!code || code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}
function euro(w) {
  return hasBatchim(w) ? "으로" : "로";
}
function eulReul(w) {
  return hasBatchim(w) ? "을" : "를";
}
function normalizeKo(s) {
  return String(s || "").replace(/\s+/g, "").replace(/[.,;:!?·"'“”‘’()[\]{}「」『』]/g, "");
}
function glossStem(g) {
  let x = normalizeKo(g);
  for (const suf of ["시키다", "하다", "주다", "되다"]) {
    if (x.endsWith(suf) && x.length > suf.length) return x.slice(0, -suf.length);
  }
  if (x.endsWith("다") && x.length > 1) return x.slice(0, -1);
  return x;
}
function isFnParse(parseKo) {
  return APP_FN.test(((parseKo || "").split(/[,，·]/)[0] || "").trim());
}
function majority(map) {
  if (!map?.size) return "";
  return [...map.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
function refOf(h) {
  return `${BOOK_KO[h.book]} ${h.ch}:${h.n}`;
}

/** 토큰에서 조사 제거 */
function stripParticles(tok) {
  let t = String(tok || "").replace(/[.,;:!?‘’“”']/g, "");
  let changed = true;
  while (changed && t.length > 1) {
    changed = false;
    for (const p of PARTICLES) {
      if (t.length > p.length && t.endsWith(p)) {
        t = t.slice(0, -p.length);
        changed = true;
        break;
      }
    }
  }
  return t;
}

function loadCorpus() {
  const verses = [];
  for (const book of NT) {
    const bd = JSON.parse(fs.readFileSync(path.join(BD, `${book}.json`), "utf8"));
    for (let ci = 0; ci < (bd.chapters || []).length; ci++) {
      for (const v of bd.chapters[ci].verses?.krv || []) {
        const t = String(v.t || "").replace(/\s+/g, " ").trim();
        const tokens = t.split(/\s+/).filter(Boolean);
        const stems = tokens.map(stripParticles).filter((x) => x.length >= 1);
        verses.push({
          book, ch: ci + 1, n: v.n, t,
          norm: t.replace(/\s+/g, ""),
          tokens, stems,
        });
      }
    }
  }
  return verses;
}

/**
 * form이 개역한글에 '완전한 낱말'로 나오는지.
 * - 공백 무시 부분문자열이 아니라, 토큰 stem과 일치하거나
 * - 토큰이 form으로 시작하고 나머지가 조사만인 경우
 */
function isCompleteInVerse(form, verse) {
  const f = String(form || "").replace(/\s+/g, "");
  if (!f) return false;
  for (const tok of verse.tokens) {
    const clean = tok.replace(/[.,;:!?‘’“”']/g, "");
    if (clean === f) return true;
    const stem = stripParticles(clean);
    if (stem === f) return true;
  }
  // spaced phrase: e.g. 제사장 직분
  if (f.length >= 2 && verse.norm.includes(f)) {
    // only allow if form equals concatenation of consecutive stems
    const stems = verse.stems;
    for (let i = 0; i < stems.length; i++) {
      let acc = "";
      for (let j = i; j < stems.length && acc.length < f.length + 4; j++) {
        acc += stems[j];
        if (acc === f) return true;
      }
    }
  }
  return false;
}

function findCompleteVerses(form, verses, limit = 8) {
  const out = [];
  for (const v of verses) {
    if (isCompleteInVerse(form, v)) {
      out.push(v);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** form이 더 긴 완전한 낱말의 접두이면 그 긴 낱말 후보 수집 */
function longerCompletions(form, verses, max = 20) {
  const f = String(form || "").replace(/\s+/g, "");
  const counts = new Map();
  for (const v of verses) {
    for (const stem of v.stems) {
      if (stem.length > f.length && stem.startsWith(f)) {
        counts.set(stem, (counts.get(stem) || 0) + 1);
      }
    }
    // also raw tokens starting with f
    for (const tok of v.tokens) {
      const stem = stripParticles(tok);
      if (stem.length > f.length && stem.startsWith(f)) {
        counts.set(stem, (counts.get(stem) || 0) + 1);
      }
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, max).map(([w, c]) => ({ w, c }));
}

function isNoise(form) {
  const f = String(form || "");
  if (NOISE.has(f)) return true;
  if (f.length === 1) return true;
  return false;
}

function isStemTruncForm(form, verses) {
  const f = String(form || "");
  if (!f) return false;
  // ends with truncated verbal/adverbial stubs and a longer completion exists
  if (/(되|하|케|히)$/.test(f)) {
    const longer = longerCompletions(f, verses, 5);
    if (longer.length && longer[0].w.length > f.length) return true;
  }
  // short prefix of a much more common longer word
  if (!findCompleteVerses(f, verses, 1).length) {
    const longer = longerCompletions(f, verses, 3);
    if (longer.length && longer[0].c >= 1) return true;
  }
  return false;
}

function classifyIssue(form, verses) {
  if (isNoise(form)) return "noise";
  const complete = findCompleteVerses(form, verses, 1).length > 0;
  if (!complete) {
    if (isStemTruncForm(form, verses) || /(되|하|케)$/.test(form)) return "trunc";
    return "notInText";
  }
  // complete but suspicious short trunc-looking
  if (/(되|하|케)$/.test(form) && form.length <= 3) {
    const longer = longerCompletions(form, verses, 1);
    if (longer.length) return "trunc";
  }
  return null;
}

function repairForm(form, strong, gloss, verses, chipHits) {
  const f = String(form || "").replace(/\s+/g, "");
  if (!f || isNoise(f)) return { action: "drop", reason: "noise", from: f, to: null };

  const issue = classifyIssue(f, verses);
  if (!issue) return { action: "keep", reason: "ok", from: f, to: f };

  // try longer completions first
  const longer = longerCompletions(f, verses, 15);
  for (const { w } of longer) {
    if (isNoise(w)) continue;
    if (findCompleteVerses(w, verses, 1).length) {
      // prefer completions related to gloss
      const gs = glossStem(gloss);
      if (!gs || w.includes(gs.slice(0, Math.min(2, gs.length))) || gs.includes(w.slice(0, Math.min(2, w.length))) || w.startsWith(f)) {
        return { action: "fix", reason: issue, from: f, to: w };
      }
    }
  }
  if (longer[0] && findCompleteVerses(longer[0].w, verses, 1).length) {
    return { action: "fix", reason: issue, from: f, to: longer[0].w };
  }

  // try gloss stem / gloss itself if in KRV as complete word
  const candidates = [gloss, glossStem(gloss)].filter(Boolean);
  // also try common adverb/noun endings
  for (const base of [f, glossStem(gloss)].filter(Boolean)) {
    for (const suf of ["이", "히", "다", "요", "라", "게", "케", "고", "음", "함", "움"]) {
      candidates.push(base + suf);
    }
  }
  for (const c of candidates) {
    const cc = String(c).replace(/\s+/g, "");
    if (cc.length < 2 || isNoise(cc)) continue;
    if (findCompleteVerses(cc, verses, 1).length) {
      return { action: "fix", reason: issue, from: f, to: cc };
    }
  }

  // search chip verses for any hangul stem overlapping gloss
  const gs = glossStem(gloss);
  if (gs && gs.length >= 2) {
    for (const hit of chipHits || []) {
      const v = verses.find((x) => x.book === hit.book && x.ch === hit.ch && x.n === hit.n);
      if (!v) continue;
      for (const stem of v.stems) {
        if (stem.length >= 2 && (stem.includes(gs.slice(0, 2)) || gs.includes(stem.slice(0, 2)))) {
          if (!isNoise(stem) && findCompleteVerses(stem, verses, 1).length) {
            return { action: "fix", reason: issue, from: f, to: stem };
          }
        }
      }
    }
  }

  return { action: "drop", reason: issue, from: f, to: null };
}

/** 같은 절 다른 strong의 krvKo와 완전 동일하면 충돌 의심 */
function detectMixed(strong, form, chipHits, krvByStrong) {
  const f = String(form || "");
  if (!f) return false;
  for (const hit of chipHits || []) {
    // find other strongs in same verse from lexicon? expensive; use chip file later
  }
  return false;
}

function windowAround(text, needle, maxLen = 72) {
  const t = String(text).replace(/\s+/g, " ").trim();
  const idx = t.indexOf(needle);
  if (idx < 0) return null;
  const room = Math.max(8, maxLen - needle.length);
  let start = Math.max(0, idx - Math.floor(room * 0.3));
  let end = Math.min(t.length, idx + needle.length + Math.floor(room * 0.7));
  if (start > 0) {
    const sp = t.lastIndexOf(" ", idx - 1);
    if (sp >= start - 16 && sp < idx) start = sp + 1;
  }
  if (end < t.length) {
    const sp = t.indexOf(" ", idx + needle.length);
    if (sp > 0 && sp <= end + 16) end = sp;
  }
  let s = t.slice(start, end);
  if (start > 0) s = `…${s}`;
  if (end < t.length) s = `${s}…`;
  return s;
}

function main() {
  const verses = loadCorpus();

  // chips
  const glossMaj = new Map();
  const chipHits = new Map(); // strong -> [{book,ch,n}]
  const verseStrongs = new Map(); // book:ch:n -> Map strong->gloss
  let contentChips = 0;
  let contentWithKrvBefore = 0;

  for (const book of NT) {
    const dir = path.join(OUT, book);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const chN = Number(f.replace(".json", ""));
      const ch = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      for (const v of ch.verses || []) {
        const key = `${book}:${chN}:${v.n}`;
        if (!verseStrongs.has(key)) verseStrongs.set(key, new Map());
        for (const w of v.words || []) {
          if (!w.strong) continue;
          verseStrongs.get(key).set(w.strong, w.glossKo || "");
          if (w.glossKo) {
            if (!glossMaj.has(w.strong)) glossMaj.set(w.strong, new Map());
            const m = glossMaj.get(w.strong);
            m.set(w.glossKo, (m.get(w.glossKo) || 0) + 1);
          }
          if (!chipHits.has(w.strong)) chipHits.set(w.strong, []);
          const arr = chipHits.get(w.strong);
          if (!arr.some((x) => x.book === book && x.ch === chN && x.n === v.n)) {
            arr.push({ book, ch: chN, n: v.n });
          }
        }
      }
    }
  }

  // preload all lexicon krvKo for mixed detection
  const lexFiles = fs.readdirSync(LEX).filter((x) => x.endsWith(".json"));
  const krvByStrong = new Map();
  for (const f of lexFiles) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    krvByStrong.set(d.strong || f.replace(/\.json$/, ""), [...(d.krvKo || [])]);
  }

  // ——— BEFORE classify ———
  const before = { notInText: 0, trunc: 0, noise: 0, mixed: 0, ok: 0, values: 0 };
  const beforeSamples = { notInText: [], trunc: [], noise: [], mixed: [] };

  for (const f of lexFiles) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    const strong = d.strong || f.replace(/\.json$/, "");
    const hits = chipHits.get(strong) || [];
    for (const k of d.krvKo || []) {
      before.values += 1;
      const issue = classifyIssue(k, verses);
      // mixed: form equals another strong's exclusive form appearing same verse
      let mixed = false;
      if (!issue) {
        for (const hit of hits) {
          const others = verseStrongs.get(`${hit.book}:${hit.ch}:${hit.n}`);
          if (!others) continue;
          for (const [os, og] of others) {
            if (os === strong) continue;
            const okrv = krvByStrong.get(os) || [];
            if (okrv.includes(k) && majority(glossMaj.get(strong)) !== majority(glossMaj.get(os))) {
              // same krv form shared - only flag if form matches other gloss better
              const myG = majority(glossMaj.get(strong));
              const otG = majority(glossMaj.get(os));
              if (otG && k.includes(glossStem(otG).slice(0, 2)) && myG && !k.includes(glossStem(myG).slice(0, 2))) {
                mixed = true;
              }
            }
          }
        }
      }
      if (issue === "noise") {
        before.noise += 1;
        if (beforeSamples.noise.length < 10) beforeSamples.noise.push({ strong, k });
      } else if (issue === "trunc") {
        before.trunc += 1;
        if (beforeSamples.trunc.length < 10) beforeSamples.trunc.push({ strong, k });
      } else if (issue === "notInText") {
        before.notInText += 1;
        if (beforeSamples.notInText.length < 10) beforeSamples.notInText.push({ strong, k });
      } else if (mixed) {
        before.mixed += 1;
        if (beforeSamples.mixed.length < 10) beforeSamples.mixed.push({ strong, k });
      } else {
        before.ok += 1;
      }
    }
  }

  // ——— APPLY FIXES ———
  const fixedSamples = [];
  let fixedN = 0;
  let droppedN = 0;
  const fixCounts = { notInText: 0, trunc: 0, noise: 0, mixed: 0 };

  // special manual fixes
  const MANUAL = {
    G2790: ["거문고"],
    G5186: ["멀게"], // John 12:40 "눈을 멀게" - 멀게 is complete token; remove broken 멀게다 from def
    G3155: ["헛되이"],
    G410: ["책망할 것이 없는"], // or drop noise; use phrase from verse
    G2405: ["제사장의"], // 눅 1:9 제사장의 전례 - better 제사장 직분? check
  };

  // G2405: 눅 1:9 "제사장의 전례" - stem 제사장 is complete; gloss is 제사직.
  // User asked: 「제사장」→ 「제사장 직분」 또는 본문 표기. 본문은 제사장의.
  // Prefer finding "제사장" as complete stem (제사장의 → stem 제사장). That's OK as complete.
  // But mixed with G2409 etc. - use "제사장의" as form appearing, or keep 제사장 if complete.
  // User: 다른 strong의 낱말이 섞인 값 → 「제사장 직분」 또는 본문 표기
  // For priestly office (ἱερατεία G2405), KRV says 제사장의 전례. So "제사장의" or leave and note.
  MANUAL.G2405 = ["제사장의"];

  for (const f of lexFiles) {
    const fp = path.join(LEX, f);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    const strong = d.strong || f.replace(/\.json$/, "");
    const gloss = majority(glossMaj.get(strong)) || "";
    const hits = chipHits.get(strong) || [];
    let krv = [...(d.krvKo || [])];
    let forms = [...(d.krvForms || [])];
    let changed = false;

    if (MANUAL[strong]) {
      const beforeK = krv.slice();
      krv = MANUAL[strong].filter((x) => findCompleteVerses(x.replace(/\s+/g, ""), verses, 1).length || findCompleteVerses(x, verses, 1).length);
      // allow spaced
      if (!krv.length) {
        krv = MANUAL[strong].filter((x) => verses.some((v) => v.norm.includes(x.replace(/\s+/g, ""))));
      }
      if (JSON.stringify(beforeK) !== JSON.stringify(krv)) {
        changed = true;
        fixedN += 1;
        if (fixedSamples.length < 20) {
          fixedSamples.push({ strong, from: beforeK, to: krv, reason: "manual" });
        }
      }
    } else {
      const next = [];
      const seen = new Set();
      for (const k of krv) {
        const rep = repairForm(k, strong, gloss, verses, hits);
        if (rep.action === "keep") {
          if (!seen.has(rep.to)) { next.push(rep.to); seen.add(rep.to); }
        } else if (rep.action === "fix" && rep.to) {
          fixCounts[rep.reason] = (fixCounts[rep.reason] || 0) + 1;
          if (!seen.has(rep.to)) { next.push(rep.to); seen.add(rep.to); }
          fixedN += 1;
          if (fixedSamples.length < 20) {
            fixedSamples.push({ strong, from: rep.from, to: rep.to, reason: rep.reason });
          }
          changed = true;
        } else {
          fixCounts[rep.reason] = (fixCounts[rep.reason] || 0) + 1;
          droppedN += 1;
          changed = true;
          if (fixedSamples.length < 20) {
            fixedSamples.push({ strong, from: rep.from, to: null, reason: `drop:${rep.reason}` });
          }
        }
      }
      // also clean krvForms
      const nextForms = [];
      for (const k of forms) {
        const rep = repairForm(k, strong, gloss, verses, hits);
        if (rep.action === "keep" || (rep.action === "fix" && rep.to)) {
          const val = rep.to || rep.from;
          if (val && !seen.has(val) && !nextForms.includes(val)) nextForms.push(val);
        }
      }
      if (JSON.stringify(krv) !== JSON.stringify(next) || JSON.stringify(forms) !== JSON.stringify(nextForms)) {
        krv = next;
        forms = nextForms;
        changed = true;
      }
    }

    // G410 special: verse has "책망할 것이 없는"
    if (strong === "G410") {
      const ok = verses.some((v) => v.norm.includes("책망할것이없는") || v.t.includes("책망할 것이 없는"));
      krv = ok ? ["책망할 것이 없는"] : [];
      changed = true;
    }

    if (changed) {
      d.krvKo = krv;
      if (forms.length) d.krvForms = forms;
      else delete d.krvForms;
    }

    // ——— 2) defKo sentence cleanup ———
    let def = (d.defKo || "").trim();
    let defChanged = false;

    // 옮겨졌어요 → 옮겨져요
    if (/옮겨졌어요/.test(def)) {
      def = def.replace(/옮겨졌어요/g, "옮겨져요");
      defChanged = true;
    }

    // collapse overlapping 「X를 말해요. 주로 「X」를 말하고」
    {
      const m = def.match(/^(.+?)(을|를) 말해요\.\s*주로 「([^」]+)」(?:을|를) 말하고,\s*「([^」]+)」(으로|로)도 옮겨져요\./);
      if (m) {
        const head = m[1].trim();
        const x = m[3];
        const y = m[4];
        // if head core ~= x, collapse
        const headCore = head.replace(/\(개역한글:[^)]+\)/g, "").trim();
        if (normalizeKo(headCore).includes(normalizeKo(glossStem(x))) || normalizeKo(x).includes(normalizeKo(glossStem(headCore))) || normalizeKo(headCore) === normalizeKo(x)) {
          const rest = def.slice(m[0].length).trim();
          def = `주로 ${headCore}${/는 것|하는 것|을 말|를 말/.test(head) ? "" : "" }`.trim();
          // preferred format from user: 「주로 의논하는 것을 말하고, 「헤아리다」로도 옮겨져요.」
          if (/하는 것|는 것/.test(head + "을 말해요")) {
            def = `주로 ${headCore}을 말하고, 「${y}」${euro(y)}도 옮겨져요.`;
            // fix particle on 것을
            def = def.replace(/것을을/, "것을").replace(/것을를/, "것을");
            if (!/것을 말하고/.test(def) && /하는$|는$/.test(headCore)) {
              def = `주로 ${headCore}을 말하고, 「${y}」${euro(y)}도 옮겨져요.`.replace("을 말하고", "을 말하고");
            }
          }
          // simpler rebuild for verb templates
          if (/것을$/.test(headCore) || /하는 것|는 것/.test(m[0])) {
            const body = m[0].match(/^(.*?)(을|를) 말해요/)?.[1] || headCore;
            def = `주로 ${body}을 말하고, 「${y}」${euro(y)}도 옮겨져요.`;
            def = def.replace(/것을을/, "것을").replace(/([^것])을을/, "$1을");
          }
          if (rest) def = `${def} ${rest}`;
          defChanged = true;
        }
      }
    }

    // Force G1011 format per user
    if (strong === "G1011") {
      def = "주로 의논하는 것을 말하고, 「헤아리다」로도 옮겨져요. 「…헤아리지 아니하겠느냐」(눅 14:31).";
      defChanged = true;
    }

    // Fix 으로/로 batchim on 「X」으로/로 patterns
    def = def.replace(/「([^」]+)」(으로|로)/g, (_, w, part) => {
      const right = euro(w);
      if (part !== right) defChanged = true;
      return `「${w}」${right}`;
    });
    // also 옮겨져요( without quote
    def = def.replace(/주로 「([^」]+)」(으로|로) 옮겨/g, (_, w) => `주로 「${w}」${euro(w)} 옮겨`);

    // Sync broken gloss(개역한글: bad) labels with fixed krvKo
    if ((d.krvKo || []).length) {
      const primary = d.krvKo[0];
      def = def.replace(/\(개역한글:\s*[^)]+\)/g, (m) => {
        const inner = m.slice(1, -1).replace(/^개역한글:\s*/, "");
        if (!findCompleteVerses(inner.replace(/\s+/g, ""), verses, 1).length && primary) {
          defChanged = true;
          return `(개역한글: ${primary})`;
        }
        return m;
      });
    }

    // Special key defs cleanup
    if (strong === "G2790") {
      def = "거문고 타는 자를 말해요. 개역한글에서는 「거문고」로 옮겨져요(계 14:2). 「…거문고 타는 자들의 그 거문고 타는 것 같더라」(계 14:2).";
      d.krvKo = ["거문고"];
      defChanged = true;
      changed = true;
    }
    if (strong === "G3155") {
      def = "헛되이 하는 것을 말해요. 개역한글에서는 「헛되이」로 옮겨져요(마 15:9). 「…헛되이 경배하는도다 하였느니라 하시고」(마 15:9).";
      d.krvKo = ["헛되이"];
      defChanged = true;
      changed = true;
    }
    if (strong === "G2405") {
      // 눅 1:9 제사장의 전례
      def = "제사 직분을 말해요. 개역한글에서는 「제사장의」으로 옮겨져요(눅 1:9). 「제사장의 전례를 따라 제비를 뽑아 주의 성소에 들어가 분향하고」(눅 1:9).";
      d.krvKo = ["제사장의"];
      defChanged = true;
      changed = true;
    }
    if (strong === "G5186") {
      def = "눈을 멀게 하는 것을 말해요. 개역한글에서는 「멀게」로 옮겨져요(요 12:40). 「저희 눈을 멀게 하시고 저희 마음을 완고하게 하셨으니」(요 12:40).";
      d.krvKo = ["멀게"];
      defChanged = true;
      changed = true;
    }
    if (strong === "G410") {
      def = "책망할 것이 없는 것을 말해요. 개역한글에서는 「책망할 것이 없는」으로 옮겨져요(고전 1:8). 「…책망할 것이 없는 자로 끝까지 견고케 하시리라」(고전 1:8).";
      d.krvKo = ["책망할 것이 없는"];
      defChanged = true;
      changed = true;
    }

    if (defChanged || changed) {
      d.defKo = ensurePeriod(def.replace(/\s+/g, " ").replace(/\.\s*\./g, ".").trim());
      d.krvKo = d.krvKo || krv;
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
    } else if (changed) {
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
    }
  }

  // ——— 2 recount: overlap sentences, 옮겨졌어요, 으로/로 ———
  let overlapBefore = 0; // approximate from pattern still present
  let overlapAfter = 0;
  let movedEyoyo = 0; // already applied
  let particleWrongBefore = 0;
  let particleWrongAfter = 0;

  // recount particle errors after fix
  for (const f of lexFiles) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    const def = d.defKo || "";
    if (/옮겨졌어요/.test(def)) movedEyoyo += 1; // remaining
    if (/^.+?(을|를) 말해요\.\s*주로 「/.test(def)) overlapAfter += 1;
    for (const m of def.matchAll(/「([^」]+)」(으로|로)/g)) {
      if (euro(m[1]) !== m[2]) particleWrongAfter += 1;
    }
  }

  // ——— 3) truncated cites 49 ———
  // rebuild remaining list similar to before
  let citeSwapped = 0;
  let citeRemoved = 0;
  const citeActions = [];

  for (const f of lexFiles) {
    const fp = path.join(LEX, f);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    const strong = d.strong || f.replace(/\.json$/, "");
    const gloss = majority(glossMaj.get(strong)) || "";
    let def = d.defKo || "";
    const cites = [...def.matchAll(/「([^」]+)」/g)].filter((m) => /…/.test(m[1]));
    if (!cites.length) continue;

    const cite = cites[cites.length - 1];
    const citeText = cite[1];
    const needles = [...(d.krvKo || []), ...(d.krvForms || []), gloss, glossStem(gloss)]
      .map(String)
      .filter((x) => x && x.length >= 1);
    const ok = needles.some((n) => n.length >= 2 && (citeText.includes(n) || normalizeKo(citeText).includes(normalizeKo(n))));
    if (ok) continue;

    // try find verse with complete krvKo
    let swapped = false;
    for (const k of d.krvKo || []) {
      const found = findCompleteVerses(k.replace(/\s+/g, ""), verses, 5);
      // also spaced
      const found2 = found.length ? found : verses.filter((v) => v.norm.includes(k.replace(/\s+/g, ""))).slice(0, 5);
      if (!found2.length) continue;
      const v = found2[0];
      const win = windowAround(v.t, k.replace(/\s+/g, "") === k ? k : k, 78) ||
        windowAround(v.t, k.split(/\s+/)[0], 78);
      if (!win) continue;
      // replace last ellipsis cite + ref
      def = def.replace(cite[0], `「${win}」`);
      def = def.replace(/\(([가-힣]+\s*\d+:\d+[^\)]*)\)\s*\.?$/, "");
      def = ensurePeriod(`${def.replace(/\.$/, "")}(${refOf(v)})`);
      d.defKo = def.replace(/\s+/g, " ");
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
      citeSwapped += 1;
      citeActions.push({ strong, action: "swap", ref: refOf(v), k });
      swapped = true;
      break;
    }
    if (swapped) continue;

    // remove cite(s) with ellipsis and trailing ref
    const beforeDef = def;
    def = def.replace(/\s*「[^」]*…[^」]*」/g, "");
    def = def.replace(/\(([가-힣]+\s*\d+:\d+[^\)]*)\)\s*\.?$/g, "");
    def = ensurePeriod(def.replace(/\s+/g, " ").replace(/\.\s*\./g, ".").trim());
    if (def !== beforeDef) {
      d.defKo = def;
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
      citeRemoved += 1;
      citeActions.push({ strong, action: "remove" });
    }
  }

  // ——— AFTER krvKo classify ———
  const after = { notInText: 0, trunc: 0, noise: 0, mixed: 0, ok: 0, values: 0 };
  let strongWithKrv = 0;
  const strongTotal = lexFiles.length;

  // refresh krv map
  for (const f of lexFiles) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    const strong = d.strong || f.replace(/\.json$/, "");
    if ((d.krvKo || []).length) strongWithKrv += 1;
    for (const k of d.krvKo || []) {
      after.values += 1;
      const issue = classifyIssue(k, verses);
      if (issue === "noise") after.noise += 1;
      else if (issue === "trunc") after.trunc += 1;
      else if (issue === "notInText") after.notInText += 1;
      else after.ok += 1;
    }
  }

  // content chip ratio
  // rebuild hasKrv set
  const hasKrv = new Set();
  for (const f of lexFiles) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    if ((d.krvKo || []).length) hasKrv.add(d.strong);
  }
  let content = 0;
  let contentWithKrv = 0;
  for (const book of NT) {
    const dir = path.join(OUT, book);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const ch = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      for (const v of ch.verses || []) {
        for (const w of v.words || []) {
          if (!w.glossKo) continue;
          if (isFnParse(w.parseKo)) continue;
          content += 1;
          if (hasKrv.has(w.strong)) contentWithKrv += 1;
        }
      }
    }
  }

  // overlap recount before approx: use 12 curated + similar; measure remaining
  // particle: scan was after fix so wrongAfter should be ~0; estimate before as wrongAfter + fixes
  // Count 옮겨졌어요 remaining
  let eyoyoRemain = 0;
  let eyoyoFixed = 0;
  // We already replaced; count how many files still have old form (0) and report replaced via gitless recount:
  // Re-scan: if any 옮겨졌어요 left
  for (const f of lexFiles) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    const n = (d.defKo || "").match(/옮겨졌어요/g);
    if (n) eyoyoRemain += n.length;
  }

  // Final force key defs again (in case later loops overwrote)
  const finals = {
    G1011: "주로 의논하는 것을 말하고, 「헤아리다」로도 옮겨져요. 「…헤아리지 아니하겠느냐」(눅 14:31).",
    G2790: "거문고 타는 자를 말해요. 개역한글에서는 「거문고」로 옮겨져요(계 14:2). 「…거문고 타는 자들의 그 거문고 타는 것 같더라」(계 14:2).",
    G2405: "제사 직분을 말해요. 개역한글에서는 「제사장의」으로 옮겨져요(눅 1:9). 「제사장의 전례를 따라 제비를 뽑아 주의 성소에 들어가 분향하고」(눅 1:9).",
    G3155: "헛되이 하는 것을 말해요. 개역한글에서는 「헛되이」로 옮겨져요(마 15:9). 「…헛되이 경배하는도다 하였느니라 하시고」(마 15:9).",
  };
  for (const [s, def] of Object.entries(finals)) {
    const fp = path.join(LEX, `${s}.json`);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    d.defKo = def;
    if (s === "G2790") d.krvKo = ["거문고"];
    if (s === "G2405") d.krvKo = ["제사장의"];
    if (s === "G3155") d.krvKo = ["헛되이"];
    if (s === "G1011") { /* keep or set */ d.krvKo = d.krvKo?.length ? d.krvKo : ["헤아리"]; 
      // ensure 헤아리지 complete
      d.krvKo = findCompleteVerses("헤아리지", verses, 1).length ? ["헤아리지"] : ["헤아리"];
    }
    fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
  }
  // Fix G1011 krvKo properly - 헤아리지 is in Luke 14:31
  {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, "G1011.json"), "utf8"));
    d.krvKo = ["헤아리지"];
    d.defKo = finals.G1011;
    fs.writeFileSync(path.join(LEX, "G1011.json"), JSON.stringify(d, null, 2) + "\n");
  }

  // particle recount after finals
  particleWrongAfter = 0;
  for (const f of lexFiles) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    for (const m of (d.defKo || "").matchAll(/「([^」]+)」(으로|로)/g)) {
      if (euro(m[1]) !== m[2]) particleWrongAfter += 1;
    }
  }

  // Estimate particle before: run logic on... we don't have snapshot. Report fixed count from this pass.
  // Count how many 으로/로 we would have corrected - already done. Use before≈after+corrected.
  // Quick: wrong after is truth; for before, re-check by temporarily... skip, report after and "corrected in pass"

  const full = {};
  for (const s of ["G1011", "G2790", "G2405", "G3155"]) {
    full[s] = JSON.parse(fs.readFileSync(path.join(LEX, `${s}.json`), "utf8")).defKo;
  }

  const report = {
    section1: {
      strongTotal: 1553,
      before,
      after,
      fixCounts,
      fixedSamples: fixedSamples.slice(0, 15),
      ratios: {
        strongWithKrv,
        strongTotal: lexFiles.filter((f) => {
          // only those that had chips? user said 1,553 strong with krvKo originally
          return true;
        }).length,
        strongPct: +((100 * strongWithKrv) / 1553).toFixed(2),
        contentChips: content,
        contentWithKrv,
        contentPct: +((100 * contentWithKrv) / content).toFixed(2),
      },
      note: "1,553은 점검 전 krvKo 보유 strong 수. strongPct는 점검 후 krvKo 잔여/1553.",
    },
    section2: {
      overlapAfter,
      eyoyoRemaining: eyoyoRemain,
      particleWrongAfter,
      note: "옮겨졌어요→옮겨져요 일괄 치환. 「X」으로/로 받침 재검사.",
    },
    section3: {
      citeSwapped,
      citeRemoved,
      citeActions: citeActions.slice(0, 30),
    },
    fullDefs: full,
  };

  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}

main();
