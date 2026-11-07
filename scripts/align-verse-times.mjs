// =============================================================================
// 유튜브 자막 타임스탬프 ↔ 개역한글 절 정렬 → public/watch-times/<bookId>.json
//
// 입력:
//   .cache/transcript/<bookId>-json3.json (있으면 우선 — 유튜브 asr json3, 단어별 tOffsetMs)
//   .cache/transcript/<bookId>.json  (또는 .txt — 수동 붙여넣기)
//   public/bible-study/chunks/<bookId>/<ch>/korean.json
//   data/verse-times-fix/<bookId>.json (선택, {"1:14":121.3} 최우선)
//
// 산출: public/watch-times/<bookId>.json  (숫자만, 자막 본문 미포함)
//   chapters[장].src[i] — 절 시각 근거:
//     "word"   자막 단어 시작 시각(절 첫 어절이 자막 단어 시작과 맞음)
//     "seg"    자막 덩어리 안 비율 위치(덩어리 경계와 어긋나거나 첫 어절 오인식)
//     "interp" 매칭 실패 — 앞뒤 기준점 사이 글자 수 비율 추정
//     "fix"    data/verse-times-fix 수동 보정
//
// 사용:
//   node scripts/align-verse-times.mjs genesis
//   node scripts/align-verse-times.mjs exodus
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

/** @type {Record<string, { videoId: string, totalChapters: number, durationSec: number, chapterLabelRe: RegExp }>} */
const BOOK_CONFIG = {
  genesis: {
    videoId: "YslfYAunGF4",
    bookName: "창세기",
    totalChapters: 50,
    durationSec: 14690,
    // "창세기 N장" 또는 자막이 "46장 …"처럼만 말하는 경우
    chapterLabelRe: /(?:창세기\s*)?(\d{1,2})\s*장/g,
  },
  exodus: {
    videoId: "qN0W1g2wpmk",
    bookName: "출애굽기",
    totalChapters: 40,
    durationSec: 11591,
    chapterLabelRe: /(?:출애굽기\s*)?(\d{1,2})\s*장/g,
  },
};

/** 절 글자 중 자막과 일치한 비율이 이보다 낮으면 매칭 실패로 보고 보간 */
const MIN_MATCH_RATIO = Number(process.env.MIN_MATCH_RATIO ?? 0.2);

function round1(n) {
  return Math.round(n * 10) / 10;
}

function normalize(text) {
  return String(text || "")
    .replace(/[\s\p{P}\p{S}]/gu, "")
    .toLowerCase();
}

function resolveBookId(argv) {
  const arg = argv.find((a) => !a.startsWith("-"));
  if (!arg) {
    console.error(
      "사용법: node scripts/align-verse-times.mjs <bookId>\n" +
        `지원: ${Object.keys(BOOK_CONFIG).join(", ")}`,
    );
    process.exit(1);
  }
  if (!BOOK_CONFIG[arg]) {
    console.error(`알 수 없는 bookId: ${arg}\n지원: ${Object.keys(BOOK_CONFIG).join(", ")}`);
    process.exit(1);
  }
  return arg;
}

function loadTranscript(bookId) {
  const cacheJson = path.join(repoRoot, ".cache", "transcript", `${bookId}.json`);
  const cacheTxt = path.join(repoRoot, ".cache", "transcript", `${bookId}.txt`);
  if (fs.existsSync(cacheJson)) {
    const data = JSON.parse(fs.readFileSync(cacheJson, "utf8"));
    if (!Array.isArray(data.events) || data.events.length === 0) {
      throw new Error(`${bookId}.json 에 events 가 비어 있습니다`);
    }
    return data.events.map((e) => ({
      start: Number(e.start),
      text: String(e.text || ""),
    }));
  }
  if (fs.existsSync(cacheTxt)) {
    return parsePastedTxt(fs.readFileSync(cacheTxt, "utf8"), bookId);
  }
  throw new Error(
    `자막 캐시 없음. .cache/transcript/${bookId}.json 또는 ${bookId}.txt 가 필요합니다.`,
  );
}

/** 유튜브 "스크립트 표시" 복사본: "0:10\\n텍스트" 또는 "0:10 텍스트" */
function parsePastedTxt(raw, bookId) {
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
    const m2 = lines[i].match(/^((?:\d+:)?\d+:\d+(?:\.\d+)?)\s+(.+)$/);
    if (m2) {
      const tm = m2[1].match(/^(?:(\d+):)?(\d+):(\d+)/);
      const start =
        tm[1] != null ? +tm[1] * 3600 + +tm[2] * 60 + +tm[3] : +tm[2] * 60 + +tm[3];
      events.push({ start, text: m2[2].trim() });
    }
  }
  if (!events.length) throw new Error(`${bookId}.txt 파싱 실패`);
  return events;
}

function extractChapterStarts(events, totalChapters, chapterLabelRe) {
  /** @type {Map<number, number>} */
  const starts = new Map();
  for (const e of events) {
    const re = new RegExp(chapterLabelRe.source, chapterLabelRe.flags);
    let m;
    while ((m = re.exec(e.text))) {
      const n = Number(m[1]);
      if (n < 1 || n > totalChapters) continue;
      if (!starts.has(n)) starts.set(n, e.start);
    }
  }
  return starts;
}

function loadKoreanChapter(bookId, ch) {
  const p = path.join(
    repoRoot,
    "public",
    "bible-study",
    "chunks",
    bookId,
    String(ch),
    "korean.json",
  );
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  return (data.verses?.krv || [])
    .slice()
    .sort((a, b) => a.n - b.n)
    .map((v) => ({ n: v.n, text: v.t || "", norm: normalize(v.t || "") }));
}

/**
 * data/verse-times-fix/<bookId>.json — { "장:절": 초 } 평면 객체.
 * /watch 개발 도구 「보정값 복사」(verseFixJson) 결과를 그대로 붙여 넣는 형식.
 *   { "1:14": 121.3, "3:1": 542.3 }
 */
function loadFixes(bookId) {
  const fixPath = path.join(repoRoot, "data", "verse-times-fix", `${bookId}.json`);
  if (!fs.existsSync(fixPath)) return {};
  const raw = JSON.parse(fs.readFileSync(fixPath, "utf8"));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${fixPath}: { "1:14": 121.3 } 형식의 객체여야 합니다`);
  }
  const out = {};
  for (const [ref, t] of Object.entries(raw)) {
    const tv = typeof t === "number" ? t : Number.NaN;
    if (!/^\d+:\d+$/.test(ref) || !Number.isFinite(tv) || tv < 0) {
      console.warn(`[fix] 무시: ${JSON.stringify(ref)}: ${JSON.stringify(t)} — "장:절": 초(숫자)만 허용`);
      continue;
    }
    out[ref] = tv;
  }
  if (Object.keys(out).length) console.log(`[fix] ${fixPath} — ${Object.keys(out).length}개 적용`);
  return out;
}

/**
 * json3(asr) → 자막 조각(seg) 목록. 조각마다 고유 시작 시각이 있다.
 * 대부분 한 어절, 일부는 "씨 가진"처럼 두 어절.
 */
function loadJson3Segs(bookId) {
  const p = path.join(repoRoot, ".cache", "transcript", `${bookId}-json3.json`);
  if (!fs.existsSync(p)) return null;
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  const segs = [];
  for (const ev of data.events || []) {
    if (!Array.isArray(ev.segs)) continue;
    const base = Number(ev.tStartMs) || 0;
    for (const s of ev.segs) {
      const text = String(s.utf8 || "");
      const norm = normalize(text);
      if (!norm) continue;
      segs.push({ t: (base + (Number(s.tOffsetMs) || 0)) / 1000, text, norm });
    }
  }
  segs.sort((a, b) => a.t - b.t);
  return segs;
}

/** 장 안내("창세기 N장" / "N장") 첫 단어 시각 */
function extractChapterStartsFromSegs(segs, totalChapters, bookName) {
  /** @type {Map<number, number>} */
  const starts = new Map();
  let last = -1;
  for (let i = 0; i < segs.length; i++) {
    const m = /^(\d{1,2})장/.exec(segs[i].norm) || /^.*?(\d{1,2})장$/.exec(segs[i].norm);
    if (!m) continue;
    const n = Number(m[1]);
    if (n < 1 || n > totalChapters || starts.has(n)) continue;
    if (n !== last + 1 && !(last === -1 && n === 1)) continue;
    const prev = segs[i - 1];
    const t = prev && prev.norm.endsWith(bookName) && segs[i].t - prev.t < 3 ? prev.t : segs[i].t;
    starts.set(n, t);
    last = n;
  }
  return starts;
}

/** 조각 → 문자 스트림. 문자마다 조각 번호·조각 내 위치·비율 시각 */
function buildSegCharStream(segs, fromSec, toSec) {
  let chars = "";
  const segOf = [];
  const offOf = [];
  const times = [];
  const segStart = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.t < fromSec || s.t >= toSec) continue;
    const next = i + 1 < segs.length ? Math.min(segs[i + 1].t, toSec) : toSec;
    const dur = Math.max(0.01, next - s.t);
    segStart.push(chars.length);
    for (let k = 0; k < s.norm.length; k++) {
      chars += s.norm[k];
      segOf.push(i);
      offOf.push(k);
      times.push(s.t + (k / s.norm.length) * dur);
    }
  }
  return { chars, segOf, offOf, times, segStart };
}

function levenshtein(a, b) {
  const m = b.length;
  let prev = new Array(m + 1);
  let cur = new Array(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= m; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    [prev, cur] = [cur, prev];
  }
  return prev[m];
}

/** 자막 c번째 글자부터가 절 앞부분 P와 얼마나 같은가 (0~1, 길이 ±3 허용) */
function prefixSim(P, chars, c) {
  let best = Infinity;
  for (let L = Math.max(1, P.length - 3); L <= P.length + 3; L++) {
    if (c + L > chars.length) break;
    best = Math.min(best, levenshtein(P, chars.slice(c, c + L)));
  }
  return best === Infinity ? 0 : 1 - best / P.length;
}

const PREFIX_CHARS = 12;
const PREFIX_MIN_SIM = 0.6;
const PREFIX_MOVE_GAIN = 0.2;
const PREFIX_RESCUE_SIM = 0.75;

/**
 * 첫 어절 반복 오매칭 보정: 절 앞 12글자(≈첫 3~4어절)로 앞뒤 절 사이의
 * 자막 단어 시작점을 다시 훑어, 훨씬 잘 맞는 곳이 있으면 그 단어 시각으로 옮긴다.
 * 매칭 실패(interp) 절도 앞부분이 뚜렷이 맞으면 단어 시각으로 살린다.
 */
function verifyPrefixes(verses, segs, stream, times, src, start, end, ch, log) {
  const n = verses.length;
  let prevT = start - 0.5;
  for (let i = 0; i < n; i++) {
    const P = verses[i].norm.slice(0, PREFIX_CHARS);
    // 후보는 절 첫 어절로 시작하는 자막 단어만 (낭독이 첫머리에 말을 덧붙여도
    // 첫 어절을 건너뛴 뒤쪽 위치로 끌려가지 않도록)
    const fw = normalize(String(verses[i].text || "").trim().split(/\s+/)[0] || "");
    const fwOk = (c) => fw.length > 0 && prefixSim(fw, stream.chars, c) >= (fw.length <= 2 ? 1 : 0.5);
    let upper = end;
    for (let k = i + 1; k < n; k++) {
      if (times[k] != null) { upper = times[k]; break; }
    }
    if (P.length >= 4 && upper > prevT) {
      let best = { sim: -1, c: -1 };
      let cur = -1;
      for (const c of stream.segStart) {
        const t = segs[stream.segOf[c]].t;
        if (t < prevT || t >= upper) continue;
        const sim = prefixSim(P, stream.chars, c);
        if (times[i] != null && Math.abs(t - times[i]) < 0.05) cur = sim;
        if (!fwOk(c)) continue;
        if (sim > best.sim) best = { sim, c };
      }
      if (times[i] != null && cur < 0) {
        // seg 절: 현재 시각에 가장 가까운 글자 기준
        let near = 0;
        for (let c = 0; c < stream.times.length; c++) {
          if (Math.abs(stream.times[c] - times[i]) < Math.abs(stream.times[near] - times[i])) near = c;
        }
        cur = prefixSim(P, stream.chars, near);
      }
      const bestT = best.c >= 0 ? segs[stream.segOf[best.c]].t : null;
      const movable = times[i] != null && best.sim >= PREFIX_MIN_SIM && best.sim - cur >= PREFIX_MOVE_GAIN;
      const rescuable = times[i] == null && best.sim >= PREFIX_RESCUE_SIM;
      if ((movable || rescuable) && Math.abs(bestT - (times[i] ?? -1)) >= 0.05) {
        log.push({ ref: `${ch}:${i + 1}`, from: times[i], fromSrc: src[i] || "interp", to: bestT, simFrom: cur, simTo: best.sim });
        times[i] = bestT;
        src[i] = "word";
      }
    }
    if (times[i] != null) prevT = times[i];
  }
}

/** 문자 단위 정렬 결과(verse 문자 → 자막 문자) 전체를 돌려주는 NW */
function alignCharsFull(V, T) {
  const n = V.length;
  const m = T.length;
  const mapVtoT = new Int32Array(n).fill(-1);
  if (!n || !m) return mapVtoT;
  let prev = new Float64Array(m + 1);
  let cur = new Float64Array(m + 1);
  const ptr = new Uint8Array((n + 1) * (m + 1));
  for (let j = 0; j <= m; j++) {
    prev[j] = j;
    ptr[j] = 2;
  }
  ptr[0] = 0;
  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    ptr[i * (m + 1)] = 1;
    const vc = V.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      const d = prev[j - 1] + (vc === T.charCodeAt(j - 1) ? 0 : 1);
      const u = prev[j] + 1;
      const l = cur[j - 1] + 1;
      let best = d;
      let p = 0;
      if (u < best) { best = u; p = 1; }
      if (l < best) { best = l; p = 2; }
      cur[j] = best;
      ptr[i * (m + 1) + j] = p;
    }
    const tmp = prev;
    prev = cur;
    cur = tmp;
  }
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const p = ptr[i * (m + 1) + j];
    if (i > 0 && j > 0 && p === 0) {
      if (V.charCodeAt(i - 1) === T.charCodeAt(j - 1)) mapVtoT[i - 1] = j - 1;
      i--;
      j--;
    } else if (i > 0 && (j === 0 || p === 1)) i--;
    else j--;
  }
  return mapVtoT;
}

/**
 * 절 시작 = 절 첫 어절의 자막 단어 시각.
 * 반환: { times: (number|null)[], src: ("word"|"seg"|null)[] }
 */
function alignVersesToSegs(verses, segs, stream, secPerChar) {
  const norms = verses.map((v) => v.norm);
  const firstWordLen = verses.map((v) => {
    const first = String(v.text || "").trim().split(/\s+/).map(normalize).find(Boolean) || "";
    return Math.max(1, first.length);
  });
  const offsets = [];
  let off = 0;
  for (const vn of norms) {
    offsets.push(off);
    off += vn.length;
  }
  const map = alignCharsFull(norms.join(""), stream.chars);
  const times = [];
  const src = [];
  const ratio = [];
  for (let vi = 0; vi < verses.length; vi++) {
    const len = norms[vi].length;
    let hit = 0;
    for (let k = 0; k < len; k++) if (map[offsets[vi] + k] >= 0) hit++;
    ratio.push(len ? hit / len : 0);
    // 자막이 빠진 구간에 몇 글자만 우연히 맞은 절은 기준점으로 쓰지 않음
    if (!len || hit / len < MIN_MATCH_RATIO) { times.push(null); src.push(null); continue; }
    let d = -1;
    for (let k = 0; k < len; k++) {
      if (map[offsets[vi] + k] >= 0) { d = k; break; }
    }
    if (d < 0) { times.push(null); src.push(null); continue; }
    const j = map[offsets[vi] + d];
    const shift = stream.offOf[j] - d; // 절 첫 글자가 조각 시작에서 얼마나 떨어졌나
    if (d < firstWordLen[vi] && Math.abs(shift) <= 1) {
      times.push(segs[stream.segOf[j]].t);
      src.push("word");
      continue;
    }
    // 첫 어절이 자막에 없으면(자막 공백·오인식) 첫 일치 글자에서 평균 낭독 속도로 거슬러 추정
    times.push(stream.times[j] - d * secPerChar);
    src.push("seg");
  }
  return { times, src, ratio };
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

  const verseStarts = [];
  let off = 0;
  for (const vn of verseNorms) {
    verseStarts.push(off);
    off += vn.length;
  }

  let prev = new Float64Array(m + 1);
  let cur = new Float64Array(m + 1);
  const ptr = new Uint8Array((n + 1) * (m + 1));
  for (let j = 0; j <= m; j++) {
    prev[j] = j;
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

  return verseStarts.map((vs, vi) => {
    if (!verseNorms[vi].length) return -1;
    for (let k = vs; k < vs + verseNorms[vi].length; k++) {
      if (mapVtoT[k] >= 0) return mapVtoT[k];
    }
    return -1;
  });
}

function charCount(text) {
  return normalize(text).length;
}

function fillGaps(times, verses, chapterStart, chapterEnd) {
  const n = times.length;
  const out = times.slice();
  let unmatched = 0;

  const anchors = [{ v: 0, t: chapterStart }];
  for (let i = 0; i < n; i++) {
    if (out[i] != null && Number.isFinite(out[i])) anchors.push({ v: i + 1, t: out[i] });
    else unmatched++;
  }
  anchors.push({ v: n + 1, t: chapterEnd });

  for (let a = 0; a < anchors.length - 1; a++) {
    const A = anchors[a];
    const B = anchors[a + 1];
    const from = A.v + 1;
    const to = B.v - 1;
    if (to < from) continue;
    // 기준 절(A) 자신의 낭독 길이도 가중치에 넣어야 첫 미매칭 절이 A와 같은 시각이 되지 않음
    const lenA = A.v >= 1 ? Math.max(1, charCount(verses[A.v - 1].text)) : 0;
    let sum = lenA;
    const lens = [];
    for (let v = from; v <= to; v++) {
      const len = Math.max(1, charCount(verses[v - 1].text));
      lens.push(len);
      sum += len;
    }
    let cum = lenA;
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
      if (v === from || fixed.has(v)) {
        cum += Math.max(1, charCount(verses[v - 1].text));
        continue;
      }
      times[v - 1] = A.t + (cum / sum) * (B.t - A.t);
      cum += Math.max(1, charCount(verses[v - 1].text));
    }
    times[from - 1] = A.t;
  }
  return times;
}

function main() {
  const bookId = resolveBookId(process.argv.slice(2));
  const cfg = BOOK_CONFIG[bookId];
  const { videoId, totalChapters, durationSec, chapterLabelRe, bookName } = cfg;

  const events = loadTranscript(bookId);
  const segs = loadJson3Segs(bookId);
  const chapterStarts = extractChapterStarts(events, totalChapters, chapterLabelRe);
  if (segs) {
    // json3 단어 시각으로 장 시작을 정밀화(없는 장은 기존 값 유지)
    const precise = extractChapterStartsFromSegs(segs, totalChapters, bookName);
    for (const [ch, t] of precise) {
      const old = chapterStarts.get(ch);
      if (old == null || Math.abs(old - t) < 15) chapterStarts.set(ch, t);
    }
    console.log(`[${bookId}] json3 단어 모드 (조각 ${segs.length}개)`);
  }
  const fixes = loadFixes(bookId);
  const srcCount = { word: 0, seg: 0, interp: 0, fix: 0 };
  /** @type {{ref:string, from:number|null, fromSrc:string, to:number, simFrom:number, simTo:number}[]} */
  const prefixLog = [];

  const startList = [];
  for (let ch = 1; ch <= totalChapters; ch++) {
    startList.push(chapterStarts.has(ch) ? chapterStarts.get(ch) : null);
  }

  console.log(`=== [${bookId}] 추출한 장 시작 (초) ===`);
  for (let ch = 1; ch <= totalChapters; ch++) {
    const s = startList[ch - 1];
    console.log(`  ${ch}: ${s == null ? "null" : round1(s)}`);
  }

  const chapters = {};
  const missing = [];
  let unmatchedTotal = 0;

  for (let ch = 1; ch <= totalChapters; ch++) {
    const start = startList[ch - 1];
    if (start == null || !Number.isFinite(start)) {
      missing.push(ch);
      continue;
    }
    let end;
    if (ch === totalChapters) end = durationSec;
    else {
      const next = startList[ch];
      if (next == null || !Number.isFinite(next)) {
        missing.push(ch);
        continue;
      }
      end = next;
    }

    const verses = loadKoreanChapter(bookId, ch);
    let times;
    let src;
    if (segs) {
      const stream = buildSegCharStream(segs, start, end);
      const totalChars = verses.reduce((n, v) => n + v.norm.length, 0) || 1;
      const secPerChar = (end - start) / totalChars;
      let ratio;
      ({ times, src, ratio } = alignVersesToSegs(verses, segs, stream, secPerChar));
      if (process.env.DEBUG_RATIO) {
        for (let i = 0; i < ratio.length; i++) console.log(`ratio ${ch}:${i + 1} ${ratio[i].toFixed(2)} ${src[i] || "-"}`);
      }
      // 범위 밖·역순 매칭은 버리고 보간에 맡김
      let lastT = start - 0.5;
      for (let i = 0; i < times.length; i++) {
        const t = times[i];
        if (t == null) continue;
        if (t < lastT || t < start - 0.5 || t >= end + 0.5) {
          times[i] = null;
          src[i] = null;
        } else lastT = t;
      }
      verifyPrefixes(verses, segs, stream, times, src, start, end, ch, prefixLog);
    } else {
      const stream = buildCharStream(events, start, end);
      const trIndex = alignVerses(verses.map((v) => v.norm), stream.chars);
      times = verses.map((_, i) => {
        const idx = trIndex[i];
        if (idx < 0 || idx >= stream.times.length) return null;
        const t = stream.times[idx];
        return t >= start - 0.5 && t < end + 0.5 ? t : null;
      });
      src = times.map((t) => (t == null ? null : "seg"));
    }

    const filled = fillGaps(times, verses, start, end);
    unmatchedTotal += filled.unmatched;
    let finalTimes = filled.times;
    src = src.map((s) => s || "interp");

    if (segs) {
      // 수동 보정: 해당 절만 덮어씀(나머지 단어 시각은 유지)
      for (const [ref, t] of Object.entries(fixes)) {
        const m = /^(\d+):(\d+)$/.exec(ref);
        if (!m || Number(m[1]) !== ch) continue;
        const vn = Number(m[2]);
        const tv = Number(t);
        if (vn < 1 || vn > verses.length || !Number.isFinite(tv)) continue;
        finalTimes[vn - 1] = tv;
        src[vn - 1] = "fix";
      }
    } else {
      finalTimes = applyFixes(finalTimes, verses, ch, fixes, start, end);
      for (const ref of Object.keys(fixes)) {
        const m = /^(\d+):(\d+)$/.exec(ref);
        if (m && Number(m[1]) === ch && Number(m[2]) <= verses.length) src[Number(m[2]) - 1] = "fix";
      }
    }

    for (let i = 1; i < finalTimes.length; i++) {
      if (finalTimes[i] < finalTimes[i - 1] && src[i] !== "fix") {
        finalTimes[i] = finalTimes[i - 1];
      }
    }
    for (const s of src) srcCount[s] += 1;

    chapters[String(ch)] = {
      start: round1(start),
      end: round1(end),
      verses: finalTimes.map(round1),
      src,
    };
  }

  const outPath = path.join(repoRoot, "public", "watch-times", `${bookId}.json`);
  const out = { videoId, chapters, missing };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const json = JSON.stringify(out);
  fs.writeFileSync(outPath, json);

  console.log(`\nwrote ${outPath} (${Buffer.byteLength(json)} bytes)`);
  console.log(`built chapters: ${Object.keys(chapters).length}, missing: ${missing.length}`);
  console.log(`unmatched verses (pre-fill): ${unmatchedTotal}`);
  console.log(`src: ${JSON.stringify(srcCount)}`);
  console.log(`앞 ${PREFIX_CHARS}글자 검증으로 옮긴 절: ${prefixLog.length}`);
  for (const r of prefixLog) {
    console.log(
      `  ${r.ref} ${r.from == null ? "-" : round1(r.from)}(${r.fromSrc}, ${r.simFrom.toFixed(2)}) → ${round1(r.to)}(${r.simTo.toFixed(2)})`,
    );
  }
  if (missing.length) console.log(`missing: ${missing.join(", ")}`);
}

main();
