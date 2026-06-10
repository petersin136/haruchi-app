"use client";

// =============================================================================
// 성경 단어 검색 오버레이 — 입력 + 디바운스 + 번역 토글 + 결과 목록 + 토큰 하이라이트.
//   - 순수 클라이언트 검색(bibleSearch). 네트워크/DB 요청 없음.
//   - 디자인 토큰(globals.css CSS 변수)만 사용. 하드코딩 색/그라데이션/이모지 없음.
//   - 모바일: 상단에서 내려오는 풀폭 시트 / 태블릿·PC: 중앙 정렬 카드(720px 기준).
// =============================================================================

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { BookId } from "./books";
import {
  getTranslationLabel,
  isSearchIndexReady,
  normalizeForSearch,
  prepareSearchIndex,
  searchBible,
  SEARCHABLE_BOOK_NAMES,
  type SearchOutcome,
  type SearchTranslation,
} from "./bibleSearch";

const EMPTY_OUTCOME: SearchOutcome = {
  results: [],
  total: 0,
  occurrences: 0,
  truncated: false,
  byBook: [],
};

const TRANSLATIONS: SearchTranslation[] = ["krv", "kids"];
const DEBOUNCE_MS = 250;

export type SearchSelection = {
  bookId: BookId;
  chapter: number;
  verseNo: number;
  translation: SearchTranslation;
};

type Props = {
  open: boolean;
  defaultTranslation: SearchTranslation;
  onClose: () => void;
  onSelect: (selection: SearchSelection) => void;
};

function MagnifierIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// 토큰(단어) 단위 하이라이트 — 공백을 보존하며 분할하고, 정규화한 토큰이
// 정규화한 검색어를 포함하면 그 토큰 전체를 <mark> 로 감싼다.
function renderHighlighted(text: string, rawQuery: string): ReactNode {
  const q = normalizeForSearch(rawQuery);
  if (!q) return text;
  const parts = text.split(/(\s+)/);
  return parts.map((part, i) => {
    if (part === "" || /^\s+$/.test(part)) return part;
    if (normalizeForSearch(part).includes(q)) {
      return (
        <mark key={i} className="bs-hl">
          {part}
        </mark>
      );
    }
    return part;
  });
}

export default function SearchOverlay({
  open,
  defaultTranslation,
  onClose,
  onSelect,
}: Props) {
  const [query, setQuery] = useState("");
  const [deferred, setDeferred] = useState("");
  const [tr, setTr] = useState<SearchTranslation>(defaultTranslation);
  // 개요의 책 칩 클릭 시 그 책만 목록에 표시(다시 누르면 전체). 새 검색어/번역 전환 시 해제.
  const [bookFilter, setBookFilter] = useState<BookId | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 열릴 때: 현재 보던 번역으로 동기화하고 입력창에 포커스.
  useEffect(() => {
    if (!open) return;
    setTr(defaultTranslation);
    const id = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, [open, defaultTranslation]);

  // 타이핑 디바운스(250ms) — 매 키 입력마다 전체 인덱스를 다시 도는 것 완화.
  useEffect(() => {
    const id = window.setTimeout(() => setDeferred(query), DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [query]);

  // ESC 로 닫기.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // 열린 동안 배경 스크롤 잠금.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // 검색어/번역이 바뀌면(=새 검색 맥락) 책 필터는 초기화.
  useEffect(() => {
    setBookFilter(null);
  }, [deferred, tr]);

  // 검색 인덱스 준비 — 오버레이가 열린 즉시 미리 호출해 두면 사용자가 입력을
  // 시작할 즈음 인덱스가 거의(또는 이미) 준비돼 있다. 같은 promise 를 공유.
  const [indexReady, setIndexReady] = useState(isSearchIndexReady());
  useEffect(() => {
    if (!open) return;
    if (indexReady) return;
    let cancelled = false;
    prepareSearchIndex()
      .then(() => {
        if (!cancelled) setIndexReady(true);
      })
      .catch(() => {
        // 빌드 실패 — 인덱스 promise 가 비워져 다음 검색에서 다시 시도된다.
      });
    return () => {
      cancelled = true;
    };
  }, [open, indexReady]);

  // 비동기 검색 — `searchBible` 이 인덱스를 await 하므로, 여기선 결과를
  // useState 에 쌓는다. 한 번 검색이 시작된 뒤 새 입력/번역/필터가 들어오면
  // cancelled 플래그로 stale 결과를 버린다.
  const [outcome, setOutcome] = useState<SearchOutcome>(EMPTY_OUTCOME);
  const [searching, setSearching] = useState(false);
  const hasQuery = deferred.trim().length > 0;
  useEffect(() => {
    if (!hasQuery) {
      setOutcome(EMPTY_OUTCOME);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    searchBible(deferred, tr, bookFilter)
      .then((res) => {
        if (cancelled) return;
        setOutcome(res);
        setSearching(false);
        setIndexReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setOutcome(EMPTY_OUTCOME);
        setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deferred, tr, bookFilter, hasQuery]);

  if (!open) return null;

  return (
    <div
      className="bs-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="성경 단어 검색"
    >
      <div
        className="bs-backdrop"
        role="presentation"
        onClick={onClose}
      />
      <div className="bs-panel">
        <div className="bs-head">
          <div className="bs-field">
            <span className="bs-field-icon">
              <MagnifierIcon />
            </span>
            <input
              ref={inputRef}
              className="bs-input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="검색어를 입력하세요 (예: 믿음)"
              aria-label="검색어"
              autoComplete="off"
              enterKeyHint="search"
            />
            {query ? (
              <button
                type="button"
                className="bs-clear"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                aria-label="검색어 지우기"
              >
                <CloseIcon />
              </button>
            ) : null}
          </div>
          <button
            type="button"
            className="bs-close"
            onClick={onClose}
            aria-label="검색 닫기"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="bs-toolbar">
          <div className="bs-toggle" role="group" aria-label="번역본 선택">
            {TRANSLATIONS.map((key) => (
              <button
                key={key}
                type="button"
                className={`bs-toggle-btn ${tr === key ? "is-active" : ""}`}
                aria-pressed={tr === key}
                onClick={() => setTr(key)}
              >
                {getTranslationLabel(key)}
              </button>
            ))}
          </div>
        </div>

        <div className="bs-results">
          {!hasQuery ? (
            <p className="bs-hint type-small">
              현재 {SEARCHABLE_BOOK_NAMES}에서 검색됩니다.
              {!indexReady ? (
                <span className="bs-hint-aux"> · 검색 인덱스 준비 중…</span>
              ) : null}
            </p>
          ) : searching && outcome.results.length === 0 ? (
            <p className="bs-hint type-small" aria-live="polite">
              {indexReady
                ? "검색 중…"
                : "검색 인덱스 준비 중이에요. 첫 검색만 잠시 걸려요."}
            </p>
          ) : outcome.results.length === 0 ? (
            <p className="bs-empty type-small">일치하는 구절이 없습니다.</p>
          ) : (
            <>
              {/* 개요 — 총 구절 수 + 등장 횟수 + 어느 성경에 몇 개씩 나오는지(책별 분포) */}
              <section className="bs-overview" aria-live="polite">
                <p className="bs-overview-stat">
                  <span className="bs-overview-q">‘{deferred.trim()}’</span>
                  <span className="bs-overview-sep">·</span>
                  <span className="bs-overview-total">
                    {outcome.total}개 구절
                  </span>
                  <span className="bs-overview-occ">
                    총 {outcome.occurrences}번 나와요
                  </span>
                </p>
                <div
                  className="bs-overview-books"
                  role="group"
                  aria-label="책별로 결과 보기"
                >
                  {outcome.byBook.length > 1 ? (
                    <button
                      type="button"
                      className={`bs-book-chip ${
                        bookFilter === null ? "is-active" : ""
                      }`}
                      aria-pressed={bookFilter === null}
                      onClick={() => setBookFilter(null)}
                    >
                      전체
                      <b>{outcome.total}</b>
                    </button>
                  ) : null}
                  {outcome.byBook.map((b) => {
                    const active = bookFilter === b.bookId;
                    return (
                      <button
                        key={b.bookId}
                        type="button"
                        className={`bs-book-chip ${active ? "is-active" : ""}`}
                        aria-pressed={active}
                        onClick={() =>
                          setBookFilter(active ? null : b.bookId)
                        }
                      >
                        {b.bookName}
                        <b>{b.count}</b>
                      </button>
                    );
                  })}
                </div>
                {outcome.truncated ? (
                  <p className="bs-overview-note">
                    너무 많아 상위 {outcome.results.length}개만 보여드려요.
                  </p>
                ) : null}
              </section>

              <ul className="bs-list">
                {outcome.results.map((r) => (
                  <li key={`${r.bookId}-${r.chapter}-${r.verseNo}`}>
                    <button
                      type="button"
                      className="bs-item"
                      onClick={() =>
                        onSelect({
                          bookId: r.bookId,
                          chapter: r.chapter,
                          verseNo: r.verseNo,
                          translation: tr,
                        })
                      }
                    >
                      <span className="bs-ref">
                        {r.bookName} {r.chapter}:{r.verseNo}
                      </span>
                      <span className="bs-text">
                        {renderHighlighted(r.text, deferred)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        /* 풀스크린 페이지 형태 — 화면 끝(아래)까지 가득 채운다. */
        .bs-overlay {
          position: fixed;
          inset: 0;
          z-index: 100;
        }
        .bs-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(22, 22, 26, 0.45);
        }
        .bs-panel {
          position: absolute;
          inset: 0;
          z-index: 1;
          width: 100%;
          max-width: var(--container-reading);
          margin: 0 auto;
          height: 100%;
          display: flex;
          flex-direction: column;
          background: var(--surface);
          overflow: hidden;
          animation: bs-fade 0.2s ease;
        }
        @keyframes bs-fade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        /* 헤더: 검색창 + 닫기 */
        .bs-head {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 16px;
          border-bottom: 1px solid var(--line);
        }
        .bs-field {
          position: relative;
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 8px;
          height: var(--ctrl-h);
          padding: 0 14px;
          background: var(--surface-alt);
          border: 1px solid var(--line);
          border-radius: var(--radius-pill);
          transition: border-color 0.18s ease, box-shadow 0.18s ease,
            background 0.18s ease;
        }
        .bs-field:focus-within {
          background: var(--surface);
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-soft);
        }
        .bs-field-icon {
          display: inline-flex;
          align-items: center;
          color: var(--ink-mute);
          flex-shrink: 0;
        }
        .bs-input {
          flex: 1;
          min-width: 0;
          border: 0;
          background: transparent;
          outline: none;
          font: inherit;
          font-size: 16px;
          color: var(--ink);
        }
        .bs-input::placeholder {
          color: var(--ink-mute);
        }
        /* 브라우저 기본 search clear 제거(자체 버튼 사용). */
        .bs-input::-webkit-search-decoration,
        .bs-input::-webkit-search-cancel-button {
          -webkit-appearance: none;
          appearance: none;
        }
        .bs-clear {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          padding: 0;
          flex-shrink: 0;
          border: 0;
          border-radius: var(--radius-pill);
          background: transparent;
          color: var(--ink-mute);
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .bs-clear:hover {
          background: var(--surface);
          color: var(--ink);
        }
        .bs-close {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          flex-shrink: 0;
          padding: 0;
          border: 1px solid transparent;
          border-radius: var(--radius-pill);
          background: transparent;
          color: var(--ink-soft);
          cursor: pointer;
          transition: background 0.18s ease, color 0.18s ease;
        }
        .bs-close:hover {
          background: var(--surface-alt);
          color: var(--ink);
        }
        .bs-close:focus-visible,
        .bs-clear:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }

        /* 툴바: 번역 토글 + 결과 카운트 */
        .bs-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 16px;
          border-bottom: 1px solid var(--line);
        }
        .bs-toggle {
          display: inline-flex;
          gap: 2px;
          padding: 3px;
          background: var(--surface-alt);
          border-radius: var(--radius-pill);
        }
        .bs-toggle-btn {
          border: 0;
          background: transparent;
          padding: 6px 14px;
          border-radius: var(--radius-pill);
          font: inherit;
          font-size: 13px;
          font-weight: 500;
          color: var(--ink-soft);
          cursor: pointer;
          transition: background 0.18s ease, color 0.18s ease,
            box-shadow 0.18s ease;
        }
        .bs-toggle-btn.is-active {
          background: var(--surface);
          color: var(--ink);
          font-weight: 600;
          box-shadow: var(--shadow-1);
        }
        .bs-toggle-btn:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
        /* 결과 영역 */
        .bs-results {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          padding: 8px;
        }

        /* 개요 — 총 구절/등장 횟수 + 책별 분포(어느 성경에 몇 개) */
        .bs-overview {
          margin: 6px 6px 10px;
          padding: 14px 16px;
          background: var(--surface-alt);
          border: 1px solid var(--line);
          border-radius: var(--radius-md);
        }
        .bs-overview-stat {
          margin: 0;
          display: flex;
          align-items: baseline;
          flex-wrap: wrap;
          gap: 8px;
        }
        .bs-overview-q {
          font-size: 15px;
          font-weight: 700;
          color: var(--accent);
        }
        .bs-overview-sep {
          color: var(--ink-mute);
        }
        .bs-overview-total {
          font-size: 15px;
          font-weight: 700;
          color: var(--ink);
        }
        .bs-overview-occ {
          font-size: 13px;
          color: var(--ink-mute);
        }
        .bs-overview-books {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 12px;
        }
        .bs-book-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-pill);
          font: inherit;
          font-size: 12.5px;
          color: var(--ink-soft);
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease,
            color 0.15s ease;
        }
        .bs-book-chip:hover {
          border-color: var(--line-strong);
          background: var(--surface-alt);
        }
        .bs-book-chip b {
          font-weight: 700;
          color: var(--accent);
        }
        .bs-book-chip.is-active {
          background: var(--accent);
          border-color: var(--accent);
          color: var(--accent-ink);
        }
        .bs-book-chip.is-active b {
          color: var(--accent-ink);
        }
        .bs-book-chip:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
        .bs-overview-note {
          margin: 10px 0 0;
          font-size: 12px;
          color: var(--ink-mute);
        }
        .bs-hint,
        .bs-empty {
          margin: 0;
          padding: 28px 16px;
          text-align: center;
          color: var(--ink-mute);
        }
        .bs-hint-aux {
          color: var(--ink-mute);
          opacity: 0.85;
        }
        .bs-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .bs-item {
          display: flex;
          flex-direction: column;
          gap: 5px;
          width: 100%;
          text-align: left;
          padding: 12px 14px;
          border: 0;
          border-radius: var(--radius-md);
          background: transparent;
          cursor: pointer;
          font: inherit;
          transition: background 0.15s ease;
        }
        .bs-item:hover {
          background: var(--surface-alt);
        }
        .bs-item:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: -2px;
        }
        .bs-ref {
          font-size: 12.5px;
          font-weight: 700;
          color: var(--accent);
        }
        .bs-text {
          font-size: 15px;
          line-height: 1.55;
          color: var(--ink);
          word-break: keep-all;
          overflow-wrap: normal;
        }
        .bs-hl {
          background: var(--accent-soft);
          color: var(--ink);
          font-weight: 600;
          border-radius: 4px;
          padding: 0 1px;
        }

        /* 태블릿/PC: 동일하게 화면 끝까지 채우는 풀하이트 컬럼(720px 중앙).
           양옆에만 경계선을 둬 backdrop 과 구분. */
        @media (min-width: 640px) {
          .bs-panel {
            border-left: 1px solid var(--line);
            border-right: 1px solid var(--line);
            box-shadow: var(--shadow-2);
          }
        }
      `}</style>
    </div>
  );
}
