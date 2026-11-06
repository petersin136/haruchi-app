"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { loadKoreanChapter } from "../../bible-reading/bibleData";
import type { BookId } from "../../bible-reading/books";
import { BOOKS } from "../../bible-reading/books";
import {
  HL_COLORS,
  UL_COLOR,
  emptyStudyData,
  loadChapterStudy,
  saveChapterStudy,
  type ChapterStudyData,
  type StudyMark,
  type StudyNote,
} from "../lib/marksStorage";
import {
  buildChapterPlain,
  segmentVerse,
  verseAtOffset,
  type VerseSpan,
} from "../lib/offsets";
import "../study.css";

type Props = {
  bookId: BookId;
  chapter: number;
};

type ToolbarMode =
  | {
      kind: "selection";
      start: number;
      end: number;
      ref: number;
      x: number;
      y: number;
    }
  | {
      kind: "mark";
      index: number;
      x: number;
      y: number;
    };

type NoteDraft = {
  ref: number;
  text: string;
};

function StudyNotebook({ bookId, chapter }: Props) {
  const bookMeta = BOOKS[bookId];
  const total = bookMeta.totalChapters;
  const [verses, setVerses] = useState<{ n: number; t: string }[] | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ChapterStudyData>(emptyStudyData);
  const [toolbar, setToolbar] = useState<ToolbarMode | null>(null);
  const [noteDraft, setNoteDraft] = useState<NoteDraft | null>(null);
  const [openMobileNotes, setOpenMobileNotes] = useState<Set<number>>(
    () => new Set(),
  );
  const [railTops, setRailTops] = useState<Record<number, number>>({});
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  const { plain, spans } = useMemo(
    () => buildChapterPlain(verses ?? []),
    [verses],
  );

  useEffect(() => {
    let cancelled = false;
    setVerses(null);
    setError(null);
    setToolbar(null);
    loadKoreanChapter(bookId, chapter)
      .then((ch) => {
        if (cancelled) return;
        setTitle(ch.title ?? "");
        setVerses(ch.verses.krv ?? []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "본문을 불러오지 못했어요");
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, chapter]);

  useEffect(() => {
    setData(loadChapterStudy(bookId, chapter));
    setOpenMobileNotes(new Set());
  }, [bookId, chapter]);

  const persist = useCallback(
    (next: ChapterStudyData) => {
      setData(next);
      saveChapterStudy(bookId, chapter, next);
    },
    [bookId, chapter],
  );

  const measureRails = useCallback(() => {
    const root = bodyRef.current;
    if (!root) return;
    const pageTop = root.getBoundingClientRect().top + window.scrollY;
    const next: Record<number, number> = {};
    root.querySelectorAll<HTMLElement>("[data-verse]").forEach((el) => {
      const n = Number(el.dataset.verse);
      if (!Number.isFinite(n)) return;
      next[n] = el.getBoundingClientRect().top + window.scrollY - pageTop;
    });
    setRailTops(next);
  }, []);

  useLayoutEffect(() => {
    measureRails();
  }, [measureRails, verses, data.notes, data.marks]);

  useEffect(() => {
    window.addEventListener("resize", measureRails);
    return () => window.removeEventListener("resize", measureRails);
  }, [measureRails]);

  const selectionToOffsets = useCallback(
    (sel: Selection): { start: number; end: number; ref: number } | null => {
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
      const range = sel.getRangeAt(0);
      const root = bodyRef.current;
      if (!root || !root.contains(range.commonAncestorContainer)) return null;

      const startOff = domPointToOffset(root, range.startContainer, range.startOffset, spans);
      const endOff = domPointToOffset(root, range.endContainer, range.endOffset, spans);
      if (startOff == null || endOff == null) return null;
      const a = Math.min(startOff, endOff);
      const b = Math.max(startOff, endOff);
      if (a === b) return null;
      return { start: a, end: b, ref: verseAtOffset(spans, a) };
    },
    [spans],
  );

  const showSelectionToolbar = useCallback(() => {
    const sel = window.getSelection();
    if (!sel) {
      setToolbar((t) => (t?.kind === "selection" ? null : t));
      return;
    }
    const mapped = selectionToOffsets(sel);
    if (!mapped) {
      setToolbar((t) => (t?.kind === "selection" ? null : t));
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setToolbar({
      kind: "selection",
      ...mapped,
      x: rect.left + rect.width / 2,
      y: Math.max(8, rect.top - 48),
    });
  }, [selectionToOffsets]);

  useEffect(() => {
    const onSel = () => {
      window.setTimeout(showSelectionToolbar, 0);
    };
    document.addEventListener("selectionchange", onSel);
    document.addEventListener("mouseup", onSel);
    document.addEventListener("touchend", onSel);
    return () => {
      document.removeEventListener("selectionchange", onSel);
      document.removeEventListener("mouseup", onSel);
      document.removeEventListener("touchend", onSel);
    };
  }, [showSelectionToolbar]);

  const applyHighlight = (color: string) => {
    if (!toolbar || toolbar.kind !== "selection") return;
    const mark: StudyMark = {
      ref: toolbar.ref,
      start: toolbar.start,
      end: toolbar.end,
      type: "hl",
      color,
    };
    persist({ ...dataRef.current, marks: [...dataRef.current.marks, mark] });
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
  };

  const applyUnderline = () => {
    if (!toolbar || toolbar.kind !== "selection") return;
    const mark: StudyMark = {
      ref: toolbar.ref,
      start: toolbar.start,
      end: toolbar.end,
      type: "ul",
      color: UL_COLOR,
    };
    persist({ ...dataRef.current, marks: [...dataRef.current.marks, mark] });
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
  };

  const eraseSelectionMarks = () => {
    if (!toolbar) return;
    if (toolbar.kind === "mark") {
      persist({
        ...dataRef.current,
        marks: dataRef.current.marks.filter((_, i) => i !== toolbar.index),
      });
      setToolbar(null);
      return;
    }
    const { start, end } = toolbar;
    persist({
      ...dataRef.current,
      marks: dataRef.current.marks.filter(
        (m) => m.end <= start || m.start >= end,
      ),
    });
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
  };

  const recolorMark = (color: string) => {
    if (!toolbar || toolbar.kind !== "mark") return;
    const marks = dataRef.current.marks.map((m, i) =>
      i === toolbar.index ? { ...m, type: "hl" as const, color } : m,
    );
    persist({ ...dataRef.current, marks });
    setToolbar(null);
  };

  const openNoteFromToolbar = () => {
    if (!toolbar) return;
    const ref =
      toolbar.kind === "selection"
        ? toolbar.ref
        : dataRef.current.marks[toolbar.index]?.ref ?? 1;
    const existing = dataRef.current.notes.find((n) => n.ref === ref);
    setNoteDraft({ ref, text: existing?.text ?? "" });
    setToolbar(null);
    window.getSelection()?.removeAllRanges();
  };

  const saveNote = () => {
    if (!noteDraft) return;
    const text = noteDraft.text.trim();
    const others = dataRef.current.notes.filter((n) => n.ref !== noteDraft.ref);
    const notes: StudyNote[] = text
      ? [
          ...others,
          { ref: noteDraft.ref, text, at: new Date().toISOString() },
        ]
      : others;
    persist({ ...dataRef.current, notes });
    if (text) {
      setOpenMobileNotes((prev) => new Set(prev).add(noteDraft.ref));
    }
    setNoteDraft(null);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(dataRef.current, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `haruchi-marks-${bookId}-${chapter}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as ChapterStudyData;
      const next: ChapterStudyData = {
        marks: Array.isArray(parsed.marks) ? parsed.marks : [],
        notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      };
      persist(next);
    } catch {
      window.alert("가져오기 실패 — JSON 형식을 확인해 주세요.");
    }
  };

  const notesByRef = useMemo(() => {
    const map = new Map<number, StudyNote>();
    for (const n of data.notes) map.set(n.ref, n);
    return map;
  }, [data.notes]);

  if (error) {
    return (
      <div className="study-root">
        <p className="study-loading">{error}</p>
      </div>
    );
  }

  if (!verses) {
    return (
      <div className="study-root">
        <p className="study-loading">본문을 불러오는 중…</p>
      </div>
    );
  }

  const prev = chapter > 1 ? chapter - 1 : null;
  const next = chapter < total ? chapter + 1 : null;

  return (
    <div className="study-root">
      <div className="study-top">
        <Link href="/bible-reading" className="study-top-back">
          ← 읽기
        </Link>
        <h1 className="study-book-title">{bookMeta.name}</h1>
        <span style={{ width: 48 }} aria-hidden="true" />
      </div>

      <div className="study-shell">
        <div className="study-layout">
          <article className="study-page">
            <span className="study-drop" aria-hidden="true">
              {chapter}
            </span>
            {title ? (
              <span className="study-chapter-title">{title}</span>
            ) : null}
            <div className="study-body" ref={bodyRef}>
              {spans.map((span) => {
                const segs = segmentVerse(
                  span.text,
                  span.start,
                  span.end,
                  data.marks,
                );
                const note = notesByRef.get(span.n);
                const mobileOpen = openMobileNotes.has(span.n);
                return (
                  <span key={span.n} className="study-verse" data-verse={span.n}>
                    <sup className="study-vnum">{span.n}</sup>
                    <span className="study-verse-text" data-v={span.n}>
                      {segs.map((seg, i) => {
                        const cls = [
                          seg.style.hl ? "study-seg--hl" : "",
                          seg.style.ul ? "study-seg--ul" : "",
                        ]
                          .filter(Boolean)
                          .join(" ");
                        if (!cls) {
                          return (
                            <span key={`${span.n}-${i}`}>{seg.text}</span>
                          );
                        }
                        const markIndex = seg.style.markIndexes[0];
                        return (
                          <span
                            key={`${span.n}-${i}`}
                            className={cls}
                            style={
                              seg.style.hl
                                ? ({
                                    ["--study-hl"]: seg.style.hl,
                                  } as CSSProperties)
                                : undefined
                            }
                            data-mark-index={markIndex}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              window.getSelection()?.removeAllRanges();
                              const rect = (
                                e.currentTarget as HTMLElement
                              ).getBoundingClientRect();
                              setToolbar({
                                kind: "mark",
                                index: markIndex,
                                x: rect.left + rect.width / 2,
                                y: Math.max(8, rect.top - 48),
                              });
                            }}
                          >
                            {seg.text}
                          </span>
                        );
                      })}
                    </span>
                    {note ? (
                      <button
                        type="button"
                        className="study-note-dot"
                        aria-label={`${span.n}절 메모`}
                        onClick={() => {
                          setOpenMobileNotes((prev) => {
                            const next = new Set(prev);
                            if (next.has(span.n)) next.delete(span.n);
                            else next.add(span.n);
                            return next;
                          });
                        }}
                      />
                    ) : null}
                    {note ? (
                      <div
                        className={`study-note-mobile${mobileOpen ? " is-open" : ""}`}
                      >
                        <div className="study-note-mobile-inner">
                          <p
                            onClick={() =>
                              setNoteDraft({
                                ref: span.n,
                                text: note.text,
                              })
                            }
                          >
                            {note.text}
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </span>
                );
              })}
            </div>
          </article>

          <aside className="study-notes-rail" aria-label="메모">
            {data.notes.map((n) => (
              <p
                key={n.ref}
                className="study-note-rail-item"
                style={{ top: railTops[n.ref] ?? 0 }}
                onClick={() => setNoteDraft({ ref: n.ref, text: n.text })}
              >
                {n.text}
              </p>
            ))}
          </aside>
        </div>

        <nav className="study-nav" aria-label="장 이동">
          {prev ? (
            <Link href={`/study/${bookId}/${prev}`}>← {prev}장</Link>
          ) : (
            <span>← 이전</span>
          )}
          {next ? (
            <Link href={`/study/${bookId}/${next}`}>{next}장 →</Link>
          ) : (
            <span>다음 →</span>
          )}
        </nav>

        <div className="study-io">
          <button type="button" onClick={exportJson}>
            내보내기
          </button>
          <button type="button" onClick={() => fileRef.current?.click()}>
            가져오기
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importJson(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {toolbar ? (
        <div
          className="study-toolbar"
          style={{ left: toolbar.x, top: toolbar.y }}
          role="toolbar"
          aria-label="형광펜 도구"
          onMouseDown={(e) => e.preventDefault()}
        >
          {HL_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="study-toolbar-swatch"
              style={{ background: c }}
              aria-label={`형광펜 ${c}`}
              onClick={() =>
                toolbar.kind === "mark"
                  ? recolorMark(c)
                  : applyHighlight(c)
              }
            />
          ))}
          <button
            type="button"
            className="study-toolbar-btn"
            onClick={() => {
              if (toolbar.kind === "mark") {
                persist({
                  ...dataRef.current,
                  marks: dataRef.current.marks.map((m, i) =>
                    i === toolbar.index
                      ? { ...m, type: "ul", color: UL_COLOR }
                      : m,
                  ),
                });
                setToolbar(null);
                return;
              }
              applyUnderline();
            }}
          >
            밑줄
          </button>
          {toolbar.kind === "selection" ? (
            <button
              type="button"
              className="study-toolbar-btn"
              onClick={openNoteFromToolbar}
            >
              메모
            </button>
          ) : null}
          <button
            type="button"
            className="study-toolbar-btn"
            onClick={eraseSelectionMarks}
          >
            지우개
          </button>
        </div>
      ) : null}

      {noteDraft ? (
        <div
          className="study-modal-backdrop"
          role="presentation"
          onClick={() => setNoteDraft(null)}
        >
          <div
            className="study-modal"
            role="dialog"
            aria-label="메모 작성"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{noteDraft.ref}절 메모</h2>
            <textarea
              value={noteDraft.text}
              onChange={(e) =>
                setNoteDraft({ ...noteDraft, text: e.target.value })
              }
              placeholder="손글씨처럼 남겨 보세요"
              autoFocus
            />
            <div className="study-modal-actions">
              <button
                type="button"
                className="is-ghost"
                onClick={() => setNoteDraft(null)}
              >
                취소
              </button>
              <button type="button" className="is-primary" onClick={saveNote}>
                저장
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* plain kept for debug-free offset integrity */}
      <span hidden aria-hidden="true">
        {plain.length}
      </span>
    </div>
  );
}

function domPointToOffset(
  root: HTMLElement,
  node: Node,
  offset: number,
  spans: VerseSpan[],
): number | null {
  const verseEl = closestVerseText(node, root);
  if (!verseEl) return null;
  const v = Number(verseEl.dataset.v);
  const span = spans.find((s) => s.n === v);
  if (!span) return null;

  const pre = document.createRange();
  pre.selectNodeContents(verseEl);
  try {
    pre.setEnd(node, offset);
  } catch {
    return span.start;
  }
  return span.start + pre.toString().length;
}

function closestVerseText(node: Node, root: HTMLElement): HTMLElement | null {
  let cur: Node | null = node;
  while (cur && cur !== root) {
    if (cur instanceof HTMLElement && cur.dataset.v) return cur;
    cur = cur.parentNode;
  }
  return null;
}

export default StudyNotebook;
