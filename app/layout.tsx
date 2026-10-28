import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { Analytics } from '@vercel/analytics/react';
import './globals.css';

// Same woff2 files the canvas renderer loads via FontFace.
const mono = localFont({
  src: [
    { path: '../public/fonts/jetbrains-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/jetbrains-mono-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/jetbrains-mono-latin-700-normal.woff2', weight: '700', style: 'normal' },
    { path: '../public/fonts/jetbrains-mono-latin-800-normal.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-mono',
  display: 'swap',
});
const display = localFont({
  src: [{ path: '../public/fonts/archivo-latin-900-normal.woff2', weight: '900', style: 'normal' }],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://replayed.trade'),
  title: 'replayed.trade — Your trade. As a video.',
  description: 'Screenshots show the result. Replays show the trade. Turn one trade into a shareable replay video in seconds.',
  openGraph: {
    title: 'replayed.trade — Your trade. As a video.',
    description: 'Stop posting screenshots. Post the replay.',
    url: 'https://replayed.trade',
    siteName: 'replayed.trade',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Your trade. As a video.' }],
  },
  twitter: { card: 'summary_large_image', title: 'replayed.trade', description: 'Your trade. As a video. In seconds.', images: ['/og-image.png'] },
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = { themeColor: '#0A0C0B', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${mono.variable} ${display.variable}`}>
      <body className="min-h-screen bg-bg font-mono text-[15px] leading-relaxed text-ink antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
