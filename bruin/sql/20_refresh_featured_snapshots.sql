BEGIN;

WITH ranked AS (
  SELECT
    s.id AS song_id,
    s.artist_id,
    COALESCE(s.total_views, 0) AS total_views,
    COALESCE(s.like_count, 0) AS like_count,
    COALESCE(s.popularity, 0) AS popularity,
    (
      COALESCE(s.popularity, 0) * 1.00 +
      LEAST(100, LOG(10, COALESCE(s.total_views, 0) + 1) * 20) * 0.80 +
      LEAST(100, LOG(10, COALESCE(s.like_count, 0) + 1) * 25) * 1.20
    )::NUMERIC(12,4) AS score,
    ROW_NUMBER() OVER (
      ORDER BY
        (
          COALESCE(s.popularity, 0) * 1.00 +
          LEAST(100, LOG(10, COALESCE(s.total_views, 0) + 1) * 20) * 0.80 +
          LEAST(100, LOG(10, COALESCE(s.like_count, 0) + 1) * 25) * 1.20
        ) DESC,
        s.id DESC
    ) AS rank_position
  FROM songs s
  JOIN song_states ss ON ss.id = s.state_id
  WHERE ss.code = 'PUBLISHED'
)
INSERT INTO featured_song_snapshots (
  snapshot_at,
  song_id,
  artist_id,
  score,
  rank_position,
  total_views,
  like_count,
  popularity,
  source
)
SELECT
  CURRENT_TIMESTAMP,
  r.song_id,
  NULLIF(r.artist_id, 0),
  r.score,
  r.rank_position,
  r.total_views,
  r.like_count,
  r.popularity,
  'phase2_refresh'
FROM ranked r
WHERE r.rank_position <= 200;

COMMIT;
