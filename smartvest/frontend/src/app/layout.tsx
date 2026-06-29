import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar, MobileNav } from "@/components/sidebar";
import { ChatWidget } from "@/components/chat-widget";
import { AlertNotifier } from "@/components/alert-notifier";
import { PWARegister } from "@/components/pwa-register";
import { NotificationManager } from "@/components/notification-manager";
import { NotificationPrompt } from "@/components/notification-prompt";
import { AppLockScreen } from "@/components/app-lock-screen";
import { ConfigProvider } from "@/lib/white-label/config-context";
import { getSSRThemeScript } from "@/lib/white-label/theme-engine";
import config from "../../smartvest.config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// ─── Metadata from config ────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: `${config.branding.appName} — ${config.branding.tagline}`,
  description: `${config.branding.appName}: ${config.branding.tagline}`,
  applicationName: config.branding.appName,
  metadataBase: config.deployment.baseUrl ? new URL(config.deployment.baseUrl) : undefined,
};

// ─── SSR theme styles (prevents flash of unstyled content) ───────────────────

const themeCSS = getSSRThemeScript(config.theme);

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang={config.locale.language}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased ${config.theme.defaultMode}`}
      suppressHydrationWarning
    >
      <head>
        <meta name="application-name" content={config.branding.appName} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content={config.branding.appName} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content={config.theme.colors.primary} />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        {config.branding.favicon && (
          <link rel="icon" href={config.branding.favicon} />
        )}
        {/* Inject config-driven theme as CSS custom properties */}
        <style dangerouslySetInnerHTML={{ __html: themeCSS }} />
        {/* Theme persistence script (runs before paint) */}
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            const t = localStorage.getItem('smartvest_theme');
            if (t === 'light') {
              document.documentElement.classList.remove('dark');
              document.documentElement.classList.add('light');
            } else if (t === 'dark') {
              document.documentElement.classList.remove('light');
              document.documentElement.classList.add('dark');
            }
          } catch(e) {}
        `}} />
      </head>
      <body className="min-h-screen flex bg-[var(--background)] text-[var(--foreground)]">
        <ConfigProvider>
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-4 pb-20 lg:p-8 lg:pb-8">
            {children}
          </main>
          <MobileNav />
          {config.features.aiChat && <ChatWidget />}
          {config.features.alerts && <AlertNotifier />}
          <PWARegister />
          {config.features.notifications && <NotificationManager />}
          {config.features.notifications && <NotificationPrompt />}
          {config.features.appLock && <AppLockScreen />}
        </ConfigProvider>
      </body>
    </html>
  );
}
