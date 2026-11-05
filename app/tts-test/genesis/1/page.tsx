"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Verse = { n: number; t: string };

const AUDIO_BASE = "/tts-test/genesis/1";
const KOREAN_JSON = "/bible-study/chunks/genesis/1/korean.json";

function audioCandidates(n: number): string[] {
  return [`${AUDIO_BASE}/${n}.mp3`, `${AUDIO_BASE}/${n}.wav`];
}

export default function TtsTestGenesis1Page() {
  const [verses, setVerses] = useState<Verse[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeN, setActiveN] = useState<number | null>(null);
  const [playingAll, setPlayingAll] = useState(false);
  const [status, setStatus] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playAllRef = useRef(false);
  const queueRef = useRef<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(KOREAN_JSON);
        if (!res.ok) throw new Error(`본문 로드 실패 (${res.status})`);
        const data = await res.json();
        const krv = data?.verses?.krv as Verse[] | undefined;
        if (!Array.isArray(krv) || krv.length === 0) {
          throw new Error("개역한글 절 목록이 비어 있습니다.");
        }
        if (!cancelled) setVerses(krv);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      playAllRef.current = false;
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const stopAll = useCallback(() => {
    playAllRef.current = false;
    queueRef.current = [];
    setPlayingAll(false);
    setActiveN(null);
    setStatus("");
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  const playUrl = useCallback((url: string, n: number) => {
    return new Promise<void>((resolve, reject) => {
      const audio = new Audio(url);
      audioRef.current = audio;
      setActiveN(n);
      audio.onended = () => {
        if (audioRef.current === audio) audioRef.current = null;
        resolve();
      };
      audio.onerror = () => {
        if (audioRef.current === audio) audioRef.current = null;
        reject(new Error(`재생 실패: ${url}`));
      };
      void audio.play().catch(reject);
    });
  }, []);

  const playVerse = useCallback(
    async (n: number) => {
      stopAll();
      setStatus(`${n}절 재생…`);
      const urls = audioCandidates(n);
      let lastErr: unknown = null;
      for (const url of urls) {
        try {
          const head = await fetch(url, { method: "HEAD" });
          if (!head.ok) continue;
          await playUrl(url, n);
          setActiveN(null);
          setStatus("");
          return;
        } catch (e) {
          lastErr = e;
        }
      }
      setActiveN(null);
      setStatus(
        lastErr instanceof Error
          ? lastErr.message
          : `${n}절 음성 파일이 없습니다. (scripts/build-tts-genesis1.mjs)`,
      );
    },
    [playUrl, stopAll],
  );

  const playAll = useCallback(async () => {
    if (verses.length === 0) return;
    stopAll();
    playAllRef.current = true;
    setPlayingAll(true);
    queueRef.current = verses.map((v) => v.n);
    let stoppedEarly = false;

    for (const n of queueRef.current) {
      if (!playAllRef.current) break;
      setStatus(`연속 재생 — ${n}절`);
      const urls = audioCandidates(n);
      let played = false;
      for (const url of urls) {
        if (!playAllRef.current) break;
        try {
          const head = await fetch(url, { method: "HEAD" });
          if (!head.ok) continue;
          await playUrl(url, n);
          played = true;
          break;
        } catch {
          /* try next ext */
        }
      }
      if (!played && playAllRef.current) {
        setStatus(`${n}절 파일 없음 — 연속 재생 중단`);
        stoppedEarly = true;
        break;
      }
    }

    playAllRef.current = false;
    setPlayingAll(false);
    setActiveN(null);
    if (!stoppedEarly) setStatus("");
  }, [playUrl, stopAll, verses]);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px 64px" }}>
      <h1 style={{ fontSize: "1.35rem", fontWeight: 700, margin: "0 0 8px" }}>
        TTS 테스트 — 창세기 1장
      </h1>
      <p style={{ margin: "0 0 20px", opacity: 0.75, fontSize: "0.95rem" }}>
        Gemini TTS (Sulafat) · 개역한글 · 절별 파일
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <button type="button" onClick={() => void playAll()} disabled={playingAll || !!loadError}>
          전체 연속 재생
        </button>
        <button type="button" onClick={stopAll} disabled={!playingAll && activeN == null}>
          정지
        </button>
      </div>

      {status ? (
        <p style={{ margin: "0 0 16px", fontSize: "0.9rem" }} role="status">
          {status}
        </p>
      ) : null}

      {loadError ? (
        <p style={{ color: "crimson" }}>{loadError}</p>
      ) : (
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {verses.map((v) => {
            const highlighted = activeN === v.n;
            return (
              <li
                key={v.n}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  padding: "10px 12px",
                  marginBottom: 6,
                  borderRadius: 8,
                  background: highlighted ? "rgba(180, 140, 60, 0.18)" : "transparent",
                  outline: highlighted ? "2px solid rgba(180, 140, 60, 0.45)" : "none",
                }}
              >
                <button
                  type="button"
                  onClick={() => void playVerse(v.n)}
                  style={{ flexShrink: 0 }}
                  aria-label={`${v.n}절 재생`}
                >
                  ▶ {v.n}
                </button>
                <p
                  style={{
                    margin: 0,
                    lineHeight: 1.55,
                    fontWeight: highlighted ? 600 : 400,
                  }}
                >
                  <span style={{ opacity: 0.55, marginRight: 6 }}>{v.n}</span>
                  {v.t}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
