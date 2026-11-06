// =============================================================================
// 절마다 "핵심 원어 2~3개" JSON 생성 (구약 히브리어 + 신약 헬라어).
//
// 원본:
//   public/bible-v2/chapters/<bookId>/<chapter>.json
//   히브리어: w, p, gloss, strong(H####), posLabel, parse, nameType
//   헬라어:   w, p, gloss, lemma(그리스 원형), posLabel, nameType (strong 없음)
//
// 산출:
//   public/keywords/<bookId>/<chapter>.json
//     { "<verse>": [{ w, pron, mean, lemma, pos }, ...] }
//     lemma = 히브리어 H#### / 헬라어 원형(lemma)
//   수동 덮어쓰기(있으면): public/keywords/<bookId>.manual.json
//
// 사용:
//   node scripts/build-keywords.mjs genesis
//   node scripts/build-keywords.mjs john
//   node scripts/build-keywords.mjs --all
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const SRC_ROOT = path.join(repoRoot, "public", "bible-v2", "chapters");
const OUT_ROOT = path.join(repoRoot, "public", "keywords");

const MAX_PER_VERSE = 3;

const ALLOWED_POS = new Set(["명사", "동사", "형용사", "고유명사"]);

// 1차 후보에서 제외하는 품사 (히브리어 + 헬라어 라벨)
const BLOCKED_POS = new Set([
  "접속사",
  "전치사",
  "대명사",
  "접미대명사",
  "소사",
  "부사",
  "정관사",
  "인칭대명사",
  "지시대명사",
  "관계대명사",
  "의문/부정 대명사",
]);

// 빈 절 폴백: 정관사·접속사·전치사·대명사(계열)만 제외
const FALLBACK_BLOCKED_POS = new Set([
  "접속사",
  "전치사",
  "대명사",
  "접미대명사",
  "정관사",
  "인칭대명사",
  "지시대명사",
  "관계대명사",
  "의문/부정 대명사",
]);

// 히브리어 — 아주 흔한 Strong (상위권 동사·불변화사·기능어)
const EXCLUDE_STRONG = [
  "H1961", // הָיָה 하야 — 되다/있다
  "H559", // אָמַר 아마르 — 말하다
  "H834", // אֲשֶׁר 아쉐르 — ~하는
  "H853", // אֵת 엣 — 목적격 표지
  "H413", // אֵל 엘 — ~에게
  "H5921", // עַל 알 — ~위에
  "H3588", // כִּי 키 — 왜냐하면
  "H3808", // לֹא 로 — 아니
  "H3605", // כֹּל 콜 — 모든
  "H935", // בּוֹא 보 — 오다
  "H5414", // נָתַן 나탄 — 주다
  "H3947", // לָקַח 라카흐 — 잡다/취하다
  "H7200", // רָאָה 라아 — 보다
  "H6213", // עָשָׂה 아사 — 만들다
  "H1980", // הָלַךְ 할라크 — 가다
  "H7121", // קָרָא 카라 — 부르다
  "H2009", // הִנֵּה 히네 — 보라
  "H1571", // גַּם 감 — 또한
  "H4480", // מִן 민 — ~부터
  "H5704", // עַד 아드 — ~까지
  "H996", // בֵּין 베인 — 사이에
  "H854", // אֵת 엣 — 함께(전치사)
  "H3651", // כֵּן 켄 — 그렇게
  "H3541", // כֹּה 코 — 이같이
  "H2088", // זֶה 제 — 이것
  "H1931", // הוּא 후 — 그
  "H589", // אֲנִי 아니 — 나
  "H859", // אַתָּה 아타 — 너
];
const EXCLUDE_STRONG_SET = new Set(EXCLUDE_STRONG);

// 헬라어 — 아주 흔한 lemma (관사·접속사·대명사·상위권 동사·전치사)
// 매칭은 원본 token.lemma 문자열 그대로.
const EXCLUDE_LEMMA_GREEK = [
  "καί", // 그리고
  "ὁ", // 정관사
  "εἰμί", // 이다/있다
  "λέγω", // 말하다
  "αὐτός", // 그/자신
  "ἐγώ", // 나
  "σύ", // 너
  "οὐ", // 아니다
  "μή", // 아니다(가정/명령)
  "ὅτι", // ~라는/왜냐하면
  "δέ", // 그런데
  "οὖν", // 그러므로
  "γάρ", // 왜냐하면
  "ἀλλά", // 그러나
  "εἰ", // 만약
  "ὡς", // ~같이
  "ἵνα", // 위하여
  "μέν", // (한편)
  "τε", // 그리고
  "οὖτος", // 이것
  "ὅς", // (관계대명사)
  "τίς", // 누구/무엇
  "τις", // 어떤
  "ἐν", // ~안에
  "εἰς", // ~안으로
  "ἐκ", // ~에서
  "πρός", // ~에게
  "διά", // ~통해
  "ἀπό", // ~로부터
  "κατά", // ~따라
  "μετά", // ~함께/후에
  "περί", // ~대하여
  "ὑπό", // ~아래
  "ἐπί", // ~위에
  "παρά", // ~곁에
  "σύν", // ~와 함께
  "ἔρχομαι", // 오다
  "ποιέω", // 행하다
  "ἔχω", // 가지다
  "δίδωμι", // 주다
  "ὁράω", // 보다
  "γίνομαι", // 되다
  "ἀκούω", // 듣다
  "οἶδα", // 알다
  "ἔχω", // 가지다 (중복 방지용 명시)
  "πᾶς", // 모든
  "εἷς", // 하나
  "πολύς", // 많은
];
const EXCLUDE_LEMMA_GREEK_SET = new Set(EXCLUDE_LEMMA_GREEK);

const ALL_BOOK_IDS = fs
  .readdirSync(SRC_ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

/** 히브리어 칸틸레이션·모프 구분자 제거 (니쿠드 유지). 헬라어는 그대로. */
function cleanW(w) {
  return String(w || "")
    .replace(/\//g, "")
    .replace(/[\u0591-\u05AF\u05BD\u05BF\u05C0\u05C3-\u05C5\u05C7]/g, "")
    .trim();
}

function posFromParse(parse) {
  if (!parse) return "";
  const parts = String(parse).split("/");
  const last = parts[parts.length - 1] || "";
  if (/(?:^|[^A-Za-z])Np(?:$|[^a-z])/.test(last) || last.includes("Np")) {
    return "고유명사";
  }
  const core = last.replace(/^H/, "");
  if (core.startsWith("V")) return "동사";
  if (core.startsWith("N")) return "명사";
  if (core.startsWith("A")) return "형용사";
  return "";
}

function contentPos(token) {
  if (token.nameType) return "고유명사";
  if (token.parse && /\bNp\b|HNp/.test(token.parse)) return "고유명사";
  const label = token.posLabel || "";
  if (label === "명사" || label === "동사" || label === "형용사") return label;
  if (label && BLOCKED_POS.has(label)) return "";
  const fromParse = posFromParse(token.parse);
  if (fromParse === "고유명사" || ALLOWED_POS.has(fromParse)) return fromParse;
  // MorphGNT 약호 보조: N-/V-/A-
  if (token.pos === "N-") return "명사";
  if (token.pos === "V-") return "동사";
  if (token.pos === "A-") return "형용사";
  return "";
}

function isHebrewToken(token) {
  return typeof token.strong === "string" && /^H\d+$/.test(token.strong);
}

function lemmaKey(token) {
  if (isHebrewToken(token)) return token.strong;
  return token.lemma || "";
}

function isPrimaryCandidate(token) {
  const key = lemmaKey(token);
  if (!key) return false;
  if (isHebrewToken(token)) {
    if (EXCLUDE_STRONG_SET.has(token.strong)) return false;
  } else if (EXCLUDE_LEMMA_GREEK_SET.has(token.lemma)) {
    return false;
  }
  if (token.posLabel === "접미대명사") return false;
  if (token.posLabel && BLOCKED_POS.has(token.posLabel)) return false;
  const pos = contentPos(token);
  if (!pos || !ALLOWED_POS.has(pos)) return false;
  return true;
}

/** 빈 절 폴백: 정관사·접속사·전치사·대명사만 제외 (흔한 lemma 제외 목록은 적용하지 않음) */
function isFallbackCandidate(token) {
  const key = lemmaKey(token);
  if (!key) return false;
  const label = token.posLabel || "";
  if (label && FALLBACK_BLOCKED_POS.has(label)) return false;
  // posLabel 없어도 첫 형태소 pos 가 기능어면 제외 (히브리어 복합 토큰)
  if (!label && token.pos && FALLBACK_BLOCKED_POS.has(token.pos)) return false;
  // MorphGNT 약호: 관사·접속사·전치사·대명사
  if (/^(RA|C-|P-|RP|RD|RR|RI)$/.test(token.pos || "")) return false;
  return true;
}

function toKeyword(token) {
  const mean =
    (token.gloss && String(token.gloss).trim()) ||
    (Array.isArray(token.meanings) && token.meanings[0]) ||
    "";
  const pos = contentPos(token) || token.posLabel || "";
  return {
    w: cleanW(token.w),
    pron: token.p || "",
    mean,
    lemma: isHebrewToken(token) ? token.strong : token.lemma,
    pos,
  };
}

function wrapToken(token, order) {
  return {
    ...toKeyword(token),
    _order: order,
    _key: lemmaKey(token),
  };
}

function loadBookTokens(bookId) {
  const bookDir = path.join(SRC_ROOT, bookId);
  if (!fs.existsSync(bookDir)) {
    throw new Error(`원본 없음: ${bookDir}`);
  }
  const chapters = [];
  const files = fs
    .readdirSync(bookDir)
    .filter((f) => /^\d+\.json$/.test(f))
    .sort((a, b) => Number(a.replace(".json", "")) - Number(b.replace(".json", "")));

  // 책 전체 lemma 빈도 (폴백 희소도용 — 모든 토큰)
  const allFreq = new Map();

  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(bookDir, f), "utf8"));
    const ch = data.chapter ?? Number(f.replace(".json", ""));
    const verses = [];
    for (const v of data.verses || []) {
      const raw = v.tokens || [];
      for (const t of raw) {
        const key = lemmaKey(t);
        if (key) allFreq.set(key, (allFreq.get(key) || 0) + 1);
      }
      verses.push({
        n: v.n,
        primary: raw.filter(isPrimaryCandidate).map((t, i) => wrapToken(t, i)),
        fallback: raw.filter(isFallbackCandidate).map((t, i) => wrapToken(t, i)),
      });
    }
    chapters.push({ ch, verses });
  }
  return { chapters, allFreq };
}

function primaryFreq(chapters) {
  const freq = new Map();
  for (const { verses } of chapters) {
    for (const v of verses) {
      for (const t of v.primary) {
        freq.set(t._key, (freq.get(t._key) || 0) + 1);
      }
    }
  }
  return freq;
}

function uniqueByKey(tokens) {
  const seen = new Set();
  const uniq = [];
  for (const t of tokens) {
    if (seen.has(t._key)) continue;
    seen.add(t._key);
    uniq.push(t);
  }
  return uniq;
}

function pickRarest(tokens, freq, limit) {
  const uniq = uniqueByKey(tokens);
  uniq.sort(
    (a, b) =>
      (freq.get(a._key) || 0) - (freq.get(b._key) || 0) || a._order - b._order,
  );
  return uniq.slice(0, limit).map(({ w, pron, mean, lemma, pos }) => ({
    w,
    pron,
    mean,
    lemma,
    pos,
  }));
}

function pickForVerse(verse, primaryBookFreq, allFreq) {
  const picked = pickRarest(verse.primary, primaryBookFreq, MAX_PER_VERSE);
  if (picked.length > 0) return picked;
  // 제외 목록 때문에 비면: 기능어만 빼고 가장 드문 1개
  return pickRarest(verse.fallback, allFreq, 1);
}

function applyManual(bookId, byChapter) {
  const manualPath = path.join(OUT_ROOT, `${bookId}.manual.json`);
  if (!fs.existsSync(manualPath)) return byChapter;
  const manual = JSON.parse(fs.readFileSync(manualPath, "utf8"));
  for (const [chKey, verses] of Object.entries(manual)) {
    const chNum = Number(chKey);
    if (!byChapter.has(chNum)) byChapter.set(chNum, {});
    const target = byChapter.get(chNum);
    for (const [vKey, list] of Object.entries(verses)) {
      target[String(vKey)] = list;
    }
  }
  console.log(`[${bookId}] manual 적용: ${manualPath}`);
  return byChapter;
}

function buildBook(bookId) {
  const { chapters, allFreq } = loadBookTokens(bookId);
  const primaryBookFreq = primaryFreq(chapters);
  const byChapter = new Map();

  let tokenOut = 0;
  let missingPos = 0;
  let missingMean = 0;
  let verseCount = 0;
  let emptyVerses = 0;
  let fallbackVerses = 0;

  for (const { ch, verses } of chapters) {
    const out = {};
    for (const v of verses) {
      verseCount++;
      const hadPrimary = v.primary.length > 0;
      const picked = pickForVerse(v, primaryBookFreq, allFreq);
      out[String(v.n)] = picked;
      if (picked.length === 0) emptyVerses++;
      else if (!hadPrimary) fallbackVerses++;
      for (const k of picked) {
        tokenOut++;
        if (!k.pos) missingPos++;
        if (!k.mean) missingMean++;
      }
    }
    byChapter.set(ch, out);
  }

  applyManual(bookId, byChapter);

  const bookDir = path.join(OUT_ROOT, bookId);
  fs.mkdirSync(bookDir, { recursive: true });
  let bytes = 0;
  const chNums = [...byChapter.keys()].sort((a, b) => Number(a) - Number(b));
  for (const ch of chNums) {
    const json = JSON.stringify(byChapter.get(ch));
    fs.writeFileSync(path.join(bookDir, `${ch}.json`), json);
    bytes += Buffer.byteLength(json);
  }

  return {
    chapters: chNums.length,
    bytes,
    tokenOut,
    missingPos,
    missingMean,
    verseCount,
    emptyVerses,
    fallbackVerses,
  };
}

function main() {
  const args = process.argv.slice(2);
  const targets = args.includes("--all") ? ALL_BOOK_IDS : args;

  if (targets.length === 0) {
    console.error("사용법: node scripts/build-keywords.mjs <bookId...> | --all");
    process.exit(1);
  }

  let totalBytes = 0;
  let totalTokens = 0;
  let totalMissingPos = 0;
  let totalMissingMean = 0;
  let totalVerses = 0;
  let totalEmptyVerses = 0;
  let totalFallbackVerses = 0;
  let totalFiles = 0;

  for (const bookId of targets) {
    const r = buildBook(bookId);
    totalBytes += r.bytes;
    totalTokens += r.tokenOut;
    totalMissingPos += r.missingPos;
    totalMissingMean += r.missingMean;
    totalVerses += r.verseCount;
    totalEmptyVerses += r.emptyVerses;
    totalFallbackVerses += r.fallbackVerses;
    totalFiles += r.chapters;
    console.log(
      `[${bookId}] ${r.chapters}장, ${(r.bytes / 1024).toFixed(1)} KB, 키워드 ${r.tokenOut}개, 빈절 ${r.emptyVerses}/${r.verseCount}, 폴백 ${r.fallbackVerses}`,
    );
  }

  console.log(`\n합계: ${totalFiles}개 파일, ${(totalBytes / 1024).toFixed(1)} KB, 키워드 ${totalTokens}개`);
  if (totalTokens) {
    console.log(
      `품사 빈칸: ${totalMissingPos} (${((100 * totalMissingPos) / totalTokens).toFixed(2)}%)`,
    );
    console.log(
      `뜻 빈칸: ${totalMissingMean} (${((100 * totalMissingMean) / totalTokens).toFixed(2)}%)`,
    );
  }
  if (totalVerses) {
    console.log(
      `키워드 0개 절: ${totalEmptyVerses}/${totalVerses} (${((100 * totalEmptyVerses) / totalVerses).toFixed(2)}%)`,
    );
    console.log(`폴백으로 채운 절: ${totalFallbackVerses}`);
  }
}

main();
