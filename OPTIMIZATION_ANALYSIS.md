# API and Cloud SQL Optimization Analysis

## Executive Summary

This analysis evaluates the Cloud SQL PostgreSQL database design and API call patterns across the Canticum project, with special focus on the search endpoint (`functions/src/web/search/http.ts`). The analysis is based on Supabase Postgres best practices and identifies critical optimization opportunities.

---

## Critical Findings

### 1. Connection Pool Configuration (CRITICAL)

**Location:** `functions/src/shared/cloudSql/pool.ts`

**Issue:** The connection pool is configured with very conservative settings that may cause contention under load.

```typescript
const baseConfig: PoolConfig = {
  max: 5,              // TOO LOW for production
  min: 0,              // No warm connections
  idleTimeoutMillis: 10_000,  // Too aggressive
  connectionTimeoutMillis: 8_000,
  allowExitOnIdle: true
};
```

**Problems:**
- `max: 5` is insufficient for concurrent requests, especially in Cloud Functions
- `min: 0` means no warm connections, causing cold start latency
- `idleTimeoutMillis: 10_000` (10s) is too aggressive, causing frequent connection churn
- No statement timeout configured
- No query timeout configured

**Recommendation:**
```typescript
const baseConfig: PoolConfig = {
  max: 20,              // Increase for better concurrency
  min: 2,               // Keep warm connections
  idleTimeoutMillis: 30_000,  // Reduce churn
  connectionTimeoutMillis: 10_000,
  statementTimeout: 30_000,  // Prevent runaway queries
  queryTimeout: 30_000,       // Prevent runaway queries
  allowExitOnIdle: false      // Keep pool alive
  
};
```

---

### 2. Search Endpoint Performance Issues (CRITICAL)

**Location:** `functions/src/web/search/http.ts`

#### Issue 2.1: Sequential Database Queries in Hot Path

The search endpoint makes multiple sequential database calls that could be parallelized:

```typescript
// Lines ~400-500: Sequential calls
const categories = await listActiveCategorySlugsInCloudSql();
const topArtists = await listTopArtistsInCloudSql(HOME_SCOPE_SQL_ARTIST_LIMIT);
const topSongs = await listTopSongsInCloudSql(HOME_SCOPE_SQL_SONG_LIMIT);
```

**Problem:** These are independent queries executed sequentially, adding unnecessary latency.

**Recommendation:** Use `Promise.all()` to parallelize:
```typescript
const [categories, topArtists, topSongs] = await Promise.all([
  listActiveCategorySlugsInCloudSql(),
  listTopArtistsInCloudSql(HOME_SCOPE_SQL_ARTIST_LIMIT),
  listTopSongsInCloudSql(HOME_SCOPE_SQL_SONG_LIMIT)
]);
```

#### Issue 2.2: Inefficient Firestore Scan for Home Scope

```typescript
// Lines ~500-550: Firestore scan without proper index
const firestoreSnap = await db
  .collection('songs')
  .where('status', '==', 'PUBLISHED')
  .orderBy('updatedAt', 'desc')
  .limit(HOME_SCOPE_FIRESTORE_SCAN_LIMIT)
  .get();
```

**Problem:** This query requires a composite index on `(status, updatedAt)` but may not have one configured, causing full collection scans.

**Recommendation:** Ensure Firestore index exists:
```
Collection: songs
Fields: status (ASC), updatedAt (DESC)
```

#### Issue 2.3: N+1 Query Pattern for Song Metrics

```typescript
// Lines ~600-650: Fetching metrics for each song individually
const sqlSongIds = firestoreDocs.map(doc => doc.data().sqlSongId);
const metricsMap = new Map();
for (const sqlId of sqlSongIds) {
  const metrics = await getSongMetricsBySqlIds([sqlId]);
  metricsMap.set(sqlId, metrics[0]);
}
```

**Problem:** This is a classic N+1 query pattern. Each song requires a separate database call.

**Recommendation:** Batch fetch all metrics in a single query:
```typescript
const metrics = await getSongMetricsBySqlIds(sqlSongIds);
const metricsMap = new Map(metrics.map(m => [m.sqlSongId, m]));
```

#### Issue 2.4: Inefficient Artist Profile Query

**Location:** `functions/src/shared/cloudSql/artists.ts:410-692`

The `getArtistProfileBundle` function executes 5 parallel queries, but some are inefficient:

```typescript
// Lines 463-534: Complex song query with multiple LEFT JOINs
SELECT
  s.id, s.title, ...
FROM songs s
LEFT JOIN song_versions sv ON sv.song_id = s.id
LEFT JOIN instruments i ON i.id = sv.instrument_id
LEFT JOIN song_states ss ON ss.id = s.state_id
LEFT JOIN users u ON u.id = s.user_id
WHERE (s.artist_id = $1 OR sv.artist_id = $1)
  AND (ss.id IS NULL OR UPPER(ss.code) IN ('PUBLISHED', 'APPROVED') OR ...)
GROUP BY s.id
ORDER BY "isFeatured" DESC, COALESCE(s.popularity, 0) DESC, ...
LIMIT 30;
```

**Problems:**
- Multiple LEFT JOINs without proper indexes
- `GROUP BY s.id` on a large result set
- Subquery for `isFeatured` checks max snapshot_week on every row
- Complex OR condition in WHERE clause

**Recommendations:**
1. Add composite index: `(artist_id, popularity DESC, id)`
2. Add index on `song_versions(artist_id, song_id)`
3. Materialize `isFeatured` as a boolean column with index
4. Consider using a MATERIALIZED VIEW for featured songs

---

### 3. Missing Database Indexes (HIGH PRIORITY)

**Location:** `database/bdsql.sql`

#### Issue 3.1: Missing Index on Frequently Queried Columns

**Current Indexes:**
```sql
CREATE INDEX idx_songs_categories_json ON songs USING GIN (categories_json);
CREATE INDEX idx_songs_artist_id ON songs(artist_id);
CREATE INDEX idx_songs_popularity ON songs(popularity DESC);
```

**Missing Critical Indexes:**

```sql
-- For search endpoint performance
CREATE INDEX idx_songs_status_popularity ON songs(state_id, popularity DESC NULLS LAST, id DESC);
CREATE INDEX idx_songs_artist_popularity ON songs(artist_id, popularity DESC NULLS LAST, id DESC);

-- For artist profile songs query
CREATE INDEX idx_song_versions_artist_song ON song_versions(artist_id, song_id);
CREATE INDEX idx_song_versions_song_instrument ON song_versions(song_id, instrument_id);

-- For featured songs queries
CREATE INDEX idx_featured_songs_snapshot_week ON featured_songs(snapshot_week DESC, rank_position ASC);
CREATE INDEX idx_featured_songs_song_week ON featured_songs(song_id, snapshot_week DESC);

-- For album queries
CREATE INDEX idx_albums_artist_status ON albums(artist_id, status, release_year DESC);
CREATE INDEX idx_album_songs_album_track ON album_songs(album_id, track_number);

-- For user queries
CREATE INDEX idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX idx_users_email ON users(email);

-- For artist suggestions
CREATE INDEX idx_artist_suggestions_artist_score ON artist_suggestions(artist_id, relevance_score DESC);
CREATE INDEX idx_artist_suggestions_suggested_score ON artist_suggestions(suggested_artist_id, relevance_score DESC);

-- For song metrics
CREATE INDEX idx_song_metrics_song_id ON song_metrics(song_id);
```

#### Issue 3.2: Partial Index Opportunities

```sql
-- Only index published songs for search
CREATE INDEX idx_songs_published_popularity 
ON songs(popularity DESC, id DESC) 
WHERE state_id IN (SELECT id FROM song_states WHERE code IN ('PUBLISHED', 'APPROVED'));

-- Only index active categories
CREATE INDEX idx_categories_active_slug 
ON categories(slug) 
WHERE is_active = TRUE;

-- Only index artists with popularity
CREATE INDEX idx_artists_popularity_score 
ON artists(compute_artist_popularity(COALESCE(total_views, 0), COALESCE(like_count, 0)) DESC) 
WHERE popularity IS NOT NULL AND popularity > 0;
```

---

### 4. Inefficient Query Patterns (HIGH PRIORITY)

#### Issue 4.1: Sequential Track Insertion in Album Creation

**Location:** `functions/src/shared/cloudSql/albums.ts:59-109`

```typescript
for (const track of input.tracks) {
  // Query for each track individually
  const songResult = await client.query(
    "SELECT id FROM songs WHERE external_urls_json->>'canticum' = $1 LIMIT 1",
    [track.songId]
  );
  
  // Fallback query if not found
  if (songResult.rows.length === 0 && track.songTitle) {
    const fallbackResult = await client.query(
      'SELECT id FROM songs WHERE title = $1 AND artist_id = $2 LIMIT 1',
      [track.songTitle, input.artistId]
    );
  }
}
```

**Problem:** Sequential queries inside a transaction for each track.

**Recommendation:** Batch fetch all songs first:
```typescript
const songIds = input.tracks.map(t => t.songId);
const songResults = await client.query(
  `SELECT id, external_urls_json->>'canticum' as canticum_id 
   FROM songs 
   WHERE external_urls_json->>'canticum' = ANY($1)`,
  [songIds]
);
const songMap = new Map(songResults.rows.map(r => [r.canticum_id, r.id]));

// Then process tracks using the map
for (const track of input.tracks) {
  const sqlSongId = songMap.get(track.songId);
  // ... rest of logic
}
```

#### Issue 4.2: Inefficient Artist Suggestions Fallback Query

**Location:** `functions/src/shared/cloudSql/artists.ts:596-652`

```typescript
const fallbackSuggestionsResult = await getPool().query(`
  SELECT a.id, a.name, a.image_url
  FROM artists a
  WHERE a.id <> $1
    AND (
      COALESCE(array_length($2::TEXT[], 1), 0) = 0
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(a.genres_json) = 'array' THEN a.genres_json ELSE '[]'::jsonb END
        ) AS g(value)
        WHERE LOWER(TRIM(g.value)) = ANY($2::TEXT[])
      )
    )
  ORDER BY
    CASE WHEN COALESCE(array_length($2::TEXT[], 1), 0) = 0 THEN 0
    ELSE (SELECT COUNT(*)::INT FROM jsonb_array_elements_text(...) WHERE ...) END DESC,
    COALESCE(a.popularity, 0) DESC,
    a.name ASC
  LIMIT 12;
`, [artistId, normalizedGenres]);
```

**Problems:**
- Complex JSONB array extraction in WHERE clause
- Subquery in ORDER BY for each row
- No index on genres_json

**Recommendation:**
1. Add GIN index on genres_json: `CREATE INDEX idx_artists_genres ON artists USING GIN (genres_json);`
2. Use simpler genre matching with `@>` operator:
```sql
WHERE a.genres_json @> $2::jsonb
```
3. Pre-compute genre match score or use a junction table

---

### 5. Transaction and Locking Issues (MEDIUM PRIORITY)

#### Issue 5.1: Long-Running Transactions

**Location:** Multiple files

The `createAlbumInCloudSql` function holds a transaction while querying for each track sequentially. This can cause lock contention.

**Recommendation:** Minimize transaction duration by:
1. Fetch all needed data before transaction
2. Use shorter transactions
3. Consider optimistic locking patterns

#### Issue 5.2: Missing Row-Level Security

The database schema does not implement Row-Level Security (RLS), relying instead on application-level authorization. This is acceptable for this architecture but should be documented.

---

### 6. Data Model Issues (MEDIUM PRIORITY)

#### Issue 6.1: Redundant Data Synchronization

The system maintains data in both Firestore and Cloud SQL, with Cloud SQL being the canonical source for relational data. This dual-write pattern increases complexity and potential for inconsistency.

**Current Pattern:**
```typescript
// Write to Cloud SQL first
const sqlSong = await createSongDraftInCloudSql(...);
// Then project to Firestore
await batch.set(songRef, {...});
```

**Recommendation:** Consider implementing a change data capture (CDC) pattern or using database triggers to sync to Firestore asynchronously.

#### Issue 6.2: JSONB Column Overuse

Several columns use JSONB where normalized tables might be better:
- `songs.categories_json` - could use junction table
- `songs.genres_json` - could use junction table
- `artists.genres_json` - could use junction table
- `albums.genres_json` - could use junction table

**Trade-off:** JSONB provides flexibility but makes queries and indexing more complex. For high-cardinality, low-selectivity fields like genres, junction tables with proper indexes often perform better.

---

### 7. Caching Strategy (MEDIUM PRIORITY)

#### Issue 7.1: In-Memory Cache Without Eviction Policy

**Location:** `functions/src/web/search/http.ts`

```typescript
const SHARED_HOME_CACHE_TTL_MS = 30_000;
let sharedHomeCache: { data: HomeCatalogResponse; expiresAt: number } | null = null;
```

**Problem:** Simple in-memory cache without size limits or LRU eviction. In Cloud Functions, this cache is per-instance and not shared.

**Recommendation:** Consider using Redis or Memcached for distributed caching, or implement proper LRU with size limits.

#### Issue 7.2: No Query Result Caching

Frequently accessed data like top artists, featured songs, and categories are queried on every request without caching.

**Recommendation:** Implement caching with appropriate TTL:
- Categories: 1 hour (rarely change)
- Top artists: 5 minutes
- Featured songs: 1 hour (updated weekly)
- Artist profiles: 10 minutes

---

### 8. Specific Query Optimizations

#### Optimization 8.1: Artist Search with ILIKE

**Location:** `functions/src/shared/cloudSql/artists.ts:217-235`

```typescript
SELECT id, name, type, image_url
FROM artists
WHERE name ILIKE $1
ORDER BY popularity DESC NULLS LAST, name ASC
LIMIT $2;
```

**Problem:** Leading wildcard in ILIKE (`%query%`) prevents index usage, causing full table scan.

**Recommendation:** Use pg_trgm extension for trigram matching:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_artists_name_trgm ON artists USING GIN (name gin_trgm_ops);
```

Then use:
```typescript
SELECT id, name, type, image_url
FROM artists
WHERE name % $1  -- trigram similarity
ORDER BY similarity(name, $1) DESC, popularity DESC NULLS LAST
LIMIT $2;
```

#### Optimization 8.2: Song Count Queries

**Location:** `functions/src/shared/cloudSql/songs.ts`

Multiple count queries use `COUNT(*)` without considering that PostgreSQL caches count estimates poorly for large tables.

**Recommendation:** For approximate counts, use:
```sql
SELECT reltuples::bigint AS estimate
FROM pg_class
WHERE relname = 'songs';
```

For exact counts when needed, ensure indexes support the query.

---

## Prioritized Action Plan

### Phase 1: Critical Performance Fixes (Immediate)

1. **Update connection pool configuration** - 5 minutes
   - Increase max connections to 20
   - Set min to 2
   - Add query timeouts

2. **Add missing critical indexes** - 10 minutes
   - idx_songs_status_popularity
   - idx_songs_artist_popularity
   - idx_song_versions_artist_song
   - idx_featured_songs_snapshot_week

3. **Parallelize search endpoint queries** - 15 minutes
   - Use Promise.all for independent queries
   - Batch song metrics fetch

### Phase 2: High-Priority Optimizations (Week 1)

4. **Optimize artist profile query** - 2 hours
   - Add composite indexes
   - Materialize isFeatured column
   - Simplify JOIN conditions

5. **Fix N+1 patterns** - 3 hours
   - Batch album track lookups
   - Optimize artist suggestions query
   - Add pg_trgm for text search

6. **Implement partial indexes** - 1 hour
   - Published songs only
   - Active categories only
   - Artists with popularity

### Phase 3: Medium-Priority Improvements (Week 2)

7. **Review data model** - 4 hours
   - Evaluate JSONB vs junction tables for genres
   - Consider CDC for Firestore sync
   - Normalize redundant data

8. **Implement caching strategy** - 4 hours
   - Add Redis for distributed cache
   - Cache frequently accessed data
   - Implement cache invalidation

9. **Add monitoring** - 2 hours
   - Query performance logging
   - Slow query detection
   - Connection pool metrics

---

## Estimated Impact

| Optimization | Latency Improvement | Throughput Improvement | Effort |
|--------------|-------------------|----------------------|---------|
| Connection pool config | 20-30% | 2-3x | 5 min |
| Critical indexes | 40-60% | 3-5x | 10 min |
| Parallelize search queries | 30-50% | 2x | 15 min |
| Artist profile optimization | 50-70% | 3-4x | 2 hours |
| N+1 pattern fixes | 30-40% | 2x | 3 hours |
| Partial indexes | 20-30% | 1.5x | 1 hour |
| Caching strategy | 60-80% | 5-10x | 4 hours |

---

## Conclusion

The codebase shows good architectural patterns with proper separation of concerns and transaction management. However, there are significant optimization opportunities, particularly in:

1. **Connection pool configuration** - Current settings are too conservative for production
2. **Missing indexes** - Several critical queries lack proper indexing
3. **Sequential query execution** - Parallelization can significantly reduce latency
4. **N+1 query patterns** - Batch operations can improve throughput
5. **Search endpoint** - The most critical endpoint needs immediate attention

Implementing Phase 1 optimizations (connection pool, critical indexes, query parallelization) should yield 50-70% performance improvement with minimal effort. Phase 2 and 3 optimizations will provide additional gains but require more development time.

The database schema is well-designed with appropriate use of triggers for metric computation. The dual-write pattern with Firestore adds complexity but is manageable with proper synchronization.
