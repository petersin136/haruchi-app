import type { Metadata, Viewport } from "next";
import {
  Noto_Sans_KR,
  Noto_Serif_KR,
  Jua,
  Gaegu,
  Gamja_Flower,
  Do_Hyeon,
  Gothic_A1,
  Nanum_Pen_Script,
} from "next/font/google";
import "./globals.css";
import { SettingsProvider } from "./components/SettingsProvider";
import { SETTINGS_INIT_SCRIPT } from "./lib/userSettings";

// =============================================================================
// 폰트 — next/font/google 로 빌드 타임에 다운로드 + 같은 출처(/_next/static)에서
// 서빙. 외부 CDN(googlefonts/jsdelivr) 의존성을 제거해 모바일 통신망/ISP 차단·
// 지연으로 폰트가 안 뜨는 문제를 근본적으로 차단.
//
//   본문 폰트(reader) 라인업:
//     --font-noto-sans-kr  : 기본    — 모던 산세리프 (Noto Sans KR)
//     --font-noto-serif-kr : 명조    — 전통 세리프 (Noto Serif KR) + 워드마크 한글
//     --font-jua           : 둥근    — 굵직한 캐릭터 손글씨 (Jua)
//     --font-gothic-a1     : 모던    — 본문 가독성 좋은 산세리프 (Gothic A1)
//     --font-do-hyeon      : 도톰    — 둥글고 두꺼운 친근한 디스플레이 (Do Hyeon)
//     --font-gaegu         : 어린이  — 어린이 손글씨 톤 (Gaegu)
//     --font-gamja-flower  : 동화    — 동글동글 동화책 손글씨 (Gamja Flower)
//     --font-nanum-pen     : 펜글씨  — 마커펜 손글씨 (Nanum Pen Script)
//
// preload 는 첫 페인트에서 거의 확실히 보이는 "기본"(Noto Sans KR) 만 true.
// 나머지는 사용자가 해당 폰트를 고른 시점에 lazy-load (불필요한 초기 트래픽 방지).
// =============================================================================
const notoSansKR = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-noto-sans-kr",
  display: "swap",
  preload: true,
});

const notoSerifKR = Noto_Serif_KR({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-serif-kr",
  display: "swap",
  preload: false,
});

const jua = Jua({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-jua",
  display: "swap",
  preload: false,
});

// 모던 산세리프 — 본문 가독성 최적, 디자이너들이 자주 쓰는 깔끔한 그로테스크 톤.
const gothicA1 = Gothic_A1({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-gothic-a1",
  display: "swap",
  preload: false,
});

// 도톰하게 둥근 디스플레이 — 어린이/학습 콘텐츠에 따뜻한 인상.
const doHyeon = Do_Hyeon({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-do-hyeon",
  display: "swap",
  preload: false,
});

// 가는 어린이 손글씨 — 일기장 톤. 따뜻하고 친근함.
const gaegu = Gaegu({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  variable: "--font-gaegu",
  display: "swap",
  preload: false,
});

// 동글동글한 동화책 손글씨 — 가장 어린이 같은 톤.
const gamjaFlower = Gamja_Flower({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-gamja-flower",
  display: "swap",
  preload: false,
});

// 굵은 마커펜 손글씨 — 디자이너들이 짧은 본문/포인트 텍스트로 즐겨 사용.
const nanumPen = Nanum_Pen_Script({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-nanum-pen",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "하루치",
  description: "아이들이 하루 한 장씩 성경을 읽고 진도를 기록할 수 있는 웹앱",
  applicationName: "하루치",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
      { url: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.svg", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "하루치",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f6f3",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ko"
      className={[
        notoSansKR.variable,
        notoSerifKR.variable,
        jua.variable,
        gothicA1.variable,
        doHyeon.variable,
        gaegu.variable,
        gamjaFlower.variable,
        nanumPen.variable,
      ].join(" ")}
    >
      <head>
        {/* 사용자 설정(테마/다크모드/폰트/줄간격…)을 hydration 이전에 <html> 에
            CSS 변수로 박아넣어 초기 페인트의 깜빡임(FOUC) 을 막는다.
            localStorage 가 없거나 파싱이 실패해도 안전한 기본값으로 폴백. */}
        <script
          dangerouslySetInnerHTML={{ __html: SETTINGS_INIT_SCRIPT }}
        />

        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="하루치" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.svg" />
      </head>
      <body>
        <SettingsProvider>{children}</SettingsProvider>
      </body>
    </html>
  );
}
