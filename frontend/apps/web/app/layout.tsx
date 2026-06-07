import type { Metadata } from 'next';
import { Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';
import { FloatingPlayerWrapper } from '../src/components/app/FloatingPlayerWrapper';
import { Providers } from '../src/context/Providers';
import 'react-loading-skeleton/dist/skeleton.css';
import './globals.css';

const hankenGrotesk = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-hanken-grotesk',
  display: 'swap'
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap'
});

export const metadata: Metadata = {
  title: 'Canticum',
  description: 'Cancionero digital Canticum'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      <body className={`${hankenGrotesk.variable} ${jetBrainsMono.variable}`} suppressHydrationWarning>
        <Providers>
          {children}
          <FloatingPlayerWrapper />
        </Providers>
      </body>
    </html>
  );
}
