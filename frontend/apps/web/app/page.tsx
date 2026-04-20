import { ArtistsSection } from '../src/components/home/ArtistsSection';
import { DualListSection } from '../src/components/home/DualListSection';
import { FeaturedSection } from '../src/components/home/FeaturedSection';
import { HomeFooter } from '../src/components/home/Footer';
import { Header } from '../src/components/home/Header';
import { NewsletterSection } from '../src/components/home/NewsletterSection';
import { homeMockData } from '../src/features/home/mockData';
import { getHomeText } from '../src/i18n/home';
import type { Locale } from '../src/types/home';

export default function HomePage() {
  const locale: Locale = 'es';
  const text = getHomeText(locale);

  return (
    <main className="home-page">
      <div className="home-shell">
        <Header text={text} />

        <FeaturedSection title={text.featuredTitle} songs={homeMockData.featuredSongs} />

        <ArtistsSection title={text.artistsTitle} artists={homeMockData.artists} />

        <DualListSection
          left={{ title: text.trendsTitle, viewAllLabel: text.viewAll, items: homeMockData.trends }}
          right={{
            title: text.recentTitle,
            viewAllLabel: text.viewAll,
            items: homeMockData.recentSongs,
            linkBasePath: '/songs'
          }}
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
