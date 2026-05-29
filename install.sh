#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Syncnu — Install Script
#  Mendukung: Linux, macOS
#  Jalankan: chmod +x install.sh && ./install.sh
# ─────────────────────────────────────────────────────────────

set -e

# ── Warna output ──────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${BLUE}[INFO]${RESET}  $1"; }
success() { echo -e "${GREEN}[OK]${RESET}    $1"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $1"; }
error()   { echo -e "${RED}[ERROR]${RESET} $1"; exit 1; }
step()    { echo -e "\n${BOLD}${CYAN}▶ $1${RESET}"; }

# ── Banner ────────────────────────────────────────────────────
echo -e "${BOLD}"
echo "  ███████╗██╗   ██╗███╗   ██╗ ██████╗███╗   ██╗██╗   ██╗"
echo "  ██╔════╝╚██╗ ██╔╝████╗  ██║██╔════╝████╗  ██║██║   ██║"
echo "  ███████╗ ╚████╔╝ ██╔██╗ ██║██║     ██╔██╗ ██║██║   ██║"
echo "  ╚════██║  ╚██╔╝  ██║╚██╗██║██║     ██║╚██╗██║██║   ██║"
echo "  ███████║   ██║   ██║ ╚████║╚██████╗██║ ╚████║╚██████╔╝"
echo "  ╚══════╝   ╚═╝   ╚═╝  ╚═══╝ ╚═════╝╚═╝  ╚═══╝ ╚═════╝ "
echo -e "${RESET}"
echo -e "  ${CYAN}Cloud Drive Storage — Installer${RESET}"
echo ""

# ── Cek direktori ─────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f "package.json" ]; then
  error "Jalankan script ini dari root direktori proyek Syncnu."
fi

# ─────────────────────────────────────────────────────────────
step "1/6 — Memeriksa prasyarat"
# ─────────────────────────────────────────────────────────────

# Node.js
if ! command -v node &>/dev/null; then
  error "Node.js tidak ditemukan. Install dari https://nodejs.org (minimal v18)"
fi

NODE_VERSION=$(node -e "process.stdout.write(process.versions.node)")
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  error "Node.js v18+ diperlukan. Versi saat ini: v$NODE_VERSION"
fi
success "Node.js v$NODE_VERSION"

# npm
if ! command -v npm &>/dev/null; then
  error "npm tidak ditemukan."
fi
NPM_VERSION=$(npm --version)
success "npm v$NPM_VERSION"

# ─────────────────────────────────────────────────────────────
step "2/6 — Konfigurasi environment (.env)"
# ─────────────────────────────────────────────────────────────

ENV_FILE="$SCRIPT_DIR/.env"

if [ -f "$ENV_FILE" ]; then
  warn "File .env sudah ada. Lewati pembuatan .env baru."
  warn "Edit manual jika perlu mengubah konfigurasi."
else
  echo ""
  echo -e "  Masukkan konfigurasi Supabase Anda."
  echo -e "  Nilai bisa ditemukan di: ${CYAN}Supabase Dashboard → Project Settings → API${RESET}"
  echo ""

  read -rp "  Supabase URL (https://<ref>.supabase.co): " SUPA_URL
  read -rp "  Supabase Anon Key: " SUPA_ANON
  read -rp "  Supabase Service Role Key: " SUPA_SERVICE
  read -rp "  JWT Secret (tekan Enter untuk generate otomatis): " JWT_INPUT

  if [ -z "$JWT_INPUT" ]; then
    JWT_SECRET=$(node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))")
    info "JWT Secret di-generate otomatis."
  else
    JWT_SECRET="$JWT_INPUT"
  fi

  cat > "$ENV_FILE" <<EOF
REACT_APP_SUPABASE_URL=${SUPA_URL}
REACT_APP_SUPABASE_ANON_KEY=${SUPA_ANON}
SUPABASE_SERVICE_ROLE_KEY=${SUPA_SERVICE}
PORT=8888
PORT_BACKEND=8889
JWT_SECRET=${JWT_SECRET}
EOF

  success ".env berhasil dibuat."
fi

# ─────────────────────────────────────────────────────────────
step "3/6 — Membuat direktori storage"
# ─────────────────────────────────────────────────────────────

STORAGE_DIR="$SCRIPT_DIR/storage"
for dir in "$STORAGE_DIR" "$STORAGE_DIR/Dokumen" "$STORAGE_DIR/Gambar" "$STORAGE_DIR/Video" "$STORAGE_DIR/Musik"; do
  if [ ! -d "$dir" ]; then
    mkdir -p "$dir"
    success "Dibuat: $dir"
  else
    info "Sudah ada: $dir"
  fi
done

# ─────────────────────────────────────────────────────────────
step "4/6 — Menginstall dependensi"
# ─────────────────────────────────────────────────────────────

info "Menjalankan npm install (monorepo workspaces)..."
npm install

success "Semua dependensi berhasil diinstall."

# ─────────────────────────────────────────────────────────────
step "5/6 — Build production"
# ─────────────────────────────────────────────────────────────

echo ""
read -rp "  Build untuk production sekarang? (y/N): " DO_BUILD

if [[ "$DO_BUILD" =~ ^[Yy]$ ]]; then
  info "Membangun frontend..."
  npm run build:web

  info "Membangun backend..."
  npm run build:server

  success "Build selesai."
else
  info "Lewati build. Gunakan 'npm run dev' untuk mode development."
fi

# ─────────────────────────────────────────────────────────────
step "6/6 — Setup database"
# ─────────────────────────────────────────────────────────────

echo ""
echo -e "  ${YELLOW}Langkah manual yang perlu dilakukan:${RESET}"
echo ""
echo -e "  1. Buka ${CYAN}https://supabase.com/dashboard${RESET}"
echo -e "  2. Pilih project Anda → ${CYAN}SQL Editor${RESET}"
echo -e "  3. Salin dan jalankan isi file: ${BOLD}server/database/schema.sql${RESET}"
echo ""
echo -e "  File schema tersedia di:"
echo -e "  ${CYAN}$SCRIPT_DIR/server/database/schema.sql${RESET}"
echo ""

# ─────────────────────────────────────────────────────────────
echo -e "${BOLD}${GREEN}"
echo "  ✓ Instalasi selesai!"
echo -e "${RESET}"
echo -e "  Cara menjalankan:"
echo ""
echo -e "  ${CYAN}Development (hot-reload):${RESET}"
echo -e "    npm run dev"
echo ""
echo -e "  ${CYAN}Production:${RESET}"
echo -e "    npm run start"
echo ""
echo -e "  ${CYAN}Akses aplikasi:${RESET}"
echo -e "    Frontend  → http://localhost:8888"
echo -e "    Backend   → http://localhost:8889"
echo ""
echo -e "  ${CYAN}Akun admin bawaan:${RESET}"
echo -e "    Email    : admin@syncnu.app"
echo -e "    Password : admin123"
echo ""
echo -e "  ${YELLOW}Jangan lupa ganti password admin setelah login pertama.${RESET}"
echo ""
