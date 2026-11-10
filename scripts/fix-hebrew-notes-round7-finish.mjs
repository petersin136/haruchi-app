/**
 * 히브리어 사전 7차 마무리: 복합 67 재검토 · 어원 빈칸 · 뜻: 검색 · 끝맺음
 *   node scripts/fix-hebrew-notes-round7-finish.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookupTanakh } from "./lib/tanakh-lexicon.mjs";
import {
  loadStrongMeta,
  extractNameEtymEn,
  translateNameGloss,
  normH,
} from "./lib/hebrew-strong-meta.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const NOTES = path.join(root, "data/keyword-notes/hebrew.json");
const LEX = path.join(root, "public/word-study/lexicon/hebrew");
const OUT = path.join(root, "public/word-study");
const REPORT = path.join(OUT, "_hebrew-notes-round7-report.json");

const FOREIGN_RE =
  /foreign|persian|egyptian|uncertain derivation|uncertain \(perhaps foreign\)|foreign origin/i;

const EMPTY_ETYM_RE =
  /어원 단서가 짧게만 적혀 있어요|어원 단서가 짧거나 불확실해요|더 나눌 뿌리 없이 원시 어근으로 적혀 있어요/;

function hasBatchim(word) {
  const ch = String(word || "").replace(/[^가-힣]/g, "").slice(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}
function ieya(w) {
  return hasBatchim(w) ? "이에요" : "예요";
}

/** 명사(이/자 포함) vs 문장·서술 */
function isNounNameMeaning(nm) {
  const x = String(nm || "").trim();
  if (!x) return false;
  // 문장·서술 우선
  if (/께서|하나님이 |여호와가 |누가 |보라 /.test(x)) return false;
  if (/다$|라$|리라$|신다$|셨다$|이다$/.test(x)) return false;
  // 명사·명사구
  if (/(?:이|자|분|곳|성읍|샘|마을|요새|아버지|아들|형제|하나님|여호와)$/.test(x))
    return true;
  if (/의 /.test(x) && !/다$|신다$|셨다$/.test(x)) return true;
  if (!/\s/.test(x) && !/다$/.test(x)) return true;
  return true; // default noun-ish for short phrases
}

function isSentenceNameMeaning(nm) {
  const x = String(nm || "").trim();
  if (!x) return false;
  if (/께서|하나님이 |여호와가 |누가 |보라 /.test(x)) return true;
  if (/다$|라$|리라$|신다$|셨다$|이다$/.test(x)) return true;
  return false;
}

function nameLine(nm, soft = false) {
  if (!nm) return "이름 뜻은 확실하지 않아요.";
  if (soft) return `이름 뜻은 「${nm}」로 보기도 해요.`;
  if (isSentenceNameMeaning(nm)) return `이름 뜻은 「${nm}」라는 뜻이에요.`;
  // 명사·~이·~자 → 예요/이에요
  return `이름 뜻은 「${nm}」${ieya(nm)}.`;
}

function setName(notes, k, nm, soft = false) {
  const v = notes[k] || {};
  let def = String(v.defKo || "");
  if (/이름 뜻은/.test(def)) {
    def = def.replace(/이름 뜻은[^.]*(?:\.|$)/u, nameLine(nm, soft));
  } else {
    def = `${def} ${nameLine(nm, soft)}`.trim();
  }
  def = def.replace(/\s+/g, " ").trim();
  v.defKo = def;
  if (nm) v.nameMeaning = nm;
  else delete v.nameMeaning;
  notes[k] = v;
  syncLex(k, v);
}

function syncLex(strong, note) {
  const p = path.join(LEX, `${strong}.json`);
  if (!fs.existsSync(p)) return;
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  j.defKo = note.defKo || "";
  j.etymKo = note.etymKo ?? "";
  j.usageKo = note.usageKo ?? j.usageKo ?? "";
  j.nameMeaning = note.nameMeaning || "";
  j.noteSrc = note.noteSrc || j.noteSrc || "";
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
}

function translateVerbalEtym(etym) {
  const e = String(etym || "").replace(/\s+/g, " ").trim();
  if (!e) return "";
  let m;
  // God will hear / God will sow
  if ((m = e.match(/^God will hear$/i))) return "하나님이 들으신다";
  if ((m = e.match(/^God will sow$/i))) return "하나님이 뿌리신다";
  if ((m = e.match(/^God will (.+)$/i))) {
    const map = { hear: "들으신다", sow: "뿌리신다", give: "주신다", help: "도우신다" };
    const k = m[1].toLowerCase().replace(/[^a-z]/g, "");
    if (map[k]) return `하나님이 ${map[k]}`;
  }
  if ((m = e.match(/^God has heard$/i))) return "하나님이 들으셨다";
  if ((m = e.match(/^God has favored$/i))) return "하나님이 은혜를 베푸셨다";
  if ((m = e.match(/^God has seen$/i))) return "하나님이 보셨다";
  if ((m = e.match(/^God has made$/i))) return "하나님이 만드셨다";
  if ((m = e.match(/^God has (.+)$/i))) {
    const map = {
      helped: "도우셨다",
      given: "주셨다",
      remembered: "기억하셨다",
      saved: "구원하셨다",
      judged: "심판하셨다",
    };
    const k = m[1].toLowerCase().replace(/[^a-z\s]/g, "").trim();
    if (map[k]) return `하나님이 ${map[k]}`;
  }
  if ((m = e.match(/^Jah has helped$/i))) return "여호와께서 도우셨다";
  if ((m = e.match(/^Jah has remembered$/i))) return "여호와께서 기억하셨다";
  if ((m = e.match(/^Jah has built$/i))) return "여호와께서 세우셨다";
  if ((m = e.match(/^Jah has heard$/i))) return "여호와께서 들으셨다";
  if ((m = e.match(/^Jah has saved$/i))) return "여호와께서 구원하셨다";
  if ((m = e.match(/^Jah has seized$/i))) return "여호와께서 붙잡으셨다";
  if ((m = e.match(/^Jah has favored$/i))) return "여호와께서 은혜를 베푸셨다";
  if ((m = e.match(/^Jah will rise$/i))) return "여호와께서 일어나시리라";
  if ((m = e.match(/^Jah has become great$/i))) return "여호와께서 커지셨다";
  if ((m = e.match(/^Jah has (.+)$/i))) {
    const map = {
      helped: "도우셨다",
      remembered: "기억하셨다",
      built: "세우셨다",
      heard: "들으셨다",
      saved: "구원하셨다",
      seized: "붙잡으셨다",
      favored: "은혜를 베푸셨다",
      given: "주셨다",
      raised: "일으키셨다",
    };
    const k = m[1].toLowerCase().replace(/[^a-z\s]/g, "").trim();
    if (map[k]) return `여호와께서 ${map[k]}`;
  }
  if ((m = e.match(/^Jehovah \(is\) perfect$/i))) return "여호와는 완전하시다";
  if ((m = e.match(/^Jehovah \(is\) (.+)$/i))) {
    const rest = m[1].toLowerCase();
    if (rest === "perfect") return "여호와는 완전하시다";
  }
  if ((m = e.match(/^God \(is\) helper$/i))) return "하나님은 돕는 이";
  if ((m = e.match(/^God \(is the\) giver$/i))) return "하나님이 주신다";
  if ((m = e.match(/^God \(is\) gatherer$/i))) return "하나님이 모으신다";
  if ((m = e.match(/^God \(is\) (.+)$/i))) {
    const map = { helper: "돕는 이", gatherer: "모으시는 이", perfect: "완전하시다" };
    const k = m[1].toLowerCase().replace(/[^a-z]/g, "");
    if (map[k]) {
      if (/시다$|이$/.test(map[k])) return `하나님은 ${map[k]}`.replace("하나님은 완전하시다", "하나님은 완전하시다");
      return /이$/.test(map[k]) ? `하나님은 ${map[k]}` : `하나님이 ${map[k]}`;
    }
  }
  if (/who\s*\(?is\)?\s*like\s*(?:God|El|Jah|Jehovah)/i.test(e))
    return "누가 하나님과 같으랴";
  if (/^God of hearing$/i.test(e)) return "하나님이 들으신다"; // treat as verbal sense like Ishmael family
  if (/^I have asked God$/i.test(e)) return "내가 하나님께 구하였다";
  return "";
}

function translateNounEtym(etym) {
  const e = String(etym || "").replace(/\s+/g, " ").trim();
  if (!e) return "";
  const direct = translateNameGloss(e);
  if (direct && !/[A-Za-z]/.test(direct) && !/「/.test(direct)) return direct;

  let m;
  if ((m = e.match(/^father(?:\s*\([^)]*\))?\s+of\s+(?:\(the\)\s*)?(.+)$/i))) {
    const rest = m[1].replace(/\s*\([^)]*\)\s*/g, " ").trim().toLowerCase();
    const map = {
      joy: "기쁨",
      peace: "평화",
      judgment: "재판",
      knowledge: "지식",
      light: "빛",
      dew: "이슬",
      might: "힘",
      height: "높음",
      help: "도움",
      goodness: "선하심",
      abundance: "풍족",
      plenty: "풍족",
      error: "오류",
      gift: "선물",
      renown: "위엄",
      wall: "성벽",
      generosity: "후함",
      pleasantness: "기쁨",
      gathering: "거둠",
      "a multitude": "많은 무리",
      multitude: "많은 무리",
      "the king": "왕",
      king: "왕",
      "the sea": "바다",
      sea: "바다",
      "the wall": "성벽",
      "a gift": "선물",
    };
    const key = rest.replace(/^(?:a|an|the)\s+/, "");
    const ko = map[rest] || map[key];
    if (ko) return `${ko}의 아버지`;
  }
  if ((m = e.match(/^brother(?:\s*\([^)]*\))?\s+of\s+(?:\(the\)\s*)?(.+)$/i))) {
    const rest = m[1].replace(/\s*\([^)]*\)\s*/g, " ").trim().toLowerCase();
    const map = {
      anger: "노여움",
      goodness: "선하심",
      folly: "어리석음",
      wrong: "악",
      understanding: "명철",
      "the king": "왕",
      king: "왕",
      rising: "높음",
    };
    const ko = map[rest] || map[rest.replace(/^(?:a|an|the)\s+/, "")];
    if (ko) return `${ko}의 형제`;
  }
  if ((m = e.match(/^village of\s+(?:\(the\)\s*)?(.+)$/i))) {
    const rest = m[1].replace(/\s*\([^)]*\)\s*/g, " ").trim().toLowerCase();
    if (/fox/.test(rest)) return "여우의 마을";
    if (/middle/.test(rest)) return "가운데 마을";
    if (/fortune/.test(rest)) return "운의 마을";
  }
  if ((m = e.match(/^fountain of\s+(?:a\s+|the\s+)?(.+)$/i))) {
    const rest = m[1].replace(/\s*\([^)]*\)\s*/g, " ").trim().toLowerCase();
    const map = { kid: "새끼 염소", traveller: "나그네", ebullition: "끓음" };
    if (map[rest]) return `${map[rest]}의 샘`;
  }
  if ((m = e.match(/^fortress of\s+(.+)$/i))) {
    if (/earthenware/i.test(m[1])) return "질그릇의 요새";
  }
  if ((m = e.match(/^meadow of\s+(?:the\s+)?(.+)$/i))) {
    const rest = m[1].toLowerCase();
    const map = {
      dancing: "춤",
      water: "물",
      vineyards: "포도원",
      acacias: "싯딤",
      "the acacias": "싯딤",
    };
    const ko = map[rest];
    if (ko) return `${ko}의 초원`;
  }
  if ((m = e.match(/^consolation of Jah$/i))) return "여호와의 위로";
  if ((m = e.match(/^man of shame$/i))) return "수치의 사람";
  if ((m = e.match(/^lord of (.+)$/i))) return `${m[1]}의 주인`;
  if ((m = e.match(/^of gold$/i))) return "금의";
  if ((m = e.match(/^in \(the\) counsel of Jehovah$/i))) return "여호와의 모략 안에";
  if ((m = e.match(/^in \(the\) work of Jah$/i))) return "여호와의 일 안에";
  if ((m = e.match(/^heard by Jah$/i))) return "여호와께 들으신 바 된";
  if ((m = e.match(/^father \(i\.e\. worshipper\) of Him \(i\.e\. God\)$/i)))
    return "그(하나님)를 예배하는 아버지";
  if ((m = e.match(/^father \(i\.e\. possessor\) of might$/i))) return "힘의 아버지";
  if ((m = e.match(/^father \(i\.e\. possessor\) of God$/i))) return "하나님의 소유자인 아버지";
  if ((m = e.match(/^brother \(i\.e\. possessor\) of understanding$/i)))
    return "명철의 형제";
  if ((m = e.match(/^division.*palm-tree$/i))) return "종려나무의 줄";
  if ((m = e.match(/^midst of the resting-places$/i))) return "안식처들의 한가운데";
  return "";
}

function needsSentenceFromEtym(etym) {
  const e = String(etym || "");
  return (
    /^(?:God|Jah|Jehovah)\s+(?:will|has)\b/i.test(e) ||
    /^(?:God|Jah|Jehovah)\s*\((?:is(?: the)?)\)/i.test(e) ||
    /^God will /i.test(e) ||
    /^who\b/i.test(e) ||
    /^I have asked/i.test(e) ||
    /^God of hearing$/i.test(e)
  );
}

function walkStrings(obj, prefix, onHit) {
  if (obj == null) return;
  if (typeof obj === "string") {
    onHit(prefix, obj);
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => walkStrings(v, `${prefix}[${i}]`, onHit));
    return;
  }
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      walkStrings(v, prefix ? `${prefix}.${k}` : k, onHit);
    }
  }
}

function main() {
  console.log("[r7] load…");
  const notes = JSON.parse(fs.readFileSync(NOTES, "utf8"));
  const metaMap = loadStrongMeta();

  const beforeSnap = {
    H3458: { def: notes.H3458?.defKo, nm: notes.H3458?.nameMeaning },
    H494: { def: notes.H494?.defKo, nm: notes.H494?.nameMeaning },
    H5553: {
      def: notes.H5553?.defKo,
      etym: notes.H5553?.etymKo,
      usage: notes.H5553?.usageKo,
    },
    H6215: { def: notes.H6215?.defKo, nm: notes.H6215?.nameMeaning },
    H8050: { def: notes.H8050?.defKo, nm: notes.H8050?.nameMeaning },
  };

  // ----- 3 BEFORE: 뜻: search -----
  const litBefore = {};
  function countLit(store) {
    for (const f of fs.readdirSync(LEX).filter((x) => /^H\d+\.json$/.test(x))) {
      const j = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
      walkStrings(j, "", (field, val) => {
        if (/(?:^|\n)\s*뜻:\s/.test(val) || val.trimStart().startsWith("뜻:")) {
          store[field] = (store[field] || 0) + 1;
        }
      });
    }
  }
  countLit(litBefore);

  let chipLitBefore = 0;
  const chipLitSamples = [];
  for (const book of fs.readdirSync(OUT)) {
    const dir = path.join(OUT, book);
    if (!fs.statSync(dir).isDirectory() || book.startsWith("_") || book === "lexicon")
      continue;
    for (const f of fs.readdirSync(dir).filter((x) => /^\d+\.json$/.test(x))) {
      let j;
      try {
        j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      } catch {
        continue;
      }
      for (const v of j.verses || []) {
        for (const w of v.words || []) {
          walkStrings(w, "chip", (field, val) => {
            if (/(?:^|\n)\s*뜻:\s/.test(val) || val.trimStart().startsWith("뜻:")) {
              chipLitBefore += 1;
              if (chipLitSamples.length < 5) {
                chipLitSamples.push({
                  book,
                  ch: f,
                  n: v.n,
                  strong: w.strong,
                  field,
                  val: val.slice(0, 80),
                });
              }
            }
          });
        }
      }
    }
  }

  // ----- 2 BEFORE: etym types -----
  const etymTypeBefore = new Map();
  for (const [k, v] of Object.entries(notes)) {
    if (!/^H\d+$/.test(k)) continue;
    const e = String(v.etymKo || "").trim();
    let t = "(empty)";
    if (!e) t = "(empty)";
    else if (/어원 단서가 짧게만/.test(e)) t = "어원 단서가 짧게만 적혀 있어요";
    else if (/어원 단서가 짧거나 불확실/.test(e)) t = "어원 단서가 짧거나 불확실해요";
    else if (/더 나눌 뿌리 없이 원시 어근/.test(e)) t = "더 나눌 뿌리 없이 원시 어근으로 적혀 있어요";
    else if (/에서 이어진 표기/.test(e)) t = "Hxxxx에서 이어진 표기예요";
    else if (/을 이은 이름/.test(e) || /을\(를\) 이은 이름/.test(e))
      t = "H·H을 이은 이름이에요";
    else if (/Strong이 .+을 함께 가리키는 합성/.test(e))
      t = "Strong이 H·H을 함께 가리키는 합성 이름이에요";
    else if (/와 연결된 표기/.test(e)) t = "Hxxxx 「…」와 연결된 표기예요";
    else if (/이름 뜻은/.test(e)) t = "이름 뜻은… (etymKo)";
    else t = "other";
    etymTypeBefore.set(t, (etymTypeBefore.get(t) || 0) + 1);
  }

  // ----- 1: build 67 review set -----
  // Reconstruct: from N+M, non-foreign, has meaning, 처음-only def, has English etym.
  // Prefer verbal-etym + broken + noun etym; take 67 in stable Strong order with priority.
  const pool = [];
  for (const [k, v] of Object.entries(notes)) {
    if (!/^H\d+$/.test(k)) continue;
    const src = metaMap.get(k)?.sourceText || "";
    if (FOREIGN_RE.test(src)) continue;
    if (!/from\s+\d+\s+and\s+/i.test(src)) continue;
    if (!v.nameMeaning || /확실하지 않아요/.test(v.defKo || "")) continue;
    const etym = extractNameEtymEn(src) || "";
    if (!etym || /^(a form of|corresponding to|from \d+)/i.test(etym)) continue;
    const def = String(v.defKo || "").trim();
    if (!/^처음 나오는 곳:/.test(def)) continue;
    const verbal = needsSentenceFromEtym(etym);
    const broken = /[A-Za-z]{2,}/.test(v.nameMeaning) || /「of」|「in」|「by」|다의 /.test(v.nameMeaning);
    const priority = broken ? 0 : verbal ? 1 : 2;
    pool.push({
      k,
      name: lookupTanakh(k)?.gloss || "",
      nm: v.nameMeaning,
      etym,
      src: src.replace(/\s+/g, " ").trim(),
      def,
      priority,
      verbal,
      broken,
    });
  }
  pool.sort(
    (a, b) =>
      a.priority - b.priority || Number(a.k.slice(1)) - Number(b.k.slice(1)),
  );
  // Force include requested IDs
  const force = ["H3458", "H494"];
  const selected = [];
  const seen = new Set();
  for (const id of force) {
    const row = pool.find((x) => x.k === id);
    if (row) {
      selected.push(row);
      seen.add(id);
    }
  }
  for (const row of pool) {
    if (selected.length >= 67) break;
    if (seen.has(row.k)) continue;
    selected.push(row);
    seen.add(row.k);
  }

  const table67 = [];
  for (const row of selected) {
    const soft = /보기도 해요/.test(notes[row.k]?.defKo || "");
    const beforeNm = row.nm;
    const beforeDef = notes[row.k]?.defKo || "";
    let afterNm = beforeNm;

    // Hand / verbal
    if (row.k === "H3458") afterNm = "하나님이 들으신다";
    else if (row.k === "H494") afterNm = "하나님이 주신다";
    else if (row.verbal) {
      afterNm = translateVerbalEtym(row.etym) || afterNm;
    }
    // broken / noun etym cleanup
    if (row.broken || /[A-Za-z]/.test(afterNm) || /「of」|다의 /.test(afterNm)) {
      afterNm =
        translateVerbalEtym(row.etym) ||
        translateNounEtym(row.etym) ||
        translateNameGloss(row.etym) ||
        "";
      if (/[A-Za-z]/.test(afterNm)) afterNm = "";
    } else if (!row.verbal && /의 /.test(afterNm)) {
      // improve noun etym if better translation exists
      const better = translateNounEtym(row.etym);
      if (better && !/[A-Za-z]/.test(better)) afterNm = better;
    }

    if (!afterNm) {
      setName(notes, row.k, "", false);
    } else {
      setName(notes, row.k, afterNm, soft && afterNm === beforeNm);
    }

    table67.push({
      id: row.k,
      name: row.name,
      source: row.src,
      before: beforeNm,
      after: notes[row.k]?.nameMeaning || "(확실하지 않아요)",
      beforeDef: beforeDef.slice(0, 100),
      afterDef: (notes[row.k]?.defKo || "").slice(0, 120),
    });
  }

  // ----- 4: ending rules for ALL name meanings -----
  let endingFixed = 0;
  for (const [k, v] of Object.entries(notes)) {
    if (!/^H\d+$/.test(k)) continue;
    const m = (v.defKo || "").match(/이름 뜻은 「([^」]+)」([^.]*)\./);
    if (!m) continue;
    if (/보기도/.test(m[2])) continue;
    const nm = m[1];
    const wantSentence = isSentenceNameMeaning(nm);
    const hasSentence = /라는 뜻/.test(m[2]);
    // 명사·이·자 → 예요 ; 문장 → 라는 뜻
    if (wantSentence && !hasSentence) {
      setName(notes, k, nm, false);
      endingFixed += 1;
    } else if (!wantSentence && hasSentence) {
      setName(notes, k, nm, false);
      endingFixed += 1;
    }
  }
  // force H6215
  setName(notes, "H6215", "털이 많은 이", false);

  // ----- 2: empty uninformative etym -----
  let emptied = 0;
  for (const [k, v] of Object.entries(notes)) {
    if (!/^H\d+$/.test(k)) continue;
    const e = String(v.etymKo || "");
    if (EMPTY_ETYM_RE.test(e)) {
      v.etymKo = "";
      notes[k] = v;
      syncLex(k, v);
      emptied += 1;
    }
  }

  // Also empty "Strong이 … 합성" if user only asked for 정보 없는 문장 - keep informative ones.
  // User: 「어원 단서가 짧게만 적혀 있어요」처럼 정보가 없는 문장 → empty. Also 원시어근/불확실.

  // ----- 3 AFTER: no literal 뜻: to fix in hebrew; report H5553 source -----
  // usageKo "바위, 반석" is shown under UI label <dt>뜻</dt> → looks like 「뜻: 바위, 반석」
  // Do not put 뜻: into data. Optionally leave usageKo as is (it's the meanings chips).

  const litAfter = {};
  countLit(litAfter);

  // etym types after
  const etymTypeAfter = new Map();
  for (const [k, v] of Object.entries(notes)) {
    if (!/^H\d+$/.test(k)) continue;
    const e = String(v.etymKo || "").trim();
    let t = "(empty)";
    if (!e) t = "(empty)";
    else if (/어원 단서가 짧게만/.test(e)) t = "어원 단서가 짧게만 적혀 있어요";
    else if (/어원 단서가 짧거나 불확실/.test(e)) t = "어원 단서가 짧거나 불확실해요";
    else if (/더 나눌 뿌리 없이 원시 어근/.test(e)) t = "더 나눌 뿌리 없이 원시 어근으로 적혀 있어요";
    else if (/에서 이어진 표기/.test(e)) t = "Hxxxx에서 이어진 표기예요";
    else if (/을 이은 이름/.test(e)) t = "H·H을 이은 이름이에요";
    else if (/Strong이 .+을 함께 가리키는 합성/.test(e))
      t = "Strong이 H·H을 함께 가리키는 합성 이름이에요";
    else if (/와 연결된 표기/.test(e)) t = "Hxxxx 「…」와 연결된 표기예요";
    else t = "other";
    etymTypeAfter.set(t, (etymTypeAfter.get(t) || 0) + 1);
  }

  // recount ending for ~이/~자 that now use 예요
  let nounIja = 0;
  let nounIjaOk = 0;
  for (const [k, v] of Object.entries(notes)) {
    if (!/^H\d+$/.test(k)) continue;
    const m = (v.defKo || "").match(/이름 뜻은 「([^」]+)」([^.]*)\./);
    if (!m) continue;
    if (!/(?:이|자)$/.test(m[1])) continue;
    nounIja += 1;
    if (/예요|이에요/.test(m[2]) && !/라는 뜻/.test(m[2])) nounIjaOk += 1;
  }

  fs.writeFileSync(NOTES, JSON.stringify(notes, null, 2) + "\n");

  const top10 = [...etymTypeBefore.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([type, count]) => ({
      type,
      before: count,
      after: etymTypeAfter.get(type) || 0,
    }));

  const report = {
    "1_compound67": {
      count: table67.length,
      note: "직전 채움 67건 재구성(from N+M·영어 etym·처음출현만). 문장형 etym은 문장 뜻으로.",
      H3458: {
        before: beforeSnap.H3458,
        after: { def: notes.H3458?.defKo, nm: notes.H3458?.nameMeaning },
        source: metaMap.get("H3458")?.sourceText,
      },
      H494: {
        before: beforeSnap.H494,
        after: { def: notes.H494?.defKo, nm: notes.H494?.nameMeaning },
        source: metaMap.get("H494")?.sourceText,
      },
      table: table67,
    },
    "2_etym": {
      top10Types: top10,
      emptied,
      emptiedPatterns: [
        "어원 단서가 짧게만 적혀 있어요",
        "어원 단서가 짧거나 불확실해요",
        "더 나눌 뿌리 없이 원시 어근으로 적혀 있어요",
      ],
    },
    "3_뜻colon": {
      lexiconLiteralBefore: litBefore,
      lexiconLiteralAfter: litAfter,
      chipLiteralBefore: chipLitBefore,
      chipLiteralAfter: chipLitBefore, // unchanged (0)
      chipSamples: chipLitSamples,
      H5553: {
        note: "데이터에 리터럴 「뜻:」 접두사 없음. 원어 패널 <dt>뜻</dt> 라벨 + usageKo「바위, 반석」(또는 meanings)이 화면에서 「뜻: 바위, 반석」처럼 보임.",
        usageKo: notes.H5553?.usageKo,
        defKo: notes.H5553?.defKo,
        etymKo: notes.H5553?.etymKo || "(empty)",
        before: beforeSnap.H5553,
      },
    },
    "4_ending": {
      fixed: endingFixed,
      nounEndingIja: nounIja,
      nounEndingIjaWithYeyo: nounIjaOk,
      H6215: {
        before: beforeSnap.H6215,
        after: { def: notes.H6215?.defKo, nm: notes.H6215?.nameMeaning },
      },
      rule: "명사·~이·~자 → 예요/이에요 / 문장·서술 → 라는 뜻이에요",
    },
    fulltexts: {
      H3458: notes.H3458,
      H494: notes.H494,
      H5553: notes.H5553,
      H6215: notes.H6215,
      H8050: notes.H8050,
    },
  };

  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        compound: table67.length,
        H3458: notes.H3458?.defKo,
        H494: notes.H494?.defKo,
        H6215: notes.H6215?.defKo,
        H5553: { etym: notes.H5553?.etymKo, usage: notes.H5553?.usageKo },
        emptied,
        endingFixed,
        nounIja,
        nounIjaOk,
        top5: top10.slice(0, 5),
        litBefore,
        sample5: table67.slice(0, 5),
      },
      null,
      2,
    ),
  );
}

main();
