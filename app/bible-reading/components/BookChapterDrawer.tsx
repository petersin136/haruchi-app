"use client";

/**
 * 책·장·절 선택 서랍 (상단 「책 n장 ⌄」).
 * - 제목 탭 → 현재 책의 장 목록부터
 * - 책 바꾸기 → 책 목록 / 장 → 절 / 「이 장 처음부터」·절 탭으로 이동
 * - ≤768만: 가로 밀어서 열기 (상단 바 data-no-drawer-swipe 제외)
 * - ≥769(양쪽 모드 포함): 제목 탭으로만 열기 — 가로 밀기는 페이지 넘김 전용
 */

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  BOOKS,
  NT_BOOK_IDS,
  OT_BOOK_IDS,
  type BookId,
} from "../books";
import { loadKoreanChapter } from "../bibleData";
import { isChapterDone } from "../../lib/readLog";

const SWIPE_MQ = "(max-width: 768px)";
const REDUCE_MQ = "(prefers-reduced-motion: reduce)";
const DRAWER_RATIO = 0.88;
const DRAWER_MAX_PX = 360;
/** 왼쪽 베젤(뒤로가기 제스처)과 겹치지 않게 */
const EDGE_IGNORE_PX = 24;
/** 가로가 세로의 1.5배보다 크고 이 값을 넘을 때만 서랍 제스처 */
const LOCK_PX = 30;
const FLICK_PX_PER_MS = 0.5;
const OPEN_MS = 380;
const CLOSE_MS = 300;

type Step = "books" | "chapters" | "verses";

type BookChapterDrawerProps = {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  bookId: BookId;
  chapterNumber: number;
  bookConfirmed: boolean;
  /** 검색·절 선택 모드 등 — true 면 스와이프/표시 안 함 */
  disabled: boolean;
  onSelectBookChapter: (
    bookId: BookId,
    chapter: number,
    verse?: number,
  ) => void;
};

type AnimPhase = "open" | "close" | null;

function drawerWidthPx() {
  if (typeof window === "undefined") return 280;
  return Math.min(
    DRAWER_MAX_PX,
    Math.round(window.innerWidth * DRAWER_RATIO),
  );
}

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia(REDUCE_MQ).matches;
}

function BookChapterDrawer({
  open,
  onOpen,
  onClose,
  bookId,
  chapterNumber,
  bookConfirmed,
  disabled,
  onSelectBookChapter,
}: BookChapterDrawerProps) {
  const [swipeOk, setSwipeOk] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [animPhase, setAnimPhase] = useState<AnimPhase>(null);
  const [mounted, setMounted] = useState(false);
  const [listIn, setListIn] = useState(false);
  const [staggerKey, setStaggerKey] = useState(0);
  const [step, setStep] = useState<Step>("chapters");
  const [previewBookId, setPreviewBookId] = useState<BookId | null>(
    bookConfirmed ? bookId : null,
  );
  const [previewChapter, setPreviewChapter] = useState<number | null>(null);
  const [verseCount, setVerseCount] = useState(0);
  const [doneChapters, setDoneChapters] = useState<Set<number>>(() => new Set());

  const listRef = useRef<HTMLUListElement>(null);
  const progressRef = useRef(0);
  const openRef = useRef(open);
  const disabledRef = useRef(disabled);
  const draggingRef = useRef(false);
  const unmountTimerRef = useRef<number | null>(null);
  const animClearTimerRef = useRef<number | null>(null);

  progressRef.current = progress;
  openRef.current = open;
  disabledRef.current = disabled;

  const clearTimers = useCallback(() => {
    if (unmountTimerRef.current != null) {
      window.clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = null;
    }
    if (animClearTimerRef.current != null) {
      window.clearTimeout(animClearTimerRef.current);
      animClearTimerRef.current = null;
    }
  }, []);

  const refreshDone = useCallback((bid: BookId | null) => {
    if (!bid) {
      setDoneChapters(new Set());
      return;
    }
    const total = BOOKS[bid]?.totalChapters ?? 0;
    const next = new Set<number>();
    for (let c = 1; c <= total; c++) {
      if (isChapterDone(bid, c)) next.add(c);
    }
    setDoneChapters(next);
  }, []);

  const scrollListToCurrent = useCallback(() => {
    const root = listRef.current;
    if (!root) return;
    if (step === "books") {
      const bid = previewBookId ?? (bookConfirmed ? bookId : null);
      if (bid) {
        root
          .querySelector<HTMLElement>(`[data-book-id="${bid}"]`)
          ?.scrollIntoView({ block: "center" });
      }
      return;
    }
    if (step === "chapters") {
      const ch =
        previewBookId === bookId && bookConfirmed ? chapterNumber : null;
      if (ch != null) {
        root
          .querySelector<HTMLElement>(`[data-chapter="${ch}"]`)
          ?.scrollIntoView({ block: "center" });
      }
      return;
    }
  }, [
    step,
    previewBookId,
    bookConfirmed,
    bookId,
    chapterNumber,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(SWIPE_MQ);
    const rMql = window.matchMedia(REDUCE_MQ);
    const sync = () => setSwipeOk(mql.matches);
    const syncReduce = () => setReduceMotion(rMql.matches);
    sync();
    syncReduce();
    mql.addEventListener("change", sync);
    rMql.addEventListener("change", syncReduce);
    return () => {
      mql.removeEventListener("change", sync);
      rMql.removeEventListener("change", syncReduce);
    };
  }, []);

  // 열릴 때: 현재 책의 장 목록부터
  useEffect(() => {
    if (!open) return;
    const bid = bookConfirmed ? bookId : (OT_BOOK_IDS[0] ?? null);
    setPreviewBookId(bid);
    setPreviewChapter(null);
    setStep(bid ? "chapters" : "books");
    setVerseCount(0);
    refreshDone(bid);
  }, [open, bookId, bookConfirmed, refreshDone]);

  // controlled open → mount / progress / stagger
  useEffect(() => {
    if (draggingRef.current) return;
    clearTimers();

    if (open) {
      setMounted(true);
      if (reduceMotion || prefersReducedMotion()) {
        setAnimPhase(null);
        setProgress(1);
        progressRef.current = 1;
        setListIn(false);
        return;
      }

      setAnimPhase("open");
      setListIn(false);
      requestAnimationFrame(() => {
        setProgress(1);
        progressRef.current = 1;
        requestAnimationFrame(() => {
          setListIn(true);
          setStaggerKey((k) => k + 1);
        });
      });
      animClearTimerRef.current = window.setTimeout(() => {
        setAnimPhase(null);
      }, OPEN_MS);
      return;
    }

    setListIn(false);
    if (reduceMotion || prefersReducedMotion()) {
      setAnimPhase(null);
      setProgress(0);
      progressRef.current = 0;
      setMounted(false);
      return;
    }

    setAnimPhase("close");
    setProgress(0);
    progressRef.current = 0;
    animClearTimerRef.current = window.setTimeout(() => {
      setAnimPhase(null);
    }, CLOSE_MS);
    unmountTimerRef.current = window.setTimeout(() => {
      setMounted(false);
    }, CLOSE_MS);
  }, [open, reduceMotion, clearTimers]);

  useEffect(() => {
    if (staggerKey === 0) return;
    if (reduceMotion) {
      setListIn(false);
      return;
    }
    setListIn(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setListIn(true));
    });
    return () => cancelAnimationFrame(id);
  }, [staggerKey, reduceMotion, step]);

  useEffect(() => {
    if (disabled && open) onClose();
  }, [disabled, open, onClose]);

  useEffect(() => {
    const page = document.querySelector(".brp-page") as HTMLElement | null;
    if (!page) return;
    const will =
      dragging || animPhase === "open" || animPhase === "close";
    page.style.setProperty("--brp-drawer-p", String(progress));
    page.style.setProperty("--brp-drawer-w", `${drawerWidthPx()}px`);
    page.classList.toggle("brp-drawer-peek", progress > 0.001);
    page.classList.toggle("brp-drawer-dragging", dragging);
    page.classList.toggle("brp-drawer-anim-open", animPhase === "open");
    page.classList.toggle("brp-drawer-anim-close", animPhase === "close");
    page.classList.toggle("brp-drawer-willchange", will);
    return () => {
      page.style.removeProperty("--brp-drawer-p");
      page.style.removeProperty("--brp-drawer-w");
      page.classList.remove(
        "brp-drawer-peek",
        "brp-drawer-dragging",
        "brp-drawer-anim-open",
        "brp-drawer-anim-close",
        "brp-drawer-willchange",
      );
    };
  }, [progress, dragging, animPhase]);

  useLayoutEffect(() => {
    if (!mounted) return;
    if (!open && progress < 0.02) return;
    scrollListToCurrent();
  }, [mounted, open, progress, scrollListToCurrent, staggerKey]);

  // 절 목록 — 해당 장 verse 수
  useEffect(() => {
    if (step !== "verses" || !previewBookId || previewChapter == null) {
      setVerseCount(0);
      return;
    }
    let cancelled = false;
    void loadKoreanChapter(previewBookId, previewChapter)
      .then((ch) => {
        if (cancelled) return;
        setVerseCount(ch.verses.krv?.length ?? 0);
      })
      .catch(() => {
        if (!cancelled) setVerseCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [step, previewBookId, previewChapter]);

  const snapTo = useCallback(
    (next: boolean) => {
      draggingRef.current = false;
      setDragging(false);
      if (next) onOpen();
      else onClose();
    },
    [onClose, onOpen],
  );

  useEffect(() => {
    const onStudySelecting = () => {
      if (draggingRef.current || progressRef.current > 0.001 || openRef.current) {
        snapTo(false);
      }
    };
    window.addEventListener("haruchi:study-selecting", onStudySelecting);
    return () =>
      window.removeEventListener("haruchi:study-selecting", onStudySelecting);
  }, [snapTo]);

  useEffect(() => {
    if (!swipeOk || disabled) return;

    let startX = 0;
    let startY = 0;
    let startProgress = 0;
    let mode: "open" | "close" | null = null;
    let locked: "h" | "v" | null = null;
    let tracking = false;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;

    const onStart = (e: TouchEvent) => {
      // ≥769: 리스너 자체가 없어야 하지만, 폭 전환 직전 한 프레임도 막음
      if (window.innerWidth > 768) return;
      if (disabledRef.current) return;
      if (e.touches.length !== 1) return;
      const ds = document.documentElement.dataset;
      if (ds.studySelecting === "1") return;
      if (ds.studyWsOpen === "1") return;
      if (ds.studyNoteOpen === "1") return;
      const t = e.touches[0];
      if (t.clientX < EDGE_IGNORE_PX) return;
      const target = e.target;
      if (
        target instanceof Element &&
        target.closest("[data-no-drawer-swipe]")
      ) {
        return;
      }
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && (sel.toString()?.length ?? 0) > 0) return;

      startX = t.clientX;
      startY = t.clientY;
      lastX = t.clientX;
      lastT = performance.now();
      velocity = 0;
      startProgress = openRef.current ? 1 : progressRef.current;
      mode = openRef.current ? "close" : "open";
      locked = null;
      tracking = true;
    };

    const onMove = (e: TouchEvent) => {
      const ds = document.documentElement.dataset;
      if (
        ds.studySelecting === "1" ||
        ds.studyWsOpen === "1" ||
        ds.studyNoteOpen === "1"
      ) {
        tracking = false;
        locked = null;
        if (draggingRef.current || progressRef.current > 0.001) snapTo(false);
        return;
      }
      if (!tracking || e.touches.length !== 1) return;
      const t = e.touches[0];
      const now = performance.now();
      const dt = now - lastT;
      if (dt > 0) {
        velocity = (t.clientX - lastX) / dt;
        lastX = t.clientX;
        lastT = now;
      }

      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (!locked) {
        if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return;
        if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > LOCK_PX) {
          locked = "h";
          draggingRef.current = true;
          setDragging(true);
          setAnimPhase(null);
          clearTimers();
          setMounted(true);
        } else {
          locked = "v";
          tracking = false;
          return;
        }
      }
      if (locked !== "h") return;

      const w = drawerWidthPx();
      let next = startProgress;
      if (mode === "open") {
        next = Math.min(1, Math.max(0, -dx / w));
      } else {
        next = Math.min(1, Math.max(0, 1 - dx / w));
      }
      progressRef.current = next;
      setProgress(next);
      if (e.cancelable) e.preventDefault();
    };

    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (locked !== "h") {
        locked = null;
        return;
      }
      locked = null;
      const p = progressRef.current;
      const flick = Math.abs(velocity) >= FLICK_PX_PER_MS;
      const nextOpen = flick ? velocity < 0 : p >= 0.5;
      snapTo(nextOpen);
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [swipeOk, disabled, snapTo, clearTimers]);

  const bumpStagger = useCallback(() => {
    if (!reduceMotion) setStaggerKey((k) => k + 1);
  }, [reduceMotion]);

  const handleBookClick = useCallback(
    (id: BookId) => {
      setPreviewBookId(id);
      setPreviewChapter(null);
      setStep("chapters");
      refreshDone(id);
      bumpStagger();
    },
    [bumpStagger, refreshDone],
  );

  const handleChapterClick = useCallback(
    (chapter: number) => {
      setPreviewChapter(chapter);
      setStep("verses");
      bumpStagger();
    },
    [bumpStagger],
  );

  const goBooks = useCallback(() => {
    setStep("books");
    setPreviewChapter(null);
    bumpStagger();
  }, [bumpStagger]);

  const goBack = useCallback(() => {
    if (step === "verses") {
      setStep("chapters");
      setPreviewChapter(null);
      bumpStagger();
      return;
    }
    if (step === "books") {
      setStep("chapters");
      bumpStagger();
      return;
    }
    onClose();
  }, [step, bumpStagger, onClose]);

  const pickChapterFromStart = useCallback(() => {
    if (!previewBookId || previewChapter == null) return;
    onSelectBookChapter(previewBookId, previewChapter, 1);
    onClose();
  }, [previewBookId, previewChapter, onSelectBookChapter, onClose]);

  const pickVerse = useCallback(
    (verse: number) => {
      if (!previewBookId || previewChapter == null) return;
      onSelectBookChapter(previewBookId, previewChapter, verse);
      onClose();
    },
    [previewBookId, previewChapter, onSelectBookChapter, onClose],
  );

  if (disabled) return null;
  if (!mounted && progress <= 0.001 && !dragging) return null;

  const preview = previewBookId;
  const previewMeta = preview ? BOOKS[preview] : null;
  const total = previewMeta?.totalChapters ?? 0;
  const chapters = Array.from({ length: total }, (_, i) => i + 1);
  const verses = Array.from({ length: verseCount }, (_, i) => i + 1);
  const otCount = OT_BOOK_IDS.length;
  const unit = preview === "psalms" ? "편" : "장";

  const rootClass = [
    "brp-bcd",
    dragging ? "is-dragging" : "",
    animPhase === "open" ? "is-animating-open" : "",
    animPhase === "close" ? "is-animating-close" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const listClass = reduceMotion
    ? "brp-bcd-list"
    : `brp-bcd-list brp-bcd-stagger${listIn ? " is-in" : ""}`;

  return (
    <div
      className={rootClass}
      style={
        {
          ["--brp-drawer-p"]: String(progress),
          ["--brp-drawer-w"]: `${drawerWidthPx()}px`,
        } as CSSProperties
      }
      aria-hidden={progress < 0.05}
    >
      <button
        type="button"
        className="brp-bcd-backdrop"
        aria-label="서랍 닫기"
        onClick={onClose}
        tabIndex={progress > 0.5 ? 0 : -1}
      />
      <aside
        className="brp-bcd-panel"
        role="dialog"
        aria-modal="true"
        aria-label="책·장·절 선택"
      >
        <div className="brp-bcd-head">
          {step === "chapters" ? (
            <button
              type="button"
              className="brp-bcd-nav"
              onClick={goBooks}
            >
              책 바꾸기
            </button>
          ) : (
            <button type="button" className="brp-bcd-nav" onClick={goBack}>
              ← 뒤로
            </button>
          )}
          <h2 className="brp-bcd-title">
            {step === "books"
              ? "책 선택"
              : step === "chapters"
                ? previewMeta
                  ? `${previewMeta.name}`
                  : "장 선택"
                : previewMeta && previewChapter != null
                  ? `${previewMeta.name} ${previewChapter}${unit}`
                  : "절 선택"}
          </h2>
          <button
            type="button"
            className="brp-bcd-nav brp-bcd-nav--close"
            onClick={onClose}
          >
            닫기
          </button>
        </div>

        <ul
          key={`${step}-${staggerKey}`}
          ref={listRef}
          className={listClass}
          role="listbox"
          aria-label={
            step === "books"
              ? "성경 책 목록"
              : step === "chapters"
                ? previewMeta
                  ? `${previewMeta.name} 장 목록`
                  : "장 목록"
                : "절 목록"
          }
        >
          {step === "books" ? (
            <>
              <li className="brp-bcd-section" aria-hidden="true">
                구약
              </li>
              {OT_BOOK_IDS.map((id, i) => {
                const isPreview = preview === id;
                const isCurrent = bookConfirmed && bookId === id;
                return (
                  <li key={id} style={{ ["--i" as string]: i } as CSSProperties}>
                    <button
                      type="button"
                      data-book-id={id}
                      className={`brp-bcd-row${isPreview ? " is-active" : ""}${
                        isCurrent ? " is-current" : ""
                      }`}
                      onClick={() => handleBookClick(id)}
                      role="option"
                      aria-selected={isPreview}
                    >
                      {BOOKS[id].name}
                    </button>
                  </li>
                );
              })}
              <li className="brp-bcd-section" aria-hidden="true">
                신약
              </li>
              {NT_BOOK_IDS.map((id, i) => {
                const isPreview = preview === id;
                const isCurrent = bookConfirmed && bookId === id;
                return (
                  <li
                    key={id}
                    style={{ ["--i" as string]: otCount + i } as CSSProperties}
                  >
                    <button
                      type="button"
                      data-book-id={id}
                      className={`brp-bcd-row${isPreview ? " is-active" : ""}${
                        isCurrent ? " is-current" : ""
                      }`}
                      onClick={() => handleBookClick(id)}
                      role="option"
                      aria-selected={isPreview}
                    >
                      {BOOKS[id].name}
                    </button>
                  </li>
                );
              })}
            </>
          ) : null}

          {step === "chapters" ? (
            preview ? (
              chapters.map((n, i) => {
                const isCurrent =
                  bookConfirmed && preview === bookId && n === chapterNumber;
                const done = doneChapters.has(n);
                return (
                  <li key={n} style={{ ["--i" as string]: i } as CSSProperties}>
                    <button
                      type="button"
                      data-chapter={n}
                      className={`brp-bcd-row brp-bcd-row--num${
                        isCurrent ? " is-current" : ""
                      }${done ? " is-done" : ""}`}
                      onClick={() => handleChapterClick(n)}
                      role="option"
                      aria-selected={isCurrent}
                    >
                      <span>{n}</span>
                      {done ? (
                        <span className="brp-bcd-done-dot" aria-hidden />
                      ) : null}
                    </button>
                  </li>
                );
              })
            ) : (
              <li className="brp-bcd-empty">책을 선택하세요</li>
            )
          ) : null}

          {step === "verses" ? (
            <>
              <li style={{ ["--i" as string]: 0 } as CSSProperties}>
                <button
                  type="button"
                  className="brp-bcd-row brp-bcd-row--action"
                  onClick={pickChapterFromStart}
                >
                  이 장 처음부터
                </button>
              </li>
              {verses.length > 0 ? (
                verses.map((n, i) => (
                  <li
                    key={n}
                    style={{ ["--i" as string]: i + 1 } as CSSProperties}
                  >
                    <button
                      type="button"
                      data-verse={n}
                      className="brp-bcd-row brp-bcd-row--num"
                      onClick={() => pickVerse(n)}
                      role="option"
                    >
                      {n}
                    </button>
                  </li>
                ))
              ) : (
                <li className="brp-bcd-empty">절을 불러오는 중…</li>
              )}
            </>
          ) : null}
        </ul>
      </aside>
    </div>
  );
}

export default memo(BookChapterDrawer);
