# Syncnu — Cloud Drive Storage & Auto-Backup Client

**Versi: 1.14.1** | [Changelog](#-changelog)

Syncnu adalah aplikasi **self-hosted cloud drive storage** modern yang dirancang untuk kebutuhan pribadi maupun tim kecil. Proyek ini menggabungkan performa tinggi backend **Golang (Go)**, fleksibilitas frontend **React (Web)**, dan integrasi desktop native menggunakan **Tauri v2 (React + Rust)** — dilengkapi fitur **Auto Backup** real-time, **File & Folder Sharing**, dan **Manajemen Akses**.

> **Didukung penuh di Linux Armbian** — cocok untuk single-board computer (SBC) seperti Orange Pi, NanoPi, dan board ARM lainnya sebagai NAS/server pribadi.

---

## 🚀 Fitur Utama

### 1. Berbagi File & Folder (Sharing)
- **Bagikan via Email**: Kirim akses file/folder langsung ke email pengguna lain yang terdaftar.
- **Bagikan via Link Publik**: Buat tautan unik yang bisa diakses siapa saja tanpa perlu akun.
- **Kelola Akses (Access Control)**: Lihat daftar siapa saja yang memiliki akses ke file/folder Anda, dan cabut akses kapan saja.
- **Sinkronisasi Real-time**: Ketika pemilik folder bersama mengunggah file baru, penerima otomatis melihat file tersebut dalam hitungan detik (polling setiap 5 detik).
- **Folder Drill-Down**: Buka folder yang dibagikan dan lihat/unduh semua file di dalamnya.

### 2. Aplikasi Desktop & Auto Backup
Aplikasi desktop Syncnu dibangun menggunakan **Tauri v2** dan **React/Rust**.
- **Auto Backup Folder**: Pantau folder lokal mana pun secara real-time (ditenagai library `notify` dari Rust).
- **Real-Time Sync**: Setiap file baru, perubahan, atau penghapusan di folder lokal langsung tersinkronisasi ke server Syncnu.
- **Chunked File Transfer**: Unggah file besar secara andal dengan membaginya menjadi potongan-potongan kecil (chunks).
- **Jadwal Backup Fleksibel**: Pilih antara backup `realtime`, `daily`, atau `weekly` untuk setiap profil backup.
- **Ignore Rules**: Abaikan file berdasarkan ekstensi (misal: `.git`, `node_modules`).
- **Status Panel**: Indikator antarmuka desktop untuk memantau folder aktif dan status transfer file.

### 3. Manajemen File & Folder (Web & Desktop)
- **Upload Massal**: Upload file tunggal, multi-select, atau upload seluruh folder dengan struktur direktori (drag & drop).
- **Preview Terintegrasi**: Lihat langsung dokumen PDF, gambar, video, musik, teks, atau kode pemrograman di browser/app.
- **Sampah & Pemulihan**: Hapus file ke tempat sampah (soft-delete), pulihkan, atau hapus permanen.
- **Auto Purge**: File di sampah otomatis dihapus permanen setelah 7 hari.
- **Folder Kustom & Default**: Buat folder bebas, plus 4 folder bawaan sistem (**Dokumen**, **Gambar**, **Video**, **Musik**) dengan validasi tipe file otomatis.
- **Favorit**: Tandai file penting dengan bintang untuk akses cepat.
- **Pencarian**: Cari file berdasarkan nama, tipe, atau folder.
- **Storage Stats**: Pantau penggunaan ruang penyimpanan secara visual.

### 4. Autentikasi & Keamanan
- Registrasi dan login menggunakan email + password dengan token **JWT**.
- Akun admin bawaan untuk uji coba awal.
- Validasi kepemilikan pada setiap operasi berbagi dan penghapusan.

---

## 🛠️ Stack Teknologi

| Komponen | Teknologi |
| :--- | :--- |
| **Backend Server** | Golang (Go 1.21+), Net/HTTP, Custom Supabase PostgREST Client |
| **Frontend Web** | React 18, TypeScript, Vite, Tailwind CSS, Axios |
| **Desktop Client** | Tauri v2 (Rust backend, React frontend), `notify` crate (file watching) |
| **Database** | Supabase (PostgreSQL via PostgREST API) |
| **Auth** | JWT (JSON Web Token) dengan bcrypt password hashing |
| **Penyimpanan** | Disk Lokal (server-side `/storage`) dengan chunked upload |
| **Monorepo** | npm workspaces + concurrently |
| **Build Tools** | Vite (web), Tauri CLI (desktop), Go build (server) |

---

## 📁 Struktur Proyek

```text
Syncnu/
├── app/
│   ├── web/                  # Frontend Web (React + Vite + Tailwind)
│   │   ├── src/
│   │   │   ├── App.tsx       # Komponen utama UI Web
│   │   │   ├── supabase.ts   # Klien Supabase JS
│   │   │   └── index.css     # Styling Tailwind
│   │   ├── package.json
│   │   └── vite.config.ts
│   └── desktop/              # Desktop Client (Tauri v2 + React)
│       ├── src/
│       │   └── App.tsx       # UI Desktop (backup, sharing, dll.)
│       ├── src-tauri/        # Backend Rust (file watcher, IPC)
│       │   ├── src/lib.rs    # Rust logic (chunk reader, dir scanner, watcher)
│       │   └── tauri.conf.json
│       └── package.json
├── server/
│   ├── database/
│   │   └── schema.sql        # Skema database Supabase (DDL + seed)
│   └── etc/                  # Backend Go (Golang API Server)
│       ├── main.go           # Entry point, router, CORS, seeding
│       ├── handlers.go       # Endpoint API (Auth, Files, Folders, Shares, Stats)
│       ├── chunking.go       # Chunked upload & reassembly + MIME validation
│       ├── models.go         # Struct model (User, File, Folder, Share)
│       ├── supabase.go       # PostgREST client (CRUD wrapper)
│       ├── utils.go          # Helper (env loader, bcrypt, JWT)
│       ├── diskspace_unix.go # Disk space check (Linux/macOS)
│       ├── diskspace_windows.go # Disk space check (Windows)
│       └── package.json
├── scripts/
│   ├── build-server.js       # Cross-platform Go build script
│   └── build-desktop.js      # Desktop installer build script
├── installers/               # Installer desktop (Windows .exe, .msi)
├── storage/                  # Direktori penyimpanan file (auto-created)
│   ├── Dokumen/
│   ├── Gambar/
│   ├── Video/
│   ├── Musik/
│   └── temp/                 # Temporary chunk upload directory
├── .env                      # Konfigurasi environment
├── .env.example              # Template environment
├── install.sh                # Script instalasi otomatis (Linux/Armbian)
└── package.json              # Root monorepo configuration
```

---

## ⚙️ Cara Instalasi & Menjalankan

### Prasyarat

| Software | Versi Minimum | Keterangan |
| :--- | :--- | :--- |
| **Node.js** | v18+ | [nodejs.org](https://nodejs.org) |
| **Golang** | v1.21+ | [go.dev](https://go.dev) |
| **Supabase** | — | Akun gratis di [supabase.com](https://supabase.com) |
| **Rust** *(opsional)* | stable | Hanya untuk developer desktop — [rustup.rs](https://rustup.rs) |

---

### A. Instalasi Otomatis (Linux / Armbian / macOS)

Script `install.sh` akan memandu Anda melalui pemeriksaan prasyarat, konfigurasi `.env`, pembuatan folder storage, instalasi dependensi, build production, dan opsional pembuatan **systemd service** (auto-start saat boot).

```bash
chmod +x install.sh
./install.sh
```

Ikuti panduan di layar. Di akhir script, Anda bisa langsung menjalankan aplikasi atau mengaktifkan systemd service.

---

### B. Instalasi Manual

#### 1. Setup Database Supabase
1. Buka [Supabase Dashboard](https://supabase.com/dashboard) → buat proyek baru.
2. Masuk ke **SQL Editor**.
3. Salin seluruh isi file [`server/database/schema.sql`](server/database/schema.sql) → klik **Run**.
4. Tunggu hingga semua tabel, index, trigger, dan seed data selesai dibuat.

#### 2. Konfigurasi `.env`
Salin `.env.example` menjadi `.env` dan isi dengan kredensial Supabase Anda:

```env
REACT_APP_SUPABASE_URL=https://<project-ref>.supabase.co
REACT_APP_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
PORT=8888
PORT_BACKEND=8889
JWT_SECRET=gunakan_string_acak_yang_panjang_dan_aman
```

> Dapatkan API keys di: **Supabase Dashboard → Project Settings → API**

#### 3. Instalasi Dependensi
```bash
npm install
```

#### 4. Menjalankan Aplikasi

**Mode Development** (auto-reload):
```bash
npm run dev
```
- Web: [http://localhost:8888](http://localhost:8888)
- Backend API: [http://localhost:8889](http://localhost:8889)

**Mode Production**:
```bash
npm run build
npm run start
```

---

### C. Menjalankan di Linux Armbian (SBC / ARM Board)

Syncnu berjalan dengan baik di board ARM yang menjalankan Armbian (Orange Pi, NanoPi, Banana Pi, dll.). Berikut panduan khususnya:

#### Prasyarat Armbian
```bash
# Update sistem
sudo apt-get update && sudo apt-get upgrade -y

# Install Node.js 18+ (disarankan via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Go (cek versi terbaru di go.dev/dl)
wget https://go.dev/dl/go1.23.4.linux-arm64.tar.gz
sudo tar -C /usr/local -xzf go1.23.4.linux-arm64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc
```

#### Instalasi & Menjalankan
```bash
git clone https://github.com/dikobokobok/syncnu.git
cd syncnu
chmod +x install.sh
./install.sh
```

#### Menjalankan sebagai Service (Auto-start)
Script `install.sh` akan menawarkan pembuatan systemd service secara otomatis. Atau buat manual:

```bash
sudo tee /etc/systemd/system/syncnu.service > /dev/null <<EOF
[Unit]
Description=Syncnu Cloud Drive Storage
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/npm run start
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now syncnu.service
```

**Perintah berguna:**
```bash
sudo systemctl start syncnu      # Mulai service
sudo systemctl stop syncnu       # Hentikan service
sudo systemctl status syncnu     # Cek status
sudo journalctl -u syncnu -f     # Lihat log real-time
```

#### Akses dari Perangkat Lain di LAN
Setelah Syncnu berjalan di board Armbian, akses dari perangkat lain via IP lokal:
```
http://<IP-BOARD-ARMBIAN>:8888
```

---

### D. Menjalankan Aplikasi Desktop (Mode Developer)

```bash
cd app/desktop
npm run tauri dev        # Development mode
npm run tauri build      # Build installer produksi
```

---

## 📦 Download Desktop (Windows)

| Installer | Link |
| :--- | :--- |
| **NSIS Setup (.exe)** — Rekomendasi | [Syncnu_1.14.1_x64-setup.exe](./installers/Syncnu_1.14.1_x64-setup.exe) |
| **MSI Installer** | [Syncnu_1.14.1_x64_en-US.msi](./installers/Syncnu_1.14.1_x64_en-US.msi) |

---

## 🔑 Akun Login Bawaan

| Field | Value |
| :--- | :--- |
| **Email** | `admin@syncnu.app` |
| **Password** | `admin123` |

> **PENTING**: Segera ganti password admin Anda setelah instalasi pertama.

---

## 🌐 API Endpoints

| Method | Endpoint | Deskripsi |
| :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Registrasi akun baru |
| `POST` | `/api/auth/login` | Login dan dapatkan JWT |
| `GET` | `/api/auth/me` | Info user dari token |
| `GET` | `/api/files` | Daftar semua file (filter: `owner`) |
| `POST` | `/api/upload-chunk` | Unggah file secara chunked |
| `POST` | `/api/files/{id}/favorite` | Toggle favorit |
| `GET` | `/api/favorites` | Daftar file favorit |
| `DELETE` | `/api/files/{id}` | Hapus file (soft-delete) |
| `GET` | `/api/trash` | Daftar file di sampah |
| `POST` | `/api/files/{id}/restore` | Pulihkan file dari sampah |
| `DELETE` | `/api/files/{id}/permanent` | Hapus permanen |
| `GET` | `/api/folders` | Daftar folder |
| `POST` | `/api/folders` | Buat folder baru |
| `DELETE` | `/api/folders/{id}` | Hapus folder |
| `POST` | `/api/shares` | Buat share (email/link) |
| `GET` | `/api/shares` | Daftar share milik user (filter: `file_id`/`folder_id`) |
| `DELETE` | `/api/shares/{id}` | Cabut akses share |
| `GET` | `/api/shared` | Daftar item yang dibagikan ke user |
| `GET` | `/api/shares/public/{token}` | Akses share publik via token |
| `GET` | `/api/storage-stats` | Statistik penggunaan storage |

---

## 🗄️ Database Schema

Tabel utama di Supabase PostgreSQL:

| Tabel | Deskripsi |
| :--- | :--- |
| `users` | Data pengguna (id, email, password hash, name) |
| `files` | Metadata file (name, size, type, path, owner, folder_id, is_favorited, deleted_at) |
| `folders` | Folder (name, owner; termasuk folder sistem: Dokumen, Gambar, Video, Musik) |
| `shares` | Record sharing (file_id, folder_id, shared_by, shared_to, token, share_type) |

Setup lengkap ada di [`server/database/schema.sql`](server/database/schema.sql).

---

## 🔧 Konfigurasi Environment

| Variabel | Wajib | Deskripsi |
| :--- | :--- | :--- |
| `REACT_APP_SUPABASE_URL` | Ya | URL proyek Supabase |
| `REACT_APP_SUPABASE_ANON_KEY` | Ya | Anon key Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Ya | Service role key (server-side only) |
| `PORT` | Tidak | Port frontend web (default: `8888`) |
| `PORT_BACKEND` | Tidak | Port backend API (default: `8889`) |
| `JWT_SECRET` | Ya | Secret key untuk sign JWT |
| `STORAGE_QUOTA_GB` | Tidak | Kuota storage dalam GB (default: `100`) |

---

## 📋 Changelog

### v1.14.1
- **Share Management**: Tambah fitur berbagi file/folder via email dan link publik
- **Access Control**: Kelola akses — lihat siapa yang memiliki akses dan cabut kapan saja
- **Real-time Sync**: Polling otomatis setiap 5 detik untuk sinkronisasi folder bersama
- **Desktop Share**: Fitur sharing lengkap di aplikasi desktop (Tauri)
- **Linux Armbian**: Dukungan penuh untuk Armbian + systemd service auto-setup
- **Cross-platform Build**: Script build server otomatis detect platform (Windows/Linux)

### v0.1.0
- Rilis awal: Web client, Desktop client (Tauri), Go backend
- Auto Backup real-time, Chunked upload, Trash & Restore

---

## 📄 Lisensi

Proyek ini dilisensikan di bawah **MIT License**.

---

## 🤝 Kontribusi

Kontribusi sangat diterima! Silakan fork, buat branch, dan kirim Pull Request.

**Repository**: [https://github.com/dikobokobok/syncnu](https://github.com/dikobokobok/syncnu)
