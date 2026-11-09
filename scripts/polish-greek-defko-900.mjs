#!/usr/bin/env node
/**
 * 헬라어 마무리 2차 — reviewed 이후 빈도 상위 900개 auto defKo 보강.
 * + G964 nameMeaning/defKo 특수 수정.
 * + MorphGNT 롬 16:25–27 부재 확인 보고용 메타.
 *
 * 칩 glossKo는 건드리지 않음. 설치·커밋·유료 API 금지.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const OUT = path.join(root, "public", "word-study");
const LEX = path.join(OUT, "lexicon", "greek");
const NOTES = path.join(root, "data", "keyword-notes", "greek.json");
const BIBLE_DATA = path.join(root, "public", "bible-data");
const STRONG = path.join(root, ".cache", "strongs-greek", "strong-el.json");
const MORPH = path.join(root, ".cache", "morphgnt", "66-Ro-morphgnt.txt");
const REPORT = path.join(OUT, "_greek-defko-900-report.json");

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

const TEMPLATE_RES = [
  { name: "뜻: X", re: /^뜻:\s/ },
  { name: "X라는/이라는 뜻이에요", re: /라는 뜻이에요|이라는 뜻이에요/ },
  { name: "기본 뜻은 「X」", re: /^기본 뜻은 「/ },
];

/** 고유명사 — 개역한글 기준 확인된 신원만 */
const NAME_FACTS = {
  G1138: "다윗은 이스라엘의 왕으로, 예수님의 족보에 나와요(마 1:1).",
  G2584: "가버나움은 갈릴리 호숫가 성읍으로, 예수님께서 주로 머무시며 가르치신 곳이에요(마 4:13).",
  G3094: "막달라 마리아는 부활하신 예수님을 처음 본 여인이에요(요 20:16-18).",
  G3478: "나사렛은 갈릴리의 마을로, 예수님이 자라신 곳이에요(마 2:23).",
  G4514: "로마 사람(로마 시민)을 가리켜요(행 22:25-29).",
  G4609: "실라는 바울과 함께 전도 여행을 떠난 동역자예요(행 15:40).",
  G4672: "솔로몬은 다윗의 아들로 이스라엘의 왕이에요(마 1:6).",
  G67: "아그립보는 바울이 변론한 헤롯 가문의 왕이에요(행 25:13-26:32).",
  G367: "아나니아는 사울의 눈을 고쳐 준 다메섹의 제자이거나, 거짓말한 성도로도 나와요(행 9:10; 행 5:1).",
  G912: "바라바는 빌라도가 예수님 대신 놓아 준 죄수예요(마 27:16-26).",
  G1057: "갈릴리 사람, 곧 갈릴리 출신을 가리켜요(마 26:69).",
  G2197: "사가랴는 세례 요한의 아버지이거나, 구약의 선지자를 가리켜요(눅 1:5; 마 23:35).",
  G2381: "도마는 예수님의 열두 제자예요(요 11:16).",
  G2469: "가룟은 유다에게 붙는 호칭으로, 예수님을 판 제자를 가리켜요(마 10:4).",
  G4540: "사마리아는 팔레스타인의 지역·성읍이에요(눅 17:11).",
  G5184: "두로는 지중해 연안의 항구 성읍이에요(마 11:21).",
  G625: "아볼로는 성경에 능한 알렉산드리아 출신 전도자예요(행 18:24).",
  G882: "아가야는 그리스의 한 지방이에요(행 18:12).",
  G2445: "욥바는 베드로가 머문 해안 성읍이에요(행 10:5-6).",
  G76: "아담은 첫 사람이며, 족보와 바울의 비유에 나와요(눅 3:38; 롬 5:14).",
  G1665: "엘리사벳은 세례 요한의 어머니예요(눅 1:5-57).",
  G2475: "이스라엘 사람, 곧 야곱의 후손을 가리켜요(롬 11:1).",
  G2495: "요나는 니느웨에 보낸 선지자이거나, 베드로의 아버지를 가리켜요(마 12:39-41).",
  G2533: "가야바는 예수님을 심문한 대제사장이에요(마 26:3).",
  G2786: "게바는 베드로의 아람어 이름이에요(요 1:42).",
  G4541: "사마리아 사람, 곧 사마리아 주민을 가리켜요(마 10:5).",
  G4549: "사울은 바울의 히브리식 이름이거나, 이스라엘의 첫 왕을 가리켜요(행 13:9; 행 13:21).",
  G4605: "시돈은 두로와 함께 나오는 해변 성읍이에요(마 11:21).",
  G4670: "소돔은 구약의 멸망한 성읍으로, 심판의 비유에 나와요(마 10:15).",
  G5344: "벨릭스는 바울을 심문한 총독이에요(행 23:24-24:27).",
  G965: "베들레헴은 유대 땅의 마을로, 예수님이 나신 곳이에요(마 2:1).",
  G2791: "길리기아는 소아시아의 지방으로, 바울의 고향 다소가 속해요(행 21:39).",
  G2883: "고넬료는 가이사랴의 백부장이며 이방인 가운데 처음 세례 받은 이들 중 하나예요(행 10:1-48).",
  G3138: "마가는 바나바와 바울과 동행한 요한 마가예요(행 12:12; 행 13:5).",
  G3198: "멜기세덱은 살렘 왕으로, 히브리서에서 그리스도의 제사장직 모형으로 나와요(히 5:6).",
  G3575: "노아는 방주를 만든 족장이에요(마 24:37-38).",
  G4516: "로마는 이탈리아의 수도예요(행 18:2).",
  G4947: "수리아(시리아)는 팔레스타인 북쪽의 지역이에요(마 4:24).",
  G207: "아굴라는 브리스길라와 함께한 바울의 동역자예요(행 18:2).",
  G954: "바알세불은 귀신의 왕을 가리키는 이름이에요(마 10:25).",
  G966: "벳새다는 갈릴리 호숫가 마을이에요(마 11:21).",
  G1447: "히브리 말(아람어)로라는 뜻으로 쓰여요(요 19:13).",
  G2410: "여리고는 예수님이 지나신 요단 근처 성읍이에요(마 20:29).",
  G3017: "레위는 세리였다가 제자가 된 사람(마태)이거나 족속을 가리켜요(막 2:14).",
  G4622: "시온은 예루살렘의 산·성읍을 가리켜요(마 21:5).",
  G4826: "시므온은 아기 예수를 안은 사람이거나, 다른 동명 인물을 가리켜요(눅 2:25).",
  G223: "알렉산더는 복음서·사도행전에 여러 명으로 나와요(막 15:21; 행 19:33).",
  G2266: "헤로디아는 세례 요한을 죽게 한 헤롯의 아내예요(마 14:3-11).",
  G2430: "이고니온은 바울이 복음을 전한 소아시아 성읍이에요(행 13:51).",
  G2882: "고린도는 바울이 오래 머문 그리스의 성읍이에요(행 18:1).",
  G2956: "구레네 사람, 곧 구레네 출신을 가리켜요(마 27:32).",
  G2993: "라오디게아는 소아시아의 성읍으로 계시록에도 나와요(골 2:1; 계 3:14).",
  G3082: "루스드라는 바울이 전도한 소아시아 성읍이에요(행 14:6-8).",
  G3479: "나사렛 사람, 곧 나사렛 출신을 가리켜요(막 1:24).",
  G3482: "나다나엘은 예수님의 제자예요(요 1:45-49).",
  G5174: "드로아는 바울이 환상을 본 소아시아의 항구예요(행 16:8-9).",
  G5190: "두기고는 바울이 보낸 동역자예요(엡 6:21).",
  G2: "아론은 모세의 형제로 첫 대제사장이에요(눅 1:5; 히 5:4).",
  G124: "애굽 사람, 곧 애굽 출신을 가리켜요(행 21:38).",
  G256: "알패오는 야고보(또는 레위)의 아버지로 나와요(마 10:3).",
  G708: "아리스다고는 바울과 동행한 마게도냐 사람이에요(행 19:29).",
  G735: "아데미는 에베소에서 섬기던 여신의 이름이에요(행 19:24-28).",
  G1050: "가이오는 바울의 동역자·영접자로 여러 서신에 나와요(행 19:29; 롬 16:23).",
  G2180: "에베소 사람, 곧 에베소 주민을 가리켜요(행 19:28).",
  G2332: "데살로니가는 마게도냐의 성읍이에요(행 17:1).",
  G2394: "야손은 데살로니가에서 바울 일행을 영접한 사람이에요(행 17:5-7).",
  G2421: "이새는 다윗의 아버지예요(마 1:5-6).",
  G2914: "그레데(크레타)는 지중해의 섬이에요(행 27:7; 딛 1:5).",
  G2954: "구브로는 바나바의 고향인 지중해의 섬이에요(행 11:19-20; 행 4:36).",
  G3110: "마게도냐 사람, 곧 마게도냐 출신을 가리켜요(고후 9:2).",
  G3156: "마태는 예수님의 열두 제자예요(마 10:3).",
  G3530: "니고데모는 밤에 예수님을 찾아온 바리새인이에요(요 3:1-2).",
  G3828: "밤빌리아는 바울이 지난 소아시아의 해변 지방이에요(행 13:13).",
  G964: "베데스다는 예루살렘 양문 곁의 못으로, 예수님이 38년 된 병자를 고치신 곳이에요(요 5:2).",
};

const NAME_MEANING = {
  G964: "자비의 집",
  G912: "아바의 아들",
  G2381: "쌍둥이",
  G2786: "반석",
  G966: "고기잡이 집",
  G965: "빵의 집",
  G954: "파리의 왕(바알세불)",
  G223: "사람을 지키는 이",
  G67: "야생마를 다루는 이",
  G5344: "행복한",
  G4516: "힘",
  G708: "가장 잘 다스리는 이",
  G2394: "고칠 이",
  G3530: "백성 가운데 이긴 이",
  G5190: "우연한·운 좋은",
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

function loadKrvHits() {
  /** @type {Map<string, { book: string, ch: number, v: number, gloss: string, krv: string }[]>} */
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
          if (arr.length >= 8) continue;
          arr.push({
            book,
            ch: chN,
            v: v.n,
            gloss: (w.glossKo || "").trim(),
            krv: krv.slice(0, 100),
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

/** Strong defEn → 감각 조각 */
function senseParts(defEn) {
  let t = String(defEn || "").trim().replace(/^"+|"+$/g, "");
  if (!t) return [];
  // drop etymology lead
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
  for (let i = start; i < parts.length && out.length < 3; i++) {
    let p = parts[i]
      .replace(/^\((figuratively|literally|by implication|specially|actively|passively)\)\s*/i, "")
      .replace(/^(figuratively|literally|by implication|specially)[,:]?\s*/i, "")
      .replace(/^(properly|adverbially)[,:]?\s*/i, "")
      .trim();
    if (!p) continue;
    // skip pure name biography
    if (/^(an?|the)\s+.+\b(name of|Israelite|Christian|apostle|city|place|region|patriarch|Roman)\b/i.test(p) && out.length) {
      continue;
    }
    const ie = p.match(/^(.+?),\s*i\.e\.\s*(.+)$/i);
    if (ie) {
      out.push(ie[1].trim());
      out.push(ie[2].trim());
    } else {
      out.push(p.split(",")[0].trim());
      const rest = p.split(",").slice(1).join(",").trim();
      if (rest && !/^i\.e\./i.test(rest) && out.length < 3) {
        const r2 = rest.replace(/^i\.e\.\s*/i, "").split(",")[0].trim();
        if (r2 && r2.length < 40) out.push(r2);
      }
    }
  }
  return [...new Set(out.map((x) => x.replace(/^"+|"+$/g, "").trim()).filter(Boolean))];
}

const ENKO = {
  remaining: "나머지",
  ones: "것들",
  "remaining ones": "남아 있는 이들",
  compassionate: "불쌍히 여기다",
  "to compassionate": "불쌍히 여기다",
  love: "사랑",
  life: "생명",
  "father-land": "조국·고향",
  "native town": "고향 마을",
  "heavenly home": "하늘 본향",
  image: "형상",
  worship: "예배",
  "heathen god": "이방 신",
  angle: "모퉁이·각",
  corner: "모퉁이",
  persecution: "박해",
  opportunity: "기회",
  occasion: "계기",
  tumult: "소동",
  confusion: "혼란",
  instability: "불안정",
  amazed: "놀라다",
  astonished: "깜짝 놀라다",
  sober: "신중한",
  discreet: "분별 있는",
  condemnation: "정죄",
  "four-footed": "네발 달린",
  beast: "짐승",
  idol: "우상",
  flee: "도망하다",
  lazy: "게으른",
  slothful: "게으른",
  expectation: "기다림",
  hope: "소망",
  salt: "소금",
  furnace: "풀무",
  without: "없이",
  ransom: "대속물",
  strip: "벗기다",
  wait: "기다리다",
  "to wait": "기다리다",
  "to flee": "도망하다",
  "to strip": "벗기다",
  mercy: "긍휼",
  grace: "은혜",
  power: "능력",
  word: "말씀",
  speak: "말하다",
  say: "말하다",
  see: "보다",
  hear: "듣다",
  give: "주다",
  take: "취하다",
  come: "오다",
  go: "가다",
  know: "알다",
  call: "부르다",
  send: "보내다",
  live: "살다",
  die: "죽다",
  save: "구원하다",
  destroy: "멸망시키다",
  teach: "가르치다",
  ask: "묻다",
  follow: "따르다",
  believe: "믿다",
  faith: "믿음",
  truth: "진리",
  light: "빛",
  darkness: "어둠",
  peace: "평안",
  joy: "기쁨",
  glory: "영광",
  spirit: "영",
  flesh: "육체",
  body: "몸",
  soul: "영혼",
  heart: "마음",
  hand: "손",
  eye: "눈",
  ear: "귀",
  mouth: "입",
  water: "물",
  bread: "빵",
  blood: "피",
  death: "죽음",
  sin: "죄",
  law: "율법",
  king: "왕",
  kingdom: "나라",
  people: "백성",
  nation: "민족",
  city: "성읍",
  house: "집",
  earth: "땅",
  heaven: "하늘",
  world: "세상",
  time: "때",
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
  sister: "자매",
  child: "아이",
  servant: "종",
  master: "주인",
  teacher: "선생",
  disciple: "제자",
  apostle: "사도",
  prophet: "선지자",
  angel: "천사",
  devil: "마귀",
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
  one: "하나",
  first: "첫째",
  last: "마지막",
  begin: "시작하다",
  end: "끝",
  work: "일",
  rest: "쉼",
  prayer: "기도",
  gospel: "복음",
  church: "교회",
  cross: "십자가",
  temple: "성전",
  synagogue: "회당",
  priest: "제사장",
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
  rain: "비",
  cloud: "구름",
  star: "별",
  sun: "해",
  moon: "달",
  sheep: "양",
  shepherd: "목자",
  door: "문",
  field: "밭",
  oil: "기름",
  salt: "소금",
  money: "돈",
  book: "책",
  letter: "편지",
  hour: "시",
  year: "해",
  sabbath: "안식일",
  feast: "잔치",
  passover: "유월절",
  wisdom: "지혜",
  knowledge: "지식",
  mind: "생각",
  will: "뜻",
  fear: "두려움",
  anger: "분노",
  promise: "약속",
  covenant: "언약",
  commandment: "계명",
  righteousness: "의",
  witness: "증인",
  hope: "소망",
  friend: "친구",
  enemy: "원수",
  poor: "가난한",
  rich: "부유한",
  dead: "죽은",
  free: "자유로운",
  slave: "노예",
  other: "다른",
  same: "같은",
  near: "가까운",
  far: "먼",
  soft: "부드러운",
  black: "검은",
  white: "흰",
  red: "붉은",
  completion: "완성",
  decay: "썩음",
  rain: "비",
  jump: "뛰다",
  exhibit: "보이다",
  renovate: "새롭게 하다",
  recollection: "기억",
  refutation: "논박",
  enable: "가능하게 하다",
  defamation: "비방",
  vindication: "변호",
  empower: "능력을 주다",
  insult: "모욕하다",
  accumulate: "모으다",
  accompany: "동행하다",
  inspect: "살펴보다",
  injure: "해치다",
  clamor: "외치다",
  aperture: "구멍",
  deposit: "맡긴 것",
  transfer: "옮기다",
  participation: "참여",
  victorious: "승리하는",
  resemble: "닮다",
  lawless: "불법의",
  foreign: "이방의",
  differently: "다르게",
  requital: "갚음",
  unintelligent: "무지한",
  opposite: "반대의",
  prompt: "신속한",
  "well-doing": "선행",
  ignorance: "무지",
  unblamable: "책망할 것이 없는",
  divinity: "신성",
  disturbance: "소동",
  residence: "거처",
  brilliancy: "광채",
  privately: "은밀히",
  thereafter: "그 후에",
  serviceable: "유익한",
  piously: "경건히",
  listen: "듣다",
  mix: "섞다",
  myrrh: "몰약",
  axe: "도끼",
  sight: "구경",
  oldness: "묵은 것",
  public: "공중의",
  wickedness: "악함",
  receive: "받다",
  accept: "받아들이다",
  reckon: "계산하다",
  impute: "돌리다",
  forever: "영원히",
  eternal: "영원한",
  age: "시대",
  write: "쓰다",
  raise: "일으키다",
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
  learn: "배우다",
  answer: "대답하다",
  lead: "인도하다",
  rule: "다스리다",
  judge: "심판하다",
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
  comfort: "위로하다",
  strengthen: "굳게 하다",
  establish: "세우다",
  reveal: "나타내다",
  hide: "감추다",
  silence: "침묵",
  mystery: "비밀",
  command: "명령",
  obedience: "순종",
  nation: "민족",
  gentile: "이방인",
  wise: "지혜로운",
  only: "유일한",
  alone: "홀로",
  amen: "아멘",
};

function enToKo(en) {
  let raw = String(en || "").trim().toLowerCase().replace(/^"+|"+$/g, "");
  if (!raw) return "";
  if (ENKO[raw]) return ENKO[raw];
  if (raw.startsWith("to ")) {
    const rest = raw.slice(3);
    if (ENKO[raw] || ENKO[rest]) return ENKO[raw] || ENKO[rest];
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
  if (words.length >= 2) {
    const mapped = words.map((w) => ENKO[w]).filter(Boolean);
    if (mapped.length >= 1) return mapped.join("·");
  }
  return "";
}

function spaceFix(s) {
  return String(s || "")
    .replace(/심히놀라/g, "심히 놀라")
    .replace(/몰약섞/g, "몰약 섞")
    .replace(/돌로된/g, "돌로 된")
    .replace(/묵은것/g, "묵은 것")
    .replace(/네발짐승/g, "네발 짐승")
    .replace(/기억나게하다/g, "기억나게 하다")
    .replace(/생각나게하다/g, "생각나게 하다")
    .replace(/([가-힣])(놀라다|섞다|하게하다)/g, "$1 $2");
}

function fixCommaGloss(s) {
  // 「생각, 신중한」→ 「신중한」(형용사 쪽) or rephrase
  return String(s || "").replace(/「([^」]*),([^」]*)」/g, (_, a, b) => {
    const aa = a.trim();
    const bb = b.trim();
    // prefer the more specific second if first is vague
    if (/^(생각|말씀|뜻|것)$/.test(aa)) return `「${bb}」`;
    return `「${aa}」·「${bb}」`;
  });
}

function hasTemplate(defKo) {
  return TEMPLATE_RES.some((t) => t.re.test(defKo || ""));
}

function buildNameDef(strong, lemma, hits) {
  if (NAME_FACTS[strong]) return NAME_FACTS[strong];
  const first = hits?.[0];
  if (!first) return "처음 나오는 곳: (본문 사례 없음)";
  return `처음 나오는 곳: ${refOf(first)}`;
}

/** Strong 영문 풀이 → 짧은 한국어 사실 (추측 최소화) */
function paraphraseDefEn(defEn) {
  const raw = String(defEn || "").trim();
  if (!raw) return "";

  const rules = [
    [/remaining ones/i, "남아 있는 이들"],
    [/to compassionate/i, "불쌍히 여기다·긍휼을 베풀다"],
    [/father-land|native town/i, "고향 땅·고향 마을"],
    [/heavenly home/i, "하늘 본향"],
    [/\ban image\b.*worship/i, "섬기려고 만든 형상(우상)"],
    [/\ban angle\b/i, "모퉁이·각"],
    [/^long\b/i, "긴(거리·시간)"],
    [/^short\b/i, "짧은(시간·거리·분량)"],
    [/to collect upon the same place/i, "한곳으로 모으다"],
    [/to remove/i, "떠나게 하다·떠나다"],
    [/desist|desert/i, "그만두다·떠나다"],
    [/battle-array|encampment|barracks/i, "진영·병영"],
    [/^radiant\b/i, "빛나는"],
    [/magnificent|sumptuous/i, "호화로운·눈부신"],
    [/to remind/i, "생각나게 하다"],
    [/^sleep\b/i, "잠"],
    [/spiritual torpor/i, "영적으로 나른한 상태"],
    [/to chance upon|confer with|to entreat/i, "만나다·간구하다"],
    [/to injure|exasperate/i, "해치다·괴롭히다"],
    [/to keep awake|watch\b/i, "깨어 있다·지키다"],
    [/to fulfil \(time\)|to "fill"/i, "채우다·시간을 채우다"],
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
    [/to jump/i, "뛰다"],
    [/to renovate/i, "새롭게 하다"],
    [/to injure/i, "해치다"],
    [/to transfer/i, "옮기다"],
    [/decay/i, "썩음·쇠함"],
    [/opposite/i, "반대되는"],
    [/unintelligent/i, "깨닫지 못하는"],
    [/approved/i, "인정받은"],
  ];
  for (const [re, ko] of rules) {
    if (re.test(raw)) return ko;
  }

  // generic: take first sense clause and map tokens
  const senses = senseParts(raw);
  const kos = senses.map(enToKo).filter(Boolean);
  if (kos.length >= 2) return `${kos[0]}·${kos[1]}`;
  if (kos.length === 1) return kos[0];
  return "";
}

function buildCommonDef(strong, defEn, hits) {
  const hit = pickHit(hits);
  const ref = hit ? refOf(hit) : "";
  const chip = spaceFix((hit?.gloss || "").trim());
  const para = paraphraseDefEn(defEn);

  const CURATED = {
    G3062: (r) => `남아 있는 사람이나 나머지 부분을 가리켜요${r ? `(${r})` : "."}`,
    G1653: (r) =>
      `불쌍히 여기고 긍휼을 베푼다는 뜻으로 쓰여요. 사람의 동정뿐 아니라 하나님의 은혜로운 긍휼에도 써요${r ? `(${r})` : "."}`,
    G3968: (r) =>
      `태어나 자란 고장이에요. 나라 전체보다 좁은 고향 마을을 가리켜요${r ? `(${r})` : "."}`,
    G1497: (r) =>
      `섬기려고 만든 형상, 곧 우상을 가리켜요. 이방 신 자체나 그 숭배를 말할 때도 있어요${r ? `(${r})` : "."}`,
    G1137: (r) => `모퉁이나 각을 가리켜요. 건물의 모서리·길모퉁이 등에 써요${r ? `(${r})` : "."}`,
    G1375: (r) => `믿음 때문에 당하는 박해·핍박을 가리켜요${r ? `(${r})` : "."}`,
    G874: (r) => `어떤 일을 시작할 계기나 기회를 가리켜요${r ? `(${r})` : "."}`,
    G181: (r) => `질서 없이 흔들리는 소동·난리를 가리켜요${r ? `(${r})` : "."}`,
    G1568: (r) => `몹시 놀라거나 두려움에 질린 상태를 나타내요${r ? `(${r})` : "."}`,
    G4998: (r) => `생각이 맑고 분별 있으며 절제하는 태도를 가리켜요${r ? `(${r})` : "."}`,
    G2631: (r) => `유죄 판결, 곧 정죄의 결과를 가리켜요${r ? `(${r})` : "."}`,
    G5074: (r) => `네발 달린 짐승을 가리켜요${r ? `(${r})` : "."}`,
    G1562: (r) => `옷을 벗기거나 벗는다는 뜻으로 쓰여요${r ? `(${r})` : "."}`,
    G3636: (r) => `게으르고 미적거리는 태도를 가리켜요${r ? `(${r})` : "."}`,
    G4329: (r) => `앞으로 올 일을 기다리는 기대·기다림을 가리켜요${r ? `(${r})` : "."}`,
    G1874: (r) => `귀를 기울여 듣는다는 뜻으로 쓰여요${r ? `(${r})` : "."}`,
    G4669: (r) => `몰약을 섞는다는 뜻으로, 쓴 포도주에 몰약을 탄 경우를 말해요${r ? `(${r})` : "."}`,
    G217: (r) => `음식에 쓰는 소금, 또는 비유로 신자의 역할을 가리켜요${r ? `(${r})` : "."}`,
    G2575: (r) => `불을 때는 풀무·가마를 가리켜요${r ? `(${r})` : "."}`,
    G817: (r) => `무엇 없이, 무엇과 떨어져서라는 뜻의 전치사예요${r ? `(${r})` : "."}`,
    G362: (r) => `끝까지 기다리며 기대를 둔다는 뜻으로 쓰여요${r ? `(${r})` : "."}`,
    G3117: (r) => `거리나 시간이 긴 것을 가리켜요${r ? `(${r})` : "."}`,
    G1024: (r) => `시간·거리·분량이 짧은 것을 가리켜요${r ? `(${r})` : "."}`,
    G1996: (r) => `한곳으로 모아 모은다는 뜻으로 쓰여요${r ? `(${r})` : "."}`,
    G868: (r) => `떠나게 하거나 스스로 떠나는 일에 쓰여요. 반란을 부추기거나 관계를 끊는 자리에도 나와요${r ? `(${r})` : "."}`,
    G3925: (r) => `군대의 진영이나 병영을 가리켜요${r ? `(${r})` : "."}`,
    G2986: (r) => `빛나고 눈부신 것을 가리켜요. 호화로운 차림에도 써요${r ? `(${r})` : "."}`,
    G5279: (r) => `조용히 생각나게 하다, 기억을 일깨운다는 뜻으로 쓰여요${r ? `(${r})` : "."}`,
    G5258: (r) => `잠. 비유로는 영적으로 나른한 상태를 가리켜요${r ? `(${r})` : "."}`,
    G1793: (r) => `만나 의논하거나, 누군가를 위해(또는 거슬러) 간구하는 일에 쓰여요${r ? `(${r})` : "."}`,
    G2559: (r) => `해치거나 괴롭힌다는 뜻으로 쓰여요${r ? `(${r})` : "."}`,
  };
  if (CURATED[strong]) return CURATED[strong](ref);

  // Strong paraphrase + optional chip surface (chips themselves untouched)
  if (para) {
    const parts = para.split("·").map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 2) {
      if (ref) return `${parts[0]}을 기본으로 하고, ${parts[1]} 쪽으로도 쓰여요(${ref}).`.replace(
        /을 기본/,
        hasBatchim(parts[0]) ? "을 기본" : "를 기본",
      );
      return `${parts[0]}을 기본으로 하고, ${parts[1]} 쪽으로도 쓰여요.`.replace(
        /을 기본/,
        hasBatchim(parts[0]) ? "을 기본" : "를 기본",
      );
    }
    const a = parts[0];
    const obj = hasBatchim(a) ? `${a}을` : `${a}를`;
    // if chip differs, mention as translation example without template frame
    if (chip && chip !== a && !a.includes(chip) && ref) {
      return `${obj} 가리켜요. 본문 예는 '${chip}'(${ref}).`;
    }
    if (ref) return `${obj} 가리켜요(${ref}).`;
    return `${obj} 가리켜요.`;
  }

  // last resort: chip as lexical fact only (no "뜻:/개역한글에서는" frames)
  if (chip && ref) return `${chip}${hasBatchim(chip) ? "을" : "를"} 가리켜요(${ref}).`;
  if (chip) return `${chip}${hasBatchim(chip) ? "을" : "를"} 가리켜요.`;
  if (ref) return `신약 본문 ${ref}에 나와요.`;
  return "신약 본문에 나와요.";
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
        /^(뜻|기본|뜻은|개역한글에서는|옮겼어요|가리켜요|쓰여요|쪽으로도|기본으로|본문에서|신약|본문에|나오는|말이에요|처음|나오는|곳|이름|확실하지|않아요|태어나|자란|고장이에요|나라|전체보다|좁은|고향|마을을)$/;
      return keep.test(m) ? m : "X";
    })
    .replace(/\s+/g, " ")
    .trim();
}

function countTemplates(notes, keys) {
  const out = {};
  for (const t of TEMPLATE_RES) {
    out[t.name] = keys.filter((k) => t.re.test(notes[k]?.defKo || "")).length;
  }
  return out;
}

function checkMorphgntDoxology() {
  const text = fs.readFileSync(MORPH, "utf8");
  const lines = text.trim().split(/\n/);
  const hits = lines.filter((l) => /^06162[5-7]/.test(l));
  const last = lines[lines.length - 1] || "";
  return {
    status: hits.length ? "있음" : "원본에도 없음",
    lastLine: last,
    lastVerseCode: last.slice(0, 6),
    totalLines: lines.length,
    hitCount: hits.length,
    source: "SBLGNT CC BY 4.0, MorphGNT CC BY-SA (morphgnt/sblgnt 66-Ro-morphgnt.txt)",
  };
}

function main() {
  const dox = checkMorphgntDoxology();
  console.log("[1] MorphGNT doxology:", dox.status, "last", dox.lastVerseCode);

  const notes = JSON.parse(fs.readFileSync(NOTES, "utf8"));
  const strongMap = loadStrong();
  console.log("[2] KRV index…");
  const hits = loadKrvHits();

  const lexFiles = fs
    .readdirSync(LEX)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8")))
    .filter((d) => (d.countNT || 0) >= 1)
    .sort((a, b) => (b.countNT || 0) - (a.countNT || 0) || Number(a.strong.slice(1)) - Number(b.strong.slice(1)));

  const autoRanked = lexFiles.filter((d) => notes[d.strong]?.noteSrc === "auto");
  const targets = autoRanked.slice(0, 900);
  const targetKeys = targets.map((d) => d.strong);

  // BEFORE metrics (global templates among targets)
  const tmplBefore = countTemplates(notes, targetKeys);
  const skelBefore = new Map();
  for (const k of targetKeys) {
    const sk = skeleton(notes[k].defKo);
    skelBefore.set(sk, (skelBefore.get(sk) || 0) + 1);
  }
  const topBefore = [...skelBefore.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  let spacingFixed = 0;
  let commaFixed = 0;
  let nameFirstOnly = 0;
  let changed = 0;
  const batches = [];

  for (let i = 0; i < targets.length; i += 300) {
    const chunk = targets.slice(i, i + 300);
    let batchChanged = 0;
    for (const lex of chunk) {
      const strong = lex.strong;
      const prev = notes[strong];
      const entry = strongMap.get(strong);
      const defEn = entry?.defEn || lex.defEn || "";
      const lemma = lex.lemma || entry?.word || "";
      const h = hits.get(strong) || [];
      const proper = looksProper(lemma, defEn);

      let defKo;
      let nameMeaning = prev.nameMeaning || "";
      if (proper) {
        defKo = buildNameDef(strong, lemma, h);
        if (NAME_MEANING[strong]) nameMeaning = NAME_MEANING[strong];
        if (defKo.startsWith("처음 나오는 곳:")) nameFirstOnly += 1;
      } else {
        defKo = buildCommonDef(strong, defEn, h);
      }

      const beforeSpace = defKo;
      defKo = spaceFix(defKo);
      if (defKo !== beforeSpace) spacingFixed += 1;
      const beforeComma = defKo;
      defKo = fixCommaGloss(defKo);
      if (defKo !== beforeComma) commaFixed += 1;

      // strip residual templates if any slipped
      if (/^뜻:\s/.test(defKo)) {
        defKo = defKo.replace(/^뜻:\s*/, "").replace(/^([^.(]+)\./, (_, a) => `${a.trim()}을 가리켜요.`);
      }
      if (/라는 뜻이에요|이라는 뜻이에요/.test(defKo) && defKo.includes("개역한글에서는")) {
        // rewrite entirely
        defKo = buildCommonDef(strong, defEn, h);
        defKo = spaceFix(fixCommaGloss(defKo));
      }
      if (/^기본 뜻은 「/.test(defKo)) {
        defKo = buildCommonDef(strong, defEn, h);
        defKo = spaceFix(fixCommaGloss(defKo));
      }

      const next = {
        ...prev,
        defKo,
        noteSrc: "auto",
        ...(nameMeaning ? { nameMeaning } : {}),
      };
      // keep etymKo/usageKo but tone down template etym for names
      if (proper && nameMeaning) {
        next.etymKo = `이름 뜻은 「${nameMeaning}」 쪽으로 읽혀요.`;
        const hit = pickHit(h);
        next.usageKo = hit ? `개역한글 본문에서는 ${refOf(hit)}에 나와요.` : prev.usageKo;
      }

      if (JSON.stringify(prev) !== JSON.stringify(next)) {
        notes[strong] = next;
        changed += 1;
        batchChanged += 1;
      } else {
        notes[strong] = next;
      }
    }

    // remaining templates among ALL targets so far + remaining unprocessed
    const processedKeys = targetKeys.slice(0, i + chunk.length);
    const tmplNow = countTemplates(notes, targetKeys);
    const remainTemplates = tmplNow["뜻: X"] + tmplNow["X라는/이라는 뜻이에요"] + tmplNow["기본 뜻은 「X」"];
    batches.push({
      batch: batches.length + 1,
      range: `${chunk[0].strong}–${chunk[chunk.length - 1].strong}`,
      size: chunk.length,
      changedCum: changed,
      batchChanged,
      remainTemplatesIn900: remainTemplates,
      tmpl: tmplNow,
    });
    console.log(
      `[batch ${batches.length}] changedCum=${changed} remainTemplates=${remainTemplates} tmpl=${JSON.stringify(tmplNow)}`,
    );
  }

  // G964 special (hapax, outside top900)
  {
    const prev = notes.G964 || { noteSrc: "auto" };
    notes.G964 = {
      ...prev,
      defKo: NAME_FACTS.G964,
      nameMeaning: "자비의 집",
      etymKo: "이름 뜻은 「자비의 집」 쪽으로 읽혀요.",
      usageKo: "개역한글 본문에서는 요 5:2에 나와요.",
      noteSrc: prev.noteSrc || "auto",
    };
    changed += 1;
  }

  // AFTER
  const tmplAfter = countTemplates(notes, targetKeys);
  const skelAfter = new Map();
  for (const k of targetKeys) {
    const sk = skeleton(notes[k].defKo);
    skelAfter.set(sk, (skelAfter.get(sk) || 0) + 1);
  }
  const topAfter = [...skelAfter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  fs.writeFileSync(NOTES, JSON.stringify(notes, null, 2) + "\n");

  // enrich lexicon defKo/nameMeaning only (not glossKo chips)
  let enriched = 0;
  for (const strong of [...targetKeys, "G964"]) {
    const fp = path.join(LEX, `${strong}.json`);
    if (!fs.existsSync(fp)) continue;
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    const n = notes[strong];
    if (!n) continue;
    let dirty = false;
    if (n.defKo && d.defKo !== n.defKo) {
      d.defKo = n.defKo;
      dirty = true;
    }
    if (n.nameMeaning !== undefined && d.nameMeaning !== (n.nameMeaning || "")) {
      d.nameMeaning = n.nameMeaning || "";
      dirty = true;
    }
    if (n.usageKo && d.compareKo !== n.usageKo) {
      d.compareKo = n.usageKo;
      dirty = true;
    }
    if (n.etymKo && d.root) {
      d.root = { ...d.root, glossKo: n.etymKo };
      dirty = true;
    }
    if (dirty) {
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
      enriched += 1;
    }
  }

  // samples: 5 names + 10 common from the 900
  const nameTargets = targets.filter((d) => looksProper(d.lemma, strongMap.get(d.strong)?.defEn || d.defEn));
  const nonTargets = targets.filter((d) => !looksProper(d.lemma, strongMap.get(d.strong)?.defEn || d.defEn));
  const sampleIds = [
    ...nameTargets.slice(0, 3).map((d) => d.strong),
    "G964",
    nameTargets[10]?.strong || nameTargets[3]?.strong,
    ...[50, 100, 150, 200, 250, 300, 400, 500, 600, 700].map((i) => nonTargets[i]?.strong).filter(Boolean),
  ].slice(0, 15);

  // ensure 5 names
  const sampleNames = ["G1138", "G2584", "G3094", "G964", "G2381"];
  const sampleNons = nonTargets.filter((_, i) => i % 80 === 7).slice(0, 10).map((d) => d.strong);
  const sample15 = [...sampleNames, ...sampleNons].slice(0, 15).map((s) => ({
    strong: s,
    lemma: lexFiles.find((d) => d.strong === s)?.lemma || "",
    nameMeaning: notes[s]?.nameMeaning || "",
    defKo: notes[s]?.defKo || "",
    noteSrc: notes[s]?.noteSrc,
  }));

  const report = {
    doxology: dox,
    targets: 900,
    changed,
    enriched,
    spacingFixed,
    commaFixed,
    nameFirstOnly,
    tmplBefore,
    tmplAfter,
    skeletonTop5Before: topBefore,
    skeletonTop5After: topAfter,
    batches,
    sample15,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ doxology: dox.status, last: dox.lastVerseCode, changed, tmplBefore, tmplAfter, nameFirstOnly, spacingFixed, commaFixed, batches }, null, 2));
}

main();
