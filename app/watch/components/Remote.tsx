"use client";

import {
  useEffect,
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
  bookName: string;
  chapter: number;
  currentVerse: number | null;
  /** 이 장 안 경과(초) */
  chapterElapsed: number;
  /** 이 장 길이(초) */
  chapterLength: number;
  chapterProgress: number;
  prevChapter: number | null;
  nextChapter: number | null;
  onPrev: () => void;
  onNext: () => void;
  onTogglePlay: () => void;
  onSelectSpeed: (speed: SpeedOption) => void;
  onOpenVerseSheet: () => void;
  onReplayVerse: () => void;
  /** 0~1 — 장 안 위치 */
  onSeekInChapter: (ratio: number) => void;
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

export default function Remote({
  disabled,
  playing,
  speed,
  bookName,
  chapter,
  currentVerse,
  chapterElapsed,
  chapterLength,
  chapterProgress,
  prevChapter,
  nextChapter,
  onPrev,
  onNext,
  onTogglePlay,
  onSelectSpeed,
  onOpenVerseSheet,
  onReplayVerse,
  onSeekInChapter,
}: Props) {
  const [speedOpen, setSpeedOpen] = useState(false);
  const scrubbing = useRef(false);
  const trackRef = useRef<HTMLDivElement | null>(null);

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

  const versePart =
    currentVerse !== null ? `${chapter}:${currentVerse}` : null;

  return (
    <>
      <div className="wt-rc-fade" aria-hidden />
      <div className="wt-rc-wrap">
        {speedOpen && (
          <div className="wt-rc-speed-pop" role="listbox" aria-label="배속 선택">
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
        )}

        <div className="wt-rc" role="group" aria-label="영상 리모컨">
          <div className="wt-rc-row1">
            <button
              type="button"
              className="wt-rc-title"
              onClick={onOpenVerseSheet}
              disabled={disabled}
              aria-haspopup="dialog"
            >
              <span className="wt-rc-title-book">
                {bookName} {chapter}장
              </span>
              {versePart && (
                <>
                  <span className="wt-rc-title-dot" aria-hidden>
                    ·
                  </span>
                  <span className="wt-rc-title-verse">{versePart}</span>
                </>
              )}
              <span className="wt-rc-title-caret" aria-hidden>
                ▾
              </span>
            </button>
            <span className="wt-rc-clock">
              {formatChapterClock(chapterElapsed)}
              <span className="wt-rc-clock-sep"> / </span>
              {formatChapterClock(chapterLength)}
            </span>
          </div>

          <div
            ref={trackRef}
            className="wt-rc-scrub"
            role="slider"
            aria-label="이 장 진행"
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
              {prevChapter !== null ? (
                <button
                  type="button"
                  className="wt-rc-chap"
                  onClick={onPrev}
                  disabled={disabled}
                  aria-label={`${prevChapter}장으로 이동`}
                >
                  ‹ {prevChapter}장
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
              <span className="wt-rc-play-icon" style={{ transition: `opacity 180ms ${EASE}` }}>
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
              {nextChapter !== null ? (
                <button
                  type="button"
                  className="wt-rc-chap"
                  onClick={onNext}
                  disabled={disabled}
                  aria-label={`${nextChapter}장으로 이동`}
                >
                  {nextChapter}장 ›
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
