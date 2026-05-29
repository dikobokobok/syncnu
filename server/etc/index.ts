import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import ws from 'ws';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Load .env from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = __dirname.includes('dist')
  ? path.resolve(__dirname, '../../../')
  : path.resolve(__dirname, '../../');

dotenv.config({ path: path.resolve(rootDir, '.env') });

const app = express();
const PORT = process.env.PORT_BACKEND || 8889;
const JWT_SECRET = process.env.JWT_SECRET || 'syncnu_fallback_secret';

// ─── Storage directory ────────────────────────────────────────────────────────
const storageDir = path.resolve(rootDir, 'storage');
if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}

// ─── Supabase client (service_role bypasses RLS) ──────────────────────────────
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: ws as any },
    })
  : null;

if (!supabase) {
  console.warn('Warning: Supabase credentials missing. Backend will not function correctly.');
}

app.use(cors());
app.use(express.json());

// ─── Auth Endpoints ───────────────────────────────────────────────────────────

// POST /api/auth/register — daftar akun baru
app.post('/api/auth/register', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase not connected' });
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email dan password wajib diisi' });
  if (password.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter' });

  try {
    // Cek apakah email sudah terdaftar
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existing) return res.status(409).json({ error: 'Email sudah terdaftar' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const displayName = name || email.split('@')[0];

    const { data: newUser, error } = await supabase
      .from('users')
      .insert([{ email: email.toLowerCase(), password: hashedPassword, name: displayName }])
      .select('id, email, name, created_at')
      .single();

    if (error) return res.status(500).json({ error: error.message });

    res.status(201).json({ message: 'Akun berhasil dibuat', user: newUser });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login — masuk dengan email + password
app.post('/api/auth/login', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase not connected' });
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email dan password wajib diisi' });

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name, password')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !user) return res.status(401).json({ error: 'Email atau password salah' });

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(401).json({ error: 'Email atau password salah' });

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me — verifikasi token dan ambil data user
app.get('/api/auth/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token tidak ditemukan' });

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { id: string; email: string; name: string };
    res.json({ user: { id: payload.id, email: payload.email, name: payload.name } });
  } catch {
    res.status(401).json({ error: 'Token tidak valid atau sudah kadaluarsa' });
  }
});

// ─── Default Folders ─────────────────────────────────────────────────────────
const DEFAULT_FOLDERS: Record<string, { label: string; accept: string[]; mimePattern: RegExp }> = {
  Dokumen: {
    label: 'Dokumen',
    accept: [
      // Office
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.rtf', '.odt', '.ods', '.odp', '.csv',
      // Plain text & developer
      '.txt', '.md', '.mdx', '.json', '.xml', '.yaml', '.yml',
      '.html', '.htm', '.css', '.js', '.ts', '.tsx', '.jsx',
      '.py', '.java', '.php', '.go', '.rs', '.sh', '.bash',
      '.sql', '.env', '.log', '.ini', '.toml', '.conf',
      // Archive
      '.zip', '.rar', '.7z', '.tar', '.gz', '.tgz', '.bz2', '.xz',
    ],
    mimePattern: /^(application\/(pdf|msword|vnd\.|zip|x-zip|x-rar|x-7z|x-tar|gzip|x-bzip|x-bzip2|x-gzip|octet-stream|json|xml|javascript|x-sh|x-python|x-java|x-php|x-ruby|x-perl|x-httpd-php|typescript|x-typescript|sql|x-sql|toml|x-toml)|text\/)/i,
  },
  Gambar: {
    label: 'Gambar',
    accept: [
      // Web standar
      '.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif',
      // Vektor
      '.svg', '.eps', '.ai',
      // RAW & profesional
      '.raw', '.cr2', '.nef', '.arw', '.dng', '.tiff', '.tif', '.heic', '.heif',
      // Dokumen kerja
      '.psd', '.xcf', '.bmp', '.ico', '.fig', '.sketch',
    ],
    mimePattern: /^image\//i,
  },
  Video: {
    label: 'Video',
    accept: [
      // Modern & web
      '.mp4', '.webm', '.mkv',
      // Ekosistem perusahaan
      '.mov', '.avi', '.wmv', '.flv', '.f4v',
      // Broadcast & profesional
      '.mxf', '.mts', '.m2ts',
      // Jadul & lainnya
      '.3gp', '.vob', '.mpg', '.mpeg', '.m4v',
    ],
    mimePattern: /^video\//i,
  },
  Musik: {
    label: 'Musik',
    accept: [
      '.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma', '.opus',
      '.aiff', '.alac', '.mid', '.midi',
    ],
    mimePattern: /^audio\//i,
  },
};

const DEFAULT_FOLDER_NAMES = Object.keys(DEFAULT_FOLDERS);

// ─── Seed default folders on startup ─────────────────────────────────────────
async function seedDefaultFolders() {
  if (!supabase) return;

  const { data: existing, error } = await supabase
    .from('folders')
    .select('name')
    .in('name', DEFAULT_FOLDER_NAMES);

  if (error) { console.warn('Could not check existing folders:', error.message); return; }

  const existingNames = (existing || []).map((f: any) => f.name);
  const missing = DEFAULT_FOLDER_NAMES.filter(n => !existingNames.includes(n));

  for (const name of missing) {
    const { error: insertErr } = await supabase.from('folders').insert([{ name, owner: 'system' }]);
    if (insertErr) console.warn(`Failed to seed folder "${name}":`, insertErr.message);
  }

  for (const name of DEFAULT_FOLDER_NAMES) {
    const dir = path.join(storageDir, name);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

seedDefaultFolders();

// ─── Static file serving ──────────────────────────────────────────────────────
app.use('/files', express.static(storageDir));

// ─── Helper: resolve physical destination directory ───────────────────────────
async function resolveDestDir(folder_id: string | null): Promise<{ destDir: string; folderSlug: string | null; folderName: string | null }> {
  if (!folder_id) return { destDir: storageDir, folderSlug: null, folderName: null };

  let folderName: string | null = null;
  if (supabase) {
    const { data } = await supabase.from('folders').select('name').eq('id', folder_id).single();
    if (data?.name) folderName = data.name;
  }

  const folderSlug = (folderName || folder_id).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  const destDir = path.join(storageDir, folderSlug);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  return { destDir, folderSlug, folderName };
}

// ─── Multer (memory storage — written to disk after folder resolution) ─────────
const upload = multer({ storage: multer.memoryStorage() });

// ─── API Endpoints ────────────────────────────────────────────────────────────

// GET /api/files — list active (non-trashed) files
app.get('/api/files', async (req, res) => {
  const { owner } = req.query;
  if (!supabase) return res.status(503).json({ error: 'Supabase not connected' });
  try {
    let query = supabase.from('files').select('*').is('deleted_at', null);
    if (owner) query = query.eq('owner', owner as string);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/upload — upload a file (with MIME validation for default folders)
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase not connected' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const owner = req.body.owner || 'unknown';
  const folder_id: string | null = req.body.folder_id || null;

  try {
    // Validate MIME type for default folders
    if (folder_id) {
      const { data: folderData } = await supabase.from('folders').select('name').eq('id', folder_id).single();
      if (folderData?.name && DEFAULT_FOLDERS[folderData.name]) {
        const restriction = DEFAULT_FOLDERS[folderData.name];
        const fileExt = '.' + (req.file.originalname.split('.').pop() || '').toLowerCase();
        const mimeOk = restriction.mimePattern.test(req.file.mimetype);
        // Fallback: juga cek ekstensi file — beberapa OS kirim application/octet-stream
        const extOk = restriction.accept.some(a => a.split(',').map(s => s.trim()).includes(fileExt));
        if (!mimeOk && !extOk) {
          return res.status(400).json({
            error: `Folder "${folderData.name}" hanya menerima file: ${restriction.accept.join(', ')}`,
            code: 'MIME_RESTRICTED',
          });
        }
      }
    }

    const { destDir, folderSlug, folderName: resolvedFolderName } = await resolveDestDir(folder_id);

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(req.file.originalname);
    const baseName = path.basename(req.file.originalname, ext);
    const filename = `${baseName}-${uniqueSuffix}${ext}`;

    fs.writeFileSync(path.join(destDir, filename), req.file.buffer);

    const servingPath = folderSlug ? `/files/${folderSlug}/${filename}` : `/files/${filename}`;

    const { data, error } = await supabase
      .from('files')
      .insert([{
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype,
        path: servingPath,
        owner,
        folder_id: folder_id || null,
        folder_name: resolvedFolderName || null,
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    res.json({ message: 'File uploaded successfully', file: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/files/:id/favorite — toggle favorit
app.post('/api/files/:id/favorite', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase not connected' });
  try {
    const { data: file, error: fetchErr } = await supabase
      .from('files')
      .select('is_favorited')
      .eq('id', req.params.id)
      .single();
    if (fetchErr || !file) return res.status(404).json({ error: 'File tidak ditemukan' });

    const { data, error } = await supabase
      .from('files')
      .update({ is_favorited: !file.is_favorited })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Favorit diperbarui', file: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/favorites — list file favorit
app.get('/api/favorites', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase not connected' });
  const { owner } = req.query;
  try {
    let query = supabase.from('files').select('*').eq('is_favorited', true).is('deleted_at', null);
    if (owner) query = query.eq('owner', owner as string);
    const { data, error } = await query.order('modified_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Helper: ensure folder exists in DB + disk, returns folder id ─────────────
const folderIdCache = new Map<string, string>(); // key: `${owner}::${name}` → id

async function ensureFolderExists(name: string, owner: string): Promise<string | null> {
  if (!supabase) return null;
  const cacheKey = `${owner}::${name}`;
  if (folderIdCache.has(cacheKey)) return folderIdCache.get(cacheKey)!;

  const { data: existing } = await supabase
    .from('folders')
    .select('id')
    .eq('name', name)
    .eq('owner', owner)
    .maybeSingle();

  if (existing?.id) {
    folderIdCache.set(cacheKey, existing.id);
    return existing.id;
  }

  const folderSlug = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  const folderPath = path.join(storageDir, folderSlug);
  if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

  const { data: newFolder, error } = await supabase
    .from('folders')
    .insert([{ name, owner }])
    .select('id')
    .single();

  if (error || !newFolder) return null;
  folderIdCache.set(cacheKey, newFolder.id);
  return newFolder.id;
}

// POST /api/upload-single — upload satu file dengan progress tracking
app.post('/api/upload-single', upload.single('file'), async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase not connected' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const owner = req.body.owner || 'unknown';
  // folder_id bisa berupa ID yang sudah ada, atau nama folder yang akan dibuat
  const folder_id: string | null = req.body.folder_id || null;
  // folder_name: nama folder yang ingin dibuat/dipakai (untuk upload folder)
  const folder_name: string | null = req.body.folder_name || null;

  try {
    let targetFolderId: string | null = folder_id;

    // Jika ada folder_name (upload folder), pastikan folder ada di DB
    if (folder_name && !folder_id) {
      targetFolderId = await ensureFolderExists(folder_name, owner);
    }

    // Validasi MIME untuk default folders
    if (targetFolderId) {
      const { data: folderData } = await supabase.from('folders').select('name').eq('id', targetFolderId).single();
      if (folderData?.name && DEFAULT_FOLDERS[folderData.name]) {
        const restriction = DEFAULT_FOLDERS[folderData.name];
        const fileExt = '.' + (req.file.originalname.split('.').pop() || '').toLowerCase();
        const mimeOk = restriction.mimePattern.test(req.file.mimetype);
        const extOk = restriction.accept.some(a => a.split(',').map(s => s.trim()).includes(fileExt));
        if (!mimeOk && !extOk) {
          return res.status(400).json({
            error: `Folder "${folderData.name}" hanya menerima file: ${restriction.accept.join(', ')}`,
            code: 'MIME_RESTRICTED',
          });
        }
      }
    }

    const { destDir, folderSlug, folderName: resolvedFolderName } = await resolveDestDir(targetFolderId);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(req.file.originalname);
    const baseName = path.basename(req.file.originalname, ext);
    const filename = `${baseName}-${uniqueSuffix}${ext}`;

    fs.writeFileSync(path.join(destDir, filename), req.file.buffer);
    const servingPath = folderSlug ? `/files/${folderSlug}/${filename}` : `/files/${filename}`;

    const { data, error } = await supabase
      .from('files')
      .insert([{
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype,
        path: servingPath,
        owner,
        folder_id: targetFolderId || null,
        folder_name: resolvedFolderName || folder_name || null,
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'File uploaded successfully', file: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/upload-folder — upload seluruh folder (multiple files sekaligus)
app.post('/api/upload-folder', upload.array('files'), async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase not connected' });
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) return res.status(400).json({ error: 'Tidak ada file yang diunggah' });

  const owner = req.body.owner || 'unknown';
  const folder_id: string | null = req.body.folder_id || null;
  let relativePaths: string[] = [];
  try { relativePaths = JSON.parse(req.body.relativePaths || '[]'); } catch { relativePaths = []; }

  // Reset cache per request agar tidak stale
  folderIdCache.clear();

  const results: any[] = [];
  const errors: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const relativePath = relativePaths[i] || file.originalname;

    try {
      // Ambil nama folder top-level dari relativePath (misal: "MyFolder/sub/file.txt" → "MyFolder")
      const parts = relativePath.split('/');
      const topFolderName = parts.length > 1 ? parts[0] : null;

      let targetFolderId = folder_id;

      // Jika upload folder (ada subfolder) dan tidak sedang di dalam folder tertentu
      if (topFolderName && !folder_id) {
        targetFolderId = await ensureFolderExists(topFolderName, owner);
      }

      // Validasi MIME untuk default folders
      if (targetFolderId) {
        const { data: folderData } = await supabase.from('folders').select('name').eq('id', targetFolderId).single();
        if (folderData?.name && DEFAULT_FOLDERS[folderData.name]) {
          const restriction = DEFAULT_FOLDERS[folderData.name];
          const fileExt = '.' + (file.originalname.split('.').pop() || '').toLowerCase();
          const mimeOk = restriction.mimePattern.test(file.mimetype);
          const extOk = restriction.accept.some(a => a.split(',').map(s => s.trim()).includes(fileExt));
          if (!mimeOk && !extOk) {
            errors.push(`${file.originalname}: Folder "${folderData.name}" hanya menerima file: ${restriction.accept.join(', ')}`);
            continue;
          }
        }
      }

      const { destDir, folderSlug, folderName: resolvedFolderName } = await resolveDestDir(targetFolderId);
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname);
      const baseName = path.basename(file.originalname, ext);
      const filename = `${baseName}-${uniqueSuffix}${ext}`;

      fs.writeFileSync(path.join(destDir, filename), file.buffer);
      const servingPath = folderSlug ? `/files/${folderSlug}/${filename}` : `/files/${filename}`;

      const { data, error } = await supabase
        .from('files')
        .insert([{
          name: file.originalname,
          size: file.size,
          type: file.mimetype,
          path: servingPath,
          owner,
          folder_id: targetFolderId || null,
          folder_name: resolvedFolderName || topFolderName || null,
        }])
        .select()
        .single();

      if (error) errors.push(`${file.originalname}: ${error.message}`);
      else results.push(data);
    } catch (err: any) {
      errors.push(`${file.originalname}: ${err.message}`);
    }
  }

  res.json({
    message: `${results.length} file berhasil diunggah${errors.length ? `, ${errors.length} gagal` : ''}`,
    uploaded: results,
    errors,
  });
});
app.delete('/api/files/:id', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase not connected' });
  try {
    const { error } = await supabase
      .from('files')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'File moved to trash' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trash — list trashed files (not yet expired)
app.get('/api/trash', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase not connected' });
  const { owner } = req.query;
  const expiryDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  try {
    let query = supabase
      .from('files')
      .select('*')
      .not('deleted_at', 'is', null)
      .gt('deleted_at', expiryDate);
    if (owner) query = query.eq('owner', owner as string);
    const { data, error } = await query.order('deleted_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/files/:id/restore — restore file from trash
app.post('/api/files/:id/restore', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase not connected' });
  try {
    const { error } = await supabase
      .from('files')
      .update({ deleted_at: null })
      .eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'File restored successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/files/:id/permanent — permanently delete file from trash
app.delete('/api/files/:id/permanent', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase not connected' });
  try {
    const { data: file, error: fetchErr } = await supabase
      .from('files')
      .select('path')
      .eq('id', req.params.id)
      .single();
    if (fetchErr) return res.status(500).json({ error: fetchErr.message });

    const { error: deleteErr } = await supabase.from('files').delete().eq('id', req.params.id);
    if (deleteErr) return res.status(500).json({ error: deleteErr.message });

    if (file?.path) {
      const abs = path.join(storageDir, file.path.replace(/^\/files\//, ''));
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    }

    res.json({ message: 'File permanently deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/folders — list folders (system defaults + user's own)
app.get('/api/folders', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase not connected' });
  const { owner } = req.query;
  try {
    let query = supabase.from('folders').select('*');
    if (owner) query = query.or(`owner.eq.${owner},owner.eq.system`);
    const { data, error } = await query.order('created_at', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/folders — create a new folder
app.post('/api/folders', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase not connected' });
  const { name, owner } = req.body;
  if (!name || !owner) return res.status(400).json({ error: 'Name and owner are required' });
  try {
    const folderSlug = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
    const folderPath = path.join(storageDir, folderSlug);
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

    const { data, error } = await supabase.from('folders').insert([{ name, owner }]).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/folders/:id — delete folder (default folders are protected)
// Semua file di dalam folder akan di-soft-delete (masuk sampah), folder fisik dihapus dari disk
app.delete('/api/folders/:id', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase not connected' });
  try {
    const { data: folder } = await supabase.from('folders').select('name').eq('id', req.params.id).single();

    if (folder?.name && DEFAULT_FOLDER_NAMES.includes(folder.name)) {
      return res.status(403).json({ error: `Folder "${folder.name}" adalah folder default dan tidak dapat dihapus.` });
    }

    // Soft-delete semua file di dalam folder ini
    const deletedAt = new Date().toISOString();
    const { data: folderFiles } = await supabase
      .from('files')
      .select('id, name, path')
      .eq('folder_id', req.params.id)
      .is('deleted_at', null);

    if (folderFiles && folderFiles.length > 0) {
      await supabase
        .from('files')
        .update({ deleted_at: deletedAt })
        .eq('folder_id', req.params.id)
        .is('deleted_at', null);
    }

    // Hapus folder fisik dari disk
    if (folder?.name) {
      const folderSlug = folder.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
      const folderPath = path.join(storageDir, folderSlug);
      if (fs.existsSync(folderPath)) {
        fs.rmSync(folderPath, { recursive: true, force: true });
      }
    }

    // Hapus folder dari DB
    const { error } = await supabase.from('folders').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });

    res.json({
      message: 'Folder deleted successfully',
      filesMovedToTrash: folderFiles?.length ?? 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/storage-stats — disk usage stats
app.get('/api/storage-stats', async (_req, res) => {
  try {
    function getDirSize(dir: string): number {
      if (!fs.existsSync(dir)) return 0;
      return fs.readdirSync(dir, { withFileTypes: true }).reduce((total, entry) => {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) return total + getDirSize(p);
        try { return total + fs.statSync(p).size; } catch { return total; }
      }, 0);
    }

    const used = getDirSize(storageDir);
    const diskInfo = await new Promise<{ total: number; free: number }>(resolve => {
      fs.statfs(storageDir, (err, stats) => {
        if (err || !stats) {
          const fallbackGB = parseInt(process.env.STORAGE_QUOTA_GB || '100', 10);
          resolve({ total: fallbackGB * 1024 * 1024 * 1024, free: 0 });
        } else {
          resolve({ total: stats.bsize * stats.blocks, free: stats.bsize * stats.bavail });
        }
      });
    });

    const fmt = (b: number) => {
      if (b === 0) return '0 B';
      const k = 1024, s = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(b) / Math.log(k));
      return `${parseFloat((b / Math.pow(k, i)).toFixed(1))} ${s[i]}`;
    };

    res.json({
      used,
      total: diskInfo.total,
      free: diskInfo.free,
      usedFormatted: fmt(used),
      totalFormatted: fmt(diskInfo.total),
      freeFormatted: fmt(diskInfo.free),
      percent: ((used / diskInfo.total) * 100).toFixed(2),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Auto-purge expired trash (on startup + every hour) ───────────────────────
async function purgeExpiredTrash() {
  if (!supabase) return;
  const expiryDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const { data: expired, error } = await supabase
      .from('files')
      .select('id, path, name')
      .not('deleted_at', 'is', null)
      .lt('deleted_at', expiryDate);

    if (error || !expired?.length) return;

    for (const file of expired) {
      const abs = path.join(storageDir, file.path.replace(/^\/files\//, ''));
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
      await supabase.from('files').delete().eq('id', file.id);
      console.log(`Purged expired trash: ${file.name}`);
    }
  } catch (e: any) {
    console.warn('Trash purge error:', e.message);
  }
}

purgeExpiredTrash();
setInterval(purgeExpiredTrash, 60 * 60 * 1000);

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Syncnu backend running at http://localhost:${PORT}`);
});
