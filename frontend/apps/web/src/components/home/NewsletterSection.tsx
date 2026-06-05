import type { HomeText, NewsletterStat } from '../../types/home';

interface NewsletterSectionProps {
  text: Pick<HomeText, 'newsletterTitle' | 'newsletterDescription' | 'learnMore'>;
  stats: NewsletterStat[];
}

export function NewsletterSection({ text, stats }: NewsletterSectionProps) {
  return (
    <section className="newsletter-banner layout-h-margin">
      <div className="banner-content">
        <h3>{text.newsletterTitle}</h3>
        <p>{text.newsletterDescription}</p>
        <button type="button">{text.learnMore}</button>
      </div>

      <div className="banner-stats" aria-label="estadísticas">
        {stats.map((stat) => (
          <article key={stat.id}>
            <span className="banner-stat-icon" aria-hidden />
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
