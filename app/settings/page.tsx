"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useSettings } from "../components/SettingsProvider";
import {
  FONT_FAMILIES,
  FONT_SIZE_LABELS,
  FONT_SIZE_SCALE,
  SCROLL_SPEED_LABELS,
  SCROLL_SPEED_MULTIPLIER,
  SPACING_LABELS,
  TEXT_LINE_HEIGHT,
  THEME_PRESETS,
  VERSE_GAP_PX,
  type FontKey,
  type FontSizeKey,
  type ScrollSpeedKey,
  type SpacingKey,
  type ThemeKey,
} from "../lib/userSettings";

// 표시 순서 — 친숙도 → 디자이너 픽 → 어린이 톤 순서로 정렬.
const FONT_KEYS: FontKey[] = [
  "sans",
  "serif",
  "modern",
  "gothic",
  "doh",
  "gaegu",
  "gamja",
  "pen",
];
const FONT_SIZE_KEYS: FontSizeKey[] = ["sm", "md", "lg", "xl"];
const SPACING_KEYS: SpacingKey[] = ["tight", "normal", "relaxed", "loose"];
const SCROLL_SPEED_KEYS: ScrollSpeedKey[] = [
  "fast",
  "normal",
  "slow",
  "slowest",
];
const THEME_KEYS: ThemeKey[] = ["green", "blue", "warm", "purple"];

type SectionKey =
  | "theme"
  | "font"
  | "size"
  | "verseGap"
  | "lineHeight"
  | "scroll";

const sampleChapterSeconds = (mult: number) =>
  Math.max(2, Math.ceil(15 * 0.5 * mult));

export default function SettingsPage() {
  const { settings, update, reset } = useSettings();
  const [openKey, setOpenKey] = useState<SectionKey | null>(null);

  const toggle = (key: SectionKey) =>
    setOpenKey((prev) => (prev === key ? null : key));

  const liveSeconds = sampleChapterSeconds(
    SCROLL_SPEED_MULTIPLIER[settings.scrollSpeed],
  );

  return (
    <main className="hs-page">
      <header className="hs-topbar">
        <Link
          href="/bible-reading"
          className="hs-back"
          aria-label="읽기 화면으로 돌아가기"
        >
          {/* span 은 DOM 엘리먼트라 styled-jsx 스코프가 정상 적용됨(Link 자체엔 안 붙음). */}
          <span className="hs-back-box">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </span>
        </Link>
        <h1>설정</h1>
        <button
          type="button"
          className="hs-reset-btn"
          onClick={reset}
          title="모든 설정을 기본값으로 되돌려요"
        >
          기본값
        </button>
      </header>

      <div className="hs-shell">
      <div className="hs-list">
        {/* ─────────────────── 다크 모드 (토글 한 줄) ─────────────────── */}
        <section className="hs-toggle-row">
          <div className="hs-toggle-text">
            <h2>다크 모드</h2>
            <p>어두운 환경에서 눈이 편하도록 화면 전체가 어두워져요.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.darkMode}
            className={`hs-switch ${settings.darkMode ? "is-on" : ""}`}
            onClick={() => update("darkMode", !settings.darkMode)}
          >
            <span className="hs-switch-thumb" aria-hidden="true" />
          </button>
        </section>

        {/* ─────────────────── 테마 색상 ─────────────────── */}
        <Accordion
          open={openKey === "theme"}
          onToggle={() => toggle("theme")}
          title="테마 색상"
          value={THEME_PRESETS[settings.theme].label}
        >
          <p className="hs-hint">읽기 진행도, 강조 버튼, 스위치에 쓰이는 색이에요.</p>
          <div className="hs-themes">
            {THEME_KEYS.map((key) => {
              const preset = THEME_PRESETS[key];
              const active = settings.theme === key;
              return (
                <button
                  key={key}
                  type="button"
                  className={`hs-theme ${active ? "is-active" : ""}`}
                  onClick={() => update("theme", key)}
                  aria-pressed={active}
                >
                  <span
                    className="hs-theme-swatch"
                    style={{ background: preset.accent }}
                    aria-hidden="true"
                  />
                  <span className="hs-theme-name">{preset.label}</span>
                </button>
              );
            })}
          </div>
          <div className="hs-inline-preview">
            <ReaderPreview />
          </div>
        </Accordion>

        {/* ─────────────────── 본문 폰트 ─────────────────── */}
        <Accordion
          open={openKey === "font"}
          onToggle={() => toggle("font")}
          title="본문 폰트"
          value={FONT_FAMILIES[settings.font].label}
        >
          <p className="hs-hint">읽기 화면 본문에만 적용돼요.</p>
          <div className="hs-fonts">
            {FONT_KEYS.map((key) => {
              const def = FONT_FAMILIES[key];
              const active = settings.font === key;
              return (
                <button
                  key={key}
                  type="button"
                  className={`hs-font ${active ? "is-active" : ""}`}
                  onClick={() => update("font", key)}
                  aria-pressed={active}
                >
                  <span className="hs-font-name">{def.label}</span>
                  <span
                    className="hs-font-sample"
                    style={{ fontFamily: def.family }}
                  >
                    태초에 하나님이 천지를
                  </span>
                </button>
              );
            })}
          </div>
          <div className="hs-inline-preview">
            <ReaderPreview />
          </div>
        </Accordion>

        {/* ─────────────────── 글자 크기 ─────────────────── */}
        <Accordion
          open={openKey === "size"}
          onToggle={() => toggle("size")}
          title="글자 크기"
          value={FONT_SIZE_LABELS[settings.fontSize]}
        >
          <div className="hs-grid-4">
            {FONT_SIZE_KEYS.map((key) => {
              const active = settings.fontSize === key;
              return (
                <button
                  key={key}
                  type="button"
                  className={`hs-card ${active ? "is-active" : ""}`}
                  onClick={() => update("fontSize", key)}
                  aria-pressed={active}
                >
                  <span
                    className="hs-card-glyph"
                    style={{ fontSize: `${20 * FONT_SIZE_SCALE[key]}px` }}
                  >
                    가나
                  </span>
                  <span className="hs-card-label">{FONT_SIZE_LABELS[key]}</span>
                </button>
              );
            })}
          </div>
          <div className="hs-inline-preview">
            <ReaderPreview />
          </div>
        </Accordion>

        {/* ─────────────────── 절 사이 간격 ─────────────────── */}
        <Accordion
          open={openKey === "verseGap"}
          onToggle={() => toggle("verseGap")}
          title="절 사이 간격"
          value={SPACING_LABELS[settings.verseGap]}
        >
          <p className="hs-hint">절(verse) 끼리 떨어진 정도예요.</p>
          <div className="hs-grid-4">
            {SPACING_KEYS.map((key) => {
              const active = settings.verseGap === key;
              return (
                <button
                  key={key}
                  type="button"
                  className={`hs-card ${active ? "is-active" : ""}`}
                  onClick={() => update("verseGap", key)}
                  aria-pressed={active}
                >
                  <span
                    className="hs-card-stack"
                    aria-hidden="true"
                    style={{ gap: `${VERSE_GAP_PX[key] / 1.6}px` }}
                  >
                    <span />
                    <span />
                    <span />
                  </span>
                  <span className="hs-card-label">{SPACING_LABELS[key]}</span>
                </button>
              );
            })}
          </div>
          <div className="hs-inline-preview">
            <ReaderPreview />
          </div>
        </Accordion>

        {/* ─────────────────── 텍스트 줄 간격 ─────────────────── */}
        <Accordion
          open={openKey === "lineHeight"}
          onToggle={() => toggle("lineHeight")}
          title="텍스트 줄 간격"
          value={SPACING_LABELS[settings.textLineHeight]}
        >
          <p className="hs-hint">한 절 안에서 줄과 줄 사이 간격이에요.</p>
          <div className="hs-grid-4">
            {SPACING_KEYS.map((key) => {
              const active = settings.textLineHeight === key;
              return (
                <button
                  key={key}
                  type="button"
                  className={`hs-card hs-card--tall ${
                    active ? "is-active" : ""
                  }`}
                  onClick={() => update("textLineHeight", key)}
                  aria-pressed={active}
                >
                  <span
                    className="hs-card-lines"
                    aria-hidden="true"
                    style={{ lineHeight: TEXT_LINE_HEIGHT[key] }}
                  >
                    가나다라
                    <br />
                    마바사아
                  </span>
                  <span className="hs-card-label">{SPACING_LABELS[key]}</span>
                </button>
              );
            })}
          </div>
          <div className="hs-inline-preview">
            <ReaderPreview />
          </div>
        </Accordion>

        {/* ─────────────────── 스크롤 읽기 속도 ─────────────────── */}
        <Accordion
          open={openKey === "scroll"}
          onToggle={() => toggle("scroll")}
          title="스크롤 읽기 속도"
          value={`${SCROLL_SPEED_LABELS[settings.scrollSpeed]} · ${liveSeconds}초`}
        >
          <p className="hs-hint">
            스크롤 모드에서 한 장을 다 읽은 것으로 인정해 주기까지의 최소 시간이에요.
            15절짜리 한 장 기준으로 표시했어요.
          </p>
          <div className="hs-grid-4">
            {SCROLL_SPEED_KEYS.map((key) => {
              const active = settings.scrollSpeed === key;
              const sample = sampleChapterSeconds(SCROLL_SPEED_MULTIPLIER[key]);
              return (
                <button
                  key={key}
                  type="button"
                  className={`hs-card ${active ? "is-active" : ""}`}
                  onClick={() => update("scrollSpeed", key)}
                  aria-pressed={active}
                >
                  <span className="hs-card-speed">{sample}초</span>
                  <span className="hs-card-label">
                    {SCROLL_SPEED_LABELS[key]}
                  </span>
                </button>
              );
            })}
          </div>
        </Accordion>

        <p className="hs-footer-note">
          모든 설정은 이 기기에만 저장돼요. 다른 기기에선 다시 설정해 주세요.
        </p>
      </div>

      {/* 우측 sticky 미리보기 — 태블릿/PC(≥960px) 에서만 표시. 모바일은
          각 아코디언 안 인라인 미리보기를 그대로 쓰므로 영향 없음. */}
      <aside className="hs-side" aria-label="미리보기">
        <div className="hs-side-card">
          <p className="hs-side-tag">미리보기</p>
          <ReaderPreview bare />
        </div>
      </aside>
      </div>{/* /.hs-shell */}

      <style jsx>{`
        .hs-page {
          min-height: 100vh;
          background: var(--bg);
          color: var(--ink);
          padding: 0 0 80px;
          font-family: var(--font-noto-sans-kr), -apple-system,
            BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        }

        .hs-topbar {
          position: sticky;
          top: 0;
          z-index: 5;
          display: grid;
          grid-template-columns: 40px 1fr 64px;
          align-items: center;
          gap: 12px;
          padding: 12px clamp(16px, 4vw, 32px);
          background: var(--bg-translucent);
          backdrop-filter: saturate(180%) blur(20px);
          -webkit-backdrop-filter: saturate(180%) blur(20px);
          border-bottom: 1px solid var(--line);
          min-height: 56px;
          box-sizing: border-box;
        }
        .hs-back-box {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 999px;
          color: var(--ink);
          transition: background 0.18s ease;
        }
        .hs-back-box:hover {
          background: var(--surface-alt);
        }
        .hs-topbar h1 {
          margin: 0;
          font-size: 16px;
          font-weight: 700;
          letter-spacing: -0.01em;
          text-align: center;
          color: var(--ink);
        }
        .hs-reset-btn {
          justify-self: end;
          padding: 7px 12px;
          border-radius: 999px;
          background: transparent;
          color: var(--ink-soft);
          border: 1px solid var(--line);
          font: inherit;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease;
        }
        .hs-reset-btn:hover {
          background: var(--surface-alt);
          color: var(--ink);
          border-color: var(--line-strong);
        }

        /* 모바일 기본 — 단일 컬럼. (모바일은 이 값 그대로 유지) */
        .hs-shell {
          display: block;
        }
        .hs-list {
          max-width: 640px;
          margin: 0 auto;
          padding: 18px clamp(16px, 4vw, 32px) 0;
          display: grid;
          gap: 10px;
        }
        /* 우측 미리보기 패널 — 모바일에선 숨김(인라인 미리보기 사용). */
        .hs-side {
          display: none;
        }

        .hs-toggle-row {
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: center;
          gap: 16px;
          padding: 16px 18px;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 14px;
        }
        .hs-toggle-text h2 {
          margin: 0 0 4px;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: -0.005em;
          color: var(--ink);
        }
        .hs-toggle-text p {
          margin: 0;
          font-size: 12.5px;
          color: var(--ink-soft);
          line-height: 1.5;
        }
        .hs-switch {
          position: relative;
          width: 52px;
          height: 30px;
          border-radius: 999px;
          background: var(--line-strong);
          border: 0;
          cursor: pointer;
          transition: background 0.22s ease;
          flex-shrink: 0;
        }
        .hs-switch.is-on {
          background: var(--accent);
        }
        .hs-switch-thumb {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 24px;
          height: 24px;
          border-radius: 999px;
          background: #fff;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
          transition: transform 0.22s cubic-bezier(0.32, 0.72, 0.24, 1);
        }
        .hs-switch.is-on .hs-switch-thumb {
          transform: translateX(22px);
        }

        .hs-hint {
          margin: 0 0 14px;
          font-size: 12.5px;
          color: var(--ink-soft);
          line-height: 1.55;
        }

        .hs-themes {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }
        @media (min-width: 560px) {
          .hs-themes {
            grid-template-columns: repeat(4, 1fr);
          }
        }
        .hs-theme {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          border-radius: 12px;
          background: transparent;
          border: 1px solid var(--line);
          cursor: pointer;
          color: var(--ink);
          font: inherit;
          text-align: left;
          transition: border-color 0.18s ease, background 0.18s ease;
        }
        .hs-theme:hover {
          background: var(--surface-alt);
        }
        .hs-theme.is-active {
          border-color: var(--accent);
          background: var(--accent-soft);
        }
        .hs-theme-swatch {
          width: 24px;
          height: 24px;
          border-radius: 999px;
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
          flex-shrink: 0;
        }
        .hs-theme-name {
          font-size: 13px;
          font-weight: 600;
        }

        .hs-fonts {
          display: grid;
          /* 모바일은 1열, 가로 폭 600px 이상일 땐 2열로 자동 분할.
             폰트 8종이 한 화면에 시원하게 들어오도록. */
          grid-template-columns: 1fr;
          gap: 8px;
        }
        @media (min-width: 600px) {
          .hs-fonts {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        .hs-font {
          display: grid;
          grid-template-columns: 56px 1fr;
          align-items: baseline;
          gap: 14px;
          padding: 13px 16px;
          border-radius: 12px;
          background: transparent;
          border: 1px solid var(--line);
          cursor: pointer;
          color: var(--ink);
          font: inherit;
          text-align: left;
          transition: border-color 0.18s ease, background 0.18s ease;
        }
        .hs-font:hover {
          background: var(--surface-alt);
        }
        .hs-font.is-active {
          border-color: var(--accent);
          background: var(--accent-soft);
        }
        .hs-font-name {
          font-size: 13px;
          font-weight: 700;
          color: var(--ink);
        }
        .hs-font-sample {
          font-size: 18px;
          color: var(--ink);
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .hs-grid-4 {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }
        .hs-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 84px;
          padding: 12px 6px;
          border-radius: 12px;
          background: transparent;
          border: 1px solid var(--line);
          color: var(--ink-soft);
          cursor: pointer;
          font: inherit;
          transition: border-color 0.18s ease, background 0.18s ease,
            color 0.18s ease;
        }
        .hs-card:hover {
          background: var(--surface-alt);
          color: var(--ink);
        }
        .hs-card.is-active {
          border-color: var(--accent);
          background: var(--accent-soft);
          color: var(--ink);
        }
        .hs-card--tall {
          min-height: 94px;
        }
        .hs-card-label {
          font-size: 11.5px;
          font-weight: 600;
        }
        .hs-card-glyph {
          font-weight: 700;
          color: var(--ink);
          line-height: 1;
        }
        .hs-card-stack {
          display: flex;
          flex-direction: column;
          width: 44px;
          align-items: stretch;
        }
        .hs-card-stack > span {
          display: block;
          height: 3px;
          background: var(--ink-soft);
          border-radius: 2px;
        }
        .hs-card-lines {
          font-size: 12px;
          color: var(--ink);
          font-weight: 600;
          text-align: center;
          word-break: keep-all;
        }
        .hs-card-speed {
          font-size: 18px;
          font-weight: 700;
          color: var(--ink);
          font-variant-numeric: tabular-nums;
        }

        .hs-footer-note {
          margin: 10px 4px 0;
          padding: 0 4px;
          font-size: 11.5px;
          color: var(--ink-mute);
          text-align: center;
          line-height: 1.55;
        }

        @media (max-width: 480px) {
          .hs-grid-4 {
            gap: 6px;
          }
          .hs-card {
            min-height: 74px;
            padding: 10px 4px;
          }
          .hs-card--tall {
            min-height: 86px;
          }
          .hs-card-label {
            font-size: 11px;
          }
          .hs-font {
            grid-template-columns: 52px 1fr;
            gap: 10px;
            padding: 12px 14px;
          }
          .hs-font-sample {
            font-size: 16px;
          }
        }

        /* ═══════════════════════════════════════════════════════════════
           태블릿 세로 (≥640px, 2단 전): 단일 컬럼을 살짝 넓혀 양옆 여백 보정.
           모바일(<640)은 위 기본값 그대로라 영향 없음.
           ═══════════════════════════════════════════════════════════════ */
        @media (min-width: 640px) and (max-width: 959.98px) {
          .hs-list {
            max-width: 680px;
            padding-top: 24px;
          }
        }

        /* ═══════════════════════════════════════════════════════════════
           태블릿 가로 / PC (≥960px): 2단 레이아웃.
           좌측 = 설정 리스트, 우측 = 항상 보이는 sticky 미리보기.
           아코디언 안 인라인 미리보기는 숨기고 우측 패널 하나로 통합.
           ═══════════════════════════════════════════════════════════════ */
        @media (min-width: 960px) {
          /* 메인 읽기 화면과 동일 구도:
             왼쪽 = 큰 성경 본문(라이브 미리보기), 오른쪽 = 작은 설정 바.
             DOM 순서(list → side)는 유지하고 order 로만 위치를 스왑해
             모바일 단일 컬럼 흐름에는 영향이 없게 한다. */
          /* 메인 읽기 페이지(.brp-canvas)의 캔버스 기하를 그대로 복제:
             동일한 좌우 패딩 / 캔버스 max-width / 사이드 폭(300px) / column-gap(32px)
             → 왼쪽 미리보기 컬럼 폭 = 메인 reader 컬럼 폭 → 줄바꿈이 메인과 동일.
             (메인 ≥960: minmax(0,1fr) 300px, gap 32, max 1300, hpad clamp(16,2vw,24)) */
          .hs-shell {
            display: grid;
            /* 사이드는 메인(300)보다 살짝 좁게(284) → 왼쪽(미리보기) 컬럼이 메인
               reader 보다 약간 넓어, 고정폭(=메인 reader 실측폭) 카드가 줄어들지 않고
               그대로 들어간다. */
            grid-template-columns: minmax(0, 1fr) 284px;
            column-gap: 32px;
            align-items: start;
            max-width: 1300px;
            margin: 0 auto;
            padding: 24px clamp(16px, 2vw, 24px) 0;
          }
          /* 설정 바 = 오른쪽(작은 컬럼). 메인 사이드처럼 약간 더 길게(여유 패딩). */
          .hs-list {
            order: 1;
            max-width: none;
            margin: 0;
            padding: 0;
            gap: 14px;
          }
          .hs-list :global(.hs-acc-head) {
            padding-top: 20px;
            padding-bottom: 20px;
          }
          .hs-toggle-row {
            padding-top: 20px;
            padding-bottom: 20px;
          }
          /* 인라인 미리보기 숨김 — 왼쪽 큰 패널이 대체 */
          .hs-inline-preview {
            display: none;
          }
          /* 성경 본문 미리보기 = 왼쪽(큰 컬럼). 설정을 만지는 동안 항상 보이도록 sticky. */
          .hs-side {
            order: 0;
            display: block;
            position: sticky;
            top: 80px;
          }
          /* 사이드 카드 chrome 제거 — 미리보기 카드(.rp-card)가 곧 메인 읽기 카드. */
          .hs-side-card {
            background: transparent;
            border: 0;
            border-radius: 0;
            padding: 0;
            box-shadow: none;
          }
          .hs-side-tag {
            margin: 0 0 10px;
            padding-left: 2px;
            font-size: 11px;
            letter-spacing: 0.16em;
            text-transform: uppercase;
            font-weight: 700;
            color: var(--ink-mute);
          }
          .hs-footer-note {
            text-align: left;
            margin-left: 0;
            margin-right: 0;
          }
        }

        /* 대형 PC (≥1200px) — 메인 .brp-canvas(≥1200) 와 동일 기하 복제:
           minmax(0,940px) 460px, column-gap 60, max 1460, hpad clamp(20,2vw,32)
           → 미리보기 reader 폭이 메인과 동일(최대 940px) 유지. */
        @media (min-width: 1200px) {
          .hs-shell {
            /* 사이드는 메인(460)보다 살짝 좁게(440) → 위와 동일한 이유(슬랙 확보). */
            grid-template-columns: minmax(0, 960px) 440px;
            column-gap: 60px;
            max-width: 1460px;
            padding: 24px clamp(20px, 2vw, 32px) 0;
          }
        }
      `}</style>
    </main>
  );
}

// =============================================================================
// 아코디언 — 헤더(제목 + 현재값 + 셰브론) 를 누르면 패널이 책처럼 펼쳐진다.
// =============================================================================
function Accordion({
  open,
  onToggle,
  title,
  value,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <section className={`hs-acc ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="hs-acc-head"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="hs-acc-title">{title}</span>
        <span className="hs-acc-right">
          <span className="hs-acc-value">{value}</span>
          <svg
            className="hs-acc-chevron"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>
      <div className="hs-acc-panel">
        <div className="hs-acc-panel-inner">
          <div className="hs-acc-pad">{children}</div>
        </div>
      </div>

      <style jsx>{`
        .hs-acc {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 14px;
          overflow: hidden;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .hs-acc.is-open {
          border-color: var(--line-strong);
          box-shadow: var(--shadow-1);
        }
        .hs-acc-head {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 16px 18px;
          background: transparent;
          border: 0;
          cursor: pointer;
          font: inherit;
          color: var(--ink);
          text-align: left;
          transition: background 0.16s ease;
        }
        .hs-acc-head:hover {
          background: var(--surface-alt);
        }
        .hs-acc-title {
          font-size: 15px;
          font-weight: 700;
          letter-spacing: -0.005em;
          color: var(--ink);
        }
        .hs-acc-right {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .hs-acc-value {
          font-size: 13px;
          font-weight: 600;
          color: var(--accent);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 46vw;
        }
        .hs-acc-chevron {
          color: var(--ink-mute);
          flex-shrink: 0;
          transition: transform 0.26s cubic-bezier(0.32, 0.72, 0.24, 1);
        }
        .hs-acc.is-open .hs-acc-chevron {
          transform: rotate(180deg);
          color: var(--accent);
        }
        .hs-acc-panel {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 0.3s cubic-bezier(0.32, 0.72, 0.24, 1);
        }
        .hs-acc.is-open .hs-acc-panel {
          grid-template-rows: 1fr;
        }
        .hs-acc-panel-inner {
          overflow: hidden;
          min-height: 0;
        }
        .hs-acc-pad {
          padding: 0 18px 18px;
        }
        @media (prefers-reduced-motion: reduce) {
          .hs-acc-panel,
          .hs-acc-chevron {
            transition: none;
          }
        }
      `}</style>
    </section>
  );
}

// =============================================================================
// 실제 읽기 화면 미리보기 — 자체 <style jsx> 를 가진 독립 컴포넌트.
//   (이전엔 부모에서 const 로 만든 JSX 를 children 으로 넘겨 styled-jsx 스코프가
//    안 붙는 버그가 있었음 → 폰트/크기/간격/그리드가 통째로 미적용.)
//   사용자 설정 CSS 변수(--reader-*) + 테마 --accent 를 그대로 소비하므로,
//   위에서 옵션을 바꾸면 이 카드가 즉시 변한다.
// =============================================================================
function ReaderPreview({ bare = false }: { bare?: boolean }) {
  // 사이드(bare) 미리보기는 메인 읽기 화면(.brp-reader)의 실제 렌더 폭을
  // localStorage 에서 읽어 그대로 적용 → 폰트/배수/그리드와 합쳐져 줄바꿈이
  // 메인과 1:1 로 동일해진다. (읽기 페이지가 폭을 저장해 둠)
  const [readerW, setReaderW] = useState<number | null>(null);
  useEffect(() => {
    if (!bare || typeof window === "undefined") return;
    const read = () => {
      const v = Number(window.localStorage.getItem("haruchi:reader-width"));
      setReaderW(Number.isFinite(v) && v > 0 ? v : null);
    };
    read();
    window.addEventListener("focus", read);
    document.addEventListener("visibilitychange", read);
    return () => {
      window.removeEventListener("focus", read);
      document.removeEventListener("visibilitychange", read);
    };
  }, [bare]);

  const cardStyle: CSSProperties | undefined =
    bare && readerW ? { width: `${readerW}px`, maxWidth: "100%" } : undefined;

  return (
    <div className={`rp ${bare ? "rp--bare" : ""}`}>
      <span className="rp-tag">이렇게 보여요</span>
      <div className="rp-card" style={cardStyle}>
        <p className="rp-title">창세기 제 1장</p>
        <div className="rp-body">
          <div className="rp-verse">
            <span className="rp-num">1</span>
            <p className="rp-text">
              맨 처음에 하나님이 하늘과 땅을 만드셨어요.
            </p>
          </div>
          <div className="rp-verse rp-verse--read">
            <span className="rp-num">2</span>
            <p className="rp-text">
              땅은 아직 아무 모양도 없이 텅 비어 있었고, 깊은 물 위는 어둠이 덮고 있었어요. 그리고 하나님의 영이 물 위에 움직이고 계셨어요.
            </p>
          </div>
          {/* 아래 절들은 사이드(bare) 미리보기에서만 보여서 더 길게 채운다.
              모바일 인라인 미리보기엔 display:none (높이 그대로 유지). */}
          <div className="rp-verse rp-extra">
            <span className="rp-num">3</span>
            <p className="rp-text">
              하나님이 “빛이 생겨라” 하고 말씀하시자, 빛이 생겼어요.
            </p>
          </div>
          <div className="rp-verse rp-extra">
            <span className="rp-num">4</span>
            <p className="rp-text">
              하나님이 보시니 그 빛이 참 좋았어요. 그래서 하나님은 빛과 어둠을 나누셨어요.
            </p>
          </div>
          <div className="rp-verse rp-extra">
            <span className="rp-num">5</span>
            <p className="rp-text">
              하나님은 빛을 “낮”이라고 부르시고, 어둠을 “밤”이라고 부르셨어요. 저녁이 지나고 아침이 되니, 이것이 첫째 날이에요.
            </p>
          </div>
        </div>

        {/* 테마 색상 데모 — 진행바 + 스위치(켜짐) + 버튼이 모두 --accent 를 따름. */}
        <div className="rp-demo">
          <span className="rp-track" aria-hidden="true">
            <span className="rp-fill" />
          </span>
          <span className="rp-toggle" aria-hidden="true">
            <span className="rp-knob" />
          </span>
          <span className="rp-btn">다 읽었어요</span>
        </div>
      </div>

      <style jsx>{`
        .rp {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px dashed var(--line);
        }
        /* 추가 절(3~5)은 기본 숨김 → 사이드 미리보기에서만 노출해 길이를 늘림. */
        .rp-extra {
          display: none;
        }
        /* 사이드 패널용 — 위 점선/태그 없이 카드 안에 단독으로, 더 크고 길게. */
        .rp--bare {
          margin-top: 0;
          padding-top: 0;
          border-top: none;
        }
        .rp--bare .rp-tag {
          display: none;
        }
        .rp--bare .rp-extra {
          display: grid;
        }
        /* 사이드(왼쪽) 카드 = 메인 읽기 카드(.brp-reader)와 100% 동일하게:
           배경/테두리/반경 + ≥960 reader 패딩. 폭은 그리드 컬럼이 결정(아래 미디어쿼리에서
           메인 캔버스와 동일한 컬럼 폭을 부여) → 줄바꿈이 메인과 일치. */
        .rp--bare .rp-card {
          max-width: none;
          margin: 0;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-lg);
          overflow: hidden;
          padding: clamp(28px, 3vw, 36px) clamp(22px, 2.5vw, 32px);
        }
        .rp--bare .rp-title {
          font-size: 22px;
          margin-bottom: 18px;
        }
        .rp--bare .rp-demo {
          margin-top: 22px;
          padding-top: 18px;
          border-top: 1px solid var(--line);
        }
        .rp-tag {
          display: inline-block;
          margin-bottom: 10px;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          font-weight: 700;
          color: var(--accent);
        }
        .rp-card {
          box-sizing: border-box;
          background: var(--bg);
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 16px 18px;
        }
        .rp-title {
          margin: 0 0 12px;
          font-family: var(--font-noto-serif-kr), "Nanum Myeongjo", serif;
          font-size: 18px;
          font-weight: 500;
          letter-spacing: -0.015em;
          color: var(--ink);
        }
        /* 본문 — 사용자 폰트 적용 */
        .rp-body {
          font-family: var(--reader-font-family, inherit);
        }
        /* 메인 .brp-verse 와 1:1 동일(컬럼/간격/폰트 공식) → 줄바꿈 일치 */
        .rp-verse {
          display: grid;
          grid-template-columns: 2em minmax(0, 1fr);
          column-gap: clamp(8px, 1vw, 12px);
          align-items: baseline;
          margin: 0 0 var(--reader-verse-gap, 10px);
          padding: 2px 0;
          font-size: calc(clamp(16px, 1.6vw, 19px) * var(--reader-size-scale, 1));
          line-height: var(--reader-text-line-height, 1.55);
          font-weight: 400;
          color: var(--ink);
          word-break: keep-all;
          overflow-wrap: normal;
        }
        .rp-verse:last-child {
          margin-bottom: 0;
        }
        /* 읽은 절 — 읽기 화면과 동일하게 웜 강조 */
        .rp-verse--read {
          color: var(--accent-warm);
        }
        .rp-num {
          color: var(--ink-mute);
          text-align: center;
          font-size: 1em;
          font-variant-numeric: tabular-nums;
        }
        .rp-verse--read .rp-num {
          color: var(--accent-warm);
          opacity: 0.75;
        }
        .rp-text {
          margin: 0;
          min-width: 0;
          overflow-wrap: break-word;
        }
        .rp-demo {
          margin-top: 16px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .rp-track {
          position: relative;
          flex: 1;
          min-width: 0;
          height: 6px;
          border-radius: 999px;
          background: var(--surface-alt);
          overflow: hidden;
        }
        .rp-fill {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 62%;
          border-radius: 999px;
          background: var(--accent);
        }
        .rp-toggle {
          position: relative;
          width: 38px;
          height: 22px;
          border-radius: 999px;
          background: var(--accent);
          flex-shrink: 0;
        }
        .rp-knob {
          position: absolute;
          top: 2px;
          left: 18px;
          width: 18px;
          height: 18px;
          border-radius: 999px;
          background: #fff;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
        }
        .rp-btn {
          flex-shrink: 0;
          padding: 7px 14px;
          border-radius: 999px;
          background: var(--accent);
          color: var(--accent-ink);
          font-size: 12.5px;
          font-weight: 600;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
