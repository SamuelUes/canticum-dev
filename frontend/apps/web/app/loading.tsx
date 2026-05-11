export default function Loading() {
  return (
    <main className="home-page">
      <div className="home-shell" style={{ padding: '2rem 1.5rem' }}>
        <div className="skeleton-pulse home-skeleton-title" style={{ maxWidth: 260, marginBottom: '1rem' }} />
        <div className="home-skeleton-grid" style={{ marginBottom: '1rem' }}>
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="skeleton-pulse home-skeleton-card" />
          ))}
        </div>
        <div className="home-skeleton-row">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="skeleton-pulse home-skeleton-pill" />
          ))}
        </div>
      </div>
    </main>
  );
}
