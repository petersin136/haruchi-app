import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import HebrewLayerViewer from "../../components/HebrewLayerViewer";

// 창세기 50장 — 데이터(`public/hebrew-test/genesis.json`) 와 일치.
const TOTAL_CHAPTERS = 50;

type PageProps = {
  params: { chapter: string };
};

export function generateStaticParams() {
  return Array.from({ length: TOTAL_CHAPTERS }, (_, i) => ({
    chapter: String(i + 1),
  }));
}

export const metadata: Metadata = {
  title: "히브리어 PoC · 창세기",
  description:
    "히브리어 학습용 PoC — 창세기. WLC 본문 + OSHB morphhb 형태 분석 + HebrewLexicon 한국어 뜻을 한 화면에 쌓아 보여줘요.",
};

export default function HebrewTestGenesisChapterPage({ params }: PageProps) {
  const n = Number.parseInt(params.chapter, 10);
  if (!Number.isFinite(n) || n < 1 || n > TOTAL_CHAPTERS) notFound();

  const prev = n > 1 ? n - 1 : null;
  const next = n < TOTAL_CHAPTERS ? n + 1 : null;

  return (
    <main className="hpoc-page">
      <nav className="hpoc-nav" aria-label="장 이동">
        {prev ? (
          <Link href={`/hebrew-test/genesis/${prev}`} className="hpoc-nav-btn">
            ← {prev}장
          </Link>
        ) : (
          <span className="hpoc-nav-spacer" aria-hidden="true" />
        )}
        <span className="hpoc-nav-meta">
          창세기 {n} / {TOTAL_CHAPTERS}장 · 히브리어 PoC
        </span>
        {next ? (
          <Link href={`/hebrew-test/genesis/${next}`} className="hpoc-nav-btn">
            {next}장 →
          </Link>
        ) : (
          <span className="hpoc-nav-spacer" aria-hidden="true" />
        )}
      </nav>

      <HebrewLayerViewer bookSlug="genesis" chapter={n} bookLabel="창세기" />

      <style>{`
        .hpoc-page {
          min-height: 100vh;
          background: var(--bg, #fafaf8);
        }
        .hpoc-nav {
          position: sticky;
          top: 0;
          z-index: 6;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          max-width: min(100%, 820px);
          margin: 0 auto;
          padding: 10px 16px;
          font-size: 13px;
          color: var(--ink-soft, #6b6b70);
          background: color-mix(in srgb, var(--bg, #fafaf8) 92%, transparent);
          backdrop-filter: saturate(1.2) blur(8px);
          border-bottom: 1px solid var(--line, #e6e6e2);
        }
        .hpoc-nav-btn {
          display: inline-flex;
          align-items: center;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid var(--line, #e6e6e2);
          background: var(--surface, #fff);
          color: var(--ink, #16161a);
          font-weight: 600;
          text-decoration: none;
        }
        .hpoc-nav-spacer { width: 64px; }
        .hpoc-nav-meta { font-weight: 600; }
      `}</style>
    </main>
  );
}
