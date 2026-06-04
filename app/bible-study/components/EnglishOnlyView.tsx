"use client";

/**
 * EnglishOnlyView — "성경 공부" 모드의 단일 역본(영어 WEB) 읽기 뷰.
 *
 * 기존 한국어 reader 가 책별 데이터(BOOK_DATA) 에서 영어를 지원하지 않기 때문에,
 * 영어 모드는 본 파일이 직접 app/bible-study/data/<bookId>.json 의 english
 * 레이어만 골라 한 줄씩 렌더링한다. 신약 27권 어떤 장이든 동작한다.
 *
 * 디자인:
 *   - 부모 .brp-reader 카드 안에 임베드되어 동일한 폭/여백/폰트를 상속.
 *   - 절 번호(.brp-verse-number 톤) + 본문 한 줄. 절별 복사 버튼.
 *   - 라이선스 푸터 한 줄.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

export type EnglishBookId =
  | "matthew"
  | "mark"
  | "luke"
  | "john"
  | "acts"
  | "romans"
  | "corinthians1"
  | "corinthians2"
  | "galatians"
  | "ephesians"
  | "philippians"
  | "colossians"
  | "thessalonians1"
  | "thessalonians2"
  | "timothy1"
  | "timothy2"
  | "titus"
  | "philemon"
  | "hebrews"
  | "james"
  | "peter1"
  | "peter2"
  | "john1"
  | "john2"
  | "john3"
  | "jude"
  | "revelation";

type StudyVerse = {
  ref: string;
  layers: {
    english?: { type: "text"; content: string };
  };
};

type StudyChapter = {
  chapter: number;
  verses: StudyVerse[];
};

type StudyBookData = {
  book: string;
  bookId: EnglishBookId;
  chapters: StudyChapter[];
};

// 책별 데이터 — public/bible-study/data/<bookId>.json 을 fetch 로 받아온다.
// LayeredBibleViewer 와 같은 데이터 파일을 공유하므로 같은 책에 대해 두 컴포넌트
// 사이에서도 두 번 받지 않도록 모듈 레벨 캐시.
const bookCache = new Map<EnglishBookId, Promise<StudyBookData>>();

async function loadStudyBook(book: EnglishBookId): Promise<StudyBookData> {
  const cached = bookCache.get(book);
  if (cached) return cached;
  const p = (async () => {
    const res = await fetch(`/bible-study/data/${book}.json`, {
      cache: "force-cache",
    });
    if (!res.ok)
      throw new Error(`HTTP ${res.status} — ${book} 데이터 없음`);
    return (await res.json()) as StudyBookData;
  })();
  bookCache.set(book, p);
  p.catch(() => bookCache.delete(book));
  return p;
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 15V5a2 2 0 0 1 2-2h8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

type EnglishOnlyViewProps = {
  /** 어떤 책의 어떤 장을 영어(WEB) 으로 보여줄지. 기본 로마서 1장. */
  bookId?: EnglishBookId;
  chapter?: number;
};

export default function EnglishOnlyView({
  bookId = "romans",
  chapter = 1,
}: EnglishOnlyViewProps = {}) {
  const [toast, setToast] = useState<string | null>(null);
  const [bookData, setBookData] = useState<StudyBookData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBookData(null);
    setLoadError(null);
    loadStudyBook(bookId)
      .then((d) => {
        if (!cancelled) setBookData(d);
      })
      .catch((e) => {
        if (!cancelled) {
          setLoadError(
            e instanceof Error ? e.message : "데이터를 불러오지 못했어요.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 1400);
    return () => window.clearTimeout(t);
  }, [toast]);

  const handleCopy = useCallback(async (ref: string, text: string) => {
    const ok = await writeClipboard(`${ref}\n${text}`);
    setToast(ok ? `${ref} 복사됨` : "복사에 실패했어요");
  }, []);

  // 현재 장의 영어 절들 — 텍스트가 비어있는 절은 제외.
  const verses = useMemo(() => {
    if (!bookData) return [] as { n: number; ref: string; text: string }[];
    const ch =
      bookData.chapters.find((c) => c.chapter === chapter) ??
      bookData.chapters[bookData.chapters.length - 1] ??
      null;
    if (!ch) return [];
    return ch.verses
      .map((v) => ({
        n: parseInt(v.ref.split(":").pop() || "0", 10),
        ref: v.ref,
        text: (v.layers.english?.content || "").trim(),
      }))
      .filter((v) => v.text);
  }, [bookData, chapter]);

  const ariaLabel = bookData
    ? `${bookData.book} ${chapter}장 영어(WEB)`
    : "성경 공부 — 영어(WEB)";

  return (
    <section className="eov" aria-label={ariaLabel}>
      {loadError && (
        <p className="eov-empty eov-error">
          데이터를 불러오는 중 오류가 발생했어요 — {loadError}
        </p>
      )}
      {!bookData && !loadError && <p className="eov-empty">불러오는 중…</p>}
      {bookData && verses.length === 0 && (
        <p className="eov-empty">이 장에는 영어(WEB) 본문이 없어요.</p>
      )}
      <ol className="eov-verses">
        {verses.map((v) => (
          <li key={v.n} className="eov-verse">
            <div className="eov-row">
              <span className="eov-num" aria-hidden="true">
                {v.n}
              </span>
              <p className="eov-text" lang="en">
                {v.text}
              </p>
              <button
                type="button"
                className="eov-copy"
                onClick={() => handleCopy(v.ref, v.text)}
                aria-label={`${v.ref} 복사`}
                title="복사"
              >
                <CopyIcon />
              </button>
            </div>
          </li>
        ))}
      </ol>
      <footer className="eov-footer">
        <small>
          영어 World English Bible (WEB, 퍼블릭 도메인) — 다른 번역으로 바꾸려면
          오른쪽 메뉴의 드롭다운을 사용하세요.
        </small>
      </footer>

      {toast && (
        <div className="eov-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      <style jsx>{`
        .eov {
          color: var(--ink, #16161a);
          font-family: var(--reader-font-family, inherit);
          font-size: 16px;
        }
        .eov-empty {
          padding: 32px 8px;
          text-align: center;
          color: var(--ink-mute, #9a9aa0);
        }
        .eov-empty.eov-error {
          color: #b54545;
        }
        .eov-verses {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
        }
        .eov-verse {
          padding: 10px 0;
          border-bottom: 1px solid var(--line, #e6e6e2);
        }
        .eov-verse:last-child {
          border-bottom: none;
        }
        .eov-row {
          display: grid;
          grid-template-columns: 2em minmax(0, 1fr) 30px;
          column-gap: clamp(8px, 1vw, 12px);
          align-items: baseline;
        }
        .eov-num {
          color: var(--ink-mute, #9a9aa0);
          font-size: 0.92em;
          font-weight: 400;
          line-height: inherit;
          text-align: center;
          font-variant-numeric: tabular-nums;
        }
        .eov-text {
          margin: 0;
          font: inherit;
          line-height: 1.62;
          word-break: normal;
          overflow-wrap: break-word;
        }
        .eov-copy {
          appearance: none;
          align-self: center;
          width: 28px;
          height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid transparent;
          border-radius: 7px;
          background: transparent;
          color: var(--ink-mute, #9a9aa0);
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.15s ease, background 0.15s ease,
            border-color 0.15s ease, color 0.15s ease;
        }
        .eov-verse:hover .eov-copy,
        .eov-copy:focus-visible {
          opacity: 1;
        }
        .eov-copy:hover {
          color: var(--accent, #2e5d4b);
          background: color-mix(in srgb, var(--accent, #2e5d4b) 7%, transparent);
          border-color: color-mix(in srgb, var(--accent, #2e5d4b) 35%, transparent);
        }
        /* 모바일 — hover 가 없으므로 복사 버튼은 항상 옅게 표시. */
        @media (hover: none) {
          .eov-copy {
            opacity: 0.55;
          }
        }
        .eov-footer {
          margin-top: 18px;
          padding-top: 12px;
          border-top: 1px dashed var(--line, #e6e6e2);
          color: var(--ink-mute, #9a9aa0);
          font-size: 11.5px;
          line-height: 1.6;
        }
        .eov-toast {
          position: fixed;
          left: 50%;
          bottom: 40px;
          transform: translateX(-50%);
          z-index: 60;
          background: var(--ink, #16161a);
          color: var(--bg, #fff);
          padding: 9px 18px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 600;
          box-shadow: 0 8px 22px rgba(0, 0, 0, 0.22);
          pointer-events: none;
          white-space: nowrap;
        }
      `}</style>
    </section>
  );
}
