"use client";

/**
 * /study 장 서랍 — 왼쪽에서 나오는 책|장 두 칸(각각 독립 스크롤).
 * 절 단계 없음. StudyLocationPicker 대체.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  BOOKS,
  NT_BOOK_IDS,
  OT_BOOK_IDS,
  type BookId,
} from "../../bible-reading/books";
import { isChapterDone } from "../../lib/readLog";

const REDUCE_MQ = "(prefers-reduced-motion: reduce)";
const OPEN_MS = 260;
const CLOSE_MS = 200;
const OPEN_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const SWIPE_CLOSE_PX = 56;
const SWIPE_CLOSE_VEL = 0.45;

const CHO =
  "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ" as const;

function chosungOf(str: string): string {
  let out = "";
  for (const ch of str) {
    const code = ch.charCodeAt(0) - 0xac00;
    if (code < 0 || code > 11171) {
      if (CHO.includes(ch as (typeof CHO)[number])) out += ch;
      continue;
    }
    out += CHO[Math.floor(code / 588)] ?? "";
  }
  return out;
}

function isChosungQuery(q: string): boolean {
  return (
    q.length > 0 &&
    [...q].every((c) => CHO.includes(c as (typeof CHO)[number]))
  );
}

export type StudyBookDrawerProps = {
  open: boolean;
  onClose: () => void;
  bookId: BookId;
  chapterNumber: number;
  disabled?: boolean;
  onSelectBookChapter: (bookId: BookId, chapter: number) => void;
};

export default function StudyBookDrawer({
  open,
  onClose,
  bookId,
  chapterNumber,
  disabled = false,
  onSelectBookChapter,
}: StudyBookDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [query, setQuery] = useState("");
  const [previewBookId, setPreviewBookId] = useState<BookId>(bookId);
  const [doneChapters, setDoneChapters] = useState<Set<number>>(
    () => new Set(),
  );

  const bookListRef = useRef<HTMLDivElement | null>(null);
  const chapterListRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const closeTimerRef = useRef(0);
  const closeGenRef = useRef(0);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragXRef = useRef<{
    id: number;
    startX: number;
    dx: number;
    lastX: number;
    lastT: number;
    vx: number;
  } | null>(null);

  useEffect(() => {
    const rq = window.matchMedia(REDUCE_MQ);
    const sync = () => setReduceMotion(rq.matches);
    sync();
    rq.addEventListener("change", sync);
    return () => rq.removeEventListener("change", sync);
  }, []);

  const refreshDone = useCallback((id: BookId) => {
    const total = BOOKS[id].totalChapters;
    const next = new Set<number>();
    for (let n = 1; n <= total; n++) {
      if (isChapterDone(id, n)) next.add(n);
    }
    setDoneChapters(next);
  }, []);

  useEffect(() => {
    if (!open) return;
    setPreviewBookId(bookId);
    setQuery("");
    refreshDone(bookId);
  }, [open, bookId, refreshDone]);

  useEffect(() => {
    if (disabled) {
      closeGenRef.current += 1;
      setVisible(false);
      setMounted(false);
      return;
    }
    window.clearTimeout(closeTimerRef.current);
    if (open) {
      closeGenRef.current += 1;
      setMounted(true);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    const gen = closeGenRef.current;
    closeTimerRef.current = window.setTimeout(() => {
      if (closeGenRef.current !== gen) return;
      setMounted(false);
    }, reduceMotion ? 160 : CLOSE_MS);
    return () => window.clearTimeout(closeTimerRef.current);
  }, [open, disabled, reduceMotion]);

  // open=true 인데 is-open이 빠진 불일치 보정
  useLayoutEffect(() => {
    if (open && mounted && !visible) {
      setVisible(true);
    }
  }, [open, mounted, visible]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filteredBooks = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, "");
    const match = (id: BookId) => {
      if (!q) return true;
      const name = BOOKS[id].name;
      const short = BOOKS[id].shortName;
      if (name.includes(query.trim()) || short.includes(query.trim()))
        return true;
      const nameL = name.toLowerCase();
      if (nameL.includes(q) || short.toLowerCase().includes(q)) return true;
      if (isChosungQuery(q)) {
        const cho = chosungOf(name);
        return cho.startsWith(q) || cho.includes(q);
      }
      return chosungOf(name).includes(chosungOf(query.trim()));
    };
    return {
      ot: OT_BOOK_IDS.filter(match),
      nt: NT_BOOK_IDS.filter(match),
    };
  }, [query]);

  const scrollCenter = (root: HTMLElement | null, sel: string) => {
    if (!root) return;
    const el = root.querySelector(sel) as HTMLElement | null;
    if (!el) return;
    const rootBox = root.getBoundingClientRect();
    const elBox = el.getBoundingClientRect();
    const delta =
      elBox.top + elBox.height / 2 - (rootBox.top + rootBox.height / 2);
    root.scrollTop += delta;
  };

  useLayoutEffect(() => {
    if (!visible || !mounted) return;
    scrollCenter(bookListRef.current, `[data-book-id="${previewBookId}"]`);
    const ch =
      previewBookId === bookId ? chapterNumber : 1;
    scrollCenter(chapterListRef.current, `[data-chapter="${ch}"]`);
    searchRef.current?.focus({ preventScroll: true });
  }, [visible, mounted, previewBookId, bookId, chapterNumber]);

  const onBookClick = (id: BookId) => {
    setPreviewBookId(id);
    refreshDone(id);
  };

  const onChapterClick = (n: number) => {
    onSelectBookChapter(previewBookId, n);
    onClose();
  };

  const onSheetPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest("input, button, a")) return;
    const now = performance.now();
    dragXRef.current = {
      id: e.pointerId,
      startX: e.clientX,
      dx: 0,
      lastX: e.clientX,
      lastT: now,
      vx: 0,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onSheetPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragXRef.current;
    if (!d || d.id !== e.pointerId) return;
    const now = performance.now();
    const dt = Math.max(1, now - d.lastT);
    d.vx = (e.clientX - d.lastX) / dt;
    d.lastX = e.clientX;
    d.lastT = now;
    d.dx = e.clientX - d.startX;
    if (d.dx < 0 && sheetRef.current && !reduceMotion) {
      const dx = Math.max(-120, d.dx);
      sheetRef.current.style.transition = "none";
      sheetRef.current.style.transform = `translateX(${dx}px)`;
    }
  };

  const onSheetPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragXRef.current;
    if (!d || d.id !== e.pointerId) return;
    dragXRef.current = null;
    const el = sheetRef.current;
    if (el) {
      el.style.transition = "";
      el.style.transform = "";
    }
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ignore */
    }
    if (d.dx < -SWIPE_CLOSE_PX || d.vx < -SWIPE_CLOSE_VEL) onClose();
  };

  if (disabled || !mounted || typeof document === "undefined") return null;

  const chapters = Array.from(
    { length: BOOKS[previewBookId].totalChapters },
    (_, i) => i + 1,
  );
  const ms = reduceMotion ? 160 : visible ? OPEN_MS : CLOSE_MS;
  const ease = reduceMotion ? "ease" : OPEN_EASE;
  const activeChapter =
    previewBookId === bookId ? chapterNumber : -1;

  return createPortal(
    <div
      className={`study-book-drawer${visible ? " is-open" : ""}${
        reduceMotion ? " is-reduce" : ""
      }`}
      style={
        {
          ["--sbd-ms" as string]: `${ms}ms`,
          ["--sbd-ease" as string]: ease,
        } as CSSProperties
      }
      aria-hidden={!visible}
    >
      <button
        type="button"
        className="study-book-drawer-backdrop"
        aria-label="장 서랍 닫기"
        onClick={onClose}
        tabIndex={visible ? 0 : -1}
      />
      <div
        ref={sheetRef}
        className="study-book-drawer-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="책·장 선택"
        data-no-drawer-swipe=""
        onPointerDown={onSheetPointerDown}
        onPointerMove={onSheetPointerMove}
        onPointerUp={onSheetPointerUp}
        onPointerCancel={onSheetPointerUp}
      >
        <div className="study-book-drawer-col is-books">
          <div className="study-book-drawer-search">
            <input
              ref={searchRef}
              type="search"
              className="study-book-drawer-search-input"
              placeholder="초성 검색 (ㅇㄹ)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="책 초성 검색"
            />
          </div>
          <div className="study-book-drawer-scroll" ref={bookListRef}>
            {filteredBooks.ot.length > 0 ? (
              <>
                <div className="study-book-drawer-sticky">구약</div>
                {filteredBooks.ot.map((id) => {
                  const active = id === previewBookId;
                  const current = id === bookId;
                  return (
                    <button
                      key={id}
                      type="button"
                      data-book-id={id}
                      className={`study-book-drawer-book${
                        active ? " is-active" : ""
                      }${current && !active ? " is-current" : ""}`}
                      onClick={() => onBookClick(id)}
                    >
                      <span className="study-book-drawer-book-name">
                        {BOOKS[id].name}
                      </span>
                    </button>
                  );
                })}
              </>
            ) : null}
            {filteredBooks.nt.length > 0 ? (
              <>
                <div className="study-book-drawer-sticky">신약</div>
                {filteredBooks.nt.map((id) => {
                  const active = id === previewBookId;
                  const current = id === bookId;
                  return (
                    <button
                      key={id}
                      type="button"
                      data-book-id={id}
                      className={`study-book-drawer-book${
                        active ? " is-active" : ""
                      }${current && !active ? " is-current" : ""}`}
                      onClick={() => onBookClick(id)}
                    >
                      <span className="study-book-drawer-book-name">
                        {BOOKS[id].name}
                      </span>
                    </button>
                  );
                })}
              </>
            ) : null}
            {filteredBooks.ot.length === 0 && filteredBooks.nt.length === 0 ? (
              <div className="study-book-drawer-empty">검색 결과 없음</div>
            ) : null}
          </div>
        </div>
        <div className="study-book-drawer-col is-chapters">
          <div className="study-book-drawer-col-head">
            {BOOKS[previewBookId].name}
          </div>
          <div className="study-book-drawer-scroll" ref={chapterListRef}>
            {chapters.map((n) => {
              const active = n === activeChapter;
              const done = doneChapters.has(n);
              return (
                <button
                  key={n}
                  type="button"
                  data-chapter={n}
                  className={`study-book-drawer-ch${
                    active ? " is-active" : ""
                  }`}
                  onClick={() => onChapterClick(n)}
                >
                  <span className="study-book-drawer-ch-n">{n}</span>
                  {done ? (
                    <i className="study-book-drawer-done" aria-hidden />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
