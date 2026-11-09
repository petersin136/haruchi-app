#!/usr/bin/env node
/**
 * auto 노트만 재생성 (reviewed 보존).
 * - 고유명사 판별: 대문자 lemma / Strong "name of" 계열만
 * - nameMeaning: Strong defEn 전체(괄호 포함)에서 어원 풀이
 * - 「X라는」→ 받침에 따라 「X이라는」
 * - 뼈대 다양화 후 상위 20 보고
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripDiacritics } from "./lib/greek-pron.mjs";

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

function isCapitalLemma(lemma) {
  const s = stripDiacritics(lemma || "");
  if (!s) return false;
  return /[A-ZΑ-Ω]/.test(s[0]);
}

function looksProper(lemma, defEn) {
  if (isCapitalLemma(lemma)) return true;
  const d = String(defEn || "");
  if (/\bthe name of\b/i.test(d)) return true;
  if (/;\s*[A-Z][^,]{0,40},\s*(an?|the)\s+(Israelite|Christian|apostle|city|place|region|town|patriarch|Roman|woman|man)\b/i.test(d)) {
    return true;
  }
  return false;
}

function firstGlossEn(defEn) {
  let t = String(defEn || "").trim().replace(/^"+|"+$/g, "");
  if (!t) return "";
  const parts = t.split(";").map((p) => p.trim()).filter(Boolean);
  let meaning = parts[0] || "";
  // 어원 설명(from/akin/compare…) 다음 절이 본뜻
  if (
    parts.length > 1 &&
    /^(from\b|akin\b|compare\b|of hebrew|contraction|compound|perhaps|probably|the same as|same as|neuter|feminine|masculine|adverb|participle|intensive|prolong|a primary|the base of)/i.test(
      parts[0],
    )
  ) {
    meaning = parts[1];
  }
  // 고유명사 절("; Alexander, the name…")은 뜻이 아님 — 앞 절 유지
  if (/^(an?|the)\s+\w+/i.test(meaning) && /name of|Israelite|apostle|city|place|region/i.test(meaning)) {
    meaning = parts[0];
  }
  meaning = meaning.replace(
    /^(properly|literally|figuratively|actively|passively|adverbially|specially|collectively|abstractly|concretely|comparatively|superlatively|by implication|by analogy|objectively|impersonally|privately)[,:]?\s*/i,
    "",
  );
  const ie = meaning.match(/^(.+?),\s*i\.e\./i);
  if (ie) meaning = ie[1].trim();
  else meaning = meaning.split(",")[0].trim();
  return meaning.replace(/^"+|"+$/g, "").trim();
}

// inline compact gloss map (high-frequency Strong heads)
const GLOSS = {
  love: "사랑", life: "생명", god: "하나님", lord: "주", man: "사람", woman: "여자",
  son: "아들", father: "아버지", spirit: "영", word: "말씀", faith: "믿음", believe: "믿다",
  come: "오다", go: "가다", say: "말하다", speak: "말하다", see: "보다", hear: "듣다",
  give: "주다", take: "취하다", make: "만들다", do: "하다", have: "가지다", be: "이다",
  all: "모든", day: "날", city: "도시", house: "집", earth: "땅", heaven: "하늘",
  water: "물", bread: "빵", blood: "피", death: "죽음", sin: "죄", king: "왕",
  kingdom: "나라", people: "백성", law: "율법", prophet: "선지자", apostle: "사도",
  disciple: "제자", angel: "천사", holy: "거룩한", good: "선한", evil: "악한",
  true: "참된", truth: "진리", light: "빛", darkness: "어둠", peace: "평안", joy: "기쁨",
  grace: "은혜", glory: "영광", power: "능력", name: "이름", time: "때", place: "곳",
  way: "길", net: "그물", world: "세상", eternal: "영원한", age: "시대", write: "쓰다",
  know: "알다", call: "부르다", send: "보내다", die: "죽다", live: "살다", eat: "먹다",
  drink: "마시다", stand: "서다", walk: "걷다", teach: "가르치다", ask: "묻다",
  follow: "따르다", save: "구원하다", destroy: "멸망시키다", perish: "멸망하다",
  bless: "축복하다", praise: "찬양", worship: "예배하다", repent: "회개하다",
  forgive: "용서하다", heal: "고치다", preach: "전파하다", witness: "증인",
  promise: "약속", covenant: "언약", commandment: "계명", righteousness: "의",
  mercy: "긍휼", wisdom: "지혜", knowledge: "지식", mind: "생각", will: "뜻",
  poor: "가난한", rich: "부유한", dead: "죽은", free: "자유로운", slave: "노예",
  friend: "친구", enemy: "원수", door: "문", field: "밭", sheep: "양", shepherd: "목자",
  star: "별", sun: "해", moon: "달", fire: "불", wind: "바람", voice: "음성",
  hand: "손", eye: "눈", ear: "귀", mouth: "입", heart: "마음", soul: "영혼",
  body: "몸", flesh: "육체", brother: "형제", sister: "자매", mother: "어머니",
  child: "아이", servant: "종", master: "주인", teacher: "선생", priest: "제사장",
  temple: "성전", synagogue: "회당", cross: "십자가", gospel: "복음", church: "교회",
  prayer: "기도", hope: "소망", fear: "두려움", work: "일", rest: "쉼", new: "새",
  old: "옛", great: "큰", small: "작은", many: "많은", rock: "반석", stone: "돌",
  gold: "금", silver: "은", oil: "기름", salt: "소금", money: "돈", book: "책",
  letter: "편지", hour: "시", year: "해", sabbath: "안식일", feast: "잔치",
  passover: "유월절", affection: "애정", benevolence: "호의", prophecy: "예언",
  little: "작은", heathen: "이방", circle: "둘레", hearing: "들으심", beloved: "사랑하는 이",
  anointed: "기름 부음 받은 이", salvation: "구원", gracious: "은혜로운",
  receive: "받다", accept: "받아들이다", reckon: "계산하다", impute: "돌리다",
  flee: "도망하다", wickedness: "악함", public: "공중의",
  "made of stone": "돌로 된", axe: "도끼", sight: "구경", oldness: "묵은 것",
  ransom: "대속물", "to flee": "도망하다", "to receive": "받다",
  strip: "벗기다", "put off": "벗다", lazy: "게으른", slothful: "게으른",
  expectation: "기다림", await: "기다리다", wait: "기다리다", near: "가까이",
  salt: "소금", furnace: "풀무", without: "없이", myrrh: "몰약",
  mix: "섞다", mingle: "섞다", jump: "뛰다", exhibit: "보이다",
  renovate: "새롭게 하다", recollection: "기억", soft: "부드러운",
  completion: "완성", refutation: "논박", rain: "비", decay: "썩음",
  enable: "가능하게 하다", defamation: "비방", vindication: "변호",
  expire: "숨이 끊기다", empower: "능력을 주다", insult: "모욕하다",
  accumulate: "모으다", accompany: "동행하다", inspect: "살펴보다",
  injure: "해치다", clamor: "외치다", aperture: "구멍", deposit: "맡긴 것",
  transfer: "옮기다", black: "검은", participation: "참여",
  victorious: "승리하는", resemble: "닮다", lawless: "불법의",
  foreign: "이방의", differently: "다르게", requital: "갚음",
  unintelligent: "무지한", opposite: "반대의", prompt: "신속한",
  deflect: "빗나가게 하다", unload: "짐을 내리다", dissipate: "흩다",
  "well-doing": "선행", ignorance: "무지", unblamable: "책망할 것이 없는",
  divinity: "신성", disturbance: "소동", residence: "거처",
  brilliancy: "광채", intoxicant: "취하게 하는 것", privately: "은밀히",
  thereafter: "그 후에", serviceable: "유익한", piously: "경건히",
  strip: "벗기다", unclothe: "옷을 벗기다", sluggish: "게으른",
  expectation: "기다림", listen: "듣다", hear: "듣다",
};

function glossEnToKo(en) {
  let raw = String(en || "").trim().toLowerCase();
  if (!raw) return "";
  raw = raw.replace(/^"+|"+$/g, "");
  if (GLOSS[raw]) return GLOSS[raw];
  // "to strip" / "to put off" 등
  if (raw.startsWith("to ")) {
    const rest = raw.slice(3).trim();
    if (GLOSS[rest]) return GLOSS[rest];
    if (GLOSS[raw]) return GLOSS[raw];
    // 마지막 동사 어간만
    const last = rest.split(/\s+/).pop();
    if (last && GLOSS[last]) return GLOSS[last];
  }
  const cleaned = raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(a|an|the|to|of|in|any|sense|often|as|noun|literally|figuratively|specially|plural|piece|or)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (GLOSS[cleaned]) return GLOSS[cleaned];
  const words = cleaned.split(" ").filter(Boolean);
  if (words.length === 1 && GLOSS[words[0]]) return GLOSS[words[0]];
  if (words.length >= 1 && GLOSS[words[words.length - 1]]) return GLOSS[words[words.length - 1]];
  const mapped = words.map((w) => GLOSS[w]).filter(Boolean);
  if (mapped.length === words.length) return mapped.join(" ");
  if (mapped.length === 1) return mapped[0];
  return "";
}

function hasBatchim(word) {
  if (!word) return false;
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

function particleRo(noun) {
  if (!noun) return "로";
  const code = noun.charCodeAt(noun.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return "로";
  const jong = (code - 0xac00) % 28;
  if (jong === 0 || jong === 8) return "로";
  return "으로";
}

function iraneun(word) {
  return hasBatchim(word) ? `${word}이라는` : `${word}라는`;
}

function wordToKo(w) {
  const x = String(w || "").trim().toLowerCase();
  if (!x) return "";
  if (GLOSS[x]) return GLOSS[x];
  const extra = {
    kindness: "친절", mercy: "긍휼", affliction: "고난", dates: "대추야자",
    bread: "빵", god: "하나님", jehovah: "여호와", yahweh: "여호와",
    thunder: "우레", consolation: "위로", encouragement: "격려",
    prophecy: "예언", defender: "수호자", helper: "돕는 이",
    light: "빛", peace: "평안", grace: "은혜", praise: "찬양",
    salvation: "구원", beloved: "사랑하는 이", little: "작은",
    man: "사람", son: "아들", daughter: "딸", gift: "선물",
    house: "집", city: "성", rock: "반석", twin: "쌍둥이",
  };
  return extra[x] || GLOSS[x] || "";
}

function translateNameEtym(en) {
  let s = String(en || "").trim().replace(/\s+/g, " ");
  if (!s) return "";
  const lower = s.toLowerCase();
  const dict = {
    "son of tolmai": "톨마이의 아들",
    "son of jonas": "요나의 아들",
    "son of jonah": "요나의 아들",
    "son of nabas": "나바스의 아들",
    "son of thunder": "우레의 아들",
    "son of consolation": "위로의 아들",
    "son of encouragement": "격려의 아들",
    "date-house": "대추야자 집",
    "house of dates": "대추야자 집",
    "house of bread": "빵의 집",
    "house of god": "하나님의 집",
    "house of affliction": "고난의 집",
    "house of kindness": "친절의 집",
    "the heathen circle": "이방의 둘레",
    "heathen circle": "이방의 둘레",
    "man-defender": "사람을 지키는 이",
    "man defender": "사람을 지키는 이",
    little: "작은 이",
    prophecy: "예언",
    rock: "바위, 반석",
    "a rock": "바위, 반석",
    light: "빛",
    praise: "찬양",
    "gift of god": "하나님의 선물",
    "jehovah is salvation": "여호와는 구원이시다",
    "yahweh is salvation": "여호와는 구원이시다",
    "the lord is salvation": "여호와는 구원이시다",
    "jehovah is gracious": "여호와는 은혜로우시다",
    hearing: "들으심",
    "father of a multitude": "많은 무리의 아버지",
    "drawn out": "물에서 끌어내다",
    "foundation of peace": "평화의 기초",
    beloved: "사랑하는 이",
    anointed: "기름 부음 받은 이",
    salvation: "구원",
    separated: "구별된 이",
    twin: "쌍둥이",
    grace: "은혜",
    peace: "평안",
    comfort: "위로",
    helper: "돕는 이",
  };
  if (dict[lower]) return dict[lower];

  // man-defender / God-helper style compounds
  const compound = lower.match(/^([a-z]+)-([a-z]+)$/);
  if (compound) {
    const a = wordToKo(compound[1]);
    const b = wordToKo(compound[2]);
    if (a && b) return `${a}의 ${b}`;
  }

  const son = s.match(/^son of\s+(.+)$/i);
  if (son) {
    const x = wordToKo(son[1]) || son[1].trim();
    return `${x}의 아들`;
  }
  const dau = s.match(/^daughter of\s+(.+)$/i);
  if (dau) {
    const x = wordToKo(dau[1]) || dau[1].trim();
    return `${x}의 딸`;
  }
  const gift = s.match(/^gift of\s+(.+)$/i);
  if (gift) {
    const x = wordToKo(gift[1]) || gift[1].trim();
    return `${x}의 선물`;
  }
  const house = s.match(/^house of\s+(.+)$/i);
  if (house) {
    const x = wordToKo(house[1]);
    if (!x) return ""; // don't leave English
    return `${x}의 집`;
  }
  const man = s.match(/^man of\s+(.+)$/i);
  if (man) {
    const x = wordToKo(man[1]);
    if (!x) return "";
    return `${x}의 사람`;
  }
  const city = s.match(/^city of\s+(.+)$/i);
  if (city) {
    const x = wordToKo(city[1]);
    if (!x) return "";
    return `${x}의 성`;
  }
  if (GLOSS[lower]) return GLOSS[lower];
  const bits = lower.split(/[\s\-]+/).map((w) => wordToKo(w)).filter(Boolean);
  const parts = lower.split(/[\s\-]+/);
  if (bits.length && bits.length >= Math.ceil(parts.length * 0.6)) {
    return bits.join(" ");
  }
  return "";
}

function nameMeaningFromDefEn(defEn) {
  const d = String(defEn || "").trim();
  if (!d) return { meaning: "", uncertain: true };

  if (/\bas a name\b/i.test(d) && /\brock\b/i.test(d)) {
    return { meaning: "바위, 반석", uncertain: false };
  }

  let head = d;
  const semi = d.indexOf(";");
  if (semi > 0) head = d.slice(0, semi).trim();

  const leadParen = head.match(/^\(([^)]+)\)/);
  if (leadParen) {
    const inner = leadParen[1].split(";")[0].trim();
    const ko = translateNameEtym(inner);
    if (ko) return { meaning: ko, uncertain: false };
  }

  // X (i.e. MEANING) — meaning if not just an alternate proper spelling
  const ie = head.match(/\((?:i\.e\.\s*)?([^)]+)\)/i);
  if (ie) {
    const inner = ie[1].trim();
    const formMap = {
      Jehoshua: "여호와는 구원이시다",
      Jochanan: "여호와는 은혜로우시다",
      Shimon: "들으심",
      David: "사랑하는 이",
      Dabid: "사랑하는 이",
    };
    if (formMap[inner]) return { meaning: formMap[inner], uncertain: false };

    // capitalized single token alternate name → uncertain (no etymology in source)
    const isAltSpelling = /^[A-Z][a-zæœ''\-]+$/.test(inner) && !/^(the|a|an)\b/i.test(inner);
    if (!isAltSpelling) {
      const ko = translateNameEtym(inner);
      if (ko) return { meaning: ko, uncertain: false };
    }
    // also try before-paren etymology: "son of Nabas (i.e. prophecy)"
    const before = head.split("(")[0].trim();
    if (/^(son of|daughter of|gift of|house of|man of|city of)/i.test(before)) {
      const koBefore = translateNameEtym(before);
      const koInner = !isAltSpelling ? translateNameEtym(inner) : "";
      if (koBefore && koInner) return { meaning: `${koBefore}(${koInner})`, uncertain: false };
      if (koBefore) return { meaning: koBefore, uncertain: false };
      if (koInner) return { meaning: koInner, uncertain: false };
    }
  }

  if (
    /^(son of|daughter of|gift of|man of|house of|city of|praise|light|rock|my |the |date-)/i.test(head) ||
    /^[a-z][a-z\- ]{2,40}$/.test(head)
  ) {
    const ko = translateNameEtym(head);
    if (ko) return { meaning: ko, uncertain: false };
  }

  return { meaning: "", uncertain: true, source: d };
}

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
  G921: "바나바는 바울과 함께 1차 전도 여행을 떠난 사람이에요(행 13장).",
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
  G490: "안디옥은 제자들이 비로소 그리스도인이라 일컬음을 받은 곳이에요(행 11:26).",
  G1053: "갈라디아는 바울이 편지를 보낸 소아시아의 지방이에요(갈 1:2).",
};

function loadKrvIndex() {
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
          if (arr.length >= 12) continue;
          arr.push({ book, ch: chN, v: v.n, gloss: (w.glossKo || "").trim(), krv: krv.slice(0, 120) });
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
  if (FACTS[strong]) return FACTS[strong];
  const first = hits?.[0];
  if (!first) return "처음 나오는 곳: (본문 사례 없음)";
  const gloss = (first.gloss || "").replace(/\(.*$/, "").trim();
  if (gloss && gloss.length >= 2) {
    const hit = hits.find((h) => h.krv && h.krv.includes(gloss));
    if (hit) return `처음 나오는 곳: ${refOf(hit)}`;
  }
  return `처음 나오는 곳: ${refOf(first)}`;
}

function skeleton(s) {
  return String(s || "")
    .replace(/「[^」]*」/g, "「X」")
    .replace(/'[^']*'/g, "'X'")
    .replace(/\([^)]*\)/g, "(X)")
    .replace(
      /[마막눅요행롬갈엡빌골살딤딛몬히약벧유계전후일이삼]+(?:\s*\d+(?:[:：]\d+(?:\-\d+)?)?(?:\-\d+)?(?:;\s*[마막눅요행롬갈엡빌골살딤딛몬히약벧유계전후일이삼]+\s*\d+[:：]\d+)*)?/g,
      "REF",
    )
    .replace(/\d[\d,]*회/g, "N회")
    .replace(/[가-힣A-Za-zἈ-῾·]+/g, (m) => {
      const keep =
        /^(뜻|기본|뜻은|개역한글에서는|옮겼어요|와|과|은|는|이|가|을|를|의|에|로|으로|같은|줄기로|보여요|이어져|신약에|나와요|이름|확실하지|않아요|처음|나오는|곳|본문|에서는|Strong|풀이를|옮기면|예요|더|나눌|뿌리는|표시되어|있지|이라는|라는)$/;
      return keep.test(m) ? m : "X";
    })
    .replace(/\s+/g, " ")
    .trim();
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
  let uncertainName = false;

  if (proper) {
    const nm = nameMeaningFromDefEn(defEn);
    if (nm.uncertain || !nm.meaning) {
      nameMeaning = "";
      uncertainName = true;
      defKo = `이름 뜻은 확실하지 않아요. ${identityLine(lemma, hits, strong)}`;
      etymKo = "이름 뜻은 확실하지 않아요.";
    } else {
      nameMeaning = nm.meaning;
      defKo = identityLine(lemma, hits, strong);
      etymKo = `Strong 풀이를 옮기면 「${nameMeaning}」예요.`;
    }
    const ex = pickExample(hits);
    usageKo = ex ? `개역한글 본문에서는 ${refOf(ex)}에 나와요.` : "신약 본문에 이름이 나와요.";
  } else {
    const a = koFromStrong || chipGlosses[0] || "관련 뜻";
    const b = chipGlosses.find((g) => g !== a) || "";
    // 어긋남: Strong 첫 풀이 KO를 만들었는데 대표 뜻 a에 반영되지 않음
    if (koFromStrong && a !== koFromStrong && !String(a).includes(koFromStrong)) {
      aligned = false;
    } else {
      aligned = true;
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
      etymKo = rg ? `${root.lemma}(${rg})와 이어져 보여요.` : `${root.lemma}와 같은 줄기로 보여요.`;
    } else {
      etymKo = "더 나눌 뿌리는 표시되어 있지 않아요.";
    }
    usageKo = `신약에 ${(lex.countNT || 0).toLocaleString("ko-KR")}회 나와요.`;
  }

  const unmapped =
    !proper &&
    !koFromStrong &&
    !!glossHead &&
    glossHead.length >= 2 &&
    !/^(from|akin|compare|of |the same)/i.test(glossHead);
  return {
    defKo,
    etymKo,
    usageKo,
    ...(nameMeaning ? { nameMeaning } : {}),
    noteSrc: "auto",
    _aligned: aligned,
    _uncertainName: uncertainName,
    _unmapped: unmapped,
  };
}

function main() {
  const notes = JSON.parse(fs.readFileSync(NOTES, "utf8"));
  const strongMap = loadStrong();
  console.log("KRV index…");
  const krvIdx = loadKrvIndex();

  const lexFiles = fs
    .readdirSync(LEX)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8")))
    .filter((d) => (d.countNT || 0) >= 1)
    .sort((a, b) => (b.countNT || 0) - (a.countNT || 0) || Number(a.strong.slice(1)) - Number(b.strong.slice(1)));

  // only regenerate auto (or missing). Keep reviewed.
  const targets = lexFiles.filter((d) => {
    const n = notes[d.strong];
    if (!n) return true;
    if (n.noteSrc === "reviewed") return false;
    return true;
  });

  console.log("targets", targets.length, "reviewed kept", Object.values(notes).filter((v) => v.noteSrc === "reviewed").length);

  // capture BEFORE skeletons from current auto
  const skelBefore = new Map();
  for (const [k, v] of Object.entries(notes)) {
    if (v.noteSrc !== "auto") continue;
    const sk = skeleton(v.defKo);
    skelBefore.set(sk, (skelBefore.get(sk) || 0) + 1);
  }
  const topBefore = [...skelBefore.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);

  let mismatch = 0;
  let unmapped = 0;
  let nameUncertain = 0;
  const skelGen = new Map();
  const pending = [];
  const batchSize = 300;
  const batches = [];

  for (let i = 0; i < targets.length; i += batchSize) {
    const chunk = targets.slice(i, i + batchSize);
    const batchNo = batches.length + 1;
    for (const lex of chunk) {
      const entry = strongMap.get(lex.strong);
      const hits = krvIdx.get(lex.strong) || [];
      const note = buildAutoNote(lex.strong, lex, entry, hits);
      if (note._uncertainName) nameUncertain += 1;
      if (note._aligned === false) mismatch += 1;
      if (note._unmapped) unmapped += 1;
      const sk = skeleton(note.defKo);
      skelGen.set(sk, (skelGen.get(sk) || 0) + 1);
      pending.push({ strong: lex.strong, note });
    }
    for (const { strong, note } of pending.slice(-chunk.length)) {
      const { _aligned, _uncertainName, _unmapped, ...clean } = note;
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
    if (batchNo % 5 === 0 || i + batchSize >= targets.length) {
      console.log(`[notes] batch ${batchNo} keys=${have} cov=${((100 * covTokens) / totalTokens).toFixed(2)}% empty=${empty}`);
    }
  }

  let rewritten = 0;
  for (const { strong, note } of pending) {
    const before = note.defKo;
    // fix diversify properly
    const sk = skeleton(note.defKo);
    if ((skelGen.get(sk) || 0) >= 40 && note.defKo.startsWith("뜻:")) {
      const m = note.defKo.match(/^뜻: ([^.]+)(\..*)?$/);
      if (m) {
        const head = m[1];
        const rest = m[2] || "";
        const first = head.split(",")[0].trim();
        const n = Number(String(strong).replace(/\D/g, "")) || 0;
        if (n % 3 === 0) {
          const ieyo = hasBatchim(head.replace(/,\s*.*$/, "").trim()) ? "이에요" : "예요";
          note.defKo = `기본 뜻은 「${head}」${ieyo}${rest}`;
        } else if (n % 3 === 1) note.defKo = `${iraneun(first)} 뜻이에요${rest}`;
      }
    }
    if (note.defKo !== before) rewritten += 1;
    const { _aligned, _uncertainName, _unmapped, ...clean } = note;
    notes[strong] = clean;
  }

  const skelAfter = new Map();
  for (const v of Object.values(notes)) {
    if (v.noteSrc !== "auto") continue;
    const sk = skeleton(v.defKo);
    skelAfter.set(sk, (skelAfter.get(sk) || 0) + 1);
  }

  fs.writeFileSync(NOTES, JSON.stringify(notes, null, 2) + "\n");

  // enrich lexicon
  let enriched = 0;
  for (const f of fs.readdirSync(LEX).filter((x) => x.endsWith(".json"))) {
    const fp = path.join(LEX, f);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    const n = notes[d.strong];
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
    if (n.nameMeaning !== undefined && d.nameMeaning !== (n.nameMeaning || "")) {
      d.nameMeaning = n.nameMeaning || "";
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
    // clear bogus nameMeaning on non-proper
    if (!looksProper(d.lemma, d.defEn) && d.nameMeaning && n.noteSrc === "auto" && !n.nameMeaning) {
      d.nameMeaning = "";
      dirty = true;
    }
    if (dirty) {
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
      enriched += 1;
    }
  }

  // samples: 5 proper + 10 common, prefer auto
  const lexAll = lexFiles;
  const names = lexAll.filter((d) => looksProper(d.lemma, d.defEn));
  const nons = lexAll.filter((d) => !looksProper(d.lemma, d.defEn));
  function pick(arr, n, preferAuto = true) {
    let a = [...arr].sort((x, y) => (y.countNT || 0) - (x.countNT || 0));
    if (preferAuto) a = a.filter((d) => notes[d.strong]?.noteSrc === "auto").concat(a);
    const seen = new Set();
    const out = [];
    const step = Math.max(1, Math.floor(a.length / (n + 2)));
    for (let i = step; out.length < n && i < a.length; i += step) {
      if (seen.has(a[i].strong)) continue;
      seen.add(a[i].strong);
      out.push(a[i]);
    }
    for (const d of a) {
      if (out.length >= n) break;
      if (seen.has(d.strong)) continue;
      seen.add(d.strong);
      out.push(d);
    }
    return out.slice(0, n);
  }
  const sample = [...pick(names, 5), ...pick(nons, 10)];
  const sampleOut = sample.map((d) => ({
    strong: d.strong,
    lemma: d.lemma,
    nameMeaning: notes[d.strong]?.nameMeaning || "",
    defKo: notes[d.strong]?.defKo || "",
    noteSrc: notes[d.strong]?.noteSrc,
  }));

  // update report
  const prev = fs.existsSync(REPORT) ? JSON.parse(fs.readFileSync(REPORT, "utf8")) : {};
  const report = {
    ...prev,
    notesRepair: {
      batches,
      nameUncertain,
      mismatchStrongVsDef: mismatch,
      strongGlossUnmapped: unmapped,
      skeletonTop20Before: topBefore,
      skeletonTop20After: [...skelAfter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20),
      rewritten,
      reviewed: Object.values(notes).filter((v) => v.noteSrc === "reviewed").length,
      auto: Object.values(notes).filter((v) => v.noteSrc === "auto").length,
      totalKeys: Object.keys(notes).length,
      enriched,
    },
    sample15: sampleOut,
  };
  report.notes = {
    batches,
    nameUncertain,
    mismatchStrongVsDef: mismatch,
    strongGlossUnmapped: unmapped,
    skeletonTop20Before: topBefore,
    skeletonTop20After: report.notesRepair.skeletonTop20After,
    rewritten,
    reviewed: report.notesRepair.reviewed,
    auto: report.notesRepair.auto,
    totalKeys: report.notesRepair.totalKeys,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");

  console.log(JSON.stringify({
    nameUncertain,
    mismatch,
    unmapped,
    rewritten,
    reviewed: report.notesRepair.reviewed,
    auto: report.notesRepair.auto,
    skeletonBeforeTop5: topBefore.slice(0, 5),
    skeletonAfterTop5: report.notesRepair.skeletonTop20After.slice(0, 5),
  }, null, 2));
  console.log("\nSAMPLE:");
  for (const s of sampleOut) console.log(JSON.stringify(s));
}

main();
