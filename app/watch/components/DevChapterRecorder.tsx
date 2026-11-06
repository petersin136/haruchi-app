"use client";

import { useState } from "react";
import {
  GENESIS_TOTAL_CHAPTERS,
  firstEmptyChapter,
  type ChapterStarts,
} from "../data/genesis-chapters";
import { formatTime } from "./watchStorage";

type Props = {
  starts: ChapterStarts;
  currentTime: number;
  onRecord: (chapter: number) => void;
  onReset: () => void;
  nextVerseLabel: string | null;
  verseFixCount: number;
  onRecordNextVerse: () => void;
  onCopyVerseJson: () => void;
  onResetVerses: () => void;
};

export default function DevChapterRecorder({
  starts,
  currentTime,
  onRecord,
  onReset,
  nextVerseLabel,
  verseFixCount,
  onRecordNextVerse,
  onCopyVerseJson,
  onResetVerses,
}: Props) {
  const [target, setTarget] = useState(() => firstEmptyChapter(starts) ?? 1);
  const recorded = starts.filter((s) => s !== null).length;
  const existing = starts[target - 1];

  const step = (d: number) =>
    setTarget((n) => Math.min(GENESIS_TOTAL_CHAPTERS, Math.max(1, n + d)));

  const record = () => {
    onRecord(target);
    setTarget((n) => Math.min(GENESIS_TOTAL_CHAPTERS, n + 1));
  };

  return (
    <details className="wt-dev">
      <summary className="wt-dev-summary">
        개발용 · 장 시작 시간 기록 <span className="wt-dev-count">{recorded}/{GENESIS_TOTAL_CHAPTERS}</span>
      </summary>

      <div className="wt-dev-body">
        <div className="wt-dev-row">
          <div className="wt-dev-stepper">
            <button type="button" onClick={() => step(-1)} aria-label="이전 장 선택">−</button>
            <span>{target}장</span>
            <button type="button" onClick={() => step(1)} aria-label="다음 장 선택">+</button>
          </div>
          <span className="wt-dev-meta">
            {existing !== null && existing !== undefined ? `기존 ${formatTime(existing)}` : "비어 있음"}
          </span>
        </div>

        <button type="button" className="wt-dev-record" onClick={record}>
          지금 시간({formatTime(currentTime)})을 {target}장 시작으로 기록
        </button>

        <div className="wt-dev-actions">
          <button
            type="button"
            onClick={() => console.log("[watch] genesis chapter starts\n" + JSON.stringify(starts))}
          >
            콘솔에 배열 출력
          </button>
          <button type="button" onClick={onReset}>기록 초기화</button>
        </div>

        <div className="wt-dev-divider" />

        <div className="wt-dev-row">
          <strong className="wt-dev-subtitle">절 시작 시간</strong>
          <span className="wt-dev-meta">보정 {verseFixCount}개</span>
        </div>

        <button
          type="button"
          className="wt-dev-record"
          onClick={onRecordNextVerse}
          disabled={nextVerseLabel === null}
        >
          {nextVerseLabel ? `다음 절 시작 · ${nextVerseLabel} = ${formatTime(currentTime)}` : "다음 절 없음"}
        </button>

        <div className="wt-dev-actions">
          <button type="button" onClick={onCopyVerseJson} disabled={verseFixCount === 0}>
            JSON 복사
          </button>
          <button type="button" onClick={onResetVerses} disabled={verseFixCount === 0}>
            절 기록 지우기
          </button>
        </div>
      </div>
    </details>
  );
}
