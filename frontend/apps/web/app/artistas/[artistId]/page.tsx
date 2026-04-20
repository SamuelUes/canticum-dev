import { redirect } from 'next/navigation';

interface ArtistRedirectPageProps {
  params: {
    artistId: string;
  };
}

export default function ArtistRedirectPage({ params }: ArtistRedirectPageProps) {
  redirect(`/artists/${params.artistId}`);
}
