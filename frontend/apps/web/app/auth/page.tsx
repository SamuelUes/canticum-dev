import { Suspense } from 'react';
import { AuthWorkspace } from '../../src/components/auth/AuthWorkspace';

interface AuthPageProps {
  searchParams?: {
    redirect?: string;
  };
}

export default function AuthPage({ searchParams }: AuthPageProps) {
  const redirectTo = searchParams?.redirect ?? '/';

  return (
    <main className="auth-page-root">
      <Suspense fallback={<div className="auth-page-layout"><div className="auth-card"><p>Cargando...</p></div></div>}>
        <AuthWorkspace redirectTo={redirectTo} />
      </Suspense>
    </main>
  );
}
