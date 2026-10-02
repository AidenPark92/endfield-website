import type { Metadata } from "next";
import localFont from "next/font/local";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider } from "@/components/theme-provider";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

// 폰트는 npm 패키지에서 로컬로 로드 (빌드 시 외부 네트워크 불필요)
const pretendard = localFont({
  src: "../../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "45 920",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Endfield Field Note", template: "%s · Endfield Field Note" },
  description: "명일방주: 엔드필드 공략 도구 — 기질 파밍 최적화, 육성 계산기",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className={`${GeistSans.variable} ${GeistMono.variable} ${pretendard.variable} min-h-dvh font-sans`}>
        <ThemeProvider>
          <SiteHeader />
          <main>{children}</main>
          <footer className="mx-auto mt-16 max-w-7xl border-t px-4 py-6 text-xs text-muted-foreground">
            <p>
              비공식 팬 사이트입니다. 게임 데이터 출처:{" "}
              <a className="underline underline-offset-2" href="https://wiki.skport.com/endfield" target="_blank" rel="noreferrer">
                SKPORT 엔드필드 위키
              </a>
              . 모든 게임 자산의 권리는 GRYPHLINE 에 있습니다.
            </p>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
