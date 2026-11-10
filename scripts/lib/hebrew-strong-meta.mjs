/**
 * OSHB HebrewStrong.xml 보조 필드 (source·meaning·이름뜻).
 * Public Domain Strong's — 외부 API 없음.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXTRA_NAME_ATOMS } from "./hebrew-name-atoms-extra.mjs";

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
        // def = BDB/Strong 뜻 (이름 etym과 분리 — 오매칭 검사용)
        def: meaningDef || meaning || _meta.get(id)?.def || "",
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

  // 0) 출처 참조만 있는 절은 이름뜻이 아님
  if (
    /^(?:the same as|probably for|patrial from|an orthographical|orthographical variation|from an unused root)/i.test(
      src,
    ) &&
    !/;\s*[^;]*(?:father|son|house|god|peace|well|loving|brother|flame|fruit)/i.test(
      src,
    )
  ) {
    // continue to try extracting a gloss after comma/semicolon anyway
  }

  // 1) 「from … ;」 또는 「from … ,」 이후 풀이 (끝 세미콜론 허용)
  const afterFrom = src.match(
    /(?:^|;)\s*from\b[^;,]*[;,]\s*([^;]+?)(?:\s*[;.]\s*)?$/i,
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
    // "and 5820" / "the feminine of 6083 …" 같은 참조만 남은 경우 제외
    if (
      clause.length >= 3 &&
      !/^[A-Z][a-z]+(?:ites)?$/.test(clause) &&
      !/^(?:and|or|the|with|compare|see)\b/i.test(clause) &&
      !/\b(?:feminine|masculine|plural|dual|prolonged|contracted)\s+of\b/i.test(
        clause,
      )
    ) {
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
    if (
      /^(?:the same as|probably for|patrial|orthographical|an unused root|with the article|by contraction|patronymic|of uncertain|of foreign|intensive from|patron from|\(aramaic\)|aramaic corresponding|corresponding to)/i.test(
        p,
      )
    )
      continue;
    if (/^(?:feminine|masculine|plural|dual|prolonged|contracted)\s+of\b/i.test(p))
      continue;
    if (
      /\b(?:orthographical variation|foreign (?:derivation|origin)|egyptian origin|corresponding to|persian derivation|variation of|contraction of|xlit|intensive of|by (?:reduplication|transposition)|emphatic form|compare \d+|shortened\) from|for \d+)\b/i.test(
        p,
      )
    )
      continue;
    // "a Jeminite" / "an Israelite" 단독 족속 표기는 이름뜻이 아님
    if (/^(?:a|an)\s+[A-Z][a-z]+ite$/i.test(p)) continue;
    if (/^perhaps meaning\b/i.test(p)) {
      p = p.replace(/^perhaps meaning\s+/i, "").trim();
      if (p.length < 3) continue;
    }
    // "(with the article) the weepers" → the weepers
    p = p.replace(/^\(with the article\)\s*/i, "").trim();
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
  // source에 풀이가 없고 meaning 앞머리가 풀이인 경우 (이스라엘·여호와 등)
  if (!etymEn && meta.meaning) {
    const head = String(meta.meaning).split(";")[0].trim();
    if (/self-?existent|eternal/i.test(head)) {
      etymEn = "self-Existent or Eternal";
    } else if (
      /^(?:he will|jah |jehovah|god |father |son |house |flame |heard |double |\(the\) self)/i.test(
        head,
      ) &&
      !/^[A-Z][a-z]+,/.test(head)
    ) {
      etymEn = head.replace(/^\(the\)\s*/i, "");
    } else if (/^he will rule as god/i.test(head)) {
      etymEn = "he will rule as God";
    }
  }
  // "Jisraël, …" 앞에 풀이가 세미콜론으로 분리된 경우
  if (!etymEn && /he will rule as God/i.test(meta.meaning || "")) {
    etymEn = "he will rule as God";
  }
  // Joseph: future of 3254; let him add …
  if (!etymEn && /let him add/i.test(meta.sourceText || "")) {
    etymEn = "let him add";
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
    [/let him add|he will add/, "더하리라"],
    [/self-?existent or eternal|self-?existent/, "스스로 계신 분, 영원하신 분"],
    [/^asked$/, "물음을 받은 자"],
    [/^asked;?$/, "물음을 받은 자"],
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
    [/a people has enlarged/, "백성이 넓어진다"],
    [/founded of jah|founded of jehovah/, "여호와께서 세우신다"],
    [/worker of edom/, "에돔의 일꾼"],
    [/^rough\b|rough \(i\.e/, "털이 많은"],
    [/jehovah-?fired|jah-?fired/, "여호와의 불"],
    [/jehovah-?given|jah-?given/, "여호와께서 주신"],
    [/god of supplication/, "간구의 하나님"],
    [/heap of testimony/, "증거의 무더기"],
    [/^extant$/, "있는 자"],
    [/^faithful$/, "신실한"],
    [/^walled$/, "성벽이 있는"],
    [/^tempestuous$/, "거센"],
    [/father of abundance/, "풍족의 아버지"],
    [/jah has seized|jehovah has seized/, "여호와께서 붙잡으신"],
    [/^perpetuity$/, "영원"],
    [/hidden.*distant|hidden, i\.e\. distant/, "감추어진, 먼"],
    [/fettering/, "매는"],
    [/burnt \(i\.e\. volcanic/, "불탄"],
    [/city of forests/, "숲의 성읍"],
  ];
  for (const [re, ko] of exact) {
    if (re.test(s)) return ko;
  }
  // 메타 문구(기원·대응·이형)는 이름뜻이 아님
  if (
    /^(?:of )?(?:egyptian|foreign|persian) origin|corresponding to|orthographical|uncertain derivation/i.test(
      s,
    )
  ) {
    return "";
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
  {
    const sonRaw = raw.replace(/^\((?:the|a)\)\s*/i, "").trim();
    if (/^sons? of (?:a |the |\(the\) )?/i.test(sonRaw)) {
      const rest = sonRaw
        .replace(/^sons? of (?:a |the |\(the\) )?/i, "")
        .replace(/\(the\)\s*/gi, "")
        .replace(/\s*\(.*?\)\s*$/g, "")
        .trim();
      const rk = translateAtom(rest) || translitProper(rest);
      if (rk) return `${rk}의 ${/^sons\b/i.test(sonRaw) ? "아들들" : "아들"}`;
    }
  }
  if (/^daughters? of /i.test(raw)) {
    const rest = raw
      .replace(/^daughters? of (?:a |the |\(the\) )?/i, "")
      .replace(/\s*\(.*?\)\s*/g, " ")
      .trim();
    const rk = translateAtom(rest) || translitProper(rest);
    if (rk) return `${rk}의 딸`;
    if (/jah|jehovah|god|el\b/i.test(raw)) return "여호와의 예배자(딸)";
  }
  if (/^lords? of /i.test(raw)) {
    const rest = raw
      .replace(/^lords? of (?:a |the |\(the\) )?/i, "")
      .replace(/\s*\(.*?\)\s*/g, " ")
      .trim();
    const rk = translateAtom(rest) || translitProper(rest);
    if (rk) return `${rk}의 주`;
    if (/jah|jehovah/i.test(raw)) return "여호와의 예배자";
  }
  if (/^our son$/i.test(raw)) return "우리의 아들";
  if (/^my son$/i.test(raw)) return "나의 아들";
  if (/^not \(of the\) people|not of the people|foreigner/i.test(raw))
    return "백성이 아닌 자, 이방인";
  if (/^disciplined of god/i.test(raw)) return "하나님께 징계받은";
  if (/^destroyed of god/i.test(raw)) return "하나님께 멸망당한";
  if (/^heights? of /i.test(raw)) {
    const rest = raw.replace(/^heights? of /i, "").trim();
    const rk = translateAtom(rest) || translitProper(rest);
    return rk ? `${rk}의 높은 곳` : "";
  }
  if (/^double mound/i.test(raw)) return "두 언덕";
  if (/^with pruning/i.test(raw)) return "가지치기";
  if (/^waster$/i.test(raw)) return "황폐케 하는 자";
  if (/^built(?:\s+up)?$/i.test(raw)) return "세워진";
  if (/^powerful$/i.test(raw)) return "강한";
  // X of Jah / emptying of Jah / knee of Jah
  {
    const m = raw.match(
      /^(.+?)\s+of\s+(?:Jah|Jehovah|Yahweh)\b/i,
    );
    if (m) {
      const left = translateAtom(
        m[1].replace(/\s*\(.*?\)\s*/g, " ").replace(/^(?:a|an|the)\s+/i, "").trim(),
      );
      if (left) return `여호와의 ${left}`;
    }
  }
  // Baal has known / Jah has become great
  {
    const m = raw.match(/^Baal\s+has\s+(.+)$/i);
    if (m) {
      const rk = translateAtom(m[1]);
      if (rk) return `바알이 ${rk}`;
      if (/known/i.test(m[1])) return "바알이 아셨다";
    }
  }
  if (/jah has become great|jehovah has become great/i.test(raw))
    return "여호와께서 커지셨다";
  if (/i have made great/i.test(raw)) return "내가 크게 하였다";
  if (/iron[- ]hearted/i.test(raw)) return "쇠 같은 마음";
  if (/^a jeminite$/i.test(raw)) return ""; // 족속 표기 — 이름뜻이 아님
  if (/^house (?:of|to)\b/i.test(raw)) {
    // house of Baal of (the) habitation → 바알 거처의 집
    if (/baal/i.test(raw) && /habitation/i.test(raw)) return "바알 거처의 집";
    if (/house of god/i.test(raw)) return "하나님의 집";
    if (/house of baal/i.test(raw)) return "바알의 집";
    let rest = raw
      .replace(/^house (?:of|to)\s+/i, "")
      .replace(/^\((?:the|a|an)\)\s*/i, "")
      .replace(/^\(the\)\s*/i, "")
      .replace(/^i\.e\.?\s*(?:of\s+)?/i, "")
      .replace(/\s*\(.*?\)\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const rk =
      translateAtom(rest) ||
      (/dust/i.test(rest)
        ? "티끌"
        : /leopard/i.test(rest)
          ? "표범"
          : /replies|answer/i.test(rest)
            ? "응답"
            : /binding|sheep|escape/i.test(rest)
              ? /escape/i.test(rest)
                ? "피난"
                : "결박"
              : /habitation/i.test(rest)
                ? "거처"
                : /creative/i.test(rest)
                  ? "창조하는 자"
                  : /figcakes?/i.test(rest)
                    ? "무화과 과자"
                    : /chariots?/i.test(rest)
                      ? "병거"
                      : /maakah|maachah/i.test(rest)
                        ? "마아가"
                        : /peor/i.test(rest)
                          ? "브올"
                          : /azmaveth/i.test(rest)
                            ? "아스마웹"
                            : /baal/i.test(rest)
                              ? "바알"
                              : "");
    if (rk && !/「of」| of /i.test(rk)) return `${rk}의 집`;
    // Strong에 남은 영어 고유명사/명사구 — 음역 없이 뜻만 옮기기 어려우면 「…」의 집
    if (
      rest &&
      rest.length <= 24 &&
      !/patrial|variation|same as|\bof\b/i.test(rest)
    ) {
      return `「${rest}」의 집`;
    }
  }
  if (/^god has blessed|^el has blessed/i.test(raw)) return "하나님이 복 주셨다";
  if (/^place of /i.test(raw)) {
    const rest = raw.replace(/^place of (?:a |the |\(the\) )?/i, "").trim();
    const rk = translateAtom(rest) || (/chariot/i.test(rest) ? "병거" : "");
    if (rk) return `${rk}의 장소`;
  }

  // Bel (is his) lord / X (is) Y
  {
    const bel = raw.match(/^([A-Za-z]+)\s*\((?:is(?:\s+his)?)\)\s*(.+)$/i);
    if (bel) {
      const a = translateAtom(bel[1]) || bel[1];
      const b = translateAtom(bel[2]);
      if (b) return `${a}이(가) ${/his/i.test(raw) ? "그의 " : ""}${b}`;
    }
  }
  // the weepers / weepers
  if (/weepers?/i.test(raw)) return "우는 자들";
  if (/first[- ]?born|primogeniture/i.test(raw)) return "맏이, 장자권";
  if (/youth-?ful|youthful/i.test(raw)) return "젊은";
  if (/desistance|desistant/i.test(raw)) return "그침";
  if (/of uncertain derivation|persian derivation|variation of|contraction of|xlit/i.test(raw))
    return "";

  // possessor of X / mistress of X / Baal of X
  {
    const m = raw.match(
      /^(possessor|mistress(?:ship)?|baal|master|masters|destroyer)\s+of\s+(?:a |the |\(the\) )?(.+)$/i,
    );
    if (m) {
      let rest = m[2].replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();
      const rk = translateAtom(rest) || translitProper(rest);
      const head = {
        possessor: "소유자",
        mistress: "여주인",
        mistressship: "여주인",
        baal: "바알",
        master: "주인",
        masters: "주인들",
        destroyer: "멸하는 자",
      }[m[1].toLowerCase()] || m[1];
      if (rk) return `${rk}의 ${head}`;
    }
  }
  // in (the) X of Y  /  with X  /  in X
  {
    let m = raw.match(/^in\s*\(?(?:the)?\)?\s*(.+?)\s+of\s+(?:Jah|Jehovah|God|El)\b/i);
    if (m) {
      const rk = translateAtom(m[1]);
      if (rk && /jah|jehovah/i.test(raw)) return `여호와의 ${rk} 안에`;
      if (rk) return `하나님의 ${rk} 안에`;
    }
    m = raw.match(/^in\s*\(?(?:the)?\)?\s*(.+)$/i);
    if (m && m[1].length < 40) {
      const rk = translateAtom(m[1].replace(/\s*\(.*?\)\s*/g, " ").trim());
      if (rk) return `${rk} 안에`;
    }
    m = raw.match(/^with\s+(.+)$/i);
    if (m) {
      const rk = translateAtom(m[1]) || translitProper(m[1]);
      if (rk) return `${rk}와 함께`;
    }
  }
  // red (see Genesis…) → 붉음
  if (/^red\b/i.test(raw)) return "붉음";
  if (/^hail\b/i.test(raw)) return "우박";
  if (/^earthy\b/i.test(raw)) return "흙의";
  if (/^brutish\b/i.test(raw)) return "짐승 같은";
  if (/^domineering\b/i.test(raw)) return "지배하는";
  if (/^offensiveness\b/i.test(raw)) return "거슬림";
  if (/^searcher\b/i.test(raw)) return "찾는 자";
  if (/^wasteful\b/i.test(raw)) return "낭비하는";
  if (/^a peeling\b/i.test(raw)) return "벗겨짐";
  if (/^a swell of ground\b/i.test(raw)) return "땅의 부풂";
  if (/cypress/i.test(raw)) return "잣나무";
  if (/^mistresses?$/i.test(raw)) return "여주인들";

  // 일반: X of Y (짧을 때)
  {
    const m = raw.match(/^([A-Za-z][A-Za-z' -]{1,20})\s+of\s+(?:a |the |\(the\) )?(.+)$/i);
    if (m && !/^(from|son|sons|house|father|brother|well|place|heights?)$/i.test(m[1])) {
      const left = translateAtom(m[1]) || translitProper(m[1]);
      const right = translateAtom(m[2].replace(/\s*\(.*?\)\s*/g, " ").trim()) || translitProper(m[2].trim());
      if (left && right) return `${right}의 ${left}`;
    }
  }

  // 짧은 구만 원자 번역 시도 — 실패 시 빈 값(추측 금지)
  if (raw.length <= 48) {
    const atom = translateAtom(raw);
    if (atom) return atom;
  }

  // to crowd upon / attack 등 동사구
  if (/crowd upon|to attack|\battack\b/i.test(raw)) return "공격하다";
  if (/to crowd/i.test(raw)) return "밀어붙이다";

  // 영문 원문 「」 보존은 하지 않음 — 번역 실패 시 빈 값
  return "";
}

/** Strong에 남은 영어 고유명사 → 흔한 한글 음역 (없으면 「라틴」) */
function translitProper(en) {
  const key = String(en || "").replace(/[^A-Za-z' -]/g, "").trim();
  if (!key) return "";
  const map = {
    Abinadab: "아비나답",
    Hadad: "하닷",
    Chur: "훌",
    Hur: "훌",
    Chanan: "하난",
    Hanan: "하난",
    Yaakan: "야아간",
    Zocheth: "소헷",
    Baal: "바알",
    Peor: "브올",
    Azmaveth: "아스마웹",
    Maakah: "마아가",
    Maachah: "마아가",
    Dagon: "다곤",
  };
  if (map[key]) return map[key];
  // 소문자 일반 명사는 제외
  if (/^[a-z]/.test(key)) return "";
  if (key.length <= 14) return `「${key}」`;
  return "";
}

function translateCompound(raw) {
  const s = raw.trim();
  // Jah/Jehovah has built|heard|…
  let m = s.match(/^(?:Jah|Jehovah|Yahweh)\s+has\s+(.+)$/i);
  if (m) {
    const rk = translateAtom(m[1]);
    if (rk) return `여호와께서 ${rk}`;
    if (/built/i.test(m[1])) return "여호와께서 세우셨다";
    if (/heard/i.test(m[1])) return "여호와께서 들으셨다";
    if (/helped/i.test(m[1])) return "여호와께서 도우셨다";
  }
  // Jehovah/Jah + …
  m = s.match(
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
  m = s.match(/^(?:God|El)\s+of\s+(.+)$/i);
  if (m) {
    const rk = translateAtom(m[1].replace(/^\((?:is|has)\)\s*/i, ""));
    if (rk) return `${rk}의 하나님`;
  }
  m = s.match(
    /^(?:God|El)\s*(?:\((?:is|has)\)|(?:is|has))?\s*(.+)$/i,
  );
  if (m) {
    const rest = m[1].replace(/^\((?:is|has)\)\s*/i, "").trim();
    const rk = translateAtom(rest);
    if (rk) return `하나님은 ${rk}`;
  }
  m = s.match(
    /^(?:Jehovah|Jah|Yahweh)\s*\((?:is|has)\)\s*(.+)$/i,
  );
  if (m) {
    const rk = translateAtom(m[1]);
    if (rk) return `여호와는 ${rk}`;
  }
  m = s.match(/^who\s*\(?is\)?\s*like\s+(?:God|El)\??$/i);
  if (m) return "누가 하나님과 같으랴";
  m = s.match(/^brother of\s+(.+)$/i);
  if (m) {
    const rk = translateAtom(m[1]);
    if (rk) return `${rk}의 형제`;
  }
  m = s.match(/^people of\s+(.+)$/i);
  if (m) {
    const rk = translateAtom(m[1]);
    if (rk) return `${rk}의 백성`;
  }
  m = s.match(/^city of\s+(.+)$/i);
  if (m) {
    const rest = m[1].replace(/\s*\(.*?\)\s*/g, " ").trim();
    if (/arba|four/i.test(rest)) return "아르바의 성읍, 네 명의 성읍";
    if (/forests/i.test(rest)) return "숲의 성읍";
    const rk = translateAtom(rest);
    if (rk) return `${rk}의 성읍`;
  }
  return "";
}

function translateAtom(en) {
  const s = String(en || "")
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/\bi\.e\.\s*/g, "")
    .replace(/^(?:a|an|the)\s+/, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const map = {
    he: "그분",
    she: "그녀",
    my: "나의",
    our: "우리의",
    his: "그의",
    her: "그녀의",
    their: "그들의",
    sorrow: "슬픔",
    might: "힘",
    piercing: "찌름",
    built: "세워진",
    waster: "황폐케 하는 자",
    powerful: "강한",
    disciplined: "징계받은",
    foreigner: "이방인",
    people: "백성",
    god: "하나님",
    el: "하나님",
    jah: "여호와",
    jehovah: "여호와",
    yahweh: "여호와",
    bel: "벨",
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
    helper: "돕는 이",
    helped: "도우신 분",
    hearing: "들으심",
    heard: "들으신 분",
    healed: "고치신 분",
    salvation: "구원",
    strength: "힘",
    rock: "반석",
    peace: "평화",
    rest: "안식",
    dew: "이슬",
    grace: "은혜",
    mercy: "긍휼",
    truth: "진리",
    judge: "재판관",
    king: "왕",
    lord: "주",
    height: "높음",
    perfect: "완전하신",
    goodness: "선하심",
    prevailed: "이기신",
    regarded: "돌아보신",
    obtained: "얻으신",
    said: "말씀하신",
    promised: "약속하신",
    anger: "노여움",
    depression: "낮음",
    elevations: "높임",
    rushing: "급히 흐름",
    liberality: "너그러움",
    abundance: "풍족",
    liberal: "후한",
    successful: "성공한",
    handling: "다루는",
    coast: "해안",
    "palm tree": "종려",
    "palm-tree": "종려",
    backbone: "등뼈",
    "backbone-like": "등뼈 같은",
    man: "사람",
    carried: "옮겨진",
    "carried away": "사로잡혀 간",
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
    dust: "티끌",
    leopard: "표범",
    replies: "응답",
    binding: "결박",
    chariots: "병거",
    chariot: "병거",
    oath: "맹세",
    well: "우물",
    loving: "사랑",
    friend: "친구",
    brother: "형제",
    failure: "실패",
    timid: "겁 많음",
    weeping: "울음",
    weepers: "우는 자들",
    weeper: "우는 자",
    escape: "피난",
    "first born": "맏이",
    firstborn: "맏이",
    primogeniture: "장자권",
    youthful: "젊은",
    "youth ful": "젊은",
    desistance: "그침",
    desistant: "그치는",
    fortification: "요새",
    fortress: "요새",
    stronghold: "산성",
    watchtower: "망대",
    tower: "망대",
    village: "마을",
    city: "성읍",
    place: "곳",
    fountain: "샘",
    spring: "샘",
    river: "강",
    mountain: "산",
    hill: "언덕",
    stone: "돌",
    oak: "상수리",
    palm: "종려",
    cedar: "백향목",
    olive: "감람",
    myrrh: "몰약",
    frankincense: "유향",
    gold: "금",
    silver: "은",
    iron: "철",
    copper: "구리",
    brass: "놋",
    blessing: "복",
    blessed: "복 받은",
    curse: "저주",
    cursed: "저주받은",
    hope: "소망",
    life: "생명",
    death: "죽음",
    living: "살아 있는",
    holy: "거룩",
    holiness: "거룩함",
    righteous: "의로운",
    righteousness: "의",
    wise: "지혜로운",
    wisdom: "지혜",
    fool: "어리석은 자",
    folly: "어리석음",
    power: "능력",
    mighty: "강한",
    greatness: "위대함",
    great: "큰",
    small: "작은",
    little: "작은",
    high: "높은",
    low: "낮은",
    deep: "깊은",
    wide: "넓은",
    narrow: "좁은",
    new: "새",
    old: "옛",
    young: "젊은",
    white: "흰",
    black: "검은",
    red: "붉은",
    green: "푸른",
    good: "좋은",
    bad: "나쁜",
    evil: "악",
    beauty: "아름다움",
    beautiful: "아름다운",
    love: "사랑",
    hated: "미움받은",
    hatred: "미움",
    fear: "두려움",
    trust: "신뢰",
    faith: "믿음",
    praise: "찬양",
    prayer: "기도",
    sacrifice: "제사",
    offering: "예물",
    altar: "제단",
    temple: "성전",
    tent: "장막",
    tabernacle: "성막",
    priest: "제사장",
    prophet: "선지자",
    people: "백성",
    nation: "민족",
    tribe: "지파",
    assembly: "회중",
    congregation: "회중",
    inheritance: "기업",
    portion: "몫",
    possession: "소유",
    covenant: "언약",
    testimony: "증거",
    remembrance: "기념",
    memorial: "기념",
    sign: "표징",
    wonder: "기사",
    miracle: "이적",
    vision: "환상",
    dream: "꿈",
    sleep: "잠",
    night: "밤",
    day: "날",
    morning: "아침",
    evening: "저녁",
    year: "해",
    month: "달",
    week: "주",
    time: "때",
    forever: "영원",
    eternity: "영원",
    beginning: "시작",
    end: "끝",
    east: "동",
    west: "서",
    north: "북",
    south: "남",
    water: "물",
    waters: "물들",
    sea: "바다",
    earth: "땅",
    land: "땅",
    heaven: "하늘",
    heavens: "하늘들",
    sun: "해",
    moon: "달",
    star: "별",
    stars: "별들",
    cloud: "구름",
    wind: "바람",
    spirit: "영",
    breath: "호흡",
    soul: "영혼",
    heart: "마음",
    hand: "손",
    right: "오른편",
    left: "왼편",
    eye: "눈",
    ear: "귀",
    mouth: "입",
    tongue: "혀",
    foot: "발",
    head: "머리",
    face: "얼굴",
    blood: "피",
    flesh: "육체",
    bone: "뼈",
    man: "사람",
    woman: "여자",
    child: "아이",
    children: "자녀",
    infant: "유아",
    virgin: "처녀",
    widow: "과부",
    orphan: "고아",
    stranger: "나그네",
    foreigner: "이방인",
    enemy: "원수",
    friend: "친구",
    companion: "동무",
    neighbor: "이웃",
    shepherd: "목자",
    sheep: "양",
    lamb: "어린 양",
    goat: "염소",
    ox: "소",
    bull: "수소",
    cow: "암소",
    horse: "말",
    donkey: "나귀",
    ass: "나귀",
    camel: "낙타",
    dog: "개",
    lion: "사자",
    bear: "곰",
    wolf: "늑대",
    bird: "새",
    dove: "비둘기",
    eagle: "독수리",
    fish: "물고기",
    serpent: "뱀",
    snake: "뱀",
    worm: "벌레",
    tree: "나무",
    forest: "숲",
    field: "밭",
    garden: "동산",
    seed: "씨",
    grain: "곡식",
    wheat: "밀",
    barley: "보리",
    wine: "포도주",
    oil: "기름",
    milk: "젖",
    honey: "꿀",
    salt: "소금",
    bread: "빵",
    meat: "고기",
    food: "음식",
    hunger: "배고픔",
    thirst: "목마름",
    nakedness: "벌거벗음",
    clothing: "옷",
    garment: "옷",
    robe: "겉옷",
    crown: "면류관",
    throne: "보좌",
    scepter: "홀",
    sword: "칼",
    spear: "창",
    bow: "활",
    arrow: "화살",
    shield: "방패",
    armor: "갑옷",
    war: "전쟁",
    battle: "싸움",
    victory: "승리",
    defeat: "패배",
    captivity: "포로",
    exile: "사로잡힘",
    deliverance: "구출",
    redemption: "구속",
    redeemer: "구속자",
    savior: "구원자",
    saviour: "구원자",
    refuge: "피난처",
    shelter: "은신처",
    shadow: "그늘",
    darkness: "어둠",
    brightness: "광채",
    glory: "영광",
    honor: "존귀",
    honour: "존귀",
    shame: "수치",
    reproach: "모욕",
    silence: "잠잠",
    voice: "소리",
    word: "말씀",
    speech: "말",
    name: "이름",
    number: "수",
    measure: "측량",
    weight: "무게",
    work: "일",
    labor: "수고",
    labour: "수고",
    rest: "안식",
    sleep: "잠",
    waking: "깨어 있음",
    remembrance: "기념",
    forgetfulness: "잊음",
    understanding: "명철",
    counsel: "모략",
    work: "일",
    shadow: "그늘",
    protection: "보호",
    affliction: "고난",
    exultation: "환희",
    grace: "은혜",
    fly: "파리",
    fortune: "운",
    covenant: "언약",
    hermon: "헤르몬",
    village: "마을",
    multitude: "무리",
    breaches: "터진 곳",
    "palm tree": "종려나무",
    palm: "종려",
    well: "우물",
    mistress: "여주인",
    possessor: "소유자",
    destroyer: "멸하는 자",
    known: "아신",
    created: "창조하신",
    red: "붉음",
    hail: "우박",
    earthy: "흙의",
    brutish: "짐승 같은",
    domineering: "지배하는",
    offensiveness: "거슬림",
    searcher: "찾는 자",
    wasteful: "낭비하는",
    peeling: "벗겨짐",
    cypress: "잣나무",
    sorrow: "슬픔",
    grief: "근심",
    weeping: "울음",
    tear: "눈물",
    tears: "눈물",
    laughter: "웃음",
    song: "노래",
    affliction: "고난",
    trouble: "환난",
    comfort: "위로",
    healing: "고침",
    building: "세움",
    destruction: "멸망",
    presence: "임재",
    absence: "부재",
    peace: "평화",
    war: "전쟁",
    failure: "실패",
    loving: "사랑",
    friend: "친구",
    enemy: "원수",
    stranger: "나그네",
    foreigner: "이방인",
    slave: "노예",
    master: "주인",
    father: "아버지",
    mother: "어머니",
    brother: "형제",
    sister: "자매",
    husband: "남편",
    wife: "아내",
    widow: "과부",
    orphan: "고아",
    virgin: "처녀",
    hero: "영웅",
    kindness: "인자",
    emptying: "비움",
    wasting: "황폐",
    holes: "구멍들",
    knee: "무릎",
    wickedness: "악",
    cheerful: "즐거운",
    fragrance: "향기",
    fragrant: "향기로운",
    firm: "견고한",
    pit: "구덩이",
    cisterns: "웅덩이들",
    cistern: "웅덩이",
    hillock: "작은 언덕",
    hilly: "언덕진",
    hilliness: "언덕짐",
    rising: "일어남",
    cutting: "자름",
    cleft: "갈라진 틈",
    fortunate: "행운의",
    stout: "튼튼한",
    feller: "베는 자",
    warrior: "용사",
    desolation: "황폐",
    warlike: "호전적인",
    justice: "공의",
    majesty: "위엄",
    wealth: "부",
    worshipper: "예배자",
    craggy: "험한",
    spot: "자리",
    meadow: "초원",
    dwelling: "거처",
    springs: "샘들",
    given: "주신",
    hidden: "숨은",
    favored: "은혜 입은",
    favor: "은혜",
    delivered: "건져 냄",
    whiteness: "희움",
    seen: "본",
    hot: "뜨거운",
    knowing: "앎",
    contend: "다툼",
    liberal: "후한",
    pleasure: "기쁨",
    splendor: "광채",
    strengthened: "강하게 된",
    brotherly: "형제 같은",
    female: "여성",
    fertile: "비옥한",
    station: "자리",
    ruin: "폐허",
    bitter: "쓴",
    quiet: "고요한",
    strong: "강한",
    fountain: "샘",
    made: "만든",
    egyptian: "애굽의",
    will: "뜻",
    form: "형태",
    heap: "무더기",
    unity: "하나됨",
    high: "높은",
    open: "열린",
    two: "둘",
    seat: "자리",
    hasty: "성급한",
    him: "그를",
    one: "하나",
    be: "됨",
    become: "됨",
    great: "큰",
    known: "아신",
    created: "창조하신",
    fire: "불",
    perhaps: "",
    probably: "",
    meaning: "뜻",
    sense: "의미",
    compare: "",
    origin: "기원",
    derivation: "유래",
    article: "관사",
    mistressship: "여주인",
    ...EXTRA_NAME_ATOMS,
  };
  if (map[s]) return map[s];
  // 두·세 단어
  const parts = s.split(/\s+/).filter((p) => p && map[p] !== "");
  if (parts.length === 2 && map[parts[0]] && map[parts[1]]) {
    return `${map[parts[0]]} ${map[parts[1]]}`;
  }
  if (parts.length === 3 && map[parts[0]] && map[parts[1]] && map[parts[2]]) {
    return `${map[parts[0]]} ${map[parts[1]]} ${map[parts[2]]}`;
  }
  // 단일 토큰만 남은 경우
  if (parts.length === 1 && map[parts[0]]) return map[parts[0]];
  // 단어별 부분 번역 (최소 절반 이상 번역되면 채택)
  if (parts.length >= 2 && parts.length <= 5) {
    const kos = parts.map((p) => map[p] || "");
    const hit = kos.filter(Boolean).length;
    if (hit >= Math.ceil(parts.length / 2) && hit >= 1) {
      return parts.map((p, i) => kos[i] || `「${p}」`).join(" ");
    }
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
