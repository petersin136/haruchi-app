/**
 * BSB 영어 \s1 → 한국어 소제목 (뜻 번역, 4–14자)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function normEn(s) {
  return String(s)
    .normalize("NFKC")
    .replace(/['’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEX_PATH = path.join(__dirname, "..", ".cache", "bsb-heading-lexicon.json");

/** @type {Record<string, string>} */
const LEX = JSON.parse(fs.readFileSync(LEX_PATH, "utf8"));

const STOP = new Set(
  `the a an of and to for in on at from with by as is are was were be been being has have had do does did will shall may can must not no or so if than then that this these those it its he she they them his her their our your my me him us we you who whom whose what when where why how into over about before after against among under through between also again still more most some any each every other another same own both few such only just even very too up out down away upon`.split(
    /\s+/,
  ),
);

/** 전체 제목 고정 번역(우선) */
const EXACT = {
  "the genealogy of jesus": "예수 그리스도의 족보",
  "the birth of jesus": "예수 그리스도의 나심",
  "the pilgrimage of the magi": "동방 박사의 경배",
  "the flight to egypt": "애굽으로 피하심",
  "weeping and great mourning": "라마의 애곡",
  "the return to nazareth": "나사렛으로 돌아옴",
  "the mission of john the baptist": "세례 요한의 전파",
  "the baptism of jesus": "예수께서 세례를 받으심",
  "the temptation of jesus": "광야에서 시험받으심",
  "jesus begins his ministry": "전도의 시작",
  "the first disciples": "처음 부르신 제자들",
  "jesus heals the multitudes": "많은 병을 고치심",
  "the sermon on the mount": "산상 설교",
  "the beatitudes": "복 있는 자",
  "salt and light": "소금과 빛",
  "the fulfillment of the law": "율법을 이루심",
  "anger and reconciliation": "노여움과 화해",
  adultery: "간음하지 말라",
  divorce: "이혼의 규례",
  "oaths and vows": "맹세하지 말라",
  "an eye for an eye": "눈은 눈으로",
  "love your enemies": "원수를 사랑하라",
  "dan and naphtali": "단과 납달리",
  "gad and asher": "갓과 아셀",
  "issachar, zebulun, and dinah": "잇사갈과 스불론과 디나",
  joseph: "요셉의 출생",
  "jacob prospers": "야곱이 창성함",
  "the people respond": "백성의 응답",
  "jeremiah weeps for his people": "예레미야의 울음",
  "giving to the needy": "구제하는 일",
  "the lord's prayer": "이렇게 기도하라",
  "proper fasting": "금식하는 일",
  "treasures in heaven": "하늘에 쌓은 보화",
  "the lamp of the body": "몸의 등불",
  "do not worry": "염려하지 말라",
  "judging others": "비판하지 말라",
  "ask, seek, knock": "구하라 찾으라",
  "the narrow gate": "좁은 문으로 들어가라",
  "a tree and its fruit": "나무와 열매",
  "the house on the rock": "반석 위의 집",
  "not peace but a sword": "화평이 아니요 검",
  "the triumphant messiah": "기름 받은 자",
  "the psalm of the cross": "어찌 나를 버리셨나이까",
  "the lord is my shepherd": "여호와는 나의 목자",
  "moses at the burning bush": "불붙은 떨기나무",
  "the widow's oil": "과부의 기름",
  prologue: "책의 머리말",
  "moses leaves for egypt": "모세가 애굽으로 감",
  "moses' staff": "모세의 지팡이",
  "moses' hand": "모세의 손",
  "the appointment of aaron": "아론을 세우심",
  "the narrow door": "좁은 문으로 들어가라",
  "god arraigns adam and eve": "아담과 하와를 심문하심",

  "moses' staff": "모세의 지팡이",
  "moses' hand": "모세의 손",
  "the narrow door": "좁은 문으로 들어가라",

  "the creation": "천지 창조",
  "the seventh day": "일곱째 날의 안식",
  "man and woman in the garden": "동산의 남자와 여자",
  "the serpent's deception": "뱀의 속임",
  "god arraigns adam and eve": "아담과 하와를 심문하심",
  "the fate of the serpent": "뱀에게 내린 저주",
  "the punishment of mankind": "인생에게 내린 벌",
  "the expulsion from paradise": "동산에서 쫓겨남",
  "cain and abel": "가인과 아벨",
  "the descendants of cain": "가인의 후손",
  "the great flood": "큰 홍수",
  "the tower of babel": "바벨탑",
  "the call of abram": "아브람을 부르심",
  "the offering of isaac": "이삭을 바침",
  "joseph's dreams": "요셉의 꿈",
  "preparing the ark": "방주를 예비함",
  "corruption on the earth": "땅에 가득한 패괴",
  "exiting the ark": "방주에서 나옴",
  "from methuselah to noah": "므두셀라에서 노아까지",
  "the word of life": "생명의 말씀",
  "love one another": "서로 사랑하라",
  "the true god": "참 하나님",
  "the two paths": "두 가지 길",
  "how majestic is your name!": "주의 이름의 위엄",
  "the heavens declare the glory of god": "하늘이 영광을 선포함",
  "the earth is the lord's": "땅과 거기 충만한 것",
  "the lord is my salvation": "여호와는 나의 구원",
  "you turned my mourning into dancing": "슬픔을 춤으로 바꾸심",
  "the great commission": "만민에게 가라",
  "the resurrection": "예수께서 부활하심",
  "the crucifixion": "십자가에 못 박히심",
  "the ascension": "승천하심",
  "the holy spirit at pentecost": "오순절의 성령",
  "elijah taken up to heaven": "엘리야의 승천",
  "the ten commandments": "십계명",
  "the golden calf": "금송아지",
  "crossing the red sea": "홍해를 건넘",
  "water from the rock": "반석에서 난 물",
  "the day of the lord": "여호와의 날",
  "a call to repentance": "회개로의 부르심",
  "final greetings": "마지막 문안",
  "benediction and farewell": "축도와 작별",
  doxology: "송영",
  "the israelites multiply in egypt": "애굽에서 번성함",
  "oppression by a new king": "새 왕의 압제",
  "the birth and adoption of moses": "모세의 출생과 입양",
  "the rejection and flight of moses": "모세의 거절과 도피",
  "god hears the cry of the israelites": "이스라엘의 부르짖음",
  "elijah denounces ahaziah": "아하시야를 꾸짖음",
  "jehoram succeeds ahaziah": "여호람이 왕이 됨",
  "elisha succeeds elijah": "엘리사가 이어받음",
  "elisha heals the waters of jericho": "여리고 물을 고침",
  "elisha mocked": "엘리사를 조롱함",
  "moab's rebellion": "모압의 반역",
  "the shunammite woman": "수넴 여인",
  "elisha raises the shunammite's son": "수넴 아들을 살림",
  "judah's rebellion": "유다의 패역",
  "meaningless offerings": "헛된 제물",
  "the corruption of zion": "시온의 부패",
  "the mountain of the house of the lord": "여호와 전의 산",
  "the day of reckoning": "심판의 날",
  "judgment on jerusalem and judah": "예루살렘과 유다 심판",
  "a warning to the daughters of zion": "시온 딸들에게 경고",
  "a remnant in zion": "시온의 남은 자",
  "the song of the vineyard": "포도원의 노래",
  "woes to the wicked": "악인에게 화",
  "peter addresses the crowd": "베드로가 무리를 말함",
  "three thousand believe": "삼천 명이 믿음",
  "the fellowship of believers": "믿는 자들의 교제",
  "a lame man walks": "저는 자가 걸음",
  "peter speaks in solomon's colonnade": "솔로몬 행각의 설교",
  "peter and john before the sanhedrin": "공회 앞의 베드로",
  "matthias replaces judas": "맛디아가 유다를 대신함",
  "john greets the seven churches": "일곱 교회에 문안",
  "john's vision on patmos": "밧모 섬의 환상",
  "to the church in ephesus": "에베소 교회에",
  "to the church in smyrna": "서머나 교회에",
  "to the church in pergamum": "버가모 교회에",
  "to the church in thyatira": "두아디라 교회에",
  "to the church in sardis": "사데 교회에",
  "to the church in philadelphia": "빌라델비아 교회에",
  "to the church in laodicea": "라오디게아 교회에",
};

function clip14(s) {
  let t = String(s).replace(/\s+/g, " ").trim();
  t = t.replace(/\s+의$/u, "").replace(/의$/u, "").replace(/가운데$/u, "").trim();
  // 어색한 띄어쓰기 「뱀 의」 방지
  t = t.replace(/\s+의\s+/g, "의 ").replace(/\s+/g, " ").trim();
  let chars = [...t];
  if (chars.length > 14) {
    let cut = chars.slice(0, 14).join("");
    const sp = cut.lastIndexOf(" ");
    if (sp >= 4) cut = cut.slice(0, sp);
    t = cut.replace(/의$/u, "").trim();
    chars = [...t];
  }
  return t;
}

function ensureMin4(title, fallbackPad = "에 대하여") {
  let t = String(title).trim();
  if ([...t].length >= 4) return t;
  if ([...t].length === 0) return "본문 단락";
  // 짧은 고유명사·용어는 의미 보강
  const padded = `${t}${fallbackPad}`;
  return [...padded].slice(0, 14).join("");
}

function lookup(tok) {
  let w = tok.toLowerCase().replace(/^[^a-z]+|[^a-z']+$/g, "");
  if (!w || STOP.has(w)) return "";
  if (LEX[w]) return LEX[w];
  if ((w.endsWith("'s") || w.endsWith("s'")) && LEX[w.replace(/'?s$/, "")]) {
    return `${LEX[w.replace(/'?s$/, "")]}의`;
  }
  if (w.endsWith("s") && LEX[w.slice(0, -1)]) return LEX[w.slice(0, -1)];
  if (w.endsWith("ed") && LEX[w.slice(0, -2)]) return LEX[w.slice(0, -2)];
  if (w.endsWith("ing") && LEX[w.slice(0, -3)]) return LEX[w.slice(0, -3)];
  return "";
}

function tokensOf(en) {
  return normEn(en)
    .replace(/[^a-z0-9'\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
}

function assemble(parts) {
  const cleaned = parts.filter(Boolean).map((p) => String(p).trim()).filter(Boolean);
  /** @type {string[]} */
  const out = [];
  for (const p of cleaned) {
    if (p === "의" || p === "과" || p === "와") {
      if (out.length) out[out.length - 1] = `${out[out.length - 1]}${p}`;
      continue;
    }
    if (p.startsWith("의") && out.length) {
      out[out.length - 1] = `${out[out.length - 1]}${p}`;
      continue;
    }
    out.push(p);
  }
  let s = out.join(" ").replace(/\s+/g, " ").trim();
  s = s.replace(/의의/g, "의");
  return clip14(s);
}

/**
 * @param {string} en
 */

try {
  const fillPath = path.join(__dirname, "..", ".cache", "headings-exact-fill.json");
  if (fs.existsSync(fillPath)) Object.assign(EXACT, JSON.parse(fs.readFileSync(fillPath, "utf8")));
} catch { /* ignore */ }

export function translateBsbHeading(en) {
  const key = normEn(en);
  if (EXACT[key]) {
    const exact = clip14(EXACT[key]);
    // 짧은 확정 제목은 무리하게 「본문 단락」으로 바꾸지 않고 보강
    if ([...exact].length < 4) {
      const SHORT = {
        바벨탑: "바벨탑을 쌓음",
        십계명: "여호와의 십계명",
        휘장: "성소의 휘장",
        놋뱀: "광야의 놋뱀",
        진설병: "진설하는 떡",
        옷니엘: "사사 옷니엘",
        에훗: "사사 에훗",
        삼갈: "사사 삼갈",
        돌라: "사사 돌라",
        야일: "사사 야일",
        송영: "찬양과 송영",
      };
      return SHORT[exact] || ensureMin4(exact, " 이야기");
    }
    return exact;
  }

  // To the Church in X
  let m = key.match(/^to the church in (.+)$/);
  if (m) {
    const place = lookup(m[1]) || m[1];
    return clip14(`${place} 교회에`);
  }

  m = key.match(/^the parable of (?:the )?(.+)$/);
  if (m) return assemble([phrase(m[1]), "비유"]);

  m = key.match(/^the song of (.+)$/);
  if (m) return assemble([phrase(m[1]), "의 노래"]);

  m = key.match(/^the death of (.+)$/);
  if (m) return assemble([phrase(m[1]), "의 죽음"]);

  m = key.match(/^the birth of (.+)$/);
  if (m) return assemble([phrase(m[1]), "의 탄생"]);

  m = key.match(/^the call of (.+)$/);
  if (m) return assemble([phrase(m[1]), "을 부르심"]);

  m = key.match(/^woes? to (.+)$/);
  if (m) return assemble([phrase(m[1]), "에게 화"]);

  m = key.match(/^a warning to (.+)$/);
  if (m) return assemble([phrase(m[1]), "에게 경고"]);

  m = key.match(/^warning(?:s)? (?:to|against) (.+)$/);
  if (m) return assemble([phrase(m[1]), "에 대한 경고"]);

  m = key.match(/^jesus (.+)$/);
  if (m) {
    const rest = phrase(m[1]);
    const v = verbTitle(m[1]);
    return clip14(v || assemble(["예수", rest]));
  }

  m = key.match(/^(paul|peter|john|james|jude|timothy|titus)'?s? (.+)$/);
  if (m) return assemble([lookup(m[1]) || phrase(m[1]), "의", phrase(m[2])]);

  m = key.match(/^greetings? from (.+)$/);
  if (m) return assemble([phrase(m[1]), "의 문안"]);

  m = key.match(/^the (.+) of (.+)$/);
  if (m) {
    const head = phrase(m[1]);
    const tail = phrase(m[2]);
    if (head && tail) return assemble([tail, "의", head]);
  }

  // X's Y
  m = key.match(/^([a-z]+)'s (.+)$/);
  if (m) return assemble([lookup(m[1]) || m[1], "의", phrase(m[2])]);

  let raw = phrase(key);
  if (!raw || [...raw].length < 4) {
    const toks = tokensOf(key).filter((t) => !STOP.has(t));
    const gloss = toks.map(lookup).filter(Boolean);
    if (gloss.length === 1) raw = `${gloss[0]}에 대하여`;
    else if (gloss.length >= 2) raw = assemble(gloss);
    else raw = "본문 단락";
  }
  // 「~에 대하여」는 최후 수단만 — 가능하면 명사화
  if (/에 대하여$/.test(raw) && [...raw].length > 6) {
    raw = raw.replace(/에 대하여$/, "");
    if ([...raw].length < 4) raw = `${raw} 이야기`;
  }
  return clip14(raw || "본문 단락");
}

function phrase(text) {
  const toks = tokensOf(text);
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    if (STOP.has(toks[i])) continue;
    // bigram
    if (i + 1 < toks.length) {
      const bi = `${toks[i]} ${toks[i + 1]}`;
      if (LEX[bi]) {
        out.push(LEX[bi]);
        i += 1;
        continue;
      }
      if (toks[i] === "john" && toks[i + 1] === "the" && toks[i + 2] === "baptist") {
        out.push("세례 요한");
        i += 2;
        continue;
      }
      if (toks[i] === "burning" && toks[i + 1] === "bush") {
        out.push("불붙은 떨기나무");
        i += 1;
        continue;
      }
      if (toks[i] === "red" && toks[i + 1] === "sea") {
        out.push("홍해");
        i += 1;
        continue;
      }
    }
    const w = lookup(toks[i]);
    if (w) out.push(w);
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

function verbTitle(rest) {
  const r = normEn(rest);
  if (/^heals?\b/.test(r)) return assemble([phrase(r.replace(/^heals?\s*/, "")), "을 고치심"]);
  if (/^raises?\b/.test(r)) return assemble([phrase(r.replace(/^raises?\s*/, "")), "을 살리심"]);
  if (/^walks? on water/.test(r)) return "물 위로 걸으심";
  if (/^calms?\b/.test(r)) return "바람과 바다를 잔잔케 하심";
  if (/^feeds?\b|^feeding\b/.test(r)) return assemble([phrase(r.replace(/^(feeds?|feeding)\s*/, "")), "을 먹이심"]);
  if (/^prays?\b/.test(r)) return "기도하심";
  if (/^teaches?\b/.test(r)) return "가르치심";
  if (/^cleanses?\b/.test(r)) return "성전을 깨끗케 하심";
  if (/^predicts?\b|^foretells?\b/.test(r)) return "고난을 예고하심";
  if (/^denies?\b/.test(r)) return "부인함";
  if (/^betrays?\b/.test(r)) return "배반함";
  if (/^sends?\b/.test(r)) return assemble([phrase(r.replace(/^sends?\s*/, "")), "을 보내심"]);
  if (/^calls?\b/.test(r)) return assemble([phrase(r.replace(/^calls?\s*/, "")), "을 부르심"]);
  if (/^blesses?\b/.test(r)) return "축복하심";
  if (/^anoints?\b/.test(r)) return "기름을 부으심";
  if (/^appears?\b/.test(r)) return "나타나심";
  if (/^ascends?\b/.test(r)) return "승천하심";
  if (/baptiz/.test(r)) return "세례를 받으심";
  if (/tempt/.test(r)) return "시험받으심";
  if (/crucif/.test(r)) return "십자가에 못 박히심";
  if (/burie/.test(r)) return "장사되심";
  if (/risen|resurrect|^rises?\b/.test(r)) return "부활하심";
  if (/^dies?\b|^death\b/.test(r)) return "죽으심";
  return "";
}

export function rememberExact(en, ko) {
  EXACT[normEn(en)] = ko;
}
