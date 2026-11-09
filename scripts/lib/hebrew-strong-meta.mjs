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

/** @type {Map<string, { rootStrong: string|null, rootStrongs: string[], sourceText: string, meaning: string, def: string, pos: string, nameEtymEn: string }>|null} */
let _meta = null;

export function loadStrongMeta() {
  if (_meta) return _meta;
  _meta = new Map();

  if (fs.existsSync(RAW_JSON)) {
    const raw = JSON.parse(fs.readFileSync(RAW_JSON, "utf8"));
    for (const [id, e] of Object.entries(raw)) {
      _meta.set(normH(id), {
        rootStrong: null,
        rootStrongs: [],
        sourceText: "",
        meaning: e.meaning || "",
        def: e.def || "",
        pos: e.pos || "",
        nameEtymEn: "",
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
      // source 안 <def>가 이름 풀이인 경우가 많음 (meaning의 표제어 def보다 우선)
      const sourceDefs = [
        ...sourceRaw.matchAll(/<def>([\s\S]*?)<\/def>/g),
      ].map((x) => stripTags(x[1]));
      const sourceDef = sourceDefs.join(" ") || "";
      const meaningRaw = body.match(/<meaning>([\s\S]*?)<\/meaning>/)?.[1] || "";
      const meaning = stripTags(meaningRaw) || _meta.get(id)?.meaning || "";
      const meaningDef = stripTags(
        meaningRaw.match(/<def>([\s\S]*?)<\/def>/)?.[1] || "",
      );
      const pos =
        body.match(/<w\b[^>]*\bpos="([^"]+)"/)?.[1] || _meta.get(id)?.pos || "";
      const nameEtymEn =
        extractNameEtymEn(sourceText, sourceDef) || sourceDef || "";
      _meta.set(id, {
        rootStrong: srcIds[0] || null,
        rootStrongs: [...new Set(srcIds)],
        sourceText,
        meaning,
        def: nameEtymEn || meaningDef || _meta.get(id)?.def || "",
        pos,
        nameEtymEn,
      });
    }
  }
  return _meta;
}

/**
 * Strong source 전체에서 이름 풀이(영어) 추출.
 * 세미콜론 뒤뿐 아니라 괄호·i.e.·여러 <def>를 이어 붙임.
 * 예: "drawing out (of the water), i.e. rescued"
 *     "father of peace (i.e. friendly)"
 *     "loving" / "see ye a son" / "well of an oath"
 */
export function extractNameEtymEn(sourceText, sourceDef = "") {
  const src = String(sourceText || "").replace(/\s+/g, " ").trim();

  // 1) 「from … ;」 이후 절 전체를 우선 (괄호 포함)
  const afterFrom = src.match(
    /(?:^|;)\s*from\b[^;]*;\s*([^;]+(?:;[^;]+)*?)\s*$/i,
  );
  if (afterFrom) {
    let clause = afterFrom[1]
      .replace(/\b(?:rarely|once|or|shortened|fully|prolonged)\b[^;]*/gi, "")
      .replace(/^[;,\s]+/, "")
      .replace(/\.$/, "")
      .trim();
    // 히브리 표기 조각 제거
    clause = clause
      .replace(/[\u0590-\u05FF]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (clause.length >= 3 && !/^[A-Z][a-z]+(?:ites)?$/.test(clause)) {
      return clause;
    }
  }

  // 2) sourceDef(여러 def 결합) — "drawing out … rescued"
  if (sourceDef) {
    let d = String(sourceDef).replace(/\s+/g, " ").trim();
    if (
      d.length >= 3 &&
      !/^(?:a |an |the )?[A-Z][a-z]+(?:ites)?$/.test(d) &&
      !/^a primitive root$/i.test(d)
    ) {
      // sourceText에서 def 앞뒤 수식어 복원
      const enriched = src.match(
        new RegExp(
          String.raw`(?:^|;)\s*([^;]*\b${d.split(/\s+/)[0]}[^;]*)`,
          "i",
        ),
      );
      if (enriched?.[1] && enriched[1].length > d.length) {
        d = enriched[1]
          .replace(/^from\b[^,]*,?\s*/i, "")
          .replace(/\.$/, "")
          .trim();
      }
      return d.replace(/\.$/, "").trim();
    }
  }

  // 3) 세미콜론 조각 역순
  const parts = src
    .split(";")
    .map((s) => s.replace(/\.$/, "").trim())
    .filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    let p = parts[i];
    if (/^from\b/i.test(p)) continue;
    if (
      /^(?:dual|plural|prolonged|contracted|or|compare|see|active|passive|rarely|once)\b/i.test(
        p,
      )
    )
      continue;
    if (/^\d+$/.test(p) || /^H?\d+$/i.test(p)) continue;
    if (/^apparently\b/i.test(p)) continue;
    if (/^a primitive root$/i.test(p)) continue;
    p = p.replace(/[\u0590-\u05FF]+/g, " ").replace(/\s+/g, " ").trim();
    if (p.length < 3) continue;
    if (/^[A-Z][a-z]+(?:ites)?$/.test(p)) continue;
    return p;
  }
  return "";
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
 * Strong source 이름 풀이 → 한국어.
 * 뿌리 한글 gloss만 단독으로 쓰지 않음(추측 금지).
 * 확정 불가 시 "".
 */
export function deriveNameMeaningKo(meta, _rootGlossKo = "") {
  if (!meta) return "";
  let etymEn =
    meta.nameEtymEn ||
    extractNameEtymEn(meta.sourceText || "", "") ||
    "";
  // source에 풀이가 없고 meaning 앞머리가 풀이인 경우 (이스라엘 등)
  if (!etymEn && meta.meaning) {
    const head = String(meta.meaning).split(";")[0].trim();
    // "he will rule as God" / "Jehovah-saved" 형태만
    if (
      /^(?:he will|jah |jehovah|god |father |son |house |flame |heard |double )/i.test(
        head,
      ) &&
      !/^[A-Z][a-z]+,/.test(head)
    ) {
      etymEn = head;
    } else if (/^he will rule as god/i.test(head)) {
      etymEn = "he will rule as God";
    }
  }
  // "Jisraël, …" 앞에 풀이가 세미콜론으로 분리된 경우
  if (!etymEn && /he will rule as God/i.test(meta.meaning || "")) {
    etymEn = "he will rule as God";
  }
  if (!etymEn) return "";
  return translateNameGloss(etymEn);
}

/** Strong 이름뜻 영어 → 짧은 한국어 (퍼블릭 도메인 뜻) */
export function translateNameGloss(en) {
  let raw = String(en || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "";

  // 전체 구 매핑 (대소문자 무시)
  const s = raw.toLowerCase().replace(/\./g, "").trim();
  const exact = [
    [/self-?existent or eternal|self-?existent/, "스스로 계신 분, 영원하신 분"],
    [/double fruit/, "두 배의 열매"],
    [/jehovah \(is\) he|jehovah is he|yahweh \(is\) he/, "여호와는 그분이시다"],
    [/flame of jah|flame of jehovah|fire of jah/, "여호와의 불꽃"],
    [/jehovah-?saved|jah-?saved|jehovah is salvation|jah is salvation/, "여호와께서 구원하신다"],
    [/jah will rise|jehovah will rise/, "여호와께서 일으키시리라"],
    [/god of jehovah|god of jah/, "여호와의 하나님"],
    [/heard of god|god has heard/, "하나님이 들으셨다"],
    [/father of a multitude|father of multitudes/, "많은 무리의 아버지"],
    [/father of height|exalted father/, "높은 아버지"],
    [/father of (?:a )?multitude/, "많은 무리의 아버지"],
    [/father of joy|source of joy/, "기쁨의 아버지"],
    [/father of judgment/, "재판의 아버지"],
    [/father of knowledge/, "지식의 아버지"],
    [/son of \(?the\)? ?right hand/, "오른손의 아들"],
    [/he will rule as god/, "하나님처럼 다스리리라"],
    [/heel.?catcher|supplanter/, "발꿈치를 잡는 자"],
    [/laughter/, "웃음"],
    [/princess|noblewoman/, "공주, 귀부인"],
    [/drawing out.*rescued|drawing out \(of the water\)|drawn out|rescued/, "건져 냄"],
    [/^loving$|loving;|beloved/, "사랑받는 자"],
    [/see ye a son|behold a son/, "보라 아들이다"],
    [/father of peace/, "평화의 아버지"],
    [/brother (?:\(.*?\) )?(?:of )?\(?his\)? ?father|friend\) of \(his\) father|brother .* father/, "아버지의 형제"],
    [/well of an oath|well of (?:the )?oath/, "맹세의 우물"],
    [/god has heard/, "하나님이 들으셨다"],
    [/god almighty/, "전능하신 하나님"],
    [/ewe(?:[- ]lamb)?|female sheep/, "암양"],
    [/house of god/, "하나님의 집"],
    [/house of vanity/, "헛됨의 집"],
    [/house of bread/, "빵의 집"],
    [/house of the ford/, "여울의 집"],
    [/whom jehovah healed|jehovah has healed/, "여호와께서 고치신 자"],
    [/jehovah has heard|jah has heard/, "여호와께서 들으신"],
    [/jehovah has helped|jah has helped/, "여호와께서 도우신"],
    [/jehovah is salvation|jah is salvation|salvation of jah/, "여호와의 구원"],
    [/jehovah is exalted/, "여호와는 높으시다"],
    [/gift of jehovah|gift of jah/, "여호와의 선물"],
    [/servant of jehovah|servant of jah/, "여호와의 종"],
    [/man of god/, "하나님의 사람"],
    [/strength of god|god is strength/, "하나님의 힘"],
    [/my god is jah|my god is jehovah/, "나의 하나님은 여호와"],
    [/god with us/, "하나님이 우리와 함께"],
    [/judge of god|god has judged/, "하나님이 심판하신"],
    [/he will be/, "그는 …일 것이다"],
    [/bitterness/, "씀"],
    [/peaceful|peaceable/, "평화로운"],
    [/pleasantness|pleasant/, "기쁨, 즐거움"],
    [/^rest$/, "안식"],
    [/dew of jah/, "여호와의 이슬"],
    [/whom jehovah raised|jehovah has raised/, "여호와께서 일으키신"],
  ];
  for (const [re, ko] of exact) {
    if (re.test(s)) return ko;
  }

  // 합성: Jehovah/Jah/El/God/house of …
  const compound = translateCompound(raw);
  if (compound) return compound;

  // father of peace (i.e. friendly) → 평화의 아버지
  if (/^father of /i.test(raw)) {
    const rest = raw
      .replace(/^father of (?:a |the )?/i, "")
      .replace(/\s*\(.*?\)\s*/g, " ")
      .trim()
      .split(/\s+/)[0];
    const rk = translateAtom(rest) || (/peace/i.test(raw) ? "평화" : "");
    if (rk) return `${rk}의 아버지`;
  }
  if (/^brother\b/i.test(raw) && /father/i.test(raw)) {
    return "아버지의 형제";
  }
  if (/^well of /i.test(raw)) {
    const rest = raw.replace(/^well of (?:an |the )?/i, "").replace(/\s*\(.*?\)\s*/g, " ").trim();
    if (/oath/i.test(rest)) return "맹세의 우물";
    const rk = translateAtom(rest);
    if (rk) return `${rk}의 우물`;
  }
  if (/^son of (?:a |the )?(.+)$/i.test(raw)) {
    const rest = raw.replace(/^son of (?:a |the )?/i, "").trim();
    const rk = translateAtom(rest);
    return rk ? `${rk}의 아들` : "";
  }
  if (/^house of (?:a |the )?(.+)$/i.test(raw)) {
    const rest = raw.replace(/^house of (?:a |the )?/i, "").trim();
    const rk = translateAtom(rest);
    return rk ? `${rk}의 집` : "";
  }

  // 짧은 구만 원자 번역 시도 — 실패 시 빈 값(추측 금지)
  if (raw.length <= 48) {
    const atom = translateAtom(raw);
    if (atom) return atom;
  }
  return "";
}

function translateCompound(raw) {
  const s = raw.trim();
  // Jehovah/Jah + …
  let m = s.match(
    /^(?:Jehovah|Jah|Yahweh)\s*[\(（]?(?:is|has)?[\)）]?\s*(.+)$/i,
  );
  if (m) {
    const rest = m[1].replace(/^\((?:is|has)\)\s*/i, "").trim();
    if (/^he$/i.test(rest)) return "여호와는 그분이시다";
    const rk = translateAtom(rest);
    if (rk) return `여호와는 ${rk}`;
  }
  m = s.match(/^(.+?)\s+of\s+(?:Jehovah|Jah|Yahweh)$/i);
  if (m) {
    const rk = translateAtom(m[1]);
    if (rk) return `여호와의 ${rk}`;
  }
  m = s.match(/^(?:flame|fire|light|lamp)\s+of\s+(?:Jehovah|Jah|Yahweh)$/i);
  if (m) return "여호와의 불꽃";
  m = s.match(/^(.+?)\s+of\s+(?:God|El)$/i);
  if (m) {
    const rk = translateAtom(m[1]);
    if (rk) return `하나님의 ${rk}`;
  }
  m = s.match(/^(?:God|El)\s+(?:is\s+)?(.+)$/i);
  if (m) {
    const rk = translateAtom(m[1]);
    if (rk) return `하나님은 ${rk}`;
  }
  return "";
}

function translateAtom(en) {
  const s = String(en || "")
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/\bi\.e\.\s*/g, "")
    .replace(/^(?:a|an|the)\s+/, "")
    .trim();
  const map = {
    he: "그분",
    she: "그녀",
    god: "하나님",
    el: "하나님",
    jah: "여호와",
    jehovah: "여호와",
    yahweh: "여호와",
    flame: "불꽃",
    fire: "불",
    light: "빛",
    lamp: "등불",
    fruit: "열매",
    double: "두 배",
    house: "집",
    father: "아버지",
    mother: "어머니",
    son: "아들",
    daughter: "딸",
    servant: "종",
    gift: "선물",
    help: "도움",
    helped: "도우신 분",
    heard: "들으신 분",
    healed: "고치신 분",
    salvation: "구원",
    strength: "힘",
    rock: "반석",
    peace: "평안",
    rest: "안식",
    dew: "이슬",
    grace: "은혜",
    mercy: "긍휼",
    truth: "진리",
    judge: "재판관",
    king: "왕",
    lord: "주",
    height: "높음",
    vanity: "헛됨",
    bread: "빵",
    wall: "성벽",
    ford: "여울",
    valley: "골짜기",
    desert: "광야",
    vineyard: "포도원",
    acacia: "싯딤",
    pasture: "목장",
    beloved: "사랑받는 자",
    pleasant: "기쁨",
    pleasantness: "기쁨",
    bitterness: "씀",
    laughter: "웃음",
    journey: "여행",
    multitude: "무리",
    knowledge: "지식",
    judgment: "재판",
    joy: "기쁨",
    exalted: "높으신 분",
    raised: "일으키신 분",
    creative: "창조하는",
    weaned: "젖뗀",
    hollowness: "텅 빔",
    side: "옆",
    breadth: "넓이",
    habitation: "거처",
    ambush: "매복",
    dagon: "다곤",
    baal: "바알",
    partridge: "메추라기",
    lionesses: "암사자",
    figcakes: "무화과 과자",
    deserts: "황무지",
  };
  if (map[s]) return map[s];
  // 두 단어
  const parts = s.split(/\s+/);
  if (parts.length === 2 && map[parts[0]] && map[parts[1]]) {
    return `${map[parts[0]]} ${map[parts[1]]}`;
  }
  return "";
}

function particleEun(word) {
  const ch = String(word || "").replace(/[^가-힣]/g, "").slice(-1);
  if (!ch) return "은";
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return "은";
  return code % 28 === 0 ? "는" : "은";
}

/**
 * Strong meaning의 신원 설명(영어) → 짧은 한국어 한 문장.
 * 추측·공통 틀 문장 없이, Strong에 있는 사실만.
 */
export function deriveIdentityKo(meta, krName = "") {
  if (!meta?.meaning) return "";
  let m = String(meta.meaning)
    .replace(/\s+/g, " ")
    .trim();
  // "Jehu, the name of five Israelites" → 신원 빈약 → ""
  if (/,?\s*the name of (?:five|several|many|one|two|three|four|six|seven|eight|nine|ten|\d+) /i.test(m) &&
      !/son of|daughter of|king of|place|city|wife|priest|prophet|tribe|river|mountain/i.test(m)) {
    // "Urijah, the name of one Hittite and five Israelites" — Hittite는 사실
    const hit = m.match(/one ([A-Za-z]+)/i);
    if (hit && /Hittite|Moabite|Ammonite|Edomite|Egyptian|Syrian|Philistine/i.test(hit[1])) {
      const who = translateGentilic(hit[1]);
      const name = krName || "이 사람";
      return who ? `${name}는 ${who}으로 기록된 인물이에요.` : "";
    }
    return "";
  }
  // "he will rule as God; Jisraël, a symbolical name of Jacob…"
  if (/symbolical name of Jacob|name of Jacob/i.test(m)) {
    const name = krName || "이스라엘";
    return `${name}${particleEun(name)} 야곱에게 주신 이름이며, 그 자손 백성과 나라를 가리켜요.`;
  }
  if (/the Jewish leader/i.test(m)) {
    const name = krName || "이 사람";
    return `${name}${particleEun(name)} 이스라엘을 이끈 지도자로 Strong에 소개돼요.`;
  }
  if (/the famous prophet/i.test(m)) {
    const name = krName || "이 사람";
    return `${name}${particleEun(name)} 유명한 예언자로 Strong에 소개돼요.`;
  }

  // "Ephrajim, a son of Joseph; also the tribe…"
  m = m.replace(/^[^,]+,\s*/, ""); // 영어 이름 제거
  const first = m.split(";")[0].trim();
  if (!first || first.length < 8) return "";

  const name = krName || "이 이름";
  const youngSon = first.match(/youngest son of ([A-Za-z' -]+)/i);
  if (youngSon) {
    const parent = transliteratePerson(youngSon[1]);
    return parent ? `${name}${particleEun(name)} ${parent}의 막내아들이에요.` : "";
  }
  const sonOf = first.match(/^a son of ([A-Za-z' -]+)/i);
  if (sonOf) {
    const parent = transliteratePerson(sonOf[1]);
    return parent ? `${name}${particleEun(name)} ${parent}의 아들이에요.` : "";
  }
  const dauOf = first.match(/^a daughter of ([A-Za-z' -]+)/i);
  if (dauOf) {
    const parent = transliteratePerson(dauOf[1]);
    return parent ? `${name}${particleEun(name)} ${parent}의 딸이에요.` : "";
  }
  const wifeOf = first.match(/^(?:a )?wife of ([A-Za-z' -]+)/i);
  if (wifeOf) {
    const hus = transliteratePerson(wifeOf[1]);
    return hus ? `${name}${particleEun(name)} ${hus}의 아내예요.` : "";
  }
  const place = first.match(/^(?:a )?(?:place|city|town|location) (?:in|east of|west of|near) ([A-Za-z' -]+)/i);
  if (place) {
    const where = transliteratePlace(place[1]);
    return where ? `${name}${particleEun(name)} ${where}에 있는 지명이에요.` : `${name}${particleEun(name)} 지명이에요.`;
  }
  if (/^an? (?:Israelite|place|city|town|river|mountain|valley|region)/i.test(first)) {
    if (/^an? Israelite$/i.test(first)) return "";
    if (/^an? (?:place|city|town)/i.test(first)) return `${name}${particleEun(name)} 지명이에요.`;
    if (/river/i.test(first)) return `${name}${particleEun(name)} 강 이름이에요.`;
    if (/mountain/i.test(first)) return `${name}${particleEun(name)} 산 이름이에요.`;
  }
  const king = first.match(/^(?:a )?king of ([A-Za-z' -]+)/i);
  if (king) {
    const land = transliteratePlace(king[1]);
    return land ? `${name}${particleEun(name)} ${land}의 왕으로 나와요.` : "";
  }
  if (/tribe descended from him/i.test(m) && /son of Joseph/i.test(meta.meaning || "")) {
    return `${name}${particleEun(name)} 요셉의 아들이자 그 자손 지파·영토를 가리키기도 해요.`;
  }
  if (/tribe descended from him/i.test(m) && /son of Jacob|youngest son of Jacob/i.test(meta.meaning || "")) {
    return `${name}${particleEun(name)} 야곱의 아들이자 그 자손 지파·영토를 가리키기도 해요.`;
  }
  return "";
}

function translateGentilic(en) {
  const map = {
    Hittite: "헷 사람",
    Moabite: "모압 사람",
    Ammonite: "암몬 사람",
    Edomite: "에돔 사람",
    Egyptian: "애굽 사람",
    Syrian: "아람 사람",
    Philistine: "블레셋 사람",
  };
  return map[en] || "";
}

function transliteratePerson(en) {
  const map = {
    Joseph: "요셉",
    Jacob: "야곱",
    Abraham: "아브라함",
    Isaac: "이삭",
    David: "다윗",
    Saul: "사울",
    Moses: "모세",
    Aaron: "아론",
    Solomon: "솔로몬",
    Jesse: "이새",
    Noah: "노아",
    Adam: "아담",
    Judah: "유다",
    Levi: "레위",
    Benjamin: "베냐민",
    Ephraim: "에브라임",
    Manasseh: "므낫세",
    Ahab: "아합",
    Nebat: "느밧",
    Nun: "눈",
    Amram: "아므람",
    Kish: "기스",
    Ner: "넬",
    Zeruiah: "스루야",
    Naomi: "나오미",
  };
  const t = String(en).trim();
  return map[t] || "";
}

function transliteratePlace(en) {
  const map = {
    Palestine: "가나안/팔레스타인",
    Canaan: "가나안",
    Egypt: "애굽",
    Moab: "모압",
    Edom: "에돔",
    Ammon: "암몬",
    Syria: "아람",
    Assyria: "앗수르",
    Babylon: "바벨론",
    Judah: "유다",
    Israel: "이스라엘",
    Jordan: "요단",
    "the Jordan": "요단",
  };
  const t = String(en).trim();
  return map[t] || map[t.replace(/^the\s+/i, "")] || "";
}

export function isProperPos(pos) {
  return /n-pr|x-pn/i.test(String(pos || ""));
}
