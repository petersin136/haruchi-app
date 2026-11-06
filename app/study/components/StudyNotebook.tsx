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
  DEFAULT_HL,
  HL_COLORS,
  UL_COLOR,
  emptyStudyData,
  loadChapterStudy,
  newMarkId,
  saveChapterStudy,
  type ChapterStudyData,
  type StudyMark,
  type StudyNote,
} from "../lib/marksStorage";
import {
  buildChapterPlain,
  circledNum,
  segmentVerse,
  verseAtOffset,
  type VerseSpan,
} from "../lib/offsets";
import {
  loadChapterWordStudy,
  matchTokenByGloss,
  type WordStudyToken,
} from "../lib/wordStudy";
import WordStudySheet from "./WordStudySheet";
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
      markId: string;
      x: number;
      y: number;
    };

type NoteDisplay = {
  mode: "full" | "badge";
  badge?: number;
};

type BubbleState = {
  text: string;
  x: number;
  y: number;
};

function StudyNotebook({ bookId, chapter }: Props) {
  const bookMeta = BOOKS[bookId];
  const total = bookMeta.totalChapters;
  const [verses, setVerses] = useState<{ n: number; t: string }[] | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ChapterStudyData>(emptyStudyData);
  const [toolbar, setToolbar] = useState<ToolbarMode | null>(null);
  const [editingMarkId, setEditingMarkId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [openLegacy, setOpenLegacy] = useState<Set<number>>(() => new Set());
  const [noteDisplay, setNoteDisplay] = useState<Record<string, NoteDisplay>>(
    {},
  );
  const [bubble, setBubble] = useState<BubbleState | null>(null);
  const [wsTokens, setWsTokens] = useState<WordStudyToken[]>([]);
  const [wsOpen, setWsOpen] = useState(false);
  const [wsVerse, setWsVerse] = useState(1);
  const [wsInitial, setWsInitial] = useState<WordStudyToken | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const plainRef = useRef("");

  const { plain, spans } = useMemo(
    () => buildChapterPlain(verses ?? []),
    [verses],
  );
  plainRef.current = plain;

  const marksById = useMemo(() => {
    const map = new Map<string, StudyMark>();
    for (const m of data.marks) map.set(m.id, m);
    return map;
  }, [data.marks]);

  useEffect(() => {
    let cancelled = false;
    setVerses(null);
    setError(null);
    setToolbar(null);
    setEditingMarkId(null);
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
    setOpenLegacy(new Set());
    setBubble(null);
    setWsOpen(false);
  }, [bookId, chapter]);

  useEffect(() => {
    let stale = false;
    setWsTokens([]);
    loadChapterWordStudy(bookId, chapter).then((list) => {
      if (!stale) setWsTokens(list);
    });
    return () => {
      stale = true;
    };
  }, [bookId, chapter]);

  const persist = useCallback(
    (next: ChapterStudyData) => {
      setData(next);
      saveChapterStudy(bookId, chapter, next);
    },
    [bookId, chapter],
  );

  const measureNoteCollisions = useCallback(() => {
    const root = bodyRef.current;
    if (!root) return;
    const nodes = [
      ...root.querySelectorAll<HTMLElement>("[data-mark-note-id]"),
    ];
    if (nodes.length === 0) {
      setNoteDisplay({});
      return;
    }
    const items = nodes
      .map((el) => {
        const id = el.dataset.markNoteId!;
        const r = el.getBoundingClientRect();
        return { id, top: r.top, left: r.left, right: r.right, bottom: r.bottom };
      })
      .sort((a, b) => a.top - b.top || a.left - b.left);

    const next: Record<string, NoteDisplay> = {};
    const placed: { id: string; top: number; left: number; right: number }[] =
      [];
    let badge = 0;
    for (const it of items) {
      const sameLine = placed.filter((p) => Math.abs(p.top - it.top) < 10);
      const overlaps = sameLine.some(
        (p) => !(it.right <= p.left + 2 || it.left >= p.right - 2),
      );
      if (overlaps) {
        badge += 1;
        next[it.id] = { mode: "badge", badge };
      } else {
        next[it.id] = { mode: "full" };
        placed.push(it);
      }
    }
    setNoteDisplay(next);
  }, []);

  useLayoutEffect(() => {
    measureNoteCollisions();
  }, [measureNoteCollisions, verses, data.marks, editingMarkId]);

  useEffect(() => {
    window.addEventListener("resize", measureNoteCollisions);
    return () => window.removeEventListener("resize", measureNoteCollisions);
  }, [measureNoteCollisions]);

  useEffect(() => {
    if (!editingMarkId) return;
    editInputRef.current?.focus();
  }, [editingMarkId]);

  useEffect(() => {
    if (!bubble) return;
    const t = window.setTimeout(() => setBubble(null), 2200);
    return () => window.clearTimeout(t);
  }, [bubble]);

  const selectionToOffsets = useCallback(
    (sel: Selection): { start: number; end: number; ref: number } | null => {
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
      const range = sel.getRangeAt(0);
      const root = bodyRef.current;
      if (!root || !root.contains(range.commonAncestorContainer)) return null;

      const startOff = domPointToOffset(
        root,
        range.startContainer,
        range.startOffset,
        spans,
      );
      const endOff = domPointToOffset(
        root,
        range.endContainer,
        range.endOffset,
        spans,
      );
      if (startOff == null || endOff == null) return null;
      const a = Math.min(startOff, endOff);
      const b = Math.max(startOff, endOff);
      if (a === b) return null;
      return { start: a, end: b, ref: verseAtOffset(spans, a) };
    },
    [spans],
  );

  const showSelectionToolbar = useCallback(() => {
    if (editingMarkId) return;
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
  }, [editingMarkId, selectionToOffsets]);

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

  const upsertMark = (
    patch: Omit<StudyMark, "id"> & { id?: string },
  ): StudyMark => {
    const id = patch.id ?? newMarkId();
    const mark: StudyMark = {
      id,
      ref: patch.ref,
      start: patch.start,
      end: patch.end,
      type: patch.type,
      color: patch.color,
    };
    if (patch.note != null && patch.note !== "") mark.note = patch.note;
    const others = dataRef.current.marks.filter((m) => m.id !== id);
    persist({ ...dataRef.current, marks: [...others, mark] });
    return mark;
  };

  const applyHighlight = (color: string) => {
    if (!toolbar) return;
    if (toolbar.kind === "mark") {
      const cur = marksById.get(toolbar.markId);
      if (!cur) return;
      upsertMark({ ...cur, type: "hl", color });
      setToolbar(null);
      return;
    }
    upsertMark({
      ref: toolbar.ref,
      start: toolbar.start,
      end: toolbar.end,
      type: "hl",
      color,
    });
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
  };

  const applyUnderline = () => {
    if (!toolbar) return;
    if (toolbar.kind === "mark") {
      const cur = marksById.get(toolbar.markId);
      if (!cur) return;
      upsertMark({ ...cur, type: "ul", color: UL_COLOR });
      setToolbar(null);
      return;
    }
    upsertMark({
      ref: toolbar.ref,
      start: toolbar.start,
      end: toolbar.end,
      type: "ul",
      color: UL_COLOR,
    });
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
  };

  const eraseFromToolbar = () => {
    if (!toolbar) return;
    if (toolbar.kind === "mark") {
      persist({
        ...dataRef.current,
        marks: dataRef.current.marks.filter((m) => m.id !== toolbar.markId),
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

  const beginNoteEdit = (markId: string, initial?: string) => {
    const cur = dataRef.current.marks.find((m) => m.id === markId);
    setEditText(initial ?? cur?.note ?? "");
    setEditingMarkId(markId);
    setToolbar(null);
    setBubble(null);
    window.getSelection()?.removeAllRanges();
  };

  const openNoteFromToolbar = () => {
    if (!toolbar) return;
    if (toolbar.kind === "mark") {
      beginNoteEdit(toolbar.markId);
      return;
    }
    // 선택만 있고 칠이 없으면 노랑 자동 적용 후 메모
    const existing = dataRef.current.marks.find(
      (m) => m.start === toolbar.start && m.end === toolbar.end,
    );
    const mark =
      existing ??
      upsertMark({
        ref: toolbar.ref,
        start: toolbar.start,
        end: toolbar.end,
        type: "hl",
        color: DEFAULT_HL,
      });
    beginNoteEdit(mark.id, mark.note);
  };

  const openWordStudyFromToolbar = () => {
    if (!toolbar) return;
    let selectedKo = "";
    let verse = 1;
    if (toolbar.kind === "selection") {
      selectedKo = plainRef.current.slice(toolbar.start, toolbar.end);
      verse = toolbar.ref;
    } else {
      const mark = marksById.get(toolbar.markId);
      if (!mark) return;
      selectedKo = plainRef.current.slice(mark.start, mark.end);
      verse = mark.ref;
    }
    selectedKo = selectedKo.trim();
    if (!selectedKo) return;
    const matched = matchTokenByGloss(wsTokens, verse, selectedKo);
    if (!matched) return;
    setWsVerse(verse);
    setWsInitial(matched);
    setWsOpen(true);
    setToolbar(null);
    window.getSelection()?.removeAllRanges();
  };

  const commitNoteEdit = () => {
    if (!editingMarkId) return;
    const cur = dataRef.current.marks.find((m) => m.id === editingMarkId);
    if (!cur) {
      setEditingMarkId(null);
      return;
    }
    const text = editText.trim();
    const next: StudyMark = { ...cur };
    if (text) next.note = text;
    else delete next.note;
    persist({
      ...dataRef.current,
      marks: dataRef.current.marks.map((m) =>
        m.id === editingMarkId ? next : m,
      ),
    });
    setEditingMarkId(null);
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
      const loaded = {
        marks: Array.isArray(parsed.marks)
          ? parsed.marks
              .map((m) => {
                const id =
                  typeof m?.id === "string" && m.id ? m.id : newMarkId();
                if (
                  !m ||
                  typeof m.ref !== "number" ||
                  typeof m.start !== "number" ||
                  typeof m.end !== "number"
                ) {
                  return null;
                }
                const out: StudyMark = {
                  id,
                  ref: m.ref,
                  start: m.start,
                  end: m.end,
                  type: m.type === "ul" ? "ul" : "hl",
                  color: typeof m.color === "string" ? m.color : DEFAULT_HL,
                };
                if (typeof m.note === "string" && m.note.trim()) {
                  out.note = m.note;
                }
                return out;
              })
              .filter((m): m is StudyMark => m !== null)
          : [],
        notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      };
      persist(loaded);
    } catch {
      window.alert("가져오기 실패 — JSON 형식을 확인해 주세요.");
    }
  };

  const legacyByRef = useMemo(() => {
    const map = new Map<number, StudyNote>();
    for (const n of data.notes) map.set(n.ref, n);
    return map;
  }, [data.notes]);

  const showNoteBubble = (
    text: string,
    el: HTMLElement,
  ) => {
    const r = el.getBoundingClientRect();
    setBubble({
      text,
      x: r.left + r.width / 2,
      y: r.bottom + 6,
    });
  };

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
  const nextCh = chapter < total ? chapter + 1 : null;

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
                const legacy = legacyByRef.get(span.n);
                const legacyOpen = openLegacy.has(span.n);
                return (
                  <span key={span.n} className="study-verse" data-verse={span.n}>
                    <sup className="study-vnum">{span.n}</sup>
                    <span className="study-verse-text" data-v={span.n}>
                      {segs.map((seg, i) => {
                        const cls = [
                          "study-seg",
                          seg.style.hl ? "study-seg--hl" : "",
                          seg.style.ul ? "study-seg--ul" : "",
                        ]
                          .filter(Boolean)
                          .join(" ");
                        const primaryId = seg.style.markIds[0];
                        const noteHosts = seg.style.noteMarkIds.filter((id) => {
                          const m = marksById.get(id);
                          return m && (m.note || editingMarkId === id);
                        });

                        if (!seg.style.hl && !seg.style.ul && noteHosts.length === 0) {
                          return (
                            <span key={`${span.n}-${i}`}>{seg.text}</span>
                          );
                        }

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
                            data-mark-id={primaryId}
                            onClick={(e) => {
                              if (!primaryId) return;
                              if (editingMarkId) return;
                              e.preventDefault();
                              e.stopPropagation();
                              window.getSelection()?.removeAllRanges();
                              const rect = (
                                e.currentTarget as HTMLElement
                              ).getBoundingClientRect();
                              setToolbar({
                                kind: "mark",
                                markId: primaryId,
                                x: rect.left + rect.width / 2,
                                y: Math.max(8, rect.top - 48),
                              });
                            }}
                          >
                            {seg.text}
                            {noteHosts.map((nid) => {
                              if (editingMarkId === nid) {
                                return (
                                  <input
                                    key={`edit-${nid}`}
                                    ref={editInputRef}
                                    className="study-mark-note-input"
                                    value={editText}
                                    aria-label="형광펜 메모"
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => setEditText(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        commitNoteEdit();
                                      }
                                      if (e.key === "Escape") {
                                        setEditingMarkId(null);
                                      }
                                    }}
                                    onBlur={commitNoteEdit}
                                  />
                                );
                              }
                              const mark = marksById.get(nid);
                              if (!mark?.note) return null;
                              const disp = noteDisplay[nid] ?? { mode: "full" };
                              const isBadge = disp.mode === "badge";
                              const label = isBadge
                                ? circledNum(disp.badge ?? 1)
                                : mark.note;
                              return (
                                <span
                                  key={`note-${nid}`}
                                  className={`study-mark-note${isBadge ? " is-badge" : ""}`}
                                  data-mark-note-id={nid}
                                  title={mark.note}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const el = e.currentTarget as HTMLElement;
                                    const truncated =
                                      isBadge ||
                                      el.scrollWidth > el.clientWidth + 1;
                                    if (truncated) {
                                      showNoteBubble(mark.note!, el);
                                    } else {
                                      beginNoteEdit(nid);
                                    }
                                  }}
                                >
                                  {label}
                                </span>
                              );
                            })}
                          </span>
                        );
                      })}
                    </span>
                    {legacy ? (
                      <button
                        type="button"
                        className="study-note-dot"
                        aria-label={`${span.n}절 옛 메모`}
                        onClick={() => {
                          setOpenLegacy((prev) => {
                            const n = new Set(prev);
                            if (n.has(span.n)) n.delete(span.n);
                            else n.add(span.n);
                            return n;
                          });
                        }}
                      />
                    ) : null}
                    {legacy ? (
                      <span
                        className={`study-note-legacy${legacyOpen ? " is-open" : ""}`}
                        role="note"
                      >
                        <span className="study-note-legacy-inner">
                          <span>{legacy.text}</span>
                        </span>
                      </span>
                    ) : null}
                  </span>
                );
              })}
            </div>
          </article>
        </div>

        <nav className="study-nav" aria-label="장 이동">
          {prev ? (
            <Link href={`/study/${bookId}/${prev}`}>← {prev}장</Link>
          ) : (
            <span>← 이전</span>
          )}
          {nextCh ? (
            <Link href={`/study/${bookId}/${nextCh}`}>{nextCh}장 →</Link>
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
              onClick={() => applyHighlight(c)}
            />
          ))}
          <button
            type="button"
            className="study-toolbar-btn"
            onClick={applyUnderline}
          >
            밑줄
          </button>
          <button
            type="button"
            className="study-toolbar-btn"
            onClick={openNoteFromToolbar}
          >
            메모
          </button>
          <button
            type="button"
            className="study-toolbar-btn"
            onClick={openWordStudyFromToolbar}
          >
            원어
          </button>
          <button
            type="button"
            className="study-toolbar-btn"
            onClick={eraseFromToolbar}
          >
            지우개
          </button>
        </div>
      ) : null}

      <WordStudySheet
        open={wsOpen}
        bookId={bookId}
        chapter={chapter}
        verse={wsVerse}
        tokens={wsTokens}
        initial={wsInitial}
        onClose={() => setWsOpen(false)}
      />

      {bubble ? (
        <div
          className="study-note-bubble"
          style={{ left: bubble.x, top: bubble.y }}
          role="status"
        >
          {bubble.text}
        </div>
      ) : null}

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
  // 메모/입력 UI 텍스트는 오프셋에서 제외
  const raw = pre.toString();
  const noteEls = verseEl.querySelectorAll(
    ".study-mark-note, .study-mark-note-input",
  );
  let subtract = 0;
  noteEls.forEach((el) => {
    if (pre.intersectsNode(el)) {
      subtract += (el.textContent || "").length;
      if (el instanceof HTMLInputElement) subtract += el.value.length;
    }
  });
  return span.start + Math.max(0, raw.length - subtract);
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
