import { HomeFooter } from '../src/components/home/Footer';
import { HomePageClient } from '../src/components/home/HomePageClient';
import { homeMockData } from '../src/features/home/mockData';
import { getHomeText } from '../src/i18n/home';
import type { Locale } from '../src/types/home';


export default function HomePage() {
  const locale: Locale = 'es';
  const text = getHomeText(locale);

  return (
    <main className="home-page">
      <div className="home-shell">
        <HomePageClient text={text} />

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
