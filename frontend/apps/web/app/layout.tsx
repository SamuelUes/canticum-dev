import type { Metadata } from 'next';
import { Providers } from '../src/context/Providers';
import 'react-loading-skeleton/dist/skeleton.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Canticum',
  description: 'Cancionero digital Canticum'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
