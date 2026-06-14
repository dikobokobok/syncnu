#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Syncnu — Install Script
#  Khusus: Linux (termasuk Armbian)
#  Jalankan: chmod +x install.sh && ./install.sh
# ─────────────────────────────────────────────────────────────

set -e

# ── Cek OS: hanya Linux ───────────────────────────────────────
if [[ "$(uname -s)" != "Linux" ]]; then
  echo "[ERROR] Script ini hanya mendukung Linux."
  echo "        Untuk macOS atau Windows, silakan install manual."
  exit 1
fi

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
echo -e "  ${CYAN}Cloud Drive Storage — Linux Installer${RESET}"
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
  warn "Node.js tidak ditemukan. Mencoba menginstal secara otomatis..."
  if command -v apt-get &>/dev/null; then
    info "Menjalankan pembaruan apt dan instalasi nodejs & npm..."
    sudo apt-get update && sudo apt-get install -y nodejs npm
  else
    error "Node.js tidak ditemukan. Silakan pasang Node.js v18+ terlebih dahulu."
  fi
fi

if ! command -v node &>/dev/null; then
  error "Instalasi Node.js gagal secara otomatis. Silakan pasang Node.js v18+ secara manual."
fi

NODE_VERSION=$(node -e "process.stdout.write(process.versions.node)" 2>/dev/null || echo "0.0.0")
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  warn "Node.js v18+ direkomendasikan. Versi saat ini: v$NODE_VERSION"
  warn "Mencoba melanjutkan..."
else
  success "Node.js v$NODE_VERSION"
fi

# npm
if ! command -v npm &>/dev/null; then
  warn "npm tidak ditemukan. Mencoba menginstal secara otomatis..."
  if command -v apt-get &>/dev/null; then
    sudo apt-get install -y npm
  else
    error "npm tidak ditemukan. Silakan pasang npm secara manual."
  fi
fi

if ! command -v npm &>/dev/null; then
  error "npm tidak ditemukan. Silakan pasang npm secara manual."
fi

NPM_VERSION=$(npm --version)
success "npm v$NPM_VERSION"

# Go (Golang)
if ! command -v go &>/dev/null; then
  warn "Go (Golang) tidak ditemukan. Mencoba menginstal secara otomatis..."
  if command -v apt-get &>/dev/null; then
    info "Menjalankan instalasi golang..."
    sudo apt-get update && sudo apt-get install -y golang
  else
    error "Go (Golang) tidak ditemukan. Silakan pasang Go v1.20+ secara manual."
  fi
fi

if ! command -v go &>/dev/null; then
  error "Instalasi Go gagal secara otomatis. Silakan pasang Go v1.20+ secara manual."
fi

GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
GO_MAJOR=$(echo "$GO_VERSION" | cut -d. -f1)
GO_MINOR=$(echo "$GO_VERSION" | cut -d. -f2)

if [ "$GO_MAJOR" -lt 1 ] || { [ "$GO_MAJOR" -eq 1 ] && [ "$GO_MINOR" -lt 20 ]; }; then
  warn "Go v1.20+ direkomendasikan. Versi saat ini: go$GO_VERSION"
  warn "Mencoba melanjutkan..."
else
  success "Go go$GO_VERSION"
fi


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
step "5/6 — Mode Development"
# ─────────────────────────────────────────────────────────────

info "Tidak diperlukan build produksi untuk mode development."
info "Frontend Vite dev server & backend Go akan dijalankan langsung dari source."

success "Konfigurasi selesai."

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
echo -e "  Akses aplikasi:"
echo -e "    Frontend  → http://localhost:8888"
echo -e "    Backend   → http://localhost:8889"
echo ""
echo -e "  Akun admin bawaan:"
echo -e "    Email    : admin@syncnu.app"
echo -e "    Password : admin123"
echo ""

# ─────────────────────────────────────────────────────────────
step "Menjalankan aplikasi"
# ─────────────────────────────────────────────────────────────

# Memberikan perizinan eksekusi yang diperlukan
info "Memastikan perizinan file..."
chmod +x "$SCRIPT_DIR/install.sh" 2>/dev/null || true
if [ -d "$SCRIPT_DIR/server/etc/dist" ]; then
  chmod +x "$SCRIPT_DIR/server/etc/dist/"* 2>/dev/null || true
fi

# ─────────────────────────────────────────────────────────────
step "Setup systemd service (opsional — khusus server/Armbian)"
# ─────────────────────────────────────────────────────────────

SYSTEMD_AVAILABLE=false
if command -v systemctl &>/dev/null; then
  SYSTEMD_AVAILABLE=true
fi

if [ "$SYSTEMD_AVAILABLE" = true ]; then
  echo ""
  read -rp "  Apakah Anda ingin membuat systemd service agar Syncnu berjalan otomatis saat boot? (y/N): " SETUP_SERVICE
  if [[ "$SETUP_SERVICE" =~ ^[Yy]$ ]]; then
    SERVICE_FILE="/etc/systemd/system/syncnu.service"
    WORKING_DIR="$SCRIPT_DIR"

    info "Membuat systemd service file di $SERVICE_FILE ..."

    sudo tee "$SERVICE_FILE" > /dev/null <<SVCEOF
[Unit]
Description=Syncnu Cloud Drive Storage (Dev Mode)
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$WORKING_DIR
ExecStart=/usr/bin/npm run dev
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=development

[Install]
WantedBy=multi-user.target
SVCEOF

    sudo systemctl daemon-reload
    sudo systemctl enable syncnu.service
    success "Service syncnu.service berhasil dibuat dan diaktifkan."
    info "  Jalankan:  sudo systemctl start syncnu"
    info "  Cek status: sudo systemctl status syncnu"
    info "  Lihat log:  sudo journalctl -u syncnu -f"
  else
    info "Lewati pembuatan systemd service."
  fi
else
  warn "systemctl tidak ditemukan. Lewati pembuatan systemd service."
fi

echo -e "\n  ${GREEN}✓ Memulai aplikasi dalam mode development...${RESET}"
echo -e "  Tekan ${YELLOW}Ctrl+C${RESET} untuk menghentikan.\n"
export NODE_ENV=development
npm run dev
