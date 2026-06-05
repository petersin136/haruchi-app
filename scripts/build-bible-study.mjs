// =============================================================================
// "성경 공부" 레이어 스터디 데이터 빌더 — 구약 39 + 신약 27 = 66권 일괄 생성.
//
// NT 5-레이어: english + krv + greek + greekpara + kids
// OT 4-레이어: english + krv + hebrew + kids  (히브리 의역은 미보유)
//
// 원본 데이터(이미 보유):
//   - English (WEB)         : .cache/web/<bookId>.json (TehShrike WEB JSON)
//   - 개역한글              : app/bible-reading/<bookId>.json — verses.krv
//   - 헬·히 wordblock       : public/bible-v2/<bookId>-v2.json — chapters[].verses[].tokens
//                               (token 마다 lemma/품사/문법/뜻/주 모두 포함)
//   - 헬라 의역(greekpara)  : app/bible-reading/<bookId>.json — verses.greekKr (NT 만)
//   - 어린이 의역(kids)     : app/bible-reading/<bookId>.json — verses.kids
//
// 출력:
//   public/bible-study/data/<bookId>.json
//
// public/ 에 두는 이유:
//   webpack 이 정적 import 로 27개 큰 JSON 을 모두 chunk 로 만들면 dev/build
//   메모리가 폭발한다. 컴포넌트는 fetch("/bible-study/data/<bookId>.json") 으로
//   런타임에 받아오고, 브라우저 캐시가 자연스럽게 동작한다.
//
// 출력 스키마 (책 단위, 모든 장 포함):
//   {
//     book: "로마서",
//     bookId: "romans",
//     layerOrder: ["english","krv","greek","greekpara","kids"],
//     layerLabels: { english: "영어(WEB)", krv: "개역한글", ... },
//     defaultOn: ["english","krv"],
//     sources: { ... },
//     chapters: [
//       {
//         chapter: 1,
//         verses: [
//           {
//             ref: "로마서 1:1",
//             layers: {
//               english:   { type: "text", content: "..." },
//               krv:       { type: "text", content: "..." },
//               greek:     { type: "wordblock", text: "...", words: [...] },
//               greekpara: { type: "text", content: "..." },
//               kids:      { type: "text", content: "..." }
//             }
//           }
//         ]
//       }
//     ]
//   }
//
// 비어있는 절(예: WEB 이 다른 절과 묶음 처리한 케이스) 은 그 layer 만 빠진 채
// 출력. 화면 토글이 그 자리만 안 보이게 자연스럽게 흐른다.
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  alignKrvDataInPlace,
  alignWebDataInPlace,
} from "./lib/verse-alignment.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const OT_BOOKS = [
  { id: "genesis", name: "창세기" },
  { id: "exodus", name: "출애굽기" },
  { id: "leviticus", name: "레위기" },
  { id: "numbers", name: "민수기" },
  { id: "deuteronomy", name: "신명기" },
  { id: "joshua", name: "여호수아" },
  { id: "judges", name: "사사기" },
  { id: "ruth", name: "룻기" },
  { id: "samuel1", name: "사무엘상" },
  { id: "samuel2", name: "사무엘하" },
  { id: "kings1", name: "열왕기상" },
  { id: "kings2", name: "열왕기하" },
  { id: "chronicles1", name: "역대상" },
  { id: "chronicles2", name: "역대하" },
  { id: "ezra", name: "에스라" },
  { id: "nehemiah", name: "느헤미야" },
  { id: "esther", name: "에스더" },
  { id: "job", name: "욥기" },
  { id: "psalms", name: "시편" },
  { id: "proverbs", name: "잠언" },
  { id: "ecclesiastes", name: "전도서" },
  { id: "songofsolomon", name: "아가" },
  { id: "isaiah", name: "이사야" },
  { id: "jeremiah", name: "예레미야" },
  { id: "lamentations", name: "예레미야애가" },
  { id: "ezekiel", name: "에스겔" },
  { id: "daniel", name: "다니엘" },
  { id: "hosea", name: "호세아" },
  { id: "joel", name: "요엘" },
  { id: "amos", name: "아모스" },
  { id: "obadiah", name: "오바댜" },
  { id: "jonah", name: "요나" },
  { id: "micah", name: "미가" },
  { id: "nahum", name: "나훔" },
  { id: "habakkuk", name: "하박국" },
  { id: "zephaniah", name: "스바냐" },
  { id: "haggai", name: "학개" },
  { id: "zechariah", name: "스가랴" },
  { id: "malachi", name: "말라기" },
];

const NT_BOOKS = [
  { id: "matthew", name: "마태복음" },
  { id: "mark", name: "마가복음" },
  { id: "luke", name: "누가복음" },
  { id: "john", name: "요한복음" },
  { id: "acts", name: "사도행전" },
  { id: "romans", name: "로마서" },
  { id: "corinthians1", name: "고린도전서" },
  { id: "corinthians2", name: "고린도후서" },
  { id: "galatians", name: "갈라디아서" },
  { id: "ephesians", name: "에베소서" },
  { id: "philippians", name: "빌립보서" },
  { id: "colossians", name: "골로새서" },
  { id: "thessalonians1", name: "데살로니가전서" },
  { id: "thessalonians2", name: "데살로니가후서" },
  { id: "timothy1", name: "디모데전서" },
  { id: "timothy2", name: "디모데후서" },
  { id: "titus", name: "디도서" },
  { id: "philemon", name: "빌레몬서" },
  { id: "hebrews", name: "히브리서" },
  { id: "james", name: "야고보서" },
  { id: "peter1", name: "베드로전서" },
  { id: "peter2", name: "베드로후서" },
  { id: "john1", name: "요한일서" },
  { id: "john2", name: "요한이서" },
  { id: "john3", name: "요한삼서" },
  { id: "jude", name: "유다서" },
  { id: "revelation", name: "요한계시록" },
];

// 신약 — 5층.
const NT_LAYER_ORDER = ["english", "krv", "greek", "greekpara", "kids"];
const NT_LAYER_LABELS = {
  english: "영어(WEB)",
  krv: "개역한글",
  greek: "헬라어",
  greekpara: "헬라 의역",
  kids: "어린이 의역",
};
const NT_DEFAULT_ON = ["english", "krv"];
const NT_SOURCES = {
  english: "World English Bible (WEB) — 퍼블릭 도메인",
  krv: "성경전서 개역한글판 — 퍼블릭 도메인",
  greek:
    "SBLGNT — © Society of Biblical Literature, CC BY 4.0 · 형태소 분석 MorphGNT (CC BY-SA 4.0)",
  greekpara: "헬라 의역 — 개역한글 기반 직접 제작한 학습용 2차 저작물",
  kids: "어린이 의역 — 개역한글 기반 직접 제작한 학습용 2차 저작물",
};

// 구약 — 5층. (히브리 의역은 v2 토큰의 gloss 를 ` — ` 로 이어붙인 자동 생성)
const OT_LAYER_ORDER = ["english", "krv", "hebrew", "hebrewpara", "kids"];
const OT_LAYER_LABELS = {
  english: "영어(WEB)",
  krv: "개역한글",
  hebrew: "히브리어",
  hebrewpara: "히브리 의역",
  kids: "어린이 의역",
};
const OT_DEFAULT_ON = ["english", "krv"];
const OT_SOURCES = {
  english: "World English Bible (WEB) — 퍼블릭 도메인",
  krv: "성경전서 개역한글판 — 퍼블릭 도메인",
  hebrew:
    "WLC (Westminster Leningrad Codex) — 퍼블릭 도메인 · 형태소 분석 OSHB morphhb (CC BY 4.0) · 사전 OSHB HebrewLexicon (Strong's·BDB, 퍼블릭 도메인)",
  hebrewpara:
    "히브리 의역 — `public/hebrew-test/<book>.manual.json` 에 사람이 직접 쓴 자연 문장을 우선 적용. 매니페스트에 없는 절은 OSHB HebrewLexicon 한국어 뜻 중 의미 있는 단어만 골라 ` — ` 로 이어 만든 자동 채움(학습용 2차 저작물)",
  kids: "어린이 의역 — 개역한글 기반 직접 제작한 학습용 2차 저작물",
};

const dataOutDir = path.join(repoRoot, "public", "bible-study", "data");
fs.mkdirSync(dataOutDir, { recursive: true });

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// 히브리 의역 자동 채움에서 제외할 토큰 식별. "의미 있는 단어만" 정책.
//   1) gloss 가 `(...)` 또는 `[...]` 로 시작하는 문법 표지(예: "(목적격)", "(관계대명사)")
//   2) PREFIX_LEMMA 의 gloss 와 정확히 일치하는 단독 prefix(접속사/전치사/정관사)
const HEBREW_PARTICLE_GLOSSES = new Set([
  "그리고", // ו conjunction
  "그", // ה definite article
  "~ 안에/으로", // בְּ
  "~에게/를 위해", // לְ
  "~처럼", // כְּ
  "~로부터", // מִן (단독형 m prefix)
  "~인가?", // הֲ 의문사
  "~한 (자/것)", // שֶׁ 관계사
  "~의", // a (속격 표지)
]);

function isHebrewParticleToken(t) {
  const gloss = (typeof t?.gloss === "string" ? t.gloss : "").trim();
  if (!gloss) return true;
  if (/^[(\[]/.test(gloss)) return true;
  if (HEBREW_PARTICLE_GLOSSES.has(gloss)) return true;
  return false;
}

// 책별 hebrewpara 매니페스트 로드. PoC 빌더와 같은 파일을 공유한다.
//   public/hebrew-test/<book>.manual.json
//     { "hebrewpara": { "1:1": "...", "1:2": "..." } }
// 사람이 쓴 자연 문장은 항상 자동 채움보다 우선한다.
function loadHebrewParaManifest(bookId) {
  const p = path.join(
    repoRoot,
    "public",
    "hebrew-test",
    `${bookId}.manual.json`,
  );
  if (!fs.existsSync(p)) return new Map();
  try {
    const m = JSON.parse(fs.readFileSync(p, "utf8"));
    const obj = m?.hebrewpara ?? {};
    const out = new Map();
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === "string" && v.trim()) out.set(k, v.trim());
    }
    return out;
  } catch (e) {
    console.warn(`⚠️  ${bookId}: 매니페스트 파싱 실패 — ${e?.message ?? e}`);
    return new Map();
  }
}

// v2 token → wordblock word. v2 의 풍부한 필드를 LayeredBibleViewer 가
// 기대하는 7개 필드로 정리.
//   word    ← w
//   pron    ← p
//   meaning ← gloss (없으면 빈 문자열)
//   lemma   ← lemma
//   morph   ← parseLabel
//   pos     ← posLabel (없으면 생략)
//   meanings ← meanings 배열 (있을 때만)
//   nameType ← nameType (null 이면 생략)
//   note    ← note (빈 문자열이면 생략)
function tokenToWord(t) {
  const w = {
    word: t.w,
    pron: t.p || "",
    meaning: t.gloss || "",
    lemma: t.lemma || t.w,
    morph: t.parseLabel || "",
  };
  if (t.posLabel) w.pos = t.posLabel;
  if (Array.isArray(t.meanings) && t.meanings.length > 0) {
    w.meanings = t.meanings.slice();
  }
  if (t.nameType === "person" || t.nameType === "place") {
    w.nameType = t.nameType;
  }
  if (typeof t.note === "string" && t.note.trim()) {
    w.note = t.note.trim();
  }
  return w;
}

// book.testament === "nt" | "ot" 에 따라 레이어 구성이 달라진다.
function buildBook(book) {
  const isOT = book.testament === "ot";
  const layerOrder = isOT ? OT_LAYER_ORDER : NT_LAYER_ORDER;
  const layerLabels = isOT ? OT_LAYER_LABELS : NT_LAYER_LABELS;
  const defaultOn = isOT ? OT_DEFAULT_ON : NT_DEFAULT_ON;
  const sources = isOT ? OT_SOURCES : NT_SOURCES;
  // 신약은 'greek' 레이어, 구약은 'hebrew' 레이어로 같은 wordblock 데이터를 노출.
  const wordblockLayer = isOT ? "hebrew" : "greek";

  const bookJsonPath = path.join(repoRoot, "app/bible-reading", `${book.id}.json`);
  // v2 데이터는 이제 public/bible-v2/ 에 있다 (webpack OOM 방지를 위해 이동).
  const bookV2Path = path.join(
    repoRoot,
    "public/bible-v2",
    `${book.id}-v2.json`,
  );
  const webPath = path.join(repoRoot, ".cache/web", `${book.id}.json`);
  if (!fs.existsSync(bookJsonPath))
    throw new Error(`missing ${bookJsonPath}`);
  if (!fs.existsSync(bookV2Path))
    throw new Error(`missing ${bookV2Path} (NT: build-gospel-v2.mjs, OT: build-tanakh-v2.mjs)`);
  if (!fs.existsSync(webPath))
    throw new Error(`missing ${webPath} (run fetch-web-english.mjs first)`);

  const krvData = readJson(bookJsonPath);
  const v2Data = readJson(bookV2Path);
  const webData = readJson(webPath);
  // 구약 책의 KRV ↔ WLC 절 번호 어긋남(예: 출 8:1~4 = WLC 7:26~29) 을 흡수.
  // build-tanakh-v2 가 v2.copyKr 를 이미 WLC 좌표로 옮겨 두므로, 여기서도 KRV /
  // WEB / kids 텍스트를 같은 좌표로 옮긴 뒤 모든 lookup 을 v.n (WLC) 으로 통일한다.
  if (isOT) {
    alignKrvDataInPlace(book.id, krvData);
    alignWebDataInPlace(book.id, webData);
  }
  // 사람이 직접 쓴 자연 문장(헬라어 greekKr 같은 톤) 매니페스트.
  // 구약 책에만 적용 — 신약 책은 기존대로 greekKr 그대로 사용.
  const hebrewParaManual = isOT
    ? loadHebrewParaManifest(book.id)
    : new Map();
  let hebrewParaManualUsed = 0;

  // v2 chapter+verse 인덱스: ch -> v -> { copyGreek 또는 copyHebrew, tokens }.
  const v2Index = new Map();
  for (const c of v2Data.chapters || []) {
    const m = new Map();
    for (const v of c.verses || []) {
      m.set(v.n, v);
    }
    v2Index.set(c.chapter, m);
  }
  const webIndex = new Map();
  for (const c of webData.chapters || []) {
    const m = new Map();
    for (const v of c.verses || []) {
      m.set(v.n, v);
    }
    webIndex.set(c.chapter, m);
  }

  const out = {
    book: book.name,
    bookId: book.id,
    testament: isOT ? "ot" : "nt",
    layerOrder: layerOrder.slice(),
    layerLabels: { ...layerLabels },
    defaultOn: defaultOn.slice(),
    sources: { ...sources },
    chapters: [],
  };

  let totalVerses = 0;
  const missing = Object.fromEntries(layerOrder.map((k) => [k, 0]));

  for (const ch of krvData.chapters || []) {
    const chNo = ch.chapter;
    const krvArr = ch.verses?.krv || [];
    const greekKrArr = ch.verses?.greekKr || [];
    const kidsArr = ch.verses?.kids || [];
    const greekKrMap = new Map(greekKrArr.map((v) => [v.n, v.t]));
    const kidsMap = new Map(kidsArr.map((v) => [v.n, v.t]));
    const v2ChMap = v2Index.get(chNo) || new Map();
    const webChMap = webIndex.get(chNo) || new Map();

    const verses = [];
    for (const v of krvArr) {
      const ref = `${book.name} ${chNo}:${v.n}`;
      const layers = {};

      const enT = webChMap.get(v.n)?.t?.trim();
      if (enT) layers.english = { type: "text", content: enT };
      else missing.english += 1;

      const krvT = (v.t || "").trim();
      if (krvT) layers.krv = { type: "text", content: krvT };
      else missing.krv += 1;

      const v2v = v2ChMap.get(v.n);
      if (v2v && v2v.tokens && v2v.tokens.length > 0) {
        // NT 는 copyGreek, OT 는 copyHebrew 필드명. 빠진 쪽이 빈 문자열이어도 무해.
        const text = (
          v2v.copyGreek ||
          v2v.copyHebrew ||
          v2v.copyGrk ||
          v2v.copy ||
          ""
        ).trim();
        layers[wordblockLayer] = {
          type: "wordblock",
          text,
          words: v2v.tokens.map(tokenToWord),
        };
      } else {
        missing[wordblockLayer] += 1;
      }

      if (!isOT) {
        const gp = greekKrMap.get(v.n);
        if (gp && gp.trim()) {
          layers.greekpara = { type: "text", content: gp.trim() };
        } else {
          missing.greekpara += 1;
        }
      } else {
        // 히브리 의역 우선순위:
        //   1) 매니페스트(`public/hebrew-test/<book>.manual.json`) 의 자연 문장
        //   2) v2 토큰의 gloss 중 의미 있는 단어만 ` — ` 로 이은 자동 채움
        //      (단독 접속사/전치사/정관사 및 "(목적격)" 같은 문법 표지 제외)
        const manualKey = `${chNo}:${v.n}`;
        const manualLine = hebrewParaManual.get(manualKey);
        if (manualLine) {
          layers.hebrewpara = { type: "text", content: manualLine };
          hebrewParaManualUsed += 1;
        } else if (v2v && v2v.tokens && v2v.tokens.length > 0) {
          const parts = [];
          for (const t of v2v.tokens) {
            if (isHebrewParticleToken(t)) continue;
            const piece =
              (typeof t.gloss === "string" && t.gloss.trim()) ||
              (Array.isArray(t.meanings) && t.meanings[0]) ||
              "";
            const cleaned =
              typeof piece === "string" ? piece.trim() : "";
            if (cleaned) parts.push(cleaned);
          }
          if (parts.length > 0) {
            const line = parts.join(" — ") + ".";
            layers.hebrewpara = { type: "text", content: line };
          } else {
            missing.hebrewpara += 1;
          }
        } else {
          missing.hebrewpara += 1;
        }
      }

      const kt = kidsMap.get(v.n);
      if (kt && kt.trim()) {
        layers.kids = { type: "text", content: kt.trim() };
      } else {
        missing.kids += 1;
      }

      verses.push({ ref, layers });
      totalVerses += 1;
    }
    out.chapters.push({ chapter: chNo, verses });
  }

  const outPath = path.join(dataOutDir, `${book.id}.json`);
  fs.writeFileSync(outPath, JSON.stringify(out) + "\n", "utf8");
  const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);

  const cov = {};
  for (const k of layerOrder) {
    const have = totalVerses - missing[k];
    cov[k] = `${((have / totalVerses) * 100).toFixed(1)}%`;
  }
  console.log(
    `✅ ${book.name.padEnd(8)} (${book.id}) — ${out.chapters.length}장 ${totalVerses}절 ${sizeKb}KB`,
  );
  console.log(
    `   ${layerOrder.map((k) => `${k} ${cov[k]}`).join(" · ")}`,
  );
  if (isOT && hebrewParaManual.size > 0) {
    console.log(
      `   히브리 의역 매니페스트 ${hebrewParaManual.size}건 등록 · 사용 ${hebrewParaManualUsed}건`,
    );
  }
  return { book: book.id, testament: out.testament, layerOrder, totalVerses, missing, sizeKb };
}

function main() {
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const only = onlyArg ? onlyArg.slice("--only=".length).split(",") : null;
  const wantOT = !process.argv.includes("--nt");
  const wantNT = !process.argv.includes("--ot");
  const pool = [
    ...(wantOT ? OT_BOOKS.map((b) => ({ ...b, testament: "ot" })) : []),
    ...(wantNT ? NT_BOOKS.map((b) => ({ ...b, testament: "nt" })) : []),
  ];
  const list = only ? pool.filter((b) => only.includes(b.id)) : pool;
  const stats = [];
  for (const b of list) {
    try {
      stats.push(buildBook(b));
    } catch (e) {
      console.error(`❌ ${b.id}:`, e.message);
    }
  }
  const totalVerses = stats.reduce((s, x) => s + x.totalVerses, 0);
  const totalKb = stats.reduce((s, x) => s + parseFloat(x.sizeKb), 0);
  console.log(
    `\n📊 합계 — ${stats.length}권 · ${totalVerses.toLocaleString()}절 · ${totalKb.toFixed(0)}KB (${(totalKb / 1024).toFixed(1)}MB)`,
  );
  // 합계는 NT 와 OT 를 따로 표시 (레이어 구성이 다름).
  for (const tg of ["nt", "ot"]) {
    const sub = stats.filter((s) => s.testament === tg);
    if (!sub.length) continue;
    const subVerses = sub.reduce((s, x) => s + x.totalVerses, 0);
    console.log(`  ${tg.toUpperCase()} — ${sub.length}권 / ${subVerses.toLocaleString()}절`);
    const layers = sub[0].layerOrder;
    for (const k of layers) {
      const m = sub.reduce((s, x) => s + (x.missing[k] || 0), 0);
      console.log(
        `     ${k.padEnd(10)} 누락 ${m}절 (${((1 - m / subVerses) * 100).toFixed(2)}%)`,
      );
    }
  }
}

main();
