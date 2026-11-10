#!/usr/bin/env node
/**
 * krvKo 전수 점검 + defKo 문장 정리 + 잘린 인용
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
  "없는", "있는", "하는", "되는", "같은", "된", "한", "할",
  "그", "이", "저", "및", "또", "곧", "더", "다", "것", "수", "등", "자", "들",
  "아니", "이미", "이제", "다시", "모든", "어떤", "아무",
]);

const PARTICLES = [
  "으로서", "으로부터", "에서부터", "에게로", "으로", "로서", "로써",
  "에서", "에게", "께서", "부터", "까지", "처럼", "같이", "대로", "마다", "밖에", "보다",
  "을", "를", "이", "가", "은", "는", "의", "에", "로", "과", "와", "도", "만", "요", "여", "라", "니", "며", "고", "면",
];

const APP_FN = /관사|전치사|접속사|대명사|부정어|불변화사/;

function ensurePeriod(s) {
  const t = String(s || "").trim();
  return !t || /[.!?…]$/.test(t) ? t : `${t}.`;
}
function hasBatchim(word) {
  const ch = String(word || "").replace(/\s+/g, "").replace(/[「」()]/g, "").slice(-1);
  const code = ch?.charCodeAt(0);
  if (!code || code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}
function euro(w) { return hasBatchim(w) ? "으로" : "로"; }
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
function refOf(h) { return `${BOOK_KO[h.book]} ${h.ch}:${h.n}`; }

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

function buildIndexes() {
  const verses = [];
  const stemCount = new Map(); // stem -> count
  const stemToVerses = new Map(); // stem -> [{book,ch,n,t}] limited
  const prefix = new Map(); // first2 -> Set stems

  for (const book of NT) {
    const bd = JSON.parse(fs.readFileSync(path.join(BD, `${book}.json`), "utf8"));
    for (let ci = 0; ci < (bd.chapters || []).length; ci++) {
      for (const v of bd.chapters[ci].verses?.krv || []) {
        const t = String(v.t || "").replace(/\s+/g, " ").trim();
        const tokens = t.split(/\s+/).filter(Boolean);
        const stems = tokens.map(stripParticles).filter((x) => x.length >= 1);
        const row = { book, ch: ci + 1, n: v.n, t, tokens, stems, norm: t.replace(/\s+/g, "") };
        verses.push(row);
        for (const stem of stems) {
          stemCount.set(stem, (stemCount.get(stem) || 0) + 1);
          if (!stemToVerses.has(stem)) stemToVerses.set(stem, []);
          const arr = stemToVerses.get(stem);
          if (arr.length < 6) arr.push({ book, ch: ci + 1, n: v.n, t });
          if (stem.length >= 2) {
            const p = stem.slice(0, 2);
            if (!prefix.has(p)) prefix.set(p, new Set());
            prefix.get(p).add(stem);
          }
        }
      }
    }
  }
  return { verses, stemCount, stemToVerses, prefix };
}

function isCompleteWord(form, stemCount) {
  const f = String(form || "").replace(/\s+/g, "");
  if (!f) return false;
  if (stemCount.has(f)) return true;
  // 제사장의 → stem 제사장
  const stripped = stripParticles(f);
  if (stripped && stripped !== f && stemCount.has(stripped)) return true;
  return false;
}

function phraseInNorm(form, verses) {
  const f = String(form || "").replace(/\s+/g, "");
  if (f.length < 3) return false;
  // require as token sequence join equals f
  for (const v of verses) {
    const stems = v.stems;
    for (let i = 0; i < stems.length; i++) {
      let acc = "";
      for (let j = i; j < Math.min(stems.length, i + 6); j++) {
        acc += stems[j];
        if (acc === f) return true;
        if (acc.length > f.length) break;
      }
    }
  }
  return false;
}

function longerFor(form, prefix, stemCount) {
  const f = String(form || "").replace(/\s+/g, "");
  if (f.length < 1) return [];
  const p = f.slice(0, Math.min(2, f.length));
  const set = prefix.get(p) || new Set();
  const out = [];
  for (const stem of set) {
    if (stem.length > f.length && stem.startsWith(f)) {
      out.push({ w: stem, c: stemCount.get(stem) || 0 });
    }
  }
  out.sort((a, b) => b.c - a.c || b.w.length - a.w.length);
  return out;
}

function classify(form, stemCount, prefix) {
  const f = String(form || "").replace(/\s+/g, "");
  if (!f || NOISE.has(f) || f.length === 1) return "noise";
  const complete = isCompleteWord(f, stemCount);
  // 본문 stem으로 완결되면 유지(서기관·여자 등을 서기관들·여자들로 늘리지 않음)
  if (complete) return null;
  const longer = longerFor(f, prefix, stemCount);
  // 거문→거문고, 헛되→헛되이: 미완 접두 + 더 긴 완결형
  if (longer.length) {
    if (/(되|하|케|히)$/.test(f) || f.length <= 2) return "trunc";
    return "notInText";
  }
  return "notInText";
}

function repair(form, gloss, stemCount, prefix) {
  const f = String(form || "").replace(/\s+/g, "");
  const issue = classify(f, stemCount, prefix);
  if (!issue) return { action: "keep", from: f, to: f, reason: "ok" };
  if (issue === "noise") return { action: "drop", from: f, to: null, reason: "noise" };

  const longer = longerFor(f, prefix, stemCount);
  const gs = glossStem(gloss);
  for (const { w } of longer) {
    if (NOISE.has(w)) continue;
    if (gs && gs.length >= 2) {
      if (w.includes(gs.slice(0, 2)) || gs.includes(w.slice(0, 2)) || w.startsWith(f)) {
        return { action: "fix", from: f, to: w, reason: issue };
      }
    } else if (w.startsWith(f)) {
      return { action: "fix", from: f, to: w, reason: issue };
    }
  }
  if (longer[0]) return { action: "fix", from: f, to: longer[0].w, reason: issue };

  // try gloss-based
  for (const c of [gloss, glossStem(gloss), `${glossStem(gloss)}이`, `${glossStem(gloss)}히`, `${glossStem(gloss)}다`]) {
    const cc = String(c || "").replace(/\s+/g, "");
    if (cc.length < 2 || NOISE.has(cc)) continue;
    if (isCompleteWord(cc, stemCount)) {
      return { action: "fix", from: f, to: cc, reason: issue };
    }
  }
  return { action: "drop", from: f, to: null, reason: issue };
}

function windowAround(text, needle, maxLen = 72) {
  const t = String(text).replace(/\s+/g, " ").trim();
  let idx = t.indexOf(needle);
  if (idx < 0) {
    // try first chars
    idx = t.indexOf(String(needle).slice(0, Math.min(2, needle.length)));
    if (idx < 0) return null;
  }
  const nlen = t.includes(needle) ? needle.length : Math.min(2, needle.length);
  const room = Math.max(8, maxLen - nlen);
  let start = Math.max(0, idx - Math.floor(room * 0.3));
  let end = Math.min(t.length, idx + nlen + Math.floor(room * 0.7));
  if (start > 0) {
    const sp = t.lastIndexOf(" ", idx - 1);
    if (sp >= start - 16 && sp < idx) start = sp + 1;
  }
  if (end < t.length) {
    const sp = t.indexOf(" ", idx + nlen);
    if (sp > 0 && sp <= end + 16) end = sp;
  }
  let s = t.slice(start, end);
  if (start > 0) s = `…${s}`;
  if (end < t.length) s = `${s}…`;
  return s;
}

function main() {
  console.error("indexing…");
  const { verses, stemCount, stemToVerses, prefix } = buildIndexes();
  console.error("stems", stemCount.size, "verses", verses.length);

  const glossMaj = new Map();
  const chipHits = new Map();
  const verseStrongs = new Map();

  for (const book of NT) {
    for (const f of fs.readdirSync(path.join(OUT, book)).filter((x) => x.endsWith(".json"))) {
      const chN = Number(f.replace(".json", ""));
      const ch = JSON.parse(fs.readFileSync(path.join(OUT, book, f), "utf8"));
      for (const v of ch.verses || []) {
        const key = `${book}:${chN}:${v.n}`;
        if (!verseStrongs.has(key)) verseStrongs.set(key, []);
        for (const w of v.words || []) {
          if (!w.strong) continue;
          verseStrongs.get(key).push(w.strong);
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

  const lexFiles = fs.readdirSync(LEX).filter((x) => x.endsWith(".json"));

  // preload krv for mixed check
  const krvMap = new Map();
  for (const f of lexFiles) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    krvMap.set(d.strong, [...(d.krvKo || [])]);
  }

  const before = { notInText: 0, trunc: 0, noise: 0, mixed: 0, ok: 0, values: 0 };
  const beforeSamples = { notInText: [], trunc: [], noise: [], mixed: [] };

  for (const f of lexFiles) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    const strong = d.strong;
    const gloss = majority(glossMaj.get(strong)) || "";
    const hits = chipHits.get(strong) || [];
    for (const k of d.krvKo || []) {
      before.values += 1;
      let issue = classify(k, stemCount, prefix);
      let mixed = false;
      if (!issue) {
        // mixed: form matches another strong on same verse whose gloss fits better
        for (const hit of hits.slice(0, 12)) {
          const others = verseStrongs.get(`${hit.book}:${hit.ch}:${hit.n}`) || [];
          for (const os of others) {
            if (os === strong) continue;
            const okrv = krvMap.get(os) || [];
            if (!okrv.includes(k)) continue;
            const myG = glossStem(gloss);
            const otG = glossStem(majority(glossMaj.get(os)) || "");
            if (otG.length >= 2 && k.includes(otG.slice(0, 2)) && myG.length >= 2 && !k.includes(myG.slice(0, 2))) {
              mixed = true;
              break;
            }
          }
          if (mixed) break;
        }
      }
      if (issue === "noise") {
        before.noise += 1;
        if (beforeSamples.noise.length < 8) beforeSamples.noise.push({ strong, k });
      } else if (issue === "trunc") {
        before.trunc += 1;
        if (beforeSamples.trunc.length < 8) beforeSamples.trunc.push({ strong, k });
      } else if (issue === "notInText") {
        before.notInText += 1;
        if (beforeSamples.notInText.length < 8) beforeSamples.notInText.push({ strong, k });
      } else if (mixed) {
        before.mixed += 1;
        if (beforeSamples.mixed.length < 8) beforeSamples.mixed.push({ strong, k });
      } else before.ok += 1;
    }
  }
  console.error("before", before);

  const MANUAL = {
    G2790: ["거문고"],
    G5186: ["멀게"],
    G3155: ["헛되이"],
    G410: ["책망할 것이 없는"],
    G2405: ["제사장의"],
    G1011: ["헤아리지"],
  };

  const fixedSamples = [];
  const fixCounts = { notInText: 0, trunc: 0, noise: 0, mixed: 0 };
  let eyoyoN = 0;
  let overlapBefore = 0;
  let particleWrongBefore = 0;

  for (const f of lexFiles) {
    const fp = path.join(LEX, f);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    const strong = d.strong;
    const gloss = majority(glossMaj.get(strong)) || "";
    let krv = [...(d.krvKo || [])];
    let changed = false;
    let def = (d.defKo || "").trim();

    // count before sentence issues
    eyoyoN += (def.match(/옮겨졌어요/g) || []).length;
    if (/^.+?(을|를) 말해요\.\s*주로 「/.test(def)) overlapBefore += 1;
    for (const m of def.matchAll(/「([^」]+)」(으로|로)/g)) {
      if (euro(m[1]) !== m[2]) particleWrongBefore += 1;
    }

    if (MANUAL[strong]) {
      const prev = krv.slice();
      krv = MANUAL[strong].filter((x) => {
        const n = x.replace(/\s+/g, "");
        return isCompleteWord(n, stemCount) || verses.some((v) => v.norm.includes(n));
      });
      if (!krv.length) krv = MANUAL[strong];
      if (JSON.stringify(prev) !== JSON.stringify(krv)) {
        changed = true;
        if (fixedSamples.length < 15) fixedSamples.push({ strong, from: prev, to: krv, reason: "manual" });
      }
    } else if (krv.length) {
      // 이전 과잉 확장 복구: 서기관들→서기관(완결 stem이면)
      krv = krv.map((k) => {
        const f = String(k).replace(/\s+/g, "");
        for (const suf of ["들아", "들이", "들은", "들을", "들로", "들"]) {
          if (f.endsWith(suf) && f.length > suf.length) {
            const base = f.slice(0, -suf.length);
            if (isCompleteWord(base, stemCount)) {
              const gs = glossStem(gloss);
              if (!gs || base.includes(gs.slice(0, Math.min(2, gs.length))) || gs.includes(base.slice(0, Math.min(2, base.length)))) {
                return base;
              }
            }
          }
        }
        // 혼인집 등: gloss stem이 더 짧고 완결이면 gloss stem 우선
        const gs = glossStem(gloss);
        if (gs && gs.length >= 2 && f.startsWith(gs) && f.length > gs.length && isCompleteWord(gs, stemCount)) {
          return gs;
        }
        return k;
      });

      const next = [];
      const seen = new Set();
      for (const k of krv) {
        const rep = repair(k, gloss, stemCount, prefix);
        if (rep.action === "keep") {
          if (!seen.has(rep.to)) { next.push(rep.to); seen.add(rep.to); }
        } else if (rep.action === "fix" && rep.to) {
          fixCounts[rep.reason] = (fixCounts[rep.reason] || 0) + 1;
          if (!seen.has(rep.to)) { next.push(rep.to); seen.add(rep.to); }
          changed = true;
          if (fixedSamples.length < 15) fixedSamples.push({ strong, from: rep.from, to: rep.to, reason: rep.reason });
        } else {
          fixCounts[rep.reason] = (fixCounts[rep.reason] || 0) + 1;
          changed = true;
          if (fixedSamples.length < 15) fixedSamples.push({ strong, from: rep.from, to: null, reason: `drop:${rep.reason}` });
        }
      }
      // mixed fix for remaining: if form better fits another strong, drop
      const hits = chipHits.get(strong) || [];
      const cleaned = [];
      for (const k of next) {
        let dropMixed = false;
        const myG = glossStem(gloss);
        for (const hit of hits.slice(0, 8)) {
          for (const os of verseStrongs.get(`${hit.book}:${hit.ch}:${hit.n}`) || []) {
            if (os === strong) continue;
            const otG = glossStem(majority(glossMaj.get(os)) || "");
            if (otG.length >= 2 && k.includes(otG.slice(0, 2)) && myG.length >= 2 && !k.includes(myG.slice(0, 2))) {
              dropMixed = true;
              fixCounts.mixed += 1;
              if (fixedSamples.length < 15) fixedSamples.push({ strong, from: k, to: null, reason: "drop:mixed" });
              break;
            }
          }
          if (dropMixed) break;
        }
        if (!dropMixed) cleaned.push(k);
        else changed = true;
      }
      krv = cleaned;
    }

    // def cleanup
    if (/옮겨졌어요/.test(def)) {
      def = def.replace(/옮겨졌어요/g, "옮겨져요");
      changed = true;
    }

    // collapse overlap
    {
      const m = def.match(/^((?:.+)?)(을|를) 말해요\.\s*주로 「([^」]+)」(을|를) 말하고,\s*「([^」]+)」(으로|로)도 옮겨져요\./);
      if (m) {
        const body = m[1].trim();
        const y = m[5];
        // G1011-style: 주로 {body}을 말하고, 「Y」로도
        def = `주로 ${body}을 말하고, 「${y}」${euro(y)}도 옮겨져요.${def.slice(m[0].length)}`;
        def = def.replace(/것을을/, "것을").replace(/\s+/g, " ").trim();
        changed = true;
      }
    }

    // particle fix
    def = def.replace(/「([^」]+)」(으로|로)/g, (_, w) => `「${w}」${euro(w)}`);

    // sync bad (개역한글:) with krv
    if (krv[0]) {
      def = def.replace(/\(개역한글:\s*([^)]+)\)/g, (all, inner) => {
        const issue = classify(inner, stemCount, prefix);
        if (issue) { changed = true; return `(개역한글: ${krv[0]})`; }
        return all;
      });
    }

    // forced defs
    if (strong === "G1011") {
      def = "주로 의논하는 것을 말하고, 「헤아리다」로도 옮겨져요. 「…헤아리지 아니하겠느냐」(눅 14:31).";
      krv = ["헤아리지"];
      changed = true;
    }
    if (strong === "G2790") {
      def = "거문고 타는 자를 말해요. 개역한글에서는 「거문고」로 옮겨져요(계 14:2). 「…거문고 타는 자들의 그 거문고 타는 것 같더라」(계 14:2).";
      krv = ["거문고"];
      changed = true;
    }
    if (strong === "G2405") {
      def = `제사 직분을 말해요. 개역한글에서는 「제사장의」${euro("제사장의")} 옮겨져요(눅 1:9). 「제사장의 전례를 따라 제비를 뽑아 주의 성소에 들어가 분향하고」(눅 1:9).`;
      krv = ["제사장의"];
      changed = true;
    }
    if (strong === "G3155") {
      def = "헛되이 하는 것을 말해요. 개역한글에서는 「헛되이」로 옮겨져요(마 15:9). 「…헛되이 경배하는도다 하였느니라 하시고」(마 15:9).";
      krv = ["헛되이"];
      changed = true;
    }
    if (strong === "G5186") {
      def = "눈을 멀게 하는 것을 말해요. 개역한글에서는 「멀게」로 옮겨져요(요 12:40). 「저희 눈을 멀게 하시고 저희 마음을 완고하게 하셨으니」(요 12:40).";
      krv = ["멀게"];
      changed = true;
    }
    if (strong === "G410") {
      def = "책망할 것이 없는 것을 말해요. 개역한글에서는 「책망할 것이 없는」으로 옮겨져요(고전 1:8). 「…책망할 것이 없는 자로 끝까지 견고케 하시리라」(고전 1:8).";
      krv = ["책망할 것이 없는"];
      changed = true;
    }

    if (changed) {
      d.krvKo = krv;
      d.defKo = ensurePeriod(String(def).replace(/\s+/g, " ").replace(/\.\s*\./g, ".").trim());
      if (Array.isArray(d.krvForms)) {
        d.krvForms = d.krvForms
          .map((x) => repair(x, gloss, stemCount, prefix))
          .filter((r) => r.action !== "drop")
          .map((r) => r.to || r.from)
          .filter(Boolean);
        // unique
        d.krvForms = [...new Set(d.krvForms)].filter((x) => !krv.includes(x));
        if (!d.krvForms.length) delete d.krvForms;
      }
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
    }
  }
  console.error("krv/def pass done");

  // ——— cites: 이전 잔여 49건만 ———
  let citeSwapped = 0;
  let citeRemoved = 0;
  const citeActions = [];
  let rem49 = [];
  try {
    const prev = JSON.parse(fs.readFileSync(path.join(OUT, "_greek-defko-final-pass-report.json"), "utf8"));
    rem49 = prev.section1?.remainingCites?.list || [];
  } catch { /* */ }
  if (!rem49.length) {
    // fallback: ellipsis cite missing krv needle
    for (const f of lexFiles) {
      const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
      const cites = [...(d.defKo || "").matchAll(/「([^」]+)」/g)].filter((m) => /…/.test(m[1]));
      if (!cites.length) continue;
      const citeText = cites[cites.length - 1][1];
      const gloss = majority(glossMaj.get(d.strong)) || "";
      const needles = [...(d.krvKo || []), gloss, glossStem(gloss)].filter((x) => x && String(x).length >= 2);
      const ok = needles.some((n) => citeText.includes(n));
      if (!ok) rem49.push({ strong: d.strong });
    }
  }

  for (const row of rem49) {
    const strong = row.strong;
    const fp = path.join(LEX, `${strong}.json`);
    if (!fs.existsSync(fp)) continue;
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    const gloss = majority(glossMaj.get(strong)) || "";
    let def = d.defKo || "";
    const cites = [...def.matchAll(/「([^」]+)」/g)].filter((m) => /…/.test(m[1]));
    if (!cites.length) {
      // already removed
      continue;
    }
    const cite = cites[cites.length - 1];
    const citeText = cite[1];
    const needles = [...(d.krvKo || []), gloss, glossStem(gloss)].map(String).filter((x) => x && x.length >= 1);
    const ok = needles.some((n) => n.length >= 1 && (citeText.includes(n) || normalizeKo(citeText).includes(normalizeKo(n))));
    if (ok) continue;

    let swapped = false;
    for (const k of d.krvKo || []) {
      const key = k.replace(/\s+/g, "");
      let found = stemToVerses.get(key) || [];
      if (!found.length) {
        const stripped = stripParticles(key);
        found = stemToVerses.get(stripped) || [];
      }
      if (!found.length) {
        found = verses.filter((v) => v.norm.includes(key)).slice(0, 3).map((v) => ({ book: v.book, ch: v.ch, n: v.n, t: v.t }));
      }
      if (!found.length) continue;
      const v = found[0];
      const win = windowAround(v.t, k.includes(" ") ? k.split(/\s+/)[0] : stripParticles(k), 78);
      if (!win || (!win.includes(stripParticles(k)) && !win.includes(k.replace(/\s+/g, "").slice(0, 2)))) continue;
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
  console.error("cites", { citeSwapped, citeRemoved, rem49: rem49.length });

  // after counts
  const after = { notInText: 0, trunc: 0, noise: 0, mixed: 0, ok: 0, values: 0 };
  let strongWithKrv = 0;
  for (const f of lexFiles) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    if ((d.krvKo || []).length) strongWithKrv += 1;
    for (const k of d.krvKo || []) {
      after.values += 1;
      const issue = classify(k, stemCount, prefix);
      if (issue === "noise") after.noise += 1;
      else if (issue === "trunc") after.trunc += 1;
      else if (issue === "notInText") after.notInText += 1;
      else after.ok += 1;
    }
  }

  const hasKrv = new Set();
  for (const f of lexFiles) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    if ((d.krvKo || []).length) hasKrv.add(d.strong);
  }
  let content = 0;
  let contentWithKrv = 0;
  for (const book of NT) {
    for (const f of fs.readdirSync(path.join(OUT, book)).filter((x) => x.endsWith(".json"))) {
      const ch = JSON.parse(fs.readFileSync(path.join(OUT, book, f), "utf8"));
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

  let overlapAfter = 0;
  let eyoyoRemain = 0;
  let particleWrongAfter = 0;
  for (const f of lexFiles) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    const def = d.defKo || "";
    if (/^.+?(을|를) 말해요\.\s*주로 「/.test(def)) overlapAfter += 1;
    eyoyoRemain += (def.match(/옮겨졌어요/g) || []).length;
    for (const m of def.matchAll(/「([^」]+)」(으로|로)/g)) {
      if (euro(m[1]) !== m[2]) particleWrongAfter += 1;
    }
  }

  // re-force key defs
  const finals = {
    G1011: { def: "주로 의논하는 것을 말하고, 「헤아리다」로도 옮겨져요. 「…헤아리지 아니하겠느냐」(눅 14:31).", krv: ["헤아리지"] },
    G2790: { def: "거문고 타는 자를 말해요. 개역한글에서는 「거문고」로 옮겨져요(계 14:2). 「…거문고 타는 자들의 그 거문고 타는 것 같더라」(계 14:2).", krv: ["거문고"] },
    G2405: { def: `제사 직분을 말해요. 개역한글에서는 「제사장의」${euro("제사장의")} 옮겨져요(눅 1:9). 「제사장의 전례를 따라 제비를 뽑아 주의 성소에 들어가 분향하고」(눅 1:9).`, krv: ["제사장의"] },
    G3155: { def: "헛되이 하는 것을 말해요. 개역한글에서는 「헛되이」로 옮겨져요(마 15:9). 「…헛되이 경배하는도다 하였느니라 하시고」(마 15:9).", krv: ["헛되이"] },
  };
  for (const [s, cfg] of Object.entries(finals)) {
    const fp = path.join(LEX, `${s}.json`);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    d.defKo = cfg.def;
    d.krvKo = cfg.krv;
    fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
  }

  const full = {};
  for (const s of Object.keys(finals)) {
    full[s] = JSON.parse(fs.readFileSync(path.join(LEX, `${s}.json`), "utf8")).defKo;
  }

  const report = {
    section1: {
      before: { ...before, samples: beforeSamples },
      after,
      fixCounts,
      fixedSamples,
      ratios: {
        strongWithKrvBefore: 1553,
        strongWithKrvAfter: strongWithKrv,
        strongPct: +((100 * strongWithKrv) / 1553).toFixed(2),
        contentChips: content,
        contentWithKrv,
        contentPct: +((100 * contentWithKrv) / content).toFixed(2),
      },
    },
    section2: {
      overlapBefore,
      overlapAfter,
      eyoyoReplaced: eyoyoN,
      eyoyoRemain,
      particleWrongBefore,
      particleWrongAfter,
    },
    section3: { citeSwapped, citeRemoved, citeActions: citeActions.slice(0, 40) },
    fullDefs: full,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}

main();
