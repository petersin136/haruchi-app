"use client";

/**
 * 책·장·절 선택 패널 (PC 3칸 / 모바일 2칸).
 * 단계형 BookChapterDrawer 대체 UI.
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
import {
  BOOKS,
  NT_BOOK_IDS,
  OT_BOOK_IDS,
  type BookId,
} from "../../bible-reading/books";
import { loadKoreanChapter } from "../../bible-reading/bibleData";
import { isChapterDone } from "../../lib/readLog";

const MQ_MOBILE = "(max-width: 768px)";
const REDUCE_MQ = "(prefers-reduced-motion: reduce)";
const LONG_PRESS_MS = 400;
const OPEN_MS = 260;
const CLOSE_MS = 180;
const OPEN_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

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
  return q.length > 0 && [...q].every((c) => CHO.includes(c as (typeof CHO)[number]));
}

export type StudyLocationPickerProps = {
  open: boolean;
  onClose: () => void;
  bookId: BookId;
  chapterNumber: number;
  verseNumber?: number;
  bookConfirmed: boolean;
  disabled?: boolean;
  onSelectBookChapter: (
    bookId: BookId,
    chapter: number,
    verse?: number,
  ) => void;
};

type MobileRight = "chapters" | "verses";

export default function StudyLocationPicker({
  open,
  onClose,
  bookId,
  chapterNumber,
  verseNumber = 1,
  bookConfirmed,
  disabled = false,
  onSelectBookChapter,
}: StudyLocationPickerProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [query, setQuery] = useState("");
  const [previewBookId, setPreviewBookId] = useState<BookId>(bookId);
  const [previewChapter, setPreviewChapter] = useState(chapterNumber);
  const [verseCount, setVerseCount] = useState(0);
  const [doneChapters, setDoneChapters] = useState<Set<number>>(
    () => new Set(),
  );
  const [mobileRight, setMobileRight] = useState<MobileRight>("chapters");
  const [selectedVerse, setSelectedVerse] = useState(verseNumber);

  const bookListRef = useRef<HTMLDivElement | null>(null);
  const chapterListRef = useRef<HTMLDivElement | null>(null);
  const verseListRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const closeTimerRef = useRef(0);
  const chapterTapRef = useRef<{ n: number; t: number } | null>(null);
  const longPressRef = useRef<{
    n: number;
    timer: number;
  } | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragYRef = useRef<{ startY: number; dy: number } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(MQ_MOBILE);
    const rq = window.matchMedia(REDUCE_MQ);
    const sync = () => {
      setIsMobile(mq.matches);
      setReduceMotion(rq.matches);
    };
    sync();
    mq.addEventListener("change", sync);
    rq.addEventListener("change", sync);
    return () => {
      mq.removeEventListener("change", sync);
      rq.removeEventListener("change", sync);
    };
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
    setPreviewChapter(chapterNumber);
    setSelectedVerse(Math.max(1, verseNumber || 1));
    setMobileRight("chapters");
    setQuery("");
    refreshDone(bookId);
  }, [open, bookId, chapterNumber, verseNumber, refreshDone]);

  useEffect(() => {
    let cancel = false;
    void loadKoreanChapter(previewBookId, previewChapter).then((ch) => {
      if (cancel) return;
      const n = ch?.verses?.krv?.length ?? 0;
      setVerseCount(n);
    });
    return () => {
      cancel = true;
    };
  }, [previewBookId, previewChapter]);

  useEffect(() => {
    if (disabled) {
      setVisible(false);
      setMounted(false);
      return;
    }
    window.clearTimeout(closeTimerRef.current);
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return;
    }
    setVisible(false);
    closeTimerRef.current = window.setTimeout(
      () => setMounted(false),
      reduceMotion ? 160 : CLOSE_MS,
    );
    return () => window.clearTimeout(closeTimerRef.current);
  }, [open, disabled, reduceMotion]);

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

  const scrollCenter = (
    root: HTMLElement | null,
    sel: string,
  ) => {
    if (!root) return;
    const el = root.querySelector(sel) as HTMLElement | null;
    if (!el) return;
    const rootBox = root.getBoundingClientRect();
    const elBox = el.getBoundingClientRect();
    const delta =
      elBox.top +
      elBox.height / 2 -
      (rootBox.top + rootBox.height / 2);
    root.scrollTop += delta;
  };

  useLayoutEffect(() => {
    if (!visible || !mounted) return;
    scrollCenter(bookListRef.current, `[data-book-id="${previewBookId}"]`);
    scrollCenter(
      chapterListRef.current,
      `[data-chapter="${previewChapter}"]`,
    );
    if (!isMobile || mobileRight === "verses") {
      scrollCenter(
        verseListRef.current,
        `[data-verse="${selectedVerse}"]`,
      );
    }
    if (!isMobile) searchRef.current?.focus({ preventScroll: true });
  }, [
    visible,
    mounted,
    previewBookId,
    previewChapter,
    selectedVerse,
    isMobile,
    mobileRight,
  ]);

  const pick = useCallback(
    (book: BookId, chapter: number, verse?: number) => {
      onSelectBookChapter(book, chapter, verse);
      onClose();
    },
    [onSelectBookChapter, onClose],
  );

  const onBookClick = (id: BookId) => {
    setPreviewBookId(id);
    setPreviewChapter(1);
    setSelectedVerse(1);
    setMobileRight("chapters");
    refreshDone(id);
  };

  const onChapterClick = (n: number) => {
    if (isMobile) {
      pick(previewBookId, n, 1);
      return;
    }
    const now = performance.now();
    const prev = chapterTapRef.current;
    if (prev && prev.n === n && now - prev.t < 400) {
      chapterTapRef.current = null;
      pick(previewBookId, n, 1);
      return;
    }
    chapterTapRef.current = { n, t: now };
    setPreviewChapter(n);
    setSelectedVerse(1);
  };

  const onChapterPointerDown = (
    n: number,
    e: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (!isMobile) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    window.clearTimeout(longPressRef.current?.timer ?? 0);
    longPressRef.current = {
      n,
      timer: window.setTimeout(() => {
        longPressRef.current = null;
        setPreviewChapter(n);
        setSelectedVerse(1);
        setMobileRight("verses");
      }, LONG_PRESS_MS),
    };
  };

  const clearLongPress = () => {
    if (longPressRef.current) {
      window.clearTimeout(longPressRef.current.timer);
      longPressRef.current = null;
    }
  };

  const onVerseClick = (n: number) => {
    pick(previewBookId, previewChapter, n);
  };

  const onSheetPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isMobile) return;
    if (e.pointerType === "mouse") return;
    const t = e.target as HTMLElement;
    if (t.closest("input, button, a")) return;
    dragYRef.current = { startY: e.clientY, dy: 0 };
  };

  const onSheetPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragYRef.current;
    if (!d) return;
    d.dy = e.clientY - d.startY;
    if (d.dy < 0 && sheetRef.current) {
      const dy = Math.max(-80, d.dy);
      sheetRef.current.style.transform = `translateY(${dy}px)`;
      sheetRef.current.style.transition = "none";
    }
  };

  const onSheetPointerUp = () => {
    const d = dragYRef.current;
    dragYRef.current = null;
    const el = sheetRef.current;
    if (!el) return;
    el.style.transition = "";
    el.style.transform = "";
    if (d && d.dy < -56) onClose();
  };

  if (disabled || !mounted) return null;

  const chapters = Array.from(
    { length: BOOKS[previewBookId].totalChapters },
    (_, i) => i + 1,
  );
  const verses = Array.from({ length: verseCount }, (_, i) => i + 1);
  const ms = reduceMotion ? 160 : visible ? OPEN_MS : CLOSE_MS;
  const ease = reduceMotion ? "ease" : OPEN_EASE;

  const renderBookList = () => (
    <div className="study-loc-col study-loc-col--books">
      <div className="study-loc-search">
        <input
          ref={searchRef}
          type="search"
          className="study-loc-search-input"
          placeholder="책 검색 (초성 ㅊㅅㄱ)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="책 검색"
        />
      </div>
      <div className="study-loc-scroll" ref={bookListRef}>
        {filteredBooks.ot.length > 0 ? (
          <>
            <div className="study-loc-sticky">구약</div>
            {filteredBooks.ot.map((id) => {
              const active = previewBookId === id;
              const current = bookConfirmed && bookId === id;
              return (
                <button
                  key={id}
                  type="button"
                  data-book-id={id}
                  className={`study-loc-book${active ? " is-active" : ""}${
                    current ? " is-current" : ""
                  }`}
                  onClick={() => onBookClick(id)}
                >
                  <span className="study-loc-book-name">{BOOKS[id].name}</span>
                  <span className="study-loc-book-n">
                    {BOOKS[id].totalChapters}
                  </span>
                </button>
              );
            })}
          </>
        ) : null}
        {filteredBooks.nt.length > 0 ? (
          <>
            <div className="study-loc-sticky">신약</div>
            {filteredBooks.nt.map((id) => {
              const active = previewBookId === id;
              const current = bookConfirmed && bookId === id;
              return (
                <button
                  key={id}
                  type="button"
                  data-book-id={id}
                  className={`study-loc-book${active ? " is-active" : ""}${
                    current ? " is-current" : ""
                  }`}
                  onClick={() => onBookClick(id)}
                >
                  <span className="study-loc-book-name">{BOOKS[id].name}</span>
                  <span className="study-loc-book-n">
                    {BOOKS[id].totalChapters}
                  </span>
                </button>
              );
            })}
          </>
        ) : null}
        {filteredBooks.ot.length === 0 && filteredBooks.nt.length === 0 ? (
          <div className="study-loc-empty">검색 결과 없음</div>
        ) : null}
      </div>
    </div>
  );

  const renderChapterGrid = () => (
    <div className="study-loc-col study-loc-col--grid">
      <div className="study-loc-col-head">
        {BOOKS[previewBookId].name}
        {previewBookId === "psalms" ? " 편" : " 장"}
      </div>
      <div className="study-loc-scroll" ref={chapterListRef}>
        <div className="study-loc-grid">
          {chapters.map((n) => {
            const active = previewChapter === n;
            const current =
              bookConfirmed && previewBookId === bookId && n === chapterNumber;
            const done = doneChapters.has(n);
            return (
              <button
                key={n}
                type="button"
                data-chapter={n}
                className={`study-loc-cell${active || current ? " is-active" : ""}${
                  done ? " is-done" : ""
                }`}
                onClick={() => onChapterClick(n)}
                onPointerDown={(e) => onChapterPointerDown(n, e)}
                onPointerUp={clearLongPress}
                onPointerLeave={clearLongPress}
                onPointerCancel={clearLongPress}
              >
                {n}
                {done ? <i className="study-loc-done" aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderVerseGrid = (withBack: boolean) => (
    <div className="study-loc-col study-loc-col--grid">
      <div className="study-loc-col-head">
        {withBack ? (
          <button
            type="button"
            className="study-loc-back"
            onClick={() => setMobileRight("chapters")}
          >
            ← 장
          </button>
        ) : null}
        <span>
          {BOOKS[previewBookId].name} {previewChapter}
          {previewBookId === "psalms" ? "편" : "장"} · 절
        </span>
      </div>
      <div className="study-loc-scroll" ref={verseListRef}>
        <div className="study-loc-grid">
          {verses.length === 0 ? (
            <div className="study-loc-empty">절 불러오는 중…</div>
          ) : (
            verses.map((n) => {
              const active = selectedVerse === n;
              return (
                <button
                  key={n}
                  type="button"
                  data-verse={n}
                  className={`study-loc-cell${active ? " is-active" : ""}`}
                  onClick={() => onVerseClick(n)}
                >
                  {n}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={`study-loc${visible ? " is-open" : ""}${
        isMobile ? " is-mobile" : " is-pc"
      }${reduceMotion ? " is-reduce" : ""}`}
      style={
        {
          ["--study-loc-open-ms" as string]: `${ms}ms`,
          ["--study-loc-ease" as string]: ease,
        } as CSSProperties
      }
      aria-hidden={!visible}
    >
      <button
        type="button"
        className="study-loc-backdrop"
        aria-label="선택 패널 닫기"
        onClick={onClose}
        tabIndex={visible ? 0 : -1}
      />
      <div
        ref={sheetRef}
        className="study-loc-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="책·장·절 선택"
        onPointerDown={onSheetPointerDown}
        onPointerMove={onSheetPointerMove}
        onPointerUp={onSheetPointerUp}
        onPointerCancel={onSheetPointerUp}
      >
        <div className="study-loc-handle" aria-hidden />
        <div className="study-loc-body">
          {renderBookList()}
          {isMobile
            ? mobileRight === "chapters"
              ? renderChapterGrid()
              : renderVerseGrid(true)
            : null}
          {!isMobile ? (
            <>
              {renderChapterGrid()}
              {renderVerseGrid(false)}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
