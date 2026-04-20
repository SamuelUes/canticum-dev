import Link from 'next/link';
import { notFound } from 'next/navigation';
import { HomeFooter } from '../../../src/components/home/Footer';
import { Header } from '../../../src/components/home/Header';
import { homeMockData } from '../../../src/features/home/mockData';
import { getSchemaDetailById } from '../../../src/features/schema/repository';
import { getHomeText } from '../../../src/i18n/home';
import type { Locale } from '../../../src/types/home';

interface SchemaPageProps {
  params: {
    schemaId: string;
  };
}

export default async function SchemaPage({ params }: SchemaPageProps) {
  const locale: Locale = 'es';
  const text = getHomeText(locale);
  const schema = await getSchemaDetailById(params.schemaId);
  const currentUserId = 'user-1';
  const isOwner = schema?.ownerUserId === currentUserId;

  if (!schema) {
    notFound();
  }

  const resolvedSongs = schema.songs ?? schema.songIds.map((id) => ({ id, title: id, artistName: undefined }));
  const songItems = resolvedSongs.map((song) => ({
    songId: song.id,
    name: song.title,
    artistName: song.artistName
  }));
  const totalSongs = songItems.length;
  const totalSheets = totalSongs;

  return (
    <main className="home-page search-page-root">
      <div className="home-shell search-page-shell">
        <Header text={text} />

        <section className="search-results-panel">
          <header className="search-results-head">
            <h1>Esquema seleccionado</h1>
            <p>{schema.title}</p>
          </header>

          <article className="search-generic-card schema-detail-card">
            <strong>{schema.liturgicalType}</strong>
            <small>{schema.description}</small>
            <small>Creado por: {schema.createdBy}</small>
            <small>{schema.isPublic ? 'Esquema público' : 'Esquema privado'}</small>
            <small>Estado: {schema.status}</small>
            <small>Fecha: {schema.createdAt}</small>
            <small>Canciones: {totalSongs} · Partituras: {totalSheets}</small>
          </article>

          <section className="schema-song-list" aria-label="canciones del esquema">
            <h2>Canciones del esquema</h2>
            <div className="schema-song-grid">
              {songItems.map((song, index) => (
                <Link key={song.songId} href={`/songs/${song.songId}`} className="schema-song-item">
                  <span className="schema-song-num">{String(index + 1).padStart(2, '0')}</span>
                  <strong>{song.name}</strong>
                  {song.artistName ? <small>{song.artistName}</small> : null}
                </Link>
              ))}
            </div>
          </section>

          {isOwner ? (
            <div className="schema-edit-actions">
              <Link href={`/schemas/${schema.id}/edit`} className="song-premium-badge">
                Editar esquema
              </Link>
              <Link href={`/schemas/${schema.id}/edit`} className="song-premium-badge is-buy">
                Eliminar esquema
              </Link>
            </div>
          ) : null}
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
