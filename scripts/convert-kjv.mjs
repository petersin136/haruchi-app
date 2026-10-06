// =============================================================================
// KJV(King James Version, 1769) → 하루치 WEB 과 동일한 중간 형식 + 청크.
//
// 원본:
//   data/bible-sources/KJV.json
//   (없으면 scrollmapper/bible_databases formats/json/KJV.json 에서 1회 다운로드)
//   License: Public Domain
//
// 원본 스키마:
//   { translation, books: [{ name, chapters: [{ chapter, verses: [{ verse, text }] }] }] }
//
// 산출:
//   1) .cache/kjv/<bookId>.json          — WEB 캐시와 동일
//        { book, chapters: [{ chapter, verses: [{ n, t }] }] }
//   2) public/bible-kjv/<bookId>.json    — 위와 동일, 저장소에 포함되는 정적 본문
//   3) public/bible-study/chunks/<bookId>/<ch>/kjv.json
//        — english.json 과 같은 장×레이어 청크
//        { chapter, layer: "kjv", verses: { "<한글책명> ch:n": { type:"text", content } } }
//
// 검증:
//   66권 / 1,189장 / 31,102절 인지 확인하고,
//   요한복음 3:16 샘플을 출력하며,
//   WEB(english.json) 과 장·절 수가 다른 곳을 목록으로 찍는다.
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const SOURCE_URL =
  "https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/KJV.json";
const sourcePath = path.join(repoRoot, "data", "bible-sources", "KJV.json");
const cacheDir = path.join(repoRoot, ".cache", "kjv");
const publicBookDir = path.join(repoRoot, "public", "bible-kjv");
const chunksRoot = path.join(repoRoot, "public", "bible-study", "chunks");

// 영어 원본 책명(+별칭) → { id, koName }
// scrollmapper KJV 는 KorRV 와 같이 "I Samuel", "Revelation of John" 표기를 쓴다.
const BOOK_DEFS = [
  ["genesis", "창세기", ["Genesis"]],
  ["exodus", "출애굽기", ["Exodus"]],
  ["leviticus", "레위기", ["Leviticus"]],
  ["numbers", "민수기", ["Numbers"]],
  ["deuteronomy", "신명기", ["Deuteronomy"]],
  ["joshua", "여호수아", ["Joshua"]],
  ["judges", "사사기", ["Judges"]],
  ["ruth", "룻기", ["Ruth"]],
  ["samuel1", "사무엘상", ["I Samuel", "1 Samuel", "1Samuel", "First Samuel"]],
  ["samuel2", "사무엘하", ["II Samuel", "2 Samuel", "2Samuel", "Second Samuel"]],
  ["kings1", "열왕기상", ["I Kings", "1 Kings", "1Kings", "First Kings"]],
  ["kings2", "열왕기하", ["II Kings", "2 Kings", "2Kings", "Second Kings"]],
  [
    "chronicles1",
    "역대상",
    ["I Chronicles", "1 Chronicles", "1Chronicles", "First Chronicles"],
  ],
  [
    "chronicles2",
    "역대하",
    ["II Chronicles", "2 Chronicles", "2Chronicles", "Second Chronicles"],
  ],
  ["ezra", "에스라", ["Ezra"]],
  ["nehemiah", "느헤미야", ["Nehemiah"]],
  ["esther", "에스더", ["Esther"]],
  ["job", "욥기", ["Job"]],
  ["psalms", "시편", ["Psalms", "Psalm", "Psalms of David"]],
  ["proverbs", "잠언", ["Proverbs"]],
  ["ecclesiastes", "전도서", ["Ecclesiastes"]],
  ["songofsolomon", "아가", ["Song of Solomon", "Song of Songs", "Canticles"]],
  ["isaiah", "이사야", ["Isaiah"]],
  ["jeremiah", "예레미야", ["Jeremiah"]],
  ["lamentations", "예레미야애가", ["Lamentations"]],
  ["ezekiel", "에스겔", ["Ezekiel"]],
  ["daniel", "다니엘", ["Daniel"]],
  ["hosea", "호세아", ["Hosea"]],
  ["joel", "요엘", ["Joel"]],
  ["amos", "아모스", ["Amos"]],
  ["obadiah", "오바댜", ["Obadiah"]],
  ["jonah", "요나", ["Jonah"]],
  ["micah", "미가", ["Micah"]],
  ["nahum", "나훔", ["Nahum"]],
  ["habakkuk", "하박국", ["Habakkuk"]],
  ["zephaniah", "스바냐", ["Zephaniah"]],
  ["haggai", "학개", ["Haggai"]],
  ["zechariah", "스가랴", ["Zechariah"]],
  ["malachi", "말라기", ["Malachi"]],
  ["matthew", "마태복음", ["Matthew"]],
  ["mark", "마가복음", ["Mark"]],
  ["luke", "누가복음", ["Luke"]],
  ["john", "요한복음", ["John"]],
  ["acts", "사도행전", ["Acts", "Acts of the Apostles"]],
  ["romans", "로마서", ["Romans"]],
  [
    "corinthians1",
    "고린도전서",
    ["I Corinthians", "1 Corinthians", "1Corinthians", "First Corinthians"],
  ],
  [
    "corinthians2",
    "고린도후서",
    ["II Corinthians", "2 Corinthians", "2Corinthians", "Second Corinthians"],
  ],
  ["galatians", "갈라디아서", ["Galatians"]],
  ["ephesians", "에베소서", ["Ephesians"]],
  ["philippians", "빌립보서", ["Philippians"]],
  ["colossians", "골로새서", ["Colossians"]],
  [
    "thessalonians1",
    "데살로니가전서",
    [
      "I Thessalonians",
      "1 Thessalonians",
      "1Thessalonians",
      "First Thessalonians",
    ],
  ],
  [
    "thessalonians2",
    "데살로니가후서",
    [
      "II Thessalonians",
      "2 Thessalonians",
      "2Thessalonians",
      "Second Thessalonians",
    ],
  ],
  ["timothy1", "디모데전서", ["I Timothy", "1 Timothy", "1Timothy", "First Timothy"]],
  ["timothy2", "디모데후서", ["II Timothy", "2 Timothy", "2Timothy", "Second Timothy"]],
  ["titus", "디도서", ["Titus"]],
  ["philemon", "빌레몬서", ["Philemon"]],
  ["hebrews", "히브리서", ["Hebrews"]],
  ["james", "야고보서", ["James"]],
  ["peter1", "베드로전서", ["I Peter", "1 Peter", "1Peter", "First Peter"]],
  ["peter2", "베드로후서", ["II Peter", "2 Peter", "2Peter", "Second Peter"]],
  ["john1", "요한일서", ["I John", "1 John", "1John", "First John"]],
  ["john2", "요한이서", ["II John", "2 John", "2John", "Second John"]],
  ["john3", "요한삼서", ["III John", "3 John", "3John", "Third John"]],
  ["jude", "유다서", ["Jude"]],
  [
    "revelation",
    "요한계시록",
    ["Revelation of John", "Revelation", "The Revelation", "Apocalypse"],
  ],
];

const EXPECTED_BOOKS = 66;
const EXPECTED_CHAPTERS = 1189;
const EXPECTED_VERSES = 31102;

function normalizeName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
}

function buildNameIndex() {
  const byAlias = new Map();
  for (const [id, koName, aliases] of BOOK_DEFS) {
    for (const a of aliases) {
      byAlias.set(normalizeName(a), { id, koName });
    }
  }
  return byAlias;
}

async function ensureSource() {
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  if (fs.existsSync(sourcePath) && fs.statSync(sourcePath).size > 1000) {
    console.log(`✔︎ 원본 사용: ${path.relative(repoRoot, sourcePath)}`);
    return;
  }
  console.log(`↓ 원본 다운로드: ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${SOURCE_URL}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(sourcePath, buf);
  console.log(
    `✅ 저장 ${path.relative(repoRoot, sourcePath)} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`,
  );
}

function cleanVerseText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function loadWebChapterVerseCounts() {
  const diffs = [];
  const missingWeb = [];
  for (const [id, koName] of BOOK_DEFS.map((d) => [d[0], d[1]])) {
    const bookDir = path.join(chunksRoot, id);
    if (!fs.existsSync(bookDir)) {
      missingWeb.push(id);
      continue;
    }
    // 장 폴더는 숫자 이름만.
    const chDirs = fs
      .readdirSync(bookDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^\d+$/.test(e.name))
      .map((e) => Number(e.name))
      .sort((a, b) => a - b);
    for (const ch of chDirs) {
      const webPath = path.join(bookDir, String(ch), "english.json");
      if (!fs.existsSync(webPath)) continue;
      try {
        const web = JSON.parse(fs.readFileSync(webPath, "utf8"));
        const n = web?.verses ? Object.keys(web.verses).length : 0;
        diffs.push({ id, koName, chapter: ch, webVerses: n });
      } catch {
        diffs.push({ id, koName, chapter: ch, webVerses: null });
      }
    }
  }
  return { diffs, missingWeb };
}

async function main() {
  await ensureSource();
  const raw = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  if (!Array.isArray(raw?.books)) {
    console.error("[abort] 원본에 books 배열이 없습니다.");
    process.exit(1);
  }

  const nameIndex = buildNameIndex();
  const unmatched = [];
  const matchedIds = new Set();
  const byId = new Map();

  for (const book of raw.books) {
    const hit = nameIndex.get(normalizeName(book.name));
    if (!hit) {
      unmatched.push(book.name);
      continue;
    }
    if (matchedIds.has(hit.id)) {
      console.error(`[abort] 중복 매칭: ${book.name} → ${hit.id}`);
      process.exit(1);
    }
    matchedIds.add(hit.id);
    byId.set(hit.id, { src: book, ...hit });
  }

  const missingIds = BOOK_DEFS.filter(([id]) => !matchedIds.has(id)).map(
    ([id, ko]) => `${id} (${ko})`,
  );

  console.log("\n── 책 이름 매칭 ──");
  console.log(`원본 책 수: ${raw.books.length}`);
  console.log(`매칭 성공: ${matchedIds.size} / ${BOOK_DEFS.length}`);
  if (unmatched.length) {
    console.error("매칭 실패(원본 이름):", unmatched);
  }
  if (missingIds.length) {
    console.error("앱 책 중 원본에 없음:", missingIds);
  }
  if (unmatched.length || missingIds.length || matchedIds.size !== 66) {
    console.error("[abort] 66권 매칭이 완료되지 않았습니다.");
    process.exit(1);
  }

  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(publicBookDir, { recursive: true });

  let totalChapters = 0;
  let totalVerses = 0;
  const kjvCounts = new Map(); // `${id}:${ch}` -> verseCount
  let john316 = null;

  for (const [id, koName] of BOOK_DEFS.map((d) => [d[0], d[1]])) {
    const { src } = byId.get(id);
    const chapters = (src.chapters || [])
      .slice()
      .sort((a, b) => a.chapter - b.chapter)
      .map((ch) => {
        const verses = (ch.verses || [])
          .slice()
          .sort((a, b) => a.verse - b.verse)
          .map((v) => ({
            n: v.verse,
            t: cleanVerseText(v.text),
          }))
          .filter((v) => v.t);
        return { chapter: ch.chapter, verses };
      });

    totalChapters += chapters.length;
    const bookVerses = chapters.reduce((s, c) => s + c.verses.length, 0);
    totalVerses += bookVerses;

    for (const c of chapters) {
      kjvCounts.set(`${id}:${c.chapter}`, c.verses.length);
    }

    if (id === "john") {
      const ch3 = chapters.find((c) => c.chapter === 3);
      const v16 = ch3?.verses.find((v) => v.n === 16);
      john316 = v16?.t ?? null;
    }

    const out = { book: id, chapters };
    const pretty = JSON.stringify(out, null, 2) + "\n";
    fs.writeFileSync(path.join(cacheDir, `${id}.json`), pretty, "utf8");
    fs.writeFileSync(path.join(publicBookDir, `${id}.json`), pretty, "utf8");

    for (const c of chapters) {
      const chDir = path.join(chunksRoot, id, String(c.chapter));
      fs.mkdirSync(chDir, { recursive: true });
      const verses = {};
      for (const v of c.verses) {
        verses[`${koName} ${c.chapter}:${v.n}`] = {
          type: "text",
          content: v.t,
        };
      }
      const chunk = { chapter: c.chapter, layer: "kjv", verses };
      fs.writeFileSync(
        path.join(chDir, "kjv.json"),
        JSON.stringify(chunk) + "\n",
        "utf8",
      );
    }

    console.log(
      `✅ ${id.padEnd(16)} ${String(chapters.length).padStart(3)}장  ${String(bookVerses).padStart(5)}절`,
    );
  }

  console.log("\n── 검증 ──");
  const booksOk = matchedIds.size === EXPECTED_BOOKS;
  const chOk = totalChapters === EXPECTED_CHAPTERS;
  const vsOk = totalVerses === EXPECTED_VERSES;
  console.log(
    `책 ${matchedIds.size} (기대 ${EXPECTED_BOOKS}) ${booksOk ? "OK" : "FAIL"}`,
  );
  console.log(
    `장 ${totalChapters} (기대 ${EXPECTED_CHAPTERS}) ${chOk ? "OK" : "FAIL"}`,
  );
  console.log(
    `절 ${totalVerses} (기대 ${EXPECTED_VERSES}) ${vsOk ? "OK" : "FAIL"}`,
  );
  console.log(`요한복음 3:16 (KJV): ${john316 ?? "(없음)"}`);

  console.log("\n── WEB(english.json) 대비 장·절 수 차이 ──");
  const { diffs: webChapters, missingWeb } = loadWebChapterVerseCounts();
  if (missingWeb.length) {
    console.log("WEB 청크 폴더 없음:", missingWeb.join(", "));
  }
  const reports = [];
  const onlyKjv = [];
  const onlyWeb = [];
  for (const [id] of BOOK_DEFS.map((d) => [d[0]])) {
    const kjvChs = [...kjvCounts.keys()]
      .filter((k) => k.startsWith(`${id}:`))
      .map((k) => Number(k.split(":")[1]));
    const webChs = webChapters
      .filter((w) => w.id === id)
      .map((w) => w.chapter);
    const chSet = new Set([...kjvChs, ...webChs]);
    for (const ch of [...chSet].sort((a, b) => a - b)) {
      const kjvN = kjvCounts.get(`${id}:${ch}`);
      const webRow = webChapters.find((w) => w.id === id && w.chapter === ch);
      const webN = webRow?.webVerses;
      if (kjvN == null && webN != null) {
        onlyWeb.push(`${id} ${ch}장 — WEB ${webN}절 / KJV 없음`);
      } else if (kjvN != null && webN == null) {
        onlyKjv.push(`${id} ${ch}장 — KJV ${kjvN}절 / WEB 없음`);
      } else if (kjvN !== webN) {
        reports.push(
          `${id} ${ch}장 — KJV ${kjvN}절, WEB ${webN}절 (차 ${kjvN - webN})`,
        );
      }
    }
  }
  if (reports.length === 0 && onlyKjv.length === 0 && onlyWeb.length === 0) {
    console.log("차이 없음 — 모든 장의 절 수가 WEB 과 같습니다.");
  } else {
    for (const line of reports) console.log("  · " + line);
    for (const line of onlyKjv) console.log("  · " + line);
    for (const line of onlyWeb) console.log("  · " + line);
    console.log(
      `\n총 ${reports.length}개 장에서 절 수 차이, KJV만 ${onlyKjv.length}, WEB만 ${onlyWeb.length}`,
    );
  }

  if (!booksOk || !chOk || !vsOk) {
    console.error("\n[abort] 기대 장·절 수와 다릅니다.");
    process.exit(1);
  }
  console.log("\n완료. 원본과 변환 결과를 저장했습니다.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
