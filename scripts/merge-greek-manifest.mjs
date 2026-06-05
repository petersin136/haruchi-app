// =============================================================================
// 신약 헬라어 의역 매니페스트 머지 도구.
//
// `.cache/<id>-greekpara-stage/ch<N>.json` 형식의 챕터 단위 stage 파일들을
// 모아 `public/greek-test/<id>.manual.json` 매니페스트(평탄 "ch:n" 키) 로
// 출력한다.
//
// stage 파일 형식 (장 단위):
//   { "1": "1절 의역 …", "2": "2절 의역 …", … }   ← 키는 절 번호(문자열)
//
// 사용:
//   node scripts/merge-greek-manifest.mjs matthew
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../..");

function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("사용: node scripts/merge-greek-manifest.mjs <bookId>");
    process.exit(1);
  }
  const stageDir = path.join(repoRoot, `.cache/${id}-greekpara-stage`);
  if (!fs.existsSync(stageDir)) {
    console.error(`stage 디렉토리 없음: ${stageDir}`);
    process.exit(1);
  }
  const files = fs
    .readdirSync(stageDir)
    .filter((f) => /^ch\d+\.json$/.test(f))
    .sort(
      (a, b) =>
        Number(a.match(/^ch(\d+)/)[1]) - Number(b.match(/^ch(\d+)/)[1]),
    );

  const flat = {};
  let total = 0;
  for (const f of files) {
    const ch = Number(f.match(/^ch(\d+)/)[1]);
    const data = JSON.parse(fs.readFileSync(path.join(stageDir, f), "utf8"));
    for (const nStr of Object.keys(data).sort(
      (a, b) => Number(a) - Number(b),
    )) {
      const n = Number(nStr);
      const t = data[nStr];
      if (typeof t !== "string" || !t.trim()) continue;
      flat[`${ch}:${n}`] = t.trim();
      total++;
    }
  }

  const outPath = path.join(repoRoot, `public/greek-test/${id}.manual.json`);
  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const out = {
    book: id,
    version: 1,
    note:
      "헬라어 의역(자연 문장) — 사람이 절마다 직접 작성. 빌더(build-gospel-v2)는 이 파일에 있는 절은 그대로 가져오고, 빠진 절은 matthew.json 의 verses.greekKr (또는 빈 값) 로 폴백한다. 톤: 평이 격식체. 개역한글 옛 표현은 현대어로 풀고, 직접 인용은 큰따옴표, 인용 내 강조어는 작은따옴표. 예수에 관한 동사는 존칭 유지.",
    greekpara: flat,
  };

  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`✅ ${id} 매니페스트 작성: ${total}절 → ${path.relative(repoRoot, outPath)}`);

  const byCh = new Map();
  for (const k of Object.keys(flat)) {
    const ch = Number(k.split(":")[0]);
    byCh.set(ch, (byCh.get(ch) ?? 0) + 1);
  }
  const summary = [...byCh.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ch, c]) => `${ch}장:${c}`)
    .join(" · ");
  console.log(`   ${summary}`);
}

main();
