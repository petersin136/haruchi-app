#!/usr/bin/env node
/**
 * 1) defKo 「X를 가리켜요」 틀 → 「X를 말해요」 (전수 0)
 * 2) 「…」로 시작하는 잘린 인용 → 완결 구절
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const OUT = path.join(root, "public", "word-study");
const LEX = path.join(OUT, "lexicon", "greek");
const BD = path.join(root, "public", "bible-data");
const DATA = path.join(root, "data");
const REPORT = path.join(OUT, "_greek-defko-gari-cite-finish-report.json");
const REPORT_DATA = path.join(DATA, "_greek-defko-gari-cite-finish-report.json");

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

function ensurePeriod(s) {
  const t = String(s || "").trim();
  return !t || /[.!?…]$/.test(t) ? t : `${t}.`;
}
function refOf(h) {
  return `${BOOK_KO[h.book]} ${h.ch}:${h.n}`;
}
function normalizeKo(s) {
  return String(s || "").replace(/\s+/g, "").replace(/[.,;:!?·"'“”‘’()[\]{}「」『』…]/g, "");
}

function countGari(def) {
  return (String(def || "").match(/가리켜요/g) || []).length;
}
function countLeadEllipCites(def) {
  let n = 0;
  for (const m of String(def || "").matchAll(/「([^」]*)」/g)) {
    if (/^…/.test(m[1]) || /^\.\.\./.test(m[1])) n += 1;
  }
  return n;
}

/** 절 안에서 needle을 품은 완결 구절(가능하면 온절) */
function completeClause(verseText, needle) {
  const t = String(verseText || "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const n = String(needle || "").replace(/\s+/g, " ").trim();
  const normT = t.replace(/\s+/g, "");
  const normN = n.replace(/\s+/g, "");
  if (!normN || !normT.includes(normN)) {
    // try shorter head of needle
    for (let len = Math.min(normN.length, 6); len >= 2; len--) {
      const sub = normN.slice(0, len);
      if (normT.includes(sub)) {
        return pickClause(t, sub);
      }
    }
    return t; // fallback: whole verse
  }
  return pickClause(t, normN);
}

function pickClause(t, normNeedle) {
  // Prefer full verse when reasonably short
  if (t.length <= 90) return t;

  // Split into clause-like chunks on Korean endings + punctuation
  const parts = t.split(/(?<=(?:니라|더라|도다|로다|구나|느니라|으리라|리라|하라|하라\s|하리라|이요|이니라|이니|으며|고|며|되|나|요|다))\s+|(?<=[.;!?])\s+/);
  const scored = [];
  for (const p of parts) {
    const pt = p.replace(/\s+/g, " ").trim();
    if (pt.length < 4) continue;
    if (pt.replace(/\s+/g, "").includes(normNeedle)) scored.push(pt);
  }
  if (scored.length) {
    // longest complete-looking chunk that still fits
    scored.sort((a, b) => b.length - a.length);
    const best = scored.find((x) => x.length <= 120) || scored[0];
    if (best.length >= 8) return best;
  }

  // Window around needle but snap to clause boundaries (no leading …)
  const plain = t;
  const idx = plain.replace(/\s+/g, "").indexOf(normNeedle);
  // map approx back via includes search on original
  let start = plain.indexOf(needleLoose(plain, normNeedle));
  if (start < 0) start = Math.max(0, Math.floor(plain.length * 0.2));
  const endNeedle = start + Math.min(normNeedle.length + 8, plain.length - start);

  // expand left to previous pause
  let L = start;
  while (L > 0 && !/[.!?…]/.test(plain[L - 1]) && start - L < 50) L -= 1;
  // prefer start of verse or after space boundary
  const sp = plain.lastIndexOf(" ", start - 1);
  if (sp >= 0 && start - sp < 40) L = Math.min(L, sp + 1);
  if (L <= 2) L = 0;

  let R = endNeedle;
  while (R < plain.length && !/[.!?…]/.test(plain[R]) && R - start < 100) R += 1;
  if (R < plain.length && /[.!?…]/.test(plain[R])) R += 1;
  else {
    const sp2 = plain.indexOf(" ", endNeedle);
    if (sp2 > 0 && sp2 - start <= 110) R = sp2;
  }

  let out = plain.slice(L === 0 ? 0 : L, Math.min(plain.length, R)).trim();
  // strip residual leading connectors
  out = out.replace(/^[….\s]+/, "");
  if (out.length < 6) return plain;
  return out;
}

function needleLoose(plain, normNeedle) {
  // find a substring in plain whose norm matches start of normNeedle
  for (let len = Math.min(6, normNeedle.length); len >= 2; len--) {
    const sub = normNeedle.slice(0, len);
    // rebuild with spaces ignored: scan
    let acc = "";
    for (let i = 0; i < plain.length; i++) {
      if (/\s/.test(plain[i])) continue;
      // try match from i
      let j = i;
      let k = 0;
      let startCh = -1;
      while (j < plain.length && k < sub.length) {
        if (/\s/.test(plain[j])) { j += 1; continue; }
        if (plain[j] !== sub[k]) break;
        if (startCh < 0) startCh = j;
        j += 1; k += 1;
      }
      if (k === sub.length) return plain.slice(startCh, startCh + 1); // return first char pos via indexOf later
    }
    const idx = plain.replace(/\s+/g, "").indexOf(sub);
    if (idx >= 0) {
      // approximate: find first char of sub in plain
      let seen = 0;
      for (let i = 0; i < plain.length; i++) {
        if (/\s/.test(plain[i])) continue;
        if (seen === idx) return plain[i];
        seen += 1;
      }
    }
  }
  return normNeedle.slice(0, 2);
}

function parseRef(ref) {
  const m = String(ref || "").match(/^([가-힣]+)\s*(\d+):(\d+)/);
  if (!m) return null;
  const book = Object.entries(BOOK_KO).find(([, ko]) => ko === m[1])?.[0];
  if (!book) return null;
  return { book, ch: Number(m[2]), n: Number(m[3]) };
}

function buildCorpus() {
  const verses = [];
  const byRef = new Map();
  const stemToVerses = new Map();
  for (const book of NT) {
    const bd = JSON.parse(fs.readFileSync(path.join(BD, `${book}.json`), "utf8"));
    for (let ci = 0; ci < (bd.chapters || []).length; ci++) {
      for (const v of bd.chapters[ci].verses?.krv || []) {
        const t = String(v.t || "").replace(/\s+/g, " ").trim();
        const row = { book, ch: ci + 1, n: v.n, t, norm: t.replace(/\s+/g, "") };
        verses.push(row);
        byRef.set(`${book}:${ci + 1}:${v.n}`, row);
        for (const tok of t.split(/\s+/)) {
          const st = tok.replace(/[.,!?‘’“”']/g, "");
          if (st.length < 2) continue;
          if (!stemToVerses.has(st)) stemToVerses.set(st, []);
          const arr = stemToVerses.get(st);
          if (arr.length < 12) arr.push(row);
        }
      }
    }
  }
  return { verses, byRef, stemToVerses };
}

function findVerse(needles, preferRef, byRef, stemToVerses, verses) {
  if (preferRef) {
    const p = parseRef(preferRef);
    if (p) {
      const row = byRef.get(`${p.book}:${p.ch}:${p.n}`);
      if (row) {
        const ok = needles.some((n) => n && row.norm.includes(normalizeKo(n)));
        if (ok || !needles.length) return row;
      }
    }
  }
  for (const n of needles) {
    const key = String(n || "").replace(/\s+/g, "");
    if (key.length < 2) continue;
    const hits = stemToVerses.get(key) || [];
    if (hits.length) return hits[0];
    // prefix token
    for (const [st, arr] of stemToVerses) {
      if (st.includes(key) || key.includes(st)) {
        if (arr[0]) return arr[0];
      }
    }
    const found = verses.find((v) => v.norm.includes(key));
    if (found) return found;
  }
  return null;
}

function extractCiteNeedles(citeText, d) {
  const raw = String(citeText || "").replace(/^…+/, "").replace(/…+$/, "").trim();
  const out = [];
  for (const k of [...(d.krvKo || []), ...(d.krvForms || [])]) {
    if (k && (raw.includes(k) || normalizeKo(raw).includes(normalizeKo(k)))) out.push(k);
  }
  // significant chunks from cite (≥2 chars)
  const chunk = raw.replace(/\s+/g, "");
  if (chunk.length >= 2) out.push(raw.slice(0, Math.min(12, raw.length)));
  if (chunk.length >= 4) out.push(chunk.slice(0, 4));
  return [...new Set(out.filter(Boolean))];
}

function main() {
  console.error("corpus…");
  const { verses, byRef, stemToVerses } = buildCorpus();
  const lexFiles = fs.readdirSync(LEX).filter((x) => x.endsWith(".json"));

  let gariBefore = 0;
  let gariAfter = 0;
  let ellipBefore = 0;
  let ellipAfter = 0;
  let gariFixedFiles = 0;
  let ellipFixedFiles = 0;
  const samples = { gari: [], ellip: [] };

  // Force keys
  const FORCE_CITE = {
    G1011: { book: "luke", ch: 14, n: 31, needle: "헤아리지" },
    G2790: { book: "revelation", ch: 14, n: 2, needle: "거문고 타는" },
    G3956: { book: "matthew", ch: 1, n: 17, needle: "모든" },
  };

  for (const f of lexFiles) {
    const fp = path.join(LEX, f);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    let def = d.defKo || "";
    const beforeG = countGari(def);
    const beforeE = countLeadEllipCites(def);
    gariBefore += beforeG;
    ellipBefore += beforeE;
    let changed = false;

    // ——— 1) 가리켜요 → 말해요 ———
    if (beforeG) {
      const next = def.replace(/가리켜요/g, "말해요");
      if (next !== def) {
        def = next;
        changed = true;
        gariFixedFiles += 1;
        if (samples.gari.length < 12) {
          samples.gari.push({ strong: d.strong, from: beforeG });
        }
      }
    }

    // ——— 2) leading-ellipsis cites → complete clause ———
    if (beforeE || FORCE_CITE[d.strong]) {
      const cites = [...def.matchAll(/「([^」]*)」/g)];
      let rebuilt = def;
      // replace from end to keep indices stable
      for (let i = cites.length - 1; i >= 0; i--) {
        const m = cites[i];
        const citeText = m[1];
        const isLead = /^…/.test(citeText) || /^\.\.\./.test(citeText);
        const force = FORCE_CITE[d.strong] && i === cites.length - 1;
        if (!isLead && !force) continue;

        let row = null;
        let needle = "";
        if (FORCE_CITE[d.strong] && (isLead || force)) {
          const fc = FORCE_CITE[d.strong];
          row = byRef.get(`${fc.book}:${fc.ch}:${fc.n}`) || null;
          needle = fc.needle;
        }
        if (!row) {
          // trailing ref after this cite
          const after = def.slice(m.index + m[0].length, m.index + m[0].length + 24);
          const refM = after.match(/^\(([가-힣]+\s*\d+:\d+[^\)]*)\)/);
          const needles = extractCiteNeedles(citeText, d);
          needle = needles[0] || "";
          row = findVerse(needles, refM?.[1], byRef, stemToVerses, verses);
        }
        if (!row) continue;
        const clause = completeClause(row.t, needle || (d.krvKo || [])[0] || citeText.replace(/^…+/, "").slice(0, 8));
        if (!clause) continue;
        // no leading ellipsis; allow trailing only if we cut mid-verse AND clause != full verse
        let finalCite = clause.replace(/^[….\s]+/, "").trim();
        if (finalCite !== row.t && !/[.!?다라요]$/.test(finalCite) && row.t.startsWith(finalCite)) {
          // keep as is
        }
        // If still starts with fragment connector, prefer full verse when ≤120
        if (/^…/.test(finalCite)) finalCite = finalCite.replace(/^…+/, "");
        if (row.t.length <= 120) finalCite = row.t;

        const newRef = refOf(row);
        // replace cite; ensure ref after
        const oldAll = m[0];
        const afterSlice = rebuilt.slice(m.index + m[0].length);
        const hasRef = afterSlice.match(/^\(([가-힣]+\s*\d+:\d+[^\)]*)\)/);
        let insert = `「${finalCite}」`;
        if (hasRef) {
          insert += `(${newRef})`;
          // remove old ref
          rebuilt =
            rebuilt.slice(0, m.index) +
            insert +
            rebuilt.slice(m.index + m[0].length + hasRef[0].length);
        } else {
          rebuilt = rebuilt.slice(0, m.index) + insert + `(${newRef})` + rebuilt.slice(m.index + m[0].length);
        }
        changed = true;
      }
      if (rebuilt !== def) {
        def = rebuilt;
        ellipFixedFiles += 1;
        if (samples.ellip.length < 15) {
          samples.ellip.push({ strong: d.strong });
        }
      }
    }

    // G3956 opening normalize
    if (d.strong === "G3956") {
      def =
        "모든 것을 말해요. 개역한글에서는 「모든」으로 옮겨져요. 「그런즉 모든 대 수가 아브라함부터 다윗까지 열 네 대요」(마 1:17).";
      changed = true;
    }
    if (d.strong === "G1011") {
      const row = byRef.get("luke:14:31");
      const cite = row ? row.t : "또 어느 왕이 다른 왕과 싸우러 갈 때에 먼저 앉아 일만으로서 저 이만을 가지고 오는 자를 대적할 수 있을까 헤아리지 아니하겠느냐";
      def = `주로 의논하는 것을 말하고, 「헤아리다」로도 옮겨져요. 「${cite}」(눅 14:31).`;
      changed = true;
    }
    if (d.strong === "G2790") {
      const row = byRef.get("revelation:14:2");
      const cite = row ? row.t : "내가 하늘에서 나는 소리를 들으니 많은 물소리도 같고 큰 뇌성도 같은데 내게 들리는 소리는 거문고 타는 자들의 그 거문고 타는 것 같더라";
      def = `거문고 타는 자를 말해요. 개역한글에서는 「거문고 타는 자」로 옮겨져요. 「${cite}」(계 14:2).`;
      changed = true;
    }

    if (changed) {
      d.defKo = ensurePeriod(String(def).replace(/\s+/g, " ").replace(/\.\s*\./g, ".").trim());
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
    }
  }

  // recount
  const remainGari = [];
  const remainEllip = [];
  for (const f of lexFiles) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    const def = d.defKo || "";
    const g = countGari(def);
    const e = countLeadEllipCites(def);
    gariAfter += g;
    ellipAfter += e;
    if (g && remainGari.length < 20) remainGari.push({ strong: d.strong, def: def.slice(0, 100) });
    if (e && remainEllip.length < 20) {
      const cite = [...def.matchAll(/「([^」]*)」/g)].find((m) => /^…/.test(m[1]));
      remainEllip.push({ strong: d.strong, cite: cite?.[1]?.slice(0, 80) });
    }
  }

  // second pass if ellip remain — force full verse from attached ref
  if (ellipAfter > 0) {
    console.error("second pass ellip", ellipAfter);
    for (const f of lexFiles) {
      const fp = path.join(LEX, f);
      const d = JSON.parse(fs.readFileSync(fp, "utf8"));
      let def = d.defKo || "";
      if (!countLeadEllipCites(def)) continue;
      let changed = false;
      const re = /「(…[^」]*)」(?:\(([가-힣]+\s*\d+:\d+[^\)]*)\))?/g;
      def = def.replace(re, (all, citeText, ref) => {
        const needles = extractCiteNeedles(citeText, d);
        const row = findVerse(needles, ref, byRef, stemToVerses, verses);
        if (!row) return all;
        const clause = row.t.length <= 140 ? row.t : completeClause(row.t, needles[0] || "");
        changed = true;
        return `「${clause}」(${refOf(row)})`;
      });
      if (changed) {
        d.defKo = ensurePeriod(def.replace(/\s+/g, " ").trim());
        fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
      }
    }
    gariAfter = 0;
    ellipAfter = 0;
    remainEllip.length = 0;
    remainGari.length = 0;
    for (const f of lexFiles) {
      const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
      const def = d.defKo || "";
      const g = countGari(def);
      const e = countLeadEllipCites(def);
      gariAfter += g;
      ellipAfter += e;
      if (e && remainEllip.length < 25) {
        const cite = [...def.matchAll(/「([^」]*)」/g)].find((m) => /^…/.test(m[1]));
        remainEllip.push({ strong: d.strong, cite: cite?.[1]?.slice(0, 80) });
      }
    }
  }

  const fullDefs = {};
  for (const s of ["G3956", "G1011", "G2790"]) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, `${s}.json`), "utf8"));
    fullDefs[s] = { defKo: d.defKo, krvKo: d.krvKo, krvForms: d.krvForms || [] };
  }

  const report = {
    section1: {
      gariBefore,
      gariAfter,
      filesTouched: gariFixedFiles,
      remainSamples: remainGari,
      note: "가리켜요 → 말해요 (X를/을 가리켜요 틀 포함 전수)",
    },
    section2: {
      ellipBefore,
      ellipAfter,
      filesTouched: ellipFixedFiles,
      remainSamples: remainEllip,
      note: "「…」 선행 잘린 인용 → 완결 구절(짧은 절은 절 전문)",
    },
    samples,
    fullDefs,
  };

  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(REPORT_DATA, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}

main();
