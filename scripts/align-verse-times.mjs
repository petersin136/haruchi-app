// =============================================================================
// 유튜브 자막 타임스탬프 ↔ 개역한글 절 정렬 → public/watch-times/<bookId>.json
//
// 입력:
//   .cache/transcript/<bookId>.json  (또는 .txt — 수동 붙여넣기)
//   public/bible-study/chunks/<bookId>/<ch>/korean.json
//   data/verse-times-fix/<bookId>.json (선택, {"1:14":121.3} 우선)
//
// 산출: public/watch-times/<bookId>.json  (숫자만, 자막 본문 미포함)
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
    totalChapters: 50,
    durationSec: 14690,
    // "창세기 N장" 또는 자막이 "46장 …"처럼만 말하는 경우
    chapterLabelRe: /(?:창세기\s*)?(\d{1,2})\s*장/g,
  },
  exodus: {
    videoId: "qN0W1g2wpmk",
    totalChapters: 40,
    durationSec: 11591,
    chapterLabelRe: /(?:출애굽기\s*)?(\d{1,2})\s*장/g,
  },
};

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

function loadFixes(bookId) {
  const fixPath = path.join(repoRoot, "data", "verse-times-fix", `${bookId}.json`);
  if (!fs.existsSync(fixPath)) return {};
  return JSON.parse(fs.readFileSync(fixPath, "utf8"));
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
    let sum = 0;
    const lens = [];
    for (let v = from; v <= to; v++) {
      const len = Math.max(1, charCount(verses[v - 1].text));
      lens.push(len);
      sum += len;
    }
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
  const { videoId, totalChapters, durationSec, chapterLabelRe } = cfg;

  const events = loadTranscript(bookId);
  const chapterStarts = extractChapterStarts(events, totalChapters, chapterLabelRe);
  const fixes = loadFixes(bookId);

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
    const stream = buildCharStream(events, start, end);
    const verseNorms = verses.map((v) => v.norm);
    const trIndex = alignVerses(verseNorms, stream.chars);

    let times = verses.map((_, i) => {
      const idx = trIndex[i];
      if (idx < 0 || idx >= stream.times.length) return null;
      return stream.times[idx];
    });

    times = times.map((t) =>
      t != null && t >= start - 0.5 && t < end + 0.5 ? t : null,
    );

    const filled = fillGaps(times, verses, start, end);
    unmatchedTotal += filled.unmatched;
    let finalTimes = filled.times;
    finalTimes = applyFixes(finalTimes, verses, ch, fixes, start, end);

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

  const outPath = path.join(repoRoot, "public", "watch-times", `${bookId}.json`);
  const out = { videoId, chapters, missing };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const json = JSON.stringify(out);
  fs.writeFileSync(outPath, json);

  console.log(`\nwrote ${outPath} (${Buffer.byteLength(json)} bytes)`);
  console.log(`built chapters: ${Object.keys(chapters).length}, missing: ${missing.length}`);
  console.log(`unmatched verses (pre-fill): ${unmatchedTotal}`);
  if (missing.length) console.log(`missing: ${missing.join(", ")}`);
}

main();
