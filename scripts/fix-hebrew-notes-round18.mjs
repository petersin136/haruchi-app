/**
 * 히브리어 18차:
 *  1) nameMeaning 한자어·의미왜곡 전수
 *  2) 문장형 끝맺음 「이름은 「X」라는 뜻이에요」
 *  3) 나라·민족 사실 오류 + 앗수르6 전후
 *  4) H3091·H1840·H1841
 *  5) 약한 신원 503 미터치
 *   node scripts/fix-hebrew-notes-round18.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadStrongMeta } from "./lib/hebrew-strong-meta.mjs";
import { syncHebrewLexiconEntry } from "./lib/hebrew-lexicon-sync.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const NOTES = path.join(root, "data/keyword-notes/hebrew.json");
const LEX = path.join(root, "public/word-study/lexicon/hebrew");
const OUT = path.join(root, "public/word-study");
const REPORT = path.join(OUT, "_hebrew-notes-round18-report.json");

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
function isSentenceMeaning(nm) {
  return /(?:다|시다|셨다|신다|이다)$/.test(String(nm || "").trim());
}
/** 명사형 / 문장형 끝맺음 */
function nameLine(nm) {
  if (!nm) return "이름 뜻은 확실하지 않아요.";
  if (isSentenceMeaning(nm)) return `이름은 「${nm}」라는 뜻이에요.`;
  return `이름 뜻은 「${nm}」${ieya(nm)}.`;
}
function parseParts(def) {
  const raw = String(def || "").replace(/\s+/g, " ").trim();
  const firstM = raw.match(/처음 나오는 곳:\s*([가-힣]+)\s*(\d+):(\d+)\.?/);
  const first = firstM ? `처음 나오는 곳: ${firstM[1]} ${firstM[2]}:${firstM[3]}.` : "";
  const firstRef = firstM ? `${firstM[1]} ${firstM[2]}:${firstM[3]}` : "";
  // support both templates
  const nmM =
    raw.match(/이름은\s*「([^」]+)」라는\s*뜻이에요/) ||
    raw.match(/이름 뜻은\s*「([^」]+)」([^.]*)\./);
  const nm = nmM ? nmM[1] : "";
  const soft = false;
  const extras = [];
  for (const re of [
    /창 32:28에서는[^.]+\./g,
    /[가-힣]+\s*\d+:\d+(?:에도|에는)[^.]*같은 사람인지 확실하지 않아요\.?/g,
    /동명이인\([^)]+\)은[^.]+어요\.?/g,
  ]) {
    for (const e of raw.match(re) || []) extras.push(e.replace(/\.+$/, ""));
  }
  let identity = raw
    .replace(/처음 나오는 곳:\s*[^.]+\./g, " ")
    .replace(/이름은\s*「[^」]+」라는\s*뜻이에요\.?/g, " ")
    .replace(/이름 뜻은\s*「[^」]+」[^.]*(?:\.|$)/g, " ")
    .replace(/이름 뜻은 확실하지 않아요\.?/g, " ")
    .replace(/창 32:28에서는[^.]+\./g, " ")
    .replace(/[가-힣]+\s*\d+:\d+(?:에도|에는)[^.]*같은 사람인지 확실하지 않아요\.?/g, " ")
    .replace(/동명이인\([^)]+\)은[^.]+어요\.?/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "");
  return { identity, first, firstRef, nm, soft, extras };
}
function rebuildDef({ identity, nm, first, extras = [] }) {
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

function proposeNameMeaningFix(nm, et) {
  const x = String(nm || "").trim();
  const e = String(et || "").toLowerCase().trim();
  // (a) 한자어·목적어 없는 사전식 동사
  if (/부여하셨다/.test(x))
    return { after: x.replace(/부여하셨다/, "주셨다"), kind: "a", reason: "부여←endowed" };
  if (/단장하셨다/.test(x))
    return { after: x.replace(/단장하셨다/, "꾸미셨다"), kind: "a", reason: "단장←adorned/decked" };
  if (/의롭게 하셨다/.test(x))
    return { after: x.replace(/의롭게 하셨다/, "의롭다 하셨다"), kind: "a", reason: "의롭게←righted" };

  // (b) 형용사→명사로 뜻이 달라진 것 (추상명사로 자연한 평화·행복·높음·신실함·향기 제외)
  const map = [
    [/^성벽$/, /walled/, "성벽에 둘린 곳"],
    [/^동맹$/, /allied/, "동맹을 맺은 이"],
    [/^언덕$/, /hilly/, "언덕진 곳"],
    [/^그늘$/, /shady/, "그늘진 곳"],
    [/^세움$/, /built/, "세워진 이"],
    [/^열림$/, /^open$/, "열린 곳"],
    [/^보호$/, /protected/, "보호받은 이"],
    [/^은혜$/, /favored/, "은혜 입은 이"],
    [/^바침$/, /devoted/, "바쳐진 이"],
    [/^상$/, /rewarded/, "상 받은 이"],
    [/^숨음$/, /hidden|occult/, "숨은 이"],
    [/^가파름$/, /abrupt/, "가파른 곳"],
    [/^황폐함$/, /desolate/, "황폐한 곳"],
    [/^맴$/, /fetter/, "얽매는 이"],
    [/^다스림$/, /regnant/, "다스리는 이"],
    [/^살핌$/, /observant/, "살피는 이"],
    [/^소망$/, /hopeful/, "소망 있는 이"],
    [/^돌 많음$/, /stony/, "돌이 많은 곳"],
    [/^흐름$/, /^flowing$|^a flowing$/, "흐르는 곳"],
    [/^성급함$/, /hasty/, "성급한 이"],
    [/^검음$/, /black/, "검은 이"],
    [/^젊음$/, /youthful/, "젊은 이"],
    [/^말 많음$/, /talkative|wordy/, "말 많은 이"],
    [/^목장 없음$/, /pastureless/, "목장 없는 곳"],
    [/^열매 많음$/, /fruitful/, "열매 많은 곳"],
    [/^벗음$/, /bald|to be bald/, "벗은 곳"],
    [/^강제$/, /forcible/, "강제하는 이"],
    [/^섬김$/, /serving/, "섬기는 이"],
    [/^낭비$/, /wasteful/, "낭비하는 이"],
    [/^다툼$/, /contentious/, "다투는 이"],
    [/^반역$/, /rebellious/, "반역하는 이"],
    [/^순종$/, /obedient/, "순종하는 이"],
    [/^형제다움$/, /brotherly/, "형제 같은 이"],
    [/^도움$/, /helpful/, "도움이 되는 이"],
    [/^밝음$/, /bright/, "밝은 이"],
    [/^빛남$/, /shining/, "빛나는 이"],
    [/^큼$/, /great/, "큰 이"],
    [/^작음$/, /small/, "작은 이"],
    [/^낮음$/, /low/, "낮은 이"],
    [/^좋음$/, /^good$/, "좋은 이"],
    [/^넓음$/, /ample/, "넓은 이"],
    [/^강함$/, /^strong$/, "강한 이"],
  ];
  for (const [reNm, reEt, after] of map) {
    if (reNm.test(x) && reEt.test(e)) return { after, kind: "b", reason: e };
  }
  return null;
}

function main() {
  const notes = JSON.parse(fs.readFileSync(NOTES, "utf8"));
  const meta = loadStrongMeta();

  const weakSet = new Set();
  for (const [id, v] of Object.entries(notes)) {
    if (v?.defKo && isWeakIdentity(parseParts(v.defKo).identity)) weakSet.add(id);
  }

  // ========== 1) nameMeaning type a/b ==========
  const nmCandidates = [];
  for (const [id, v] of Object.entries(notes)) {
    if (weakSet.has(id) || !v) continue;
    const nm = v.nameMeaning || parseParts(v.defKo || "").nm || "";
    if (!nm) continue;
    const et = meta.get(id)?.nameEtymEn || "";
    const prop = proposeNameMeaningFix(nm, et);
    if (prop && prop.after !== nm) {
      nmCandidates.push({ id, before: nm, after: prop.after, kind: prop.kind, reason: prop.reason });
    }
  }
  const nmBefore = nmCandidates.length;
  const nmChanges = [];
  for (const row of nmCandidates) {
    const v = notes[row.id];
    const p = parseParts(v.defKo || "");
    v.nameMeaning = row.after;
    v.defKo = rebuildDef({
      identity: p.identity,
      nm: row.after,
      first: p.first,
      extras: p.extras,
    });
    notes[row.id] = v;
    syncLex(row.id, v);
    nmChanges.push(row);
  }
  // recount remaining a/b
  let nmAfter = 0;
  const nmRemain = [];
  for (const [id, v] of Object.entries(notes)) {
    if (weakSet.has(id) || !v) continue;
    const nm = v.nameMeaning || parseParts(v.defKo || "").nm || "";
    const prop = proposeNameMeaningFix(nm, meta.get(id)?.nameEtymEn || "");
    if (prop && prop.after !== nm) {
      nmAfter += 1;
      nmRemain.push({ id, nm, would: prop.after });
    }
  }

  // ========== 2) sentence ending rule (all non-weak) ==========
  let endingBefore = 0;
  let endingFixed = 0;
  const endingSamples = [];
  for (const [id, v] of Object.entries(notes)) {
    if (weakSet.has(id) || !v?.defKo) continue;
    const nm = v.nameMeaning || parseParts(v.defKo).nm || "";
    if (!nm || !isSentenceMeaning(nm)) continue;
    const wrong = /이름 뜻은 「/.test(v.defKo);
    const right = /이름은 「[^」]+」라는 뜻이에요/.test(v.defKo);
    if (wrong || !right) endingBefore += 1;
  }
  for (const [id, v] of Object.entries(notes)) {
    if (weakSet.has(id) || !v?.defKo) continue;
    const p = parseParts(v.defKo);
    const nm = v.nameMeaning || p.nm || "";
    if (!nm) continue;
    // rebuild all that have nameMeaning to apply correct template (noun or sentence)
    const need =
      (isSentenceMeaning(nm) && !/이름은 「[^」]+」라는 뜻이에요/.test(v.defKo)) ||
      (isSentenceMeaning(nm) && /이름 뜻은 「/.test(v.defKo)) ||
      (!isSentenceMeaning(nm) && nm && /이름은 「[^」]+」라는 뜻이에요/.test(v.defKo));
    if (!need && !(isSentenceMeaning(nm) && /이름 뜻은 「/.test(v.defKo))) {
      // still rebuild sentence forms that use old template
      if (!(isSentenceMeaning(nm) && /이름 뜻은 「/.test(v.defKo))) continue;
    }
    if (!need && !isSentenceMeaning(nm)) continue;
    if (!isSentenceMeaning(nm) && /이름 뜻은 「/.test(v.defKo) && !/라는 뜻이에요/.test(v.defKo))
      continue; // noun already OK
    const beforeLine = (v.defKo.match(/(?:이름은|이름 뜻은)[^.]+\./) || [""])[0];
    v.defKo = rebuildDef({
      identity: p.identity,
      nm,
      first: p.first,
      extras: p.extras,
    });
    notes[id] = v;
    syncLex(id, v);
    if (isSentenceMeaning(nm)) {
      endingFixed += 1;
      if (endingSamples.length < 15)
        endingSamples.push({ id, before: beforeLine, after: (v.defKo.match(/(?:이름은|이름 뜻은)[^.]+\./) || [""])[0] });
    }
  }
  // force rebuild ALL sentence meanings to be safe
  endingFixed = 0;
  endingSamples.length = 0;
  for (const [id, v] of Object.entries(notes)) {
    if (weakSet.has(id) || !v?.defKo) continue;
    const p = parseParts(v.defKo);
    const nm = v.nameMeaning || p.nm || "";
    if (!nm || !isSentenceMeaning(nm)) continue;
    const beforeLine = (v.defKo.match(/(?:이름은|이름 뜻은)[^.]+\./) || [""])[0];
    const next = rebuildDef({ identity: p.identity, nm, first: p.first, extras: p.extras });
    if (next !== v.defKo || /이름 뜻은 「/.test(v.defKo)) {
      v.defKo = next;
      notes[id] = v;
      syncLex(id, v);
      endingFixed += 1;
      if (endingSamples.length < 15)
        endingSamples.push({
          id,
          before: beforeLine,
          after: (v.defKo.match(/(?:이름은|이름 뜻은)[^.]+\./) || [""])[0],
        });
    }
  }
  let endingAfterWrong = 0;
  let doubleTteut = 0;
  for (const [id, v] of Object.entries(notes)) {
    if (weakSet.has(id) || !v?.defKo) continue;
    const nm = v.nameMeaning || parseParts(v.defKo).nm || "";
    if (isSentenceMeaning(nm) && /이름 뜻은 「/.test(v.defKo)) endingAfterWrong += 1;
    // 「뜻」 twice in one sentence (period-delimited)
    for (const sent of v.defKo.split(/(?<=요\.|다\.)\s+/)) {
      const c = (sent.match(/뜻/g) || []).length;
      if (c >= 2) doubleTteut += 1;
    }
  }

  // ========== 3) nation errors ==========
  const ASSYRIA6 = [
    {
      id: "H5576",
      before: "산헤립은 아람(시리아) 왕이에요(왕하 18:13). 이름 뜻은 확실하지 않아요. 처음 나오는 곳: 왕하 18:13.",
      after: notes.H5576?.defKo,
    },
    {
      id: "H634",
      before: "에살핫돈은 아람(시리아) 왕이에요(왕하 19:37). 이름 뜻은 확실하지 않아요. 처음 나오는 곳: 왕하 19:37.",
      after: notes.H634?.defKo,
    },
    {
      id: "H6322",
      before: "풀은 아람(시리아) 왕이에요(왕하 15:19). 이름 뜻은 확실하지 않아요. 처음 나오는 곳: 왕하 15:19.",
      after: notes.H6322?.defKo,
    },
    {
      id: "H8022",
      before: "살만에셀은 아람(시리아) 왕이에요(왕하 17:3). 이름 뜻은 확실하지 않아요. 처음 나오는 곳: 왕하 17:3.",
      after: notes.H8022?.defKo,
    },
    {
      id: "H5623",
      before: "사렉곤은 아람(시리아) 왕이에요(사 20:1). 이름 뜻은 확실하지 않아요. 처음 나오는 곳: 사 20:1.",
      after: notes.H5623?.defKo,
    },
    {
      id: "H620",
      before: "읏납파르는 아람(시리아) 왕이에요(스 4:10). 이름 뜻은 확실하지 않아요. 처음 나오는 곳: 스 4:10.",
      after: notes.H620?.defKo,
    },
  ];

  // scan remaining factual nation errors (skip weak)
  const nationFixes = [];
  for (const [id, v] of Object.entries(notes)) {
    if (weakSet.has(id) || !v?.defKo) continue;
    const d = v.defKo;
    const en = `${meta.get(id)?.meaning || ""} ${meta.get(id)?.def || ""}`.toLowerCase();
    let identity = parseParts(d).identity;
    let next = identity;
    let reason = "";

    if (/assyrian king|king of assyria|an assyrian/.test(en)) {
      if (/아람\(시리아\)/.test(identity)) {
        next = identity.replace(/아람\(시리아\)/g, "앗수르(아시리아)");
        reason = "앗수르 왕을 아람으로 오표기";
      } else if (/왕이에요/.test(identity) && !/앗수르|바벨론|애굽|모압|블레셋|아람|바사|메대/.test(identity)) {
        // bare role without nation — if clearly army etc. still try
        if (/군대 장관/.test(identity) && /evil-merodak|babylonian/.test(en)) {
          /* handled below */
        }
      }
    }
    if (/babylonian king/.test(en)) {
      if (/유다의 왕|이스라엘의 왕|아람|앗수르|애굽/.test(identity) && !/바벨론|갈대아/.test(identity)) {
        // replace wrong kingdom if present
        next = identity
          .replace(/유다의 왕/g, "바벨론 왕")
          .replace(/이스라엘의 왕/g, "바벨론 왕")
          .replace(/아람\(시리아\) 왕/g, "바벨론 왕");
        if (next === identity && /군대 장관/.test(identity)) {
          next = identity.replace(/군대 장관이에요/, "바벨론 왕이에요");
        }
        if (next === identity && /의 아들이에요/.test(identity) && !/바벨론/.test(identity)) {
          next = identity.replace(/이에요/, "이며 바벨론 왕이에요");
        }
        if (next === identity && /나오는 인물/.test(identity)) {
          next = identity.replace(/에 나오는 인물이에요/, "은 바벨론 왕이에요").replace(/는 바벨론/, "는 바벨론");
        }
        reason = "바벨론 왕 오표기/누락";
      } else if (!/바벨론|갈대아/.test(identity) && /군대 장관이에요/.test(identity)) {
        next = identity.replace(/군대 장관이에요/, "바벨론 왕이에요");
        reason = "바벨론 왕을 군대 장관으로 오표기";
      } else if (!/바벨론|갈대아/.test(identity) && /의 아들이에요/.test(identity)) {
        next = `${identity.replace(/이에요$/, "")}이며 바벨론 왕이에요`;
        reason = "바벨론 왕 누락";
      }
    }
    if (/egyptian king|an egyptian king/.test(en)) {
      if (/유다의 왕|이스라엘의 왕/.test(identity) && !/애굽|바로/.test(identity)) {
        next = identity.replace(/유다의 왕/g, "애굽 왕").replace(/이스라엘의 왕/g, "애굽 왕");
        reason = "애굽 왕을 유다/이스라엘 왕으로 오표기";
      }
    }
    if (/moabitish king|king of moab/.test(en) && /지명이에요/.test(identity) && !/모압/.test(identity)) {
      next = identity.replace(/지명이에요/, "모압 왕이기도 하고 지명이기도 해요");
      reason = "모압 왕 신분 누락";
    }

    if (next !== identity) {
      nationFixes.push({ id, before: identity, after: next, reason, en: en.slice(0, 60) });
    }
  }

  const nationBefore = ASSYRIA6.length + nationFixes.length; // 6 already fixed + remaining found now
  // Apply remaining nation fixes
  const nationApplied = [];
  for (const row of nationFixes) {
    if (weakSet.has(row.id)) continue;
    const v = notes[row.id];
    const p = parseParts(v.defKo || "");
    v.defKo = rebuildDef({
      identity: row.after,
      nm: v.nameMeaning || p.nm,
      first: p.first,
      extras: p.extras,
    });
    notes[row.id] = v;
    syncLex(row.id, v);
    nationApplied.push(row);
  }
  // recount nation errors after
  let nationAfter = 0;
  const nationRemain = [];
  for (const [id, v] of Object.entries(notes)) {
    if (weakSet.has(id) || !v?.defKo) continue;
    const d = v.defKo;
    const en = `${meta.get(id)?.meaning || ""} ${meta.get(id)?.def || ""}`.toLowerCase();
    if (/assyrian/.test(en) && /아람\(시리아\)/.test(d) && !/앗수르/.test(d)) {
      nationAfter += 1;
      nationRemain.push({ id, d: d.slice(0, 80) });
    }
    if (/babylonian king/.test(en) && !/바벨론|갈대아/.test(d) && /왕이에요|군대 장관/.test(d)) {
      nationAfter += 1;
      nationRemain.push({ id, d: d.slice(0, 80) });
    }
    if (/egyptian king/.test(en) && /유다의 왕|이스라엘의 왕/.test(d) && !/애굽|바로/.test(d)) {
      nationAfter += 1;
      nationRemain.push({ id, d: d.slice(0, 80) });
    }
  }

  // ========== 4) H3091 / H1840 / H1841 ==========
  const snap = {
    H3091: notes.H3091?.defKo,
    H1840: notes.H1840?.defKo,
    H1841: notes.H1841?.defKo,
  };

  if (!weakSet.has("H3091") && notes.H3091) {
    notes.H3091.nameMeaning = notes.H3091.nameMeaning || "여호와께서 구원하셨다";
    notes.H3091.defKo = rebuildDef({
      identity:
        "같은 이름이 여럿 나와요: 눈의 아들·가나안 정복 지도자(출 17:9; 수 1장), 여호사닥의 아들 대제사장(학 1:1; 스·느에서는 예수아(H3442)), 벧세메스 사람(삼상 6:14), 예루살렘 성읍 방백(왕하 23:8)",
      nm: notes.H3091.nameMeaning,
      first: "처음 나오는 곳: 출 17:9.",
    });
    syncLex("H3091", notes.H3091);
  }
  if (!weakSet.has("H1840") && notes.H1840) {
    notes.H1840.nameMeaning = "하나님은 나의 재판장이시다";
    notes.H1840.defKo = rebuildDef({
      identity:
        "같은 이름이 여럿 나와요: 선지자 다니엘(단 1:6; 다니엘서), 다윗의 아들(대상 3:1), 이다말 자손(스 8:2), 겔 14:14에 노아·욥과 나란히 꼽힌 다니엘",
      nm: "하나님은 나의 재판장이시다",
      first: "처음 나오는 곳: 단 1:6.",
    });
    syncLex("H1840", notes.H1840);
  }
  if (!weakSet.has("H1841") && notes.H1841) {
    notes.H1841.nameMeaning = "하나님은 나의 재판장이시다";
    notes.H1841.etymKo =
      "H1841은 H1840 「하나님은 나의 재판장이시다」와 같은 뜻의 아람어 표기예요.";
    notes.H1841.defKo = rebuildDef({
      identity:
        "다니엘서 아람어 구간에 나오는 선지자 다니엘이에요(단 2:13). 히브리어 부분의 H1840과 같은 인물이에요",
      nm: "하나님은 나의 재판장이시다",
      first: "처음 나오는 곳: 단 2:13.",
      extras: [
        "동명이인(대상 3:1·스 8:2·겔 14:14)은 히브리어 항목 H1840에 모아 두었어요",
      ],
    });
    syncLex("H1841", notes.H1841);
  }

  fs.writeFileSync(NOTES, JSON.stringify(notes, null, 2) + "\n");

  let weakNow = 0;
  for (const [id, v] of Object.entries(notes)) {
    if (v?.defKo && isWeakIdentity(parseParts(v.defKo).identity)) weakNow += 1;
  }

  const sampleIds = [
    "H3075",
    "H5718",
    "H2574",
    "H4918",
    "H3091",
    "H1840",
    "H1841",
    "H8123",
    "H5576",
    "H192",
  ];

  const report = {
    round: 18,
    weakProtected: { before: weakSet.size, after: weakNow, untouched: weakNow === weakSet.size },
    "1_nameMeaningCalqueDrift": {
      before: nmBefore,
      fixed: nmChanges.length,
      after: nmAfter,
      byKind: {
        a: nmChanges.filter((x) => x.kind === "a").length,
        b: nmChanges.filter((x) => x.kind === "b").length,
      },
      list: nmChanges,
      remain: nmRemain,
    },
    "2_sentenceEnding": {
      rule: "명사형: 이름 뜻은 「X」예요/이에요 · 문장형: 이름은 「X」라는 뜻이에요",
      beforeWrongTemplate: endingBefore,
      fixed: endingFixed,
      afterWrongTemplate: endingAfterWrong,
      doubleTteutInOneSentence: doubleTteut,
      samples: endingSamples,
    },
    "3_nationErrors": {
      assyria6: ASSYRIA6,
      additionalFixed: nationApplied,
      before: nationBefore,
      after: nationAfter,
      remain: nationRemain,
    },
    "4_specific": {
      H3091: { before: snap.H3091, after: notes.H3091?.defKo },
      H1840: { before: snap.H1840, after: notes.H1840?.defKo },
      H1841: { before: snap.H1841, after: notes.H1841?.defKo },
    },
    fulltexts: Object.fromEntries(
      sampleIds.map((id) => [
        id,
        { defKo: notes[id]?.defKo, etymKo: notes[id]?.etymKo, nameMeaning: notes[id]?.nameMeaning },
      ]),
    ),
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");

  console.log(
    JSON.stringify(
      {
        weak: report.weakProtected,
        nm: { before: nmBefore, fixed: nmChanges.length, after: nmAfter, a: report["1_nameMeaningCalqueDrift"].byKind.a, b: report["1_nameMeaningCalqueDrift"].byKind.b },
        ending: { before: endingBefore, fixed: endingFixed, afterWrong: endingAfterWrong, doubleTteut },
        nation: { before: nationBefore, after: nationAfter, additional: nationApplied.map((x) => x.id), assyria6: ASSYRIA6.map((x) => x.id) },
        samples: sampleIds.map((id) => ({ id, def: notes[id]?.defKo, nm: notes[id]?.nameMeaning })),
      },
      null,
      2,
    ),
  );
}

main();
