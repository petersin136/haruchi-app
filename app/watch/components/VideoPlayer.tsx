"use client";

import { useEffect, useRef, useState } from "react";
import {
  disableCaptions,
  loadYouTubeApi,
  YT_STATE,
  type YTPlayer,
} from "./youtube";

type Props = {
  videoId: string;
  startSeconds: number;
  onReady: (player: YTPlayer) => void;
  onStateChange: (state: number) => void;
  onRateChange: (rate: number) => void;
};

/** 시작 전·종료 시에만 포스터 커버.
 *  일시정지는 프레임을 그대로 보여야 함(멈춰서 읽기) — PAUSED 에 커버 금지. */
function coverForState(state: number | null): boolean {
  if (state == null) return true;
  return (
    state === YT_STATE.UNSTARTED ||
    state === YT_STATE.CUED ||
    state === YT_STATE.ENDED
  );
}

export default function VideoPlayer({
  videoId,
  startSeconds,
  onReady,
  onStateChange,
  onRateChange,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const callbacks = useRef({ onReady, onStateChange, onRateChange });
  callbacks.current = { onReady, onStateChange, onRateChange };
  const startRef = useRef(startSeconds);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ytState, setYtState] = useState<number | null>(null);
  const [buffering, setBuffering] = useState(false);

  const showCover = !ready || failed || coverForState(ytState);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let player: YTPlayer | null = null;

    // YT.Player 는 넘겨받은 노드를 iframe 으로 갈아 끼우므로 React 가 소유하지 않는 노드를 준다.
    const mount = document.createElement("div");
    host.appendChild(mount);

    const playerVars: Record<string, number | string> = {
      playsinline: 1,
      rel: 0,
      modestbranding: 1,
      controls: 0,
      fs: 0,
      iv_load_policy: 3,
      cc_load_policy: 0,
      disablekb: 1,
      autoplay: 0,
    };
    const start = Math.floor(startRef.current);
    if (start > 0) playerVars.start = start;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        player = new YT.Player(mount, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars,
          events: {
            onReady: (e) => {
              playerRef.current = e.target;
              disableCaptions(e.target);
              // 트랙 로드가 늦은 경우 한 번 더
              window.setTimeout(() => disableCaptions(e.target), 400);
              window.setTimeout(() => disableCaptions(e.target), 1200);
              setReady(true);
              setYtState(YT_STATE.CUED);
              callbacks.current.onReady(e.target);
            },
            onStateChange: (e) => {
              if (
                e.data === YT_STATE.PLAYING ||
                e.data === YT_STATE.BUFFERING ||
                e.data === YT_STATE.CUED
              ) {
                disableCaptions(e.target);
              }
              setYtState(e.data);
              setBuffering(e.data === YT_STATE.BUFFERING);
              callbacks.current.onStateChange(e.data);
            },
            onPlaybackRateChange: (e) =>
              callbacks.current.onRateChange(e.data),
          },
        });
        playerRef.current = player;
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      playerRef.current = null;
      try {
        player?.destroy();
      } catch {
        /* noop */
      }
      host.innerHTML = "";
    };
  }, [videoId]);

  const onCoverPlay = () => {
    const p = playerRef.current;
    if (!p || failed) return;
    try {
      p.playVideo();
    } catch {
      /* noop */
    }
  };

  /** 재생 중 → 일시정지 / 일시정지 → 재생 (정지 화면 유지 위해 포스터 없이 토글) */
  const onSurfaceClick = () => {
    const p = playerRef.current;
    if (!p || showCover) return;
    try {
      if (ytState === YT_STATE.PAUSED) p.playVideo();
      else p.pauseVideo();
    } catch {
      /* noop */
    }
  };

  const isPaused = ytState === YT_STATE.PAUSED;

  /* maxresdefault = 16:9 (hqdefault 는 4:3 이라 커버에 흰 띠가 생김) */
  const posterUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

  return (
    <div className={`wt-video-frame${showCover ? " is-covered" : ""}`}>
      <div ref={hostRef} className="wt-video-host" />

      {!showCover && (
        <button
          type="button"
          className="wt-video-hit"
          aria-label={isPaused ? "재생" : "일시정지"}
          onClick={onSurfaceClick}
        />
      )}

      {buffering && !showCover && (
        <div className="wt-video-buffer" aria-hidden>
          <span className="wt-video-spinner" />
        </div>
      )}

      {showCover && (
        <div
          className="wt-video-cover"
          style={{ backgroundImage: `url(${posterUrl})` }}
        >
          <div className="wt-video-cover-shade" aria-hidden />
          {failed ? (
            <span className="wt-video-msg">
              영상을 불러오지 못했어요. 네트워크를 확인해 주세요.
            </span>
          ) : !ready ? (
            <span className="wt-video-spinner" aria-hidden />
          ) : (
            <button
              type="button"
              className="wt-video-play"
              onClick={onCoverPlay}
              aria-label="재생"
            >
              <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden>
                <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
