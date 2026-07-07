import Image from 'next/image';
import { HomeFooter } from '../../../src/components/home/Footer';
import { Header } from '../../../src/components/home/Header';
import { RepertoireOwnerActions } from '../../../src/components/repertoire/RepertoireOwnerActions';
import { RepertoirePageClient } from '../../../src/components/repertoire/RepertoirePageClient';
import { RepertoireSongSection } from '../../../src/components/repertoire/RepertoireSongSection';
import { RepertoirePlayButton } from '../../../src/components/repertoire/RepertoirePlayButton';
import { ShareRepertoireButton } from '../../../src/components/repertoire/ShareRepertoireButton';
// import { RepertoireDetailClientFallback } from '../../../src/components/repertoire/RF';
import { homeMockData } from '../../../src/features/home/mockData';
import { getrepertoireDetailById } from '../../../src/features/repertoire/repository';
import { getRepertoireStatusLabel } from '../../../src/features/repertoire/status';
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
          {/* <RepertoireDetailClientFallback repertoireId={params.repertoireId} /> */}
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
  const coverImageUrl = repertoire.coverImageUrl;
  const totalSongs = songItems.length;
  const totalSheets = totalSongs;

  return (
    <RepertoirePageClient repertoire={repertoire}>
      <main className="home-page search-page-root">
        <div className="home-shell search-page-shell">
          <Header text={text} />

          <section className="repertoire-detail-page">
            <header className="repertoire-detail-hero">
              <div className="repertoire-detail-hero-copy">
                <p className="repertoire-detail-kicker">Repertorio litúrgico</p>
                <h1 className="repertoire-detail-title">{repertoire.title}</h1>
                {/* {repertoire.description ? <p className="repertoire-detail-hero-description">{repertoire.description}</p> : null} */}
              </div>
{/* 
              <div className="repertoire-detail-hero-badges">
                <span className="repertoire-detail-status-chip">{getRepertoireStatusLabel(repertoire.status)}</span>
                <span className="repertoire-detail-visibility-chip">{repertoire.isPublic ? 'Público' : 'Privado'}</span>
              </div> */}
            </header>

            <div className="repertoire-detail-layout">
              <article className="repertoire-description-card">
                <div className="repertoire-description-card-content">
                  <div className="repertoire-description-layout">
                    <div className="repertoire-description-cover-column">
                      <div className="song-cover-frame">
                        {coverImageUrl ? (
                          <Image
                            src={coverImageUrl}
                            alt={`Portada de ${repertoire.title}`}
                            fill
                            sizes="(max-width: 768px) 220px, 184px"
                            className="song-cover-image"
                            priority
                          />
                        ) : (
                          <div className="song-cover-placeholder">
                            <span>Sin portada</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="repertoire-description-copy">
                      <h2>Descripción</h2>
                      <p>{repertoire.description || 'Este repertorio aún no tiene una descripción.'}</p>
                    </div>
                  </div>
                </div>

                <div className="repertoire-detail-meta-top">
                  <div className="repertoire-detail-meta-row">
                    <span className="repertoire-detail-meta-label">Tipo litúrgico</span>
                    <strong>{repertoire.liturgicalType}</strong>
                  </div>

                  {repertoire.createdBy ? (
                    <div className="repertoire-detail-meta-row">
                      <span className="repertoire-detail-meta-label">Creado por</span>
                      <span>{repertoire.createdBy}</span>
                    </div>
                  ) : null}
                </div>
              </article>

              <aside className="repertoire-status-card" aria-label="Estado y metadatos del repertorio">
                <div className="repertoire-status-card-head">
                  <h2>Estado y Información </h2>
                  <span>{getRepertoireStatusLabel(repertoire.status)}</span>
                </div>
                <div className="repertoire-detail-meta-grid">
                  <div className="repertoire-detail-meta-pill">
                    <span>Visibilidad</span>
                    <strong>{repertoire.isPublic ? 'Público' : 'Privado'}</strong>
                  </div>
                  {/* <div className="repertoire-detail-meta-pill is-emphasis">
                    <span>Estado</span>
                    <strong>{getRepertoireStatusLabel(repertoire.status)}</strong>
                  </div> */}
                  <div className="repertoire-detail-meta-pill">
                    <span>Canciones</span>
                    <strong>{totalSongs}</strong>
                  </div>
                  <div className="repertoire-detail-meta-pill">
                    <span>Partituras</span>
                    <strong>{totalSheets}</strong>
                  </div>
                </div>

                {repertoire.createdAt ? (
                  <div className="repertoire-status-date-row">
                    <span>Fecha</span>
                    <strong>{repertoire.createdAt}</strong>
                  </div>
                ) : null}

                <div className="repertoire-action-row">
                  <RepertoirePlayButton
                    songIds={songItems.map((s) => ({ songId: s.songId, versionId: s.versionId }))}
                    className="repertoire-page__play-btn"
                  />
                  <ShareRepertoireButton repertoireId={repertoire.id} className="repertoire-share-btn" />
                </div>

                <RepertoireOwnerActions
                  repertoireId={repertoire.id}
                  ownerUserId={repertoire.ownerUserId}
                  initialStatus={repertoire.status}
                  isPublic={repertoire.isPublic}
                />
              </aside>
            </div>

            <RepertoireSongSection
              repertoire={repertoire}
              resolvedSongs={resolvedSongs}
              songItems={songItems}
              totalSongs={totalSongs}
            />

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
    </RepertoirePageClient>
  );
}
