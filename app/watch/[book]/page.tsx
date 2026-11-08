"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { BOOKS } from "@/app/bible-reading/books";
import WatchPage from "../components/WatchPage";
import { isWatchBookId } from "../data/books";
import "../watch.css";

export default function WatchBookPage() {
  const params = useParams<{ book: string }>();
  const bookRaw = params?.book ?? "";

  if (!isWatchBookId(bookRaw)) {
    return (
      <div className="wt-page">
        <header className="wt-top">
          <Link href="/bible-reading" className="wt-back" aria-label="성경 읽기로 돌아가기">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
              <path
                d="M15 5l-7 7 7 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          <div className="wt-top-text">
            <span className="wt-top-kicker">리딩지저스</span>
            <span className="wt-top-title">함께 보기</span>
          </div>
        </header>
        <main className="wt-main wt-unavailable">
          <h1 className="wt-unavailable-title">책을 확인해 주세요</h1>
          <p className="wt-unavailable-msg">성경 책 이름을 찾을 수 없어요.</p>
          <Link href="/bible-reading" className="wt-unavailable-link">
            성경 읽기로 돌아가기
          </Link>
          <p className="wt-unavailable-hint">
            예: /watch/{Object.keys(BOOKS)[0]}
          </p>
        </main>
      </div>
    );
  }

  return <WatchPage bookId={bookRaw} />;
}
