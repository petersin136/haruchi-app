// HebrewStrong.xml → .cache/oshb/strong-he.json (일회성 캐시 빌더).
// 출처: Open Scriptures HebrewLexicon (Strong's, Public Domain).
// 사용:  node scripts/build-strong-cache.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const SRC = path.join(repoRoot, ".cache/oshb/HebrewStrong.xml");
const OUT = path.join(repoRoot, ".cache/oshb/strong-he.json");

const xml = fs.readFileSync(SRC, "utf8");

// 엔트리 단위 파싱 — 정규식 만으로 충분 (스키마가 단순).
const entryRe = /<entry id="(H\d+)">([\s\S]*?)<\/entry>/g;
const tagRe = (name) => new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`);
const attrRe = (name, attr) =>
  new RegExp(`<${name}\\b[^>]*\\b${attr}="([^"]*)"`);

function stripTags(s) {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const out = {};
let m;
while ((m = entryRe.exec(xml)) !== null) {
  const id = m[1];
  const body = m[2];
  const wMatch = body.match(/<w\b[^>]*>([\s\S]*?)<\/w>/);
  const hebrew = wMatch ? stripTags(wMatch[1]) : "";
  const xlitMatch = body.match(attrRe("w", "xlit"));
  const pronMatch = body.match(attrRe("w", "pron"));
  const posMatch = body.match(attrRe("w", "pos"));
  const langMatch = body.match(attrRe("w", "xml:lang"));
  const defMatch = body.match(tagRe("def"));
  const meaningMatch = body.match(tagRe("meaning"));
  const usageMatch = body.match(tagRe("usage"));

  const def = defMatch ? stripTags(defMatch[1]) : "";
  const meaning = meaningMatch ? stripTags(meaningMatch[1]) : "";
  const usage = usageMatch ? stripTags(usageMatch[1]) : "";

  out[id] = {
    h: hebrew,
    xlit: xlitMatch ? xlitMatch[1] : "",
    pron: pronMatch ? pronMatch[1] : "",
    pos: posMatch ? posMatch[1] : "",
    lang: langMatch ? langMatch[1] : "heb",
    def, // 짧은 핵심 뜻
    meaning, // 확장 뜻 (def 포함, 더 길 수 있음)
    usage, // KJV 용례
  };
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out), "utf8");
console.log(
  `✅ Strong-Hebrew lexicon cache → ${OUT}  (entries: ${Object.keys(out).length})`,
);
