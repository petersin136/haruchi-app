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
  // 신약 27권
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
  | "revelation"
  // 구약 39권
  | "genesis"
  | "exodus"
  | "leviticus"
  | "numbers"
  | "deuteronomy"
  | "joshua"
  | "judges"
  | "ruth"
  | "samuel1"
  | "samuel2"
  | "kings1"
  | "kings2"
  | "chronicles1"
  | "chronicles2"
  | "ezra"
  | "nehemiah"
  | "esther"
  | "job"
  | "psalms"
  | "proverbs"
  | "ecclesiastes"
  | "songofsolomon"
  | "isaiah"
  | "jeremiah"
  | "lamentations"
  | "ezekiel"
  | "daniel"
  | "hosea"
  | "joel"
  | "amos"
  | "obadiah"
  | "jonah"
  | "micah"
  | "nahum"
  | "habakkuk"
  | "zephaniah"
  | "haggai"
  | "zechariah"
  | "malachi";

// ── 청크/manifest 스키마 ────────────────────────────────────────────────────
// 한 권 통째로 받지 않고, manifest(메타) + 현재 장의 english 청크만 받는다.
// 다른 장으로 이동하면 그때 그 장의 english 청크를 lazy 로 받는다(캐시).
type ChapterMeta = { chapter: number; verseCount: number };

type BookManifest = {
  book: string;
  bookId?: EnglishBookId;
  chapters: ChapterMeta[];
};

type EnglishLayer = { type: "text"; content: string };

type EnglishChunk = {
  chapter: number;
  layer: "english";
  verses: Record<string, EnglishLayer>;
};

// 모듈 레벨 캐시 — 같은 책의 manifest 와 (책, 장) 조합 청크는 한 번만 fetch.
const manifestCache = new Map<EnglishBookId, Promise<BookManifest>>();
const chunkCache = new Map<string, Promise<EnglishChunk>>();

async function loadManifest(book: EnglishBookId): Promise<BookManifest> {
  const cached = manifestCache.get(book);
  if (cached) return cached;
  const p = (async () => {
    const res = await fetch(`/bible-study/chunks/${book}/manifest.json`, {
      cache: "default",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${book} manifest 없음`);
    return (await res.json()) as BookManifest;
  })();
  manifestCache.set(book, p);
  p.catch(() => manifestCache.delete(book));
  return p;
}

async function loadEnglishChunk(
  book: EnglishBookId,
  ch: number,
): Promise<EnglishChunk> {
  const k = `${book}|${ch}`;
  const cached = chunkCache.get(k);
  if (cached) return cached;
  const p = (async () => {
    const res = await fetch(
      `/bible-study/chunks/${book}/${ch}/english.json`,
      { cache: "default" },
    );
    if (!res.ok)
      throw new Error(`HTTP ${res.status} — ${book} ${ch}장 english 없음`);
    return (await res.json()) as EnglishChunk;
  })();
  chunkCache.set(k, p);
  p.catch(() => chunkCache.delete(k));
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
  const [manifest, setManifest] = useState<BookManifest | null>(null);
  const [chunk, setChunk] = useState<EnglishChunk | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // manifest 로드 — 책이 바뀌면 새로. 작은 메타만이라 빠르게 도착한다.
  useEffect(() => {
    let cancelled = false;
    setManifest(null);
    setChunk(null);
    setLoadError(null);
    loadManifest(bookId)
      .then((m) => {
        if (!cancelled) setManifest(m);
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

  // 현재 장 메타 — 책 범위를 벗어나면 마지막 장으로 클램프.
  const currentChapterMeta = useMemo<ChapterMeta | null>(() => {
    if (!manifest) return null;
    const found = manifest.chapters.find((c) => c.chapter === chapter);
    if (found) return found;
    return manifest.chapters[manifest.chapters.length - 1] ?? null;
  }, [manifest, chapter]);

  const effectiveChapter = currentChapterMeta?.chapter ?? chapter;

  // 장 청크 lazy 로드 — 책 또는 장이 바뀔 때만 새로. 캐시 덕에 같은 장
  // 으로 돌아오면 fetch 가 일어나지 않는다.
  useEffect(() => {
    if (!manifest) return;
    let cancelled = false;
    setChunk(null);
    loadEnglishChunk(bookId, effectiveChapter)
      .then((c) => {
        if (!cancelled) setChunk(c);
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
  }, [manifest, bookId, effectiveChapter]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 1400);
    return () => window.clearTimeout(t);
  }, [toast]);

  const handleCopy = useCallback(async (ref: string, text: string) => {
    const ok = await writeClipboard(`${ref}\n${text}`);
    setToast(ok ? `${ref} 복사됨` : "복사에 실패했어요");
  }, []);

  // 현재 장의 영어 절들 — 청크가 도착했을 때만. 비어있는 절은 제외.
  const verses = useMemo(() => {
    if (!manifest || !chunk) return [] as { n: number; ref: string; text: string }[];
    const verseCount = currentChapterMeta?.verseCount ?? 0;
    const out: { n: number; ref: string; text: string }[] = [];
    for (let n = 1; n <= verseCount; n += 1) {
      const ref = `${manifest.book} ${effectiveChapter}:${n}`;
      const text = (chunk.verses?.[ref]?.content || "").trim();
      if (text) out.push({ n, ref, text });
    }
    return out;
  }, [manifest, chunk, currentChapterMeta, effectiveChapter]);

  const verseCount = currentChapterMeta?.verseCount ?? 0;
  const ariaLabel = manifest
    ? `${manifest.book} ${effectiveChapter}장 영어(WEB)`
    : "성경 공부 — 영어(WEB)";

  return (
    <section className="eov" aria-label={ariaLabel}>
      {loadError && (
        <p className="eov-empty eov-error">
          데이터를 불러오는 중 오류가 발생했어요 — {loadError}
        </p>
      )}
      {!chunk && !loadError && (
        <ol
          className="eov-verses"
          aria-busy="true"
          aria-live="polite"
        >
          {Array.from(
            { length: verseCount > 0 ? Math.min(verseCount, 10) : 6 },
            (_, i) => (
              <li key={`sk-${i}`} className="eov-verse eov-verse--skeleton">
                <div className="eov-row">
                  <span className="eov-num eov-skeleton-pill" aria-hidden="true" />
                  <span
                    className={`eov-skeleton-line ${
                      i % 3 === 2 ? "eov-skeleton-line--short" : ""
                    }`}
                    aria-hidden="true"
                  />
                  <span aria-hidden="true" />
                </div>
              </li>
            ),
          )}
        </ol>
      )}
      {chunk && verses.length === 0 && !loadError && (
        <p className="eov-empty">이 장에는 영어(WEB) 본문이 없어요.</p>
      )}
      {chunk && verses.length > 0 && (
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
      )}
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
        /* ── 로딩 스켈레톤 ── */
        .eov-verse--skeleton {
          opacity: 0.7;
        }
        .eov-skeleton-pill {
          display: inline-block;
          min-width: 18px;
          height: 14px;
          background: color-mix(in srgb, var(--line, #e6e6e2) 70%, var(--surface, #fff));
          border-radius: 999px;
          align-self: center;
        }
        .eov-skeleton-line {
          display: block;
          width: 100%;
          height: 14px;
          background: linear-gradient(
            90deg,
            color-mix(in srgb, var(--line, #e6e6e2) 60%, var(--surface, #fff)) 0%,
            color-mix(in srgb, var(--line, #e6e6e2) 90%, var(--surface, #fff)) 50%,
            color-mix(in srgb, var(--line, #e6e6e2) 60%, var(--surface, #fff)) 100%
          );
          background-size: 200% 100%;
          border-radius: 6px;
          animation: eov-shimmer 1.4s ease-in-out infinite;
          align-self: center;
        }
        .eov-skeleton-line--short {
          width: 60%;
        }
        @keyframes eov-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .eov-skeleton-line {
            animation: none;
          }
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
