"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BOOKS, type BookId } from "../bible-reading/books";
import BottomTabBar from "../components/BottomTabBar";
import {
  areReadingsDone,
  computeStreak,
  isChapterDone,
  loadReadLog,
  toLocalDateKey,
} from "../lib/readLog";
import "./plan.css";

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

  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    window.addEventListener("focus", bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("focus", bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

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
    if (!plan) return { doneDays: 0, totalDays: 0 };
    let doneDays = 0;
    for (const d of plan.days) {
      if (areReadingsDone(d.readings)) doneDays += 1;
    }
    return { doneDays, totalDays: plan.days.length };
  }, [plan, tick]);

  const streak = useMemo(() => {
    void tick;
    return computeStreak(loadReadLog());
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
    <main className="plan-page">
      <div className="plan-shell">
        <h1 className="plan-title">읽기표</h1>

        <p className="plan-kicker">
          {plan?.title ?? "플랜"}
          {plan ? ` · ${currentDayNumber}일차` : ""}
          {todayDone ? " · 완료" : ""}
        </p>

        {loadError ? (
          <p className="plan-empty">{loadError}</p>
        ) : !todayPlan ? (
          <p className="plan-empty">불러오는 중</p>
        ) : (
          <ul className="plan-list">
            {todayPlan.readings.map((r) => {
              const jumpCh =
                r.chapters.find((ch) => !isChapterDone(r.book, ch)) ??
                r.chapters[0];
              if (jumpCh == null) return null;
              return (
                <li key={`${r.book}-${r.chapters.join("-")}`}>
                  <Link
                    className="plan-row"
                    href={`/bible-reading?book=${encodeURIComponent(r.book)}&chapter=${jumpCh}`}
                  >
                    <span className="plan-book">{bookLabel(r.book)}</span>
                    <span className="plan-range">
                      {formatChapterRange(r.chapters)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <p className="plan-meta">
          <span>
            {progress.doneDays} / {progress.totalDays || "—"}일
          </span>
          <span>연속 {streak}일</span>
        </p>

        <div className="plan-picker">
          {PLAN_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={planId === opt.id ? "is-active" : ""}
              aria-pressed={planId === opt.id}
              onClick={() => selectPlan(opt.id)}
            >
              {opt.title}
            </button>
          ))}
        </div>

        <label className="plan-start" htmlFor="plan-start">
          <span>시작 {startLabel}</span>
          <input
            id="plan-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
      </div>

      <BottomTabBar active="plan" />
    </main>
  );
}
