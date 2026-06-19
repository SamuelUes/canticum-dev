'use client';

import { useEffect, useState } from 'react';
import { functionsBaseUrl } from '../../features/shared/functionsClient';
import type { HomeText, NewsletterStat } from '../../types/home';

interface NewsletterSectionProps {
  text: Pick<HomeText, 'newsletterTitle' | 'newsletterDescription' | 'learnMore'>;
  stats: NewsletterStat[];
}

export function NewsletterSection({ text, stats }: NewsletterSectionProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchNewsletterImage = async () => {
      try {
        const response = await fetch(`${functionsBaseUrl}/admin-admin/newsletter`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        });

        if (response.ok) {
          const payload = await response.json() as { ok: boolean; imageUrl: string | null };
          if (payload.ok && payload.imageUrl) {
            setImageUrl(payload.imageUrl);
          }
        }
      } catch (error) {
        console.error('Failed to fetch newsletter image:', error);
      } finally {
        // Image loaded or failed
      }
    };

    void fetchNewsletterImage();
  }, []);

  if (imageUrl) {
    return (
      <section className="newsletter-banner layout-h-margin">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={text.newsletterTitle} className="newsletter-banner-image" />
      </section>
    );
  }

  // Fallback to original design if no image is configured
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
