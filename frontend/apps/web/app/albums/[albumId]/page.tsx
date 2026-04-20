import { notFound } from 'next/navigation';
import { HomeFooter } from '../../../src/components/home/Footer';
import { Header } from '../../../src/components/home/Header';
import { AlbumWorkspace } from '../../../src/components/album/AlbumWorkspace';
import { homeMockData } from '../../../src/features/home/mockData';
import { getAlbumDetailById } from '../../../src/features/album/repository';
import { getHomeText } from '../../../src/i18n/home';
import type { Locale } from '../../../src/types/home';

interface AlbumPageProps {
  params: {
    albumId: string;
  };
}

export default async function AlbumPage({ params }: AlbumPageProps) {
  const locale: Locale = 'es';
  const text = getHomeText(locale);
  const album = await getAlbumDetailById(params.albumId);

  if (!album) {
    notFound();
  }

  return (
    <main className="home-page search-page-root">
      <div className="home-shell search-page-shell">
        <Header text={text} />

        <AlbumWorkspace album={album} />

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
