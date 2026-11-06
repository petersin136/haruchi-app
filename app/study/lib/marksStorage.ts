/** 공부 노트 — 장 단위 형광펜·메모 localStorage */

export type MarkType = "hl" | "ul";

export type StudyMark = {
  /** 시작 절 번호 */
  ref: number;
  /** 장 본문(절 연결) 절대 오프셋 */
  start: number;
  end: number;
  type: MarkType;
  /** hl: 색 hex, ul: 밑줄 색 (기본 딥레드) */
  color: string;
};

export type StudyNote = {
  ref: number;
  text: string;
  at: string;
};

export type ChapterStudyData = {
  marks: StudyMark[];
  notes: StudyNote[];
};

export const HL_COLORS = [
  "#FFE86B",
  "#C6F0A0",
  "#B9E3FF",
  "#FFC7DA",
] as const;

export const UL_COLOR = "#9E1B1B";

export function marksKey(book: string, chapter: number): string {
  return `haruchi/marks/${book}/${chapter}`;
}

export function emptyStudyData(): ChapterStudyData {
  return { marks: [], notes: [] };
}

export function loadChapterStudy(
  book: string,
  chapter: number,
): ChapterStudyData {
  if (typeof window === "undefined") return emptyStudyData();
  try {
    const raw = window.localStorage.getItem(marksKey(book, chapter));
    if (!raw) return emptyStudyData();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return emptyStudyData();
    const marks = Array.isArray((parsed as ChapterStudyData).marks)
      ? (parsed as ChapterStudyData).marks.filter(isMark)
      : [];
    const notes = Array.isArray((parsed as ChapterStudyData).notes)
      ? (parsed as ChapterStudyData).notes.filter(isNote)
      : [];
    return { marks, notes };
  } catch {
    return emptyStudyData();
  }
}

export function saveChapterStudy(
  book: string,
  chapter: number,
  data: ChapterStudyData,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      marksKey(book, chapter),
      JSON.stringify({
        marks: data.marks,
        notes: data.notes,
      }),
    );
  } catch {
    /* quota / private mode */
  }
}

function isMark(v: unknown): v is StudyMark {
  if (!v || typeof v !== "object") return false;
  const m = v as StudyMark;
  return (
    typeof m.ref === "number" &&
    typeof m.start === "number" &&
    typeof m.end === "number" &&
    m.end > m.start &&
    (m.type === "hl" || m.type === "ul") &&
    typeof m.color === "string"
  );
}

function isNote(v: unknown): v is StudyNote {
  if (!v || typeof v !== "object") return false;
  const n = v as StudyNote;
  return (
    typeof n.ref === "number" &&
    typeof n.text === "string" &&
    typeof n.at === "string"
  );
}
