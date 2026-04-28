BEGIN;

CREATE TABLE IF NOT EXISTS song_metric_daily (
  day DATE NOT NULL,
  song_id INT NOT NULL,
  views_count INT NOT NULL DEFAULT 0,
  favorites_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (day, song_id),
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_song_metric_daily_song ON song_metric_daily(song_id);
CREATE INDEX IF NOT EXISTS idx_song_metric_daily_day ON song_metric_daily(day DESC);

CREATE TABLE IF NOT EXISTS artist_metric_daily (
  day DATE NOT NULL,
  artist_id INT NOT NULL,
  views_count INT NOT NULL DEFAULT 0,
  favorites_count INT NOT NULL DEFAULT 0,
  popularity SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (day, artist_id),
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_artist_metric_daily_artist ON artist_metric_daily(artist_id);
CREATE INDEX IF NOT EXISTS idx_artist_metric_daily_day ON artist_metric_daily(day DESC);

CREATE TABLE IF NOT EXISTS featured_song_snapshots (
  id BIGSERIAL PRIMARY KEY,
  snapshot_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  song_id INT NOT NULL,
  artist_id INT,
  score NUMERIC(12,4) NOT NULL DEFAULT 0,
  rank_position INT NOT NULL,
  total_views INT NOT NULL DEFAULT 0,
  like_count INT NOT NULL DEFAULT 0,
  popularity SMALLINT NOT NULL DEFAULT 0,
  source VARCHAR(50) NOT NULL DEFAULT 'phase2_refresh',
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_featured_song_snapshots_at ON featured_song_snapshots(snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_featured_song_snapshots_song ON featured_song_snapshots(song_id);

COMMIT;
