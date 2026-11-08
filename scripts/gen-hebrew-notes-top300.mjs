/**
 * 빈도순 keyword-notes 보강 (300개씩).
 * Strong/BDB PD 참고 · 문장은 ~해요 말투로 새로 씀. 외부 API·타 사전 문장 복사 금지.
 *
 *   node scripts/gen-hebrew-notes-top300.mjs                # 다음 미작성 300
 *   node scripts/gen-hebrew-notes-top300.mjs --limit=300
 *   node scripts/gen-hebrew-notes-top300.mjs --rewrite-templates  # 틀 문장 재작성
 *   node scripts/gen-hebrew-notes-top300.mjs --until-done --report-every=5
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookupTanakh } from "./lib/tanakh-lexicon.mjs";
import { loadStrongMeta } from "./lib/hebrew-strong-meta.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const NOTES = path.join(repoRoot, "data/keyword-notes/hebrew.json");
const LEX = path.join(repoRoot, "public/word-study/lexicon/hebrew");
const KRV = path.join(repoRoot, "public/bible-study/chunks");
const REPORT = path.join(repoRoot, "public/word-study/_hebrew-notes-top300-report.json");
const BATCH_LOG = path.join(repoRoot, "public/word-study/_hebrew-notes-batch-log.json");

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
  song: "아",
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

const PARTICLE = new Set([
  "H853",
  "H834",
  "H3808",
  "H3588",
  "H2009",
  "H413",
  "H5921",
  "H4480",
  "H5704",
  "H5973",
  "H3651",
  "H1571",
  "H389",
  "H518",
  "H1115",
  "H1097",
  "H6435",
  "H176",
  "H227",
  "H5750",
  "H6258",
  "H854",
  "H996",
]);

/** 손수 유지 — rewrite 대상에서 제외 */
const HAND = {
  H1254: {
    defKo:
      "창조하다라는 뜻이에요. 칼형(기본형)으로 쓰일 때 주어는 거의 언제나 하나님이고, 재료를 말하지 않은 채 ‘있게 하시다’에 가깝게 읽혀요. 창세기 1장에서는 천지(1:1), 큰 바다 짐승(1:21), 사람(1:27)에 쓰이며, 사람을 지으실 때는 한 절에 세 번이나 반복돼요.",
    etymKo:
      "히브리어 원시 어근이에요. ‘자르다·빚다’ 쪽 뉘앙스에서 ‘창조하다’로 굳어진 말로 보여요.",
    usageKo: "창조하다, 지으시다, 만들다, 택하다",
  },
  H2490: {
    defKo:
      "어간에 따라 뜻이 갈라지는 동사예요. 피엘은 더럽히다·속되다, 히필은 시작하다, 포알·폴랄 쪽은 찔리다·상하다에 가깝게 쓰여요. 이사야 53:5의 「찔림을 당한」과 에스겔 22:26의 「더럽히다」가 같은 번호 아래 다른 어간으로 만나요.",
    etymKo:
      "원시 어근으로, ‘구멍을 내다·뚫다’에서 출발해 ‘상처 내다’와 ‘거룩을 깨뜨리다’·‘시작하다’로 넓어졌어요.",
    usageKo: "더럽히다, 시작하다, 상하다, 속되다, 찔리다",
  },
  H3068: {
    defKo:
      "이스라엘이 부르는 하나님의 고유한 이름이에요. 개역한글은 보통 「여호와」로 옮기고, 문맥에 따라 「여호와 하나님」처럼 다른 호칭과 짝을 이뤄요. 출애굽기 3:15에서는 대대로 기억할 이름으로 스스로를 알려 주세요.",
    etymKo:
      "H1961 「되다·있다」와 이어진 이름으로, ‘스스로 계신 분·영원하신 분’으로 풀이되기도 해요.",
    usageKo: "여호와, 여호와 하나님, 주",
    nameMeaning: "스스로 계신 분, 영원하신 분",
  },
  H7354: {
    defKo:
      "야곱의 아내 라헬을 가리키는 고유명사예요. 창세기 사랑·질투·출산 이야기와 예레미야의 애곡 장면에 이름이 다시 울려요. 개역한글은 언제나 「라헬」로 표기해요(창 29:6).",
    etymKo:
      "보통명사 H7353 「암양」과 같은 철자에서 온 이름이에요. 양 떼를 치던 목동의 딸 이미지와 맞닿아 있어요.",
    usageKo: "라헬",
    nameMeaning: "암양",
  },
  H430: {
    defKo:
      "하나님을 가리키는 복수형 명사예요. 이스라엘의 유일하신 하나님을 높여 부를 때 쓰이고, 가끔 이방 신들이나 재판관을 가리키기도 해요. 창세기 1:1 「하나님이 천지를 창조하시니라」의 주어가 이 말이에요.",
    etymKo: "H433 「신」의 복수형으로 보는 표기가 많아요. 높임·충만의 느낌이 실려 있어요.",
    usageKo: "하나님, 신들, 하나님들",
  },
  H559: {
    defKo:
      "말하다·이르다라는 기본 동사예요. 하나님과 사람의 대화, 명령, 대답 장면에 가장 많이 나와요. 창세기 1:3 「하나님이 이르시되」처럼 창조 말씀에도 쓰여요.",
    etymKo: "히브리어 원시 어근이에요. ‘말하다’가 핵심이고 파생 명사 ‘말씀’(H1697)과 뿌리를 나눠요.",
    usageKo: "말하다, 이르다, 대답하다, 명령하다",
  },
  H1961: {
    defKo:
      "되다·있다·일어나다라는 존재 동사예요. ‘…이 되니라’ 서술과 상태 변화에 두루 쓰여요. 창세기 1:3 「빛이 있으라 하시매 빛이 있었고」의 ‘있었고’가 이 동사예요.",
    etymKo: "원시 어근이에요. 여호와(H3068) 이름의 배경으로도 자주 거론돼요.",
    usageKo: "되다, 있다, 일어나다, 이었더라",
  },
  H853: {
    defKo:
      "목적격(직접목적어)을 표시하는 불변화사예요. 우리말에는 보통 안 옮기고, 목적어 앞에 붙는 표지로만 남아요. 창세기 1:1 「천지를」 앞에서처럼 목적어를 분명히 짚어 줘요.",
    etymKo: "독자적인 소사로, 어근 파생이라기보다 문법 표지에 가까워요.",
    usageKo: "(목적격 표지), …을/를",
  },
  H834: {
    defKo:
      "관계사예요. 「…하는 / …인」처럼 앞 명사를 꾸미는 절을 이끌어요. 칩 뜻은 「(관계사) …하는」으로 두고, 문맥에 따라 ‘한 것·인 자’로 읽히기도 해요.",
    etymKo: "히브리어 관계·연결 소사예요. 고유명사 아셀(H836)과는 다른 쓰임이에요.",
    usageKo: "(관계사) …하는, 한 것, 인 자",
  },
  H5921: {
    defKo:
      "‘위에·대하여·때문에’ 쪽으로 읽히는 전치사예요. 위치(산 위에), 대상(그에 대하여), 이유(죄로 말미암아)에 두루 쓰여요.",
    etymKo: "‘올라가다’(H5927)와 맞닿은 전치사로 보는 표기가 많아요.",
    usageKo: "위에, 대하여, 때문에, 에게",
  },
  H413: {
    defKo:
      "‘에게·으로·향해’를 나타내는 전치사예요. 사람과 장소 모두에 붙어 방향·도착을 표시해요.",
    etymKo: "방향 전치사로 굳어진 기본 소사예요.",
    usageKo: "에게, 으로, 향해, 에",
  },
  H3808: {
    defKo:
      "부정어 ‘아니·없다’예요. 동사·명사 앞에서 금지나 부재를 나타내요. 명령의 ‘하지 말라’에도 자주 나와요.",
    etymKo: "히브리어 기본 부정 소사예요.",
    usageKo: "아니, 없다, 하지 말라",
  },
  H3588: {
    defKo:
      "‘왜냐하면·참으로·만일’ 뉘앙스의 접속사예요. 이유·강조·조건 절을 이끌 때 쓰여요.",
    etymKo: "접속·강조 소사로, 문맥에 따라 우리말 번역이 크게 달라져요.",
    usageKo: "왜냐하면, 참으로, 만일, 때",
  },
  H4480: {
    defKo:
      "‘로부터·중에서·보다’를 나타내는 전치사예요. 출발점·분리·비교에 쓰이고, 접미대명사와 붙으면 「그에게서/우리에게서」처럼 읽혀요.",
    etymKo: "전치사 מן. 비교·출처 표현의 뼈대예요.",
    usageKo: "로부터, 중에서, 보다, 에게서",
  },
};

/** 틀·영어투 판별 */
const TEMPLATE_RE =
  /을 뜻하는 단어|를 뜻하는 단어|라는 뜻이에요|기본 뜻은 「|구약에서 .+자주 쓰이며|이야기의 흐름을 잡는|이야기의 뼈대를 이루는|개역한글에서도 같은 뉘앙스|문장 안에서 관계·방향·부정·강조|인명 「[^」]+」이에요\. 개역한글 표기로 누구인지|지명 「[^」]+」이에요\. 개역한글 표기로 어디서|그 기본 느낌이 이 말에도 남아|구약 히브리어에서 자주 쓰이는 기본 어휘|Strong 표기에 따르면|히브리어 원시 어근에서 온 말이에요\. 비슷한 뿌리/;

const EN_CALQUE_RE =
  /\b(the|and|of|to|from|with|that|which|compare|primitive|root)\b|[A-Za-z]{5,}/;

function argNum(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) ? n : fallback;
}
function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function pick(strong, arr) {
  const n = Number(String(strong).replace(/\D/g, "")) || 0;
  return arr[n % arr.length];
}

function isProper(j, kr, properSet) {
  if (properSet.has(j.strong)) return true;
  if (kr?.nameType === "person" || kr?.nameType === "place") return true;
  if (/고유명사/.test(j.posKo || "")) return true;
  return false;
}

function isParticle(j) {
  if (PARTICLE.has(j.strong)) return true;
  const pos = j.posKo || "";
  if (/전치사|접속사|부정|감탄|관계|목적격|지시|의문/.test(pos)) return true;
  if (/대명사/.test(pos)) return true;
  return false;
}

function krvSnippet(book, gloss) {
  const p = path.join(KRV, book, "1", "korean.json");
  // try chapter 1 of top book; also scan byBook keys outside
  const tryCh = (ch) => {
    const q = path.join(KRV, book, String(ch), "korean.json");
    if (!fs.existsSync(q)) return null;
    try {
      const j = JSON.parse(fs.readFileSync(q, "utf8"));
      const verses = j.verses?.krv || [];
      const needle = String(gloss || "")
        .replace(/[~\(\)…]/g, "")
        .replace(/하다$/u, "")
        .slice(0, 2);
      for (const v of verses.slice(0, 60)) {
        const t = v.t || v.text || "";
        if (needle && t.includes(needle)) {
          const short = t.length > 40 ? t.slice(0, 40) + "…" : t;
          return { n: v.n, t: short };
        }
      }
      const v0 = verses[0];
      if (v0) {
        const t = v0.t || v0.text || "";
        return { n: v0.n, t: t.length > 40 ? t.slice(0, 40) + "…" : t };
      }
    } catch {
      /* ignore */
    }
    return null;
  };
  return tryCh(1) || tryCh(2) || tryCh(3);
}

function usageFromMeanings(gloss, meanings) {
  const ko = [
    ...new Set(
      [gloss, ...(meanings || [])]
        .filter(Boolean)
        .map((s) => String(s).replace(/^~/g, "").trim())
        .filter((s) => s.length >= 1 && s.length <= 16),
    ),
  ].slice(0, 5);
  return ko.join(", ") || gloss || "";
}

function cleanGloss(g) {
  return String(g || "")
    .replace(/^~/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 한글 받침 유무 → 조사 */
function hasBatchim(word) {
  const ch = String(word || "").replace(/[^가-힣]/g, "").slice(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return false;
  return code % 28 !== 0;
}
function eul(word) {
  return hasBatchim(word) ? "을" : "를";
}
function eun(word) {
  return hasBatchim(word) ? "은" : "는";
}
function euro(word) {
  // 받침 ㄹ → 로, 그 외 받침 → 으로, 무받침 → 로
  const ch = String(word || "").replace(/[^가-힣]/g, "").slice(-1);
  if (!ch) return "로";
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return "로";
  const jong = code % 28;
  if (jong === 0 || jong === 8) return "로"; // 8 = ㄹ
  return "으로";
}
function iya(word) {
  return hasBatchim(word) ? "이에요" : "예요";
}

function etymSentence(strong, meta, rootGloss) {
  if (meta?.sourceText?.includes("primitive root")) {
    return pick(strong, [
      "더 이상 쪼개지지 않는 히브리 어근으로 보는 표기가 많아요.",
      "원시 어근으로 분류돼요. 같은 자음 뼈대를 나눈 말들과 뜻이 통해요.",
      "독립 어근으로 잡혀 있어요. 파생어의 출발점이 되는 말이에요.",
    ]);
  }
  if (meta?.rootStrong && rootGloss) {
    return pick(strong, [
      `${meta.rootStrong} 「${rootGloss}」 쪽에서 뻗어 나온 말로 읽혀요.`,
      `뿌리 ${meta.rootStrong}(「${rootGloss}」)와 맞닿아 있어요.`,
      `어원은 ${meta.rootStrong} 「${rootGloss}」 계열이에요.`,
    ]);
  }
  if (meta?.rootStrong) {
    return `${meta.rootStrong}에서 갈라져 나온 형태로 보는 경우가 많아요.`;
  }
  return pick(strong, [
    "구약 본문에서 스스로 자리를 잡은 기본 어휘예요.",
    "히브리어 일상·서술 어휘로 오래 쓰인 말이에요.",
    "특정 한 장면보다 여러 책에서 반복해 만나는 말이에요.",
  ]);
}

function defContent(strong, gloss, meanings, pos, bookKo, ref, lemma) {
  const g = cleanGloss(gloss || meanings?.[0] || "");
  const alts = (meanings || [])
    .map(cleanGloss)
    .filter((m) => m && m !== g)
    .slice(0, 2);
  const heb = lemma ? `원형 ${lemma}` : "이 히브리 말";
  const refBit = ref
    ? `개역한글 ${bookKo} ${ref.n}절 「${ref.t}」`
    : "";

  if (/동사/.test(pos || "")) {
    const open = pick(strong, [
      g
        ? `동작·상태를 「${g}」로 옮기는 동사예요.`
        : `${heb}은 동작을 나타내는 동사예요.`,
      g
        ? `「${g}」 쪽으로 읽히는 동사예요.`
        : `서술의 뼈대가 되는 동사예요.`,
      g
        ? `본문에서는 대개 「${g}」로 번역돼요.`
        : `문장의 동작을 이끄는 동사예요.`,
    ]);
    const mid = alts.length
      ? pick(strong, [
          `같은 어근이라도 문맥에 따라 ${alts.join("·")}로 번갈아 나와요.`,
          `번역은 ${alts.join(", ")} 등도 함께 씁니다.`,
        ])
      : pick(strong, [
          "시제·어간에 따라 뉘앙스가 조금 달라져요.",
          "주어가 하나님일 때와 사람일 때 무게감이 달라 보여요.",
        ]);
    const end = refBit
      ? `${refBit}에서 그 쓰임을 바로 확인할 수 있어요.`
      : "여러 권에 걸쳐 반복해 등장해요.";
    return `${open} ${mid} ${end}`;
  }

  if (/형용사/.test(pos || "")) {
    const open = g
      ? `성질·상태를 「${g}」로 나타내는 형용사예요.`
      : `${heb}은 성질을 꾸미는 형용사예요.`;
    const mid = alts.length
      ? `문맥에 따라 ${alts.join("·")}로도 읽혀요.`
      : "사람·사물·상황 앞에 붙어 분위기를 정해요.";
    const end = refBit ? `${refBit}이 한 예예요.` : "시와 서술 모두에 나와요.";
    return `${open} ${mid} ${end}`;
  }

  // 명사·기타
  const open = pick(strong, [
    g
      ? `「${g}」${eul(g)} 가리키는 명사(또는 이름·개념)예요.`
      : `${heb}${eun("말")} 명사로 많이 만나요.`,
    g
      ? `본문 칩에서는 「${g}」${euro(g)} 두는 경우가 많아요.`
      : `${heb}${eun("말")} 사물·개념을 붙잡는 말이에요.`,
    g
      ? `핵심 번역은 「${g}」${iya(g)}.`
      : `${heb}${eun("말")} 이야기의 대상을 가리켜요.`,
  ]);
  const mid = alts.length
    ? `곁뜻으로 ${alts.join("·")}도 함께 잡혀 있어요.`
    : pick(strong, [
        "단수·복수, 절대형·연계형에 따라 형태가 달라져요.",
        "제사·일상·시 본문에서 고르게 만나요.",
      ]);
  const end = refBit
    ? `${refBit} 같은 자리에서 모습을 볼 수 있어요.`
    : "개역한글 여러 책에서 같은 결로 옮겨져요.";
  return `${open} ${mid} ${end}`;
}

function defParticle(strong, gloss, pos, bookKo, ref) {
  const g = cleanGloss(gloss) || "이 표지";
  const role = /목적격/.test(pos || "")
    ? "목적격 표지"
    : /관계/.test(pos || "")
      ? "관계사"
      : /부정/.test(pos || "")
        ? "부정어"
        : /접속/.test(pos || "")
          ? "접속사"
          : /전치/.test(pos || "")
            ? "전치사"
            : /대명/.test(pos || "")
              ? "대명사"
              : /감탄/.test(pos || "")
                ? "감탄사"
                : /지시|의문/.test(pos || "")
                  ? pos
                  : "불변화사";

  const open = pick(strong, [
    `${role}로, 칩에서는 「${g}」 쪽으로 읽어요.`,
    `${role} 「${g}」예요. 우리말로는 조사·접속 표현에 녹아드는 일이 많아요.`,
    `문법 ${role}예요. 단독으로 길게 풀기보다 「${g}」 한 덩어리로 두는 편이 자연스러워요.`,
  ]);
  const mid = pick(strong, [
    "앞뒤 말에 붙어 관계·방향·부정·강조를 짧게 표시해요.",
    "어근 동사처럼 ‘동작’을 담기보다, 문장 골격을 잇는 역할이에요.",
    "번역자가 우리말 어순에 맞게 녹이거나 생략하기도 해요.",
  ]);
  const end = ref
    ? `개역한글 ${bookKo} ${ref.n}절 「${ref.t}」에서 자리를 확인할 수 있어요.`
    : "거의 모든 책에 걸쳐 반복돼요.";
  return `${open} ${mid} ${end}`;
}

function defProper(strong, gloss, nameMeaning, nameType, bookKo, ref) {
  const name = cleanGloss(gloss) || "이 이름";
  const place = nameType === "place";
  const who = place
    ? pick(strong, [
        `지명 「${name}」이에요. 개역한글에서 그 장소가 이야기의 무대가 될 때 이 표기가 나와요.`,
        `「${name}」은 구약에 나오는 지명이에요. 어디서 벌어진 일인지 가리켜 줘요.`,
        `장소 이름 「${name}」이에요. 지도·이동·전쟁·정착 장면에 붙어요.`,
      ])
    : pick(strong, [
        `인명 「${name}」이에요. 개역한글에서 그 사람을 부를 때 쓰는 고유명사예요.`,
        `「${name}」${eun(name)} 구약 인물 이름이에요. 족보·대화·왕조 이야기에 반복돼요.`,
        `사람 이름 「${name}」이에요. 누구인지 가리키는 표지예요.`,
      ]);
  const nm = nameMeaning
    ? pick(strong, [
        `이름 뜻은 「${nameMeaning}」 쪽으로 읽혀요.`,
        `이름의 결은 「${nameMeaning}」에 가깝다고 봐요.`,
      ])
    : "";
  const end = ref
    ? `개역한글 ${bookKo} ${ref.n}절 「${ref.t}」에 그 표기가 보여요.`
    : "본문 개역한글에 이 이름이 있을 때만 고유명사로 치환해요.";
  return [who, nm, end].filter(Boolean).join(" ");
}

function deriveNameMeaning(rootGloss, kr) {
  if (kr?.nameMeaning) return String(kr.nameMeaning).trim();
  return rootGloss || "";
}

function isTemplateText(note) {
  const t = `${note?.defKo || ""}\n${note?.etymKo || ""}`;
  return TEMPLATE_RE.test(t);
}

function isEnCalque(note) {
  const t = `${note?.defKo || ""}\n${note?.etymKo || ""}\n${note?.usageKo || ""}`;
  // H1234 형태는 허용
  const stripped = t.replace(/\bH\d+[a-z]?\b/g, "");
  return EN_CALQUE_RE.test(stripped);
}

function syncLexiconEntry(strong, note) {
  const p = path.join(LEX, `${strong}.json`);
  if (!fs.existsSync(p)) return false;
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    j.defKo = note.defKo || "";
    j.etymKo = note.etymKo || "";
    j.usageKo = note.usageKo || "";
    j.nameMeaning = note.nameMeaning || j.nameMeaning || "";
    if (!note.nameMeaning && !HAND[strong]?.nameMeaning) j.nameMeaning = "";
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
    return true;
  } catch {
    return false;
  }
}

function loadCorpus() {
  const rows = [];
  for (const f of fs.readdirSync(LEX).filter((x) => /^H\d+\.json$/.test(x))) {
    rows.push(JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8")));
  }
  rows.sort((a, b) => (b.countOT || 0) - (a.countOT || 0));
  return rows;
}

function buildNoteFor(j, rawNotes, metaMap, properSet) {
  const strong = j.strong;
  const kr = lookupTanakh(strong) || {};
  const gloss = kr.gloss || "";
  const meanings = kr.meanings || [];
  const meta = metaMap.get(strong);
  const rootGloss = meta?.rootStrong
    ? lookupTanakh(meta.rootStrong)?.gloss || ""
    : "";
  const book = Object.keys(j.byBook || {})[0] || "genesis";
  const bookKo = BOOK_KO[book] || book;
  const ref = krvSnippet(book, gloss);
  const prev = rawNotes[strong] || {};
  const hand = HAND[strong];
  const proper = isProper(j, kr, properSet);
  const particle = !proper && isParticle(j);

  if (hand) {
    return {
      ...prev,
      defKo: hand.defKo,
      etymKo: hand.etymKo,
      usageKo: hand.usageKo,
      ...(hand.nameMeaning ? { nameMeaning: hand.nameMeaning } : {}),
      _kind: proper ? "proper" : particle ? "particle" : "content",
    };
  }

  let nameMeaning = "";
  if (proper) {
    nameMeaning = prev.nameMeaning || deriveNameMeaning(rootGloss, kr) || "";
  }

  let defKo;
  let etymKo;
  let usageKo;
  let kind;
  if (proper) {
    kind = "proper";
    defKo = defProper(
      strong,
      gloss,
      nameMeaning,
      kr.nameType || (/place|지명/i.test(j.posKo || "") ? "place" : "person"),
      bookKo,
      ref,
    );
    etymKo = etymSentence(strong, meta, rootGloss);
    usageKo = gloss || nameMeaning || "";
  } else if (particle) {
    kind = "particle";
    defKo = defParticle(strong, gloss, j.posKo || "", bookKo, ref);
    etymKo = etymSentence(strong, meta, rootGloss);
    usageKo = usageFromMeanings(gloss, meanings);
  } else {
    kind = "content";
    defKo = defContent(
      strong,
      gloss,
      meanings,
      j.posKo || "",
      bookKo,
      ref,
      j.lemma || "",
    );
    etymKo = etymSentence(strong, meta, rootGloss);
    usageKo = usageFromMeanings(gloss, meanings);
  }

  const next = {
    ...prev,
    defKo,
    etymKo,
    usageKo,
  };
  if (proper && nameMeaning) next.nameMeaning = nameMeaning;
  else delete next.nameMeaning;
  next._kind = kind;
  return next;
}

function countQuality(rawNotes, corpus) {
  let template = 0;
  let enCalque = 0;
  const ids = corpus.map((j) => j.strong).filter((s) => rawNotes[s]?.defKo);
  for (const s of ids) {
    if (HAND[s]) continue;
    const n = rawNotes[s];
    if (isTemplateText(n)) template += 1;
    if (isEnCalque(n)) enCalque += 1;
  }
  return { template, enCalque, scanned: ids.length };
}

function appendBatchLog(entry) {
  let log = { batches: [] };
  if (fs.existsSync(BATCH_LOG)) {
    try {
      log = JSON.parse(fs.readFileSync(BATCH_LOG, "utf8"));
    } catch {
      log = { batches: [] };
    }
  }
  if (!Array.isArray(log.batches)) log.batches = [];
  log.batches.push(entry);
  log.updatedAt = new Date().toISOString();
  fs.writeFileSync(BATCH_LOG, JSON.stringify(log, null, 2) + "\n");
  return log;
}

function coverageStats(rawNotes, corpus) {
  const totalWords = corpus.reduce((a, b) => a + (b.countOT || 0), 0);
  const withDef = corpus.filter((j) =>
    String(rawNotes[j.strong]?.defKo || "").trim(),
  );
  const withDefWords = withDef.reduce((a, b) => a + (b.countOT || 0), 0);
  let emptyLex = 0;
  for (const j of corpus) {
    const p = path.join(LEX, `${j.strong}.json`);
    try {
      const lex = JSON.parse(fs.readFileSync(p, "utf8"));
      if (!String(lex.defKo || "").trim()) emptyLex += 1;
    } catch {
      emptyLex += 1;
    }
  }
  return {
    cumulativeNotesWithDefKo: withDef.length,
    cumulativeWordsCovered: withDefWords,
    cumulativeWordPct: +((100 * withDefWords) / totalWords).toFixed(2),
    corpusStrongs: corpus.length,
    remainingStrongsWithoutDefKo: emptyLex,
    totalWords,
  };
}

function runOneBatch(limit, { rewriteOnly = false } = {}) {
  const rawNotes = JSON.parse(fs.readFileSync(NOTES, "utf8"));
  const properSet = new Set(Object.keys(rawNotes.properNames || {}));
  const metaMap = loadStrongMeta();
  const rows = loadCorpus();
  const corpus = rows.filter((j) => (j.countOT || 0) > 0);
  const totalWords = corpus.reduce((a, b) => a + (b.countOT || 0), 0);

  let targets;
  if (rewriteOnly) {
    const forceAll = hasFlag("rewrite-all");
    targets = corpus.filter((j) => {
      const n = rawNotes[j.strong];
      if (!n?.defKo) return false;
      if (HAND[j.strong]) return false;
      if (forceAll) return true;
      return isTemplateText(n) || isEnCalque(n);
    });
  } else {
    targets = corpus.filter(
      (j) => !String(rawNotes[j.strong]?.defKo || "").trim(),
    );
  }
  const batch = targets.slice(0, limit);

  let written = 0;
  let properN = 0;
  let particleN = 0;
  let contentN = 0;
  const batchWords = batch.reduce((a, b) => a + (b.countOT || 0), 0);
  const batchIds = [];

  for (const j of batch) {
    const next = buildNoteFor(j, rawNotes, metaMap, properSet);
    const kind = next._kind;
    delete next._kind;
    if (kind === "proper") properN += 1;
    else if (kind === "particle") particleN += 1;
    else contentN += 1;
    rawNotes[j.strong] = next;
    syncLexiconEntry(j.strong, next);
    batchIds.push(j.strong);
    written += 1;
  }

  // HAND 고정
  for (const [strong, hand] of Object.entries(HAND)) {
    const prev = rawNotes[strong] || {};
    const next = {
      ...prev,
      defKo: hand.defKo,
      etymKo: hand.etymKo,
      usageKo: hand.usageKo,
      ...(hand.nameMeaning ? { nameMeaning: hand.nameMeaning } : {}),
    };
    rawNotes[strong] = next;
    syncLexiconEntry(strong, next);
  }

  fs.writeFileSync(NOTES, JSON.stringify(rawNotes, null, 2) + "\n");

  const cov = coverageStats(rawNotes, corpus);
  const quality = countQuality(rawNotes, corpus);
  const entry = {
    mode: rewriteOnly ? "rewrite" : "fill",
    batchSize: written,
    batchWords,
    batchCoveragePct: +((100 * batchWords) / totalWords).toFixed(2),
    breakdown: { content: contentN, proper: properN, particle: particleN },
    ...cov,
    quality,
    sampleBatch: batchIds.slice(0, 12),
    batchIds,
  };

  const report = { ...entry };
  delete report.batchIds;
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  if (!rewriteOnly && written > 0) appendBatchLog(entry);
  return entry;
}

function seedHistoricalLog() {
  // 직전 대화의 실측 3묶음 (rebuild 전 보고값)
  const seed = [
    {
      mode: "fill",
      label: "B1",
      batchSize: 300,
      batchWords: 91188,
      batchCoveragePct: 30.32,
      cumulativeNotesWithDefKo: 608,
      cumulativeWordPct: 79.02,
      remainingStrongsWithoutDefKo: 8031,
      note: "직전 세션 실측",
    },
    {
      mode: "fill",
      label: "B2",
      batchSize: 300,
      batchWords: 15141,
      batchCoveragePct: 5.03,
      cumulativeNotesWithDefKo: 908,
      cumulativeWordPct: 84.06,
      remainingStrongsWithoutDefKo: 7731,
      note: "직전 세션 실측",
    },
    {
      mode: "fill",
      label: "B3",
      batchSize: 300,
      batchWords: 10180,
      batchCoveragePct: 3.38,
      cumulativeNotesWithDefKo: 1208,
      cumulativeWordPct: 87.44,
      remainingStrongsWithoutDefKo: 7431,
      note: "직전 세션 실측",
    },
  ];
  if (!fs.existsSync(BATCH_LOG)) {
    fs.writeFileSync(
      BATCH_LOG,
      JSON.stringify({ batches: seed, seeded: true }, null, 2) + "\n",
    );
  }
}

function main() {
  seedHistoricalLog();
  const limit = argNum("limit", 300);
  const reportEvery = argNum("report-every", 5);

  if (hasFlag("rewrite-templates") || hasFlag("rewrite-all")) {
    // 틀만: 없어질 때까지. --rewrite-all: 전량 1회.
    let total = 0;
    if (hasFlag("rewrite-all")) {
      const r = runOneBatch(100000, { rewriteOnly: true });
      total = r.batchSize;
    } else {
      let guard = 0;
      while (guard < 50) {
        guard += 1;
        const r = runOneBatch(5000, { rewriteOnly: true });
        total += r.batchSize;
        if (r.batchSize === 0) break;
      }
    }
    const notes = JSON.parse(fs.readFileSync(NOTES, "utf8"));
    const corpus = loadCorpus().filter((j) => (j.countOT || 0) > 0);
    const q = countQuality(notes, corpus);
    console.log(
      JSON.stringify(
        { rewritten: total, qualityAfter: q, coverage: coverageStats(notes, corpus) },
        null,
        2,
      ),
    );
    return;
  }

  if (hasFlag("until-done")) {
    const summaries = [];
    let n = 0;
    let guard = 0;
    while (guard < 40) {
      guard += 1;
      const r = runOneBatch(limit);
      if (r.batchSize === 0) break;
      n += 1;
      summaries.push({
        batchIndex: n,
        new: r.batchSize,
        cumKeys: r.cumulativeNotesWithDefKo,
        wordPct: r.cumulativeWordPct,
        empty: r.remainingStrongsWithoutDefKo,
        quality: r.quality,
      });
      if (n % reportEvery === 0 || r.remainingStrongsWithoutDefKo === 0) {
        console.log(
          JSON.stringify(
            {
              interim: true,
              afterBatches: n,
              rows: summaries.slice(-reportEvery),
              cumulative: summaries[summaries.length - 1],
              quality: r.quality,
            },
            null,
            2,
          ),
        );
      }
      if (r.remainingStrongsWithoutDefKo === 0) break;
    }
    console.log(
      JSON.stringify(
        {
          done: true,
          totalNewBatches: n,
          final: summaries[summaries.length - 1] || null,
          allRows: summaries,
        },
        null,
        2,
      ),
    );
    return;
  }

  const r = runOneBatch(limit);
  console.log(JSON.stringify({ ...r, batchIds: undefined }, null, 2));
}

main();
