// =============================================================================
// 성경 본문 데이터 단일 진입점.
//
//   - 66권의 JSON 을 정적 import 해 `BOOK_DATA: Record<BookId, BibleData>` 로 노출.
//   - page.tsx (읽기) / bibleSearch.ts (검색) 양쪽이 같은 객체를 공유해
//     번들에 본문 데이터가 중복 포함되지 않도록 한다.
//   - 옵션 A(오프라인 우선) 정책에 따라 정적 import. 빌드타임 트리쉐이킹은
//     불가능하나(이미 다 쓰임), 한 번 로드되면 메모리에 상주해 검색·읽기 모두 즉답.
//
//   타입 메모:
//     - 신규 61권의 `translations.kids` 는 placeholder 라벨만 가지며 verses.kids = [].
//       UI 의 `hasKids = verses.kids.length > 0` 체크로 자연스럽게 비활성화된다.
//     - 기존 5권(잠언/마태/마가/누가/요한)은 쉬운말 번역까지 보유.
//
// ─────────────────────────────────────────────────────────────────────────────
//  데이터 라이선스 / 출처  ── 자세한 내용은 app/bible-reading/DATA-LICENSE.md
// ─────────────────────────────────────────────────────────────────────────────
//   본문: 성경전서 개역한글판 (KRV, 대한성서공회, 1961).
//
//   라이선스 근거:
//     대한성서공회(bskorea.or.kr) 공식 저작권 FAQ —
//     "성경전서 개역한글판은 저작재산권 보호기간 50년이 경과되어
//      저작권료 지급 없이 사용 가능"
//     (※ 개역개정판 NKRV 는 해당되지 않으므로 본 앱은 절대 NKRV 를 쓰지 않는다.
//        scripts/import-bible-krv.mjs 의 KRV_CHECKS 가 변환 시점에 자동 검증함.)
//
//   데이터 출처:
//     scrollmapper/bible_databases (GitHub) — 2025-languages branch
//     sources/ko/KorRV/KorRV.json (저장소 README: License = Public Domain)
//
//   KRV 확정 검증(텍스트 단위 차이):
//     · 시 23:1   "내가 부족함이 없으리로다"      (KRV. NKRV 는 "내게")
//     · 요 3:16   "저를 ... 멸망치 ... 하심이니라" (KRV. NKRV 는 "그를 ... 멸망하지 ... 하심이라")
//     · 고전 13:13 "세가지는 ... 그 중에 제일은"   (KRV. NKRV 는 "세 가지는 ... 그 중의 제일은")
// =============================================================================

import { BOOK_ORDER, type BookId } from "./books";

// ─── 구약 39권 ──────────────────────────────────────────────────────────────
import genesisData from "./genesis.json";
import exodusData from "./exodus.json";
import leviticusData from "./leviticus.json";
import numbersData from "./numbers.json";
import deuteronomyData from "./deuteronomy.json";
import joshuaData from "./joshua.json";
import judgesData from "./judges.json";
import ruthData from "./ruth.json";
import samuel1Data from "./samuel1.json";
import samuel2Data from "./samuel2.json";
import kings1Data from "./kings1.json";
import kings2Data from "./kings2.json";
import chronicles1Data from "./chronicles1.json";
import chronicles2Data from "./chronicles2.json";
import ezraData from "./ezra.json";
import nehemiahData from "./nehemiah.json";
import estherData from "./esther.json";
import jobData from "./job.json";
import psalmsData from "./psalms.json";
import proverbsData from "./proverbs.json";
import ecclesiastesData from "./ecclesiastes.json";
import songofsolomonData from "./songofsolomon.json";
import isaiahData from "./isaiah.json";
import jeremiahData from "./jeremiah.json";
import lamentationsData from "./lamentations.json";
import ezekielData from "./ezekiel.json";
import danielData from "./daniel.json";
import hoseaData from "./hosea.json";
import joelData from "./joel.json";
import amosData from "./amos.json";
import obadiahData from "./obadiah.json";
import jonahData from "./jonah.json";
import micahData from "./micah.json";
import nahumData from "./nahum.json";
import habakkukData from "./habakkuk.json";
import zephaniahData from "./zephaniah.json";
import haggaiData from "./haggai.json";
import zechariahData from "./zechariah.json";
import malachiData from "./malachi.json";

// ─── 신약 27권 ──────────────────────────────────────────────────────────────
import matthewData from "./matthew.json";
import markData from "./mark.json";
import lukeData from "./luke.json";
import johnData from "./john.json";
import actsData from "./acts.json";
import romansData from "./romans.json";
import corinthians1Data from "./corinthians1.json";
import corinthians2Data from "./corinthians2.json";
import galatiansData from "./galatians.json";
import ephesiansData from "./ephesians.json";
import philippiansData from "./philippians.json";
import colossiansData from "./colossians.json";
import thessalonians1Data from "./thessalonians1.json";
import thessalonians2Data from "./thessalonians2.json";
import timothy1Data from "./timothy1.json";
import timothy2Data from "./timothy2.json";
import titusData from "./titus.json";
import philemonData from "./philemon.json";
import hebrewsData from "./hebrews.json";
import jamesData from "./james.json";
import peter1Data from "./peter1.json";
import peter2Data from "./peter2.json";
import john1Data from "./john1.json";
import john2Data from "./john2.json";
import john3Data from "./john3.json";
import judeData from "./jude.json";
import revelationData from "./revelation.json";

export type TranslationKey = "krv" | "kids";

export type Verse = {
  n: number;
  t: string;
};

export type Chapter = {
  chapter: number;
  title: string;
  verses: Record<TranslationKey, Verse[]>;
};

export type BibleData = {
  translations: Record<TranslationKey, { label: string; note?: string }>;
  chapters: Chapter[];
};

export const BOOK_DATA: Record<BookId, BibleData> = {
  genesis: genesisData as BibleData,
  exodus: exodusData as BibleData,
  leviticus: leviticusData as BibleData,
  numbers: numbersData as BibleData,
  deuteronomy: deuteronomyData as BibleData,
  joshua: joshuaData as BibleData,
  judges: judgesData as BibleData,
  ruth: ruthData as BibleData,
  samuel1: samuel1Data as BibleData,
  samuel2: samuel2Data as BibleData,
  kings1: kings1Data as BibleData,
  kings2: kings2Data as BibleData,
  chronicles1: chronicles1Data as BibleData,
  chronicles2: chronicles2Data as BibleData,
  ezra: ezraData as BibleData,
  nehemiah: nehemiahData as BibleData,
  esther: estherData as BibleData,
  job: jobData as BibleData,
  psalms: psalmsData as BibleData,
  proverbs: proverbsData as BibleData,
  ecclesiastes: ecclesiastesData as BibleData,
  songofsolomon: songofsolomonData as BibleData,
  isaiah: isaiahData as BibleData,
  jeremiah: jeremiahData as BibleData,
  lamentations: lamentationsData as BibleData,
  ezekiel: ezekielData as BibleData,
  daniel: danielData as BibleData,
  hosea: hoseaData as BibleData,
  joel: joelData as BibleData,
  amos: amosData as BibleData,
  obadiah: obadiahData as BibleData,
  jonah: jonahData as BibleData,
  micah: micahData as BibleData,
  nahum: nahumData as BibleData,
  habakkuk: habakkukData as BibleData,
  zephaniah: zephaniahData as BibleData,
  haggai: haggaiData as BibleData,
  zechariah: zechariahData as BibleData,
  malachi: malachiData as BibleData,
  matthew: matthewData as BibleData,
  mark: markData as BibleData,
  luke: lukeData as BibleData,
  john: johnData as BibleData,
  acts: actsData as BibleData,
  romans: romansData as BibleData,
  corinthians1: corinthians1Data as BibleData,
  corinthians2: corinthians2Data as BibleData,
  galatians: galatiansData as BibleData,
  ephesians: ephesiansData as BibleData,
  philippians: philippiansData as BibleData,
  colossians: colossiansData as BibleData,
  thessalonians1: thessalonians1Data as BibleData,
  thessalonians2: thessalonians2Data as BibleData,
  timothy1: timothy1Data as BibleData,
  timothy2: timothy2Data as BibleData,
  titus: titusData as BibleData,
  philemon: philemonData as BibleData,
  hebrews: hebrewsData as BibleData,
  james: jamesData as BibleData,
  peter1: peter1Data as BibleData,
  peter2: peter2Data as BibleData,
  john1: john1Data as BibleData,
  john2: john2Data as BibleData,
  john3: john3Data as BibleData,
  jude: judeData as BibleData,
  revelation: revelationData as BibleData,
};

// 검색·검수용 헬퍼: 한 권에 쉬운말(kids) 번역이 한 절이라도 있으면 true.
// (현재는 기존 5권만 true) UI 의 토글 비활성화 판정과 함께 사용 가능.
export const hasKidsTranslation = (bookId: BookId): boolean => {
  const data = BOOK_DATA[bookId];
  for (const ch of data.chapters) {
    if ((ch.verses.kids?.length ?? 0) > 0) return true;
  }
  return false;
};

// 디버그/통계: 전체 절 수 (책당 합산). 콘솔 검수용으로 안전하게 노출.
export const computeTotalVerses = (): number => {
  let total = 0;
  for (const id of BOOK_ORDER) {
    for (const ch of BOOK_DATA[id].chapters) {
      total += ch.verses.krv?.length ?? 0;
    }
  }
  return total;
};
