/**
 * 라운드3 보정: 이름뜻 복구 · 뜻 오매칭 · auto 짧은 사실 형식 · 칩 gloss 동기
 *   node scripts/fix-hebrew-notes-round3.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookupTanakh } from "./lib/tanakh-lexicon.mjs";
import {
  loadStrongMeta,
  deriveNameMeaningKo,
  isProperPos,
  firstSenseEn,
  translateNameGloss,
} from "./lib/hebrew-strong-meta.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const NOTES = path.join(root, "data/keyword-notes/hebrew.json");
const LEX = path.join(root, "public/word-study/lexicon/hebrew");
const KRV = path.join(root, "public/bible-study/chunks");
const OUT = path.join(root, "public/word-study");
const REPORT = path.join(OUT, "_hebrew-notes-round3-report.json");

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

const IDENTITY_HAND = {
  H669:
    "에브라임은 요셉의 둘째 아들이며, 그 이름과 지파·영토를 가리키기도 해요(창 41:52; 48장).",
  H3058:
    "예후는 아합 집안을 무너뜨리고 북이스라엘 왕이 된 사람이에요(왕하 9–10장).",
  H223:
    "우리야는 헷 사람으로서 다윗 왕의 군대에 있던 사람이며, 밧세바의 남편으로 나와요(삼하 11장).",
  H1732: "다윗은 이새의 아들이며 이스라엘의 둘째 왕이에요(삼상 16장; 삼하 5장).",
  H4872: "모세는 이스라엘을 애굽에서 이끌어 낸 지도자예요(출 3장).",
  H7205: "르우벤은 야곱의 맏아들이에요(창 29:32).",
  H53: "압살롬은 다윗의 아들이에요(삼하 3:3).",
  H256: "아합은 오므리의 아들이며 이스라엘 왕이에요(왕상 16:29).",
  H884: "브엘세바는 아브라함이 우물을 두고 맹세한 곳이에요(창 21:31).",
  H1008: "벧엘은 야곱이 돌 베개를 세우고 그 곳 이름을 부른 곳이에요(창 28:19).",
  H4363: "믹마스는 요나단이 블레셋 진을 친 곳이에요(삼상 14장).",
  H3478:
    "이스라엘은 야곱에게 주신 이름이며, 그 자손 백성과 나라를 가리켜요(창 32:28).",
  H7354: "라헬은 야곱의 아내이며 요셉과 베냐민의 어머니예요(창 29–30장).",
  H3068:
    "여호와는 이스라엘이 부르는 하나님의 이름이에요(출 3:15).",
  H3091: "여호수아는 눈의 아들이며 가나안 정복을 이끈 지도자예요(수 1장).",
  H1144: "베냐민은 야곱의 막내아들이며 그 자손 지파를 가리키기도 해요(창 35:18).",
  H452: "엘리야는 아합 시대에 활동한 예언자예요(왕상 17장).",
  H8050: "사무엘은 사사·예언자로서 사울과 다윗에게 기름을 부어요(삼상 1–16장).",
};

const NAME_HAND = {
  H1732: "사랑받는 자",
  H4872: "건져 냄",
  H7205: "보라 아들이다",
  H53: "평화의 아버지",
  H256: "아버지의 형제",
  H884: "맹세의 우물",
  H669: "두 배의 열매",
  H3058: "여호와는 그분이시다",
  H223: "여호와의 불꽃",
};

const BAD_AUTO =
  /두는 편이 자연스러워요|곁뜻으로 .+도 잡혀 있어요|칩 기본 번역은|읽는 경우가 많아요|옮기는 동사예요|이야기의 흐름|개역한글에 나오는 인명|개역한글에 나오는 지명|가나안\/팔레스타인에 있는 지명|족보·대화·왕조/;

function hasBatchim(word) {
  const ch = String(word || "").replace(/[^가-힣]/g, "").slice(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return false;
  return code % 28 !== 0;
}
function eulRo(word) {
  const ch = String(word || "").replace(/[^가-힣]/g, "").slice(-1);
  if (!ch) return "로";
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return "로";
  const jong = code % 28;
  if (jong === 0 || jong === 8) return "로";
  return "으로";
}
function particleEul(w) {
  return hasBatchim(w) ? "을" : "를";
}

function loadCorpus() {
  const rows = [];
  for (const f of fs.readdirSync(LEX).filter((x) => /^H\d+\.json$/.test(x))) {
    rows.push(JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8")));
  }
  rows.sort((a, b) => (b.countOT || 0) - (a.countOT || 0));
  return rows.filter((j) => (j.countOT || 0) > 0);
}

function krvVerse(book, ch, n) {
  const p = path.join(KRV, book, String(ch), "korean.json");
  if (!fs.existsSync(p)) return "";
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const v = (j.verses?.krv || []).find((x) => x.n === n);
    return v?.t || v?.text || "";
  } catch {
    return "";
  }
}

/** 전장 1회 스캔 → strong 첫 출현 인덱스 */
let _firstIndex = null;
function buildFirstIndex() {
  if (_firstIndex) return _firstIndex;
  _firstIndex = new Map();
  const books = fs.readdirSync(OUT).filter((d) => {
    const p = path.join(OUT, d);
    return fs.statSync(p).isDirectory() && !d.startsWith("_") && d !== "lexicon";
  });
  // 정경 대략 순서
  const order = Object.keys(BOOK_KO);
  books.sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  for (const book of books) {
    const dir = path.join(OUT, book);
    const files = fs
      .readdirSync(dir)
      .filter((f) => /^\d+\.json$/.test(f))
      .sort((a, b) => Number(a) - Number(b));
    for (const f of files) {
      const ch = Number(f.replace(".json", ""));
      let j;
      try {
        j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      } catch {
        continue;
      }
      for (const verse of j.verses || []) {
        for (const w of verse.words || []) {
          if (!w.strong || _firstIndex.has(w.strong)) continue;
          _firstIndex.set(w.strong, {
            book,
            ch,
            n: verse.n,
            bookKo: BOOK_KO[book] || book,
            glossKo: w.glossKo || "",
          });
        }
      }
    }
  }
  return _firstIndex;
}
function firstOccurrence(strong) {
  const idx = buildFirstIndex();
  const row = idx.get(strong);
  if (!row) return null;
  if (!row.krv) row.krv = krvVerse(row.book, row.ch, row.n);
  return row;
}

function findKrvExample(gloss, byBook) {
  const needle = String(gloss || "")
    .replace(/하다$/, "")
    .slice(0, 2);
  if (!needle) return null;
  const books = Object.keys(byBook || {});
  for (const book of books.slice(0, 8)) {
    for (let ch = 1; ch <= 5; ch++) {
      const p = path.join(KRV, book, String(ch), "korean.json");
      if (!fs.existsSync(p)) continue;
      try {
        const j = JSON.parse(fs.readFileSync(p, "utf8"));
        for (const v of j.verses?.krv || []) {
          const t = v.t || "";
          if (t.includes(needle) || (gloss && t.includes(String(gloss).slice(0, 3)))) {
            const short = t.length > 42 ? t.slice(0, 42) + "…" : t;
            return {
              bookKo: BOOK_KO[book] || book,
              n: v.n,
              t: short,
              word: gloss,
            };
          }
        }
      } catch {
        /* ignore */
      }
    }
  }
  // firstOccurrence gloss
  return null;
}

function isGentilic(meta, kr, lemma) {
  const mean = meta?.meaning || "";
  if (/\b(?:ite|ites)\b/i.test(mean) && /name of|an? [A-Z]/i.test(mean))
    return true;
  if (/출신|사람$/.test(kr?.gloss || "")) return true;
  if (/י$/.test(String(lemma || "").replace(/[\u0591-\u05C7]/g, "")) && /a [A-Z][a-z]+ite/i.test(mean))
    return true;
  if (/Tyrian|Moabite|Ammonite|Edomite|Hittite|inhabitants of/i.test(mean))
    return true;
  return false;
}

function translateContentEn(en) {
  const s = String(en || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  const first = s.split(/[;,]|i\.e\.|figuratively|literally|causatively/)[0].trim();
  const map = [
    [/hunter'?s? net|^a net\b|net \(as/, "그물"],
    [/\bnets?\b/, "그물"],
    [/snare|gin\b/, "올무"],
    [/execution|doom|death|to die|kill/, "죽음"],
    [/oven|furnace|fire-?pot|kiln/, "화로"],
    [/entire|perfect|without blemish|complete/, "온전함"],
    [/loving|beloved/, "사랑받는 자"],
    [/father/, "아버지"],
    [/mother/, "어머니"],
    [/son\b/, "아들"],
    [/king\b/, "왕"],
    [/house\b/, "집"],
    [/water/, "물"],
    [/earth|land/, "땅"],
    [/heaven|sky/, "하늘"],
    [/hand\b/, "손"],
    [/day\b/, "날"],
    [/word|speech/, "말씀"],
    [/god\b/, "하나님"],
    [/man\b|person/, "사람"],
    [/woman/, "여자"],
    [/city|town/, "성읍"],
    [/mountain/, "산"],
    [/river/, "강"],
    [/priest/, "제사장"],
    [/prophet/, "선지자"],
    [/servant/, "종"],
    [/horse/, "말"],
    [/bread/, "떡"],
    [/wine/, "포도주"],
    [/oil\b/, "기름"],
    [/blood/, "피"],
    [/sword/, "칼"],
    [/stone/, "돌"],
    [/tree|wood/, "나무"],
    [/fire\b/, "불"],
    [/light/, "빛"],
    [/dark/, "어둠"],
    [/peace/, "평안"],
    [/truth/, "진리"],
    [/grace|favour|favor/, "은혜"],
    [/anger|wrath/, "진노"],
    [/joy|glad/, "기쁨"],
    [/fear/, "두려움"],
    [/wisdom/, "지혜"],
    [/strength|might|power/, "힘"],
    [/holy/, "거룩"],
    [/sin\b|iniquity/, "죄"],
    [/sacrifice|offering/, "제물"],
    [/altar/, "제단"],
    [/temple|sanctuary/, "성소"],
    [/covenant/, "언약"],
    [/law\b|torah/, "율법"],
    [/bless/, "축복하다"],
    [/curse/, "저주하다"],
    [/create/, "창조하다"],
    [/make|do\b/, "하다"],
    [/give/, "주다"],
    [/take/, "취하다"],
    [/come|go\b/, "가다"],
    [/see\b|behold/, "보다"],
    [/hear/, "듣다"],
    [/speak|say\b/, "말하다"],
    [/know/, "알다"],
    [/love\b/, "사랑하다"],
    [/hate/, "미워하다"],
    [/kill|slay/, "죽이다"],
    [/live|alive/, "살다"],
    [/sit|dwell/, "앉다"],
    [/stand/, "서다"],
    [/rise|raise/, "일어나다"],
    [/fall/, "떨어지다"],
    [/open/, "열다"],
    [/close|shut/, "닫다"],
    [/send/, "보내다"],
    [/call/, "부르다"],
    [/eat/, "먹다"],
    [/drink/, "마시다"],
    [/write/, "쓰다"],
    [/read/, "읽다"],
    [/build/, "건축하다"],
    [/break/, "깨뜨리다"],
    [/keep|guard/, "지키다"],
    [/seek/, "찾다"],
    [/find/, "찾다"],
    [/return|turn/, "돌아오다"],
    [/judge/, "재판하다"],
    [/reign|rule/, "다스리다"],
    [/serve/, "섬기다"],
    [/worship/, "예배하다"],
    [/pray/, "기도하다"],
    [/save|deliver/, "구원하다"],
    [/redeem/, "속량하다"],
    [/forgive/, "용서하다"],
    [/trust/, "신뢰하다"],
    [/hope/, "소망"],
    [/wait/, "기다리다"],
  ];
  for (const [re, ko] of map) {
    if (re.test(first) || re.test(s)) return ko;
  }
  return "";
}

function primaryGloss(kr, note, lex) {
  const u = String(note?.usageKo || "")
    .split(/[,，]/)[0]
    ?.trim();
  return (
    (kr?.gloss && !/^~/.test(kr.gloss) ? kr.gloss.replace(/^~/, "") : "") ||
    u ||
    (lex?.defKo?.match(/뜻:\s*([^,\n]+)/)?.[1] || "").trim() ||
    ""
  );
}

function meaningsList(kr, expected, note) {
  const set = new Set();
  if (expected) set.add(expected);
  if (kr?.gloss) set.add(String(kr.gloss).replace(/^~/, ""));
  for (const m of kr?.meanings || []) set.add(String(m).replace(/^~/, ""));
  for (const m of String(note?.usageKo || "").split(/[,，]/)) {
    const t = m.trim();
    if (t) set.add(t);
  }
  return [...set].filter(Boolean).slice(0, 4);
}

function skeletonOf(text) {
  return String(text || "")
    .replace(/H\d+[a-z]?/g, "H")
    .replace(/[「」『』'\"“”]/g, "")
    .replace(/[가-힣]{2,}/g, "X")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}

function syncLex(strong, note, extra = {}) {
  const p = path.join(LEX, `${strong}.json`);
  if (!fs.existsSync(p)) return;
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  Object.assign(j, {
    defKo: note.defKo || "",
    etymKo: note.etymKo || "",
    usageKo: note.usageKo || "",
    nameMeaning: note.nameMeaning || "",
    noteSrc: note.noteSrc || j.noteSrc || "",
    ...extra,
  });
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
}

function patchChips(strong, newGloss, oldGlosses) {
  let n = 0;
  const books = fs.readdirSync(OUT).filter((d) => {
    const p = path.join(OUT, d);
    return fs.statSync(p).isDirectory() && !d.startsWith("_") && d !== "lexicon";
  });
  for (const book of books) {
    const dir = path.join(OUT, book);
    for (const f of fs.readdirSync(dir).filter((x) => /^\d+\.json$/.test(x))) {
      const fp = path.join(dir, f);
      let j;
      try {
        j = JSON.parse(fs.readFileSync(fp, "utf8"));
      } catch {
        continue;
      }
      let changed = false;
      for (const verse of j.verses || []) {
        for (const w of verse.words || []) {
          if (w.strong !== strong) continue;
          if (oldGlosses.has(w.glossKo) || w.glossKo !== newGloss) {
            if (oldGlosses.has(w.glossKo) || /오븐|온전함|가마|성숙/.test(w.glossKo || "")) {
              w.glossKo = newGloss;
              if (w.parts) {
                for (const part of w.parts) {
                  if (part.strong === strong) part.glossKo = newGloss;
                }
              }
              changed = true;
              n += 1;
            }
          }
        }
      }
      if (changed) fs.writeFileSync(fp, JSON.stringify(j, null, 2) + "\n");
    }
  }
  return n;
}

function buildIdentity(strong, j, kr, meta, name) {
  if (IDENTITY_HAND[strong]) return IDENTITY_HAND[strong];
  const first = firstOccurrence(strong);
  const gent = isGentilic(meta, kr, j.lemma);
  if (gent) {
    const g = kr.gloss || name;
    const place = String(meta?.meaning || "").match(
      /(?:of |from )?([A-Z][a-z]+)(?:ite)?/,
    );
    const label = /사람|족속/.test(g)
      ? g
      : `${g.replace(/ 사람$/, "")} 출신 사람/족속`;
    if (first) {
      return `${label}으로 나와요(${first.bookKo} ${first.ch}:${first.n}).`;
    }
    return `${label}을 가리켜요.`;
  }
  if (first?.krv && name && first.krv.includes(name.slice(0, 2))) {
    const short =
      first.krv.length > 36 ? first.krv.slice(0, 36) + "…" : first.krv;
    return `처음 나오는 곳의 개역한글: 「${short}」(${first.bookKo} ${first.ch}:${first.n}).`;
  }
  if (first) {
    return `처음 나오는 곳: ${first.bookKo} ${first.ch}:${first.n}`;
  }
  // Strong 신원만
  const mean = meta?.meaning || "";
  if (/son of David/i.test(mean)) return `${name}은 다윗의 아들이에요.`;
  if (/son of Jacob/i.test(mean)) return `${name}은 야곱의 아들이에요.`;
  if (/king of Israel/i.test(mean)) return `${name}은 이스라엘 왕으로 나와요.`;
  if (/place in Palestine/i.test(mean) && first) {
    return `처음 나오는 곳: ${first.bookKo} ${first.ch}:${first.n}`;
  }
  if (first) return `처음 나오는 곳: ${first.bookKo} ${first.ch}:${first.n}`;
  return "";
}

function main() {
  console.log("[round3] load…");
  const notes = JSON.parse(fs.readFileSync(NOTES, "utf8"));
  const metaMap = loadStrongMeta();
  const corpus = loadCorpus();
  const properSet = new Set(Object.keys(notes.properNames || {}));

  console.log("[round3] indexing first occurrences…");
  buildFirstIndex();
  console.log("[round3] first-index size", _firstIndex.size);

  const beforeUncertain = corpus.filter((j) =>
    /이름 뜻은 확실하지 않아요/.test(notes[j.strong]?.defKo || ""),
  ).length;

  // skeleton before (auto only)
  const skelBefore = new Map();
  for (const j of corpus) {
    const n = notes[j.strong];
    if (n?.noteSrc !== "auto") continue;
    const sk = skeletonOf(n.defKo || "");
    if (sk.length >= 8) skelBefore.set(sk, (skelBefore.get(sk) || 0) + 1);
  }

  // --- mismatches vs Strong ---
  const mismatches = [];
  for (const j of corpus) {
    const n = notes[j.strong];
    if (n?.noteSrc !== "auto") continue;
    const meta = metaMap.get(j.strong);
    const kr = lookupTanakh(j.strong) || {};
    if (
      isProperPos(meta?.pos) ||
      kr.nameType ||
      properSet.has(j.strong)
    )
      continue;
    const en = firstSenseEn(meta?.def || meta?.meaning || j.defEn || "", 80);
    const expected = translateContentEn(en);
    if (!expected) continue;
    const cur = primaryGloss(kr, n, j);
    if (!cur) continue;
    // fuzzy: expected head vs current
    const eHead = expected.slice(0, 2);
    const cHead = cur.slice(0, 2);
    if (eHead && cHead && eHead !== cHead && !cur.includes(expected) && !expected.includes(cur.slice(0, 2))) {
      mismatches.push({
        strong: j.strong,
        lemma: j.lemma,
        en: en.slice(0, 60),
        before: cur,
        expected,
        defEn: (j.defEn || "").slice(0, 70),
      });
    }
  }
  mismatches.sort((a, b) => a.strong.localeCompare(b.strong, "en", { numeric: true }));

  // force known fixes into mismatch list head
  const forced = [
    {
      strong: "H4364",
      lemma: "מַכְמָר",
      en: "a (hunter's) net",
      before: "오븐",
      expected: "그물",
      cause: "H8574(화로/가마) 등과 ‘heat/blackening’ 연상으로 오븐에 오매칭. Strong·사51:20은 그물.",
    },
    {
      strong: "H8546",
      lemma: "תְּמוּתָה",
      en: "execution (as a doom)",
      before: "온전함",
      expected: "죽음",
      cause: "인접 H8549 תָּמִים(온전함)과 번호·뜻 혼동. Strong은 H4191 죽다 계열.",
    },
  ];

  let properFilled = 0;
  let stillUncertain = [];
  let autoRewritten = 0;
  let chipPatched = 0;
  const nameResults = {};

  for (const j of corpus) {
    const strong = j.strong;
    const prev = notes[strong] || {};
    const meta = metaMap.get(strong);
    const kr = lookupTanakh(strong) || {};
    const proper =
      properSet.has(strong) ||
      kr.nameType === "person" ||
      kr.nameType === "place" ||
      isProperPos(meta?.pos || "");

    const expectedFromStrong = translateContentEn(
      firstSenseEn(meta?.def || meta?.meaning || j.defEn || "", 100),
    );

    // gloss correction into local kr view
    let gloss = (kr.gloss || "").replace(/^~/, "");
    let meanings = [...(kr.meanings || [])].map((m) => String(m).replace(/^~/, ""));
    if (strong === "H4364") {
      gloss = "그물";
      meanings = ["그물", "올무"];
    }
    if (strong === "H8546") {
      gloss = "죽음";
      meanings = ["죽음", "죽임", "사형"];
    }
    // if mismatch and we have expected, prefer expected for auto content
    const mm = mismatches.find((x) => x.strong === strong);
    if (!proper && mm?.expected) {
      gloss = mm.expected;
      if (!meanings.includes(gloss)) meanings = [gloss, ...meanings];
    } else if (!proper && expectedFromStrong && gloss) {
      const eh = expectedFromStrong.slice(0, 2);
      if (eh && gloss.slice(0, 2) !== eh && !gloss.includes(expectedFromStrong)) {
        // keep tanakh if not in mismatch list with high confidence map hit
      }
    }

    if (proper) {
      const name = gloss || "이 이름";
      let nameMeaning =
        NAME_HAND[strong] || deriveNameMeaningKo(meta) || "";
      // 추가: meaning 앞머리 풀이
      if (!nameMeaning && meta?.meaning) {
        const head = String(meta.meaning).split(",")[0];
        if (/^(?:he will|father |son |house |loving|drawing|see ye)/i.test(head)) {
          nameMeaning = translateNameGloss(head) || nameMeaning;
        }
      }
      const identity = buildIdentity(strong, j, kr, meta, name);
      const uncertain = !nameMeaning;
      if (uncertain) stillUncertain.push(strong);
      else properFilled += 1;

      const nmLine = nameMeaning
        ? `이름 뜻은 「${nameMeaning}」${hasBatchim(nameMeaning) ? "이에요" : "예요"}.`
        : "이름 뜻은 확실하지 않아요.";
      const f0 = firstOccurrence(strong);
      const who =
        identity ||
        (f0
          ? `처음 나오는 곳: ${f0.bookKo} ${f0.ch}:${f0.n}`
          : `${name}에 대한 Strong 신원 풀이가 짧아요.`);

      // ban generic templates in who
      let whoClean = who
        .replace(/개역한글에 나오는 인명이에요\.?\s*/g, "")
        .replace(/개역한글에 나오는 지명이에요\.?\s*/g, "")
        .replace(/가나안\/팔레스타인에 있는 지명이에요\.?\s*/g, "");
      if (!whoClean.trim()) {
        whoClean = f0
          ? `처음 나오는 곳: ${f0.bookKo} ${f0.ch}:${f0.n}`
          : "Strong에 짧은 신원만 남아 있어요.";
      }

      const rootGloss = meta?.rootStrong
        ? lookupTanakh(meta.rootStrong)?.gloss || ""
        : "";
      let etymKo = prev.etymKo || "";
      if (meta?.rootStrongs?.length >= 2) {
        etymKo = `${strong}은 Strong이 ${meta.rootStrongs.join("·")}을 함께 가리키는 합성 이름이에요.`;
      } else if (meta?.rootStrong && rootGloss) {
        etymKo = `${strong}은 ${meta.rootStrong} 「${rootGloss}」와 연결된 표기예요.`;
      } else if (meta?.sourceText?.includes("primitive root")) {
        etymKo = `${strong}은 Strong에서 원시 어근으로 적혀 있어요.`;
      } else {
        etymKo = `${strong} 어원 표기는 Strong에 짧게 남아 있어요.`;
      }

      const next = {
        ...prev,
        defKo: `${whoClean} ${nmLine}`.replace(/\s+/g, " ").trim(),
        etymKo,
        usageKo: "",
        noteSrc: prev.noteSrc || "auto",
      };
      if (nameMeaning) next.nameMeaning = nameMeaning;
      else delete next.nameMeaning;
      notes[strong] = next;
      syncLex(strong, next);
      if (NAME_HAND[strong] || ["H1732","H4872","H7205","H53","H256","H884"].includes(strong)) {
        nameResults[strong] = {
          nameMeaning: next.nameMeaning || "(빈값)",
          defKo: next.defKo,
        };
      }
      continue;
    }

    // --- content / particle: auto 전부 + 오매칭 교정 대상 ---
    if (prev.noteSrc === "reviewed" && strong !== "H4364" && strong !== "H8546" && !mm) {
      continue;
    }

    const list = meaningsList(
      { gloss, meanings },
      expectedFromStrong,
      prev,
    );
    // prefer corrected gloss first
    if (gloss && list[0] !== gloss) {
      list.unshift(gloss);
    }
    const uniq = [...new Set(list)].slice(0, 4);
    const meaningLine = `뜻: ${uniq.join(", ")}`;

    let ex = null;
    const first = firstOccurrence(strong);
    if (first?.krv && gloss) {
      const hitWord = uniq.find((w) => first.krv.includes(w.slice(0, Math.min(2, w.length))));
      if (hitWord || uniq.some((w) => first.krv.includes(w))) {
        const w = uniq.find((x) => first.krv.includes(x)) || gloss;
        const short =
          first.krv.length > 40 ? first.krv.slice(0, 40) + "…" : first.krv;
        ex = {
          bookKo: first.bookKo,
          n: first.n,
          ch: first.ch,
          word: w,
          t: short,
        };
      }
    }
    // findKrvExample은 파일 I/O가 많아 생략 — firstOccurrence KRV만 사용
    // use chapter:verse when we have first
    let exampleLine = "";
    if (ex) {
      const ref =
        ex.ch != null
          ? `${ex.bookKo} ${ex.ch}:${ex.n}`
          : `${ex.bookKo} ${ex.n}절`;
      const w = ex.word || gloss || uniq[0];
      exampleLine = `개역한글에서는 '${w}'${eulRo(w)} 옮겼어요(${ref}).`;
    } else if (first) {
      exampleLine = `본문 예: ${first.bookKo} ${first.ch}:${first.n}`;
    }

    const defKo = exampleLine
      ? `${meaningLine}\n${exampleLine}`
      : meaningLine;

    const rootGloss = meta?.rootStrong
      ? lookupTanakh(meta.rootStrong)?.gloss || ""
      : "";
    let etymKo = `${strong} 어원 표기는 Strong에 짧게 남아 있어요.`;
    if (meta?.sourceText?.includes("primitive root")) {
      etymKo = `${strong}은 Strong에서 원시 어근으로 적혀 있어요.`;
    } else if (meta?.rootStrong && rootGloss) {
      etymKo = `${strong}은 ${meta.rootStrong} 「${rootGloss}」와 연결된 표기예요.`;
    }

    const next = {
      ...prev,
      defKo,
      etymKo,
      usageKo: uniq.join(", "),
      noteSrc: prev.noteSrc || "auto",
    };
    delete next.nameMeaning;
    notes[strong] = next;
    syncLex(strong, next);
    autoRewritten += 1;
  }

  // 칩 패치: 확인된 오매칭만 (전장 스캔은 소량)
  console.log("[round3] patching chips for known mismatches…");
  chipPatched += patchChips("H4364", "그물", new Set(["오븐", "가마"]));
  chipPatched += patchChips("H8546", "죽음", new Set(["온전함", "성숙"]));
  for (const m of mismatches.slice(0, 30)) {
    const after = notes[m.strong]?.usageKo?.split(",")[0]?.trim();
    if (after && m.before && after !== m.before) {
      chipPatched += patchChips(m.strong, after, new Set([m.before]));
    }
  }

  fs.writeFileSync(NOTES, JSON.stringify(notes, null, 2) + "\n");

  const afterUncertain = corpus.filter((j) =>
    /이름 뜻은 확실하지 않아요/.test(notes[j.strong]?.defKo || ""),
  );
  const uncertainSamples = afterUncertain.slice(0, 10).map((j) => {
    const meta = metaMap.get(j.strong);
    return {
      strong: j.strong,
      lemma: j.lemma,
      sourceText: (meta?.sourceText || "").slice(0, 100),
      meaning: (meta?.meaning || "").slice(0, 80),
      defKo: notes[j.strong]?.defKo,
    };
  });

  // skeleton after
  const skelAfter = new Map();
  for (const j of corpus) {
    const n = notes[j.strong];
    if (n?.noteSrc !== "auto") continue;
    const sk = skeletonOf(n.defKo || "");
    if (sk.length >= 8) skelAfter.set(sk, (skelAfter.get(sk) || 0) + 1);
  }

  const topSkel = (map) =>
    [...map.entries()]
      .filter(([, c]) => c >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([skel, count]) => ({ count, skel }));

  // samples 20
  const autoProper = [];
  const autoOther = [];
  for (const j of corpus) {
    if (notes[j.strong]?.noteSrc !== "auto") continue;
    const kr = lookupTanakh(j.strong) || {};
    const meta = metaMap.get(j.strong);
    const proper =
      properSet.has(j.strong) ||
      kr.nameType ||
      isProperPos(meta?.pos || "");
    if (proper) autoProper.push(j);
    else autoOther.push(j);
  }
  function mulberry32(a) {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
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
  // ensure key propers if auto
  const prefer = ["H6876", "H4363", "H884", "H53"].map((s) =>
    autoProper.find((j) => j.strong === s),
  ).filter(Boolean);
  const sampleProper = [
    ...prefer,
    ...shuffle(autoProper).filter((j) => !prefer.find((p) => p.strong === j.strong)),
  ].slice(0, 8);
  const sampleOther = shuffle(autoOther).slice(0, 12);
  // force include H4364 H8546 in other if possible
  for (const s of ["H4364", "H8546"]) {
    const j = corpus.find((x) => x.strong === s);
    if (j && !sampleOther.find((x) => x.strong === s)) {
      sampleOther[sampleOther.length - 1] = j;
    }
  }
  const samples20 = [...sampleProper, ...sampleOther].slice(0, 20).map((j) => {
    const n = notes[j.strong] || {};
    return {
      strong: j.strong,
      lemma: j.lemma,
      nameMeaning: n.nameMeaning || "",
      defKo: n.defKo || "",
      etymKo: n.etymKo || "",
      usageKo: n.usageKo || "",
      noteSrc: n.noteSrc || "",
    };
  });

  // particle check 보잘것없는도
  let badParticle = 0;
  for (const j of corpus) {
    const d = notes[j.strong]?.defKo || "";
    if (/보잘것없는도|없는도 |한도 /.test(d)) badParticle += 1;
  }

  const mismatchTop30 = [
    ...forced,
    ...mismatches.filter((m) => m.strong !== "H4364" && m.strong !== "H8546"),
  ]
    .slice(0, 30)
    .map((m) => ({
      strong: m.strong,
      lemma: m.lemma,
      before: m.before,
      after: m.expected || notes[m.strong]?.usageKo?.split(",")[0],
      en: m.en,
      cause: m.cause || "",
      defKo: notes[m.strong]?.defKo,
    }));

  const report = {
    uncertainBefore: beforeUncertain,
    uncertainAfter: afterUncertain.length,
    properFilled,
    nameResults,
    uncertainSamples,
    mismatchCount: mismatches.length + 2,
    mismatchTop30,
    causes: {
      H4364:
        "tanakh-lexicon이 「오븐/가마」로 잘못 둠. Strong defEn은 hunter's net. 사 51:20 「그물」. H8574(화로)와 heat 연상 혼동.",
      H8546:
        "tanakh-lexicon이 「온전함」으로 잘못 둠(H8549 תמים 혼동). Strong은 execution/doom ← H4191 죽다.",
    },
    chipPatched,
    autoRewritten,
    badParticle,
    skeletonBefore: topSkel(skelBefore),
    skeletonAfter: topSkel(skelAfter),
    reviewedDiff5: ["H853", "H834", "H413", "H5921", "H3808"],
    reviewedDiffNote:
      "과거 누적 1208은 content300+HAND(입자 포함 중복 가정) 서술. noteSrc 재구성은 1203. 차이 5개는 B1에서 채워진 입자 HAND(H853·H834·H413·H5921·H3808)가 ‘원본 308’에 이중으로 잡히며 생긴 보고 차이.",
    samples20,
  };

  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        uncertainBefore: beforeUncertain,
        uncertainAfter: afterUncertain.length,
        nameResults,
        mismatchCount: report.mismatchCount,
        chipPatched,
        autoRewritten,
        badParticle,
        skelBefore0: report.skeletonBefore.slice(0, 5),
        skelAfter0: report.skeletonAfter.slice(0, 5),
        sampleN: samples20.length,
      },
      null,
      2,
    ),
  );
}

main();
