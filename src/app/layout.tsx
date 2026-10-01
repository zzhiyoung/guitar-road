import type { Metadata, Viewport } from "next";

import "./globals.css";
import { AppFrame } from "@/components/app-nav";
import { ServiceWorkerRegistrar } from "@/components/sw-registrar";

export const metadata: Metadata = {
  title: "Guitar Road · 每日音乐时光",
  description:
    "从喜欢的一小段开始，记录属于你的吉他练习与成长。",
  manifest: "/manifest.webmanifest",
  applicationName: "Guitar Road",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Guitar Road",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/icon-192.png" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#f7f3ec",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-dvh">
        <AppFrame>{children}</AppFrame>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
