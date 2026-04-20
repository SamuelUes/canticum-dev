import * as functions from 'firebase-functions';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import '../../shared/firebaseAdmin';
import {
  getBodyRecord,
  getOptionalAuthContext,
  getPathSegments,
  handlePreflight,
  resolveRequestUserId,
  sendError,
  sendJson
} from '../../shared/http/http';
import { resolveIsPremium } from '../../shared/plan/planLimits';

interface SongPreferencePayload {
  currentVersionId?: string;
  currentInstrumentId?: string;
}

function isOwnerOrAdmin(targetUserId: string, authUid: string | null, role?: string): boolean {
  if (role === 'admin') {
    return true;
  }

  return Boolean(authUid && authUid === targetUserId);
}

function normalizePreferencePayload(payload: unknown): SongPreferencePayload {
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  const raw = payload as Record<string, unknown>;

  return {
    currentVersionId: typeof raw.currentVersionId === 'string' ? raw.currentVersionId : undefined,
    currentInstrumentId: typeof raw.currentInstrumentId === 'string' ? raw.currentInstrumentId : undefined
  };
}

function isPremiumVersion(version: Record<string, unknown>): boolean {
  return Boolean(version.isPremium);
}

interface SongImage { url: string; width?: number; height?: number; }

function normalizeImages(raw: unknown, fallbackUrl?: string): SongImage[] | undefined {
  if (Array.isArray(raw)) {
    const list = raw
      .map((entry): SongImage | null => {
        if (!entry || typeof entry !== 'object') return null;
        const obj = entry as Record<string, unknown>;
        const url = typeof obj.url === 'string' ? obj.url : '';
        if (!url) return null;
        const width = Number(obj.width);
        const height = Number(obj.height);
        return {
          url,
          width: Number.isFinite(width) && width > 0 ? width : undefined,
          height: Number.isFinite(height) && height > 0 ? height : undefined
        };
      })
      .filter((value): value is SongImage => value !== null);
    if (list.length > 0) return list;
  }
  return fallbackUrl ? [{ url: fallbackUrl }] : undefined;
}

function computePopularity(raw: unknown, totalViews: number): number {
  const stored = Number(raw);
  if (Number.isFinite(stored) && stored >= 0) return Math.min(100, Math.round(stored));
  if (!Number.isFinite(totalViews) || totalViews <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(Math.log10(totalViews + 1) * 20)));
}

export const songs = functions.https.onRequest(async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }

  const segments = getPathSegments(req);

  if (!segments.length) {
    sendError(res, 404, 'not_found', 'Endpoint not found.');
    return;
  }

  const songId = segments[0];
  const authContext = await getOptionalAuthContext(req);
  const requestUserId = resolveRequestUserId(req, authContext);
  const db = getFirestore();

  if (segments.length === 1 && req.method === 'GET') {
    const songSnap = await db.collection('songs').doc(songId).get();

    if (!songSnap.exists) {
      sendError(res, 404, 'not_found', 'Song not found.');
      return;
    }

    const songData = (songSnap.data() ?? {}) as Record<string, unknown>;
    const versionsSnap = await songSnap.ref.collection('versions').get();

    const userDocSnap = requestUserId ? await db.collection('users').doc(requestUserId).get() : null;
    const userData = (userDocSnap?.data() ?? {}) as Record<string, unknown>;
    const isPremiumUser = Boolean(authContext?.token.premium ?? userData.premium ?? false);

    const songUnlockSnap = requestUserId
      ? await db.collection('users').doc(requestUserId).collection('songUnlocks').doc(songId).get()
      : null;

    const hasSongUnlock = Boolean(songUnlockSnap?.exists);

    const rawVersions: Array<Record<string, unknown> & { id: string }> = versionsSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>)
    }));
    const visibleVersions = rawVersions.filter((version) => {
      if (!isPremiumVersion(version)) {
        return true;
      }

      return isPremiumUser || hasSongUnlock;
    });

    const versions = (visibleVersions.length ? visibleVersions : rawVersions).map((version) => ({
      id: String(version.id),
      songId: String(version.songId ?? songId),
      versionId: String(version.versionId ?? version.id),
      versionName: String(version.versionName ?? version.label ?? 'Versión'),
      artistId: typeof version.artistId === 'string' ? version.artistId : undefined,
      instrumentId: typeof version.instrumentId === 'string' ? version.instrumentId : undefined,
      tone: typeof version.tone === 'string' ? version.tone : undefined,
      notationType: typeof version.notationType === 'string' ? version.notationType : undefined,
      audioReferenceUrl: typeof version.audioReferenceUrl === 'string' ? version.audioReferenceUrl : undefined,
      artistName: String(version.artistName ?? songData.artistName ?? ''),
      instrumentName: typeof version.instrumentName === 'string' ? version.instrumentName : undefined,
      label: String(version.label ?? version.versionName ?? 'Versión'),
      isPremium: Boolean(version.isPremium)
    }));

    const instrumentMap = new Map<string, { id: string; name: string }>();

    versions.forEach((version) => {
      if (version.instrumentId) {
        instrumentMap.set(version.instrumentId, {
          id: version.instrumentId,
          name: version.instrumentName ?? version.instrumentId
        });
      }
    });

    const currentVersionId = String(songData.currentVersionId ?? versions[0]?.id ?? '');
    const currentInstrumentId = String(songData.currentInstrumentId ?? instrumentMap.values().next().value?.id ?? '');

    // ---- Spotify-aligned fields ----
    const title = String(songData.title ?? '');
    const primaryArtistName = String(songData.artistName ?? songData.author ?? '');
    const audioUrl = typeof songData.audioUrl === 'string' ? songData.audioUrl : undefined;
    const images = normalizeImages(
      songData.images,
      typeof songData.thumbnailUrl === 'string' ? (songData.thumbnailUrl as string) : undefined
    );
    const totalViews = Number(songData.totalViews ?? 0) || 0;
    const popularity = computePopularity(songData.popularity, totalViews);
    const durationMs = typeof songData.durationMs === 'number'
      ? songData.durationMs
      : typeof songData.duration_ms === 'number'
        ? (songData.duration_ms as number)
        : undefined;
    const trackNumber = typeof songData.trackNumber === 'number' ? songData.trackNumber : undefined;
    const discNumber = typeof songData.discNumber === 'number' ? songData.discNumber : 1;
    const isrc = typeof songData.isrc === 'string' ? (songData.isrc as string) : undefined;

    // Build `artists[]` list (falls back to `[{ name: artistName }]`).
    const rawArtists = Array.isArray(songData.artists) ? (songData.artists as Array<Record<string, unknown>>) : null;
    const artists = rawArtists && rawArtists.length > 0
      ? rawArtists.map((entry) => ({
          id: String(entry.id ?? ''),
          name: String(entry.name ?? ''),
          type: 'artist' as const,
          href: typeof entry.href === 'string' ? entry.href : undefined
        }))
      : primaryArtistName
        ? [{
            id: typeof songData.artistId === 'string' ? (songData.artistId as string) : '',
            name: primaryArtistName,
            type: 'artist' as const
          }]
        : [];

    // Build simplified `album` (embedded) if the song declares one.
    const rawAlbum = songData.album && typeof songData.album === 'object'
      ? (songData.album as Record<string, unknown>)
      : typeof songData.albumId === 'string' && songData.albumId
        ? { id: songData.albumId as string, name: String(songData.albumTitle ?? ''), albumType: 'album', totalTracks: 0 }
        : null;
    const album = rawAlbum
      ? {
          id: String(rawAlbum.id ?? ''),
          name: String(rawAlbum.name ?? rawAlbum.title ?? ''),
          type: 'album' as const,
          albumType: String(rawAlbum.albumType ?? 'album'),
          totalTracks: Number(rawAlbum.totalTracks ?? 0),
          images: normalizeImages(rawAlbum.images, typeof rawAlbum.coverUrl === 'string' ? (rawAlbum.coverUrl as string) : undefined),
          releaseDate: typeof rawAlbum.releaseDate === 'string' ? rawAlbum.releaseDate : undefined,
          releaseDatePrecision: typeof rawAlbum.releaseDatePrecision === 'string' ? rawAlbum.releaseDatePrecision : undefined,
          artists: artists.length > 0 ? artists : undefined
        }
      : undefined;

    sendJson(res, 200, {
      id: songSnap.id,
      // Spotify-aligned discriminator + alias
      type: 'song',
      name: title,
      title,
      artistName: primaryArtistName,
      artists,
      album,
      images,
      durationMs,
      trackNumber,
      discNumber,
      externalIds: isrc ? { isrc } : undefined,
      externalUrls: {
        canticum: `/songs/${songSnap.id}`
      },
      popularity,
      // Canticum-specific fields
      author: typeof songData.author === 'string' ? songData.author : undefined,
      year: typeof songData.year === 'number' ? songData.year : undefined,
      status: String(songData.status ?? 'draft').toLowerCase(),
      createdBy: String(songData.createdBy ?? ''),
      lyrics: String(songData.lyrics ?? ''),
      sheet: typeof songData.sheet === 'string' ? songData.sheet : undefined,
      // Back-compat audio alias + Spotify-style `previewUrl`
      audioUrl,
      previewUrl: audioUrl ?? null,
      currentVersionId,
      currentInstrumentId,
      userAccess: {
        isAuthenticated: Boolean(authContext?.uid),
        isPremiumUser,
        hasSongUnlock,
        canPurchaseIndividually: Boolean(songData.canPurchaseIndividually),
        individualPriceUsd: typeof songData.individualPriceUsd === 'number' ? songData.individualPriceUsd : undefined
      },
      versions,
      instruments: Array.from(instrumentMap.values())
    });
    return;
  }

  if (segments.length === 2 && segments[1] === 'preferences' && req.method === 'GET') {
    if (!requestUserId) {
      sendError(res, 400, 'invalid_argument', 'userId is required.');
      return;
    }

    if (!isOwnerOrAdmin(requestUserId, authContext?.uid ?? null, authContext?.token.role as string | undefined)) {
      sendError(res, 403, 'forbidden', 'Cannot read preferences for another user.');
      return;
    }

    const preferenceSnap = await db.collection('users').doc(requestUserId).collection('songPreferences').doc(songId).get();

    if (!preferenceSnap.exists) {
      sendJson(res, 200, { preferences: {} });
      return;
    }

    const preferenceData = preferenceSnap.data() as Record<string, unknown>;
    const preferences = normalizePreferencePayload(preferenceData.preferences ?? preferenceData);

    sendJson(res, 200, preferences);
    return;
  }

  if (segments.length === 2 && segments[1] === 'preferences' && req.method === 'POST') {
    const body = getBodyRecord(req);
    const rawPreferences = normalizePreferencePayload(body.preferences);

    if (!requestUserId) {
      sendError(res, 400, 'invalid_argument', 'userId is required.');
      return;
    }

    if (!isOwnerOrAdmin(requestUserId, authContext?.uid ?? null, authContext?.token.role as string | undefined)) {
      sendError(res, 403, 'forbidden', 'Cannot update preferences for another user.');
      return;
    }

    await db.collection('users').doc(requestUserId).collection('songPreferences').doc(songId).set(
      {
        userId: requestUserId,
        songId,
        preferences: rawPreferences,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    sendJson(res, 200, { ok: true });
    return;
  }

  if (segments.length === 2 && segments[1] === 'purchase-intent' && req.method === 'POST') {
    if (!requestUserId) {
      sendError(res, 400, 'invalid_argument', 'userId is required.');
      return;
    }

    if (!isOwnerOrAdmin(requestUserId, authContext?.uid ?? null, authContext?.token.role as string | undefined)) {
      sendError(res, 403, 'forbidden', 'Cannot create purchase intent for another user.');
      return;
    }

    const checkoutBaseUrl = (process.env.CHECKOUT_BASE_URL ?? 'https://checkout.canticum.app/session').replace(/\/$/, '');
    const checkoutUrl = `${checkoutBaseUrl}/${encodeURIComponent(songId)}?uid=${encodeURIComponent(requestUserId)}`;

    await db.collection('users').doc(requestUserId).collection('purchaseIntents').doc(songId).set(
      {
        songId,
        userId: requestUserId,
        status: 'pending',
        checkoutUrl,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    sendJson(res, 200, { checkoutUrl });
    return;
  }

  if (segments.length === 2 && segments[1] === 'transpose' && req.method === 'POST') {
    if (!requestUserId) {
      sendError(res, 401, 'unauthorized', 'Authenticated user required.');
      return;
    }

    const premium = await resolveIsPremium(requestUserId, authContext?.token ?? null);
    if (!premium) {
      sendError(res, 403, 'plan_limit', 'La transposici\u00f3n libre es una funci\u00f3n Premium. Actualiza tu plan para usarla.');
      return;
    }

    const body = getBodyRecord(req);
    const semitones = typeof body.semitones === 'number' ? body.semitones : 0;
    const targetTone = typeof body.targetTone === 'string' ? body.targetTone : undefined;

    sendJson(res, 200, {
      ok: true,
      songId,
      semitones,
      targetTone,
      message: 'Transpose applied (client-side rendering).'
    });
    return;
  }

  if (segments.length === 2 && segments[1] === 'download' && req.method === 'GET') {
    if (!requestUserId) {
      sendError(res, 401, 'unauthorized', 'Authenticated user required.');
      return;
    }

    const premiumDl = await resolveIsPremium(requestUserId, authContext?.token ?? null);
    if (!premiumDl) {
      sendError(res, 403, 'plan_limit', 'La descarga offline es una funci\u00f3n Premium. Actualiza tu plan para usarla.');
      return;
    }

    const songSnap = await db.collection('songs').doc(songId).get();
    if (!songSnap.exists) {
      sendError(res, 404, 'not_found', 'Song not found.');
      return;
    }

    sendJson(res, 200, {
      ok: true,
      songId,
      downloadReady: true,
      message: 'Download authorized for Premium user.'
    });
    return;
  }

  sendError(res, 404, 'not_found', 'Endpoint not found.');
});
