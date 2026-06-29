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

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SmartVest — Your AI Stock Assistant",
  description: "AI-powered stock market assistant for beginner investors in Denmark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
      suppressHydrationWarning
    >
      <head>
        <meta name="application-name" content="SmartVest" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="SmartVest" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#3b82f6" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            const t = localStorage.getItem('smartvest_theme');
            if (t === 'light') {
              document.documentElement.classList.remove('dark');
              document.documentElement.classList.add('light');
            }
          } catch(e) {}
        `}} />
      </head>
      <body className="min-h-screen flex bg-[var(--background)] text-[var(--foreground)]">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-4 pb-20 lg:p-8 lg:pb-8">
          {children}
        </main>
        <MobileNav />
        <ChatWidget />
        <AlertNotifier />
        <PWARegister />
        <NotificationManager />
        <NotificationPrompt />
        <AppLockScreen />
      </body>
    </html>
  );
}
