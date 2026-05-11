import type { Metadata } from 'next';
import { AuthProvider } from '../src/context/AuthContext';
import { RuntimeStabilityGuard } from '../src/components/app/RuntimeStabilityGuard';
import './globals.css';

export const metadata: Metadata = {
  title: 'Canticum',
  description: 'Cancionero digital Canticum'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <AuthProvider>
          <RuntimeStabilityGuard />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
