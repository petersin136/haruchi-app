"use client";

import { useEffect, useRef, useState } from "react";
import { loadYouTubeApi, type YTPlayer } from "./youtube";

type Props = {
  videoId: string;
  startSeconds: number;
  onReady: (player: YTPlayer) => void;
  onStateChange: (state: number) => void;
  onRateChange: (rate: number) => void;
};

export default function VideoPlayer({
  videoId,
  startSeconds,
  onReady,
  onStateChange,
  onRateChange,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onReady, onStateChange, onRateChange });
  callbacks.current = { onReady, onStateChange, onRateChange };
  const startRef = useRef(startSeconds);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let player: YTPlayer | null = null;

    // YT.Player 는 넘겨받은 노드를 iframe 으로 갈아 끼우므로 React 가 소유하지 않는 노드를 준다.
    const mount = document.createElement("div");
    host.appendChild(mount);

    const playerVars: Record<string, number> = { playsinline: 1, rel: 0, modestbranding: 1 };
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
              setReady(true);
              callbacks.current.onReady(e.target);
            },
            onStateChange: (e) => callbacks.current.onStateChange(e.data),
            onPlaybackRateChange: (e) => callbacks.current.onRateChange(e.data),
          },
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      try {
        player?.destroy();
      } catch {
        /* noop */
      }
      host.innerHTML = "";
    };
  }, [videoId]);

  return (
    <div className="wt-video-frame">
      {!ready && (
        <div
          className="wt-video-poster"
          style={{ backgroundImage: `url(https://i.ytimg.com/vi/${videoId}/hqdefault.jpg)` }}
          aria-hidden={!failed}
        >
          {failed ? (
            <span className="wt-video-msg">영상을 불러오지 못했어요. 네트워크를 확인해 주세요.</span>
          ) : (
            <span className="wt-video-spinner" />
          )}
        </div>
      )}
      <div ref={hostRef} className="wt-video-host" />
    </div>
  );
}
