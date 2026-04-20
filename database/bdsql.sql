-- ================================
-- Canticum - SCHEMA BASE
-- Roles, Permisos y Canciones
-- PostgreSQL compatible
-- ================================

BEGIN;

-- ================================
-- USERS
-- ================================
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password TEXT NOT NULL,
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
  -- popularity: 0-100 normalized score. Derived from total_views when null (log10-scaled).
  popularity SMALLINT DEFAULT 0,
  total_views INT DEFAULT 0,
  -- preview_url: short reference sample (Spotify's `preview_url`).
  preview_url TEXT,
  -- Optional album membership shortcut (also resolvable via album_songs join table).
  album_id INT,
  -- external_urls_json: per-provider URLs, e.g. `{ "canticum": "...", "spotify": "..." }`.
  external_urls_json JSONB DEFAULT '{}'::jsonb,
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
  artist_id INT NOT NULL,
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

-- ================================
-- INSTRUMENTS
-- ================================
CREATE TABLE instruments (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL
);

-- ================================
-- SONG_VERSIONS
-- ================================
CREATE TABLE song_versions (
  id SERIAL PRIMARY KEY,
  song_id INT NOT NULL,
  artist_id INT,
  instrument_id INT,
  version_name VARCHAR(150) NOT NULL,
  tone VARCHAR(20),
  notation_type VARCHAR(50),
  audio_reference_url TEXT,
  is_premium BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
  FOREIGN KEY (artist_id) REFERENCES artists(id),
  FOREIGN KEY (instrument_id) REFERENCES instruments(id)
);

-- ================================
-- SCHEMAS
-- ================================
CREATE TABLE schemas (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  type VARCHAR(80),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ================================
-- SCHEMA_SONGS (N:M)
-- ================================
CREATE TABLE schema_songs (
  id SERIAL PRIMARY KEY,
  schema_id INT NOT NULL,
  song_id INT NOT NULL,
  order_index INT NOT NULL,
  UNIQUE (schema_id, song_id),
  UNIQUE (schema_id, order_index),
  FOREIGN KEY (schema_id) REFERENCES schemas(id) ON DELETE CASCADE,
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

CREATE INDEX idx_schemas_user ON schemas(user_id);
CREATE INDEX idx_schema_songs_schema ON schema_songs(schema_id);
CREATE INDEX idx_schema_songs_song ON schema_songs(song_id);

CREATE INDEX idx_artist_discography_artist ON artist_discography(artist_id);
CREATE INDEX idx_artist_discography_song ON artist_discography(song_id);
CREATE INDEX idx_artist_suggestions_artist ON artist_suggestions(artist_id);
CREATE INDEX idx_artist_suggestions_related ON artist_suggestions(suggested_artist_id);
CREATE INDEX idx_artist_likes_artist ON artist_likes(artist_id);
CREATE INDEX idx_artist_likes_user ON artist_likes(user_id);

CREATE INDEX idx_favorites_user ON favorites(user_id);
CREATE INDEX idx_favorites_song ON favorites(song_id);

CREATE INDEX idx_albums_artist ON albums(artist_id);
CREATE INDEX idx_albums_status ON albums(status);
CREATE INDEX idx_albums_release_year ON albums(release_year);
CREATE INDEX idx_albums_release_date ON albums(release_date);
CREATE INDEX idx_albums_popularity ON albums(popularity);
CREATE UNIQUE INDEX idx_albums_upc ON albums(upc) WHERE upc IS NOT NULL;
CREATE INDEX idx_album_songs_album ON album_songs(album_id);
CREATE INDEX idx_album_songs_song ON album_songs(song_id);
CREATE INDEX idx_album_songs_primary ON album_songs(is_primary_release);

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
INSERT INTO song_states (code, description) VALUES
('DRAFT', 'Borrador'),
('UPLOADED', 'Archivo subido'),
('IN_REVIEW', 'En revisión'),
('APPROVED', 'Aprobada'),
('REJECTED', 'Rechazada'),
('PUBLISHED', 'Publicada'),
('ARCHIVED', 'Archivada');

COMMIT;
