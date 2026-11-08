// YouTube IFrame Player API 를 <script> 로 직접 로드한다(패키지 미사용).
// 필요한 메서드만 최소 타입으로 선언.

export type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  /** 다른 영상으로 바꿀 때 — startSeconds 부터 재생 */
  loadVideoById(videoId: string, startSeconds?: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getPlaybackRate(): number;
  setPlaybackRate(rate: number): void;
  destroy(): void;
};

type YTEvent<T = unknown> = { target: YTPlayer; data: T };

export type YTPlayerOptions = {
  videoId: string;
  width?: string | number;
  height?: string | number;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (e: YTEvent) => void;
    onStateChange?: (e: YTEvent<number>) => void;
    onPlaybackRateChange?: (e: YTEvent<number>) => void;
    onError?: (e: YTEvent<number>) => void;
  };
};

type YTNamespace = {
  Player: new (el: HTMLElement, options: YTPlayerOptions) => YTPlayer;
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export const YT_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

const API_SRC = "https://www.youtube.com/iframe_api";
let pending: Promise<YTNamespace> | null = null;

export function loadYouTubeApi(): Promise<YTNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube API는 브라우저에서만 로드할 수 있습니다."));
  }
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (pending) return pending;

  pending = new Promise<YTNamespace>((resolve, reject) => {
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevReady?.();
      if (window.YT?.Player) resolve(window.YT);
    };

    if (!document.querySelector(`script[src="${API_SRC}"]`)) {
      const script = document.createElement("script");
      script.src = API_SRC;
      script.async = true;
      script.onerror = () => {
        pending = null;
        script.remove();
        reject(new Error("YouTube API를 불러오지 못했습니다."));
      };
      document.head.appendChild(script);
    }
  });
  return pending;
}
