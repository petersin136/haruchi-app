// =============================================================================
// 성경 책 메타데이터 — 개역한글(KRV) 기준 66권.
//   ID 는 ASCII 소문자(파일명 호환), 한국어 약어는 통상 사용 표기 따름.
//   순서(BOOK_ORDER)는 표준 개신교 성경 책 순서(창세기 ~ 요한계시록).
//
//   본문 데이터: app/bible-reading/<id>.json
//     - 기존 5권(잠언/마태/마가/누가/요한): 개역한글 + 쉬운말 양쪽 보유
//     - 신규 61권: 개역한글만 보유 (쉬운말은 verses.kids = [] 빈 배열,
//       UI 의 hasKids 체크가 자연스럽게 false 가 되어 토글이 비활성화됨)
//
//   본문 라이선스: 대한성서공회 공식 저작권 FAQ — 개역한글판은 보호기간
//     50년 경과로 저작권료 지급 없이 사용 가능. (개역개정판은 해당 없음.)
//     상세 근거 / 출처 / 검증: app/bible-reading/DATA-LICENSE.md
// =============================================================================

export type BookId =
  | "genesis"
  | "exodus"
  | "leviticus"
  | "numbers"
  | "deuteronomy"
  | "joshua"
  | "judges"
  | "ruth"
  | "samuel1"
  | "samuel2"
  | "kings1"
  | "kings2"
  | "chronicles1"
  | "chronicles2"
  | "ezra"
  | "nehemiah"
  | "esther"
  | "job"
  | "psalms"
  | "proverbs"
  | "ecclesiastes"
  | "songofsolomon"
  | "isaiah"
  | "jeremiah"
  | "lamentations"
  | "ezekiel"
  | "daniel"
  | "hosea"
  | "joel"
  | "amos"
  | "obadiah"
  | "jonah"
  | "micah"
  | "nahum"
  | "habakkuk"
  | "zephaniah"
  | "haggai"
  | "zechariah"
  | "malachi"
  | "matthew"
  | "mark"
  | "luke"
  | "john"
  | "acts"
  | "romans"
  | "corinthians1"
  | "corinthians2"
  | "galatians"
  | "ephesians"
  | "philippians"
  | "colossians"
  | "thessalonians1"
  | "thessalonians2"
  | "timothy1"
  | "timothy2"
  | "titus"
  | "philemon"
  | "hebrews"
  | "james"
  | "peter1"
  | "peter2"
  | "john1"
  | "john2"
  | "john3"
  | "jude"
  | "revelation";

export type BookMeta = {
  id: BookId;
  name: string;
  shortName: string;
  totalChapters: number;
};

export const BOOKS: Record<BookId, BookMeta> = {
  genesis: { id: "genesis", name: "창세기", shortName: "창", totalChapters: 50 },
  exodus: { id: "exodus", name: "출애굽기", shortName: "출", totalChapters: 40 },
  leviticus: { id: "leviticus", name: "레위기", shortName: "레", totalChapters: 27 },
  numbers: { id: "numbers", name: "민수기", shortName: "민", totalChapters: 36 },
  deuteronomy: { id: "deuteronomy", name: "신명기", shortName: "신", totalChapters: 34 },
  joshua: { id: "joshua", name: "여호수아", shortName: "수", totalChapters: 24 },
  judges: { id: "judges", name: "사사기", shortName: "삿", totalChapters: 21 },
  ruth: { id: "ruth", name: "룻기", shortName: "룻", totalChapters: 4 },
  samuel1: { id: "samuel1", name: "사무엘상", shortName: "삼상", totalChapters: 31 },
  samuel2: { id: "samuel2", name: "사무엘하", shortName: "삼하", totalChapters: 24 },
  kings1: { id: "kings1", name: "열왕기상", shortName: "왕상", totalChapters: 22 },
  kings2: { id: "kings2", name: "열왕기하", shortName: "왕하", totalChapters: 25 },
  chronicles1: { id: "chronicles1", name: "역대상", shortName: "대상", totalChapters: 29 },
  chronicles2: { id: "chronicles2", name: "역대하", shortName: "대하", totalChapters: 36 },
  ezra: { id: "ezra", name: "에스라", shortName: "스", totalChapters: 10 },
  nehemiah: { id: "nehemiah", name: "느헤미야", shortName: "느", totalChapters: 13 },
  esther: { id: "esther", name: "에스더", shortName: "에", totalChapters: 10 },
  job: { id: "job", name: "욥기", shortName: "욥", totalChapters: 42 },
  psalms: { id: "psalms", name: "시편", shortName: "시", totalChapters: 150 },
  proverbs: { id: "proverbs", name: "잠언", shortName: "잠", totalChapters: 31 },
  ecclesiastes: { id: "ecclesiastes", name: "전도서", shortName: "전", totalChapters: 12 },
  songofsolomon: { id: "songofsolomon", name: "아가", shortName: "아", totalChapters: 8 },
  isaiah: { id: "isaiah", name: "이사야", shortName: "사", totalChapters: 66 },
  jeremiah: { id: "jeremiah", name: "예레미야", shortName: "렘", totalChapters: 52 },
  lamentations: { id: "lamentations", name: "예레미야애가", shortName: "애", totalChapters: 5 },
  ezekiel: { id: "ezekiel", name: "에스겔", shortName: "겔", totalChapters: 48 },
  daniel: { id: "daniel", name: "다니엘", shortName: "단", totalChapters: 12 },
  hosea: { id: "hosea", name: "호세아", shortName: "호", totalChapters: 14 },
  joel: { id: "joel", name: "요엘", shortName: "욜", totalChapters: 3 },
  amos: { id: "amos", name: "아모스", shortName: "암", totalChapters: 9 },
  obadiah: { id: "obadiah", name: "오바댜", shortName: "옵", totalChapters: 1 },
  jonah: { id: "jonah", name: "요나", shortName: "욘", totalChapters: 4 },
  micah: { id: "micah", name: "미가", shortName: "미", totalChapters: 7 },
  nahum: { id: "nahum", name: "나훔", shortName: "나", totalChapters: 3 },
  habakkuk: { id: "habakkuk", name: "하박국", shortName: "합", totalChapters: 3 },
  zephaniah: { id: "zephaniah", name: "스바냐", shortName: "습", totalChapters: 3 },
  haggai: { id: "haggai", name: "학개", shortName: "학", totalChapters: 2 },
  zechariah: { id: "zechariah", name: "스가랴", shortName: "슥", totalChapters: 14 },
  malachi: { id: "malachi", name: "말라기", shortName: "말", totalChapters: 4 },
  matthew: { id: "matthew", name: "마태복음", shortName: "마", totalChapters: 28 },
  mark: { id: "mark", name: "마가복음", shortName: "막", totalChapters: 16 },
  luke: { id: "luke", name: "누가복음", shortName: "눅", totalChapters: 24 },
  john: { id: "john", name: "요한복음", shortName: "요", totalChapters: 21 },
  acts: { id: "acts", name: "사도행전", shortName: "행", totalChapters: 28 },
  romans: { id: "romans", name: "로마서", shortName: "롬", totalChapters: 16 },
  corinthians1: { id: "corinthians1", name: "고린도전서", shortName: "고전", totalChapters: 16 },
  corinthians2: { id: "corinthians2", name: "고린도후서", shortName: "고후", totalChapters: 13 },
  galatians: { id: "galatians", name: "갈라디아서", shortName: "갈", totalChapters: 6 },
  ephesians: { id: "ephesians", name: "에베소서", shortName: "엡", totalChapters: 6 },
  philippians: { id: "philippians", name: "빌립보서", shortName: "빌", totalChapters: 4 },
  colossians: { id: "colossians", name: "골로새서", shortName: "골", totalChapters: 4 },
  thessalonians1: { id: "thessalonians1", name: "데살로니가전서", shortName: "살전", totalChapters: 5 },
  thessalonians2: { id: "thessalonians2", name: "데살로니가후서", shortName: "살후", totalChapters: 3 },
  timothy1: { id: "timothy1", name: "디모데전서", shortName: "딤전", totalChapters: 6 },
  timothy2: { id: "timothy2", name: "디모데후서", shortName: "딤후", totalChapters: 4 },
  titus: { id: "titus", name: "디도서", shortName: "딛", totalChapters: 3 },
  philemon: { id: "philemon", name: "빌레몬서", shortName: "몬", totalChapters: 1 },
  hebrews: { id: "hebrews", name: "히브리서", shortName: "히", totalChapters: 13 },
  james: { id: "james", name: "야고보서", shortName: "약", totalChapters: 5 },
  peter1: { id: "peter1", name: "베드로전서", shortName: "벧전", totalChapters: 5 },
  peter2: { id: "peter2", name: "베드로후서", shortName: "벧후", totalChapters: 3 },
  john1: { id: "john1", name: "요한일서", shortName: "요일", totalChapters: 5 },
  john2: { id: "john2", name: "요한이서", shortName: "요이", totalChapters: 1 },
  john3: { id: "john3", name: "요한삼서", shortName: "요삼", totalChapters: 1 },
  jude: { id: "jude", name: "유다서", shortName: "유", totalChapters: 1 },
  revelation: { id: "revelation", name: "요한계시록", shortName: "계", totalChapters: 22 },
};

// 표준 개신교 성경 책 순서(창세기 → 요한계시록).
// UI 의 책 드롭다운/검색 결과 정렬 등 모든 곳에서 이 순서를 따른다.
export const BOOK_ORDER: BookId[] = [
  "genesis",
  "exodus",
  "leviticus",
  "numbers",
  "deuteronomy",
  "joshua",
  "judges",
  "ruth",
  "samuel1",
  "samuel2",
  "kings1",
  "kings2",
  "chronicles1",
  "chronicles2",
  "ezra",
  "nehemiah",
  "esther",
  "job",
  "psalms",
  "proverbs",
  "ecclesiastes",
  "songofsolomon",
  "isaiah",
  "jeremiah",
  "lamentations",
  "ezekiel",
  "daniel",
  "hosea",
  "joel",
  "amos",
  "obadiah",
  "jonah",
  "micah",
  "nahum",
  "habakkuk",
  "zephaniah",
  "haggai",
  "zechariah",
  "malachi",
  "matthew",
  "mark",
  "luke",
  "john",
  "acts",
  "romans",
  "corinthians1",
  "corinthians2",
  "galatians",
  "ephesians",
  "philippians",
  "colossians",
  "thessalonians1",
  "thessalonians2",
  "timothy1",
  "timothy2",
  "titus",
  "philemon",
  "hebrews",
  "james",
  "peter1",
  "peter2",
  "john1",
  "john2",
  "john3",
  "jude",
  "revelation",
];
