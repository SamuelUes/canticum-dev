import * as functions from 'firebase-functions/v1';
import { getStorage } from 'firebase-admin/storage';
import { getAppFirestore } from '../../shared/firestore';
import { applyCors, getBodyRecord, getOptionalAuthContext, handlePreflight, sendError, sendJson } from '../../shared/http/http';
import { getAdminDashboardMetrics, getDraftSongsForAdmin, getDraftSongsCount, getArtistsForAdmin, getArtistsCount } from '../../shared/cloudSql/admin';
import { updateArtistInCloudSql, softDeleteArtist, hardDeleteArtist, getArtistByIdForAdmin } from '../../shared/cloudSql/artists';

type NewsletterSlide = {
  id: string;
  imageUrl: string;
  storagePath: string;
  uploadedAt: string;
  uploadedBy: string;
};

function normalizeNewsletterSlides(value: unknown): NewsletterSlide[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const candidate = item as Record<string, unknown>;
      if (
        typeof candidate.id !== 'string' ||
        typeof candidate.imageUrl !== 'string' ||
        typeof candidate.storagePath !== 'string' ||
        typeof candidate.uploadedAt !== 'string' ||
        typeof candidate.uploadedBy !== 'string'
      ) {
        return null;
      }

      return {
        id: candidate.id,
        imageUrl: candidate.imageUrl,
        storagePath: candidate.storagePath,
        uploadedAt: candidate.uploadedAt,
        uploadedBy: candidate.uploadedBy,
      } satisfies NewsletterSlide;
    })
    .filter((item): item is NewsletterSlide => item !== null);
}

function buildNewsletterPayload(slides: NewsletterSlide[]) {
  return {
    ok: true,
    imageUrl: slides[0]?.imageUrl ?? null,
    slides,
  };
}

export const admin = functions.runWith({
  timeoutSeconds: 540,
  memory: '512MB',
}).https.onRequest(async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }

  const segments = req.path.split('/').filter(Boolean);
  const resourceType = segments[0];

  if (resourceType === 'metrics') {
    const auth = await getOptionalAuthContext(req);

    if (!auth?.uid || auth.token.role !== 'admin') {
      sendError(res, 403, 'forbidden', 'Only admin can view dashboard metrics.');
      return;
    }

    if (req.method !== 'GET') {
      sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
      return;
    }

    try {
      const metrics = await getAdminDashboardMetrics();
      sendJson(res, 200, {
        ok: true,
        metrics
      });
    } catch (error) {
      console.error('Error fetching admin dashboard metrics:', error);
      sendError(res, 500, 'internal', 'Failed to fetch dashboard metrics.');
    }
    return;
  }

  if (resourceType === 'draft-songs') {
    const auth = await getOptionalAuthContext(req);

    if (!auth?.uid || auth.token.role !== 'admin') {
      sendError(res, 403, 'forbidden', 'Only admin can view draft songs.');
      return;
    }

    if (req.method !== 'GET') {
      sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
      return;
    }

    try {
      const limitParam = req.query.limit;
      const offsetParam = req.query.offset;
      const limit = typeof limitParam === 'string' ? parseInt(limitParam, 10) : 10;
      const offset = typeof offsetParam === 'string' ? parseInt(offsetParam, 10) : 0;
      const [songs, total] = await Promise.all([
        getDraftSongsForAdmin(limit, offset),
        getDraftSongsCount()
      ]);
      sendJson(res, 200, {
        ok: true,
        songs,
        total,
        limit,
        offset
      });
    } catch (error) {
      console.error('Error fetching draft songs:', error);
      sendError(res, 500, 'internal', 'Failed to fetch draft songs.');
    }
    return;
  }

  if (resourceType === 'artists') {
    const auth = await getOptionalAuthContext(req);

    if (!auth?.uid || auth.token.role !== 'admin') {
      sendError(res, 403, 'forbidden', 'Only admin can view artists.');
      return;
    }

    console.log('Artists endpoint - segments:', segments, 'length:', segments.length);

    // Handle individual artist operations
    if (segments.length > 1) {
      const artistId = segments[1];
      const numericArtistId = Number.parseInt(artistId, 10);

      console.log('Artists endpoint - artistId:', artistId, 'numericArtistId:', numericArtistId, 'isFinite:', Number.isFinite(numericArtistId), '>0:', numericArtistId > 0);

      // Only treat as individual artist if the second segment is a valid number
      if (Number.isFinite(numericArtistId) && numericArtistId > 0) {
        console.log('Artists endpoint - Treating as individual artist endpoint');
        const subpath = segments[2];

        if (subpath === 'status') {
          // PATCH /admin-admin/artists/{id}/status - soft delete
          if (req.method !== 'PATCH') {
            sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
            return;
          }

          try {
            const body = getBodyRecord(req);
            const status = typeof body.status === 'string' ? body.status.trim() : '';

            if (status !== 'inactive' && status !== 'active') {
              sendError(res, 400, 'invalid_argument', 'Status must be "inactive" or "active".');
              return;
            }

            if (status === 'inactive') {
              const updated = await softDeleteArtist(numericArtistId);
              sendJson(res, 200, { ok: true, artist: updated });
            } else {
              // Reactivate artist
              const updated = await updateArtistInCloudSql(numericArtistId, { status: 'active' });
              sendJson(res, 200, { ok: true, artist: updated });
            }
          } catch (error) {
            console.error('Error updating artist status:', error);
            sendError(res, 500, 'internal', 'Failed to update artist status.');
          }
          return;
        }

        // PATCH /admin-admin/artists/{id} - update artist
        if (req.method === 'PATCH') {
          try {
            const body = getBodyRecord(req);
            const updateData: {
              name?: string;
              type?: string;
              bio?: string | null;
              imageUrl?: string | null;
              images?: Array<{ url: string; width?: number; height?: number }>;
              genres?: string[];
              categories?: string[];
              isOfficial?: boolean;
            } = {};

            if (typeof body.name === 'string') {
              updateData.name = body.name;
            }
            if (typeof body.type === 'string') {
              updateData.type = body.type;
            }
            if (typeof body.bio === 'string' || body.bio === null) {
              updateData.bio = body.bio;
            }
            if (typeof body.imageUrl === 'string' || body.imageUrl === null) {
              updateData.imageUrl = body.imageUrl;
            }
            if (Array.isArray(body.images)) {
              updateData.images = body.images;
            }
            if (Array.isArray(body.genres)) {
              updateData.genres = body.genres;
            }
            if (Array.isArray(body.categories)) {
              updateData.categories = body.categories;
            }
            if (typeof body.isOfficial === 'boolean') {
              updateData.isOfficial = body.isOfficial;
            }

            const updated = await updateArtistInCloudSql(numericArtistId, updateData);
            sendJson(res, 200, { ok: true, artist: updated });
          } catch (error) {
            console.error('Error updating artist:', error);
            sendError(res, 500, 'internal', 'Failed to update artist.');
          }
          return;
        }

        // DELETE /admin-admin/artists/{id} - hard delete
        if (req.method === 'DELETE') {
          try {
            await hardDeleteArtist(numericArtistId);
            sendJson(res, 200, { ok: true, message: 'Artist deleted permanently.' });
          } catch (error) {
            console.error('Error deleting artist:', error);
            sendError(res, 500, 'internal', 'Failed to delete artist.');
          }
          return;
        }

        // GET /admin-admin/artists/{id} - get single artist for admin
        if (req.method === 'GET') {
          try {
            const artist = await getArtistByIdForAdmin(numericArtistId);
            if (!artist) {
              sendError(res, 404, 'not_found', 'Artist not found.');
              return;
            }

            sendJson(res, 200, { ok: true, artist });
          } catch (error) {
            console.error('Error fetching artist:', error);
            sendError(res, 500, 'internal', 'Failed to fetch artist.');
          }
          return;
        }

        sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
        return;
      }
    }

    // GET /admin-admin/artists - list artists
    if (req.method !== 'GET') {
      sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
      return;
    }

    try {
      const limitParam = req.query.limit;
      const offsetParam = req.query.offset;
      const limit = typeof limitParam === 'string' ? parseInt(limitParam, 10) : 10;
      const offset = typeof offsetParam === 'string' ? parseInt(offsetParam, 10) : 0;
      const [artists, total] = await Promise.all([
        getArtistsForAdmin(limit, offset),
        getArtistsCount()
      ]);
      sendJson(res, 200, {
        ok: true,
        artists,
        total,
        limit,
        offset
      });
    } catch (error) {
      console.error('Error fetching artists:', error);
      sendError(res, 500, 'internal', 'Failed to fetch artists.');
    }
    return;
  }

  if (resourceType === 'newsletter') {
    applyCors(res);

    if (req.method === 'GET') {
      // Get current newsletter carousel (public endpoint)
      try {
        const db = getAppFirestore();
        const newsletterDoc = await db.collection('settings').doc('newsletter').get();

        const data = newsletterDoc.exists ? (newsletterDoc.data() as Record<string, unknown>) : {};
        const slides = normalizeNewsletterSlides(data.slides);
        sendJson(res, 200, buildNewsletterPayload(slides));
      } catch (error) {
        console.error('Error fetching newsletter carousel:', error);
        sendError(res, 500, 'internal', 'Failed to fetch newsletter carousel.');
      }
      return;
    }

    if (req.method === 'POST') {
      // Upload newsletter slide (admin only)
      const auth = await getOptionalAuthContext(req);

      if (!auth?.uid || auth.token.role !== 'admin') {
        sendError(res, 403, 'forbidden', 'Only admin can upload newsletter images.');
        return;
      }

      try {
        const contentType = req.headers['content-type'];
        const contentTypeMain = contentType?.split(';')[0]?.trim();
        if (!contentTypeMain || !contentTypeMain.startsWith('image/')) {
          sendError(res, 400, 'invalid_content_type', 'Content-Type must be an image.');
          return;
        }

        const newsletterId = `newsletter_${Date.now()}`;
        const createdAt = new Date().toISOString().split('T')[0];
        const storagePath = `newsletter/${newsletterId}_${createdAt}/${newsletterId}`;

        const bucket = getStorage().bucket();
        const file = bucket.file(storagePath);

        const [exists] = await file.exists();
        if (exists) {
          await file.delete();
        }

        // Use rawBody if available, otherwise fallback to streaming
        let buffer: Buffer;
        if (req.rawBody) {
          buffer = Buffer.from(req.rawBody);
        } else {
          const chunks: Buffer[] = [];
          await new Promise<void>((resolve, reject) => {
            req.on('data', (chunk: Buffer) => chunks.push(chunk));
            req.on('end', () => resolve());
            req.on('error', reject);
          });
          buffer = Buffer.concat(chunks);
        }

        if (buffer.length === 0) {
          sendError(res, 400, 'empty_file', 'No file data received.');
          return;
        }

        console.log(`Uploading newsletter image: ${buffer.length} bytes, content-type: ${contentTypeMain}`);

        await file.save(buffer, {
          contentType: contentTypeMain,
          public: true,
        });

        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

        console.log(`Newsletter image uploaded successfully: ${publicUrl}`);

        // Store in Firestore
        const db = getAppFirestore();
        const newsletterRef = db.collection('settings').doc('newsletter');
        const newsletterDoc = await newsletterRef.get();
        const existingSlides = normalizeNewsletterSlides(newsletterDoc.exists ? newsletterDoc.data()?.slides : []);
        const slide: NewsletterSlide = {
          id: newsletterId,
          imageUrl: publicUrl,
          storagePath,
          uploadedAt: new Date().toISOString(),
          uploadedBy: auth.uid,
        };
        const slides = [...existingSlides, slide];

        await newsletterRef.set({
          imageUrl: slides[0]?.imageUrl ?? null,
          slides,
          updatedAt: new Date().toISOString(),
          updatedBy: auth.uid,
        }, { merge: true });

        sendJson(res, 200, {
          ok: true,
          imageUrl: publicUrl,
          storagePath,
          slide,
          slides,
        });
      } catch (error) {
        console.error('Error uploading newsletter image:', error);
        sendError(res, 500, 'internal', 'Failed to upload newsletter image.');
      }
      return;
    }

    if (req.method === 'PUT') {
      const auth = await getOptionalAuthContext(req);

      if (!auth?.uid || auth.token.role !== 'admin') {
        sendError(res, 403, 'forbidden', 'Only admin can update newsletter images.');
        return;
      }

      try {
        const body = getBodyRecord(req);
        const slides = normalizeNewsletterSlides(body.slides);

        if (slides.length === 0) {
          sendError(res, 400, 'invalid_argument', 'slides must be a non-empty array.');
          return;
        }

        const db = getAppFirestore();
        const newsletterRef = db.collection('settings').doc('newsletter');
        await newsletterRef.set({
          imageUrl: slides[0].imageUrl,
          slides,
          updatedAt: new Date().toISOString(),
          updatedBy: auth.uid,
        }, { merge: true });

        sendJson(res, 200, buildNewsletterPayload(slides));
      } catch (error) {
        console.error('Error updating newsletter carousel:', error);
        sendError(res, 500, 'internal', 'Failed to update newsletter carousel.');
      }
      return;
    }

    sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
    return;
  }

  sendError(res, 404, 'not_found', 'Endpoint not found.');
});
