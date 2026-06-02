// =============================================================================
// 사용자 환경설정 (User Settings) — 단일 출처(source of truth).
//
//  - 본문 폰트 패밀리, 글자 크기, 절 간격, 줄간격
//  - 테마 색상 (4종)
//  - 다크 모드
//  - 스크롤 읽기 속도 (장당 최소 시간 배수)
//
//  모든 값은 localStorage 에 저장 + DOM(<html>) 의 CSS 변수/속성으로 반영된다.
//  SSR 후 hydration 이전에도 적용되도록 layout.tsx 에서 INIT_SCRIPT 를
//  <head> 에 인라인으로 주입(FOUC/플리커 방지).
// =============================================================================

export type ThemeKey = "green" | "blue" | "warm" | "purple";
export type FontKey = "sans" | "serif" | "gothic";
export type FontSizeKey = "sm" | "md" | "lg" | "xl";
export type SpacingKey = "tight" | "normal" | "relaxed" | "loose";
export type ScrollSpeedKey = "fast" | "normal" | "slow" | "slowest";

export type UserSettings = {
  theme: ThemeKey;
  font: FontKey;
  fontSize: FontSizeKey;
  /** 절(verse) 사이의 세로 간격 */
  verseGap: SpacingKey;
  /** 절 안 텍스트의 줄간격 */
  textLineHeight: SpacingKey;
  /** 스크롤 모드의 "최소 읽기 시간" 배수. 클수록 천천히. */
  scrollSpeed: ScrollSpeedKey;
  /** 다크 모드 on/off */
  darkMode: boolean;
};

export const DEFAULT_SETTINGS: UserSettings = {
  theme: "green",
  font: "sans",
  fontSize: "md",
  verseGap: "normal",
  textLineHeight: "normal",
  scrollSpeed: "normal",
  darkMode: false,
};

// -----------------------------------------------------------------------------
// 테마 — 라이트 모드용 4가지 색상 프리셋.
// 다크 모드일 땐 동일 accent 위에 별도의 accent-soft(틴트) 만 어둡게 덮어쓴다.
// -----------------------------------------------------------------------------
type ThemePreset = {
  label: string;
  accent: string;
  accentHover: string;
  accentSoft: string;
  /** 다크 모드용 accent-soft (배경 위 옅은 틴트) */
  accentSoftDark: string;
};

export const THEME_PRESETS: Record<ThemeKey, ThemePreset> = {
  green: {
    label: "딥 그린",
    accent: "#2E5D4B",
    accentHover: "#244B3C",
    accentSoft: "#EAF1ED",
    accentSoftDark: "rgba(74, 145, 117, 0.18)",
  },
  blue: {
    label: "오션 블루",
    accent: "#1F4E79",
    accentHover: "#163A5E",
    accentSoft: "#E6EEF7",
    accentSoftDark: "rgba(91, 145, 207, 0.20)",
  },
  warm: {
    label: "테라코타",
    accent: "#B05A37",
    accentHover: "#8C4221",
    accentSoft: "#F8ECE3",
    accentSoftDark: "rgba(212, 137, 100, 0.22)",
  },
  purple: {
    label: "플럼",
    accent: "#5B4A8C",
    accentHover: "#473776",
    accentSoft: "#ECE7F5",
    accentSoftDark: "rgba(155, 132, 219, 0.22)",
  },
};

// -----------------------------------------------------------------------------
// 폰트 패밀리 — 본문(reader) 에만 적용.
//
// 폰트는 next/font/google 로 빌드 타임에 다운로드되어 같은 도메인(/_next/static)
// 에서 서빙된다 (외부 CDN 의존성 0). <html> 에는 다음 CSS 변수가 부착됨:
//   --font-noto-sans-kr  → "기본" (sans)
//   --font-noto-serif-kr → "명조" (serif)
//   --font-jua           → "둥근" (gothic)
//
// 각 변수는 next/font 가 만든 `__NotoSansKR_xxx, __NotoSansKR_Fallback_xxx`
// 형태의 익명 font-family 문자열로 확장된다. 시스템에 Pretendard 가 있는 PC 든
// 아무것도 깔려있지 않은 모바일이든 동일하게 자체 호스팅된 폰트가 적용된다.
// -----------------------------------------------------------------------------
export const FONT_FAMILIES: Record<
  FontKey,
  { label: string; family: string; sample: string }
> = {
  // 세 폰트는 서로 확연히 달라야 한다 (모던 산세리프 / 전통 명조 / 둥근 손글씨톤).
  sans: {
    label: "기본",
    family:
      'var(--font-noto-sans-kr), -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    sample: "본문 미리보기",
  },
  serif: {
    label: "명조",
    family:
      'var(--font-noto-serif-kr), "Nanum Myeongjo", "Apple SD Gothic Neo", serif',
    sample: "본문 미리보기",
  },
  // 기존 "gothic" 키는 유지(저장값 호환)하되, 둥근 손글씨 폰트(Jua)로 교체해
  // 세 폰트의 차이가 한눈에 보이도록 함.
  gothic: {
    label: "둥근",
    family:
      'var(--font-jua), var(--font-noto-sans-kr), sans-serif',
    sample: "본문 미리보기",
  },
};

// -----------------------------------------------------------------------------
// 스케일 매핑 — 모두 CSS 변수 값으로 출력된다.
// -----------------------------------------------------------------------------

/** 본문 font-size 에 곱해지는 스칼라. (기본 16~19px clamp 에 × scale) */
export const FONT_SIZE_SCALE: Record<FontSizeKey, number> = {
  sm: 0.875,
  md: 1,
  lg: 1.15,
  xl: 1.32,
};

export const FONT_SIZE_LABELS: Record<FontSizeKey, string> = {
  sm: "작게",
  md: "보통",
  lg: "크게",
  xl: "아주 크게",
};

/** 절(verse) 사이의 margin-bottom (px). */
export const VERSE_GAP_PX: Record<SpacingKey, number> = {
  tight: 4,
  normal: 10,
  relaxed: 18,
  loose: 28,
};

/** 절 안 텍스트 line-height. */
export const TEXT_LINE_HEIGHT: Record<SpacingKey, number> = {
  tight: 1.4,
  normal: 1.55,
  relaxed: 1.8,
  loose: 2.05,
};

export const SPACING_LABELS: Record<SpacingKey, string> = {
  tight: "좁게",
  normal: "보통",
  relaxed: "넓게",
  loose: "더 넓게",
};

/** 스크롤 모드 최소 읽기 시간(seconds/verse) 배수. 클수록 천천히. */
export const SCROLL_SPEED_MULTIPLIER: Record<ScrollSpeedKey, number> = {
  fast: 0.5,
  normal: 1,
  slow: 1.6,
  slowest: 2.4,
};

export const SCROLL_SPEED_LABELS: Record<ScrollSpeedKey, string> = {
  fast: "빠르게",
  normal: "보통",
  slow: "느리게",
  slowest: "아주 느리게",
};

// -----------------------------------------------------------------------------
// 다크 모드 색상 — 라이트 모드 :root 변수를 1:1 로 덮어쓴다.
// -----------------------------------------------------------------------------
export const DARK_PALETTE = {
  bg: "#14141A",
  surface: "#1B1B22",
  surfaceAlt: "#25252E",
  ink: "#F2F2EE",
  inkSoft: "#B5B5BC",
  inkMute: "#8B8B92",
  inkFaint: "#6B6B75",
  line: "#2E2E38",
  lineStrong: "#3D3D48",
  bgTranslucent: "rgba(20, 20, 26, 0.85)",
  surfaceTranslucent: "rgba(31, 31, 38, 0.92)",
};

export const LIGHT_PALETTE = {
  bg: "#FAFAF8",
  surface: "#FFFFFF",
  surfaceAlt: "#F4F4F0",
  ink: "#16161A",
  inkSoft: "#6B6B70",
  inkMute: "#9A9AA0",
  inkFaint: "#A0A0A6",
  line: "#E6E6E2",
  lineStrong: "#D2D2CC",
  bgTranslucent: "rgba(250, 250, 248, 0.85)",
  surfaceTranslucent: "rgba(255, 255, 255, 0.92)",
};

// -----------------------------------------------------------------------------
// localStorage IO
// -----------------------------------------------------------------------------
export const SETTINGS_STORAGE_KEY = "haruchi_user_settings_v1";

export function loadSettings(): UserSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(next: UserSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage 가 disable 된 환경이면 그냥 무시
  }
}

// -----------------------------------------------------------------------------
// DOM 반영 — <html> 의 CSS 변수 / data 속성을 설정.
//   - data-theme="dark" | "light"        : 다크 모드 토글
//   - data-theme-color="green|blue|..."  : 디버깅 시 가시성
//   - 모든 CSS 변수는 :root 에 set
// -----------------------------------------------------------------------------
export function applySettingsToDOM(s: UserSettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const theme = THEME_PRESETS[s.theme];
  const palette = s.darkMode ? DARK_PALETTE : LIGHT_PALETTE;

  // 다크 모드 / 테마 데이터 속성
  root.setAttribute("data-theme", s.darkMode ? "dark" : "light");
  root.setAttribute("data-theme-color", s.theme);

  // color-scheme — 네이티브 폼 컨트롤 톤을 모드에 맞춤
  root.style.setProperty("color-scheme", s.darkMode ? "dark" : "light");

  // 팔레트
  root.style.setProperty("--bg", palette.bg);
  root.style.setProperty("--surface", palette.surface);
  root.style.setProperty("--surface-alt", palette.surfaceAlt);
  root.style.setProperty("--ink", palette.ink);
  root.style.setProperty("--ink-soft", palette.inkSoft);
  root.style.setProperty("--ink-mute", palette.inkMute);
  root.style.setProperty("--ink-faint", palette.inkFaint);
  root.style.setProperty("--line", palette.line);
  root.style.setProperty("--line-strong", palette.lineStrong);
  root.style.setProperty("--bg-translucent", palette.bgTranslucent);
  root.style.setProperty("--surface-translucent", palette.surfaceTranslucent);

  // 테마 액센트
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--accent-hover", theme.accentHover);
  root.style.setProperty(
    "--accent-soft",
    s.darkMode ? theme.accentSoftDark : theme.accentSoft,
  );

  // 본문(reader) 폰트 / 크기 / 간격
  root.style.setProperty("--reader-font-family", FONT_FAMILIES[s.font].family);
  root.style.setProperty(
    "--reader-size-scale",
    String(FONT_SIZE_SCALE[s.fontSize]),
  );
  root.style.setProperty(
    "--reader-verse-gap",
    `${VERSE_GAP_PX[s.verseGap]}px`,
  );
  root.style.setProperty(
    "--reader-text-line-height",
    String(TEXT_LINE_HEIGHT[s.textLineHeight]),
  );

  // 스크롤 속도 배수
  root.style.setProperty(
    "--scroll-speed-multiplier",
    String(SCROLL_SPEED_MULTIPLIER[s.scrollSpeed]),
  );
}

// -----------------------------------------------------------------------------
// FOUC 방지용 인라인 스크립트 — layout.tsx <head> 에 그대로 박아넣음.
//   - localStorage 에서 설정을 읽어 <html> 에 적용
//   - JSON.parse 실패 / 키 없음 모두 안전하게 기본값으로 폴백
//   - 의존성 0, vanilla JS
// -----------------------------------------------------------------------------
export const SETTINGS_INIT_SCRIPT = `
(function(){
  try {
    var KEY = ${JSON.stringify(SETTINGS_STORAGE_KEY)};
    var DEFAULTS = ${JSON.stringify(DEFAULT_SETTINGS)};
    var THEMES = ${JSON.stringify(THEME_PRESETS)};
    var FONTS = ${JSON.stringify(FONT_FAMILIES)};
    var SIZE = ${JSON.stringify(FONT_SIZE_SCALE)};
    var GAP = ${JSON.stringify(VERSE_GAP_PX)};
    var LH = ${JSON.stringify(TEXT_LINE_HEIGHT)};
    var SPEED = ${JSON.stringify(SCROLL_SPEED_MULTIPLIER)};
    var LIGHT = ${JSON.stringify(LIGHT_PALETTE)};
    var DARK = ${JSON.stringify(DARK_PALETTE)};

    var raw = null;
    try { raw = window.localStorage.getItem(KEY); } catch(e){}
    var s = DEFAULTS;
    if (raw) {
      try {
        var p = JSON.parse(raw);
        if (p && typeof p === "object") {
          s = Object.assign({}, DEFAULTS, p);
        }
      } catch(e){}
    }

    var root = document.documentElement;
    var theme = THEMES[s.theme] || THEMES.green;
    var pal = s.darkMode ? DARK : LIGHT;

    root.setAttribute("data-theme", s.darkMode ? "dark" : "light");
    root.setAttribute("data-theme-color", s.theme);
    root.style.setProperty("color-scheme", s.darkMode ? "dark" : "light");

    root.style.setProperty("--bg", pal.bg);
    root.style.setProperty("--surface", pal.surface);
    root.style.setProperty("--surface-alt", pal.surfaceAlt);
    root.style.setProperty("--ink", pal.ink);
    root.style.setProperty("--ink-soft", pal.inkSoft);
    root.style.setProperty("--ink-mute", pal.inkMute);
    root.style.setProperty("--ink-faint", pal.inkFaint);
    root.style.setProperty("--line", pal.line);
    root.style.setProperty("--line-strong", pal.lineStrong);
    root.style.setProperty("--bg-translucent", pal.bgTranslucent);
    root.style.setProperty("--surface-translucent", pal.surfaceTranslucent);

    root.style.setProperty("--accent", theme.accent);
    root.style.setProperty("--accent-hover", theme.accentHover);
    root.style.setProperty("--accent-soft", s.darkMode ? theme.accentSoftDark : theme.accentSoft);

    var fontDef = FONTS[s.font] || FONTS.sans;
    root.style.setProperty("--reader-font-family", fontDef.family);
    root.style.setProperty("--reader-size-scale", String(SIZE[s.fontSize] || 1));
    root.style.setProperty("--reader-verse-gap", (GAP[s.verseGap] || 10) + "px");
    root.style.setProperty("--reader-text-line-height", String(LH[s.textLineHeight] || 1.55));
    root.style.setProperty("--scroll-speed-multiplier", String(SPEED[s.scrollSpeed] || 1));
  } catch(e){}
})();
`.trim();
