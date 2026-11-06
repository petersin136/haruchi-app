"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import "./remote.css";

const HOLD_MS = 500;

type RemoteVariant = "a" | "b";

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

type NowInfo = { title: string; sub: string; progress: number };

const iconProps = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const PrevIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden {...iconProps}>
    <path d="M5 5v14" />
    <path d="M19 5.8v12.4L9.2 12z" />
  </svg>
);

const NextIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden {...iconProps}>
    <path d="M19 5v14" />
    <path d="M5 5.8v12.4L14.8 12z" />
  </svg>
);

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden {...iconProps}>
    <path d="M8 5.5v13l11-6.5z" />
  </svg>
);

const PauseIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden {...iconProps}>
    <path d="M8 6v12" />
    <path d="M16 6v12" />
  </svg>
);

function readVariant(): RemoteVariant {
  try {
    return new URLSearchParams(window.location.search).get("remote") === "b" ? "b" : "a";
  } catch {
    return "a";
  }
}

function readNowInfo(): NowInfo {
  const pick = document.querySelector(".wt-now-pick");
  const verse = document.querySelector(".wt-now-verse");
  const timeEl = document.querySelector(".wt-now-time");
  const bar = document.querySelector(".wt-now-bar > span") as HTMLElement | null;

  let title = "";
  if (pick) {
    const clone = pick.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".wt-now-verse, .wt-now-caret, svg").forEach((n) => n.remove());
    title = (clone.textContent ?? "").replace(/\s+/g, " ").trim();
  }

  const timeRaw = (timeEl?.childNodes[0]?.textContent ?? timeEl?.textContent ?? "").trim();
  const elapsed = timeRaw.split("/")[0]?.trim() ?? "";
  const verseText = (verse?.textContent ?? "").trim();
  const sub = verseText && elapsed ? `${verseText} · ${elapsed}` : verseText || elapsed;

  let progress = 0;
  if (bar) {
    const t = getComputedStyle(bar).transform;
    if (t && t !== "none") {
      const m = t.match(/matrix\(([^)]+)\)/);
      if (m) progress = Math.min(1, Math.max(0, Number(m[1].split(",")[0])));
    } else {
      const inline = bar.style.transform.match(/scaleX\(([^)]+)\)/);
      if (inline) progress = Math.min(1, Math.max(0, Number(inline[1])));
    }
  }

  return { title, sub, progress };
}

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
  onOpenSpeedSheet,
}: Props) {
  const timerRef = useRef<number | null>(null);
  const longPressedRef = useRef(false);
  const lastScrollY = useRef(0);
  const [variant, setVariant] = useState<RemoteVariant>("a");
  const [collapsed, setCollapsed] = useState(false);
  const [now, setNow] = useState<NowInfo>({ title: "", sub: "", progress: 0 });

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  useEffect(() => {
    const v = readVariant();
    setVariant(v);
    const page = document.querySelector(".wt-page");
    if (page) page.setAttribute("data-remote", v);
    return () => {
      page?.removeAttribute("data-remote");
    };
  }, []);

  useEffect(() => {
    if (variant !== "b") return;
    const tick = () => setNow(readNowInfo());
    tick();
    const id = window.setInterval(tick, 400);
    return () => window.clearInterval(id);
  }, [variant]);

  useEffect(() => {
    if (variant !== "a") return;
    const page = document.querySelector(".wt-page");
    if (!page) return;
    lastScrollY.current = page.scrollTop;
    const onScroll = () => {
      const y = page.scrollTop;
      const dy = y - lastScrollY.current;
      lastScrollY.current = y;
      if (dy > 4 && y > 24) setCollapsed(true);
      else if (dy < -4) setCollapsed(false);
      if (y <= 8) setCollapsed(false);
    };
    page.addEventListener("scroll", onScroll, { passive: true });
    return () => page.removeEventListener("scroll", onScroll);
  }, [variant]);

  const openSpeed = () => {
    if (variant === "a") setCollapsed(false);
    onOpenSpeedSheet();
  };

  const handleDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (disabled || e.button !== 0) return;
    if (collapsed) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    longPressedRef.current = false;
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      longPressedRef.current = true;
      if ("vibrate" in navigator) navigator.vibrate(12);
      openSpeed();
    }, HOLD_MS);
  };

  const handleUp = () => {
    if (disabled) return;
    if (collapsed) {
      setCollapsed(false);
      return;
    }
    const wasLong = longPressedRef.current;
    clearTimer();
    longPressedRef.current = false;
    if (!wasLong) onTogglePlay();
  };

  const handleCancel = () => {
    clearTimer();
    longPressedRef.current = false;
  };

  const handleKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (disabled || e.repeat) return;
      if (collapsed) setCollapsed(false);
      else onTogglePlay();
    }
  };

  const rateLabel = speedOn ? `${speed}×` : "1.0×";
  const progressStyle = { "--wt-rc-progress": String(now.progress) } as CSSProperties;

  return (
    <>
      <div className="wt-rc-fade" aria-hidden />
      <div
        className={`wt-rc-wrap${collapsed ? " is-collapsed" : ""}`}
        data-variant={variant}
      >
        <div className="wt-rc" role="group" aria-label="영상 리모컨" style={progressStyle}>
          {variant === "b" && (
            <>
              <div className="wt-rc-progress" aria-hidden>
                <span />
              </div>
              <div className="wt-rc-meta">
                <span className="wt-rc-meta-title">{now.title || "…"}</span>
                <span className="wt-rc-meta-sub">{now.sub || "—"}</span>
              </div>
            </>
          )}

          <div className="wt-rc-controls">
            <button
              type="button"
              className="wt-rc-btn wt-rc-side"
              onClick={onPrev}
              disabled={disabled || prevLabel === null}
              aria-label={prevLabel ? `${prevLabel}로 이동` : "이전 장 없음"}
            >
              <PrevIcon />
            </button>

            <button
              type="button"
              className="wt-rc-btn wt-rc-play"
              disabled={disabled}
              aria-label={
                collapsed
                  ? "리모컨 펼치기"
                  : `${playing ? "일시정지" : "재생"} (길게 누르면 배속 선택)`
              }
              onPointerDown={handleDown}
              onPointerUp={handleUp}
              onPointerCancel={handleCancel}
              onKeyDown={handleKey}
              onContextMenu={(e) => e.preventDefault()}
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>

            <button
              type="button"
              className="wt-rc-btn wt-rc-side"
              onClick={onNext}
              disabled={disabled || nextLabel === null}
              aria-label={nextLabel ? `${nextLabel}로 이동` : "다음 장 없음"}
            >
              <NextIcon />
            </button>

            <span className="wt-rc-divider" aria-hidden />

            <button
              type="button"
              className={`wt-rc-rate${speedOn ? " is-on" : ""}`}
              onClick={openSpeed}
              aria-label={`배속 설정 (현재 ${rateLabel})`}
            >
              {rateLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
