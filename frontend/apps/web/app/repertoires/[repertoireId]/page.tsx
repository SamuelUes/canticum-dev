import Link from 'next/link';
import { HomeFooter } from '../../../src/components/home/Footer';
import { Header } from '../../../src/components/home/Header';
import { RepertoireOwnerActions } from '../../../src/components/repertoire/RepertoireOwnerActions';
import { RepertoireDetailClientFallback } from '../../../src/components/repertoire/RepertoireDetailClientFallback';
import { homeMockData } from '../../../src/features/home/mockData';
import { getrepertoireDetailById } from '../../../src/features/repertoire/repository';
import { getHomeText } from '../../../src/i18n/home';
import type { Locale } from '../../../src/types/home';
import type { SongRef } from '../../../src/types/repertoire';


interface repertoirePageProps {
  params: {
    repertoireId: string;
  };
}

export default async function repertoirePage({ params }: repertoirePageProps) {
  const locale: Locale = 'es';
  const text = getHomeText(locale);
  const repertoire = await getrepertoireDetailById(params.repertoireId);

  if (!repertoire) {
    return (
      <main className="home-page search-page-root">
        <div className="home-shell search-page-shell">
          <Header text={text} />
          <RepertoireDetailClientFallback repertoireId={params.repertoireId} />
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

  const resolvedSongs: SongRef[] = repertoire.songs
    ?? repertoire.songIds.map((id) => ({
      id,
      title: id,
      artistName: undefined,
      versionId: undefined
    }));
  const songItems = resolvedSongs.map((song) => ({
    songId: song.id,
    name: song.title,
    artistName: song.artistName,
    versionId: song.versionId
  }));
  const totalSongs = songItems.length;
  const totalSheets = totalSongs;

  return (
    <main className="home-page search-page-root">
      <div className="home-shell search-page-shell">
        <Header text={text} />

        <section className="search-results-panel repertoire-detail-shell">
          <header className="search-results-head repertoire-detail-header">
            <p className="repertoire-detail-kicker">Repertorio Litúrgico</p>
            <h1 className="repertoire-detail-title">{repertoire.title}</h1>
          </header>

          <article className="search-generic-card repertoire-detail-card repertoire-detail-meta-card">
            <RepertoireOwnerActions repertoireId={repertoire.id} ownerUserId={repertoire.ownerUserId} />

            <div className="repertoire-detail-meta-row">
              <span className="repertoire-detail-meta-label">Tipo</span>
              <strong>{repertoire.liturgicalType}</strong>
            </div>

            {repertoire.description ? (
              <div className="repertoire-detail-meta-row">
                <span className="repertoire-detail-meta-label">Descripción</span>
                <p>{repertoire.description}</p>
              </div>
            ) : null}

            {repertoire.createdBy ? (
              <div className="repertoire-detail-meta-row">
                <span className="repertoire-detail-meta-label">Creado por</span>
                <span>{repertoire.createdBy}</span>
              </div>
            ) : null}

            <div className="repertoire-detail-meta-grid">
              <div className="repertoire-detail-meta-pill">
                <span>Visibilidad</span>
                <strong>{repertoire.isPublic ? 'Público' : 'Privado'}</strong>
              </div>
              <div className="repertoire-detail-meta-pill">
                <span>Estado</span>
                <strong>{repertoire.status}</strong>
              </div>
              {repertoire.createdAt ? (
                <div className="repertoire-detail-meta-pill">
                  <span>Fecha</span>
                  <strong>{repertoire.createdAt}</strong>
                </div>
              ) : null}
              <div className="repertoire-detail-meta-pill">
                <span>Canciones / Partituras</span>
                <strong>{totalSongs} / {totalSheets}</strong>
              </div>
            </div>
          </article>

          <section className="repertoire-song-list" aria-label="canciones del repertorio">
            <h2>Canciones del repertorio</h2>
            <div className="repertoire-song-grid repertoire-song-grid-single-column">
              {songItems.map((song, index) => (
                <Link
                  key={`${song.songId}-${song.versionId ?? 'base'}`}
                  href={song.versionId ? `/songs/${song.songId}?versionId=${encodeURIComponent(song.versionId)}` : `/songs/${song.songId}`}
                  className="repertoire-song-item"
                >
                  <span className="repertoire-song-num">{String(index + 1).padStart(2, '0')}</span>
                  <strong>{song.name && song.name !== song.songId ? song.name : `Canción ${String(index + 1).padStart(2, '0')}`}</strong>
                  {song.artistName ? <small>{song.artistName}</small> : null}
                  {song.versionId ? <small>{`Versión #${song.versionId}`}</small> : null}
                </Link>
              ))}
            </div>
          </section>

        </section>

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
