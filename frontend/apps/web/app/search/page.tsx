import { HomeFooter } from '../../src/components/home/Footer';
import { Header } from '../../src/components/home/Header';
import { SearchExplorer } from '../../src/components/search/SearchExplorer';
import { homeMockData } from '../../src/features/home/mockData';
import { getSearchDataset } from '../../src/features/search/repository';
import { getHomeText } from '../../src/i18n/home';
import type { Locale } from '../../src/types/home';

interface SearchPageProps {
  searchParams?: {
    q?: string;
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const locale: Locale = 'es';
  const text = getHomeText(locale);
  const searchDataset = await getSearchDataset();

  return (
    <main className="home-page search-page-root">
      <div className="home-shell search-page-shell">
        <Header text={text} />

        <SearchExplorer initialQuery={searchParams?.q ?? ''} dataset={searchDataset} />

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
