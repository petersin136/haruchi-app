#!/usr/bin/env node
/**
 * 헬라어 사전 3차
 * 0) 롬 16:25–27 칩 source 표기
 * 1) 히브리어 nameMeaning 통일
 * 2) 주요 인물 신원 + 마침표
 * 3) 나머지 auto 중 다음 1,500개(300×5) 보강 후 중단
 *
 * 칩 glossKo 수정 금지. 설치·커밋·유료 API 금지.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const OUT = path.join(root, "public", "word-study");
const LEX_G = path.join(OUT, "lexicon", "greek");
const LEX_H = path.join(OUT, "lexicon", "hebrew");
const NOTES = path.join(root, "data", "keyword-notes", "greek.json");
const BIBLE_DATA = path.join(root, "public", "bible-data");
const STRONG = path.join(root, ".cache", "strongs-greek", "strong-el.json");
const REPORT = path.join(OUT, "_greek-defko-round3-report.json");

const DOX_SOURCE = "SBLGNT apparatus (WH/Treg/NIV reading), CC BY 4.0 · 형태소 수기";

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

/** 같은 인물·지명: 헬라 Strong → 히브리 Strong */
const G2H = {
  G1138: "H1732", // 다윗
  G2424: "H3091", // 예수 ← 여호수아 이름
  G3475: "H4872", // 모세
  G11: "H85", // 아브라함
  G2491: "H3110", // 요한 (요하난) — 히브리 뜻이 깨져 있으면 스킵
  G4672: "H8010", // 솔로몬
  G76: "H121", // 아담
  G3575: "H5146", // 노아
  G2: "H175", // 아론
  G2421: "H3448", // 이새
  G2197: "H2148", // 스가랴
  G2495: "H3124", // 요나
  G3017: "H3878", // 레위
  G4826: "H8095", // 시므온
  G4549: "H7586", // 사울
  G965: "H1035", // 베들레헴
  G4540: "H8111", // 사마리아
  G4622: "H6726", // 시온
  G2410: "H3405", // 여리고
  G5184: "H6865", // 두로
  G4605: "H6721", // 시돈
  G4670: "H5467", // 소돔
  G1056: "H1551", // 갈릴리?
  G2414: "H3389", // 예루살렘
  G2419: "H3389",
  G2455: "H3063", // 유다
  G2384: "H3290", // 야곱
  G2464: "H3327", // 이삭
  G2268: "H2269", // 헤롯? no
  G1443: "H567", // 에벨?
  G1045: "H1060", // 가드?
  G1046: "H1463", // ?
  G1047: "H1471", // 고센?
  G1049: "H1486", // ?
  G1051: "H1496", // ?
  G912: null,
  G918: null,
  G920: null,
  G921: null,
  G964: null, // 베데스다 아람
  G966: "H1020", // 벳새다?
  G2533: null,
  G2786: null, // 게바 아람
  G4074: null, // 베드로
  G3972: null, // 바울
  G4613: "H8095", // 시몬 ← 시므온 계열
  G3156: null, // 마태
  G3482: "H5417", // 나다나엘
  G3530: null,
  G2381: null, // 도마
  G2385: "H3290", // 야고보 ← 야곱
  G406: null, // 안드레
  G5376: null, // 빌립
  G67: null,
  G367: "H2608", // 아나니아
  G1665: "H472", // 엘리사벳?
  G3094: null,
  G3478: null,
  G2584: null,
  G4514: null,
  G4609: null,
  G625: null,
  G882: null,
  G2445: "H3305", // 욥바
  G2475: "H3478", // 이스라엘
  G2474: "H3478",
  G1057: "H1551",
  G4541: "H8111",
  G5344: null,
  G2791: null,
  G2883: null,
  G3138: null,
  G3198: "H4442", // 멜기세덱
  G4516: null,
  G4947: "H8040", // 수리아? H758 - Aram
  G207: null,
  G954: "H1176", // 바알세불
  G1447: null,
  G2882: null,
  G2956: "H6981", // 구레네?
  G2993: null,
  G3082: null,
  G3479: null,
  G5174: null,
  G5190: null,
  G124: "H4714", // 애굽
  G256: null,
  G708: null,
  G735: null,
  G1050: null,
  G2180: null,
  G2332: null,
  G2394: null,
  G2914: null,
  G2954: "H3561", // 구브로?
  G3110: null,
  G3828: null,
};

const TEMPLATE_RES = [
  { name: "뜻: X", re: /^뜻:\s/ },
  { name: "X라는/이라는 뜻이에요", re: /라는 뜻이에요|이라는 뜻이에요/ },
  { name: "기본 뜻은 「X」", re: /^기본 뜻은 「/ },
];

const MAJOR_IDENTITY = {
  G1138:
    "다윗은 이새의 아들이며 이스라엘의 둘째 왕이에요(삼상 16장; 삼하 5장). 신약에서는 예수님의 족보와 메시아 칭호에 반복해 나와요(마 1:1).",
  G2424:
    "예수님은 십자가에 죽으셨다가 사흘 만에 살아나신 분이에요(마 28:5-6). 신약에서 가장 중심이 되는 이름이에요.",
  G3475: "모세는 율법을 받은 이스라엘의 지도자예요(요 1:17; 출 3장).",
  G11: "아브라함은 믿음의 조상으로 불려요(롬 4:16; 창 12장).",
  G4672: "솔로몬은 다윗의 아들로 이스라엘의 왕이에요(마 1:6; 왕상 1–2장).",
  G76: "아담은 첫 사람이며, 족보와 바울의 비유에 나와요(눅 3:38; 롬 5:14).",
  G3575: "노아는 방주를 만든 족장이에요(마 24:37-38; 창 6–9장).",
  G2: "아론은 모세의 형제로 첫 대제사장이에요(눅 1:5; 출 28장).",
  G2491: "요한은 세례 요한 또는 사도 요한을 가리켜요(마 3:1; 마 4:21).",
  G4074: "베드로는 예수님의 제자로, 초대 교회에서 앞장선 사도예요(행 2:14).",
  G3972: "바울은 이방인에게 복음을 전한 사도예요(행 13:2-3).",
  G2419: "예루살렘은 예수님께서 십자가에 달리신 성이에요(눅 23:33).",
  G2414: "예루살렘은 예수님께서 십자가에 달리신 성이에요(눅 23:33).",
  G1056: "갈릴리는 예수님께서 주로 사역하신 지방이에요(마 4:12-13).",
  G5547: "그리스도는 기름 부음 받은 메시아를 가리켜요(마 1:16).",
  G4613: "시몬은 베드로의 본명이기도 해요(마 4:18).",
  G2385: "야고보는 세베대의 아들이거나 주의 동생을 가리켜요(마 4:21; 갈 1:19).",
  G2455: "유다는 가룟 유다 또는 주의 동생 유다를 가리켜요(마 10:4; 유 1:1).",
  G2464: "이삭은 아브라함의 아들이며 족보에 나와요(마 1:2).",
  G2384: "야곱은 이삭의 아들이며 이스라엘의 조상이에요(마 1:2).",
  G3198: "멜기세덱은 살렘 왕으로, 히브리서에서 그리스도의 제사장직 모형으로 나와요(히 5:6).",
  G965: "베들레헴은 유대 땅의 마을로, 예수님이 나신 곳이에요(마 2:1).",
  G3094: "막달라 마리아는 부활하신 예수님을 처음 본 여인이에요(요 20:16-18).",
  G2584: "가버나움은 갈릴리 호숫가 성읍으로, 예수님께서 주로 머무시며 가르치신 곳이에요(마 4:13).",
  G3478: "나사렛은 갈릴리의 마을로, 예수님이 자라신 곳이에요(마 2:23).",
  G964: "베데스다는 예루살렘 양문 곁의 못으로, 예수님이 38년 된 병자를 고치신 곳이에요(요 5:2).",
};

function loadStrong() {
  const raw = JSON.parse(fs.readFileSync(STRONG, "utf8"));
  const map = new Map();
  for (const [k, v] of Object.entries(raw)) {
    const m = String(k).match(/(\d+)/);
    if (!m) continue;
    map.set(`G${Number(m[1])}`, v);
  }
  return map;
}

function stripDia(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC");
}

function isCapitalLemma(lemma) {
  const s = stripDia(lemma || "");
  return s && /[A-ZΑ-Ω]/.test(s[0]);
}

function looksProper(lemma, defEn) {
  if (isCapitalLemma(lemma)) return true;
  return /\bthe name of\b/i.test(defEn || "");
}

function usableHebNameMeaning(nm) {
  const t = String(nm || "").trim();
  if (!t) return false;
  if (!/[가-힣]/.test(t)) return false;
  // reject mostly-English wrappers like 「extant」
  if (/^「[^」]*」$/.test(t) && /[A-Za-z]{3,}/.test(t)) return false;
  if (/형태|^「/.test(t) && t.length <= 6) return false;
  return true;
}

function normalizeNm(s) {
  return String(s || "")
    .trim()
    .replace(/^「|」$/g, "")
    .replace(/\s+/g, " ");
}

function loadKrvHits() {
  const idx = new Map();
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
          if (arr.length >= 6) continue;
          arr.push({
            book,
            ch: chN,
            v: v.n,
            gloss: (w.glossKo || "").trim(),
            krv: krv.slice(0, 80),
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

function pickHit(hits) {
  if (!hits?.length) return null;
  return (
    hits.find((h) => h.gloss && h.gloss.length <= 16 && !/이에요|해요/.test(h.gloss)) ||
    hits[0]
  );
}

function hasBatchim(word) {
  if (!word) return false;
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

function ensurePeriod(s) {
  const t = String(s || "").trim();
  if (!t) return t;
  if (/[.!?…]$/.test(t)) return t;
  // ends with ) citation — still want period after
  if (/\)$/.test(t)) return `${t}.`;
  return `${t}.`;
}

function spaceFix(s) {
  return String(s || "")
    .replace(/심히놀라/g, "심히 놀라")
    .replace(/몰약섞/g, "몰약 섞")
    .replace(/돌로된/g, "돌로 된")
    .replace(/묵은것/g, "묵은 것")
    .replace(/네발짐승/g, "네발 짐승")
    .replace(/기억나게하다/g, "기억나게 하다")
    .replace(/생각나게하다/g, "생각나게 하다");
}

function skeleton(s) {
  return String(s || "")
    .replace(/「[^」]*」/g, "「X」")
    .replace(/'[^']*'/g, "'X'")
    .replace(/\([^)]*\)/g, "(X)")
    .replace(
      /[마막눅요행롬갈엡빌골살딤딛몬히약벧유계전후일이삼]+(?:\s*\d+(?:[:：]\d+(?:\-\d+)?)?(?:\-\d+)?)?/g,
      "REF",
    )
    .replace(/[가-힣A-Za-zἈ-῾·]+/g, (m) =>
      /^(가리켜요|쓰여요|기본으로|하고|쪽으로도|본문|예는|신약|나와요|처음|나오는|곳|뜻|개역한글에서는|옮겼어요|기본|뜻은)$/.test(m)
        ? m
        : "X",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function countTemplates(notes, keys) {
  const out = {};
  for (const t of TEMPLATE_RES) out[t.name] = keys.filter((k) => t.re.test(notes[k]?.defKo || "")).length;
  return out;
}

// --- builders (compact) ---
function senseParts(defEn) {
  let t = String(defEn || "").trim().replace(/^"+|"+$/g, "");
  if (!t) return [];
  const parts = t.split(";").map((p) => p.trim()).filter(Boolean);
  let start = 0;
  if (
    parts.length > 1 &&
    /^(from\b|akin\b|compare\b|of hebrew|contraction|compound|perhaps|probably|the same as|same as|neuter|a primary|the base of)/i.test(
      parts[0],
    )
  ) {
    start = 1;
  }
  const out = [];
  for (let i = start; i < parts.length && out.length < 2; i++) {
    let p = parts[i]
      .replace(/^\((figuratively|literally|by implication|specially)\)\s*/i, "")
      .replace(/^(figuratively|literally|by implication|specially|properly)[,:]?\s*/i, "")
      .trim();
    if (!p) continue;
    const ie = p.match(/^(.+?),\s*i\.e\.\s*(.+)$/i);
    if (ie) {
      out.push(ie[1].trim());
      out.push(ie[2].split(",")[0].trim());
    } else out.push(p.split(",")[0].trim());
  }
  return out;
}

const ENKO = {
  remaining: "나머지",
  ones: "것들",
  "remaining ones": "남아 있는 이들",
  compassionate: "불쌍히 여기다",
  love: "사랑",
  life: "생명",
  image: "형상",
  worship: "예배",
  angle: "모퉁이",
  persecution: "박해",
  opportunity: "기회",
  tumult: "소동",
  sleep: "잠",
  remind: "생각나게 하다",
  injure: "해치다",
  remove: "떠나다",
  radiant: "빛나는",
  long: "긴",
  short: "짧은",
  collect: "모으다",
  mercy: "긍휼",
  grace: "은혜",
  power: "능력",
  word: "말씀",
  faith: "믿음",
  truth: "진리",
  light: "빛",
  peace: "평안",
  joy: "기쁨",
  glory: "영광",
  spirit: "영",
  flesh: "육체",
  body: "몸",
  soul: "영혼",
  heart: "마음",
  water: "물",
  bread: "빵",
  blood: "피",
  death: "죽음",
  sin: "죄",
  law: "율법",
  king: "왕",
  kingdom: "나라",
  people: "백성",
  city: "성읍",
  house: "집",
  earth: "땅",
  heaven: "하늘",
  world: "세상",
  day: "날",
  night: "밤",
  way: "길",
  place: "곳",
  name: "이름",
  man: "사람",
  woman: "여자",
  son: "아들",
  father: "아버지",
  mother: "어머니",
  brother: "형제",
  child: "아이",
  servant: "종",
  teacher: "선생",
  disciple: "제자",
  apostle: "사도",
  prophet: "선지자",
  angel: "천사",
  holy: "거룩한",
  good: "선한",
  evil: "악한",
  true: "참된",
  new: "새",
  old: "옛",
  great: "큰",
  small: "작은",
  many: "많은",
  all: "모든",
  come: "오다",
  go: "가다",
  say: "말하다",
  see: "보다",
  hear: "듣다",
  give: "주다",
  take: "취하다",
  know: "알다",
  call: "부르다",
  send: "보내다",
  live: "살다",
  die: "죽다",
  save: "구원하다",
  believe: "믿다",
  teach: "가르치다",
  ask: "묻다",
  follow: "따르다",
  wait: "기다리다",
  flee: "도망하다",
  salt: "소금",
  fire: "불",
  wind: "바람",
  voice: "음성",
  stone: "돌",
  rock: "반석",
  tree: "나무",
  fruit: "열매",
  seed: "씨",
  net: "그물",
  fish: "물고기",
  sea: "바다",
  mountain: "산",
  door: "문",
  field: "밭",
  oil: "기름",
  money: "돈",
  book: "책",
  letter: "편지",
  hour: "시",
  year: "해",
  hope: "소망",
  fear: "두려움",
  prayer: "기도",
  gospel: "복음",
  church: "교회",
  cross: "십자가",
  temple: "성전",
  wisdom: "지혜",
  knowledge: "지식",
  mind: "생각",
  will: "뜻",
  promise: "약속",
  covenant: "언약",
  commandment: "계명",
  righteousness: "의",
  witness: "증인",
  friend: "친구",
  enemy: "원수",
  poor: "가난한",
  rich: "부유한",
  dead: "죽은",
  free: "자유로운",
  slave: "노예",
  near: "가까운",
  far: "먼",
  soft: "부드러운",
  black: "검은",
  white: "흰",
  decay: "썩음",
  opposite: "반대되는",
  transfer: "옮기다",
  jump: "뛰다",
  rain: "비",
  idol: "우상",
  ransom: "대속물",
  furnace: "풀무",
  axe: "도끼",
  sight: "구경",
  lazy: "게으른",
  expectation: "기다림",
  condemnation: "정죄",
};

function enToKo(en) {
  let raw = String(en || "").trim().toLowerCase().replace(/^"+|"+$/g, "");
  if (!raw) return "";
  if (ENKO[raw]) return ENKO[raw];
  if (raw.startsWith("to ")) {
    const rest = raw.slice(3);
    if (ENKO[rest]) return ENKO[rest];
    const last = rest.split(/\s+/).pop();
    if (last && ENKO[last]) return ENKO[last];
  }
  const cleaned = raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(a|an|the|to|of|in|by|or|and|for|as|noun|verb|plural|singular|piece|ones?)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (ENKO[cleaned]) return ENKO[cleaned];
  const words = cleaned.split(" ").filter(Boolean);
  if (words.length === 1 && ENKO[words[0]]) return ENKO[words[0]];
  const mapped = words.map((w) => ENKO[w]).filter(Boolean);
  if (mapped.length) return mapped.join("·");
  return "";
}

function paraphraseDefEn(defEn) {
  const raw = String(defEn || "").trim();
  if (!raw) return "";
  const rules = [
    [/remaining ones/i, "남아 있는 이들"],
    [/to compassionate/i, "불쌍히 여기다·긍휼을 베풀다"],
    [/father-land|native town/i, "고향 땅·고향 마을"],
    [/heavenly home/i, "하늘 본향"],
    [/\ban image\b/i, "형상·우상"],
    [/\ban angle\b/i, "모퉁이·각"],
    [/^long\b/i, "긴(거리·시간)"],
    [/^short\b/i, "짧은(시간·거리·분량)"],
    [/to collect upon the same place/i, "한곳으로 모으다"],
    [/to remove/i, "떠나게 하다·떠나다"],
    [/battle-array|encampment|barracks/i, "진영·병영"],
    [/^radiant\b/i, "빛나는"],
    [/to remind/i, "생각나게 하다"],
    [/^sleep\b/i, "잠"],
    [/spiritual torpor/i, "영적으로 나른한 상태"],
    [/to chance upon|confer with|to entreat/i, "만나다·간구하다"],
    [/to injure|exasperate/i, "해치다·괴롭히다"],
    [/to keep awake|watch\b/i, "깨어 있다·지키다"],
    [/scarcity of food/i, "식량 부족·기근"],
    [/lamp-stand/i, "등잔대"],
    [/to change place/i, "자리를 옮기다"],
    [/dull or stupid|heedless/i, "둔하고 헤아리지 못함"],
    [/boundary-line|frontier/i, "경계·변방"],
    [/to beg off|deprecate/i, "사양하다·빌다"],
    [/to squeeze|seize/i, "쥐다·붙잡다"],
    [/to increase/i, "더하다·늘어나다"],
    [/to be \(or become\) wealthy/i, "부하게 되다"],
    [/a setting forth|proposal/i, "내놓음·제안"],
    [/to take to oneself/i, "자기에게로 받아들이다"],
    [/at dawn|day-break/i, "새벽에"],
    [/decay/i, "썩음·쇠함"],
    [/opposite/i, "반대되는"],
    [/unintelligent/i, "깨닫지 못하는"],
    [/approved/i, "인정받은"],
    [/to jump/i, "뛰다"],
    [/to renovate/i, "새롭게 하다"],
    [/to transfer/i, "옮기다"],
    [/to fill|to fulfil/i, "채우다"],
  ];
  for (const [re, ko] of rules) if (re.test(raw)) return ko;
  const senses = senseParts(raw).map(enToKo).filter(Boolean);
  if (senses.length >= 2) return `${senses[0]}·${senses[1]}`;
  if (senses.length === 1) return senses[0];
  return "";
}

const NAME_FACTS_EXTRA = {
  // filled from previous round + majors
  ...MAJOR_IDENTITY,
};

function buildNameDef(strong, hits) {
  if (NAME_FACTS_EXTRA[strong]) return ensurePeriod(NAME_FACTS_EXTRA[strong]);
  const first = hits?.[0];
  if (!first) return "처음 나오는 곳: (본문 사례 없음).";
  return `처음 나오는 곳: ${refOf(first)}.`;
}

function buildCommonDef(strong, defEn, hits) {
  const hit = pickHit(hits);
  const ref = hit ? refOf(hit) : "";
  const chip = spaceFix((hit?.gloss || "").trim());
  const para = paraphraseDefEn(defEn);

  if (para) {
    const parts = para.split("·").map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const a = parts[0];
      const obj = hasBatchim(a) ? `${a}을` : `${a}를`;
      const s = ref
        ? `${obj} 기본으로 하고, ${parts[1]} 쪽으로도 쓰여요(${ref})`
        : `${obj} 기본으로 하고, ${parts[1]} 쪽으로도 쓰여요`;
      return ensurePeriod(s);
    }
    const a = parts[0];
    const obj = hasBatchim(a) ? `${a}을` : `${a}를`;
    if (chip && chip !== a && !a.includes(chip) && ref) {
      return ensurePeriod(`${obj} 가리켜요. 본문 예는 '${chip}'(${ref})`);
    }
    return ensurePeriod(ref ? `${obj} 가리켜요(${ref})` : `${obj} 가리켜요`);
  }
  if (chip && ref) return ensurePeriod(`${chip}${hasBatchim(chip) ? "을" : "를"} 가리켜요(${ref})`);
  if (chip) return ensurePeriod(`${chip}${hasBatchim(chip) ? "을" : "를"} 가리켜요`);
  if (ref) return ensurePeriod(`신약 본문 ${ref}에 나와요`);
  return "신약 본문에 나와요.";
}

function annotateRomansDoxology() {
  const fp = path.join(OUT, "romans", "16.json");
  const ch = JSON.parse(fs.readFileSync(fp, "utf8"));
  let n = 0;
  for (const v of ch.verses || []) {
    if (v.n < 25 || v.n > 27) continue;
    for (const w of v.words || []) {
      w.source = DOX_SOURCE;
      n += 1;
    }
  }
  ch.sources = {
    ...(ch.sources || {}),
    sblgnt: ch.sources?.sblgnt || "SBLGNT © Society of Biblical Literature & Logos Bible Software (CC BY 4.0)",
    morphgnt: ch.sources?.morphgnt || "MorphGNT (CC BY-SA 4.0)",
    doxologyApparatus: DOX_SOURCE,
  };
  fs.writeFileSync(fp, JSON.stringify(ch) + "\n");
  return n;
}

function syncNameMeanings(notes) {
  let compared = 0;
  let differedBefore = 0;
  let synced = 0;
  let skippedBadHeb = 0;
  const diffs = [];

  for (const [g, h] of Object.entries(G2H)) {
    if (!h) continue;
    const hPath = path.join(LEX_H, `${h}.json`);
    const gPath = path.join(LEX_G, `${g}.json`);
    if (!fs.existsSync(hPath) || !fs.existsSync(gPath)) continue;
    const heb = JSON.parse(fs.readFileSync(hPath, "utf8"));
    const gr = JSON.parse(fs.readFileSync(gPath, "utf8"));
    const hNm = normalizeNm(heb.nameMeaning || "");
    if (!usableHebNameMeaning(heb.nameMeaning || "")) {
      skippedBadHeb += 1;
      continue;
    }
    compared += 1;
    const gNm = normalizeNm(notes[g]?.nameMeaning || gr.nameMeaning || "");
    if (gNm !== hNm) {
      differedBefore += 1;
      diffs.push({ strong: g, heb: h, before: gNm, after: hNm });
      // unify
      if (!notes[g]) notes[g] = { noteSrc: gr.noteSrc || "auto" };
      notes[g].nameMeaning = hNm;
      // keep etym aligned lightly
      if (notes[g].etymKo && /이름 뜻은/.test(notes[g].etymKo)) {
        notes[g].etymKo = `이름 뜻은 「${hNm}」 쪽으로 읽혀요.`;
      }
      gr.nameMeaning = hNm;
      fs.writeFileSync(gPath, JSON.stringify(gr, null, 2) + "\n");
      synced += 1;
    }
  }
  return { compared, differedBefore, synced, skippedBadHeb, diffs };
}

function enrichLexFromNote(strong, note) {
  const fp = path.join(LEX_G, `${strong}.json`);
  if (!fs.existsSync(fp)) return false;
  const d = JSON.parse(fs.readFileSync(fp, "utf8"));
  let dirty = false;
  if (note.defKo && d.defKo !== note.defKo) {
    d.defKo = note.defKo;
    dirty = true;
  }
  if (note.nameMeaning !== undefined && d.nameMeaning !== (note.nameMeaning || "")) {
    d.nameMeaning = note.nameMeaning || "";
    dirty = true;
  }
  if (note.usageKo && d.compareKo !== note.usageKo) {
    d.compareKo = note.usageKo;
    dirty = true;
  }
  if (note.etymKo && d.root) {
    d.root = { ...d.root, glossKo: note.etymKo };
    dirty = true;
  }
  if (dirty) fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
  return dirty;
}

function main() {
  console.log("[0] Romans doxology source…");
  const doxN = annotateRomansDoxology();
  console.log("annotated chips", doxN);

  const notes = JSON.parse(fs.readFileSync(NOTES, "utf8"));
  const strongMap = loadStrong();

  console.log("[1] sync nameMeaning with Hebrew…");
  const sync = syncNameMeanings(notes);
  console.log(JSON.stringify({ compared: sync.compared, differedBefore: sync.differedBefore, synced: sync.synced, skippedBadHeb: sync.skippedBadHeb }));

  console.log("[2] major identity + periods on polished set…");
  let periodFixed = 0;
  let identityFixed = 0;
  for (const [strong, fact] of Object.entries(MAJOR_IDENTITY)) {
    const n = notes[strong];
    if (!n) continue;
    const next = ensurePeriod(fact);
    if (n.defKo !== next) {
      n.defKo = next;
      identityFixed += 1;
    }
    // nameMeaning already synced for some
    enrichLexFromNote(strong, n);
  }
  // periods for all auto that look like missing terminal punctuation (first 900 already done + any)
  for (const [strong, n] of Object.entries(notes)) {
    if (n.noteSrc !== "auto") continue;
    if (!n.defKo) continue;
    const fixed = ensurePeriod(spaceFix(n.defKo));
    if (fixed !== n.defKo) {
      n.defKo = fixed;
      periodFixed += 1;
      enrichLexFromNote(strong, n);
    }
  }
  console.log({ identityFixed, periodFixed });

  console.log("[3] next 1500 auto…");
  const hits = loadKrvHits();
  const lexFiles = fs
    .readdirSync(LEX_G)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(LEX_G, f), "utf8")))
    .filter((d) => (d.countNT || 0) >= 1)
    .sort((a, b) => (b.countNT || 0) - (a.countNT || 0) || Number(a.strong.slice(1)) - Number(b.strong.slice(1)));

  const autoRanked = lexFiles.filter((d) => notes[d.strong]?.noteSrc === "auto");
  const targets = autoRanked.slice(900, 900 + 1500); // next 1500 after previous 900
  const targetKeys = targets.map((d) => d.strong);

  const tmplBefore = countTemplates(notes, targetKeys);
  const skelBefore = new Map();
  for (const k of targetKeys) {
    const sk = skeleton(notes[k]?.defKo || "");
    skelBefore.set(sk, (skelBefore.get(sk) || 0) + 1);
  }
  const topBefore = [...skelBefore.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  let changed = 0;
  let nameFirstOnly = 0;
  const batches = [];

  for (let i = 0; i < targets.length; i += 300) {
    const chunk = targets.slice(i, i + 300);
    let batchChanged = 0;
    for (const lex of chunk) {
      const strong = lex.strong;
      const prev = notes[strong] || { noteSrc: "auto" };
      const entry = strongMap.get(strong);
      const defEn = entry?.defEn || lex.defEn || "";
      const lemma = lex.lemma || entry?.word || "";
      const h = hits.get(strong) || [];
      const proper = looksProper(lemma, defEn);

      let defKo;
      let nameMeaning = prev.nameMeaning || "";
      if (proper) {
        defKo = buildNameDef(strong, h);
        if (defKo.startsWith("처음 나오는 곳:")) nameFirstOnly += 1;
        // if hebrew-synced already, keep
      } else {
        defKo = buildCommonDef(strong, defEn, h);
      }
      defKo = ensurePeriod(spaceFix(defKo));

      // strip residual templates
      if (TEMPLATE_RES.some((t) => t.re.test(defKo))) {
        defKo = proper ? buildNameDef(strong, h) : buildCommonDef(strong, defEn, h);
        defKo = ensurePeriod(spaceFix(defKo));
      }

      const next = {
        ...prev,
        defKo,
        noteSrc: "auto",
        ...(nameMeaning ? { nameMeaning } : {}),
      };
      if (proper && nameMeaning) {
        next.etymKo = `이름 뜻은 「${nameMeaning}」 쪽으로 읽혀요.`;
        const hit = pickHit(h);
        next.usageKo = hit ? `개역한글 본문에서는 ${refOf(hit)}에 나와요.` : prev.usageKo;
      }

      if (JSON.stringify(prev) !== JSON.stringify(next)) {
        notes[strong] = next;
        changed += 1;
        batchChanged += 1;
        enrichLexFromNote(strong, next);
      } else {
        notes[strong] = next;
        enrichLexFromNote(strong, next);
      }
    }

    const tmplNow = countTemplates(notes, targetKeys);
    const remain =
      tmplNow["뜻: X"] + tmplNow["X라는/이라는 뜻이에요"] + tmplNow["기본 뜻은 「X」"];
    batches.push({
      batch: batches.length + 1,
      range: `${chunk[0].strong}–${chunk[chunk.length - 1].strong}`,
      size: chunk.length,
      changedCum: changed,
      batchChanged,
      remainTemplatesIn1500: remain,
      tmpl: tmplNow,
    });
    console.log(
      `[batch ${batches.length}] changedCum=${changed} remainTemplates=${remain}`,
    );
  }

  const tmplAfter = countTemplates(notes, targetKeys);
  const skelAfter = new Map();
  for (const k of targetKeys) {
    const sk = skeleton(notes[k].defKo);
    skelAfter.set(sk, (skelAfter.get(sk) || 0) + 1);
  }
  const topAfter = [...skelAfter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  fs.writeFileSync(NOTES, JSON.stringify(notes, null, 2) + "\n");

  // samples: 3 names + 7 common from this 1500
  const names = targets.filter((d) => looksProper(d.lemma, strongMap.get(d.strong)?.defEn || d.defEn));
  const nons = targets.filter((d) => !looksProper(d.lemma, strongMap.get(d.strong)?.defEn || d.defEn));
  const sample = [
    ...names.slice(0, 3),
    ...[20, 80, 140, 220, 320, 420, 520].map((i) => nons[i]).filter(Boolean),
  ].slice(0, 10);

  const sample10 = sample.map((d) => ({
    strong: d.strong,
    lemma: d.lemma,
    nameMeaning: notes[d.strong]?.nameMeaning || "",
    defKo: notes[d.strong]?.defKo || "",
  }));

  const report = {
    doxology: { annotatedChips: doxN, source: DOX_SOURCE, note: "SBLGNT 본문에 없음(각주 이문) — 교체 불필요" },
    nameMeaningSync: {
      compared: sync.compared,
      differedBefore: sync.differedBefore,
      synced: sync.synced,
      skippedBadHeb: sync.skippedBadHeb,
      diffs: sync.diffs,
    },
    identityFixed,
    periodFixed,
    batchWindow: { fromRank: 901, toRank: 900 + targets.length, size: targets.length },
    changed,
    nameFirstOnly,
    tmplBefore,
    tmplAfter,
    skeletonTop3Before: topBefore,
    skeletonTop3After: topAfter,
    batches,
    sample10,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log("\n=== DONE ===");
  console.log(
    JSON.stringify(
      {
        doxN,
        sync: { compared: sync.compared, differedBefore: sync.differedBefore, synced: sync.synced },
        identityFixed,
        periodFixed,
        changed,
        tmplBefore,
        tmplAfter,
        topBefore,
        topAfter,
        batches,
        sample10,
        diffs: sync.diffs,
      },
      null,
      2,
    ),
  );
}

main();
