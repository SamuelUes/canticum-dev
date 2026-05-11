import { HomeFooter } from '../../../../src/components/home/Footer';
import { Header } from '../../../../src/components/home/Header';
import { EditRepertoireWorkspace } from '../../../../src/components/repertoire/EditRepertoireWorkspace';
import { homeMockData } from '../../../../src/features/home/mockData';
import { getHomeText } from '../../../../src/i18n/home';
import type { Locale } from '../../../../src/types/home';

interface RepertoireEditPageProps {
  params: {
    repertoireId: string;
  };
}

export default function RepertoireEditPage({ params }: RepertoireEditPageProps) {
  const locale: Locale = 'es';
  const text = getHomeText(locale);

  return (
    <main className="home-page create-page-root">
      <div className="home-shell">
        <Header text={text} />

        <EditRepertoireWorkspace repertoireId={params.repertoireId} />

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
