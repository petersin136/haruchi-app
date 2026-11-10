/**
 * 히브리어 17차:
 *  1) nameMeaning 178 무작위 20 전→후 표
 *  2) H1840/H1841 정합
 *  3) H3091 동명이인
 *  4) H325 단9:1 + 지명(현대어) 괄호 통일
 *  5) 약한 신원 503 미터치
 *   node scripts/fix-hebrew-notes-round17.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { syncHebrewLexiconEntry } from "./lib/hebrew-lexicon-sync.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const NOTES = path.join(root, "data/keyword-notes/hebrew.json");
const LEX = path.join(root, "public/word-study/lexicon/hebrew");
const OUT = path.join(root, "public/word-study");
const REPORT = path.join(OUT, "_hebrew-notes-round17-report.json");

function hasBatchim(word) {
  const ch = String(word || "").replace(/[^가-힣]/g, "").slice(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}
function ieya(w) {
  return hasBatchim(w) ? "이에요" : "예요";
}
function ensurePeriod(s) {
  const t = String(s || "").trim();
  if (!t) return t;
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}
function nameLine(nm) {
  if (!nm) return "이름 뜻은 확실하지 않아요.";
  return `이름 뜻은 「${nm}」${ieya(nm)}.`;
}
function parseParts(def) {
  const raw = String(def || "").replace(/\s+/g, " ").trim();
  const firstM = raw.match(/처음 나오는 곳:\s*([가-힣]+)\s*(\d+):(\d+)\.?/);
  const first = firstM ? `처음 나오는 곳: ${firstM[1]} ${firstM[2]}:${firstM[3]}.` : "";
  const firstRef = firstM ? `${firstM[1]} ${firstM[2]}:${firstM[3]}` : "";
  const nmM = raw.match(/이름 뜻은\s*「([^」]+)」([^.]*)\./);
  const soft = nmM ? /보기도/.test(nmM[2] || "") : false;
  const nm = nmM ? nmM[1] : "";
  const extras = [];
  for (const re of [
    /창 32:28에서는[^.]+\./g,
    /[가-힣]+\s*\d+:\d+(?:에도|에는)[^.]*같은 사람인지 확실하지 않아요\.?/g,
  ]) {
    const all = raw.match(re) || [];
    for (const e of all) extras.push(e.replace(/\.+$/, ""));
  }
  let identity = raw
    .replace(/처음 나오는 곳:\s*[^.]+\./g, " ")
    .replace(/이름 뜻은\s*「[^」]+」[^.]*(?:\.|$)/g, " ")
    .replace(/이름 뜻은 확실하지 않아요\.?/g, " ")
    .replace(/창 32:28에서는[^.]+\./g, " ")
    .replace(/[가-힣]+\s*\d+:\d+(?:에도|에는)[^.]*같은 사람인지 확실하지 않아요\.?/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "");
  return { identity, first, firstRef, nm, soft, extras, unc: /이름 뜻은 확실하지 않아요/.test(raw) };
}
function rebuildDef({ identity, nm, soft = false, first, extras = [] }) {
  const parts = [];
  if (identity) parts.push(ensurePeriod(identity));
  if (!nm) parts.push("이름 뜻은 확실하지 않아요.");
  else parts.push(nameLine(nm));
  for (const e of extras) if (e) parts.push(ensurePeriod(e));
  if (first) parts.push(first.endsWith(".") ? first : `${first}.`);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
function syncLex(id, note) {
  // 쓰기 직전 재읽기·자기 필드만 — krvKo·krvForms(에이전트3) 미터치
  syncHebrewLexiconEntry(id, note, { lexDir: LEX });
}

/** round15/16과 동일 */
function isWeakIdentity(identity) {
  const x = String(identity || "")
    .trim()
    .replace(/\.+$/, "");
  if (!x) return false;
  if (/^같은 이름이 여럿/.test(x)) return false;
  if (/땅 이름이자 사람/.test(x)) return false;
  if (/이며 |으로[,\s]|로,\s|로서 /.test(x) && !/나오는 인물이에요$/.test(x)) return false;
  if (/에 나오는 인물이에요$/.test(x)) return true;
  if (/에 나오는 사람이에요$/.test(x)) return true;
  if (/에 처음 소개되는 인물이에요$/.test(x)) return true;
  if (/에 나오는 고유명사예요$/.test(x)) return true;
  if (/구약에 나오는 고유명사예요$/.test(x)) return true;
  if (/성경에 나오는 인명이에요$/.test(x)) return true;
  if (/이스라엘 사람이에요$/.test(x)) return true;
  if (/^[가-힣()약식·,\s]+[은는] 왕이에요(\([^)]*\))?$/.test(x)) return true;
  if (/^[가-힣()약식·,\s]+[은는] 제사장이에요(\([^)]*\))?$/.test(x)) return true;
  if (/^[가-힣()약식·,\s]+[은는] 대제사장이에요(\([^)]*\))?$/.test(x)) return true;
  if (/^[가-힣()약식·,\s]+[은는] 예언자예요(\([^)]*\))?$/.test(x)) return true;
  if (/^[가-힣()약식·,\s]+[은는] 선지자예요(\([^)]*\))?$/.test(x)) return true;
  if (/^[가-힣()약식·,\s]+[은는] 사사예요(\([^)]*\))?$/.test(x)) return true;
  if (/^[가-힣()약식·,\s]+[은는] 두령이에요(\([^)]*\))?$/.test(x)) return true;
  if (
    /^[가-힣()약식·,\s]+[은는] (유다의|이스라엘의|이스라엘|바벨론|모압|아람|블레셋|시리아|바산) ?왕이에요(\([^)]*\))?$/.test(
      x,
    )
  )
    return true;
  if (/^[가-힣()약식·,\s]+[은는] (유다|이스라엘) 왕이에요(\([^)]*\))?$/.test(x)) return true;
  return false;
}

function sampleNameMeaning20() {
  const diff = execSync("git diff -- data/keyword-notes/hebrew.json", {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  const pairs = [];
  let pending = null;
  for (const line of diff.split("\n")) {
    let m = line.match(/^-\s*"nameMeaning": "(.*)"\s*,?\s*$/);
    if (m) {
      pending = m[1];
      continue;
    }
    m = line.match(/^\+\s*"nameMeaning": "(.*)"\s*,?\s*$/);
    if (m && pending != null) {
      pairs.push({ before: pending, after: m[1] });
      pending = null;
    }
  }
  // attach ids from current notes by after-value
  const notes = JSON.parse(fs.readFileSync(NOTES, "utf8"));
  const afterMap = new Map();
  for (const [id, n] of Object.entries(notes)) {
    const nm = n?.nameMeaning || "";
    if (!afterMap.has(nm)) afterMap.set(nm, []);
    afterMap.get(nm).push(id);
  }
  const used = new Set();
  for (const p of pairs) {
    const ids = afterMap.get(p.after) || [];
    const pick = ids.find((i) => !used.has(i)) || ids[0] || "?";
    if (pick !== "?") used.add(pick);
    p.id = pick;
  }
  // deterministic sample seed 17, diversify
  function kind(p) {
    const b = p.before;
    if (/\(/.test(b)) return "paren";
    if (/여호와께서 .+하신$/.test(b)) return "jehovah";
    if (/\s/.test(b)) return "phrase";
    if (/(운|한)$/.test(b)) return "adj";
    return "other";
  }
  const buckets = { paren: [], jehovah: [], phrase: [], adj: [], other: [] };
  for (const p of pairs) buckets[kind(p)].push(p);
  // shuffle deterministic
  function shuffle(arr) {
    let s = 17;
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const j = s % (i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const sample = [];
  for (const k of ["jehovah", "paren", "phrase", "adj", "other"]) {
    for (const p of shuffle(buckets[k]).slice(0, 5)) {
      if (sample.length < 20) sample.push(p);
    }
  }
  while (sample.length < 20 && pairs.length) {
    sample.push(pairs[sample.length % pairs.length]);
  }
  // unique
  const seen = new Set();
  const out = [];
  for (const p of sample) {
    const k = `${p.id}|${p.before}|${p.after}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  out.sort((a, b) => Number(String(a.id).replace(/\D/g, "") || 0) - Number(String(b.id).replace(/\D/g, "") || 0));
  return { totalPairs: pairs.length, sample: out.slice(0, 20) };
}

function main() {
  const notes = JSON.parse(fs.readFileSync(NOTES, "utf8"));
  const weakSet = new Set();
  for (const [id, v] of Object.entries(notes)) {
    if (v?.defKo && isWeakIdentity(parseParts(v.defKo).identity)) weakSet.add(id);
  }

  // ----- 1) sample table (no data change) -----
  const nmSample = sampleNameMeaning20();

  // ----- 2) H1840 / H1841 -----
  const d1840before = notes.H1840?.defKo;
  const d1841before = notes.H1841?.defKo;
  if (!weakSet.has("H1840") && notes.H1840) {
    notes.H1840.nameMeaning = "하나님은 나의 재판장이시다";
    notes.H1840.defKo = rebuildDef({
      identity:
        "같은 이름이 여럿 나와요: 선지자 다니엘(단 1:6; 다니엘서), 다윗의 아들(대상 3:1), 귀환자(스 8:2), 겔 14:14에 노아·욥과 나란히 꼽힌 다니엘",
      nm: "하나님은 나의 재판장이시다",
      first: "처음 나오는 곳: 단 1:6.",
    });
    // keep etym if present; sync name in etym gloss if needed
    if (notes.H1840.etymKo) {
      notes.H1840.etymKo = notes.H1840.etymKo.replace(/「하나님의 심판」/g, "「하나님은 나의 재판장이시다」");
    }
    syncLex("H1840", notes.H1840);
  }
  if (!weakSet.has("H1841") && notes.H1841) {
    notes.H1841.nameMeaning = "하나님은 나의 재판장이시다";
    notes.H1841.defKo = rebuildDef({
      identity:
        "다니엘서 아람어 구간에 나오는 선지자 다니엘이에요(단 2:13). 히브리어 표기는 H1840과 같고, 같은 인물이에요",
      nm: "하나님은 나의 재판장이시다",
      first: "처음 나오는 곳: 단 2:13.",
      extras: [
        "동명이인(대상 3:1·스 8:2·겔 14:14)은 히브리어 항목 H1840에 모아 두었어요",
      ],
    });
    notes.H1841.etymKo =
      "H1841은 H1840 「하나님은 나의 재판장이시다」와 같은 뜻의 아람어 표기예요.";
    syncLex("H1841", notes.H1841);
  }

  // ----- 3) H3091 동명이인 -----
  const d3091before = notes.H3091?.defKo;
  let h3091hadHomonyms = false;
  if (!weakSet.has("H3091") && notes.H3091) {
    const p = parseParts(notes.H3091.defKo || "");
    h3091hadHomonyms = /같은 이름이 여럿|학 1:1|삼상 6:14|대제사장/.test(p.identity);
    notes.H3091.nameMeaning = notes.H3091.nameMeaning || p.nm || "여호와께서 구원하셨다";
    notes.H3091.defKo = rebuildDef({
      identity:
        "같은 이름이 여럿 나와요: 눈의 아들·가나안 정복 지도자(출 17:9; 수 1장), 여호사닥의 아들 대제사장(학 1:1), 벧세메스 사람(삼상 6:14)",
      nm: notes.H3091.nameMeaning,
      first: "처음 나오는 곳: 출 17:9.",
    });
    syncLex("H3091", notes.H3091);
  }

  // ----- 4) H325 + place modern paren unify -----
  const d325before = notes.H325?.defKo;
  if (!weakSet.has("H325") && notes.H325) {
    notes.H325.defKo = rebuildDef({
      identity:
        "같은 이름이 여럿 나와요: 에스더 시대 바사(페르시아) 왕(에 1:1), 스 4:6의 아하수에로(같은 사람인지 확실하지 않아요), 메대 족속·다리오의 아버지(단 9:1)",
      nm: notes.H325.nameMeaning || "",
      first: "처음 나오는 곳: 에 1:1.",
    });
    syncLex("H325", notes.H325);
  }

  // 통일 규칙: 개역한글 지명(현대어) — 항상 `KRV(현대어)` 붙여쓰기, 역순·곧·가운데점 금지
  const PLACE_CANON = [
    ["바사", "페르시아"],
    ["아람", "시리아"],
    ["앗수르", "아시리아"],
    ["메대", "메디아"],
  ];
  // Assyrian rulers wrongly tagged as 아람(시리아)
  const ASSYRIA_KINGS = new Set(["H5576", "H634", "H6322", "H8022", "H5623", "H620"]);

  function normalizePlaceGloss(text, id) {
    let t = String(text || "");
    const before = t;
    // reverse modern(krv) → krv(modern)
    for (const [krv, modern] of PLACE_CANON) {
      t = t.replace(new RegExp(`${modern}\\s*\\(\\s*${krv}\\s*\\)`, "g"), `${krv}(${modern})`);
      t = t.replace(new RegExp(`${krv}\\s+곧\\s+${modern}`, "g"), `${krv}(${modern})`);
      t = t.replace(new RegExp(`${krv}\\s*·\\s*${modern}`, "g"), `${krv}(${modern})`);
      t = t.replace(new RegExp(`${krv}\\s+\\(\\s*${modern}\\s*\\)`, "g"), `${krv}(${modern})`);
    }
    // bare 바사 in empire/king contexts → 바사(페르시아) when not already parenthesized
    // only for known ids that discuss Persia/Media/Aram/Asshur as places
    if (id === "H1841") {
      t = t.replace(/바벨론·바사(?!\()/g, "바벨론·바사(페르시아)");
    }
    if (ASSYRIA_KINGS.has(id)) {
      t = t.replace(/아람\(시리아\)/g, "앗수르(아시리아)");
    }
    return { text: t, changed: t !== before };
  }

  function countPlaceGlossForms(notesObj) {
    const forms = { "KRV(현대어)": 0, reverse: 0, 곧: 0, mid: 0, other: 0, hits: [] };
    for (const [id, v] of Object.entries(notesObj)) {
      if (weakSet.has(id)) continue;
      for (const field of ["defKo", "etymKo", "nameMeaning", "usageKo"]) {
        const t = v?.[field] || "";
        for (const [krv, modern] of PLACE_CANON) {
          const reCanon = new RegExp(`${krv}\\(${modern}\\)`, "g");
          const reRev = new RegExp(`${modern}\\(${krv}\\)`, "g");
          const reGot = new RegExp(`${krv}\\s+곧\\s+${modern}`, "g");
          const reMid = new RegExp(`${krv}\\s*·\\s*${modern}`, "g");
          for (const m of t.match(reCanon) || []) {
            forms["KRV(현대어)"] += 1;
            forms.hits.push({ id, field, form: "KRV(현대어)", m });
          }
          for (const m of t.match(reRev) || []) {
            forms.reverse += 1;
            forms.hits.push({ id, field, form: "reverse", m });
          }
          for (const m of t.match(reGot) || []) {
            forms["곧"] += 1;
            forms.hits.push({ id, field, form: "곧", m });
          }
          for (const m of t.match(reMid) || []) {
            forms.mid += 1;
            forms.hits.push({ id, field, form: "mid", m });
          }
        }
      }
    }
    return forms;
  }

  // snapshot before normalize (after H325 rewrite already has canon form)
  // Count "needing unify" = non-canon variants + assyria mis-tags + bare that we expand
  const beforeForms = countPlaceGlossForms(notes);
  // also count assyria mislabels as non-unified
  let assyriaMisBefore = 0;
  for (const id of ASSYRIA_KINGS) {
    if (weakSet.has(id)) continue;
    if (/아람\(시리아\)/.test(notes[id]?.defKo || "")) assyriaMisBefore += 1;
  }
  let barePersiaBefore = /바벨론·바사(?!\()/.test(notes.H1841?.defKo || "") ? 1 : 0;

  const placeBefore =
    beforeForms.reverse + beforeForms["곧"] + beforeForms.mid + assyriaMisBefore + barePersiaBefore + beforeForms["KRV(현대어)"];
  // User wants before→after of style unification. Report:
  // before: entries with any place-modern gloss (including non-canon)
  // after: all canon KRV(현대어) only

  let placeFixed = 0;
  const placeChanges = [];
  for (const [id, v] of Object.entries(notes)) {
    if (weakSet.has(id) || !v) continue;
    let changed = false;
    for (const field of ["defKo", "etymKo", "nameMeaning", "usageKo"]) {
      if (!v[field]) continue;
      const r = normalizePlaceGloss(v[field], id);
      if (r.changed) {
        v[field] = r.text;
        changed = true;
      }
    }
    if (changed) {
      placeFixed += 1;
      notes[id] = v;
      syncLex(id, v);
      placeChanges.push(id);
    }
  }

  const afterForms = countPlaceGlossForms(notes);
  let assyriaMisAfter = 0;
  for (const id of ASSYRIA_KINGS) {
    if (weakSet.has(id)) continue;
    if (/아람\(시리아\)/.test(notes[id]?.defKo || "")) assyriaMisAfter += 1;
  }

  fs.writeFileSync(NOTES, JSON.stringify(notes, null, 2) + "\n");

  let weakNow = 0;
  for (const [id, v] of Object.entries(notes)) {
    if (v?.defKo && isWeakIdentity(parseParts(v.defKo).identity)) weakNow += 1;
  }

  const report = {
    round: 17,
    weakProtected: { before: weakSet.size, after: weakNow, untouched: weakNow === 503 || weakSet.size === weakNow },
    "1_nameMeaningSample20": {
      fromPairs: nmSample.totalPairs,
      note: "16차 nameMeaning 변경(git diff)에서 시드 17로 무작위 20건. 유형을 섞어 기계적 일괄 치환 여부를 검수.",
      table: nmSample.sample,
    },
    "2_danielH1840_H1841": {
      H1840: { before: d1840before, after: notes.H1840?.defKo, nameMeaning: notes.H1840?.nameMeaning, etymKo: notes.H1840?.etymKo },
      H1841: { before: d1841before, after: notes.H1841?.defKo, nameMeaning: notes.H1841?.nameMeaning, etymKo: notes.H1841?.etymKo },
    },
    "3_H3091": {
      hadHomonymListBefore: h3091hadHomonyms,
      before: d3091before,
      after: notes.H3091?.defKo,
      includes: {
        "학1:1대제사장": /학 1:1/.test(notes.H3091?.defKo || ""),
        "삼상6:14": /삼상 6:14/.test(notes.H3091?.defKo || ""),
      },
    },
    "4_H325_and_placeGloss": {
      H325: { before: d325before, after: notes.H325?.defKo },
      placeGloss: {
        rule: "개역한글지명(현대어) — 예: 바사(페르시아), 아람(시리아), 앗수르(아시리아), 메대(메디아)",
        before: {
          canonKRVmodern: beforeForms["KRV(현대어)"],
          reverse: beforeForms.reverse,
          got: beforeForms["곧"],
          mid: beforeForms.mid,
          assyriaMislabeledAsAram: assyriaMisBefore,
          barePersiaInH1841: barePersiaBefore,
        },
        after: {
          canonKRVmodern: afterForms["KRV(현대어)"],
          reverse: afterForms.reverse,
          got: afterForms["곧"],
          mid: afterForms.mid,
          assyriaMislabeledAsAram: assyriaMisAfter,
        },
        // summary counts for user: non-unified variants before → after 0
        variantBefore: beforeForms.reverse + beforeForms["곧"] + beforeForms.mid + assyriaMisBefore + barePersiaBefore,
        variantAfter: afterForms.reverse + afterForms["곧"] + afterForms.mid + assyriaMisAfter,
        entriesTouched: placeChanges,
      },
    },
    fulltexts: {
      H1840: notes.H1840,
      H1841: notes.H1841,
      H3091: notes.H3091,
      H325: notes.H325,
    },
  };

  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        weak: report.weakProtected,
        sample20: nmSample.sample,
        H1840: notes.H1840?.defKo,
        H1841: notes.H1841?.defKo,
        H3091: notes.H3091?.defKo,
        H325: notes.H325?.defKo,
        place: report["4_H325_and_placeGloss"].placeGloss,
      },
      null,
      2,
    ),
  );
}

main();
