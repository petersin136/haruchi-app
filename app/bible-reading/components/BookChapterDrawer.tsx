"use client";

/**
 * PeekTree 스타일 책·장 서랍 (상단바 제목 탭 — 모든 폭).
 * - translateX + progress(0~1), 드래그 중 transition 없음 / 놓을 때만 스냅
 * - 플릭(≥0.5px/ms) 시 방향 우선, 아니면 절반 기준
 * - 화면 가장자리 스와이프 제스처만 ≤768px
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
/** 왼쪽 베젤(뒤로가기 제스처)과 겹치지 않게 */
const EDGE_IGNORE_PX = 24;
/** 가로가 세로의 1.5배보다 크고 이 값을 넘을 때만 서랍 제스처 */
const LOCK_PX = 30;
const FLICK_PX_PER_MS = 0.5;
const OPEN_MS = 440;
const CLOSE_MS = 320;
/** 원목 서랍 스프링 — 고주사율에서도 끊김 적은 이징 */
const OPEN_EASE = "cubic-bezier(0.22, 1.1, 0.36, 1)";
const CLOSE_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

type BookChapterDrawerProps = {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  bookId: BookId;
  chapterNumber: number;
  bookConfirmed: boolean;
  /** 검색·절 선택 모드 등 — true 면 스와이프/표시 안 함 */
  disabled: boolean;
  onSelectBookChapter: (bookId: BookId, chapter: number) => void;
};

type AnimPhase = "open" | "close" | null;

function drawerWidthPx() {
  if (typeof window === "undefined") return 320;
  // 책|장 두 칸 파일철 — 좁은 폰에서도 최소 폭 확보, 넓은 화면 상한
  return Math.min(420, Math.max(300, Math.round(window.innerWidth * DRAWER_RATIO)));
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
  /** 손잡이 드래그 직후 click 오발 방지 */
  const pullDraggedRef = useRef(false);

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

  // 애니메이션 시작 전 즉시 스크롤 (열림 / 미리보기 책 변경)
  useLayoutEffect(() => {
    if (!mounted) return;
    if (!open && progress < 0.02) return;
    scrollListsToCurrent(previewBookId);
  }, [mounted, open, previewBookId, scrollListsToCurrent, progress]);

  const snapTo = useCallback(
    (next: boolean) => {
      draggingRef.current = false;
      setDragging(false);
      if (next) onOpen();
      else onClose();
    },
    [onClose, onOpen],
  );

  // 공부 노트 선택 시작 → 반쯤 나온 서랍도 즉시 닫기
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

  /** 손잡이·가장자리 드래그 (터치 + 포인터) */
  useEffect(() => {
    if (disabled) return;

    let startX = 0;
    let startY = 0;
    let startProgress = 0;
    let mode: "open" | "close" | null = null;
    let locked: "h" | "v" | null = null;
    let tracking = false;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;
    let pointerId: number | null = null;
    let fromPull = false;
    let moved = false;

    const blocked = () => {
      const ds = document.documentElement.dataset;
      return (
        ds.studySelecting === "1" ||
        ds.studyWsOpen === "1" ||
        ds.studyNoteOpen === "1"
      );
    };

    const begin = (clientX: number, clientY: number, pull: boolean) => {
      if (disabledRef.current || blocked()) return false;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && (sel.toString()?.length ?? 0) > 0) {
        return false;
      }
      const w0 = window.innerWidth;
      // 손잡이에서 시작했거나, 모바일에서 오른쪽 가장자리일 때만 열기
      if (!openRef.current) {
        if (!pull) {
          if (!isMobile) return false;
          if (clientX < w0 - (EDGE_IGNORE_PX + 48)) return false;
        }
      }
      startX = clientX;
      startY = clientY;
      lastX = clientX;
      lastT = performance.now();
      velocity = 0;
      startProgress = openRef.current ? 1 : progressRef.current;
      mode = openRef.current ? "close" : "open";
      locked = null;
      tracking = true;
      fromPull = pull;
      moved = false;
      return true;
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const target = e.target;
      if (
        target instanceof Element &&
        target.closest("[data-no-drawer-swipe]")
      ) {
        return;
      }
      const pull = !!(
        target instanceof Element && target.closest(".brp-bcd-pull")
      );
      const t = e.touches[0];
      begin(t.clientX, t.clientY, pull);
    };

    const applyMove = (clientX: number, clientY: number, cancelable?: boolean) => {
      if (blocked()) {
        tracking = false;
        locked = null;
        pointerId = null;
        if (draggingRef.current || progressRef.current > 0.001) snapTo(false);
        return;
      }
      if (!tracking) return;
      const now = performance.now();
      const dt = now - lastT;
      if (dt > 0) {
        velocity = (clientX - lastX) / dt;
        lastX = clientX;
        lastT = now;
      }

      const dx = clientX - startX;
      const dy = clientY - startY;
      const lockPx = fromPull ? 10 : LOCK_PX;

      if (!locked) {
        if (Math.abs(dx) < lockPx && Math.abs(dy) < lockPx) return;
        if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > lockPx) {
          locked = "h";
          moved = true;
          if (fromPull) pullDraggedRef.current = true;
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
      if (cancelable) {
        // touchmove preventDefault
      }
    };

    const finish = () => {
      if (!tracking) return;
      tracking = false;
      const wasH = locked === "h";
      locked = null;
      pointerId = null;
      if (!wasH) return;
      const p = progressRef.current;
      const flick = Math.abs(velocity) >= FLICK_PX_PER_MS;
      const nextOpen = flick ? velocity < 0 : p >= 0.5;
      snapTo(nextOpen);
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking || e.touches.length !== 1) return;
      const t = e.touches[0];
      applyMove(t.clientX, t.clientY);
      if (locked === "h" && e.cancelable) e.preventDefault();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      if (e.button !== 0) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-no-drawer-swipe]")) return;
      const pull = !!target.closest(".brp-bcd-pull");
      if (!begin(e.clientX, e.clientY, pull)) return;
      pointerId = e.pointerId;
      if (pull) {
        try {
          (target.closest(".brp-bcd-pull") as HTMLElement | null)?.setPointerCapture?.(
            e.pointerId,
          );
        } catch {
          /* ignore */
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (pointerId == null || e.pointerId !== pointerId) return;
      applyMove(e.clientX, e.clientY);
      if (locked === "h") e.preventDefault();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (pointerId == null || e.pointerId !== pointerId) return;
      // 손잡이 탭(거의 안 움직임)은 click 핸들러에 맡김
      if (fromPull && !moved && locked !== "h") {
        tracking = false;
        locked = null;
        pointerId = null;
        return;
      }
      finish();
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", finish, { passive: true });
    window.addEventListener("touchcancel", finish, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", finish);
      window.removeEventListener("touchcancel", finish);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
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

  if (disabled) return null;

  const showPanel = mounted || progress > 0.001 || dragging;
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
    <>
      {/* 오른쪽 원목 손잡이 — 글씨 없이 당기거나 탭하면 서랍 */}
      <button
        type="button"
        className={`brp-bcd-pull${progress > 0.15 ? " is-open" : ""}`}
        aria-label={progress > 0.5 ? "책·장 서랍 닫기" : "책·장 서랍 열기"}
        aria-expanded={progress > 0.5}
        onClick={() => {
          if (pullDraggedRef.current) {
            pullDraggedRef.current = false;
            return;
          }
          if (progress > 0.5) onClose();
          else onOpen();
        }}
      >
        <span className="brp-bcd-pull-grip" aria-hidden />
      </button>

      {showPanel ? (
    <div
      className={rootClass}
      style={
        {
          ["--brp-drawer-p"]: String(progress),
          ["--brp-drawer-w"]: `${drawerWidthPx()}px`,
          ["--brp-drawer-open-ms"]: `${OPEN_MS}ms`,
          ["--brp-drawer-close-ms"]: `${CLOSE_MS}ms`,
          ["--brp-drawer-open-ease"]: OPEN_EASE,
          ["--brp-drawer-close-ease"]: CLOSE_EASE,
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
        <div className="brp-bcd-panel-rail" aria-hidden />
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
                  <span className="brp-bcd-book-name">{BOOKS[id].name}</span>
                  <span className="brp-bcd-book-n">
                    {BOOKS[id].totalChapters}
                  </span>
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
                  <span className="brp-bcd-book-name">{BOOKS[id].name}</span>
                  <span className="brp-bcd-book-n">
                    {BOOKS[id].totalChapters}
                  </span>
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
            <>
              <li className="brp-bcd-section" aria-hidden="true">
                {previewMeta?.name ?? "장"}
              </li>
              {chapters.map((n, i) => {
                const isCurrent =
                  bookConfirmed && preview === bookId && n === chapterNumber;
                const unit = preview === "psalms" ? "편" : "장";
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
                      <span className="brp-bcd-book-name">
                        {n}
                        {unit}
                      </span>
                    </button>
                  </li>
                );
              })}
            </>
          ) : (
            <li className="brp-bcd-empty">책을 선택하세요</li>
          )}
        </ul>
      </aside>
    </div>
      ) : null}
    </>
  );
}

export default memo(BookChapterDrawer);
