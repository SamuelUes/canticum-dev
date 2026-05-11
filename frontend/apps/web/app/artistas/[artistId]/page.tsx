import { redirect } from 'next/navigation';

interface ArtistRedirectPageProps {
  params: {
    artistId: string;
  };
  searchParams?: {
    id?: string | string[];
  };
}

export default function ArtistRedirectPage({ params, searchParams }: ArtistRedirectPageProps) {
  const rawId = searchParams?.id;
  const explicitId = Array.isArray(rawId) ? rawId[0] : rawId;
  const suffix = explicitId && explicitId.trim().length > 0
    ? `?id=${encodeURIComponent(explicitId.trim())}`
    : '';
  redirect(`/artists/${params.artistId}${suffix}`);
}
