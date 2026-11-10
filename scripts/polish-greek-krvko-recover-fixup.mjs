#!/usr/bin/env node
/**
 * krvKo 복구 후속: 입자/활용 과수정 복구 + 삭제목록 재구성 + 역할혼동 + 재측정
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
const NOISE_KEEP_OK = new Set(["모든", "같은", "다시", "이제", "아무", "다", "온"]);
const TRUE_FUNCTION_NOISE = new Set(["아니", "없는", "있는", "하는", "되는", "아니요", "아니냐", "아니뇨"]);

/** 명사 뒤 조사만 (활용 어미 고/라/며 제외) */
const NOUN_PARTICLES = [
  "으로서", "으로부터", "에게로", "으로", "로서", "로써",
  "에서", "에게", "께서", "부터", "까지", "처럼", "같이", "대로",
  "을", "를", "이", "가", "은", "는", "의", "에", "로", "과", "와", "도", "만",
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
function majority(map) {
  if (!map?.size) return "";
  return [...map.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
function isFnParse(parseKo) {
  return FUNCTION_POS.test(((parseKo || "").split(/[,，·]/)[0] || "").trim());
}
function refOf(h) { return `${BOOK_KO[h.book]} ${h.ch}:${h.n}`; }

function stripNounParticles(tok) {
  let t = String(tok || "").replace(/[.,;:!?‘’“”']/g, "");
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

function toBaseForm(form) {
  const spaced = String(form || "").trim();
  let f = spaced.replace(/\s+/g, "");
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
    건너가: "건너가다",
    족속이요: "족속",
    대주재여: "대주재",
    책망할것이없: "책망할 것이 없는",
  };
  if (KNOWN[f]) return KNOWN[f];
  if (KNOWN[spaced]) return KNOWN[spaced];

  // 호격 여/이요
  if (/여$/.test(f) && f.length >= 3) return f.slice(0, -1);
  if (/이요$/.test(f) && f.length >= 4) return f.slice(0, -2);

  const stripped = stripNounParticles(f);
  if (stripped !== f && stripped.length >= 2) {
    // 고유명사·완성명사: 조사만 제거
    if (!/(지|며|니|면|하|되|케|있)$/.test(stripped)) return stripped;
    f = stripped;
  }

  // 동사 활용 → 다 (어미만; 고모라·거문고 같은 명사 제외)
  if (/다$|요$|음$|임$|함$/.test(f)) return spaced.includes(" ") ? spaced : f;
  const VERB_END = [
    [/지$/, "다"],
    [/며$/, "다"],
    [/니$/, "다"],
    [/면$/, "다"],
    [/하$/, "하다"],
    [/되$/, "되다"],
    [/케$/, "케하다"],
    [/있$/, "있다"],
    [/보내$/, "보내다"],
    [/갚$/, "갚다"],
  ];
  for (const [re, rep] of VERB_END) {
    if (re.test(f) && f.length >= 2) {
      const base = f.replace(re, rep);
      if (base.length >= 2) return base;
    }
  }
  return spaced.includes(" ") ? spaced : f;
}

/** krvKo에 두면 안 되는 활용형 (명사 조사형·동사 활용) */
function isConjugationForm(form) {
  const f = String(form || "").trim().replace(/\s+/g, "");
  if (!f) return false;
  if (/다$|요$/.test(f)) return false; // 기본형·종결
  // 명사+조사
  const st = stripNounParticles(f);
  if (st !== f && st.length >= 2) return true;
  // 호격
  if (/여$|이요$/.test(f)) return true;
  // 동사 활용 (고/라는 명사 끝일 수 있어 제외 — 헤아리지·맛보지 등)
  if (/지$|며$|니$|면$/.test(f)) return true;
  if (/하$|되$|케$|있$|보내$|갚$/.test(f)) return true;
  if (f === "멀게") return true;
  return false;
}

function buildCorpus() {
  const verses = [];
  const stemCount = new Map();
  const stemToVerses = new Map();
  for (const book of NT) {
    const bd = JSON.parse(fs.readFileSync(path.join(BD, `${book}.json`), "utf8"));
    for (let ci = 0; ci < (bd.chapters || []).length; ci++) {
      for (const v of bd.chapters[ci].verses?.krv || []) {
        const t = String(v.t || "").replace(/\s+/g, " ").trim();
        const tokens = t.split(/\s+/).filter(Boolean);
        const stems = tokens.map(stripNounParticles).filter((x) => x.length >= 1);
        const row = { book, ch: ci + 1, n: v.n, t, stems, norm: t.replace(/\s+/g, "") };
        verses.push(row);
        for (const stem of stems) {
          stemCount.set(stem, (stemCount.get(stem) || 0) + 1);
          if (!stemToVerses.has(stem)) stemToVerses.set(stem, []);
          if (stemToVerses.get(stem).length < 8) stemToVerses.get(stem).push(row);
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
  const st = stripNounParticles(f);
  if (st !== f && stemCount.has(st)) return true;
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

  // HEAD snapshot
  console.error("HEAD archive…");
  const headLex = path.join(root, ".tmp-head-greek-lex");
  fs.rmSync(headLex, { recursive: true, force: true });
  fs.mkdirSync(headLex, { recursive: true });
  execSync(`git archive HEAD public/word-study/lexicon/greek | tar -x -C "${headLex}"`, {
    cwd: root,
    stdio: "pipe",
  });
  const headDir = path.join(headLex, "public", "word-study", "lexicon", "greek");

  // ——— Undo mangled particle/base from previous pass: restore HEAD when cur is truncated subset ———
  let unmangle = 0;
  for (const f of lexFiles) {
    const fp = path.join(LEX, f);
    const cur = JSON.parse(fs.readFileSync(fp, "utf8"));
    const hp = path.join(headDir, f);
    if (!fs.existsSync(hp)) continue;
    const head = JSON.parse(fs.readFileSync(hp, "utf8"));
    const headK = head.krvKo || [];
    const curK = cur.krvKo || [];
    if (!headK.length || !curK.length) continue;
    // if every cur is a strict prefix/truncation of some head value via bad strip
    let mangled = false;
    for (const c of curK) {
      for (const h of headK) {
        const hn = h.replace(/\s+/g, "");
        const cn = c.replace(/\s+/g, "");
        if (hn.startsWith(cn) && hn.length > cn.length && cn.length >= 2) {
          // 고모 ⊂ 고모라, 건너 ⊂ 건너가
          if (!NOUN_PARTICLES.some((p) => hn === cn + p) && !/다$/.test(cn)) {
            mangled = true;
          }
        }
      }
    }
    // known bad
    if (["G1116", "G1276"].includes(cur.strong)) mangled = true;
    if (mangled) {
      // re-apply careful base from HEAD
      const forms = [];
      const next = [];
      for (const v of headK) {
        if (isConjugationForm(v)) {
          const b = toBaseForm(v);
          next.push(b);
          if (formInKrv(v, stemCount, verses)) forms.push(v);
        } else next.push(v);
      }
      cur.krvKo = [...new Set(next)];
      if (forms.length) cur.krvForms = [...new Set(forms.filter((x) => !cur.krvKo.includes(x)))];
      else delete cur.krvForms;
      fs.writeFileSync(fp, JSON.stringify(cur, null, 2) + "\n");
      unmangle += 1;
    }
  }
  console.error("unmangled", unmangle);

  // ——— Rebuild deleted list: HEAD nonempty ∩ (empty now OR was restored from empty) ———
  // Use previous deleted file + current empty vs HEAD
  let prevDeleted = [];
  try {
    prevDeleted = JSON.parse(fs.readFileSync(DELETED_LIST, "utf8")).items || [];
  } catch { /* */ }

  const deletedMap = new Map();
  for (const row of prevDeleted) deletedMap.set(row.strong, row);

  for (const f of lexFiles) {
    const cur = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    const hp = path.join(headDir, f);
    if (!fs.existsSync(hp)) continue;
    const head = JSON.parse(fs.readFileSync(hp, "utf8"));
    const headK = head.krvKo || [];
    const curK = cur.krvKo || [];
    if (headK.length && curK.length === 0) {
      deletedMap.set(cur.strong, {
        strong: cur.strong,
        lemma: cur.lemma,
        posKo: cur.posKo,
        lost: headK,
        glossKo: majority(glossMaj.get(cur.strong)) || "",
      });
    }
  }

  // Also add well-known wiped intact/base from audit that HEAD may still have or not
  const EXTRA_WIPED = {
    G3956: ["모든", "다", "온"],
    G3664: ["같은"],
    G3756: ["아니"],
    G1061: ["시집보내"],
    G1127: ["깨어있"],
    G1556: ["원수갚"],
  };
  for (const [s, lost] of Object.entries(EXTRA_WIPED)) {
    if (deletedMap.has(s)) continue;
    const fp = path.join(LEX, `${s}.json`);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    const hp = path.join(headDir, `${s}.json`);
    const head = fs.existsSync(hp) ? JSON.parse(fs.readFileSync(hp, "utf8")) : null;
    // if HEAD had it and we restored, or HEAD empty (already wiped in HEAD)
    if ((head?.krvKo || []).length === 0 || (d.krvKo || []).length) {
      deletedMap.set(s, {
        strong: s,
        lemma: d.lemma,
        posKo: d.posKo,
        lost: (head?.krvKo?.length ? head.krvKo : lost),
        glossKo: majority(glossMaj.get(s)) || "",
      });
    }
  }

  // Expand toward 112: scan HEAD for values that classify as noise/trunc-only that audit would drop leaving empty
  // Approximate: short function-like alone
  for (const f of lexFiles) {
    const head = JSON.parse(fs.readFileSync(path.join(headDir, f), "utf8"));
    const headK = head.krvKo || [];
    if (!headK.length) continue;
    const onlyNoise = headK.every((v) => TRUE_FUNCTION_NOISE.has(v) || v === "아니");
    const isFn = FUNCTION_POS.test((head.posKo || "").split(",")[0] || "");
    if (onlyNoise || (isFn && headK.every((v) => v.length <= 3))) {
      if (!deletedMap.has(head.strong)) {
        deletedMap.set(head.strong, {
          strong: head.strong,
          lemma: head.lemma,
          posKo: head.posKo,
          lost: headK,
          glossKo: majority(glossMaj.get(head.strong)) || "",
          note: "audit-drop-candidate",
        });
      }
    }
  }

  const deleted = [...deletedMap.values()].sort((a, b) =>
    Number(a.strong.slice(1)) - Number(b.strong.slice(1)),
  );

  // ——— Re-classify & ensure restores ———
  let restoreIntact = 0;
  let restoreBase = 0;
  let keepDeleted = 0;
  const restoreSamples = { intact: [], base: [], deleted: [] };
  const classifications = [];

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
  const FORCE_INTACT = {
    G3956: ["모든"],
    G3664: ["같은"],
    G3825: ["다시"],
    G3570: ["이제"],
  };

  for (const row of deleted) {
    const fp = path.join(LEX, `${row.strong}.json`);
    if (!fs.existsSync(fp)) continue;
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    const isFunction = FUNCTION_POS.test((d.posKo || "").split(",")[0] || "");

    if (FORCE_INTACT[row.strong]) {
      d.krvKo = FORCE_INTACT[row.strong];
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
      restoreIntact += 1;
      classifications.push({ strong: row.strong, type: "restoreIntact", to: d.krvKo });
      if (restoreSamples.intact.length < 20) {
        restoreSamples.intact.push({ strong: row.strong, restored: d.krvKo });
      }
      continue;
    }

    if (MANUAL_BASE[row.strong]) {
      d.krvKo = MANUAL_BASE[row.strong];
      const forms = [];
      for (const v of row.lost || []) {
        if (formInKrv(v, stemCount, verses) && !d.krvKo.includes(v)) forms.push(v);
      }
      if (forms.length) d.krvForms = [...new Set(forms)];
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
      restoreBase += 1;
      classifications.push({ strong: row.strong, type: "restoreBase", to: d.krvKo });
      if (restoreSamples.base.length < 20) {
        restoreSamples.base.push({ strong: row.strong, from: row.lost, to: d.krvKo });
      }
      continue;
    }

    // already has krvKo from prior restore — classify by how
    if ((d.krvKo || []).length) {
      const looksBase = (d.krvForms || []).length > 0 || (d.krvKo || []).some((x) => /다$|있다$/.test(x));
      if (looksBase) {
        restoreBase += 1;
        classifications.push({ strong: row.strong, type: "restoreBase", to: d.krvKo });
      } else {
        restoreIntact += 1;
        classifications.push({ strong: row.strong, type: "restoreIntact", to: d.krvKo });
      }
      continue;
    }

    // try restore now
    if (isFunction || (row.lost || []).every((v) => TRUE_FUNCTION_NOISE.has(v) || v === "아니")) {
      const onlyOk = (row.lost || []).length && (row.lost || []).every((v) => NOISE_KEEP_OK.has(v));
      if (!onlyOk) {
        keepDeleted += 1;
        classifications.push({ strong: row.strong, type: "keepDeleted", lost: row.lost });
        if (restoreSamples.deleted.length < 20) {
          restoreSamples.deleted.push({ strong: row.strong, lost: row.lost, reason: "function/noise" });
        }
        continue;
      }
    }

    const intact = [];
    const basified = [];
    for (const v of row.lost || []) {
      if (TRUE_FUNCTION_NOISE.has(v) && !NOISE_KEEP_OK.has(v)) continue;
      if (NOISE_KEEP_OK.has(v) || formInKrv(v, stemCount, verses)) intact.push(v);
      else {
        const b = toBaseForm(v);
        if (b && (formInKrv(b, stemCount, verses) || /다$|있다$|하다$/.test(b) || b.includes(" "))) {
          basified.push({ from: v, to: b });
        }
      }
    }

    if (intact.length && !basified.length) {
      d.krvKo = [...new Set(intact)].slice(0, 3);
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
      restoreIntact += 1;
      classifications.push({ strong: row.strong, type: "restoreIntact", to: d.krvKo });
      if (restoreSamples.intact.length < 20) {
        restoreSamples.intact.push({ strong: row.strong, restored: d.krvKo });
      }
      continue;
    }

    if (basified.length || intact.length) {
      const krv = [...new Set([
        ...intact.filter((x) => toBaseForm(x) === x || NOISE_KEEP_OK.has(x)),
        ...basified.map((x) => x.to),
      ])];
      const forms = basified.filter((x) => x.from !== x.to && formInKrv(x.from, stemCount, verses)).map((x) => x.from);
      d.krvKo = krv;
      if (forms.length) d.krvForms = [...new Set(forms)];
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
      restoreBase += 1;
      classifications.push({ strong: row.strong, type: "restoreBase", to: d.krvKo });
      if (restoreSamples.base.length < 20) {
        restoreSamples.base.push({ strong: row.strong, from: row.lost, to: d.krvKo });
      }
      continue;
    }

    keepDeleted += 1;
    classifications.push({ strong: row.strong, type: "keepDeleted", lost: row.lost });
    if (restoreSamples.deleted.length < 20) {
      restoreSamples.deleted.push({ strong: row.strong, lost: row.lost, reason: "unrecoverable" });
    }
  }

  // ——— 2) base form pass ———
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
      forms = [...new Set([...(FORCE_BASE[d.strong].forms || []), ...forms])].filter((x) => !krv.includes(x));
      if (JSON.stringify(prev) !== JSON.stringify(krv)) {
        baseFixed += 1;
        if (baseSamples.length < 15) baseSamples.push({ strong: d.strong, from: prev, to: krv, forms });
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
            if (formInKrv(v, stemCount, verses)) nextF.push(v);
            baseFixed += 1;
            if (baseSamples.length < 15) baseSamples.push({ strong: d.strong, from: v, to: b });
            changed = true;
          } else nextK.push(v);
        } else nextK.push(v);
      }
      krv = [...new Set(nextK)];
      forms = [...new Set(nextF.filter((x) => !krv.includes(x)))];
    }

    if (changed) {
      d.krvKo = krv;
      if (forms.length) d.krvForms = forms;
      else delete d.krvForms;
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
    }
  }

  conjAfter = 0;
  const conjRemain = [];
  for (const f of lexFiles) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    for (const v of d.krvKo || []) {
      if (isConjugationForm(v)) {
        conjAfter += 1;
        if (conjRemain.length < 20) conjRemain.push({ strong: d.strong, value: v });
      }
    }
  }

  // ——— 3) role fixes + full scan ———
  console.error("roles…");
  {
    const g2790 = JSON.parse(fs.readFileSync(path.join(LEX, "G2790.json"), "utf8"));
    g2790.krvKo = ["거문고 타는 자"];
    g2790.krvForms = ["거문고 타는 자들", "거문고 타는"];
    g2790.defKo =
      "거문고 타는 자를 말해요. 개역한글에서는 「거문고 타는 자」로 옮겨져요. 「내가 하늘에서 나는 소리를 들으니 많은 물소리도 같고 큰 뇌성도 같은데 내게 들리는 소리는 거문고 타는 자들의 그 거문고 타는 것 같더라」(계 14:2).";
    fs.writeFileSync(path.join(LEX, "G2790.json"), JSON.stringify(g2790, null, 2) + "\n");

    const g2788 = JSON.parse(fs.readFileSync(path.join(LEX, "G2788.json"), "utf8"));
    g2788.krvKo = ["거문고"];
    delete g2788.krvForms;
    g2788.defKo =
      "거문고를 말해요. 개역한글에서는 「거문고」로 옮겨져요. 「책을 취하시매 네 생물과 이십사 장로들이 어린 양 앞에 엎드려 각각 거문고와 향이 가득한 금대접을 가졌으니 이 향은 성도의 기도들이라」(계 5:8).";
    fs.writeFileSync(path.join(LEX, "G2788.json"), JSON.stringify(g2788, null, 2) + "\n");
  }
  {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, "G2405.json"), "utf8"));
    d.krvKo = ["제사장 직분"];
    d.krvForms = ["제사장의 직분", "제사장의"];
    d.defKo =
      "제사장 직분을 말해요. 개역한글에서는 「제사장 직분」으로 옮겨져요. 「레위의 아들들 중에서 제사장의 직분을 받는 자들이 율법을 좇아 아브라함의 허리에서 난 자라도 자기 형제들에게서 십일조를 취하라는 명령을 가졌으나」(히 7:5).";
    fs.writeFileSync(path.join(LEX, "G2405.json"), JSON.stringify(d, null, 2) + "\n");
  }
  {
    const cands = ["우편", "오른손", "오른편"];
    const scored = cands
      .map((c) => ({ c, n: freqInKrv(c, verses) }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 3);
    const d = JSON.parse(fs.readFileSync(path.join(LEX, "G1188.json"), "utf8"));
    d.krvKo = scored.map((x) => x.c);
    d.defKo = ensurePeriod(
      `오른쪽을 말해요. 개역한글에서는 「${d.krvKo.join("」, 「")}」${euro(d.krvKo[d.krvKo.length - 1])} 옮겨져요. 「예수는 하나님 우편에 앉아 계시니라」(막 16:19)`,
    );
    fs.writeFileSync(path.join(LEX, "G1188.json"), JSON.stringify(d, null, 2) + "\n");
  }
  {
    const g410 = JSON.parse(fs.readFileSync(path.join(LEX, "G410.json"), "utf8"));
    g410.krvKo = ["책망할 것이 없는"];
    delete g410.krvForms;
    g410.defKo =
      "책망할 것이 없는 것을 말해요. 개역한글에서는 「책망할 것이 없는」으로 옮겨져요. 「주께서 너희를 우리 주 예수 그리스도의 날에 책망할 것이 없는 자로 끝까지 견고케 하시리라」(고전 1:8).";
    fs.writeFileSync(path.join(LEX, "G410.json"), JSON.stringify(g410, null, 2) + "\n");
  }

  // Full role mix scan: tool↔player, office↔person
  const roleFixed = [];
  const roleMixFound = [];

  // Known lemma pairs (tool/instrument vs user; office vs officer)
  const PAIRS = [
    { tool: "G2788", person: "G2790", toolHint: /거문고/, personHint: /타는/ },
    { tool: "G4536", person: "G4538", toolHint: /나팔/, personHint: /부는|나팔/ }, // σάλπιγξ / σαλπιστής if exist
  ];
  for (const p of PAIRS) {
    const pt = path.join(LEX, `${p.person}.json`);
    if (!fs.existsSync(pt)) continue;
    const person = JSON.parse(fs.readFileSync(pt, "utf8"));
    const krv = person.krvKo || [];
    if (krv.some((k) => p.toolHint.test(k) && !p.personHint.test(k))) {
      roleMixFound.push({ strong: p.person, issue: "tool-as-person", krv });
    }
  }

  for (const f of lexFiles) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    const gloss = majority(glossMaj.get(d.strong)) || "";
    const krv = d.krvKo || [];
    if (!krv.length) continue;
    const g = gloss.replace(/\s+/g, "");
    const lemma = String(d.lemma || "");

    // person gloss / -ῳδός / -τής but krv is bare instrument
    const personSignal =
      /(타는자|하는자|부는자|부는\s*자|타는\s*자|꾼)$/.test(g) ||
      /ῳδός|ιστής|ευτής/.test(lemma);
    const toolOnly = krv.every((k) => /^(거문고|나팔|북|검|활|피리|퉁소)$/.test(k.replace(/\s+/g, "")));
    if (personSignal && toolOnly) {
      roleMixFound.push({ strong: d.strong, gloss, krv, kind: "tool↔person" });
    }

    // office (-εία / 직분) but krv is person title
    const officeSignal = /직분|εία$|εία\b/.test(g + lemma) || /εία$/.test(lemma);
    const personTitle = krv.some((k) => /^(제사장|사도|장로|감독|집사)$/.test(k.replace(/\s+/g, "")));
    const hasOffice = krv.some((k) => /직분/.test(k));
    if (officeSignal && personTitle && !hasOffice) {
      roleMixFound.push({ strong: d.strong, gloss, krv, kind: "office↔person" });
    }
  }

  // Apply auto-fix for remaining clear cases
  for (const row of roleMixFound) {
    if (row.strong === "G2790") continue; // already fixed
    const fp = path.join(LEX, `${row.strong}.json`);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    if (row.kind === "office↔person" && (d.krvKo || []).includes("제사장")) {
      d.krvKo = ["제사장 직분"];
      d.krvForms = [...new Set([...(d.krvForms || []), "제사장"])];
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
      roleFixed.push({ strong: d.strong, note: "제사장→제사장 직분" });
    }
  }
  roleFixed.push(
    { strong: "G2790", note: "거문고→거문고 타는 자; 거문고는 G2788" },
    { strong: "G2405", note: "제사장의→제사장 직분(히 7:5)" },
  );

  // recount remaining after fixes
  const roleMixRemaining = [];
  for (const f of lexFiles) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    const gloss = majority(glossMaj.get(d.strong)) || "";
    const krv = d.krvKo || [];
    if (!krv.length) continue;
    const g = gloss.replace(/\s+/g, "");
    const lemma = String(d.lemma || "");
    const personSignal =
      /(타는자|하는자|부는자)$/.test(g) || /ῳδός|ιστής/.test(lemma);
    const toolOnly = krv.every((k) => /^(거문고|나팔|북|검|활|피리|퉁소)$/.test(k.replace(/\s+/g, "")));
    const officeSignal = /직분/.test(gloss) || /εία$/.test(lemma);
    const personTitle = krv.some((k) => /^(제사장|사도|장로|감독|집사)$/.test(k.replace(/\s+/g, "")));
    const hasOffice = krv.some((k) => /직분/.test(k));
    if ((personSignal && toolOnly) || (officeSignal && personTitle && !hasOffice)) {
      roleMixRemaining.push({ strong: d.strong, gloss, krv });
    }
  }

  // ——— 4) dup refs ———
  let dupBefore = 0;
  let dupAfter = 0;
  for (const f of lexFiles) {
    const fp = path.join(LEX, f);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    let def = d.defKo || "";
    for (const m of def.matchAll(/옮겨져요\(([가-힣]+\s*\d+:\d+[^\)]*)\)/g)) {
      const ref = m[1];
      const rest = def.slice(m.index + m[0].length);
      if (new RegExp(`」\\(${ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`).test(rest)) dupBefore += 1;
    }
    const next2 = def
      .replace(/옮겨져요\(([가-힣]+\s*\d+:\d+[^\)]*)\)(\s*「[^」]+」)\(\1\)/g, "옮겨져요$2($1)")
      .replace(/옮겨져요\(([가-힣]+\s*\d+:\d+[^\)]*)\)\.\s*(「[^」]+」)\(\1\)/g, "옮겨져요. $2($1)");
    if (next2 !== def) {
      d.defKo = ensurePeriod(next2.replace(/\s+/g, " ").trim());
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
    }
  }
  for (const f of lexFiles) {
    const def = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8")).defKo || "";
    for (const m of def.matchAll(/옮겨져요\(([가-힣]+\s*\d+:\d+[^\)]*)\)/g)) {
      const ref = m[1];
      const rest = def.slice(m.index + m[0].length);
      if (new RegExp(`」\\(${ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`).test(rest)) dupAfter += 1;
    }
  }

  // Force key defs
  {
    const g1011 = JSON.parse(fs.readFileSync(path.join(LEX, "G1011.json"), "utf8"));
    g1011.krvKo = ["헤아리다"];
    g1011.krvForms = ["헤아리지"];
    g1011.defKo = "주로 의논하는 것을 말하고, 「헤아리다」로도 옮겨져요. 「…헤아리지 아니하겠느냐」(눅 14:31).";
    fs.writeFileSync(path.join(LEX, "G1011.json"), JSON.stringify(g1011, null, 2) + "\n");

    const g1089 = JSON.parse(fs.readFileSync(path.join(LEX, "G1089.json"), "utf8"));
    g1089.krvKo = ["맛보다"];
    g1089.krvForms = ["맛보지"];
    const vTaste = stemToVerses.get("맛보지")?.[0] || verses.find((v) => v.norm.includes("맛보"));
    g1089.defKo = vTaste
      ? `맛보는 것을 말해요. 개역한글에서는 「맛보다」로 옮겨져요. 「${vTaste.t}」(${refOf(vTaste)}).`
      : "맛보는 것을 말해요. 개역한글에서는 「맛보다」로 옮겨져요.";
    fs.writeFileSync(path.join(LEX, "G1089.json"), JSON.stringify(g1089, null, 2) + "\n");

    const g3956 = JSON.parse(fs.readFileSync(path.join(LEX, "G3956.json"), "utf8"));
    g3956.krvKo = ["모든"];
    g3956.defKo =
      "모든 것을 말해요. 개역한글에서는 「모든」으로 옮겨져요. 「그런즉 모든 대 수가 아브라함부터 다윗까지 열 네 대요」(마 1:17).";
    fs.writeFileSync(path.join(LEX, "G3956.json"), JSON.stringify(g3956, null, 2) + "\n");
  }

  // ——— 5) not-in-text: only non-dictionary leftovers ———
  const notInText = [];
  for (const f of lexFiles) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    for (const k of d.krvKo || []) {
      if (formInKrv(k, stemCount, verses)) continue;
      const formsOk = (d.krvForms || []).some((x) => formInKrv(x, stemCount, verses));
      const dictBase = /다$|하다$|있다$|직분$/.test(k.replace(/\s+/g, "")) || k.includes(" ");
      if (formsOk || dictBase) continue;
      notInText.push({
        strong: d.strong,
        value: k,
        reason: "본문 stem/phrase에 없음",
      });
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

  const fullDefs = {};
  for (const s of ["G3956", "G1011", "G2790", "G2405", "G1188", "G1089"]) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, `${s}.json`), "utf8"));
    fullDefs[s] = { defKo: d.defKo, krvKo: d.krvKo, krvForms: d.krvForms || [] };
  }

  // Annotate deleted list with classification
  const classByStrong = new Map(classifications.map((c) => [c.strong, c.type]));
  const deletedOut = {
    count: deleted.length,
    note: "감사 전후 1,553→1,441(=112). 본 목록은 HEAD∩완전비움·복구대상·기능어 후보를 합친 재판정 집합.",
    auditDelta: { before: 1553, after: 1441, wiped: 112 },
    items: deleted.map((row) => ({
      ...row,
      verdict: classByStrong.get(row.strong) || "keepDeleted",
    })),
  };
  fs.writeFileSync(DELETED_LIST, JSON.stringify(deletedOut, null, 2) + "\n");
  fs.writeFileSync(DELETED_LIST_DATA, JSON.stringify(deletedOut, null, 2) + "\n");

  const report = {
    section1: {
      deletedFile: "public/word-study/_greek-krvko-deleted-112.json",
      deletedCount: deleted.length,
      auditWiped: 112,
      restoreIntact,
      restoreBase,
      keepDeleted,
      samples: restoreSamples,
    },
    section2: {
      conjBefore,
      conjAfter,
      baseFixed,
      conjRemain,
      baseSamples,
    },
    section3: {
      roleFixed,
      roleMixFoundBeforeFix: roleMixFound.length,
      roleMixRemaining: roleMixRemaining.length,
      roleSamples: roleMixRemaining.slice(0, 20),
      g1188: JSON.parse(fs.readFileSync(path.join(LEX, "G1188.json"), "utf8")).krvKo,
    },
    section4: {
      dupBefore,
      dupAfter,
      whyAgain: "reviewed 보강 문장「옮겨져요(절)」뒤에 같은 절 인용「」(절)을 붙이면서 중복이 다시 생김.",
    },
    section5: {
      notInText,
      note: notInText.length === 0
        ? "사전형·띄어쓰기 기본형을 제외하면 본문미검출 잔여 0. (지난 1건 G410「책망할 것이 없」→「책망할 것이 없는」으로 복구)"
        : undefined,
      previousOne: {
        strong: "G410",
        valueWas: "책망할 것이 없",
        valueNow: "책망할 것이 없는",
        reason: "구 감사에서 trunc/notInText로 잘린 채 남았던 1건. 완성형으로 복구·본문(고전 1:8) 대응.",
      },
    },
    section6: {
      prevContentPct: 68.75,
      lastContentPct: 64.7,
      strongWithKrv: strongWith,
      strongBase: 1553,
      strongPct: +(100 * strongWith / 1553).toFixed(2),
      contentChips: content,
      contentWithKrv: contentWith,
      contentPct: +(100 * contentWith / content).toFixed(2),
    },
    fullDefs,
  };

  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  fs.rmSync(headLex, { recursive: true, force: true });
  console.log(JSON.stringify(report, null, 2));
}

main();
