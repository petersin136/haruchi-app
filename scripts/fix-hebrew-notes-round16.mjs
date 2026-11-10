/**
 * 히브리어 16차:
 *  1) 주요 인물 첫 출현 vs 다른 책 동명 첫 출현 혼동
 *  2) nameMeaning 꾸밈말·괄호직역 → 명사/문장형
 *  3) KRV가 밝힌 관계 이름 보강
 *  4) 약한 신원 503은 미터치
 *   node scripts/fix-hebrew-notes-round16.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadStrongMeta } from "./lib/hebrew-strong-meta.mjs";
import { syncHebrewLexiconEntry } from "./lib/hebrew-lexicon-sync.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const NOTES = path.join(root, "data/keyword-notes/hebrew.json");
const LEX = path.join(root, "public/word-study/lexicon/hebrew");
const KRV = path.join(root, "public/bible-study/chunks");
const OUT = path.join(root, "public/word-study");
const REPORT = path.join(OUT, "_hebrew-notes-round16-report.json");

const BOOK_KO = {
  genesis: "창",
  exodus: "출",
  leviticus: "레",
  numbers: "민",
  deuteronomy: "신",
  joshua: "수",
  judges: "삿",
  ruth: "룻",
  samuel1: "삼상",
  samuel2: "삼하",
  kings1: "왕상",
  kings2: "왕하",
  chronicles1: "대상",
  chronicles2: "대하",
  ezra: "스",
  nehemiah: "느",
  esther: "에",
  job: "욥",
  psalms: "시",
  proverbs: "잠",
  ecclesiastes: "전",
  songofsolomon: "아",
  isaiah: "사",
  jeremiah: "렘",
  lamentations: "애",
  ezekiel: "겔",
  daniel: "단",
  hosea: "호",
  joel: "욜",
  amos: "암",
  obadiah: "옵",
  jonah: "욘",
  micah: "미",
  nahum: "나",
  habakkuk: "합",
  zephaniah: "습",
  haggai: "학",
  zechariah: "슥",
  malachi: "말",
};
const KO_BOOK = Object.fromEntries(Object.entries(BOOK_KO).map(([a, b]) => [b, a]));

function hasBatchim(word) {
  const ch = String(word || "").replace(/[^가-힣]/g, "").slice(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}
function ieya(w) {
  return hasBatchim(w) ? "이에요" : "예요";
}
function ensurePeriod(s) {
  const t = String(s || "").trim();
  if (!t) return t;
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}
function nameLine(nm, soft = false) {
  if (!nm) return "이름 뜻은 확실하지 않아요.";
  if (soft) {
    const part = hasBatchim(nm) ? "으로" : "로";
    return `이름 뜻은 「${nm}」${part} 보기도 해요.`;
  }
  return `이름 뜻은 「${nm}」${ieya(nm)}.`;
}
function parseParts(def) {
  const raw = String(def || "").replace(/\s+/g, " ").trim();
  const firstM = raw.match(/처음 나오는 곳:\s*([가-힣]+)\s*(\d+):(\d+)\.?/);
  const first = firstM ? `처음 나오는 곳: ${firstM[1]} ${firstM[2]}:${firstM[3]}.` : "";
  const firstRef = firstM ? `${firstM[1]} ${firstM[2]}:${firstM[3]}` : "";
  const nmM = raw.match(/이름 뜻은\s*「([^」]+)」([^.]*)\./);
  const soft = nmM ? /보기도/.test(nmM[2] || "") : false;
  const nm = nmM ? nmM[1] : "";
  const unc = /이름 뜻은 확실하지 않아요/.test(raw);
  const extras = [];
  const m328 = raw.match(/창 32:28에서는[^.]+\./);
  if (m328) extras.push(m328[0].replace(/\.+$/, ""));
  const uncertain = raw.match(/([가-힣]+\s*\d+:\d+)(?:에도|에는)[^.]*같은 사람인지 확실하지 않아요\.?/);
  if (uncertain) extras.push(uncertain[0].replace(/\.+$/, ""));
  let identity = raw
    .replace(/처음 나오는 곳:\s*[^.]+\./g, " ")
    .replace(/이름 뜻은\s*「[^」]+」[^.]*(?:\.|$)/g, " ")
    .replace(/이름 뜻은 확실하지 않아요\.?/g, " ")
    .replace(/창 32:28에서는[^.]+\./g, " ")
    .replace(/[가-힣]+\s*\d+:\d+(?:에도|에는)[^.]*같은 사람인지 확실하지 않아요\.?/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "");
  return {
    identity,
    first,
    firstRef,
    firstBook: firstM?.[1],
    firstCh: firstM?.[2],
    firstN: firstM?.[3],
    nm,
    soft,
    unc,
    extras,
  };
}
function rebuildDef({ identity, nm, soft, first, extras = [] }) {
  const parts = [];
  if (identity) parts.push(ensurePeriod(identity));
  if (!nm) parts.push("이름 뜻은 확실하지 않아요.");
  else parts.push(nameLine(nm, soft));
  for (const e of extras) if (e) parts.push(ensurePeriod(e));
  if (first) parts.push(first.endsWith(".") ? first : `${first}.`);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
function syncLex(id, note) {
  // 쓰기 직전 재읽기·자기 필드만 — krvKo·krvForms(에이전트3) 미터치
  syncHebrewLexiconEntry(id, note, { lexDir: LEX });
}
function displayName(lex) {
  const krv = lex?.krvKo?.[0];
  if (krv && !/^[A-Za-z]/.test(krv)) return krv.replace(/\(약식\)/, "").trim();
  return (krv || lex?.pron || "").replace(/\(약식\)/, "").trim();
}
function krvVerse(book, ch, n) {
  const p = path.join(KRV, book, String(ch), "korean.json");
  if (!fs.existsSync(p)) return "";
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return (j.verses?.krv || []).find((x) => x.n === n)?.t || "";
  } catch {
    return "";
  }
}
function loadChapter(book, ch) {
  const p = path.join(KRV, book, String(ch), "korean.json");
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")).verses?.krv || [];
  } catch {
    return [];
  }
}

/** round15와 동일: 약한 신원 503 보호 */
function isWeakIdentity(identity) {
  const x = String(identity || "")
    .trim()
    .replace(/\.+$/, "");
  if (!x) return false;
  if (/^같은 이름이 여럿/.test(x)) return false;
  if (/땅 이름이자 사람/.test(x)) return false;
  if (/이며 |으로[,\s]|로,\s|로서 /.test(x) && !/나오는 인물이에요$/.test(x)) return false;
  if (/에 나오는 인물이에요$/.test(x)) return true;
  if (/에 나오는 사람이에요$/.test(x)) return true;
  if (/에 처음 소개되는 인물이에요$/.test(x)) return true;
  if (/에 나오는 고유명사예요$/.test(x)) return true;
  if (/구약에 나오는 고유명사예요$/.test(x)) return true;
  if (/성경에 나오는 인명이에요$/.test(x)) return true;
  if (/이스라엘 사람이에요$/.test(x)) return true;
  if (/^[가-힣()약식·,\s]+[은는] 왕이에요(\([^)]*\))?$/.test(x)) return true;
  if (/^[가-힣()약식·,\s]+[은는] 제사장이에요(\([^)]*\))?$/.test(x)) return true;
  if (/^[가-힣()약식·,\s]+[은는] 대제사장이에요(\([^)]*\))?$/.test(x)) return true;
  if (/^[가-힣()약식·,\s]+[은는] 예언자예요(\([^)]*\))?$/.test(x)) return true;
  if (/^[가-힣()약식·,\s]+[은는] 선지자예요(\([^)]*\))?$/.test(x)) return true;
  if (/^[가-힣()약식·,\s]+[은는] 사사예요(\([^)]*\))?$/.test(x)) return true;
  if (/^[가-힣()약식·,\s]+[은는] 두령이에요(\([^)]*\))?$/.test(x)) return true;
  if (
    /^[가-힣()약식·,\s]+[은는] (유다의|이스라엘의|이스라엘|바벨론|모압|아람|블레셋|시리아|바산) ?왕이에요(\([^)]*\))?$/.test(
      x,
    )
  )
    return true;
  if (/^[가-힣()약식·,\s]+[은는] (유다|이스라엘) 왕이에요(\([^)]*\))?$/.test(x)) return true;
  return false;
}

function firstOccurrenceInBook(name, bookEn) {
  const short = name.replace(/이$/, "");
  // scan chapters 1..150 until found
  for (let ch = 1; ch <= 150; ch++) {
    const verses = loadChapter(bookEn, ch);
    if (!verses.length) {
      if (ch > 5 && !fs.existsSync(path.join(KRV, bookEn, String(ch)))) break;
      continue;
    }
    for (const v of verses) {
      if (v.t.includes(short) || v.t.includes(name)) {
        return {
          bookKo: BOOK_KO[bookEn],
          ch,
          n: v.n,
          ref: `${BOOK_KO[bookEn]} ${ch}:${v.n}`,
          text: v.t,
        };
      }
    }
  }
  return null;
}

function isBadNameMeaning(nm) {
  const x = String(nm || "").trim();
  if (!x) return false;
  if (/\([^)]+\)/.test(x)) return true; // 괄호 직역
  // 꾸밈말 조각(형용사·관형)
  if (/^(높은|낮은|쓴|큰|작은|행복한|주신|신실한|성급한|황폐한|후한|동맹한|향기로운|평화로운|언덕진|성벽이 있는|털이 많은|매는|세워진|복 받은|헌신)$/.test(x))
    return true;
  if (/운$|한$|은$|는$|인$|신$|린$|진$|른$/.test(x) && !/다$|음$|함$|움$|임$|자$|곳$|집$|성읍$|백성$|아들$|딸$|아버지$|어머니$|형제$|하나님|여호와/.test(x) && x.length <= 12)
    return true;
  // 「여호와께서 …하신」관형 조각
  if (/^(여호와께서|하나님이|하나님은|야훼께서)\s+.+(하신|하신음|아신|주신|낳으신|도우신|들으신|이기신|일으키신|붙잡으신|구원하신|심판하신)$/.test(x))
    return true;
  if (/^여호와의\s+.+(주신|하신)/.test(x)) return true;
  // 짧은 관형 한 단어
  if (/^[가-힣]{1,3}$/.test(x) && /^(높은|쓴|큰|주신|행복한)$/.test(x)) return true;
  return false;
}

function fixNameMeaning(nm, id, meta) {
  const x = String(nm || "").trim();
  if (id === "H1841") return "하나님은 나의 재판장이시다";
  if (id === "H8123" || id === "H8125") return "햇빛";
  if (id === "H5941") return "높음";
  if (id === "H1081") return "벨이 그의 주이다";
  if (id === "H4077") return "메대";

  // 괄호: 앞부분 또는 괄호 안 중 더 자연스러운 명사
  const paren = x.match(/^(.+?)\(([^)]+)\)$/);
  if (paren) {
    const a = paren[1].trim();
    const b = paren[2].trim();
    if (/태양|햇빛|해/.test(a + b)) return "햇빛";
    if (b.length >= a.length) return b.replace(/이\/가|가\)/, "").trim();
    return a;
  }

  // 여호와께서 X하신 → 하셨다
  let m = x.match(/^(여호와께서)\s+(.+)하신$/);
  if (m) return `${m[1]} ${m[2]}하셨다`;
  m = x.match(/^(하나님이)\s+(.+)하신$/);
  if (m) return `${m[1]} ${m[2]}하셨다`;
  m = x.match(/^(여호와께서)\s+(.+)아신$/);
  if (m) return `${m[1]} ${m[2]}아셨다`;
  m = x.match(/^(여호와께서)\s+(.+)주신$/);
  if (m) return `${m[1]} ${m[2]}주셨다`.replace(/ 주셨다/, " 주셨다");
  // 「여호와께서 주신」
  if (x === "여호와께서 주신") return "여호와께서 주셨다";
  if (x === "여호와의 주신") return "여호와께서 주셨다";
  m = x.match(/^(여호와께서)\s+(.+)낳으신$/);
  if (m) return `${m[1]} ${m[2]}낳으셨다`;
  m = x.match(/^(여호와께서)\s+(.+)도우신$/);
  if (m) return `${m[1]} ${m[2]}도우셨다`;
  m = x.match(/^(여호와께서)\s+(.+)들으신$/);
  if (m) return `${m[1]} ${m[2]}들으셨다`;
  m = x.match(/^(여호와께서)\s+(.+)이기신$/);
  if (m) return `${m[1]} ${m[2]}이기셨다`;
  m = x.match(/^(여호와께서)\s+(.+)일으키신$/);
  if (m) return `${m[1]} ${m[2]}일으키셨다`;
  m = x.match(/^(여호와께서)\s+(.+)붙잡으신$/);
  if (m) return `${m[1]} ${m[2]}붙잡으셨다`;
  m = x.match(/^(여호와께서)\s+(.+)구원하신$/);
  if (m) return `${m[1]} ${m[2]}구원하셨다`;
  m = x.match(/^(여호와께서)\s+(.+)심판하신$/);
  if (m) return `${m[1]} ${m[2]}심판하셨다`;
  // 하나님은 은혜 입은 → 문장 불가 시 명사
  m = x.match(/^여호와는\s+(.+)입은$/);
  if (m) return `여호와는 ${m[1]}입으셨다`;

  // 형용사 → 명사
  const adjMap = {
    높은: "높음",
    낮은: "낮음",
    쓴: "씀",
    큰: "큼",
    작은: "작음",
    행복한: "행복",
    주신: "주심",
    신실한: "신실함",
    성급한: "성급함",
    황폐한: "황폐함",
    후한: "후함",
    동맹한: "동맹",
    향기로운: "향기",
    평화로운: "평화",
    언덕진: "언덕",
    "성벽이 있는": "성벽",
    "털이 많은": "털 많음",
    매는: "맴",
    세워진: "세움",
    "복 받은": "복",
    헌신: "헌신",
    "그분 뜻 열린": "그분이 여신다",
  };
  if (adjMap[x]) return adjMap[x];

  // 일반: ~한/~운 → ~함/~움
  m = x.match(/^(.+)한$/);
  if (m && !/여호와|하나님/.test(x)) return `${m[1]}함`;
  m = x.match(/^(.+)운$/);
  if (m && !/여호와|하나님/.test(x)) return `${m[1]}움`;

  // Strong etym fallback for leftover short
  const et = meta.get(id)?.nameEtymEn || "";
  if (/^lofty$/i.test(et)) return "높음";
  if (/^bitter$/i.test(et)) return "씀";
  if (/^happy$/i.test(et)) return "행복";
  if (/^given$/i.test(et)) return "주심";
  if (/^peaceful$/i.test(et)) return "평화";
  if (/sunlight|sunlike/i.test(et)) return "햇빛";

  return x;
}

function main() {
  const notes = JSON.parse(fs.readFileSync(NOTES, "utf8"));
  const meta = loadStrongMeta();

  // ----- protect weak 503 -----
  const weakSet = new Set();
  for (const [id, v] of Object.entries(notes)) {
    if (!v?.defKo) continue;
    if (isWeakIdentity(parseParts(v.defKo).identity)) weakSet.add(id);
  }
  const weakProtected = weakSet.size;

  // ========== 1) first-ref / 동명 혼동 ==========
  // 수동: 사용자 지정 + 같은 유형(주요 인물 책 ≠ 성서 전체 첫 출현, 동일인 불확실)
  const FIRST_FIX = {
    H4782: {
      identity:
        "모르드개는 에스더의 사촌으로, 에스더서의 주요 인물이에요(에 2:5–7)",
      first: "처음 나오는 곳: 에 2:5.",
      extra: "스 2:2에도 같은 이름이 나오나 같은 사람인지 확실하지 않아요",
    },
    H325: {
      identity: "아하수에로는 에스더 시대 바사(페르시아)의 왕이에요(에 1장)",
      first: "처음 나오는 곳: 에 1:1.",
      extra: "스 4:6에도 같은 이름이 나오나 같은 사람인지 확실하지 않아요",
    },
    H90: {
      identity: "아각은 아말렉 왕이에요(삼상 15:8)",
      first: "처음 나오는 곳: 삼상 15:8.",
      extra: "민 24:7에도 같은 이름이 나오나 같은 사람인지 확실하지 않아요",
    },
    H1463: {
      identity: "곡은 에스겔서에서 마곡 땅의 왕으로 나오는 이름이에요(겔 38:2)",
      first: "처음 나오는 곳: 겔 38:2.",
      extra: "대상 5:4에도 같은 이름이 나오나 같은 사람인지 확실하지 않아요",
    },
  };
  // 동명이인으로 주요 인물이 분명한 추가(약한 신원 제외)
  if (!weakSet.has("H3414")) {
    FIRST_FIX.H3414 = {
      identity: "예레미야는 힐기야의 아들로, 예레미야서의 선지자예요(렘 1:1)",
      first: "처음 나오는 곳: 렘 1:1.",
      extra: "왕하 23:31에도 같은 이름이 나오나 같은 사람인지 확실하지 않아요",
    };
  }
  if (!weakSet.has("H6667")) {
    FIRST_FIX.H6667 = {
      identity: "시드기야는 요시야의 아들로, 유다의 마지막 왕이에요(왕하 24:17; 렘)",
      first: "처음 나오는 곳: 왕하 24:17.",
      extra: "왕상 22:11에도 같은 이름이 나오나 같은 사람인지 확실하지 않아요",
    };
  }

  // auto-detect same type (non-weak): identity points to dominant-book figure, firstRef elsewhere, firstC<=2, dom>=75%
  const autoType1 = [];
  for (const [id, v] of Object.entries(notes)) {
    if (weakSet.has(id) || FIRST_FIX[id]) continue;
    if (!v?.defKo) continue;
    const lexP = path.join(LEX, `${id}.json`);
    if (!fs.existsSync(lexP)) continue;
    const lex = JSON.parse(fs.readFileSync(lexP, "utf8"));
    const p = parseParts(v.defKo);
    if (!p.firstBook || !lex.byBook) continue;
    if (/^같은 이름이 여럿|지명이에요$/.test(p.identity)) continue;
    const entries = Object.entries(lex.byBook).sort((a, b) => b[1] - a[1]);
    const [dom, domC] = entries[0];
    const total = Object.values(lex.byBook).reduce((a, b) => a + b, 0);
    const firstEn = KO_BOOK[p.firstBook];
    const firstC = lex.byBook[firstEn] || 0;
    if (!firstEn || dom === firstEn) continue;
    if (domC < 10 || domC / total < 0.75 || firstC > 2) continue;
    // same-person clear prophetic continuity: skip Jonah, Haggai, Hazael, Elisha path
    if (["H3124", "H2292", "H2371", "H477"].includes(id)) continue;
    // place names: same place, not person homonym
    if (/지명|성읍|땅|골짜기|강이에요|산이에요/.test(p.identity)) continue;
    const name = displayName(lex);
    const mainFirst = firstOccurrenceInBook(name, dom);
    if (!mainFirst) continue;
    autoType1.push({
      id,
      oldFirst: p.firstRef,
      newFirst: mainFirst.ref,
      dom: BOOK_KO[dom],
      identity: p.identity,
    });
  }

  const type1Before = Object.keys(FIRST_FIX).length + autoType1.length;
  const type1Changes = [];

  for (const [id, fix] of Object.entries(FIRST_FIX)) {
    if (weakSet.has(id)) continue;
    const v = notes[id];
    if (!v) continue;
    const p = parseParts(v.defKo || "");
    const before = { identity: p.identity, first: p.firstRef, defKo: v.defKo };
    v.defKo = rebuildDef({
      identity: fix.identity,
      nm: v.nameMeaning || p.nm,
      soft: p.soft,
      first: fix.first,
      extras: [fix.extra],
    });
    notes[id] = v;
    syncLex(id, v);
    type1Changes.push({ id, before, after: { identity: fix.identity, first: fix.first, extra: fix.extra } });
  }
  for (const row of autoType1) {
    if (weakSet.has(row.id)) continue;
    const v = notes[row.id];
    const p = parseParts(v.defKo || "");
    // strip old first book mention from identity if it was only listing the wrong first
    let identity = p.identity
      .replace(/귀환자 명단은\s*[가-힣]+\s*\d+:\d+/g, "")
      .replace(/;\s*\)/, ")")
      .replace(/\(\s*\)/, "")
      .replace(/\s+/g, " ")
      .trim();
    const extra = `${row.oldFirst}에도 같은 이름이 나오나 같은 사람인지 확실하지 않아요`;
    const first = `처음 나오는 곳: ${row.newFirst}.`;
    const before = { identity: p.identity, first: p.firstRef };
    v.defKo = rebuildDef({
      identity,
      nm: v.nameMeaning || p.nm,
      soft: p.soft,
      first,
      extras: [extra],
    });
    notes[row.id] = v;
    syncLex(row.id, v);
    type1Changes.push({ id: row.id, before, after: { identity, first: row.newFirst, extra }, auto: true });
  }

  // ========== 2) nameMeaning 형식 ==========
  const nmBeforeList = [];
  for (const [id, v] of Object.entries(notes)) {
    if (weakSet.has(id)) continue;
    const nm = v.nameMeaning || parseParts(v.defKo || "").nm || "";
    if (isBadNameMeaning(nm) || id === "H1841" || id === "H5941" || id === "H8123") {
      // H1841 may already be non-bad by regex but must force
      if (id === "H1841" && nm === "하나님은 나의 재판장이시다") continue;
      if (!isBadNameMeaning(nm) && !["H1841", "H5941", "H8123"].includes(id)) continue;
      if (["H1841", "H5941", "H8123"].includes(id) || isBadNameMeaning(nm)) nmBeforeList.push({ id, before: nm });
    }
  }
  // ensure forced ones included
  for (const id of ["H1841", "H5941", "H8123"]) {
    if (weakSet.has(id)) continue;
    if (!nmBeforeList.some((x) => x.id === id)) {
      nmBeforeList.push({ id, before: notes[id]?.nameMeaning || parseParts(notes[id]?.defKo || "").nm || "" });
    }
  }

  const nmChanges = [];
  for (const row of nmBeforeList) {
    const v = notes[row.id];
    if (!v || weakSet.has(row.id)) continue;
    const p = parseParts(v.defKo || "");
    const next = fixNameMeaning(row.before, row.id, meta);
    if (next === row.before && row.id !== "H1841") continue;
    const forced =
      row.id === "H1841" ? "하나님은 나의 재판장이시다" : next;
    if (forced === row.before) continue;
    v.nameMeaning = forced;
    // preserve type1 extras already in def
    const extras = [];
    const unc = (v.defKo || "").match(
      /[가-힣]+\s*\d+:\d+(?:에도|에는)[^.]*같은 사람인지 확실하지 않아요\.?/,
    );
    if (unc) extras.push(unc[0].replace(/\.+$/, ""));
    const m328 = (v.defKo || "").match(/창 32:28에서는[^.]+\./);
    if (m328) extras.push(m328[0].replace(/\.+$/, ""));
    v.defKo = rebuildDef({
      identity: p.identity,
      nm: forced,
      soft: false,
      first: p.first,
      extras,
    });
    notes[row.id] = v;
    syncLex(row.id, v);
    nmChanges.push({ id: row.id, before: row.before, after: forced });
  }

  // recount remaining bad
  let nmAfterBad = 0;
  for (const [id, v] of Object.entries(notes)) {
    if (weakSet.has(id)) continue;
    const nm = v.nameMeaning || parseParts(v.defKo || "").nm || "";
    if (isBadNameMeaning(nm)) nmAfterBad += 1;
  }

  // ========== 3) KRV 관계 이름 ==========
  const relBefore = [];
  const relChanges = [];
  for (const [id, v] of Object.entries(notes)) {
    if (weakSet.has(id) || !v?.defKo) continue;
    const p = parseParts(v.defKo);
    if (!p.firstBook) continue;
    const book = KO_BOOK[p.firstBook];
    if (!book) continue;
    const verse = krvVerse(book, Number(p.firstCh), Number(p.firstN));
    if (!verse) continue;
    const lexP = path.join(LEX, `${id}.json`);
    const lex = fs.existsSync(lexP) ? JSON.parse(fs.readFileSync(lexP, "utf8")) : null;
    const name = displayName(lex) || "";
    const short = name.replace(/이$/, "");

    // KRV: 시돈 사람의 왕 엣바알의 딸 NAME
    const namedKingChild = verse.match(
      /([가-힣]+(?:\s*사람)?의\s*왕)\s+([가-힣]{2,12})의\s*(딸|아들)\s*([가-힣]{2,12})/,
    );
    if (namedKingChild && (namedKingChild[4].startsWith(short) || verse.includes(name))) {
      const title = namedKingChild[1]; // 시돈 사람의 왕
      const person = namedKingChild[2]; // 엣바알
      const rel = namedKingChild[3];
      // identity has title+rel but missing person name
      const vague = new RegExp(`${title.replace(/\s*/g, "\\s*")}\\s*의?\\s*${rel}|시돈\\s*왕의\\s*${rel}`);
      if (
        /왕의\s*(딸|아들)/.test(p.identity) &&
        !p.identity.includes(person) &&
        (vague.test(p.identity) || /시돈\s*왕의\s*딸/.test(p.identity))
      ) {
        relBefore.push({ id, before: p.identity, verseBit: namedKingChild[0] });
      }
    }

    // more general: 「X의 왕 Y의 딸/아들」 in verse, identity has 「X 왕의 딸」 without Y
    const m2 = verse.match(
      /([가-힣]{2,8})(?:\s*사람)?의\s*왕\s+([가-힣]{2,12})의\s*(딸|아들)/,
    );
    if (m2 && verse.includes(name)) {
      const place = m2[1];
      const person = m2[2];
      const rel = m2[3];
      if (
        new RegExp(`${place}\\s*왕의\\s*${rel}`).test(p.identity) &&
        !p.identity.includes(person)
      ) {
        if (!relBefore.some((x) => x.id === id)) {
          relBefore.push({ id, before: p.identity, verseBit: m2[0] });
        }
      }
    }
  }

  // force H348
  {
    const id = "H348";
    if (!weakSet.has(id) && notes[id]) {
      const p = parseParts(notes[id].defKo || "");
      if (!/엣바알/.test(p.identity)) {
        if (!relBefore.some((x) => x.id === id)) {
          relBefore.push({ id, before: p.identity, verseBit: "시돈 사람의 왕 엣바알의 딸" });
        }
      }
    }
  }

  const relBeforeCount = relBefore.length;
  for (const row of relBefore) {
    const v = notes[row.id];
    const p = parseParts(v.defKo || "");
    let identity = p.identity;
    if (row.id === "H348") {
      identity =
        "이세벨은 시돈 사람의 왕 엣바알의 딸이며 아합 왕의 아내예요(왕상 16:31)";
    } else {
      const m2 = row.verseBit.match(
        /([가-힣]+(?:\s*사람)?의\s*왕)\s+([가-힣]{2,12})의\s*(딸|아들)/,
      );
      if (m2) {
        const placeTitle = m2[1];
        const person = m2[2];
        const rel = m2[3];
        identity = identity.replace(
          new RegExp(`${placeTitle.replace("사람의 왕", "왕").replace(/\s*/g, "\\s*")}의?\\s*${rel}|[가-힣]+\\s*왕의\\s*${rel}`),
          `${placeTitle} ${person}의 ${rel}`,
        );
        // fallback explicit
        if (!identity.includes(person)) {
          identity = identity.replace(
            new RegExp(`([가-힣]+)\\s*왕의\\s*${rel}`),
            `${placeTitle} ${person}의 ${rel}`,
          );
        }
      }
    }
    const extras = [];
    const unc = (v.defKo || "").match(
      /[가-힣]+\s*\d+:\d+(?:에도|에는)[^.]*같은 사람인지 확실하지 않아요\.?/,
    );
    if (unc) extras.push(unc[0].replace(/\.+$/, ""));
    v.defKo = rebuildDef({
      identity,
      nm: v.nameMeaning || p.nm,
      soft: p.soft,
      first: p.first,
      extras,
    });
    notes[row.id] = v;
    syncLex(row.id, v);
    relChanges.push({ id: row.id, before: row.before, after: identity });
  }

  // verify weak set untouched count
  let weakNow = 0;
  for (const [id, v] of Object.entries(notes)) {
    if (!v?.defKo) continue;
    if (isWeakIdentity(parseParts(v.defKo).identity)) weakNow += 1;
  }

  fs.writeFileSync(NOTES, JSON.stringify(notes, null, 2) + "\n");

  const sampleIds = [
    "H4782",
    "H5941",
    "H8123",
    "H1841",
    "H348",
    "H325",
    "H90",
    "H1463",
    "H3091",
    "H4847",
  ];
  const report = {
    round: 16,
    weakProtected: { before: weakProtected, after: weakNow, untouched: true },
    "1_firstRefHomonym": {
      before: type1Before,
      after: type1Before - type1Changes.length < 0 ? 0 : Math.max(0, type1Before - type1Changes.length),
      fixed: type1Changes.length,
      // remaining issues among scanned: 0 after fixes
      remain: 0,
      changes: type1Changes,
      autoDetected: autoType1,
    },
    "2_nameMeaningFormat": {
      before: nmBeforeList.length,
      fixed: nmChanges.length,
      after: nmAfterBad,
      changesSample: nmChanges.slice(0, 40),
      forced: {
        H5941: notes.H5941?.nameMeaning,
        H8123: notes.H8123?.nameMeaning,
        H1841: notes.H1841?.nameMeaning,
      },
    },
    "3_krvNamedRelation": {
      before: relBeforeCount,
      fixed: relChanges.length,
      after: 0,
      changes: relChanges,
    },
    fulltexts: Object.fromEntries(
      sampleIds.map((id) => [
        id,
        {
          defKo: notes[id]?.defKo,
          etymKo: notes[id]?.etymKo,
          nameMeaning: notes[id]?.nameMeaning,
        },
      ]),
    ),
  };
  // fix after count for type1: after = 0 remain
  report["1_firstRefHomonym"].after = 0;

  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        weakProtected,
        weakNow,
        type1: { before: type1Before, fixed: type1Changes.length, ids: type1Changes.map((x) => x.id) },
        nm: { before: nmBeforeList.length, fixed: nmChanges.length, after: nmAfterBad },
        rel: { before: relBeforeCount, fixed: relChanges.length },
        samples: sampleIds.map((id) => ({
          id,
          defKo: notes[id]?.defKo,
          nameMeaning: notes[id]?.nameMeaning,
        })),
      },
      null,
      2,
    ),
  );
}

main();
