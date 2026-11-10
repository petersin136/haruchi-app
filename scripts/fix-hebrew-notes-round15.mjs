/**
 * 히브리어 15차: 약한 신원(나오는 인물·왕이에요 등) → 역할·관계 한 줄
 *   node scripts/fix-hebrew-notes-round15.mjs
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
const REPORT = path.join(OUT, "_hebrew-notes-round15-report.json");

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
function parseParts(def) {
  const raw = String(def || "").replace(/\s+/g, " ").trim();
  const firstM = raw.match(/처음 나오는 곳:\s*([가-힣]+)\s*(\d+):(\d+)\.?/);
  const first = firstM ? `처음 나오는 곳: ${firstM[1]} ${firstM[2]}:${firstM[3]}.` : "";
  const firstRef = firstM ? `${firstM[1]} ${firstM[2]}:${firstM[3]}` : "";
  const nmM = raw.match(/이름 뜻은\s*「([^」]+)」([^.]*)\./);
  const soft = nmM ? /보기도/.test(nmM[2] || "") : false;
  const nm = nmM ? nmM[1] : "";
  const unc = /이름 뜻은 확실하지 않아요/.test(raw);
  let identity = raw
    .replace(/처음 나오는 곳:\s*[^.]+\./g, " ")
    .replace(/이름 뜻은\s*「[^」]+」[^.]*(?:\.|$)/g, " ")
    .replace(/이름 뜻은 확실하지 않아요\.?/g, " ")
    .replace(/이름 뜻 「혼잡」은[^.]+\./g, " ")
    .replace(/히브리어로는 쌍수 꼴로[^.]+\./g, " ")
    .replace(/창 32:28에서는[^.]+\./g, " ")
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
function krvChapter(book, ch) {
  const p = path.join(KRV, book, String(ch), "korean.json");
  if (!fs.existsSync(p)) return [];
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return j.verses?.krv || [];
  } catch {
    return [];
  }
}
function nearbyText(book, ch, n, radius = 4) {
  const verses = krvChapter(book, ch);
  if (!verses.length) return krvVerse(book, ch, n);
  return verses
    .filter((v) => Math.abs(v.n - n) <= radius)
    .map((v) => v.t)
    .join(" ");
}

/** 15차 약한 신원: 틀만 바뀐 문장·직분만 있는 문장 */
function isWeakIdentity(identity) {
  const x = String(identity || "")
    .trim()
    .replace(/\.+$/, "");
  if (!x) return false;
  if (/^같은 이름이 여럿/.test(x)) return false;
  if (/땅 이름이자 사람/.test(x)) return false;

  if (/에 나오는 인물이에요$/.test(x)) return true;
  if (/에 나오는 사람이에요$/.test(x)) return true;
  if (/에 처음 소개되는 인물이에요$/.test(x)) return true;
  if (/에 나오는 고유명사예요$/.test(x)) return true;
  if (/구약에 나오는 고유명사예요$/.test(x)) return true;
  if (/성경에 나오는 인명이에요$/.test(x)) return true;
  if (/이스라엘 사람이에요$/.test(x)) return true;

  // 역할·관계 없이 직분만
  if (/^[가-힣()약식·,\s]+[은는] 왕이에요(\([^)]*\))?$/.test(x)) return true;
  if (/^[가-힣()약식·,\s]+[은는] 제사장이에요(\([^)]*\))?$/.test(x)) return true;
  if (/^[가-힣()약식·,\s]+[은는] 대제사장이에요(\([^)]*\))?$/.test(x)) return true;
  if (/^[가-힣()약식·,\s]+[은는] 예언자예요(\([^)]*\))?$/.test(x)) return true;
  if (/^[가-힣()약식·,\s]+[은는] 선지자예요(\([^)]*\))?$/.test(x)) return true;
  if (/^[가-힣()약식·,\s]+[은는] 사사예요(\([^)]*\))?$/.test(x)) return true;
  if (/^[가-힣()약식·,\s]+[은는] 두령이에요(\([^)]*\))?$/.test(x)) return true;
  if (/^[가-힣()약식·,\s]+[은는] (유다의|이스라엘의|이스라엘|바벨론|모압|아람|블레셋|시리아|바산) ?왕이에요(\([^)]*\))?$/.test(
    x,
  ))
    return true;
  if (/^[가-힣()약식·,\s]+[은는] (유다|이스라엘) 왕이에요(\([^)]*\))?$/.test(x)) return true;

  return false;
}

function classifyWeak(identity) {
  const x = String(identity || "");
  if (/나오는 인물|나오는 사람|처음 소개|고유명사|인명이에요|이스라엘 사람이에요/.test(x))
    return "틀문장";
  if (/왕이에요/.test(x)) return "왕계열";
  if (/제사장|예언|선지|사사|두령/.test(x)) return "직분만";
  return "other";
}

/** 유명 인물·오분류 교정 수작업 */
const HAND_ID = {
  H74: "아브넬은 사울의 숙부 넬의 아들이며 사울의 군대 장관이에요(삼상 14:50)",
  H4782: "모르드개는 에스더의 사촌으로, 에스더서의 주요 인물이에요(에 2:5–7; 귀환자 명단은 스 2:2)",
  H7346: "르호보암은 솔로몬의 아들이며, 나라가 나뉜 뒤 유다의 첫 왕이에요(왕상 11:43; 14:21)",
  H3169: "여히스기야는 살룸의 아들이며 에브라임 자손의 두령이에요(대하 28:12, 개역한글 「여히스기야」)",
  H5815: "아시엘은 비파를 타서 여창에 맞추는 레위 사람이에요(대상 15:20)",
  H5019: "느부갓네살은 바벨론 왕으로, 유다를 침공·포로로 잡아가게 한 왕이에요(왕하 24:1)",
  H5020: "느부갓네살은 바벨론 왕이에요(스 2:1, 아람어 표기)",
  H609: "아사는 아비얌의 아들이며 유다의 왕이에요(왕상 15:8)",
  H1841: "다니엘은 바벨론·바사 시대의 예언자이며 다니엘서의 주인공이에요",
  H1111: "발락은 십볼의 아들이며 모압 왕이에요(민 22:2)",
  H8123: "삼손은 단 지파 마노아의 아들이며 블레셋을 친 사사예요(삿 13:24; 16장)",
  H5941: "엘리는 실로의 제사장이며 홉니·비느하스의 아버지예요(삼상 1:3)",
  H271: "아하스는 요담의 아들이며 유다의 왕이에요(왕하 15:38; 16장)",
  H274: "아하시야는 유다·이스라엘에 각각 동명이인 왕이 있어요(왕상 22:40 등)",
  H5511: "시혼은 아모리 족속의 왕이에요(민 21:21)",
  H1436: "그달리야는 아히감의 아들로, 바벨론이 세운 유다 총독이에요(왕하 25:22)",
  H325: "아하수에로는 에스더 시대 바사(페르시아)의 왕이에요",
  H1201: "바아사는 이스라엘의 왕이에요(왕상 15:16)",
  H5818: "웃시야(아사랴)는 아마샤의 아들이며 유다의 왕이에요(왕하 15장)",
  H2371: "하사엘은 아람(시리아)의 왕이에요",
  H348: "이세벨은 시돈 왕의 딸이며 아합 왕의 아내예요(왕상 16:31)",
  H378: "이스보셋은 사울의 아들이며 이스라엘의 왕이에요(삼하 2:8)",
  H5022: "나봇은 이스르엘 사람으로, 아합이 탐낸 포도원 주인이어요(왕상 21:1)",
  H5037: "나발은 갈멜의 부자로, 다윗을 박대한 사람이에요(삼상 25:3)",
  H5747: "옥은 바산 왕이에요(민 21:33)",
  H1909: "하닷에셀은 소바 왕으로 다윗과 싸운 아람 왕이에요",
  H397: "아기스는 가드 왕으로 다윗이 피신해 간 블레셋 왕이에요(삼상 21:10)",
  H5281: "나오미는 엘리멜렉의 아내이며 룻의 시어머니예요(룻 1:2)",
  H302: "아히도벨은 다윗의 모사였다가 압살롬 편에 선 책사예요(삼하 15:12)",
  H296: "아히감은 사반의 아들로, 예레미야를 보호한 이예요(왕하 22:12; 렘 26:24)",
  H477: "엘리사는 엘리야의 뒤를 이은 예언자예요(왕상 19장)",
  H2148:
    "스가랴는 동명이인이 많아요. 그중에 여로보암 시대 이스라엘 왕 스가랴도 있어요(왕하 14:29)",
};

function identityFromStrong(name, meaning) {
  const m = String(meaning || "");
  if (!m) return "";
  const low = m.toLowerCase();

  if (/wife of king ahab/i.test(m)) return `${name}${eunNeun(name)} 아합 왕의 아내예요`;
  if (/son of king saul/i.test(m)) return `${name}${eunNeun(name)} 사울의 아들이에요`;
  if (/high\s*priest/i.test(m)) return `${name}${eunNeun(name)} 대제사장이에요`;
  if (/the famous prophet|hebrew prophet|the prophet/i.test(m))
    return `${name}${eunNeun(name)} 예언자예요`;

  const kingOf = m.match(
    /king of ([A-Za-z][A-Za-z\s-]+?)(?:,|;|$|\))/i,
  );
  const nationMap = {
    babylon: "바벨론",
    israel: "이스라엘",
    judah: "유다",
    moab: "모압",
    syria: "아람",
    bashan: "바산",
    philistine: "블레셋",
    "a philistine": "블레셋",
  };
  if (/moabitish king/i.test(m)) return `${name}${eunNeun(name)} 모압 왕이에요`;
  if (/amoritish king/i.test(m)) return `${name}${eunNeun(name)} 아모리 족속의 왕이에요`;
  if (/syrian king|king of syria/i.test(m)) return `${name}${eunNeun(name)} 아람(시리아) 왕이에요`;
  if (/philistine king/i.test(m)) return `${name}${eunNeun(name)} 블레셋 왕이에요`;
  if (/jewish king|king of judah/i.test(m) && !/israelite king/i.test(m))
    return `${name}${eunNeun(name)} 유다의 왕이에요`;
  if (/king of israel|a king of israel/i.test(m))
    return `${name}${eunNeun(name)} 이스라엘의 왕이에요`;
  if (/king of babylon/i.test(m)) return `${name}${eunNeun(name)} 바벨론 왕이에요`;
  if (/israelite king/i.test(m)) return `${name}${eunNeun(name)} 이스라엘 왕이에요`;
  if (kingOf) {
    const key = kingOf[1].trim().toLowerCase();
    for (const [en, ko] of Object.entries(nationMap)) {
      if (key.includes(en)) return `${name}${eunNeun(name)} ${ko} 왕이에요`;
    }
  }
  return "";
}

function extractRelation(name, text) {
  if (!text) return { bits: [], son: "", fatherOf: "", role: "" };
  const short = name.replace(/이$/, "");
  const bits = [];
  let son = "";
  let fatherOf = "";
  let role = "";

  // X의 아들 NAME / NAME … X의 아들
  const sonPatterns = [
    new RegExp(`([가-힣]{2,12})의\\s*(?:아들|장자|차자)\\s*${short}`),
    new RegExp(`${short}[^가-힣]{0,6}([가-힣]{2,12})의\\s*(?:아들|장자|차자)`),
    new RegExp(`그\\s*아들\\s*${short}`),
  ];
  for (const re of sonPatterns) {
    const m = text.match(re);
    if (m?.[1] && m[1] !== short) {
      son = m[1];
      break;
    }
  }
  // 「그 아들 NAME이 대신하여 왕이」 — 앞 절에 아버지
  if (!son && new RegExp(`아들\\s*${short}`).test(text)) {
    const before = text.split(new RegExp(`아들\\s*${short}`))[0] || "";
    // 직전 인물: 「솔로몬이 … 그 아들 르호보암」
    const prev = before.match(/([가-힣]{2,12})이\s[^가-힣]{0,40}$/);
    if (prev) son = prev[1];
  }

  const dau = text.match(new RegExp(`([가-힣]{2,12})의\\s*딸\\s*${short}`));
  if (dau) bits.push(`${dau[1]}의 딸`);

  const wife = text.match(
    new RegExp(`${short}[^.]{0,20}(?:아내|왕비)|(?:아내|왕비)[^.]{0,20}${short}`),
  );
  if (/아내|왕비/.test(text) && new RegExp(short).test(text)) {
    const hm = text.match(/([가-힣]{2,12})(?:의)?\s*(?:아내|왕비)/);
    if (hm && hm[1] !== short) bits.push(`${hm[1]}의 아내`);
  }

  // 군장/군대장관
  if (/군장|군대|대장|장군/.test(text) && new RegExp(short).test(text)) {
    if (/사울/.test(text)) role = "사울의 군대 장관";
    else role = "군대 장관";
  }
  if (/두목|두령|족장/.test(text) && new RegExp(short).test(text)) {
    const tribe = text.match(/([가-힣]{2,8})\s*자손/);
    role = tribe ? `${tribe[1]} 자손의 두령` : "두령";
  }
  if (/비파|수금|제금|여창/.test(text) && new RegExp(short).test(text)) {
    role = "비파를 타는 레위 사람";
  }
  if (/제사장/.test(text) && new RegExp(short).test(text)) role = role || "제사장";
  if (/선지자|예언자/.test(text) && new RegExp(short).test(text)) role = role || "예언자";
  if (/사사/.test(text) && new RegExp(short).test(text)) role = role || "사사";
  if (/총독/.test(text) && new RegExp(short).test(text)) role = role || "총독";
  if (/모사|책사/.test(text) && new RegExp(short).test(text)) role = role || "책사";

  // 왕
  if (
    (/대신하여 왕이|왕이 되니|왕이 되어|왕 느|왕\s/.test(text) || /왕이에요/.test("")) &&
    new RegExp(short).test(text)
  ) {
    if (/유다\s*왕|유다의 왕|유다 왕이/.test(text)) role = role || "유다의 왕";
    else if (/이스라엘\s*왕|이스라엘의 왕|이스라엘 왕이/.test(text))
      role = role || "이스라엘의 왕";
    else if (/바벨론\s*왕/.test(text)) role = role || "바벨론 왕";
    else if (/모압/.test(text) && /왕/.test(text)) role = role || "모압 왕";
    else if (/아람|시리아/.test(text) && /왕/.test(text)) role = role || "아람 왕";
    else if (/바산/.test(text) && /왕/.test(text)) role = role || "바산 왕";
    else if (/블레셋|가드/.test(text) && /왕/.test(text)) role = role || "블레셋 왕";
    else if (/왕이/.test(text) || /왕\s/.test(text)) role = role || "왕";
  }

  if (son) bits.unshift(`${son}의 아들`);
  return { bits, son, fatherOf, role, wife: Boolean(wife) };
}

function composeIdentity(name, rel, firstRef, strongHint) {
  const chunks = [];
  for (const b of rel.bits || []) {
    if (!chunks.includes(b)) chunks.push(b);
  }
  // strongHint may be full sentence — only use role fragment if needed
  let role = rel.role || "";
  if (!role && strongHint) {
    const m = strongHint.match(
      /((?:사울의 군대 장관|[가-힣]+ 자손의 두령|비파를 타는 레위 사람|대제사장|제사장|예언자|사사|총독|책사|[가-힣]+의 왕|[가-힣]+ 왕|왕))$/,
    );
    if (m) role = m[1];
    else {
      // extract after 은/는
      const m2 = strongHint.match(/[은는]\s*(.+?)이에요|[은는]\s*(.+?)예요/);
      const frag = (m2?.[1] || m2?.[2] || "").replace(/\([^)]*\)/g, "").trim();
      if (frag && !/^왕$/.test(frag)) role = frag;
      else if (frag) role = frag;
    }
  }
  if (role && !chunks.some((c) => c.includes(role) || role.includes(c))) chunks.push(role);

  if (!chunks.length) return "";

  // one-line
  let body;
  if (chunks.length === 1) body = chunks[0];
  else if (chunks.length === 2) body = `${chunks[0]}이며 ${chunks[1]}`;
  else body = `${chunks[0]}이며 ${chunks.slice(1).join(", ")}`;

  const ref = firstRef ? `(${firstRef})` : "";
  // 이미 이에요/예요로 끝나는 role 조각 방지
  body = body.replace(/이에요$|예요$/, "");
  return `${name}${eunNeun(name)} ${body}${ieya(body.slice(-1))}${ref}`;
}

function enrichFromContext(name, book, ch, n, firstRef, meaning) {
  const verse = krvVerse(book, Number(ch), Number(n));
  const near = nearbyText(book, Number(ch), Number(n), 5);
  const rel = extractRelation(name, `${verse} ${near}`);
  const strongHint = identityFromStrong(name, meaning);
  let identity = composeIdentity(name, rel, firstRef, strongHint);

  // Strong만으로 역할이 있고 관계가 없을 때
  if (!identity && strongHint) {
    identity = firstRef ? `${strongHint.replace(/\.?$/, "")}(${firstRef})` : strongHint;
  }

  // 아들만이라도
  if (!identity && rel.son) {
    identity = `${name}${eunNeun(name)} ${rel.son}의 아들이에요(${firstRef})`;
  }

  return { identity, verse, near, rel, strongHint };
}

function stillWeakOrThin(identity) {
  if (!identity) return true;
  if (isWeakIdentity(identity)) return true;
  // 아들만 / 딸만 — 허용(족보). not thin for "unfilled"
  return false;
}

function main() {
  const notes = JSON.parse(fs.readFileSync(NOTES, "utf8"));
  const meta = loadStrongMeta();

  // ----- 0) H3478 nameMeaning 끝맺음 통일 -----
  const nm3478before = notes.H3478?.nameMeaning || "";
  if (notes.H3478) {
    notes.H3478.nameMeaning = "하나님과 겨루어 이겼다";
    const p = parseParts(notes.H3478.defKo || "");
    notes.H3478.defKo = rebuildDef({
      identity: p.identity || "이스라엘은 야곱에게 주신 이름이며, 그 자손 백성과 나라를 가리켜요(창 32:28)",
      nm: "하나님과 겨루어 이겼다",
      soft: false,
      first: p.first || "처음 나오는 곳: 창 32:28.",
      extras: ["창 32:28에서는 「겨루어 이기었음」으로 그 이름을 설명해요"],
    });
    syncLex("H3478", notes.H3478);
  }

  // ----- 1) 약한 신원 전수 -----
  const weakRows = [];
  for (const [id, v] of Object.entries(notes)) {
    if (!v?.defKo) continue;
    const parts = parseParts(v.defKo);
    if (!isWeakIdentity(parts.identity)) continue;
    let countOT = 0;
    let lex = null;
    const lexP = path.join(LEX, `${id}.json`);
    if (fs.existsSync(lexP)) {
      lex = JSON.parse(fs.readFileSync(lexP, "utf8"));
      countOT = lex.countOT || 0;
    }
    weakRows.push({
      id,
      countOT,
      before: parts.identity,
      cat: classifyWeak(parts.identity),
      parts,
      lex,
    });
  }
  weakRows.sort((a, b) => b.countOT - a.countOT || a.id.localeCompare(b.id));

  const beforeCats = {};
  for (const r of weakRows) beforeCats[r.cat] = (beforeCats[r.cat] || 0) + 1;
  const weakBefore = weakRows.length;

  // H3169 / H5815도 역할 문장 보강(이미 약하지 않아도 요청 반영)
  for (const id of ["H3169", "H5815"]) {
    if (!notes[id] || !HAND_ID[id]) continue;
    const p = parseParts(notes[id].defKo || "");
    notes[id].defKo = rebuildDef({
      identity: HAND_ID[id],
      nm: notes[id].nameMeaning || p.nm,
      soft: p.soft,
      first: p.first,
    });
    syncLex(id, notes[id]);
  }

  let fixed = 0;
  let genealogyOnly = 0;
  let noClue = 0;
  const noClueIds = [];
  const samples = [];
  const changes = [];

  for (const row of weakRows) {
    const { id, parts, lex } = row;
    const v = notes[id];
    const name = displayName(lex) || id.replace(/^H/, "");
    const meaning = meta.get(id)?.meaning || "";
    let identity = "";
    let how = "";

    if (HAND_ID[id]) {
      identity = HAND_ID[id];
      how = "hand";
    } else {
      const book = KO_BOOK[parts.firstBook];
      const enriched = book
        ? enrichFromContext(
            name,
            book,
            parts.firstCh,
            parts.firstN,
            parts.firstRef,
            meaning,
          )
        : {
            identity: identityFromStrong(name, meaning),
            rel: { bits: [], son: "", role: "" },
          };
      identity = enriched.identity || "";
      how = identity ? (enriched.rel?.role || enriched.rel?.son ? "krv+strong" : "strong") : "";

      // 족보만
      if (identity && /^[가-힣()약식·,\s]+[은는] [^이]+의 아들이에요(\([^)]*\))?$/.test(identity)) {
        genealogyOnly += 1;
        how = "genealogy";
      }
      if (identity && /^[가-힣()약식·,\s]+[은는] [^이]+의 딸이에요(\([^)]*\))?$/.test(identity)) {
        genealogyOnly += 1;
        how = "genealogy";
      }
    }

    if (!identity || stillWeakOrThin(identity)) {
      // 최후: 기존 직분 문장에 Strong 보강이 안 되면 미해결
      const strongOnly = identityFromStrong(name, meaning);
      if (strongOnly && !isWeakIdentity(strongOnly.replace(/\([^)]*\)/g, "").trim())) {
        identity = parts.firstRef
          ? `${strongOnly.replace(/\.?$/, "")}(${parts.firstRef})`
          : strongOnly;
        how = "strong";
      } else if (strongOnly) {
        // strong도 직분만이면 KRV 아들 재시도
        const book = KO_BOOK[parts.firstBook];
        if (book) {
          const near = nearbyText(book, Number(parts.firstCh), Number(parts.firstN), 8);
          const rel = extractRelation(name, near);
          if (rel.son) {
            const roleFrag = strongOnly
              .replace(new RegExp(`^${name}[은는]\\s*`), "")
              .replace(/이에요$|예요$/, "");
            identity = `${name}${eunNeun(name)} ${rel.son}의 아들이며 ${roleFrag}${ieya(roleFrag.slice(-1))}(${parts.firstRef})`;
            how = "son+strong";
          } else {
            identity = parts.firstRef
              ? `${strongOnly.replace(/\.?$/, "")}(${parts.firstRef})`
              : strongOnly;
            // still may be weak-ish office-only but better than 나오는 인물
            how = "strong-office";
          }
        }
      }
    }

    if (!identity || /에 나오는 인물이에요/.test(identity)) {
      noClue += 1;
      noClueIds.push({ id, countOT: row.countOT, before: row.before });
      // leave as-is (don't write worse)
      continue;
    }

    // 직분만으로 남은 경우도 기록상 fixed로 세되, after weak 재집계에서 잡힐 수 있음
    const before = parts.identity;
    v.defKo = rebuildDef({
      identity,
      nm: v.nameMeaning || parts.nm,
      soft: parts.soft,
      first: parts.first,
      extras: id === "H3478"
        ? ["창 32:28에서는 「겨루어 이기었음」으로 그 이름을 설명해요"]
        : [],
    });
    notes[id] = v;
    syncLex(id, v);
    fixed += 1;
    changes.push({ id, countOT: row.countOT, before, after: identity, how });
    if (samples.length < 40) samples.push({ id, countOT: row.countOT, before, after: identity, how });
  }

  // recount weak
  let weakAfter = 0;
  const afterCats = {};
  const remainWeak = [];
  for (const [id, v] of Object.entries(notes)) {
    if (!v?.defKo) continue;
    const idn = parseParts(v.defKo).identity;
    if (!isWeakIdentity(idn)) continue;
    weakAfter += 1;
    const cat = classifyWeak(idn);
    afterCats[cat] = (afterCats[cat] || 0) + 1;
    let countOT = 0;
    try {
      countOT = JSON.parse(fs.readFileSync(path.join(LEX, `${id}.json`), "utf8")).countOT || 0;
    } catch {
      /* */
    }
    remainWeak.push({ id, countOT, identity: idn, cat });
  }
  remainWeak.sort((a, b) => b.countOT - a.countOT);

  fs.writeFileSync(NOTES, JSON.stringify(notes, null, 2) + "\n");

  const sampleIds = [
    "H74",
    "H4782",
    "H7346",
    "H3169",
    "H5815",
    "H5019",
    "H609",
    "H1841",
    "H8123",
    "H5941",
    "H1111",
    "H348",
    "H378",
    "H5281",
    "H3478",
  ];
  const fulltexts = Object.fromEntries(
    sampleIds.map((id) => [
      id,
      {
        defKo: notes[id]?.defKo,
        etymKo: notes[id]?.etymKo,
        nameMeaning: notes[id]?.nameMeaning,
      },
    ]),
  );

  const report = {
    round: 15,
    weakIdentity: {
      before: weakBefore,
      beforeCats,
      fixed,
      after: weakAfter,
      afterCats,
      genealogyOnly,
      noClue,
      noClueSample: noClueIds.slice(0, 30),
      remainTop: remainWeak.slice(0, 40),
    },
    nameMeaningH3478: {
      before: nm3478before,
      after: notes.H3478?.nameMeaning,
      rule: "동사 끝맺음(…다)으로 통일 — 예: 들으셨다·강하게 하신다",
    },
    samples: changes.filter((c) => sampleIds.includes(c.id)),
    fulltexts,
    changeSample: samples.slice(0, 20),
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");

  console.log(
    JSON.stringify(
      {
        weakBefore,
        beforeCats,
        fixed,
        weakAfter,
        afterCats,
        genealogyOnly,
        noClue,
        H3478: notes.H3478?.nameMeaning,
        sampleDefs: sampleIds.map((id) => ({ id, def: notes[id]?.defKo })),
      },
      null,
      2,
    ),
  );
}

main();
