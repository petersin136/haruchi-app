// =============================================================================
// 구약 히브리어 "헬라어 v2 와 동일 형식" 데이터 빌더.
//
// 헬라어용 build-gospel-v2.mjs 와 같은 자리. OSHB(WLC + morphhb, CC BY 4.0)
// 의 책별 OSIS XML 을 입력으로 받아 app/bible-reading/<book>-v2.json 을
// 생성한다.
//
// 사용:
//   node scripts/build-tanakh-v2.mjs                # 등록된 책 모두
//   node scripts/build-tanakh-v2.mjs genesis        # 특정 책만
//
// 입력:
//   - .cache/oshb/<OsisCode>.xml         (OSHB XML, 예: Gen.xml)
//   - .cache/oshb/strong-he.json         (Strong's 영어 fallback 사전 — 캐시)
//   - scripts/lib/tanakh-lexicon.mjs     (한국어 어휘집)
//   - scripts/lib/hebrew-pron.mjs        (음역)
//   - scripts/lib/hebrew-morph-parse.mjs (모폴로지 디코더)
//   - app/bible-reading/<book>.json      (verses.krv — 한국 의역으로 임시 사용)
//
// 출력 스키마 (헬라어 v2 와 동일):
//   { meta, chapters: [{ chapter, verses: [{ n, copyHebrew, copyKr, tokens: [...] }] }] }
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pron, stripHebrewAccents } from "./lib/hebrew-pron.mjs";
import { decodeMorph, PREFIX_LEMMA } from "./lib/hebrew-morph-parse.mjs";
import {
  TANAKH_LEXICON,
  normalizeStrong,
  lookupTanakh,
} from "./lib/tanakh-lexicon.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

// ── 등록 책 (OSIS 코드 ↔ 우리 책 id) ──────────────────────────────────────
const BOOKS = [
  { id: "genesis", label: "창세기", osis: "Gen" },
  { id: "exodus", label: "출애굽기", osis: "Exod" },
  { id: "leviticus", label: "레위기", osis: "Lev" },
  { id: "numbers", label: "민수기", osis: "Num" },
  { id: "deuteronomy", label: "신명기", osis: "Deut" },
  { id: "joshua", label: "여호수아", osis: "Josh" },
  { id: "judges", label: "사사기", osis: "Judg" },
  { id: "ruth", label: "룻기", osis: "Ruth" },
  { id: "samuel1", label: "사무엘상", osis: "1Sam" },
  { id: "samuel2", label: "사무엘하", osis: "2Sam" },
  { id: "kings1", label: "열왕기상", osis: "1Kgs" },
  { id: "kings2", label: "열왕기하", osis: "2Kgs" },
  { id: "chronicles1", label: "역대상", osis: "1Chr" },
  { id: "chronicles2", label: "역대하", osis: "2Chr" },
  { id: "ezra", label: "에스라", osis: "Ezra" },
  { id: "nehemiah", label: "느헤미야", osis: "Neh" },
  { id: "esther", label: "에스더", osis: "Esth" },
  { id: "job", label: "욥기", osis: "Job" },
  { id: "psalms", label: "시편", osis: "Ps" },
  { id: "proverbs", label: "잠언", osis: "Prov" },
  { id: "ecclesiastes", label: "전도서", osis: "Eccl" },
  { id: "songofsolomon", label: "아가", osis: "Song" },
  { id: "isaiah", label: "이사야", osis: "Isa" },
  { id: "jeremiah", label: "예레미야", osis: "Jer" },
  { id: "lamentations", label: "예레미야애가", osis: "Lam" },
  { id: "ezekiel", label: "에스겔", osis: "Ezek" },
  { id: "daniel", label: "다니엘", osis: "Dan" },
  { id: "hosea", label: "호세아", osis: "Hos" },
  { id: "joel", label: "요엘", osis: "Joel" },
  { id: "amos", label: "아모스", osis: "Amos" },
  { id: "obadiah", label: "오바댜", osis: "Obad" },
  { id: "jonah", label: "요나", osis: "Jonah" },
  { id: "micah", label: "미가", osis: "Mic" },
  { id: "nahum", label: "나훔", osis: "Nah" },
  { id: "habakkuk", label: "하박국", osis: "Hab" },
  { id: "zephaniah", label: "스바냐", osis: "Zeph" },
  { id: "haggai", label: "학개", osis: "Hag" },
  { id: "zechariah", label: "스가랴", osis: "Zech" },
  { id: "malachi", label: "말라기", osis: "Mal" },
];

const STRONG_PATH = path.join(repoRoot, ".cache/oshb/strong-he.json");
const STRONG = fs.existsSync(STRONG_PATH)
  ? JSON.parse(fs.readFileSync(STRONG_PATH, "utf8"))
  : {};

// ── OSHB XML 파서 ────────────────────────────────────────────────────────────
function parseOshbXml(xmlPath) {
  const xml = fs.readFileSync(xmlPath, "utf8");
  // 절 단위 슬라이싱
  const verseRe = /<verse osisID="([^"]+)">([\s\S]*?)<\/verse>/g;
  const out = new Map(); // ch -> Map(verse -> rows[])
  let m;
  while ((m = verseRe.exec(xml)) !== null) {
    const bcv = m[1]; // ex: "Gen.1.1"
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
  // 각 <w> 추출. 본문 내 <seg> (maqqef, sof-pasuq 등) 는 무시.
  const wRe = /<w\b([^>]*)>([\s\S]*?)<\/w>/g;
  const rows = [];
  let m;
  while ((m = wRe.exec(body)) !== null) {
    const attrs = m[1];
    const inner = m[2];
    const lemma = attrAt(attrs, "lemma");
    const morph = attrAt(attrs, "morph");
    // 내부 텍스트(자음 + 닉쿠드 + 칸틸레이션)
    const wordRaw = inner
      .replace(/<[^>]+>/g, "") // 내부 태그 (<w src="...">N</w> 등) 제거
      .trim();
    rows.push({ word: wordRaw, lemma, morph });
  }
  return rows;
}

function attrAt(attrs, name) {
  const re = new RegExp(`\\b${name}="([^"]*)"`);
  const m = attrs.match(re);
  return m ? m[1] : "";
}

// ── 한 절 빌드 ──────────────────────────────────────────────────────────────
function buildVerse(rows, n) {
  const tokens = [];
  const copyParts = [];
  const missing = []; // 한국어/영어 모두 비어 있는 lemma
  const missingKorean = []; // 한국어는 없고 영어 fallback 으로 채워진 lemma

  for (const r of rows) {
    const wordRaw = r.word;
    if (!wordRaw) continue;

    // lemma 와 morph 가 "/" 로 갈라진 경우 — 형태소들. 본 단어가 prefix +
    // 어근 (+ suffix) 의 결합이라는 뜻.
    const lemmaParts = (r.lemma || "").split("/").filter(Boolean);
    const morphParts = (r.morph || "").split("/").filter(Boolean);

    // 대표(주된) 어근 lemma 찾기: prefix(소문자 1글자) 가 아닌 첫 항목.
    let mainIdx = lemmaParts.findIndex(
      (lp) => !(lp.length <= 2 && /^[a-z]+$/.test(lp.trim())),
    );
    // 모든 형태소가 prefix 인 경우 (예: 단독 전치사 לְ) — 첫 prefix 자체를 main 으로.
    const allPrefix = mainIdx < 0;
    if (mainIdx < 0) mainIdx = 0;
    const mainLemmaRaw = lemmaParts[mainIdx] || "";
    const mainStrong = normalizeStrong(mainLemmaRaw);

    // 사전 lookup: 한국어 우선, 없으면 영어 Strong's, 그래도 없으면 prefix 라벨.
    const krLex = lookupTanakh(mainStrong);
    const enEntry = STRONG[mainStrong];
    let gloss = krLex?.gloss || "";
    let meanings = krLex?.meanings || [];
    let nameType = krLex?.nameType || null;
    let note = krLex?.note || "";
    if (!gloss && enEntry) {
      // 1) def 우선, 2) 없으면 usage (KJV 단어 목록) 의 첫 단어, 3) 없으면 xlit
      const fallback = enEntry.def || (enEntry.usage || "").replace(/\.$/, "").split(/[,;]/)[0]?.trim() || "";
      if (fallback) {
        // 영어 fallback 표시는 너무 길게 노출되지 않도록 짧은 키워드로 다듬는다.
        // 예: "fawn-like" → 그대로, "to split (literally or figuratively)" → "to split"
        const shortDef = String(fallback).split(/[(;]/)[0].trim().slice(0, 24);
        gloss = shortDef || fallback;
        meanings = (enEntry.usage || enEntry.def || "")
          .replace(/\.$/, "")
          .split(/[,;]\s*/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 3);
        if (meanings.length === 0) meanings = [gloss];
        // 영어 풀이(meaning) 는 한 줄로만 짧게 (한국어 미정 상태에서 본문 가독성 우선).
        note = "";
        // 한국어 미보유 → 보강 우선순위 리포트용으로 별도 기록.
        if (mainStrong) missingKorean.push(mainStrong);
      }
    }
    // 단독 prefix 의 경우 PREFIX_LEMMA 정보로 채움.
    if (!gloss && allPrefix) {
      const px = PREFIX_LEMMA[mainLemmaRaw.trim()];
      if (px) {
        gloss = px.gloss;
        meanings = [px.gloss];
        note = px.role;
      }
    }
    if (!gloss) missing.push(mainStrong || mainLemmaRaw);

    // prefix 정보 (있으면 별도 메모로 합침)
    const prefixes = lemmaParts.slice(0, mainIdx).filter((lp) => PREFIX_LEMMA[lp.trim()]);
    const prefixNote = prefixes
      .map((p) => `${PREFIX_LEMMA[p.trim()].role} → ${PREFIX_LEMMA[p.trim()].gloss}`)
      .join(" / ");

    // 모폴로지 디코딩
    const morphInfo = decodeMorph(r.morph || "");

    // 발음
    const p = pron(wordRaw);
    // 어근만의 발음 (단어 표제용)
    const lemmaP = enEntry?.h ? pron(enEntry.h) : pron(mainLemmaRaw);
    // 보여줄 lemma 헬라어식 표제: HebrewStrong 의 표제어가 있으면 그쪽이 깔끔.
    const lemmaDisplay = enEntry?.h || mainLemmaRaw;

    tokens.push({
      w: wordRaw,
      p,
      gloss,
      lemma: lemmaDisplay,
      lemmaP,
      pos: morphInfo.parts[0]?.posLabel || morphInfo.posLabel || "",
      posLabel: morphInfo.posLabel || "",
      parse: r.morph || "",
      parseLabel: morphInfo.parseLabel || "",
      parseLabelLong: morphInfo.parseLabelLong || "",
      meanings,
      nameType,
      note: [note, prefixNote].filter(Boolean).join(" · "),
      strong: mainStrong || "",
    });
    copyParts.push(wordRaw);
  }
  return {
    verse: { n, copyHebrew: copyParts.join(" "), copyKr: "", tokens },
    missing,
    missingKorean,
  };
}

// ── 한 책 빌드 ──────────────────────────────────────────────────────────────
function buildBook({ id, label, osis }) {
  const xmlPath = path.join(repoRoot, `.cache/oshb/${osis}.xml`);
  const bookJsonPath = path.join(repoRoot, `app/bible-reading/${id}.json`);
  const outPath = path.join(repoRoot, `app/bible-reading/${id}-v2.json`);

  if (!fs.existsSync(xmlPath)) {
    console.warn(`⚠️  ${id}: OSHB XML(${xmlPath}) 없음 — 빌드 생략`);
    return null;
  }

  const verses = parseOshbXml(xmlPath);
  // 한국어 의역: 현재는 krv (개역한글) 을 그대로 copyKr 로 사용.
  // 추후 hebrewKr 필드가 만들어지면 우선 사용하도록 분기.
  const bookData = fs.existsSync(bookJsonPath)
    ? JSON.parse(fs.readFileSync(bookJsonPath, "utf8"))
    : { chapters: [] };
  const krByCh = new Map();
  for (const c of bookData.chapters ?? []) {
    const m = new Map();
    for (const v of c.verses?.hebrewKr ?? []) m.set(v.n, v.t);
    if (m.size === 0) {
      for (const v of c.verses?.krv ?? []) m.set(v.n, v.t);
    }
    krByCh.set(c.chapter, m);
  }

  const chapters = [];
  let totalTokens = 0;
  let totalVerses = 0;
  const missingAgg = new Map();
  const missingKoreanAgg = new Map();
  const chNumbers = Array.from(verses.keys()).sort((a, b) => a - b);
  for (const ch of chNumbers) {
    const verseMap = verses.get(ch);
    const krMap = krByCh.get(ch) ?? new Map();
    const vs = [];
    const vNums = Array.from(verseMap.keys()).sort((a, b) => a - b);
    for (const n of vNums) {
      const { verse, missing, missingKorean } = buildVerse(verseMap.get(n), n);
      verse.copyKr = krMap.get(n) ?? "";
      vs.push(verse);
      totalTokens += verse.tokens.length;
      totalVerses += 1;
      for (const key of missing) {
        missingAgg.set(key, (missingAgg.get(key) ?? 0) + 1);
      }
      for (const key of missingKorean) {
        missingKoreanAgg.set(key, (missingKoreanAgg.get(key) ?? 0) + 1);
      }
    }
    chapters.push({ chapter: ch, verses: vs });
  }

  const output = {
    meta: {
      book: id,
      lang: "he",
      dir: "rtl",
      sources: {
        wlc: "Westminster Leningrad Codex (Public Domain)",
        morphhb: "Open Scriptures Hebrew Bible (OSHB) morphhb (CC BY 4.0)",
        lexicon: "OSHB HebrewLexicon — Strong's (Public Domain)",
        kr: "개역한글 참고 의역(본 앱 직접 작성, 학습용)",
      },
    },
    chapters,
  };
  fs.writeFileSync(outPath, JSON.stringify(output) + "\n", "utf8");

  const missingTokens = [...missingAgg.values()].reduce((s, c) => s + c, 0);
  const missingKoreanTokens = [...missingKoreanAgg.values()].reduce(
    (s, c) => s + c,
    0,
  );
  const coverage =
    totalTokens > 0
      ? (((totalTokens - missingTokens) / totalTokens) * 100).toFixed(1)
      : "0.0";
  const koCoverage =
    totalTokens > 0
      ? (
          ((totalTokens - missingKoreanTokens) / totalTokens) *
          100
        ).toFixed(1)
      : "0.0";
  console.log(
    `✅ ${label}(${id}) — ${chapters.length}장 · ${totalVerses}절 · 토큰 ${totalTokens} · 커버리지 ${coverage}% · 한국어 ${koCoverage}% (영어 fallback ${missingKoreanAgg.size}종 / ${missingKoreanTokens} 토큰)`,
  );
  return {
    id,
    label,
    missingAgg,
    missingKoreanAgg,
    totalTokens,
    totalMissingTokens: missingTokens,
    totalMissingKoreanTokens: missingKoreanTokens,
  };
}

function main() {
  const only = process.argv[2];
  const targets = only ? BOOKS.filter((b) => b.id === only) : BOOKS;
  if (only && targets.length === 0) {
    console.error(`알 수 없는 책 id: ${only}`);
    process.exit(1);
  }
  const reports = [];
  for (const b of targets) {
    const r = buildBook(b);
    if (r) reports.push(r);
  }
  if (reports.length >= 1) {
    const merged = new Map();
    const mergedKo = new Map();
    for (const r of reports) {
      for (const [k, c] of r.missingAgg) merged.set(k, (merged.get(k) ?? 0) + c);
      for (const [k, c] of r.missingKoreanAgg)
        mergedKo.set(k, (mergedKo.get(k) ?? 0) + c);
    }
    const totalT = reports.reduce((s, r) => s + r.totalTokens, 0);
    const totalM = reports.reduce((s, r) => s + r.totalMissingTokens, 0);
    const totalMko = reports.reduce(
      (s, r) => s + r.totalMissingKoreanTokens,
      0,
    );
    const cov =
      totalT > 0 ? (((totalT - totalM) / totalT) * 100).toFixed(1) : "0.0";
    const covKo =
      totalT > 0 ? (((totalT - totalMko) / totalT) * 100).toFixed(1) : "0.0";
    console.log(
      `\n📊 합계 — 토큰 ${totalT} · 커버리지 ${cov}% · 한국어 ${covKo}% (영어 fallback ${mergedKo.size}종 / ${totalMko} 토큰)`,
    );
    if (merged.size) {
      const arr = [...merged.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
      console.log("   완전 누락 상위 20 (빈도순):");
      for (const [k, c] of arr) {
        const en = STRONG[k]?.def || STRONG[k]?.usage || "";
        console.log(`     ${c.toString().padStart(4)}회  ${k.padEnd(8)}  ${en}`);
      }
    }
    // 한국어 미보유 lemma 를 TSV 로 덤프 — 보강 우선순위 작업에 사용.
    const koArr = [...mergedKo.entries()].sort((a, b) => b[1] - a[1]);
    const out = ["strong\tcount\thebrew\txlit\tdef\tusage"];
    for (const [k, c] of koArr) {
      const e = STRONG[k] || {};
      const row = [
        k,
        c,
        e.h || "",
        e.xlit || "",
        (e.def || "").replace(/\t/g, " "),
        (e.usage || "").replace(/\t/g, " "),
      ].join("\t");
      out.push(row);
    }
    const reportPath = path.join(repoRoot, ".cache/tanakh-missing-ko.tsv");
    fs.writeFileSync(reportPath, out.join("\n") + "\n", "utf8");
    console.log(`   📝 한국어 미보유 lemma 리포트 → ${reportPath}`);
    if (koArr.length) {
      console.log("   한국어 미보유 상위 30 (빈도순):");
      for (const [k, c] of koArr.slice(0, 30)) {
        const e = STRONG[k] || {};
        const tip = e.def || (e.usage || "").split(/[,;]/)[0] || "";
        console.log(
          `     ${c.toString().padStart(4)}회  ${k.padEnd(8)}  ${(e.h || "").padEnd(10)}  ${tip}`,
        );
      }
    }
  }
}

main();
