# Low Stress — Architecture

Versi: 0.1 (draf) · Tanggal: 2026-11-04

Dokumen terkait: [PRD.md](PRD.md) · [Design_System.md](Design_System.md) · [Agents.md](../Agents.md)

---

## 1. Gambaran umum

```text
Browser (React SPA, PWA)
   │  HTTPS/HTTP  ── REST /api/*
   │              ── WebSocket /ws (Ludo dan game realtime lain)
   ▼
[Caddy]  (hanya profil public: HTTPS, reverse proxy)
   ▼
apps/server (Node + Fastify)
   ├─ auth, sesi, rate limit
   ├─ admin API
   ├─ registry game (memuat games/*/server)
   ├─ jadwal dan gerbang game
   ├─ realtime (Socket.IO)
   └─ job terjadwal (kedaluwarsa room, rotasi periode)
   ▼
PostgreSQL (Drizzle ORM)
```

Satu repositori (monorepo), satu server proses, satu database. LAN dan Public memakai kode yang sama, dibedakan oleh konfigurasi.

## 2. Tech stack

| Lapisan | Pilihan | Alasan |
|---|---|---|
| Monorepo | pnpm workspaces | Cepat, hemat disk, cocok untuk paket bersama |
| Bahasa | TypeScript (strict) | Kontrak game dan engine bertipe |
| Frontend | Vite + React 19 + React Router | SPA murni, tanpa SSR yang tidak dibutuhkan |
| Styling | Tailwind CSS + CSS variables (token desain) | Token dari Design_System.md |
| Game Flappy Bird | Canvas 2D asli dari `performance_dash` (diporting) | Tampilan identik, tanpa dependensi baru; engine fisika `flappy-engine.ts` sudah ada |
| Engine game opsional | Phaser 3 (lazy load, **per game**) | Tersedia untuk game masa depan yang butuh fisika, sprite, atau tilemap; tidak dimuat oleh game lain |
| Game Memory Match | React + CSS/Framer Motion | UI ringan |
| Game Ludo | React + SVG, state dari server | Papan skalabel 2–12 pemain |
| Backend | Node 22 + Fastify | Cepat, ekosistem plugin matang |
| Realtime | Socket.IO | Penyambungan ulang otomatis, room bawaan |
| Database | PostgreSQL 16 + Drizzle ORM | Tipe aman, migrasi SQL jelas |
| Auth | Sesi cookie opaque di DB + argon2 | Mudah dicabut (ban atau suspend) |
| Validasi | Zod | Satu skema untuk klien dan server |
| i18n | i18next + react-i18next | Namespace per game, lazy load |
| Uji | Vitest (unit, integrasi), Playwright (E2E, viewport mobile dan desktop) | |
| Lint | ESLint + `eslint-plugin-boundaries` | Menegakkan isolasi game |
| PWA | `vite-plugin-pwa` | Manifest dan service worker |
| Deploy | Docker Compose (profil `lan` dan `public`) + Caddy | Pasang cepat di server kantor atau VPS |

## 3. Struktur repositori

```text
low-stress/
├─ apps/
│  ├─ web/                 shell SPA: login, beranda, leaderboard, /admin
│  │  ├─ src/
│  │  │  ├─ app/           router, layout, providers
│  │  │  ├─ features/      auth, home, leaderboard, profile
│  │  │  ├─ admin/         halaman panel admin
│  │  │  └─ game-host/     memuat game lewat registry
│  │  └─ public/           fonts, ikon PWA, logo
│  └─ server/
│     └─ src/
│        ├─ core/          config, db, logger, error codes
│        ├─ auth/          register, login, sesi, lockout
│        ├─ admin/         rute admin, audit log
│        ├─ games/         registry, gerbang jadwal, skor generik
│        ├─ realtime/      Socket.IO, autentikasi koneksi
│        ├─ email/         adapter (log | smtp)
│        └─ jobs/          penjadwal tugas
├─ packages/
│  ├─ sdk/                 kontrak game: tipe manifest, helper skor, hook
│  ├─ ui/                  komponen bersama, token, aset logo
│  ├─ i18n/                teks bersama (id.json, en.json), util
│  └─ db/                  skema inti, klien Drizzle, migrasi inti
├─ games/
│  ├─ flappy-bird/
│  ├─ memory-match/
│  └─ ludo/
├─ tools/
│  ├─ create-admin/        CLI pembuat admin
│  ├─ new-game/            generator folder game dari template
│  └─ check-i18n/          pemeriksa kunci terjemahan
├─ docker/                 Dockerfile, compose, Caddyfile
├─ docs/                   PRD, desain, arsitektur, panduan
└─ .github/workflows/      CI
```

## 4. Modul game

### 4.1 Struktur satu game

```text
games/<id>/
├─ manifest.ts       identitas dan konfigurasi (satu-satunya titik masuk)
├─ client/           UI game (React, Canvas 2D, SVG, atau scene Phaser: dipilih per game)
├─ server/           validasi skor, rute atau handler realtime khusus
├─ shared/           tipe dan engine murni (dipakai klien dan server)
├─ db/               skema dan migrasi tabel khusus game
├─ locales/          id.json, en.json
└─ README.md
```

### 4.2 Kontrak manifest

```ts
// packages/sdk/src/manifest.ts
export interface GameManifest {
  id: string;                         // slug unik, juga awalan tabel dan rute
  version: string;
  title: { id: string; en: string };
  description: { id: string; en: string };
  icon: string;                       // path aset di folder game
  mode: 'solo' | 'multiplayer';
  mobile: { supported: boolean; orientation?: 'portrait' | 'landscape' | 'any' };
  scoring?: {
    direction: 'higher' | 'lower';    // lebih besar atau lebih kecil lebih baik
    validate: (run: { score: number; durationMs: number }) => boolean;
    maxSubmitRatePerMin?: number;
  };
  client: () => Promise<{ default: React.ComponentType<GameProps> }>;  // lazy
  server?: () => Promise<GameServerModule>;                            // opsional
  migrations?: string;                // path folder migrasi
  permissions?: Array<'scores' | 'realtime' | 'db'>;                   // lihat §5
}
```

### 4.3 Registry

- Saat build, shell memindai `games/*/manifest.ts` (`import.meta.glob`); server memindai dengan cara yang sama saat boot.
- Saat server menyala, tiap manifest disinkronkan ke tabel `games` (baris dibuat jika belum ada, dengan status awal `inactive`; admin yang mengaktifkan). Field yang dikelola admin (status, jadwal, urutan) tidak ditimpa oleh sinkronisasi.
- Rute klien: `/games/:id` memuat komponen game secara lazy. Rute server: `/api/games/:id/*`. Namespace WebSocket: `/ws` dengan room berawalan `<id>:`.

### 4.4 Aturan isolasi (ditegakkan lewat tooling)

| Aturan | Penegakan |
|---|---|
| Game tidak mengimpor game lain | `eslint-plugin-boundaries` (gagal di CI) |
| Game hanya boleh bergantung pada `sdk`, `ui`, `i18n` dan dependensinya sendiri | ESLint + `package.json` per game |
| Tabel khusus game berawalan `<id>_` | Pemeriksa migrasi di CI |
| Rute dan room realtime berawalan id game | Dipaksa registry |
| Teks game hanya di `games/<id>/locales` | `check-i18n` |
| Tidak ada warna atau jarak mentah di UI game | Aturan lint untuk token |
| Dependensi berat (Phaser) hanya dimuat oleh game yang memakainya | Dynamic import + analisis ukuran bundle |

### 4.4a Pilihan teknologi per game

Setiap game bebas memilih teknologi tampilannya; inti aplikasi tidak peduli selama game memenuhi kontrak `sdk`.

| Pilihan | Cocok untuk | Catatan |
|---|---|---|
| React + CSS | Game papan, kartu, kuis | Contoh: Memory Match |
| React + SVG | Papan dengan geometri tertentu | Contoh: Ludo |
| Canvas 2D | Game arcade sederhana dengan gambar kode | Contoh: Flappy Bird (kode asli diporting) |
| Phaser 3 | Fisika, sprite, tilemap, animasi kompleks | Opsional, dimuat lazy hanya oleh game yang memakainya |

Porting dari `performance_dash`: game itu tidak punya berkas gambar atau audio; semua digambar lewat kode dan suara disintesis Web Audio. Kode referensi ada di `reference/performance_dash-games/`. Tampilan di dalam canvas dipertahankan seperti aslinya.

Template game menyediakan opsi engine: `pnpm new-game <slug> --engine react|canvas|phaser`.

### 4.5 Menambah game baru

1. `pnpm new-game <slug>` menyalin template ke `games/<slug>`.
2. Isi `manifest.ts` dan bangun `client/` (dan `server/` bila perlu).
3. Tambah `locales/id.json` dan `en.json`.
4. Jalankan migrasi bila game punya tabel sendiri: `pnpm db:migrate`.
5. Mulai ulang server. Game muncul di admin sebagai `Nonaktif`; admin mengatur jadwal lalu mengaktifkannya.

Tidak ada file inti yang perlu diedit.

## 5. Fleksibilitas dan batas kepercayaan

Saat ini semua game dibuat di dalam repositori dan dipercaya penuh. Namun kontraknya dirancang agar game dari tim lain bisa ditambahkan nanti:

- Game hanya berinteraksi lewat `sdk` (skor, user context, realtime, penyimpanan). Tidak ada akses langsung ke database inti.
- `permissions` di manifest menyatakan kemampuan yang dibutuhkan. Registry menolak game yang meminta izin yang tidak diberikan admin.
- Penyimpanan data game lewat helper `sdk.db` yang hanya mengizinkan tabel berawalan id game.
- Jika kelak dibutuhkan isolasi lebih ketat, game pihak ketiga dapat dijalankan di `iframe sandbox` dengan jembatan `postMessage` yang memakai kontrak `sdk` yang sama. Keputusan itu ditunda sampai ada kebutuhan nyata.

## 6. Model data

Tabel inti (paket `db`). Semua ID memakai UUID, waktu memakai `timestamptz`.

| Tabel | Kolom utama |
|---|---|
| `users` | id, username (unik, citext), display_name, email (unik, citext), email_verified_at (null), password_hash, status (`pending`/`active`/`rejected`/`suspended`/`banned`), locale_pref (`id`/`en`/`auto`), theme_pref, created_at, approved_at, approved_by, last_login_at |
| `admins` | id, username (unik), password_hash, created_at, last_login_at |
| `sessions` | id (hash token), subject_type (`user`/`admin`), subject_id, expires_at, ip, user_agent, created_at |
| `login_attempts` | key (username+ip), count, locked_until |
| `settings` | key, value (jsonb), updated_at, updated_by — mode pendaftaran, jadwal global, bahasa bawaan, SMTP |
| `games` | id (slug), status (`active`/`maintenance`/`inactive`), maintenance_message (id, en), schedule (jsonb, null = ikut global), sort_order, badge, updated_at |
| `game_scores` | user_id, game_id, best_score, plays, best_reached_at — PK (user_id, game_id) |
| `game_runs` | id, user_id, game_id, score, duration_ms, flagged, created_at — dasar papan weekly dan monthly |
| `audit_log` | id, admin_id, action, target_type, target_id, detail (jsonb), created_at |
| `email_tokens` | id, user_id, kind (`verify`/`reset`), token_hash, expires_at, used_at — disiapkan untuk SMTP |
| `chat_messages` | id, user_id (null jika akun dihapus), body (sudah disensor), created_at — chat publik |
| `chat_mutes` | user_id, muted_until, reason, admin_id |
| `banned_words` | id, word, lang (`id`/`en`/`any`), source (`builtin`/`admin`), enabled — dasar sensor |

Tabel khusus game (contoh Ludo, dikelola di `games/ludo/db`): `ludo_rooms`, `ludo_players`, `ludo_messages`. Room memiliki `last_activity_at`; job menghapus room yang tidak aktif > 7 hari.

Indeks penting: `game_runs (game_id, created_at)`, `game_scores (game_id, best_score desc)`, `sessions (expires_at)`, `users (status)`.

## 7. Autentikasi dan keamanan

- **Password:** argon2id. Aturan minimal 8 karakter; ditolak jika sama dengan username.
- **Sesi:** token acak 256 bit disimpan sebagai hash di tabel `sessions`; cookie `httpOnly`, `SameSite=Lax`, `Secure` otomatis saat HTTPS (atau dipaksa `COOKIE_SECURE=true`). Ban atau suspend menghapus semua sesi pengguna.
- **Pemisahan admin dan pemain:** tabel dan cookie berbeda (`ls_admin`, `ls_session`); middleware menolak silang peran. Akun admin tidak bisa membuka rute game.
- **Lockout:** 5 kegagalan berturut-turut dalam 10 menit mengunci kombinasi username+IP selama 15 menit.
- **CSRF:** token double-submit untuk metode mengubah data; cek `Origin`.
- **Rate limit:** per IP dan per akun (register, login, kirim skor, chat). Mode Public memakai batas lebih ketat dan CAPTCHA proof-of-work self-hosted.
- **Header:** CSP ketat (hanya asal sendiri), `X-Content-Type-Options`, `Referrer-Policy`, HSTS di mode Public.
- **Input:** semua input divalidasi Zod; output chat disanitasi.
- **Skor:** validasi kewajaran di server (batas skor, rasio skor per detik, batas laju). Skor dari browser tidak bisa dibuktikan sepenuhnya; run yang janggal ditandai `flagged` untuk ditinjau admin. Anti-cheat yang lebih kuat (replay input atau simulasi server) adalah pekerjaan lanjutan.
- **Pesan error** dikirim sebagai kode (`AUTH_INVALID_CREDENTIALS`) dan diterjemahkan di klien.
- **Audit:** setiap aksi admin yang mengubah data dicatat.

## 8. Realtime (Ludo)

- Socket.IO, diautentikasi dengan cookie sesi saat handshake. Satu room Socket.IO per room Ludo (`ludo:<roomId>`).
- **Server otoritatif:** server melempar dadu, memvalidasi langkah, dan menyiarkan state. Klien hanya menggambar dan mengirim aksi (`roll`, `move`, `skip`, `chat`, dll).
- State aktif disimpan di memori proses dan **dipersistenkan ke Postgres setiap perubahan** (kolom `state` + `version`), sehingga server bisa restart tanpa kehilangan game. Karena hanya satu instance server, Redis tidak diperlukan.
- Pemutusan koneksi: pemain tersambung ulang otomatis; jika giliran habis (timeout), autopilot bermain untuk pemain itu.
- Klien menangani tidur layar dan perpindahan jaringan di ponsel (backoff dan sinkronisasi ulang state penuh saat tersambung).
- Game dinonaktifkan: koneksi baru ditolak, room dibekukan, dilanjutkan saat game dinyalakan.
- Ludo 12 pemain: geometri papan sudah dihitung dari jumlah lengan (`geometry(players)`), jadi mendukung 12 secara matematis. Pekerjaan tambahan: 12 warna pion, jumlah pion bawaan 2 untuk > 8 pemain, simulasi panjang permainan, dan uji keterbacaan di ponsel.

### Chat publik

- Namespace Socket.IO `public-chat`, satu room global. Hanya pemain `active` yang boleh tersambung; admin ditolak.
- Klien **hanya menampilkan panel di desktop** (media query lebar ≥ 1024px). Di bawah itu soket tidak dibuka, sehingga ponsel tidak membuang baterai dan data.
- Alur kirim: validasi panjang (≤ 300) → cek `chat_mutes` → rate limit (1 pesan / 2 detik) → sensor → simpan → siarkan. Klien tidak pernah menyensor sendiri.
- Saat tersambung, klien mengambil 50 pesan terakhir lewat REST (`GET /api/chat/history`) lalu mendengarkan pesan baru.
- Job `purge-chat` menghapus pesan > 7 hari.
- Chat room Ludo memakai room `ludo:<roomId>` dan alur sensor yang sama.

### Sensor kata kasar

- Modul `sdk.profanity` (satu implementasi, dipakai chat publik, chat Ludo, dan nama tampilan).
- Normalisasi sebelum pencocokan: huruf kecil, hapus aksen, ganti leet (`@`→a, `$`→s, `0`→o, `1`→i, `3`→e), buang simbol dan spasi yang disisipkan, ringkas huruf berulang.
- Pencocokan per kata dan per rangkaian; kata yang cocok diganti `*` sepanjang kata aslinya. Hindari salah sensor pada kata wajar (daftar pengecualian).
- Daftar bawaan Indonesia dan English tersimpan di repositori; admin dapat menambah atau menonaktifkan kata lewat tabel `banned_words`. Perubahan berlaku tanpa restart (cache dimuat ulang).
- Nama tampilan disensor saat dirender (nilai asli tetap di DB untuk moderasi admin).

### Penghapusan akun

`DELETE /api/me` (konfirmasi password) menjalankan satu transaksi: hapus `game_scores` dan `game_runs`, kosongkan `user_id` pada `chat_messages`, hapus sesi, lalu hapus baris `users`. Hook per game (`sdk.onUserDeleted`) memberi kesempatan game membersihkan datanya sendiri; untuk Ludo: kursi di game berjalan diambil autopilot, room belum mulai milik host dihapus.

## 9. Mode deploy: LAN dan Public

Variabel `DEPLOY_MODE=lan|public` menentukan nilai bawaan; sebagian dapat diubah admin saat runtime.

| Aspek | `lan` | `public` |
|---|---|---|
| Compose | `docker compose --profile lan up -d` | `docker compose --profile public up -d` (menambah Caddy) |
| HTTPS | Opsional | Wajib (Caddy + Let's Encrypt) |
| Mode pendaftaran awal | `approval` | `open` |
| CAPTCHA | Mati | Aktif |
| Cookie `Secure` | Mengikuti protokol | Selalu |
| SMTP | Opsional | Disarankan |

- **Aset di-host sendiri** (font, ikon, library). Tidak ada permintaan ke CDN, sehingga jalan tanpa internet.
- **PWA di LAN:** service worker mensyaratkan konteks aman (HTTPS atau `localhost`). Di LAN dengan HTTP biasa, aplikasi tetap jalan di browser tetapi tidak bisa dipasang penuh. Opsi: Caddy dengan CA internal (`tls internal`) dan memasang sertifikat akar di perangkat kantor.
- **Zona waktu:** logika jadwal dan periode leaderboard memakai `Asia/Jakarta`, tidak bergantung zona waktu server.

### Konfigurasi (`.env`)

| Variabel | Fungsi |
|---|---|
| `DEPLOY_MODE` | `lan` atau `public` |
| `DATABASE_URL` | Koneksi Postgres |
| `APP_ORIGIN` | Asal publik aplikasi (CSRF, cookie, tautan email) |
| `SESSION_SECRET` | Kunci penandatanganan |
| `COOKIE_SECURE` | `auto` (bawaan) atau `true`/`false` |
| `TZ_APP` | Bawaan `Asia/Jakarta` |
| `DEFAULT_LOCALE` | `auto` (bawaan), `id`, `en` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Opsional; kosong = email nonaktif |

`.env.example` disediakan; `.env` tidak masuk repositori.

## 10. Email (disiapkan, nonaktif)

- Antarmuka `EmailAdapter` dengan dua implementasi: `LogAdapter` (bawaan, hanya mencatat) dan `SmtpAdapter` (aktif bila SMTP dikonfigurasi dan dinyalakan admin).
- Templat dua bahasa mengikuti `locale_pref` pengguna.
- Admin panel menampilkan status SMTP dan tombol "Kirim email uji".
- Fitur yang bergantung SMTP (verifikasi, lupa password) disembunyikan di UI selama adapter adalah `LogAdapter`.

## 11. Internasionalisasi

- Bahasa: `id`, `en`. Preferensi pengguna: `auto` (ikuti browser), `id`, `en`.
- Penentuan: akun (jika login) → pilihan di browser (`localStorage`) → `Accept-Language` / `navigator.language` → `DEFAULT_LOCALE`.
- Namespace: `common` (paket `i18n`), `auth`, `admin`, dan satu per game (`game.<id>`), dimuat lazy.
- Format tanggal dan angka memakai `Intl` sesuai locale.
- `tools/check-i18n` memastikan kunci `id` dan `en` identik di setiap namespace; gagal di CI jika ada yang hilang.
- Server hanya mengirim kode error dan data, bukan kalimat.

## 12. Mobile dan PWA

- Mobile-first: viewport 360px adalah acuan; titik uji 360, 390, 768, 1280.
- Game berbasis canvas (Flappy Bird asli, dan Phaser bila dipakai game lain) menjaga rasio dengan skala FIT dan pemusatan otomatis; Memory Match dan Ludo memakai layout fluid. Input pointer/touch menjadi sumber input utama.
- `vite-plugin-pwa`: manifest (nama "Low Stress", ikon burung 192/512, warna tema teal, `display: standalone`), service worker untuk cache aset statis (bukan cache API).
- Pengecekan perangkat: manifest game `mobile.supported=false` menampilkan keterangan di kartu, bukan halaman rusak.

## 13. Job terjadwal

| Job | Interval | Tugas |
|---|---|---|
| `expire-ludo-rooms` | Tiap jam | Hapus room dengan `last_activity_at` > 7 hari |
| `purge-sessions` | Harian | Hapus sesi kedaluwarsa |
| `purge-login-attempts` | Harian | Hapus data lockout lama |
| `refresh-leaderboard` | Tidak perlu (dihitung dari `game_runs` saat diminta, dengan cache singkat) | |

Penjadwal berjalan di proses server (node-cron), cukup untuk satu instance.

## 14. API (garis besar)

```text
POST   /api/auth/register          POST /api/auth/login        POST /api/auth/logout
GET    /api/me                     PATCH /api/me (bahasa, tema, nama)
POST   /api/me/password            DELETE /api/me (hapus akun sendiri)
GET    /api/chat/history           WebSocket namespace: public-chat

GET    /api/games                  daftar game + status + keterbukaan saat ini
GET    /api/games/:id/leaderboard?period=week|month|all
POST   /api/games/:id/scores       kirim skor (melewati gerbang jadwal)
*      /api/games/:id/...          rute khusus game (dari games/<id>/server)

POST   /api/admin/login            POST /api/admin/logout
GET    /api/admin/dashboard
GET    /api/admin/users?status=…   PATCH /api/admin/users/:id (approve/reject/suspend/ban/reset)
GET/PATCH /api/admin/games/:id     status, jadwal, pesan, urutan
GET/PATCH /api/admin/settings      mode pendaftaran, jadwal global, bahasa, SMTP, chat publik
GET/POST/PATCH /api/admin/banned-words   kelola daftar sensor
DELETE /api/admin/chat/:id         POST /api/admin/chat/mute
GET    /api/admin/audit
DELETE /api/admin/scores/:id       POST /api/admin/leaderboard/:gameId/reset
```

Semua respons error: `{ error: { code, params? } }`.

## 15. Observabilitas dan operasi

- Log terstruktur (pino), level lewat env; tidak mencatat password atau token.
- Endpoint `/healthz` (proses) dan `/readyz` (database).
- Cadangan: `pg_dump` terjadwal lewat container (panduan di `docs/`).
- Migrasi dijalankan otomatis saat boot (`pnpm db:migrate` juga tersedia manual).

## 16. Pengujian dan CI

| Jenis | Cakupan |
|---|---|
| Unit | Engine Ludo, Flappy, Memory, jadwal WIB, validasi skor, periode leaderboard |
| Integrasi | Auth, approval, gerbang status dan jadwal, skor, admin |
| E2E (Playwright) | Register → pending → approve → login → main → skor muncul; admin mengubah status game; viewport mobile dan desktop; dua bahasa |
| Statis | Typecheck, ESLint (isolasi), `check-i18n`, pemeriksa migrasi |

CI (GitHub Actions) menjalankan semua langkah di setiap pull request; build gagal jika salah satu tidak lolos.

## 17. Keputusan terbuka

| Topik | Opsi | Catatan |
|---|---|---|
| Framework backend | **Fastify (diputuskan)** | Integrasi Socket.IO dan plugin; runtime Node (Bun tidak dipakai) |
| Package manager | **pnpm + Node (diputuskan)** | Bun dipertimbangkan lalu ditolak demi stabilitas jangka panjang |
| Game dari pihak ketiga | Dipercaya penuh (sekarang) atau sandbox iframe | Lihat §5 |
| CAPTCHA | Proof-of-work self-hosted (mis. Altcha) | Hanya aktif di `public` |
| Anti-cheat skor | Plausibility check (sekarang) atau replay/simulasi server | Pekerjaan lanjutan |
| HTTPS di LAN | HTTP, atau CA internal Caddy | Menentukan kemampuan PWA penuh |
