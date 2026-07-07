'use client';

import { useMemo, useState } from 'react';
import { HomeContent } from './HomeContent';
import { Header } from './Header';
import { Nav } from './nav';
import { getCachedSearchDatasetClient } from '../../features/search/repository';
import type { HomeText } from '../../types/home';
import { WeeklyMisalStrip } from '../ui/WeeklyMisalStrip';
import { WeeklyPlanStrip } from '../ui/WeeklyPlanStrip';

interface HomePageClientProps {
  text: HomeText;
}

export function HomePageClient({ text }: HomePageClientProps) {
  const [selectedCategory, setSelectedCategory] = useState('todos');
  const [availableCategories, setAvailableCategories] = useState<string[]>(() => {
    const cached = getCachedSearchDatasetClient('home');
    if (!cached) {
      return [];
    }

    const normalized = cached.filters.categories
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0 && value !== 'todos');
    return Array.from(new Set(normalized));
  });

  const categoryOptions = useMemo(() => {
    const normalized = availableCategories
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0 && value !== 'todos');
    return Array.from(new Set(normalized));
  }, [availableCategories]);

  return (
    <>
      <Header text={text} />

      <Nav
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        categoryOptions={categoryOptions}
      />

      <div className="weekly-panels-row layout-h-margin">
        <WeeklyMisalStrip className="weekly-panel weekly-panel--misal" />
        <WeeklyPlanStrip className="weekly-panel weekly-panel--plan" />
      </div>

      <HomeContent
        text={text}
        selectedCategory={selectedCategory}
        onAvailableCategoriesChange={(categories) => {
          setAvailableCategories((current) => {
            if (current.length === categories.length && current.every((value, index) => value === categories[index])) {
              return current;
            }
            return categories;
          });
        }}
      />
    </>
  );
}
