// =============================================================================
// 절 단위 영상 시간(초) JSON 생성.
//
// 입력:
//   app/watch/data/<book>-chapters.ts  — 장 시작 초·videoId (현재 genesis)
//   public/bible-study/chunks/<book>/<ch>/korean.json — 개역한글 절 본문
//   data/verse-times-fix/<book>.json — 선택적 사람 보정 {"1:14": 121.3}
//
// 산출:
//   public/watch-times/<book>.json
//   { "videoId", "chapters": { "1": { start, end, verses:[...] } }, "missing": [...] }
//
// 규칙:
//   - 장 끝 = 바로 다음 장의 시작. 50장 끝 = 영상 길이(기본 14690초 = 4:04:50)
//   - 장 시작이 없거나, 다음 장 시작이 없어 끝을 알 수 없으면 missing
//     (예: 6장 시작만 있고 7장이 null → 6장도 missing)
//   - 절 시작 = 장시작+2 + (앞 절 글자수 합 / 장 전체 글자수) × (장길이−2)
//     글자수: 공백·문장부호 제외
//   - 보정값이 있으면 보정 앵커 사이 절을 다시 비율 분배
//   - 소수 1자리
//
// 사용:
//   node scripts/build-verse-times.mjs genesis
//   node scripts/build-verse-times.mjs genesis --duration 14690
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const TITLE_PAD_SEC = 2;
const DEFAULT_DURATION_SEC = 14690; // 4:04:50

function parseArgs(argv) {
  const args = argv.slice(2);
  const bookId = args.find((a) => !a.startsWith("--")) || "genesis";
  const di = args.indexOf("--duration");
  const duration = di >= 0 ? Number(args[di + 1]) : DEFAULT_DURATION_SEC;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`잘못된 --duration: ${args[di + 1]}`);
  }
  return { bookId, duration };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/** 공백·문장부호·기호 제외 글자 수 */
function charCount(text) {
  return String(text || "")
    .replace(/[\s\p{P}\p{S}]/gu, "")
    .length;
}

function readChapterMeta(bookId) {
  const tsPath = path.join(repoRoot, "app", "watch", "data", `${bookId}-chapters.ts`);
  if (!fs.existsSync(tsPath)) {
    throw new Error(`장 시작 파일 없음: ${tsPath}`);
  }
  const src = fs.readFileSync(tsPath, "utf8");
  const idM = src.match(/export const \w+_VIDEO_ID\s*=\s*"([^"]+)"/);
  const startsM = src.match(/KNOWN_STARTS\s*:\s*number\[\]\s*=\s*\[([^\]]*)\]/);
  const totalM = src.match(/TOTAL_CHAPTERS\s*=\s*(\d+)/);
  if (!idM || !startsM || !totalM) {
    throw new Error(`videoId/KNOWN_STARTS/TOTAL_CHAPTERS 파싱 실패: ${tsPath}`);
  }
  const known = startsM[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
  const total = Number(totalM[1]);
  const starts = Array.from({ length: total }, (_, i) =>
    Number.isFinite(known[i]) ? known[i] : null,
  );
  return { videoId: idM[1], starts, totalChapters: total };
}

function loadKoreanVerses(bookId, chapter) {
  const p = path.join(
    repoRoot,
    "public",
    "bible-study",
    "chunks",
    bookId,
    String(chapter),
    "korean.json",
  );
  if (!fs.existsSync(p)) {
    throw new Error(`korean.json 없음: ${p}`);
  }
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  const list = data.verses?.krv;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`절 본문 없음: ${p}`);
  }
  return list
    .slice()
    .sort((a, b) => a.n - b.n)
    .map((v) => ({ n: v.n, t: v.t || "", chars: charCount(v.t || "") }));
}

function loadFixes(bookId) {
  const p = path.join(repoRoot, "data", "verse-times-fix", `${bookId}.json`);
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/**
 * 앵커 사이 비율 분배.
 * anchors: [{ v: verseIndex1based or n+1, t }]
 */
function distribute(verses, anchors) {
  const n = verses.length;
  const times = new Array(n).fill(0);
  const sorted = anchors.slice().sort((a, b) => a.v - b.v || a.t - b.t);

  const uniq = [];
  for (const a of sorted) {
    if (uniq.length && uniq[uniq.length - 1].v === a.v) {
      uniq[uniq.length - 1] = a;
    } else {
      uniq.push(a);
    }
  }

  for (let i = 0; i < uniq.length - 1; i++) {
    const a = uniq[i];
    const b = uniq[i + 1];
    const from = a.v;
    const to = b.v - 1;
    if (to < from) continue;

    let charSum = 0;
    for (let v = from; v <= to; v++) charSum += verses[v - 1].chars;
    if (charSum <= 0) {
      for (let v = from; v <= to; v++) times[v - 1] = a.t;
      continue;
    }

    let cum = 0;
    for (let v = from; v <= to; v++) {
      times[v - 1] = a.t + (cum / charSum) * (b.t - a.t);
      cum += verses[v - 1].chars;
    }
  }
  return times;
}

function buildChapter({ start, end, verses, fixes, chapterNum }) {
  const contentStart = start + TITLE_PAD_SEC;
  if (end <= contentStart) {
    throw new Error(`${chapterNum}장: end(${end}) <= contentStart(${contentStart})`);
  }

  const anchors = [
    { v: 1, t: contentStart },
    { v: verses.length + 1, t: end },
  ];

  for (const [ref, t] of Object.entries(fixes)) {
    const m = /^(\d+):(\d+)$/.exec(ref);
    if (!m) continue;
    if (Number(m[1]) !== chapterNum) continue;
    const vn = Number(m[2]);
    if (vn < 1 || vn > verses.length) continue;
    const tv = Number(t);
    if (!Number.isFinite(tv)) continue;
    anchors.push({ v: vn, t: tv });
  }

  return {
    start: round1(start),
    end: round1(end),
    verses: distribute(verses, anchors).map(round1),
  };
}

function main() {
  const { bookId, duration } = parseArgs(process.argv);
  const { videoId, starts, totalChapters } = readChapterMeta(bookId);
  const allFixes = loadFixes(bookId);

  const chapters = {};
  const missing = [];

  for (let i = 0; i < totalChapters; i++) {
    const ch = i + 1;
    const start = starts[i];
    if (start === null || start === undefined || !Number.isFinite(start)) {
      missing.push(ch);
      continue;
    }

    let end;
    if (ch === totalChapters) {
      // 마지막 장(50): 영상 길이
      end = duration;
    } else {
      const nextStart = starts[i + 1];
      if (nextStart === null || nextStart === undefined || !Number.isFinite(nextStart)) {
        // 다음 장 시작이 없어 끝을 알 수 없음 → 이 장도 missing
        missing.push(ch);
        continue;
      }
      end = nextStart;
    }

    const verses = loadKoreanVerses(bookId, ch);
    chapters[String(ch)] = buildChapter({
      start,
      end,
      verses,
      fixes: allFixes,
      chapterNum: ch,
    });
  }

  const out = { videoId, chapters, missing };
  const outDir = path.join(repoRoot, "public", "watch-times");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${bookId}.json`);
  const json = JSON.stringify(out);
  fs.writeFileSync(outPath, json);

  console.log(`videoId=${videoId} duration=${duration}`);
  console.log(`chapters=${Object.keys(chapters).length}, missing=${missing.length}`);
  console.log(`wrote ${outPath} (${Buffer.byteLength(json)} bytes)`);
  console.log(`missing: ${missing.join(", ")}`);
}

main();
