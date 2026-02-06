import type { Metadata } from 'next';
import './globals.css';

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
    <html lang="en">
      <body className="antialiased animated-gradient">
        {/* Noise texture overlay */}
        <div className="noise-overlay" />

        {/* Grid pattern */}
        <div className="fixed inset-0 grid-pattern opacity-20 pointer-events-none" />

        {/* Main content */}
        <main className="relative z-10 min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
