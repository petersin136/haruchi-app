"use client";

import { memo, useCallback, useLayoutEffect, useRef, useState } from "react";
import type { BookId } from "@/app/bible-reading/books";
import SummaryPanel from "./SummaryPanel";
import WordPosterPanel from "./WordPosterPanel";
import XrefPanel from "./XrefPanel";

const TABS = [
  { id: "ref", label: "관주" },
  { id: "orig", label: "원어" },
  { id: "sum", label: "요약" },
] as const;

function SwipeTabs({ bookId, chapter }: { bookId: BookId; chapter: number }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState(0);

  // 트랙 높이를 보이는 탭에 맞춘다. 그렇지 않으면 가장 긴 탭(관주) 높이만큼 아래가 빈다.
  useLayoutEffect(() => {
    const track = trackRef.current;
    const tab = tabRefs.current[active];
    if (!track || !tab) return;
    const fit = () => {
      track.style.height = `${tab.offsetHeight}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(tab);
    return () => ro.disconnect();
  }, [active]);

  const handleScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setActive(Math.min(TABS.length - 1, Math.max(0, i)));
  }, []);

  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <section className="wt-tabs" data-tone={TABS[active].id}>
      <div className="wt-tabs-head">
        <span className="wt-tabs-label">{TABS[active].label}</span>
        <div className="wt-dots" role="tablist" aria-label="보기 전환">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={t.label}
              data-tone={t.id}
              className={`wt-dot${i === active ? " is-active" : ""}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      </div>

      <div ref={trackRef} className="wt-tabs-track" onScroll={handleScroll}>
        {TABS.map((t, i) => (
          <div
            key={t.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            className={`wt-tab${i === active ? " is-active" : ""}`}
            role="tabpanel"
            aria-label={t.label}
          >
            <article className="wt-tab-card" data-tone={t.id}>
              {t.id === "ref" ? (
                <XrefPanel bookId={bookId} chapter={chapter} />
              ) : t.id === "orig" ? (
                <WordPosterPanel bookId={bookId} chapter={chapter} />
              ) : (
                <SummaryPanel bookId={bookId} chapter={chapter} />
              )}
            </article>
          </div>
        ))}
      </div>
    </section>
  );
}

export default memo(SwipeTabs);
