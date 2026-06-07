-- ================================
-- Canticum - repertoire BASE
-- Roles, Permisos y Canciones
-- PostgreSQL compatible
-- Fuente canónica de negocio relacional.
-- Ver responsabilidades SQL vs Firestore en: docs/CloudSQL-vs-Firestore.md
-- ================================

BEGIN;

-- ================================
-- USERS
-- ================================
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  firebase_uid VARCHAR(128) UNIQUE,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password TEXT,
  auth_provider VARCHAR(50) NOT NULL DEFAULT 'firebase_auth',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ================================
-- ROLES
-- ================================
CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT
);

-- ================================
-- PERMISSIONS
-- ================================
CREATE TABLE permissions (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  description TEXT
);

-- ================================
-- USER_ROLES (N:M)
-- ================================
CREATE TABLE user_roles (
  user_id INT NOT NULL,
  role_id INT NOT NULL,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- ================================
-- ROLE_PERMISSIONS (N:M)
-- ================================
CREATE TABLE role_permissions (
  role_id INT NOT NULL,
  permission_id INT NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- ================================
-- SONG STATES
-- ================================
CREATE TABLE song_states (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  description TEXT
);

-- ================================
-- CATEGORIES
-- Catálogo jerárquico para género musical, tiempo eclesiástico,
-- uso litúrgico, ocasión pastoral y otras clasificaciones.
-- ================================
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  category_type VARCHAR(50) NOT NULL,
  slug VARCHAR(120) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  parent_id INT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  metadata_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL,
  UNIQUE (category_type, name)
);

-- ================================
-- SONGS
-- ================================
CREATE TABLE songs (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  state_id INT NOT NULL,
  artist_id INT,
  title VARCHAR(200) NOT NULL,
  year INT,
  liturgical_use VARCHAR(100),
  file_path TEXT NOT NULL,
  -- Spotify-aligned track metadata.
  -- images_json: ordered list of { url, width, height } (largest first).
  images_json JSONB DEFAULT '[]'::jsonb,
  duration_ms INT,
  track_number SMALLINT,
  disc_number SMALLINT DEFAULT 1,
  -- International Standard Recording Code (external identifier).
  isrc VARCHAR(20),
  like_count INT DEFAULT 0,
  -- popularity: 0-100 normalized score. Derived from total_views when null (log10-scaled).
  popularity SMALLINT DEFAULT 0,
  total_views INT DEFAULT 0,
  -- preview_url: short reference sample (Spotify's `preview_url`).
  preview_url TEXT,
  -- Optional album membership shortcut (also resolvable via album_songs join table).
  album_id INT,
  -- external_urls_json: per-provider URLs, e.g. `{ "canticum": "...", "spotify": "..." }`.
  external_urls_json JSONB DEFAULT '{}'::jsonb,
  -- categories_json: list of category tags used by UI filtering.
  -- Example: ["rock", "musica religiosa", "adviento", "entrada"]
  categories_json JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (state_id) REFERENCES song_states(id)
);

-- ================================
-- SUBSCRIPTIONS
-- ================================
CREATE TABLE subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  plan VARCHAR(50) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  active BOOLEAN DEFAULT TRUE,
  platform VARCHAR(30),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ================================
-- ARTISTS
-- ================================
CREATE TABLE artists (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  type VARCHAR(50),
  bio TEXT,
  image_url TEXT,
  -- images_json: list of { url, width, height }. First entry should be the largest.
  -- Spotify-aligned images[] payload; image_url is kept as a back-compat shortcut.
  images_json JSONB DEFAULT '[]'::jsonb,
  like_count INT DEFAULT 0,
  total_views INT DEFAULT 0,
  -- popularity: 0-100 normalized score (log10 of total_views scaled to 0-100).
  -- Can be overridden manually; otherwise the backend derives it from total_views.
  popularity SMALLINT DEFAULT 0,
  genres_json JSONB DEFAULT '[]'::jsonb,
  categories_json JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ================================
-- ARTIST_DISCOGRAPHY (1:N)
-- ================================
CREATE TABLE artist_discography (
  id SERIAL PRIMARY KEY,
  artist_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  release_year INT,
  cover_url TEXT,
  song_id INT,
  order_index INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE SET NULL
);

-- ================================
-- ARTIST_SUGGESTIONS (N:M)
-- ================================
CREATE TABLE artist_suggestions (
  id SERIAL PRIMARY KEY,
  artist_id INT,3
  suggested_artist_id INT NOT NULL,
  relevance_score NUMERIC(5,2) DEFAULT 1.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (artist_id, suggested_artist_id),
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
  FOREIGN KEY (suggested_artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

-- ================================
-- ARTIST_LIKES (N:M)
-- ================================
CREATE TABLE artist_likes (
  id SERIAL PRIMARY KEY,
  artist_id INT NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (artist_id, user_id),
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ================================
-- ALBUMS
-- A song can belong to zero or one album as its primary release,
-- or to multiple albums via album_songs (features, compilations).
-- Singles are songs with no album_songs entry.
-- ================================
CREATE TABLE albums (
  id SERIAL PRIMARY KEY,
  artist_id INT,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  cover_url TEXT,
  -- Spotify-aligned image list. `{ url, width, height }` (largest first).
  images_json JSONB DEFAULT '[]'::jsonb,
  release_year INT,
  -- Spotify-aligned full release date and precision.
  release_date DATE,
  release_date_precision VARCHAR(10) DEFAULT 'year',
  -- release_date_precision: 'year' | 'month' | 'day'
  album_type VARCHAR(50) DEFAULT 'album',
  -- album_type: 'album' | 'single' | 'ep' | 'compilation' | 'live'
  total_tracks INT DEFAULT 0,
  -- Universal Product Code (external identifier).
  upc VARCHAR(20),
  label VARCHAR(200),
  genres_json JSONB DEFAULT '[]'::jsonb,
  -- categories_json: list of category tags used by UI filtering.
  categories_json JSONB DEFAULT '[]'::jsonb,
  -- copyrights_json: list of `{ text, type: 'C' | 'P' }`.
  copyrights_json JSONB DEFAULT '[]'::jsonb,
  -- external_urls_json: per-provider URLs, e.g. `{ "canticum": "...", "spotify": "..." }`.
  external_urls_json JSONB DEFAULT '{}'::jsonb,
  -- popularity: 0-100 normalized score; derived from total_views (log10-scaled) when null.
  popularity SMALLINT DEFAULT 0,
  total_views INT DEFAULT 0,
  status VARCHAR(50) DEFAULT 'PUBLISHED',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE SET NULL
);

-- ================================
-- ALBUM_SONGS (N:M)
-- A song can appear in 0 or more albums.
-- is_primary_release = TRUE for the original album of a song.
-- ================================
CREATE TABLE album_songs (
  id SERIAL PRIMARY KEY,
  album_id INT NOT NULL,
  song_id INT NOT NULL,
  track_number INT,
  is_primary_release BOOLEAN DEFAULT FALSE,
  UNIQUE (album_id, song_id),
  FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
);

CREATE TABLE featured_songs (
  snapshot_week DATE NOT NULL,
  rank_position INT NOT NULL,
  song_id INT NOT NULL,
  score NUMERIC(10,4) NOT NULL,
  popularity SMALLINT NOT NULL,
  total_views INT NOT NULL,
  like_count INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (snapshot_week, rank_position),
  UNIQUE (snapshot_week, song_id),
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
);

-- ================================
-- INSTRUMENTS
-- ================================
CREATE TABLE instruments (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL
);

-- Optional migration for existing environments:
-- Normalize and deduplicate instruments case-insensitively, then enforce unique lower(name).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_repertoire.tables
    WHERE table_repertoire = 'public' AND table_name = 'instruments'
  ) THEN
    UPDATE instruments
    SET name = btrim(name)
    WHERE name <> btrim(name);

    WITH duplicates AS (
      SELECT
        id,
        lower(name) AS key_name,
        MIN(id) OVER (PARTITION BY lower(name)) AS keep_id
      FROM instruments
    ),
    remap AS (
      SELECT id AS duplicate_id, keep_id
      FROM duplicates
      WHERE id <> keep_id
    )
    UPDATE song_versions sv
    SET instrument_id = remap.keep_id
    FROM remap
    WHERE sv.instrument_id = remap.duplicate_id;

    DELETE FROM instruments i
    USING (
      SELECT id
      FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY lower(name) ORDER BY id) AS rn
        FROM instruments
      ) ranked
      WHERE rn > 1
    ) dups
    WHERE i.id = dups.id;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_instruments_name_lower_unique ON instruments ((lower(name)));

-- ================================
-- SONG_VERSIONS
-- ================================
CREATE TABLE song_versions (
  id SERIAL PRIMARY KEY,
  song_id INT NOT NULL,
  artist_id INT,
  version_name VARCHAR(150) NOT NULL,
  --- Deprecated ----
  -- instrument_id INT,
  -- tone VARCHAR(20),
  -- notation_type VARCHAR(50),
  ------------------------------
  audio_mode VARCHAR(20) DEFAULT 'shared',
  audio_reference_url TEXT,
  is_premium BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
  FOREIGN KEY (artist_id) REFERENCES artists(id)
);

-- ================================
-- SONG VERSION INSTRUMENTATIONS
-- ================================
-- Each version can have multiple instrumentations with their own assets
CREATE TABLE song_version_instrumentations (
  id SERIAL PRIMARY KEY,
  song_version_id INT NOT NULL,
  instrument_id INT,
  instrument_name VARCHAR(150) NOT NULL,
  lyrics TEXT,
  lyrics_file_url TEXT,
  sheet_file_url TEXT,
  audio_reference_url TEXT,
  tone VARCHAR(20),
  notation_type VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (song_version_id) REFERENCES song_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (instrument_id) REFERENCES instruments(id)
);

-- ================================
-- repertoireS
-- ================================
CREATE TABLE repertoires (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  type VARCHAR(80),
  -- categories_json: list of category tags used by UI filtering.
  categories_json JSONB DEFAULT '[]'::jsonb,
  cover_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ================================
-- repertoire_SONGS (N:M)
-- ================================
CREATE TABLE repertoire_songs (
  id SERIAL PRIMARY KEY,
  repertoire_id INT NOT NULL,
  song_id INT NOT NULL,
  order_index INT NOT NULL,
  UNIQUE (repertoire_id, song_id),
  UNIQUE (repertoire_id, order_index),
  FOREIGN KEY (repertoire_id) REFERENCES repertoires(id) ON DELETE CASCADE,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
);

-- ================================
-- FAVORITES
-- ================================
CREATE TABLE favorites (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  song_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, song_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
);

CREATE OR REPLACE FUNCTION clamp_metric_score(raw_value NUMERIC)
RETURNS SMALLINT
LANGUAGE plpgsql
AS $$
DECLARE
  safe_value NUMERIC;
BEGIN
  safe_value := COALESCE(raw_value, 0);
  IF safe_value < 0 THEN
    safe_value := 0;
  ELSIF safe_value > 100 THEN
    safe_value := 100;
  END IF;

  RETURN ROUND(safe_value)::SMALLINT;
END;
$$;

CREATE OR REPLACE FUNCTION compute_song_popularity(total_views_value INT, like_count_value INT)
RETURNS SMALLINT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT clamp_metric_score(
    LOG(10, GREATEST(COALESCE(total_views_value, 0), 0) + 1) * 20
    + LOG(10, GREATEST(COALESCE(like_count_value, 0), 0) + 1) * 12
  );
$$;

CREATE OR REPLACE FUNCTION compute_artist_popularity(total_views_value INT, like_count_value INT)
RETURNS SMALLINT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT clamp_metric_score(
    LOG(10, GREATEST(COALESCE(total_views_value, 0), 0) + 1) * 20
    + LOG(10, GREATEST(COALESCE(like_count_value, 0), 0) + 1) * 10
  );
$$;

CREATE OR REPLACE FUNCTION sync_artist_metrics_by_id(target_artist_id INT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  artist_total_views INT := 0;
  artist_like_count INT := 0;
BEGIN
  IF target_artist_id IS NULL OR target_artist_id <= 0 THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(song_metrics.total_views), 0)::INT
  INTO artist_total_views
  FROM (
    SELECT DISTINCT
      s.id,
      COALESCE(s.total_views, 0)::INT AS total_views
    FROM songs s
    LEFT JOIN song_versions sv ON sv.song_id = s.id
    WHERE s.artist_id = target_artist_id
      OR sv.artist_id = target_artist_id
  ) song_metrics;

  SELECT
    COUNT(*)::INT
  INTO artist_like_count
  FROM artist_likes al
  WHERE al.artist_id = target_artist_id;

  UPDATE artists
  SET
    total_views = artist_total_views,
    like_count = artist_like_count,
    popularity = compute_artist_popularity(artist_total_views, artist_like_count)
  WHERE id = target_artist_id;
END;
$$;

CREATE OR REPLACE FUNCTION sync_song_metrics_by_id(target_song_id INT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  song_artist_id INT;
  song_total_views INT := 0;
  song_like_count INT := 0;
BEGIN
  IF target_song_id IS NULL OR target_song_id <= 0 THEN
    RETURN;
  END IF;

  SELECT artist_id, COALESCE(total_views, 0)::INT
  INTO song_artist_id, song_total_views
  FROM songs
  WHERE id = target_song_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::INT
  INTO song_like_count
  FROM favorites
  WHERE song_id = target_song_id;

  UPDATE songs
  SET
    like_count = song_like_count,
    popularity = compute_song_popularity(song_total_views, song_like_count)
  WHERE id = target_song_id;

  PERFORM sync_artist_metrics_by_id(song_artist_id);
END;
$$;

CREATE OR REPLACE FUNCTION trg_songs_prepare_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.total_views := GREATEST(COALESCE(NEW.total_views, 0), 0);
  NEW.like_count := GREATEST(COALESCE(NEW.like_count, 0), 0);
  NEW.popularity := compute_song_popularity(NEW.total_views, NEW.like_count);
  RETURN NEW;
END;
$$;

CREATE TRIGGER songs_prepare_metrics_before_write
BEFORE INSERT OR UPDATE OF total_views, like_count
ON songs
FOR EACH ROW
EXECUTE FUNCTION trg_songs_prepare_metrics();

CREATE OR REPLACE FUNCTION trg_songs_sync_artist_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM sync_artist_metrics_by_id(NEW.artist_id);

  IF TG_OP = 'UPDATE' AND OLD.artist_id IS DISTINCT FROM NEW.artist_id THEN
    PERFORM sync_artist_metrics_by_id(OLD.artist_id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER songs_sync_artist_metrics_after_write
AFTER INSERT OR UPDATE OF total_views, like_count, artist_id
ON songs
FOR EACH ROW
EXECUTE FUNCTION trg_songs_sync_artist_metrics();

CREATE OR REPLACE FUNCTION trg_favorites_sync_song_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM sync_song_metrics_by_id(NEW.song_id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM sync_song_metrics_by_id(OLD.song_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER favorites_sync_song_metrics_after_write
AFTER INSERT OR DELETE
ON favorites
FOR EACH ROW
EXECUTE FUNCTION trg_favorites_sync_song_metrics();

CREATE OR REPLACE FUNCTION refresh_featured_songs_snapshot(
  snapshot_limit INT DEFAULT 50,
  target_week DATE DEFAULT date_trunc('week', CURRENT_DATE)::DATE
)
RETURNS TABLE (
  snapshot_week DATE,
  rank_position INT,
  song_id INT,
  score NUMERIC(10,4),
  popularity SMALLINT,
  total_views INT,
  like_count INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  safe_limit INT;
BEGIN
  safe_limit := GREATEST(1, LEAST(COALESCE(snapshot_limit, 50), 200));

  DELETE FROM featured_songs
  WHERE snapshot_week = target_week;

  INSERT INTO featured_songs (
    snapshot_week,
    rank_position,
    song_id,
    score,
    popularity,
    total_views,
    like_count,
    updated_at
  )
  SELECT
    target_week,
    ROW_NUMBER() OVER (
      ORDER BY
        ranked.score DESC,
        ranked.popularity DESC,
        ranked.like_count DESC,
        ranked.total_views DESC,
        ranked.song_id DESC
    )::INT AS rank_position,
    ranked.song_id,
    ranked.score,
    ranked.popularity,
    ranked.total_views,
    ranked.like_count,
    CURRENT_TIMESTAMP
  FROM (
    SELECT
      s.id AS song_id,
      COALESCE(s.popularity, 0)::SMALLINT AS popularity,
      COALESCE(s.total_views, 0)::INT AS total_views,
      COALESCE(s.like_count, 0)::INT AS like_count,
      ROUND(
        (
          COALESCE(s.popularity, 0)::NUMERIC * 0.60
          + LOG(10, COALESCE(s.total_views, 0) + 1)::NUMERIC * 25
          + LOG(10, COALESCE(s.like_count, 0) + 1)::NUMERIC * 15
        ),
        4
      ) AS score
    FROM songs s
    LEFT JOIN song_states ss ON ss.id = s.state_id
    WHERE UPPER(COALESCE(ss.code, '')) IN ('PUBLISHED', 'APPROVED')
  ) ranked
  ORDER BY
    ranked.score DESC,
    ranked.popularity DESC,
    ranked.like_count DESC,
    ranked.total_views DESC,
    ranked.song_id DESC
  LIMIT safe_limit;

  RETURN QUERY
  SELECT
    fs.snapshot_week,
    fs.rank_position,
    fs.song_id,
    fs.score,
    fs.popularity,
    fs.total_views,
    fs.like_count
  FROM featured_songs fs
  WHERE fs.snapshot_week = target_week
  ORDER BY fs.rank_position ASC;
END;
$$;

ALTER TABLE songs
  ADD CONSTRAINT fk_songs_artist FOREIGN KEY (artist_id) REFERENCES artists(id);

-- ================================
-- INDEXES (Performance)
-- ================================
CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);

CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission ON role_permissions(permission_id);

CREATE INDEX idx_songs_state ON songs(state_id);
CREATE INDEX idx_songs_user ON songs(user_id);
CREATE INDEX idx_songs_artist ON songs(artist_id);
CREATE INDEX idx_songs_year ON songs(year);
CREATE INDEX idx_songs_album ON songs(album_id);
CREATE INDEX idx_songs_like_count ON songs(like_count);
CREATE INDEX idx_songs_popularity ON songs(popularity);
CREATE INDEX idx_songs_total_views ON songs(total_views);
CREATE UNIQUE INDEX idx_songs_isrc ON songs(isrc) WHERE isrc IS NOT NULL;

CREATE INDEX idx_artists_type ON artists(type);
CREATE INDEX idx_artists_like_count ON artists(like_count);
CREATE INDEX idx_artists_total_views ON artists(total_views);
CREATE INDEX idx_artists_popularity ON artists(popularity);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_active ON subscriptions(active);

CREATE INDEX idx_song_versions_song ON song_versions(song_id);
CREATE INDEX idx_song_versions_artist ON song_versions(artist_id);
CREATE INDEX idx_song_versions_instrument ON song_versions(instrument_id);

CREATE INDEX idx_repertoires_user ON repertoires(user_id);
CREATE INDEX idx_repertoire_songs_repertoire ON repertoire_songs(repertoire_id);
CREATE INDEX idx_repertoire_songs_song ON repertoire_songs(song_id);

CREATE INDEX idx_artist_discography_artist ON artist_discography(artist_id);
CREATE INDEX idx_artist_discography_song ON artist_discography(song_id);
CREATE INDEX idx_artist_suggestions_artist ON artist_suggestions(artist_id);
CREATE INDEX idx_artist_suggestions_related ON artist_suggestions(suggested_artist_id);
CREATE INDEX idx_artist_likes_artist ON artist_likes(artist_id);
CREATE INDEX idx_artist_likes_user ON artist_likes(user_id);

CREATE INDEX idx_favorites_user ON favorites(user_id);
CREATE INDEX idx_favorites_song ON favorites(song_id);
CREATE INDEX idx_featured_songs_week ON featured_songs(snapshot_week);
CREATE INDEX idx_featured_songs_song ON featured_songs(song_id);

CREATE INDEX idx_albums_artist ON albums(artist_id);
CREATE INDEX idx_albums_status ON albums(status);
CREATE INDEX idx_albums_release_year ON albums(release_year);
CREATE INDEX idx_albums_release_date ON albums(release_date);
CREATE INDEX idx_albums_popularity ON albums(popularity);
CREATE UNIQUE INDEX idx_albums_upc ON albums(upc) WHERE upc IS NOT NULL;
CREATE INDEX idx_album_songs_album ON album_songs(album_id);
CREATE INDEX idx_album_songs_song ON album_songs(song_id);
CREATE INDEX idx_album_songs_primary ON album_songs(is_primary_release);
CREATE INDEX idx_categories_type ON categories(category_type);
CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_songs_categories_json ON songs USING GIN (categories_json);
CREATE INDEX idx_albums_categories_json ON albums USING GIN (categories_json);
CREATE INDEX idx_repertoires_categories_json ON repertoires USING GIN (categories_json);
CREATE INDEX idx_artists_categories_json ON artists USING GIN (categories_json);

-- ================================
-- CRITICAL PERFORMANCE INDEXES (Optimization Phase 1)
-- ================================

-- For search endpoint performance
CREATE INDEX idx_songs_status_popularity ON songs(state_id, popularity DESC NULLS LAST, id DESC);
CREATE INDEX idx_songs_artist_popularity ON songs(artist_id, popularity DESC NULLS LAST, id DESC);

-- For artist profile songs query
CREATE INDEX idx_song_versions_artist_song ON song_versions(artist_id, song_id);
CREATE INDEX idx_song_versions_song_instrument ON song_versions(song_id, instrument_id);

-- For featured songs queries (improved composite index)
CREATE INDEX idx_featured_songs_snapshot_week_rank ON featured_songs(snapshot_week DESC, rank_position ASC);
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

-- For song metrics (only if table exists)
-- CREATE INDEX idx_song_metrics_song_id ON song_metrics(song_id);

-- ================================
-- PARTIAL INDEXES (Optimization Phase 2)
-- ================================

-- Only index active categories
CREATE INDEX idx_categories_active_slug
ON categories(slug)
WHERE is_active = TRUE;

-- Only index artists with popularity (simplified - no function call in index)
CREATE INDEX idx_artists_popularity_score
ON artists(popularity DESC NULLS LAST)
WHERE popularity IS NOT NULL AND popularity > 0;

-- ================================
-- TEXT SEARCH OPTIMIZATION
-- ================================

-- GIN index for artist name trigram search (requires pg_trgm extension)
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX idx_artists_name_trgm ON artists USING GIN (name gin_trgm_ops);

-- GIN index for genres_json to improve artist suggestions query
CREATE INDEX idx_artists_genres ON artists USING GIN (genres_json);

-- ================================
-- BASE DATA (Opcional pero recomendado)
-- ================================

-- Roles base
INSERT INTO roles (name, description) VALUES
('admin', 'Administrador del sistema'),
('curator', 'Curador de contenido musical'),
('editor', 'Editor de canciones'),
('user', 'Usuario estándar');

-- Permisos base
INSERT INTO permissions (key, description) VALUES
('song:create', 'Crear canciones'),
('song:edit', 'Editar canciones'),
('song:delete', 'Eliminar canciones'),
('song:submit_review', 'Enviar canción a revisión'),
('song:approve', 'Aprobar canciones'),
('song:reject', 'Rechazar canciones'),
('song:publish', 'Publicar canciones'),
('metadata:validate', 'Validar metadatos');

-- Estados de canciones
INSERT INTO song_3s (code, description) VALUES
('DRAFT', 'Borrador'),
('UPLOADED', 'Archivo subido'),
('IN_REVIEW', 'En revisión'),
('APPROVED', 'Aprobada'),
('REJECTED', 'Rechazada'),
('PUBLISHED', 'Publicada'),
('ARCHIVED', 'Archivada');

-- Categorías base (expandibles por panel admin o migraciones futuras)
INSERT INTO categories (category_type, slug, name, description, sort_order) VALUES
('GENRE', 'rock', 'Rock', 'Género musical rock.', 10),
('GENRE', 'pop', 'Pop', 'Género musical pop.', 20),
('GENRE', 'musica-religiosa', 'Música Religiosa', 'Canciones de enfoque cristiano y litúrgico.', 30),
('GENRE', 'reggaeton', 'Reggaeton', 'Género urbano reggaeton.', 40),
('GENRE', 'alabanza-adoracion', 'Alabanza y Adoración', 'Subgénero de música congregacional.', 50),
('GENRE', 'gospel', 'Gospel', 'Música góspel.', 60),
('LITURGICAL_TIME', 'adviento', 'Adviento', 'Tiempo litúrgico de preparación a la Navidad.', 10),
('LITURGICAL_TIME', 'navidad', 'Navidad', 'Tiempo litúrgico de la Natividad.', 20),
('LITURGICAL_TIME', 'cuaresma', 'Cuaresma', 'Tiempo litúrgico de preparación a Pascua.', 30),
('LITURGICAL_TIME', 'pascua', 'Pascua', 'Tiempo litúrgico pascual.', 40),
('LITURGICAL_TIME', 'tiempo-ordinario', 'Tiempo Ordinario', 'Tiempo litúrgico ordinario.', 50),
('LITURGICAL_USE', 'entrada', 'Entrada', 'Canto de entrada.', 10),
('LITURGICAL_USE', 'ofertorio', 'Ofertorio', 'Canto de ofertorio.', 20),
('LITURGICAL_USE', 'comunion', 'Comunión', 'Canto de comunión.', 30),
('LITURGICAL_USE', 'salida', 'Salida', 'Canto de salida.', 40),
('MINISTRY', 'juvenil', 'Juvenil', 'Categoría ministerial juvenil.', 10),
('MINISTRY', 'infantil', 'Infantil', 'Categoría ministerial infantil.', 20),
('OCCASION', 'misa-dominical', 'Misa Dominical', 'Celebración ordinaria dominical.', 10),
('OCCASION', 'adoracion-eucaristica', 'Adoración Eucarística', 'Espacios de adoración.', 20),
('OCCASION', 'retiro', 'Retiro', 'Encuentros de retiro espiritual.', 30);

-- ================================
-- PERMISSIONS
-- Grant permissions to the Cloud SQL application user
-- Replace 'canticum_app_user' with your actual database user from CLOUD_SQL_USER/DB_USER
-- ================================

DO $$
DECLARE
  app_user TEXT := COALESCE(current_user, 'canticum_app_user');
BEGIN
  -- Grant usage on schema
  GRANT USAGE ON SCHEMA public TO app_user;

  -- Grant SELECT on all tables
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_user;

  -- Grant INSERT, UPDATE, DELETE on specific tables that the app needs to modify
  GRANT INSERT, UPDATE, DELETE ON TABLE users TO app_user;
  GRANT INSERT, UPDATE, DELETE ON TABLE songs TO app_user;
  GRANT INSERT, UPDATE, DELETE ON TABLE song_versions TO app_user;
  GRANT INSERT, UPDATE, DELETE ON TABLE instruments TO app_user;
  GRANT INSERT, UPDATE, DELETE ON TABLE favorites TO app_user;
  GRANT INSERT, UPDATE, DELETE ON TABLE artist_likes TO app_user;
  GRANT INSERT, UPDATE, DELETE ON TABLE artist_suggestions TO app_user;
  GRANT INSERT, UPDATE, DELETE ON TABLE repertoires TO app_user;
  GRANT INSERT, UPDATE, DELETE ON TABLE repertoire_songs TO app_user;
  GRANT INSERT, UPDATE, DELETE ON TABLE featured_songs TO app_user;
  GRANT INSERT, UPDATE, DELETE ON TABLE albums TO app_user;
  GRANT INSERT, UPDATE, DELETE ON TABLE album_songs TO app_user;
  GRANT INSERT, UPDATE, DELETE ON TABLE artist_discography TO app_user;

  -- Grant usage on sequences for auto-increment IDs
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

  -- Grant execute on functions
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_user;

  -- Ensure future tables also get SELECT permissions
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO app_user;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;
END $$;

COMMIT;
