// =============================================================================
// 성경 뷰어 청크 분할기 — 큰 한 권 JSON 을 장(章) × 레이어 단위로 쪼갠다.
//
// 목적:
//   히브리어 PoC(genesis 4.3MB) / 성경 공부(66권, 일부 5MB+) 데이터는 책 한 권을
//   통째로 fetch 하면 첫 진입이 느리고 화면이 깨져 보인다. 본 스크립트는
//   기존 JSON 은 손대지 않은 채, "한 장 + 한 레이어" 만 받아 쓸 수 있도록
//   파일을 새로 쪼개 둔다.
//
// 입력 (변경 없음):
//   - public/hebrew-test/<book>.json
//   - public/bible-study/data/<book>.json
//
// 산출 (신규):
//   - public/hebrew-test/chunks/<book>/manifest.json
//   - public/hebrew-test/chunks/<book>/<ch>/<layer>.json
//   - public/bible-study/chunks/<book>/manifest.json
//   - public/bible-study/chunks/<book>/<ch>/<layer>.json
//
// manifest 스키마:
//   {
//     book, bookId?, testament?, direction?,
//     layerOrder, layerLabels, defaultOn, sources?,
//     chapters: [{ chapter: N, verseCount: M }]
//   }
//   ※ ref 자체는 청크에 그대로 들어 있고, 어차피 절 번호는 1..N 으로 연속이라
//     manifest 에서 ref 배열을 빼 크기를 줄였다(스켈레톤은 verseCount 로 N개 행).
//
// 청크 스키마:
//   {
//     chapter: N,
//     layer: "krv" | "hebrew" | ...,
//     verses: { "<ref>": <layer object> }   // layer 가 비어있는 절은 키 자체 생략
//   }
//
// 정책:
//   - 입력 파일을 절대 수정하지 않는다.
//   - 청크가 이미 최신(파일 mtime 비교)이면 건너뛰어 빠르게 끝남.
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

// ── 작업 그룹 정의 ──────────────────────────────────────────────────────────
const GROUPS = [
  {
    label: "hebrew-test",
    inputDir: path.join(repoRoot, "public/hebrew-test"),
    outputDir: path.join(repoRoot, "public/hebrew-test/chunks"),
    fileFilter: (name) =>
      name.endsWith(".json") &&
      !name.endsWith(".manual.json") &&
      !name.startsWith("chunks"),
  },
  {
    label: "bible-study",
    inputDir: path.join(repoRoot, "public/bible-study/data"),
    outputDir: path.join(repoRoot, "public/bible-study/chunks"),
    fileFilter: (name) => name.endsWith(".json"),
  },
];

// 한 권 처리 — manifest + 청크들 작성. 입력보다 manifest 가 새 것이면 skip.
function processBook({ inputFile, outputBookDir, bookId }) {
  if (!fs.existsSync(inputFile)) return { skipped: true, reason: "no input" };

  const manifestPath = path.join(outputBookDir, "manifest.json");
  const inMtime = fs.statSync(inputFile).mtimeMs;
  if (fs.existsSync(manifestPath)) {
    const outMtime = fs.statSync(manifestPath).mtimeMs;
    if (outMtime >= inMtime) {
      return { skipped: true, reason: "up-to-date" };
    }
  }

  const data = JSON.parse(fs.readFileSync(inputFile, "utf8"));
  if (!Array.isArray(data?.chapters)) {
    return { skipped: true, reason: "no chapters" };
  }

  fs.mkdirSync(outputBookDir, { recursive: true });

  // 1) manifest — 본문/ref 는 빼고 절 갯수만(스켈레톤용).
  const manifestChapters = data.chapters.map((ch) => ({
    chapter: ch.chapter,
    verseCount: (ch.verses ?? []).length,
  }));

  const manifest = {
    book: data.book,
    bookId: data.bookId ?? bookId,
    testament: data.testament,
    direction: data.direction,
    layerOrder: data.layerOrder ?? [],
    layerLabels: data.layerLabels ?? {},
    defaultOn: data.defaultOn ?? [],
    sources: data.sources ?? undefined,
    chapters: manifestChapters,
  };
  // undefined 키는 JSON 직렬화 시 자동으로 빠짐.

  fs.writeFileSync(
    manifestPath,
    JSON.stringify(manifest) + "\n",
    "utf8",
  );

  // 2) 장별 / 레이어별 청크.
  const layerIds = new Set(data.layerOrder ?? []);
  for (const ch of data.chapters) {
    const chDir = path.join(outputBookDir, String(ch.chapter));
    fs.mkdirSync(chDir, { recursive: true });

    // 레이어별로 모은다 (절 순서를 manifest 와 동일하게).
    const byLayer = new Map();
    for (const verse of ch.verses ?? []) {
      const ref = verse.ref;
      const layers = verse.layers ?? {};
      for (const [id, layer] of Object.entries(layers)) {
        if (!layerIds.has(id)) {
          // layerOrder 에 명시되지 않은 즉흥 레이어도 함께 보관.
          layerIds.add(id);
        }
        if (!byLayer.has(id)) byLayer.set(id, {});
        byLayer.get(id)[ref] = layer;
      }
    }

    // 한 장에 그 레이어가 단 하나도 없을 수도 있다 — 그래도 빈 파일을
    // 만들어 두면 클라이언트가 "있는 줄 알고" 404 를 받지 않는다.
    for (const id of layerIds) {
      const verses = byLayer.get(id) ?? {};
      const out = { chapter: ch.chapter, layer: id, verses };
      fs.writeFileSync(
        path.join(chDir, `${id}.json`),
        JSON.stringify(out) + "\n",
        "utf8",
      );
    }
  }

  // 사이즈 통계.
  let totalKb = 0;
  for (const ch of data.chapters) {
    const chDir = path.join(outputBookDir, String(ch.chapter));
    for (const f of fs.readdirSync(chDir)) {
      totalKb += fs.statSync(path.join(chDir, f)).size;
    }
  }
  totalKb = totalKb / 1024;

  return {
    skipped: false,
    chapters: data.chapters.length,
    layers: layerIds.size,
    totalKb: totalKb.toFixed(1),
  };
}

function main() {
  let okCount = 0;
  let skipCount = 0;
  for (const group of GROUPS) {
    if (!fs.existsSync(group.inputDir)) {
      console.log(`(skip) ${group.label}: 입력 디렉터리 없음`);
      continue;
    }
    const files = fs
      .readdirSync(group.inputDir)
      .filter((n) => fs.statSync(path.join(group.inputDir, n)).isFile())
      .filter(group.fileFilter)
      .sort();

    console.log(`▶ ${group.label} — ${files.length}개 파일`);
    for (const file of files) {
      const bookId = file.replace(/\.json$/, "");
      const inputFile = path.join(group.inputDir, file);
      const outputBookDir = path.join(group.outputDir, bookId);
      const r = processBook({ inputFile, outputBookDir, bookId });
      if (r.skipped) {
        skipCount += 1;
        if (r.reason !== "up-to-date") {
          console.log(`  - ${bookId}: skip (${r.reason})`);
        }
      } else {
        okCount += 1;
        console.log(
          `  ✓ ${bookId}: 장 ${r.chapters} · 레이어 ${r.layers} · 청크 합 ${r.totalKb}KB`,
        );
      }
    }
  }
  console.log(`\n완료 — 새로 빌드 ${okCount}권, 건너뜀 ${skipCount}권`);
}

main();
