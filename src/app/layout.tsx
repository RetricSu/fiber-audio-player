import type { Metadata } from 'next';
import { Cormorant_Garamond, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const displayFont = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-display',
});

const monoFont = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Fiber Audio Player - Stream. Listen. Pay.',
  description: 'A podcast player integrated with Fiber Network for streaming micropayments on CKB',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${displayFont.variable} ${monoFont.variable}`}>
      <body className="antialiased animated-gradient">
        {/* Noise texture overlay */}
        <div className="noise-overlay" />

        {/* Grid pattern */}
        <div className="fixed inset-0 grid-pattern opacity-10 pointer-events-none" />

        {/* Main content */}
        <main className="relative z-10 min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
