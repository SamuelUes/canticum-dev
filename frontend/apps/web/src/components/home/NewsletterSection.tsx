'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { functionsBaseUrl } from '../../features/shared/functionsClient';
import type { HomeText, NewsletterStat } from '../../types/home';
import type { HomeNewsletterSlide } from '../../features/home/repository';

interface NewsletterSectionProps {
  text: Pick<HomeText, 'newsletterTitle' | 'newsletterDescription' | 'learnMore'>;
  stats: NewsletterStat[];
  preloadedSlides?: HomeNewsletterSlide[];
}

export function NewsletterSection({ text, stats, preloadedSlides }: NewsletterSectionProps) {
  const [slides, setSlides] = useState<Array<{ imageUrl: string; id?: string }>>(() =>
    preloadedSlides ? preloadedSlides.map((s) => ({ imageUrl: s.imageUrl, id: s.id })) : []
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const visibleSlides = useMemo(() => slides.filter((slide) => Boolean(slide?.imageUrl)), [slides]);

  const scrollToIndex = (index: number) => {
    const track = trackRef.current;
    const slide = track?.children.item(index) as HTMLElement | null;
    if (!track || !slide) return;

    const nextLeft = slide.offsetLeft - track.offsetLeft;
    track.scrollTo({ left: nextLeft, behavior: 'smooth' });
  };

  useEffect(() => {
    if (preloadedSlides && preloadedSlides.length > 0) {
      setSlides(preloadedSlides.map((s) => ({ imageUrl: s.imageUrl, id: s.id })));
      setActiveIndex(0);
      return;
    }

    const fetchNewsletterImage = async () => {
      try {
        const response = await fetch(`${functionsBaseUrl}/admin-admin/newsletter`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        });

        if (response.ok) {
          const payload = await response.json() as { ok: boolean; imageUrl: string | null; slides?: Array<{ imageUrl: string; id?: string }> };
          if (payload.ok) {
            const nextSlides = Array.isArray(payload.slides) && payload.slides.length > 0
              ? payload.slides.filter((slide) => Boolean(slide?.imageUrl))
              : payload.imageUrl
                ? [{ imageUrl: payload.imageUrl }]
                : [];

            setSlides(nextSlides);
            setActiveIndex(0);
          }
        }
      } catch (error) {
        console.error('Failed to fetch newsletter image:', error);
      } finally {
        // Image loaded or failed
      }
    };

    void fetchNewsletterImage();
  }, [preloadedSlides]);

  useEffect(() => {
    if (visibleSlides.length === 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setActiveIndex((current) => {
        const next = (current + 1) % visibleSlides.length;
        scrollToIndex(next);
        return next;
      });
    }, 5000);

    return () => window.clearInterval(timer);
  }, [visibleSlides.length]);

  if (visibleSlides.length > 0) {
    return (
      <section className="newsletter-banner layout-h-margin newsletter-banner--carousel">
        <div className="newsletter-banner-carousel-shell">
          <div className="newsletter-banner-carousel-header newsletter-banner-carousel-header--overlay">
            <div className="newsletter-banner-progress" aria-hidden="true">
              {visibleSlides.map((_, index) => (
                <button
                  key={`dot-${index}`}
                  type="button"
                  className={`newsletter-banner-dot ${index === activeIndex ? 'is-active' : ''}`}
                  onClick={() => {
                    setActiveIndex(index);
                    scrollToIndex(index);
                  }}
                  aria-label={`Ir a la imagen ${index + 1}`}
                />
              ))}
            </div>
          </div>

          <div
            ref={trackRef}
            className="newsletter-banner-carousel"
            onScroll={(event) => {
              const track = event.currentTarget;
              const slideWidth = track.firstElementChild?.getBoundingClientRect().width ?? track.clientWidth;
              if (!slideWidth) return;
              const nextIndex = Math.round(track.scrollLeft / slideWidth);
              if (nextIndex !== activeIndex) {
                setActiveIndex(Math.max(0, Math.min(nextIndex, visibleSlides.length - 1)));
              }
            }}
          >
            {visibleSlides.map((slide, index) => (
              <div key={slide.id ?? `${slide.imageUrl}-${index}`} className="newsletter-banner-slide">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={slide.imageUrl} alt={`${text.newsletterTitle} ${index + 1}`} className="newsletter-banner-image" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // Fallback to original design if no image is configured
  return (
    <section className="newsletter-banner layout-h-margin newsletter-banner--fallback">
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
