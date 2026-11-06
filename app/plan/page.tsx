"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BOOKS, type BookId } from "../bible-reading/books";
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

  return (
    <main className="plan-page" data-plan={planId}>
      <div className="plan-shell">
        <p className="plan-eyebrow">Reading plan</p>
        <h1 className="plan-title">성경 읽기표</h1>
        <p className="plan-lead">
          읽기 화면에서 장을 끝까지 읽으면 자동으로 체크돼요. 원하는 플랜과
          시작일만 고르면 됩니다.
        </p>

        <section className="plan-section" aria-label="플랜 선택">
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
        </section>

        <section className="plan-section" aria-label="시작일">
          <h2 className="plan-section-label">시작일</h2>
          <div className="plan-start-row">
            <label htmlFor="plan-start">Day 1로 잡을 날짜</label>
            <input
              id="plan-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
        </section>

        <section className="plan-section" aria-label="진행">
          <h2 className="plan-section-label">진행</h2>
          <div className="plan-stats">
            <div>
              <p className="plan-stat-value">{progress.pct}%</p>
              <p className="plan-stat-label">
                {progress.doneDays} / {progress.totalDays}일 완료
              </p>
            </div>
            <div>
              <p className="plan-stat-value">🔥 {streak}</p>
              <p className="plan-stat-label">연속으로 읽은 날</p>
            </div>
          </div>
        </section>

        <section className="plan-section" aria-label="오늘 분량">
          <h2 className="plan-section-label">오늘 분량</h2>
          {loadError ? (
            <p className="plan-empty">{loadError}</p>
          ) : !plan || !todayPlan ? (
            <p className="plan-empty">플랜을 불러오는 중…</p>
          ) : (
            <>
              <p className="plan-today-meta">
                {plan.title} · {currentDayNumber}일차
                {todayPlan.calendar ? ` · ${todayPlan.calendar}` : ""}
                {areReadingsDone(todayPlan.readings) ? " · 오늘 분량 완료" : ""}
              </p>
              <ul className="plan-readings">
                {todayPlan.readings.map((r) => {
                  const allDone = r.chapters.every((ch) =>
                    isChapterDone(r.book, ch),
                  );
                  const jumpCh =
                    r.chapters.find((ch) => !isChapterDone(r.book, ch)) ??
                    r.chapters[0];
                  return (
                    <li
                      key={`${r.book}-${r.chapters.join("-")}`}
                      className="plan-reading"
                    >
                      <div className="plan-reading-main">
                        <p className="plan-reading-text">
                          {bookLabel(r.book)} {formatChapterRange(r.chapters)}
                          {allDone ? " ✓" : ""}
                        </p>
                        <ul className="plan-chapter-checks" aria-label="장별 완료">
                          {r.chapters.map((ch) => {
                            const done = isChapterDone(r.book, ch);
                            return (
                              <li
                                key={`${r.book}-${ch}`}
                                className={done ? "is-checked" : ""}
                              >
                                {done ? `✓ ${ch}장` : `${ch}장`}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                      <div className="plan-reading-links">
                        {jumpCh != null ? (
                          <Link
                            href={`/bible-reading?book=${encodeURIComponent(r.book)}&chapter=${jumpCh}`}
                          >
                            {allDone ? "다시 읽기" : "읽기"}
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        <section className="plan-section" aria-label="최근 12주">
          <h2 className="plan-section-label">최근 12주</h2>
          <div className="plan-grass" aria-hidden="true">
            {grass.map((cell) => (
              <span
                key={cell.key}
                className={`plan-grass-cell ${cell.on ? "is-active" : ""}`}
                title={cell.key}
              />
            ))}
          </div>
          <p className="plan-grass-legend">한 칸 = 하루 · 색 = 그날 1장 이상 완료</p>
        </section>

        <Link className="plan-back" href="/bible-reading">
          ← 성경 읽기로
        </Link>
      </div>
    </main>
  );
}
