# Low Stress — Panduan Operasional Sistem (*Operations Manual*)

Dokumen ini adalah referensi operasional bagi administrator sistem, insinyur DevOps, dan pemilik repositori Low Stress. Mencakup manajemen variabel lingkungan, rotasi rahasia produksi, aktivasi email SMTP, serta tata cara menambah game baru ke platform.

---

## 1. Referensi Variabel Lingkungan (`.env`)

Seluruh konfigurasi waktu-jalan (*runtime*) dibaca dari berkas `.env` dan divalidasi secara ketat oleh skema Zod di Fastify backend (`apps/server/src/env.ts`).

| Variabel | Wajib/Opsional | Nilai Bawaan | Deskripsi dan Dampak Keamanan |
|---|---|---|---|
| `DEPLOY_MODE` | **Wajib** | `lan` | `lan` atau `public`. Mengatur mode pendaftaran awal (`approval` di LAN vs `open` di Public), aktivasi CAPTCHA, dan kebijakan cookie sesi. |
| `APP_ORIGIN` | **Wajib** | `http://localhost:8080` | URL asal aplikasi publik yang diakses pemain. Wajib cocok dengan URL peramban untuk proteksi CSRF, header CORS, dan asal WebSocket. |
| `APP_DOMAIN` | Opsional | `localhost` | Nama domain host untuk reverse proxy Caddy (khusus profil `public`). Contoh: `game.kantor.com`. |
| `SESSION_SECRET` | **Wajib** | — | String acak kriptografis (minimal 32 karakter) untuk menandatangani hash sesi cookie. **Dilarang keras memakai nilai default di produksi.** |
| `POSTGRES_USER` | Opsional | `low_stress` | Username database PostgreSQL untuk container Docker `db`. |
| `POSTGRES_PASSWORD` | **Wajib di Prod** | `low_stress` | Kata sandi pengguna database PostgreSQL. Ganti dengan kata sandi acak yang kuat. |
| `POSTGRES_DB` | Opsional | `low_stress` | Nama basis data utama aplikasi. |
| `DATABASE_URL` | Opsional (Host) | Diturunkan otomatis | URL koneksi Postgres lengkap. Di dalam Docker Compose diisi otomatis: `postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}`. |
| `COOKIE_SECURE` | Opsional | `auto` | Menentukan flag `Secure` pada cookie sesi. `auto` mengikuti protokol (`true` jika HTTPS, `false` jika HTTP). Disarankan `true` di server publik. |
| `TZ_APP` | Opsional | `Asia/Jakarta` | Zona waktu aplikasi untuk periode leaderboard (Senin 00:00 WIB dan tanggal 1 00:00 WIB) serta jadwal operasional game. |
| `DEFAULT_LOCALE` | Opsional | `auto` | Bahasa bawaan antarmuka (`auto`, `id`, atau `en`). `auto` mendeteksi bahasa peramban pemain. |
| `LOG_LEVEL` | Opsional | `info` | Tingkat keparahan logger Pino (`trace`, `debug`, `info`, `warn`, `error`). Pino otomatis menyaring kata sandi dan token. |
| `WEB_PORT` | Opsional | `8080` | Port TCP di sisi host untuk Nginx web shell saat menggunakan Docker Compose. |
| `HOST` / `PORT` | Opsional | `0.0.0.0` / `3001` | Alamat listen server Fastify backend (hanya jika menjalankan server langsung di host tanpa Docker). |
| `SMTP_HOST` | Opsional | — | Alamat host server SMTP (mis. `smtp.sendgrid.net`, `smtp.gmail.com`). Jika diisi, sistem mengaktifkan `SmtpAdapter`. |
| `SMTP_PORT` | Opsional | `587` | Port koneksi SMTP (umumnya `587` untuk STARTTLS atau `465` untuk SSL). |
| `SMTP_USER` | Opsional | — | Username akun autentikasi SMTP. |
| `SMTP_PASS` | Opsional | — | Password atau API Key autentikasi SMTP. |
| `SMTP_FROM` | Opsional | — | Alamat email pengirim (mis. `Low Stress <noreply@perusahaan.com>`). |

---

## 2. Prosedur Rotasi Rahasia (*Secret Rotation*)

### 2.1 Rotasi Kunci Sesi (`SESSION_SECRET`)

Kunci `SESSION_SECRET` digunakan untuk menandatangani cookie sesi pemain (`ls_session`) dan admin (`ls_admin`). Lakukan rotasi secara berkala (misal: tiap 90 hari) atau segera setelah terjadi dugaan kebocoran kredensial.

> [!WARNING]
> Merotasi `SESSION_SECRET` akan otomatis membatalkan seluruh sesi login yang sedang aktif. Semua pemain dan admin yang sedang online akan diminta untuk login ulang.

**Langkah Rotasi:**
1. Buat token acak 64-karakter baru:
   ```bash
   openssl rand -hex 32
   ```
2. Buka berkas `.env` di server dan perbarui nilai `SESSION_SECRET`:
   ```env
   SESSION_SECRET=nilai_acak_baru_yang_dihasilkan_di_atas
   ```
3. Lakukan restart container server secara anggun (*graceful restart*):
   ```bash
   docker compose restart server
   ```
4. Verifikasi bahwa server hidup kembali via health check:
   ```bash
   curl -I http://localhost:8080/healthz
   ```

### 2.2 Rotasi Kata Sandi Database PostgreSQL (`POSTGRES_PASSWORD`)

Untuk mengubah kata sandi database tanpa merusak data:

1. Buat kata sandi baru yang kuat (misal: `P4ssw0rdBaru_#2026`).
2. Masuk ke terminal PostgreSQL di dalam container:
   ```bash
   docker compose exec -it db psql -U low_stress -d low_stress
   ```
3. Ubah password pengguna di level database:
   ```sql
   ALTER USER low_stress WITH PASSWORD 'P4ssw0rdBaru_#2026';
   \q
   ```
4. Perbarui nilai `POSTGRES_PASSWORD` di `.env`:
   ```env
   POSTGRES_PASSWORD=P4ssw0rdBaru_#2026
   ```
5. Muat ulang konfigurasi layanan:
   ```bash
   docker compose up -d
   ```
6. Verifikasi kesiapan koneksi database:
   ```bash
   curl -I http://localhost:8080/readyz
   ```
   Respons harus `HTTP/1.1 200 OK`.

### 2.3 Rotasi Kata Sandi Admin & Kebijakan Kredensial Lingkungan Bersama

> [!CAUTION]
> **Jangan pernah menggunakan kata sandi bawaan atau lemah (seperti `admin123` atau `low_stress`) pada lingkungan bersama (LAN kantor maupun Public).** Gunakan kata sandi unik minimal 12 karakter untuk akun Superadmin dan database PostgreSQL.

Bila kata sandi akun admin perlu direset:
- **Jika admin masih bisa login:** Ubah langsung lewat menu profil admin.
- **Jika lupa password admin atau pemulihan darurat:**
  Jalankan CLI create-admin di server untuk membuat admin baru atau menimpa admin yang ada:
  ```bash
  docker compose exec server pnpm create-admin
  ```

---

## 3. Mengaktifkan dan Mengelola Layanan SMTP

Secara bawaan, Low Stress menggunakan `LogAdapter` (seluruh pesan email dicatat ke konsol/log server dan tidak dikirim ke internet). Ini menjamin Low Stress dapat berjalan 100% mandiri di jaringan tertutup (LAN) tanpa dependensi keluar.

### 3.1 Mengaktifkan `SmtpAdapter`

Untuk mengaktifkan pengiriman email sungguhan (notifikasi pendaftaran, tautan lupa password, verifikasi akun):

1. Buka berkas `.env`.
2. Lengkapi blok variabel SMTP:

   ```env
   SMTP_HOST=smtp.sendgrid.net
   SMTP_PORT=587
   SMTP_USER=apikey
   SMTP_PASS=SG.contoh_api_key_sendgrid_anda
   SMTP_FROM="Low Stress Game" <no-reply@domain-kamu.com>
   ```

3. Simpan dan restart container server:
   ```bash
   docker compose restart server
   ```

### 3.2 Verifikasi Pengiriman Email Uji

1. Masuk ke panel admin di browser (`/admin`).
2. Buka menu **Pengaturan** (`/admin/settings`).
3. Pada kartu **Status SMTP (Email)**, status akan berubah menjadi **Terhubung** (*Configured*).
4. Klik tombol **Kirim email uji**.
5. Masukkan alamat email tujuan pengujian (misal: `staf@perusahaan.com`) pada dialog prompt.
6. Periksa kotak masuk email penerima untuk memastikan pesan uji berhasil diterima.

---

## 4. Panduan Menambah Game Baru

Arsitektur modular Low Stress memungkinkan penambahan game baru tanpa memodifikasi kode inti platform (*zero core modification*).

### 4.1 Scaffold Folder Game dengan CLI

Jalankan generator CLI `pnpm new-game` dengan menentukan slug dan pilihan engine:

```bash
# Pilihan engine: react, canvas, atau phaser
pnpm new-game tower-defense --engine canvas
```

Generator otomatis membuat folder terisolasi di `games/tower-defense/`:
```text
games/tower-defense/
├── client/              # Komponen visual UI (React / Canvas 2D / Phaser)
│   ├── index.tsx        # Ekspor default komponen game
│   └── ...
├── shared/              # Logika murni game tanpa ketergantungan DOM
│   ├── engine.ts
│   └── ...
├── locales/             # Teks terjemahan game
│   ├── id.json
│   └── en.json
├── db/                  # Skema dan migrasi tabel database (opsional)
├── test/                # Tes unit engine dan render
├── manifest.ts          # Metadata kontrak game
├── package.json         # Konfigurasi workspace pnpm
└── tsconfig.json
```

### 4.2 Mengonfigurasi `manifest.ts`

Buka `games/<id>/manifest.ts` dan tentukan kontrak permainan:

```typescript
import type { GameManifest } from "@low-stress/sdk";

export const manifest: GameManifest = {
  id: "tower-defense",
  title: {
    id: "Pertahanan Benteng",
    en: "Tower Defense",
  },
  engine: "canvas",
  mode: "solo",
  scoring: "highest", // "highest" (skor tertinggi), "lowest" (waktu tercepat), atau "none"
  supportsMobile: true,
  plausibleRun: (run) => {
    // Validasi kewajaran skor di server (anti-cheat plausibility)
    return run.score >= 0 && run.score <= 100000 && run.durationMs >= 3000;
  },
  client: () => import("./client"),
};
```

### 4.3 Menulis Terjemahan i18n Game

Isi teks antarmuka di `locales/id.json` dan `locales/en.json`. Kunci akan otomatis dimasukkan ke namespace `game.<slug>` saat runtime:

```json
// games/tower-defense/locales/id.json
{
  "title": "Pertahanan Benteng",
  "instructions": "Bangun menara untuk melindungi markas dari serangan musuh.",
  "wave": "Gelombang {{current}} / {{total}}"
}
```

Pastikan seluruh kunci di `id.json` dan `en.json` identik, lalu verifikasi:
```bash
pnpm i18n:check
```

### 4.4 Skema Database Game (Jika Membutuhkan Tabel Khusus)

Sesuai aturan isolasi `Agents.md` §5.1:
- Seluruh tabel khusus game wajib diawali dengan prefix `<slug>_` (contoh: `tower_defense_levels`).
- Berkas migrasi diletakkan di `games/<slug>/db/` (misal: `0000_tower_tables.sql`).
- Runner migrasi otomatis memindai dan mengeksekusi tabel baru saat boot. Verifikasi penamaan tabel:
  ```bash
  pnpm check:migrations
  ```

### 4.5 Pengujian dan Aktivasi Game

1. **Uji Kepatuhan Isolasi dan Kode:**
   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   ```
   Aturan ESLint `eslint-plugin-boundaries` akan memastikan game baru tidak mengimpor dari game lain dan hanya menggunakan `@low-stress/sdk`, `@low-stress/ui`, dan `@low-stress/i18n`.

2. **Aktivasi di Panel Admin:**
   - Setelah server di-restart, registry otomatis mendeteksi game baru dan menambahkannya ke tabel `games` dengan status default `inactive` (*Nonaktif*).
   - Masuk ke panel admin (`/admin/games`).
   - Ubah status game dari `Nonaktif` menjadi `Aktif`.
   - Game baru kini seketika muncul di Beranda pemain dan siap dimainkan!
