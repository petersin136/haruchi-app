"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "../watch.css";
import VideoPlayer from "./VideoPlayer";
import SwipeTabs from "./SwipeTabs";
import Remote from "./Remote";
import DevChapterRecorder from "./DevChapterRecorder";
import VerseSheet from "./VerseSheet";
import { VerseSeekContext, type VerseSeekApi } from "./VerseSeek";
import { YT_STATE, type YTPlayer } from "./youtube";
import {
  SEEK_VERIFY_DELAY_MS,
  SEEK_VERIFY_TOLERANCE_S,
  VERSE_LEAD_S,
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
} from "./verseTimes";
import {
  DEFAULT_SPEED,
  clearPosition,
  formatTime,
  loadPosition,
  loadSpeed,
  savePosition,
  saveSpeed,
  type SpeedOption,
} from "./watchStorage";
import { WATCH_BOOKS, type WatchBookId } from "../data/books";
import {
  chapterAt,
  checkChapterStart,
  clearChapterStarts,
  describeStartCheck,
  findNextChapter,
  loadStartOverrides,
  resolveChapterStarts,
  saveStartOverrides,
  type ChapterStarts,
  type StartOverrides,
  type ChapterTarget,
} from "../data/chapterStarts";

const POLL_MS = 500;
const SAVE_EVERY_S = 2;
const RESUME_MIN_S = 5;

/** seekTo 후 재생, 어긋나면 한 번 더 seek (버퍼링 대응) */
function seekPlayVerify(p: YTPlayer, targetSec: number) {
  const target = Math.max(0, targetSec);
  p.seekTo(target, true);
  p.playVideo();
  window.setTimeout(() => {
    try {
      const cur = p.getCurrentTime();
      if (
        Number.isFinite(cur) &&
        Math.abs(cur - target) >= SEEK_VERIFY_TOLERANCE_S
      ) {
        p.seekTo(target, true);
        p.playVideo();
      }
    } catch {
      /* 플레이어 정리됨 */
    }
  }, SEEK_VERIFY_DELAY_MS);
  return target;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
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

export default function WatchPage({ bookId }: { bookId: WatchBookId }) {
  const book = WATCH_BOOKS[bookId];
  const { name, videoId, totalChapters, watchTitle } = book;

  const [bootStart, setBootStart] = useState<number | null>(null);
  const [fileStarts, setFileStarts] = useState<ChapterStarts | null>(null);
  const [overrides, setOverrides] = useState<StartOverrides>({});
  const starts = useMemo(
    () => resolveChapterStarts(bookId, fileStarts, overrides),
    [bookId, fileStarts, overrides],
  );
  const [speed, setSpeed] = useState<SpeedOption>(DEFAULT_SPEED);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [devMode, setDevMode] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [fileTimes, setFileTimes] = useState<WatchTimes>({
    times: {},
    missing: [],
    starts: [],
    src: {},
  });
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
    const start = loadPosition(bookId);
    setOverrides(loadStartOverrides(bookId));
    setSpeed(loadSpeed(bookId));
    setDevMode(new URLSearchParams(window.location.search).get("dev") === "1");
    const resume = start >= RESUME_MIN_S ? start : 0;
    setTime(resume);
    lastSavedRef.current = resume;
    setBootStart(resume);
    if (resume > 0) showToast(`${formatTime(resume)}부터 이어서 봐요`);
  }, [bookId, showToast]);

  useEffect(() => {
    let stale = false;
    setVerseFix(loadVerseFix(bookId));
    setFileStarts(null);
    setFileTimes({ times: {}, missing: [], starts: [], src: {} });
    loadWatchTimes(bookId).then(
      (t) => {
        if (stale) return;
        setFileTimes(t);
        setFileStarts(t.starts);
      },
      () => undefined,
    );
    loadVerseCounts(bookId).then(
      (c) => !stale && setVerseCounts(c),
      () => undefined,
    );
    return () => {
      stale = true;
    };
  }, [bookId]);

  useEffect(() => {
    if (!ready) return;
    const id = window.setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      const t = p.getCurrentTime();
      if (!Number.isFinite(t)) return;
      if (!hasPlayedRef.current && t < 0.5) return;
      setTime(t);
      setDuration((d) => (d > 0 ? d : p.getDuration() || 0));
      if (hasPlayedRef.current && Math.abs(t - lastSavedRef.current) >= SAVE_EVERY_S) {
        savePosition(bookId, t);
        lastSavedRef.current = t;
      }
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [ready, bookId]);

  useEffect(() => {
    const flush = () => {
      const p = playerRef.current;
      if (!p || !hasPlayedRef.current) return;
      try {
        const t = p.getCurrentTime();
        if (t > 0) savePosition(bookId, t);
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
  }, [bookId]);

  useEffect(() => {
    const p = playerRef.current;
    if (!ready || !p) return;
    if (p.getPlaybackRate() !== speed) p.setPlaybackRate(speed);
  }, [ready, speed]);

  const handleReady = useCallback((p: YTPlayer) => {
    playerRef.current = p;
    setDuration(p.getDuration() || 0);
    setReady(true);
  }, []);

  const handleState = useCallback(
    (state: number) => {
      setPlaying(state === YT_STATE.PLAYING || state === YT_STATE.BUFFERING);
      if (state === YT_STATE.PLAYING) hasPlayedRef.current = true;
      if (state === YT_STATE.PAUSED) {
        const t = playerRef.current?.getCurrentTime() ?? 0;
        if (t > 0) {
          savePosition(bookId, t);
          lastSavedRef.current = t;
        }
      }
      if (state === YT_STATE.ENDED) {
        clearPosition(bookId);
        lastSavedRef.current = 0;
      }
    },
    [bookId],
  );

  const handleRate = useCallback((_rate: number) => {
    /* 배속은 리모컨·localStorage 가 소스 — 플레이어 이벤트는 무시 */
  }, []);

  const chapter = useMemo(() => chapterAt(time, starts), [time, starts]);
  const nextTarget = useMemo(() => findNextChapter(chapter, starts), [chapter, starts]);

  const chapterStart = starts[chapter - 1] ?? 0;
  const chapterEnd = nextTarget?.start ?? duration;
  const chapterLength = Math.max(0, chapterEnd - chapterStart);
  const chapterElapsed = Math.min(chapterLength, Math.max(0, time - chapterStart));
  const chapterProgress =
    chapterLength > 0 ? Math.min(1, Math.max(0, chapterElapsed / chapterLength)) : 0;

  /** 1장·마지막 장에서는 버튼 숨김(자리만 비움). 라벨은 인접 장 번호. */
  const prevChapterNum = chapter > 1 ? chapter - 1 : null;
  const nextChapterNum = chapter < totalChapters ? chapter + 1 : null;

  const seekToChapter = useCallback(
    (target: ChapterTarget | null, opts?: { toast?: boolean }) => {
      const p = playerRef.current;
      if (!p || !target) return;
      const seekAt = seekPlayVerify(p, target.start - VERSE_LEAD_S);
      setTime(seekAt);
      savePosition(bookId, seekAt);
      lastSavedRef.current = seekAt;
      if (opts?.toast !== false) showToast(`${name} ${target.chapter}장`);
    },
    [bookId, name, showToast],
  );

  const seekChapterByNumber = useCallback(
    (n: number, opts?: { toast?: boolean }) => {
      const start = starts[n - 1];
      if (typeof start !== "number") return;
      seekToChapter({ chapter: n, start }, opts);
    },
    [starts, seekToChapter],
  );

  const togglePlay = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    if (playing) p.pauseVideo();
    else p.playVideo();
  }, [playing]);

  const selectSpeed = useCallback(
    (v: SpeedOption) => {
      setSpeed(v);
      saveSpeed(bookId, v);
      showToast(v === 1 ? "보통 속도 1.0×" : `${v}× 배속`);
    },
    [bookId, showToast],
  );

  const seekInChapter = useCallback(
    (ratio: number) => {
      const p = playerRef.current;
      if (!p || chapterLength <= 0) return;
      const target = chapterStart + Math.min(1, Math.max(0, ratio)) * chapterLength;
      const seekAt = seekPlayVerify(p, target);
      setTime(seekAt);
      savePosition(bookId, seekAt);
      lastSavedRef.current = seekAt;
    },
    [bookId, chapterStart, chapterLength],
  );

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
      const next = { ...overrides, [n]: t };
      setOverrides(next);
      saveStartOverrides(bookId, next);
      console.log(`[watch] ${n}장 = ${t}초\n` + JSON.stringify(next));
      showToast(`${n}장 시작 = ${formatTime(t)}`);
      return true;
    },
    [bookId, starts, overrides, time, showToast],
  );

  const resetChapters = useCallback(() => {
    clearChapterStarts(bookId);
    setOverrides({});
    console.log("[watch] 장 기록 초기화 — 파일 값으로 돌아감");
    showToast("장 기록을 초기화했어요");
  }, [bookId, showToast]);

  const verseIndex = useMemo(
    () => buildVerseIndex(fileTimes, verseFix, starts),
    [fileTimes, verseFix, starts],
  );
  // 절 표시도 seek 여유(VERSE_LEAD_S)와 같은 기준으로 — 앞당긴 구간에서도 해당 절
  const verseEntry = useMemo(
    () => entryAt(verseIndex, chapter, time + VERSE_LEAD_S),
    [verseIndex, chapter, time],
  );
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
      const seekAt = seekPlayVerify(p, t - VERSE_LEAD_S);
      setTime(seekAt);
      savePosition(bookId, seekAt);
      lastSavedRef.current = seekAt;
      setVerseSheetOpen(false);
      showToast(`${name} ${c}:${v}`);
    },
    [bookId, name, verseIndex, showToast],
  );

  const nudgeCurrentVerse = useCallback(
    (delta: number) => {
      if (currentVerse === null) return;
      const key = verseKey(chapter, currentVerse);
      const base = verseTime(verseIndex, chapter, currentVerse);
      if (base === null) return;
      const nextT = Math.round((base + delta) * 10) / 10;
      if (nextT < 0) return;
      const next = { ...verseFix, [key]: nextT };
      setVerseFix(next);
      saveVerseFix(bookId, next);
      const p = playerRef.current;
      if (p) {
        const seekAt = seekPlayVerify(p, nextT - VERSE_LEAD_S);
        setTime(seekAt);
        savePosition(bookId, seekAt);
        lastSavedRef.current = seekAt;
      }
      showToast(`${key} = ${formatTime(nextT)}`);
    },
    [bookId, chapter, currentVerse, verseFix, verseIndex, showToast],
  );

  const replayCurrentVerse = useCallback(() => {
    if (currentVerse === null) return;
    seekVerse(chapter, currentVerse);
  }, [chapter, currentVerse, seekVerse]);

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
    saveVerseFix(bookId, next);
    console.log(`[watch] ${key} = ${t}초\n` + verseFixJson(next));
    showToast(`${key} 시작 = ${formatTime(t)}`);
  }, [bookId, nextVerse, time, chapter, verseFix, showToast]);

  const copyVerseJson = useCallback(() => {
    const json = verseFixJson(verseFix);
    console.log(`[watch] data/verse-times-fix/${bookId}.json\n` + json);
    copyText(json).then((ok) =>
      showToast(ok ? "보정값을 복사했어요" : "복사 실패 — 콘솔을 확인하세요"),
    );
  }, [bookId, verseFix, showToast]);

  const currentVerseLabel =
    currentVerse !== null ? verseKey(chapter, currentVerse) : null;
  const currentVerseTime =
    currentVerse !== null ? verseTime(verseIndex, chapter, currentVerse) : null;

  const resetVerses = useCallback(() => {
    clearVerseFix(bookId);
    setVerseFix({});
    showToast("절 기록을 지웠어요");
  }, [bookId, showToast]);

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
          <span className="wt-top-title">{watchTitle}</span>
        </div>
      </header>

      <div className="wt-video">
        {bootStart !== null ? (
          <VideoPlayer
            videoId={videoId}
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
              {name} <strong key={chapter} className="wt-now-num">{chapter}장</strong>
              {currentVerse !== null && (
                <span className="wt-now-verse">
                  · {chapter}:{currentVerse}
                </span>
              )}
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
          <SwipeTabs bookId={bookId} chapter={chapter} />
        </VerseSeekContext.Provider>

        {devMode && (
          <DevChapterRecorder
            bookId={bookId}
            totalChapters={totalChapters}
            starts={starts}
            currentTime={time}
            onRecord={recordChapter}
            onReset={resetChapters}
            nextVerseLabel={nextVerse !== null ? verseKey(chapter, nextVerse) : null}
            verseFixCount={Object.keys(verseFix).length}
            onRecordNextVerse={recordNextVerse}
            onCopyVerseJson={copyVerseJson}
            onResetVerses={resetVerses}
            currentVerseLabel={currentVerseLabel}
            currentVerseTime={currentVerseTime}
            onNudgeVerse={nudgeCurrentVerse}
            onReplayVerse={replayCurrentVerse}
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
        speed={speed}
        bookName={name}
        chapter={chapter}
        currentVerse={currentVerse}
        chapterElapsed={chapterElapsed}
        chapterLength={chapterLength}
        chapterProgress={chapterProgress}
        prevChapter={prevChapterNum}
        nextChapter={nextChapterNum}
        onPrev={() => prevChapterNum !== null && seekChapterByNumber(prevChapterNum)}
        onNext={() => nextChapterNum !== null && seekChapterByNumber(nextChapterNum)}
        onTogglePlay={togglePlay}
        onSelectSpeed={selectSpeed}
        onOpenVerseSheet={() => setVerseSheetOpen(true)}
        onReplayVerse={replayCurrentVerse}
        onSeekInChapter={seekInChapter}
      />

      <VerseSheet
        open={verseSheetOpen}
        bookId={bookId}
        bookName={name}
        totalChapters={totalChapters}
        verseCounts={verseCounts}
        index={verseIndex}
        starts={starts}
        currentChapter={chapter}
        currentVerse={currentVerse}
        onPickChapter={(c) => seekChapterByNumber(c, { toast: false })}
        onPickVerse={seekVerse}
        onClose={closeVerseSheet}
        devMode={devMode}
        verseSrc={fileTimes.src}
      />
    </div>
  );
}
