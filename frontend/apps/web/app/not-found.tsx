import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
      <h1 style={{ color: '#133f66', marginBottom: '0.75rem' }}>Página no encontrada</h1>
      <p style={{ marginBottom: '1.25rem' }}>
        La página que buscas no existe o fue movida.
      </p>
      <Link href="/" style={{ color: '#133f66', textDecoration: 'underline' }}>
        Ir al inicio
      </Link>
    </div>
  );
}
