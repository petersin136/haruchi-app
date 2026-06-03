"use client";

/**
 * SlidingToggle — 슬라이딩 인디케이터(.brp-toggle-indicator) 가 활성 버튼의
 * 실제 폭·위치에 정확히 정렬되는 토글 컨테이너.
 *
 * 왜 동적 정렬?
 * - 기존에는 인디케이터 폭을 `100% / 버튼 수` 로 균등 분할했는데, 라벨 길이가
 *   다르거나 컨테이너가 좁아지면(예: 태블릿 portrait 의 사이드 그리드)
 *   인디케이터가 활성 텍스트를 정확히 못 덮어 시각적으로 깨져 보였다.
 *   (개역한글 / 어린이 / 원어묵상 — 원어묵상 활성 시 우측 가장자리 어긋남)
 * - 본 컴포넌트는 활성 버튼의 offsetLeft·offsetWidth 를 측정해 인디케이터의
 *   transform·width 를 inline style 로 직접 잡는다. 라벨 길이·컨테이너 폭과
 *   무관하게 항상 활성 버튼 위에 정확히 맞물린다.
 * - ResizeObserver 로 컨테이너 / 버튼 폭이 바뀌면(창 크기·폰트 로드) 자동 재정렬.
 *
 * 시각 톤은 기존 .brp-toggle / .brp-toggle-indicator CSS 를 그대로 사용한다.
 * 컨테이너 / 버튼 className 은 호출부에서 주입(.brp-translation--sm 등).
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

export type SlidingToggleItem<K extends string> = {
  /** 활성 비교에 쓰이는 고유 키. */
  key: K;
  /** 버튼 안에 그릴 내용 (텍스트·아이콘 등). */
  label: ReactNode;
  /** 비활성(클릭 불가) 여부. */
  disabled?: boolean;
  /** 비활성 사유 등 hover title. */
  title?: string;
  /**
   * role="tab" 일 때 aria-selected 값. role="button" 이면 무시.
   * 호출부가 명시하지 않으면 자동으로 활성 키 일치 여부로 채운다.
   */
  ariaSelected?: boolean;
};

export type SlidingToggleProps<K extends string> = {
  items: ReadonlyArray<SlidingToggleItem<K>>;
  /** 현재 활성된 키 (인디케이터 위치 기준). */
  activeKey: K;
  /** 버튼 클릭 시 호출. 비활성 항목 클릭은 무시된다. */
  onSelect: (key: K) => void;
  /** 컨테이너에 붙는 className (예: "brp-translation brp-translation--sm brp-toggle"). */
  className?: string;
  /** 각 버튼에 공통으로 붙는 className (예: "brp-mode-tab"). */
  buttonClassName?: string;
  /** 컨테이너의 ARIA 레이블. */
  ariaLabel?: string;
  /**
   * 컨테이너 role.
   *   "tablist" → 각 버튼이 role="tab" 으로 렌더되고 aria-selected 자동.
   *   "group"   → 일반 버튼 그룹 (개역한글/어린이/원어묵상 같은 단일 선택).
   */
  role?: "tablist" | "group";
};

/**
 * 슬라이딩 인디케이터를 활성 버튼에 동적으로 정렬하는 토글.
 *
 * @example
 * <SlidingToggle
 *   className="brp-translation brp-translation--sm brp-toggle"
 *   ariaLabel="번역 선택"
 *   role="group"
 *   activeKey={effectiveTranslation}
 *   onSelect={handleTranslationChange}
 *   items={translationKeys.map((key) => ({ key, label: ..., disabled: ... }))}
 * />
 */
export default function SlidingToggle<K extends string>({
  items,
  activeKey,
  onSelect,
  className,
  buttonClassName,
  ariaLabel,
  role = "group",
}: SlidingToggleProps<K>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonsRef = useRef<Map<K, HTMLButtonElement>>(new Map());
  // null 이면 첫 측정 전 — 인디케이터를 opacity:0 으로 숨겨 깜빡임 방지.
  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
  } | null>(null);

  // 활성 버튼의 offsetLeft·offsetWidth 측정 → 인디케이터 위치 반영.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const btn = buttonsRef.current.get(activeKey);
      if (!btn) return;
      const left = btn.offsetLeft;
      const width = btn.offsetWidth;
      setIndicator((prev) =>
        prev && prev.left === left && prev.width === width
          ? prev
          : { left, width },
      );
    };
    measure();
    // 컨테이너 / 각 버튼 폭이 바뀌면 (창 리사이즈, 폰트 로드, 라벨 변경) 재측정.
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    buttonsRef.current.forEach((b) => ro.observe(b));
    return () => ro.disconnect();
  }, [activeKey, items]);

  // 폰트가 늦게 로드되면 텍스트 폭이 바뀌므로 한 번 더 재정렬.
  useEffect(() => {
    const fonts = (
      document as unknown as { fonts?: { ready?: Promise<unknown> } }
    ).fonts;
    if (!fonts?.ready) return;
    let cancelled = false;
    fonts.ready
      .then(() => {
        if (cancelled) return;
        const btn = buttonsRef.current.get(activeKey);
        const container = containerRef.current;
        if (!btn || !container) return;
        setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeKey]);

  const indicatorStyle: CSSProperties = indicator
    ? {
        width: `${indicator.width}px`,
        transform: `translate3d(${indicator.left}px, 0, 0)`,
      }
    : { opacity: 0 };

  return (
    <div
      ref={containerRef}
      className={className}
      role={role}
      aria-label={ariaLabel}
    >
      <span
        className="brp-toggle-indicator"
        aria-hidden="true"
        style={indicatorStyle}
      />
      {items.map((item) => {
        const isActive = item.key === activeKey;
        const buttonProps: Record<string, unknown> = {
          type: "button",
          disabled: item.disabled,
          title: item.title,
          onClick: () => {
            if (item.disabled) return;
            onSelect(item.key);
          },
          className: [
            buttonClassName,
            isActive ? "is-active" : "",
            item.disabled ? "is-disabled" : "",
          ]
            .filter(Boolean)
            .join(" "),
        };
        if (role === "tablist") {
          buttonProps.role = "tab";
          buttonProps["aria-selected"] = item.ariaSelected ?? isActive;
        }
        return (
          <button
            key={item.key}
            ref={(el) => {
              if (el) buttonsRef.current.set(item.key, el);
              else buttonsRef.current.delete(item.key);
            }}
            {...buttonProps}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
