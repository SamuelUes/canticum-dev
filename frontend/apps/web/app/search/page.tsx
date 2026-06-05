import { HomeFooter } from '../../src/components/home/Footer';
import { Header } from '../../src/components/home/Header';
import { Nav } from '../../src/components/home/nav';
import { SearchExplorer } from '../../src/components/search/SearchExplorer';
import { homeMockData } from '../../src/features/home/mockData';
import { getHomeText } from '../../src/i18n/home';
import type { Locale } from '../../src/types/home';

interface SearchPageProps {
  searchParams?: {
    q?: string;
    category?: string;
  };
}

export default function SearchPage({ searchParams }: SearchPageProps) {
  const locale: Locale = 'es';
  const text = getHomeText(locale);
  const normalizedCategory = typeof searchParams?.category === 'string'
    ? searchParams.category.trim().toLowerCase()
    : 'todos';

  return (
    <main className="home-page search-page-root">
      <div className="home-shell search-page-shell layout-h-margin">
        <Header text={text} />
        <Nav selectedCategory={normalizedCategory || 'todos'} />

        {/* SearchExplorer hace fetch en cliente al endpoint /search/catalog y muestra skeleton hasta que llega el dataset real */}
        <SearchExplorer initialQuery={searchParams?.q ?? ''} initialCategory={normalizedCategory || 'todos'} />

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
