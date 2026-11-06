"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

const HOLD_MS = 500;

type Props = {
  disabled: boolean;
  playing: boolean;
  speedOn: boolean;
  speed: number;
  prevLabel: string | null;
  nextLabel: string | null;
  onPrev: () => void;
  onNext: () => void;
  onTogglePlay: () => void;
  onToggleSpeed: () => void;
  onOpenSpeedSheet: () => void;
};

const PrevIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
    <path d="M6 5v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M19 6.2v11.6a.8.8 0 0 1-1.2.7L9.6 12.7a.8.8 0 0 1 0-1.4l8.2-5.8a.8.8 0 0 1 1.2.7Z" fill="currentColor" />
  </svg>
);

const NextIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
    <path d="M18 5v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M5 6.2v11.6a.8.8 0 0 0 1.2.7l8.2-5.8a.8.8 0 0 0 0-1.4L6.2 5.5A.8.8 0 0 0 5 6.2Z" fill="currentColor" />
  </svg>
);

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
    <path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.4-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6Z" fill="currentColor" />
  </svg>
);

const PauseIcon = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
    <rect x="6.5" y="5" width="4" height="14" rx="1.4" fill="currentColor" />
    <rect x="13.5" y="5" width="4" height="14" rx="1.4" fill="currentColor" />
  </svg>
);

export default function Remote({
  disabled,
  playing,
  speedOn,
  speed,
  prevLabel,
  nextLabel,
  onPrev,
  onNext,
  onTogglePlay,
  onToggleSpeed,
  onOpenSpeedSheet,
}: Props) {
  const timerRef = useRef<number | null>(null);
  const longPressedRef = useRef(false);
  const [holding, setHolding] = useState(false);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  const handleDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (disabled || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    longPressedRef.current = false;
    setHolding(true);
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      longPressedRef.current = true;
      setHolding(false);
      if ("vibrate" in navigator) navigator.vibrate(12);
      onToggleSpeed();
    }, HOLD_MS);
  };

  const handleUp = () => {
    if (disabled) return;
    const wasLong = longPressedRef.current;
    clearTimer();
    setHolding(false);
    longPressedRef.current = false;
    if (!wasLong) onTogglePlay();
  };

  const handleCancel = () => {
    clearTimer();
    setHolding(false);
    longPressedRef.current = false;
  };

  const handleKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!disabled && !e.repeat) onTogglePlay();
    }
  };

  return (
    <div className="wt-remote-wrap">
      <div className="wt-remote" role="group" aria-label="영상 리모컨">
        <button
          type="button"
          className="wt-remote-side"
          onClick={onPrev}
          disabled={disabled || prevLabel === null}
          aria-label={prevLabel ? `${prevLabel}로 이동` : "이전 장 없음"}
        >
          <PrevIcon />
        </button>

        <button
          type="button"
          className={`wt-remote-main${holding ? " is-holding" : ""}${speedOn ? " is-speed" : ""}`}
          disabled={disabled}
          aria-label={`${playing ? "일시정지" : "재생"} (길게 누르면 ${speed}× 배속 켜기/끄기)`}
          onPointerDown={handleDown}
          onPointerUp={handleUp}
          onPointerCancel={handleCancel}
          onKeyDown={handleKey}
          onContextMenu={(e) => e.preventDefault()}
        >
          <svg className="wt-remote-ring" viewBox="0 0 64 64" aria-hidden>
            <circle cx="32" cy="32" r="30" />
          </svg>
          {playing ? <PauseIcon /> : <PlayIcon />}
          {speedOn && <span className="wt-remote-speed-badge">{speed}×</span>}
        </button>

        <button
          type="button"
          className="wt-remote-side"
          onClick={onNext}
          disabled={disabled || nextLabel === null}
          aria-label={nextLabel ? `${nextLabel}로 이동` : "다음 장 없음"}
        >
          <NextIcon />
        </button>
      </div>

      <button
        type="button"
        className={`wt-speed-chip${speedOn ? " is-on" : ""}`}
        onClick={onOpenSpeedSheet}
        aria-label={`배속 설정 (현재 ${speed}×, ${speedOn ? "켜짐" : "꺼짐"})`}
      >
        {speed}×
      </button>
    </div>
  );
}
