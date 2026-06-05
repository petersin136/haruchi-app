// =============================================================================
// 구약 히브리어 PoC 빌더 — 창세기 한 권만 사용자 PoC 스키마로 변환.
//
// 산출:
//   public/hebrew-test/genesis.json
//
// 입력(이미 디스크에 있음, 재다운로드 없음):
//   - .cache/oshb/Gen.xml                       (OSHB morphhb, WLC + 형태 분석 + Strong's)
//   - .cache/oshb/strong-he.json                (영어 fallback 사전)
//   - scripts/lib/tanakh-lexicon.mjs            (한국어 어휘집)
//   - scripts/lib/hebrew-pron.mjs               (음역)
//   - scripts/lib/hebrew-morph-parse.mjs        (형태 분석 디코더)
//   - app/bible-reading/genesis.json            (krv, kids 한국어 본문)
//
// 정책 — "외부 LLM 미사용, 자유 라이선스 재료만으로 채움".
//   1) 사람이 작성한 자연 문장(`public/hebrew-test/genesis.manual.json`) 이
//      있으면 무조건 우선 적용. 헬라의역(`greekKr`) 과 같은 톤의 한 줄.
//   2) 매니페스트에 없는 절은 토큰의 한국어 meaning 을 ` — ` 로 잇는 자동 채움.
//      **의미 있는 단어만** 포함:
//        · 단독 prefix(접속사·전치사·정관사) 토큰은 제외
//        · gloss 가 `(...)` 로 시작하는 문법 표지(예: "(목적격)") 는 제외
//        · 빈/공백 gloss 제외
//   3) 재빌드 시: 매니페스트 → 이전 출력의 사람 다듬은 라인 → 자동 채움 순.
//
// 스키마(사용자 지정):
//   {
//     book, direction, layerOrder, layerLabels, defaultOn,
//     chapters: [{ chapter, verses: [{ ref, layers: { krv, hebrew, hebrewpara, kids } }] }]
//   }
//   hebrew 레이어의 word 객체 필드:
//     word(표면형), pron(한글 음역), meaning(한국어 단일 뜻),
//     lemma(원형), strong(예: "H7225"), morph(라벨, 예: "전치사 + 명사 · 여성 · 단수")
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pron } from "./lib/hebrew-pron.mjs";
import { decodeMorph, PREFIX_LEMMA } from "./lib/hebrew-morph-parse.mjs";
import { normalizeStrong, lookupTanakh } from "./lib/tanakh-lexicon.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const BOOK = { id: "genesis", label: "창세기", osis: "Gen" };
const OUT_REL = "public/hebrew-test/genesis.json";
const OUT_PATH = path.join(repoRoot, OUT_REL);
const MANUAL_PATH = path.join(repoRoot, "public/hebrew-test/genesis.manual.json");

const STRONG_PATH = path.join(repoRoot, ".cache/oshb/strong-he.json");
const STRONG = fs.existsSync(STRONG_PATH)
  ? JSON.parse(fs.readFileSync(STRONG_PATH, "utf8"))
  : {};

// ── OSHB XML 파서 (build-tanakh-v2 의 로직과 동일하지만 자체 카피본 — 기존
//   스크립트를 건드리지 않기 위해 import 가 아니라 같은 알고리즘을 다시 작성).
function parseOshbXml(xmlPath) {
  const xml = fs.readFileSync(xmlPath, "utf8");
  const verseRe = /<verse osisID="([^"]+)">([\s\S]*?)<\/verse>/g;
  const out = new Map(); // chapter -> Map(verseNo -> rows[])
  let m;
  while ((m = verseRe.exec(xml)) !== null) {
    const bcv = m[1];
    const body = m[2];
    const parts = bcv.split(".");
    const ch = parseInt(parts[1], 10);
    const v = parseInt(parts[2], 10);
    if (!Number.isFinite(ch) || !Number.isFinite(v)) continue;
    const rows = parseVerseBody(body);
    if (!out.has(ch)) out.set(ch, new Map());
    out.get(ch).set(v, rows);
  }
  return out;
}

function parseVerseBody(body) {
  const wRe = /<w\b([^>]*)>([\s\S]*?)<\/w>/g;
  const rows = [];
  let m;
  while ((m = wRe.exec(body)) !== null) {
    const attrs = m[1];
    const inner = m[2];
    const lemma = attrAt(attrs, "lemma");
    const morph = attrAt(attrs, "morph");
    const wordRaw = inner.replace(/<[^>]+>/g, "").trim();
    rows.push({ word: wordRaw, lemma, morph });
  }
  return rows;
}

function attrAt(attrs, name) {
  const re = new RegExp(`\\b${name}="([^"]*)"`);
  const m = attrs.match(re);
  return m ? m[1] : "";
}

// ── 토큰 1개 빌드 (사용자 PoC 스키마) ────────────────────────────────────────
function buildWord(row) {
  const wordRaw = row.word;
  const lemmaParts = (row.lemma || "").split("/").filter(Boolean);

  // 본 어근 lemma 위치: 소문자 1~2글자 prefix 코드 가 아닌 첫 항목.
  let mainIdx = lemmaParts.findIndex(
    (lp) => !(lp.length <= 2 && /^[a-z]+$/.test(lp.trim())),
  );
  const allPrefix = mainIdx < 0;
  if (mainIdx < 0) mainIdx = 0;
  const mainLemmaRaw = lemmaParts[mainIdx] || "";
  const mainStrong = normalizeStrong(mainLemmaRaw);

  // 한국어 뜻 → 영어 fallback → prefix 라벨 순.
  const krLex = lookupTanakh(mainStrong);
  const enEntry = STRONG[mainStrong];
  let meaning = krLex?.gloss || "";
  if (!meaning && enEntry) {
    const fallback =
      enEntry.def ||
      (enEntry.usage || "").replace(/\.$/, "").split(/[,;]/)[0]?.trim() ||
      "";
    if (fallback) {
      meaning = String(fallback).split(/[(;]/)[0].trim().slice(0, 24) || fallback;
    }
  }
  if (!meaning && allPrefix) {
    const px = PREFIX_LEMMA[mainLemmaRaw.trim()];
    if (px) meaning = px.gloss;
  }

  // 형태 분석 라벨.
  const morphInfo = decodeMorph(row.morph || "");
  const morphLabel =
    morphInfo.parseLabelLong || morphInfo.parseLabel || morphInfo.posLabel || "";

  // 표시용 lemma — HebrewStrong 의 표제어가 있으면 그쪽이 깔끔.
  const lemmaDisplay = enEntry?.h || mainLemmaRaw;

  return {
    word: wordRaw,
    pron: pron(wordRaw),
    meaning,
    lemma: lemmaDisplay,
    strong: mainStrong || "",
    morph: morphLabel,
    // hebrewpara 용 내부 플래그(출력 JSON 에는 포함하지 않음).
    _allPrefix: allPrefix,
  };
}

// ── 의미있는 단어만 ` — ` 로 잇기 ────────────────────────────────────────────
function buildHebrewpara(words) {
  const parts = [];
  for (const w of words) {
    if (w._allPrefix) continue; // 단독 접속사·전치사·정관사 등
    const m = (w.meaning || "").trim();
    if (!m) continue;
    if (/^[(\[]/.test(m)) continue; // "(목적격)" 같은 문법 표지
    parts.push(m);
  }
  if (parts.length === 0) return "";
  return parts.join(" — ") + ".";
}

// ── 사람 손맛 보존 정책 (신약 auto-generate 와 동일) ────────────────────────
//   기존 값이
//     - 3자 미만
//     - 또는 히브리 문자(\u05D0-\u05EA) 가 섞여 있다(= 아직 풀이 안 됨)
//   둘 중 하나면 자동 결과로 덮어씀. 그 외에는 보존.
function shouldOverwrite(existing) {
  if (typeof existing !== "string") return true;
  const trimmed = existing.trim();
  if (trimmed.length < 3) return true;
  if (/[\u05D0-\u05EA]/.test(trimmed)) return true;
  return false;
}

// ── 본 빌드 ─────────────────────────────────────────────────────────────────
function build() {
  const xmlPath = path.join(repoRoot, `.cache/oshb/${BOOK.osis}.xml`);
  if (!fs.existsSync(xmlPath)) {
    throw new Error(`missing OSHB XML: ${xmlPath}`);
  }
  const krvPath = path.join(repoRoot, `app/bible-reading/${BOOK.id}.json`);
  if (!fs.existsSync(krvPath)) {
    throw new Error(`missing KRV source: ${krvPath}`);
  }

  // 사람이 직접 쓴 자연 문장 매니페스트 — 키 형식 "ch:n" (책 이름 없이).
  const manualByKey = new Map();
  if (fs.existsSync(MANUAL_PATH)) {
    try {
      const manual = JSON.parse(fs.readFileSync(MANUAL_PATH, "utf8"));
      const obj = manual?.hebrewpara ?? {};
      for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (typeof v === "string" && v.trim()) manualByKey.set(k, v.trim());
      }
    } catch (e) {
      console.warn(`⚠️  매니페스트 파싱 실패: ${e?.message ?? e}`);
    }
  }

  // 기존 PoC 파일(있다면) — hebrewpara 보존을 위해 로드.
  let prior = null;
  if (fs.existsSync(OUT_PATH)) {
    try {
      prior = JSON.parse(fs.readFileSync(OUT_PATH, "utf8"));
    } catch {
      prior = null;
    }
  }
  const priorParaByRef = new Map();
  for (const ch of prior?.chapters ?? []) {
    for (const v of ch.verses ?? []) {
      const t = v.layers?.hebrewpara?.content;
      if (typeof t === "string") priorParaByRef.set(v.ref, t);
    }
  }

  // KRV / kids 본문 인덱스.
  const krvData = JSON.parse(fs.readFileSync(krvPath, "utf8"));
  const krByCh = new Map();
  const kidsByCh = new Map();
  for (const c of krvData.chapters ?? []) {
    const k = new Map();
    for (const v of c.verses?.krv ?? []) k.set(v.n, v.t);
    const kd = new Map();
    for (const v of c.verses?.kids ?? []) kd.set(v.n, v.t);
    krByCh.set(c.chapter, k);
    kidsByCh.set(c.chapter, kd);
  }

  // OSHB 토큰.
  const verseMapByCh = parseOshbXml(xmlPath);

  // 통계.
  let totalVerses = 0;
  let totalTokens = 0;
  let paraManual = 0;
  let paraAuto = 0;
  let paraPreserved = 0;
  let paraEmpty = 0;

  const chapters = [];
  const chNums = Array.from(verseMapByCh.keys()).sort((a, b) => a - b);
  for (const chNo of chNums) {
    const verseMap = verseMapByCh.get(chNo);
    const krMap = krByCh.get(chNo) ?? new Map();
    const kidsMap = kidsByCh.get(chNo) ?? new Map();
    const vNums = Array.from(verseMap.keys()).sort((a, b) => a - b);

    const verses = [];
    for (const n of vNums) {
      const rows = verseMap.get(n);
      const words = rows.map(buildWord).filter((w) => w.word);
      totalTokens += words.length;
      totalVerses += 1;

      const ref = `${BOOK.label} ${chNo}:${n}`;
      const layers = {};

      const krvT = (krMap.get(n) || "").trim();
      if (krvT) layers.krv = { type: "text", content: krvT };

      if (words.length > 0) {
        // 출력에서 내부 플래그는 제거.
        layers.hebrew = {
          type: "wordblock",
          words: words.map(({ _allPrefix, ...rest }) => rest),
        };
      }

      // hebrewpara 우선순위: 매니페스트(사람이 쓴 자연 문장) → 자동 채움(짝대기).
      // 출력 JSON 자체는 매번 새로 만든다 — 사람이 다듬은 라인은 매니페스트에만
      // 저장하는 단일 소스 원칙. (priorParaByRef 는 추후 마이그레이션용 보조.)
      const manualKey = `${chNo}:${n}`;
      const manualLine = manualByKey.get(manualKey);
      if (manualLine) {
        layers.hebrewpara = { type: "text", content: manualLine };
        paraManual += 1;
      } else {
        const auto = buildHebrewpara(words);
        if (auto) {
          layers.hebrewpara = { type: "text", content: auto };
          paraAuto += 1;
        } else {
          paraEmpty += 1;
        }
      }

      const kidsT = (kidsMap.get(n) || "").trim();
      if (kidsT) layers.kids = { type: "text", content: kidsT };

      verses.push({ ref, layers });
    }
    chapters.push({ chapter: chNo, verses });
  }

  const output = {
    book: BOOK.label,
    direction: "rtl",
    layerOrder: ["krv", "hebrew", "hebrewpara", "kids"],
    layerLabels: {
      krv: "개역한글",
      hebrew: "히브리어",
      hebrewpara: "히브리 풀이/의역",
      kids: "어린이 의역",
    },
    defaultOn: ["krv", "hebrew"],
    sources: {
      hebrew:
        "Westminster Leningrad Codex (Public Domain) · 형태 분석 Open Scriptures Hebrew Bible morphhb (CC BY 4.0) · 사전 OSHB HebrewLexicon (Strong's, Public Domain)",
      krv: "성경전서 개역한글판 — 퍼블릭 도메인",
      hebrewpara:
        "히브리 풀이/의역 — OSHB HebrewLexicon 한국어 뜻을 토큰 순서대로 이어 만든 학습용 2차 저작물 (자동 채움, 사람이 다듬은 라인은 보존)",
      kids: "어린이 의역 — 개역한글 기반 직접 제작한 학습용 2차 저작물",
    },
    chapters,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output) + "\n", "utf8");
  const sizeKb = (fs.statSync(OUT_PATH).size / 1024).toFixed(1);

  console.log(
    `✅ ${BOOK.label}(${BOOK.id}) → ${OUT_REL}`,
  );
  console.log(
    `   장 ${chapters.length} · 절 ${totalVerses} · 토큰 ${totalTokens} · ${sizeKb}KB`,
  );
  console.log(
    `   hebrewpara — 사람 작성 ${paraManual}절 · 자동 짝대기 ${paraAuto}절 · 빈 ${paraEmpty}절 · 매니페스트 ${manualByKey.size}건`,
  );
  // 보존 카운터(쓰이지 않게 됨) — 정책 변경 후 흔적 제거.
  void paraPreserved;
}

build();
