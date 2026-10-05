// =============================================================================
// 책 전체 JSON 을 장 단위 파일로 쪼갠다. 원본은 수정하지 않는다.
//
// 읽기 화면 (개역한글 / 어린이 / 원어 의역 문장):
//   입력  public/bible-data/<bookId>.json
//   출력  public/bible-study/chunks/<bookId>/<chapter>/korean.json
//         public/bible-study/chunks/<bookId>/korean-index.json
//   greekTokens / greek / greekWords 는 넣지 않는다.
//   공부 모드가 쓰는 krv.json · kids.json 은 구약 절 번호가 어긋난 장이 있어
//   덮어쓰지 않는다. (출애굽기 8장 등)
//
// 헬라어·히브리어 보기:
//   입력  public/bible-v2/<bookId>-v2.json
//   출력  public/bible-v2/chapters/<bookId>/<chapter>.json
//         { meta, chapter, verses }  — verses 는 원본 장과 동일
//
// 검증: 66권, 개역한글 1,189장, 장마다 절 수가 원본과 같아야 한다.
//       v2 도 책마다 장 수·절 수가 원본과 같아야 한다.
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

function bookIds() {
  const src = fs.readFileSync(
    path.join(repoRoot, "app/bible-reading/books.ts"),
    "utf8",
  );
  const block = src.match(/export const BOOK_ORDER: BookId\[\] = \[([\s\S]*?)\];/);
  if (!block) throw new Error("BOOK_ORDER 를 찾지 못했습니다.");
  return [...block[1].matchAll(/"([a-z0-9]+)"/g)].map((m) => m[1]);
}

function plainVerses(list) {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  return list.map((v) => ({ n: v.n, t: v.t }));
}

function sameVerses(a, b) {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i].n !== right[i].n || left[i].t !== right[i].t) return false;
  }
  return true;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const ids = bookIds();
if (ids.length !== 66) {
  console.error(`책 id 가 66개가 아닙니다: ${ids.length}`);
  process.exit(1);
}

let koreanChapters = 0;
let koreanVerses = 0;
let failures = 0;
const v2ChapterCounts = [];

function fail(msg) {
  failures++;
  console.error(msg);
}

for (const id of ids) {
  const srcPath = path.join(repoRoot, "public/bible-data", `${id}.json`);
  const book = readJson(srcPath);
  const chapters = book.chapters ?? [];
  const index = [];

  for (const ch of chapters) {
    const krv = plainVerses(ch.verses?.krv) ?? [];
    const kids = plainVerses(ch.verses?.kids);
    const greekKr = plainVerses(ch.verses?.greekKr);
    const file = {
      chapter: ch.chapter,
      layer: "korean",
      title: ch.title ?? "",
      verses: { krv },
    };
    if (kids) file.verses.kids = kids;
    if (greekKr) file.verses.greekKr = greekKr;

    const outPath = path.join(
      repoRoot,
      "public/bible-study/chunks",
      id,
      String(ch.chapter),
      "korean.json",
    );
    writeJson(outPath, file);

    const back = readJson(outPath);
    if (back.layer !== "korean" || back.chapter !== ch.chapter || back.title !== (ch.title ?? "")) {
      fail(`${id} ${ch.chapter}: korean.json 메타가 원본과 다릅니다.`);
    }
    if (!sameVerses(back.verses.krv, ch.verses?.krv)) {
      fail(`${id} ${ch.chapter}: 개역한글 절이 원본과 다릅니다.`);
    }
    if (!sameVerses(back.verses.kids, ch.verses?.kids)) {
      fail(`${id} ${ch.chapter}: 어린이 의역 절이 원본과 다릅니다.`);
    }
    if (!sameVerses(back.verses.greekKr, ch.verses?.greekKr)) {
      fail(`${id} ${ch.chapter}: 원어 의역 절이 원본과 다릅니다.`);
    }
    if ("greekTokens" in (back.verses ?? {}) || "greekWords" in (back.verses ?? {}) || "greek" in (back.verses ?? {})) {
      fail(`${id} ${ch.chapter}: greekTokens 등이 들어갔습니다.`);
    }

    index.push({ chapter: ch.chapter, title: ch.title ?? "" });
    koreanChapters++;
    koreanVerses += krv.length;
  }

  const numbers = chapters.map((c) => c.chapter);
  const expected = numbers.map((_, i) => i + 1);
  if (!deepEqual(numbers, expected)) {
    fail(`${id}: 장 번호가 1..${chapters.length} 가 아닙니다.`);
  }

  const indexPath = path.join(
    repoRoot,
    "public/bible-study/chunks",
    id,
    "korean-index.json",
  );
  writeJson(indexPath, { chapters: index });
  const indexBack = readJson(indexPath);
  if (!deepEqual(indexBack.chapters, index)) {
    fail(`${id}: korean-index.json 이 원본 장 목록과 다릅니다.`);
  }
}

let v2Chapters = 0;
let v2Verses = 0;
for (const id of ids) {
  const srcPath = path.join(repoRoot, "public/bible-v2", `${id}-v2.json`);
  if (!fs.existsSync(srcPath)) {
    fail(`v2 원본 없음: ${id}`);
    continue;
  }
  const book = readJson(srcPath);
  const chapters = book.chapters ?? [];
  v2ChapterCounts.push(chapters.length);
  for (const ch of chapters) {
    const file = {
      meta: book.meta,
      chapter: ch.chapter,
      verses: ch.verses,
    };
    const outPath = path.join(
      repoRoot,
      "public/bible-v2/chapters",
      id,
      `${ch.chapter}.json`,
    );
    writeJson(outPath, file);
    const back = readJson(outPath);
    if (back.chapter !== ch.chapter || !deepEqual(back.meta, book.meta) || !deepEqual(back.verses, ch.verses)) {
      fail(`${id} ${ch.chapter}: v2 장 파일이 원본과 다릅니다.`);
    }
    v2Chapters++;
    v2Verses += (ch.verses ?? []).length;
  }
}

function fmt(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function size(rel) {
  return fs.statSync(path.join(repoRoot, rel)).size;
}

const samples = [
  ["요한복음 3장 개역한글", "public/bible-data/john.json", "public/bible-study/chunks/john/3/korean.json"],
  ["요한복음 3장 헬라어", "public/bible-v2/john-v2.json", "public/bible-v2/chapters/john/3.json"],
  ["누가복음 1장 개역한글", "public/bible-data/luke.json", "public/bible-study/chunks/luke/1/korean.json"],
  ["누가복음 1장 헬라어", "public/bible-v2/luke-v2.json", "public/bible-v2/chapters/luke/1.json"],
  ["시편 119편 개역한글", "public/bible-data/psalms.json", "public/bible-study/chunks/psalms/119/korean.json"],
  ["시편 119편 히브리어", "public/bible-v2/psalms-v2.json", "public/bible-v2/chapters/psalms/119.json"],
  ["예레미야 1장 개역한글", "public/bible-data/jeremiah.json", "public/bible-study/chunks/jeremiah/1/korean.json"],
  ["예레미야 1장 히브리어", "public/bible-v2/jeremiah-v2.json", "public/bible-v2/chapters/jeremiah/1.json"],
];

console.log("");
console.log(`books ${ids.length}`);
console.log(`korean chapters ${koreanChapters} verses ${koreanVerses}`);
console.log(`v2 chapters ${v2Chapters} verses ${v2Verses} per-book [${v2ChapterCounts.join(",")}]`);
console.log(`failures ${failures}`);
console.log("");
console.log("size comparison (whole book file -> chapter file)");
for (const [label, whole, chapter] of samples) {
  const a = size(whole);
  const b = size(chapter);
  const pct = a === 0 ? 0 : ((1 - b / a) * 100).toFixed(1);
  console.log(`${label}\t${fmt(a)} -> ${fmt(b)}  (-${pct}%)`);
}

if (ids.length !== 66 || koreanChapters !== 1189 || v2Chapters !== 1189 || failures > 0) {
  process.exit(1);
}
