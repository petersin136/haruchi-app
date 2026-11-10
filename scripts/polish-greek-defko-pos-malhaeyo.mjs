#!/usr/bin/env node
/**
 * 「가리켜요→말해요」 207건: 품사별 분류 후 비명사 다시 쓰기
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const OUT = path.join(root, "public", "word-study");
const LEX = path.join(OUT, "lexicon", "greek");
const BD = path.join(root, "public", "bible-data");
const DATA = path.join(root, "data");
const REPORT = path.join(OUT, "_greek-defko-pos-malhaeyo-report.json");
const REPORT_DATA = path.join(DATA, "_greek-defko-pos-malhaeyo-report.json");

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
function hasBatchim(word) {
  const ch = String(word || "").replace(/\s+/g, "").replace(/[「」()]/g, "").slice(-1);
  const code = ch?.charCodeAt(0);
  if (!code || code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}
function eulReul(w) {
  return hasBatchim(w) ? "을" : "를";
}
function euro(w) {
  return hasBatchim(w) ? "으로" : "로";
}
function headPos(posKo) {
  const h = (posKo || "").split(/[,，·\/]/)[0].trim();
  if (/명사/.test(h)) return "명사";
  if (/동사/.test(h)) return "동사";
  if (/형용사/.test(h)) return "형용사";
  if (/부사/.test(h)) return "부사";
  if (/대명사/.test(h)) return "대명사";
  if (/전치사/.test(h)) return "전치사";
  if (/접속사/.test(h)) return "접속사";
  if (/관사/.test(h)) return "관사";
  if (/수사|숫자/.test(h)) return "수사";
  if (/소사/.test(h)) return "소사";
  if (/부정/.test(h)) return "부정어";
  if (/의문/.test(h)) return "의문사";
  if (/불변화/.test(h)) return "불변화사";
  return h || "기타";
}
function firstSentence(def) {
  return (String(def || "").split(/(?<=[.!?])\s+/)[0] || "").trim();
}
function restAfterFirst(def) {
  const parts = String(def || "").split(/(?<=[.!?])\s+/);
  return parts.slice(1).join(" ").trim();
}

function freqInKrv(form, verses) {
  const f = String(form || "").replace(/\s+/g, "");
  let n = 0;
  for (const v of verses) if (v.norm.includes(f)) n += 1;
  return n;
}

function buildVerses() {
  const verses = [];
  for (const book of NT) {
    const bd = JSON.parse(fs.readFileSync(path.join(BD, `${book}.json`), "utf8"));
    for (let ci = 0; ci < (bd.chapters || []).length; ci++) {
      for (const v of bd.chapters[ci].verses?.krv || []) {
        const t = String(v.t || "").replace(/\s+/g, " ").trim();
        verses.push({ book, ch: ci + 1, n: v.n, t, norm: t.replace(/\s+/g, "") });
      }
    }
  }
  return verses;
}

function quoteList(forms) {
  const uniq = [...new Set(forms.filter(Boolean))];
  if (!uniq.length) return "";
  if (uniq.length === 1) return `「${uniq[0]}」`;
  if (uniq.length === 2) return `「${uniq[0]}」, 「${uniq[1]}」`;
  return `「${uniq.slice(0, -1).join("」, 「")}」, 「${uniq[uniq.length - 1]}」`;
}

function formsForOpening(d, verses, extra = []) {
  const cands = [...(d.krvKo || []), ...(d.krvForms || []), ...extra].filter(Boolean);
  const scored = [...new Set(cands)]
    .map((c) => ({ c, n: freqInKrv(c, verses) }))
    .filter((x) => x.n > 0 || (d.krvKo || []).includes(x.c))
    .sort((a, b) => b.n - a.n || a.c.length - b.c.length);
  const top = scored.slice(0, 3).map((x) => x.c);
  if (top.length) return top;
  if ((d.krvKo || []).length) return d.krvKo.slice(0, 3);
  return [];
}

/** 형용사·꾸밈말 */
function rewriteAdjective(d, verses, beforeDef) {
  // G3956 special
  if (d.strong === "G3956") {
    const forms = ["모든", "온", "각각"];
    // keep krvKo top by freq among these + existing
    const scored = forms.map((c) => ({ c, n: freqInKrv(c, verses) })).sort((a, b) => b.n - a.n);
    d.krvKo = scored.slice(0, 3).map((x) => x.c);
    const q = quoteList(forms);
    const last = forms[forms.length - 1];
    const rest = restAfterFirst(d.defKo || "");
    // rebuild KRV line if needed
    let tail = rest;
    if (!/개역한글에서는/.test(tail)) {
      tail = `개역한글에서는 ${quoteList(d.krvKo)}${euro(d.krvKo[d.krvKo.length - 1])} 옮겨져요. ${tail}`.trim();
    }
    return ensurePeriod(`${q}${eulReul(last)} 뜻하는 꾸밈말이에요. ${tail}`.replace(/\s+/g, " ").trim());
  }

  const forms = formsForOpening(d, verses);
  const rest = restAfterFirst(d.defKo || beforeDef);
  if (forms.length) {
    const last = forms[forms.length - 1];
    return ensurePeriod(`${quoteList(forms)}${eulReul(last)} 뜻하는 꾸밈말이에요. ${rest}`.replace(/\s+/g, " ").trim());
  }

  // fall back: take meaning chunk from before first 가리켜요/말해요
  const src = beforeDef || d.defKo || "";
  let meaning = firstSentence(src)
    .replace(/\(개역한글:[^)]+\)/g, "")
    .replace(/(을|를) (가리켜요|말해요).*$/, "")
    .replace(/이라는 뜻의 형용사예요\.?$/, "")
    .replace(/이라는 뜻의 형용사로.*$/, "")
    .replace(/을 말하는 형용사예요\.?$/, "")
    .replace(/를 말하는 형용사예요\.?$/, "")
    .replace(/형용사예요\.?$/, "")
    .replace(/명사·형용사예요\.?$/, "")
    .trim();
  meaning = meaning.replace(/^['']|['']$/g, "").trim();
  if (meaning.length >= 2 && meaning.length <= 60) {
    return ensurePeriod(`${meaning}${eulReul(meaning)} 뜻하는 꾸밈말이에요. ${rest}`.replace(/\s+/g, " ").trim());
  }
  return ensurePeriod(`성질이나 상태를 나타내는 꾸밈말이에요. ${rest}`.replace(/\s+/g, " ").trim());
}

function rewriteAdverb(d, verses, beforeDef) {
  const forms = formsForOpening(d, verses);
  const rest = restAfterFirst(d.defKo || beforeDef);
  if (forms.length) {
    const last = forms[forms.length - 1];
    return ensurePeriod(`${quoteList(forms)}${eulReul(last)} 뜻하는 부사예요. ${rest}`.replace(/\s+/g, " ").trim());
  }
  const src = firstSentence(beforeDef || d.defKo || "")
    .replace(/(을|를) (가리켜요|말해요).*$/, "")
    .replace(/이라는 뜻의 부사예요\.?$/, "")
    .replace(/부사예요\.?$/, "")
    .trim();
  if (src.length >= 2 && src.length <= 50) {
    return ensurePeriod(`${src}${eulReul(src)} 뜻하는 부사예요. ${rest}`.replace(/\s+/g, " ").trim());
  }
  return ensurePeriod(`정도나 방식을 나타내는 부사예요. ${rest}`.replace(/\s+/g, " ").trim());
}

function rewriteVerb(d, verses, beforeDef) {
  const forms = formsForOpening(d, verses);
  const rest = restAfterFirst(d.defKo || beforeDef);
  const first = firstSentence(d.defKo || "");

  // mid-sentence only: 폭넓게 말해요 ← 가리켜요
  if (!/(을|를) 말해요/.test(first) && /말해요/.test(d.defKo || "")) {
    return ensurePeriod(
      String(d.defKo || "")
        .replace(/폭넓게 말해요/g, "폭넓게 나타내요")
        .replace(/동작을 말해요/g, "동작을 나타내요")
        .replace(/의식을 말해요/g, "의식을 뜻해요")
        .replace(/(을|를) 말해요/g, (_, p) => `${p} 뜻해요`),
    );
  }

  if (forms.length) {
    const last = forms[forms.length - 1];
    // verb lemma form often ends 다
    return ensurePeriod(`${quoteList(forms)}${eulReul(last)} 뜻하는 동사예요. ${rest}`.replace(/\s+/g, " ").trim());
  }

  // keep existing good "뜻이에요/동사예요" openings; only fix trailing 말해요 from 가리켜요
  let def = String(d.defKo || beforeDef);
  if (/(을|를) 말해요/.test(first) && !/동사예요|뜻이에요|동작이에요|것이에요/.test(first)) {
    const meaning = first
      .replace(/(을|를) 말해요\.?$/, "")
      .replace(/하는 것$/, "하다")
      .trim();
    def = ensurePeriod(`${meaning}${eulReul(meaning)} 뜻하는 동사예요. ${rest}`.replace(/\s+/g, " ").trim());
    return def;
  }
  return ensurePeriod(
    def
      .replace(/폭넓게 말해요/g, "폭넓게 나타내요")
      .replace(/(을|를) 말해요/g, (_, p) => `${p} 뜻해요`),
  );
}

function rewritePreposition(d, verses, beforeDef) {
  const forms = formsForOpening(d, verses);
  const rest = restAfterFirst(d.defKo || beforeDef);
  if (forms.length) {
    const last = forms[forms.length - 1];
    return ensurePeriod(`${quoteList(forms)}${eulReul(last)} 뜻하는 전치사예요. ${rest}`.replace(/\s+/g, " ").trim());
  }
  const src = firstSentence(beforeDef || d.defKo || "")
    .replace(/['']/g, "")
    .replace(/(을|를) (가리켜요|말해요).*$/, "")
    .replace(/이라는 뜻의 전치사·접속사예요\.?$/, "")
    .replace(/을 나타내는 전치사예요\.?$/, "")
    .replace(/전치사예요\.?$/, "")
    .trim();
  if (src.length >= 1 && src.length <= 40) {
    return ensurePeriod(`${src}${eulReul(src)} 뜻하는 전치사예요. ${rest}`.replace(/\s+/g, " ").trim());
  }
  return ensurePeriod(`관계를 나타내는 전치사예요. ${rest}`.replace(/\s+/g, " ").trim());
}

function rewriteOther(d, verses, beforeDef) {
  const rest = restAfterFirst(d.defKo || beforeDef);
  // G920 etc: keep identity tone
  let first = firstSentence(beforeDef || d.defKo || "");
  first = first.replace(/가리켜요/g, "가리켜요").replace(/말해요(\(|\.|$)/g, "가리켜요$1");
  // prefer 가리켜요 restored for proper-name identity, or 뜻해요
  first = first.replace(/을 말해요/g, "을 가리켜요").replace(/를 말해요/g, "를 가리켜요");
  // if still awkward, use 뜻해요
  if (/베드로를 가리켜요/.test(first)) {
    return ensurePeriod(`${first} ${rest}`.replace(/\s+/g, " ").trim());
  }
  return ensurePeriod(
    String(d.defKo || "")
      .replace(/(을|를) 말해요/g, (_, p) => `${p} 뜻해요`)
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function needsRewrite(pos, beforeDef, afterDef) {
  if (pos === "명사") return false;
  const cur = afterDef || "";
  const prev = beforeDef || "";
  // had 가리켜요, or awkward 을/를 말해요 / mid 말해요 from sub
  if (/가리켜요/.test(prev)) return true;
  if (pos !== "명사" && /(을|를) 말해요/.test(firstSentence(cur))) return true;
  if (pos !== "명사" && /폭넓게 말해요/.test(cur)) return true;
  return false;
}

function main() {
  console.error("verses…");
  const verses = buildVerses();

  // Load pre-gari snapshot (commit that still had 가리켜요)
  const preDir = path.join(root, ".tmp-pre-gari-lex");
  fs.rmSync(preDir, { recursive: true, force: true });
  fs.mkdirSync(preDir, { recursive: true });
  // parent of the commit that zeroed 가리켜요
  let preRev = "bf415b6a5^";
  try {
    execSync(`git rev-parse ${preRev}`, { cwd: root, stdio: "pipe" });
  } catch {
    preRev = "HEAD^";
  }
  execSync(`git archive ${preRev} public/word-study/lexicon/greek | tar -x -C "${preDir}"`, {
    cwd: root,
    stdio: "pipe",
  });
  const preLex = path.join(preDir, "public", "word-study", "lexicon", "greek");

  const items = [];
  for (const f of fs.readdirSync(preLex).filter((x) => x.endsWith(".json"))) {
    const pre = JSON.parse(fs.readFileSync(path.join(preLex, f), "utf8"));
    const n = ((pre.defKo || "").match(/가리켜요/g) || []).length;
    if (!n) continue;
    const cur = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    items.push({
      strong: cur.strong,
      posKo: cur.posKo,
      pos: headPos(cur.posKo),
      occ: n,
      beforeDef: pre.defKo || "",
      file: f,
    });
  }

  // Add G3956 (awkward 말해요 frame, not in 가리켜요 set)
  if (!items.some((x) => x.strong === "G3956")) {
    const cur = JSON.parse(fs.readFileSync(path.join(LEX, "G3956.json"), "utf8"));
    const prePath = path.join(preLex, "G3956.json");
    const pre = fs.existsSync(prePath) ? JSON.parse(fs.readFileSync(prePath, "utf8")) : cur;
    items.push({
      strong: "G3956",
      posKo: cur.posKo,
      pos: headPos(cur.posKo),
      occ: 1,
      beforeDef: pre.defKo || cur.defKo,
      file: "G3956.json",
      extra: true,
    });
  }

  const byPos = {};
  let totalOcc = 0;
  for (const it of items) {
    byPos[it.pos] = (byPos[it.pos] || 0) + it.occ;
    totalOcc += it.occ;
  }

  const samples = [];
  let rewritten = 0;
  const rewrittenByPos = {};

  for (const it of items) {
    const fp = path.join(LEX, it.file);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    const before = d.defKo || "";
    if (!needsRewrite(it.pos, it.beforeDef, before) && it.strong !== "G3956") continue;

    let next = before;
    if (it.pos === "형용사") next = rewriteAdjective(d, verses, it.beforeDef);
    else if (it.pos === "부사") next = rewriteAdverb(d, verses, it.beforeDef);
    else if (it.pos === "동사") next = rewriteVerb(d, verses, it.beforeDef);
    else if (it.pos === "전치사") next = rewritePreposition(d, verses, it.beforeDef);
    else if (it.pos !== "명사") next = rewriteOther(d, verses, it.beforeDef);
    else continue;

    if (next && next !== before) {
      if (samples.length < 10) {
        samples.push({
          strong: d.strong,
          pos: it.pos,
          before: firstSentence(before),
          after: firstSentence(next),
        });
      }
      d.defKo = next;
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
      rewritten += 1;
      rewrittenByPos[it.pos] = (rewrittenByPos[it.pos] || 0) + 1;
    }
  }

  // Force G3956 sample quality
  {
    const fp = path.join(LEX, "G3956.json");
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    const before = firstSentence(d.defKo || "");
    d.krvKo = ["모든", "온", "각각"].sort(
      (a, b) => freqInKrv(b, verses) - freqInKrv(a, verses),
    );
    // user example order: 모든, 온, 각각
    d.krvKo = ["모든", "온", "각각"];
    const citeRow = verses.find((v) => v.book === "matthew" && v.ch === 1 && v.n === 17);
    const cite = citeRow ? citeRow.t : "그런즉 모든 대 수가 아브라함부터 다윗까지 열 네 대요 다윗 부터 바벨론으로 이거할 때까지 열 네 대요 바벨론으로 이거한 후 그리스도까지 열 네 대더라";
    d.defKo = `「모든」, 「온」, 「각각」을 뜻하는 꾸밈말이에요. 개역한글에서는 「모든」, 「온」, 「각각」으로 옮겨져요. 「${cite}」(마 1:17).`;
    fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
    // ensure in samples
    if (!samples.some((s) => s.strong === "G3956")) {
      samples.unshift({
        strong: "G3956",
        pos: "형용사",
        before: before || "모든 것을 말해요.",
        after: firstSentence(d.defKo),
      });
      if (samples.length > 10) samples.pop();
    } else {
      const s = samples.find((x) => x.strong === "G3956");
      s.after = firstSentence(d.defKo);
      s.before = before;
    }
  }

  // cite check 3
  function getKrv(book, ch, n) {
    return verses.find((v) => v.book === book && v.ch === ch && v.n === n)?.t || "";
  }
  const citeChecks = [];
  for (const [strong, book, ch, n] of [
    ["G1011", "luke", 14, 31],
    ["G2790", "revelation", 14, 2],
    ["G3956", "matthew", 1, 17],
  ]) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, `${strong}.json`), "utf8"));
    const m = [...(d.defKo || "").matchAll(/「([^」]+)」\(([가-힣]+\s*\d+:\d+)\)/g)].pop();
    const krv = getKrv(book, ch, n);
    const cite = m?.[1] || "";
    citeChecks.push({
      strong,
      ref: m?.[2],
      exact: cite === krv,
      citeLen: cite.length,
      krvLen: krv.length,
    });
  }

  const report = {
    section1: {
      totalOcc,
      totalFiles: items.length,
      byPos,
      note: "가리켜요→말해요 치환분(pre-commit) + G3956 어색 틀 = 207 전후",
    },
    section2: {
      rewritten,
      rewrittenByPos,
      nounKept: byPos["명사"] || 0,
      samples,
    },
    citeChecks,
    fullDefs: {
      G3956: JSON.parse(fs.readFileSync(path.join(LEX, "G3956.json"), "utf8")).defKo,
    },
  };

  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(REPORT_DATA, JSON.stringify(report, null, 2) + "\n");
  fs.rmSync(preDir, { recursive: true, force: true });
  console.log(JSON.stringify(report, null, 2));
}

main();
