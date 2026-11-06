/** 공부 노트 — 장 단위 형광펜·메모 localStorage */

export type MarkType = "hl" | "ul";

export type StudyMark = {
  id: string;
  /** 시작 절 번호 */
  ref: number;
  /** 장 본문(절 연결) 절대 오프셋 */
  start: number;
  end: number;
  type: MarkType;
  /** hl: 색 hex, ul: 밑줄 색 */
  color: string;
  /** 형광펜에 붙인 행간 메모 */
  note?: string;
};

/** 구버전 절 단위 메모 — 읽기 전용 하위 호환 */
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

export const DEFAULT_HL = HL_COLORS[0];
export const UL_COLOR = "#9E1B1B";
export const NOTE_INK = "#B3261E";

export function marksKey(book: string, chapter: number): string {
  return `haruchi/marks/${book}/${chapter}`;
}

export function emptyStudyData(): ChapterStudyData {
  return { marks: [], notes: [] };
}

export function newMarkId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
    const marksRaw = Array.isArray((parsed as ChapterStudyData).marks)
      ? (parsed as ChapterStudyData).marks
      : [];
    let migrated = false;
    const marks = marksRaw
      .map((row) => {
        const m = normalizeMark(row);
        if (!m) return null;
        if (!(row as StudyMark).id) migrated = true;
        return m;
      })
      .filter((m): m is StudyMark => m !== null);
    const notes = Array.isArray((parsed as ChapterStudyData).notes)
      ? (parsed as ChapterStudyData).notes.filter(isNote)
      : [];
    const data = { marks, notes };
    if (migrated) {
      try {
        window.localStorage.setItem(marksKey(book, chapter), JSON.stringify(data));
      } catch {
        /* ignore */
      }
    }
    return data;
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

function normalizeMark(v: unknown): StudyMark | null {
  if (!v || typeof v !== "object") return null;
  const m = v as Partial<StudyMark>;
  if (
    typeof m.ref !== "number" ||
    typeof m.start !== "number" ||
    typeof m.end !== "number" ||
    m.end <= m.start ||
    (m.type !== "hl" && m.type !== "ul") ||
    typeof m.color !== "string"
  ) {
    return null;
  }
  const out: StudyMark = {
    id: typeof m.id === "string" && m.id ? m.id : newMarkId(),
    ref: m.ref,
    start: m.start,
    end: m.end,
    type: m.type,
    color: m.color,
  };
  if (typeof m.note === "string" && m.note.trim()) {
    out.note = m.note;
  }
  return out;
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
