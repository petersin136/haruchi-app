// 요한복음 1-2장 — 인용 도입용 em-dash 정리.
// 패턴: "말씀하셨습니다 — "..." → "...라고 말씀하셨습니다." 형식이 아닌
//        "말씀하셨습니다. "..."" 형식으로 단순 변경 (마침표 + 인용부호).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const fp = path.join(repoRoot, "app/bible-reading/john.json");

const data = JSON.parse(fs.readFileSync(fp, "utf8"));

const SPEECH_VERBS = [
  "말씀하셨습니다", "말씀하시기를", "이르셨습니다", "말했습니다",
  "외쳤습니다", "물으셨습니다", "물었습니다", "고백했습니다",
  "답했습니다", "답하셨습니다", "대답했습니다", "대답하셨습니다", "증언했습니다",
  "이러했습니다",
];

let changes = 0;
for (const ch of data.chapters) {
  if (ch.chapter !== 1 && ch.chapter !== 2) continue;
  for (const v of (ch.verses.greekKr ?? [])) {
    const before = v.t;
    let t = v.t;
    for (const verb of SPEECH_VERBS) {
      t = t.replaceAll(`${verb} — "`, `${verb}. "`);
      t = t.replaceAll(`${verb} — “`, `${verb}. “`);
    }
    // 빌립이 그에게 답했습니다 — "..." 처럼 좀 더 일반적인 케이스
    t = t.replaceAll(` 답했습니다 — “`, ` 답했습니다. “`);
    t = t.replaceAll(` 외쳤습니다 — “`, ` 외쳤습니다. “`);
    if (t !== before) { v.t = t; changes += 1; }
  }
}

fs.writeFileSync(fp, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log(`✅ ${changes}개 절 정리`);
