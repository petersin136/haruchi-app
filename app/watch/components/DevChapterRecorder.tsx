"use client";

import { useState } from "react";
import { firstEmptyChapter, type ChapterStarts } from "../data/chapterStarts";
import { VERSE_NUDGE_S } from "./verseTimes";
import { formatTime } from "./watchStorage";

type Props = {
  bookId: string;
  totalChapters: number;
  starts: ChapterStarts;
  currentTime: number;
  onRecord: (chapter: number) => boolean;
  onReset: () => void;
  nextVerseLabel: string | null;
  verseFixCount: number;
  onRecordNextVerse: () => void;
  onCopyVerseJson: () => void;
  onResetVerses: () => void;
  /** 현재 재생 절 라벨 — 예: "1:14". 없으면 미세 조정 비활성 */
  currentVerseLabel: string | null;
  currentVerseTime: number | null;
  onNudgeVerse: (deltaSec: number) => void;
  onReplayVerse: () => void;
};

export default function DevChapterRecorder({
  bookId,
  totalChapters,
  starts,
  currentTime,
  onRecord,
  onReset,
  nextVerseLabel,
  verseFixCount,
  onRecordNextVerse,
  onCopyVerseJson,
  onResetVerses,
  currentVerseLabel,
  currentVerseTime,
  onNudgeVerse,
  onReplayVerse,
}: Props) {
  const [target, setTarget] = useState(() => firstEmptyChapter(starts) ?? 1);
  const recorded = starts.filter((s) => s !== null).length;
  const existing = starts[target - 1];

  const step = (d: number) =>
    setTarget((n) => Math.min(totalChapters, Math.max(1, n + d)));

  const record = () => {
    if (onRecord(target)) setTarget((n) => Math.min(totalChapters, n + 1));
  };

  const nudgeLabel = `${VERSE_NUDGE_S}초`;

  return (
    <details className="wt-dev" open>
      <summary className="wt-dev-summary">
        개발용 · 장·절 시간 조정{" "}
        <span className="wt-dev-count">{recorded}/{totalChapters}</span>
      </summary>

      <div className="wt-dev-body">
        <div className="wt-dev-row">
          <strong className="wt-dev-subtitle">절 미세 조정</strong>
          <span className="wt-dev-meta">
            {currentVerseLabel
              ? `${currentVerseLabel}${
                  currentVerseTime != null ? ` · ${formatTime(currentVerseTime)}` : ""
                }`
              : "절 없음"}
          </span>
        </div>

        <div className="wt-dev-nudge" role="group" aria-label="절 시작 미세 조정">
          <button
            type="button"
            disabled={!currentVerseLabel}
            onClick={() => onNudgeVerse(-VERSE_NUDGE_S)}
          >
            ◀ {nudgeLabel}
          </button>
          <button
            type="button"
            disabled={!currentVerseLabel}
            onClick={() => onNudgeVerse(VERSE_NUDGE_S)}
          >
            {nudgeLabel} ▶
          </button>
          <button
            type="button"
            className="wt-dev-nudge-replay"
            disabled={!currentVerseLabel}
            onClick={onReplayVerse}
          >
            이 절 다시 듣기
          </button>
        </div>

        <div className="wt-dev-actions">
          <button type="button" onClick={onCopyVerseJson} disabled={verseFixCount === 0}>
            보정값 복사
          </button>
          <button type="button" onClick={onResetVerses} disabled={verseFixCount === 0}>
            절 기록 지우기
          </button>
        </div>
        <p className="wt-dev-hint">
          보정 {verseFixCount}개 · localStorage → data/verse-times-fix/{bookId}.json
        </p>

        <div className="wt-dev-divider" />

        <div className="wt-dev-row">
          <div className="wt-dev-stepper">
            <button type="button" onClick={() => step(-1)} aria-label="이전 장 선택">
              −
            </button>
            <span>{target}장</span>
            <button type="button" onClick={() => step(1)} aria-label="다음 장 선택">
              +
            </button>
          </div>
          <span className="wt-dev-meta">
            {existing !== null && existing !== undefined
              ? `기존 ${formatTime(existing)}`
              : "비어 있음"}
          </span>
        </div>

        <button type="button" className="wt-dev-record" onClick={record}>
          지금 시간({formatTime(currentTime)})을 {target}장 시작으로 기록
        </button>

        <div className="wt-dev-actions">
          <button
            type="button"
            onClick={() =>
              console.log(`[watch] ${bookId} chapter starts\n` + JSON.stringify(starts))
            }
          >
            콘솔에 배열 출력
          </button>
          <button type="button" onClick={onReset}>
            장 기록 초기화
          </button>
        </div>

        <div className="wt-dev-divider" />

        <button
          type="button"
          className="wt-dev-record"
          onClick={onRecordNextVerse}
          disabled={nextVerseLabel === null}
        >
          {nextVerseLabel
            ? `다음 절 시작 · ${nextVerseLabel} = ${formatTime(currentTime)}`
            : "다음 절 없음"}
        </button>
      </div>
    </details>
  );
}
