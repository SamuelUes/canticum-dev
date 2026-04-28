BEGIN;

WITH song_base AS (
  SELECT
    s.id AS song_id,
    COALESCE(s.total_views, 0) AS total_views,
    COALESCE(s.like_count, 0) AS like_count,
    COALESCE(s.artist_id, 0) AS artist_id,
    LEAST(100, GREATEST(0, ROUND(LOG(10, COALESCE(s.total_views, 0) + 1) * 20 + LOG(10, COALESCE(s.like_count, 0) + 1) * 12)))::SMALLINT AS computed_popularity
  FROM songs s
),
updated_songs AS (
  UPDATE songs s
  SET popularity = sb.computed_popularity
  FROM song_base sb
  WHERE s.id = sb.song_id
  RETURNING s.id, s.artist_id, s.total_views, s.like_count, s.popularity
),
artist_agg AS (
  SELECT
    a.id AS artist_id,
    COALESCE(SUM(s.total_views), 0)::INT AS total_views,
    COALESCE(SUM(s.like_count), 0)::INT AS like_count
  FROM artists a
  LEFT JOIN songs s ON s.artist_id = a.id
  GROUP BY a.id
),
artist_pop AS (
  SELECT
    artist_id,
    total_views,
    like_count,
    LEAST(100, GREATEST(0, ROUND(LOG(10, total_views + 1) * 20 + LOG(10, like_count + 1) * 10)))::SMALLINT AS popularity
  FROM artist_agg
)
UPDATE artists a
SET
  total_views = ap.total_views,
  like_count = ap.like_count,
  popularity = ap.popularity
FROM artist_pop ap
WHERE a.id = ap.artist_id;

INSERT INTO song_metric_daily (day, song_id, views_count, favorites_count, updated_at)
SELECT CURRENT_DATE, s.id, COALESCE(s.total_views, 0), COALESCE(s.like_count, 0), CURRENT_TIMESTAMP
FROM songs s
ON CONFLICT (day, song_id)
DO UPDATE SET
  views_count = EXCLUDED.views_count,
  favorites_count = EXCLUDED.favorites_count,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO artist_metric_daily (day, artist_id, views_count, favorites_count, popularity, updated_at)
SELECT CURRENT_DATE, a.id, COALESCE(a.total_views, 0), COALESCE(a.like_count, 0), COALESCE(a.popularity, 0), CURRENT_TIMESTAMP
FROM artists a
ON CONFLICT (day, artist_id)
DO UPDATE SET
  views_count = EXCLUDED.views_count,
  favorites_count = EXCLUDED.favorites_count,
  popularity = EXCLUDED.popularity,
  updated_at = CURRENT_TIMESTAMP;

COMMIT;
