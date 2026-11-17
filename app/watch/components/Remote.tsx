"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { SPEED_OPTIONS, type SpeedOption } from "./watchStorage";
import "./remote.css";

type Props = {
  disabled: boolean;
  playing: boolean;
  speed: SpeedOption;
  chapter: number;
  /** 시편=편, 그 외=장 */
  chapterUnit: "장" | "편";
  totalChapters: number;
  /** 현재 장 절 수 (없으면 절 줄 숨김) */
  verseCount: number;
  hasVerseTimes: boolean;
  currentVerse: number | null;
  /** 이 장/편 안 경과(초) */
  chapterElapsed: number;
  /** 이 장/편 길이(초) */
  chapterLength: number;
  chapterProgress: number;
  /** null 이면 자리만 비움. 예: "‹ 2장" / "출애굽기 1장 ›" */
  prevLabel: string | null;
  nextLabel: string | null;
  onPrev: () => void;
  onNext: () => void;
  onTogglePlay: () => void;
  onSelectSpeed: (speed: SpeedOption) => void;
  onReplayVerse: () => void;
  /** 0~1 — 장 안 위치 */
  onSeekInChapter: (ratio: number) => void;
  onPickChapter: (chapter: number) => void;
  onPickVerse: (chapter: number, verse: number) => void;
  isChapterAvailable?: (chapter: number) => boolean;
  isVerseAvailable?: (verse: number) => boolean;
};

const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

const iconProps = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const ReplayIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden {...iconProps}>
    <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
    <path d="M4 4.5v4.2h4.2" />
  </svg>
);

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...iconProps}>
    <path d="M8 5.5v13l11-6.5z" stroke="none" fill="currentColor" />
  </svg>
);

const PauseIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...iconProps}>
    <path d="M8 6v12" />
    <path d="M16 6v12" />
  </svg>
);

function formatChapterClock(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, "0");
  return `${m}:${sec}`;
}

function formatSpeed(v: number): string {
  if (v === 1) return "1.0×";
  if (Number.isInteger(v)) return `${v}×`;
  return `${v}×`;
}

function scrollChipIntoView(
  scroller: HTMLElement | null,
  sel: string,
) {
  if (!scroller) return;
  const el = scroller.querySelector<HTMLElement>(sel);
  if (!el) return;
  const left =
    el.offsetLeft - scroller.clientWidth / 2 + el.offsetWidth / 2;
  scroller.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
}

export default function Remote({
  disabled,
  playing,
  speed,
  chapter,
  chapterUnit,
  totalChapters,
  verseCount,
  hasVerseTimes,
  currentVerse,
  chapterElapsed,
  chapterLength,
  chapterProgress,
  prevLabel,
  nextLabel,
  onPrev,
  onNext,
  onTogglePlay,
  onSelectSpeed,
  onReplayVerse,
  onSeekInChapter,
  onPickChapter,
  onPickVerse,
  isChapterAvailable,
  isVerseAvailable,
}: Props) {
  const [speedOpen, setSpeedOpen] = useState(false);
  const scrubbing = useRef(false);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const chapterRailRef = useRef<HTMLDivElement | null>(null);
  const verseRailRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!speedOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSpeedOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      const wrap = document.querySelector(".wt-rc-wrap");
      if (wrap && wrap.contains(t)) return;
      setSpeedOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [speedOpen]);

  useLayoutEffect(() => {
    scrollChipIntoView(chapterRailRef.current, `[data-rc-ch="${chapter}"]`);
  }, [chapter, totalChapters]);

  useLayoutEffect(() => {
    if (currentVerse == null) return;
    scrollChipIntoView(
      verseRailRef.current,
      `[data-rc-v="${currentVerse}"]`,
    );
  }, [chapter, currentVerse, verseCount]);

  const ratioFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };

  const onScrubDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || chapterLength <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubbing.current = true;
    onSeekInChapter(ratioFromClientX(e.clientX));
  };

  const onScrubMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!scrubbing.current) return;
    onSeekInChapter(ratioFromClientX(e.clientX));
  };

  const onScrubUp = () => {
    scrubbing.current = false;
  };

  const showVerseRail = hasVerseTimes && verseCount > 0;
  const clockLabel = (
    <span className="wt-rc-clock">
      {formatChapterClock(chapterElapsed)}
      <span className="wt-rc-clock-sep"> / </span>
      {formatChapterClock(chapterLength)}
    </span>
  );

  return (
    <>
      <div className="wt-rc-fade" aria-hidden />
      <div className="wt-rc-wrap">
        <div className="wt-rc" role="group" aria-label="영상 리모컨">
          <div className="wt-rc-picks" aria-label={`${chapterUnit}·절 바로 선택`}>
            <div className="wt-rc-pick-row">
              <span className="wt-rc-pick-label">{chapterUnit}</span>
              <div
                ref={chapterRailRef}
                className="wt-rc-chip-rail"
                role="listbox"
                aria-label={`${chapterUnit} 선택`}
              >
                {Array.from({ length: totalChapters }, (_, i) => i + 1).map(
                  (c) => {
                    const available = isChapterAvailable
                      ? isChapterAvailable(c)
                      : hasVerseTimes;
                    const selected = c === chapter;
                    return (
                      <button
                        key={c}
                        type="button"
                        role="option"
                        data-rc-ch={c}
                        aria-selected={selected}
                        className={`wt-rc-chip${selected ? " is-selected" : ""}`}
                        /* 영상 ready 와 무관 — 시간 데이터만 있으면 바로 선택 */
                        disabled={!available}
                        onClick={() => onPickChapter(c)}
                      >
                        {c}
                      </button>
                    );
                  },
                )}
              </div>
              {clockLabel}
            </div>

            {showVerseRail ? (
              <div className="wt-rc-pick-row">
                <span className="wt-rc-pick-label">절</span>
                <div
                  ref={verseRailRef}
                  className="wt-rc-chip-rail"
                  role="listbox"
                  aria-label="절 선택"
                >
                  {Array.from({ length: verseCount }, (_, i) => i + 1).map(
                    (v) => {
                      const available = isVerseAvailable
                        ? isVerseAvailable(v)
                        : true;
                      const selected = currentVerse === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          role="option"
                          data-rc-v={v}
                          aria-selected={selected}
                          className={`wt-rc-chip${selected ? " is-selected" : ""}`}
                          /* 영상 ready 와 무관 — 절 시간만 있으면 바로 선택 */
                          disabled={!available}
                          onClick={() => onPickVerse(chapter, v)}
                        >
                          {v}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div
            ref={trackRef}
            className="wt-rc-scrub"
            role="slider"
            aria-label={`이 ${chapterUnit} 진행`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(chapterProgress * 100)}
            tabIndex={disabled ? -1 : 0}
            onPointerDown={onScrubDown}
            onPointerMove={onScrubMove}
            onPointerUp={onScrubUp}
            onPointerCancel={onScrubUp}
          >
            <div className="wt-rc-scrub-track" aria-hidden>
              <span
                className="wt-rc-scrub-fill"
                style={{ transform: `scaleX(${chapterProgress})` }}
              />
            </div>
          </div>

          <div className="wt-rc-row2">
            <div className="wt-rc-slot">
              {prevLabel !== null ? (
                <button
                  type="button"
                  className="wt-rc-chap"
                  onClick={onPrev}
                  disabled={disabled}
                  aria-label={prevLabel}
                >
                  {prevLabel}
                </button>
              ) : null}
            </div>

            <button
              type="button"
              className="wt-rc-icon-btn"
              onClick={onReplayVerse}
              disabled={disabled || currentVerse === null}
              aria-label="이 절 다시 듣기"
              title="이 절 다시"
            >
              <ReplayIcon />
              <span className="wt-rc-icon-label">이 절 다시</span>
            </button>

            <button
              type="button"
              className={`wt-rc-play${playing ? " is-playing" : ""}`}
              onClick={onTogglePlay}
              disabled={disabled}
              aria-label={playing ? "일시정지" : "재생"}
            >
              <span
                className="wt-rc-play-icon"
                style={{ transition: `opacity 180ms ${EASE}` }}
              >
                {playing ? <PauseIcon /> : <PlayIcon />}
              </span>
            </button>

            <button
              type="button"
              className={`wt-rc-rate${speedOpen ? " is-open" : ""}`}
              onClick={() => setSpeedOpen((o) => !o)}
              disabled={disabled}
              aria-expanded={speedOpen}
              aria-haspopup="listbox"
              aria-label={`배속 (현재 ${formatSpeed(speed)})`}
            >
              {formatSpeed(speed)}
            </button>

            <div className="wt-rc-slot">
              {nextLabel !== null ? (
                <button
                  type="button"
                  className="wt-rc-chap"
                  onClick={onNext}
                  disabled={disabled}
                  aria-label={nextLabel}
                >
                  {nextLabel}
                </button>
              ) : null}
            </div>
          </div>

          {/* 모바일: 열었을 때만 / PC: 아래 여백에 상시 도킹 */}
          <div
            className={`wt-rc-speed-dock${speedOpen ? " is-open" : ""}`}
            role="listbox"
            aria-label="배속 선택"
            hidden={!speedOpen}
          >
            {SPEED_OPTIONS.map((v) => (
              <button
                key={v}
                type="button"
                role="option"
                aria-selected={speed === v}
                className={`wt-rc-speed-opt${speed === v ? " is-selected" : ""}`}
                onClick={() => {
                  onSelectSpeed(v);
                  setSpeedOpen(false);
                }}
              >
                {formatSpeed(v)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
