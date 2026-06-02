// =============================================================================
// 개역한글(KRV) 전권 → 우리 BibleData 스키마 변환 스크립트
//
// 원본:
//   scrollmapper/bible_databases (2025-languages branch)
//   sources/ko/KorRV/KorRV.json
//   License: Public Domain (저장소 README 명시)
//
// 동작:
//   1) 원본 JSON 로드 (영어 책명 + verses[*].text 구조)
//   2) 영어 책명 → 우리 BookId/한국어 이름/약어 매핑
//   3) 기존 5권(proverbs/matthew/mark/luke/john) 은 절대 덮어쓰지 않음
//      (쉬운말 번역까지 포함되어 있어 보존이 필수)
//   4) 신규 61권만 app/bible-reading/<id>.json 으로 출력
//      - translations.kids 자리는 유지하되 "준비 중" note
//      - verses.kids 는 []  → 기존 UI 의 hasKids 체크가 자연스럽게 false
//      - chapter.title 은 ""  (원본에 한국어 장 제목 없음)
//   5) books.ts 에 들어갈 메타데이터 + import 라인을 출력해서 stdout 에 표시
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const sourcePath = path.join(repoRoot, "tmp/bible-sources/KorRV.json");
const outDir = path.join(repoRoot, "app/bible-reading");

// 영어 원본 책명 → 우리 메타데이터
// id 는 ASCII 소문자 (파일명·BookId 동시 사용)
// shortName 은 한국어 약어 (기존 5권 컨벤션 그대로 — 잠/마/막/눅/요)
const BOOK_MAP = [
  ["Genesis", "genesis", "창세기", "창"],
  ["Exodus", "exodus", "출애굽기", "출"],
  ["Leviticus", "leviticus", "레위기", "레"],
  ["Numbers", "numbers", "민수기", "민"],
  ["Deuteronomy", "deuteronomy", "신명기", "신"],
  ["Joshua", "joshua", "여호수아", "수"],
  ["Judges", "judges", "사사기", "삿"],
  ["Ruth", "ruth", "룻기", "룻"],
  ["I Samuel", "samuel1", "사무엘상", "삼상"],
  ["II Samuel", "samuel2", "사무엘하", "삼하"],
  ["I Kings", "kings1", "열왕기상", "왕상"],
  ["II Kings", "kings2", "열왕기하", "왕하"],
  ["I Chronicles", "chronicles1", "역대상", "대상"],
  ["II Chronicles", "chronicles2", "역대하", "대하"],
  ["Ezra", "ezra", "에스라", "스"],
  ["Nehemiah", "nehemiah", "느헤미야", "느"],
  ["Esther", "esther", "에스더", "에"],
  ["Job", "job", "욥기", "욥"],
  ["Psalms", "psalms", "시편", "시"],
  ["Proverbs", "proverbs", "잠언", "잠"], // existing — skipped
  ["Ecclesiastes", "ecclesiastes", "전도서", "전"],
  ["Song of Solomon", "songofsolomon", "아가", "아"],
  ["Isaiah", "isaiah", "이사야", "사"],
  ["Jeremiah", "jeremiah", "예레미야", "렘"],
  ["Lamentations", "lamentations", "예레미야애가", "애"],
  ["Ezekiel", "ezekiel", "에스겔", "겔"],
  ["Daniel", "daniel", "다니엘", "단"],
  ["Hosea", "hosea", "호세아", "호"],
  ["Joel", "joel", "요엘", "욜"],
  ["Amos", "amos", "아모스", "암"],
  ["Obadiah", "obadiah", "오바댜", "옵"],
  ["Jonah", "jonah", "요나", "욘"],
  ["Micah", "micah", "미가", "미"],
  ["Nahum", "nahum", "나훔", "나"],
  ["Habakkuk", "habakkuk", "하박국", "합"],
  ["Zephaniah", "zephaniah", "스바냐", "습"],
  ["Haggai", "haggai", "학개", "학"],
  ["Zechariah", "zechariah", "스가랴", "슥"],
  ["Malachi", "malachi", "말라기", "말"],
  ["Matthew", "matthew", "마태복음", "마"], // existing
  ["Mark", "mark", "마가복음", "막"],         // existing
  ["Luke", "luke", "누가복음", "눅"],         // existing
  ["John", "john", "요한복음", "요"],         // existing
  ["Acts", "acts", "사도행전", "행"],
  ["Romans", "romans", "로마서", "롬"],
  ["I Corinthians", "corinthians1", "고린도전서", "고전"],
  ["II Corinthians", "corinthians2", "고린도후서", "고후"],
  ["Galatians", "galatians", "갈라디아서", "갈"],
  ["Ephesians", "ephesians", "에베소서", "엡"],
  ["Philippians", "philippians", "빌립보서", "빌"],
  ["Colossians", "colossians", "골로새서", "골"],
  ["I Thessalonians", "thessalonians1", "데살로니가전서", "살전"],
  ["II Thessalonians", "thessalonians2", "데살로니가후서", "살후"],
  ["I Timothy", "timothy1", "디모데전서", "딤전"],
  ["II Timothy", "timothy2", "디모데후서", "딤후"],
  ["Titus", "titus", "디도서", "딛"],
  ["Philemon", "philemon", "빌레몬서", "몬"],
  ["Hebrews", "hebrews", "히브리서", "히"],
  ["James", "james", "야고보서", "약"],
  ["I Peter", "peter1", "베드로전서", "벧전"],
  ["II Peter", "peter2", "베드로후서", "벧후"],
  ["I John", "john1", "요한일서", "요일"],
  ["II John", "john2", "요한이서", "요이"],
  ["III John", "john3", "요한삼서", "요삼"],
  ["Jude", "jude", "유다서", "유"],
  ["Revelation of John", "revelation", "요한계시록", "계"],
];

// 보존 대상(절대 덮어쓰지 않음) — 기존 데이터 + 쉬운말 번역이 들어있는 5권
const EXISTING_IDS = new Set(["proverbs", "matthew", "mark", "luke", "john"]);

// 라이선스 근거(코드/JSON note 양쪽에 명시):
//   대한성서공회(bskorea.or.kr) 공식 저작권 FAQ —
//   "성경전서 개역한글판은 저작재산권 보호기간 50년이 경과되어
//    저작권료 지급 없이 사용 가능"
//   (※ 개역개정판 NKRV 는 본 규정 적용 대상 아님 — 본 데이터는 KRV 한정)
//
// 데이터 출처:
//   scrollmapper/bible_databases (GitHub) — 2025-languages branch
//   sources/ko/KorRV/KorRV.json — 저장소 README: License = Public Domain
//
// 텍스트 정합성 검증(KRV 확정):
//   시 23:1   "내가 부족함이 없으리로다"      (KRV. NKRV 는 "내게")
//   요 3:16   "저를 ... 멸망치 ... 하심이니라" (KRV. NKRV 는 "그를 ... 멸망하지 ... 하심이라")
//   고전 13:13 "세가지는 ... 그 중에 제일은"   (KRV. NKRV 는 "세 가지는 ... 그 중의 제일은")
const SOURCE_NOTE =
  "성경전서 개역한글판 (대한성서공회, 1961). 라이선스: 대한성서공회 공식 저작권 FAQ에 따라 저작재산권 보호기간 50년 경과로 저작권료 지급 없이 사용 가능 공공저작물 (개역개정판은 해당 없음). 데이터 출처: scrollmapper/bible_databases (GitHub, 2025-languages branch, sources/ko/KorRV/KorRV.json, License: Public Domain).";
const KIDS_PENDING_NOTE = "쉬운말 번역 준비 중입니다.";

const raw = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
if (!raw?.books || !Array.isArray(raw.books) || raw.books.length !== 66) {
  console.error(`[abort] 원본 구조 이상: books.length=${raw?.books?.length}`);
  process.exit(1);
}

// 원본 영어 책 이름 -> 책 객체 (빠른 lookup)
const byName = new Map(raw.books.map((b) => [b.name, b]));

// =========================================================================
// 안전망: 원본이 KRV(개역한글) 인지 NKRV(개역개정) 인지 자동 검증.
//   사용자 요구사항 — "반드시 개역한글판 데이터만 쓸 것"
//   KRV/NKRV 가 결정적으로 갈리는 절을 골라 원본 텍스트 패턴을 점검한다.
//   하나라도 NKRV 패턴이면 abort.
// =========================================================================
const KRV_CHECKS = [
  {
    book: "Psalms",
    chapter: 23,
    verse: 1,
    krvSubstr: "내가 부족함이",
    nkrvSubstr: "내게 부족함이",
    label: "시 23:1",
  },
  {
    book: "John",
    chapter: 3,
    verse: 16,
    krvSubstr: "저를 믿는 자마다 멸망치",
    nkrvSubstr: "그를 믿는 자마다 멸망하지",
    label: "요 3:16",
  },
  {
    book: "I Corinthians",
    chapter: 13,
    verse: 13,
    krvSubstr: "세가지는",
    nkrvSubstr: "세 가지는",
    label: "고전 13:13",
  },
];

for (const c of KRV_CHECKS) {
  const b = byName.get(c.book);
  if (!b) {
    console.error(`[abort] KRV 검증 실패: 원본에 ${c.book} 없음`);
    process.exit(1);
  }
  const ch = b.chapters.find((x) => x.chapter === c.chapter);
  if (!ch) {
    console.error(`[abort] KRV 검증 실패: ${c.label} 장 없음`);
    process.exit(1);
  }
  const v = ch.verses.find((x) => x.verse === c.verse);
  if (!v) {
    console.error(`[abort] KRV 검증 실패: ${c.label} 절 없음`);
    process.exit(1);
  }
  const text = String(v.text);
  if (text.includes(c.nkrvSubstr) && !text.includes(c.krvSubstr)) {
    console.error(
      `[abort] NKRV(개역개정) 패턴 검출 — ${c.label}\n  원본: "${text}"\n  KRV 기대: "${c.krvSubstr}" / NKRV: "${c.nkrvSubstr}"`,
    );
    console.error(
      "  본 스크립트는 개역한글(KRV) 만 허용합니다. 원본 데이터셋을 확인하세요.",
    );
    process.exit(1);
  }
  if (!text.includes(c.krvSubstr)) {
    console.error(
      `[abort] KRV 패턴도 NKRV 패턴도 아닌 텍스트 — ${c.label}\n  원본: "${text}"`,
    );
    process.exit(1);
  }
  console.log(`[KRV check] ${c.label} OK ("${c.krvSubstr}" 확인)`);
}
console.log("");

const written = [];
const skipped = [];
const verseCounts = [];

for (const [enName, id, koName, shortName] of BOOK_MAP) {
  const src = byName.get(enName);
  if (!src) {
    console.error(`[abort] 원본에 책 없음: ${enName}`);
    process.exit(1);
  }
  const totalChapters = src.chapters.length;
  const totalVerses = src.chapters.reduce(
    (sum, c) => sum + c.verses.length,
    0,
  );
  verseCounts.push({ id, koName, totalChapters, totalVerses });

  if (EXISTING_IDS.has(id)) {
    skipped.push({ id, koName, totalChapters, totalVerses });
    continue;
  }

  const chapters = src.chapters.map((ch) => {
    const krv = ch.verses.map((v) => ({
      n: v.verse,
      // 원본 끝에 trailing space 가 일관되게 붙어있어 trim 처리.
      // (절 내부 공백/구두점은 손대지 않음 — 데이터 원형 보존이 원칙)
      t: String(v.text).trim(),
    }));
    return {
      chapter: ch.chapter,
      title: "", // 개역한글 원전에 장 제목 없음 (추후 수동 보강 여지)
      verses: {
        krv,
        kids: [], // 신규 책: 쉬운말 번역 미준비
      },
    };
  });

  const bookData = {
    translations: {
      krv: { label: "개역한글", note: SOURCE_NOTE },
      kids: { label: "쉬운말", note: KIDS_PENDING_NOTE },
    },
    chapters,
  };

  const outPath = path.join(outDir, `${id}.json`);
  fs.writeFileSync(outPath, JSON.stringify(bookData, null, 2) + "\n", "utf8");
  written.push({ id, koName, totalChapters, totalVerses, outPath });
}

console.log("\n=== 변환 결과 ===");
console.log(`보존(기존 5권, 덮어쓰기 안 함):`);
for (const s of skipped) {
  console.log(`  · ${s.id.padEnd(14)} ${s.koName.padEnd(10)} ${s.totalChapters}장 ${s.totalVerses}절`);
}
console.log(`\n신규 작성(${written.length}권):`);
for (const w of written) {
  console.log(`  · ${w.id.padEnd(14)} ${w.koName.padEnd(10)} ${w.totalChapters}장 ${w.totalVerses}절`);
}

const totalNew = written.reduce((s, w) => s + w.totalVerses, 0);
const totalAll = verseCounts.reduce((s, w) => s + w.totalVerses, 0);
console.log(`\n총 신규 절: ${totalNew}`);
console.log(`총 전체 절(66권): ${totalAll}`);

// books.ts 에 들어갈 코드 스니펫 자동 생성
const orderArray = BOOK_MAP.map(([, id]) => `"${id}"`).join(", ");
const booksEntries = BOOK_MAP.map(
  ([, id, koName, shortName]) =>
    `  ${id}: { id: "${id}", name: "${koName}", shortName: "${shortName}", totalChapters: ${
      verseCounts.find((v) => v.id === id).totalChapters
    } },`,
).join("\n");
const bookIdUnion = BOOK_MAP.map(([, id]) => `"${id}"`).join(" | ");

const snippetPath = path.join(repoRoot, "tmp/bible-sources/books-ts-snippet.txt");
fs.writeFileSync(
  snippetPath,
  `// === books.ts 갱신용 스니펫 (자동 생성) ===

export type BookId =
  ${bookIdUnion};

export const BOOKS: Record<BookId, BookMeta> = {
${booksEntries}
};

export const BOOK_ORDER: BookId[] = [
  ${orderArray}
];
`,
  "utf8",
);
console.log(`\nbooks.ts 스니펫: ${snippetPath}`);
