"use client";

/**
 * PeekTree 스타일 책·장 서랍 (상단바 제목 탭 — 모든 폭).
 * - 상시 손잡이 없음. 모바일은 화면 아무 곳에서 왼쪽 스와이프로 연다
 * - translateX + progress(0~1), 드래그 중 손가락 추적 / 놓을 때만 스냅
 * - 플릭(≥0.45px/ms) 시 방향·속도 우선, 아니면 절반 기준
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

const MQ = "(max-width: 1279.98px)";
const COARSE_MQ = "(pointer: coarse)";
const REDUCE_MQ = "(prefers-reduced-motion: reduce)";
const DRAWER_RATIO = 0.55;
/** 가로가 세로보다 충분히 크고 이 값을 넘을 때만 서랍 제스처로 잠금 */
const LOCK_PX = 18;
const FLICK_PX_PER_MS = 0.45;
const OPEN_MS = 480;
const CLOSE_MS = 340;
/** 글래스 서랍 스프링 — 고주사율에서도 끊김 적은 이징 */
const OPEN_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
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

function onMqlChange(mql: MediaQueryList, fn: () => void) {
  if (typeof mql.addEventListener === "function") {
    mql.addEventListener("change", fn);
    return () => mql.removeEventListener("change", fn);
  }
  mql.addListener(fn);
  return () => mql.removeListener(fn);
}

function canStartOpenGesture() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia(MQ).matches || window.matchMedia(COARSE_MQ).matches
  );
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
  const [reduceMotion, setReduceMotion] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [animPhase, setAnimPhase] = useState<AnimPhase>(null);
  const [mounted, setMounted] = useState(false);
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
  /** 서랍 위에서 가로로 밀어 넣은 뒤 click 오발 방지 */
  const panelDraggedRef = useRef(false);

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
    const rMql = window.matchMedia(REDUCE_MQ);
    const syncReduce = () => setReduceMotion(rMql.matches);
    syncReduce();
    return onMqlChange(rMql, syncReduce);
  }, []);

  // 열릴 때 미리보기 책 동기화 (open 토글과 분리 — 책 변경 시 재애니 방지)
  useEffect(() => {
    if (!open) return;
    setPreviewBookId(bookConfirmed ? bookId : (OT_BOOK_IDS[0] ?? null));
  }, [open, bookId, bookConfirmed]);

  // controlled open → mount / progress (목록은 mount 순간부터 채워진 상태)
  useEffect(() => {
    if (draggingRef.current) return;
    clearTimers();

    if (open) {
      setMounted(true);
      if (reduceMotion || prefersReducedMotion()) {
        setAnimPhase(null);
        setProgress(1);
        progressRef.current = 1;
        return;
      }

      setAnimPhase("open");
      requestAnimationFrame(() => {
        setProgress(1);
        progressRef.current = 1;
      });
      animClearTimerRef.current = window.setTimeout(() => {
        setAnimPhase(null);
      }, OPEN_MS);
      return;
    }

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
    if (disabled && open) onClose();
  }, [disabled, open, onClose]);

  useEffect(() => {
    const page = document.querySelector(".brp-page") as HTMLElement | null;
    if (!page) return;
    // 본문 transform 없음 — 드래그/원어 충돌 검사용 클래스만 유지
    page.style.setProperty("--brp-drawer-p", String(progress));
    page.style.setProperty("--brp-drawer-w", `${drawerWidthPx()}px`);
    page.classList.toggle("brp-drawer-peek", progress > 0.001);
    page.classList.toggle("brp-drawer-dragging", dragging);
    page.classList.toggle("brp-drawer-anim-open", animPhase === "open");
    page.classList.toggle("brp-drawer-anim-close", animPhase === "close");
    return () => {
      page.style.removeProperty("--brp-drawer-p");
      page.style.removeProperty("--brp-drawer-w");
      page.classList.remove(
        "brp-drawer-peek",
        "brp-drawer-dragging",
        "brp-drawer-anim-open",
        "brp-drawer-anim-close",
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

  /** 열기: 아무 곳 왼쪽 스와이프 / 닫기: 서랍·화면을 오른쪽으로 밀어 넣기 */
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

    const blocked = () => {
      const ds = document.documentElement.dataset;
      return (
        ds.studySelecting === "1" ||
        ds.studyWsOpen === "1" ||
        ds.studyNoteOpen === "1"
      );
    };

    const openish = () => openRef.current || progressRef.current > 0.02;

    const begin = (clientX: number, clientY: number) => {
      if (disabledRef.current || blocked()) return false;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && (sel.toString()?.length ?? 0) > 0) {
        return false;
      }
      // 닫힌 상태: 터치폰·좁은 화면에서만 열기. PC 마우스 드래그는 제외.
      if (!openish() && !canStartOpenGesture()) return false;
      startX = clientX;
      startY = clientY;
      lastX = clientX;
      lastT = performance.now();
      velocity = 0;
      startProgress = openish()
        ? Math.max(progressRef.current, openRef.current ? 1 : 0)
        : progressRef.current;
      mode = openish() ? "close" : "open";
      locked = null;
      tracking = true;
      return true;
    };

    const ignoreTarget = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return true;
      if (target.closest(".brp-bcd")) {
        return !!target.closest("input, textarea, select");
      }
      return !!target.closest(
        "[data-no-drawer-swipe], input, textarea, select, .brp-mobile-topbar, .brp-header, .study-toolbar, .study-ws-root, .study-sel-handle, .study-mark-note-input",
      );
    };

    const applyMove = (clientX: number, clientY: number) => {
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

      if (!locked) {
        if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return;
        // 위아래 스크롤은 서랍으로 잡지 않음
        if (Math.abs(dy) >= Math.abs(dx) * 0.85) {
          locked = "v";
          tracking = false;
          return;
        }
        if (Math.abs(dx) > Math.abs(dy) * 1.35 && Math.abs(dx) > LOCK_PX) {
          if (mode === "open" && dx > 0) {
            locked = "v";
            tracking = false;
            return;
          }
          if (mode === "close" && dx < 0) {
            locked = "v";
            tracking = false;
            return;
          }
          locked = "h";
          if (mode === "close") panelDraggedRef.current = true;
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
        next = Math.min(1, Math.max(0, startProgress - dx / w));
      }
      progressRef.current = next;
      setProgress(next);
    };

    const finish = () => {
      if (!tracking) return;
      tracking = false;
      const wasH = locked === "h";
      locked = null;
      pointerId = null;
      if (!wasH) {
        panelDraggedRef.current = false;
        return;
      }
      const p = progressRef.current;
      const flick = Math.abs(velocity) >= FLICK_PX_PER_MS;
      const nextOpen = flick ? velocity < 0 : p >= 0.42;
      snapTo(nextOpen);
    };

    // 삼성 인터넷은 touch-action:none 요소에서 window touch 가 안 뜨고
    // pointerType=touch 만 온다. 포인터만 capture 단계에서 듣는다.
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (ignoreTarget(e.target)) return;
      if (!begin(e.clientX, e.clientY)) return;
      pointerId = e.pointerId;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (pointerId == null || e.pointerId !== pointerId) return;
      applyMove(e.clientX, e.clientY);
      if (locked === "h" && e.cancelable) e.preventDefault();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (pointerId == null || e.pointerId !== pointerId) return;
      finish();
    };

    const optsCap = { capture: true } as AddEventListenerOptions;
    const optsMove = { capture: true, passive: false } as AddEventListenerOptions;
    document.addEventListener("pointerdown", onPointerDown, optsCap);
    document.addEventListener("pointermove", onPointerMove, optsMove);
    document.addEventListener("pointerup", onPointerUp, optsCap);
    document.addEventListener("pointercancel", onPointerUp, optsCap);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, optsCap);
      document.removeEventListener("pointermove", onPointerMove, optsMove);
      document.removeEventListener("pointerup", onPointerUp, optsCap);
      document.removeEventListener("pointercancel", onPointerUp, optsCap);
    };
  }, [disabled, snapTo, clearTimers]);

  const handleBookClick = useCallback((id: BookId) => {
    if (panelDraggedRef.current) {
      panelDraggedRef.current = false;
      return;
    }
    setPreviewBookId(id);
  }, []);

  const handleChapterClick = useCallback(
    (chapter: number) => {
      if (panelDraggedRef.current) {
        panelDraggedRef.current = false;
        return;
      }
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
        <div className="brp-bcd-col">
          <p className="brp-bcd-col-head">성경</p>
        <ul
          ref={booksRef}
          className="brp-bcd-books"
          role="listbox"
          aria-label="성경 책 목록"
        >
          <li className="brp-bcd-section" aria-hidden="true">
            구약
          </li>
          {OT_BOOK_IDS.map((id) => {
            const isPreview = preview === id;
            const isCurrent = bookConfirmed && bookId === id;
            return (
              <li key={id}>
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
          {NT_BOOK_IDS.map((id) => {
            const isPreview = preview === id;
            const isCurrent = bookConfirmed && bookId === id;
            return (
              <li key={id}>
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
        </div>

        <div className="brp-bcd-col">
          <p className="brp-bcd-col-head">{previewMeta?.name ?? "장"}</p>
        <ul
          ref={chaptersRef}
          className="brp-bcd-chapters"
          role="listbox"
          aria-label={
            previewMeta ? `${previewMeta.name} 장 목록` : "장 목록"
          }
        >
          {preview ? (
            <>
              {chapters.map((n) => {
                const isCurrent =
                  bookConfirmed && preview === bookId && n === chapterNumber;
                const unit = preview === "psalms" ? "편" : "장";
                return (
                  <li key={n}>
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
        </div>
      </aside>
    </div>
      ) : null}
    </>
  );
}

export default memo(BookChapterDrawer);
