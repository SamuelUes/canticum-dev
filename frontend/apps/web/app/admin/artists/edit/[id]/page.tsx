import { ArtistsEditWorkspace } from '../../../../../src/components/admin/ArtistsEditWorkspace';

export default function EditArtistPage({ params }: { params: { id: string } }) {
  const artistId = Number.parseInt(params.id, 10);

  if (!Number.isFinite(artistId) || artistId <= 0) {
    return (
      <div style={{ padding: '24px' }}>
        <h1>ID de artista inválido</h1>
        <a href="/admin">Volver al panel</a>
      </div>
    );
  }

  return <ArtistsEditWorkspace artistId={artistId} />;
}
