import { cookies } from 'next/headers';
import { HomeFooter } from '../../src/components/home/Footer';
import { Header } from '../../src/components/home/Header';
import { MyrepertoiresWorkspace } from '../../src/components/repertoire/MyRepertoiresWorkspace';
import { homeMockData } from '../../src/features/home/mockData';
import { getUserrepertoires } from '../../src/features/repertoire/repository';
import { getHomeText } from '../../src/i18n/home';
import type { Locale } from '../../src/types/home';
import type { repertoireListItem } from '../../src/types/repertoire';

async function resolveUidFromSessionCookie(): Promise<string | null> {
  try {
    const sessionCookie = cookies().get('__session')?.value;
    if (!sessionCookie) {
      return null;
    }

    // The __session cookie is a Firebase ID token (JWT). Decode the payload non-verifyingly
    // to read the `user_id`/`sub` claim. SSR uses this only as an optimistic hint; the
    // backend always re-verifies on the actual API call.
    const segments = sessionCookie.split('.');
    if (segments.length < 2) {
      return null;
    }

    const payloadJson = Buffer.from(segments[1], 'base64').toString('utf-8');
    const payload = JSON.parse(payloadJson) as { user_id?: unknown; sub?: unknown };
    const uid = typeof payload.user_id === 'string' ? payload.user_id : typeof payload.sub === 'string' ? payload.sub : null;
    return uid;
  } catch {
    return null;
  }
}

export default async function repertoiresPage() {
  const locale: Locale = 'es';
  const text = getHomeText(locale);

  // Hybrid resolution: try to grab the UID from the __session cookie on the server so SSR can
  // pre-render the user's repertoires. If unavailable (logged-out SSR or invalid cookie), the
  // client component will refetch with the live Firebase ID token at mount.
  const uid = await resolveUidFromSessionCookie();
  let initialItems: repertoireListItem[] = [];
  if (uid) {
    try {
      initialItems = await getUserrepertoires(uid);
    } catch {
      initialItems = [];
    }
  }

  return (
    <main className="home-page search-page-root">
      <div className="home-shell search-page-shell">
        <Header text={text} />

        <MyrepertoiresWorkspace items={initialItems} />

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
