"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BOOKS, BOOK_ORDER, type BookId } from "../books";
import { loadKoreanChapter } from "../bibleData";
import { isChapterDone } from "../../lib/readLog";
import StudyNotebook from "../../study/components/StudyNotebook";
import "./continuous-krv.css";

type Props = {
  bookId: BookId;
  /** 부모의 현재 장 — 스크롤·검색·서랍 이동의 단일 소스 */
  chapter: number;
  flashVerse?: number | null;
  bookConfirmed: boolean;
  /** 장 제목이 상단에 닿아 현재 장이 바뀜 (스크롤) — 부모는 scrollTo 하지 말 것 */
  onActiveChapterChange: (chapter: number) => void;
  /** 센티널 완료 — 해당 {book, ch}만 */
  onChapterComplete: (bookId: BookId, chapter: number) => void;
  /** 다음 책으로 (1장) */
  onGoNextBook: (bookId: BookId) => void;
};

const TOP_ANCHOR_PX = 52; // MobileTopBar 46 + 여유
const COMPLETE_GATE_MS = 3000;

function scrollRootOf(el: HTMLElement | null): HTMLElement | Window {
  const reader = el?.closest(".brp-reader") as HTMLElement | null;
  if (reader && reader.scrollHeight > reader.clientHeight + 4) return reader;
  return window;
}

function getScrollTop(root: HTMLElement | Window): number {
  return root === window ? window.scrollY : (root as HTMLElement).scrollTop;
}

function setScrollTop(root: HTMLElement | Window, y: number) {
  if (root === window) window.scrollTo({ top: y, behavior: "auto" });
  else (root as HTMLElement).scrollTop = y;
}

function nextBookId(bookId: BookId): BookId | null {
  const i = BOOK_ORDER.indexOf(bookId);
  if (i < 0 || i >= BOOK_ORDER.length - 1) return null;
  return BOOK_ORDER[i + 1] ?? null;
}

/**
 * 개역한글(StudyNotebook) 전용 장 이어 읽기.
 * 화면에 최대 3장(이전·현재·다음). 창 밖 장은 측정 높이 spacer.
 */
export default function ContinuousKrvReader({
  bookId,
  chapter,
  flashVerse = null,
  bookConfirmed,
  onActiveChapterChange,
  onChapterComplete,
  onGoNextBook,
}: Props) {
  const total = BOOKS[bookId].totalChapters;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const heightsRef = useRef<Map<number, number>>(new Map());
  const [heightTick, setHeightTick] = useState(0);
  const lastEmittedRef = useRef(chapter);
  /** 검색·URL·서랍 등 외부 점프 후 해당 장 앵커로 맞출 목표. null 이면 정렬 불필요 */
  const pendingAlignRef = useRef<number | null>(chapter);
  const prevLoRef = useRef(Math.max(1, chapter - 1));
  const suppressScrollEmitRef = useRef(false);
  const enteredAtRef = useRef<Map<number, number>>(new Map());
  const endVisibleRef = useRef<Map<number, boolean>>(new Map());
  const endTimerRef = useRef<Map<number, number>>(new Map());
  const onActiveRef = useRef(onActiveChapterChange);
  onActiveRef.current = onActiveChapterChange;
  const onCompleteRef = useRef(onChapterComplete);
  onCompleteRef.current = onChapterComplete;
  const emitTimerRef = useRef<number | null>(null);
  const pendingEmitChRef = useRef<number | null>(null);
  /** 창 재구성 직후 짧은 동결 — 4↔5 진동 방지 */
  const freezeUntilRef = useRef(0);

  const lo = Math.max(1, chapter - 1);
  const hi = Math.min(total, chapter + 1);
  const mounted = useMemo(() => {
    const list: number[] = [];
    for (let c = lo; c <= hi; c++) list.push(c);
    return list;
  }, [lo, hi]);

  const topSpacer = useMemo(() => {
    let h = 0;
    for (let c = 1; c < lo; c++) h += heightsRef.current.get(c) ?? 0;
    return h;
    // heightTick: spacer 높이 재계산
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lo, heightTick, bookId]);

  const bottomSpacer = useMemo(() => {
    let h = 0;
    for (let c = hi + 1; c <= total; c++) {
      const v = heightsRef.current.get(c);
      if (v) h += v;
    }
    return h;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hi, total, heightTick, bookId]);

  // 책 바뀌면 높이·완료 게이트 초기화
  useEffect(() => {
    heightsRef.current = new Map();
    enteredAtRef.current = new Map();
    endVisibleRef.current = new Map();
    for (const t of endTimerRef.current.values()) window.clearTimeout(t);
    endTimerRef.current = new Map();
    lastEmittedRef.current = chapter;
    pendingAlignRef.current = chapter;
    prevLoRef.current = Math.max(1, chapter - 1);
    setHeightTick((n) => n + 1);
    // chapter intentionally only initial for this book switch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  // 이전·다음 장 미리 받기 (창 이동 시 높이 0→본문 튀김 완화)
  useEffect(() => {
    for (const n of [chapter - 1, chapter + 1, chapter + 2]) {
      if (n >= 1 && n <= total) {
        void loadKoreanChapter(bookId, n).catch(() => {});
      }
    }
  }, [bookId, chapter, total]);

  // 마운트된 장 높이 캐시 (spacer 용). 스크롤 보정은 lo 변경 useLayoutEffect 만.
  useEffect(() => {
    const root = wrapRef.current;
    if (!root) return;
    const nodes = root.querySelectorAll<HTMLElement>("[data-study-chapter]");
    let raf = 0;
    const ro = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        const ch = Number(el.dataset.studyChapter);
        if (!Number.isFinite(ch)) continue;
        const h = Math.round(el.offsetHeight);
        const prev = heightsRef.current.get(ch) ?? 0;
        // 1px 단위 미세 변화는 무시
        if (Math.abs(prev - h) < 2) continue;
        heightsRef.current.set(ch, h);
        changed = true;
      }
      if (!changed) return;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        setHeightTick((n) => n + 1);
      });
    });
    nodes.forEach((n) => ro.observe(n));
    return () => {
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [mounted, bookId]);

  // 창 위쪽 장 마운트/언마운트 시 스크롤 보정
  // - spacer 에 이미 높이가 잡혀 있으면 실장으로 바꾸기만 하므로 보정 불필요
  // - spacer 없이 새로 끼우면 scrollTop += 높이
  useLayoutEffect(() => {
    const prevLo = prevLoRef.current;
    const root = scrollRootOf(wrapRef.current);
    if (lo < prevLo) {
      let added = 0;
      for (let c = lo; c < prevLo; c++) {
        const el = wrapRef.current?.querySelector<HTMLElement>(
          `[data-study-chapter="${c}"]`,
        );
        const cached = heightsRef.current.get(c) ?? 0;
        const measured = el ? Math.round(el.offsetHeight) : 0;
        const h = measured > 80 ? measured : cached;
        // spacer 에 이미 포함돼 있던 장(cached>0)은 높이 치환만 — 보정 금지
        if (cached <= 0 && h > 0) added += h;
        if (measured > 80) heightsRef.current.set(c, measured);
        else if (cached <= 0 && h > 0) heightsRef.current.set(c, h);
      }
      if (added > 0) {
        suppressScrollEmitRef.current = true;
        setScrollTop(root, getScrollTop(root) + added);
        requestAnimationFrame(() => {
          suppressScrollEmitRef.current = false;
        });
      }
    } else if (lo > prevLo) {
      // 위에서 빠지는 장 → spacer. 언마운트 전 높이 기록.
      for (let c = prevLo; c < lo; c++) {
        const el = wrapRef.current?.querySelector<HTMLElement>(
          `[data-study-chapter="${c}"]`,
        );
        if (el) heightsRef.current.set(c, Math.round(el.offsetHeight));
      }
      setHeightTick((n) => n + 1);
    }
    prevLoRef.current = lo;
  }, [lo, mounted]);

  const measureMounted = useCallback(() => {
    const root = wrapRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>("[data-study-chapter]").forEach((el) => {
      const ch = Number(el.dataset.studyChapter);
      if (!Number.isFinite(ch)) return;
      heightsRef.current.set(ch, Math.round(el.offsetHeight));
    });
  }, []);

  const emitActive = useCallback(
    (ch: number) => {
      const clamped = Math.min(total, Math.max(1, ch));
      if (clamped === lastEmittedRef.current) {
        pendingEmitChRef.current = null;
        return;
      }
      if (suppressScrollEmitRef.current) return;
      pendingEmitChRef.current = clamped;
      // 장 경계 진동 완화 — 짧게 디바운스
      if (emitTimerRef.current != null) {
        window.clearTimeout(emitTimerRef.current);
      }
      emitTimerRef.current = window.setTimeout(() => {
        emitTimerRef.current = null;
        const next = pendingEmitChRef.current;
        pendingEmitChRef.current = null;
        if (next == null) return;
        if (suppressScrollEmitRef.current) return;
        if (next === lastEmittedRef.current) return;
        measureMounted();
        lastEmittedRef.current = next;
        freezeUntilRef.current = Date.now() + 550;
        onActiveRef.current(next);
      }, 100);
    },
    [measureMounted, total],
  );

  // 부모가 chapter 를 바꾼 경우(검색·서랍·URL) → 정렬 예약
  // 스크롤 emit 으로 바꾼 경우는 lastEmitted 와 같아 pending 안 걸림
  useEffect(() => {
    if (chapter === lastEmittedRef.current) return;
    pendingAlignRef.current = chapter;
    prevLoRef.current = Math.max(1, chapter - 1);
  }, [bookId, chapter]);

  const alignToChapter = useCallback((target: number) => {
    const root = wrapRef.current;
    if (!root) return false;
    // 본문·앵커가 실제로 그려진 뒤에만 정렬 (로딩 플레이스홀더면 재시도)
    const host = root.querySelector<HTMLElement>(
      `[data-study-chapter="${target}"]`,
    );
    const anchor = host?.querySelector<HTMLElement>("[data-chapter-anchor]");
    const body = host?.querySelector<HTMLElement>(".study-body");
    if (!host || !anchor || !body) return false;
    if (host.offsetHeight < 80) return false;
    const sr = scrollRootOf(root);
    const y =
      getScrollTop(sr) + anchor.getBoundingClientRect().top - TOP_ANCHOR_PX;
    suppressScrollEmitRef.current = true;
    setScrollTop(sr, Math.max(0, y));
    lastEmittedRef.current = target;
    pendingAlignRef.current = null;
    // 인접 장 높이 확정 후 한 번 더 보정
    requestAnimationFrame(() => {
      const y2 =
        getScrollTop(sr) + anchor.getBoundingClientRect().top - TOP_ANCHOR_PX;
      setScrollTop(sr, Math.max(0, y2));
      requestAnimationFrame(() => {
        suppressScrollEmitRef.current = false;
      });
    });
    return true;
  }, []);

  // pending 정렬 — 장 본문이 준비될 때까지 재시도
  useLayoutEffect(() => {
    const target = pendingAlignRef.current;
    if (target == null) return;
    if (alignToChapter(target)) return;
    let tries = 0;
    const id = window.setInterval(() => {
      tries += 1;
      if (pendingAlignRef.current !== target) {
        window.clearInterval(id);
        return;
      }
      if (alignToChapter(target) || tries > 40) {
        window.clearInterval(id);
        if (tries > 40) pendingAlignRef.current = null;
      }
    }, 50);
    return () => window.clearInterval(id);
    // heightTick 제외 — spacer 미세 갱신으로 정렬이 재시작되지 않게
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alignToChapter, bookId, chapter, mounted.join(",")]);

  // flashVerse — 현재 장 안에서만
  useEffect(() => {
    if (flashVerse == null) return;
    const root = wrapRef.current;
    let tries = 0;
    const id = window.setInterval(() => {
      tries += 1;
      const el = root?.querySelector<HTMLElement>(
        `[data-study-chapter="${chapter}"] [data-verse-num="${flashVerse}"]`,
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        window.clearInterval(id);
      } else if (tries > 40) {
        window.clearInterval(id);
      }
    }, 50);
    return () => window.clearInterval(id);
  }, [flashVerse, bookId, chapter]);

  // 스크롤: 장 제목이 화면 상단 밴드에 걸린 가장 아래 장 = 현재 장
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const readActive = () => {
      if (suppressScrollEmitRef.current) return;
      if (Date.now() < freezeUntilRef.current) return;
      const anchors = [
        ...wrap.querySelectorAll<HTMLElement>("[data-chapter-anchor]"),
      ];
      if (anchors.length === 0) return;
      const tops = anchors.map((a) => ({
        ch: Number(
          a.closest("[data-study-chapter]")?.getAttribute("data-study-chapter"),
        ),
        top: a.getBoundingClientRect().top,
      })).filter((x) => Number.isFinite(x.ch));
      if (tops.length === 0) return;

      // 상단 밴드를 지나친 가장 아래 장
      let passed = tops[0].ch;
      for (const row of tops) {
        if (row.top <= TOP_ANCHOR_PX + 8) passed = row.ch;
      }

      const cur = lastEmittedRef.current;
      if (passed === cur) return;
      if (passed > cur) {
        // 아래로: 바로 갱신
        emitActive(passed);
        return;
      }
      // 위로: 현재 장 제목이 밴드보다 충분히 아래로 내려간 뒤에만
      const curRow = tops.find((r) => r.ch === cur);
      if (curRow && curRow.top > TOP_ANCHOR_PX + 96) {
        emitActive(passed);
      }
    };

    // window + (데스크탑) .brp-reader 둘 다 — 스크롤 루트가 바뀌어도 놓치지 않음
    const reader = wrap.closest(".brp-reader");
    const onScroll = () => readActive();
    window.addEventListener("scroll", onScroll, { passive: true });
    reader?.addEventListener("scroll", onScroll, { passive: true });

    const io = new IntersectionObserver(
      () => readActive(),
      {
        root: null,
        // 상단 TOP_ANCHOR 근처 얇은 밴드
        rootMargin: `-${TOP_ANCHOR_PX}px 0px -70% 0px`,
        threshold: [0, 0.01, 1],
      },
    );
    const observeAll = () => {
      wrap.querySelectorAll<HTMLElement>("[data-chapter-anchor]").forEach((a) => {
        io.observe(a);
      });
    };
    observeAll();
    const t0 = window.setTimeout(readActive, 50);
    const t1 = window.setTimeout(readActive, 300);
    const t2 = window.setTimeout(readActive, 800);

    return () => {
      window.removeEventListener("scroll", onScroll);
      reader?.removeEventListener("scroll", onScroll);
      io.disconnect();
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [emitActive, mounted, bookId]);

  const attemptFinalize = useCallback(
    (ch: number) => {
      if (!bookConfirmed) return;
      if (!endVisibleRef.current.get(ch)) return;
      if (isChapterDone(bookId, ch, "reader")) return;

      const entered = enteredAtRef.current.get(ch) ?? Date.now();
      const wait = COMPLETE_GATE_MS - (Date.now() - entered);
      if (wait > 0) {
        const prev = endTimerRef.current.get(ch);
        if (prev != null) window.clearTimeout(prev);
        const id = window.setTimeout(() => {
          endTimerRef.current.delete(ch);
          attemptFinalize(ch);
        }, wait);
        endTimerRef.current.set(ch, id);
        return;
      }

      onCompleteRef.current(bookId, ch);
    },
    [bookConfirmed, bookId],
  );

  const handleEndVisibility = useCallback(
    (ch: number, visible: boolean) => {
      const was = endVisibleRef.current.get(ch) ?? false;
      endVisibleRef.current.set(ch, visible);
      if (visible && !was) {
        if (!enteredAtRef.current.has(ch)) {
          enteredAtRef.current.set(ch, Date.now());
        }
        attemptFinalize(ch);
      } else if (!visible) {
        const t = endTimerRef.current.get(ch);
        if (t != null) {
          window.clearTimeout(t);
          endTimerRef.current.delete(ch);
        }
      }
    },
    [attemptFinalize],
  );

  // 장 마운트 시 진입 시각
  useEffect(() => {
    const now = Date.now();
    for (const ch of mounted) {
      if (!enteredAtRef.current.has(ch)) {
        enteredAtRef.current.set(ch, now);
      }
    }
  }, [mounted]);

  const nextBook = nextBookId(bookId);
  const showNextBook = hi >= total && nextBook != null;

  return (
    <div className="brp-cont-krv" ref={wrapRef}>
      {topSpacer > 0 ? (
        <div
          className="brp-cont-spacer"
          style={{ height: topSpacer }}
          aria-hidden
        />
      ) : null}

      {mounted.map((ch) => {
        const minH = heightsRef.current.get(ch);
        return (
          <div
            key={`${bookId}-${ch}`}
            className="brp-cont-chapter"
            data-study-chapter={ch}
            style={minH && minH > 80 ? { minHeight: minH } : undefined}
          >
            <StudyNotebook
              bookId={bookId}
              chapter={ch}
              embedded
              flashVerse={ch === chapter ? flashVerse : null}
              onEndVisibilityChange={(vis) => handleEndVisibility(ch, vis)}
            />
          </div>
        );
      })}

      {showNextBook && nextBook ? (
        <div className="brp-cont-next-book">
          <button
            type="button"
            className="brp-cont-next-book-btn"
            onClick={() => onGoNextBook(nextBook)}
          >
            다음 책: {BOOKS[nextBook].name} →
          </button>
        </div>
      ) : null}

      {bottomSpacer > 0 ? (
        <div
          className="brp-cont-spacer"
          style={{ height: bottomSpacer }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}
