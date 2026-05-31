'use client';

import { useMemo, useState } from 'react';
import { HomeContent } from '../src/components/home/HomeContent';
import { HomeFooter } from '../src/components/home/Footer';
import { Header } from '../src/components/home/Header';
import { NewsletterSection } from '../src/components/home/NewsletterSection';
import { homeMockData } from '../src/features/home/mockData';
import { getHomeText } from '../src/i18n/home';
import type { Locale } from '../src/types/home';

export default function HomePage() {
  const locale: Locale = 'es';
  const text = getHomeText(locale);
  const [selectedCategory, setSelectedCategory] = useState('todos');
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);

  const categoryOptions = useMemo(() => {
    const normalized = availableCategories
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0 && value !== 'todos');
    return Array.from(new Set(normalized));
  }, [availableCategories]);

  return (
    <main className="home-page">
      <div className="home-shell">
        <Header
          text={text}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          categoryOptions={categoryOptions}
          showCategories
        />

        <HomeContent
          text={text}
          selectedCategory={selectedCategory}
          onAvailableCategoriesChange={setAvailableCategories}
        />

        <NewsletterSection
          text={{
            newsletterTitle: text.newsletterTitle,
            newsletterDescription: text.newsletterDescription,
            learnMore: text.learnMore
          }}
          stats={homeMockData.newsletterStats}
        />

        <HomeFooter
          text={{
            footerKnowTitle: text.footerKnowTitle,
            footerKnowDescription: text.footerKnowDescription,
            footerCopyright: text.footerCopyright
          }}
          sections={homeMockData.footerSections}
        />
      </div>
    </main>
  );
}
