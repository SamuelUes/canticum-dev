import { redirect } from 'next/navigation';

interface SongPageProps {
  params: {
    songId: string;
  };
}

export default async function SongPage({ params }: SongPageProps) {
  redirect(`/songs/${params.songId}`);
}
