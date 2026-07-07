import { notFound } from 'next/navigation';
import { HomeFooter } from '../../../src/components/home/Footer';
import { Header } from '../../../src/components/home/Header';
import { SongWorkspace } from '../../../src/components/song/SongWorkspace';
import { homeMockData } from '../../../src/features/home/mockData';
import { getServerSessionToken } from '../../../src/features/shared/functionsServer';
import { getSongDetailById } from '../../../src/features/song/repository';
import { getHomeText } from '../../../src/i18n/home';
import type { Locale } from '../../../src/types/home';

interface SongPageProps {
  params: {
    songId: string;
  };
  searchParams?: {
    versionId?: string | string[];
  };
}

export default async function SongPage({ params, searchParams }: SongPageProps) {
  const locale: Locale = 'es';
  const text = getHomeText(locale);
  const rawVersionId = searchParams?.versionId;
  const initialVersionId = Array.isArray(rawVersionId) ? rawVersionId[0] : rawVersionId;
  const authToken = await getServerSessionToken();
  const song = await getSongDetailById(
    params.songId,
    typeof initialVersionId === 'string' ? initialVersionId : undefined,
    { authToken }
  );

  if (!song) {
    notFound();
  }

  return (
    <main className="home-page song-page-root">
      <div className="home-shell song-page-shell">
        <Header text={text} />

        <SongWorkspace song={song} initialVersionId={typeof initialVersionId === 'string' ? initialVersionId : undefined} />

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
