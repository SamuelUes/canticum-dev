import { HomeFooter } from '../src/components/home/Footer';
import { HomePageClient } from '../src/components/home/HomePageClient';
import { NewsletterSection } from '../src/components/home/NewsletterSection';
import { homeMockData } from '../src/features/home/mockData';
import { getHomeText } from '../src/i18n/home';
import type { Locale } from '../src/types/home';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  icons: {
    icon: '/assets/icon/canticumlogo.png',
  },
};

export default function HomePage() {
  const locale: Locale = 'es';
  const text = getHomeText(locale);

  return (
    <main className="home-page">
      <div className="home-shell">
        <HomePageClient text={text} />

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
