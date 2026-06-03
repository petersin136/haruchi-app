"use client";

/**
 * Dropdown — 사이트 톤앤매너에 맞춘 커스텀 select.
 *
 * 왜 직접 만드나?
 * - 네이티브 <select> 의 옵션 패널은 OS 가 그리기 때문에 (특히 macOS) 다크 회색
 *   톤으로 빠져 사이트(warm white + deep green) 톤과 완전히 어긋남.
 * - 위/아래 방향도 브라우저가 임의 결정 → UX 일관성 떨어짐.
 *
 * 특징
 * - 항상 라이트 톤 (surface/line/ink) + accent-soft 로 active 표시.
 * - 트리거 아래로 열리는 게 기본. 화면 아래 공간이 부족하면 위로 뒤집음.
 * - 선택된 항목으로 자동 스크롤 (열릴 때 view 안에 보이게).
 * - 바깥 클릭 / ESC 로 닫힘.
 * - 트리거 variant: "pill" (단독 드롭다운) / "ghost" (부모 컨테이너 안에 녹아드는 형태).
 * - sub 텍스트 (예: 장 부제목) 표시 옵션 — accent-warm 으로 톤.
 *
 * 모바일/태블릿/PC 모두 같은 컴포넌트로 동작. 패널 너비는 trigger 폭 ≥, 컨텐츠
 * 길이에 따라 적당히 늘어남(`width: max-content; max-width: calc(100vw - 24px)`).
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export type DropdownOption<T extends string | number> = {
  value: T;
  label: string;
  /** 옵션·트리거에 옅게 덧붙는 보조 텍스트 (예: 장 부제목). 색은 accent-warm 톤. */
  sub?: string;
};

type DropdownProps<T extends string | number> = {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  /** 트리거 텍스트 정렬 */
  align?: "center" | "left";
  /** 트리거 외형 — pill (단독) / ghost (부모 컨테이너에 녹아듦) */
  variant?: "pill" | "ghost";
  /** 트리거 높이 — md(40) / sm(34) */
  size?: "sm" | "md";
  /** 트리거에 sub 텍스트 표시 여부 (선택된 옵션의 sub) */
  showTriggerSub?: boolean;
  /**
   * value 가 options 안에 없을 때 트리거에 보여줄 placeholder.
   * 예) 책 선택을 구약/신약 두 드롭다운으로 분리한 경우 —
   * 현재 선택된 책이 신약이면 구약 쪽 드롭다운은 "구약" 으로 표시.
   * 미지정 시 빈 문자열로 fallback (기존 동작).
   */
  placeholderLabel?: string;
};

export default function Dropdown<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
  align = "center",
  variant = "pill",
  size = "md",
  showTriggerSub = false,
  placeholderLabel,
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"down" | "up">("down");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const current = options.find((o) => o.value === value);

  // 패널이 열릴 때 — 화면 아래 공간이 부족하면 위로 뒤집어 표시.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const above = r.top;
    const estPanelH = Math.min(options.length * 38 + 16, 320);
    setDirection(below < estPanelH && above > below ? "up" : "down");
  }, [open, options.length]);

  // 선택된 옵션을 view 안에 스크롤 — 열리자마자 현재 위치 확인 가능.
  useLayoutEffect(() => {
    if (!open || !panelRef.current) return;
    const sel = panelRef.current.querySelector<HTMLElement>('[aria-selected="true"]');
    if (sel) sel.scrollIntoView({ block: "nearest" });
  }, [open]);

  // 바깥 클릭 / ESC → 닫기
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleSelect = useCallback(
    (next: T) => {
      onChange(next);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [onChange]
  );

  return (
    <div
      className={[
        "brp-dd",
        `brp-dd--${variant}`,
        `brp-dd--${size}`,
        `brp-dd--${align}`,
        open ? "is-open" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        ref={triggerRef}
        type="button"
        className="brp-dd-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="brp-dd-trigger-inner">
          <span
            className={`brp-dd-trigger-label ${
              current ? "" : "is-placeholder"
            }`}
          >
            {current?.label ?? placeholderLabel ?? ""}
          </span>
          {showTriggerSub && current?.sub ? (
            <span className="brp-dd-trigger-sub">· {current.sub}</span>
          ) : null}
        </span>
        <span className="brp-dd-chevron" aria-hidden="true" />
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={listboxId}
          className={`brp-dd-panel brp-dd-panel--${direction}`}
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={String(opt.value)}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`brp-dd-opt ${isSelected ? "is-selected" : ""}`}
                onClick={() => handleSelect(opt.value)}
              >
                <span className="brp-dd-opt-check" aria-hidden="true">
                  {isSelected ? "✓" : ""}
                </span>
                <span className="brp-dd-opt-label">{opt.label}</span>
                {opt.sub ? <span className="brp-dd-opt-sub">· {opt.sub}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <style jsx>{`
        .brp-dd {
          position: relative;
          width: 100%;
          /* 상위 요소가 light 모드여도 OS 다크 모드 영향 받지 않게 강제 */
          color-scheme: light;
        }

        /* ── Trigger ─────────────────────────────────────────────── */
        .brp-dd-trigger {
          appearance: none;
          width: 100%;
          height: 40px;
          padding: 0 36px 0 16px;
          background: var(--surface);
          color: var(--ink);
          border: 1px solid var(--line);
          border-radius: var(--radius-pill);
          font: inherit;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: -0.01em;
          line-height: 1;
          cursor: pointer;
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          box-sizing: border-box;
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        .brp-dd-trigger:hover {
          background: var(--surface-alt);
          border-color: var(--line-strong);
        }
        .brp-dd-trigger:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
        .brp-dd.is-open .brp-dd-trigger {
          border-color: var(--ink-mute);
          background: var(--surface);
        }
        /* sm 사이즈 — 부모 pill(예: chapter switcher) 안에 녹아드는 케이스 */
        .brp-dd--sm .brp-dd-trigger {
          height: 34px;
          padding: 0 30px 0 14px;
          font-size: 13.5px;
        }
        /* ghost variant — 부모 컨테이너 안에 녹아듦 (배경/테두리 투명) */
        .brp-dd--ghost .brp-dd-trigger {
          background: transparent;
          border-color: transparent;
        }
        .brp-dd--ghost .brp-dd-trigger:hover {
          background: var(--surface-alt);
          border-color: transparent;
        }
        .brp-dd--ghost.is-open .brp-dd-trigger {
          background: var(--surface-alt);
          border-color: transparent;
        }
        /* 정렬 */
        .brp-dd--center .brp-dd-trigger {
          justify-content: center;
        }
        .brp-dd--left .brp-dd-trigger {
          justify-content: flex-start;
        }

        .brp-dd-trigger-inner {
          display: inline-flex;
          align-items: baseline;
          gap: 6px;
          min-width: 0;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .brp-dd-trigger-label {
          color: var(--ink);
        }
        /* placeholder (현재 선택값이 이 드롭다운의 options 에 없을 때) — 옅게. */
        .brp-dd-trigger-label.is-placeholder {
          color: var(--ink-soft);
          font-weight: 600;
        }
        .brp-dd-trigger-sub {
          color: var(--accent-warm);
          font-weight: 600;
          /* 트리거 메인 라벨과 동일 크기로 — 부제목 가독성 ↑.
             기존 0.92em(약 12.4px)는 사이드바 좁은 폭에서 다소 작게 보였음. */
          font-size: 1em;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* ── Chevron (CSS-only) ─────────────────────────────────── */
        .brp-dd-chevron {
          position: absolute;
          right: 16px;
          top: 50%;
          width: 7px;
          height: 7px;
          border-right: 1.5px solid var(--ink-soft);
          border-bottom: 1.5px solid var(--ink-soft);
          transform: translateY(-65%) rotate(45deg);
          pointer-events: none;
          transition: transform 0.2s ease;
        }
        .brp-dd--sm .brp-dd-chevron {
          right: 12px;
        }
        .brp-dd.is-open .brp-dd-chevron {
          transform: translateY(-30%) rotate(-135deg);
        }

        /* ── Panel (옵션 리스트) ─────────────────────────────────── */
        /* 살짝 투명한 흰색 + backdrop blur 로 뒤가 옅게 비치는 macOS 풍 톤.
           backdrop-filter 미지원 브라우저에선 좀 더 진한 흰색으로 fallback. */
        .brp-dd-panel {
          position: absolute;
          left: 0;
          z-index: 60;
          margin: 0;
          padding: 4px 0;
          background: rgba(255, 255, 255, 0.78);
          backdrop-filter: saturate(180%) blur(14px);
          -webkit-backdrop-filter: saturate(180%) blur(14px);
          border: 1px solid var(--line);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-2);
          max-height: 320px;
          overflow-y: auto;
          min-width: 100%;
          width: max-content;
          max-width: calc(100vw - 24px);
          color-scheme: light;
          /* 살짝 등장 — 톤은 차분하게 */
          animation: brp-dd-in 0.14s ease-out;
          /* 부드러운 스크롤 */
          scroll-behavior: smooth;
        }
        /* backdrop-filter 미지원 환경 fallback — 좀 더 진한 흰색 */
        @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
          .brp-dd-panel {
            background: rgba(255, 255, 255, 0.96);
          }
        }
        .brp-dd-panel--down {
          top: calc(100% + 6px);
        }
        .brp-dd-panel--up {
          bottom: calc(100% + 6px);
        }
        @keyframes brp-dd-in {
          from {
            opacity: 0;
            transform: translateY(-2px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        /* 패널 스크롤바 — 사이트 톤 (얇고 차분) */
        .brp-dd-panel::-webkit-scrollbar {
          width: 6px;
        }
        .brp-dd-panel::-webkit-scrollbar-track {
          background: transparent;
        }
        .brp-dd-panel::-webkit-scrollbar-thumb {
          background: var(--line-strong);
          border-radius: 3px;
        }

        /* ── Option ─────────────────────────────────────────────── */
        /* 셀 형태 — 라운드 코너 없이 패널 폭을 가득 채우고, 옅은 구분선으로
           항목 사이를 구분. 호버 시 셀 전체가 채워져 "마우스가 따라오는" 느낌. */
        .brp-dd-opt {
          all: unset;
          display: grid;
          grid-template-columns: 16px 1fr auto;
          align-items: baseline;
          column-gap: 8px;
          padding: 10px 14px;
          color: var(--ink);
          font-size: 14px;
          font-weight: 600;
          letter-spacing: -0.01em;
          line-height: 1.3;
          cursor: pointer;
          width: 100%;
          box-sizing: border-box;
          position: relative;
          transition: background 0.12s ease, color 0.12s ease;
        }
        /* 옅은 셀 구분선 — 첫 항목 위엔 안 그림 (border-top 으로 처리). */
        .brp-dd-opt + .brp-dd-opt {
          border-top: 1px solid rgba(0, 0, 0, 0.06);
        }
        .brp-dd-opt:hover {
          background: var(--surface-alt);
        }
        .brp-dd-opt:focus-visible {
          background: var(--accent-soft);
          outline: none;
        }
        .brp-dd-opt.is-selected {
          background: var(--accent-soft);
          color: var(--accent);
        }
        .brp-dd-opt.is-selected:hover {
          background: var(--accent-soft);
        }
        .brp-dd-opt-check {
          width: 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          color: var(--accent);
          font-weight: 700;
          line-height: 1;
        }
        .brp-dd-opt-label {
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .brp-dd-opt-sub {
          color: var(--accent-warm);
          font-weight: 500;
          font-size: 12.5px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 280px;
        }
        .brp-dd-opt.is-selected .brp-dd-opt-sub {
          color: var(--accent-hover);
        }

        /* 모바일 — 살짝 더 큰 터치 타깃 */
        @media (max-width: 600px) {
          .brp-dd-opt {
            padding: 12px 12px;
            font-size: 14.5px;
          }
        }
      `}</style>
    </div>
  );
}
