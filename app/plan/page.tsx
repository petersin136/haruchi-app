"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BOOKS, type BookId } from "../bible-reading/books";
import BottomTabBar from "../components/BottomTabBar";
import {
  activityByDate,
  areReadingsDone,
  computeStreak,
  isChapterDone,
  lastNDateKeys,
  loadReadLog,
  toLocalDateKey,
} from "../lib/readLog";
import "./plan.css";

const CURRENT_BOOK_KEY = "bible_current_book";
const currentChapterKey = (bookId: BookId) => `bible_current_chapter_${bookId}`;

type PlanReading = { book: string; chapters: number[] };
type PlanDay = { day: number; calendar?: string; readings: PlanReading[] };
type PlanFile = {
  id: string;
  title: string;
  days: PlanDay[];
};

const PLAN_OPTIONS = [
  { id: "year365", title: "1년 1독", file: "/plans/year365.json" },
  { id: "days90", title: "90일 1독", file: "/plans/days90.json" },
  { id: "days30", title: "30일 1독", file: "/plans/days30.json" },
  { id: "mcheyne", title: "맥체인", file: "/plans/mcheyne.json" },
] as const;

const PLAN_ID_KEY = "haruchi/plan-id";
const PLAN_START_KEY = "haruchi/plan-start";

function todayInputValue(d = new Date()): string {
  return toLocalDateKey(d);
}

function parseStartDate(value: string): Date {
  const [y, m, day] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, day || 1);
}

function dayIndexFromStart(startIso: string, today = new Date()): number {
  const start = parseStartDate(startIso);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.floor((end.getTime() - start.getTime()) / 86400000);
  return Math.max(0, diff);
}

function formatChapterRange(chapters: number[]): string {
  if (chapters.length === 0) return "";
  if (chapters.length === 1) return `${chapters[0]}장`;
  const sorted = [...chapters].sort((a, b) => a - b);
  const contiguous = sorted.every((c, i) => i === 0 || c === sorted[i - 1] + 1);
  if (contiguous) return `${sorted[0]}–${sorted[sorted.length - 1]}장`;
  return `${sorted.join(", ")}장`;
}

function bookLabel(book: string): string {
  const meta = BOOKS[book as BookId];
  return meta?.name ?? book;
}

export default function PlanPage() {
  const [planId, setPlanId] = useState<string>("year365");
  const [startDate, setStartDate] = useState<string>(() => todayInputValue());
  const [plan, setPlan] = useState<PlanFile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [progressBookId, setProgressBookId] = useState<BookId | null>(null);
  const [progressChapter, setProgressChapter] = useState(1);

  useEffect(() => {
    try {
      const savedId = window.localStorage.getItem(PLAN_ID_KEY);
      const savedStart = window.localStorage.getItem(PLAN_START_KEY);
      if (savedId && PLAN_OPTIONS.some((p) => p.id === savedId)) {
        setPlanId(savedId);
      }
      if (savedStart && /^\d{4}-\d{2}-\d{2}$/.test(savedStart)) {
        setStartDate(savedStart);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(PLAN_ID_KEY, planId);
    } catch {
      /* ignore */
    }
  }, [planId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PLAN_START_KEY, startDate);
    } catch {
      /* ignore */
    }
  }, [startDate]);

  useEffect(() => {
    let cancelled = false;
    const meta = PLAN_OPTIONS.find((p) => p.id === planId);
    if (!meta) return;
    setPlan(null);
    setLoadError(null);
    fetch(meta.file)
      .then((res) => {
        if (!res.ok) throw new Error(`플랜을 불러오지 못했어요 (${res.status})`);
        return res.json() as Promise<PlanFile>;
      })
      .then((data) => {
        if (!cancelled) setPlan(data);
      })
      .catch((e) => {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "플랜 로드 실패");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [planId]);

  // bible-reading 에서 돌아온 뒤 진도 갱신 — focus 시 리렌더
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    window.addEventListener("focus", bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("focus", bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  // 마지막으로 읽던 책·장 + 완료 격자
  useEffect(() => {
    void tick;
    const saved = window.localStorage.getItem(CURRENT_BOOK_KEY);
    const bookId =
      saved && Object.prototype.hasOwnProperty.call(BOOKS, saved)
        ? (saved as BookId)
        : null;
    setProgressBookId(bookId);
    if (!bookId) {
      setProgressChapter(1);
      return;
    }
    const rawCh = Number(window.localStorage.getItem(currentChapterKey(bookId)));
    const total = BOOKS[bookId].totalChapters;
    setProgressChapter(
      Number.isInteger(rawCh) && rawCh >= 1 && rawCh <= total ? rawCh : 1,
    );
  }, [tick]);

  const currentDayNumber = useMemo(() => {
    if (!plan || plan.days.length === 0) return 1;
    const idx = dayIndexFromStart(startDate);
    return Math.min(plan.days.length, idx + 1);
  }, [plan, startDate]);

  const todayPlan = useMemo(() => {
    if (!plan) return null;
    return plan.days.find((d) => d.day === currentDayNumber) ?? null;
  }, [plan, currentDayNumber]);

  const progress = useMemo(() => {
    void tick;
    if (!plan) return { doneDays: 0, totalDays: 0, pct: 0 };
    let doneDays = 0;
    for (const d of plan.days) {
      if (areReadingsDone(d.readings)) doneDays += 1;
    }
    const totalDays = plan.days.length;
    const pct = totalDays > 0 ? Math.round((doneDays / totalDays) * 100) : 0;
    return { doneDays, totalDays, pct };
  }, [plan, tick]);

  const streak = useMemo(() => {
    void tick;
    return computeStreak(loadReadLog());
  }, [tick]);

  const grass = useMemo(() => {
    void tick;
    const active = activityByDate(loadReadLog());
    return lastNDateKeys(12).map((key) => ({
      key,
      on: (active.get(key) ?? 0) > 0,
    }));
  }, [tick]);

  const selectPlan = useCallback((id: string) => {
    setPlanId(id);
  }, []);

  const startLabel = (() => {
    const [y, m, d] = startDate.split("-");
    if (!y || !m || !d) return startDate;
    return `${y}. ${Number(m)}. ${Number(d)}.`;
  })();

  const todayDone = todayPlan ? areReadingsDone(todayPlan.readings) : false;

  return (
    <main className="plan-page" data-plan={planId}>
      <div className="plan-shell">
        <h1 className="plan-page-title">읽기표</h1>

        <section className="plan-today" aria-label="오늘 분량">
          <p className="plan-today-kicker">
            {plan?.title ?? "플랜"}
            {plan ? ` · ${currentDayNumber} / ${progress.totalDays}일` : ""}
            {todayDone ? " · 완료" : ""}
          </p>

          {loadError ? (
            <p className="plan-empty">{loadError}</p>
          ) : !todayPlan ? (
            <p className="plan-empty">불러오는 중</p>
          ) : (
            <ul className="plan-readings">
              {todayPlan.readings.map((r) => {
                const allDone = r.chapters.every((ch) =>
                  isChapterDone(r.book, ch),
                );
                const jumpCh =
                  r.chapters.find((ch) => !isChapterDone(r.book, ch)) ??
                  r.chapters[0];
                if (jumpCh == null) return null;
                return (
                  <li key={`${r.book}-${r.chapters.join("-")}`}>
                    <Link
                      className={`plan-reading${allDone ? " is-done" : ""}`}
                      href={`/bible-reading?book=${encodeURIComponent(r.book)}&chapter=${jumpCh}`}
                    >
                      <span className="plan-reading-copy">
                        <span className="plan-reading-book">
                          {bookLabel(r.book)}
                        </span>
                        <span className="plan-reading-ch">
                          {formatChapterRange(r.chapters)}
                        </span>
                      </span>
                      <span className="plan-reading-go">
                        {allDone ? "다시" : "읽기"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="plan-meter" aria-hidden="true">
            <span
              className="plan-meter-fill"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
          <p className="plan-meter-meta">
            <span>
              {progress.doneDays} / {progress.totalDays || "—"}일
            </span>
            <span>연속 {streak}일</span>
          </p>
        </section>

        <section className="plan-block" aria-label="플랜">
          <h2 className="plan-section-label">플랜</h2>
          <div className="plan-picker" role="list">
            {PLAN_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="listitem"
                className={planId === opt.id ? "is-active" : ""}
                onClick={() => selectPlan(opt.id)}
              >
                {opt.title}
              </button>
            ))}
          </div>
          <label className="plan-start" htmlFor="plan-start">
            <span>시작일 {startLabel}</span>
            <input
              id="plan-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
        </section>

        <section className="plan-block" aria-label="최근 12주">
          <h2 className="plan-section-label">최근 12주</h2>
          <div className="plan-grass">
            {grass.map((cell) => (
              <span
                key={cell.key}
                className={`plan-grass-cell ${cell.on ? "is-active" : ""}`}
                title={cell.key}
              />
            ))}
          </div>
        </section>

        {progressBookId ? (
          <Link
            className="plan-continue"
            href={`/bible-reading?book=${encodeURIComponent(progressBookId)}&chapter=${progressChapter}`}
          >
            <span>이어서 읽기</span>
            <span>
              {BOOKS[progressBookId].name} {progressChapter}장
            </span>
          </Link>
        ) : null}
      </div>

      <BottomTabBar active="plan" />
    </main>
  );
}
