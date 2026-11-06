import type { Verse } from "../../bible-reading/bibleData";
import type { StudyMark } from "./marksStorage";

export type VerseSpan = {
  n: number;
  start: number;
  end: number;
  text: string;
};

/** 절 본문을 이어 붙인 장 평문 + 절별 오프셋. */
export function buildChapterPlain(verses: Verse[]): {
  plain: string;
  spans: VerseSpan[];
} {
  const spans: VerseSpan[] = [];
  let cursor = 0;
  let plain = "";
  for (const v of verses) {
    const text = v.t ?? "";
    const start = cursor;
    const end = start + text.length;
    spans.push({ n: v.n, start, end, text });
    plain += text;
    cursor = end;
  }
  return { plain, spans };
}

export function verseAtOffset(spans: VerseSpan[], offset: number): number {
  for (const s of spans) {
    if (offset >= s.start && offset < s.end) return s.n;
    if (offset === s.end && offset === s.start + (s.end - s.start)) return s.n;
  }
  for (let i = spans.length - 1; i >= 0; i -= 1) {
    if (offset >= spans[i].start) return spans[i].n;
  }
  return spans[0]?.n ?? 1;
}

export type SegStyle = {
  hl?: string;
  ul?: boolean;
  markIds: string[];
  /** 이 조각이 어떤 마크의 시작점인지 (행간 메모 부착) */
  noteMarkIds: string[];
};

export type TextSeg = {
  start: number;
  end: number;
  text: string;
  style: SegStyle;
};

/** 한 절 구간 [vs,ve) 을 마크 경계로 쪼갠다. */
export function segmentVerse(
  text: string,
  vs: number,
  ve: number,
  marks: StudyMark[],
): TextSeg[] {
  const points = new Set<number>([vs, ve]);
  for (const m of marks) {
    const a = Math.max(m.start, vs);
    const b = Math.min(m.end, ve);
    if (a < b) {
      points.add(a);
      points.add(b);
    }
  }
  const sorted = [...points].sort((a, b) => a - b);
  const segs: TextSeg[] = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (a >= b) continue;
    const markIds: string[] = [];
    const noteMarkIds: string[] = [];
    let hl: string | undefined;
    let ul = false;
    for (const m of marks) {
      if (m.start <= a && m.end >= b) {
        markIds.push(m.id);
        if (m.type === "hl") hl = m.color;
        if (m.type === "ul") ul = true;
      }
      if (m.start === a && m.start < ve && m.end > vs) {
        noteMarkIds.push(m.id);
      }
    }
    segs.push({
      start: a,
      end: b,
      text: text.slice(a - vs, b - vs),
      style: { hl, ul, markIds, noteMarkIds },
    });
  }
  return segs;
}

export function circledNum(n: number): string {
  if (n >= 1 && n <= 20) return String.fromCharCode(0x245f + n);
  return String(n);
}
