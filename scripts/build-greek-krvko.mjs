#!/usr/bin/env node
/**
 * 헬라어 lexicon krvKo 채우기 + 옛말 대응표.
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
const VARIANTS = path.join(root, "data", "krv-variants.json");
const REPORT = path.join(OUT, "_greek-krvko-report.json");

const NT = [
  "matthew", "mark", "luke", "john", "acts",
  "romans", "corinthians1", "corinthians2", "galatians", "ephesians",
  "philippians", "colossians", "thessalonians1", "thessalonians2",
  "timothy1", "timothy2", "titus", "philemon", "hebrews",
  "james", "peter1", "peter2", "john1", "john2", "john3", "jude", "revelation",
];

const FUNCTION_POS_RE = /관사|전치사|접속사|대명사/;

/** 사람이 봐도 같은 뜻인 옛말 대응 (자동 후보 중 확정분 + 요청 견본) */
const HAND_VARIANTS = {
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
  좋은: ["선한"],
  감옥: ["옥"],
  죽음: ["사망"],
  인사하다: ["문안"],
  놀라다: ["기이히"],
  위선자: ["외식"],
  믿음없는: ["믿지"],
  세례주다: ["세례"],
  첫째: ["먼저"],
  진실로: ["아멘"],
  평화: ["평강"],
  육체: ["육신"],
  소리: ["음성"],
};

/** strong → 반드시 넣을 krvKo 견본 */
const SAMPLE_KRV = {
  G596: ["곡간"],
  G1377: ["핍박"],
  G5185: ["소경"],
  G3015: ["문둥병", "문둥이"],
};

const PARTICLE_RE =
  /(으로|에서|에게서|에게|께서|부터|까지|이나|이나마|이라도|이라도|라도|로서|로써|이여|여|아|야|은|는|이|가|을|를|의|에|와|과|도|만|로|요|며|고|니|면|되|다|네|군|구나|라|어|아)$/;

function normalizeKo(s) {
  return String(s || "")
    .replace(/\s+/g, "")
    .replace(/[.,;:!?·"'“”‘’()[\]{}「」『』]/g, "");
}

function stripDictEnding(g) {
  let x = normalizeKo(g);
  if (x.endsWith("하다") && x.length > 2) x = x.slice(0, -2);
  else if (x.endsWith("되다") && x.length > 2) x = x.slice(0, -2);
  else if (x.endsWith("시키다") && x.length > 3) x = x.slice(0, -3);
  else if (x.endsWith("당하다") && x.length > 3) x = x.slice(0, -3);
  else if (x.endsWith("돌리다") && x.length > 3) x = x.slice(0, -3);
  else if (x.endsWith("전하다") && x.length > 3) x = x.slice(0, -3);
  else if (x.endsWith("짓다") && x.length > 2) x = x.slice(0, -2);
  else if (x.endsWith("다") && x.length > 1) x = x.slice(0, -1);
  return x;
}

function stripParticle(tok) {
  let t = normalizeKo(tok);
  // peel common endings repeatedly (short)
  for (let k = 0; k < 2; k++) {
    const m = t.match(PARTICLE_RE);
    if (!m) break;
    if (t.length - m[1].length < 2) break;
    t = t.slice(0, -m[1].length);
  }
  // verbal endings 하는/하는자/한 → stem-ish
  t = t.replace(/(하는|하며|하고|하여|하니|할|한|함|습니다|느니라|더라|리라|이라|니라)$/u, "");
  return t.length >= 2 ? t : normalizeKo(tok);
}

function isFunction(w) {
  const head = (w.parseKo || "").split(/[,，·]/)[0] || "";
  return FUNCTION_POS_RE.test(head);
}

function formsInText(forms, krvNorm) {
  for (const f of forms) {
    const n = normalizeKo(f);
    if (!n) continue;
    if (krvNorm.includes(n)) return true;
    const s = stripDictEnding(n);
    if (s.length >= 2 && krvNorm.includes(s)) return true;
  }
  return false;
}

function glossInKrv(gloss, krvNorm) {
  return formsInText([gloss], krvNorm);
}

function krvStems(text) {
  const raw = String(text || "").match(/[가-힣]{2,}/g) || [];
  const out = [];
  const seen = new Set();
  for (const tok of raw) {
    const stem = stripParticle(tok);
    if (stem.length < 2) continue;
    if (seen.has(stem)) continue;
    seen.add(stem);
    out.push({ tok, stem });
  }
  return out;
}

function editDist(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

const STOP = new Set(
  `하나님,예수,그리스도,주,사람,자들,내가,네가,우리가,너희가,저희,자기,이는,자는,가로되,이르되,하니라,하더라,있느니라,때에,안에,앞에,뒤에,위에,아래,또한,다시,이제,이미,바로,모든,하나`.split(
    ",",
  ),
);

function scanCorpus(krvKoByStrong) {
  let totalContent = 0;
  let missing = 0;
  /** @type {Map<string, { gloss: string, missing: number, stemFreq: Map<string, number> }>} */
  const byStrong = new Map();
  /** @type {Map<string, number>} */
  const pairCount = new Map();

  for (const book of NT) {
    const bd = JSON.parse(fs.readFileSync(path.join(BD, `${book}.json`), "utf8"));
    const dir = path.join(OUT, book);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const chN = Number(f.replace(".json", ""));
      const ch = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      const krvVerses = bd.chapters?.[chN - 1]?.verses?.krv || [];
      const krvMap = new Map(krvVerses.map((x) => [x.n, x.t || ""]));
      for (const v of ch.verses || []) {
        const krv = krvMap.get(v.n) || "";
        const krvNorm = normalizeKo(krv);
        const stems = krvStems(krv);
        for (const w of v.words || []) {
          if (isFunction(w)) continue;
          const gloss = (w.glossKo || "").trim();
          if (!gloss) continue;
          totalContent += 1;
          const strong = (w.strong || "").trim();
          const krvForms = strong && krvKoByStrong?.get(strong) ? krvKoByStrong.get(strong) : [];
          const ok =
            glossInKrv(gloss, krvNorm) ||
            (krvForms.length > 0 && formsInText(krvForms, krvNorm));
          if (ok) continue;
          missing += 1;
          if (!strong) continue;
          if (!byStrong.has(strong)) {
            byStrong.set(strong, { gloss, missing: 0, stemFreq: new Map() });
          }
          const row = byStrong.get(strong);
          row.missing += 1;
          row.gloss = gloss;
          const gStem = stripDictEnding(gloss);
          for (const { stem } of stems) {
            if (STOP.has(stem)) continue;
            if (stem === gStem || stem === normalizeKo(gloss)) continue;
            row.stemFreq.set(stem, (row.stemFreq.get(stem) || 0) + 1);
            if (gStem.length >= 2 && stem.length >= 2 && editDist(gStem, stem) <= 2) {
              const k = `${gloss}→${stem}`;
              pairCount.set(k, (pairCount.get(k) || 0) + 1);
            }
          }
        }
      }
    }
  }

  // synonym pairs from co-occurrence
  const coPairs = [];
  for (const [strong, row] of byStrong) {
    if (row.missing < 3) continue;
    const ranked = [...row.stemFreq.entries()]
      .filter(([t, n]) => n >= Math.max(2, Math.ceil(row.missing * 0.3)))
      .sort((a, b) => b[1] - a[1]);
    if (!ranked.length) continue;
    const [stem, n] = ranked[0];
    const g = stripDictEnding(row.gloss);
    const close = editDist(g, stem) <= 2 || g.slice(0, 2) === stem.slice(0, 2);
    const coverage = n / row.missing;
    if (close || coverage >= 0.45) {
      coPairs.push({
        strong,
        gloss: row.gloss,
        krv: stem,
        n,
        missing: row.missing,
        coverage: +coverage.toFixed(2),
        close,
      });
      const k = `${row.gloss}→${stem}`;
      pairCount.set(k, (pairCount.get(k) || 0) + n);
    }
  }

  const top30 = [...pairCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([pair, n]) => {
      const [gloss, krv] = pair.split("→");
      return { n, gloss, krv, pair };
    });

  return { totalContent, missing, pct: +((100 * missing) / totalContent).toFixed(2), top30, coPairs, byStrong };
}

function buildVariants(coPairs, top30) {
  /** @type {Record<string, string[]>} */
  const auto = {};
  const ambiguous = [];
  const accepted = [];

  // 확정 옛말만 — 자동 광범위 확장은 하지 않음(노이즈 방지)
  for (const [k, vs] of Object.entries(HAND_VARIANTS)) {
    auto[k] = [...vs];
    accepted.push({ gloss: k, krv: vs, source: "reviewed-same-sense" });
  }

  for (const p of coPairs.slice(0, 80)) {
    const g = p.gloss;
    const k = p.krv;
    if (!g || !k) continue;
    if (HAND_VARIANTS[g]) continue;
    ambiguous.push({ gloss: g, krv: k, reason: "자동 후보·미확정", n: p.n, coverage: p.coverage });
  }

  // dedupe accepted list for report
  const seen = new Set();
  const acceptedUnique = [];
  for (const a of accepted) {
    const key = `${a.gloss}→${Array.isArray(a.krv) ? a.krv.join("/") : a.krv}`;
    if (seen.has(key)) continue;
    seen.add(key);
    acceptedUnique.push(a);
  }

  return { variants: auto, accepted: acceptedUnique, ambiguous: ambiguous.slice(0, 40) };
}

function fillKrvKo(variants, byStrong) {
  let filled = 0;
  let updated = 0;
  const strongs = fs.readdirSync(LEX).filter((f) => f.endsWith(".json"));
  /** @type {Map<string, string[]>} */
  const map = new Map();

  for (const f of strongs) {
    const fp = path.join(LEX, f);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    const strong = d.strong;
    const row = byStrong.get(strong);
    const gloss = row?.gloss || "";
    /** @type {string[]} */
    let list = [];

    if (SAMPLE_KRV[strong]) list.push(...SAMPLE_KRV[strong]);
    if (gloss && variants[gloss]) list.push(...variants[gloss]);
    // also try majority chip gloss from lexicon phrases? skip

    // from co-occurrence top stem if in variants values
    if (row) {
      const top = [...row.stemFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      for (const [stem] of top) {
        for (const [g, vs] of Object.entries(variants)) {
          if (vs.includes(stem) && (g === gloss || stripDictEnding(g) === stripDictEnding(gloss))) {
            list.push(stem);
          }
        }
        // if gloss maps via hand
        if (variants[gloss]?.includes(stem)) list.push(stem);
      }
    }

    list = [...new Set(list.map((x) => normalizeKo(x)).filter(Boolean))];
    // restore readable forms from SAMPLE / variants (without over-normalizing particles)
    const pretty = [];
    const add = (x) => {
      const t = String(x || "").trim();
      if (t && !pretty.includes(t)) pretty.push(t);
    };
    if (SAMPLE_KRV[strong]) SAMPLE_KRV[strong].forEach(add);
    if (gloss && variants[gloss]) variants[gloss].forEach(add);
    for (const x of list) {
      // find original pretty
      let found = false;
      for (const vs of Object.values(variants)) {
        for (const v of vs) {
          if (normalizeKo(v) === x) {
            add(v);
            found = true;
          }
        }
      }
      if (!found) add(x);
    }

    if (!pretty.length) {
      map.set(strong, []);
      continue;
    }

    const prev = Array.isArray(d.krvKo) ? d.krvKo.join("|") : "";
    d.krvKo = pretty;
    map.set(strong, pretty);
    filled += 1;
    if (prev !== pretty.join("|")) {
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
      updated += 1;
    }
  }
  return { filled, updated, map };
}

function mattSamples(krvKoMap) {
  const ch3 = JSON.parse(fs.readFileSync(path.join(OUT, "matthew", "3.json"), "utf8"));
  const ch5 = JSON.parse(fs.readFileSync(path.join(OUT, "matthew", "5.json"), "utf8"));
  const ch10 = JSON.parse(fs.readFileSync(path.join(OUT, "matthew", "10.json"), "utf8"));
  const bd = JSON.parse(fs.readFileSync(path.join(BD, "matthew.json"), "utf8"));
  const pick = (ch, n, word) => {
    const v = ch.verses.find((x) => x.n === n);
    const w = (v?.words || []).find((x) => x.word === word || x.word.replace(/[⸀⸂⸃]/g, "") === word);
    const krv = bd.chapters[ch.chapter - 1]?.verses?.krv?.find((x) => x.n === n)?.t || "";
    const strong = w?.strong || "";
    const krvKo = krvKoMap.get(strong) || [];
    const krvNorm = normalizeKo(krv);
    return {
      ref: `마 ${ch.chapter}:${n}`,
      word: w?.word,
      lemma: w?.lemma,
      strong,
      glossKo: w?.glossKo,
      krvKo,
      krvVerse: krv,
      glossInKrv: glossInKrv(w?.glossKo || "", krvNorm),
      krvKoInKrv: formsInText(krvKo, krvNorm),
      pairOk: !glossInKrv(w?.glossKo || "", krvNorm) && formsInText(krvKo, krvNorm),
    };
  };
  return [
    pick(ch3, 12, "ἀποθήκην"),
    pick(ch5, 10, "δεδιωγμένοι"),
    pick(ch10, 23, "διώκωσιν"),
  ];
}

function main() {
  console.log("[0] before scan…");
  const before = scanCorpus(null);
  console.log(JSON.stringify({ totalContent: before.totalContent, missing: before.missing, pct: before.pct }));
  console.log("top30:");
  for (const p of before.top30) console.log(`  ${p.n}\t${p.gloss}→${p.krv}`);

  const { variants, accepted, ambiguous } = buildVariants(before.coPairs, before.top30);
  fs.writeFileSync(VARIANTS, JSON.stringify(variants, null, 2) + "\n");
  console.log("[2] wrote", VARIANTS, "keys", Object.keys(variants).length);

  console.log("[1] fill krvKo…");
  const { filled, updated, map } = fillKrvKo(variants, before.byStrong);
  console.log({ filled, updated });

  // ensure samples
  for (const [strong, forms] of Object.entries(SAMPLE_KRV)) {
    const fp = path.join(LEX, `${strong}.json`);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    const set = new Set([...(d.krvKo || []), ...forms]);
    d.krvKo = [...set];
    fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
    map.set(strong, d.krvKo);
  }

  console.log("[0'] after scan (gloss OR krvKo in verse)…");
  const after = scanCorpus(map);
  console.log(JSON.stringify({ totalContent: after.totalContent, missing: after.missing, pct: after.pct }));

  const samples = mattSamples(map);
  console.log("[3] matt samples", JSON.stringify(samples, null, 2));

  const report = {
    before: {
      totalContent: before.totalContent,
      missing: before.missing,
      pct: before.pct,
      top30: before.top30,
    },
    after: {
      totalContent: after.totalContent,
      missing: after.missing,
      pct: after.pct,
    },
    krvKoFilledStrongs: filled,
    krvKoUpdatedFiles: updated,
    sampleKrvKo: Object.fromEntries(Object.keys(SAMPLE_KRV).map((s) => [s, map.get(s)])),
    variantsAccepted: accepted,
    variantsAmbiguousExcluded: ambiguous,
    mattSamples: samples,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify({
    before: report.before,
    after: report.after,
    filled,
    sampleKrvKo: report.sampleKrvKo,
    variantsKeys: Object.keys(variants),
    mattSamples: samples.map((s) => ({
      ref: s.ref,
      word: s.word,
      glossKo: s.glossKo,
      krvKo: s.krvKo,
      glossInKrv: s.glossInKrv,
      krvKoInKrv: s.krvKoInKrv,
    })),
  }, null, 2));
}

main();
