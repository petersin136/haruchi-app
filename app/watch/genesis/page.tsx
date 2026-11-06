"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "../watch.css";
import VideoPlayer from "../components/VideoPlayer";
import SwipeTabs from "../components/SwipeTabs";
import Remote from "../components/Remote";
import SpeedSheet from "../components/SpeedSheet";
import DevChapterRecorder from "../components/DevChapterRecorder";
import VerseSheet from "../components/VerseSheet";
import { VerseSeekContext, type VerseSeekApi } from "../components/VerseSeek";
import { YT_STATE, type YTPlayer } from "../components/youtube";
import {
  buildVerseIndex,
  clearVerseFix,
  entryAt,
  loadVerseCounts,
  loadVerseFix,
  loadWatchTimes,
  saveVerseFix,
  verseFixJson,
  verseKey,
  verseTime,
  type VerseTimeMap,
  type WatchTimes,
} from "../components/verseTimes";
import {
  DEFAULT_SPEED,
  clearPosition,
  formatTime,
  loadPosition,
  loadSpeed,
  savePosition,
  saveSpeed,
  type SpeedOption,
} from "../components/watchStorage";
import {
  GENESIS_DEFAULT_STARTS,
  GENESIS_TOTAL_CHAPTERS,
  GENESIS_VIDEO_ID,
  chapterAt,
  checkChapterStart,
  clearChapterStarts,
  describeStartCheck,
  findNextChapter,
  findPrevChapter,
  loadChapterStarts,
  saveChapterStarts,
  type ChapterStarts,
  type ChapterTarget,
} from "../data/genesis-chapters";

const GENESIS_BOOK_ID = "genesis" as const;
const BOOK_NAME = "창세기";
const POLL_MS = 500;
const VERSE_LEAD_S = 1.5;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 권한이 없거나 http 환경 — 구식 방식으로 한 번 더 시도
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}
const SAVE_EVERY_S = 2;
const RESUME_MIN_S = 5;

export default function WatchGenesisPage() {
  const [bootStart, setBootStart] = useState<number | null>(null);
  const [starts, setStarts] = useState<ChapterStarts>(GENESIS_DEFAULT_STARTS);
  const [speed, setSpeed] = useState<SpeedOption>(DEFAULT_SPEED);
  const [speedOn, setSpeedOn] = useState(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [fileTimes, setFileTimes] = useState<WatchTimes>({ times: {}, missing: [] });
  const [verseFix, setVerseFix] = useState<VerseTimeMap>({});
  const [verseCounts, setVerseCounts] = useState<number[]>([]);
  const [verseSheetOpen, setVerseSheetOpen] = useState(false);

  const playerRef = useRef<YTPlayer | null>(null);
  const hasPlayedRef = useRef(false);
  const lastSavedRef = useRef(0);

  const showToast = useCallback((text: string) => setToast({ id: Date.now(), text }), []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(id);
  }, [toast]);

  // 저장값은 마운트 후에 읽는다(SSR 마크업과 어긋나지 않도록).
  useEffect(() => {
    const start = loadPosition();
    setStarts(loadChapterStarts());
    setSpeed(loadSpeed());
    setDevMode(new URLSearchParams(window.location.search).get("dev") === "1");
    const resume = start >= RESUME_MIN_S ? start : 0;
    setTime(resume);
    lastSavedRef.current = resume;
    setBootStart(resume);
    if (resume > 0) showToast(`${formatTime(resume)}부터 이어서 봐요`);
  }, [showToast]);

  useEffect(() => {
    let stale = false;
    setVerseFix(loadVerseFix(GENESIS_BOOK_ID));
    loadWatchTimes(GENESIS_BOOK_ID).then(
      (t) => !stale && setFileTimes(t),
      () => undefined,
    );
    loadVerseCounts(GENESIS_BOOK_ID).then(
      (c) => !stale && setVerseCounts(c),
      () => undefined,
    );
    return () => {
      stale = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const id = window.setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      const t = p.getCurrentTime();
      if (!Number.isFinite(t)) return;
      // 첫 재생 전엔 0을 돌려줄 수 있으니 이어보기 위치를 유지한다.
      if (!hasPlayedRef.current && t < 0.5) return;
      setTime(t);
      setDuration((d) => (d > 0 ? d : p.getDuration() || 0));
      if (hasPlayedRef.current && Math.abs(t - lastSavedRef.current) >= SAVE_EVERY_S) {
        savePosition(t);
        lastSavedRef.current = t;
      }
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [ready]);

  useEffect(() => {
    const flush = () => {
      const p = playerRef.current;
      if (!p || !hasPlayedRef.current) return;
      try {
        const t = p.getCurrentTime();
        if (t > 0) savePosition(t);
      } catch {
        /* 플레이어가 이미 정리됨 */
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    const p = playerRef.current;
    if (!ready || !p) return;
    const target = speedOn ? speed : 1;
    if (p.getPlaybackRate() !== target) p.setPlaybackRate(target);
  }, [ready, speedOn, speed]);

  const handleReady = useCallback((p: YTPlayer) => {
    playerRef.current = p;
    setDuration(p.getDuration() || 0);
    setReady(true);
  }, []);

  const handleState = useCallback((state: number) => {
    setPlaying(state === YT_STATE.PLAYING || state === YT_STATE.BUFFERING);
    if (state === YT_STATE.PLAYING) hasPlayedRef.current = true;
    if (state === YT_STATE.PAUSED) {
      const t = playerRef.current?.getCurrentTime() ?? 0;
      if (t > 0) {
        savePosition(t);
        lastSavedRef.current = t;
      }
    }
    if (state === YT_STATE.ENDED) {
      clearPosition();
      lastSavedRef.current = 0;
    }
  }, []);

  const handleRate = useCallback((rate: number) => setSpeedOn(rate !== 1), []);

  const chapter = useMemo(() => chapterAt(time, starts), [time, starts]);
  const prevTarget = useMemo(() => findPrevChapter(chapter, starts), [chapter, starts]);
  const nextTarget = useMemo(() => findNextChapter(chapter, starts), [chapter, starts]);

  const chapterStart = starts[chapter - 1] ?? 0;
  const chapterEnd = nextTarget?.start ?? duration;
  const chapterProgress =
    chapterEnd > chapterStart
      ? Math.min(1, Math.max(0, (time - chapterStart) / (chapterEnd - chapterStart)))
      : 0;

  const seekToChapter = useCallback(
    (target: ChapterTarget | null) => {
      const p = playerRef.current;
      if (!p || !target) return;
      p.seekTo(target.start, true);
      setTime(target.start);
      savePosition(target.start);
      lastSavedRef.current = target.start;
      showToast(`창세기 ${target.chapter}장`);
    },
    [showToast],
  );

  const togglePlay = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    if (playing) p.pauseVideo();
    else p.playVideo();
  }, [playing]);

  const toggleSpeed = useCallback(() => {
    const next = !speedOn;
    setSpeedOn(next);
    showToast(next ? `${speed}× 배속 켜짐` : "보통 속도 1×");
  }, [speedOn, speed, showToast]);

  const selectSpeed = useCallback(
    (v: SpeedOption) => {
      setSpeed(v);
      saveSpeed(v);
      setSpeedOn(true);
      showToast(`${v}× 배속 켜짐`);
    },
    [showToast],
  );

  const closeSheet = useCallback(() => setSheetOpen(false), []);

  const recordChapter = useCallback(
    (n: number): boolean => {
      const t = Math.floor(playerRef.current?.getCurrentTime() ?? time);
      const check = checkChapterStart(starts, n, t);
      if (!check.ok) {
        console.warn(`[watch] 장 기록 무시: ${describeStartCheck(n, t, check)}`);
        showToast(
          check.reason === "before-prev"
            ? `${check.neighbor.chapter}장(${formatTime(check.neighbor.start)})보다 늦어야 해요`
            : `${check.neighbor.chapter}장(${formatTime(check.neighbor.start)})보다 일러야 해요`,
        );
        return false;
      }
      const prev = starts[n - 1];
      const question =
        prev !== null && prev !== undefined
          ? `${n}장 시작을 ${formatTime(prev)} → ${formatTime(t)}로 바꿀까요?`
          : `${n}장 시작을 ${formatTime(t)}로 기록할까요?`;
      if (!window.confirm(question)) return false;
      const next = starts.map((s, i) => (i === n - 1 ? t : s));
      setStarts(next);
      saveChapterStarts(next);
      console.log(`[watch] ${n}장 = ${t}초\n` + JSON.stringify(next));
      showToast(`${n}장 시작 = ${formatTime(t)}`);
      return true;
    },
    [starts, time, showToast],
  );

  const resetChapters = useCallback(() => {
    clearChapterStarts();
    setStarts(GENESIS_DEFAULT_STARTS);
    console.log("[watch] 기록 초기화\n" + JSON.stringify(GENESIS_DEFAULT_STARTS));
    showToast("장 기록을 초기화했어요");
  }, [showToast]);

  // ── 절 ────────────────────────────────────────────────────────────────────

  const verseIndex = useMemo(
    () => buildVerseIndex(fileTimes, verseFix, starts),
    [fileTimes, verseFix, starts],
  );
  const verseEntry = useMemo(() => entryAt(verseIndex, chapter, time), [verseIndex, chapter, time]);
  const currentVerse = verseEntry?.explicit ? verseEntry.verse : null;

  const nextVerse = (() => {
    const n = (verseEntry?.verse ?? 0) + 1;
    const max = verseCounts[chapter - 1];
    return max && n > max ? null : n;
  })();

  const seekVerse = useCallback(
    (c: number, v: number) => {
      const p = playerRef.current;
      const t = verseTime(verseIndex, c, v);
      if (!p || t === null) return;
      const target = Math.max(0, t - VERSE_LEAD_S);
      p.seekTo(target, true);
      p.playVideo();
      setTime(target);
      savePosition(target);
      lastSavedRef.current = target;
      setVerseSheetOpen(false);
      showToast(`${BOOK_NAME} ${c}:${v}`);
    },
    [verseIndex, showToast],
  );

  const seekApi = useMemo<VerseSeekApi>(
    () => ({
      canSeek: (c, v) => ready && verseTime(verseIndex, c, v) !== null,
      seek: seekVerse,
    }),
    [ready, verseIndex, seekVerse],
  );

  const recordNextVerse = useCallback(() => {
    if (nextVerse === null) return;
    const raw = playerRef.current?.getCurrentTime() ?? time;
    const t = Math.round(raw * 10) / 10;
    const key = verseKey(chapter, nextVerse);
    const next = { ...verseFix, [key]: t };
    setVerseFix(next);
    saveVerseFix(GENESIS_BOOK_ID, next);
    console.log(`[watch] ${key} = ${t}초\n` + verseFixJson(next));
    showToast(`${key} 시작 = ${formatTime(t)}`);
  }, [nextVerse, time, chapter, verseFix, showToast]);

  const copyVerseJson = useCallback(() => {
    const json = verseFixJson(verseFix);
    console.log("[watch] data/verse-times-fix/genesis.json\n" + json);
    copyText(json).then((ok) =>
      showToast(ok ? "JSON을 복사했어요" : "복사 실패 — 콘솔을 확인하세요"),
    );
  }, [verseFix, showToast]);

  const resetVerses = useCallback(() => {
    clearVerseFix(GENESIS_BOOK_ID);
    setVerseFix({});
    showToast("절 기록을 지웠어요");
  }, [showToast]);

  const closeVerseSheet = useCallback(() => setVerseSheetOpen(false), []);

  return (
    <div className="wt-page">
      <header className="wt-top">
        <Link href="/bible-reading" className="wt-back" aria-label="성경 읽기로 돌아가기">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <div className="wt-top-text">
          <span className="wt-top-kicker">리딩지저스</span>
          <span className="wt-top-title">창세기 함께 보기</span>
        </div>
      </header>

      <div className="wt-video">
        {bootStart !== null ? (
          <VideoPlayer
            videoId={GENESIS_VIDEO_ID}
            startSeconds={bootStart}
            onReady={handleReady}
            onStateChange={handleState}
            onRateChange={handleRate}
          />
        ) : (
          <div className="wt-video-frame" />
        )}
      </div>

      <main className="wt-main">
        <section className="wt-now" aria-live="polite">
          <div className="wt-now-row">
            <h1 className="wt-now-title">
              <button
                type="button"
                className="wt-now-pick"
                onClick={() => setVerseSheetOpen(true)}
                aria-haspopup="dialog"
                aria-label={`${BOOK_NAME} ${chapter}장${currentVerse ? ` ${currentVerse}절` : ""} — 장·절 선택`}
              >
                {BOOK_NAME} <strong key={chapter} className="wt-now-num">{chapter}장</strong>
                {currentVerse !== null && (
                  <span className="wt-now-verse">
                    {chapter}:{currentVerse}
                  </span>
                )}
                <svg className="wt-now-caret" viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                  <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </h1>
            <span className="wt-now-time">
              {formatTime(time)}
              {duration > 0 && <span className="wt-now-dur"> / {formatTime(duration)}</span>}
            </span>
          </div>
          <div className="wt-now-bar" aria-hidden>
            <span style={{ transform: `scaleX(${chapterProgress})` }} />
          </div>
        </section>

        <VerseSeekContext.Provider value={seekApi}>
          <SwipeTabs bookId={GENESIS_BOOK_ID} chapter={chapter} />
        </VerseSeekContext.Provider>

        {devMode && (
          <DevChapterRecorder
            starts={starts}
            currentTime={time}
            onRecord={recordChapter}
            onReset={resetChapters}
            nextVerseLabel={nextVerse !== null ? verseKey(chapter, nextVerse) : null}
            verseFixCount={Object.keys(verseFix).length}
            onRecordNextVerse={recordNextVerse}
            onCopyVerseJson={copyVerseJson}
            onResetVerses={resetVerses}
          />
        )}
      </main>

      {toast && (
        <div key={toast.id} className="wt-toast" role="status">
          {toast.text}
        </div>
      )}

      <Remote
        disabled={!ready}
        playing={playing}
        speedOn={speedOn}
        speed={speed}
        prevLabel={prevTarget ? `${prevTarget.chapter}장` : null}
        nextLabel={nextTarget ? `${nextTarget.chapter}장` : null}
        onPrev={() => seekToChapter(prevTarget)}
        onNext={() => seekToChapter(nextTarget)}
        onTogglePlay={togglePlay}
        onToggleSpeed={toggleSpeed}
        onOpenSpeedSheet={() => setSheetOpen(true)}
      />

      <SpeedSheet
        open={sheetOpen}
        speed={speed}
        speedOn={speedOn}
        onSelect={selectSpeed}
        onToggle={toggleSpeed}
        onClose={closeSheet}
      />

      <VerseSheet
        open={verseSheetOpen}
        bookName={BOOK_NAME}
        totalChapters={GENESIS_TOTAL_CHAPTERS}
        verseCounts={verseCounts}
        index={verseIndex}
        currentChapter={chapter}
        currentVerse={currentVerse}
        onPick={seekVerse}
        onClose={closeVerseSheet}
      />
    </div>
  );
}
