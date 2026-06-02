import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR, Noto_Serif_KR, Jua } from "next/font/google";
import "./globals.css";
import { SettingsProvider } from "./components/SettingsProvider";
import { SETTINGS_INIT_SCRIPT } from "./lib/userSettings";

// =============================================================================
// 폰트 — next/font/google 로 빌드 타임에 다운로드 + 같은 출처(/ _next/static)에서
// 서빙. 외부 CDN(googlefonts/jsdelivr) 의존성을 제거해 모바일 통신망/ISP 차단·
// 지연으로 폰트가 안 뜨는 문제를 근본적으로 차단.
//
//   - --font-noto-sans-kr : 본문 "기본"
//   - --font-noto-serif-kr: 본문 "명조" + 워드마크 한글
//   - --font-jua          : 본문 "둥근"
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
  // 워드마크/명조 본문에서만 쓰여 페이지 로딩 시점 우선순위가 낮음 → preload off.
  preload: false,
});

const jua = Jua({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-jua",
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
      className={`${notoSansKR.variable} ${notoSerifKR.variable} ${jua.variable}`}
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
