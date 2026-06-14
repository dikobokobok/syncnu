-- ============================================================
--  Syncnu Cloud Drive — Database Setup
--  Jalankan di: Supabase Dashboard → SQL Editor
--  URL: https://supabase.com/dashboard/project/<project-ref>/sql
-- ============================================================


-- ============================================================
--  BAGIAN 1: HAPUS TOTAL (Reset Database)
--  Jalankan bagian ini TERLEBIH DAHULU jika ingin mulai fresh.
--  PERINGATAN: Semua data akan hilang permanen.
-- ============================================================

DROP TABLE IF EXISTS files CASCADE;
DROP TABLE IF EXISTS folders CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS shares CASCADE;


-- ============================================================
--  BAGIAN 2: BUAT TABEL
-- ============================================================

-- Tabel users (menggantikan Supabase Auth)
CREATE TABLE users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        NOT NULL UNIQUE,
  password    TEXT        NOT NULL,       -- bcrypt hash
  name        TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users(email);

-- Tabel folders
CREATE TABLE folders (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  owner       TEXT        NOT NULL,       -- email user atau 'system' untuk folder default
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  modified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabel files
CREATE TABLE files (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  size        BIGINT      NOT NULL,
  type        TEXT        NOT NULL,
  path        TEXT        NOT NULL,       -- path relatif ke backend, contoh: /files/Gambar/foto.jpg
  owner       TEXT        NOT NULL,       -- email user pemilik file
  folder_id   UUID        REFERENCES folders(id) ON DELETE SET NULL,
  folder_name TEXT        DEFAULT NULL,   -- snapshot nama folder saat upload (tetap ada walau folder dihapus)
  is_favorited BOOLEAN    NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  modified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ DEFAULT NULL   -- NULL = aktif, non-NULL = di sampah
);

-- Index untuk performa query umum
CREATE INDEX idx_files_owner        ON files(owner);
CREATE INDEX idx_files_folder_id    ON files(folder_id);
CREATE INDEX idx_files_deleted_at   ON files(deleted_at);
CREATE INDEX idx_folders_owner      ON folders(owner);


-- ============================================================
--  BAGIAN 3: SEED DATA — Folder Default Sistem
--  Folder ini dikelola backend, tidak bisa dihapus user.
-- ============================================================

INSERT INTO folders (name, owner) VALUES
  ('Dokumen', 'system'),
  ('Gambar',  'system'),
  ('Video',   'system'),
  ('Musik',   'system');


-- ============================================================
--  BAGIAN 4: BUAT USER ADMIN
--
--  Password di bawah adalah bcrypt hash dari "admin123".
--
--  Cara generate hash baru (jalankan di folder server/etc):
--    node -e "import('bcryptjs').then(b => b.default.hash('passwordAnda',10).then(h => console.log(h)))"
-- ============================================================

INSERT INTO users (email, password, name) VALUES (
  'admin@syncnu.app',
  '$2b$10$NL0n8oYaKZsTv6r.g7rR3.YOrrjrGJr6LyUrmfIV86ELY0wbc4qVa',
  'admin'
);


-- ============================================================
--  BAGIAN 5: AUTO-PURGE SAMPAH (Opsional — butuh pg_cron)
--
--  Aktifkan ekstensi pg_cron di:
--  Supabase Dashboard → Database → Extensions → cron
--
--  Setelah aktif, jalankan query berikut untuk menjadwalkan
--  pembersihan otomatis setiap hari pukul 03:00:
-- ============================================================

-- SELECT cron.schedule(
--   'purge-trash-daily',
--   '0 3 * * *',
--   $$
--     DELETE FROM files
--     WHERE deleted_at IS NOT NULL
--       AND deleted_at < now() - INTERVAL '7 days';
--   $$
-- );


-- ============================================================
--  CATATAN KEAMANAN
--
--  Backend menggunakan SUPABASE_SERVICE_ROLE_KEY yang mem-bypass
--  Row Level Security (RLS). Ini aman karena backend adalah
--  trusted server-side process yang tidak terekspos ke publik.
--
--  Jika ingin mengaktifkan RLS untuk keamanan tambahan:
--
--  ALTER TABLE files   ENABLE ROW LEVEL SECURITY;
--  ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
--
--  CREATE POLICY "users_own_files" ON files
--    FOR ALL USING (owner = auth.email());
--
--  CREATE POLICY "users_own_folders" ON folders
--    FOR ALL USING (owner = auth.email() OR owner = 'system');
-- ============================================================


-- ============================================================
--  BAGIAN 6: INDEKS KOMPOSIT UNTUK OPTIMASI PERFORMA
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_files_owner_deleted ON files(owner, deleted_at);
CREATE INDEX IF NOT EXISTS idx_files_folder_deleted ON files(folder_id, deleted_at);


-- ============================================================
--  BAGIAN 7: TABEL DAN INDEKS UNTUK SHARING (LINK & EMAIL)
-- ============================================================

CREATE TABLE IF NOT EXISTS shares (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id     UUID        REFERENCES files(id) ON DELETE CASCADE,
  folder_id   UUID        REFERENCES folders(id) ON DELETE CASCADE,
  shared_by   TEXT        NOT NULL,       -- email pengirim
  shared_to   TEXT        DEFAULT NULL,   -- email penerima (null jika share via link)
  token       TEXT        UNIQUE DEFAULT NULL, -- token untuk share via link
  share_type  TEXT        NOT NULL,       -- 'link' atau 'email'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shares_file_id ON shares(file_id);
CREATE INDEX IF NOT EXISTS idx_shares_folder_id ON shares(folder_id);
CREATE INDEX IF NOT EXISTS idx_shares_shared_to ON shares(shared_to);
CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(token);

