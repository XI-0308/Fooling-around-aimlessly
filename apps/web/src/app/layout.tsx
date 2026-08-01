import type { Metadata, Viewport } from "next";
import "./globals.css";
import AntdProviders from "@/components/AntdProviders";
import ColdBootClearer from "@/components/ColdBootClearer";
import ColdBootSplash from "@/components/ColdBootSplash";
import StandaloneBoot from "@/components/StandaloneBoot";
import ThemeApplier from "@/components/ThemeApplier";
import ThemeBootstrapScript from "@/components/ThemeBootstrapScript";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "WE-E",
  description: "WE-E · 角色扮演与 Agent 扩展",
  applicationName: "WE-E",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "WE-E",
  },
  icons: {
    apple: [{ url: "/pwa-icon/180", sizes: "180x180" }],
    icon: [
      { url: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { url: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
    ],
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0f1117",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <ThemeBootstrapScript />
        <ColdBootSplash />
      </head>
      <body>
        <AntdProviders>
          <ColdBootClearer />
          <ThemeApplier />
          <StandaloneBoot />
          <ServiceWorkerRegister />
          {children}
        </AntdProviders>
      </body>
    </html>
  );
}
