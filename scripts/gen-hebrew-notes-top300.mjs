/**
 * 빈도순 keyword-notes 보강 (300개씩).
 * Strong/BDB PD 참고하되 문장은 ~해요 말투로 새로 씀. 외부 API·타 사전 문장 복사 금지.
 *
 *   node scripts/gen-hebrew-notes-top300.mjs           # 다음 미작성 300
 *   node scripts/gen-hebrew-notes-top300.mjs --limit=300
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
  "H4480a",
  "H5921a",
]);

/** 손수 품질 — 핵심·샘플 */
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
      "H1961 「되다·있다」와 이어진 이름으로, Strong은 ‘스스로 계신 분·영원하신 분’이라고 풀어요.",
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

function argNum(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) ? n : fallback;
}

function isProper(j, kr, properSet) {
  if (properSet.has(j.strong)) return true;
  if (kr?.nameType === "person" || kr?.nameType === "place") return true;
  if (/고유명사/.test(j.posKo || "")) return true;
  return false;
}

function isParticle(j, kr) {
  if (PARTICLE.has(j.strong)) return true;
  const pos = j.posKo || "";
  if (/전치사|접속사|부정|감탄|관계|목적격|지시|의문/.test(pos)) return true;
  if (/대명사/.test(pos) && !isProper(j, kr, new Set())) return true;
  return false;
}

function krvSnippet(book, ch, gloss) {
  const p = path.join(KRV, book, String(ch), "korean.json");
  if (!fs.existsSync(p)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const verses = j.verses?.krv || [];
    const needle = String(gloss || "")
      .replace(/[~\(\)…]/g, "")
      .replace(/하다$/u, "")
      .slice(0, 2);
    for (const v of verses.slice(0, 50)) {
      const t = v.t || v.text || "";
      if (needle && needle.length >= 1 && t.includes(needle)) {
        const short = t.length > 36 ? t.slice(0, 36) + "…" : t;
        return { n: v.n, t: short };
      }
    }
    const v0 = verses[0];
    if (v0) {
      const t = v0.t || v0.text || "";
      return { n: v0.n, t: t.length > 36 ? t.slice(0, 36) + "…" : t };
    }
  } catch {
    /* ignore */
  }
  return null;
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

function etymSentence(strong, meta, rootGloss) {
  if (meta?.sourceText?.includes("primitive root")) {
    return "히브리어 원시 어근에서 온 말이에요. 비슷한 뿌리 단어들과 뜻이 맞닿아 있어요.";
  }
  if (meta?.rootStrong && rootGloss) {
    return `어원적으로 ${meta.rootStrong} 「${rootGloss}」와 이어져 있어요. 그 기본 느낌이 이 말에도 남아 있어요.`;
  }
  if (meta?.rootStrong) {
    return `Strong 표기에 따르면 ${meta.rootStrong}에서 파생된 말이에요.`;
  }
  return "구약 히브리어에서 자주 쓰이는 기본 어휘예요.";
}

function defContent(gloss, meanings, pos, bookKo, ref) {
  const g = String(gloss || meanings?.[0] || "이 말").replace(/^~/g, "");
  const alt =
    (meanings || []).filter((m) => m && m !== g).slice(0, 2).join(", ") || "";
  const posHint = /동사/.test(pos)
    ? "동사로"
    : /형용사/.test(pos)
      ? "형용사로"
      : "명사·표현으로";
  let s1 = `「${g}」라는 뜻이에요.`;
  if (alt) s1 = `기본 뜻은 「${g}」예요. 문맥에 따라 ${alt}로도 읽혀요.`;
  const s2 = `구약에서 ${posHint} 자주 쓰이며, 이야기의 흐름을 잡는 데 도움이 되는 말이에요.`;
  const s3 = ref
    ? `개역한글 ${bookKo} ${ref.n}절에는 「${ref.t}」처럼 나와요.`
    : `개역한글에서도 같은 뉘앙스로 자주 번역돼요.`;
  return `${s1} ${s2} ${s3}`;
}

function defParticle(gloss, meanings, pos, bookKo, ref) {
  const g = String(gloss || meanings?.[0] || "이 표지").replace(/^~/g, "");
  const role = /목적격/.test(pos)
    ? "목적격 표지"
    : /관계/.test(pos)
      ? "관계사"
      : /부정/.test(pos)
        ? "부정어"
        : /접속/.test(pos)
          ? "접속사"
          : /전치/.test(pos)
            ? "전치사"
            : /대명/.test(pos)
              ? "대명사"
              : /감탄|지시|의문/.test(pos)
                ? pos
                : "불변화사";
  const s1 = `${role} 「${g}」로 쓰여요. 문장 안에서 관계·방향·부정·강조를 짧게 표시해 주는 말이에요.`;
  const s2 = ref
    ? `개역한글 ${bookKo} ${ref.n}절 「${ref.t}」 같은 자리에서 그 쓰임을 확인할 수 있어요.`
    : `번역에서는 우리말 조사·접속 표현으로 녹아드는 경우가 많아요.`;
  return `${s1} ${s2}`;
}

function defProper(gloss, nameMeaning, nameType, bookKo, ref) {
  const name = String(gloss || "").replace(/^~/g, "") || "이 이름";
  const who =
    nameType === "place"
      ? `지명 「${name}」이에요. 개역한글 표기로 어디서 이야기되는지 짚어 주는 고유명사예요.`
      : `인명 「${name}」이에요. 개역한글 표기로 누구인지 가리키는 고유명사예요.`;
  const nm = nameMeaning
    ? `이름 뜻은 「${nameMeaning}」 쪽으로 읽혀요.`
    : "";
  const s3 = ref
    ? `개역한글 ${bookKo} ${ref.n}절에는 「${ref.t}」처럼 나와요.`
    : `본문에 이 표기가 나타날 때만 고유명사로 치환해요.`;
  return [who, nm, s3].filter(Boolean).join(" ");
}

function deriveNameMeaning(meta, rootGloss, kr) {
  if (kr?.nameMeaning) return String(kr.nameMeaning).trim();
  // 영어 Strong 뜻은 nameMeaning에 넣지 않음 — 한국어 어근 gloss만
  void meta;
  return rootGloss || "";
}

function syncLexiconEntry(strong, note) {
  const p = path.join(LEX, `${strong}.json`);
  if (!fs.existsSync(p)) return false;
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    j.defKo = note.defKo || j.defKo || "";
    j.etymKo = note.etymKo || j.etymKo || "";
    j.usageKo = note.usageKo || j.usageKo || "";
    if (note.nameMeaning) j.nameMeaning = note.nameMeaning;
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
    return true;
  } catch {
    return false;
  }
}

function main() {
  const limit = argNum("limit", 300);
  const rawNotes = JSON.parse(fs.readFileSync(NOTES, "utf8"));
  const properSet = new Set(Object.keys(rawNotes.properNames || {}));
  const metaMap = loadStrongMeta();

  const rows = [];
  for (const f of fs.readdirSync(LEX).filter((x) => /^H\d+\.json$/.test(x))) {
    rows.push(JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8")));
  }
  rows.sort((a, b) => (b.countOT || 0) - (a.countOT || 0));
  const corpus = rows.filter((j) => (j.countOT || 0) > 0);
  const totalWords = corpus.reduce((a, b) => a + (b.countOT || 0), 0);

  const missing = corpus.filter(
    (j) => !String(rawNotes[j.strong]?.defKo || "").trim(),
  );
  const batch = missing.slice(0, limit);

  let written = 0;
  let properN = 0;
  let particleN = 0;
  let contentN = 0;
  const batchWords = batch.reduce((a, b) => a + (b.countOT || 0), 0);

  for (const j of batch) {
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
    const ref = krvSnippet(book, 1, gloss);
    const prev = rawNotes[strong] || {};
    const hand = HAND[strong];
    const proper = isProper(j, kr, properSet);
    const particle = !proper && isParticle(j, kr);

    let nameMeaning = hand?.nameMeaning || prev.nameMeaning || "";
    if (proper && !nameMeaning) {
      nameMeaning = deriveNameMeaning(meta, rootGloss, kr) || "";
    }

    let defKo;
    let etymKo;
    let usageKo;
    if (hand) {
      defKo = hand.defKo;
      etymKo = hand.etymKo;
      usageKo = hand.usageKo;
      if (hand.nameMeaning) nameMeaning = hand.nameMeaning;
    } else if (proper) {
      properN += 1;
      defKo = defProper(
        gloss,
        nameMeaning,
        kr.nameType || (/place|지명/i.test(j.posKo || "") ? "place" : "person"),
        bookKo,
        ref,
      );
      etymKo = etymSentence(strong, meta, rootGloss);
      usageKo = gloss || nameMeaning || "";
    } else if (particle) {
      particleN += 1;
      defKo = defParticle(gloss, meanings, j.posKo || "", bookKo, ref);
      etymKo = etymSentence(strong, meta, rootGloss);
      usageKo = usageFromMeanings(gloss, meanings);
      nameMeaning = "";
    } else {
      contentN += 1;
      defKo = defContent(gloss, meanings, j.posKo || "", bookKo, ref);
      etymKo = etymSentence(strong, meta, rootGloss);
      usageKo = usageFromMeanings(gloss, meanings);
      nameMeaning = "";
    }

    const next = {
      ...prev,
      defKo: prev.defKo || defKo,
      etymKo: prev.etymKo || prev.rootNote || etymKo,
      usageKo: prev.usageKo || usageKo,
    };
    if (proper && nameMeaning) next.nameMeaning = prev.nameMeaning || nameMeaning;
    else if (!proper && next.nameMeaning && !hand?.nameMeaning) delete next.nameMeaning;
    rawNotes[strong] = next;
    syncLexiconEntry(strong, next);
    written += 1;
  }

  // HAND 재적용(이미 있어도 갱신 허용 — H2490 문구 수정 등)
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

  const noteKeys = Object.keys(rawNotes).filter((k) => /^H\d/.test(k));
  const withDef = noteKeys.filter((k) => String(rawNotes[k]?.defKo || "").trim());
  const withDefWords = corpus
    .filter((j) => String(rawNotes[j.strong]?.defKo || "").trim())
    .reduce((a, b) => a + (b.countOT || 0), 0);
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

  const report = {
    batchSize: written,
    batchWords,
    batchCoveragePct: +((100 * batchWords) / totalWords).toFixed(2),
    breakdown: { content: contentN, proper: properN, particle: particleN },
    cumulativeNotesWithDefKo: withDef.length,
    cumulativeWordsCovered: withDefWords,
    cumulativeWordPct: +((100 * withDefWords) / totalWords).toFixed(2),
    corpusStrongs: corpus.length,
    remainingStrongsWithoutDefKo: emptyLex,
    totalWords,
    sampleBatch: batch.slice(0, 12).map((j) => j.strong),
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}

main();
