"use client";

import { useEffect, useRef } from "react";

type Props = {
  /** 장·모드가 바뀌면 부모에서 key 로 리마운트해 교차 상태를 초기화한다. */
  onVisibilityChange: (visible: boolean) => void;
};

/**
 * 본문 마지막 절 뒤에 두는 1px 센티널.
 * IntersectionObserver 로 비교차→교차 / 교차→비교차 전환을 부모에 알린다.
 */
export default function ChapterEndSentinel({ onVisibilityChange }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const wasVisibleRef = useRef(false);
  const onChangeRef = useRef(onVisibilityChange);
  onChangeRef.current = onVisibilityChange;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    wasVisibleRef.current = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        const visible = !!entry?.isIntersecting;
        if (visible === wasVisibleRef.current) return;
        wasVisibleRef.current = visible;
        onChangeRef.current(visible);
      },
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="brp-chapter-end-sentinel"
      aria-hidden="true"
      style={{ height: 1, width: "100%", pointerEvents: "none" }}
    />
  );
}
