#!/usr/bin/env node
/**
 * 신약 마무리 4종:
 * 1) 칩 pron = surfacePron(word)
 * 2) MorphGNT 원본 롬 16:25–27 (061625–27) 확인
 * 3) lexicon countNT 재계산
 * 4) keyword-notes auto 전부 (300개 묶음, noteSrc)
 *
 * 범위: scripts/ · public/word-study/ · data/
 * 설치·커밋·외부 API 금지.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { surfacePron, lemmaPron, stripDiacritics } from "./lib/greek-pron.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const OUT = path.join(root, "public", "word-study");
const LEX = path.join(OUT, "lexicon", "greek");
const NOTES = path.join(root, "data", "keyword-notes", "greek.json");
const BIBLE_DATA = path.join(root, "public", "bible-data");
const STRONG = path.join(root, ".cache", "strongs-greek", "strong-el.json");
const REPORT = path.join(OUT, "_greek-finish-report.json");

const NT = [
  "matthew", "mark", "luke", "john", "acts",
  "romans", "corinthians1", "corinthians2", "galatians", "ephesians",
  "philippians", "colossians", "thessalonians1", "thessalonians2",
  "timothy1", "timothy2", "titus", "philemon", "hebrews",
  "james", "peter1", "peter2", "john1", "john2", "john3", "jude", "revelation",
];

const BOOK_KO = {
  matthew: "마", mark: "막", luke: "눅", john: "요", acts: "행",
  romans: "롬", corinthians1: "고전", corinthians2: "고후", galatians: "갈",
  ephesians: "엡", philippians: "빌", colossians: "골",
  thessalonians1: "살전", thessalonians2: "살후", timothy1: "딤전", timothy2: "딤후",
  titus: "딛", philemon: "몬", hebrews: "히", james: "약",
  peter1: "벧전", peter2: "벧후", john1: "요일", john2: "요이", john3: "요삼",
  jude: "유", revelation: "계",
};

function sameForm(a, b) {
  return stripDiacritics(a || "").toLowerCase() === stripDiacritics(b || "").toLowerCase();
}

function isLemmaPronChip(word, lemma, pron) {
  if (!pron || !lemma || !word) return false;
  if (sameForm(word, lemma)) return false;
  const lp = lemmaPron(lemma);
  if (!lp) return false;
  const sp = surfacePron(word);
  return pron === lp && pron !== sp;
}

function fixProns() {
  let before = 0;
  let after = 0;
  let total = 0;
  let changed = 0;

  for (const book of NT) {
    const dir = path.join(OUT, book);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const fp = path.join(dir, f);
      const ch = JSON.parse(fs.readFileSync(fp, "utf8"));
      let dirty = false;
      for (const v of ch.verses || []) {
        for (const w of v.words || []) {
          total += 1;
          if (isLemmaPronChip(w.word, w.lemma, w.pron || "")) before += 1;
          const next = surfacePron(w.word || "");
          if (next && next !== w.pron) {
            w.pron = next;
            dirty = true;
            changed += 1;
          } else if (!w.pron && next) {
            w.pron = next;
            dirty = true;
            changed += 1;
          }
          if (isLemmaPronChip(w.word, w.lemma, w.pron || "")) after += 1;
        }
      }
      if (dirty) fs.writeFileSync(fp, JSON.stringify(ch) + "\n");
    }
  }
  return { total, lemmaPronBefore: before, lemmaPronAfter: after, changed };
}

function checkMorphgntRomansDoxology() {
  const candidates = [
    path.join(root, ".cache", "sblgnt-romans.txt"),
    path.join(root, ".cache", "66-Ro-morphgnt.txt"),
    path.join(root, ".cache", "morphgnt", "66-Ro-morphgnt.txt"),
    path.join(root, "data", "66-Ro-morphgnt.txt"),
  ];
  const found = candidates.filter((p) => fs.existsSync(p));
  // also search shallow under .cache
  const cacheDir = path.join(root, ".cache");
  if (fs.existsSync(cacheDir)) {
    for (const name of fs.readdirSync(cacheDir)) {
      if (/66-?ro|romans.*morph|sblgnt.*rom/i.test(name)) {
        const p = path.join(cacheDir, name);
        if (fs.statSync(p).isFile() && !found.includes(p)) found.push(p);
      }
    }
  }
  if (!found.length) {
    return {
      status: "원본에도 없음",
      detail:
        "프로젝트 .cache / data에 MorphGNT 66-Ro·sblgnt-romans 원본 파일이 없고, bible-v2에도 롬 16:25–27이 없음. 외부 다운로드 금지라 원본을 확인할 수 없음.",
    };
  }
  const hits = [];
  for (const p of found) {
    const text = fs.readFileSync(p, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const head = (line.trim().split(/\s+/)[0] || "");
      if (/^06162[5-7]/.test(head)) hits.push({ file: p, line });
    }
  }
  if (!hits.length) {
    return {
      status: "원본에도 없음",
      detail: `원본 파일은 있으나 061625–061627 행이 없음 (${found.map((p) => path.basename(p)).join(", ")})`,
      files: found,
    };
  }
  return { status: "있음", detail: "MorphGNT 원본에 061625–061627 존재", hits, files: found };
}

function recalcCountNT() {
  /** @type {Map<string, { total: number, byBook: Record<string, number> }>} */
  const byStrong = new Map();
  let chipTotal = 0;
  let emptyStrong = 0;
  for (const book of NT) {
    const dir = path.join(OUT, book);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const ch = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      for (const v of ch.verses || []) {
        for (const w of v.words || []) {
          chipTotal += 1;
          const s = (w.strong || "").trim();
          if (!s) {
            emptyStrong += 1;
            continue;
          }
          if (!byStrong.has(s)) byStrong.set(s, { total: 0, byBook: {} });
          const row = byStrong.get(s);
          row.total += 1;
          row.byBook[book] = (row.byBook[book] || 0) + 1;
        }
      }
    }
  }

  let updated = 0;
  let sumCount = 0;
  for (const f of fs.readdirSync(LEX).filter((x) => x.endsWith(".json"))) {
    const fp = path.join(LEX, f);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    const row = byStrong.get(d.strong) || { total: 0, byBook: {} };
    const byBook = Object.fromEntries(
      Object.entries(row.byBook).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    );
    if (d.countNT !== row.total || JSON.stringify(d.byBook || {}) !== JSON.stringify(byBook)) {
      d.countNT = row.total;
      d.byBook = byBook;
      d.count1John = row.byBook.john1 || 0;
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
      updated += 1;
    }
    sumCount += row.total;
  }
  return {
    chipTotal,
    sumCountNT: sumCount,
    delta: chipTotal - sumCount,
    emptyStrongChips: emptyStrong,
    updated,
    strongsWithCount: byStrong.size,
  };
}

function loadStrong() {
  const raw = JSON.parse(fs.readFileSync(STRONG, "utf8"));
  /** @type {Map<string, object>} */
  const map = new Map();
  for (const [k, v] of Object.entries(raw)) {
    const m = String(k).match(/(\d+)/);
    if (!m) continue;
    map.set(`G${Number(m[1])}`, v);
  }
  return map;
}

function firstGlossEn(defEn) {
  let t = String(defEn || "").trim();
  if (!t) return "";
  // drop leading quotes
  t = t.replace(/^"+|"+$/g, "");
  // take before first ; that starts biographical clause, or first sense
  const semi = t.indexOf(";");
  if (semi > 0) t = t.slice(0, semi);
  // drop (i.e. ...) for common nouns? keep for meaning
  t = t.replace(/\s+/g, " ").trim();
  // if "love, i.e. affection" → love
  const ie = t.match(/^([^,]+),\s*i\.e\./i);
  if (ie) return ie[1].trim().replace(/^"+|"+$/g, "");
  return t.split(",")[0].trim().replace(/^"+|"+$/g, "");
}

/** 영어 Strong 첫 풀이 → 짧은 한국어 뜻 (대표 뜻) */
const EN_KO = {
  the: "그",
  and: "그리고",
  but: "그러나",
  love: "사랑",
  "to love": "사랑하다",
  life: "생명",
  god: "하나님",
  lord: "주",
  man: "사람",
  woman: "여자",
  son: "아들",
  father: "아버지",
  spirit: "영",
  word: "말씀",
  faith: "믿음",
  "to believe": "믿다",
  believe: "믿다",
  come: "오다",
  "to come": "오다",
  go: "가다",
  "to go": "가다",
  say: "말하다",
  "to say": "말하다",
  speak: "말하다",
  see: "보다",
  "to see": "보다",
  hear: "듣다",
  give: "주다",
  "to give": "주다",
  take: "취하다",
  make: "만들다",
  do: "하다",
  have: "가지다",
  "to have": "가지다",
  be: "이다",
  "to be": "이다",
  all: "모든",
  every: "모든",
  one: "하나",
  day: "날",
  night: "밤",
  city: "도시",
  house: "집",
  earth: "땅",
  heaven: "하늘",
  water: "물",
  bread: "빵",
  wine: "포도주",
  blood: "피",
  death: "죽음",
  sin: "죄",
  king: "왕",
  kingdom: "나라",
  people: "백성",
  nation: "민족",
  law: "율법",
  prophet: "선지자",
  apostle: "사도",
  disciple: "제자",
  angel: "천사",
  devil: "마귀",
  holy: "거룩한",
  good: "선한",
  evil: "악한",
  true: "참된",
  truth: "진리",
  light: "빛",
  darkness: "어둠",
  peace: "평안",
  joy: "기쁨",
  grace: "은혜",
  glory: "영광",
  power: "능력",
  name: "이름",
  time: "때",
  place: "곳",
  way: "길",
  net: "그물",
  fish: "물고기",
  boat: "배",
  sea: "바다",
  mountain: "산",
  tree: "나무",
  fruit: "열매",
  seed: "씨",
  stone: "돌",
  rock: "반석",
  gold: "금",
  silver: "은",
  fire: "불",
  wind: "바람",
  voice: "음성",
  hand: "손",
  eye: "눈",
  ear: "귀",
  mouth: "입",
  heart: "마음",
  soul: "영혼",
  body: "몸",
  flesh: "육체",
  brother: "형제",
  sister: "자매",
  mother: "어머니",
  child: "아이",
  servant: "종",
  master: "주인",
  teacher: "선생",
  priest: "제사장",
  temple: "성전",
  synagogue: "회당",
  cross: "십자가",
  gospel: "복음",
  church: "교회",
  prayer: "기도",
  hope: "소망",
  fear: "두려움",
  anger: "분노",
  work: "일",
  rest: "쉼",
  begin: "시작하다",
  end: "끝",
  first: "첫째",
  last: "마지막",
  new: "새",
  old: "옛",
  great: "큰",
  small: "작은",
  many: "많은",
  few: "적은",
  world: "세상",
  forever: "영원히",
  eternal: "영원한",
  age: "시대",
  forevermore: "영원히",
  write: "쓰다",
  "to write": "쓰다",
  know: "알다",
  "to know": "알다",
  call: "부르다",
  "to call": "부르다",
  send: "보내다",
  "to send": "보내다",
  raise: "일으키다",
  die: "죽다",
  live: "살다",
  "to live": "살다",
  eat: "먹다",
  drink: "마시다",
  stand: "서다",
  sit: "앉다",
  walk: "걷다",
  run: "달리다",
  fall: "넘어지다",
  rise: "일어나다",
  open: "열다",
  shut: "닫다",
  enter: "들어가다",
  leave: "떠나다",
  remain: "남다",
  dwell: "거하다",
  teach: "가르치다",
  learn: "배우다",
  ask: "묻다",
  answer: "대답하다",
  follow: "따르다",
  lead: "인도하다",
  rule: "다스리다",
  judge: "심판하다",
  save: "구원하다",
  "to save": "구원하다",
  destroy: "멸망시키다",
  perish: "멸망하다",
  bless: "축복하다",
  curse: "저주하다",
  praise: "찬양",
  worship: "예배하다",
  repent: "회개하다",
  forgive: "용서하다",
  heal: "고치다",
  cleanse: "깨끗하게 하다",
  baptize: "세례를 주다",
  preach: "전파하다",
  proclaim: "선포하다",
  testify: "증언하다",
  witness: "증인",
  promise: "약속",
  covenant: "언약",
  commandment: "계명",
  righteousness: "의",
  mercy: "긍휼",
  compassion: "불쌍히 여김",
  wisdom: "지혜",
  knowledge: "지식",
  understanding: "깨달음",
  mind: "생각",
  will: "뜻",
  desire: "원하다",
  joyous: "기쁜",
  blessed: "복된",
  poor: "가난한",
  rich: "부유한",
  sick: "아픈",
  dead: "죽은",
  alive: "산",
  free: "자유로운",
  slave: "노예",
  friend: "친구",
  enemy: "원수",
  stranger: "나그네",
  guest: "손님",
  door: "문",
  road: "길",
  path: "길",
  field: "밭",
  garden: "동산",
  vineyard: "포도원",
  sheep: "양",
  shepherd: "목자",
  wolf: "이리",
  lion: "사자",
  bird: "새",
  star: "별",
  sun: "해",
  moon: "달",
  cloud: "구름",
  rain: "비",
  thunder: "천둥",
  earthquake: "지진",
  sword: "칼",
  shield: "방패",
  armor: "갑옷",
  crown: "면류관",
  throne: "보좌",
  book: "책",
  letter: "편지",
  scroll: "두루마리",
  ink: "먹",
  oil: "기름",
  salt: "소금",
  honey: "꿀",
  milk: "젖",
  meat: "고기",
  garment: "옷",
  robe: "겉옷",
  shoe: "신",
  money: "돈",
  coin: "동전",
  talent: "달란트",
  measure: "되",
  hour: "시",
  year: "해",
  month: "달",
  week: "주",
  sabbath: "안식일",
  feast: "잔치",
  passover: "유월절",
  tomorrow: "내일",
  today: "오늘",
  yesterday: "어제",
  now: "지금",
  then: "그때",
  here: "여기",
  there: "거기",
  where: "어디",
  when: "언제",
  how: "어떻게",
  why: "왜",
  who: "누구",
  what: "무엇",
  which: "어느",
  this: "이것",
  that: "저것",
  these: "이것들",
  those: "저것들",
  self: "자신",
  other: "다른",
  another: "또 다른",
  same: "같은",
  each: "각각",
  both: "둘 다",
  none: "아무도/전혀",
  nothing: "아무것",
  something: "어떤 것",
  someone: "어떤 이",
  anyone: "누구든지",
  everyone: "모든 이",
  everything: "모든 것",
  always: "항상",
  never: "결코",
  often: "자주",
  again: "다시",
  also: "또한",
  even: "심지어",
  only: "오직",
  still: "여전히",
  already: "이미",
  yet: "아직",
  perhaps: "아마",
  indeed: "참으로",
  truly: "진실로",
  amen: "아멘",
  yes: "예",
  no: "아니오",
  not: "아니다",
  nor: "또한 아니다",
  or: "또는",
  if: "만약",
  because: "왜냐하면",
  for: "위하여",
  therefore: "그러므로",
  so: "그래서",
  thus: "이와 같이",
  as: "처럼",
  like: "같은",
  than: "보다",
  before: "전에",
  after: "후에",
  until: "까지",
  since: "이래",
  while: "동안",
  during: "동안에",
  among: "가운데",
  between: "사이에",
  with: "함께",
  without: "없이",
  through: "통하여",
  from: "부터",
  into: "안으로",
  onto: "위로",
  upon: "위에",
  under: "아래에",
  over: "위에",
  about: "관하여",
  against: "대항하여",
  toward: "향해",
  beside: "곁에",
  near: "가까이",
  far: "멀리",
  out: "밖으로",
  away: "떠나",
  up: "위로",
  down: "아래로",
  back: "뒤로",
  forth: "앞으로",
  together: "함께",
  apart: "따로",
  alone: "홀로",
  affection: "애정",
  benevolence: "호의",
};

function glossEnToKo(en) {
  const raw = String(en || "").trim().toLowerCase().replace(/^to\s+/, "to ");
  if (!raw) return "";
  if (EN_KO[raw]) return EN_KO[raw];
  // "a (piece of) rock" → rock
  const cleaned = raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(a|an|the|to|of|in|any|sense|often|as|noun|literally|figuratively|specially|plural)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (EN_KO[cleaned]) return EN_KO[cleaned];
  const words = cleaned.split(" ").filter(Boolean);
  if (words.length === 1 && EN_KO[words[0]]) return EN_KO[words[0]];
  if (words.length === 2 && words[0] === "to" && EN_KO[`to ${words[1]}`]) return EN_KO[`to ${words[1]}`];
  if (words.length === 2 && EN_KO[words[1]]) return EN_KO[words[1]];
  return "";
}

function particleRo(noun) {
  if (!noun) return "로";
  const last = noun[noun.length - 1];
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "로";
  const jong = (code - 0xac00) % 28;
  // 받침 없음 또는 ㄹ → 로
  if (jong === 0 || jong === 8) return "로";
  return "으로";
}

function looksProper(lemma, defEn) {
  if (/^[Ἀ-ῬA-Z]/.test(lemma || "")) return true;
  return /\b(name of|the name|an Israelite|a Christian|a Roman|a city|a place|a region|a town|capitol|patriarch|apostle)\b/i.test(
    defEn || "",
  ) && !/^"(good|love|life)/i.test(defEn || "");
}

/** Strong defEn 전체에서 이름 뜻(어원 풀이) 추출 → 한국어 */
function nameMeaningFromDefEn(defEn) {
  const d = String(defEn || "").trim();
  if (!d) return { meaning: "", uncertain: true };

  // "son of Tolmai; Bar-tholomæus, ..."
  // "date-house; Beth-any, ..."
  // "Galilæa (i.e. the heathen circle), a region..."
  // "(little; but remotely...); Paulus, ..."
  // "a (piece of) rock ...; as a name, Petrus..."
  // "Jesus (i.e. Jehoshua), the name..." — Jehoshua is form not meaning → uncertain unless known map
  // "Abraham, the Hebrew patriarch" — no etymology

  let head = d;
  const semi = d.indexOf(";");
  if (semi > 0) head = d.slice(0, semi).trim();

  // rock-as-name
  if (/\bas a name\b/i.test(d) && /\brock\b/i.test(d)) {
    return { meaning: "바위, 반석", uncertain: false };
  }

  // leading parenthetical meaning: "(little; ...)"
  const leadParen = head.match(/^\(([^)]+)\)/);
  if (leadParen) {
    const inner = leadParen[1].split(";")[0].trim();
    const ko = translateNameEtym(inner);
    if (ko) return { meaning: ko, uncertain: false };
  }

  // "X (i.e. the heathen circle)" — use i.e. content if it's a meaning phrase
  const ie = head.match(/\((?:i\.e\.\s*)?([^)]+)\)/i);
  if (ie) {
    const inner = ie[1].trim();
    // skip pure alternate spellings (Jehoshua, Shimon, David, Jochanan)
    if (!/^[A-Z][a-zæœ]+(\s+[A-Z][a-z]+)?$/.test(inner) && !/^[A-Za-z]+$/.test(inner.replace(/[\s\-']/g, ""))) {
      const ko = translateNameEtym(inner);
      if (ko) return { meaning: ko, uncertain: false };
    } else {
      // alternate Hebrew form only — not a meaning
      const before = head.split("(")[0].trim();
      if (/^(son of|daughter of|gift of)/i.test(before)) {
        const ko = translateNameEtym(before);
        if (ko) return { meaning: ko, uncertain: false };
      }
      // known Hebrew-form → meaning map
      const formMap = {
        Jehoshua: "여호와는 구원이시다",
        Jochanan: "여호와는 은혜로우시다",
        Shimon: "들으심",
        David: "사랑하는 이",
        Dabid: "사랑하는 이",
      };
      if (formMap[inner]) return { meaning: formMap[inner], uncertain: false };
    }
  }

  // "son of X" / "gift of X" / "date-house" style before semicolon
  if (/^(son of|daughter of|gift of|man of|house of|city of|praise|light|rock|my |the )/i.test(head) ||
      /^(date-house|heathen circle|little)\b/i.test(head) ||
      /^[a-z][a-z\- ]{2,40}$/.test(head)) {
    const ko = translateNameEtym(head);
    if (ko) return { meaning: ko, uncertain: false };
  }

  // no etymological gloss in source
  return { meaning: "", uncertain: true, source: d };
}

function translateNameEtym(en) {
  let s = String(en || "").trim();
  if (!s) return "";
  s = s.replace(/\s+/g, " ");

  const lower = s.toLowerCase();
  const dict = {
    "son of tolmai": "톨마이의 아들",
    "son of jonas": "요나의 아들",
    "son of jonah": "요나의 아들",
    "son of thunder": "우레의 아들",
    "son of consolation": "위로의 아들",
    "son of encouragement": "격려의 아들",
    "date-house": "대추야자 집",
    "house of dates": "대추야자 집",
    "house of bread": "빵의 집",
    "house of god": "하나님의 집",
    "house of affliction": "고난의 집",
    "the heathen circle": "이방의 둘레",
    "heathen circle": "이방의 둘레",
    little: "작은 이",
    small: "작은 이",
    rock: "바위, 반석",
    "a rock": "바위, 반석",
    light: "빛",
    praise: "찬양",
    "gift of god": "하나님의 선물",
    "gift of jehovah": "여호와의 선물",
    "whom jehovah has given": "여호와께서 주신 이",
    "jehovah is salvation": "여호와는 구원이시다",
    "yahweh is salvation": "여호와는 구원이시다",
    "the lord is salvation": "여호와는 구원이시다",
    "jehovah is gracious": "여호와는 은혜로우시다",
    "yahweh is gracious": "여호와는 은혜로우시다",
    hearing: "들으심",
    "a hearing": "들으심",
    "he has heard": "들으심",
    "father of a multitude": "많은 무리의 아버지",
    "drawn out": "물에서 끌어내다",
    "drawn forth": "물에서 끌어내다",
    "foundation of peace": "평화의 기초",
    "he will be prince with god": "하나님과 겨루는 이",
    "god prevails": "하나님이 다스리시다",
    "beloved": "사랑하는 이",
    "loved": "사랑하는 이",
    "exalted": "높임을 받은 이",
    "salvation": "구원",
    "savior": "구원자",
    "anointed": "기름 부음 받은 이",
    "messiah": "메시아",
    "separated": "구별된 이",
    "pure": "순수한",
    "bitter": "쓰라림",
    "myrrh": "몰약",
    "grace": "은혜",
    "favor": "은총",
    "peace": "평안",
    "rest": "쉼",
    "comfort": "위로",
    "helper": "돕는 이",
    "defender": "옹호자",
    "man of god": "하나님의 사람",
    "servant of god": "하나님의 종",
    "lord": "주",
    "master": "주인",
    "teacher": "선생",
    "twin": "쌍둥이",
    "red": "붉음",
    "hairy": "털이 많은",
    "laughing": "웃음",
    "supplanter": "발꿈치를 잡은 이",
    "heel-catcher": "발꿈치를 잡은 이",
    "prince": "통치자",
    "king": "왕",
    "judge": "심판자",
    "healer": "고치는 이",
    "physician": "의사",
    "fisherman": "어부",
    "carpenter": "목수",
    "tentmaker": "천막 만드는 이",
  };
  if (dict[lower]) return dict[lower];

  const son = s.match(/^son of\s+(.+)$/i);
  if (son) return `${son[1].trim()}의 아들`;
  const dau = s.match(/^daughter of\s+(.+)$/i);
  if (dau) return `${dau[1].trim()}의 딸`;
  const gift = s.match(/^gift of\s+(.+)$/i);
  if (gift) return `${gift[1].trim()}의 선물`;
  const house = s.match(/^house of\s+(.+)$/i);
  if (house) return `${house[1].trim()}의 집`;
  const man = s.match(/^man of\s+(.+)$/i);
  if (man) return `${man[1].trim()}의 사람`;
  const city = s.match(/^city of\s+(.+)$/i);
  if (city) return `${city[1].trim()}의 성`;

  // short english phrase → leave empty rather than English dump
  if (/^[a-z][a-z\- ]{1,30}$/i.test(s) && s.split(" ").length <= 4) {
    const bits = s.toLowerCase().split(/[\s\-]+/).map((w) => EN_KO[w] || "").filter(Boolean);
    if (bits.length) return bits.join(" ");
  }
  return "";
}

function loadKrvIndex() {
  /** @type {Map<string, { book: string, ch: number, v: number, gloss: string, krv: string }[]>} */
  const idx = new Map();
  /** first verse per strong */
  for (const book of NT) {
    let bd = null;
    const bdp = path.join(BIBLE_DATA, `${book}.json`);
    if (fs.existsSync(bdp)) bd = JSON.parse(fs.readFileSync(bdp, "utf8"));
    const dir = path.join(OUT, book);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const chN = Number(f.replace(".json", ""));
      const ch = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      const krvVerses = bd?.chapters?.[chN - 1]?.verses?.krv || [];
      const krvMap = new Map(krvVerses.map((x) => [x.n, x.t || ""]));
      for (const v of ch.verses || []) {
        const krv = (krvMap.get(v.n) || "").replace(/\s+/g, " ").trim();
        for (const w of v.words || []) {
          const s = (w.strong || "").trim();
          if (!s) continue;
          if (!idx.has(s)) idx.set(s, []);
          const arr = idx.get(s);
          if (arr.length >= 12) continue;
          arr.push({
            book,
            ch: chN,
            v: v.n,
            gloss: (w.glossKo || "").trim(),
            krv: krv.slice(0, 120),
          });
        }
      }
    }
  }
  return idx;
}

function refOf(h) {
  return `${BOOK_KO[h.book] || h.book} ${h.ch}:${h.v}`;
}

function pickExample(hits) {
  if (!hits?.length) return null;
  return (
    hits.find((h) => h.gloss && h.gloss.length >= 1 && h.gloss.length <= 14 && !/[.…]/.test(h.gloss)) ||
    hits[0]
  );
}

function identityLine(lemma, hits, strong) {
  const first = hits?.[0];
  if (!first) return "처음 나오는 곳: (본문 사례 없음)";

  // Distinctive KRV facts for well-known names (개역한글 기준)
  const FACTS = {
    G2424: "예수님은 십자가에 죽으셨다가 사흘 만에 살아나신 분이에요(마 28:5-6).",
    G5547: "그리스도는 기름 부음 받은 메시아를 가리켜요(마 1:16).",
    G4074: "베드로는 예수님의 제자로, 초대 교회에서 앞장선 사도예요(행 2:14).",
    G2491: "요한은 세례 요한 또는 사도 요한을 가리켜요(마 3:1; 마 4:21).",
    G3972: "바울은 이방인에게 복음을 전한 사도예요(행 13:2-3).",
    G4613: "시몬은 베드로의 본명이기도 해요(마 4:18).",
    G11: "아브라함은 믿음의 조상으로 불려요(롬 4:16).",
    G3475: "모세는 율법을 받은 이스라엘의 지도자예요(요 1:17).",
    G2419: "예루살렘은 예수님께서 십자가에 달리신 성이에요(눅 23:33).",
    G1056: "갈릴리는 예수님께서 주로 사역하신 지방이에요(마 4:12-13).",
    G918: "바돌로매는 예수님의 열두 제자 중 한 사람이에요(마 10:3).",
    G920: "바요나는 '요나의 아들'이라는 뜻으로 베드로를 가리켜요(마 16:17).",
    G963: "베다니는 예수님께서 자주 머무신 마을이에요(요 11:1).",
    G1138: "다윗은 이스라엘의 왕으로, 예수님의 족보에 나와요(마 1:1).",
    G912: "바나바는 바울과 함께 1차 전도 여행을 떠난 사람이에요(행 13장).",
    G4569: "사울은 바울의 히브리식 이름이에요(행 13:9).",
    G2972: "나다니엘은 예수님의 제자예요(요 1:45-49).",
    G2385: "야고보는 세베대의 아들이거나 주의 동생을 가리켜요(마 4:21; 갈 1:19).",
    G2455: "유다는 가룟 유다 또는 주의 동생 유다를 가리켜요(마 10:4; 유 1:1).",
    G406: "안드레는 베드로의 형제로 예수님의 제자예요(마 4:18).",
    G5376: "빌립은 예수님의 열두 제자 중 한 사람이에요(요 1:43).",
    G2381: "도마는 예수님의 제자로 '쌍둥이'로도 불려요(요 11:16).",
    G3102: "마리아는 예수님의 어머니 또는 막달라 마리아 등을 가리켜요(마 1:18; 눅 8:2).",
    G3094: "막달라 마리아는 부활하신 예수님을 처음 본 여인이에요(요 20:16-18).",
    G2976: "나사로는 베다니에서 살아난 사람이에요(요 11:43-44).",
    G4091: "빌라도는 예수님을 십자가에 처형한 총독이에요(마 27:24-26).",
    G2264: "헤롯은 예수님 시대의 분봉 왕·왕을 가리켜요(마 2:1).",
    G458: "안디옥은 제자들이 비로소 그리스도인이라 일컬음을 받은 곳이에요(행 11:26).",
  };
  if (FACTS[strong]) return FACTS[strong];

  // Try KRV sentence that clearly mentions the Korean gloss name
  const gloss = (first.gloss || "").replace(/\(.*$/, "").trim();
  if (gloss && gloss.length >= 2) {
    const hit = hits.find((h) => h.krv && h.krv.includes(gloss));
    if (hit && hit.krv.length > gloss.length + 8) {
      // extract a short clause around the name
      const i = hit.krv.indexOf(gloss);
      const slice = hit.krv.slice(Math.max(0, i - 10), Math.min(hit.krv.length, i + gloss.length + 30)).trim();
      if (slice.length >= 10) {
        return `${gloss}에 관한 본문은 ${refOf(hit)}에 나와요.`;
      }
    }
  }
  return `처음 나오는 곳: ${refOf(first)}`;
}

function buildAutoNote(strong, lex, strongEntry, hits) {
  const defEn = strongEntry?.defEn || lex.defEn || "";
  const lemma = lex.lemma || strongEntry?.word || "";
  const proper = looksProper(lemma, defEn);
  const glossHead = firstGlossEn(defEn);
  const koFromStrong = glossEnToKo(glossHead);

  const chipGlosses = [
    ...new Set(
      (hits || [])
        .map((h) => h.gloss)
        .filter((g) => g && g.length <= 14 && !/이에요|해요|예요/.test(g)),
    ),
  ].slice(0, 3);

  let defKo = "";
  let nameMeaning = "";
  let etymKo = "";
  let usageKo = "";
  let aligned = true;

  if (proper) {
    const nm = nameMeaningFromDefEn(defEn);
    if (nm.uncertain || !nm.meaning) {
      nameMeaning = "";
      defKo = `이름 뜻은 확실하지 않아요. ${identityLine(lemma, hits, strong)}`;
    } else {
      nameMeaning = nm.meaning;
      defKo = identityLine(lemma, hits, strong);
    }
    etymKo = nameMeaning
      ? `Strong 풀이를 옮기면 「${nameMeaning}」예요.`
      : "이름 뜻은 확실하지 않아요.";
    const ex = pickExample(hits);
    usageKo = ex ? `개역한글 본문에서는 ${refOf(ex)}에 나와요.` : "신약 본문에 이름이 나와요.";
  } else {
    // 대표 뜻 = Strong 첫 풀이; 칩 번역은 사례로만
    const a = koFromStrong || chipGlosses[0] || "관련 뜻";
    const b =
      chipGlosses.find((g) => g !== a) ||
      (koFromStrong && chipGlosses[0] && chipGlosses[0] !== koFromStrong ? chipGlosses[0] : "");
    // mismatch: Strong first gloss translated, but we fell back only to chip and chip conflicts
    if (koFromStrong && chipGlosses[0] && chipGlosses[0] !== koFromStrong) {
      // still OK if we put Strong first
      aligned = true;
    }
    if (!koFromStrong && glossHead && chipGlosses[0]) {
      // couldn't map Strong gloss — used chip only; count as soft mismatch if glossHead is substantive
      if (glossHead.length >= 3 && !/^of\b/i.test(glossHead)) aligned = false;
    }

    defKo = b ? `뜻: ${a}, ${b}` : `뜻: ${a}`;
    const ex = pickExample(hits);
    if (ex?.gloss) {
      const g = ex.gloss;
      defKo += `. 개역한글에서는 '${g}'${particleRo(g)} 옮겼어요(${refOf(ex)}).`;
    } else if (ex) {
      defKo += ` (${refOf(ex)}).`;
    }

    const root = lex.root;
    if (root?.lemma) {
      const rg = root.glossKo ? String(root.glossKo).replace(/\s+/g, " ").slice(0, 20) : "";
      etymKo = rg
        ? `${root.lemma}(${rg})와 이어져 보여요.`
        : `${root.lemma}와 같은 줄기로 보여요.`;
    } else {
      etymKo = "더 나눌 뿌리는 표시되어 있지 않아요.";
    }
    usageKo = `신약에 ${(lex.countNT || 0).toLocaleString("ko-KR")}회 나와요.`;
  }

  return {
    defKo,
    etymKo,
    usageKo,
    ...(nameMeaning ? { nameMeaning } : {}),
    noteSrc: "auto",
    _aligned: aligned,
    _uncertainName: proper && !nameMeaning,
  };
}

function skeleton(s) {
  return String(s || "")
    .replace(/「[^」]*」/g, "「X」")
    .replace(/'[^']*'/g, "'X'")
    .replace(/\([^)]*\)/g, "(X)")
    .replace(/G\d+/g, "G#")
    .replace(
      /[마막눅요행롬갈엡빌골살딤딛몬히약벧유계전후일이삼]+(?:\s*\d+(?:[:：]\d+(?:\-\d+)?)?(?:\-\d+)?(?:;\s*[마막눅요행롬갈엡빌골살딤딛몬히약벧유계전후일이삼]+\s*\d+[:：]\d+)*)?/g,
      "REF",
    )
    .replace(/\d[\d,]*회/g, "N회")
    .replace(/[가-힣A-Za-zἈ-῾·]+/g, (m) => {
      const keep =
        /^(뜻|기본|뜻은|개역한글에서는|옮겼어요|와|과|은|는|이|가|을|를|의|에|로|으로|같은|줄기로|보여요|이어져|신약에|나와요|이름|확실하지|않아요|처음|나오는|곳|본문|에서는|Strong|풀이를|옮기면|예요|더|나눌|뿌리는|표시되어|있지|관한|본문은|에|나와요)$/;
      return keep.test(m) ? m : "X";
    })
    .replace(/\s+/g, " ")
    .trim();
}

function diversifyDefKo(strong, defKo, skelCounts) {
  // Only diversify the most repeated 「뜻: A, B. 개역한글...」 frame
  const sk = skeleton(defKo);
  if ((skelCounts.get(sk) || 0) < 40) return defKo;
  if (!defKo.startsWith("뜻:")) return defKo;
  const m = defKo.match(/^뜻: ([^.]+)(\..*)?$/);
  if (!m) return defKo;
  const head = m[1];
  const rest = m[2] || "";
  const n = Number(String(strong).replace(/\D/g, "")) || 0;
  if (n % 3 === 0) return `기본 뜻은 ${head}예요${rest}`;
  if (n % 3 === 1) return `${head}라는 뜻이에요${rest}`;
  return defKo;
}

function writeAutoNotes(batchSize = 300) {
  const notes = JSON.parse(fs.readFileSync(NOTES, "utf8"));
  for (const v of Object.values(notes)) {
    if (!v.noteSrc) v.noteSrc = "reviewed";
  }

  const strongMap = loadStrong();
  console.log("[4] building KRV index…");
  const krvIdx = loadKrvIndex();

  const lexFiles = fs
    .readdirSync(LEX)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8")))
    .filter((d) => (d.countNT || 0) >= 1)
    .sort((a, b) => (b.countNT || 0) - (a.countNT || 0) || Number(a.strong.slice(1)) - Number(b.strong.slice(1)));

  const missing = lexFiles.filter((d) => {
    const n = notes[d.strong];
    return !(n && n.defKo && n.etymKo && n.usageKo);
  });

  const batches = [];
  let mismatch = 0;
  let nameUncertain = 0;
  const skelBefore = new Map();
  const pending = [];

  for (let i = 0; i < missing.length; i += batchSize) {
    const chunk = missing.slice(i, i + batchSize);
    const batchNo = batches.length + 1;
    for (const lex of chunk) {
      const entry = strongMap.get(lex.strong);
      const hits = krvIdx.get(lex.strong) || [];
      const note = buildAutoNote(lex.strong, lex, entry, hits);
      if (note._uncertainName) nameUncertain += 1;
      if (note._aligned === false) mismatch += 1;
      const sk = skeleton(note.defKo);
      skelBefore.set(sk, (skelBefore.get(sk) || 0) + 1);
      pending.push({ strong: lex.strong, note });
    }
    // provisional write for mid coverage
    for (const { strong, note } of pending.slice(i, i + chunk.length)) {
      const { _aligned, _uncertainName, ...clean } = note;
      notes[strong] = clean;
    }
    const have = Object.values(notes).filter((v) => v.defKo && v.etymKo && v.usageKo).length;
    const covTokens = lexFiles.reduce((s, d) => s + (notes[d.strong]?.defKo ? d.countNT || 0 : 0), 0);
    const totalTokens = lexFiles.reduce((s, d) => s + (d.countNT || 0), 0);
    const empty = lexFiles.filter((d) => !notes[d.strong]?.defKo).length;
    batches.push({
      batch: batchNo,
      added: chunk.length,
      keys: have,
      coverage: +((100 * covTokens) / totalTokens).toFixed(2),
      emptyDefStrong: empty,
      from: chunk[0]?.strong,
      to: chunk[chunk.length - 1]?.strong,
    });
    if (batchNo % 5 === 0 || i + batchSize >= missing.length) {
      console.log(
        `[notes] batch ${batchNo}/${Math.ceil(missing.length / batchSize)} keys=${have} cov=${((100 * covTokens) / totalTokens).toFixed(2)}% empty=${empty}`,
      );
    }
  }

  const topBefore = [...skelBefore.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);

  // diversify after seeing counts
  let rewritten = 0;
  for (const { strong, note } of pending) {
    const before = note.defKo;
    note.defKo = diversifyDefKo(strong, note.defKo, skelBefore);
    if (note.defKo !== before) rewritten += 1;
    const { _aligned, _uncertainName, ...clean } = note;
    notes[strong] = clean;
  }

  const skelAfter = new Map();
  for (const v of Object.values(notes)) {
    if (v.noteSrc !== "auto") continue;
    const sk = skeleton(v.defKo);
    skelAfter.set(sk, (skelAfter.get(sk) || 0) + 1);
  }

  fs.writeFileSync(NOTES, JSON.stringify(notes, null, 2) + "\n");

  return {
    batches,
    nameUncertain,
    mismatchStrongVsDef: mismatch,
    skeletonTop20Before: topBefore,
    skeletonTop20After: [...skelAfter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20),
    rewritten,
    totalKeys: Object.keys(notes).length,
    reviewed: Object.values(notes).filter((v) => v.noteSrc === "reviewed").length,
    auto: Object.values(notes).filter((v) => v.noteSrc === "auto").length,
  };
}

function main() {
  console.log("[1] fix surface pron…");
  const pron = fixProns();
  console.log(JSON.stringify(pron));

  console.log("[2] MorphGNT Romans doxology…");
  const dox = checkMorphgntRomansDoxology();
  console.log(dox.status, dox.detail);

  console.log("[3] recalc countNT…");
  const counts = recalcCountNT();
  console.log(JSON.stringify(counts));

  console.log("[4] auto notes…");
  const notes = writeAutoNotes(300);

  // john 3:16
  const j = JSON.parse(fs.readFileSync(path.join(OUT, "john", "3.json"), "utf8"));
  const v16 = (j.verses || []).find((v) => v.n === 16);
  const john316 = (v16?.words || []).map((w) => ({
    word: w.word,
    lemma: w.lemma,
    strong: w.strong,
    pron: w.pron,
    glossKo: w.glossKo,
  }));

  // enrich lexicon from notes
  console.log("[5] enrich lexicon from notes…");
  // inline minimal enrich for noteSrc fields we care about
  const allNotes = JSON.parse(fs.readFileSync(NOTES, "utf8"));
  let enriched = 0;
  for (const f of fs.readdirSync(LEX).filter((x) => x.endsWith(".json"))) {
    const fp = path.join(LEX, f);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    const n = allNotes[d.strong];
    if (!n) continue;
    let dirty = false;
    if (n.defKo && d.defKo !== n.defKo) {
      d.defKo = n.defKo;
      dirty = true;
    }
    if (n.usageKo && d.compareKo !== n.usageKo) {
      d.compareKo = n.usageKo;
      dirty = true;
    }
    if (n.nameMeaning && d.nameMeaning !== n.nameMeaning) {
      d.nameMeaning = n.nameMeaning;
      dirty = true;
    }
    if (n.etymKo && d.root) {
      d.root = { ...d.root, glossKo: n.etymKo };
      dirty = true;
    }
    if (n.noteSrc && d.noteSrc !== n.noteSrc) {
      d.noteSrc = n.noteSrc;
      dirty = true;
    }
    if (dirty) {
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
      enriched += 1;
    }
  }
  console.log("enriched", enriched);

  const lexAll = fs
    .readdirSync(LEX)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8")));

  const withNotes = lexAll.filter((d) => (d.countNT || 0) >= 1 && allNotes[d.strong]?.defKo);
  const names = withNotes.filter(
    (d) =>
      allNotes[d.strong]?.nameMeaning ||
      looksProper(d.lemma, d.defEn) ||
      /^[Ἀ-ῬA-Z]/.test(d.lemma || ""),
  );
  const nonNames = withNotes.filter((d) => !names.includes(d));
  function pick(arr, n) {
    const a = [...arr].sort((x, y) => (y.countNT || 0) - (x.countNT || 0));
    const out = [];
    const step = Math.max(1, Math.floor(a.length / (n + 1)));
    for (let i = step; out.length < n && i < a.length; i += step) out.push(a[i]);
    while (out.length < n && out.length < a.length) out.push(a[out.length]);
    return out.slice(0, n);
  }
  const sample = [...pick(names, 5), ...pick(nonNames, 10)];
  const sampleOut = sample.map((d) => {
    const n = allNotes[d.strong];
    return {
      strong: d.strong,
      lemma: d.lemma,
      nameMeaning: n.nameMeaning || d.nameMeaning || "",
      defKo: n.defKo,
      noteSrc: n.noteSrc,
    };
  });

  const totalNT = counts.sumCountNT;
  const covered = lexAll
    .filter((d) => (d.countNT || 0) >= 1 && allNotes[d.strong]?.defKo)
    .reduce((s, d) => s + (d.countNT || 0), 0);
  const emptyDef = lexAll.filter((d) => (d.countNT || 0) >= 1 && !allNotes[d.strong]?.defKo).length;

  const report = {
    pron,
    doxology: dox,
    counts,
    coverage: {
      chipTotal: counts.chipTotal,
      sumCountNT: counts.sumCountNT,
      delta: counts.delta,
      emptyStrongChips: counts.emptyStrongChips,
      occurrenceRatio: +((100 * counts.sumCountNT) / counts.chipTotal).toFixed(2),
      notesKeys: Object.keys(allNotes).length,
      tokenCoveragePct: +((100 * covered) / totalNT).toFixed(2),
      emptyDefStrong: emptyDef,
    },
    notes,
    john316,
    sample15: sampleOut,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log("\n=== DONE ===");
  console.log(
    JSON.stringify(
      {
        pron,
        doxology: dox.status,
        counts,
        coverage: report.coverage,
        batches: notes.batches.length,
        nameUncertain: notes.nameUncertain,
        mismatch: notes.mismatchStrongVsDef,
        reviewed: notes.reviewed,
        auto: notes.auto,
      },
      null,
      2,
    ),
  );
}

main();
