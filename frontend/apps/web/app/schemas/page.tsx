import { HomeFooter } from '../../src/components/home/Footer';
import { Header } from '../../src/components/home/Header';
import { MySchemasWorkspace } from '../../src/components/schema/MySchemasWorkspace';
import { homeMockData } from '../../src/features/home/mockData';
import { getUserSchemas } from '../../src/features/schema/repository';
import { getHomeText } from '../../src/i18n/home';
import type { Locale } from '../../src/types/home';

export default async function SchemasPage() {
  const locale: Locale = 'es';
  const text = getHomeText(locale);
  const currentUserId = 'user-1';
  const schemas = await getUserSchemas(currentUserId);

  return (
    <main className="home-page search-page-root">
      <div className="home-shell search-page-shell">
        <Header text={text} />

        <MySchemasWorkspace items={schemas} />

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
