"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import prayersJson from "../bible-reading/prayers.json";
import SlidingToggle from "../bible-reading/components/SlidingToggle";
import BottomTabBar from "../components/BottomTabBar";
import "./prayer.css";

type PrayerGradeKey = "children" | "youth" | "youngadult" | "adult";

const PRAYER_GRADES: PrayerGradeKey[] = [
  "children",
  "youth",
  "youngadult",
  "adult",
];
const PRAYER_GRADE_LABELS: Record<PrayerGradeKey, string> = {
  children: "어린이",
  youth: "청소년",
  youngadult: "청년",
  adult: "장년",
};
const isPrayerGradeKey = (value: unknown): value is PrayerGradeKey =>
  value === "children" ||
  value === "youth" ||
  value === "youngadult" ||
  value === "adult";

type PrayerEntry = {
  no: number;
  theme: string;
  verse: string;
  ref: string;
  think: string;
  pray: string;
};

type PrayerCardData = {
  grade: PrayerGradeKey;
  title: string;
  prayers: PrayerEntry[];
  lordsPrayer: string;
};

type PrayersData = Record<PrayerGradeKey, PrayerCardData>;

const prayersData = prayersJson as PrayersData;

const PRAYER_GRADE_KEY = "prayer_grade";
const prayerChecksKey = (date: string, grade: PrayerGradeKey) =>
  `prayer_checks_${date}_${grade}`;

const getTodayKey = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export default function PrayerPage() {
  const [prayerGrade, setPrayerGrade] = useState<PrayerGradeKey>("children");
  const [prayerDate, setPrayerDate] = useState<string>(() => getTodayKey());
  const [prayerChecks, setPrayerChecks] = useState<Set<number>>(new Set());
  const [openPrayer, setOpenPrayer] = useState<number | null>(null);

  useEffect(() => {
    const savedGrade = window.localStorage.getItem(PRAYER_GRADE_KEY);
    if (isPrayerGradeKey(savedGrade)) {
      setPrayerGrade(savedGrade);
    }
  }, []);

  useEffect(() => {
    const today = getTodayKey();
    setPrayerDate(today);
    const raw = window.localStorage.getItem(prayerChecksKey(today, prayerGrade));
    if (!raw) {
      setPrayerChecks(new Set());
      return;
    }
    try {
      const parsed = JSON.parse(raw) as number[];
      setPrayerChecks(new Set(Array.isArray(parsed) ? parsed : []));
    } catch {
      setPrayerChecks(new Set());
    }
  }, [prayerGrade]);

  const togglePrayerCheck = useCallback(
    (no: number) => {
      setPrayerChecks((prev) => {
        const next = new Set(prev);
        if (next.has(no)) next.delete(no);
        else next.add(no);
        window.localStorage.setItem(
          prayerChecksKey(prayerDate, prayerGrade),
          JSON.stringify(Array.from(next).sort((a, b) => a - b)),
        );
        return next;
      });
    },
    [prayerDate, prayerGrade],
  );

  const handlePrayerGradeChange = useCallback((grade: PrayerGradeKey) => {
    setPrayerGrade(grade);
    setOpenPrayer(null);
    window.localStorage.setItem(PRAYER_GRADE_KEY, grade);
  }, []);

  const resetPrayers = useCallback(() => {
    window.localStorage.removeItem(prayerChecksKey(prayerDate, prayerGrade));
    setPrayerChecks(new Set());
    setOpenPrayer(null);
  }, [prayerDate, prayerGrade]);

  const prayerCard = prayersData[prayerGrade];
  const prayerTotal = prayerCard.prayers.length;
  const prayerDone = prayerChecks.size;
  const prayerAllDone = prayerTotal > 0 && prayerDone >= prayerTotal;
  const prayerPercent = prayerTotal > 0 ? (prayerDone / prayerTotal) * 100 : 0;

  return (
    <main className="prayer-page">
      <div className="prayer-shell">
        <Link href="/bible-reading" className="prayer-back">
          ← 성경 읽기로
        </Link>

        <section className="brp-prayer" aria-label="오늘의 기도">
          <header className="brp-prayer-header">
            <div className="brp-prayer-heading">
              <p className="brp-section-label">오늘의 기도</p>
              <h2>
                {prayerAllDone ? "오늘의 기도 완료" : "7가지 기도를 차례로 따라해요"}
              </h2>
              <p className="brp-prayer-meta">
                <span className="brp-prayer-count">
                  {prayerDone} / {prayerTotal} 마침
                </span>
                <span className="brp-prayer-divider" aria-hidden>
                  ·
                </span>
                <span className="brp-prayer-date">{prayerDate}</span>
              </p>
            </div>

            <SlidingToggle
              className="brp-prayer-toggle brp-toggle"
              ariaLabel="대상 선택"
              role="tablist"
              activeKey={prayerGrade}
              onSelect={handlePrayerGradeChange}
              items={PRAYER_GRADES.map((key) => ({
                key,
                label: PRAYER_GRADE_LABELS[key],
              }))}
            />
          </header>

          <div className="brp-prayer-bar" aria-hidden="true">
            <span style={{ width: `${prayerPercent}%` }} />
          </div>

          <ol className="brp-prayer-list">
            {prayerCard.prayers.map((prayer) => {
              const isOpen = openPrayer === prayer.no;
              const isDone = prayerChecks.has(prayer.no);
              return (
                <li
                  key={prayer.no}
                  className={`brp-prayer-item ${isOpen ? "is-open" : ""} ${
                    isDone ? "is-done" : ""
                  }`}
                >
                  <button
                    type="button"
                    className="brp-prayer-trigger"
                    aria-expanded={isOpen}
                    onClick={() => setOpenPrayer(isOpen ? null : prayer.no)}
                  >
                    <span className="brp-prayer-no">
                      {String(prayer.no).padStart(2, "0")}
                    </span>
                    <span className="brp-prayer-theme">{prayer.theme}</span>
                    <span className="brp-prayer-mark" aria-hidden="true">
                      {isDone ? (
                        <svg viewBox="0 0 20 20" width="14" height="14">
                          <path
                            d="M4.5 10.5l3.2 3.2L15.5 6"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : (
                        <span className="brp-prayer-mark-dot" />
                      )}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="brp-prayer-body">
                      <blockquote className="brp-prayer-verse">
                        <p>{prayer.verse}</p>
                        <cite>{prayer.ref}</cite>
                      </blockquote>

                      <div className="brp-prayer-section">
                        <p className="brp-prayer-label">생각해보기</p>
                        <p className="brp-prayer-think">{prayer.think}</p>
                      </div>

                      <div className="brp-prayer-section">
                        <p className="brp-prayer-label">따라서 기도해요</p>
                        <div className="brp-prayer-text">
                          {prayer.pray.split("\n").map((line, lineIdx) => {
                            const segments = line.split(/(\([^)]*\))/g);
                            return (
                              <div key={lineIdx} className="brp-prayer-text-line">
                                {segments.map((segment, segIdx) => {
                                  if (!segment) return null;
                                  if (/^\([^)]*\)$/.test(segment)) {
                                    return (
                                      <span
                                        key={segIdx}
                                        className="brp-prayer-blank"
                                        aria-label="직접 채워 넣어요"
                                      >
                                        {segment}
                                      </span>
                                    );
                                  }
                                  return <span key={segIdx}>{segment}</span>;
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="brp-prayer-actions">
                        <button
                          type="button"
                          className={`brp-prayer-check ${isDone ? "is-done" : ""}`}
                          onClick={() => togglePrayerCheck(prayer.no)}
                        >
                          {isDone ? "체크 해제" : "이 기도 마쳤어요"}
                        </button>
                        {prayer.no < prayerTotal && (
                          <button
                            type="button"
                            className="brp-prayer-next"
                            onClick={() => setOpenPrayer(prayer.no + 1)}
                          >
                            다음 기도 →
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="brp-prayer-lords">
            <p className="brp-prayer-label">주기도문 (마태복음 6:9-13)</p>
            <p>{prayerCard.lordsPrayer}</p>
          </div>

          {prayerDone > 0 && (
            <div className="brp-prayer-foot">
              <button type="button" className="brp-prayer-reset" onClick={resetPrayers}>
                오늘 기도 다시하기
              </button>
            </div>
          )}
        </section>
      </div>

      <BottomTabBar active="prayer" />
    </main>
  );
}
