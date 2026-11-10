"use client";

/**
 * 책·장·절 선택 — StudyLocationPicker 래퍼.
 * ≤768: 가장자리 가로 밀기로 열기/닫기 유지.
 * UI는 app/study/components/StudyLocationPicker.
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { BookId } from "../books";
import StudyLocationPicker from "../../study/components/StudyLocationPicker";
import "../../study/study.css";

const SWIPE_MQ = "(max-width: 768px)";
const EDGE_IGNORE_PX = 24;
const LOCK_PX = 30;
const FLICK_PX_PER_MS = 0.5;
const DRAWER_RATIO = 0.88;
const DRAWER_MAX_PX = 360;

type BookChapterDrawerProps = {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  bookId: BookId;
  chapterNumber: number;
  verseNumber?: number;
  bookConfirmed: boolean;
  disabled: boolean;
  onSelectBookChapter: (
    bookId: BookId,
    chapter: number,
    verse?: number,
  ) => void;
};

function drawerWidthPx() {
  if (typeof window === "undefined") return 280;
  return Math.min(
    DRAWER_MAX_PX,
    Math.round(window.innerWidth * DRAWER_RATIO),
  );
}

function BookChapterDrawer({
  open,
  onOpen,
  onClose,
  bookId,
  chapterNumber,
  verseNumber = 1,
  bookConfirmed,
  disabled,
  onSelectBookChapter,
}: BookChapterDrawerProps) {
  const [swipeOk, setSwipeOk] = useState(false);
  const openRef = useRef(open);
  const disabledRef = useRef(disabled);
  openRef.current = open;
  disabledRef.current = disabled;

  useEffect(() => {
    const mq = window.matchMedia(SWIPE_MQ);
    const sync = () => setSwipeOk(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const snapTo = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) onOpen();
      else onClose();
    },
    [onOpen, onClose],
  );

  useEffect(() => {
    if (!swipeOk || disabled) return;

    let tracking = false;
    let locked: "h" | "v" | null = null;
    let startX = 0;
    let startY = 0;
    let startProgress = 0;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;
    let mode: "open" | "close" = "open";

    const onStart = (e: TouchEvent) => {
      if (disabledRef.current) return;
      if (typeof document !== "undefined") {
        const ds = document.documentElement.dataset;
        if (
          ds.studySelecting === "1" ||
          ds.studyWsOpen === "1" ||
          ds.studyNoteOpen === "1"
        )
          return;
      }
      const t = e.touches[0];
      if (!t) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("[data-no-drawer-swipe]")) return;
      if (!openRef.current && t.clientX > EDGE_IGNORE_PX + 28) return;
      if (openRef.current) {
        /* 열린 패널 안에서의 가로 제스처는 시트가 처리 */
        if (target?.closest?.(".study-loc-sheet")) return;
      }
      tracking = true;
      locked = null;
      startX = t.clientX;
      startY = t.clientY;
      lastX = t.clientX;
      lastT = performance.now();
      velocity = 0;
      mode = openRef.current ? "close" : "open";
      startProgress = openRef.current ? 1 : 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      if (!t) return;
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      velocity = (t.clientX - lastX) / dt;
      lastX = t.clientX;
      lastT = now;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (!locked) {
        if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return;
        if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > LOCK_PX) {
          locked = "h";
        } else {
          locked = "v";
          tracking = false;
          return;
        }
      }
      if (locked !== "h") return;
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
      const dx = lastX - startX;
      const w = drawerWidthPx();
      let p = startProgress;
      if (mode === "open") p = Math.min(1, Math.max(0, -dx / w));
      else p = Math.min(1, Math.max(0, 1 - dx / w));
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
  }, [swipeOk, disabled, snapTo]);

  return (
    <StudyLocationPicker
      open={open}
      onClose={onClose}
      bookId={bookId}
      chapterNumber={chapterNumber}
      verseNumber={verseNumber}
      bookConfirmed={bookConfirmed}
      disabled={disabled}
      onSelectBookChapter={onSelectBookChapter}
    />
  );
}

export default memo(BookChapterDrawer);
