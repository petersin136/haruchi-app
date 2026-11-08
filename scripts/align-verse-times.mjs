// =============================================================================
// 유튜브 자막 타임스탬프 ↔ 개역한글 절 정렬 → public/watch-times/<bookId>.json
//
// 입력:
//   public/watch-times/manifest.json          (videoId·장 범위)
//   .cache/watch-manifest/videos-meta.json    (durationSec, 없으면 json3 마지막 시각)
//   .cache/transcript/<bookId>-json3.json     (우선 — asr json3, 단어별 tOffsetMs)
//   .cache/transcript/<bookId>.json|.txt      (json3 없을 때만)
//   public/bible-study/chunks/<bookId>/<ch>/korean.json
//   data/verse-times-fix/<bookId>.json       (선택, {"1:14":121.3} 최우선)
//
// 산출: public/watch-times/<bookId>.json  (숫자만, 자막 본문 미포함)
//   chapters[장].src[i] — word / seg / interp / fix
//   chapters[장].videoId — 여러 편으로 나뉜 책만 (한 편이면 루트 videoId)
//
// 장 시작: 시편 "N편", 그 외 "N장". 1장짜리·라벨 없는 장은 1:1 첫 어절 시각.
// 소개·책 제목 낭독은 1:1 이전(장 시작 ≠ 영상 0초).
//
// 사용:
//   node scripts/align-verse-times.mjs genesis
//   node scripts/align-verse-times.mjs leviticus ruth psalms jonah john1
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

/** books.ts 복사 — 이름·장수·장 단위(시편=편) */
const BOOK_META = {
  genesis: { bookName: "창세기", totalChapters: 50, unit: "장" },
  exodus: { bookName: "출애굽기", totalChapters: 40, unit: "장" },
  leviticus: { bookName: "레위기", totalChapters: 27, unit: "장" },
  numbers: { bookName: "민수기", totalChapters: 36, unit: "장" },
  deuteronomy: { bookName: "신명기", totalChapters: 34, unit: "장" },
  joshua: { bookName: "여호수아", totalChapters: 24, unit: "장" },
  judges: { bookName: "사사기", totalChapters: 21, unit: "장" },
  ruth: { bookName: "룻기", totalChapters: 4, unit: "장" },
  samuel1: { bookName: "사무엘상", totalChapters: 31, unit: "장" },
  samuel2: { bookName: "사무엘하", totalChapters: 24, unit: "장" },
  kings1: { bookName: "열왕기상", totalChapters: 22, unit: "장" },
  kings2: { bookName: "열왕기하", totalChapters: 25, unit: "장" },
  chronicles1: { bookName: "역대상", totalChapters: 29, unit: "장" },
  chronicles2: { bookName: "역대하", totalChapters: 36, unit: "장" },
  ezra: { bookName: "에스라", totalChapters: 10, unit: "장" },
  nehemiah: { bookName: "느헤미야", totalChapters: 13, unit: "장" },
  esther: { bookName: "에스더", totalChapters: 10, unit: "장" },
  job: { bookName: "욥기", totalChapters: 42, unit: "장" },
  psalms: { bookName: "시편", totalChapters: 150, unit: "편" },
  proverbs: { bookName: "잠언", totalChapters: 31, unit: "장" },
  ecclesiastes: { bookName: "전도서", totalChapters: 12, unit: "장" },
  songofsolomon: { bookName: "아가", totalChapters: 8, unit: "장" },
  isaiah: { bookName: "이사야", totalChapters: 66, unit: "장" },
  jeremiah: { bookName: "예레미야", totalChapters: 52, unit: "장" },
  lamentations: { bookName: "예레미야애가", totalChapters: 5, unit: "장" },
  ezekiel: { bookName: "에스겔", totalChapters: 48, unit: "장" },
  daniel: { bookName: "다니엘", totalChapters: 12, unit: "장" },
  hosea: { bookName: "호세아", totalChapters: 14, unit: "장" },
  joel: { bookName: "요엘", totalChapters: 3, unit: "장" },
  amos: { bookName: "아모스", totalChapters: 9, unit: "장" },
  obadiah: { bookName: "오바댜", totalChapters: 1, unit: "장" },
  jonah: { bookName: "요나", totalChapters: 4, unit: "장" },
  micah: { bookName: "미가", totalChapters: 7, unit: "장" },
  nahum: { bookName: "나훔", totalChapters: 3, unit: "장" },
  habakkuk: { bookName: "하박국", totalChapters: 3, unit: "장" },
  zephaniah: { bookName: "스바냐", totalChapters: 3, unit: "장" },
  haggai: { bookName: "학개", totalChapters: 2, unit: "장" },
  zechariah: { bookName: "스가랴", totalChapters: 14, unit: "장" },
  malachi: { bookName: "말라기", totalChapters: 4, unit: "장" },
  matthew: { bookName: "마태복음", totalChapters: 28, unit: "장" },
  mark: { bookName: "마가복음", totalChapters: 16, unit: "장" },
  luke: { bookName: "누가복음", totalChapters: 24, unit: "장" },
  john: { bookName: "요한복음", totalChapters: 21, unit: "장" },
  acts: { bookName: "사도행전", totalChapters: 28, unit: "장" },
  romans: { bookName: "로마서", totalChapters: 16, unit: "장" },
  corinthians1: { bookName: "고린도전서", totalChapters: 16, unit: "장" },
  corinthians2: { bookName: "고린도후서", totalChapters: 13, unit: "장" },
  galatians: { bookName: "갈라디아서", totalChapters: 6, unit: "장" },
  ephesians: { bookName: "에베소서", totalChapters: 6, unit: "장" },
  philippians: { bookName: "빌립보서", totalChapters: 4, unit: "장" },
  colossians: { bookName: "골로새서", totalChapters: 4, unit: "장" },
  thessalonians1: { bookName: "데살로니가전서", totalChapters: 5, unit: "장" },
  thessalonians2: { bookName: "데살로니가후서", totalChapters: 3, unit: "장" },
  timothy1: { bookName: "디모데전서", totalChapters: 6, unit: "장" },
  timothy2: { bookName: "디모데후서", totalChapters: 4, unit: "장" },
  titus: { bookName: "디도서", totalChapters: 3, unit: "장" },
  philemon: { bookName: "빌레몬서", totalChapters: 1, unit: "장" },
  hebrews: { bookName: "히브리서", totalChapters: 13, unit: "장" },
  james: { bookName: "야고보서", totalChapters: 5, unit: "장" },
  peter1: { bookName: "베드로전서", totalChapters: 5, unit: "장" },
  peter2: { bookName: "베드로후서", totalChapters: 3, unit: "장" },
  john1: { bookName: "요한일서", totalChapters: 5, unit: "장" },
  john2: { bookName: "요한이서", totalChapters: 1, unit: "장" },
  john3: { bookName: "요한삼서", totalChapters: 1, unit: "장" },
  jude: { bookName: "유다서", totalChapters: 1, unit: "장" },
  revelation: { bookName: "요한계시록", totalChapters: 22, unit: "장" },
};

function loadBookConfig(bookId) {
  const meta = BOOK_META[bookId];
  if (!meta) throw new Error(`알 수 없는 bookId: ${bookId}`);
  const manifestPath = path.join(repoRoot, "public", "watch-times", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const parts = manifest[bookId];
  if (!Array.isArray(parts) || !parts.length) {
    throw new Error(`manifest.json 에 ${bookId} 항목이 없습니다`);
  }
  const videosMetaPath = path.join(repoRoot, ".cache", "watch-manifest", "videos-meta.json");
  const durById = {};
  if (fs.existsSync(videosMetaPath)) {
    const vm = JSON.parse(fs.readFileSync(videosMetaPath, "utf8"));
    for (const v of vm.videos || []) durById[v.videoId] = v.durationSec;
  }
  const primaryVideoId = parts[0].videoId;
  let durationSec = durById[primaryVideoId] || null;
  const unit = meta.unit;
  const escaped = meta.bookName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const chapterLabelRe = new RegExp(
    `(?:${escaped}\\s*)?(\\d{1,3})\\s*${unit}`,
    "g",
  );
  return {
    bookId,
    bookName: meta.bookName,
    totalChapters: meta.totalChapters,
    unit,
    videoId: primaryVideoId,
    parts,
    durationSec,
    chapterLabelRe,
    multiVideo: parts.length > 1 || parts.some((p) => p.from !== 1 || p.to !== meta.totalChapters),
  };
}

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

function resolveBookIds(argv) {
  const args = argv.filter((a) => !a.startsWith("-"));
  if (!args.length) {
    console.error(
      "사용법: node scripts/align-verse-times.mjs <bookId> [bookId…]\n" +
        `지원: ${Object.keys(BOOK_META).join(", ")}`,
    );
    process.exit(1);
  }
  for (const arg of args) {
    if (!BOOK_META[arg]) {
      console.error(`알 수 없는 bookId: ${arg}`);
      process.exit(1);
    }
  }
  return args;
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

/** 한글 수사 → 숫자 (ASR이 "삼장"처럼 읽는 경우). 1~150 */
const KO_NUM = (() => {
  const dig = { 영: 0, 공: 0, 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 륙: 6, 칠: 7, 팔: 8, 구: 9 };
  const map = new Map();
  for (let n = 1; n <= 150; n++) {
    let s;
    if (n < 10) s = Object.keys(dig).find((k) => dig[k] === n);
    else if (n === 10) s = "십";
    else if (n < 20) s = "십" + Object.keys(dig).find((k) => dig[k] === n - 10);
    else if (n % 10 === 0 && n < 100) {
      s = Object.keys(dig).find((k) => dig[k] === n / 10) + "십";
    } else if (n < 100) {
      s =
        Object.keys(dig).find((k) => dig[k] === Math.floor(n / 10)) +
        "십" +
        Object.keys(dig).find((k) => dig[k] === n % 10);
    } else if (n === 100) s = "백";
    else if (n < 110) s = "백" + (n === 100 ? "" : n === 101 ? "일" : Object.keys(dig).find((k) => dig[k] === n - 100) || "");
    else if (n < 120) s = "백십" + (n === 110 ? "" : Object.keys(dig).find((k) => dig[k] === n - 110) || "");
    else if (n < 150) {
      const tens = Math.floor((n - 100) / 10);
      const ones = n % 10;
      s =
        "백" +
        Object.keys(dig).find((k) => dig[k] === tens) +
        "십" +
        (ones ? Object.keys(dig).find((k) => dig[k] === ones) : "");
    }
    if (s) map.set(s, n);
  }
  // 자주 쓰이는 변형
  map.set("한", 1);
  map.set("두", 2);
  map.set("세", 3);
  map.set("네", 4);
  map.set("다섯", 5);
  map.set("여섯", 6);
  map.set("일곱", 7);
  map.set("여덟", 8);
  map.set("아홉", 9);
  map.set("열", 10);
  return map;
})();

function parseChapterToken(norm, unit) {
  // 숫자: "3장" / "23편" / ASR 오인식 "22편네"
  // ※ "제사장" 같은 본문 단어에 한글 수사+장을 붙이면 안 됨 → 한글은 완전일치만
  const m = new RegExp(`^(\\d{1,3})${unit}`).exec(norm);
  if (m) return Number(m[1]);
  // 삼장 / 십이편 (완전 일치만 — endsWith 금지: 제사장→사장=4장 오탐)
  for (const [ko, n] of KO_NUM) {
    if (norm === ko + unit) return n;
  }
  return null;
}

/**
 * 장/편 안내 첫 단어 시각.
 * 중간에 라벨이 빠져도(10장 누락 등) 이후 번호를 버리지 않는다.
 * 시각이 단조 증가하는 첫 등장만 채택.
 */
function extractChapterStartsFromSegs(segs, totalChapters, bookName, unit = "장") {
  /** @type {Map<number, number>} */
  const starts = new Map();
  let lastT = -1;
  let lastN = 0;
  for (let i = 0; i < segs.length; i++) {
    const n = parseChapterToken(segs[i].norm, unit);
    if (n == null || n < 1 || n > totalChapters || starts.has(n)) continue;
    // 번호가 크게 역행하면 본문 속 "N장" 오탐 가능 → 건너뜀
    // (작은 역행은 허용하지 않음: 이미 지난 번호)
    if (n <= lastN && lastN > 0) continue;
    const prev = segs[i - 1];
    const t =
      prev &&
      (prev.norm === bookName || prev.norm.endsWith(bookName)) &&
      segs[i].t - prev.t < 3
        ? prev.t
        : segs[i].t;
    if (t <= lastT) continue;
    starts.set(n, t);
    lastT = t;
    lastN = n;
  }
  return starts;
}

/**
 * 라벨이 없는 장 — 절 본문이 자막에 처음 나오는 시각.
 * 1절만이 아니라 장 안 여러 절 앞부분을 순서대로 시도(번역 차이·ASR 공백 대비).
 * afterSec 직후 MIN_AFTER 초 이내는 이전 장 본문으로 보고 건너뜀.
 */
function findVerseStartInSegs(segs, verseText, afterSec = 0, beforeSec = Infinity, minAfter = 0) {
  const words = String(verseText || "")
    .trim()
    .split(/\s+/)
    .map((w) => normalize(w))
    .filter(Boolean);
  if (!words.length) return null;
  const needle = words.slice(0, Math.min(4, words.length)).join("");
  if (needle.length < 2) return null;
  const earliest = afterSec + minAfter;
  const needLen = Math.min(needle.length, Math.max(8, Math.floor(needle.length * 0.6)));
  for (let i = 0; i < segs.length; i++) {
    if (segs[i].t < earliest || segs[i].t >= beforeSec) continue;
    let joined = "";
    for (let k = 0; k < 10 && i + k < segs.length; k++) {
      joined += segs[i + k].norm;
      if (joined.length < needLen) continue;
      const a = needle.slice(0, needLen);
      const b = joined.slice(0, needLen);
      const dist = levenshtein(a, b);
      if (a === b || dist <= Math.max(1, Math.floor(needLen * 0.2))) {
        return segs[i].t;
      }
      break; // 이 시작 위치에서 충분히 모였는데 불일치 → 다음 단어로
    }
  }
  return null;
}

/** 여러 장에 반복되는 서두 — 장 시작 추정 때 뒤로 미룸 */
function isFormulaOpening(text) {
  const t = String(text || "").replace(/\s+/g, "");
  return /^(여호와께서모세에게|여호와께서모세와아론|여호와께서모세와)/.test(t);
}

/** 장 전체 절을 훑어 첫 매칭. 실패 시 null */
function findChapterContentStart(segs, verses, afterSec, beforeSec) {
  // 이전 장 구간 앞부분은 건너뜀(긴 장일수록 비율↑)
  const span = beforeSec < Infinity ? beforeSec - afterSec : 120;
  const minAfter = Math.min(Math.max(40, span * 0.25), span * 0.7);
  const ordered = [
    ...verses.filter((v) => !isFormulaOpening(v.text)),
    ...verses.filter((v) => isFormulaOpening(v.text)),
  ];
  for (const v of ordered) {
    const t = findVerseStartInSegs(segs, v.text, afterSec, beforeSec, minAfter);
    if (t != null) return { t, via: `${v.n}` };
  }
  if (verses[0]) {
    const t = findVerseStartInSegs(segs, verses[0].text, afterSec, beforeSec, Math.min(20, minAfter));
    if (t != null) return { t, via: "1-loose" };
  }
  return null;
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

function videoIdForChapter(cfg, ch) {
  const hit = cfg.parts.find((p) => ch >= p.from && ch <= p.to);
  return hit?.videoId || cfg.videoId;
}

function durationFromSegs(segs) {
  if (!segs?.length) return null;
  const last = segs[segs.length - 1];
  return Math.max(last.t + 2, Math.ceil(last.t));
}

/**
 * 장 시작 채우기:
 * 1) 라벨(N장/N편)
 * 2) 빠진 장은 해당 장 1:1 첫 어절 시각 (이전 장 끝 이후)
 * 3) 그래도 없으면 null → missing
 * 예외 로그를 exceptions 에 남김.
 */
function resolveChapterStarts(cfg, segs, events, exceptions) {
  const { totalChapters, bookName, unit, chapterLabelRe } = cfg;
  /** @type {Map<number, number>} */
  const starts = new Map();

  if (events?.length) {
    for (const [ch, t] of extractChapterStarts(events, totalChapters, chapterLabelRe)) {
      starts.set(ch, t);
    }
  }
  if (segs) {
    const precise = extractChapterStartsFromSegs(segs, totalChapters, bookName, unit);
    for (const [ch, t] of precise) {
      const old = starts.get(ch);
      if (old == null || Math.abs(old - t) < 15) starts.set(ch, t);
      else {
        exceptions.push({
          type: "label-conflict",
          ch,
          keep: old,
          discard: t,
          note: `세그 라벨과 json3 라벨 차이 >15s → 기존 유지`,
        });
      }
    }
  }

  // 빠진 장 → 본문 매칭 (1절 우선, 실패 시 다른 절) → 그래도 없으면 이웃 중점
  for (let ch = 1; ch <= totalChapters; ch++) {
    if (starts.has(ch)) continue;
    if (!segs) continue;
    let after = 0;
    for (let p = ch - 1; p >= 1; p--) {
      if (starts.has(p)) {
        after = starts.get(p);
        break;
      }
    }
    let before = Infinity;
    for (let n = ch + 1; n <= totalChapters; n++) {
      if (starts.has(n)) {
        before = starts.get(n);
        break;
      }
    }
    try {
      const verses = loadKoreanChapter(cfg.bookId, ch);
      const hit = findChapterContentStart(segs, verses, after, before);
      if (hit) {
        starts.set(ch, hit.t);
        exceptions.push({
          type: "verse-fallback",
          ch,
          t: hit.t,
          via: hit.via,
          note: `${unit} 라벨 없음 → ${ch}:${hit.via} 본문 매칭`,
        });
      } else if (before < Infinity && before - after > 60) {
        // ASR 공백·번역 차이로 본문이 안 잡히면 이웃 사이 중점(최후)
        const t = after + (before - after) * 0.5;
        starts.set(ch, t);
        exceptions.push({
          type: "midpoint-fallback",
          ch,
          t,
          note: `${unit} 라벨·본문 매칭 실패 → ${after.toFixed(0)}~${before.toFixed(0)} 중점`,
        });
      }
    } catch (e) {
      exceptions.push({ type: "verse1-error", ch, note: String(e.message || e) });
    }
  }

  // 1장 라벨이 영상 맨 앞(소개)에 너무 붙어 있으면, 1:1 첫 어절이 더 뒤일 때 1:1로 교정
  if (segs && starts.has(1)) {
    try {
      const v1 = loadKoreanChapter(cfg.bookId, 1)[0]?.text;
      const next = starts.get(2) ?? Infinity;
      const v1t = findVerseStartInSegs(segs, v1, 0, next);
      const labelT = starts.get(1);
      // 라벨이 1:1보다 15초 이상 앞서고, 그 사이가 소개/제목으로 보이면
      // 장 시작은 라벨 유지(사용자: 장 시작=N장 단어). 1:1은 절 정렬이 처리.
      // 다만 라벨이 아예 없고 verse1-fallback 만 있으면 OK.
      // 라벨이 0~2초(재생 직후 허위)이고 1:1이 훨씬 뒤면 1:1로 교체
      if (v1t != null && labelT < 3 && v1t - labelT > 5) {
        exceptions.push({
          type: "ch1-relabel",
          ch: 1,
          from: labelT,
          to: v1t,
          note: "맨 앞 허위 라벨 → 1:1 첫 어절로 교정",
        });
        starts.set(1, v1t);
      }
    } catch {
      /* noop */
    }
  }

  return starts;
}

function alignOneBook(bookId) {
  const cfg = loadBookConfig(bookId);
  const { videoId, totalChapters, bookName, unit } = cfg;
  const exceptions = [];

  let events = null;
  try {
    events = loadTranscript(bookId);
  } catch {
    events = null;
  }
  const segs = loadJson3Segs(bookId);
  if (!segs && !events) {
    throw new Error(
      `${bookId}: 자막 없음 (.cache/transcript/${bookId}-json3.json 또는 ${bookId}.json)`,
    );
  }
  if (segs) console.log(`[${bookId}] json3 단어 모드 (조각 ${segs.length}개, unit=${unit})`);
  else console.log(`[${bookId}] 세그먼트 모드`);

  let durationSec = cfg.durationSec;
  if (!durationSec) durationSec = durationFromSegs(segs) || (events?.[events.length - 1]?.start ?? 0) + 30;
  cfg.durationSec = durationSec;

  const chapterStarts = resolveChapterStarts(cfg, segs, events, exceptions);
  const fixes = loadFixes(bookId);
  const srcCount = { word: 0, seg: 0, interp: 0, fix: 0 };
  /** @type {{ref:string, from:number|null, fromSrc:string, to:number, simFrom:number, simTo:number}[]} */
  const prefixLog = [];

  const startList = [];
  for (let ch = 1; ch <= totalChapters; ch++) {
    startList.push(chapterStarts.has(ch) ? chapterStarts.get(ch) : null);
  }

  console.log(`=== [${bookId}] ${bookName} 장/편 시작 (초) duration=${durationSec} ===`);
  const nullCh = [];
  for (let ch = 1; ch <= totalChapters; ch++) {
    const s = startList[ch - 1];
    if (s == null) nullCh.push(ch);
    if (totalChapters <= 40 || ch <= 5 || ch % 10 === 0 || s == null) {
      console.log(`  ${ch}: ${s == null ? "null" : round1(s)}`);
    }
  }
  if (nullCh.length) console.log(`  null 장: ${nullCh.join(", ")}`);

  const chapters = {};
  const missing = [];
  let unmatchedTotal = 0;
  const multiVideo = new Set(cfg.parts.map((p) => p.videoId)).size > 1;

  for (let ch = 1; ch <= totalChapters; ch++) {
    const start = startList[ch - 1];
    if (start == null || !Number.isFinite(start)) {
      missing.push(ch);
      continue;
    }
    let end = durationSec;
    if (ch < totalChapters) {
      // 바로 다음이 비어도 그 뒤 첫 유효 장 시작을 끝으로 씀
      let next = null;
      for (let n = ch + 1; n <= totalChapters; n++) {
        if (startList[n - 1] != null && Number.isFinite(startList[n - 1])) {
          next = startList[n - 1];
          break;
        }
      }
      if (next == null) {
        // 뒤에 기준점이 없으면 이 장만으로는 끝을 확정할 수 없음 → missing
        // (단, 마지막 유효 장이면 duration 사용 — 위에서 end=durationSec)
        const laterExists = startList.slice(ch).some((t) => t != null);
        if (laterExists) {
          missing.push(ch);
          continue;
        }
      } else end = next;
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

    const chOut = {
      start: round1(start),
      end: round1(end),
      verses: finalTimes.map(round1),
      src,
    };
    if (multiVideo) chOut.videoId = videoIdForChapter(cfg, ch);
    chapters[String(ch)] = chOut;
  }

  const outPath = path.join(repoRoot, "public", "watch-times", `${bookId}.json`);
  const out = { videoId, chapters, missing };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const json = JSON.stringify(out);
  fs.writeFileSync(outPath, json);

  const excPath = path.join(repoRoot, ".cache", "watch-manifest", `${bookId}-align-log.json`);
  fs.mkdirSync(path.dirname(excPath), { recursive: true });
  fs.writeFileSync(
    excPath,
    JSON.stringify({ bookId, srcCount, unmatchedTotal, missing, exceptions, prefixLog }, null, 2),
  );

  console.log(`\nwrote ${outPath} (${Buffer.byteLength(json)} bytes)`);
  console.log(`built chapters: ${Object.keys(chapters).length}, missing: ${missing.length}`);
  console.log(`unmatched verses (pre-fill): ${unmatchedTotal}`);
  console.log(`src: ${JSON.stringify(srcCount)}`);
  console.log(`장 시작 예외: ${exceptions.length}`);
  for (const e of exceptions) console.log(`  ${JSON.stringify(e)}`);
  console.log(`앞 ${PREFIX_CHARS}글자 검증으로 옮긴 절: ${prefixLog.length}`);
  for (const r of prefixLog) {
    console.log(
      `  ${r.ref} ${r.from == null ? "-" : round1(r.from)}(${r.fromSrc}, ${r.simFrom.toFixed(2)}) → ${round1(r.to)}(${r.simTo.toFixed(2)})`,
    );
  }
  if (missing.length) console.log(`missing: ${missing.join(", ")}`);
  return { bookId, srcCount, missing, exceptions };
}

function main() {
  const bookIds = resolveBookIds(process.argv.slice(2));
  for (const id of bookIds) alignOneBook(id);
}

main();
