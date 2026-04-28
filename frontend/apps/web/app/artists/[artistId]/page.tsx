import { notFound } from 'next/navigation';
import { HomeFooter } from '../../../src/components/home/Footer';
import { Header } from '../../../src/components/home/Header';
import { ArtistProfileWorkspace } from '../../../src/components/artist/ArtistProfileWorkspace';
import { homeMockData } from '../../../src/features/home/mockData';
import { getArtistDetailById, getPublicrepertoiresForArtist } from '../../../src/features/artist/repository';
import { getHomeText } from '../../../src/i18n/home';
import type { Locale } from '../../../src/types/home';

interface ArtistPageProps {
  params: {
    artistId: string;
  };
  searchParams?: {
    id?: string | string[];
  };
}

export default async function ArtistPage({ params, searchParams }: ArtistPageProps) {
  const locale: Locale = 'es';
  const text = getHomeText(locale);

  const rawId = searchParams?.id;
  const explicitId = Array.isArray(rawId) ? rawId[0] : rawId;
  const lookupId = explicitId && explicitId.trim().length > 0 ? explicitId.trim() : params.artistId;

  let artist = await getArtistDetailById(lookupId);

  if (!artist && lookupId !== params.artistId) {
    artist = await getArtistDetailById(params.artistId);
  }

  if (!artist) {
    notFound();
  }

  const artistSongIds = artist.songs.map((song) => song.id);
  const repertoires = await getPublicrepertoiresForArtist(artistSongIds);

  return (
    <main className="home-page search-page-root">
      <div className="home-shell search-page-shell">
        <Header text={text} />

        <ArtistProfileWorkspace artist={artist} repertoires={repertoires} />

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
