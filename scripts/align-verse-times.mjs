// =============================================================================
// 유튜브 자막 타임스탬프 ↔ 개역한글 절 정렬 → public/watch-times/genesis.json
//
// 입력:
//   .cache/transcript/genesis.json  (또는 genesis.txt — 수동 붙여넣기)
//   public/bible-study/chunks/genesis/<ch>/korean.json
//   data/verse-times-fix/genesis.json (선택, {"1:14":121.3} 우선)
//
// 산출: public/watch-times/genesis.json  (숫자만, 자막 본문 미포함)
//
// 사용: node scripts/align-verse-times.mjs
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const VIDEO_ID = "YslfYAunGF4";
const TOTAL_CHAPTERS = 50;
const DURATION_SEC = 14690; // 4:04:50
const CACHE_JSON = path.join(repoRoot, ".cache", "transcript", "genesis.json");
const CACHE_TXT = path.join(repoRoot, ".cache", "transcript", "genesis.txt");
const OUT_PATH = path.join(repoRoot, "public", "watch-times", "genesis.json");
const FIX_PATH = path.join(repoRoot, "data", "verse-times-fix", "genesis.json");

function round1(n) {
  return Math.round(n * 10) / 10;
}

function normalize(text) {
  return String(text || "")
    .replace(/[\s\p{P}\p{S}]/gu, "")
    .toLowerCase();
}

function loadTranscript() {
  if (fs.existsSync(CACHE_JSON)) {
    const data = JSON.parse(fs.readFileSync(CACHE_JSON, "utf8"));
    if (!Array.isArray(data.events) || data.events.length === 0) {
      throw new Error("genesis.json 에 events 가 비어 있습니다");
    }
    return data.events.map((e) => ({
      start: Number(e.start),
      text: String(e.text || ""),
    }));
  }
  if (fs.existsSync(CACHE_TXT)) {
    return parsePastedTxt(fs.readFileSync(CACHE_TXT, "utf8"));
  }
  throw new Error(
    "자막 캐시 없음. .cache/transcript/genesis.json 또는 genesis.txt 가 필요합니다.",
  );
}

/** 유튜브 "스크립트 표시" 복사본: "0:10\\n텍스트" 또는 "0:10 텍스트" */
function parsePastedTxt(raw) {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const events = [];
  const timeRe = /^(?:(\d+):)?(\d+):(\d+)(?:\.\d+)?$/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(timeRe);
    if (m) {
      const start =
        m[1] != null ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[2] * 60 + +m[3];
      const text = (lines[i + 1] && !timeRe.test(lines[i + 1]) ? lines[++i] : "")
        .replace(/^\d+(초|분).*$/, "")
        .trim();
      if (text) events.push({ start, text });
      continue;
    }
    // "0:10 텍스트" 한 줄
    const m2 = lines[i].match(/^((?:\d+:)?\d+:\d+(?:\.\d+)?)\s+(.+)$/);
    if (m2) {
      const tm = m2[1].match(/^(?:(\d+):)?(\d+):(\d+)/);
      const start =
        tm[1] != null ? +tm[1] * 3600 + +tm[2] * 60 + +tm[3] : +tm[2] * 60 + +tm[3];
      events.push({ start, text: m2[2].trim() });
    }
  }
  if (!events.length) throw new Error("genesis.txt 파싱 실패");
  return events;
}

function extractChapterStarts(events) {
  /** @type {Map<number, number>} */
  const starts = new Map();
  for (const e of events) {
    // "창세기 N장" 또는 자막이 장 경계를 "46장 …"처럼만 말하는 경우
    const re = /(?:창세기\s*)?(\d{1,2})\s*장/g;
    let m;
    while ((m = re.exec(e.text))) {
      const n = Number(m[1]);
      if (n < 1 || n > TOTAL_CHAPTERS) continue;
      // "151장" 같은 오인식 방지 — 이미 잡은 장은 최초 시각 유지
      if (!starts.has(n)) starts.set(n, e.start);
    }
  }
  return starts;
}

function loadKoreanChapter(ch) {
  const p = path.join(
    repoRoot,
    "public",
    "bible-study",
    "chunks",
    "genesis",
    String(ch),
    "korean.json",
  );
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  return (data.verses?.krv || [])
    .slice()
    .sort((a, b) => a.n - b.n)
    .map((v) => ({ n: v.n, text: v.t || "", norm: normalize(v.t || "") }));
}

function loadFixes() {
  if (!fs.existsSync(FIX_PATH)) return {};
  return JSON.parse(fs.readFileSync(FIX_PATH, "utf8"));
}

/** 자막 이벤트 → 문자 스트림 + 각 문자 시각(이벤트 구간 선형 보간) */
function buildCharStream(events, fromSec, toSec) {
  const chars = [];
  const times = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const nextStart = i + 1 < events.length ? events[i + 1].start : toSec;
    const t0 = e.start;
    const t1 = Math.max(t0 + 0.01, nextStart);
    if (t1 < fromSec || t0 > toSec) continue;
    const norm = normalize(e.text);
    if (!norm) continue;
    for (let k = 0; k < norm.length; k++) {
      const t = t0 + ((k + 0.5) / norm.length) * (t1 - t0);
      if (t < fromSec || t >= toSec) continue;
      chars.push(norm[k]);
      times.push(t);
    }
  }
  return { chars: chars.join(""), times };
}

/**
 * 절 문자열들을 자막 문자열에 전역 정렬 (Needleman–Wunsch, 대각 우대).
 * 반환: 각 절의 첫 글자가 매핑된 자막 인덱스 (없으면 -1)
 */
function alignVerses(verseNorms, trChars) {
  const V = verseNorms.join("");
  const T = trChars;
  const n = V.length;
  const m = T.length;
  if (n === 0 || m === 0) return verseNorms.map(() => -1);

  // 절 경계: verseStarts[v] = V 내 시작 인덱스
  const verseStarts = [];
  let off = 0;
  for (const vn of verseNorms) {
    verseStarts.push(off);
    off += vn.length;
  }

  // 메모리: 두 행만 유지하되 경로 추적을 위해 방향 압축 저장
  // 0=diag, 1=up(delete V), 2=left(insert T)
  const INF = 1e9;
  let prev = new Float64Array(m + 1);
  let cur = new Float64Array(m + 1);
  const ptr = new Uint8Array((n + 1) * (m + 1));
  for (let j = 0; j <= m; j++) {
    prev[j] = j; // insert
    ptr[j] = 2;
  }
  ptr[0] = 0;

  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    ptr[i * (m + 1)] = 1;
    const vc = V.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      const match = vc === T.charCodeAt(j - 1) ? 0 : 1;
      const d = prev[j - 1] + match;
      const u = prev[j] + 1;
      const l = cur[j - 1] + 1;
      let best = d;
      let p = 0;
      if (u < best) {
        best = u;
        p = 1;
      }
      if (l < best) {
        best = l;
        p = 2;
      }
      cur[j] = best;
      ptr[i * (m + 1) + j] = p;
    }
    const tmp = prev;
    prev = cur;
    cur = tmp;
  }

  // traceback: V index i → T index j when consuming a V char via diag
  const mapVtoT = new Int32Array(n).fill(-1);
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const p = ptr[i * (m + 1) + j];
    if (i > 0 && j > 0 && p === 0) {
      mapVtoT[i - 1] = j - 1;
      i--;
      j--;
    } else if (i > 0 && (j === 0 || p === 1)) {
      i--;
    } else {
      j--;
    }
  }

  // 각 절 첫 글자 위치
  const verseTrIndex = verseStarts.map((vs, vi) => {
    if (!verseNorms[vi].length) return -1;
    // 절 앞쪽 몇 글자 중 매핑된 첫 인덱스
    for (let k = vs; k < vs + verseNorms[vi].length; k++) {
      if (mapVtoT[k] >= 0) return mapVtoT[k];
    }
    return -1;
  });
  return verseTrIndex;
}

function charCount(text) {
  return normalize(text).length;
}

function fillGaps(times, verses, chapterStart, chapterEnd) {
  const n = times.length;
  const out = times.slice();
  // 앞쪽 미매칭 → chapterStart 이후 비율 (제목 2초는 이미 chapter start에 반영하지 않음 —
  // 자막 정렬은 실제 낭독 시각이므로 제목 패드는 장 시작 마커 시각을 그대로 씀)
  let unmatched = 0;

  // 앵커: 매칭된 절 + 장 시작/끝
  const anchors = [{ v: 0, t: chapterStart }]; // 가상 0절 = 장 시작
  for (let i = 0; i < n; i++) {
    if (out[i] != null && Number.isFinite(out[i])) anchors.push({ v: i + 1, t: out[i] });
    else unmatched++;
  }
  anchors.push({ v: n + 1, t: chapterEnd });

  for (let a = 0; a < anchors.length - 1; a++) {
    const A = anchors[a];
    const B = anchors[a + 1];
    const from = A.v + 1; // 채울 절 (1-based)
    const to = B.v - 1;
    if (to < from) continue;
    // from..to 를 A.t ~ B.t 사이 글자 비율로
    let sum = 0;
    const lens = [];
    for (let v = from; v <= to; v++) {
      const len = Math.max(1, charCount(verses[v - 1].text));
      lens.push(len);
      sum += len;
    }
    // 구간은 "A 절 낭독 후 ~ B 절 시작" — A가 0이면 장시작부터
    // 간단히 from..to 전체를 [A.t, B.t)에 분배
    let cum = 0;
    for (let k = 0; k < lens.length; k++) {
      const v = from + k;
      out[v - 1] = A.t + (cum / sum) * (B.t - A.t);
      cum += lens[k];
    }
  }
  return { times: out, unmatched };
}

function applyFixes(times, verses, chapterNum, fixes, chapterStart, chapterEnd) {
  const anchors = [{ v: 1, t: times[0] ?? chapterStart }];
  for (const [ref, t] of Object.entries(fixes)) {
    const m = /^(\d+):(\d+)$/.exec(ref);
    if (!m || Number(m[1]) !== chapterNum) continue;
    const vn = Number(m[2]);
    if (vn < 1 || vn > verses.length) continue;
    const tv = Number(t);
    if (!Number.isFinite(tv)) continue;
    times[vn - 1] = tv;
    anchors.push({ v: vn, t: tv });
  }
  anchors.push({ v: verses.length + 1, t: chapterEnd });
  // 보정 앵커 사이 재분배 (이미 보정된 절은 고정)
  const fixed = new Set(
    Object.keys(fixes)
      .map((ref) => {
        const m = /^(\d+):(\d+)$/.exec(ref);
        return m && Number(m[1]) === chapterNum ? Number(m[2]) : null;
      })
      .filter(Boolean),
  );
  anchors.sort((a, b) => a.v - b.v);
  const uniq = [];
  for (const a of anchors) {
    if (uniq.length && uniq[uniq.length - 1].v === a.v) uniq[uniq.length - 1] = a;
    else uniq.push(a);
  }
  for (let i = 0; i < uniq.length - 1; i++) {
    const A = uniq[i];
    const B = uniq[i + 1];
    const from = A.v;
    const to = B.v - 1;
    if (to < from) continue;
    let sum = 0;
    for (let v = from; v <= to; v++) sum += Math.max(1, charCount(verses[v - 1].text));
    let cum = 0;
    for (let v = from; v <= to; v++) {
      if (v !== from && fixed.has(v)) {
        // skip overwrite of other fixed — shouldn't happen between
      }
      if (v === from || fixed.has(v)) {
        cum += Math.max(1, charCount(verses[v - 1].text));
        continue;
      }
      times[v - 1] = A.t + (cum / sum) * (B.t - A.t);
      cum += Math.max(1, charCount(verses[v - 1].text));
    }
    // ensure from kept
    times[from - 1] = A.t;
  }
  return times;
}

function main() {
  const events = loadTranscript();
  const chapterStarts = extractChapterStarts(events);
  const fixes = loadFixes();

  const startList = [];
  for (let ch = 1; ch <= TOTAL_CHAPTERS; ch++) {
    startList.push(chapterStarts.has(ch) ? chapterStarts.get(ch) : null);
  }

  console.log("=== 추출한 장 시작 (초) ===");
  for (let ch = 1; ch <= TOTAL_CHAPTERS; ch++) {
    const s = startList[ch - 1];
    console.log(`  ${ch}: ${s == null ? "null" : round1(s)}`);
  }

  const chapters = {};
  const missing = [];
  let unmatchedTotal = 0;

  for (let ch = 1; ch <= TOTAL_CHAPTERS; ch++) {
    const start = startList[ch - 1];
    if (start == null || !Number.isFinite(start)) {
      missing.push(ch);
      continue;
    }
    let end;
    if (ch === TOTAL_CHAPTERS) end = DURATION_SEC;
    else {
      const next = startList[ch];
      if (next == null || !Number.isFinite(next)) {
        missing.push(ch);
        continue;
      }
      end = next;
    }

    const verses = loadKoreanChapter(ch);
    const stream = buildCharStream(events, start, end);
    const verseNorms = verses.map((v) => v.norm);
    const trIndex = alignVerses(verseNorms, stream.chars);

    let times = verses.map((_, i) => {
      const idx = trIndex[i];
      if (idx < 0 || idx >= stream.times.length) return null;
      return stream.times[idx];
    });

    // 매칭 품질: 시각이 장 범위 밖이면 무효
    times = times.map((t) =>
      t != null && t >= start - 0.5 && t < end + 0.5 ? t : null,
    );

    const filled = fillGaps(times, verses, start, end);
    unmatchedTotal += filled.unmatched;
    let finalTimes = filled.times;
    finalTimes = applyFixes(finalTimes, verses, ch, fixes, start, end);

    // 단조 증가 보정
    for (let i = 1; i < finalTimes.length; i++) {
      if (finalTimes[i] < finalTimes[i - 1]) {
        finalTimes[i] = finalTimes[i - 1];
      }
    }

    chapters[String(ch)] = {
      start: round1(start),
      end: round1(end),
      verses: finalTimes.map(round1),
    };
  }

  const out = { videoId: VIDEO_ID, chapters, missing };
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  const json = JSON.stringify(out);
  fs.writeFileSync(OUT_PATH, json);

  console.log(`\nwrote ${OUT_PATH} (${Buffer.byteLength(json)} bytes)`);
  console.log(`built chapters: ${Object.keys(chapters).length}, missing: ${missing.length}`);
  console.log(`unmatched verses (pre-fill): ${unmatchedTotal}`);
  if (missing.length) console.log(`missing: ${missing.join(", ")}`);
}

main();
