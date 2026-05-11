import { HomeFooter } from '../../../../src/components/home/Footer';
import { Header } from '../../../../src/components/home/Header';
import { EditSongWorkspace } from '../../../../src/components/song/EditSongWorkspace';
import { homeMockData } from '../../../../src/features/home/mockData';
import { getHomeText } from '../../../../src/i18n/home';
import type { Locale } from '../../../../src/types/home';

interface EditSongPageProps {
  params: {
    songId: string;
  };
}

export default function EditSongPage({ params }: EditSongPageProps) {
  const locale: Locale = 'es';
  const text = getHomeText(locale);

  return (
    <main className="home-page create-page-root">
      <div className="home-shell">
        <Header text={text} />

        <EditSongWorkspace songId={params.songId} />

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
