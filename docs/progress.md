# Progress - Low Stress

## 2026-11-04 - Fase 1 (P1-01..P1-12)

Lingkup: Fase 1 saja. Tidak ada commit, tidak ada pekerjaan Fase 2.

### Ringkasan

| Tugas | Status | Bukti / catatan |
|---|---|---|
| P1-01 Monorepo pnpm + TypeScript strict + skrip akar | Selesai | `pnpm install` (12 proyek), `pnpm typecheck` lolos. |
| P1-02 ESLint + boundaries | Selesai | `pnpm lint` bersih; `tools/eslint-config/test/rules.test.js` 8 tes (impor terlarang gagal, impor sah lolos, nilai mentah ditolak). |
| P1-03 `packages/db` Drizzle + skema + migrasi | Selesai | Migrasi `0000_plain_scorpion.sql` diterapkan ke PostgreSQL 16 kosong; 13 tabel inti: admins, audit_log, banned_words, chat_messages, chat_mutes, email_tokens, game_runs, game_scores, games, login_attempts, sessions, settings, users; ekstensi `citext` aktif. |
| P1-04 `packages/i18n` + `tools/check-i18n` | Selesai | `pnpm i18n:check` lolos; 12 tes i18n + 5 tes checker. Tes membuktikan kunci hanya di `id`, hanya di `en`, dan berkas hilang menghasilkan kegagalan. |
| P1-05 `packages/ui` token/font/logo/komponen | **Sebagian** | Token terang/gelap, font Nunito self-host, logo SVG, dan 6 komponen tampil di dua panel tema pada 360/390/768/1280 tanpa overflow. **Kriteria kontras §3.3 tidak terpenuhi penuh**: `--text-secondary` 4,17:1, `--text-muted` 2,62:1, `--accent-text` 4,37:1 di latar halaman. Nilai token tidak diubah; penyimpangan tercatat di `Design_System.md` §3.3 sebagai **usulan agent yang menunggu keputusan pemilik**, bukan pengecualian resmi. P1-05 tetap belum dicentang. |
| P1-06 `packages/sdk` kontrak game | Selesai | Tipe dan helper dipakai oleh server (`apps/server/src/registry/games.ts`) dan template/manifest game contoh; 19 tes SDK. |
| P1-07 Server Fastify | Selesai | 12 tes server. Dengan DB hidup `/healthz` 200 dan `/readyz` 200; setelah PostgreSQL dihentikan `/healthz` tetap 200 dan `/readyz` menjadi 503; setelah DB dinyalakan kembali `/readyz` 200. |
| P1-08 Registry game server + web | Selesai | Game contoh `demo` tersinkron sebagai `inactive`; restart mempertahankan `active` dan `badge` admin (`unchanged: ["demo"]`). |
| P1-09 Template game + `tools/new-game` | Selesai | `pnpm new-game demo` membuat folder; lint, typecheck, dan tes lolos; `demo` muncul di registry server dan build web. Folder dan baris DB `demo` dihapus setelah verifikasi. |
| P1-10 Docker + compose + `.env.example` | **Terhalang** | Berkas dibuat: `docker/web.Dockerfile`, `docker/server.Dockerfile`, `docker/web/nginx.conf`, `docker/Caddyfile`, `docker-compose.yml`, `.dockerignore`, `.env.example`, `docs/deploy.md`. YAML valid. **Belum dijalankan** karena Docker/Podman/WSL tidak tersedia di mesin ini. |
| P1-11 CI GitHub Actions + pemeriksa awalan migrasi | **Sebagian** | `.github/workflows/ci.yml` ada dan YAML valid; `pnpm check:migrations` lolos dengan 4 tes. Pipeline belum pernah hijau di GitHub karena direktori ini bukan repositori git dan tidak ada remote. |
| P1-12 PWA dasar | Selesai | `apps/web/dist` menghasilkan `manifest.webmanifest`, `sw.js`, dan `workbox-*.js`. Lighthouse 11.7.1 kategori PWA skor **1.0** di `http://127.0.0.1:4173` (localhost): installable-manifest, maskable-icon, splash-screen, themed-omnibox, viewport lolos. Precaches hanya aset statis; `navigateFallbackDenylist` mengecualikan `/api/` dan `/ws`; tidak ada URL API di precache. |

### Pemeriksaan akhir

```
pnpm lint            -> lolos
pnpm typecheck       -> lolos
pnpm test            -> lolos (sdk 19, i18n 12, ui 7, check-i18n 5, check-migrations 4, eslint-config 8, server 12)
pnpm i18n:check      -> lolos
pnpm check:migrations-> lolos
pnpm --filter @low-stress/web build -> lolos (17 entri precache)
```

Pemeriksaan yang sama diulang setelah `TASKS.md` dan dokumen ini diperbarui: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm i18n:check`, dan `pnpm check:migrations` semuanya lolos.

### Keputusan teknis agent (implementasi, bukan keputusan produk pemilik)

- pnpm 12.16.1 dipasang global lewat npm karena corepack gagal (`EPERM`).
- `allowBuilds: { esbuild: true, sharp: true }` di `pnpm-workspace.yaml`; `games/*` adalah paket workspace.
- TypeScript dipin ke `^5.9.3`; `typescript-eslint` di akar.
- Server dijalankan dengan `tsx` karena registry memindai `games/*/manifest.ts` saat boot.
- Token desain ditulis sebagai kelas CSS biasa di `packages/ui`; Tailwind dipakai di aplikasi web.
- Sensor kata kasar memakai kanonikalisasi berbasis token; penanganan kalimat penuh ditunda ke Fase 8.
- Ekstensi `citext` dibuat manual di migrasi `packages/db`.
- Penyimpangan kontras dicatat di `Design_System.md` §3.3 sebagai usulan agent yang menunggu keputusan pemilik; token tetap mengikuti §3.2 dan belum ada pengecualian resmi.

### Yang belum diverifikasi

- P1-10: `docker compose --profile lan up -d` dan `/healthz` lewat nginx belum dijalankan.
- P1-11: pipeline GitHub Actions belum dijalankan pada repositori/remote.
- P1-12: PWA diuji di localhost, bukan HTTPS publik.
- Perilaku service worker setelah update dan offline penuh belum diuji manual.

### Langkah berikutnya

1. Pemilik menyediakan Docker untuk memverifikasi P1-10.
2. Inisialisasi repositori git + remote, lalu jalankan CI untuk P1-11.
3. Putuskan apakah nilai token kontras diperbaiki agar lolos 4,5:1 atau penyimpangan §3.3 disetujui sebagai pengecualian resmi (P1-05 belum dicentang sampai keputusan itu ada).
4. Setelah keputusan di atas dan P1-10/P1-11 hijau, lanjut Fase 2.

---

## 2026-11-04 - Fase 2 (P2-01..P2-07)

Lingkup: Fase 2 saja (Auth Pemain). Tidak ada commit, tidak ada git init. P1-05, P1-10, P1-11 tidak disentuh.

### Ringkasan

| Tugas | Status | Bukti / catatan |
|---|---|---|
| P2-01 Endpoint register (API_Spec §3) | Selesai | Validasi D9 (username 3–20, displayName 1–30, email unik, password min 8 char & != username). Hash argon2id (memoryCost 19456, timeCost 2, parallelism 1). Mode registration: approval -> status `pending`, open -> status `active`, closed -> error `REGISTRATION_CLOSED` (403). Username/email duplikat mengembalikan `USERNAME_TAKEN` (409) / `EMAIL_TAKEN` (409). 5 tes unit/integrasi. |
| P2-02 Login, logout, sesi cookie, lockout | Selesai | Hash sesi (SHA-256) disimpan di tabel `sessions`. Cookie HTTP-only `lowstress_session`. Lockout: 5 kali gagal dalam 10 menit mengunci akun selama 15 menit (`AUTH_LOCKED` 429). Pengguna yang di-ban ditolak (`ACCOUNT_BANNED` 403) dan sesinya otomatis tidak valid. Logout menghapus sesi di DB dan membersihkan cookie. 4 tes unit/integrasi. |
| P2-03 CSRF dan header keamanan | Selesai | Token CSRF double-submit di cookie `lowstress_csrf` dan header `x-csrf-token`. Validasi asal `Origin` / `Referer`. Permintaan mutasi tanpa CSRF ditolak `CSRF_INVALID` (403). Header CSP (`default-src 'self'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`. 2 tes. |
| P2-04 UI auth (login, register, pending) | Selesai | Layar `/login`, `/register`, `/pending` dibangun dengan React 19 + Tailwind + token `packages/ui` (`.ls-auth-page`, `.ls-auth-card`, `.ls-link`, button, input). Mobile-first (360px & 1280px), dukungan bilingual penuh (`id` dan `en`), navigasi switcher bahasa. Alur E2E lengkap teruji di tes integrasi: register -> pending -> stub persetujuan admin di DB -> login -> profil active. |
| P2-05 Endpoint profil `/api/me` | Selesai | Mengambil profil pengguna, update preferensi bahasa/tema/displayName (`PATCH /api/me`), ubah password dengan verifikasi password lama (`POST /api/me/password`). Otomatis menyensor nama tampilan (`profanity`). Status pending dicegah dari mutasi (`ACCOUNT_PENDING` 403). 3 tes integrasi. |
| P2-06 Hapus akun sendiri (`DELETE /api/me`) | Selesai | Konfirmasi password wajib. Sesuai Architecture §11, transaksi menghapus sesi, chat pribadi/anonimkan publik, skor/run, dan baris pengguna di tabel `users`. Hook `sdk.onUserDeleted` dipanggil. 1 tes integrasi. |
| P2-07 Rate limit & CAPTCHA proof-of-work | Selesai | Generator PoW SHA-256 self-hosted (HMAC bertanda tangan, kedaluwarsa 5 menit, difficulty dinamis). Solver Web Crypto di klien. Verifikasi PoW di server saat register jika `DEPLOY_MODE=public` atau `captcha_enabled=true`. Endpoint `GET /api/public-config` menyediakan status registrasi dan captcha. 2 tes integrasi. |

### Pemeriksaan akhir

```
pnpm lint            -> lolos (0 error, 0 peringatan)
pnpm typecheck       -> lolos (seluruh workspace)
pnpm test            -> lolos (86 tes: sdk 19, i18n 12, ui 7, check-i18n 5, check-migrations 4, eslint-config 8, server 31)
pnpm i18n:check      -> lolos (kunci id dan en cocok)
pnpm check:migrations-> lolos
pnpm build           -> lolos (web build + server tsc)
```

### Keputusan teknis agent (implementasi, bukan keputusan produk pemilik)

- Algoritma Argon2id memakai `@node-rs/argon2` dengan `ARGON2ID_ALGORITHM = 2` untuk kompatibilitas TS `verbatimModuleSyntax`.
- Solver PoW di klien menggunakan `crypto.subtle` bawaan browser tanpa dependensi eksternal.
- Cookie dikelola lewat `@fastify/cookie` dengan flag `httpOnly`, `sameSite: 'lax'`, dan `secure` dinamis menyesuaikan HTTPS/LAN.
- Rate limit rute diuji dengan konfigurasi longgar saat `NODE_ENV === 'test'` agar tidak mengganggu kecepatan eksekusi tes terotomasi.

### Yang belum diverifikasi

- Uji fisik browser nyata di perangkat mobile iOS Safari & Android Chrome (layar login/register diuji pada viewport emulator/CSS responsive 360px–1280px).
- Fitur reset password lewat email (masih menunggu implementasi SMTP di fase berikutnya; saat ini lupa password diarahkan ke admin per PRD §4).

---

## 2026-11-04 - Fase 3 (P3-01..P3-09)

Lingkup: Fase 3 saja (Panel admin). Tidak ada commit git ("Jangan commit, saya yang akan commit nanti"). P1-05, P1-10, P1-11 tidak disentuh.

### Ringkasan

| Tugas | Status | Bukti / catatan |
|---|---|---|
| P3-01 `tools/create-admin` (`pnpm create-admin`) | Selesai | CLI interaktif dan programatik untuk membuat akun admin di tabel `admins`. Password di-hash menggunakan argon2id (memoryCost 19456, timeCost 2, parallelism 1). Menolak username duplikat, username < 3 karakter, dan password < 8 karakter. Skrip akar `pnpm create-admin` terdaftar di `package.json`. 6 tes integrasi lolos. |
| P3-02 Login admin terpisah & pemisahan peran | Selesai | Autentikasi admin independen dari pemain: cookie HTTP-only `ls_admin`. Rute `/api/admin/login`, `/api/admin/logout`, dan `/api/admin/me`. Middleware pemisah peran: `createAdminAuthMiddleware` (menolak non-admin/pemain dengan `FORBIDDEN` 403 atau `UNAUTHORIZED` 401), `createAuthMiddleware` dan `createGameGateMiddleware` (menolak admin bermain game dengan `ADMIN_CANNOT_PLAY` 403). Teruji 4 tes integrasi. |
| P3-03 Persetujuan pengguna | Selesai | Endpoint `/api/admin/users/pending`, `/api/admin/users/:id/status`, dan `/api/admin/users/bulk-status`. Persetujuan mengubah status menjadi `active`. Penolakan menghapus baris pengguna dan mencabut semua sesi aktif seketika. Setiap aksi tercatat di `audit_log` (`user.approve`, `user.reject`, `user.bulk_approve`, `user.bulk_reject`). Teruji 3 tes integrasi. |
| P3-04 Manajemen pengguna | Selesai | Endpoint `/api/admin/users` (pencarian case-insensitive pada username/displayName/email dan filter status). Aksi: `suspend`, `ban`, `activate`, `reset-password` (menghasilkan password acak yang di-hash argon2id dan dikembalikan ke admin), serta `delete` pengguna beserta data terkait. Penangguhan (suspend) dan pemblokiran (ban) memutus seluruh sesi aktif pengguna seketika. Teruji 4 tes integrasi. |
| P3-05 Pengaturan sistem dinamis | Selesai | Endpoint `GET /api/admin/settings` dan `PATCH /api/admin/settings`. Konfigurasi tersimpan di tabel `settings`: mode pendaftaran (`approval`, `open`, `closed`), bahasa bawaan (`auto`, `id`, `en`), jadwal global aktif/nonaktif, status chat publik, batas pemain Ludo (2–12), dan status SMTP. Perubahan berlaku langsung tanpa perlu restart server. Teruji 3 tes integrasi. |
| P3-06 EmailAdapter & uji SMTP | Selesai | Abstraksi `EmailAdapter` dengan `LogAdapter` bawaan (mencatat pengiriman ke log Pino) dan `SmtpAdapter` (menggunakan nodemailer saat variabel SMTP dikonfigurasi). Endpoint `POST /api/admin/settings/test-email` mengirim email uji; menolak dengan `SMTP_NOT_CONFIGURED` jika kredensial SMTP belum diisi di env. Teruji 2 tes integrasi. |
| P3-07 Audit log | Selesai | Helper `recordAuditLog` otomatis mencatat admin_id, IP klien, aksi, target_type, target_id, dan detail JSON pada setiap operasi mutasi di P3-03..P3-05. Endpoint `GET /api/admin/audit-logs` dengan filter berdasarkan aksi dan pagination limit/offset. Teruji 3 tes integrasi. |
| P3-08 Dashboard admin | Selesai | Endpoint `GET /api/admin/dashboard` menyajikan metrik operasional terpadu: jumlah pendaftar baru hari ini, jumlah pengguna berstatus `pending`, total pengguna aktif/suspended/banned, pemain aktif hari ini (berdasarkan sesi aktif unik), total permainan hari ini, serta agregasi run per game (`runsByGame`). Teruji 3 tes integrasi. |
| P3-09 UI admin responsif & bilingual | Selesai | Aplikasi web admin di `apps/web`: Layout terisolasi dengan navigasi sidebar desktop (>= 1024px / 1280px) dan hamburger drawer dengan backdrop pada mobile (<= 767px / 360px); transformasi tabel ke daftar kartu di layar sempit; halaman Dashboard, Persetujuan, Pengguna, Pengaturan, Audit, dan Login Admin; 100% menggunakan token `@low-stress/ui` (0 nilai mentah/px di JSX); dukungan dwibahasa penuh (`id` dan `en`) dengan pergantian bahasa instan; 7 tes Vitest komponen web di `apps/web/test/admin-ui.test.tsx`. |

### Pemeriksaan akhir

```
pnpm lint            -> lolos (0 error, 0 peringatan di seluruh workspace)
pnpm typecheck       -> lolos (seluruh workspace tanpa eror)
pnpm test            -> lolos (100 tes: server 53, web 7, sdk 19, i18n 12, ui 7, check-i18n 5, check-migrations 4, create-admin 6)
pnpm i18n:check      -> lolos (kunci id dan en cocok)
pnpm check:migrations-> lolos
pnpm --filter @low-stress/web build -> lolos (Vite build + 17 entri precache)
```

### Keputusan teknis agent (implementasi, bukan keputusan produk pemilik)

- Cookie terpisah `ls_admin` digunakan untuk admin, berbeda dari `lowstress_session` untuk pemain, mencegah tabrakan hak akses dan mempermudah pengujian multi-peran pada browser yang sama.
- Pemisahan peran tegas: rute game memvalidasi sesi pemain dan menolak token admin (`ADMIN_CANNOT_PLAY` 403); rute admin menolak sesi pemain (`FORBIDDEN` 403).
- Arsitektur antarmuka admin di `apps/web` dirancang modular dengan pemisahan `context.ts`, `useAdmin.ts`, dan `AdminContext.tsx` untuk mematuhi aturan lint `react-refresh/only-export-components` dan React 19 SSR compatibility.
- Komponen admin memanfaatkan styling CSS modular `.ls-admin-*` di `packages/ui/src/styles.css` agar tidak ada nilai mentah (raw px/hex) pada file JSX/TSX.
- Tes komponen web dijalankan dengan Vitest dan `react-dom/server` (`renderToString`) yang aman di lingkungan Node tanpa memerlukan dependensi browser berat eksternal.

### Yang belum diverifikasi

- Pengiriman email SMTP ke server email publik nyata (diuji menggunakan mock SMTP transporter dan LogAdapter).
- Uji fisik interaksi layar sentuh pada perangkat nyata iOS Safari & Android Chrome untuk drawer hamburger admin.

---

## 2026-11-04 - Fase 4 (P4-01..P4-04)

Lingkup: Fase 4 saja (Gerbang game, status, jadwal, beranda pemain, dan API gate). P1-05, P1-10, P1-11 tidak disentuh.

### Ringkasan

| Tugas | Status | Bukti / catatan |
|---|---|---|
| P4-01 Status per game, pesan maintenance dwibahasa, sortOrder, badge | Selesai | Endpoint admin `GET /api/admin/games` & `PATCH /api/admin/games/:id`. Endpoint pemain `GET /api/games` hanya menyajikan game berstatus `active` dan `maintenance`; game `inactive` disembunyikan total dari pemain dan ditolak 404 jika diakses langsung. Game `maintenance` tampil dengan `open: false`, tombol terkunci, dan menampilkan pesan maintenance dari admin (dwibahasa `id` dan `en`). Urutan game mematuhi `sortOrder` ASC lalu `id` ASC. Badge didukung dan tampil di kartu game. Aksi perubahan admin tercatat di `audit_log` (`game.update`). Teruji di unit & integrasi. |
| P4-02 Jadwal WIB (global & per game), jendela multi-waktu, lintas tengah malam | Selesai | Engine jadwal di `apps/server/src/games/schedule.ts` diporting dari `commercial-games.ts` dengan zona waktu `Asia/Jakarta` (WIB). Mendukung 1–6 jendela waktu, batas inklusif start dan eksklusif end, jendela lintas tengah malam (dimulai pada hari jadwal dan tetap terbuka setelah tengah malam di bawah hari mulainya), serta pergantian hari modulo 7 (Minggu ke Senin). Menghitung `opensAt` (waktu pembukaan ISO berikutnya) secara akurat saat game sedang ditutup. Jadwal per game menimpa jadwal global (`settings.globalSchedule`); jika `schedule: null` otomatis mengikuti jadwal global. 7 tes unit `test/schedule.test.ts` mencakup jendela normal, lintas tengah malam, dan pergantian hari. |
| P4-03 Halaman beranda dan kartu game (Screens §5), halaman "game ditutup" (Screens §6) | Selesai | Halaman `HomePage` (`/`) dengan sapaan nama pengguna "Halo, {displayName}", baris status jadwal ("Buka sepanjang hari" / "Buka {windows} WIB" / "Tutup, dibuka kembali {hari} {jam} WIB"), dan grid responsif kartu game: 1 kolom (< 768px), 2 kolom (768–1023px), 3 kolom (≥ 1024px). Kartu game menyajikan artwork/pratinjau, badge, chip status ("Aktif", "Tutup", "Maintenance"), info rekor pribadi atau pesan maintenance, serta tombol aksi ("Main" primary, "Lihat jadwal" secondary, "Terkunci" disabled). Halaman `GameStatusPage` (`/games/:id/status` dan `/games/:id`) menyajikan layar status kartu tengah dengan ikon jam SVG (Screens §6). Halaman kelola game admin di `AdminGamesPage` (`/admin/games`). E2E integrasi teruji: admin menutup game -> pemain melihat kartu terkunci di beranda dan gerbang menolak dengan `GAME_MAINTENANCE`. 8 tes UI web di `apps/web/test/games-ui.test.tsx`. |
| P4-04 Gerbang API (`/api/games/:id/*`) | Selesai | Middleware gerbang game di Fastify memvalidasi seluruh rute game: menolak game `inactive` atau tidak ditemukan dengan `404 NOT_FOUND`; menolak game `maintenance` dengan `403 GAME_MAINTENANCE` beserta `maintenanceMessage`; menolak game di luar jadwal dengan `403 GAME_CLOSED` (menyertakan parameter `windows`, `days`, dan `opensAt`); menolak akun admin (`ls_admin`) dengan `403 FORBIDDEN`; menolak tamu dengan `401 UNAUTHENTICATED`; dan menolak pengguna pending dengan `403 ACCOUNT_PENDING`. Pemain active yang bermain di dalam jadwal diizinkan `200 OK`. 13 tes integrasi di `apps/server/test/games-gate.test.ts`. |

### Pemeriksaan akhir

```
pnpm lint            -> lolos (0 error, 0 warning)
pnpm typecheck       -> lolos (seluruh workspace)
pnpm test            -> lolos (128 tes: server 73, web 15, sdk 19, i18n 12, ui 7, check-i18n 5, check-migrations 4, create-admin 6)
pnpm i18n:check      -> lolos (kunci id dan en cocok)
pnpm check:migrations-> lolos
pnpm --filter @low-stress/web build -> lolos (Vite build + 17 entri precache PWA)
```

### Keputusan teknis agent (implementasi, bukan keputusan produk pemilik)

- Jadwal game dihitung secara otoritatif di server dengan zona waktu `Asia/Jakarta` (WIB, UTC+7 tanpa DST).
- Penghitungan pembukaan berikutnya (`opensAt`) menelusuri 8 hari ke depan dari waktu sekarang di zona WIB untuk menemukan jendela buka paling awal yang sah.
- Desain grid kartu game diatur lewat kelas CSS `.ls-game-grid` di `packages/ui` yang menerapkan mobile-first (1 kolom di ponsel, 2 kolom di tablet 768px, 3 kolom di desktop 1024px) sesuai Screens §5.
- Kartu game dan layar status game (`.ls-status-screen`) 100% menggunakan token `@low-stress/ui` tanpa nilai mentah.
- Rute `/api/games` untuk pemain tetap mengembalikan respons publik/terautentikasi (menampilkan skor `mine` jika pemain login), sementara rute spesifik game `/api/games/:id/*` wajib terautentikasi sebagai pemain aktif.

### Yang belum diverifikasi

- Tampilan fisik kartu game pada game konkret (Flappy Bird, Memory Match, Ludo yang baru akan di-porting pada Fase 5–7).
- Interaksi sentuh pengguna pada perangkat ponsel nyata.

---

## 2026-11-04 - Fase 5 (P5-01..P5-05)

Lingkup: Fase 5 (Memory Match dan Leaderboard).

### Ringkasan

| Tugas | Status | Bukti / catatan |
|---|---|---|
| P5-01 Skor generik: `game_scores`, `game_runs`, `recordScore`, `plausibleRun` per manifest | Selesai | Kolom `best_play` ditambahkan ke `game_scores` lewat migrasi `0001_past_king_bedlam.sql`. Engine skor generik di `apps/server/src/games/scores.ts`: fungsi `recordScore` mengelola upsert ke `game_scores` (`best_score = GREATEST`, penambahan `plays`, pencatatan `best_play`, dan `best_reached_at`), aturan tie-break "yang lebih awal menang" (skor seri mempertahankan `best_play` dan timestamp `best_reached_at` terdahulu), serta pencatatan setiap run ke `game_runs` (run Flappy Bird dengan skor < 1 diabaikan sesuai Porting_Guide §6). Validasi kewajaran `plausibleRun` dan kalkulasi skor `calculateMemoryMatchScore` diuji lengkap. 10 tes unit di `apps/server/test/scores.test.ts`. |
| P5-02 Leaderboard weekly/monthly/all time dalam WIB | Selesai | Fungsi `getLeaderboard` & `getLeaderboardBounds` di `apps/server/src/games/scores.ts` dan endpoint `GET /api/games/:id/leaderboard`. Periode `all` memakai `game_scores` dengan ranking `ORDER BY best_score DESC, best_reached_at ASC`; periode `week` dan `month` diagregasi dari `game_runs` dengan `date_trunc` di zona `Asia/Jakarta` (WIB). Menyajikan top 10 (`entries`), baris pemain sendiri di luar top 10 (`me`), serta `mine` selalu. Sensor nama tampilan (`censorProfanity`). Tes unit memverifikasi batas Senin 00:00 WIB untuk mingguan dan tanggal 1 00:00 WIB untuk bulanan secara presisi. 4 tes unit di `apps/server/test/scores.test.ts`. |
| P5-03 Port Memory Match ke `games/memory-match` dengan tampilan asli | Selesai | Paket game `games/memory-match` dibuat (`@low-stress/game-memory-match`) dengan struktur terisolasi. Papan 16 kartu (8 pasangan unik dengan ikon lucide dan palet asli Porting_Guide §3), flip delay 450ms, match lock 200ms, input lock. Modul `client/sound.ts` memuat `SoundEngine` Web Audio tanpa berkas eksternal (flip, match C Major chord, misMatch sawtooth, victory arpeggio). Modul lazy client di `client/index.tsx` dengan layout tiga kolom (leaderboard, papan 4x4, aturan). Manifest dengan konfigurasi scoring dan verifikasi rumus. Skor dikirim ke server lewat `props.onScore` / `POST /api/games/memory-match/scores`. Teruji 5 tes unit komponen web di `apps/web/test/memory-match.test.tsx` dan integrasi skor ke server. |
| P5-04 UI Leaderboard (Screens §8) | Selesai | Halaman Leaderboard (`/leaderboard` di `LeaderboardPage.tsx`) dengan pemilihan game (chip interaktif), tab periode (Minggu ini, Bulan ini, Sepanjang waktu), kartu `GameLeaderboard` responsif, podium mahkota/medali, avatar inisial, penandaan pemain sendiri `(kamu)` dengan gaya `--bg-inset` dan highlight `isMe: true`. Navigasi Beranda dan Leaderboard terintegrasi di header shell. E2E teruji: pemain mengirim skor baru -> skor seketika muncul di leaderboard dan baris pemain tersorot `isMe: true`. 4 tes komponen web di `apps/web/test/leaderboard-ui.test.tsx` dan 1 tes E2E di `apps/server/test/leaderboard-e2e.test.ts`. |
| P5-05 Batas laju kirim skor dan penandaan run janggal (`flagged`) | Selesai | Rate limiting submission skor (jeda minimal 3 detik antar kirim per pemain & game, batas frekuensi `maxSubmitRatePerMin` per menit sesuai manifest) yang menolak pelanggaran dengan `429 SCORE_RATE_LIMITED`. Deteksi run tidak wajar / mencurigakan (`isSuspiciousRun`) menandai run sebagai `flagged: true` di `game_runs` tanpa memperbarui rekor `game_scores` ataupun leaderboard publik. Endpoint admin untuk moderasi run: `GET /api/admin/runs` (dengan filter `gameId`, `flagged=true/false`, pagination), alias `GET /api/admin/games/:id/runs`, `DELETE /api/admin/runs/:id` yang menghapus run dan menghitung ulang skor pemain via `recomputeGameScore` serta mencatat aksi di `audit_log`, dan `POST /api/admin/leaderboard/:gameId/reset` untuk reset leaderboard mingguan/bulanan. Teruji 6 tes unit/integrasi di `apps/server/test/admin-runs.test.ts`. |

---

## 2026-11-04 - Fase 6 (Flappy Bird)

Lingkup: Fase 6 (Flappy Bird).

### Ringkasan

| Tugas | Status | Bukti / catatan |
|---|---|---|
| P6-01 Port engine (`flappy-engine`) dengan tes unit untuk fisika, pipa, skor | Selesai | Engine `games/flappy-bird/shared/engine.ts` memporting seluruh aturan dan fisika tanpa DOM: dimensi kanvas logis 360x560 (tanah 70px, area bermain 490px), konfigurasi fisika (gravity 1500, flapVelocity -430, maxFall 640, baseSpeed 150, speedPerPoint 2, maxSpeedBonus 80, gap 150, pipeWidth 58, spacing 210, birdX 90, birdRadius 12, startY 270, gapMargin 46). Fungsi transisi `flap`, deteksi tabrakan pipa presisi lingkaran vs dua persegi panjang `hitsPipe`, langkah waktu fisika tetap `step(state, dt)` dengan pembatasan langit-langit, deteksi tabrakan tanah, pergerakan & daur ulang pipa, skor saat pipa dilewati, perputaran rotasi burung, serta kalkulasi medali `medalFor` (perunggu >= 10, perak >= 20, emas >= 30). 12 tes unit di `games/flappy-bird/test/engine.test.ts` lolos 100%. |
| P6-02 Port render Canvas 2D, 6 karakter, medali, layar Game Over, kontrol sentuh dan keyboard | Selesai | Modul `characters.ts` memuat 6 karakter (`yellow`, `red`, `blue`, `bat`, `plane`, `ghost`) dengan fungsi `drawCharacter`. Komponen `FlappyBird.tsx` mengimplementasikan render Canvas 2D 360x560 persis aslinya: langit gradasi `#4ec0ca` -> `#b6ecf2`, 4 awan melayang, bukit jauh `#9bd9a3`, pipa hijau bergradasi dengan bibir pipa, tanah `#ded895` dengan rumput bergerigi `#73bf2e`/`#9be04a`, burung dengan rotasi & animasi kepakan sayap, teks skor outlined, layar ready, layar Game Over dengan panel krem `#ded895`, slot medali radial gradient (perunggu, perak, emas) bertabur bintang, rekor pribadi, dan lencana "REKOR BARU" `#e5483a`. Kontrol pointerdown pada kanvas, tombol keyboard (Space, ArrowUp, KeyW) dengan pengecualian elemen input, penguncian restart 0.45 dtk, serta radiogroup 6 pemilih karakter dengan pratinjau kanvas mini. 5 tes unit di `games/flappy-bird/test/flappy-bird.test.tsx` lolos 100%. |
| P6-03 Skala FIT di mobile, tanpa scroll, mendukung `prefers-reduced-motion` (hilangkan kilat) | Selesai | Kelas `.ls-flappy-layout` di `packages/ui` mengimplementasikan layout mobile-first: kanvas skala FIT dengan aspek 360/560 dan lebar proporsional 100% tanpa scroll horizontal di 360x640, susunan vertikal tertata rapi (game di order-1, mini leaderboard di order-2, aturan di order-3), serta target ketuk tombol karakter memenuhi standar aksesibilitas minimum (h-11 = 44px). Di layar desktop (1280x800), tata letak berubah otomatis menjadi tiga kolom seimbang (leaderboard 280px, game kanvas 360px, aturan minmax(240px, 1fr)). Dukungan aksesibilitas `prefers-reduced-motion`: kilat putih saat tabrakan/mati dieliminasi total dan animasi kemunculan panel hasil dipermudah jika preferensi gerak rendah aktif di perangkat pengguna. 3 tes unit di `games/flappy-bird/test/responsive-motion.test.tsx` lolos 100%. |
| P6-04 Integrasi skor: run skor < 1 tidak dihitung; pilihan karakter disimpan | Selesai | Aturan skor dipertahankan persis sesuai acuan `recordScore` lama (Porting_Guide §2 & §6): run yang berakhir dengan skor 0 (burung menabrak pipa pertama atau tanah sebelum mencetak poin) tidak dihitung sebagai "play", tidak dikirim ke server oleh klien, dan diabaikan oleh `recordScore` di server (tidak menambah hitungan `plays`, tidak menyisipkan ke `game_runs`, serta tidak memperbarui rekor `game_scores`). Run dengan skor >= 1 dikirim ke `onScore` / endpoint `POST /api/games/flappy-bird/scores` dan divalidasi kewajarannya via `plausibleRun` (skor <= 500, batas waktu durasi fisika maks 2 jam, skor <= floor(durationMs / 1000 / 0.85) + 1). Preferensi karakter pemain (`yellow`, `red`, `blue`, `bat`, `plane`, `ghost`) disimpan di `localStorage` dengan kunci `cbr-flappy-character` dan dipulihkan secara otomatis saat membuka game kembali. Teruji 3 tes unit di `games/flappy-bird/test/score-integration.test.tsx` dan integrasi server di `apps/server/test/scores.test.ts`. |

### Pemeriksaan akhir

```
pnpm lint            -> lolos (0 error, 0 warning)
pnpm typecheck       -> lolos (15 workspace projects)
pnpm test            -> lolos (151 tes: flappy-bird 23, memory-match 5, server 73, web 19, sdk 19, i18n 12, ui 7, check-i18n 5, check-migrations 4, create-admin 6)
pnpm i18n:check      -> lolos (semua kunci id dan en cocok)
pnpm check:migrations-> lolos
pnpm --filter @low-stress/web build -> lolos (chunk lazy client Flappy Bird 18.47 kB, 20 entri precache PWA)
```

### Keputusan teknis agent (implementasi, bukan keputusan produk pemilik)

- Logika rendering Canvas 2D dipisahkan ke `client/render.ts` dengan penanda pengecualian `low-stress/no-raw-design-values` untuk menjaga integritas visual kanvas asli (gradasi langit, bukit, pipa hijau bertingkat, panel Game Over krem `#ded895`, dan medali berkilau) sesuai Porting_Guide §0 dan Agents.md §5.1.
- Komponen pembungkus React di `client/FlappyBird.tsx` 100% menggunakan token `@low-stress/ui` dan kelas CSS terdedikasi (`.ls-flappy-canvas`, `.ls-flappy-controls`, `.ls-flappy-char-btn`, `.ls-flappy-scores-row`) tanpa nilai mentah.
- State inisialisasi karakter dan rekor menggunakan lazy initializers React 19 (`useState(() => ...)`) untuk mencegah cascading render.
- Nilai preferensi `prefers-reduced-motion` didukung melalui pemantauan `matchMedia` dinamis serta properti opsional komponen `reducedMotion`.






