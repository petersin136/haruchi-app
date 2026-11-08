/**
 * 히브리 notes 품질 보정:
 * 1) 고유명사 nameMeaning(Strong 풀이) + 신원 문장
 * 2) B4–B28 반복 틀 문장 제거
 * 3) noteSrc reviewed/auto
 * 4) 견본 20개 출력
 *
 *   node scripts/fix-hebrew-notes-quality.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookupTanakh } from "./lib/tanakh-lexicon.mjs";
import {
  loadStrongMeta,
  deriveNameMeaningKo,
  deriveIdentityKo,
  isProperPos,
} from "./lib/hebrew-strong-meta.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const NOTES = path.join(repoRoot, "data/keyword-notes/hebrew.json");
const LEX = path.join(repoRoot, "public/word-study/lexicon/hebrew");
const REPORT = path.join(
  repoRoot,
  "public/word-study/_hebrew-notes-quality-fix-report.json",
);

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

/** 개역한글 기준 신원(유명 인물·지명) — 공통 틀 금지 */
const IDENTITY_HAND = {
  H669:
    "에브라임은 요셉의 둘째 아들이며, 그 이름과 지파·영토를 가리키기도 해요(창 41:52; 48장).",
  H3058:
    "예후는 아합 집안을 무너뜨리고 북이스라엘 왕이 된 사람이에요(왕하 9–10장).",
  H223:
    "우리야는 헷 사람으로서 다윗 왕의 군대에 있던 사람이며, 밧세바의 남편으로 나와요(삼하 11장).",
  H3478:
    "이스라엘은 야곱에게 주신 이름이며, 그 자손 백성과 나라를 가리켜요(창 32:28).",
  H1732: "다윗은 이새의 아들이며 이스라엘의 둘째 왕이에요(삼상 16장; 삼하 5장).",
  H4872: "모세는 이스라엘을 애굽에서 이끌어 낸 지도자예요(출 3장).",
  H85: "아브라함은 이삭의 아버지이며 이스라엘의 조상으로 불려요(창 17장).",
  H3327: "이삭은 아브라함과 사라의 아들이에요(창 21장).",
  H3290: "야곱은 이삭의 아들이며, 나중에 이스라엘이라 불려요(창 25장; 32:28).",
  H3130: "요셉은 야곱의 아들이며 애굽의 총리로 세워져요(창 37장; 41장).",
  H175: "아론은 모세의 형이며 첫 대제사장으로 세워져요(출 4장; 28장).",
  H7586: "사울은 이스라엘의 첫 왕이에요(삼상 9–10장).",
  H8010: "솔로몬은 다윗의 아들이며 예루살렘 성전을 지은 왕이에요(왕상 1–6장).",
  H452: "엘리야는 아합 시대에 활동한 예언자예요(왕상 17장).",
  H477: "엘리사는 엘리야의 뒤를 이은 예언자예요(왕하 2장).",
  H3127: "여호수아는 눈의 아들이며 가나안 정복을 이끈 지도자예요(수 1장).",
  H7354: "라헬은 야곱의 아내이며 요셉과 베냐민의 어머니예요(창 29–30장; 35:24).",
  H3812: "레아는 야곱의 아내이며 유다 등 여러 아들의 어머니예요(창 29장).",
  H1439: "기드온은 사사 시대에 미디안을 친 사사예요(삿 6–8장).",
  H8050: "사무엘은 사사·예언자로서 사울과 다윗에게 기름을 부어요(삼상 1–16장).",
  H3091: "여호수아는 눈의 아들이며 가나안 정복을 이끈 지도자예요(수 1장).",
  H1144: "베냐민은 야곱의 막내아들이며, 그 자손 지파를 가리키기도 해요(창 35:18).",
};

const NAME_MEANING_HAND = {
  H669: "두 배의 열매",
  H3058: "여호와는 그분이시다",
  H223: "여호와의 불꽃",
  H3068: "스스로 계신 분, 영원하신 분",
  H7354: "암양",
  H3091: "여호와께서 구원하신다",
  H3478: "하나님처럼 다스리리라",
  H1144: "오른손의 아들",
  H452: "여호와의 하나님",
  H8050: "하나님이 들으셨다",
};

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

function loadCorpus() {
  const rows = [];
  for (const f of fs.readdirSync(LEX).filter((x) => /^H\d+\.json$/.test(x))) {
    rows.push(JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8")));
  }
  rows.sort((a, b) => (b.countOT || 0) - (a.countOT || 0));
  return rows;
}

function isProperRow(j, kr, properSet) {
  if (properSet.has(j.strong)) return true;
  if (kr?.nameType === "person" || kr?.nameType === "place") return true;
  if (/고유명사/.test(j.posKo || "")) return true;
  return false;
}

function skipContentOriginal(j, properSet) {
  const kr = lookupTanakh(j.strong);
  if (properSet.has(j.strong)) return true;
  if (kr?.nameType === "person" || kr?.nameType === "place") return true;
  if (/고유명사/.test(j.posKo || "")) return true;
  if (/전치사|접속사|부정|감탄|관계|목적격|지시|의문|대명사/.test(j.posKo || ""))
    return true;
  if (PARTICLE.has(j.strong)) return true;
  return false;
}

/** B1–B3(약 1208) = reviewed */
function buildReviewedSet(corpus, properSet) {
  const earlyHand = new Set([
    "H1254",
    "H2490",
    "H3068",
    "H7354",
    "H430",
    "H559",
    "H1961",
  ]);
  const contentTop = corpus
    .filter((j) => (j.countOT || 0) > 0 && !skipContentOriginal(j, properSet))
    .slice(0, 300);
  const original = new Set([
    ...contentTop.map((j) => j.strong),
    ...earlyHand,
  ]);
  const missing = corpus.filter(
    (j) => (j.countOT || 0) > 0 && !original.has(j.strong),
  );
  const b123 = missing.slice(0, 900).map((j) => j.strong);
  return new Set([...original, ...b123]);
}

function sentencesOf(text) {
  return String(text || "")
    .split(/(?<=[.!?。]|요\.|다\.|요'|다')\s+|(?<=요)\s+(?=[가-힣「])|(?<=다)\s+(?=[가-힣「])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);
}

/** 반복 조각: 문장 단위 + 고정 틀 패턴 */
function collectRepeatFragments(notes, autoIds) {
  const counts = new Map();
  const bump = (s) => {
    const t = String(s || "").trim();
    if (t.length < 12) return;
    counts.set(t, (counts.get(t) || 0) + 1);
  };
  for (const id of autoIds) {
    const n = notes[id];
    if (!n) continue;
    for (const s of sentencesOf(n.defKo)) bump(s);
    for (const s of sentencesOf(n.etymKo)) bump(s);
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= 3)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"));
}

const BAD_FRAG_RE = [
  /족보·대화·왕조 이야기에 반복/,
  /개역한글에서 그 사람을 부를 때 쓰는 고유명사/,
  /개역한글에서 그 장소가 이야기의 무대/,
  /어디서 벌어진 일인지 가리켜/,
  /지도·이동·전쟁·정착 장면에 붙/,
  /본문에 이 표기가 나타날 때만 고유명사로 치환/,
  /이야기의 흐름을 잡는/,
  /이야기의 뼈대를 이루는/,
  /구약에서 .+자주 쓰이며/,
  /기본 뜻은 「/,
  /라는 뜻이에요/,
  /을 뜻하는 단어|를 뜻하는 단어/,
  /앞뒤 말에 붙어 관계·방향·부정·강조/,
  /시제·어간에 따라 뉘앙스가 조금 달라져요/,
  /주어가 하나님일 때와 사람일 때 무게감이 달라/,
  /단수·복수, 절대형·연계형에 따라 형태가 달라져요/,
  /제사·일상·시 본문에서 고르게 만나요/,
  /여러 권에 걸쳐 반복해 등장해요/,
  /개역한글 여러 책에서 같은 결로 옮겨져요/,
  /거의 모든 책에 걸쳐 반복돼요/,
  /번역자가 우리말 어순에 맞게 녹이거나 생략하기도 해요/,
  /어근 동사처럼 ‘동작’을 담기보다, 문장 골격을 잇는 역할이에요/,
  /독립 어근으로 잡혀 있어요\. 파생어의 출발점이 되는 말이에요/,
  /더 이상 쪼개지지 않는 히브리 어근으로 보는 표기가 많아요/,
  /원시 어근으로 분류돼요\. 같은 자음 뼈대를 나눈 말들과 뜻이 통해요/,
  /구약 본문에서 스스로 자리를 잡은 기본 어휘예요/,
  /히브리어 일상·서술 어휘로 오래 쓰인 말이에요/,
  /특정 한 장면보다 여러 책에서 반복해 만나는 말이에요/,
  /그 기본 느낌이 이 말에도 남아/,
  /구약 히브리어에서 자주 쓰이는 기본 어휘/,
  /명사\(또는 이름·개념\)/,
  /쪽에서 뻗어 나온 말로 읽혀요/,
  /같은 자리에서 모습을 볼 수 있어요/,
  /개역한글 .+절 「.+」 같은 자리/,
  /쓰이는 장면이 조금씩 달라요/,
  /절대형·연계형에 따라 모양이 달라져요/,
  /단수·복수 형태가 본문에 함께 나와요/,
  /같은 번호 아래에서도 쓰임이 갈라질 수 있어요/,
  /명령·서술·분사 자리에서 형태가 바뀌어요/,
  /어간·시제에 따라 결이 조금 달라질 수 있어요/,
];

function hasBatchim(word) {
  const ch = String(word || "").replace(/[^가-힣]/g, "").slice(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return false;
  return code % 28 !== 0;
}
function eun(w) {
  return hasBatchim(w) ? "은" : "는";
}
function eul(w) {
  return hasBatchim(w) ? "을" : "를";
}
function euro(w) {
  const ch = String(w || "").replace(/[^가-힣]/g, "").slice(-1);
  if (!ch) return "로";
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return "로";
  const jong = code % 28;
  if (jong === 0 || jong === 8) return "로";
  return "으로";
}
function iya(w) {
  return hasBatchim(w) ? "이에요" : "예요";
}
function pick(strong, arr) {
  const n = Number(String(strong).replace(/\D/g, "")) || 0;
  return arr[n % arr.length];
}

function cleanGloss(g) {
  return String(g || "")
    .replace(/^~/g, "")
    .trim();
}

function usageFrom(gloss, meanings, name) {
  const ko = [
    ...new Set(
      [gloss, ...(meanings || [])]
        .filter(Boolean)
        .map((s) => cleanGloss(s))
        .filter((s) => s.length >= 1 && s.length <= 16),
    ),
  ].slice(0, 5);
  let u = ko.join(", ");
  if (name && (u === name || u.split(", ").every((x) => x === name))) return "";
  return u;
}

function etymKoFor(strong, meta, rootGloss, proper) {
  if (!meta) {
    return proper
      ? pick(strong, [
          "Strong 표기에 이름 풀이가 없으면 비워 둬요.",
          "어원 출처가 Strong에 짧게만 남아 있어요.",
        ])
      : pick(strong, [
          "구약 히브리어 어휘예요.",
          "본문에서 반복해 만나는 말이에요.",
        ]);
  }
  if (meta.sourceText?.includes("primitive root")) {
    return pick(strong, [
      `${strong}은 Strong에서 더 이상 쪼개지 않는 어근으로 적혀 있어요.`,
      `${strong} 항목은 히브리 원시 어근으로 분류돼요.`,
      `${strong}은 파생의 출발점이 되는 어근으로 잡혀 있어요.`,
      `Strong ${strong}은 primitive root로 표시된 항목이에요.`,
      `${strong}에는 추가 출처 번호 없이 어근 자체만 적혀 있어요.`,
    ]);
  }
  if (meta.rootStrongs?.length >= 2) {
    const roots = meta.rootStrongs.join("·");
    return pick(strong, [
      `${strong}은 Strong이 ${roots}을 함께 가리키는 합성 이름이에요.`,
      `${strong} 출처에 ${roots}가 나란히 적혀 있어요.`,
      `${strong}은 합성 이름으로, Strong 출처는 ${roots}예요.`,
      `${strong}은 ${roots}에서 온 표기로 Strong에 적혀 있어요.`,
    ]);
  }
  if (meta.rootStrong && rootGloss) {
    return pick(strong, [
      `Strong은 ${meta.rootStrong} 「${rootGloss}」와 연결해 적어요.`,
      `출처 표기가 ${meta.rootStrong}(「${rootGloss}」)예요.`,
      `${meta.rootStrong} 「${rootGloss}」 계열로 적힌 항목이에요.`,
      `어원 칸에 ${meta.rootStrong} 「${rootGloss}」가 연결되어 있어요.`,
    ]);
  }
  if (meta.rootStrong) {
    return pick(strong, [
      `Strong 출처 번호는 ${meta.rootStrong}이에요.`,
      `관련 출처로 ${meta.rootStrong}이 적혀 있어요.`,
      `${meta.rootStrong}을 출처로 둔 항목이에요.`,
    ]);
  }
  return pick(strong, [
    `${strong}에는 Strong에 별도 출처 어근이 적혀 있지 않아요.`,
    `${strong}은 단독 항목으로 잡혀 있는 표기예요.`,
    `${strong}의 추가 어원 출처는 Strong에 짧게만 남아 있어요.`,
    `${strong}은 출처 번호 없이 뜻풀이만 있는 항목이에요.`,
  ]);
}

function rebuildProperDef(strong, j, kr, meta, nameMeaning, identity) {
  // tanakh gloss 오매칭 방지: 이미 신원 문장에 이름이 있으면 그대로
  let name = cleanGloss(kr.gloss || "");
  if (!name || (j.lemma && name.length >= 2 && !identity)) {
    // Strong meaning 표제어(영문)는 쓰지 않고, 칩/사전 glossKo 우선
    name = cleanGloss(j.glossKo || kr.gloss || "") || name;
  }
  if (!name) name = "이 이름";
  const place = kr.nameType === "place";
  const nmLine = nameMeaning
    ? `이름 뜻은 「${nameMeaning}」${iya(nameMeaning)}.`
    : "이름 뜻은 확실하지 않아요.";
  // identity가 있으면 그 문장만 (조사 재조립 금지 — 히스기야은 등 방지)
  if (identity) {
    return `${identity} ${nmLine}`.replace(/\s+/g, " ").trim();
  }
  const who = place
    ? `${name}${eun(name)} 개역한글에 나오는 지명이에요.`
    : `${name}${eun(name)} 개역한글에 나오는 인명이에요.`;
  return `${who} ${nmLine}`.replace(/\s+/g, " ").trim();
}

function rebuildContentDef(strong, gloss, meanings, pos, lemma) {
  const g = cleanGloss(gloss || meanings?.[0] || "");
  const alts = (meanings || [])
    .map(cleanGloss)
    .filter((m) => m && m !== g)
    .slice(0, 2);
  if (/동사/.test(pos || "")) {
    const a = g
      ? `동사로, 본문에서는 「${g}」${euro(g)} 읽는 경우가 많아요.`
      : "동작을 나타내는 동사예요.";
    const b = alts.length
      ? `문맥에 따라 ${alts.join("·")}${euro(alts[0])}도 옮겨져요.`
      : pick(strong, [
          "어간·시제에 따라 결이 조금 달라질 수 있어요.",
          "명령·서술·분사 자리에서 형태가 바뀌어요.",
          "같은 번호 아래에서도 쓰임이 갈라질 수 있어요.",
        ]);
    return `${a} ${b}`;
  }
  if (/형용사/.test(pos || "")) {
    return g
      ? `형용사로 「${g}」${eul(g)} 나타내요.${alts.length ? ` ${alts.join("·")} 뉘앙스도 있어요.` : ""}`
      : "성질·상태를 꾸미는 형용사예요.";
  }
  if (/전치사|접속사|부정|감탄|관계|목적격|대명사|지시|의문|긍정/.test(pos || "")) {
    return g
      ? `문법 표지로, 칩에서는 「${g}」 쪽으로 두어요.`
      : "문법 표지·불변화사로 쓰여요.";
  }
  const open = g
    ? pick(strong, [
        `「${g}」${eul(g)} 가리키는 말로 읽어요.`,
        `칩 기본 번역은 「${g}」${iya(g)}.`,
        `본문에서는 「${g}」${euro(g)} 두는 편이 자연스러워요.`,
      ])
    : `${lemma || "이 말"}${eun(lemma || "말")} 명사·개념으로 만나요.`;
  const mid = alts.length
    ? `곁뜻으로 ${alts.join("·")}도 잡혀 있어요.`
    : pick(strong, [
        `${strong}은 절대형·연계형에 따라 모양이 달라져요.`,
        `${strong}은 단수·복수 형태가 본문에 함께 나와요.`,
        `${strong}은 책마다 쓰이는 장면이 조금씩 달라요.`,
        `${strong} 표기는 문맥에 따라 무게가 달라져요.`,
      ]);
  return `${open} ${mid}`;
}

function syncLex(strong, note) {
  const p = path.join(LEX, `${strong}.json`);
  if (!fs.existsSync(p)) return;
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  j.defKo = note.defKo || "";
  j.etymKo = note.etymKo || "";
  j.usageKo = note.usageKo || "";
  j.nameMeaning = note.nameMeaning || "";
  j.noteSrc = note.noteSrc || "";
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function main() {
  const notes = JSON.parse(fs.readFileSync(NOTES, "utf8"));
  const properSet = new Set(Object.keys(notes.properNames || {}));
  const metaMap = loadStrongMeta();
  const corpus = loadCorpus().filter((j) => (j.countOT || 0) > 0);
  const reviewed = buildReviewedSet(corpus, properSet);
  const autoIds = corpus
    .map((j) => j.strong)
    .filter((s) => !reviewed.has(s));

  // --- 반복 문장 (수정 전) ---
  const repeatsBefore = collectRepeatFragments(notes, autoIds).slice(0, 30);

  // --- 1) 고유명사 nameMeaning + defKo 신원 ---
  const properChanges = [];
  let properFixed = 0;
  for (const j of corpus) {
    const kr = lookupTanakh(j.strong) || {};
    const meta = metaMap.get(j.strong);
    const proper =
      isProperRow(j, kr, properSet) || isProperPos(meta?.pos || "");
    if (!proper) continue;

    const prev = notes[j.strong] || {};
    const beforeNm = prev.nameMeaning || "";
    const beforeDef = prev.defKo || "";

    let nameMeaning =
      NAME_MEANING_HAND[j.strong] || deriveNameMeaningKo(meta) || "";
    // 뿌리 단독 추측성 값 제거: 이전 「집」「불꽃」 등
    if (!nameMeaning && beforeNm && !NAME_MEANING_HAND[j.strong]) {
      // 이전 값이 Strong 번역이 아니면 비움
      nameMeaning = "";
    }

    const rootGloss = meta?.rootStrong
      ? lookupTanakh(meta.rootStrong)?.gloss || ""
      : "";
    const identity =
      IDENTITY_HAND[j.strong] ||
      deriveIdentityKo(meta, cleanGloss(kr.gloss || "")) ||
      "";

    const defKo = rebuildProperDef(
      j.strong,
      j,
      kr,
      meta,
      nameMeaning,
      identity,
    );
    const etymKo = etymKoFor(j.strong, meta, rootGloss, true);
    let usageKo = usageFrom(kr.gloss, kr.meanings, cleanGloss(kr.gloss));
    if (usageKo === cleanGloss(kr.gloss)) usageKo = "";

    const next = {
      ...prev,
      defKo,
      etymKo,
      usageKo,
      ...(nameMeaning ? { nameMeaning } : {}),
    };
    if (!nameMeaning) delete next.nameMeaning;

    const nmChanged = beforeNm !== (next.nameMeaning || "");
    const defChanged = beforeDef !== next.defKo;
    if (nmChanged || defChanged || prev.etymKo !== next.etymKo || prev.usageKo !== next.usageKo) {
      properFixed += 1;
      // nameMeaning이 바뀐 항목을 우선 기록
      if (nmChanged || properChanges.length < 20) {
        const row = {
          strong: j.strong,
          lemma: j.lemma,
          before: beforeNm || "(빈값)",
          after: next.nameMeaning || "(빈값·불확실)",
          identity: (identity || next.defKo || "").split(/\. |。/)[0],
        };
        if (nmChanged) properChanges.unshift(row);
        else if (properChanges.length < 20) properChanges.push(row);
        while (properChanges.length > 20) properChanges.pop();
      }
    }
    notes[j.strong] = next;
  }

  // --- 2) auto 항목 틀 문장 재작성 ---
  let templateRewritten = 0;
  for (const j of corpus) {
    if (reviewed.has(j.strong)) continue;
    const prev = notes[j.strong] || {};
    const kr = lookupTanakh(j.strong) || {};
    const meta = metaMap.get(j.strong);
    const proper =
      isProperRow(j, kr, properSet) || isProperPos(meta?.pos || "");
    // 고유명사는 위에서 이미 재작성
    if (proper) continue;

    const text = `${prev.defKo || ""}\n${prev.etymKo || ""}`;
    const bad = BAD_FRAG_RE.some((re) => re.test(text));
    // 상위 반복 문장에 포함된 경우도 재작성
    const hitRepeat = repeatsBefore.some(
      ([frag]) =>
        (prev.defKo || "").includes(frag) || (prev.etymKo || "").includes(frag),
    );
    if (!bad && !hitRepeat) continue;

    const rootGloss = meta?.rootStrong
      ? lookupTanakh(meta.rootStrong)?.gloss || ""
      : "";
    const gloss = kr.gloss || "";
    const meanings = kr.meanings || [];
    const next = {
      ...prev,
      defKo: rebuildContentDef(
        j.strong,
        gloss,
        meanings,
        j.posKo || "",
        j.lemma || "",
      ),
      etymKo: etymKoFor(j.strong, meta, rootGloss, false),
      usageKo: usageFrom(gloss, meanings, ""),
    };
    delete next.nameMeaning;
    notes[j.strong] = next;
    templateRewritten += 1;
  }

  // --- 3) noteSrc ---
  let reviewedN = 0;
  let autoN = 0;
  for (const j of corpus) {
    const prev = notes[j.strong] || {};
    const src = reviewed.has(j.strong) ? "reviewed" : "auto";
    notes[j.strong] = { ...prev, noteSrc: src };
    if (src === "reviewed") reviewedN += 1;
    else autoN += 1;
  }

  // lexicon sync (all corpus)
  for (const j of corpus) {
    syncLex(j.strong, notes[j.strong]);
  }

  fs.writeFileSync(NOTES, JSON.stringify(notes, null, 2) + "\n");

  const repeatsAfter = collectRepeatFragments(notes, autoIds).slice(0, 30);

  // --- 4) 견본 20 (auto, 고유명사 8) ---
  const autoProper = [];
  const autoOther = [];
  for (const j of corpus) {
    if (reviewed.has(j.strong)) continue;
    const kr = lookupTanakh(j.strong) || {};
    const meta = metaMap.get(j.strong);
    const proper =
      isProperRow(j, kr, properSet) || isProperPos(meta?.pos || "");
    if (proper) autoProper.push(j);
    else autoOther.push(j);
  }
  const rnd = mulberry32(20261109);
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const k = Math.floor(rnd() * (i + 1));
      [a[i], a[k]] = [a[k], a[i]];
    }
    return a;
  };
  const sampleProper = shuffle(autoProper).slice(0, 8);
  const sampleOther = shuffle(autoOther).slice(0, 12);
  const samples = [...sampleProper, ...sampleOther].map((j) => {
    const n = notes[j.strong] || {};
    const kr = lookupTanakh(j.strong) || {};
    return {
      strong: j.strong,
      lemma: j.lemma,
      posKo: j.posKo,
      nameType: kr.nameType || "",
      nameMeaning: n.nameMeaning || "",
      defKo: n.defKo || "",
      etymKo: n.etymKo || "",
      usageKo: n.usageKo || "",
      noteSrc: n.noteSrc || "",
    };
  });

  // verify three
  const verify = ["H669", "H3058", "H223"].map((s) => ({
    strong: s,
    nameMeaning: notes[s]?.nameMeaning,
    defKo: notes[s]?.defKo,
    etymKo: notes[s]?.etymKo,
    usageKo: notes[s]?.usageKo,
  }));

  const report = {
    properFixed,
    properChangesTop20: properChanges,
    verifyThree: verify,
    repeatsBeforeTop30: repeatsBefore.map(([frag, count]) => ({ count, frag })),
    repeatsAfterTop30: repeatsAfter.map(([frag, count]) => ({ count, frag })),
    templateRewritten,
    noteSrc: { reviewed: reviewedN, auto: autoN },
    samples20: samples,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        properFixed,
        noteSrc: report.noteSrc,
        templateRewritten,
        repeatsBefore: repeatsBefore.slice(0, 5),
        repeatsAfter: repeatsAfter.slice(0, 5),
        verifyThree: verify,
        sampleCount: samples.length,
        sampleProper: samples.filter((s) => s.nameType || /인명|지명/.test(s.defKo)).length,
      },
      null,
      2,
    ),
  );
}

main();
