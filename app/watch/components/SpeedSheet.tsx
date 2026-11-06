"use client";

import { useEffect, useState } from "react";
import { SPEED_OPTIONS, type SpeedOption } from "./watchStorage";
import "./remote.css";

const POP_SPEEDS = [1, 1.25, 1.5, 1.75, 2] as const;

type Props = {
  open: boolean;
  speed: SpeedOption;
  speedOn: boolean;
  onSelect: (speed: SpeedOption) => void;
  onToggle: () => void;
  onClose: () => void;
};

export default function SpeedSheet({ open, speed, speedOn, onSelect, onToggle, onClose }: Props) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    setShown(false);
    const id = window.setTimeout(() => setMounted(false), 280);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  const selected = speedOn ? speed : 1;

  const pick = (v: (typeof POP_SPEEDS)[number]) => {
    if (v === 1) {
      if (speedOn) onToggle();
      onClose();
      return;
    }
    if ((SPEED_OPTIONS as readonly number[]).includes(v)) {
      onSelect(v as SpeedOption);
    }
    onClose();
  };

  return (
    <div className={`wt-rc-pop-layer${shown ? " is-open" : ""}`}>
      <button type="button" className="wt-rc-pop-backdrop" aria-label="닫기" onClick={onClose} />
      <div className="wt-rc-pop" role="dialog" aria-modal="true" aria-label="배속 선택">
        {POP_SPEEDS.map((v) => (
          <button
            key={v}
            type="button"
            className={`wt-rc-pop-opt${selected === v ? " is-selected" : ""}`}
            aria-pressed={selected === v}
            onClick={() => pick(v)}
          >
            {v === 1 ? "1.0" : v.toFixed(2).replace(/0$/, "")}
          </button>
        ))}
      </div>
    </div>
  );
}
