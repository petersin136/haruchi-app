#!/usr/bin/env node
/**
 * 최종 정리: 다중 KRV 표기, 활용형 오탐 제거, 뜻≠인용, reviewed 한 줄 보강
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
const REPORT = path.join(OUT, "_greek-defko-final-pass-report.json");

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
function eulReul(w) {
  return hasBatchim(w) ? "을" : "를";
}
function euro(w) {
  return hasBatchim(w) ? "으로" : "로";
}
function refOf(h) {
  return `${BOOK_KO[h.book]} ${h.ch}:${h.n}`;
}
function majority(map) {
  if (!map?.size) return "";
  return [...map.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** 활용·파생 차이(믿다/믿음, 피장이/피장) → gloss≠KRV 표기 부적합 */
function isConjugationDiff(gloss, krv) {
  const g = normalizeKo(gloss);
  const k = normalizeKo(krv);
  if (!g || !k) return false;
  if (g === k) return true;
  const gs = glossStem(gloss);
  const ks = glossStem(krv);
  if (!gs || !ks) return false;
  if (gs === ks) return true;
  if (gs.startsWith(ks) || ks.startsWith(gs)) return true;
  // 음/움/함 명사화
  const stripNom = (x) => x.replace(/(함|움|음|임|됨|됨이|심|됨)$/g, "");
  if (stripNom(gs) && stripNom(gs) === stripNom(ks)) return true;
  // 첫 2글자 같고 길이 비슷
  if (gs.length >= 2 && ks.length >= 2 && gs.slice(0, 2) === ks.slice(0, 2) && Math.abs(gs.length - ks.length) <= 2) {
    return true;
  }
  return false;
}

/** 뜻 표제어와 인용 KRV가 다른 번역어인지(활용 제외) */
function isDistinctTranslation(a, b) {
  if (!a || !b) return false;
  if (normalizeKo(a) === normalizeKo(b)) return false;
  if (isConjugationDiff(a, b)) return false;
  const as = glossStem(a);
  const bs = glossStem(b);
  if (!as || !bs) return false;
  if (as === bs || as.startsWith(bs) || bs.startsWith(as)) return false;
  // 한 글자만 겹치면 다른 말로 봄
  return true;
}

function cleanKrvBase(k) {
  let x = String(k || "").trim();
  // 잘못된 자동형: 핍박다 → 핍박
  if (/다$/.test(x) && x.length > 2 && !/(하다|되다|이다|가다|오다|주다|받다|보다|듣다|먹다|살다|죽다|믿다|사랑하다)$/.test(x)) {
    const stem = x.slice(0, -1);
    if (stem.length >= 2) x = stem;
  }
  return x;
}

function loadCorpus() {
  const hits = new Map();
  const glossMaj = new Map();
  for (const book of NT) {
    const bd = JSON.parse(fs.readFileSync(path.join(BD, `${book}.json`), "utf8"));
    const dir = path.join(OUT, book);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const chN = Number(f.replace(".json", ""));
      const ch = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      const krvMap = new Map((bd.chapters?.[chN - 1]?.verses?.krv || []).map((x) => [x.n, x.t || ""]));
      for (const v of ch.verses || []) {
        const krv = krvMap.get(v.n) || "";
        for (const w of v.words || []) {
          if (!w.strong) continue;
          if (w.glossKo) {
            if (!glossMaj.has(w.strong)) glossMaj.set(w.strong, new Map());
            const m = glossMaj.get(w.strong);
            m.set(w.glossKo, (m.get(w.glossKo) || 0) + 1);
          }
          if (!hits.has(w.strong)) hits.set(w.strong, []);
          const arr = hits.get(w.strong);
          if (!arr.some((x) => x.book === book && x.ch === chN && x.n === v.n)) {
            arr.push({ book, ch: chN, n: v.n, krv, gloss: w.glossKo || "" });
          }
        }
      }
    }
  }
  return { hits, glossMaj };
}

/** krv 후보들이 본문에 나타나는 절을 찾아 (form → ref) */
function locateForms(list, forms) {
  const out = [];
  for (const form of forms) {
    if (!form) continue;
    const hit = list.find((v) => v.krv.includes(form));
    if (hit) out.push({ form, ref: refOf(hit), krv: hit.krv });
  }
  return out;
}

function extractHeadCore(def) {
  const head = (def.split(/[「]/)[0] || "").trim();
  // strip multi-form sentence if present
  const first = head.split(/개역한글에서는/)[0].trim();
  const m =
    first.match(/^(.+?)(을|를) 말해요/) ||
    first.match(/^(.+?)하는 것을 말해요/) ||
    first.match(/^(.+?)는 것을 말해요/) ||
    first.match(/^(.+?)이에요/) ||
    first.match(/^(.+?)예요/);
  if (!m) return "";
  let core = m[1]
    .replace(/\(개역한글:\s*[^)]+\)/g, "")
    .replace(/공회 의원\(공회원\)/g, "공회원")
    .replace(/\([^)]*\)/g, "")
    .trim();
  // 주로 X를 말하고 제거
  core = core.replace(/^주로\s*/, "").replace(/를 말하고.*$/, "").replace(/을 말하고.*$/, "");
  return core.trim();
}

function findCiteKrvWord(citeText, gloss, krvKo) {
  const cite = String(citeText || "");
  // prefer krvKo present in cite
  for (const k of krvKo || []) {
    const base = cleanKrvBase(k);
    if (base && cite.includes(base)) return base;
  }
  // hangul runs in cite that are "content-like"
  const tokens = cite.match(/[가-힣]{2,}/g) || [];
  const gs = glossStem(gloss);
  for (const t of tokens) {
    if (gs && (t.includes(gs) || gs.includes(t.slice(0, Math.min(2, t.length))))) return t;
  }
  // first substantial token after ellipsis
  if (tokens.length) return tokens[0];
  return "";
}

function main() {
  const { hits, glossMaj } = loadCorpus();

  // Matt confirmation
  const matt = JSON.parse(fs.readFileSync(path.join(BD, "matthew.json"), "utf8"));
  const matt312 = matt.chapters[2].verses.krv.find((x) => x.n === 12)?.t || "";
  const matt1330 = matt.chapters[12].verses.krv.find((x) => x.n === 30)?.t || "";

  // ——— collect gloss(개역한글) before mutation ———
  const glossDiffBefore = [];
  for (const f of fs.readdirSync(LEX).filter((x) => x.endsWith(".json"))) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    const head = (d.defKo || "").split(/[「]/)[0] || "";
    const m = head.match(/^(.+?)\(개역한글:\s*([^)]+)\)/);
    if (!m) continue;
    const gloss = majority(glossMaj.get(d.strong)) || m[1].replace(/(을|를)\s*$/, "").trim();
    const krvListed = m[2].trim();
    const ref = (d.defKo || "").match(/\(([가-힣]+\s*\d+:\d+[^\)]*)\)/)?.[1] || "";
    glossDiffBefore.push({
      strong: d.strong,
      gloss,
      krvListed,
      krvKo: d.krvKo || [],
      ref,
      conj: isConjugationDiff(gloss, krvListed),
    });
  }

  // deterministic sample 15
  const sorted = [...glossDiffBefore].sort((a, b) => a.strong.localeCompare(b.strong));
  const step = Math.max(1, Math.floor(sorted.length / 15));
  const sample15 = [];
  for (let i = 0; i < sorted.length && sample15.length < 15; i += step) sample15.push(sorted[i]);

  let removedConj = 0;
  let multiFormN = 0;
  let meaningCiteN = 0;
  let reviewedAppendN = 0;

  // Force multi-form known cases from bible-data scan for G596
  const MULTI_FORCE = {
    G596: {
      gloss: "곳간",
      forms: [
        { form: "곡간", book: "matthew", ch: 3, n: 12 },
        { form: "곳간", book: "matthew", ch: 13, n: 30 },
      ],
    },
  };

  for (const f of fs.readdirSync(LEX).filter((x) => x.endsWith(".json"))) {
    const fp = path.join(LEX, f);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    const strong = d.strong || f.replace(/\.json$/, "");
    const gloss = majority(glossMaj.get(strong)) || "";
    let def = (d.defKo || "").trim();
    let changed = false;
    const list = hits.get(strong) || [];
    const krvKo = (d.krvKo || []).map(cleanKrvBase).filter(Boolean);
    const krvForms = (d.krvForms || []).map(cleanKrvBase).filter(Boolean);

    // —— 2a) remove conjugation false 「gloss(개역한글:)」 ——
    {
      const head = def.split(/[「]/)[0] || "";
      const m = head.match(/^(.+?)\(개역한글:\s*([^)]+)\)(을|를) 말해요/);
      if (m) {
        const label = m[1].trim();
        const krvListed = m[2].trim();
        const g = gloss || label;
        if (isConjugationDiff(g, krvListed) || isConjugationDiff(label, krvListed)) {
          def = def.replace(
            /^(.+?)\(개역한글:\s*[^)]+\)(을|를) 말해요/,
            `${label}${eulReul(label)} 말해요`,
          );
          removedConj += 1;
          changed = true;
        }
      }
    }

    // —— 2b) multi-form wording ——
    {
      let forms = [];
      if (MULTI_FORCE[strong]) {
        forms = MULTI_FORCE[strong].forms.map((x) => ({
          form: x.form,
          ref: `${BOOK_KO[x.book]} ${x.ch}:${x.n}`,
        }));
      } else {
        const candidates = [...new Set([...krvKo, ...krvForms])].filter(Boolean);
        // distinct from gloss and from each other
        const distinct = candidates.filter((k) => isDistinctTranslation(gloss, k) || normalizeKo(k) !== normalizeKo(gloss));
        const uniq = [...new Set(distinct.map(normalizeKo))].map((nk) => distinct.find((x) => normalizeKo(x) === nk));
        if (uniq.length >= 2 && gloss && uniq.some((k) => isDistinctTranslation(gloss, k) || normalizeKo(gloss) !== normalizeKo(k))) {
          const located = locateForms(list, uniq);
          // need at least 2 located distinct forms
          const byForm = new Map();
          for (const loc of located) {
            if (!byForm.has(loc.form)) byForm.set(loc.form, loc);
          }
          if (byForm.size >= 2) {
            forms = [...byForm.values()].slice(0, 4).map((x) => ({ form: x.form, ref: x.ref }));
          }
        }
      }

      if (forms.length >= 2 && gloss) {
        // rebuild opening as: 「곳간을 말해요. 개역한글에서는 「곡간」(마 3:12), 「곳간」(마 13:30)으로 옮겨졌어요.」
        const citePart = def.includes("「") ? def.slice(def.indexOf("「")) : "";
        // drop old gloss(개역한글) / old multi sentence / 주로… lines from head
        let tail = citePart;
        // if cite exists after multi sentence already, keep last 「
        const parts = def.split(/(?=「)/);
        if (parts.length >= 2) tail = parts.slice(1).join("");
        // remove trailing 주로/개역한글에서는 lines before cite
        tail = tail.replace(/^주로[^「]* /, "");
        const formBits = forms.map((x) => `「${x.form}」(${x.ref})`).join(", ");
        const g = MULTI_FORCE[strong]?.gloss || gloss;
        def = ensurePeriod(
          `${g}${eulReul(g)} 말해요. 개역한글에서는 ${formBits}${euro(forms[forms.length - 1].form)} 옮겨졌어요. ${tail}`
            .replace(/\s+/g, " ")
            .replace(/\. 「/, ". 「")
            .trim(),
        );
        // cleanup double periods / duplicate cite refs later
        def = def.replace(/\.\s*\./g, ".");
        multiFormN += 1;
        changed = true;
      }
    }

    // —— 3) meaning ≠ cite KRV → 주로 X, Y로도 ——
    {
      if (!/개역한글에서는/.test(def)) {
        const cm = def.match(/「([^」]+)」/);
        const core = extractHeadCore(def);
        if (cm && core) {
          // find KRV word in cite
          let y = "";
          for (const k of krvKo) {
            if (cm[1].includes(k)) {
              y = k;
              break;
            }
          }
          if (!y) {
            // scan cite for a token that appears in verse and differs from core
            const tokens = cm[1].match(/[가-힣]{2,}/g) || [];
            for (const t of tokens) {
              if (isDistinctTranslation(core, t) && list.some((v) => v.krv.includes(t))) {
                y = t;
                break;
              }
            }
          }
          // specials
          if (strong === "G1011") y = "헤아리다";
          if (y && isDistinctTranslation(core, y)) {
            if (!/주로 .+ 말하고/.test(def)) {
              // insert after first sentence end / before cite
              const x = core.replace(/하는$/, "하다").replace(/는$/, "다");
              // normalize X to dictionary-ish
              let xWord = gloss || x;
              if (/하는$/.test(core)) xWord = gloss || `${core.slice(0, -2)}하다`;
              else if (/는$/.test(core) && !gloss) xWord = `${core.slice(0, -1)}다`;
              else xWord = gloss || core;

              let yWord = y;
              if (strong === "G1011") {
                xWord = "의논하다";
                yWord = "헤아리다";
              }

              const line = `주로 ${xWord}${eulReul(xWord)} 말하고, ${yWord}${euro(yWord)}도 옮겨져요.`;
              if (def.includes("「")) {
                def = def.replace(/^(.*?)(「)/, (_, a, b) => {
                  const base = a.replace(/\s*$/, "");
                  // if base ends with 말해요. keep; else ensure
                  const head = /말해요\.?$/.test(base.trim())
                    ? `${base.trim().replace(/\.$/, "")}. ${line} `
                    : `${ensurePeriod(base)} ${line} `;
                  return head + b;
                });
              } else {
                def = `${ensurePeriod(def)} ${line}`;
              }
              meaningCiteN += 1;
              changed = true;
            }
          }
        }
      }
    }

    // —— 4) reviewed + krvKo → append KRV line ——
    if (d.noteSrc === "reviewed" && krvKo.length) {
      if (!/개역한글에서는 주로 「/.test(def)) {
        let primary = cleanKrvBase(krvKo[0]);
        // fix bad 핍박다
        if (primary.endsWith("다") && primary.length > 2 && glossStem(primary).length >= 2) {
          const maybe = primary.slice(0, -1);
          if (list.some((v) => v.krv.includes(maybe))) primary = maybe;
        }
        const hit =
          list.find((v) => v.krv.includes(primary)) ||
          list.find((v) => krvKo.some((k) => v.krv.includes(cleanKrvBase(k)))) ||
          list[0];
        if (hit && primary) {
          // if primary not in hit, switch
          if (!hit.krv.includes(primary)) {
            for (const k of krvKo) {
              const b = cleanKrvBase(k);
              const h2 = list.find((v) => v.krv.includes(b));
              if (h2) {
                primary = b;
                break;
              }
            }
          }
          const ref = refOf(
            list.find((v) => v.krv.includes(primary)) || hit,
          );
          def = ensurePeriod(
            `${def.replace(/\.$/, "")}. 개역한글에서는 주로 「${primary}」${euro(primary)} 옮겨졌어요(${ref})`,
          );
          reviewedAppendN += 1;
          changed = true;
        }
      }
    }

    if (changed) {
      // tidy spaces
      def = def
        .replace(/\s+/g, " ")
        .replace(/\.\s*\./g, ".")
        .replace(/말해요\. 주로/g, "말해요. 주로")
        .trim();
      d.defKo = ensurePeriod(def);
      // keep krvKo cleaned for G1377 etc.
      if (Array.isArray(d.krvKo) && d.krvKo.length) {
        d.krvKo = d.krvKo.map(cleanKrvBase);
      }
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
    }
  }

  // Force G596 / G1011 polished forms (overwrite races)
  {
    const g596 = JSON.parse(fs.readFileSync(path.join(LEX, "G596.json"), "utf8"));
    g596.krvKo = ["곡간", "곳간"];
    g596.defKo =
      "곳간을 말해요. 개역한글에서는 「곡간」(마 3:12), 「곳간」(마 13:30)으로 옮겨졌어요. 「…곳간에 넣으라 하리라」(마 13:30).";
    fs.writeFileSync(path.join(LEX, "G596.json"), JSON.stringify(g596, null, 2) + "\n");
  }
  {
    const g1011 = JSON.parse(fs.readFileSync(path.join(LEX, "G1011.json"), "utf8"));
    g1011.defKo =
      "의논하는 것을 말해요. 주로 의논하다를 말하고, 헤아리다로도 옮겨져요. 「…헤아리지 아니하겠느냐」(눅 14:31).";
    // particle fix: 의논하다를 → 의논하다를 is wrong batchim? 다 has batchim? 다 ends with 다 (no batchim of 받침 on last syllable - 다 is ㄷ+ㅏ+no batchim) → 를. OK
    // Actually 하다 ends with 다 which has no batchim → 를. "의논하다를" is correct.
    fs.writeFileSync(path.join(LEX, "G1011.json"), JSON.stringify(g1011, null, 2) + "\n");
  }

  // recount remaining cites
  const remainingCites = [];
  for (const f of fs.readdirSync(LEX).filter((x) => x.endsWith(".json"))) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    const m = (d.defKo || "").match(/「([^」]+)」/);
    if (!m || !/…/.test(m[1])) continue;
    // skip name-meaning short
    if (m[1].length <= 14 && !/…/.test(m[1])) continue;
    const gloss = majority(glossMaj.get(d.strong)) || "";
    const needles = [
      ...(d.krvKo || []),
      ...(d.krvForms || []),
      gloss,
      glossStem(gloss),
    ]
      .map(String)
      .filter((x) => x && x.length >= 1);
    const gs = glossStem(gloss);
    if (gs.length >= 1) needles.push(gs[0]);
    if (gs.length >= 2) needles.push(gs.slice(0, 2));
    // also accept words mentioned in 주로/개역한글에서는 lines
    const head = (d.defKo || "").split("「")[0] || "";
    for (const mm of head.matchAll(/「([^」]+)」/g)) needles.push(mm[1]);
    for (const mm of head.matchAll(/주로\s*([가-힣]+)/g)) needles.push(mm[1]);
    for (const mm of head.matchAll(/,\s*([가-힣]+)(?:으로|로)도/g)) needles.push(mm[1]);

    const ok = needles.some(
      (n) => n && (m[1].includes(n) || normalizeKo(m[1]).includes(normalizeKo(n)) || m[1].includes(glossStem(n))),
    );
    if (!ok) {
      const ref = (d.defKo || "").match(/\(([가-힣]+\s*\d+:\d+[^\)]*)\)\s*\.?$/)?.[1] || "";
      let reason = "인용 창에 gloss/krvKo 바늘 없음";
      if (!(d.krvKo || []).length) reason = "krvKo 없음 + gloss≠인용 번역어(동의역·다른 말)";
      else reason = "krvKo/gloss가 현재 인용 창 밖(잘린 창·다른 절 형태)";
      // if 주로 line present, still "cite window" issue for needle metric
      if (/주로 .+ 말하고/.test(d.defKo || "")) reason = "뜻≠인용 번역어(주로/로도 보강함) — 인용 창에는 Y만 있음";
      remainingCites.push({ strong: d.strong, ref, gloss, krvKo: d.krvKo || [], reason, cite: m[1].slice(0, 40) });
    }
  }

  // recount gloss(개역한글) after
  let glossDiffAfter = 0;
  for (const f of fs.readdirSync(LEX).filter((x) => x.endsWith(".json"))) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    if (/\(개역한글:\s*[^)]+\)/.test((d.defKo || "").split(/[「]/)[0] || "")) glossDiffAfter += 1;
  }

  const full = {};
  for (const s of ["G596", "G1011", "G1377"]) {
    full[s] = JSON.parse(fs.readFileSync(path.join(LEX, `${s}.json`), "utf8")).defKo;
  }

  const report = {
    section1: {
      explain: {
        verb729:
          "지난 729는 「~는/하는 것을 말해요」(또는 일을 말해요) 동사 틀 전체 건수.",
        verb719:
          "이번 ~719는 같은 틀을 다시 센 값(수정·재분류 과정에서 일부가 다른 문장형으로 바뀌어 729→719).",
        table69:
          "표 합계 69(띄어쓰기5+목적어57+어간7)는 틀 전체가 아니라, 그중 조립 오류로 분류된 건수만의 합. 나머지 ~650은 오류 없는 정상 틀.",
        cite145vs369:
          "지난 145는 초기 휴리스틱(ellipsis+짧은 창) 추정. 이번 전 369는 ‘ellipsis 인용에 gloss/krvKo 바늘이 없음’으로 재집계한 값(기준이 더 넓음).",
      },
      remainingCites: {
        count: remainingCites.length,
        list: remainingCites,
      },
    },
    section2: {
      matt: {
        "마3:12_낱말": /곡간/.test(matt312) ? "곡간" : /곳간/.test(matt312) ? "곳간" : "?",
        "마13:30_낱말": /곳간/.test(matt1330) ? "곳간" : /곡간/.test(matt1330) ? "곡간" : "?",
        "마3:12_snippet": matt312.match(/.{0,12}곡간.{0,12}/)?.[0] || matt312.slice(0, 60),
        "마13:30_snippet": matt1330.match(/.{0,12}곳간.{0,12}/)?.[0] || matt1330.slice(0, 60),
      },
      glossDiffBefore: glossDiffBefore.length,
      conjugationRemoved: removedConj,
      glossDiffAfter,
      multiFormUpdated: multiFormN,
      sample15,
    },
    section3: { meaningCitePatched: meaningCiteN },
    section4: { reviewedAppended: reviewedAppendN },
    fullDefs: full,
  };

  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}

main();
