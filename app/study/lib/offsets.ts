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

/**
 * 절 선택 복사.
 * 한 장에서 이어지면 「1 본문 2 본문 (창 34:1-2)」,
 * 떨어지면 「1 본문\n5 본문 (창 34:1, 5)」,
 * 장을 넘으면 「(창 34:31–35:2)」.
 */
export function formatStudyCopy(
  shortName: string,
  items: { chapter: number; n: number; text: string }[],
): string {
  const sorted = [...items].sort((a, b) => a.chapter - b.chapter || a.n - b.n);
  const clusters: (typeof sorted)[] = [];
  for (const it of sorted) {
    const last = clusters[clusters.length - 1];
    const prev = last?.[last.length - 1];
    if (prev && prev.chapter === it.chapter && it.n === prev.n + 1) last.push(it);
    else clusters.push([it]);
  }
  const gapped = clusters.length > 1;
  const body = clusters
    .map((c) => c.map((v) => `${v.n} ${v.text.trim()}`).join(" "))
    .join(gapped ? "\n" : " ");
  const chapters = new Set(sorted.map((v) => v.chapter));
  if (chapters.size <= 1) {
    const ch = sorted[0]?.chapter ?? 1;
    const parts = clusters.map((c) =>
      c.length === 1 ? `${c[0].n}` : `${c[0].n}-${c[c.length - 1].n}`,
    );
    return `${body} (${shortName} ${ch}:${parts.join(", ")})`;
  }
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return `${body} (${shortName} ${first.chapter}:${first.n}–${last.chapter}:${last.n})`;
}

/** 반개구간 [start, end). 경계 offset === end 는 다음 절 시작(마지막 절 끝만 그 절). */
export function verseAtOffset(spans: VerseSpan[], offset: number): number {
  for (const s of spans) {
    if (offset >= s.start && offset < s.end) return s.n;
  }
  const last = spans[spans.length - 1];
  if (last && offset === last.end) return last.n;
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
