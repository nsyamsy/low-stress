# Low Stress — Panduan Instalasi dan Deployment

Dokumen ini adalah panduan resmi untuk memasang, mengonfigurasi, dan mengoperasikan **Low Stress** di lingkungan produksi, baik jaringan lokal (**LAN**) maupun server publik internet (**Public**).

---

## 1. Ikhtisar Arsitektur dan Profil

Low Stress menggunakan basis kode monorepo yang sama untuk semua skenario deployment. Mode deployment ditentukan oleh variabel `DEPLOY_MODE` dan profil Docker Compose:

| Parameter | Mode LAN (`--profile lan`) | Mode Public (`--profile public`) |
|---|---|---|
| **Sasaran** | Jaringan kantor, event offline, server lokal | VPS cloud, internet publik |
| **Koneksi** | HTTP via Nginx (port 8080) | HTTPS otomatis via Caddy Reverse Proxy (port 80 & 443) |
| **Sertifikat SSL** | Tidak ada (atau CA Internal Caddy) | Otomatis via Let's Encrypt / ZeroSSL |
| **Pendaftaran Awal** | `approval` (butuh persetujuan admin) | `open` (langsung aktif) |
| **CAPTCHA** | Nonaktif | Aktif (Proof-of-work mandiri tanpa layanan pihak ketiga) |
| **Cookie Sesi** | Menyesuaikan protokol HTTP/HTTPS | `Secure; SameSite=Lax` |
| **Akses Web** | `http://<ip-server>:8080` | `https://<domain-kamu.com>` |

---

## 2. Prasyarat Sistem

1. **Sistem Operasi:** Linux (Ubuntu 22.04/24.04 LTS, Debian 12, Rocky Linux 9, atau distribusi setara).
2. **Kebutuhan Minimum Sumber Daya:**
   - CPU: 1 Core (disarankan 2 Core untuk multiplayer Ludo aktif)
   - RAM: 1 GB (disarankan 2 GB)
   - Ruang Disk: 10 GB (untuk Docker images, log, dan volume database Postgres)
3. **Perangkat Lunak:**
   - Docker Engine v24.0+ (`docker --version`)
   - Docker Compose v2.20+ (`docker compose version`)
   - OpenSSL (untuk membuat secret acak)
4. **Port Jaringan:**
   - Profil LAN: Port `8080/tcp` (atau disesuaikan lewat `WEB_PORT`)
   - Profil Public: Port `80/tcp` (HTTP challenge) dan `443/tcp` (HTTPS TLS)

---

## 3. Persiapan Berkas Konfigurasi (`.env`)

1. Salin template `.env.example` ke `.env`:

   ```bash
   cp .env.example .env
   ```

2. Buat string acak kriptografis 64-karakter untuk keamanan sesi:

   ```bash
   openssl rand -hex 32
   ```

3. Buka dan sesuaikan nilai di `.env`:

   ```env
   # Mode: lan atau public
   DEPLOY_MODE=lan

   # Database PostgreSQL
   POSTGRES_USER=low_stress
   POSTGRES_PASSWORD=GantiDenganPasswordSangatKuatDanAman123!
   POSTGRES_DB=low_stress

   # Kunci Rahasia Sesi (isi dengan hasil openssl rand)
   SESSION_SECRET=a8b3c4d5e6f7a8b3c4d5e6f7a8b3c4d5e6f7a8b3c4d5e6f7a8b3c4d5e6f7a8b3

   # Asal Publik Aplikasi (Origin)
   # Untuk LAN: http://<ip-server>:8080 (misal: http://<ip-server>:8080)
   # Untuk Public: https://game.perusahaan.com
   APP_ORIGIN=http://<ip-server>:8080

   # Domain publik (khusus profil public untuk sertifikat Caddy otomatis)
   APP_DOMAIN=game.perusahaan.com

   # Port eksternal Nginx web di host (default 8080)
   WEB_PORT=8080
   ```

---

## 4. Langkah Pemasangan Bersih (*Clean Installation*)

### 4.1 Deployment Mode LAN

Jalankan container dengan profil `lan`:

```bash
docker compose --profile lan up -d --build
```

Compose akan membangun container server Fastify dan Nginx web shell serta mengunduh image PostgreSQL 16 Alpine. Urutan inisialisasi:
1. Layanan `db` menyala dan diverifikasi sehat oleh healthcheck `pg_isready`.
2. Layanan `server` menyala, menjalankan seluruh migrasi database Drizzle secara otomatis (`pnpm db:migrate`), lalu mengaktifkan Fastify + Socket.IO di port internal 3001.
3. Layanan `web` (Nginx) menyajikan aset statis SPA dan mem-proxy rute `/api` dan `/ws` ke server.

Periksa status container:

```bash
docker compose --profile lan ps
```

Seluruh layanan (`db`, `server`, `web`) harus berstatus `healthy` atau `Up`.

### 4.2 Deployment Mode Public

Pastikan domain publik (misal: `game.perusahaan.com`) telah memiliki DNS A Record yang mengarah ke alamat IP publik server kamu, dan firewall membuka port 80 dan 443.

Jalankan container dengan profil `public`:

```bash
docker compose --profile public up -d --build
```

Layanan `caddy` akan otomatis meminta sertifikat TLS gratis dari Let's Encrypt / ZeroSSL dan mengaktifkan enkripsi HTTPS dengan protokol HTTP/2 dan HTTP/3.

---

## 5. Inisialisasi Akun Superadmin Pertama

Setelah container berjalan normal, buat akun admin utama pertama menggunakan CLI bawaan:

```bash
docker compose exec server pnpm create-admin
```

Ikuti instruksi interaktif di terminal:
1. Masukkan username admin (contoh: `adminutama`).
2. Masukkan password admin yang kuat (minimal 8 karakter).

Setelah berhasil dibuat:
- Buka antarmuka panel admin di browser:
  - LAN: `http://<ip-server>:8080/admin/login`
  - Public: `https://<domain-kamu>/admin/login`
- Masuk dengan kredensial yang baru saja kamu buat.

---

## 6. Opsi HTTPS di LAN dengan Internal CA (PWA Penuh di Kantor)

Secara standar browser modern hanya mengizinkan registrasi Service Worker (PWA lengkap / "Add to Home Screen") pada konteks aman (**HTTPS** atau `localhost`). Bila kamu ingin staf kantor dapat memasang PWA Low Stress di ponsel mereka saat terhubung ke Wi-Fi kantor tanpa domain internet publik:

1. Ubah konfigurasi `docker/Caddyfile`:

   ```caddy
   {$APP_DOMAIN:localhost} {
     tls internal
     encode zstd gzip
     reverse_proxy web:8080
   }
   ```

2. Tentukan domain lokal di `.env` (misalnya `lowstress.local` atau IP server LAN `<ip-server>`):

   ```env
   APP_DOMAIN=lowstress.local
   APP_ORIGIN=https://lowstress.local
   ```

3. Jalankan Caddy bersama profil LAN:

   ```bash
   docker compose --profile public up -d
   ```

4. Unduh sertifikat Root CA yang dibuat oleh Caddy:

   ```bash
   docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root-ca.crt
   ```

5. Pasang file `caddy-root-ca.crt` ke perangkat staf kantor (Trusted Root Certification Authorities di Windows/macOS/iOS/Android). Setelah itu, seluruh perangkat di kantor dapat mengakses `https://lowstress.local` tanpa peringatan sertifikat dan fitur instalasi PWA aktif 100%.

---

## 7. Prosedur Cadangan dan Pemulihan (*Backup & Restore*)

Semua data Low Stress (pengguna, skor leaderboard, riwayat chat, room ludo, audit log, pengaturan admin) tersimpan di database PostgreSQL dalam volume `db-data`.

### 7.1 Cadangan Cepat (*One-Liner Backup*)

Ekspor seluruh database ke berkas SQL berstempel waktu:

```bash
# Format teks SQL standar
docker compose exec -T db pg_dump -U low_stress -d low_stress > "backup_$(date +%Y%m%d_%H%M%S).sql"

# Atau format arsip terkompresi PostgreSQL (disarankan untuk database besar)
docker compose exec -T db pg_dump -U low_stress -d low_stress -F c > "backup_$(date +%Y%m%d_%H%M%S).dump"
```

### 7.2 Skrip Cadangan Otomatis Terjadwal (Cronjob)

Buat skrip `/usr/local/bin/backup-lowstress.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/var/backups/low-stress"
PROJECT_DIR="/home/nsyamsy/low-stress"
RETENTION_DAYS=14
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

mkdir -p "$BACKUP_DIR"
cd "$PROJECT_DIR"

# Buat dump database
docker compose exec -T db pg_dump -U low_stress -d low_stress -F c > "$BACKUP_DIR/db_${TIMESTAMP}.dump"

# Hapus backup yang lebih tua dari 14 hari
find "$BACKUP_DIR" -type f -name "db_*.dump" -mtime +$RETENTION_DAYS -delete
```

Beri izin eksekusi dan pasang di crontab sistem (`crontab -e`):

```bash
chmod +x /usr/local/bin/backup-lowstress.sh

# Jalankan tiap hari pukul 02:00 WIB
0 2 * * * /usr/local/bin/backup-lowstress.sh > /dev/null 2>&1
```

### 7.3 Prosedur Pemulihan (*Disaster Recovery*)

Bila terjadi kerusakan server dan kamu ingin memulihkan data dari berkas cadangan ke database bersih:

```bash
# 1. Pastikan container db berjalan dan sehat
docker compose --profile lan up -d db

# 2. Hentikan server agar tidak ada penulisan data bersamaan
docker compose stop server web

# 3. Pulihkan data dari berkas backup
# Bila format arsip .dump:
cat backup_terbaru.dump | docker compose exec -T db pg_restore -U low_stress -d low_stress --clean --if-exists

# Atau bila format SQL mentah:
cat backup_terbaru.sql | docker compose exec -T db psql -U low_stress -d low_stress

# 4. Jalankan kembali seluruh layanan
docker compose --profile lan up -d
```

---

## 8. Pemantauan dan Pengecekan Kesehatan (*Observability*)

Aplikasi Low Stress menyediakan dua endpoint diagnostik berkode status HTTP:

- **Pemeriksaan Proses Server (`/healthz`):**  
  Menjawab status `200 OK` dengan payload `{"status":"ok"}` jika proses Node.js Fastify hidup dan siap melayani permintaan.
  ```bash
  curl -I http://localhost:8080/healthz
  ```

- **Pemeriksaan Konektivitas Database (`/readyz`):**  
  Menjawab status `200 OK` jika server dapat melakukan query ping aktif terhadap PostgreSQL. Mengembalikan `503 Service Unavailable` bila database putus.
  ```bash
  curl -I http://localhost:8080/readyz
  ```

- **Memantau Log Aktivitas Real-time:**  
  Log terstruktur diformat menggunakan library Pino (tanpa mencatat password, token, atau session secret):
  ```bash
  # Log Fastify & Socket.IO
  docker compose logs -f server

  # Log Nginx web
  docker compose logs -f web

  # Log database PostgreSQL
  docker compose logs -f db
  ```

---

## 9. Pembaruan Versi (*Zero-Downtime Rolling Update*)

Untuk memperbarui aplikasi ke versi kode terbaru dari repositori git:

```bash
git pull origin main
docker compose --profile lan build
docker compose --profile lan up -d
```

Container baru akan menggantikan container lama secara otomatis. Migrasi baru akan dieksekusi saat server boot tanpa menghapus data yang sudah ada.
