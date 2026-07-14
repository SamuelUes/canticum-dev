'use client';

import { useEffect, useMemo, useState } from 'react';
import { HomeContent } from './HomeContent';
import { Header } from './Header';
import { Nav } from './nav';
import { getCachedHomeData } from '../../features/home/repository';
import type { HomeText } from '../../types/home';
import { WeeklyMisalStrip } from '../ui/WeeklyMisalStrip';
import { WeeklyPlanStrip } from '../ui/WeeklyPlanStrip';
import { NewsletterSection } from './NewsletterSection';
import { LoadingBubble } from '../ui/LoadingBubble';
import { homeMockData } from '../../features/home/mockData';

interface HomePageClientProps {
  text: HomeText;
}

export function HomePageClient({ text }: HomePageClientProps) {
  const [selectedCategory, setSelectedCategory] = useState('todos');
  const [isHydrating, setIsHydrating] = useState(true);
  const [availableCategories, setAvailableCategories] = useState<string[]>(() => {
    const cached = getCachedHomeData();
    if (!cached) {
      return [];
    }

    const normalized = cached.categories
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0 && value !== 'todos');
    return Array.from(new Set(normalized));
  });

  useEffect(() => {
    const timer = setTimeout(() => setIsHydrating(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const categoryOptions = useMemo(() => {
    const normalized = availableCategories
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0 && value !== 'todos');
    return Array.from(new Set(normalized));
  }, [availableCategories]);

  const cachedHome = getCachedHomeData();

  return (
    <>
      <LoadingBubble isLoading={isHydrating} message="Preparando" />
      <Header text={text} />

      <Nav
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        categoryOptions={categoryOptions}
      />

      <div className="weekly-panels-row layout-h-margin">
        <WeeklyMisalStrip
          className="weekly-panel weekly-panel--misal"
          preloadedRecords={cachedHome?.misales}
        />
        <WeeklyPlanStrip
          className="weekly-panel weekly-panel--plan"
          preloadedRecord={cachedHome?.sundaySchema ?? undefined}
        />
      </div>

      <HomeContent
        text={text}
        onAvailableCategoriesChange={(categories) => {
          setAvailableCategories((current) => {
            if (current.length === categories.length && current.every((value, index) => value === categories[index])) {
              return current;
            }
            return categories;
          });
        }}
      />

      <NewsletterSection
        text={{
          newsletterTitle: text.newsletterTitle,
          newsletterDescription: text.newsletterDescription,
          learnMore: text.learnMore
        }}
        stats={homeMockData.newsletterStats}
        preloadedSlides={cachedHome?.newsletterSlides}
      />
    </>
  );
}
