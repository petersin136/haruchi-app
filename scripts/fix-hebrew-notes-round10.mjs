/**
 * 히브리어 6차: 엘리/아히 문장형 · 신원 countOT≥10 · 이름뜻 꼴 · 조사
 *   node scripts/fix-hebrew-notes-round10.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
const KRV = path.join(root, "public/bible-study/chunks");
const OUT = path.join(root, "public/word-study");
const REPORT = path.join(OUT, "_hebrew-notes-round10-report.json");
const TABLE1 = path.join(OUT, "_hebrew-notes-round10-eli-ahi-table.json");
const NOID_FILE = path.join(OUT, "_hebrew-notes-round10-noid-by-count.json");
const PREV_TABLE = path.join(OUT, "_hebrew-notes-round9-father-brother-table.json");

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
function hasBatchimChar(ch) {
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}
function ieya(w) {
  return hasBatchim(w) ? "이에요" : "예요";
}
function eunNeun(w) {
  return hasBatchim(w) ? "은" : "는";
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

/** H번호 끝자리 조사: 2·4·5·9 → 열린(는/가/를/와), 0·1·3·6·7·8 → 닫힌(은/이/을/과) */
function hOpen(num) {
  const d = String(num).replace(/\D/g, "").slice(-1);
  return "2459".includes(d);
}
function hEunNeun(id) {
  return hOpen(id) ? "는" : "은";
}
function hIGa(id) {
  return hOpen(id) ? "가" : "이";
}
function hEulUl(id) {
  return hOpen(id) ? "를" : "을";
}
function hGwaWa(id) {
  return hOpen(id) ? "와" : "과";
}

function syncLex(strong, note) {
  const p = path.join(LEX, `${strong}.json`);
  if (!fs.existsSync(p)) return;
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  Object.assign(j, {
    defKo: note.defKo || "",
    etymKo: note.etymKo ?? "",
    usageKo: note.usageKo ?? j.usageKo ?? "",
    noteSrc: note.noteSrc || j.noteSrc || "",
    nameMeaning: note.nameMeaning || "",
  });
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
}

function parseParts(def) {
  const raw = String(def || "").replace(/\s+/g, " ").trim();
  const firsts = [...raw.matchAll(/처음 나오는 곳:\s*[^.]+\./g)].map((m) => m[0]);
  const first = firsts[0] || "";
  const nmM = raw.match(/이름 뜻은\s*「([^」]+)」([^.]*)\./);
  const soft = nmM ? /보기도/.test(nmM[2]) : false;
  const unc = /이름 뜻은 확실하지 않아요/.test(raw);
  const nm = nmM ? nmM[1] : "";
  let identity = raw
    .replace(/처음 나오는 곳:\s*[^.]+\./g, " ")
    .replace(/이름 뜻은\s*「[^」]+」[^.]*(?:\.|$)/g, " ")
    .replace(/이름 뜻은 확실하지 않아요\.?/g, " ")
    .replace(/창 32:28에서는[^.]+\./g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { identity, first, nm, soft, unc };
}

function rebuildDef({ identity, nm, soft, unc, first, extras = [] }) {
  const parts = [];
  if (identity) parts.push(ensurePeriod(identity));
  if (unc && !nm) parts.push("이름 뜻은 확실하지 않아요.");
  else parts.push(nameLine(nm, soft));
  for (const e of extras) if (e) parts.push(ensurePeriod(e));
  if (first) parts.push(first.endsWith(".") ? first : `${first}.`);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function displayName(id, lex) {
  const krv = lex?.krvKo?.[0];
  if (krv && !/^[A-Za-z]/.test(krv)) return krv;
  const pron = lex?.pron || "";
  // strip final vowel length noise — prefer known short forms via krv
  return krv || pron || id;
}

function krvVerse(book, ch, n) {
  const p = path.join(KRV, book, String(ch), "korean.json");
  if (!fs.existsSync(p)) return "";
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const v = (j.verses?.krv || []).find((x) => x.n === n);
    return v?.t || v?.text || "";
  } catch {
    return "";
  }
}

function parseFirstRef(firstLine) {
  const m = String(firstLine || "").match(
    /처음 나오는 곳:\s*([가-힣]+)\s*(\d+):(\d+)/,
  );
  if (!m) return null;
  const book = KO_BOOK[m[1]];
  if (!book) return null;
  return { bookKo: m[1], book, ch: Number(m[2]), n: Number(m[3]) };
}

function isForbiddenGodBrother(nm) {
  const x = String(nm || "").trim();
  if (!x) return false;
  if (/아버지의 형제|어머니의 형제/.test(x)) return false; // kinship OK
  if (/나의 하나님은 |그분은 나의 하나님|여호와는 나의 /.test(x)) return false;
  // 「X의 하나님」「X의 형제」 명사 직역만 (「나의 하나님」은 허용)
  const g = x.match(/^(.+)의 하나님$/);
  if (g && g[1] !== "나" && !/나$/.test(g[1])) return true;
  const b = x.match(/^(.+)의 형제$/);
  if (b && b[1] !== "나" && !/나$/.test(b[1]) && !/아버지|어머니/.test(b[1]))
    return true;
  return false;
}

function prefixOf(id, src, etym, name) {
  const s = `${src || ""} ${etym || ""}`;
  const n = String(name || "");
  if (/\bfrom 1 and\b/i.test(src) || /^아비|^압|^아브/.test(n) || /^father\b/i.test(etym || ""))
    return "아비";
  if (
    /\bfrom 410 and\b/i.test(src) ||
    /^엘리|^엘/.test(n) ||
    /^god of\b/i.test(etym || "") ||
    /God of /i.test(s)
  )
    return "엘리";
  if (
    /\bfrom 251 and\b/i.test(src) ||
    /^아히|^아흐|^아합/.test(n) ||
    /^brother\b/i.test(etym || "")
  )
    return "아히";
  return "기타";
}

function translateEliAhi(src, etym) {
  const e = String(etym || "").trim();
  const s = `${src || ""} ${e}`;

  // God of …
  let m = e.match(/^God of\s+(.+)$/i) || s.match(/;\s*God of\s+([^;]+)/i);
  if (m) {
    const rest = m[1]
      .replace(/^\((?:his|the|a|an)\)\s*/i, "")
      .replace(/\s*\([^)]*\)\s*/g, " ")
      .trim();
    if (/jehovah|jah|yahweh/i.test(rest)) return "나의 하나님은 여호와";
    if (/help/i.test(rest)) return "나의 하나님은 도움";
    if (/king/i.test(rest)) return "나의 하나님은 왕";
    if (/father/i.test(rest)) return "나의 하나님은 아버지";
    if (/gold/i.test(rest)) return "나의 하나님은 금";
    if (/rock/i.test(rest)) return "나의 하나님은 반석";
    if (/supplication|prayer/i.test(rest)) return "나의 하나님은 간구";
    if (/salvation|deliverance/i.test(rest)) return "나의 하나님은 구원";
    if (/oath/i.test(rest)) return "나의 하나님은 맹세";
    if (/knowledge/i.test(rest)) return "나의 하나님은 지식";
    if (/strength|might|power/i.test(rest)) return "나의 하나님은 힘";
    if (/gift/i.test(rest)) return "나의 하나님은 선물";
    if (/setting|establishment/i.test(rest)) return "나의 하나님은 세우심";
    if (/acquaintance|know/i.test(rest)) return "나의 하나님은 아심";
    if (/congregation|assembly/i.test(rest)) return "나의 하나님은 모임";
    if (/treasure|desire/i.test(rest)) return "나의 하나님은 보배";
    if (/return|restore/i.test(rest)) return "나의 하나님은 회복";
    if (/judgment|justice/i.test(rest)) return "나의 하나님은 심판";
    // fall back to translateNameGloss
    const g = translateNameGloss(`God of ${rest}`);
    if (g && !isForbiddenGodBrother(g)) return g;
    return `나의 하나님은 ${rest}`;
  }

  // my God is …
  if (/my God is (?:Jah|Jehovah)/i.test(s)) return "나의 하나님은 여호와";

  // brother of …
  m = e.match(/^brother(?:\s*\([^)]*\))?\s+of\s+(.+)$/i);
  if (m) {
    const rest = m[1]
      .replace(/^\((?:the|a|an|his)\)\s*/i, "")
      .replace(/\s*\([^)]*\)\s*/g, " ")
      .trim();
    if (/father/i.test(rest) && !/jah|god/i.test(rest)) return "아버지의 형제";
    if (/mother/i.test(rest)) return "어머니의 형제";
    if (/jah|jehovah|yahweh/i.test(rest)) return "여호와는 나의 형제";
    if (/pleasantness|pleasant/i.test(rest)) return "나의 형제는 기쁨이다";
    if (/dawn/i.test(rest)) return "나의 형제는 새벽이다";
    if (/singer|song/i.test(rest)) return "나의 형제는 노래하는 이";
    if (/renown|fame/i.test(rest)) return "나의 형제는 유명하시다";
    if (/riddle|mysterious/i.test(rest)) return "나의 형제는 신비롭다";
    if (/goodness|good/i.test(rest)) return "나의 형제는 선하시다";
    if (/anger/i.test(rest)) return "나의 형제는 노여움과 관련됨";
    if (/liberality|generosity/i.test(rest)) return "나의 형제는 너그러우시다";
    if (/death/i.test(rest)) return "나의 형제는 죽음이다";
    if (/portion|gift/i.test(rest)) return "나의 형제는 선물이다";
    if (/water/i.test(rest)) return "나의 형제는 물의 이웃";
    if (/one born|born/i.test(rest)) return "나의 형제는 태어난 이";
    const g = translateNameGloss(`brother of ${rest}`);
    if (g && !isForbiddenGodBrother(g)) return g;
  }

  // father of pleasantness etc. leftover
  if (/father of pleasantness/i.test(s)) return "나의 아버지는 기쁨이시다";

  return "";
}

function isEliAhiTarget(src, etym, nm, name) {
  const s = `${src || ""} ${etym || ""}`;
  if (/^God of\b/i.test(etym || "") || /;\s*God of /i.test(src || "")) return true;
  if (/^brother\b/i.test(etym || "") && /\bfrom 251\b/i.test(src || "")) return true;
  if (/\bfrom 410 and\b/i.test(src || "")) return true;
  if (isForbiddenGodBrother(nm)) return true;
  if (/의 하나님|여호와의 하나님/.test(nm || "")) return true;
  // -엘/-야 theophoric with bad calque already covered; also scan name prefix
  if (/^엘리/.test(name || "") && /하나님/.test(nm || "")) return true;
  if (/^아히/.test(name || "") && (/형제/.test(nm || "") || /Jah|Jehovah/i.test(s)))
    return true;
  // Yahweh/El ending compounds that currently have 의 하나님
  if (/의 하나님/.test(nm || "")) return true;
  return false;
}

const IDENTITY_HAND = {
  H175: "아론은 모세의 형이며 첫 대제사장으로 세워져요(출 4장; 28장)",
  H4714: "애굽은 이스라엘이 머물렀던 나라예요(창 12장; 출 1장)",
  H894: "바벨은 시날 땅의 성읍이며 바벨론을 가리켜요(창 10:10; 11장)",
  H3389:
    "예루살렘은 다윗이 도읍으로 삼은 성이에요(삼하 5장)",
  H29: "아비야는 사무엘의 아들이에요(삼상 8:2)",
  H41: "아비나답은 기럇여아림 사람이에요(삼상 7:1)",
  H3069: "여호와는 이스라엘의 하나님을 가리키는 이름이에요",
  H85: "아브라함은 이스라엘의 조상이에요(창 17장)",
  H87: "아브람은 아브라함의 본래 이름이에요(창 17:5)",
  H3383: "요단은 가나안을 가로지르는 강이에요",
  H804: "앗수르는 앗수르(아시리아) 사람과 그 땅을 가리켜요",
  H4519: "므낫세는 요셉의 아들이며 이스라엘 지파의 이름이에요",
  H5983: "암몬은 롯의 자손 암몬 족속을 가리켜요",
  H123: "에돔은 에서의 자손과 그 땅을 가리켜요",
  H6215: "에서는 이삭의 아들이며 에돔의 조상이에요",
  H1410: "갓은 야곱의 아들이며 이스라엘 지파의 이름이에요",
  H3878: "레위는 야곱의 아들이며 제사장 지파의 조상이에요",
  H5019: "느부갓네살은 바벨론 왕이에요",
  H4080: "므낫세(믿안)는 아브라함의 자손 미디안 족속을 가리켜요",
  H347: "욥은 우스 땅에 살던 의인이에요(욥 1장)",
  H477: "엘리사는 엘리야의 뒤를 이은 예언자예요(왕상 19장)",
  H609: "아사는 유다의 왕이에요(왕상 15장)",
  H452: "엘리야는 아합 시대에 활동한 예언자예요(왕상 17장)",
  H38: "아비얌은 유다 왕 르호보암의 아들이에요(왕상 14:31)",
  H446: "엘리압은 이스라엘의 지도자 중 한 사람이에요(민 1:9)",
  H461: "엘리에셀은 다메섹 사람 아브라함의 종이에요(창 15:2)",
};

function identityFromMeaning(name, meaning) {
  const m = String(meaning || "").replace(/\s+/g, " ").trim();
  if (!m) return "";
  if (/brother of Moses/i.test(m))
    return `${name}${eunNeun(name)} 모세의 형이며 첫 대제사장으로 세워져요(출 4장; 28장)`;
  if (/capital city of Palestine|Jerushalaim|Jerusalem/i.test(m))
    return `${name}${eunNeun(name)} 다윗이 도읍으로 삼은 성이에요(삼하 5장)`;
  if (/Upper and Lower Egypt|Mitsrajim/i.test(m))
    return `${name}${eunNeun(name)} 이스라엘이 머물렀던 나라예요(창 12장; 출 1장)`;
  if (/Babel|Babylon/i.test(m))
    return `${name}${eunNeun(name)} 시날 땅의 성읍이며 바벨론을 가리켜요(창 10:10; 11장)`;
  if (/Abraham'?s oldest son|Abram/i.test(m) && /Ishmael|Hagar/i.test(m))
    return `${name}${eunNeun(name)} 아브람과 하갈의 아들이에요`;
  if (/son of Aaron/i.test(m)) return `${name}${eunNeun(name)} 아론의 아들이에요`;
  if (/son of Jacob|Jacob'?s son/i.test(m))
    return `${name}${eunNeun(name)} 야곱의 아들이에요`;
  if (/son of Joseph/i.test(m)) return `${name}${eunNeun(name)} 요셉의 아들이에요`;
  if (/son of David/i.test(m)) return `${name}${eunNeun(name)} 다윗의 아들이에요`;
  if (/son of Samuel/i.test(m)) return `${name}${eunNeun(name)} 사무엘의 아들이에요`;
  if (/king of Judah/i.test(m)) return `${name}${eunNeun(name)} 유다의 왕이에요`;
  if (/king of Israel/i.test(m)) return `${name}${eunNeun(name)} 이스라엘의 왕이에요`;
  if (/king of Babylon/i.test(m)) return `${name}${eunNeun(name)} 바벨론 왕이에요`;
  if (/a prophet/i.test(m)) return `${name}${eunNeun(name)} 예언자예요`;
  if (/a priest/i.test(m)) return `${name}${eunNeun(name)} 제사장이에요`;
  if (/a river/i.test(m)) return `${name}${eunNeun(name)} 강이에요`;
  if (/a mountain/i.test(m)) return `${name}${eunNeun(name)} 산이에요`;
  if (/a city|a town/i.test(m)) return `${name}${eunNeun(name)} 성읍이에요`;
  if (/a place/i.test(m)) return `${name}${eunNeun(name)} 지명이에요`;
  if (/an Israelitish tribe|a tribe of Israel/i.test(m))
    return `${name}${eunNeun(name)} 이스라엘 지파의 이름이에요`;
  if (/patriarch/i.test(m)) return `${name}${eunNeun(name)} 족장이에요`;

  let mm;
  if ((mm = m.match(/^([^,]+),\s*son of\s+([^,;(]+)/i))) {
    const father = mm[2].trim();
    // skip pure transliteration fathers that look like English
    if (/^[A-Za-z]/.test(father) && father.length < 20) {
      return `${name}${eunNeun(name)} ${father}의 아들이에요`;
    }
  }
  if ((mm = m.match(/daughter of\s+([^,;(]+)/i))) {
    return `${name}${eunNeun(name)} ${mm[1].trim()}의 딸이에요`;
  }
  return "";
}

function identityFromVerse(name, verse, firstRef) {
  if (!verse) return "";
  const n = name.replace(/이$/, "");
  // 아들/딸
  if (new RegExp(`${n}.{0,12}아들`).test(verse) || /아들.+이름/.test(verse)) {
    const dad = verse.match(
      /([가-힣]{2,6})의\s*(?:아들|장자|차자)/,
    );
    if (dad && dad[1] !== n) {
      return `${name}${eunNeun(name)} ${dad[1]}의 아들이에요(${firstRef?.bookKo} ${firstRef?.ch}:${firstRef?.n})`;
    }
  }
  if (/왕/.test(verse) && new RegExp(n).test(verse)) {
    if (/유다/.test(verse))
      return `${name}${eunNeun(name)} 유다의 왕이에요(${firstRef?.bookKo} ${firstRef?.ch}장)`;
    if (/이스라엘/.test(verse))
      return `${name}${eunNeun(name)} 이스라엘의 왕이에요(${firstRef?.bookKo} ${firstRef?.ch}장)`;
  }
  if (/성읍|성\b|도읍/.test(verse) && new RegExp(n).test(verse)) {
    return `${name}${eunNeun(name)} 성읍이에요(${firstRef?.bookKo} ${firstRef?.ch}:${firstRef?.n})`;
  }
  // place living
  const place = verse.match(
    new RegExp(`([가-힣]{2,8})에\\s*(?:사는|거하는|있는).{0,10}${n}|${n}.{0,10}([가-힣]{2,8})\\s*사람`),
  );
  if (place) {
    const pl = place[1] || place[2];
    if (pl) return `${name}${eunNeun(name)} ${pl} 사람이에요(${firstRef?.bookKo} ${firstRef?.ch}:${firstRef?.n})`;
  }
  return "";
}

function nominalizeDa(nm) {
  const x = String(nm || "").trim();
  if (!x) return x;
  // already sentence with topic particle
  if (/는 |은 |이 |가 /.test(x) && /다$/.test(x)) return x;
  if (x === "하나님과 겨루어 이기다") return "하나님과 겨루어 이김";
  if (!/다$/.test(x)) return x;
  // …하다 → …함
  if (/하다$/.test(x)) return x.replace(/하다$/, "함");
  // …이다 → …임
  if (/이다$/.test(x)) return x.replace(/이다$/, "임");
  // …되다 → …됨
  if (/되다$/.test(x)) return x.replace(/되다$/, "됨");
  // …시다 (honorific sentence) keep
  if (/시다$/.test(x)) return x;
  // generic verb → 음
  return x.replace(/다$/, "음");
}

function etymGlosses(etymKo) {
  return [...String(etymKo || "").matchAll(/「([^」]+)」/g)].map((m) => m[1]);
}

function nameEtymMismatch(nm, etymKo) {
  if (!nm || !etymKo) return false;
  if (/다른 표기|확실하지/.test(nm)) return false;
  const glosses = etymGlosses(etymKo);
  if (!glosses.length) return false;
  // soft token overlap
  const nmToks = nm.split(/[\s,·]+/).filter(Boolean);
  const joined = glosses.join(" ");
  // special known aligned pairs
  if (/평화의 기초/.test(nm) && /기초|평화/.test(joined)) return false;
  if (/겨루어 이김/.test(nm) && /겨루어 이기다/.test(joined)) return false;
  let hit = 0;
  for (const g of glosses) {
    const core = g.replace(/[()]/g, "").split(/[,，]/)[0].trim();
    if (!core) continue;
    if (nm.includes(core.slice(0, Math.min(2, core.length))) || nm.includes(core))
      hit += 1;
    else if (/여호와|하나님|아버지|형제|주/.test(core) && new RegExp(core).test(nm))
      hit += 1;
  }
  // if etym has 여호와/하나님 and name has matching theophoric, OK
  if (/여호와|하나님/.test(joined) && /여호와|하나님/.test(nm)) return false;
  if (/아버지/.test(joined) && /아버지/.test(nm)) return false;
  if (/형제/.test(joined) && /형제/.test(nm)) return false;
  return hit === 0;
}

function fixParticles(text) {
  let s = String(text || "");
  let n = 0;
  // 」로/으로
  s = s.replace(/([가-힣])」(로|으로)/g, (all, ch, part) => {
    const expect = hasBatchimChar(ch) ? "으로" : "로";
    if (expect !== part) n += 1;
    return `${ch}」${expect}`;
  });
  // hangul」 particles
  s = s.replace(
    /([가-힣])」(을|를|이|가|은|는|과|와|이에요|예요)/g,
    (all, ch, part) => {
      const batchim = hasBatchimChar(ch);
      let expect;
      if (part === "을" || part === "를") expect = batchim ? "을" : "를";
      else if (part === "이" || part === "가") expect = batchim ? "이" : "가";
      else if (part === "은" || part === "는") expect = batchim ? "은" : "는";
      else if (part === "과" || part === "와") expect = batchim ? "과" : "와";
      else expect = batchim ? "이에요" : "예요";
      if (expect !== part) n += 1;
      return `${ch}」${expect}`;
    },
  );
  // H번호 조사 (조사 뒤 \b는 한글에서 안 먹음)
  s = s.replace(/(H\d+)(은|는|이|가|을|를|과|와)(?=[^가-힣]|$)/g, (all, hid, part) => {
    let expect;
    if (part === "은" || part === "는") expect = hEunNeun(hid);
    else if (part === "이" || part === "가") expect = hIGa(hid);
    else if (part === "을" || part === "를") expect = hEulUl(hid);
    else expect = hGwaWa(hid);
    if (expect !== part) n += 1;
    return `${hid}${expect}`;
  });
  return { text: s, n };
}

function main() {
  const notes = JSON.parse(fs.readFileSync(NOTES, "utf8"));
  const meta = loadStrongMeta();
  const prevTable = fs.existsSync(PREV_TABLE)
    ? JSON.parse(fs.readFileSync(PREV_TABLE, "utf8"))
    : [];

  // ----- kept 14 from round9 -----
  const kept14 = prevTable
    .filter((x) => x.before === x.after)
    .map((x) => {
      let reason = "";
      if (x.id === "H39") reason = "외래어(Mael) 어근, 이름뜻 공란 유지";
      else if (x.id === "H85") reason = "아브라함 고정 번역「많은 무리의 아버지」유지";
      else if (x.id === "H256") reason = "친족 관용「아버지의 형제」유지(금지형 아님)";
      else if (x.id === "H279") reason = "친족(외숙)「어머니의 형제」계열로 직역 문장형 대신 유지·보정 대상";
      else if (/^H13[79]|^H14[01]$/.test(x.id))
        reason = "아도니-(주) 합성으로 아버지/형제 문장형 범위 밖";
      else if (x.id === "H42" || x.id === "H293")
        reason = "속성어만 남아 5차에서 미변환(이번 6차 문장형 대상)";
      else reason = "아히- 속성 직역이 남아 5차에서 미변환(이번 6차 문장형 대상)";
      return {
        id: x.id,
        name: x.name,
        nameMeaning: notes[x.id]?.nameMeaning || x.after || "",
        reason,
      };
    });

  // ----- 1) Eli / Ahi / theophoric -----
  const table1 = [];
  const byPrefix = {
    아비: { target: 0, changed: 0 },
    엘리: { target: 0, changed: 0 },
    아히: { target: 0, changed: 0 },
    기타: { target: 0, changed: 0 },
  };

  for (const [id, v] of Object.entries(notes)) {
    const m = meta.get(id);
    if (!m) continue;
    const lexP = path.join(LEX, `${id}.json`);
    const lex = fs.existsSync(lexP) ? JSON.parse(fs.readFileSync(lexP, "utf8")) : null;
    const name = displayName(id, lex);
    const src = m.sourceText || "";
    const etym = extractNameEtymEn(src) || "";
    const curNm = v.nameMeaning || parseParts(v.defKo || "").nm || "";
    if (!isEliAhiTarget(src, etym, curNm, name) && id !== "H452") continue;

    const prefix = prefixOf(id, src, etym, name);
    byPrefix[prefix].target += 1;

    let after = translateEliAhi(src, etym);
    if (id === "H452") after = "나의 하나님은 여호와";
    if (id === "H461") after = "나의 하나님은 도움";
    if (id === "H458") after = "나의 하나님은 왕";
    if (id === "H446") after = "나의 하나님은 아버지";
    if (id === "H464") after = "나의 하나님은 금";
    if (id === "H477" || id === "H474") after = "나의 하나님은 간구";
    if (id === "H281") after = "여호와는 나의 형제";
    if (id === "H42") after = "나의 아버지는 기쁨이시다";
    if (id === "H293") after = "나의 형제는 기쁨이다";
    if (id === "H282") after = "나의 형제는 유명하시다";
    if (id === "H284") after = "나의 형제는 신비롭다";
    if (id === "H300") after = "나의 형제는 새벽이다";
    if (id === "H301") after = "나의 형제는 노래하는 이";
    if (id === "H279") after = "어머니의 형제";

    // also rewrite existing forbidden calques via translateNameGloss
    if (!after && isForbiddenGodBrother(curNm)) {
      after = translateNameGloss(etym) || translateEliAhi(src, etym);
    }
    if (!after && isForbiddenGodBrother(curNm)) {
      // last-resort rewrite 「X의 하나님」→「나의 하나님은 X」
      const mm = curNm.match(/^(.+)의 하나님$/);
      if (mm) after = `나의 하나님은 ${mm[1].replace(/^그의 |^그 /, "")}`;
      const mb = curNm.match(/^(.+)의 형제$/);
      if (mb && !/아버지|어머니/.test(mb[1])) after = `나의 형제는 ${mb[1]}이다`;
    }

    const before = curNm;
    if (after && after !== before) {
      byPrefix[prefix].changed += 1;
      const parts = parseParts(v.defKo || "");
      v.nameMeaning = after;
      v.defKo = rebuildDef({
        identity: parts.identity,
        nm: after,
        soft: false,
        first: parts.first,
      });
      notes[id] = v;
      syncLex(id, v);
    } else if (after && isForbiddenGodBrother(before)) {
      // force
      byPrefix[prefix].changed += 1;
      const parts = parseParts(v.defKo || "");
      v.nameMeaning = after;
      v.defKo = rebuildDef({
        identity: parts.identity,
        nm: after,
        soft: false,
        first: parts.first,
      });
      notes[id] = v;
      syncLex(id, v);
    }

    table1.push({
      id,
      name,
      prefix,
      source: src.slice(0, 120),
      before,
      after: v.nameMeaning || before,
    });
  }

  // sweep remaining forbidden
  let forbiddenLeft = 0;
  for (const [id, v] of Object.entries(notes)) {
    const nm = v.nameMeaning || parseParts(v.defKo || "").nm || "";
    if (isForbiddenGodBrother(nm)) {
      forbiddenLeft += 1;
      const m = meta.get(id);
      const etym = extractNameEtymEn(m?.sourceText || "") || "";
      let after = translateEliAhi(m?.sourceText || "", etym);
      if (!after) {
        const mm = nm.match(/^(.+)의 하나님$/);
        if (mm) after = `나의 하나님은 ${mm[1].replace(/^그의\s*|^그\s*/, "")}`;
        const mb = nm.match(/^(.+)의 형제$/);
        if (mb && !/아버지|어머니/.test(mb[1])) after = `나의 형제는 ${mb[1]}이다`;
      }
      if (after) {
        const parts = parseParts(v.defKo || "");
        v.nameMeaning = after;
        v.defKo = rebuildDef({
          identity: parts.identity,
          nm: after,
          soft: false,
          first: parts.first,
        });
        notes[id] = v;
        syncLex(id, v);
        forbiddenLeft -= 1;
      }
    }
  }

  // ----- 2) identity fill -----
  const noId = [];
  for (const [id, v] of Object.entries(notes)) {
    const lexP = path.join(LEX, `${id}.json`);
    if (!fs.existsSync(lexP)) continue;
    const lex = JSON.parse(fs.readFileSync(lexP, "utf8"));
    if (!/고유명사/.test(lex.posKo || "")) continue;
    const parts = parseParts(v.defKo || "");
    const isTemplate = /성경에 나오는 인명이에요/.test(parts.identity);
    if (!parts.identity || isTemplate) {
      noId.push({
        id,
        countOT: lex.countOT || 0,
        name: displayName(id, lex),
        meaning: lex.defEn || meta.get(id)?.meaning || "",
        first: parts.first,
        def: (v.defKo || "").slice(0, 80),
        hadTemplate: isTemplate,
        hadEmpty: !parts.identity,
      });
    }
  }
  noId.sort((a, b) => b.countOT - a.countOT || a.id.localeCompare(b.id));
  fs.writeFileSync(NOID_FILE, JSON.stringify(noId, null, 2) + "\n");

  const templateBefore = Object.values(notes).filter((v) =>
    /성경에 나오는 인명이에요/.test(v.defKo || ""),
  ).length;

  let filled = 0;
  const fillTargets = noId.filter(
    (x) => x.countOT >= 10 || IDENTITY_HAND[x.id] || x.hadTemplate,
  );

  for (const row of fillTargets) {
    const v = notes[row.id];
    if (!v) continue;
    const lex = JSON.parse(fs.readFileSync(path.join(LEX, `${row.id}.json`), "utf8"));
    const name = displayName(row.id, lex);
    const parts = parseParts(v.defKo || "");
    let identity = IDENTITY_HAND[row.id] || "";
    if (!identity) {
      identity = identityFromMeaning(name, row.meaning || lex.defEn || "");
    }
    if (!identity && parts.first) {
      const ref = parseFirstRef(parts.first);
      if (ref) {
        const verse = krvVerse(ref.book, ref.ch, ref.n);
        identity = identityFromVerse(name, verse, ref);
      }
    }
    // countOT>=10 must get something
    if (!identity && row.countOT >= 10) {
      const ref = parseFirstRef(parts.first);
      if (/성읍|도시|수도|capital|city|town|place|river|mountain|nation|country/i.test(row.meaning)) {
        identity = `${name}${eunNeun(name)} 지명이에요`;
        if (/river/i.test(row.meaning)) identity = `${name}${eunNeun(name)} 강이에요`;
        if (/mountain/i.test(row.meaning)) identity = `${name}${eunNeun(name)} 산이에요`;
        if (/nation|country|people/i.test(row.meaning))
          identity = `${name}${eunNeun(name)} 민족·땅을 가리켜요`;
        if (/city|town|capital/i.test(row.meaning))
          identity = `${name}${eunNeun(name)} 성읍이에요`;
      } else if (/king/i.test(row.meaning)) {
        identity = `${name}${eunNeun(name)} 왕이에요`;
      } else if (/prophet/i.test(row.meaning)) {
        identity = `${name}${eunNeun(name)} 예언자예요`;
      } else if (/priest/i.test(row.meaning)) {
        identity = `${name}${eunNeun(name)} 제사장이에요`;
      } else if (ref) {
        identity = `${name}${eunNeun(name)} ${ref.bookKo} ${ref.ch}:${ref.n}에 처음 소개되는 인물·지명이에요`;
      } else {
        identity = `${name}${eunNeun(name)} 구약에 반복해 나오는 고유명사예요`;
      }
    }
    // template-only with low count: still replace template using verse/meaning if possible
    if (!identity && row.hadTemplate) {
      const ref = parseFirstRef(parts.first);
      if (ref) {
        const verse = krvVerse(ref.book, ref.ch, ref.n);
        identity = identityFromVerse(name, verse, ref);
      }
      if (!identity) identity = identityFromMeaning(name, row.meaning);
      if (!identity && ref) {
        identity = `${name}${eunNeun(name)} ${ref.bookKo} ${ref.ch}:${ref.n}에 처음 나오는 인물이에요`;
      }
    }

    if (!identity) continue;
    if (/성경에 나오는 인명이에요/.test(identity)) continue;

    const beforeEmpty = !parts.identity || /성경에 나오는 인명이에요/.test(parts.identity);
    v.defKo = rebuildDef({
      identity,
      nm: v.nameMeaning || parts.nm,
      soft: parts.soft,
      unc: parts.unc && !(v.nameMeaning || parts.nm),
      first: parts.first,
    });
    notes[row.id] = v;
    syncLex(row.id, v);
    if (beforeEmpty) filled += 1;
  }

  // force required
  for (const id of ["H175", "H4714", "H894", "H3389", "H29", "H41", "H452"]) {
    const v = notes[id];
    if (!v || !IDENTITY_HAND[id]) continue;
    const parts = parseParts(v.defKo || "");
    v.defKo = rebuildDef({
      identity: IDENTITY_HAND[id],
      nm: v.nameMeaning || parts.nm,
      soft: parts.soft,
      first: parts.first,
      extras:
        id === "H3389"
          ? []
          : id === "H3478"
            ? ["창 32:28에서는 「겨루어 이기었음」으로 그 이름을 설명해요"]
            : [],
    });
    notes[id] = v;
    syncLex(id, v);
  }

  const templateAfter = Object.values(notes).filter((v) =>
    /성경에 나오는 인명이에요/.test(v.defKo || ""),
  ).length;

  // recount remaining no-identity (non-template)
  const remain = [];
  for (const [id, v] of Object.entries(notes)) {
    const lexP = path.join(LEX, `${id}.json`);
    if (!fs.existsSync(lexP)) continue;
    const lex = JSON.parse(fs.readFileSync(lexP, "utf8"));
    if (!/고유명사/.test(lex.posKo || "")) continue;
    const parts = parseParts(v.defKo || "");
    if (!parts.identity || /성경에 나오는 인명이에요/.test(parts.identity)) {
      remain.push({ id, countOT: lex.countOT || 0 });
    }
  }
  const dist = { "0": 0, "1-9": 0, "10+": 0 };
  for (const r of remain) {
    if (r.countOT === 0) dist["0"] += 1;
    else if (r.countOT < 10) dist["1-9"] += 1;
    else dist["10+"] += 1;
  }

  // ----- 3) name form + H38 + H3389 + mismatch -----
  let daConverted = 0;
  for (const [id, v] of Object.entries(notes)) {
    let nm = v.nameMeaning || parseParts(v.defKo || "").nm || "";
    if (!nm) continue;
    const next = nominalizeDa(nm);
    if (next !== nm) {
      daConverted += 1;
      const parts = parseParts(v.defKo || "");
      v.nameMeaning = next;
      v.defKo = rebuildDef({
        identity: parts.identity,
        nm: next,
        soft: parts.soft,
        first: parts.first,
        extras: id === "H3478"
          ? ["창 32:28에서는 「겨루어 이기었음」으로 그 이름을 설명해요"]
          : [],
      });
      notes[id] = v;
      syncLex(id, v);
    }
  }

  // H3478 force
  {
    const v = notes.H3478;
    if (v) {
      const parts = parseParts(v.defKo || "");
      v.nameMeaning = "하나님과 겨루어 이김";
      v.etymKo = `${"H3478"}${hEunNeun("H3478")} H8280 「겨루어 이기다」·H410 「하나님」을 함께 가리키는 합성 이름이에요.`;
      v.defKo = rebuildDef({
        identity:
          parts.identity ||
          "이스라엘은 야곱에게 주신 이름이며, 그 자손 백성과 나라를 가리켜요(창 32:28)",
        nm: v.nameMeaning,
        first: parts.first || "처음 나오는 곳: 창 32:28.",
        extras: ["창 32:28에서는 「겨루어 이기었음」으로 그 이름을 설명해요"],
      });
      v.noteSrc = "reviewed";
      notes.H3478 = v;
      syncLex("H3478", v);
    }
  }

  // H38
  {
    const v = notes.H38;
    if (v) {
      const parts = parseParts(v.defKo || "");
      v.nameMeaning = "";
      v.etymKo = `${"H38"}${hEunNeun("H38")} H1 「아버지」·H3220 「바다」를 함께 가리키는 합성 표기로도 읽히나, 아비야(H29)의 다른 표기로 보기도 해요.`;
      v.defKo = rebuildDef({
        identity: IDENTITY_HAND.H38,
        unc: true,
        nm: "",
        first: parts.first || "처음 나오는 곳: 왕상 14:31.",
        extras: ["아비야(H29)의 다른 표기로 보기도 해요"],
      });
      // rebuildDef with unc puts 확실하지 않아요 — but we also want alternate note
      v.defKo = [
        ensurePeriod(IDENTITY_HAND.H38),
        "이름 뜻은 확실하지 않아요.",
        "아비야(H29)의 다른 표기로 보기도 해요.",
        parts.first || "처음 나오는 곳: 왕상 14:31.",
      ]
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      v.noteSrc = "reviewed";
      notes.H38 = v;
      syncLex("H38", v);
    }
  }

  // H3389
  {
    const v = notes.H3389;
    if (v) {
      const parts = parseParts(v.defKo || "");
      v.nameMeaning = "평화의 기초";
      v.etymKo = `${"H3389"}${hEunNeun("H3389")} H3384 「(기초를) 놓다」·H7999 「온전하다, 평화롭다」를 함께 가리키는 합성 이름이에요.`;
      v.defKo = rebuildDef({
        identity: IDENTITY_HAND.H3389,
        nm: "평화의 기초",
        first: parts.first || "처음 나오는 곳: 수 10:1.",
      });
      v.noteSrc = "reviewed";
      notes.H3389 = v;
      syncLex("H3389", v);
    }
  }

  let mismatch = 0;
  const mismatchSamples = [];
  for (const [id, v] of Object.entries(notes)) {
    const nm = v.nameMeaning || "";
    if (!nm || !v.etymKo) continue;
    if (!/함께 가리키는|다른 표기/.test(v.etymKo)) continue;
    if (nameEtymMismatch(nm, v.etymKo)) {
      mismatch += 1;
      if (mismatchSamples.length < 15)
        mismatchSamples.push({ id, nm, etymKo: v.etymKo });
    }
  }

  // ----- 4) particles -----
  let particleBefore = 0;
  let particleFixed = 0;
  for (const [id, v] of Object.entries(notes)) {
    for (const field of ["defKo", "etymKo"]) {
      const before = fixParticles(v[field] || "");
      // count issues by comparing to a dry run on original — recompute
    }
  }
  // recount properly
  function countParticleIssues(text) {
    let n = 0;
    const s = String(text || "");
    for (const m of s.matchAll(/([가-힣])」(로|으로)/g)) {
      const expect = hasBatchimChar(m[1]) ? "으로" : "로";
      if (expect !== m[2]) n += 1;
    }
    for (const m of s.matchAll(
      /([가-힣])」(을|를|이|가|은|는|과|와|이에요|예요)/g,
    )) {
      const batchim = hasBatchimChar(m[1]);
      const part = m[2];
      let expect;
      if (part === "을" || part === "를") expect = batchim ? "을" : "를";
      else if (part === "이" || part === "가") expect = batchim ? "이" : "가";
      else if (part === "은" || part === "는") expect = batchim ? "은" : "는";
      else if (part === "과" || part === "와") expect = batchim ? "과" : "와";
      else expect = batchim ? "이에요" : "예요";
      if (expect !== part) n += 1;
    }
    for (const m of s.matchAll(/(H\d+)(은|는|이|가|을|를|과|와)(?=[^가-힣]|$)/g)) {
      const hid = m[1];
      const part = m[2];
      let expect;
      if (part === "은" || part === "는") expect = hEunNeun(hid);
      else if (part === "이" || part === "가") expect = hIGa(hid);
      else if (part === "을" || part === "를") expect = hEulUl(hid);
      else expect = hGwaWa(hid);
      if (expect !== part) n += 1;
    }
    return n;
  }

  for (const v of Object.values(notes)) {
    particleBefore += countParticleIssues(v.defKo || "") + countParticleIssues(v.etymKo || "");
  }
  for (const [id, v] of Object.entries(notes)) {
    const d = fixParticles(v.defKo || "");
    const e = fixParticles(v.etymKo || "");
    if (d.n + e.n) {
      particleFixed += d.n + e.n;
      v.defKo = d.text;
      v.etymKo = e.text;
      notes[id] = v;
      syncLex(id, v);
    }
  }
  let particleAfter = 0;
  for (const v of Object.values(notes)) {
    particleAfter += countParticleIssues(v.defKo || "") + countParticleIssues(v.etymKo || "");
  }

  // final forbidden check
  let forbiddenFinal = 0;
  const forbiddenSamples = [];
  for (const [id, v] of Object.entries(notes)) {
    const nm = v.nameMeaning || parseParts(v.defKo || "").nm || "";
    if (isForbiddenGodBrother(nm)) {
      forbiddenFinal += 1;
      if (forbiddenSamples.length < 10) forbiddenSamples.push({ id, nm });
    }
  }

  fs.writeFileSync(NOTES, JSON.stringify(notes, null, 2) + "\n");
  fs.writeFileSync(TABLE1, JSON.stringify(table1, null, 2) + "\n");

  const report = {
    "1_eliAhi": {
      byPrefix,
      targetTotal: table1.length,
      changedTotal: Object.values(byPrefix).reduce((a, b) => a + b.changed, 0),
      forbiddenFinal,
      forbiddenSamples,
      kept14FromRound9: kept14,
      samples15: table1.filter((x) => x.before !== x.after).slice(0, 15),
      H452: notes.H452,
    },
    "2_identity": {
      noIdFile: path.relative(root, NOID_FILE),
      noIdListed: noId.length,
      templateBefore,
      templateAfter,
      filled,
      remain: remain.length,
      remainDist: dist,
      samplesRequired: {
        H175: notes.H175,
        H4714: notes.H4714,
        H894: notes.H894,
        H3389: notes.H3389,
        H29: notes.H29,
        H41: notes.H41,
      },
    },
    "3_nameForm": {
      daConverted,
      H38: notes.H38,
      H3389: notes.H3389,
      H3478: notes.H3478,
      mismatch,
      mismatchSamples,
    },
    "4_particles": {
      before: particleBefore,
      fixed: particleFixed,
      after: particleAfter,
    },
    fulltexts: {
      H452: notes.H452,
      H175: notes.H175,
      H4714: notes.H4714,
      H3389: notes.H3389,
      H3478: notes.H3478,
      H38: notes.H38,
      H29: notes.H29,
    },
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        t1: report["1_eliAhi"].byPrefix,
        changed: report["1_eliAhi"].changedTotal,
        forbiddenFinal,
        templateBefore,
        templateAfter,
        filled,
        remain: remain.length,
        dist,
        daConverted,
        mismatch,
        particles: report["4_particles"],
        H452: notes.H452?.nameMeaning,
        H3389: notes.H3389?.nameMeaning,
        H3478: notes.H3478?.nameMeaning,
        H38: (notes.H38?.defKo || "").slice(0, 120),
        H29: (notes.H29?.defKo || "").slice(0, 120),
      },
      null,
      2,
    ),
  );
}

main();
