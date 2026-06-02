import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SettingsProvider } from "./components/SettingsProvider";
import { SETTINGS_INIT_SCRIPT } from "./lib/userSettings";

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
    <html lang="ko">
      <head>
        {/* 사용자 설정(테마/다크모드/폰트/줄간격…)을 hydration 이전에 <html> 에
            CSS 변수로 박아넣어 초기 페인트의 깜빡임(FOUC) 을 막는다.
            localStorage 가 없거나 파싱이 실패해도 안전한 기본값으로 폴백. */}
        <script
          dangerouslySetInnerHTML={{ __html: SETTINGS_INIT_SCRIPT }}
        />
        {/* Noto Sans KR (Google Fonts) — 시스템에 Pretendard가 없을 때를 위한 fallback */}
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        {/* Noto Sans KR(기본 fallback) + Noto Serif KR(명조) + Jua(둥근) —
            설정의 본문 폰트 3종에 대응. 본문 폰트를 바꾸면 즉시 반영되도록 미리 로드. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Jua&family=Noto+Sans+KR:wght@300;400;500;600;700&family=Noto+Serif+KR:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* Pretendard (CDN) — bible-reading 본문이 첫 번째로 시도하는 폰트 */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
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
