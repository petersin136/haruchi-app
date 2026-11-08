"use client";

import { memo, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import Dropdown from "./Dropdown";

/** page.tsx 의 ModeChoice 와 동일 집합 — 역본/모드 드롭다운 옵션. */
export type MobileModeChoice =
  | "krv"
  | "kids"
  | "english"
  | "kjv"
  | "greek"
  | "hebrew"
  | "study";

/** fetch 실패 시 활성으로 둘 책. */
const WATCH_FALLBACK_BOOKS = ["genesis", "exodus"] as const;

let watchBooksPromise: Promise<ReadonlySet<string>> | null = null;

function parseWatchBookIds(json: unknown): Set<string> {
  const out = new Set<string>();
  if (!json || typeof json !== "object" || Array.isArray(json)) return out;
  for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
    if (Array.isArray(v) && v.length > 0) out.add(k);
  }
  return out;
}

/** /watch-times/manifest.json 한 번 fetch 후 캐시. 실패·빈 목록이면 genesis·exodus. */
export function loadWatchAvailableBooks(): Promise<ReadonlySet<string>> {
  if (watchBooksPromise) return watchBooksPromise;
  watchBooksPromise = fetch("/watch-times/manifest.json", { cache: "force-cache" })
    .then((res) => {
      if (!res.ok) throw new Error(`watch manifest: ${res.status}`);
      return res.json();
    })
    .then((json) => {
      const set = parseWatchBookIds(json);
      if (set.size === 0) throw new Error("watch manifest empty");
      return set as ReadonlySet<string>;
    })
    .catch(() => new Set<string>(WATCH_FALLBACK_BOOKS) as ReadonlySet<string>);
  return watchBooksPromise;
}

/** manifest(또는 대체값)에 현재 책이 있으면 true. 로딩 중은 false. */
export function useWatchAvailable(bookId: string): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let stale = false;
    loadWatchAvailableBooks().then((ids) => {
      if (!stale) setAvailable(ids.has(bookId));
    });
    return () => {
      stale = true;
    };
  }, [bookId]);
  return available;
}

/** 영상 입구 URL — 활성 책만 호출. */
export function watchHrefFor(bookId: string, chapter: number): string {
  return `/watch/${bookId}?chapter=${chapter}`;
}

const MODE_OPTIONS: { value: MobileModeChoice; label: string }[] = [
  { value: "krv", label: "개역한글" },
  { value: "kids", label: "어린이 의역" },
  { value: "english", label: "영어(WEB)" },
  { value: "kjv", label: "영어(KJV)" },
  { value: "greek", label: "헬라어 보기" },
  { value: "hebrew", label: "히브리어 보기" },
  { value: "study", label: "성경 공부" },
];

type MobileTopBarProps = {
  bookId: string;
  bookName: string;
  chapterNumber: number;
  bookConfirmed: boolean;
  modeChoice: MobileModeChoice;
  onModeChange: (next: MobileModeChoice) => void;
  onSearch: () => void;
  onOpenDrawer: () => void;
};

const STROKE = 1.5;
const STROKE_ENTRY = 1.75;

const ICON_HIT: CSSProperties = {
  width: 40,
  height: 40,
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: "inherit",
  textDecoration: "none",
};

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <circle
        cx="8.5"
        cy="8.5"
        r="5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
      />
      <path
        d="M12.5 12.5 L16.5 16.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <path
        d="M7 4.75v10.5L15.5 10 7 4.75z"
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE_ENTRY}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      className="brp-mobile-topbar-chevron"
      viewBox="0 0 12 12"
      width="12"
      height="12"
      aria-hidden="true"
    >
      <path
        d="M2.5 4.5 L6 8 L9.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <circle
        cx="5"
        cy="10"
        r="1.15"
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
      />
      <circle
        cx="10"
        cy="10"
        r="1.15"
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
      />
      <circle
        cx="15"
        cy="10"
        r="1.15"
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
      />
    </svg>
  );
}

function MobileTopBar({
  bookId,
  bookName,
  chapterNumber,
  bookConfirmed,
  modeChoice,
  onModeChange,
  onSearch,
  onOpenDrawer,
}: MobileTopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const bookLabel = bookConfirmed
    ? `${bookName} ${chapterNumber}장`
    : "책 선택";

  const watchReady = useWatchAvailable(bookId);
  const watchHref = watchHrefFor(bookId, chapterNumber);

  return (
    <>
      <div className="brp-mobile-topbar" role="banner" aria-label="모바일 읽기 바">
        <button
          type="button"
          className="brp-mobile-topbar-btn brp-mobile-topbar-btn--icon brp-mobile-topbar-search"
          onClick={onSearch}
          aria-label="성경 단어 검색"
          title="성경 단어 검색"
        >
          <SearchIcon />
        </button>

        <button
          type="button"
          className="brp-mobile-topbar-btn brp-mobile-topbar-book"
          onClick={onOpenDrawer}
          aria-label={`${bookLabel} — 책·장 선택`}
        >
          <span className="brp-mobile-topbar-book-label">{bookLabel}</span>
          <ChevronIcon />
        </button>

        <div className="brp-mobile-topbar-end">
          <div
            className="brp-mobile-topbar-mode"
            style={{ flexShrink: 1, minWidth: 0 }}
          >
            <Dropdown<MobileModeChoice>
              value={modeChoice}
              options={MODE_OPTIONS}
              onChange={onModeChange}
              ariaLabel="모드 선택"
              align="center"
              size="sm"
            />
          </div>
          {watchReady ? (
            <Link
              href={watchHref}
              className="brp-mobile-topbar-btn brp-mobile-topbar-btn--icon"
              style={ICON_HIT}
              aria-label="영상으로 보기"
              title="영상으로 보기"
            >
              <PlayIcon />
            </Link>
          ) : (
            <span
              className="brp-mobile-topbar-btn brp-mobile-topbar-btn--icon"
              style={{ ...ICON_HIT, opacity: 0.45, cursor: "not-allowed" }}
              aria-label="영상으로 보기 · 준비 중"
              title="영상으로 보기 · 준비 중"
              aria-disabled="true"
            >
              <PlayIcon />
            </span>
          )}
          <button
            type="button"
            className="brp-mobile-topbar-btn brp-mobile-topbar-btn--icon brp-mobile-topbar-menu-btn"
            style={{ flexShrink: 0 }}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={menuOpen}
            aria-controls="brp-mobile-topbar-sheet"
          >
            <MoreIcon />
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div
          className="brp-mobile-topbar-sheet-backdrop"
          role="presentation"
          onClick={() => setMenuOpen(false)}
        >
          <nav
            id="brp-mobile-topbar-sheet"
            className="brp-mobile-topbar-sheet"
            aria-label="계정·설정 메뉴"
            onClick={(e) => e.stopPropagation()}
          >
            {watchReady ? (
              <Link
                className="brp-mobile-topbar-sheet-item"
                href={watchHref}
                onClick={() => setMenuOpen(false)}
              >
                영상으로 보기
              </Link>
            ) : (
              <span
                className="brp-mobile-topbar-sheet-item"
                aria-disabled="true"
                style={{ opacity: 0.45, cursor: "not-allowed" }}
              >
                영상으로 보기 · 준비 중
              </span>
            )}
            <Link
              className="brp-mobile-topbar-sheet-item"
              href="/study/john1/1"
              onClick={() => setMenuOpen(false)}
            >
              공부 노트
            </Link>
            <div className="brp-mobile-topbar-sheet-divider" role="separator" />
            <a
              className="brp-mobile-topbar-sheet-item"
              href="/settings"
              onClick={() => setMenuOpen(false)}
            >
              설정
            </a>
          </nav>
        </div>
      ) : null}
    </>
  );
}

export default memo(MobileTopBar);
