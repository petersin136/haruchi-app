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

export type StudyCopyPayload = { plain: string; html: string };

function escapeCopyHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 절 선택 복사.
 * 「다니엘 1:5-8」바로 아래 절 본문(빈 줄 없음).
 * 강제 폭 줄바꿈·표 없음. HTML은 내어쓰기 단락(화면 폭에 맞춰 감김, 번호 아래 비움).
 */
export function formatStudyCopy(
  bookName: string,
  items: { chapter: number; n: number; text: string }[],
): StudyCopyPayload {
  const sorted = [...items].sort((a, b) => a.chapter - b.chapter || a.n - b.n);
  if (sorted.length === 0) return { plain: "", html: "" };
  const clusters: (typeof sorted)[] = [];
  for (const it of sorted) {
    const last = clusters[clusters.length - 1];
    const prev = last?.[last.length - 1];
    if (prev && prev.chapter === it.chapter && it.n === prev.n + 1) last.push(it);
    else clusters.push([it]);
  }
  const chapters = new Set(sorted.map((v) => v.chapter));
  let cite: string;
  if (chapters.size <= 1) {
    const ch = sorted[0]?.chapter ?? 1;
    const parts = clusters.map((c) =>
      c.length === 1 ? `${c[0].n}` : `${c[0].n}-${c[c.length - 1].n}`,
    );
    cite = `${bookName} ${ch}:${parts.join(", ")}`;
  } else {
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    cite = `${bookName} ${first.chapter}:${first.n}–${last.chapter}:${last.n}`;
  }

  const plain = `${cite}\n${sorted
    .map((v) => `${v.n} ${v.text.trim()}`)
    .join("\n")}`;

  const numWidth = Math.max(...sorted.map((v) => String(v.n).length));
  const hangEm = (0.85 + numWidth * 0.55).toFixed(2);
  const verses = sorted
    .map((v) => {
      // NBSP: 번호와 본문이 줄 끝에서 어색하게 갈라지지 않게
      const line = escapeCopyHtml(`${v.n}\u00A0${v.text.trim()}`);
      return `<p style="margin:0;line-height:1.55;padding-left:${hangEm}em;text-indent:-${hangEm}em">${line}</p>`;
    })
    .join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body style="margin:0;font-family:-apple-system,'Noto Serif KR',serif;font-size:16px;line-height:1.55"><p style="margin:0">${escapeCopyHtml(cite)}</p>${verses}</body></html>`;
  return { plain, html };
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
