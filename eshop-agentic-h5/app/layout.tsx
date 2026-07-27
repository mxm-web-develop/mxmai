import type { Metadata, Viewport } from 'next';
import { Fraunces, Noto_Sans_SC, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';
import { TabBar } from '@/components/layout/TabBar';
import { JobProvider } from '@/contexts/JobContext';
import { MobileDialogProvider } from '@/contexts/MobileDialogContext';
import { OpenApiBootstrap } from '@/components/OpenApiBootstrap';
import { RequireSmsLogin } from '@/components/auth/RequireSmsLogin';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  weight: ['400', '500', '600', '700'],
});

const notoSansSc = Noto_Sans_SC({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-sc',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-fraunces',
});

export const metadata: Metadata = {
  title: '一拍上架 — AI 商拍工坊',
  description: '女装男装童装饰品 · 3×3 宫格商拍 · 单格高清放大',
  manifest: '/manifest.webmanifest',
  applicationName: '一拍上架',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '一拍上架',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  formatDetection: {
    telephone: false,
  },
};

export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#F6F3EF',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="zh-CN"
      className={`${jakarta.variable} ${notoSansSc.variable} ${fraunces.variable}`}
    >
      <body suppressHydrationWarning>
        <JobProvider>
          <MobileDialogProvider>
            <OpenApiBootstrap />
            <RequireSmsLogin>
              <AppShell>
                {children}
                <TabBar />
              </AppShell>
            </RequireSmsLogin>
          </MobileDialogProvider>
        </JobProvider>
      </body>
    </html>
  );
}
