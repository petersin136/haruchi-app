// =============================================================================
// WEB(World English Bible) 구약 39권 + 신약 27권 본문을
// TehShrike/world-english-bible (퍼블릭 도메인) GitHub raw 에서 받아
// .cache/web/<bookId>.json 으로 저장한다.
//
// 입력 형식 (TehShrike 의 typed event stream):
//   [{ type: "paragraph text", chapterNumber, verseNumber, value }, ...]
//   각주는 "footnote" / "footnote start" / "footnote end" 등 별도 type 으로
//   분리되어 있어 본문에 섞이지 않는다(jsDelivr wldeh API 와의 차이점).
//
// 출력 스키마:
//   {
//     book: "<haruchi bookId>",
//     chapters: [
//       { chapter: 1, verses: [{ n: 1, t: "Paul, a servant…" }, ...] }
//     ]
//   }
//
// 책 ID 매핑은 우리 앱과 거의 동일(예: corinthians1 → 1corinthians).
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const cacheDir = path.join(repoRoot, ".cache", "web");
fs.mkdirSync(cacheDir, { recursive: true });

const OT_BOOKS = [
  { id: "genesis", slug: "genesis" },
  { id: "exodus", slug: "exodus" },
  { id: "leviticus", slug: "leviticus" },
  { id: "numbers", slug: "numbers" },
  { id: "deuteronomy", slug: "deuteronomy" },
  { id: "joshua", slug: "joshua" },
  { id: "judges", slug: "judges" },
  { id: "ruth", slug: "ruth" },
  { id: "samuel1", slug: "1samuel" },
  { id: "samuel2", slug: "2samuel" },
  { id: "kings1", slug: "1kings" },
  { id: "kings2", slug: "2kings" },
  { id: "chronicles1", slug: "1chronicles" },
  { id: "chronicles2", slug: "2chronicles" },
  { id: "ezra", slug: "ezra" },
  { id: "nehemiah", slug: "nehemiah" },
  { id: "esther", slug: "esther" },
  { id: "job", slug: "job" },
  { id: "psalms", slug: "psalms" },
  { id: "proverbs", slug: "proverbs" },
  { id: "ecclesiastes", slug: "ecclesiastes" },
  { id: "songofsolomon", slug: "songofsolomon" },
  { id: "isaiah", slug: "isaiah" },
  { id: "jeremiah", slug: "jeremiah" },
  { id: "lamentations", slug: "lamentations" },
  { id: "ezekiel", slug: "ezekiel" },
  { id: "daniel", slug: "daniel" },
  { id: "hosea", slug: "hosea" },
  { id: "joel", slug: "joel" },
  { id: "amos", slug: "amos" },
  { id: "obadiah", slug: "obadiah" },
  { id: "jonah", slug: "jonah" },
  { id: "micah", slug: "micah" },
  { id: "nahum", slug: "nahum" },
  { id: "habakkuk", slug: "habakkuk" },
  { id: "zephaniah", slug: "zephaniah" },
  { id: "haggai", slug: "haggai" },
  { id: "zechariah", slug: "zechariah" },
  { id: "malachi", slug: "malachi" },
];

const NT_BOOKS = [
  { id: "matthew", slug: "matthew" },
  { id: "mark", slug: "mark" },
  { id: "luke", slug: "luke" },
  { id: "john", slug: "john" },
  { id: "acts", slug: "acts" },
  { id: "romans", slug: "romans" },
  { id: "corinthians1", slug: "1corinthians" },
  { id: "corinthians2", slug: "2corinthians" },
  { id: "galatians", slug: "galatians" },
  { id: "ephesians", slug: "ephesians" },
  { id: "philippians", slug: "philippians" },
  { id: "colossians", slug: "colossians" },
  { id: "thessalonians1", slug: "1thessalonians" },
  { id: "thessalonians2", slug: "2thessalonians" },
  { id: "timothy1", slug: "1timothy" },
  { id: "timothy2", slug: "2timothy" },
  { id: "titus", slug: "titus" },
  { id: "philemon", slug: "philemon" },
  { id: "hebrews", slug: "hebrews" },
  { id: "james", slug: "james" },
  { id: "peter1", slug: "1peter" },
  { id: "peter2", slug: "2peter" },
  { id: "john1", slug: "1john" },
  { id: "john2", slug: "2john" },
  { id: "john3", slug: "3john" },
  { id: "jude", slug: "jude" },
  { id: "revelation", slug: "revelation" },
];

async function fetchJson(url, attempt = 0) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return await res.json();
  } catch (e) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      return fetchJson(url, attempt + 1);
    }
    throw e;
  }
}

// TehShrike 이벤트 스트림 → 절 단위 텍스트.
//   - paragraph text / line text 의 value 만 절 번호 기준으로 합친다.
//   - footnote / footnote start...end / footnote text 는 본문에 합치지 않는다.
//   - paragraph end / line break / break 사이의 공백은 한 칸 공백으로 정리.
function streamToChapters(events) {
  // chapter -> Map<verseNumber, string[]>
  const chapters = new Map();
  let inFootnote = 0;
  for (const ev of events) {
    if (!ev || typeof ev !== "object") continue;
    if (typeof ev.type !== "string") continue;
    // 각주 영역은 본문 합치기에서 제외.
    if (ev.type === "footnote start" || ev.type === "footnote") {
      inFootnote += 1;
      continue;
    }
    if (ev.type === "footnote end") {
      inFootnote = Math.max(0, inFootnote - 1);
      continue;
    }
    if (inFootnote > 0) continue;

    if (
      (ev.type === "paragraph text" ||
        ev.type === "line text" ||
        ev.type === "stanza text") &&
      typeof ev.chapterNumber === "number" &&
      typeof ev.verseNumber === "number" &&
      typeof ev.value === "string"
    ) {
      const ch = ev.chapterNumber;
      const v = ev.verseNumber;
      let chMap = chapters.get(ch);
      if (!chMap) {
        chMap = new Map();
        chapters.set(ch, chMap);
      }
      const arr = chMap.get(v) ?? [];
      arr.push(ev.value);
      chMap.set(v, arr);
    }
  }
  // 정렬 + 텍스트 정규화.
  const chapterArr = [...chapters.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([chapter, vMap]) => {
      const verses = [...vMap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([n, parts]) => ({
          n,
          t: parts.join(" ").replace(/\s+/g, " ").trim(),
        }));
      return { chapter, verses };
    });
  return chapterArr;
}

async function downloadBook(book, force) {
  const outPath = path.join(cacheDir, `${book.id}.json`);
  if (!force && fs.existsSync(outPath)) {
    console.log(`✔︎ skip ${book.id} (already cached)`);
    return;
  }
  const url = `https://raw.githubusercontent.com/TehShrike/world-english-bible/master/json/${book.slug}.json`;
  const events = await fetchJson(url);
  const chapters = streamToChapters(events);
  const out = { book: book.id, chapters };
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(
    `✅ ${book.id} → ${outPath} (${chapters.length} chapters, ${chapters.reduce(
      (s, c) => s + c.verses.length,
      0,
    )} verses)`,
  );
}

async function main() {
  const force = process.argv.includes("--force");
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const only = onlyArg ? onlyArg.slice("--only=".length).split(",") : null;
  // 기본은 OT+NT 전체. `--only=<ids>` 또는 `--ot` / `--nt` 로 한정 가능.
  const wantOT = !process.argv.includes("--nt");
  const wantNT = !process.argv.includes("--ot");
  const pool = [
    ...(wantOT ? OT_BOOKS : []),
    ...(wantNT ? NT_BOOKS : []),
  ];
  const list = only ? pool.filter((b) => only.includes(b.id)) : pool;
  for (const b of list) {
    try {
      await downloadBook(b, force);
    } catch (e) {
      console.error(`❌ ${b.id} 실패:`, e.message);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
