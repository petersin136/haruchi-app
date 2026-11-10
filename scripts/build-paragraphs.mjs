#!/usr/bin/env node
/**
 * 장별 단락 시작 절
 *   WEB USFM \p/\b + BSB \s1(항상) + BSB \p(12절 초과 단락 안에서만)
 *
 * 원본(WEB만): .cache/paragraphs-raw/
 * 출처: .cache/paragraphs-sources/  (s|p|b|q1|bsb_s|bsb_p)
 *
 * 사용: node scripts/build-paragraphs.mjs --all
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadBsbBook, BOOK_TO_BSB } from "./lib-bsb-usfm.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const USFM_DIR = path.join(repoRoot, ".cache", "web-usfm");
const USFM_ZIP_URL = "https://ebible.org/Scriptures/eng-web_usfm.zip";
const BOOKS_TS = path.join(repoRoot, "app", "bible-reading", "books.ts");
const BIBLE_DATA = path.join(repoRoot, "public", "bible-data");
const FIX_DIR = path.join(repoRoot, "data", "paragraph-fix");
const RAW_DIR = path.join(repoRoot, ".cache", "paragraphs-raw");
const OUT_DIR = path.join(repoRoot, "public", "paragraphs");
const SRC_DIR = path.join(repoRoot, ".cache", "paragraphs-sources");
const REPORT_PATH = path.join(repoRoot, ".cache", "paragraphs-refine-report.json");

const POETRY = new Set([
  "job",
  "psalms",
  "proverbs",
  "ecclesiastes",
  "songofsolomon",
  "lamentations",
]);
const SKIP_REFINE = new Set(["lamentations"]);

const USFM_CODE = { ...BOOK_TO_BSB };

function loadBooks() {
  const src = fs.readFileSync(BOOKS_TS, "utf8");
  const re = /(\w+):\s*\{\s*id:\s*"(\w+)",[^}]*?totalChapters:\s*(\d+)/g;
  /** @type {Map<string, number>} */
  const out = new Map();
  let m;
  while ((m = re.exec(src)) !== null) out.set(m[2], Number(m[3]));
  return out;
}

function ensureUsfm() {
  const has =
    fs.existsSync(USFM_DIR) &&
    fs.readdirSync(USFM_DIR).some((f) => f.endsWith(".usfm"));
  if (has) {
    console.log(`[usfm] reuse ${USFM_DIR}`);
    return;
  }
  fs.mkdirSync(USFM_DIR, { recursive: true });
  const zip = path.join(USFM_DIR, "eng-web_usfm.zip");
  if (!fs.existsSync(zip)) {
    execFileSync("curl", ["-sSL", "-o", zip, USFM_ZIP_URL], { stdio: "inherit" });
  }
  execFileSync("unzip", ["-o", "-q", zip, "-d", USFM_DIR], { stdio: "inherit" });
}

function findUsfmFile(code) {
  for (const f of fs.readdirSync(USFM_DIR)) {
    if (!f.endsWith(".usfm")) continue;
    const head = fs.readFileSync(path.join(USFM_DIR, f), "utf8").slice(0, 240);
    if (new RegExp(`^\\\\id\\s+${code}\\b`, "m").test(head)) {
      return path.join(USFM_DIR, f);
    }
  }
  return null;
}

function hasText(s) {
  const t = s
    .replace(/\\f\s[\s\S]*?\\f\*/g, "")
    .replace(/\\x\s[\s\S]*?\\x\*/g, "")
    .replace(/\\w\s([^|\\]*)(\|[^\\]*)?\\w\*/g, "$1")
    .replace(/\\[a-z0-9]+\*?/gi, "")
    .trim();
  return /[A-Za-z]/.test(t);
}

function normalizeReason(raw) {
  if (raw === "b") return "b";
  if (raw === "d") return "d";
  if (raw === "m" || raw === "pc" || /^pi\d*$/.test(raw)) return raw === "m" ? "m" : raw === "pc" ? "pc" : "pi";
  if (raw === "p") return "p";
  if (/^s\d*$/.test(raw)) return "s";
  return raw;
}

/** @returns {'s'|'p'|'b'|'q1'|null} */
function primaryReason(reasons) {
  if (!reasons || !reasons.size) return null;
  if (reasons.has("s") || reasons.has("d")) return "s";
  if (reasons.has("b")) return "b";
  if (reasons.has("q1")) return "q1";
  if (reasons.has("p") || reasons.has("pc") || reasons.has("m") || reasons.has("pi"))
    return "p";
  return null;
}

function parseUsfm(text, poetry) {
  const paraMarker = poetry
    ? String.raw`(b|s\d*|d)`
    : String.raw`(p|m|pi\d*|pc|s\d*)`;
  const tokenRe = new RegExp(
    String.raw`\\(c|v)\s+(\d+)(?:-\d+)?|\\(${paraMarker}|p|m|pi\d*|pc|b)(?=[\s\\]|$)`,
    "g",
  );
  /** @type {Map<number, { starts: Map<number, Set<string>>, maxVerse: number, splitAt: Map<number, Set<string>> }>} */
  const chapters = new Map();
  let ch = 0;
  let verse = 0;
  /** @type {Set<string>} */
  let pendingReasons = new Set();
  /** @type {Set<string>} */
  let pendingSplit = new Set();
  /** @type {{ m: RegExpExecArray, end: number }[]} */
  const tokens = [];
  let m;
  while ((m = tokenRe.exec(text)) !== null) tokens.push({ m, end: tokenRe.lastIndex });

  for (let i = 0; i < tokens.length; i++) {
    const { m: t, end } = tokens[i];
    if (t[1] === "c") {
      ch = Number(t[2]);
      verse = 0;
      pendingReasons = new Set();
      pendingSplit = new Set();
      chapters.set(ch, { starts: new Map(), maxVerse: 0, splitAt: new Map() });
      continue;
    }
    if (!ch) continue;
    const row = chapters.get(ch);
    if (t[1] === "v") {
      verse = Number(t[2]);
      row.maxVerse = Math.max(row.maxVerse, verse);
      if (pendingReasons.size) {
        const prev = row.starts.get(verse) ?? new Set();
        for (const r of pendingReasons) prev.add(r);
        row.starts.set(verse, prev);
        pendingReasons = new Set();
      }
      if (pendingSplit.size) {
        const prev = row.splitAt.get(verse) ?? new Set();
        for (const r of pendingSplit) prev.add(r);
        row.splitAt.set(verse, prev);
        pendingSplit = new Set();
      }
      continue;
    }
    const raw = t[3];
    const nextIndex = tokens[i + 1]?.m.index ?? text.length;
    const mid = verse > 0 && hasText(text.slice(end, nextIndex));
    const reason = normalizeReason(raw);
    const splitTag =
      reason === "s" || reason === "d" ? "s" : reason === "b" ? "b" : "p";

    if (raw === "b") {
      pendingSplit.add("b");
      if (poetry) {
        pendingReasons.add("b");
      }
      continue;
    }
    pendingSplit.add(splitTag);
    if (
      poetry &&
      (reason === "p" || reason === "pc" || reason === "m" || reason === "pi")
    ) {
      continue;
    }
    pendingReasons.add(reason);
  }
  return { chapters };
}

function loadKoreanChapter(bookId, ch) {
  const p = path.join(BIBLE_DATA, `${bookId}.json`);
  if (!fs.existsSync(p)) return null;
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  const chapter = d?.chapters?.find((c) => Number(c.chapter) === ch);
  const krv = chapter?.verses?.krv;
  if (!Array.isArray(krv)) return null;
  /** @type {Map<number, string>} */
  const texts = new Map();
  let max = 0;
  for (const v of krv) {
    const n = Number(v.n);
    texts.set(n, String(v.t ?? ""));
    if (n > max) max = n;
  }
  return { max, texts };
}

function loadFix(bookId) {
  const p = path.join(FIX_DIR, `${bookId}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function paraLengths(starts, maxVerse) {
  return starts.map((s, i) => {
    const end = (starts[i + 1] ?? maxVerse + 1) - 1;
    return end - s + 1;
  });
}

function isSectionSrc(src) {
  return src === "s" || src === "bsb_s";
}

function isMergeableP(src) {
  return src === "p" || src === "bsb_p";
}

/** 1절·짧은 p/bsb_p 합치기 (소제목 s/bsb_s 는 합치지 않음) */
const MERGE_MAX_CHARS = 70; // BSB \s1 밀도 반영, 1절 단락 ≤1222 목표

function mergeShortBySrc(starts, srcMap, maxVerse, texts) {
  let arr = [...starts];
  let guard = 0;
  while (guard++ < 10000) {
    const lens = paraLengths(arr, maxVerse);
    let changed = false;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      const src = srcMap.get(v) || "p";
      if (isSectionSrc(src)) continue;
      if (!isMergeableP(src)) continue;
      if (lens[i] !== 1) continue;
      if ((texts.get(v) ?? "").length >= MERGE_MAX_CHARS) continue;
      const next = arr[i + 1];
      const nextSrc = next != null ? srcMap.get(next) || "p" : null;
      if (next != null && isSectionSrc(nextSrc)) {
        if (v === 1) continue;
        arr.splice(i, 1);
        changed = true;
        break;
      }
      if (next != null) {
        arr.splice(i + 1, 1);
        changed = true;
        break;
      }
      if (v !== 1) {
        arr.splice(i, 1);
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
  return arr;
}

/** 소제목 구간 안: 1절 단락→다음과 합침, 연속 1절 2개↑ 합침, 구간 끝 ≤2절 앞과 합침 */
function mergeWithinSections(starts, srcMap, maxVerse) {
  let arr = [...starts];
  let guard = 0;
  while (guard++ < 10000) {
    const lens = paraLengths(arr, maxVerse);
    let changed = false;

    // 구간 끝의 짧은(≤2) 병합 가능 단락 → 앞에 합침
    for (let i = 1; i < arr.length; i++) {
      const v = arr[i];
      const src = srcMap.get(v) || "p";
      if (isSectionSrc(src)) continue;
      if (!isMergeableP(src)) continue;
      if (lens[i] > 2) continue;
      const next = arr[i + 1];
      const nextIsSection =
        next == null || isSectionSrc(srcMap.get(next) || "p");
      if (!nextIsSection) continue;
      arr.splice(i, 1);
      changed = true;
      break;
    }
    if (changed) continue;

    // 연속 1절 단락 2개 이상(같은 소제목 구간, 병합 가능) → 첫만 남김
    for (let i = 0; i < arr.length; i++) {
      const src = srcMap.get(arr[i]) || "p";
      if (isSectionSrc(src)) continue;
      if (!isMergeableP(src)) continue;
      if (lens[i] !== 1) continue;
      let j = i;
      while (
        j + 1 < arr.length &&
        lens[j + 1] === 1 &&
        isMergeableP(srcMap.get(arr[j + 1]) || "p") &&
        !isSectionSrc(srcMap.get(arr[j + 1]) || "p")
      ) {
        j += 1;
      }
      if (j > i) {
        arr.splice(i + 1, j - i);
        changed = true;
        break;
      }
    }
    if (changed) continue;

    // 1절 단락(소제목 시작 포함) → 다음 단락과 합침(다음이 소제목이면 제외)
    for (let i = 0; i < arr.length; i++) {
      if (lens[i] !== 1) continue;
      const next = arr[i + 1];
      if (next == null) continue;
      const nextSrc = srcMap.get(next) || "p";
      if (isSectionSrc(nextSrc)) continue;
      if (!isMergeableP(nextSrc) && !isSectionSrc(srcMap.get(arr[i]) || "p")) {
        // 다음이 병합 불가면 스킵 (단 현재가 소제목이면 다음 p 흡수)
        continue;
      }
      const curSrc = srcMap.get(arr[i]) || "p";
      if (!isSectionSrc(curSrc) && !isMergeableP(curSrc)) continue;
      arr.splice(i + 1, 1);
      changed = true;
      break;
    }
    if (!changed) break;
  }
  return arr;
}

function splitLongWeb(starts, maxVerse, splitAt) {
  /** @type {number[]} */
  const out = [];
  /** @type {Map<number, string>} */
  const splitSrc = new Map();
  for (let i = 0; i < starts.length; i++) {
    const lo = starts[i];
    const hi = (starts[i + 1] ?? maxVerse + 1) - 1;
    out.push(lo);
    if (hi - lo + 1 <= 12) continue;
    for (let v = lo + 1; v <= hi; v++) {
      const tags = splitAt.get(v);
      if (!tags?.size) continue;
      out.push(v);
      splitSrc.set(v, primaryReason(tags) || "p");
    }
  }
  return {
    starts: [...new Set(out)].sort((a, b) => a - b),
    splitSrc,
  };
}

function countSingles(starts, maxVerse) {
  return paraLengths(starts, maxVerse).filter((n) => n === 1).length;
}
function countLong(starts, maxVerse) {
  return paraLengths(starts, maxVerse).filter((n) => n > 12).length;
}

function buildWebMeta(bookId, totalChapters) {
  const code = USFM_CODE[bookId];
  const file = findUsfmFile(code);
  if (!file) throw new Error(`WEB USFM 없음: ${code}`);
  const poetry = POETRY.has(bookId);
  const { chapters } = parseUsfm(fs.readFileSync(file, "utf8"), poetry);
  const fix = loadFix(bookId);
  /** @type {Record<string, number[]>} */
  const out = {};
  /** @type {Map<number, Map<number, Set<string>>>} */
  const reasonsByCh = new Map();
  /** @type {Map<number, Map<number, Set<string>>>} */
  const splitAtByCh = new Map();
  const mismatches = [];

  for (let ch = 1; ch <= totalChapters; ch++) {
    const web = chapters.get(ch);
    const ko = loadKoreanChapter(bookId, ch);
    const maxKo = ko?.max ?? null;
    if (web && maxKo != null && web.maxVerse !== maxKo) {
      mismatches.push(`${bookId} ${ch}: WEB ${web.maxVerse} / KRV ${maxKo}`);
    }
    const reasonMap = new Map();
    if (web) for (const [v, rs] of web.starts) reasonMap.set(v, new Set(rs));
    reasonsByCh.set(ch, reasonMap);
    splitAtByCh.set(ch, web?.splitAt ?? new Map());

    let starts;
    const fixRow = fix?.[String(ch)];
    if (Array.isArray(fixRow)) {
      starts = fixRow.map(Number).filter((n) => Number.isInteger(n) && n > 0);
    } else {
      starts = web ? [...web.starts.keys()] : [];
    }
    if (maxKo != null) starts = starts.filter((n) => n <= maxKo);
    out[String(ch)] = [...new Set([1, ...starts])].sort((a, b) => a - b);
    if (!reasonMap.has(1)) reasonMap.set(1, new Set());
  }
  return { out, reasonsByCh, splitAtByCh, mismatches };
}

function refineBook(bookId, totalChapters, raw, webMeta, bsb) {
  /** @type {Record<string, number[]>} */
  const out = {};
  /** @type {Record<string, Record<string, string>>} */
  const sources = {};
  const stillHigh = [];

  for (let ch = 1; ch <= totalChapters; ch++) {
    const ko = loadKoreanChapter(bookId, ch);
    const maxVerse = ko?.max ?? raw[String(ch)]?.at(-1) ?? 1;
    const texts = ko?.texts ?? new Map();
    let starts = [...(raw[String(ch)] ?? [1])];
    const reasonMap = webMeta.reasonsByCh.get(ch) ?? new Map();
    const splitAt = webMeta.splitAtByCh.get(ch) ?? new Map();
    /** @type {Map<number, string>} */
    const srcMap = new Map();

    for (const v of starts) {
      srcMap.set(v, primaryReason(reasonMap.get(v)) || "p");
    }

    if (!SKIP_REFINE.has(bookId)) {
      starts = mergeShortBySrc(starts, srcMap, maxVerse, texts);
      const split = splitLongWeb(starts, maxVerse, splitAt);
      starts = split.starts;
      for (const [v, src] of split.splitSrc) srcMap.set(v, src);

      // BSB \s1 은 항상 단락 시작. BSB \p 는 12절 초과 단락 안에서만.
      if (bsb) {
        const bsbCh = bsb.starts.get(ch);
        if (bsbCh) {
          for (const [v, tags] of bsbCh) {
            if (v < 1 || v > maxVerse) continue;
            if (tags.has("s1")) {
              if (!starts.includes(v)) starts.push(v);
              srcMap.set(v, "bsb_s");
            }
          }
          starts = [...new Set([1, ...starts])].sort((a, b) => a - b);
          starts = mergeShortBySrc(starts, srcMap, maxVerse, texts);

          // 12절 넘는 단락만 BSB \p 로 추가 분할
          let guard = 0;
          while (guard++ < 100) {
            const lens = paraLengths(starts, maxVerse);
            /** @type {number[]} */
            const add = [];
            for (let i = 0; i < starts.length; i++) {
              if (lens[i] <= 12) continue;
              const lo = starts[i];
              const hi = (starts[i + 1] ?? maxVerse + 1) - 1;
              for (const [v, tags] of bsbCh) {
                if (v <= lo || v > hi) continue;
                if (!tags.has("p")) continue;
                if (starts.includes(v) || add.includes(v)) continue;
                add.push(v);
                if (!srcMap.has(v) || !isSectionSrc(srcMap.get(v))) {
                  srcMap.set(v, "bsb_p");
                }
              }
            }
            if (!add.length) break;
            starts = [...new Set([1, ...starts, ...add])].sort((a, b) => a - b);
            starts = mergeShortBySrc(starts, srcMap, maxVerse, texts);
          }
        }
      }

      starts = mergeWithinSections(starts, srcMap, maxVerse);
      starts = mergeShortBySrc(starts, srcMap, maxVerse, texts);
    }

    if (bookId === "romans" && ch === 16) {
      starts = [1, 3, 17, 21, 25].filter((n) => n <= maxVerse);
      for (const v of starts) {
        if (v === 25) srcMap.set(v, srcMap.get(v) === "bsb_s" ? "bsb_s" : "s");
        else if (!srcMap.has(v)) srcMap.set(v, "p");
      }
    }

    starts = starts.filter((n) => n >= 1 && n <= maxVerse);
    starts = [...new Set([1, ...starts])].sort((a, b) => a - b);
    // srcMap 정리: 남은 시작만
    /** @type {Record<string, string>} */
    const chSrc = {};
    for (const v of starts) chSrc[String(v)] = srcMap.get(v) || "p";
    sources[String(ch)] = chSrc;
    out[String(ch)] = starts;

    const singles = countSingles(starts, maxVerse);
    if (starts.length && singles / starts.length > 0.3) {
      stillHigh.push({
        ch,
        singles,
        total: starts.length,
        ratio: singles / starts.length,
        starts: [...starts],
      });
    }
  }
  return { out, stillHigh, sources };
}

function main() {
  const args = process.argv.slice(2);
  const books = loadBooks();
  const ids = args.includes("--all")
    ? [...books.keys()]
    : args.filter((a) => !a.startsWith("--"));
  if (!ids.length) {
    console.error("사용: node scripts/build-paragraphs.mjs --all");
    process.exit(1);
  }

  ensureUsfm();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(SRC_DIR, { recursive: true });
  fs.mkdirSync(RAW_DIR, { recursive: true });

  // raw 시드(없을 때만)
  for (const id of ids) {
    const rawPath = path.join(RAW_DIR, `${id}.json`);
    if (fs.existsSync(rawPath)) continue;
    const pub = path.join(OUT_DIR, `${id}.json`);
    if (fs.existsSync(pub)) fs.copyFileSync(pub, rawPath);
  }

  /** @type {Record<string, Record<string, number[]>>} */
  const beforeSnap = {};
  let singlesBefore = 0;
  let longBefore = 0;
  let singlesAfter = 0;
  let longAfter = 0;
  /** @type {Record<string, Record<string, number[]>>} */
  const refinedAll = {};
  /** @type {{ key: string, singles: number, total: number, ratio: number, starts: number[] }[]} */
  const over30 = [];
  /** @type {Record<string, number>} */
  const srcTotals = { s: 0, p: 0, b: 0, q1: 0, bsb_s: 0, bsb_p: 0 };
  /** @type {{ key: string, before: number, after: number, beforeStarts: number[], afterStarts: number[] }[]} */
  const longTop = [];
  const bsbMismatches = [];
  let bsbS1 = 0;
  let bsbS2 = 0;
  let bsbP = 0;

  // BSB 전체 카운트·절수 차이
  for (const id of ids) {
    const bsb = loadBsbBook(id);
    if (!bsb) continue;
    bsbS1 += bsb.counts.s1;
    bsbS2 += bsb.counts.s2;
    bsbP += bsb.counts.p;
    const total = books.get(id);
    for (let ch = 1; ch <= total; ch++) {
      const ko = loadKoreanChapter(id, ch);
      const bMax = bsb.verseMax.get(ch) ?? 0;
      const kMax = ko?.max ?? 0;
      if (bMax !== kMax) {
        bsbMismatches.push(`${id} ${ch}: BSB ${bMax} / KRV ${kMax}`);
      }
    }
  }

  for (const id of ids) {
    const total = books.get(id);
    const raw = JSON.parse(fs.readFileSync(path.join(RAW_DIR, `${id}.json`), "utf8"));
    const pubBefore = fs.existsSync(path.join(OUT_DIR, `${id}.json`))
      ? JSON.parse(fs.readFileSync(path.join(OUT_DIR, `${id}.json`), "utf8"))
      : raw;
    beforeSnap[id] = pubBefore;

    /** @type {{ ch: number, len: number, starts: number[] }[]} */
    const longBeforeCh = [];
    for (let ch = 1; ch <= total; ch++) {
      const ko = loadKoreanChapter(id, ch);
      const maxV = ko?.max ?? 1;
      const prev = pubBefore[String(ch)] ?? [1];
      singlesBefore += countSingles(prev, maxV);
      const lens = paraLengths(prev, maxV);
      for (let i = 0; i < prev.length; i++) {
        if (lens[i] > 12) {
          longBefore += 1;
          longBeforeCh.push({ ch, len: lens[i], starts: prev });
        }
      }
    }

    const webMeta = buildWebMeta(id, total);
    const bsb = SKIP_REFINE.has(id) ? null : loadBsbBook(id);
    const { out, stillHigh, sources } = refineBook(id, total, raw, webMeta, bsb);
    refinedAll[id] = out;

    fs.writeFileSync(path.join(SRC_DIR, `${id}.json`), JSON.stringify(sources, null, 2) + "\n");
    fs.writeFileSync(path.join(OUT_DIR, `${id}.json`), JSON.stringify(out) + "\n");

    for (const chSrc of Object.values(sources)) {
      for (const tag of Object.values(chSrc)) {
        if (tag in srcTotals) srcTotals[tag] += 1;
      }
    }

    for (let ch = 1; ch <= total; ch++) {
      const ko = loadKoreanChapter(id, ch);
      const maxV = ko?.max ?? 1;
      const after = out[String(ch)];
      singlesAfter += countSingles(after, maxV);
      const lens = paraLengths(after, maxV);
      let longAfterCh = 0;
      for (const L of lens) if (L > 12) {
        longAfter += 1;
        longAfterCh += 1;
      }
      const beforeStarts = pubBefore[String(ch)] ?? [1];
      const beforeLong = paraLengths(beforeStarts, maxV).filter((n) => n > 12).length;
      if (beforeLong || longAfterCh) {
        longTop.push({
          key: `${id} ${ch}`,
          before: beforeLong,
          after: longAfterCh,
          beforeStarts,
          afterStarts: after,
        });
      }
    }

    for (const s of stillHigh) {
      over30.push({
        key: `${id} ${s.ch}`,
        singles: s.singles,
        total: s.total,
        ratio: s.ratio,
        starts: s.starts,
      });
    }

    console.log(`[${id}] 단락 ${Object.values(out).reduce((n, a) => n + a.length, 0)}개`);
  }

  // 12절 초과 상위 20 (보정 전 길이 기준)
  const longRank = [];
  for (const id of ids) {
    const total = books.get(id);
    for (let ch = 1; ch <= total; ch++) {
      const ko = loadKoreanChapter(id, ch);
      const maxV = ko?.max ?? 1;
      const before = beforeSnap[id][String(ch)] ?? [1];
      const after = refinedAll[id][String(ch)];
      const bLens = paraLengths(before, maxV);
      const maxB = Math.max(0, ...bLens.filter((n) => n > 12));
      if (maxB > 12) {
        longRank.push({
          key: `${id} ${ch}`,
          maxBefore: maxB,
          beforeCount: bLens.filter((n) => n > 12).length,
          afterCount: paraLengths(after, maxV).filter((n) => n > 12).length,
          before,
          after,
        });
      }
    }
  }
  longRank.sort((a, b) => b.maxBefore - a.maxBefore);
  const longTop20 = longRank.slice(0, 20);

  over30.sort((a, b) => b.ratio - a.ratio || b.singles - a.singles);
  const over30NoLam = over30.filter((r) => !r.key.startsWith("lamentations "));

  const report = {
    explainBefore:
      "지난 보고(1절 1172, 12절초과 83)는 ‘합치기+담화/q1 창 분할’ 직후 public 수치. 이번 표의 「전」(당시 약 1175/2 또는 현재 스냅샷)은 fallback 제거 후·BSB 보강 직전 public. fallback을 끄면 12절 초과가 다시 늘고(경계 없으면 이어씀), 1절 수는 합치기만 남아 소폭 변동.",
    singlesBefore,
    singlesAfter,
    longBefore,
    longAfter,
    srcTotals,
    bsbCounts: { s1: bsbS1, s2: bsbS2, p: bsbP, s1s2: bsbS1 + bsbS2 },
    bsbMismatches,
    joel2: { before: beforeSnap.joel?.["2"], after: refinedAll.joel?.["2"] },
    hosea2: { before: beforeSnap.hosea?.["2"], after: refinedAll.hosea?.["2"] },
    longTop20: longTop20.map((r) => ({
      chapter: r.key,
      maxParaBefore: r.maxBefore,
      longCount: `${r.beforeCount}→${r.afterCount}`,
      before: r.before,
      after: r.after,
    })),
    over30Top20: over30NoLam.slice(0, 20).map((r) => ({
      chapter: r.key,
      singles: r.singles,
      totalParas: r.total,
      ratio: `${(r.ratio * 100).toFixed(0)}%`,
      starts: r.starts,
    })),
    romans16: refinedAll.romans?.["16"],
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");

  console.log("\n=== 0) 「전」 수치 설명 ===");
  console.log(report.explainBefore);

  console.log("\n=== 1) BSB 마커 ===");
  console.log(`\\s1 ${bsbS1} · \\s2 ${bsbS2} · 합 ${bsbS1 + bsbS2} · \\p ${bsbP}`);
  console.log(`BSB↔KRV 절수 다른 장 ${bsbMismatches.length}:`);
  for (const x of bsbMismatches) console.log(`  ${x}`);

  console.log("\n=== 2) 단락 전→후 ===");
  console.log(`1절짜리: ${singlesBefore} → ${singlesAfter}`);
  console.log(`12절 초과: ${longBefore} → ${longAfter}`);
  console.log(`출처: ${JSON.stringify(srcTotals)}`);
  console.log(`요엘 2: [${(beforeSnap.joel?.["2"] ?? []).join(",")}] → [${(refinedAll.joel?.["2"] ?? []).join(",")}]`);
  console.log(`호세아 2: [${(beforeSnap.hosea?.["2"] ?? []).join(",")}] → [${(refinedAll.hosea?.["2"] ?? []).join(",")}]`);
  console.log("12절 초과 상위 20:");
  for (const r of longTop20) {
    console.log(
      `  ${r.key}: 최장 ${r.maxBefore}절, 개수 ${r.beforeCount}→${r.afterCount} | [${r.before.join(",")}] → [${r.after.join(",")}]`,
    );
  }
  console.log("\n1절 비율 >30% 상위 20 (애가 제외):");
  for (const r of over30NoLam.slice(0, 20)) {
    console.log(
      `  ${r.key}장: 1절 ${r.singles}/${r.total} (${(r.ratio * 100).toFixed(0)}%) 시작=${JSON.stringify(r.starts)}`,
    );
  }
  console.log(`롬 16: ${JSON.stringify(refinedAll.romans?.["16"])}`);
  console.log(`\n보고서: ${REPORT_PATH}`);
}

main();
