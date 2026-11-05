"use client";

/**
 * 모바일 PeekTree 스타일 책·장 서랍 (≤768px).
 * - translateX + progress(0~1), 드래그 중 transition 없음 / 놓을 때만 스냅
 * - 플릭(≥0.5px/ms) 시 방향 우선, 아니면 절반 기준
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

const MQ = "(max-width: 768px)";
const REDUCE_MQ = "(prefers-reduced-motion: reduce)";
const DRAWER_RATIO = 0.55;
const EDGE_IGNORE_PX = 24;
const LOCK_PX = 10;
const FLICK_PX_PER_MS = 0.5;
const OPEN_MS = 380;
const CLOSE_MS = 300;

type BookChapterDrawerProps = {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  bookId: BookId;
  chapterNumber: number;
  bookConfirmed: boolean;
  /** 몰입·검색·절 선택 모드 등 — true 면 스와이프/표시 안 함 */
  disabled: boolean;
  onSelectBookChapter: (bookId: BookId, chapter: number) => void;
};

type AnimPhase = "open" | "close" | null;

function drawerWidthPx() {
  if (typeof window === "undefined") return 280;
  return Math.round(window.innerWidth * DRAWER_RATIO);
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
  const [isMobile, setIsMobile] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [animPhase, setAnimPhase] = useState<AnimPhase>(null);
  const [mounted, setMounted] = useState(false);
  const [booksIn, setBooksIn] = useState(false);
  const [chapterStaggerKey, setChapterStaggerKey] = useState(0);
  const [chaptersIn, setChaptersIn] = useState(false);
  const [previewBookId, setPreviewBookId] = useState<BookId | null>(
    bookConfirmed ? bookId : null,
  );

  const booksRef = useRef<HTMLUListElement>(null);
  const chaptersRef = useRef<HTMLUListElement>(null);
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

  const scrollListsToCurrent = useCallback(
    (preview: BookId | null) => {
      const bookTarget = preview ?? (bookConfirmed ? bookId : null);
      if (bookTarget) {
        booksRef.current
          ?.querySelector<HTMLElement>(`[data-book-id="${bookTarget}"]`)
          ?.scrollIntoView({ block: "center" });
      }
      if (preview === bookId && bookConfirmed) {
        chaptersRef.current
          ?.querySelector<HTMLElement>(`[data-chapter="${chapterNumber}"]`)
          ?.scrollIntoView({ block: "center" });
      }
    },
    [bookConfirmed, bookId, chapterNumber],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(MQ);
    const rMql = window.matchMedia(REDUCE_MQ);
    const sync = () => setIsMobile(mql.matches);
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

  // 열릴 때 미리보기 책 동기화 (open 토글과 분리 — 책 변경 시 재애니 방지)
  useEffect(() => {
    if (!open) return;
    setPreviewBookId(bookConfirmed ? bookId : (OT_BOOK_IDS[0] ?? null));
  }, [open, bookId, bookConfirmed]);

  // controlled open → mount / progress / book stagger
  useEffect(() => {
    if (draggingRef.current) return;
    clearTimers();

    if (open) {
      setMounted(true);
      if (reduceMotion || prefersReducedMotion()) {
        setAnimPhase(null);
        setProgress(1);
        progressRef.current = 1;
        setBooksIn(false);
        setChaptersIn(false);
        return;
      }

      setAnimPhase("open");
      setBooksIn(false);
      setChaptersIn(false);
      requestAnimationFrame(() => {
        setProgress(1);
        progressRef.current = 1;
        requestAnimationFrame(() => {
          setBooksIn(true);
          setChapterStaggerKey((k) => k + 1);
        });
      });
      animClearTimerRef.current = window.setTimeout(() => {
        setAnimPhase(null);
      }, OPEN_MS);
      return;
    }

    // close
    setBooksIn(false);
    setChaptersIn(false);
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

  // 장 목록 스태거 — key 변경 후 한 프레임 쉬고 is-in
  useEffect(() => {
    if (chapterStaggerKey === 0) return;
    if (reduceMotion) {
      setChaptersIn(false);
      return;
    }
    setChaptersIn(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setChaptersIn(true));
    });
    return () => cancelAnimationFrame(id);
  }, [chapterStaggerKey, reduceMotion]);

  useEffect(() => {
    if (disabled && open) onClose();
  }, [disabled, open, onClose]);

  useEffect(() => {
    if (!isMobile) return;
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
  }, [progress, dragging, isMobile, animPhase]);

  // 애니메이션 시작 전 즉시 스크롤 (열림 / 미리보기 책 변경)
  useLayoutEffect(() => {
    if (!mounted || !isMobile) return;
    if (!open && progress < 0.02) return;
    scrollListsToCurrent(previewBookId);
  }, [mounted, open, isMobile, previewBookId, scrollListsToCurrent, progress]);

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
    if (!isMobile || disabled) return;

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
      if (disabledRef.current) return;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (t.clientX < EDGE_IGNORE_PX) return;
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
        if (Math.abs(dx) > Math.abs(dy) * 1.25 && Math.abs(dx) > LOCK_PX) {
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
  }, [isMobile, disabled, snapTo, clearTimers]);

  const handleBookClick = useCallback(
    (id: BookId) => {
      setPreviewBookId(id);
      if (!reduceMotion) setChapterStaggerKey((k) => k + 1);
    },
    [reduceMotion],
  );

  const handleChapterClick = useCallback(
    (chapter: number) => {
      const target = previewBookId ?? bookId;
      onSelectBookChapter(target, chapter);
      onClose();
    },
    [bookId, onClose, onSelectBookChapter, previewBookId],
  );

  if (!isMobile || disabled) return null;
  if (!mounted && progress <= 0.001 && !dragging) return null;

  const preview = previewBookId;
  const previewMeta = preview ? BOOKS[preview] : null;
  const total = previewMeta?.totalChapters ?? 0;
  const chapters = Array.from({ length: total }, (_, i) => i + 1);
  const otCount = OT_BOOK_IDS.length;

  const rootClass = [
    "brp-bcd",
    dragging ? "is-dragging" : "",
    animPhase === "open" ? "is-animating-open" : "",
    animPhase === "close" ? "is-animating-close" : "",
  ]
    .filter(Boolean)
    .join(" ");

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
        aria-label="책·장 선택"
      >
        <ul
          ref={booksRef}
          className={
            reduceMotion
              ? "brp-bcd-books"
              : `brp-bcd-books brp-bcd-stagger${booksIn ? " is-in" : ""}`
          }
          role="listbox"
          aria-label="성경 책 목록"
        >
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
                  className={`brp-bcd-book${isPreview ? " is-active" : ""}${
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
                  className={`brp-bcd-book${isPreview ? " is-active" : ""}${
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
        </ul>

        <ul
          key={chapterStaggerKey}
          ref={chaptersRef}
          className={
            reduceMotion
              ? "brp-bcd-chapters"
              : `brp-bcd-chapters brp-bcd-stagger-ch${
                  chaptersIn ? " is-in" : ""
                }`
          }
          role="listbox"
          aria-label={
            previewMeta ? `${previewMeta.name} 장 목록` : "장 목록"
          }
        >
          {preview ? (
            chapters.map((n, i) => {
              const isCurrent =
                bookConfirmed && preview === bookId && n === chapterNumber;
              return (
                <li key={n} style={{ ["--i" as string]: i } as CSSProperties}>
                  <button
                    type="button"
                    data-chapter={n}
                    className={`brp-bcd-chapter${
                      isCurrent ? " is-current" : ""
                    }`}
                    onClick={() => handleChapterClick(n)}
                    role="option"
                    aria-selected={isCurrent}
                  >
                    {n}
                  </button>
                </li>
              );
            })
          ) : (
            <li className="brp-bcd-empty">책을 선택하세요</li>
          )}
        </ul>
      </aside>
    </div>
  );
}

export default memo(BookChapterDrawer);
