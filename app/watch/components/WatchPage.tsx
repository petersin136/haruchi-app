"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { BOOKS, type BookId } from "@/app/bible-reading/books";
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
  hasVerseTimingData,
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
import {
  chapterLabel,
  chapterUnit,
  isBookInManifest,
  loadWatchManifest,
  nextBookInManifest,
  resolveChapterSeekStart,
  segmentsFor,
  videoIdForChapter,
  watchTitleFor,
  type VideoSegment,
  type WatchBookId,
  type WatchManifest,
} from "../data/books";
import {
  chapterAtInRange,
  checkChapterStart,
  clearChapterStarts,
  describeStartCheck,
  loadStartOverrides,
  resolveChapterStarts,
  saveStartOverrides,
  type ChapterStarts,
  type StartOverrides,
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

function WatchShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
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
          <span className="wt-top-title">{title}</span>
        </div>
      </header>
      {children}
    </div>
  );
}

function UnavailableWatch({ bookId }: { bookId: BookId }) {
  const name = BOOKS[bookId].name;
  return (
    <WatchShell title={watchTitleFor(bookId)}>
      <main className="wt-main wt-unavailable">
        <h1 className="wt-unavailable-title">{name}</h1>
        <p className="wt-unavailable-msg">영상 준비 중</p>
        <Link href="/bible-reading" className="wt-unavailable-link">
          성경 읽기로 돌아가기
        </Link>
      </main>
    </WatchShell>
  );
}

export default function WatchPage({ bookId }: { bookId: WatchBookId }) {
  const router = useRouter();
  const name = BOOKS[bookId].name;
  const totalChapters = BOOKS[bookId].totalChapters;
  const watchTitle = watchTitleFor(bookId);

  const [manifest, setManifest] = useState<WatchManifest | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [boot, setBoot] = useState<{ videoId: string; start: number } | null>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [fileStarts, setFileStarts] = useState<ChapterStarts | null>(null);
  const [overrides, setOverrides] = useState<StartOverrides>({});
  const starts = useMemo(
    () => resolveChapterStarts(bookId, fileStarts, overrides),
    [bookId, fileStarts, overrides],
  );
  const segments = useMemo(
    () => segmentsFor(manifest, bookId),
    [manifest, bookId],
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
    present: false,
  });
  const [verseFix, setVerseFix] = useState<VerseTimeMap>({});
  const [verseCounts, setVerseCounts] = useState<number[]>([]);
  const [verseSheetOpen, setVerseSheetOpen] = useState(false);
  const playerRef = useRef<YTPlayer | null>(null);
  const hasPlayedRef = useRef(false);
  const lastSavedRef = useRef(0);
  const chapterRef = useRef(1);
  const activeVideoRef = useRef<string | null>(null);

  const showToast = useCallback((text: string) => setToast({ id: Date.now(), text }), []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(id);
  }, [toast]);

  // manifest + watch-times + 저장값으로 부팅(영상 준비 여부·시작 위치).
  useEffect(() => {
    let stale = false;
    setBoot(null);
    setReady(false);
    setUnavailable(false);
    setManifest(null);
    setActiveVideoId(null);
    activeVideoRef.current = null;
    setFileStarts(null);
    setFileTimes({ times: {}, missing: [], starts: [], src: {}, present: false });
    playerRef.current = null;
    hasPlayedRef.current = false;

    setOverrides(loadStartOverrides(bookId));
    setSpeed(loadSpeed(bookId));
    setVerseFix(loadVerseFix(bookId));
    setDevMode(new URLSearchParams(window.location.search).get("dev") === "1");

    const pos = loadPosition(bookId);

    Promise.all([loadWatchManifest(), loadWatchTimes(bookId)])
      .then(([man, times]) => {
        if (stale) return;
        if (!isBookInManifest(man, bookId)) {
          setUnavailable(true);
          return;
        }
        setManifest(man);
        setFileTimes(times);
        setFileStarts(times.starts);

        const segs = segmentsFor(man, bookId);
        const resolved = resolveChapterStarts(bookId, times.starts, loadStartOverrides(bookId));
        const timesReady = hasVerseTimingData(times);
        let ch = 1;
        let resume = 0;
        if (timesReady) {
          ch = pos.c >= 1 && pos.c <= BOOKS[bookId].totalChapters ? pos.c : 0;
          if (!ch) {
            const first = segs[0];
            ch = first
              ? chapterAtInRange(pos.t, resolved, first.from, first.to)
              : 1;
          }
          resume = pos.t >= RESUME_MIN_S ? pos.t : 0;
        }
        const vid = videoIdForChapter(segs, ch) ?? segs[0]?.videoId;
        if (!vid) {
          setUnavailable(true);
          return;
        }
        // 절 시간 없으면 무조건 영상 처음(0초) — 장 seek 추정 금지
        setActiveVideoId(vid);
        activeVideoRef.current = vid;
        setTime(resume);
        lastSavedRef.current = resume;
        chapterRef.current = ch;
        setBoot({ videoId: vid, start: resume });
        if (resume > 0) showToast(`${formatTime(resume)}부터 이어서 봐요`);
      })
      .catch(() => {
        if (!stale) setUnavailable(true);
      });

    loadVerseCounts(bookId).then(
      (c) => !stale && setVerseCounts(c),
      () => undefined,
    );

    return () => {
      stale = true;
    };
  }, [bookId, showToast]);

  useEffect(() => {
    if (!ready) return;
    const id = window.setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      const t = p.getCurrentTime();
      if (!Number.isFinite(t)) return;
      if (!hasPlayedRef.current && t < 0.5) return;
      setTime(t);
      setDuration(p.getDuration() || 0);
      if (hasPlayedRef.current && Math.abs(t - lastSavedRef.current) >= SAVE_EVERY_S) {
        savePosition(bookId, t, chapterRef.current);
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
        if (t > 0) savePosition(bookId, t, chapterRef.current);
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
      if (state === YT_STATE.PLAYING) {
        hasPlayedRef.current = true;
        setDuration(playerRef.current?.getDuration() || 0);
      }
      if (state === YT_STATE.PAUSED) {
        const t = playerRef.current?.getCurrentTime() ?? 0;
        if (t > 0) {
          savePosition(bookId, t, chapterRef.current);
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
    /* 배속은 리모컨·localStorage 가 소스 */
  }, []);

  const activeSeg = useMemo((): VideoSegment | null => {
    if (!activeVideoId) return segments[0] ?? null;
    return segments.find((s) => s.videoId === activeVideoId) ?? segments[0] ?? null;
  }, [segments, activeVideoId]);

  const hasVerseTimes = useMemo(() => hasVerseTimingData(fileTimes), [fileTimes]);
  const unit = chapterUnit(bookId);

  const chapter = useMemo(() => {
    if (!hasVerseTimes) return activeSeg?.from ?? 1;
    if (!activeSeg) return 1;
    return chapterAtInRange(time, starts, activeSeg.from, activeSeg.to);
  }, [hasVerseTimes, time, starts, activeSeg]);

  useEffect(() => {
    chapterRef.current = chapter;
  }, [chapter]);

  const nextInSameVideo = useMemo(() => {
    if (!activeSeg) return null;
    for (let i = chapter; i < activeSeg.to; i += 1) {
      const s = starts[i];
      if (s !== null) return { chapter: i + 1, start: s };
    }
    return null;
  }, [chapter, starts, activeSeg]);

  const chapterStart =
    typeof starts[chapter - 1] === "number"
      ? (starts[chapter - 1] as number)
      : activeSeg && activeSeg.from === chapter
        ? 0
        : 0;
  const chapterEnd = nextInSameVideo?.start ?? duration;
  const chapterLength = Math.max(0, chapterEnd - chapterStart);
  const chapterElapsed = Math.min(chapterLength, Math.max(0, time - chapterStart));
  const chapterProgress =
    chapterLength > 0 ? Math.min(1, Math.max(0, chapterElapsed / chapterLength)) : 0;

  const nextBook = useMemo(() => {
    if (!hasVerseTimes || chapter >= totalChapters) {
      return nextBookInManifest(manifest, bookId);
    }
    return null;
  }, [hasVerseTimes, chapter, totalChapters, manifest, bookId]);

  // 절 시간 없으면 장/편 이동 숨김(시작 시각 모름). 다음 책만 허용.
  const prevLabel =
    hasVerseTimes && chapter > 1 ? `‹ ${chapterLabel(bookId, chapter - 1)}` : null;
  const nextLabel = !hasVerseTimes
    ? nextBook
      ? `${BOOKS[nextBook].name} ${chapterLabel(nextBook, 1)} ›`
      : null
    : chapter < totalChapters
      ? `${chapterLabel(bookId, chapter + 1)} ›`
      : nextBook
        ? `${BOOKS[nextBook].name} ${chapterLabel(nextBook, 1)} ›`
        : null;

  /** 같은 영상이면 seekTo, 다르면 loadVideoById */
  const playAt = useCallback(
    (
      chapterNum: number,
      targetSec: number,
      opts?: { toast?: boolean; toastText?: string },
    ) => {
      const p = playerRef.current;
      const vid = videoIdForChapter(segments, chapterNum);
      if (!p || !vid) return;
      const seekAt = Math.max(0, targetSec);
      const curVid = activeVideoRef.current;
      if (curVid && vid !== curVid) {
        activeVideoRef.current = vid;
        setActiveVideoId(vid);
        p.loadVideoById(vid, seekAt);
        setTime(seekAt);
        setDuration(0);
      } else {
        seekPlayVerify(p, seekAt);
        setTime(seekAt);
      }
      chapterRef.current = chapterNum;
      savePosition(bookId, seekAt, chapterNum);
      lastSavedRef.current = seekAt;
      if (opts?.toast !== false) {
        showToast(opts?.toastText ?? `${name} ${chapterLabel(bookId, chapterNum)}`);
      }
    },
    [segments, bookId, name, showToast],
  );

  const seekChapterByNumber = useCallback(
    (n: number, opts?: { toast?: boolean }) => {
      if (!hasVerseTimes) return;
      const start = resolveChapterSeekStart(starts, segments, n, hasVerseTimes);
      if (start === null) return;
      playAt(n, start - VERSE_LEAD_S, opts);
    },
    [starts, segments, hasVerseTimes, playAt],
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
      if (chapterLength <= 0) return;
      const target = chapterStart + Math.min(1, Math.max(0, ratio)) * chapterLength;
      playAt(chapter, target, { toast: false });
    },
    [chapterLength, chapterStart, chapter, playAt],
  );

  const goNext = useCallback(() => {
    if (hasVerseTimes && chapter < totalChapters) {
      seekChapterByNumber(chapter + 1);
      return;
    }
    if (nextBook) router.push(`/watch/${nextBook}`);
  }, [hasVerseTimes, chapter, totalChapters, seekChapterByNumber, nextBook, router]);

  const goPrev = useCallback(() => {
    if (hasVerseTimes && chapter > 1) seekChapterByNumber(chapter - 1);
  }, [hasVerseTimes, chapter, seekChapterByNumber]);

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
      const t = verseTime(verseIndex, c, v);
      if (t === null) return;
      // 절이 다른 영상에 있으면 영상 전환
      playAt(c, t - VERSE_LEAD_S, { toastText: `${name} ${c}:${v}` });
      setVerseSheetOpen(false);
    },
    [verseIndex, playAt, name],
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
      playAt(chapter, nextT - VERSE_LEAD_S, { toastText: `${key} = ${formatTime(nextT)}` });
    },
    [bookId, chapter, currentVerse, verseFix, verseIndex, playAt],
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

  if (unavailable) return <UnavailableWatch bookId={bookId} />;

  return (
    <WatchShell title={watchTitle}>
      <div className="wt-video">
        {boot !== null ? (
          <VideoPlayer
            key={`${bookId}:${boot.videoId}`}
            videoId={boot.videoId}
            startSeconds={boot.start}
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
              {name}{" "}
              <strong key={chapter} className="wt-now-num">
                {chapterLabel(bookId, chapter)}
              </strong>
              {hasVerseTimes && currentVerse !== null && (
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
        chapterUnit={unit}
        currentVerse={hasVerseTimes ? currentVerse : null}
        chapterElapsed={hasVerseTimes ? chapterElapsed : time}
        chapterLength={hasVerseTimes ? chapterLength : duration}
        chapterProgress={
          hasVerseTimes
            ? chapterProgress
            : duration > 0
              ? Math.min(1, Math.max(0, time / duration))
              : 0
        }
        prevLabel={prevLabel}
        nextLabel={nextLabel}
        onPrev={goPrev}
        onNext={goNext}
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
        segments={segments}
        hasVerseTimes={hasVerseTimes}
        currentChapter={chapter}
        currentVerse={hasVerseTimes ? currentVerse : null}
        onPickChapter={(c) => seekChapterByNumber(c, { toast: false })}
        onPickVerse={seekVerse}
        onClose={closeVerseSheet}
        devMode={devMode}
        verseSrc={fileTimes.src}
      />
    </WatchShell>
  );
}
