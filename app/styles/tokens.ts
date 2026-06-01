// =============================================================================
// 디자인 토큰 (v1) — 앱 전체에서 참조하는 단일 출처(source of truth).
//
// 사용 원칙:
//   - 컴포넌트의 styled-jsx 안에서는 `var(--xxx)` 로 참조.
//   - TS 측에서 raw 값이 필요하면 아래 `tokens` 객체를 import.
//   - CSS 변수는 globals.css 의 :root 에 선언되어 있고, 본 파일 값과 1:1 일치시킴.
//     ⚠️ 둘 중 하나를 바꿀 땐 반드시 다른 쪽도 같이 갱신할 것.
// =============================================================================

export const tokens = {
  color: {
    // 배경/표면
    bg: "#FAFAF8",          // 따뜻한 화이트 — 페이지 배경
    surface: "#FFFFFF",     // 카드/패널
    surfaceAlt: "#F4F4F0",  // 옅게 강조된 표면 (입력 그룹 등)

    // 텍스트
    ink: "#16161A",         // 본문, 거의 검정
    inkSoft: "#6B6B70",     // 보조 텍스트
    inkMute: "#9A9AA0",     // 더 약한 보조 텍스트 / 옅은 라인 대체
    inkFaint: "#A0A0A6",    // placeholder/disabled

    // 라인
    line: "#E6E6E2",        // 옅은 경계
    lineStrong: "#D2D2CC",  // 약간 진한 경계

    // 포인트 — 절제된 딥 그린. 형광 X. 강조는 딱 정해진 3곳에만.
    accent: "#2E5D4B",
    accentHover: "#244B3C",
    accentSoft: "#EAF1ED",  // 옅은 틴트 (배지/배경)
    accentInk: "#FFFFFF",   // accent 위 텍스트
    // 보조 편집 강조 — 부제목/캡션 등 따뜻한 포인트 텍스트에만 한정 사용.
    accentWarm: "#C2453E",
    // 따뜻한 골드(머스타드 톤) — 미니바 등 절제된 포인트에만.
    accentGold: "#B58A2A",

    // 상태
    danger: "#D64545",
    dangerSoft: "#FBEDED",
    success: "#1B9F66",
    successSoft: "#E5F4ED",
  },

  type: {
    family:
      '"Pretendard Variable", Pretendard, "Noto Sans KR", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    // 크기/굵기/leading/tracking — Apple Human Interface 풍의 절제된 스케일.
    display: { size: 40, weight: 700, leading: 1.15, tracking: "-0.02em" },
    h1:      { size: 28, weight: 700, leading: 1.2,  tracking: "-0.015em" },
    h2:      { size: 20, weight: 700, leading: 1.3,  tracking: "-0.01em" },
    body:    { size: 16, weight: 400, leading: 1.6,  tracking: "0" },
    small:   { size: 14, weight: 400, leading: 1.55, tracking: "0" },
    caption: { size: 13, weight: 500, leading: 1.5,  tracking: "0" },
  },

  // 간격 스케일: 4의 배수.
  space: {
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 24,
    6: 32,
    7: 48,
  },

  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    pill: 999,
  },

  // 그림자는 거의 안 씀. 옅은 1단계와, 모달용 2단계만.
  shadow: {
    none: "none",
    "1": "0 1px 2px rgba(22, 22, 26, 0.04)",
    "2": "0 6px 24px rgba(22, 22, 26, 0.08)",
  },

  // 폼 컨트롤 표준치 — 터치 친화 48px.
  control: {
    height: 48,
    padX: 16,
    // 버튼은 인풋과 동일 높이에 좌우 패딩만 더 넓게.
    buttonPadX: 20,
  },
} as const;

// CSS :root 변수 블록. globals.css 와 동일하게 유지해야 함(주석 참고).
// 필요 시 빌드 스크립트로 globals.css 를 생성하도록 확장할 수 있음.
export const cssRootVars = `
:root {
  /* color */
  --bg: ${tokens.color.bg};
  --surface: ${tokens.color.surface};
  --surface-alt: ${tokens.color.surfaceAlt};
  --ink: ${tokens.color.ink};
  --ink-soft: ${tokens.color.inkSoft};
  --ink-mute: ${tokens.color.inkMute};
  --ink-faint: ${tokens.color.inkFaint};
  --line: ${tokens.color.line};
  --line-strong: ${tokens.color.lineStrong};
  --accent: ${tokens.color.accent};
  --accent-hover: ${tokens.color.accentHover};
  --accent-soft: ${tokens.color.accentSoft};
  --accent-ink: ${tokens.color.accentInk};
  --accent-warm: ${tokens.color.accentWarm};
  --accent-gold: ${tokens.color.accentGold};
  --danger: ${tokens.color.danger};
  --danger-soft: ${tokens.color.dangerSoft};
  --success: ${tokens.color.success};
  --success-soft: ${tokens.color.successSoft};

  /* spacing */
  --space-1: ${tokens.space[1]}px;
  --space-2: ${tokens.space[2]}px;
  --space-3: ${tokens.space[3]}px;
  --space-4: ${tokens.space[4]}px;
  --space-5: ${tokens.space[5]}px;
  --space-6: ${tokens.space[6]}px;
  --space-7: ${tokens.space[7]}px;

  /* radius */
  --radius-sm: ${tokens.radius.sm}px;
  --radius-md: ${tokens.radius.md}px;
  --radius-lg: ${tokens.radius.lg}px;
  --radius-pill: ${tokens.radius.pill}px;

  /* shadow */
  --shadow-1: ${tokens.shadow[1]};
  --shadow-2: ${tokens.shadow[2]};

  /* control */
  --ctrl-h: ${tokens.control.height}px;
  --ctrl-px: ${tokens.control.padX}px;
  --btn-px: ${tokens.control.buttonPadX}px;
}
`.trim();

export type Tokens = typeof tokens;
