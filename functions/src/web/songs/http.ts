import * as functions from 'firebase-functions/v1';
import { FieldValue } from 'firebase-admin/firestore';
import { getAppFirestore } from '../../shared/firestore';
import '../../shared/firebaseAdmin';
import {
  addVersionsToExistingSong,
  createSongDraftInCloudSql,
  deleteSongByIdInCloudSql,
  deleteVersionsByIdsInCloudSql,
  incrementSongViewInCloudSql,
  type VersionInput,
  updateSongMetadataInCloudSql,
  type UpdateSongMetadataInput,
  updateSongVersionInCloudSql,
  type UpdateSongVersionInput
} from '../../shared/cloudSql/songs';
import { createArtist, getArtistById } from '../../shared/cloudSql/artists';
import {
  getClientIp,
  getBodyRecord,
  getOptionalAuthContext,
  getPathSegments,
  handlePreflight,
  resolveRequestUserId,
  sendError,
  sendJson
} from '../../shared/http/http';
import { applyRateLimitHeaders, checkRateLimit } from '../../shared/rateLimit';
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

function isSongPremium(songData: Record<string, unknown>, versions: Array<Record<string, unknown>>): boolean {
  if (Boolean(songData.isPremium)) {
    return true;
  }

  return versions.some((version) => isPremiumVersion(version));
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

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  return [];
}
/*------*/
const SONG_STATE_VALUES = ['DRAFT', 'UPLOADED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED', 'ARCHIVED'] as const;

function normalizeSongState(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  return SONG_STATE_VALUES.includes(value as typeof SONG_STATE_VALUES[number]) ? value : 'DRAFT';
}

function readOptionalTrimmedString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return undefined;
}

function readNullableTrimmedString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  const normalized = readOptionalTrimmedString(value);
  return normalized === undefined ? undefined : normalized;
}
/*------*/

async function resolveSongSnapshotByAnyId(
  db: FirebaseFirestore.Firestore,
  songId: string
): Promise<FirebaseFirestore.DocumentSnapshot | null> {
  const directSnap = await db.collection('songs').doc(songId).get();
  if (directSnap.exists) {
    return directSnap;
  }

  const numericId = Number(songId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return null;
  }

  const bySqlSong = await db
    .collection('songs')
    .where('sqlSongId', '==', numericId)
    .limit(1)
    .get();

  if (!bySqlSong.empty) {
    return bySqlSong.docs[0];
  }

  try {
    const bySqlVersion = await db
      .collectionGroup('versions')
      .where('sqlSongVersionId', '==', numericId)
      .limit(1)
      .get();

    if (!bySqlVersion.empty) {
      const versionData = (bySqlVersion.docs[0].data() ?? {}) as Record<string, unknown>;
      const parentSongId = typeof versionData.songId === 'string' ? versionData.songId : '';
      if (parentSongId) {
        const parentSongSnap = await db.collection('songs').doc(parentSongId).get();
        if (parentSongSnap.exists) {
          return parentSongSnap;
        }
      }
    }
  } catch {
  }

  return null;
}

function resolveSqlSongIdFromSongSnapshot(songId: string, songData: Record<string, unknown>): number | null {
  const fromDoc = Number(songData.sqlSongId);
  if (Number.isFinite(fromDoc) && fromDoc > 0) {
    return Math.floor(fromDoc);
  }

  const direct = Number(songId);
  if (Number.isFinite(direct) && direct > 0) {
    return Math.floor(direct);
  }

  return null;
}

export const songs = functions.https.onRequest(async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }

  const segments = getPathSegments(req);

  // ── POST /songs  →  create a new song draft OR add versions to existing ──
  if (!segments.length && req.method === 'POST') {
    const authContext = await getOptionalAuthContext(req);
    if (!authContext) {
      sendError(res, 401, 'unauthorized', 'Authenticated user required.');
      return;
    }

    const createLimiter = await checkRateLimit(authContext.uid, 'songs_create_or_add_version', 30, 3600);
    applyRateLimitHeaders(res, 30, createLimiter);
    if (!createLimiter.allowed) {
      res.set('Retry-After', String(createLimiter.retryAfterSeconds));
      sendError(res, 429, 'too_many_requests', `Too many song write operations. Retry in ${createLimiter.retryAfterSeconds}s.`);
      return;
    }

    const body = getBodyRecord(req);
    const uid = authContext.uid;
    const db = getAppFirestore();

    const mode = typeof body.mode === 'string' && body.mode.trim() === 'addVersion' ? 'addVersion' : 'new';
    const role = (authContext.token.role as string | undefined) ?? '';
    const isAdmin = role === 'admin';

    // ── Helper: build version inputs from raw body, resolving artists ──
    const buildVersionInputs = async (
      rawVersions: Array<Record<string, unknown>>,
      defaultArtistId: number | null,
      defaultArtistName: string | null
    ): Promise<VersionInput[]> => {
      const out: VersionInput[] = [];
      for (const rv of rawVersions) {
        const vName = typeof rv.versionName === 'string' && rv.versionName.trim() ? rv.versionName.trim() : 'Versión 1';
        const instrName = typeof rv.instrumentName === 'string' && rv.instrumentName.trim() ? rv.instrumentName.trim() : 'Letra';
        let vArtistId: number | null = null;
        let vArtistName: string | null = null;

        if (typeof rv.artistId === 'number' && rv.artistId > 0) {
          vArtistId = rv.artistId;
          try {
            const a = await getArtistById(vArtistId);
            if (a) vArtistName = a.name;
          } catch { /* keep null */ }
        } else if (rv.isOwnVersion === true) {
          vArtistId = defaultArtistId;
          vArtistName = defaultArtistName ?? uid;
        } else if (typeof rv.artistName === 'string' && rv.artistName.trim()) {
          try {
            const created = await createArtist(String(rv.artistName).trim(), 'unknown');
            vArtistId = created.id;
            vArtistName = created.name;
          } catch {
            vArtistName = String(rv.artistName).trim();
          }
        }

        out.push({
          versionName: vName,
          instrumentName: instrName,
          artistId: vArtistId,
          artistName: vArtistName,
          tone: typeof rv.tone === 'string' ? rv.tone.trim() || null : null,
          notationType: typeof rv.notationType === 'string' ? rv.notationType.trim() || null : null,
          audioReferenceUrl: typeof rv.audioReferenceUrl === 'string' ? rv.audioReferenceUrl.trim() || null : null
        });
      }
      return out;
    };

    // ╔══════════════════════════════════════════╗
    // ║          mode = 'addVersion'             ║
    // ╚══════════════════════════════════════════╝
    if (mode === 'addVersion') {
      const targetSongId = typeof body.songId === 'string' ? body.songId.trim() : '';
      if (!targetSongId) {
        sendError(res, 400, 'invalid_argument', 'songId is required when mode=addVersion.');
        return;
      }

      const songRef = db.collection('songs').doc(targetSongId);
      const songSnap = await songRef.get();
      if (!songSnap.exists) {
        sendError(res, 404, 'not_found', 'Target song not found.');
        return;
      }
      const songData = (songSnap.data() ?? {}) as Record<string, unknown>;
      const songSqlId = Number(songData.sqlSongId);
      if (!Number.isFinite(songSqlId) || songSqlId <= 0) {
        sendError(res, 422, 'invalid_state', 'Target song has no Cloud SQL projection.');
        return;
      }

      // Permissions: DRAFT → only owner/admin; published → any authenticated.
      const status = typeof songData.status === 'string' ? songData.status.toUpperCase() : '';
      const ownerUid = typeof songData.ownerUserId === 'string' ? songData.ownerUserId : (typeof songData.createdBy === 'string' ? songData.createdBy : '');
      if (status === 'DRAFT' && !isAdmin && ownerUid && ownerUid !== uid) {
        sendError(res, 403, 'forbidden', 'Only the owner can add versions to a draft song.');
        return;
      }

      const rawVersions = Array.isArray(body.versions) ? body.versions as Array<Record<string, unknown>> : [];
      if (rawVersions.length === 0) {
        sendError(res, 400, 'invalid_argument', 'At least one version is required.');
        return;
      }

      const songArtistIdNum = typeof songData.artistId === 'string' ? Number(songData.artistId) : NaN;
      const versionInputs = await buildVersionInputs(
        rawVersions,
        Number.isFinite(songArtistIdNum) ? songArtistIdNum : null,
        typeof songData.artistName === 'string' ? songData.artistName : null
      );

      let sqlVersions: Array<{ id: number; versionName: string; instrumentId: number | null; instrumentName: string | null; artistId: number | null; artistName: string | null; audioReferenceUrl: string | null }> = [];
      try {
        sqlVersions = await addVersionsToExistingSong(songSqlId, versionInputs);
      } catch (error) {
        console.error('Cloud SQL addVersions failed:', error);
        sendError(res, 500, 'internal_error', 'Failed to add versions in Cloud SQL.');
        return;
      }

      // Project versions to Firestore. Use client-provided Firestore IDs when given.
      const versionsCollection = songRef.collection('versions');
      const clientVersionIds: Array<string | undefined> = rawVersions.map((rv) =>
        typeof rv.versionDocId === 'string' && rv.versionDocId.trim() ? rv.versionDocId.trim() : undefined
      );

      try {
        const batch = db.batch();
        const createdVersionIds: string[] = [];

        sqlVersions.forEach((sv, index) => {
          const vi = versionInputs[index];
          const rv = rawVersions[index];
          const ref = clientVersionIds[index]
            ? versionsCollection.doc(clientVersionIds[index] as string)
            : versionsCollection.doc();
          const versionLabel = sv.instrumentName ? `${sv.versionName} · ${sv.instrumentName}` : sv.versionName;
          createdVersionIds.push(ref.id);

          batch.set(ref, {
            songId: songRef.id,
            versionId: ref.id,
            sqlSongVersionId: sv.id,
            versionName: sv.versionName,
            artistName: sv.artistName ?? vi.artistName ?? songData.artistName ?? null,
            artistId: sv.artistId ? String(sv.artistId) : null,
            instrumentId: sv.instrumentId ? String(sv.instrumentId) : null,
            instrumentName: sv.instrumentName ?? vi.instrumentName ?? null,
            tone: vi.tone ?? null,
            notationType: vi.notationType ?? null,
            audioReferenceUrl: sv.audioReferenceUrl ?? vi.audioReferenceUrl ?? null,
            coverImageUrl: typeof rv?.coverImageUrl === 'string' && rv.coverImageUrl.trim() ? rv.coverImageUrl.trim() : null,
            lyrics: typeof rv.lyrics === 'string' ? rv.lyrics : '',
            lyricsFileUrl: typeof rv.lyricsFileUrl === 'string' && rv.lyricsFileUrl.trim() ? rv.lyricsFileUrl.trim() : null,
            sheetFileUrl: typeof rv.sheetFileUrl === 'string' && rv.sheetFileUrl.trim() ? rv.sheetFileUrl.trim() : null,
            isPremium: false,
            label: versionLabel,
            createdBy: uid,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          });
        });

        // Update parent song updatedAt + currentVersionId to most recent created.
        const newCurrentVersionId = createdVersionIds[createdVersionIds.length - 1];
        const newestRawVersion = rawVersions[rawVersions.length - 1] ?? {};
        const newestCoverImageUrl = typeof newestRawVersion.coverImageUrl === 'string' && newestRawVersion.coverImageUrl.trim()
          ? newestRawVersion.coverImageUrl.trim()
          : '';

        batch.update(songRef, {
          updatedAt: FieldValue.serverTimestamp(),
          currentVersionId: newCurrentVersionId,
          ...(newestCoverImageUrl
            ? {
                coverImageUrl: newestCoverImageUrl,
                thumbnailUrl: newestCoverImageUrl,
                images: [{ url: newestCoverImageUrl }]
              }
            : {})
        });

        await batch.commit();

        sendJson(res, 201, {
          ok: true,
          songId: songRef.id,
          versionIds: createdVersionIds,
          sqlSongId: songSqlId,
          sqlVersionIds: sqlVersions.map((sv) => sv.id)
        });
      } catch (error) {
        console.error('Firestore addVersion projection failed:', error);
        try {
          await deleteVersionsByIdsInCloudSql(sqlVersions.map((sv) => sv.id));
        } catch (rollbackError) {
          console.error('Cloud SQL rollback for addVersion failed:', rollbackError);
        }
        sendError(res, 500, 'internal_error', 'Failed to project versions to Firestore.');
      }
      return;
    }

    // ╔══════════════════════════════════════════╗
    // ║          mode = 'new' (default)          ║
    // ╚══════════════════════════════════════════╝
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      sendError(res, 400, 'invalid_argument', 'title is required.');
      return;
    }

    // Allow client-supplied Firestore song doc id so file uploads can use final paths.
    const clientSongId = typeof body.songDocId === 'string' && body.songDocId.trim() ? body.songDocId.trim() : '';
    const songRef = clientSongId
      ? db.collection('songs').doc(clientSongId)
      : db.collection('songs').doc();
    const artistName = typeof body.artistName === 'string' ? body.artistName.trim() : '';
    const coverImageUrl = typeof body.coverImageUrl === 'string' ? body.coverImageUrl.trim() : '';

    // ── Resolve song-level artist ──
    let songArtistId: number | null = null;
    let resolvedArtistName = artistName;
    if (typeof body.artistId === 'number' && body.artistId > 0) {
      songArtistId = body.artistId;
      try {
        const existing = await getArtistById(songArtistId);
        if (existing) resolvedArtistName = existing.name;
      } catch { /* keep name from body */ }
    } else if (artistName) {
      try {
        const created = await createArtist(artistName, 'unknown');
        songArtistId = created.id;
        resolvedArtistName = created.name;
      } catch { /* artist_id stays null */ }
    }

    // ── Build versions array from body ──
    const rawVersions = Array.isArray(body.versions) ? body.versions as Array<Record<string, unknown>> : [];
    let versionInputs: VersionInput[] = [];

    if (rawVersions.length > 0) {
      versionInputs = await buildVersionInputs(rawVersions, songArtistId, resolvedArtistName || null);
    } else {
      // Fallback: create one default version
      const instruments = normalizeStringArray(body.instruments ?? body.instrumentation);
      const normalizedInstruments = instruments.length > 0 ? instruments : ['Letra'];
      const fallbackVersionName = typeof body.versionName === 'string' && body.versionName.trim()
        ? body.versionName.trim() : 'Versión 1';
      const songTone = typeof body.tone === 'string' ? body.tone.trim() || null : null;
      const songNotationType = typeof body.notationType === 'string' ? body.notationType.trim() || null : null;
      const songAudioReferenceUrl = typeof body.audioReferenceUrl === 'string' ? body.audioReferenceUrl.trim() || null : null;

      for (const instrName of normalizedInstruments) {
        versionInputs.push({
          versionName: fallbackVersionName,
          instrumentName: instrName,
          artistId: songArtistId,
          artistName: resolvedArtistName || null,
          tone: songTone,
          notationType: songNotationType,
          audioReferenceUrl: songAudioReferenceUrl
        });
      }
    }

    let sqlSongId: number;
    let sqlVersions: Array<{ id: number; versionName: string; instrumentId: number | null; instrumentName: string | null; artistId: number | null; artistName: string | null; audioReferenceUrl: string | null }> = [];
    try {
      const sqlSong = await createSongDraftInCloudSql({
        firebaseUid: uid,
        title,
        year: typeof body.year === 'number' ? body.year : null,
        liturgicalUse: typeof body.liturgicalUse === 'string' ? body.liturgicalUse : 'General',
        filePath: `songs/${songRef.id}`,
        previewUrl: null,
        artistId: songArtistId,
        coverImageUrl: coverImageUrl || null,
        versions: versionInputs
      });
      sqlSongId = sqlSong.id;
      sqlVersions = sqlSong.versions;
    } catch (error) {
      console.error('Cloud SQL draft insert failed:', error);
      sendError(res, 500, 'internal_error', 'Failed to create song draft in Cloud SQL.');
      return;
    }

    try {
      const versionsCollection = songRef.collection('versions');
      const clientVersionIds: Array<string | undefined> = rawVersions.map((rv) =>
        typeof rv.versionDocId === 'string' && rv.versionDocId.trim() ? rv.versionDocId.trim() : undefined
      );
      const versionRefs = sqlVersions.length > 0
        ? sqlVersions.map((_, idx) => clientVersionIds[idx]
          ? versionsCollection.doc(clientVersionIds[idx] as string)
          : versionsCollection.doc())
        : [versionsCollection.doc()];

      const firstVersionRef = versionRefs[0];
      const firstSqlVersion = sqlVersions[0];

      const batch = db.batch();

      // NOTE: lyrics no longer projected on song doc; lives on each version doc instead.
      const firstRawVersion = rawVersions[0] ?? {};
      const firstVersionCoverImageUrl = typeof firstRawVersion.coverImageUrl === 'string' && firstRawVersion.coverImageUrl.trim()
        ? firstRawVersion.coverImageUrl.trim()
        : '';
      const songCoverUrl = firstVersionCoverImageUrl || coverImageUrl;

      batch.set(songRef, {
        title,
        artistName: resolvedArtistName,
        author: resolvedArtistName,
        artistId: songArtistId ? String(songArtistId) : null,
        year: typeof body.year === 'number' ? body.year : null,
        liturgicalType: typeof body.liturgicalUse === 'string' ? body.liturgicalUse : 'General',
        status: 'DRAFT',
        createdBy: uid,
        ownerUserId: uid,
        sqlSongId,
        currentVersionId: firstVersionRef.id,
        currentInstrumentId: firstSqlVersion?.instrumentId ? String(firstSqlVersion.instrumentId) : '',
        ...(songCoverUrl
          ? {
              coverImageUrl: songCoverUrl,
              thumbnailUrl: songCoverUrl,
              images: [{ url: songCoverUrl }]
            }
          : {}),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      versionRefs.forEach((versionRef, index) => {
        const sv = sqlVersions[index];
        const vi = versionInputs[index];
        const rv = rawVersions[index] ?? {};
        const versionLabel = sv?.instrumentName
          ? `${sv.versionName} · ${sv.instrumentName}`
          : sv?.versionName ?? 'Versión 1';

        batch.set(versionRef, {
          songId: songRef.id,
          versionId: versionRef.id,
          sqlSongVersionId: sv?.id ?? null,
          versionName: sv?.versionName ?? vi?.versionName ?? 'Versión 1',
          artistName: sv?.artistName ?? vi?.artistName ?? resolvedArtistName,
          artistId: sv?.artistId ? String(sv.artistId) : null,
          instrumentId: sv?.instrumentId ? String(sv.instrumentId) : null,
          instrumentName: sv?.instrumentName ?? vi?.instrumentName ?? null,
          tone: vi?.tone ?? null,
          notationType: vi?.notationType ?? null,
          audioReferenceUrl: sv?.audioReferenceUrl ?? vi?.audioReferenceUrl ?? null,
          coverImageUrl: typeof rv.coverImageUrl === 'string' && rv.coverImageUrl.trim() ? rv.coverImageUrl.trim() : null,
          lyrics: typeof rv.lyrics === 'string' ? rv.lyrics : (typeof body.lyrics === 'string' ? body.lyrics : ''),
          lyricsFileUrl: typeof rv.lyricsFileUrl === 'string' && rv.lyricsFileUrl.trim() ? rv.lyricsFileUrl.trim() : null,
          sheetFileUrl: typeof rv.sheetFileUrl === 'string' && rv.sheetFileUrl.trim() ? rv.sheetFileUrl.trim() : null,
          isPremium: false,
          label: versionLabel,
          createdBy: uid,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
      });

      await batch.commit();

      sendJson(res, 201, {
        ok: true,
        song: { id: songRef.id },
        songId: songRef.id,
        versionIds: versionRefs.map((r) => r.id),
        sqlSongId,
        sqlVersionIds: sqlVersions.map((v) => v.id),
        status: 'DRAFT'
      });
      return;
    } catch (error) {
      console.error('Firestore projection for song draft failed:', error);
      try {
        await deleteSongByIdInCloudSql(sqlSongId);
      } catch (rollbackError) {
        console.error('Cloud SQL rollback for song draft failed:', rollbackError);
      }
      sendError(res, 500, 'internal_error', 'Failed to project song draft to Firestore.');
      return;
    }
  }

  if (!segments.length) {
    sendError(res, 404, 'not_found', 'Endpoint not found.');
    return;
  }

  const songId = segments[0];
  const authContext = await getOptionalAuthContext(req);
  const requestUserId = resolveRequestUserId(req, authContext);
  const db = getAppFirestore();

  if (segments.length === 1 && req.method === 'GET') {
    const songSnap = await resolveSongSnapshotByAnyId(db, songId);

    if (!songSnap || !songSnap.exists) {
      sendError(res, 404, 'not_found', 'Song not found.');
      return;
    }

    const songData = (songSnap.data() ?? {}) as Record<string, unknown>;
    const songStatus = normalizeSongState(songData.status);
    const ownerUid = String(songData.ownerUserId ?? songData.createdBy ?? '');
    const role = (authContext?.token.role as string | undefined) ?? '';
    const isElevatedRole = role === 'admin' || role === 'editor';
    const authenticatedUserId = authContext?.uid ?? null;
    const isOwner = Boolean(authenticatedUserId && ownerUid && authenticatedUserId === ownerUid);
    const isPublicByStatus = songStatus === 'APPROVED' || songStatus === 'PUBLISHED';

    if (!isPublicByStatus && !isOwner && !isElevatedRole) {
      sendError(res, 404, 'not_found', 'Song not found.');
      return;
    }

    const versionsSnap = await songSnap.ref.collection('versions').get();

    const userDocSnap = authenticatedUserId ? await db.collection('users').doc(authenticatedUserId).get() : null;
    const userData = (userDocSnap?.data() ?? {}) as Record<string, unknown>;
    const isPremiumUser = Boolean(authContext?.token.premium ?? userData.premium ?? false);

    const songUnlockSnap = authenticatedUserId
      ? await db.collection('users').doc(authenticatedUserId).collection('songUnlocks').doc(songId).get()
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

    // Sort visible versions by createdAt DESC (most recent first) for "default version" fallback.
    const sortedVisible = [...visibleVersions].sort((a, b) => {
      const aMs = (a.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
      const bMs = (b.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
      return bMs - aMs;
    });

    const versions = visibleVersions.map((version) => ({
      id: String(version.id),
      songId: String(version.songId ?? songId),
      versionId: String(version.versionId ?? version.id),
      sqlSongVersionId: Number.isFinite(Number(version.sqlSongVersionId)) ? String(version.sqlSongVersionId) : undefined,
      versionName: String(version.versionName ?? version.label ?? 'Versión'),
      artistId: typeof version.artistId === 'string' ? version.artistId : undefined,
      instrumentId: typeof version.instrumentId === 'string' ? version.instrumentId : undefined,
      tone: typeof version.tone === 'string' ? version.tone : undefined,
      notationType: typeof version.notationType === 'string' ? version.notationType : undefined,
      audioReferenceUrl: typeof version.audioReferenceUrl === 'string' ? version.audioReferenceUrl : undefined,
      coverImageUrl: typeof version.coverImageUrl === 'string' ? version.coverImageUrl : undefined,
      artistName: String(version.artistName ?? songData.artistName ?? ''),
      instrumentName: typeof version.instrumentName === 'string' ? version.instrumentName : undefined,
      label: String(version.label ?? version.versionName ?? 'Versión'),
      isPremium: Boolean(version.isPremium),
      lyrics: typeof version.lyrics === 'string' ? version.lyrics : undefined,
      lyricsFileUrl: typeof version.lyricsFileUrl === 'string' ? version.lyricsFileUrl : undefined,
      sheetFileUrl: typeof version.sheetFileUrl === 'string' ? version.sheetFileUrl : undefined
    }));

    // Resolve active version: ?versionId query → exact match; else most recent visible.
    const requestedVersionId = typeof req.query.versionId === 'string' ? req.query.versionId.trim() : '';
    const activeVersionRaw = requestedVersionId
      ? sortedVisible.find((v) => String(v.id) === requestedVersionId)
      : sortedVisible[0];

    const instrumentMap = new Map<string, { id: string; name: string }>();

    versions.forEach((version) => {
      if (version.instrumentId) {
        instrumentMap.set(version.instrumentId, {
          id: version.instrumentId,
          name: version.instrumentName ?? version.instrumentId
        });
      }
    });

    // Active version takes precedence over song-level legacy fields.
    const activeVersionId = activeVersionRaw ? String(activeVersionRaw.id) : '';
    const currentVersionId = activeVersionId
      || String(songData.currentVersionId ?? versions[0]?.id ?? '');
    const currentInstrumentId = activeVersionRaw && typeof activeVersionRaw.instrumentId === 'string'
      ? String(activeVersionRaw.instrumentId)
      : String(songData.currentInstrumentId ?? instrumentMap.values().next().value?.id ?? '');

    // ---- Spotify-aligned fields ----
    const title = String(songData.title ?? '');
    const primaryArtistName = String(songData.artistName ?? songData.author ?? '');
    // Audio: active version's audio first, then legacy song-level audioUrl.
    const audioUrl = (activeVersionRaw && typeof activeVersionRaw.audioReferenceUrl === 'string' && activeVersionRaw.audioReferenceUrl)
      ? (activeVersionRaw.audioReferenceUrl as string)
      : (typeof songData.audioUrl === 'string' ? songData.audioUrl : undefined);
    // Lyrics: active version first, legacy song-level fallback.
    const activeLyrics = (activeVersionRaw && typeof activeVersionRaw.lyrics === 'string' && activeVersionRaw.lyrics)
      ? (activeVersionRaw.lyrics as string)
      : String(songData.lyrics ?? '');
    // Sheet: active version's sheetFileUrl first, legacy song-level sheet fallback.
    const activeSheet = (activeVersionRaw && typeof activeVersionRaw.sheetFileUrl === 'string' && activeVersionRaw.sheetFileUrl)
      ? (activeVersionRaw.sheetFileUrl as string)
      : (typeof songData.sheet === 'string' ? songData.sheet : undefined);
    const activeCoverUrl = activeVersionRaw && typeof activeVersionRaw.coverImageUrl === 'string' && activeVersionRaw.coverImageUrl
      ? (activeVersionRaw.coverImageUrl as string)
      : undefined;
    const images = normalizeImages(
      songData.images,
      activeCoverUrl
        ?? (typeof songData.coverImageUrl === 'string' ? (songData.coverImageUrl as string) : undefined)
        ?? (typeof songData.thumbnailUrl === 'string' ? (songData.thumbnailUrl as string) : undefined)
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
      status: songStatus.toLowerCase(),
      createdBy: String(songData.createdBy ?? ''),
      lyrics: activeLyrics,
      sheet: activeSheet,
      // Back-compat audio alias + Spotify-style `previewUrl`
      audioUrl,
      previewUrl: audioUrl ?? null,
      sqlSongId: isElevatedRole && Number.isFinite(Number(songData.sqlSongId))
        ? String(songData.sqlSongId)
        : undefined,
      activeVersionId: activeVersionId || undefined,
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
/*------*/
  if (segments.length === 1 && req.method === 'PATCH') {
    if (!authContext) {
      sendError(res, 401, 'unauthorized', 'Authenticated user required.');
      return;
    }

    const songSnap = await resolveSongSnapshotByAnyId(db, songId);
    if (!songSnap || !songSnap.exists) {
      sendError(res, 404, 'not_found', 'Song not found.');
      return;
    }

    const songData = (songSnap.data() ?? {}) as Record<string, unknown>;
    const ownerUid = String(songData.ownerUserId ?? songData.createdBy ?? '');
    const role = (authContext.token.role as string | undefined) ?? undefined;

    if (!isOwnerOrAdmin(ownerUid, authContext.uid, role)) {
      sendError(res, 403, 'forbidden', 'You cannot modify this song.');
      return;
    }

    const sqlSongId = resolveSqlSongIdFromSongSnapshot(songSnap.id, songData);
    if (!sqlSongId) {
      sendError(res, 422, 'invalid_state', 'Song has no Cloud SQL projection.');
      return;
    }

    const body = getBodyRecord(req);
    const nextTitle = readOptionalTrimmedString(body.title);
    const coverImageRaw = body.coverImageUrl;
    const coverImageUrl = coverImageRaw === null ? null : readOptionalTrimmedString(coverImageRaw);
    const requestedStatus = readOptionalTrimmedString(body.status);
    const originalStatus = normalizeSongState(songData.status);
    const nextStatus = ['APPROVED', 'PUBLISHED'].includes(originalStatus)
      ? 'DRAFT'
      : requestedStatus
        ? normalizeSongState(requestedStatus)
        : originalStatus;

    const metadataUpdate: UpdateSongMetadataInput = { sqlSongId };
    if (nextTitle && nextTitle !== String(songData.title ?? '')) {
      metadataUpdate.title = nextTitle;
    }
    if (coverImageRaw !== undefined) {
      metadataUpdate.coverImageUrl = coverImageUrl ?? null;
    }
    if (nextStatus !== originalStatus) {
      metadataUpdate.status = nextStatus;
    }

    try {
      if (
        metadataUpdate.title !== undefined ||
        metadataUpdate.coverImageUrl !== undefined ||
        metadataUpdate.status !== undefined
      ) {
        await updateSongMetadataInCloudSql(metadataUpdate);
      }
    } catch (error) {
      console.error('Cloud SQL song metadata update failed:', error);
      sendError(res, 500, 'internal_error', 'Failed to update song metadata.');
      return;
    }

    const rawVersions = Array.isArray(body.versions)
      ? body.versions.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
      : [];
    const shouldLoadVersions = rawVersions.length > 0 || typeof body.currentVersionId === 'string';
    const versionsCollection = songSnap.ref.collection('versions');
    const existingVersionsSnap = shouldLoadVersions ? await versionsCollection.get() : null;
    const existingVersionMap = existingVersionsSnap
      ? new Map(existingVersionsSnap.docs.map((doc) => [doc.id, doc]))
      : new Map<string, FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>>();

    const versionDeletes: Array<{ docRef: FirebaseFirestore.DocumentReference; sqlSongVersionId?: number }> = [];
    const versionSetOps: Array<{ docRef: FirebaseFirestore.DocumentReference; data: Record<string, unknown>; merge: boolean }>
      = [];
    const pendingNewVersions: Array<{ docRef: FirebaseFirestore.DocumentReference; data: Record<string, unknown>; input: VersionInput }>
      = [];
    const sqlVersionUpdates: UpdateSongVersionInput[] = [];
    const deletedDocIds = new Set<string>();
    const updatedDocIds: string[] = [];
    const defaultArtistIdCandidate = Number(songData.artistId);
    const defaultArtistId = Number.isFinite(defaultArtistIdCandidate) ? Math.floor(defaultArtistIdCandidate) : null;
    const defaultArtistName = typeof songData.artistName === 'string' ? songData.artistName : null;
    const createdByFallback = typeof songData.createdBy === 'string' && songData.createdBy.length > 0
      ? songData.createdBy
      : authContext.uid;

    for (const rawVersion of rawVersions) {
      const docId = readOptionalTrimmedString((rawVersion as Record<string, unknown>).id)
        ?? readOptionalTrimmedString((rawVersion as Record<string, unknown>).versionId);
      const markedForDeletion = rawVersion.markedForDeletion === true;
      const existingDoc = docId ? existingVersionMap.get(docId) : undefined;
      const normalizedVersionName = readOptionalTrimmedString(rawVersion.versionName)
        ?? (existingDoc?.data().versionName as string | undefined)
        ?? 'Versión 1';
      const normalizedInstrumentName = readOptionalTrimmedString(rawVersion.instrumentName)
        ?? (existingDoc?.data().instrumentName as string | undefined)
        ?? 'Letra';
      const normalizedTone = readNullableTrimmedString(rawVersion.tone);
      const normalizedNotation = readNullableTrimmedString(rawVersion.notationType);
      const normalizedAudio = readNullableTrimmedString(rawVersion.audioReferenceUrl);
      const normalizedCoverUrl = readNullableTrimmedString(rawVersion.coverImageUrl);
      const normalizedArtistName = readOptionalTrimmedString(rawVersion.artistName) ?? defaultArtistName ?? authContext.uid ?? '';
      const docRef = docId ? versionsCollection.doc(docId) : versionsCollection.doc();
      const numericSqlVersionId = Number(rawVersion.sqlSongVersionId ?? rawVersion.sqlVersionId ?? rawVersion.sqlId);
      const sqlVersionId = Number.isFinite(numericSqlVersionId) && numericSqlVersionId > 0
        ? Math.floor(numericSqlVersionId)
        : undefined;

      if (markedForDeletion) {
        if (existingDoc) {
          const existingData = existingDoc.data() as Record<string, unknown>;
          const existingSqlId = Number(existingData.sqlSongVersionId);
          versionDeletes.push({ docRef: existingDoc.ref, sqlSongVersionId: sqlVersionId ?? (Number.isFinite(existingSqlId) ? Math.floor(existingSqlId) : undefined) });
          deletedDocIds.add(existingDoc.id);
        }
        continue;
      }

      const versionData: Record<string, unknown> = {
        songId: songSnap.id,
        versionId: docRef.id,
        versionName: normalizedVersionName,
        label: readOptionalTrimmedString(rawVersion.label) ?? normalizedVersionName,
        artistName: normalizedArtistName,
        instrumentName: normalizedInstrumentName,
        lyrics: typeof rawVersion.lyrics === 'string'
          ? rawVersion.lyrics
          : (existingDoc?.data().lyrics as string | undefined) ?? '',
        audioReferenceUrl: normalizedAudio ?? (existingDoc?.data().audioReferenceUrl as string | null | undefined ?? null),
        notationType: normalizedNotation ?? (existingDoc?.data().notationType as string | null | undefined ?? null),
        tone: normalizedTone ?? (existingDoc?.data().tone as string | null | undefined ?? null),
        coverImageUrl: normalizedCoverUrl ?? (existingDoc?.data().coverImageUrl as string | null | undefined ?? null),
        updatedAt: FieldValue.serverTimestamp()
      };

      if (existingDoc) {
        versionSetOps.push({ docRef: existingDoc.ref, data: versionData, merge: true });
        updatedDocIds.push(existingDoc.id);

        const existingData = existingDoc.data() as Record<string, unknown>;
        const fallbackSqlId = Number(existingData.sqlSongVersionId);
        const resolvedSqlId = sqlVersionId ?? (Number.isFinite(fallbackSqlId) ? Math.floor(fallbackSqlId) : undefined);
        if (resolvedSqlId) {
          const sqlPatch: UpdateSongVersionInput = { sqlSongVersionId: resolvedSqlId };
          if (readOptionalTrimmedString(rawVersion.versionName)) sqlPatch.versionName = normalizedVersionName;
          if (rawVersion.instrumentName !== undefined) sqlPatch.instrumentName = normalizedInstrumentName;
          if (normalizedTone !== undefined) sqlPatch.tone = normalizedTone;
          if (normalizedNotation !== undefined) sqlPatch.notationType = normalizedNotation;
          if (normalizedAudio !== undefined) sqlPatch.audioReferenceUrl = normalizedAudio;
          if (Object.keys(sqlPatch).length > 1) {
            sqlVersionUpdates.push(sqlPatch);
          }
        }
      } else {
        const newVersionInput: VersionInput = {
          versionName: normalizedVersionName,
          instrumentName: normalizedInstrumentName || 'Letra',
          tone: normalizedTone ?? null,
          notationType: normalizedNotation ?? null,
          audioReferenceUrl: normalizedAudio ?? null,
          artistId: defaultArtistId,
          artistName: normalizedArtistName
        };

        const newData: Record<string, unknown> = {
          ...versionData,
          sqlSongVersionId: null,
          createdBy: createdByFallback,
          createdAt: FieldValue.serverTimestamp(),
          isPremium: false
        };

        pendingNewVersions.push({ docRef, data: newData, input: newVersionInput });
      }
    }

    const sqlDeleteIds = versionDeletes
      .map((entry) => entry.sqlSongVersionId)
      .flatMap((id) => (typeof id === 'number' && Number.isFinite(id) && id > 0 ? [Math.floor(id)] : []));

    try {
      if (sqlDeleteIds.length > 0) {
        await deleteVersionsByIdsInCloudSql(sqlDeleteIds);
      }

      if (sqlVersionUpdates.length > 0) {
        await Promise.all(sqlVersionUpdates.map((payload) => updateSongVersionInCloudSql(payload)));
      }
    } catch (error) {
      console.error('Cloud SQL version mutation failed:', error);
      sendError(res, 500, 'internal_error', 'Failed to update song versions in Cloud SQL.');
      return;
    }

    const createdVersionDocIds: string[] = [];
    if (pendingNewVersions.length > 0) {
      try {
        const sqlNewVersions = await addVersionsToExistingSong(sqlSongId, pendingNewVersions.map((entry) => entry.input));
        sqlNewVersions.forEach((sqlVersion, index) => {
          const entry = pendingNewVersions[index];
          if (!entry) return;
          entry.data.sqlSongVersionId = sqlVersion.id;
          entry.data.instrumentId = sqlVersion.instrumentId ? String(sqlVersion.instrumentId) : null;
          entry.data.artistId = sqlVersion.artistId ? String(sqlVersion.artistId) : null;
          versionSetOps.push({ docRef: entry.docRef, data: entry.data, merge: true });
          if (entry.docRef.id) {
            createdVersionDocIds.push(entry.docRef.id);
          }
        });
      } catch (error) {
        console.error('Cloud SQL add versions during PATCH failed:', error);
        sendError(res, 500, 'internal_error', 'Failed to create new song versions.');
        return;
      }
    }

    const batch = db.batch();
    versionDeletes.forEach(({ docRef }) => batch.delete(docRef));
    versionSetOps.forEach(({ docRef, data, merge }) => batch.set(docRef, data, { merge }));

    const survivingVersionIds = existingVersionsSnap
      ? new Set(existingVersionsSnap.docs.map((doc) => doc.id))
      : new Set<string>();
    versionDeletes.forEach(({ docRef }) => survivingVersionIds.delete(docRef.id));
    pendingNewVersions.forEach((entry) => {
      if (entry.docRef.id) {
        survivingVersionIds.add(entry.docRef.id);
      }
    });

    const requestedCurrentVersionId = readOptionalTrimmedString(body.currentVersionId);
    let nextCurrentVersionId = requestedCurrentVersionId ?? String(songData.currentVersionId ?? '');
    if (survivingVersionIds.size > 0) {
      if (!nextCurrentVersionId || !survivingVersionIds.has(nextCurrentVersionId)) {
        nextCurrentVersionId = survivingVersionIds.values().next().value as string;
      }
    }

    const firestoreUpdate: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      status: nextStatus
    };
    if (nextTitle) {
      firestoreUpdate.title = nextTitle;
    }
    if (coverImageRaw !== undefined) {
      if (coverImageUrl) {
        firestoreUpdate.coverImageUrl = coverImageUrl;
        firestoreUpdate.thumbnailUrl = coverImageUrl;
        firestoreUpdate.images = [{ url: coverImageUrl }];
      } else {
        firestoreUpdate.coverImageUrl = FieldValue.delete();
        firestoreUpdate.thumbnailUrl = FieldValue.delete();
        firestoreUpdate.images = FieldValue.delete();
      }
    }
    if (nextCurrentVersionId) {
      firestoreUpdate.currentVersionId = nextCurrentVersionId;
    }

    batch.update(songSnap.ref, firestoreUpdate);

    try {
      await batch.commit();
    } catch (error) {
      console.error('Firestore song update failed:', error);
      sendError(res, 500, 'internal_error', 'Failed to update song in Firestore.');
      return;
    }

    sendJson(res, 200, {
      ok: true,
      songId: songSnap.id,
      status: nextStatus,
      currentVersionId: nextCurrentVersionId,
      updatedVersionIds: updatedDocIds,
      deletedVersionIds: Array.from(deletedDocIds),
      createdVersionIds: createdVersionDocIds
    });
    return;
  }

  if (segments.length === 1 && req.method === 'DELETE') {
    if (!authContext) {
      sendError(res, 401, 'unauthorized', 'Authenticated user required.');
      return;
    }

    const songSnap = await resolveSongSnapshotByAnyId(db, songId);
    if (!songSnap || !songSnap.exists) {
      sendError(res, 404, 'not_found', 'Song not found.');
      return;
    }

    const songData = (songSnap.data() ?? {}) as Record<string, unknown>;
    const ownerUid = String(songData.ownerUserId ?? songData.createdBy ?? '');
    const role = (authContext.token.role as string | undefined) ?? undefined;

    if (!isOwnerOrAdmin(ownerUid, authContext.uid, role)) {
      sendError(res, 403, 'forbidden', 'You cannot delete this song.');
      return;
    }

    const sqlSongId = resolveSqlSongIdFromSongSnapshot(songSnap.id, songData);
    if (sqlSongId) {
      try {
        await deleteSongByIdInCloudSql(sqlSongId);
      } catch (error) {
        console.error('Cloud SQL song delete failed:', error);
        sendError(res, 500, 'internal_error', 'Failed to delete song in Cloud SQL.');
        return;
      }
    }

    try {
      const versionsSnap = await songSnap.ref.collection('versions').get();
      await Promise.all(versionsSnap.docs.map((doc) => doc.ref.delete()));
      await songSnap.ref.delete();
    } catch (error) {
      console.error('Firestore song delete failed:', error);
      sendError(res, 500, 'internal_error', 'Failed to delete song in Firestore.');
      return;
    }

    sendJson(res, 200, { ok: true, songId: songSnap.id });
    return;
  }
  /*------*/

  if (segments.length === 2 && segments[1] === 'listen' && req.method === 'POST') {
    const listenLimiterIdentifier = authContext?.uid ?? getClientIp(req) ?? `song:${songId}`;
    const listenLimiter = await checkRateLimit(`${listenLimiterIdentifier}:${songId}`, 'songs_listen', 1, 1800);
    applyRateLimitHeaders(res, 1, listenLimiter);
    if (!listenLimiter.allowed) {
      res.set('Retry-After', String(listenLimiter.retryAfterSeconds));
      sendError(res, 429, 'too_many_requests', `Listen limit reached. Retry in ${listenLimiter.retryAfterSeconds}s.`);
      return;
    }

    const songSnap = await resolveSongSnapshotByAnyId(db, songId);

    if (!songSnap || !songSnap.exists) {
      sendError(res, 404, 'not_found', 'Song not found.');
      return;
    }

    const songData = (songSnap.data() ?? {}) as Record<string, unknown>;
    const sqlSongId = resolveSqlSongIdFromSongSnapshot(songSnap.id, songData);

    if (!sqlSongId) {
      sendError(res, 422, 'invalid_state', 'Song has no Cloud SQL projection.');
      return;
    }

    try {
      const metrics = await incrementSongViewInCloudSql(sqlSongId);
      if (!metrics) {
        sendError(res, 404, 'not_found', 'Cloud SQL song not found.');
        return;
      }

      await songSnap.ref.set(
        {
          totalViews: metrics.totalViews,
          likeCount: metrics.likeCount,
          popularity: metrics.popularity,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      sendJson(res, 200, {
        ok: true,
        songId: songSnap.id,
        sqlSongId: metrics.sqlSongId,
        totalViews: metrics.totalViews,
        likeCount: metrics.likeCount,
        popularity: metrics.popularity
      });
      return;
    } catch (error) {
      console.error('Song listen tracking failed:', error);
      sendError(res, 500, 'internal_error', 'Failed to register song listen.');
      return;
    }
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

    const songRef = db.collection('songs').doc(songId);
    const songSnap = await songRef.get();

    if (!songSnap.exists) {
      sendError(res, 404, 'not_found', 'Song not found.');
      return;
    }

    const songData = (songSnap.data() ?? {}) as Record<string, unknown>;
    const songVersionsSnap = await songRef.collection('versions').get();
    const songVersions = songVersionsSnap.docs.map((doc) => doc.data() as Record<string, unknown>);

    if (!isSongPremium(songData, songVersions)) {
      sendError(res, 400, 'invalid_argument', 'Song does not require individual premium purchase.');
      return;
    }

    if (!Boolean(songData.canPurchaseIndividually ?? true)) {
      sendError(res, 400, 'purchase_unavailable', 'This song cannot be purchased individually.');
      return;
    }

    const premium = await resolveIsPremium(requestUserId, authContext?.token ?? null);
    if (premium) {
      sendError(res, 409, 'already_accessible', 'Premium users already have access to this song.');
      return;
    }

    const unlockSnap = await db.collection('users').doc(requestUserId).collection('songUnlocks').doc(songId).get();
    if (unlockSnap.exists) {
      sendError(res, 409, 'already_unlocked', 'Song is already unlocked for this user.');
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
