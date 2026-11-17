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

/** 메모가 HTML 목록을 받도록 contentEditable + execCommand('copy') */
export function copyStudyHtml(html: string): boolean {
  if (typeof document === "undefined") return false;
  const host = document.createElement("div");
  host.setAttribute("contenteditable", "true");
  host.innerHTML = html;
  host.style.cssText =
    "position:fixed;left:-9999px;top:0;width:360px;opacity:0;pointer-events:none";
  document.body.appendChild(host);
  const sel = window.getSelection();
  const prev = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  const range = document.createRange();
  range.selectNodeContents(host);
  sel?.removeAllRanges();
  sel?.addRange(range);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  sel?.removeAllRanges();
  if (prev && sel) {
    try {
      sel.addRange(prev);
    } catch {
      /* ignore */
    }
  }
  host.remove();
  return ok;
}

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
 * 강제 폭·표 없음. HTML은 목록(번호 바깥)이라 화면 폭에 감기고 번호 아래는 비움.
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

  // 메모는 평문을 고르면 번호 아래로 본문이 붙음 → 목록(outside)으로 번호 칸을 비우고 폭은 화면이 정함
  const listItems = sorted
    .map((v) => {
      const t = escapeCopyHtml(v.text.trim());
      return `<li value="${v.n}"><p style="margin:0">${t}</p></li>`;
    })
    .join("");
  const html = `<html><head><meta charset="utf-8"></head><body><!--StartFragment--><p style="margin:0">${escapeCopyHtml(cite)}</p><ol style="margin:0;padding-left:2.25em;list-style:decimal outside">${listItems}</ol><!--EndFragment--></body></html>`;
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
