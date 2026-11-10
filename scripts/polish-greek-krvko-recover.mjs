#!/usr/bin/env node
/**
 * krvKo 복구·기본형 정리·뜻 대응·절 중복
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
const REPORT = path.join(OUT, "_greek-krvko-recover-report.json");
const DELETED_LIST = path.join(OUT, "_greek-krvko-deleted-112.json");
const DELETED_LIST_DATA = path.join(DATA, "_greek-krvko-deleted-112.json");

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

const FUNCTION_POS = /관사|전치사|접속사|대명사|부정어|불변화사/;
const APP_FN = FUNCTION_POS;
const NOISE_KEEP_OK = new Set(["모든", "같은", "다시", "이제", "아무", "다"]); // 뜻이 온전 — 복구 대상 가능
const TRUE_FUNCTION_NOISE = new Set(["아니", "없는", "있는", "하는", "되는"]); // 단독 무의미/기능

const PARTICLES = [
  "으로서", "으로부터", "에게로", "으로", "로서", "로써",
  "에서", "에게", "께서", "부터", "까지", "처럼", "같이", "대로",
  "을", "를", "이", "가", "은", "는", "의", "에", "로", "과", "와", "도", "만", "요", "여", "라", "며", "고", "면",
];

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
function majority(map) {
  if (!map?.size) return "";
  return [...map.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
function isFnParse(parseKo) {
  return APP_FN.test(((parseKo || "").split(/[,，·]/)[0] || "").trim());
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

/** 활용형 → 기본형 추정 */
function toBaseForm(form) {
  let f = String(form || "").trim();
  if (!f) return f;
  // spaced keep
  const spaced = f;
  f = f.replace(/\s+/g, "");

  // known fixes
  const KNOWN = {
    헤아리지: "헤아리다",
    맛보지: "맛보다",
    멀게: "눈을 멀게 하다",
    시집보내: "시집보내다",
    깨어있: "깨어 있다",
    원수갚: "원수를 갚다",
    찍어내: "찍어내다",
    자세히묻: "자세히 묻다",
    복음전함: "복음을 전하다",
    참된말: "참된 말",
    쌓아두: "쌓아두다",
    간구하: "간구하다",
    결박하: "결박하다",
    핍박하: "핍박하다",
    거문: "거문고",
  };
  if (KNOWN[f] || KNOWN[spaced]) return KNOWN[f] || KNOWN[spaced];

  // strip noun particles
  const stripped = stripParticles(f);
  if (stripped !== f && stripped.length >= 2) f = stripped;

  // verb endings → 다
  const conj = [
    [/지$/, "다"],
    [/며$/, "다"],
    [/고$/, "다"],
    [/니$/, "다"],
    [/면$/, "다"],
    [/라$/, "다"],
    [/리라$/, "다"],
    [/리로다$/, "다"],
    [/느니라$/, "다"],
    [/노라$/, "다"],
    [/도다$/, "다"],
    [/구나$/, "다"],
    [/소서$/, "다"],
    [/시니$/, "다"],
    [/셔서$/, "다"],
    [/하시고$/, "하다"],
    [/하게$/, "하다"],
    [/하$/, "하다"],
    [/되$/, "되다"],
    [/케$/, "케하다"],
  ];
  // only if looks incomplete (not already ending 다/요 and short stub)
  if (!/[다요음임함]$/.test(f)) {
    for (const [re, rep] of conj) {
      if (re.test(f) && f.length >= 2) {
        const base = f.replace(re, rep);
        if (base.length >= 2) return base.includes(" ") ? base : base;
      }
    }
  }
  // 있 → 있다
  if (f.endsWith("있") && f.length >= 2) return `${f}다`.replace(/있다/, "있다");
  if (/보내$/.test(f)) return `${f}다`;
  if (/갚$/.test(f)) return f.includes("원수") ? "원수를 갚다" : `${f}다`;

  return spaced.includes(" ") ? spaced : f;
}

function isConjugationForm(form) {
  const f = String(form || "").replace(/\s+/g, "");
  if (!f) return false;
  // noun+particle
  if (stripParticles(f) !== f && stripParticles(f).length >= 2) return true;
  // verb conjugation endings (not dictionary 다)
  if (/지$|며$|고$|니$|면$|라$|리라$|도다$|느니라$/.test(f) && !/다$/.test(f)) return true;
  if (/하$|되$|케$|있$/.test(f) && f.length <= 6) return true;
  return false;
}

function buildCorpus() {
  const verses = [];
  const stemCount = new Map();
  const stemToVerses = new Map();
  const normHas = new Set(); // all norms joined for quick includes? too big - per form search via stems

  for (const book of NT) {
    const bd = JSON.parse(fs.readFileSync(path.join(BD, `${book}.json`), "utf8"));
    for (let ci = 0; ci < (bd.chapters || []).length; ci++) {
      for (const v of bd.chapters[ci].verses?.krv || []) {
        const t = String(v.t || "").replace(/\s+/g, " ").trim();
        const tokens = t.split(/\s+/).filter(Boolean);
        const stems = tokens.map(stripParticles).filter((x) => x.length >= 1);
        const row = { book, ch: ci + 1, n: v.n, t, stems, norm: t.replace(/\s+/g, "") };
        verses.push(row);
        for (const stem of stems) {
          stemCount.set(stem, (stemCount.get(stem) || 0) + 1);
          if (!stemToVerses.has(stem)) stemToVerses.set(stem, []);
          if (stemToVerses.get(stem).length < 8) {
            stemToVerses.get(stem).push(row);
          }
        }
      }
    }
  }
  return { verses, stemCount, stemToVerses };
}

function formInKrv(form, stemCount, verses) {
  const f = String(form || "").replace(/\s+/g, "");
  if (!f) return false;
  if (stemCount.has(f)) return true;
  const st = stripParticles(f);
  if (st !== f && stemCount.has(st)) return true;
  // phrase
  if (form.includes(" ") || f.length >= 4) {
    return verses.some((v) => v.norm.includes(f));
  }
  return false;
}

function freqInKrv(form, verses) {
  const f = String(form || "").replace(/\s+/g, "");
  let n = 0;
  for (const v of verses) if (v.norm.includes(f)) n += 1;
  return n;
}

function main() {
  console.error("corpus…");
  const { verses, stemCount, stemToVerses } = buildCorpus();

  const glossMaj = new Map();
  for (const book of NT) {
    for (const f of fs.readdirSync(path.join(OUT, book)).filter((x) => x.endsWith(".json"))) {
      const ch = JSON.parse(fs.readFileSync(path.join(OUT, book, f), "utf8"));
      for (const v of ch.verses || []) {
        for (const w of v.words || []) {
          if (!w.strong || !w.glossKo) continue;
          if (!glossMaj.has(w.strong)) glossMaj.set(w.strong, new Map());
          const m = glossMaj.get(w.strong);
          m.set(w.glossKo, (m.get(w.glossKo) || 0) + 1);
        }
      }
    }
  }

  const lexFiles = fs.readdirSync(LEX).filter((x) => x.endsWith(".json"));

  // ——— 1) deleted list vs HEAD (batch extract) ———
  console.error("diff HEAD…");
  const headLex = path.join(root, ".tmp-head-greek-lex");
  fs.rmSync(headLex, { recursive: true, force: true });
  fs.mkdirSync(headLex, { recursive: true });
  execSync(`git archive HEAD public/word-study/lexicon/greek | tar -x -C "${headLex}"`, {
    cwd: root,
    stdio: "pipe",
  });
  const headDir = path.join(headLex, "public", "word-study", "lexicon", "greek");

  const deleted = [];
  for (const f of lexFiles) {
    const cur = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    const hp = path.join(headDir, f);
    if (!fs.existsSync(hp)) continue;
    const head = JSON.parse(fs.readFileSync(hp, "utf8"));
    const headK = head.krvKo || [];
    const curK = cur.krvKo || [];
    if (headK.length && curK.length === 0) {
      deleted.push({
        strong: cur.strong,
        lemma: cur.lemma,
        posKo: cur.posKo,
        lost: headK,
        glossKo: majority(glossMaj.get(cur.strong)) || "",
      });
    }
  }
  // also include emptied during session beyond HEAD empty (G3956 etc may be empty in both?)
  // User 1553→1441: use current empty that appear in audit drop samples + HEAD-empty from our noise drops
  // Add strongs that HEAD had values we dropped partially? Focus on fully emptied.

  // Also catch G3956 if HEAD had values
  console.error("deleted strongs", deleted.length);
  fs.writeFileSync(DELETED_LIST, JSON.stringify({ count: deleted.length, items: deleted }, null, 2) + "\n");
  fs.writeFileSync(DELETED_LIST_DATA, JSON.stringify({ count: deleted.length, items: deleted }, null, 2) + "\n");

  let restoreIntact = 0;
  let restoreBase = 0;
  let keepDeleted = 0;
  const restoreSamples = { intact: [], base: [], deleted: [] };

  // Manual recover map
  const MANUAL_BASE = {
    G1061: ["시집보내다"],
    G1127: ["깨어 있다"],
    G1556: ["원수를 갚다"],
    G1581: ["찍어내다"],
    G198: ["자세히 묻다"],
    G2097: ["복음을 전하다"],
    G226: ["참된 말"],
    G2343: ["쌓아두다"],
  };

  for (const row of deleted) {
    const fp = path.join(LEX, `${row.strong}.json`);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    const isFunction = FUNCTION_POS.test((d.posKo || "").split(",")[0] || "") ||
      /부정어|불변화사|접속사|관사|전치사|대명사/.test(d.posKo || "");

    // function word → keep deleted
    if (isFunction || row.lost.every((v) => TRUE_FUNCTION_NOISE.has(v) || v === "아니")) {
      // exception: 모든/같은 are content adjectives even if short
      const onlyOkNoise = row.lost.length && row.lost.every((v) => NOISE_KEEP_OK.has(v));
      if (!onlyOkNoise) {
        keepDeleted += 1;
        if (restoreSamples.deleted.length < 15) {
          restoreSamples.deleted.push({ strong: row.strong, lost: row.lost, reason: "function/noise" });
        }
        continue;
      }
    }

    if (MANUAL_BASE[row.strong]) {
      d.krvKo = MANUAL_BASE[row.strong];
      // put conjugated originals in krvForms if in text
      const forms = [];
      for (const v of row.lost) {
        const b = toBaseForm(v);
        if (b !== v && formInKrv(v, stemCount, verses)) forms.push(v);
      }
      if (forms.length) d.krvForms = [...new Set(forms)];
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
      restoreBase += 1;
      if (restoreSamples.base.length < 15) {
        restoreSamples.base.push({ strong: row.strong, from: row.lost, to: d.krvKo });
      }
      continue;
    }

    // intact restore: each lost value is complete in KRV as-is (or NOISE_KEEP_OK)
    const intact = [];
    const basified = [];
    for (const v of row.lost) {
      if (TRUE_FUNCTION_NOISE.has(v) && !NOISE_KEEP_OK.has(v)) continue;
      if (NOISE_KEEP_OK.has(v) || formInKrv(v, stemCount, verses)) {
        intact.push(v);
      } else {
        const b = toBaseForm(v);
        if (b && (formInKrv(b, stemCount, verses) || b.includes(" "))) {
          // spaced base forms always accept if intentional
          if (formInKrv(b, stemCount, verses) || /다$|있다$|하다$/.test(b)) {
            basified.push({ from: v, to: b });
          }
        }
      }
    }

    if (intact.length && !basified.length) {
      d.krvKo = [...new Set(intact)];
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
      restoreIntact += 1;
      if (restoreSamples.intact.length < 15) {
        restoreSamples.intact.push({ strong: row.strong, restored: d.krvKo });
      }
      continue;
    }

    if (basified.length || intact.length) {
      const krv = [...new Set([...intact.map((x) => toBaseForm(x) === x ? x : null).filter(Boolean), ...basified.map((x) => x.to)])];
      const forms = basified.filter((x) => x.from !== x.to && formInKrv(x.from, stemCount, verses)).map((x) => x.from);
      d.krvKo = krv.length ? krv : basified.map((x) => x.to);
      if (forms.length) d.krvForms = [...new Set(forms)];
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
      restoreBase += 1;
      if (restoreSamples.base.length < 15) {
        restoreSamples.base.push({ strong: row.strong, from: row.lost, to: d.krvKo });
      }
      continue;
    }

    keepDeleted += 1;
    if (restoreSamples.deleted.length < 15) {
      restoreSamples.deleted.push({ strong: row.strong, lost: row.lost, reason: "unrecoverable" });
    }
  }

  // Force restore G3956/G3664 etc.
  const FORCE_INTACT = {
    G3956: ["모든"],
    G3664: ["같은"],
    G3825: ["다시"],
    G3570: ["이제"],
  };
  for (const [s, vals] of Object.entries(FORCE_INTACT)) {
    const fp = path.join(LEX, `${s}.json`);
    if (!fs.existsSync(fp)) continue;
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    if (!(d.krvKo || []).length) {
      d.krvKo = vals;
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
      // count if not already
    }
  }

  // ——— 2) base form pass for ALL krvKo ———
  console.error("base forms…");
  let conjBefore = 0;
  let conjAfter = 0;
  let baseFixed = 0;
  const baseSamples = [];

  const FORCE_BASE = {
    G1011: { krv: ["헤아리다"], forms: ["헤아리지"] },
    G1089: { krv: ["맛보다"], forms: ["맛보지"] },
    G5186: { krv: ["눈을 멀게 하다"], forms: ["멀게"] },
  };

  for (const f of lexFiles) {
    const fp = path.join(LEX, f);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    let krv = [...(d.krvKo || [])];
    let forms = [...(d.krvForms || [])];
    let changed = false;

    if (FORCE_BASE[d.strong]) {
      const prev = krv.slice();
      krv = FORCE_BASE[d.strong].krv;
      forms = [...new Set([...(FORCE_BASE[d.strong].forms || []), ...forms.filter((x) => x !== krv[0])])];
      if (JSON.stringify(prev) !== JSON.stringify(krv)) {
        baseFixed += 1;
        if (baseSamples.length < 12) baseSamples.push({ strong: d.strong, from: prev, to: krv, forms });
      }
      changed = true;
    } else {
      const nextK = [];
      const nextF = [...forms];
      for (const v of krv) {
        if (isConjugationForm(v)) {
          conjBefore += 1;
          const b = toBaseForm(v);
          if (b && b !== v) {
            nextK.push(b);
            if (formInKrv(v, stemCount, verses) || stemCount.has(stripParticles(v))) nextF.push(v);
            baseFixed += 1;
            if (baseSamples.length < 12) baseSamples.push({ strong: d.strong, from: v, to: b });
            changed = true;
          } else {
            // particle-only strip
            const st = stripParticles(v);
            if (st !== v && st.length >= 2) {
              nextK.push(st);
              nextF.push(v);
              baseFixed += 1;
              changed = true;
            } else nextK.push(v);
          }
        } else {
          // still strip particles from nouns
          const st = stripParticles(v.replace(/\s+/g, ""));
          if (st !== v.replace(/\s+/g, "") && st.length >= 2 && !v.includes(" ")) {
            nextK.push(st);
            nextF.push(v);
            conjBefore += 1;
            baseFixed += 1;
            changed = true;
          } else nextK.push(v);
        }
      }
      krv = [...new Set(nextK)];
      forms = [...new Set(nextF.filter((x) => !krv.includes(x)))];
    }

    // recount conj in result
    for (const v of krv) if (isConjugationForm(v)) conjAfter += 1;

    if (changed) {
      d.krvKo = krv;
      if (forms.length) d.krvForms = forms;
      else delete d.krvForms;
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
    }
  }

  // second pass conjAfter accurate
  conjAfter = 0;
  for (const f of lexFiles) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    for (const v of d.krvKo || []) if (isConjugationForm(v)) conjAfter += 1;
  }

  // ——— 3) meaning role mixups ———
  console.error("role mixups…");
  // G2790 κιθαρῳδός = harper; G2788 κιθάρα = harp
  {
    const g2790 = JSON.parse(fs.readFileSync(path.join(LEX, "G2790.json"), "utf8"));
    g2790.krvKo = ["거문고 타는 자"];
    g2790.krvForms = ["거문고 타는 자들", "거문고 타는"];
    g2790.defKo =
      "거문고 타는 자를 말해요. 개역한글에서는 「거문고 타는 자」로 옮겨져요(계 14:2). 「…거문고 타는 자들의 그 거문고 타는 것 같더라」(계 14:2).";
    fs.writeFileSync(path.join(LEX, "G2790.json"), JSON.stringify(g2790, null, 2) + "\n");

    const g2788 = JSON.parse(fs.readFileSync(path.join(LEX, "G2788.json"), "utf8"));
    g2788.krvKo = ["거문고"];
    delete g2788.krvForms;
    if (!/거문고/.test(g2788.defKo || "")) {
      g2788.defKo = ensurePeriod(
        `거문고를 말해요. 개역한글에서는 「거문고」로 옮겨져요(계 5:8). 「…각각 거문고와 향이 가득한 금대접을 가졌으니」(계 5:8)`,
      );
    } else {
      // fix 거문 → 거문고 in def
      g2788.defKo = (g2788.defKo || "").replace(/「거문」/g, "「거문고」");
    }
    fs.writeFileSync(path.join(LEX, "G2788.json"), JSON.stringify(g2788, null, 2) + "\n");
  }

  // G2405 ἱερατεία = priesthood → 제사장 직분 (Heb 7:5)
  {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, "G2405.json"), "utf8"));
    const heb = verses.find((v) => v.book === "hebrews" && v.ch === 7 && v.n === 5);
    const cite = heb
      ? (heb.t.includes("제사장의 직분")
        ? `「…${heb.t.match(/.{0,8}제사장의 직분.{0,20}/)?.[0] || "제사장의 직분"}…」`
        : `「…제사장의 직분을 받은 족속은…」`)
      : "「…제사장의 직분…」";
    d.krvKo = ["제사장 직분"];
    d.krvForms = ["제사장의 직분", "제사장의"];
    d.defKo = `제사장 직분을 말해요. 개역한글에서는 「제사장 직분」으로 옮겨져요(히 7:5). ${cite.replace(/\.\.\./g, "…")}(히 7:5).`
      .replace(/」\(히/, "」(히")
      .replace(/\s+/g, " ");
    // clean double refs later
    d.defKo = "제사장 직분을 말해요. 개역한글에서는 「제사장 직분」으로 옮겨져요. 「레위의 아들들 중에서 제사장의 직분을 받는 자들이 율법을 좇아 아브라함의 허리에서 난 자라도 자기 형제들에게서 십일조를 취하라는 명령을 가졌으나」(히 7:5).";
    fs.writeFileSync(path.join(LEX, "G2405.json"), JSON.stringify(d, null, 2) + "\n");
  }

  // G1188 δεξιός — 우편, 오른손, 오른편 by frequency max 3
  {
    const cands = ["우편", "오른손", "오른편", "오른"];
    const scored = cands
      .map((c) => ({ c, n: freqInKrv(c, verses) }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 3);
    const d = JSON.parse(fs.readFileSync(path.join(LEX, "G1188.json"), "utf8"));
    d.krvKo = scored.map((x) => x.c);
    // ensure 우편 included
    if (!d.krvKo.includes("우편") && freqInKrv("우편", verses) > 0) {
      d.krvKo = ["우편", ...d.krvKo.filter((x) => x !== "우편")].slice(0, 3);
    }
    const primary = d.krvKo[0];
    d.defKo = ensurePeriod(
      `오른쪽을 말해요. 개역한글에서는 「${d.krvKo.join("」, 「")}」${euro(d.krvKo[d.krvKo.length - 1])} 옮겨져요. 「예수는 하나님 우편에 앉아 계시니라」(막 16:19)`,
    );
    fs.writeFileSync(path.join(LEX, "G1188.json"), JSON.stringify(d, null, 2) + "\n");
  }

  // Scan tool↔player / office↔person mixups via lemma pairs heuristics
  const ROLE_PAIRS = [
    // [toolStrong, personStrong, toolGlossHint, personGlossHint]
    ["G2788", "G2790", "거문고", "거문고 타는"],
  ];
  // Also heuristic: gloss ends with 타는자/하는자/꾼 while krvKo is bare tool noun
  let roleMix = 0;
  const roleSamples = [];
  for (const f of lexFiles) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    const gloss = majority(glossMaj.get(d.strong)) || "";
    const krv = d.krvKo || [];
    if (!krv.length) continue;
    const personGloss = /(타는자|하는자|하는 자|꾼|직분|직$)/.test(gloss) || /직분|직$/.test(gloss);
    const toolKrv = krv.some((k) => /거문고$|나팔$|북$|검$|활$/.test(k) && !/타는|부는|잡는|직분/.test(k));
    const officeGloss = /직분|직$|제사직/.test(gloss);
    const personKrv = krv.some((k) => /제사장$|사도$|장로$|감독$/.test(k) && !/직분|전례/.test(k));
    if ((personGloss && toolKrv) || (officeGloss && personKrv)) {
      roleMix += 1;
      if (roleSamples.length < 20) roleSamples.push({ strong: d.strong, gloss, krv });
    }
  }
  // G2790/G2405 already fixed — recount after
  roleMix = 0;
  roleSamples.length = 0;
  for (const f of lexFiles) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    const gloss = majority(glossMaj.get(d.strong)) || "";
    const krv = d.krvKo || [];
    if (!krv.length) continue;
    const personGloss = /(타는\s*자|하는\s*자|꾼)$/.test(gloss.replace(/\s/g, "")) || /타는자|하는자/.test(gloss);
    const toolKrv = krv.some((k) => /^(거문고|나팔|북|검|활)$/.test(k));
    const officeGloss = /직분|제사직/.test(gloss) || d.strong === "G2405";
    const personKrv = krv.some((k) => /^(제사장|사도|장로|감독)$/.test(k));
    if ((personGloss && toolKrv) || (officeGloss && personKrv && d.strong !== "G2405")) {
      roleMix += 1;
      roleSamples.push({ strong: d.strong, gloss, krv });
    }
  }
  // After G2790 fix, personGloss+toolKrv should be 0 for G2790
  // Count fixed explicitly
  const roleFixed = [
    { strong: "G2790", note: "거문고→거문고 타는 자; 거문고는 G2788" },
    { strong: "G2405", note: "제사장의→제사장 직분(히 7:5)" },
  ];

  // ——— 4) duplicate verse refs ———
  console.error("dup refs…");
  let dupBefore = 0;
  let dupAfter = 0;
  for (const f of lexFiles) {
    const fp = path.join(LEX, f);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    let def = d.defKo || "";
    // pattern: 옮겨져요(REF). …」(REF) or 옮겨져요(REF). 「…」(REF)
    const re = /옮겨져요\(([가-힣]+\s*\d+:\d+[^\)]*)\)(\s*「[^」]+」)\(\1\)/g;
    const matches = [...def.matchAll(/옮겨져요\(([가-힣]+\s*\d+:\d+[^\)]*)\)/g)];
    for (const m of matches) {
      const ref = m[1];
      // if same ref appears again after as cite ref
      const afterIdx = m.index + m[0].length;
      const rest = def.slice(afterIdx);
      if (new RegExp(`」\\(${ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`).test(rest)) {
        dupBefore += 1;
      }
    }
    const next = def.replace(
      /옮겨져요\(([가-힣]+\s*\d+:\d+[^\)]*)\)(\s*「[^」]+」)\(\1\)/g,
      "옮겨져요$2($1)",
    );
    // also 옮겨져요(REF). 「」(REF) with period between
    const next2 = next.replace(
      /옮겨져요\(([가-힣]+\s*\d+:\d+[^\)]*)\)\.\s*(「[^」]+」)\(\1\)/g,
      "옮겨져요. $2($1)",
    );
    if (next2 !== def) {
      d.defKo = ensurePeriod(next2.replace(/\s+/g, " ").trim());
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
    }
  }
  // recount after
  for (const f of lexFiles) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    const def = d.defKo || "";
    for (const m of def.matchAll(/옮겨져요\(([가-힣]+\s*\d+:\d+[^\)]*)\)/g)) {
      const ref = m[1];
      const rest = def.slice(m.index + m[0].length);
      if (new RegExp(`」\\(${ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`).test(rest)) dupAfter += 1;
    }
  }

  // Force key defs again after dup cleanup
  {
    const g1011 = JSON.parse(fs.readFileSync(path.join(LEX, "G1011.json"), "utf8"));
    g1011.krvKo = ["헤아리다"];
    g1011.krvForms = ["헤아리지"];
    g1011.defKo = "주로 의논하는 것을 말하고, 「헤아리다」로도 옮겨져요. 「…헤아리지 아니하겠느냐」(눅 14:31).";
    fs.writeFileSync(path.join(LEX, "G1011.json"), JSON.stringify(g1011, null, 2) + "\n");

    const g1089 = JSON.parse(fs.readFileSync(path.join(LEX, "G1089.json"), "utf8"));
    g1089.krvKo = ["맛보다"];
    g1089.krvForms = ["맛보지"];
    if (!/맛보/.test(g1089.defKo || "")) {
      g1089.defKo = "맛보는 것을 말해요. 개역한글에서는 「맛보다」로 옮겨져요. 「죽은 자 가운데서 살아난 자로 어떤 이들은 심한 고문을 받되 구차히 놓이기를 원치 아니하였으니 이는 더 좋은 다시 사는 것을 얻고자 함이라」(히 11:35).".replace("히 11:35", "히 6:4");
    }
    // find a verse with 맛보
    const vTaste = stemToVerses.get("맛보지")?.[0] || verses.find((v) => v.norm.includes("맛보"));
    if (vTaste) {
      g1089.defKo = `맛보는 것을 말해요. 개역한글에서는 「맛보다」로 옮겨져요. 「${vTaste.t.slice(0, 70)}${vTaste.t.length > 70 ? "…" : ""}」(${refOf(vTaste)}).`;
    }
    fs.writeFileSync(path.join(LEX, "G1089.json"), JSON.stringify(g1089, null, 2) + "\n");

    const g3956 = JSON.parse(fs.readFileSync(path.join(LEX, "G3956.json"), "utf8"));
    g3956.krvKo = ["모든"];
    if (!/모든/.test(g3956.defKo || "")) {
      g3956.defKo = ensurePeriod((g3956.defKo || "모든 것을 말해요.") + "");
    }
    fs.writeFileSync(path.join(LEX, "G3956.json"), JSON.stringify(g3956, null, 2) + "\n");
  }

  // ——— 5) remaining not-in-text ———
  let notInText = [];
  for (const f of lexFiles) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    for (const k of d.krvKo || []) {
      if (!formInKrv(k, stemCount, verses)) {
        notInText.push({ strong: d.strong, value: k, reason: "stem/phrase 인덱스에 없음(이형·띄어쓰기·사전형)" });
      }
    }
  }

  // ——— 6) ratios ———
  const hasKrv = new Set();
  let strongWith = 0;
  for (const f of lexFiles) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    if ((d.krvKo || []).length) {
      strongWith += 1;
      hasKrv.add(d.strong);
    }
  }
  let content = 0;
  let contentWith = 0;
  for (const book of NT) {
    for (const f of fs.readdirSync(path.join(OUT, book)).filter((x) => x.endsWith(".json"))) {
      const ch = JSON.parse(fs.readFileSync(path.join(OUT, book, f), "utf8"));
      for (const v of ch.verses || []) {
        for (const w of v.words || []) {
          if (!w.glossKo) continue;
          if (isFnParse(w.parseKo)) continue;
          content += 1;
          if (hasKrv.has(w.strong)) contentWith += 1;
        }
      }
    }
  }

  const full = {};
  for (const s of ["G3956", "G1011", "G2790", "G2405", "G1188", "G1089"]) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, `${s}.json`), "utf8"));
    full[s] = { defKo: d.defKo, krvKo: d.krvKo, krvForms: d.krvForms || [] };
  }

  const report = {
    section1: {
      deletedFile: "public/word-study/_greek-krvko-deleted-112.json",
      deletedCount: deleted.length,
      restoreIntact,
      restoreBase,
      keepDeleted,
      samples: restoreSamples,
    },
    section2: {
      conjBefore,
      conjAfter,
      baseFixed,
      baseSamples,
    },
    section3: {
      roleFixed,
      roleMixRemaining: roleMix,
      roleSamples,
      g1188: JSON.parse(fs.readFileSync(path.join(LEX, "G1188.json"), "utf8")).krvKo,
    },
    section4: {
      dupBefore,
      dupAfter,
      whyAgain: "reviewed 보강 문장「옮겨져요(절)」뒤에 같은 절 인용「」(절)을 붙이면서 중복이 다시 생김.",
    },
    section5: { notInText },
    section6: {
      prevContentPct: 68.75,
      lastContentPct: 64.7,
      strongWithKrv: strongWith,
      strongBase: 1553,
      strongPct: +((100 * strongWith) / 1553).toFixed(2),
      contentChips: content,
      contentWithKrv: contentWith,
      contentPct: +((100 * contentWith) / content).toFixed(2),
    },
    fullDefs: full,
  };

  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  fs.rmSync(headLex, { recursive: true, force: true });
  console.log(JSON.stringify(report, null, 2));
}

main();
