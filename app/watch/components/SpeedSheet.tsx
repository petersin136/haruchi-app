"use client";

import { useEffect } from "react";
import { SPEED_OPTIONS, type SpeedOption } from "./watchStorage";

type Props = {
  open: boolean;
  speed: SpeedOption;
  speedOn: boolean;
  onSelect: (speed: SpeedOption) => void;
  onToggle: () => void;
  onClose: () => void;
};

export default function SpeedSheet({ open, speed, speedOn, onSelect, onToggle, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="wt-sheet-layer">
      <button type="button" className="wt-sheet-backdrop" aria-label="닫기" onClick={onClose} />
      <div className="wt-sheet" role="dialog" aria-modal="true" aria-label="배속 설정">
        <span className="wt-sheet-grip" aria-hidden />
        <div className="wt-sheet-head">
          <h2 className="wt-sheet-title">배속</h2>
          <button
            type="button"
            role="switch"
            aria-checked={speedOn}
            className={`wt-switch${speedOn ? " is-on" : ""}`}
            onClick={onToggle}
          >
            <span className="wt-switch-label">{speedOn ? "켜짐" : "꺼짐"}</span>
            <span className="wt-switch-track">
              <span className="wt-switch-thumb" />
            </span>
          </button>
        </div>

        <div className="wt-speed-grid">
          {SPEED_OPTIONS.map((v) => (
            <button
              key={v}
              type="button"
              className={`wt-speed-opt${v === speed ? " is-selected" : ""}`}
              aria-pressed={v === speed}
              onClick={() => onSelect(v)}
            >
              {v}×
            </button>
          ))}
        </div>

        <p className="wt-sheet-hint">리모컨 가운데 버튼을 길게 누르면 배속을 켜고 끌 수 있어요.</p>
      </div>
    </div>
  );
}
