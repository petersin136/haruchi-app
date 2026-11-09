#!/usr/bin/env node
/**
 * 장별 단락 시작 절 (WEB USFM → raw → 보정 → public/paragraphs).
 *
 * 원본(보정 전): .cache/paragraphs-raw/{bookId}.json
 * 보정본:       public/paragraphs/{bookId}.json
 *
 * 보정:
 *   1) \p 전용 1절·한글 60자 미만 단락 합치기 (\s 직후는 유지)
 *   2) 12절 초과 단락을 \b·\q1 후보 + 앞절 마침표로 6~10절 단위 분할
 *   3) 애가는 보정 생략
 *
 * 사용: node scripts/build-paragraphs.mjs --all | <bookId …>
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const USFM_DIR = path.join(repoRoot, ".cache", "web-usfm");
const USFM_ZIP_URL = "https://ebible.org/Scriptures/eng-web_usfm.zip";
const BOOKS_TS = path.join(repoRoot, "app", "bible-reading", "books.ts");
const BIBLE_DATA = path.join(repoRoot, "public", "bible-data");
const FIX_DIR = path.join(repoRoot, "data", "paragraph-fix");
const RAW_DIR = path.join(repoRoot, ".cache", "paragraphs-raw");
const OUT_DIR = path.join(repoRoot, "public", "paragraphs");
/** 시작 절별 출처(s/p/b/q1/fallback) */
const SRC_DIR = path.join(repoRoot, ".cache", "paragraphs-sources");

/** 개역한글 담화 시작 — fallback 분할 우선 */
const DISCOURSE_START =
  /^(?:여호와의 말씀에|그 후에|그 날에|그 때에|보라(?:\s|,|、)|이제(?:\s|,|、)|이에(?:\s|,|、))/;

/** 시가서 — 초기 단락은 \b·소제목만 (\q 무시) */
const POETRY = new Set([
  "job",
  "psalms",
  "proverbs",
  "ecclesiastes",
  "songofsolomon",
  "lamentations",
]);

/** 보정(합치기·나누기) 생략 */
const SKIP_REFINE = new Set(["lamentations"]);

const USFM_CODE = {
  genesis: "GEN",
  exodus: "EXO",
  leviticus: "LEV",
  numbers: "NUM",
  deuteronomy: "DEU",
  joshua: "JOS",
  judges: "JDG",
  ruth: "RUT",
  samuel1: "1SA",
  samuel2: "2SA",
  kings1: "1KI",
  kings2: "2KI",
  chronicles1: "1CH",
  chronicles2: "2CH",
  ezra: "EZR",
  nehemiah: "NEH",
  esther: "EST",
  job: "JOB",
  psalms: "PSA",
  proverbs: "PRO",
  ecclesiastes: "ECC",
  songofsolomon: "SNG",
  isaiah: "ISA",
  jeremiah: "JER",
  lamentations: "LAM",
  ezekiel: "EZK",
  daniel: "DAN",
  hosea: "HOS",
  joel: "JOL",
  amos: "AMO",
  obadiah: "OBA",
  jonah: "JON",
  micah: "MIC",
  nahum: "NAM",
  habakkuk: "HAB",
  zephaniah: "ZEP",
  haggai: "HAG",
  zechariah: "ZEC",
  malachi: "MAL",
  matthew: "MAT",
  mark: "MRK",
  luke: "LUK",
  john: "JHN",
  acts: "ACT",
  romans: "ROM",
  corinthians1: "1CO",
  corinthians2: "2CO",
  galatians: "GAL",
  ephesians: "EPH",
  philippians: "PHP",
  colossians: "COL",
  thessalonians1: "1TH",
  thessalonians2: "2TH",
  timothy1: "1TI",
  timothy2: "2TI",
  titus: "TIT",
  philemon: "PHM",
  hebrews: "HEB",
  james: "JAS",
  peter1: "1PE",
  peter2: "2PE",
  john1: "1JN",
  john2: "2JN",
  john3: "3JN",
  jude: "JUD",
  revelation: "REV",
};

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
    console.log(`[usfm] download ${USFM_ZIP_URL}`);
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
  if (raw === "m") return "m";
  if (raw === "p" || raw === "pc") return raw === "pc" ? "pc" : "p";
  if (/^pi\d*$/.test(raw)) return "pi";
  if (/^s\d*$/.test(raw)) return "s";
  return raw;
}

/**
 * @param {string} text
 * @param {boolean} poetry
 */
function parseUsfm(text, poetry) {
  // 시가서 단락: b/s/d · 산문 단락: p/m/pi/pc/s
  // 분할 후보: 모든 책에서 b/q1 + p/m/pi/pc/s (시가서의 \p 등도 긴 단락 분할에 사용)
  const paraMarker = poetry
    ? String.raw`(b|s\d*|d)`
    : String.raw`(p|m|pi\d*|pc|s\d*)`;
  const tokenRe = new RegExp(
    String.raw`\\(c|v)\s+(\d+)(?:-\d+)?|\\(${paraMarker}|p|m|pi\d*|pc|b|q1)(?=[\s\\]|$)`,
    "g",
  );

  /** @type {Map<number, { starts: Map<number, Set<string>>, maxVerse: number, splitCandidates: Set<number> }>} */
  const chapters = new Map();
  /** @type {string[]} */
  const midVerseBreaks = [];
  let ch = 0;
  let verse = 0;
  /** @type {Set<string>} */
  let pendingReasons = new Set();
  let pendingSplit = false;

  /** @type {{ m: RegExpExecArray, end: number }[]} */
  const tokens = [];
  let m;
  while ((m = tokenRe.exec(text)) !== null) {
    tokens.push({ m, end: tokenRe.lastIndex });
  }

  for (let i = 0; i < tokens.length; i++) {
    const { m: t, end } = tokens[i];
    if (t[1] === "c") {
      ch = Number(t[2]);
      verse = 0;
      pendingReasons = new Set();
      pendingSplit = false;
      chapters.set(ch, {
        starts: new Map(),
        maxVerse: 0,
        splitCandidates: new Set(),
      });
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
      if (pendingSplit) {
        row.splitCandidates.add(verse);
        pendingSplit = false;
      }
      continue;
    }

    const raw = t[3];
    const nextIndex = tokens[i + 1]?.m.index ?? text.length;
    const between = text.slice(end, nextIndex);
    const mid = verse > 0 && hasText(between);

    if (raw === "q1") {
      // 긴 단락 분할 후보(\q1 연 시작 → 다음 절)
      pendingSplit = true;
      continue;
    }
    if (raw === "b") {
      pendingSplit = true;
      // 시가서에서 \b 는 단락 마커이기도 함
      if (poetry) {
        if (mid) midVerseBreaks.push(`${ch}:${verse}`);
        pendingReasons.add("b");
      }
      continue;
    }

    const reason = normalizeReason(raw);
    // 긴 단락 분할: \b·\q1 외에 WEB \p/\m/\s 경계도 후보
    // (시가서 초기 파싱에서  Ignored 된 \p 등을 보정 단계에서 활용)
    pendingSplit = true;
    if (poetry && (reason === "p" || reason === "pc" || reason === "m" || reason === "pi")) {
      // 시가서 초기 단락에는 \p 등을 쓰지 않음 — 분할 후보만
      if (mid) midVerseBreaks.push(`${ch}:${verse}`);
      continue;
    }
    if (mid) midVerseBreaks.push(`${ch}:${verse}`);
    pendingReasons.add(reason);
  }

  /** @type {Map<number, { starts: Map<number, Set<string>>, maxVerse: number, splitCandidates: Set<number> }>} */
  return { chapters, midVerseBreaks };
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
  const lens = [];
  for (let i = 0; i < starts.length; i++) {
    const end = (starts[i + 1] ?? maxVerse + 1) - 1;
    lens.push(end - starts[i] + 1);
  }
  return lens;
}

function endsWithPeriod(text) {
  const t = String(text ?? "").trim();
  if (!t) return false;
  // 라틴/CJK 마침표
  if (/[.。．!！?？]\s*$/.test(t)) return true;
  // 개역한글 종결형(서양 마침표가 거의 없음)
  return /(?:니라|리라|로다|도다|이랴|지어다|구나|노라|이니라|하시니라|하였더라|하더라|할지니라|을지어다|음이로다|음이니라)\s*$/.test(
    t,
  );
}

function startsDiscourse(text) {
  return DISCOURSE_START.test(String(text ?? "").trim());
}

/** reasonSet → s|p|b|q1 우선 태그 */
function primaryReason(reasons) {
  if (!reasons || reasons.size === 0) return null;
  for (const tag of ["s", "d", "b", "q1", "p", "pc", "m", "pi"]) {
    if (reasons.has(tag)) return tag === "d" ? "s" : tag === "pc" || tag === "m" || tag === "pi" ? "p" : tag;
  }
  const first = [...reasons][0];
  if (first === "d") return "s";
  if (first === "pc" || first === "m" || first === "pi") return "p";
  return first;
}

function isSectionReason(reasons) {
  return reasons.has("s") || reasons.has("d");
}

function isPureP(reasons) {
  if (!reasons.has("p")) return false;
  for (const r of reasons) {
    if (r !== "p") return false;
  }
  return true;
}

/**
 * 짧은 \p 단락 합치기
 * @param {number[]} starts
 * @param {Map<number, Set<string>>} reasonMap
 * @param {number} maxVerse
 * @param {Map<number, string>} texts
 */
function mergeShortParas(starts, reasonMap, maxVerse, texts) {
  let arr = [...starts];
  let guard = 0;
  while (guard++ < 10000) {
    const lens = paraLengths(arr, maxVerse);
    let changed = false;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      const reasons = reasonMap.get(v) ?? new Set();
      if (isSectionReason(reasons)) continue;
      if (!isPureP(reasons)) continue;
      if (lens[i] !== 1) continue;
      if ((texts.get(v) ?? "").length >= 60) continue;

      const next = arr[i + 1];
      const nextReasons = next != null ? (reasonMap.get(next) ?? new Set()) : null;

      if (next != null && nextReasons && isSectionReason(nextReasons)) {
        // 다음이 \s → 앞 단락과 합침 (이 시작 제거)
        if (v === 1) continue;
        arr.splice(i, 1);
        changed = true;
        break;
      }
      if (next != null) {
        // 다음 단락과 합침 (다음 시작 제거)
        arr.splice(i + 1, 1);
        changed = true;
        break;
      }
      // 마지막 단락 → 앞과 합침
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

/**
 * 12절 초과 단락 분할.
 * 반환: { starts, splitSrc: Map<verse, 's'|'p'|'b'|'q1'|'fallback'> } — 이번에 나눈 절만 splitSrc.
 * @param {number[]} starts
 * @param {number} maxVerse
 * @param {Set<number>} candidates
 * @param {Map<number, Set<string>>} reasonMap
 * @param {Map<number, string>} texts
 */
function splitLongParas(starts, maxVerse, candidates, reasonMap, texts) {
  /** @type {number[]} */
  const out = [];
  /** @type {Map<number, string>} */
  const splitSrc = new Map();

  for (let i = 0; i < starts.length; i++) {
    const lo = starts[i];
    const hi = (starts[i + 1] ?? maxVerse + 1) - 1;
    let pos = lo;
    out.push(lo);
    while (hi - pos + 1 > 12) {
      const from = pos + 6;
      const toIdeal = Math.min(pos + 10, hi);
      const toMax = Math.min(pos + 12, hi);
      if (from > toMax) break;
      const ideal = pos + 8;

      /**
       * @param {number} to
       * @returns {{ v: number, src: string, rank: number }[]}
       */
      const collect = (to) => {
        /** @type {{ v: number, src: string, rank: number }[]} */
        const rows = [];
        for (let v = from; v <= to; v++) {
          if (v <= pos) continue;
          const prevOk = endsWithPeriod(texts.get(v - 1) ?? "");
          const discourse = startsDiscourse(texts.get(v) ?? "");
          const inCand = candidates.has(v);
          const tag = primaryReason(reasonMap.get(v));
          // 앞 절 종결 + 담화 시작이 최우선 (USFM 후보 여부 무관)
          let rank;
          let src;
          if (prevOk && discourse) {
            rank = 1;
            src = inCand ? tag || "p" : "fallback";
          } else if (inCand && prevOk) {
            rank = 2;
            src = tag || "p";
          } else if (inCand) {
            rank = 3;
            src = tag || "p";
          } else if (prevOk) {
            rank = 4;
            src = "fallback";
          } else {
            rank = 5;
            src = "fallback";
          }
          rows.push({ v, src, rank });
        }
        return rows;
      };

      // 12절 한도까지 모은 뒤 담화(rank1) 우선 — 이상 구간만 보면 12 등을 놓침
      const wide = collect(toMax);
      const discourse = wide.filter((r) => r.rank === 1);
      let pool = discourse.length
        ? discourse
        : collect(toIdeal).filter((r) => r.rank <= 3);
      if (!pool.length) pool = wide;
      if (!pool.length) break;

      pool.sort(
        (a, b) =>
          a.rank - b.rank ||
          Math.abs(a.v - ideal) - Math.abs(b.v - ideal) ||
          a.v - b.v,
      );
      const pick = pool[0];
      out.push(pick.v);
      splitSrc.set(pick.v, pick.src);
      pos = pick.v;
    }
  }
  return {
    starts: [...new Set(out)].sort((a, b) => a - b),
    splitSrc,
  };
}

function countSingles(starts, maxVerse) {
  const lens = paraLengths(starts, maxVerse);
  return lens.filter((n) => n === 1).length;
}

function countLong(starts, maxVerse) {
  const lens = paraLengths(starts, maxVerse);
  return lens.filter((n) => n > 12).length;
}

function seedRawFromPublic(bookIds) {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  let seeded = 0;
  for (const id of bookIds) {
    const rawPath = path.join(RAW_DIR, `${id}.json`);
    const pubPath = path.join(OUT_DIR, `${id}.json`);
    if (fs.existsSync(rawPath)) continue;
    if (!fs.existsSync(pubPath)) continue;
    fs.copyFileSync(pubPath, rawPath);
    seeded += 1;
  }
  if (seeded) console.log(`[raw] seeded ${seeded} files → ${RAW_DIR}`);
  else console.log(`[raw] reuse ${RAW_DIR}`);
}

function buildRawBook(bookId, totalChapters) {
  const code = USFM_CODE[bookId];
  if (!code) throw new Error(`USFM 코드 없음: ${bookId}`);
  const file = findUsfmFile(code);
  if (!file) throw new Error(`USFM 파일 없음: ${code}`);

  const poetry = POETRY.has(bookId);
  const { chapters } = parseUsfm(fs.readFileSync(file, "utf8"), poetry);
  const fix = loadFix(bookId);

  /** @type {Record<string, number[]>} */
  const out = {};
  /** @type {Map<number, Map<number, Set<string>>>} */
  const reasonsByCh = new Map();
  /** @type {Map<number, Set<number>>} */
  const candidatesByCh = new Map();
  /** @type {string[]} */
  const mismatches = [];
  /** @type {string[]} */
  const dropped = [];

  for (let ch = 1; ch <= totalChapters; ch++) {
    const web = chapters.get(ch);
    const ko = loadKoreanChapter(bookId, ch);
    const maxKo = ko?.max ?? null;
    if (web && maxKo != null && web.maxVerse !== maxKo) {
      mismatches.push(`${ch}장 절 수: WEB ${web.maxVerse} / 한글 ${maxKo}`);
    }

    /** @type {Map<number, Set<string>>} */
    const reasonMap = new Map();
    if (web) {
      for (const [v, rs] of web.starts) reasonMap.set(v, new Set(rs));
    }
    reasonsByCh.set(ch, reasonMap);
    candidatesByCh.set(ch, new Set(web?.splitCandidates ?? []));

    let starts;
    const fixRow = fix?.[String(ch)];
    if (Array.isArray(fixRow)) {
      starts = fixRow.map(Number).filter((n) => Number.isInteger(n) && n > 0);
    } else {
      starts = web ? [...web.starts.keys()] : [];
    }
    if (maxKo != null) {
      for (const n of starts) if (n > maxKo) dropped.push(`${ch}:${n}`);
      starts = starts.filter((n) => n <= maxKo);
    }
    const final = [...new Set([1, ...starts])].sort((a, b) => a - b);
    // verse 1 always present; ensure reason map has entry
    if (!reasonMap.has(1)) reasonMap.set(1, new Set());
    out[String(ch)] = final;
  }

  return {
    out,
    reasonsByCh,
    candidatesByCh,
    mismatches,
    dropped,
    usfmPath: file,
  };
}

function refineBook(bookId, totalChapters, raw, meta) {
  /** @type {Record<string, number[]>} */
  const out = {};
  /** @type {Record<string, Record<string, string>>} */
  const sources = {};
  const stillHigh = [];
  /** @type {string[]} */
  const fallbackOnlyChapters = [];

  for (let ch = 1; ch <= totalChapters; ch++) {
    const ko = loadKoreanChapter(bookId, ch);
    const maxVerse = ko?.max ?? raw[String(ch)]?.at(-1) ?? 1;
    const texts = ko?.texts ?? new Map();
    let starts = [...(raw[String(ch)] ?? [1])];
    const reasonMap = meta.reasonsByCh.get(ch) ?? new Map();
    const candidates = meta.candidatesByCh.get(ch) ?? new Set();
    /** @type {Map<number, string>} */
    const srcMap = new Map();

    // raw 시작 절 출처
    for (const v of starts) {
      const tag = primaryReason(reasonMap.get(v));
      srcMap.set(v, tag || (v === 1 ? "s" : "p"));
    }

    /** @type {Map<number, string>} */
    let splitSrc = new Map();
    if (!SKIP_REFINE.has(bookId)) {
      starts = mergeShortParas(starts, reasonMap, maxVerse, texts);
      const split = splitLongParas(
        starts,
        maxVerse,
        candidates,
        reasonMap,
        texts,
      );
      starts = split.starts;
      splitSrc = split.splitSrc;
      for (const [v, src] of splitSrc) srcMap.set(v, src);
    }

    // 롬 16: 송영(25) 포함 고정 시작 [1,3,17,21,25]
    if (bookId === "romans" && ch === 16) {
      const fixed = [1, 3, 17, 21, 25].filter((n) => n <= maxVerse);
      starts = fixed;
      for (const v of fixed) {
        if (!srcMap.has(v)) srcMap.set(v, v === 25 ? "s" : "p");
      }
      splitSrc = new Map();
    }

    // 한글에 없는 절 번호 제외
    starts = starts.filter((n) => n >= 1 && n <= maxVerse);
    starts = [...new Set([1, ...starts])].sort((a, b) => a - b);
    out[String(ch)] = starts;

    /** @type {Record<string, string>} */
    const chSrc = {};
    for (const v of starts) {
      chSrc[String(v)] = srcMap.get(v) || (v === 1 ? "s" : "p");
    }
    sources[String(ch)] = chSrc;

    // 이번에 나뉜 절이 모두 fallback이면 기록
    if (splitSrc.size > 0) {
      const onlyFb = [...splitSrc.values()].every((s) => s === "fallback");
      if (onlyFb) fallbackOnlyChapters.push(`${bookId} ${ch}`);
    }

    const singles = countSingles(starts, maxVerse);
    if (starts.length && singles / starts.length > 0.3) {
      stillHigh.push({
        ch,
        singles,
        total: starts.length,
        ratio: singles / starts.length,
      });
    }
  }
  return { out, stillHigh, sources, fallbackOnlyChapters };
}

function whichPara(starts, verse) {
  let cur = starts[0] ?? 1;
  for (const s of starts) {
    if (s <= verse) cur = s;
    else break;
  }
  return cur;
}

function main() {
  const args = process.argv.slice(2);
  const books = loadBooks();
  const ids = args.includes("--all")
    ? [...books.keys()]
    : args.filter((a) => !a.startsWith("--"));
  if (!ids.length) {
    console.error("사용: node scripts/build-paragraphs.mjs --all | <bookId …>");
    process.exit(1);
  }

  ensureUsfm();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(SRC_DIR, { recursive: true });
  seedRawFromPublic(ids);

  // raw가 비어 있으면(시드 실패) 파서로 생성
  for (const id of ids) {
    const rawPath = path.join(RAW_DIR, `${id}.json`);
    if (fs.existsSync(rawPath)) continue;
    const total = books.get(id);
    const { out } = buildRawBook(id, total);
    fs.writeFileSync(rawPath, JSON.stringify(out) + "\n");
    console.log(`[raw] built ${id}`);
  }

  let singlesBefore = 0;
  let singlesAfter = 0;
  let longBefore = 0;
  let longAfter = 0;
  /** @type {{ key: string, before: number, after: number, totalAfter: number, ratio: number }[]} */
  const chapterSingles = [];
  /** @type {string[]} */
  const stillOver30 = [];
  /** @type {{ key: string, singles: number, total: number, ratio: number }[]} */
  const over30Rows = [];
  /** @type {Record<string, Record<string, number[]>>} */
  const refinedAll = {};
  /** @type {Record<string, Record<string, number[]>>} */
  const beforeSnap = {};
  const john1Public = fs.existsSync(path.join(OUT_DIR, "john1.json"))
    ? JSON.parse(fs.readFileSync(path.join(OUT_DIR, "john1.json"), "utf8"))
    : null;
  /** @type {string[]} */
  const mismatchLines = [];
  /** @type {string[]} */
  const allFallbackOnly = [];

  for (const id of ids) {
    const total = books.get(id);
    if (!total) continue;
    const raw = JSON.parse(
      fs.readFileSync(path.join(RAW_DIR, `${id}.json`), "utf8"),
    );
    const pubBefore = fs.existsSync(path.join(OUT_DIR, `${id}.json`))
      ? JSON.parse(fs.readFileSync(path.join(OUT_DIR, `${id}.json`), "utf8"))
      : null;
    beforeSnap[id] = pubBefore || raw;
    const meta = buildRawBook(id, total);
    // raw 파일은 시드된 값 유지. 메타만 파서에서.
    for (const line of meta.mismatches) mismatchLines.push(`${id} ${line}`);
    for (const d of meta.dropped) mismatchLines.push(`${id} dropped ${d}`);

    for (let ch = 1; ch <= total; ch++) {
      const ko = loadKoreanChapter(id, ch);
      const maxV = ko?.max ?? 1;
      const rawStarts = raw[String(ch)] ?? [1];
      singlesBefore += countSingles(rawStarts, maxV);
      longBefore += countLong(rawStarts, maxV);
    }

    // john1: 변경 없으면 기존 public 유지
    if (id === "john1" && john1Public) {
      refinedAll[id] = john1Public;
      fs.writeFileSync(
        path.join(OUT_DIR, "john1.json"),
        JSON.stringify(john1Public) + "\n",
      );
      console.log(`[john1] 변경 없음 — public/paragraphs/john1.json 유지`);
      continue;
    }

    const { out, stillHigh, sources, fallbackOnlyChapters } = refineBook(
      id,
      total,
      raw,
      meta,
    );
    refinedAll[id] = out;
    allFallbackOnly.push(...fallbackOnlyChapters);

    fs.writeFileSync(
      path.join(SRC_DIR, `${id}.json`),
      JSON.stringify(sources, null, 2) + "\n",
    );

    for (let ch = 1; ch <= total; ch++) {
      const ko = loadKoreanChapter(id, ch);
      const maxV = ko?.max ?? 1;
      const before = countSingles(raw[String(ch)] ?? [1], maxV);
      const after = countSingles(out[String(ch)], maxV);
      singlesAfter += after;
      longAfter += countLong(out[String(ch)], maxV);
      const totalAfter = out[String(ch)].length;
      const ratio = totalAfter ? after / totalAfter : 0;
      if (before > 0 || after > 0) {
        chapterSingles.push({
          key: `${id} ${ch}`,
          before,
          after,
          totalAfter,
          ratio,
        });
      }
    }

    for (const s of stillHigh) {
      stillOver30.push(
        `${id} ${s.ch}장: ${s.singles}/${s.total} (${(s.ratio * 100).toFixed(0)}%)`,
      );
      over30Rows.push({
        key: `${id} ${s.ch}`,
        singles: s.singles,
        total: s.total,
        ratio: s.ratio,
      });
    }

    fs.writeFileSync(
      path.join(OUT_DIR, `${id}.json`),
      JSON.stringify(out) + "\n",
    );
    const pc = Object.values(out).reduce((n, a) => n + a.length, 0);
    console.log(`[${id}] raw→refined 단락 ${pc}개 → public/paragraphs/${id}.json`);
  }

  // ── 보고 ──────────────────────────────────────────────────────────────
  console.log("\n=== 1) fallback으로만 나뉜 장 ===");
  console.log(`개수: ${allFallbackOnly.length}`);
  if (allFallbackOnly.length) {
    console.log(allFallbackOnly.join(", "));
  } else {
    console.log("(없음)");
  }

  console.log("\n=== 요엘 2 · 미가 6 · 호세아 4 전→후 ===");
  for (const [id, ch] of [
    ["joel", "2"],
    ["micah", "6"],
    ["hosea", "4"],
  ]) {
    const before = beforeSnap[id]?.[ch] ?? [];
    const after = refinedAll[id]?.[ch] ?? [];
    console.log(
      `- ${id} ${ch}: [${before.join(", ")}] → [${after.join(", ")}]`,
    );
  }
  {
    const j2 = refinedAll.joel?.["2"] ?? [];
    const need = [1, 12, 18, 28];
    const ok = need.every((n) => j2.includes(n));
    console.log(
      `요엘 2 포함 검사 ${need.join(",")}: ${ok ? "OK" : "FAIL → " + JSON.stringify(j2)}`,
    );
  }

  console.log("\n=== 2) 롬 16 ===");
  console.log(
    `romans 16: ${JSON.stringify(refinedAll.romans?.["16"] ?? [])}`,
  );

  console.log("\n=== 3) 1절 비율 >30% 장 ===");
  over30Rows.sort((a, b) => b.ratio - a.ratio || b.singles - a.singles);
  const over30NoLam = over30Rows.filter((r) => !r.key.startsWith("lamentations "));
  console.log(`개수(전체): ${over30Rows.length}`);
  console.log(`개수(애가 제외): ${over30NoLam.length}`);
  console.log("상위 10:");
  for (const row of over30Rows.slice(0, 10)) {
    console.log(
      `  ${row.key}장: ${row.singles}/${row.total} (${(row.ratio * 100).toFixed(0)}%)`,
    );
  }

  console.log("\n=== 1절짜리 단락 개수 전→후 ===");
  console.log(`합계: ${singlesBefore} → ${singlesAfter}`);
  chapterSingles.sort((a, b) => b.after - a.after || b.before - a.before);
  console.log("1절 단락 수 상위 10장 (보정 후):");
  for (const row of chapterSingles.slice(0, 10)) {
    console.log(
      `  ${row.key}장: ${row.before} → ${row.after} (단락 ${row.totalAfter})`,
    );
  }

  console.log("\n=== 12절 넘는 단락 개수 전→후 ===");
  console.log(`${longBefore} → ${longAfter}`);

  console.log("\n=== 장절 차이 처리 ===");
  {
    const rom = refinedAll.romans;
    const j3 = refinedAll.john3;
    const rev = refinedAll.revelation;
    if (rom) {
      console.log(`- 롬 14: ${JSON.stringify(rom["14"] ?? [])}`);
      console.log(`- 롬 16: ${JSON.stringify(rom["16"] ?? [])}`);
    }
    if (j3) console.log(`- 요삼 1: ${JSON.stringify(j3["1"] ?? [])}`);
    if (rev) console.log(`- 계 12: ${JSON.stringify(rev["12"] ?? [])}`);
    if (mismatchLines.length) {
      console.log("차이 목록:");
      for (const l of mismatchLines) console.log(`  ${l}`);
    }
  }

  console.log("\n=== 샘플 (보정 후) ===");
  for (const [id, ch] of [
    ["genesis", "30"],
    ["ecclesiastes", "3"],
    ["romans", "8"],
    ["romans", "16"],
    ["john1", "1"],
  ]) {
    console.log(`- ${id} ${ch}장: ${(refinedAll[id]?.[ch] ?? []).join(", ")}`);
  }

  if (john1Public && refinedAll.john1) {
    const same =
      JSON.stringify(john1Public) === JSON.stringify(refinedAll.john1);
    console.log(`\n=== john1 유지: ${same ? "동일" : "변경됨(확인 필요)"} ===`);
  }
}

main();
