# Syncnu — Requirements Documentation

## Project Overview

### Project Name
Syncnu

### Description
Syncnu adalah aplikasi cloud drive modern multi-platform yang memungkinkan pengguna untuk:
* menyimpan file,
* sinkronisasi antar device,
* berbagi file/folder,
* kolaborasi,
* preview dokumen,
* serta mengakses file secara online maupun offline.

Aplikasi akan tersedia untuk:
* Web Browser
* Desktop (Windows/macOS/Linux)
* Mobile (Android - format .apk)

### Urutan Pengembangan Proyek (Development Order)
Proyek ini dikembangkan secara bertahap dengan urutan prioritas sebagai berikut:
1. **Web Browser** (Fokus Utama Pertama)
2. **Desktop (Windows/macOS/Linux)** (Fokus Kedua)
3. **Mobile (Android - APK)** (Fokus Ketiga)

---

# Tech Stack

## Frontend

### Mobile
* React Native
* Expo

### Web
* React Native Web / React.js
* Port Running: Mulai dari **8888**


### Desktop
* Electron
* React Native Web

### Language
* TypeScript

---

# UI & Styling

## Styling
* NativeWind / TailwindCSS
* React Native Reanimated
* React Native Gesture Handler

## Icons
* Lucide Icons
* Expo Vector Icons

## Animations
* Reanimated v3
* Moti

## Design System
* Atomic Design Pattern
* Shared Theme Tokens
* Shared Typography System

---

# Backend Stack (Supabase Ecosystem)

## Backend as a Service (BaaS)
* **Supabase** (Core Backend)
* **Supabase Edge Functions** (Deno) untuk server-side custom logic & webhook handling

## Authentication
* **Supabase Auth**
  * Email & Password
  * OAuth2 (Google Login, Apple Login, GitHub)
  * Secure Session Management
  * Row Level Security (RLS) untuk keamanan akses data per-user

## Database
* **Supabase Database (PostgreSQL)**
  * Relational data management
  * Ekstensi pgvector (untuk fitur AI Search di masa depan)

## Real-time & Cache
* **Supabase Realtime** (WebSocket untuk live sync & kolaborasi)
* Redis (Opsional, jika ada kebutuhan custom caching tingkat lanjut)

## File Storage
* **Local File Storage**: Berkas fisik/file disimpan secara lokal di direktori root `/storage` pada server.
* **Metadata Database (Supabase)**: Data/metadata file (seperti nama file, path lokal, ukuran, tipe file, dll.) dicatat dan disimpan di database Supabase (PostgreSQL).

---

# Core Features

## Authentication
* Register & Login (Email/Password)
* Social Login (Google, Apple, GitHub)
* Logout
* Forgot Password & Password Reset
* Email Verification
* Session Management (Multi-device login via Supabase)
* Security: 2FA (Bisa diimplementasi via Supabase), Device Session Management, Row Level Security

## File Management
### File Features
* Upload File
* Download File
* Delete File
* Rename File
* Move File
* Copy File
* Duplicate File
* Multi Select
* Drag & Drop

### Folder Features
* Create Folder
* Rename Folder
* Delete Folder
* Nested Folder

### File Metadata
* File Size
* Created Date
* Modified Date
* Owner
* Shared Users

---

# Upload System

## Upload Requirements
* Background Upload
* Local Storage Save: Menyimpan berkas fisik ke folder root `/storage` (lokal).
* Metadata Logging: Mencatat data/metadata berkas di database Supabase.
* Pause & Resume Upload
* Chunk Upload
* Upload Queue
* Retry Failed Upload

## Supported File Types
* Images
* Videos
* Documents
* Audio
* ZIP/RAR

---

# File Preview

## Preview Support
* PDF
* DOCX, XLSX, PPTX
* Images
* Videos
* Audio
* TXT
* Markdown

## Preview Libraries
Possible integrations:
* PDF.js
* react-native-pdf
* Monaco Editor (desktop/web)

---

# Sharing System

## Share Features
* Share via Link
* Public Link
* Private Link
* Password Protected Link
* Expiration Link (Bisa diatur melalui Supabase Edge Functions)

## Permissions
* Viewer
* Commenter
* Editor

---

# Sync System

## Synchronization
* Real-time Sync (Supabase Realtime)
* Background Sync
* Auto Sync
* Conflict Detection & Resolution

## Offline Mode
* Offline Cache (WatermelonDB / MMKV / SQLite local sync)
* Offline File Access
* Sync on Reconnect

---

# Search System

## Search Features
* Global Search (Full-text search via PostgreSQL)
* Search by File Name
* Search by Type
* Search by Owner
* Search by Date

---

# Notifications

## Notification Features
* Upload Complete
* Shared File Notification
* Mention Notification
* Login Alert

## Services
* Supabase Edge Functions (untuk memicu notifikasi)
* Firebase Cloud Messaging / Expo Notifications (untuk push delivery)

---

# Activity System

## Activity Logs
* Upload History
* Download History
* Share History
* Login Activity

---

# Team Workspace

## Team Features
* Workspace Creation
* Invite Member
* Role Management
* Shared Folder
* Workspace Analytics

---

# Admin Dashboard

## Admin Features
* User Management (Supabase Auth Admin)
* Storage Monitoring (Supabase Dashboard)
* Activity Monitoring
* Abuse Detection
* File Reports

---

# Security Requirements

## Encryption
* TLS/HTTPS
* Database Encryption at Rest (Bawaan Supabase)
* Row Level Security (RLS) policies

## Security Features
* Rate Limiting (Bawaan Supabase API)
* IP Logging
* Device Tracking
* Malware Scanning (via Edge Function)
* Audit Logs

---

# Performance Requirements

## Performance Goals
* App startup under 3 seconds
* Lazy loading
* Infinite scrolling
* Optimized file caching
* Background processing

---

# Multi Platform Requirements & Responsive Strategy

## Target Output, Packaging & UI Designs
* **Icon Aplikasi**: Menggunakan file icon di [icon.png](file:///c:/Users/INU/Documents/app/Syncnu/petunjuk/icon.png) sebagai icon resmi aplikasi di semua platform.
* **Mobile (Android)**: Aplikasi berjalan dalam format **.apk** yang siap diinstal langsung di perangkat Android. Desain antarmuka mobile merujuk pada file [desain mobile.jpeg](file:///c:/Users/INU/Documents/app/Syncnu/petunjuk/desain%20mobile.jpeg).
* **Desktop (Windows)**: Aplikasi berjalan dalam format **.exe** (Windows Executable) mandiri. Desain antarmuka desktop merujuk pada file [desain desktop & web.jpeg](file:///c:/Users/INU/Documents/app/Syncnu/petunjuk/desain%20desktop%20&%20web.jpeg).
* **Web**: Aplikasi web yang di-hosting dan diakses melalui browser dengan optimasi penuh pada layar lebar desktop. Desain antarmuka web merujuk pada file [desain desktop & web.jpeg](file:///c:/Users/INU/Documents/app/Syncnu/petunjuk/desain%20desktop%20&%20web.jpeg).

## Responsive & Adaptive UI Strategy
* **Desktop & Web UI**: Ketika diakses dari Web Browser atau aplikasi Desktop (.exe), antarmuka harus menyajikan **tampilan desktop khusus** (layout luas, permanent sidebar, dashboard multi-kolom, detail table view, drag-and-drop file upload). Bukan sekadar tampilan mobile yang diperlebar.
* **Mobile UI**: Ketika dijalankan sebagai aplikasi mobile (.apk), antarmuka secara otomatis beralih ke layout mobile-first (navigation tabs di bagian bawah, swipe actions, menu bottom-sheet, dan input yang nyaman untuk layar sentuh).

## Platform-Specific Specifications

### Mobile (Android)
* **Android**: Minimum Android 8+ (Target utama dalam format `.apk`)

### Desktop
* **Supported OS**: Windows (Utama, `.exe`), macOS, Linux
* **Electron Features**: Native File Access, Tray Menu, Background Sync, Auto Update

### Web
* **Browser Support**: Chrome, Edge, Firefox, Safari

---

# State Management

## Client State
Recommended:
* Zustand
  atau
* Redux Toolkit

## Server State
* Supabase JS Client
* TanStack Query (React Query) di atas Supabase Client

---

# Directory & Project Structure

Struktur folder proyek ini dirancang sebagai berikut:

## Folder Structure
```
/app
  /web       - Aplikasi Web Browser (React/React Native Web)
  /desktop   - Aplikasi Desktop (Electron)
  /mobile    - Aplikasi Mobile Android (React Native/Expo)
/server
  /database  - Konfigurasi database, schema, migrations (Supabase)
  /etc       - Konfigurasi pendukung backend, server-side functions (Edge Functions), dll. (Backend)
```

---

# Environment Variables

## Required ENV

### Frontend
* PORT (Default: `8888`)
* REACT_APP_SUPABASE_URL
* REACT_APP_SUPABASE_PUBLISHABLE_KEY

### Backend / Edge Functions
* SUPABASE_SERVICE_ROLE_KEY
* JWT_SECRET
* REDIS_URL (Opsional)

---

## Konfigurasi Kredensial Supabase (.env)
Berikut adalah nilai kredensial koneksi Supabase untuk file `.env` lokal:
```env
REACT_APP_SUPABASE_URL=https://ykdmqtvwknpkybmislao.supabase.co
REACT_APP_SUPABASE_PUBLISHABLE_KEY=sb_publishable_zT62UdaxVJrUMuTUiL_2eg_8nnEyEi2
```

## Akun Pengguna Uji Coba (Test User Account)
Untuk keperluan pengujian/debugging, berikut adalah kredensial akun uji coba default:
* **Username/Email**: `admin`
* **Password**: `admin123`

---

# Environment Management (Development vs Production)

Untuk menjamin kestabilan dan kelancaran siklus hidup aplikasi Syncnu, proyek ini menerapkan pemisahan lingkungan kerja secara ketat antara **Development (Dev)** dan **Production (Prod)**.

## 1. Perbedaan Karakteristik Lingkungan

| Aspek | Development Mode (Dev) | Production Mode (Prod) |
| --- | --- | --- |
| **BaaS / Database** | Supabase Lokal (dijalankan via Docker di komputer lokal) | Supabase Cloud (Managed Instance resmi dengan kapasitas produksi) |
| **Konfigurasi Env** | `.env.development` atau `.env` lokal | Diatur via Server/CI-CD/EAS Secrets (tidak masuk repositori) |
| **Debugging / Logs**| Aktif penuh (logs detail di konsol, source maps aktif, React DevTools) | Dimatikan demi keamanan dan performa (error dibungkus UI ramah) |
| **Kondisi Kode** | Mentah, Fast Refresh aktif, memuat file pendukung development | Dioptimalkan (minified, bundled, tree-shaken, target ES2022) |
| **Keamanan** | Longgar untuk mempermudah penulisan kode | RLS (Row Level Security) aktif ketat, SSL/HTTPS wajib, CORS dibatasi |
| **File Storage** | Local Supabase Storage bucket | Production Supabase Storage bucket dengan integrasi CDN aktif |

---

## 2. Alur Kerja dan Perintah CLI (Command Scripts)

### Mode Pengembangan (Development Mode)
Untuk menjalankan aplikasi dalam mode pengembangan (development):
```bash
npm run dev
```

### Mode Produksi (Production Mode)
Untuk menjalankan aplikasi dalam mode produksi (menjalankan frontend dan backend secara bersamaan):
```bash
npm start
```

### Langkah Manual Deployment & Build Platform
Jika ingin melakukan build atau deploy secara manual per komponen/platform:
1. **Deploy Migrasi Database ke Cloud**:
   Push semua migrasi lokal ke instance Supabase Cloud produksi:
   ```bash
   npx supabase db push
   ```
2. **Build Web Client**:
   Kompilasi assets web untuk dideploy ke hosting statis (seperti Vercel atau Netlify):
   ```bash
   npm run build --workspace=app/web
   ```
3. **Build Native Mobile App (Android - .apk)**:
   Membangun binary aplikasi mobile berformat **.apk**:
   ```bash
   eas build --platform android --profile production
   ```
4. **Build & Package Desktop (Electron - .exe)**:
   Kemas aplikasi Electron untuk dieksekusi dalam format **.exe**:
   ```bash
   npm run build --workspace=app/desktop
   ```

---

# API Requirements

## Supabase Client (PostgREST API)
Core API di-handle secara otomatis oleh Supabase:
* auth (Supabase Auth)
* users (Profiles table)
* files (Supabase Storage & file metadata table)
* folders (Folders table)
* sharing (Permissions table)
* workspace
* notifications

## Custom Logic (Supabase Edge Functions)
* Trigger external services
* Custom validations
* Integrasi pihak ketiga

---

# DevOps

## CI/CD
* GitHub Actions
* Supabase CLI Actions (untuk deploy database migrations & edge functions)

## Deployment
Frontend:
* Vercel / Netlify (Web)
* EAS Build (Mobile)

Backend:
* **Supabase Cloud** (Managed Service) atau Self-hosted Supabase

---

# Testing

## Unit Testing
* Jest

## E2E Testing
* Detox
* Playwright

## Database Testing
* pgTAP (Supabase local testing)

---

# Monitoring

## Error Tracking
* Sentry

## Analytics
* PostHog
* Firebase Analytics

---

# Recommended Libraries

## React Native
* @supabase/supabase-js
* react-native-mmkv
* react-native-url-polyfill
* expo-file-system
* expo-secure-store

## Web/Desktop
* electron-store
* react-dropzone

---

# Future Features

## AI Features
* AI Search (pgvector)
* AI File Summary
* AI Auto Tagging

## Productivity
* Notes
* Document Collaboration
* Task Integration

---

# MVP Scope

## Version 1
* Authentication
* Upload/download
* Folder management
* Sharing
* Search
* Sync basic

## Version 2
* Offline mode
* Team workspace
* Notifications
* File preview

## Version 3
* AI features
* Collaboration
* Encryption enhancement
* Advanced analytics

---

# Non Functional Requirements

## Scalability
* Horizontal scaling support (Supabase Read Replicas)

## Reliability
* 99.9% uptime target

## Security
* OWASP compliance

## Accessibility
* WCAG compatible

---

# Branding & Design System

## Theme
* Modern, Minimal, Cloud-native, SaaS-style
* Dark mode premium (gaya Linear, Vercel, dan GitHub dark UI)

## Typography
* **Rekomendasi Font**: Inter, Manrope, Plus Jakarta Sans (sangat clean di dark mode, sangat readable, dan cocok untuk SaaS modern).

## Color Palette (Premium Dark Mode)

### 1. Primary Blue (Brand Color)
* **Syncnu Blue**: `#3B82F6`

### 2. Cyan Accent (Glow, Highlight, Active State)
* **Cyan Accent**: `#22D3EE`

### 3. Deep Dark Background
* **Midnight**: `#0B1120`

### 4. Dark Surface Colors
* **Main Background**: `#0B1120`
* **Secondary Background**: `#111827`
* **Card Surface**: `#1E293B`
* **Elevated Surface**: `#243041`

### 5. Text Colors
* **Primary Text**: `#F8FAFC`
* **Secondary Text**: `#CBD5E1`
* **Muted Text**: `#94A3B8`
* **Disabled Text**: `#64748B`

### 6. Border & Divider
* **Border**: `#334155`
* **Soft Divider**: `#1E293B`

### 7. Status Colors (Dark Mode)
* **Success**: `#22C55E`
* **Warning**: `#F59E0B`
* **Error**: `#F87171`
* **Info**: `#38BDF8`

---

## Design Components Styles & Recommendations

### Gradient Dark Mode (Primary Gradient)
```css
background: linear-gradient(
  135deg,
  #22D3EE 0%,
  #3B82F6 50%,
  #2563EB 100%
);
```

### Card Style (Glassmorphism Soft)
```css
background: rgba(30, 41, 59, 0.7);
backdrop-filter: blur(16px);
border: 1px solid rgba(255, 255, 255, 0.06);
```

### Shadow Dark Mode
```css
box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
```

### UI Components
* **Sidebar**: Sedikit lebih terang dari background (`#111827`), gunakan hover biru transparan:
  ```css
  hover: rgba(59, 130, 246, 0.12)
  ```
* **Buttons (Primary)**:
  ```css
  background: #3B82F6;
  color: white;
  ```
* **Buttons (Secondary)**:
  ```css
  background: #1E293B;
  border: 1px solid #334155;
  ```

---

## Tailwind Dark Config
```js
darkMode: {
  background: '#0B1120',
  surface: '#1E293B',
  elevated: '#243041',
  primary: '#3B82F6',
  accent: '#22D3EE',
  text: '#F8FAFC',
  muted: '#94A3B8',
  border: '#334155',
}
```

---

## Kombinasi Light + Dark Mode
* **Light Mode**: Dominan putih, biru cerah, clean SaaS.
* **Dark Mode**: Navy gelap, cyan glow, glass effect.

---

# Recommended Architecture

## Frontend Architecture
* Feature-based architecture
* Shared UI packages
* Shared hooks
* Shared API layer

## Backend Architecture
* Supabase-first approach (BaaS)
* Thick Database (Business logic diletakkan di PostgreSQL Functions & Triggers bila memungkinkan)
* Edge Functions untuk logic yang butuh interaksi dengan sistem eksternal

---

# Conclusion

Syncnu dirancang sebagai aplikasi cloud drive modern multi-platform dengan fokus pada performa, keamanan, sinkronisasi, pengalaman pengguna, dan skalabilitas.

Framework utama:
* React Native (Mobile & Web)
* Expo
* Electron (Desktop)

Backend Stack:
* **Supabase** sebagai BaaS utama (Auth, Database, Storage, Realtime) yang terintegrasi penuh untuk mempercepat development dan menjamin performa skalabel.

Dengan arsitektur modular (Monorepo), aplikasi akan mudah dikembangkan dan dikelola ke depannya.
