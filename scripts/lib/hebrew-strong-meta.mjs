/**
 * OSHB HebrewStrong.xml 보조 필드 (source·meaning·이름뜻).
 * Public Domain Strong's — 외부 API 없음.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const XML = path.join(__dirname, "../../.cache/oshb/HebrewStrong.xml");
const RAW_JSON = path.join(__dirname, "../../.cache/oshb/strong-he.json");

function padNum(n) {
  return String(n).replace(/\D/g, "").replace(/^0+/, "") || "0";
}
export function normH(id) {
  if (!id) return "";
  const m = String(id).match(/(\d+)/);
  return m ? `H${padNum(m[1])}` : "";
}

function stripTags(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** @type {Map<string, { rootStrong: string|null, sourceText: string, meaning: string, def: string, pos: string }>|null} */
let _meta = null;

export function loadStrongMeta() {
  if (_meta) return _meta;
  _meta = new Map();

  // 빠른 경로: strong-he.json meaning + XML source
  if (fs.existsSync(RAW_JSON)) {
    const raw = JSON.parse(fs.readFileSync(RAW_JSON, "utf8"));
    for (const [id, e] of Object.entries(raw)) {
      _meta.set(normH(id), {
        rootStrong: null,
        sourceText: "",
        meaning: e.meaning || "",
        def: e.def || "",
        pos: e.pos || "",
      });
    }
  }

  if (fs.existsSync(XML)) {
    const xml = fs.readFileSync(XML, "utf8");
    const entryRe = /<entry id="(H\d+)">([\s\S]*?)<\/entry>/g;
    let m;
    while ((m = entryRe.exec(xml)) !== null) {
      const id = normH(m[1]);
      const body = m[2];
      const sourceRaw = body.match(/<source>([\s\S]*?)<\/source>/)?.[1] || "";
      const srcIds = [...sourceRaw.matchAll(/\bsrc="(H?\d+)"/g)].map((x) =>
        normH(x[1]),
      );
      const sourceText = stripTags(sourceRaw);
      const meaning =
        stripTags(body.match(/<meaning>([\s\S]*?)<\/meaning>/)?.[1] || "") ||
        _meta.get(id)?.meaning ||
        "";
      const def =
        stripTags(body.match(/<def>([\s\S]*?)<\/def>/)?.[1] || "") ||
        _meta.get(id)?.def ||
        "";
      const pos =
        body.match(/<w\b[^>]*\bpos="([^"]+)"/)?.[1] || _meta.get(id)?.pos || "";
      _meta.set(id, {
        rootStrong: srcIds[0] || null,
        sourceText,
        meaning,
        def,
        pos,
      });
    }
  }
  return _meta;
}

/** BDB/Strong 첫 의미 묶음 (세미콜론 앞), 최대 max자 */
export function firstSenseEn(meaningOrDef, max = 160) {
  const raw = String(meaningOrDef || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "";
  const first = raw.split(/\s*;\s*/)[0].trim();
  if (first.length <= max) return first;
  return first.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Strong source/meaning에서 고유명사 이름뜻(영어) 추출 후 한국어로.
 * 예: "father of a multitude" → "많은 무리의 아버지"
 */
export function deriveNameMeaningKo(meta, rootGlossKo = "") {
  if (!meta) return "";
  const src = meta.sourceText || "";
  const meaning = meta.meaning || "";

  // source 세미콜론 뒤 설명 (Abraham 등)
  const afterSemi = src.includes(";")
    ? src
        .split(";")
        .slice(1)
        .join(";")
        .replace(/\.$/, "")
        .trim()
    : "";
  const cand =
    cleanNameGlossEn(afterSemi) ||
    cleanNameGlossEn(meaning) ||
    (rootGlossKo ? "" : "");

  if (cand) {
    const ko = translateNameGloss(cand);
    if (ko) return ko;
  }
  // 뿌리가 보통명사이면 「…라는 뜻의 이름」
  if (rootGlossKo && !/여호와|하나님|주/.test(rootGlossKo)) {
    return `${rootGlossKo}이라는 뜻의 이름`;
  }
  return "";
}

function cleanNameGlossEn(s) {
  let t = String(s || "").trim();
  if (!t) return "";
  // "Rachel, a wife of Jacob" → skip biography-only
  if (/^Rachel|^Abraham|^Moses|^David|^Israel|^Judah|^Joseph/i.test(t) && !/father|mother|son|god|joy|judge|knowledge|multitude|ewe|lamb|exisent|exist/i.test(t)) {
    // keep if has etymological content in parentheses
    const paren = t.match(/\(([^)]+)\)/);
    if (paren && /father|mother|god|joy|judge|know|multitude|lamb|exist/i.test(paren[1])) {
      t = paren[1];
    } else {
      return "";
    }
  }
  t = t
    .replace(/^\((the)\)\s*/i, "")
    .replace(/\bJewish national name of God\b/i, "self-Existent or Eternal")
    .replace(/\bi\.e\.\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  // too short / just a proper name
  if (t.length < 4) return "";
  if (/^[A-Z][a-z]+$/.test(t)) return "";
  return t;
}

/** Strong 이름뜻 영어 → 짧은 한국어 (퍼블릭 도메인 뜻, 우리 문장) */
function translateNameGloss(en) {
  const s = String(en).toLowerCase().replace(/\./g, "").trim();
  const map = [
    [/self-?existent or eternal|self-?existent/, "스스로 계신 분, 영원하신 분"],
    [/father of a multitude|father of multitudes/, "많은 무리의 아버지"],
    [/father of height|exalted father/, "높은 아버지"],
    [/father of (?:a )?multitude/, "많은 무리의 아버지"],
    [/father \(i\.?e\.? (?:source|founder)\) of joy|father of joy|source of joy/, "기쁨의 아버지"],
    [/father of judgment|father \(i\.?e\.? judge\)/, "재판의 아버지"],
    [/father of knowledge|father \(i\.?e\.? knowing\)/, "지식의 아버지"],
    [/father \(i\.?e\.? possessor\) of god|father of god/, "하나님의 아버지(소유자)"],
    [/father of gathering|gatherer/, "모으는 아버지"],
    [/mother of/, "…의 어머니"],
    [/son of the right hand/, "오른손의 아들"],
    [/heel.?catcher|supplanter/, "발꿈치를 잡는 자"],
    [/laughter/, "웃음"],
    [/princess|noblewoman/, "공주, 귀부인"],
    [/drawn out/, "건져 내어진 자"],
    [/beloved/, "사랑받는 자"],
    [/god has heard/, "하나님이 들으셨다"],
    [/god almighty/, "전능하신 하나님"],
    [/ewe|female sheep/, "암양"],
    [/journey/, "여행하다"],
  ];
  for (const [re, ko] of map) {
    if (re.test(s)) return ko;
  }
  // 짧은 영어 구 직역 근사
  if (/^father of /.test(s)) {
    const rest = s.replace(/^father of (?:a |the )?/, "");
    return `${rest}의 아버지`;
  }
  if (s.length <= 40 && /^[a-z0-9 ,'()-]+$/i.test(en)) {
    // 남은 건 빈 값 — 억지 직역 금지
    return "";
  }
  return "";
}

export function isProperPos(pos) {
  return /n-pr|x-pn/i.test(String(pos || ""));
}
