"use client";

// =============================================================================
// 성경 단어 검색 오버레이 — 입력 + 디바운스 + 번역 토글 + 결과 목록 + 토큰 하이라이트.
//   - 순수 클라이언트 검색(bibleSearch). 네트워크/DB 요청 없음.
//   - 디자인 토큰(globals.css CSS 변수)만 사용. 하드코딩 색/그라데이션/이모지 없음.
//   - 모바일: 상단에서 내려오는 풀폭 시트 / 태블릿·PC: 중앙 정렬 카드(720px 기준).
// =============================================================================

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { BookId } from "./books";
import {
  getTranslationLabel,
  normalizeForSearch,
  searchBible,
  SEARCHABLE_BOOK_NAMES,
  type SearchTranslation,
} from "./bibleSearch";

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

  const outcome = useMemo(() => searchBible(deferred, tr), [deferred, tr]);
  const hasQuery = deferred.trim().length > 0;

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
          {hasQuery ? (
            <span className="bs-count" aria-live="polite">
              {outcome.total}개 구절
              {outcome.truncated
                ? ` · 상위 ${outcome.results.length}개 표시`
                : ""}
            </span>
          ) : null}
        </div>

        <div className="bs-results">
          {!hasQuery ? (
            <p className="bs-hint type-small">
              현재 {SEARCHABLE_BOOK_NAMES}에서 검색됩니다.
            </p>
          ) : outcome.results.length === 0 ? (
            <p className="bs-empty type-small">일치하는 구절이 없습니다.</p>
          ) : (
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
          )}
        </div>
      </div>

      <style jsx>{`
        .bs-overlay {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: flex;
          flex-direction: column;
        }
        .bs-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(22, 22, 26, 0.45);
        }
        .bs-panel {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: var(--container-reading);
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          max-height: 88vh;
          max-height: 88dvh;
          background: var(--surface);
          border: 1px solid var(--line);
          border-top: 0;
          border-bottom-left-radius: var(--radius-lg);
          border-bottom-right-radius: var(--radius-lg);
          box-shadow: var(--shadow-2);
          overflow: hidden;
          animation: bs-drop 0.22s cubic-bezier(0.32, 0.72, 0.24, 1);
        }
        @keyframes bs-drop {
          from {
            transform: translateY(-12px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
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
        .bs-count {
          font-size: 13px;
          color: var(--ink-mute);
          white-space: nowrap;
        }

        /* 결과 영역 */
        .bs-results {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          padding: 8px;
        }
        .bs-hint,
        .bs-empty {
          margin: 0;
          padding: 28px 16px;
          text-align: center;
          color: var(--ink-mute);
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

        /* 태블릿/PC: 중앙 카드 형태로 띄움 */
        @media (min-width: 640px) {
          .bs-overlay {
            padding: 7vh 24px 24px;
          }
          .bs-panel {
            border-top: 1px solid var(--line);
            border-radius: var(--radius-lg);
            max-height: 78vh;
            max-height: 78dvh;
          }
        }
      `}</style>
    </div>
  );
}
