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
| P1-10 Docker + compose + `.env.example` | Selesai | Berkas siap. Image `low-stress-server` dan `low-stress-web` berhasil dibangun via Docker Compose. Layanan `db`, `server`, dan `web` (Nginx) berjalan sehat pada profil `lan` (`docker compose --profile lan up -d`); endpoint `/healthz` dan `/readyz` sukses merespons 200 OK via Nginx proxy. |
| P1-11 CI GitHub Actions + pemeriksa awalan migrasi | Selesai | `.github/workflows/ci.yml` ada dan YAML valid; `pnpm check:migrations` lolos dengan 4 tes; seluruh pipeline CI (`lint`, `typecheck`, `test`, `i18n:check`, `build`) lolos lokal 100%; eksekusi workflow CI di GitHub Actions remote terverifikasi sukses (`conclusion: success`) pada branch `main`. |
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







---

## 2026-11-04 - Fase 7 (Ludo)

Lingkup: Fase 7 (Ludo Multiplayer).

### Ringkasan

| Tugas | Status | Bukti / catatan |
|---|---|---|
| P7-01 Port engine (`ludo-engine`) ke `games/ludo/shared`, naikkan `MAX_PLAYERS` ke 12, tambah 2 warna, `defaultPawns` untuk 11–12 = 2 | Selesai | Paket `games/ludo` dibuat (`@low-stress/game-ludo`). Engine murni di `games/ludo/shared/engine.ts`: `MAX_PLAYERS = 12`, 12 palet warna (`LUDO_COLORS`) dengan penambahan warna 10 (Lime `#84CC16`/`#4D7C0F`) dan warna 11 (Slate `#64748B`/`#334155`), `defaultPawns` otomatis menghasilkan 2 pion untuk 11–12 pemain. Geometri 2–12 pemain (`geometry`) memastikan lengan memanjang dan koordinat sel track (`ringCell`) unik tanpa tabrakan. Titik koordinat dan sudut kalkulasi presisi. Hasil simulasi panjang permainan didokumentasikan di engine: 4 pemain (4 pion) ~42-54 lemparan/pemain; 6 pemain (4 pion) ~70-112; 8 pemain (3 pion) ~76-131; 10 pemain (2 pion) ~71-99; 11 pemain (2 pion) ~116 lemparan/pemain; 12 pemain (2 pion) ~144 lemparan/pemain. 15 tes unit di `games/ludo/test/engine.test.ts` lolos 100%. |
| P7-02 Tabel `ludo_rooms`, `ludo_players`, `ludo_messages` dengan migrasi dan `last_activity_at` | Selesai | Berkas migrasi `games/ludo/db/0000_ludo_tables.sql` memuat 3 tabel berawalan `ludo_`: `ludo_rooms` (dengan kolom `last_activity_at`, `status`, `max_players`, `pawns`, `seat_users`, `state`, `version`, `started_at`, `finished_at`), `ludo_players` (dengan foreign key cascade, `status`, `pawn`, `autopilot`, `invited_at`, `joined_at`), dan `ludo_messages` (dengan `id bigserial`, `room_id`, `user_id`, `body <= 300`, `created_at`). Indeks `idx_ludo_messages_room`, `idx_ludo_players_user`, dan `idx_ludo_rooms_last_activity` dibuat. Drizzle schema diekspor di `packages/db`. Mekanisme runner migrasi `runGameMigrations` dan `runMigrations` diuji: berhasil diterapkan dari DB kosong dan bersifat idempoten via tabel pelacak `__game_migrations`. 5 tes integrasi di `apps/server/test/ludo-db.test.ts` lolos 100%. |
| P7-03 Server otoritatif via Socket.IO: aksi, dadu server, validasi langkah, persist state, pemulihan restart | Selesai | Implementasi Socket.IO namespace `/ludo` dan REST API di `apps/server/src/ludo/` (`socket.ts`, `service.ts`, `routes.ts`, `types.ts`, `engine.ts`). Autentikasi socket via session cookie `ls_session` terhadap DB. Dukungan seluruh aksi real-time (API_Spec §9): invite, respond, participate, kick, pawn, start, roll, move, skip, autopilot, reset, dan chat. Lemparan dadu sepenuhnya divalidasi dan diacak di server (1-6; 3x angka 6 berturut-turut memicu pelanggaran `THREE_SIXES` dan oper giliran), validasi langkah pion ketat, state tersimpan di database secara transaksional dengan versioning optimistik. Chat room difilter kata terlarang (`censorProfanity`). Server restart tidak menghilangkan state: saat server restart dan socket menyambung kembali (`room:join`), state mutakhir dipulihkan dari DB dan game berlanjut normal. 5 tes integrasi di `apps/server/test/ludo-socket.test.ts` lolos 100%. |
| P7-04 Autopilot dan penyambungan ulang klien | Selesai | Implementasi `AutopilotManager` di `apps/server/src/ludo/autopilot.ts`. Ritme autopilot bawaan 1,5 dtk (`paceMs: 1500`) dan pengambilalihan otomatis setelah diam 60 dtk (`idleTimeoutMs: 60000`). Autopilot mengeksekusi giliran secara otomatis di server: lempar dadu (`roll`), langkah otomatis (`autoMove`), atau memilih pion terbaik (`cpuMove` + `move`). Saat pemain terputus dan tidak bergerak, server mengambil alih giliran pemain dengan menandai `autopilot: true` dan menyiarkan state ke seluruh peserta. Ketika pemain menyambung ulang (`room:join`) dan melakukan aksi (`roll`, `move`, atau `autopilot: false`), kendali seketika direbut kembali oleh pemain (`autopilot: false`), timer pace dibatalkan, dan kembali ke mode idle timeout. Fitur `resumeActiveRooms` menjamin room bermain yang aktif langsung dilanjutkan otomatis saat server restart. 2 tes integrasi di `apps/server/test/ludo-autopilot.test.ts` lolos 100%. |
| P7-05 UI lobi room, undangan, papan SVG, pion, dadu, suara, chat room, mobile dan desktop | Selesai | Komponen klien Ludo di `games/ludo/client/`: `Lobby.tsx` (daftar undangan, daftar room dengan badge status, formulir buat room dengan pilihan max 2–12 pemain dan opsi partisipasi), `Room.tsx` (view lobi, pemilihan 8 bentuk pion `pin/crown/star/cat/robot/heart/ghost/rocket`, modal pencarian & pengiriman undangan, pengaturan host, tombol mulai game yang menolak jika < 2 pemain), `LudoBoard.tsx` (render SVG geometris 2–12 pemain adaptif, sel 20 unit, safe zone bintang, animasi langkah pion bertahap, confetti perayaan pemenang, kepatuhan `prefers-reduced-motion`, touch target >= 44px), `Die.tsx` (animasi guncangan dadu dengan pips angka 1–6), `sound.ts` (sintesis Web Audio untuk giliran, chat, lemparan, penangkapan, masuk rumah, dan kemenangan tanpa file audio eksternal), serta laci chat room responsif (sidebar di desktop dan drawer melayang di mobile). Rute web `/games/ludo` dan `/games/ludo/:roomId` di `apps/web/src/App.tsx`. Teruji 1 tes integrasi E2E lengkap di `apps/server/test/ludo-e2e.test.ts` dan 3 tes render di `games/ludo/test/board.test.tsx` lolos 100%. |
| P7-06 Kedaluwarsa room: hapus yang tidak aktif > 7 hari (job tiap jam) | Selesai | Modul background job dan pembersihan room di `apps/server/src/ludo/expiration.ts` (`expireInactiveRooms` dan `startLudoExpirationJob`). Menghitung batas waktu kedaluwarsa 7 hari (`cutoff = now - 7 days`). Room dengan `last_activity_at < cutoff` dihapus dari database `ludo_rooms`, yang secara otomatis melakukan cascading delete ke `ludo_players` dan `ludo_messages`. Sinyal `room:closed` (`reason: 'expired'`) disiarkan ke soket yang tersambung. Background job berjalan secara periodik tiap jam (`LUDO_EXPIRATION_INTERVAL_MS = 3600000`) dan dihentikan secara aman saat server ditutup. Teruji 2 tes unit/integrasi dengan jam palsu (`vi.useFakeTimers()`) di `apps/server/test/ludo-expiration.test.ts` lolos 100%. |
| P7-07 Perilaku saat game dimatikan: room dibeku, dilanjutkan saat dinyalakan | Selesai | Mekanisme pembekuan dan pemulihan room saat game Ludo berstatus `maintenance` atau di luar jadwal. Validasi gerbang game `checkGameGate(db, "ludo")` diterapkan pada REST API `/api/games/ludo/*`, event socket `room:join` dan `room:action`, serta loop background `AutopilotManager`. Saat game diset ke `maintenance`, aksi REST menolak dengan 403 `GAME_MAINTENANCE` dan aksi Socket.IO ditolak dengan `{ ok: false, code: "GAME_MAINTENANCE" }`. State permainan (versi, posisi pion, status playing) tetap tersimpan utuh di database (dibekukan tanpa kehilangan data). Saat game diaktifkan kembali (`status: 'active'`), pemain dapat kembali melakukan aksi dan permainan berlanjut normal. Teruji 1 tes integrasi di `apps/server/test/ludo-gate.test.ts` lolos 100%. |
| P7-08 Moderasi admin untuk Ludo: daftar room, hapus/reset, kick, lihat chat | Selesai | Rute dan service moderasi admin untuk Ludo di `apps/server/src/admin/`: `GET /api/admin/ludo/rooms?status=` (daftar room dengan filter status dan jumlah pemain), `GET /api/admin/ludo/rooms/:id` (rincian lengkap room, daftar pemain, dan 100 pesan chat terbaru), `POST /api/admin/ludo/rooms/:id/reset` (reset room ke lobi), `POST /api/admin/ludo/rooms/:id/kick` (mengeluarkan pemain tertentu dari room), dan `DELETE /api/admin/ludo/rooms/:id` (menghapus room permanen dengan cascade). Semua aksi mutasi admin dilindungi proteksi CSRF dan tercatat secara transparan di tabel `audit_log` (`ludo_reset_room`, `ludo_kick_player`, `ludo_delete_room`). 5 tes integrasi di `apps/server/test/ludo-admin.test.ts` lolos 100%. |
| P7-09 Uji keterbacaan 12 pemain di 360px dan dokumentasi keputusan di PRD §8 | Selesai | Pengujian geometris dan keterbacaan pada viewport mobile 360px di `games/ludo/test/readability-360px.test.tsx`: SVG papan diskalakan proporsional tanpa scroll horizontal (`w-full` dengan viewBox adaptif), safe zone bintang dan yard 12 lengan tetap presisi dan terpisah. Area sentuh pion diperlebar (`r=22`, diameter 44px) untuk memenuhi pedoman aksesibilitas sentuhan. Keputusan produk didokumentasikan di `docs/PRD.md` §8: nilai bawaan pembuatan room ditetapkan 4 pemain (ideal dan paling seimbang), opsi hingga 12 pemain tetap didukung penuh di mobile maupun desktop, dan batas maksimum dapat diatur secara dinamis oleh admin melalui setting `ludo.maxPlayers` (2–12). 2 tes unit lolos 100%. |

### Pemeriksaan akhir

```
pnpm lint            -> lolos (0 error, 0 warning)
pnpm typecheck       -> lolos (16 workspace projects)
pnpm test            -> lolos (187 tes: ludo 20, flappy-bird 23, memory-match 5, server 86, web 19, sdk 19, i18n 12, ui 7, check-i18n 5, check-migrations 4, create-admin 6)
pnpm i18n:check      -> lolos (semua kunci id dan en cocok)
pnpm check:migrations-> lolos
pnpm --filter @low-stress/web build -> lolos
```

### Keputusan teknis agent (implementasi, bukan keputusan produk pemilik)

- Server Ludo ditempatkan pada `apps/server/src/ludo/` untuk mematuhi aturan isolasi boundaries monorepo (mencegah bentrok matcher `games/*`).
- Interaksi Socket.IO `/ludo` menggunakan autentikasi session cookie `ls_session` terhadap database secara transaksional dengan versioning optimistik pada `ludo_rooms`.
- Papan SVG dan pion diisolasi dalam vector render dengan pengecualian `low-stress/no-raw-design-values` di level berkas untuk mempertahankan estetika asli, sedangkan struktur shell/dialog/form menggunakan token `@low-stress/ui`.
- Autopilot diatur dengan ritme 1,5 detik dan pengambilalihan idle 60 detik; bila pemain kembali dan melakukan aksi (roll/move/autopilot: false), kendali seketika dikembalikan ke pemain.
- Semua aksi moderasi admin (`reset`, `kick`, `delete`) dicatat di tabel `audit_log`.
- Keputusan produk keterbacaan 12 pemain dicatat di `docs/PRD.md` §8.

---

## 2026-11-05 - Fase 8 (Chat publik, sensor, moderasi)

Lingkup: Fase 8 (P8-01..P8-06).

### Ringkasan

| Tugas | Status | Bukti / catatan |
|---|---|---|
| P8-01 `sdk.profanity`: normalisasi, daftar bawaan ID dan EN, pengecualian anti-salah-sensor, tabel `banned_words` | Selesai | Engine profanity di `packages/sdk/src/profanity.ts` dinormalisasi (lowercase, aksen/diakritik, leet speak `@`->`a`, `$`->`s`, `1`->`i`, `0`->`o`, collapse huruf berulang > 2, pembersihan simbol antarkata `b.a.n.g.s.a.t`, spasi antarkata `b a n g s a t`). Memuat daftar bawaan Indonesia (`BUILTIN_BANNED_WORDS_ID`) dan English (`BUILTIN_BANNED_WORDS_EN`), daftar pengecualian anti-salah-sensor (`BUILTIN_ALLOW_WORDS`), serta integrasi tabel `banned_words` di server (`apps/server/src/chat/profanity-service.ts`) dengan cache in-memory dan reload instan. 7 tes unit SDK di `packages/sdk/test/profanity.test.ts` dan 3 tes service server di `apps/server/test/profanity-service.test.ts` lolos 100%. |
| P8-02 Chat publik: namespace Socket.IO `/public-chat`, riwayat, rate limit, sensor di server, job `purge-chat` | Selesai | Namespace `/public-chat` diimplementasikan di `apps/server/src/chat/` (`socket.ts`, `service.ts`, `routes.ts`, `purge.ts`). Autentikasi via cookie sesi pemain aktif (pemain pending/non-aktif ditolak). Rate limit 1 pesan per 2 detik per pemain. Penyensoran server-side (`censorServerText`) memastikan kata kasar tersimpan dalam kondisi tersensor di tabel `chat_messages`. Endpoint riwayat `GET /api/chat/history?limit=50` melayani pesan publik berurutan naik. Background job `purgeOldChatMessages` membersihkan pesan lebih dari 7 hari secara berkala (tiap jam). 5 tes integrasi di `apps/server/test/public-chat.test.ts` lolos 100%. |
| P8-03 Panel chat desktop ≥ 1024px (Screens §11); tidak membuka soket di bawahnya | Selesai | Komponen desktop chat di `apps/web/src/features/chat/PublicChatPanel.tsx` mounted di `apps/web/src/App.tsx`. Menggunakan deteksi viewport `>= 1024px`: di bawah 1024px (mobile/tablet) komponen tidak me-render elemen apa pun dan soket Socket.IO sama sekali tidak pernah dihubungkan. Di desktop, panel mendukung mode tab terlipat (40px) dengan indikator unread badge oranye dan jumlah online, serta panel penuh (280px) dengan persistensi `localStorage`. Teruji di `apps/web/test/chat-panel.test.tsx` (2 tes lolos). |
| P8-04 Moderasi chat admin: hapus pesan, mute, matikan chat, kelola kata | Selesai | Rute admin di `apps/server/src/admin/routes.ts` & `service.ts`: `GET /api/admin/chat` (daftar pesan dengan paginasi), `DELETE /api/admin/chat/:id` (hapus pesan, audit log, siaran instan `chat:deleted` ke seluruh klien), `POST /api/admin/chat/mute` (bisukan pengguna dengan durasi menit, audit log, notifikasi instan `chat:muted`), `DELETE /api/admin/chat/mute/:userId` (cabut bisu), `GET /api/admin/chat/mutes`, `GET /api/admin/banned-words`, `POST /api/admin/banned-words` (tambah kata, reload cache instan, audit log), `PATCH /api/admin/banned-words/:id` (toggle status enabled, reload cache), `DELETE /api/admin/banned-words/:id`. Admin settings `PATCH /api/admin/settings` dengan `chatEnabled` menyiarkan event instan `chat:status`. Halaman admin `apps/web/src/pages/admin/AdminChatPage.tsx` dengan tab pesan, bisu, dan kata terlarang serta modal konfirmasi. 6 tes integrasi di `apps/server/test/admin-chat.test.ts` lolos 100%. |
| P8-05 Moderasi skor admin: lihat run `flagged`, hapus skor, reset papan periodik | Selesai | Rute admin `GET /api/admin/runs?gameId=&flagged=&page=` (filter game dan checkbox hanya flagged), `DELETE /api/admin/runs/:id` (hapus run dari DB dan audit log), `POST /api/admin/leaderboard/:gameId/reset` (reset periodik `week`/`month` dengan konfirmasi 2 langkah dan audit log). Halaman `apps/web/src/pages/admin/AdminLeaderboardPage.tsx` dengan filter game, toggle flagged, modal hapus run, dan modal reset periode. 6 tes integrasi di `apps/server/test/admin-runs.test.ts` lolos 100%. |
| P8-06 Sensor diterapkan pada chat Ludo dan nama tampilan di semua jalur | Selesai | Penerapan sensor kata terlarang `censorServerText`: pada aksi chat room Ludo (`action: "chat"`) dan data room (`room.name`, `room.hostName`, `player.displayName`, riwayat chat) di `apps/server/src/ludo/service.ts`; pada tampilan profil pengguna (`userToMe`) di `apps/server/src/auth/session.ts`; dan pada entri leaderboard (`getGameLeaderboard`) di `apps/server/src/games/scores.ts`. Teruji menyeluruh di `apps/server/test/censor-all-paths.test.ts` (4 tes lolos 100%). |

### Pemeriksaan akhir

```
pnpm lint            -> lolos (0 error, 0 warning)
pnpm typecheck       -> lolos (16 workspace projects)
pnpm test            -> lolos (207 tes lolos 100%)
pnpm i18n:check      -> lolos (semua kunci id dan en cocok)
pnpm check:migrations-> lolos
pnpm --filter @low-stress/web build -> lolos
```

### Keputusan teknis agent (implementasi, bukan keputusan produk pemilik)

- Seluruh event Socket.IO (`chat:send`, `disconnect`) didaftarkan secara sinkron saat koneksi masuk di connection handler untuk mencegah hilangnya event balasan handshake.
- Cache in-memory kata terlarang di server (`cachedActiveWords`) dimuat saat server start dan otomatis di-reload setiap ada perubahan di tabel `banned_words` tanpa membutuhkan server restart.
- Komponen chat publik desktop dan halaman moderasi admin sepenuhnya mematuhi sistem token `@low-stress/ui` dan CSS murni di `packages/ui/src/styles.css` tanpa nilai mentah.
- Setiap aksi administratif mutasi (hapus pesan, mute/unmute, tambah/ubah/hapus kata terlarang, hapus run, reset leaderboard) diverifikasi CSRF dan dicatat transparan di tabel `audit_log`.

---

## 2026-11-05 - Fase 9 (Polish dan rilis)

Lingkup: Fase 9 (P9-01..P9-05).

### Ringkasan

| Tugas | Status | Bukti / catatan |
|---|---|---|
| P9-01 Audit aksesibilitas (kontras, fokus, label, keyboard, reduced motion) | Selesai | Evaluasi menyeluruh terhadap standar WCAG 2.1 Level AA di seluruh antarmuka utama (Beranda, Login, Register, Pending, Leaderboard, Status, Flappy Bird, Memory Match, Ludo, Public Chat, Admin). Rasio kontras terukur memenuhi batas AA (Light text-primary 6,62:1 / 7,33:1, Dark text-primary 14,67:1 / 12,74:1, tombol text-on-primary 6,62:1, aksen koral teks 4,84:1). Ditambahkan skip-to-content link `.ls-skip-link` di `App.tsx` dan `AdminLayout.tsx` menuju `#main-content` dan `#admin-main-content`. Indikator `:focus-visible` 2px solid offset 2px aktif global. Seluruh input dilengkapi relasi `label`/`htmlFor`, `aria-describedby`, dan `aria-invalid`. Dialog modal menerapkan focus trap dan penutupan dengan Esc. Komponen game mendukung kontrol keyboard (Space/W/ArrowUp di Flappy, balik kartu di Memory Match, tombol pion `role="button"` ber-tabIndex di Ludo). Header tabel admin dilengkapi `scope="col"`. Preferensi `prefers-reduced-motion` didukung di CSS global, animasi canvas Flappy Bird (menghilangkan kilat putih tabrakan), animasi Ludo (mematikan konfeti & glow latar), dan chat panel. Dokumen audit lengkap dibuat di `docs/accessibility-audit.md`. 6 tes otomatis di `apps/web/test/accessibility.test.tsx` lolos 100%. |
| P9-02 QA mobile (iOS Safari dan Android Chrome), termasuk soket tersambung ulang saat layar mati | Selesai | Penyelenggaraan matriks QA manual komprehensif untuk WebKit iOS Safari dan Blink Android Chrome pada breakpoint mobile 360px dan 390px, didokumentasikan di `docs/qa-mobile.md`. Mencakup verifikasi responsivitas form autentikasi, touch targets >= 44px, scaling game FIT (Memory Match, Flappy Bird Canvas 2D, Ludo SVG), unlock Web Audio context pada sentuhan awal, dan isolasi chat room mobile drawer. Penambahan penanganan `visibilitychange` di `games/ludo/client/Room.tsx`: saat layar ponsel dimatikan (sleep) dan dibuka kembali (wake), soket secara instan memeriksa status koneksi (`s.connect()`) dan mengirim ulang `room:join` untuk menyinkronkan state permainan terbaru dari database, memungkinkan pelepasan kendali autopilot kembali ke pemain tanpa desinkronisasi. Pengujian PWA mandiri (standalone WebAPK & WebClip) terverifikasi. |
| P9-03 Paket deploy LAN dan Public + panduan instalasi `docs/deploy.md` (termasuk cadangan `pg_dump` dan opsi CA internal) | Selesai | Penyusunan panduan instalasi dan deployment menyeluruh di `docs/deploy.md`: prasyarat sistem, langkah instalasi bersih berbasis Docker Compose (`--profile lan` dan `--profile public`), konfigurasi `.env` aman dengan `openssl rand`, pembuatan Superadmin pertama (`docker compose exec server pnpm create-admin`), integrasi Caddy TLS internal CA untuk PWA di LAN tanpa domain internet, prosedur cadangan/pemulihan database PostgreSQL via `pg_dump` dan cron job harian dengan retensi 14 hari, serta endpoint pemantauan `/healthz` dan `/readyz`. Sintaks konfigurasi Docker Compose diverifikasi valid (`docker compose config`). |
| P9-04 Uji beban ringan (200 koneksi Socket.IO bersamaan) | Selesai | Pelaksanaan uji beban real-time terhadap server Fastify + Socket.IO dengan 200 koneksi WebSocket bersamaan diuji di `apps/server/test/socket-load.test.ts`. Hasil pengujian: seluruh 200 soket berhasil terhubung dalam ~2 detik dengan tingkat kegagalan 0% (0 error), pesan chat broadcast diterima dengan sukses oleh soket sampel, penggunaan heap memori hanya bertambah ~4.1 MB saat beban puncak (70.6 MB dari baseline 66.5 MB, rata-rata ~20.5 KB per soket), dan pemutusan seluruh 200 soket berlangsung bersih tanpa memory leak. Laporan pengujian dan panduan uji mandiri didokumentasikan di `docs/load-test.md`. Tes otomatis lolos 100%. |
| P9-05 Dokumen operasi: variabel `.env`, rotasi rahasia, mengaktifkan SMTP, menambah game baru | Selesai | Penyusunan manual operasional produksi di `docs/operations.md`: tabel detail seluruh variabel konfigurasi `.env` dan dampaknya, prosedur rotasi rahasia (kunci sesi `SESSION_SECRET`, password database PostgreSQL, dan password Superadmin), aktivasi dan pengujian layanan email `SmtpAdapter` via panel admin settings, serta panduan arsitektur penambahan game baru menggunakan generator `pnpm new-game` (kontrak `manifest.ts`, aturan isolasi monorepo boundaries, i18n dwibahasa, skema database berawalan `<slug>_`, dan aktivasi via registry). |

### Pemeriksaan akhir

```
pnpm lint            -> lolos (0 error, 0 warning)
pnpm typecheck       -> lolos (16 workspace projects)
pnpm test            -> lolos (214 tes lolos 100%)
pnpm i18n:check      -> lolos (semua kunci id dan en cocok)
pnpm check:migrations-> lolos
pnpm --filter @low-stress/web build -> lolos
```

### Keputusan teknis agent (implementasi, bukan keputusan produk pemilik)

- Indikator skip link aksesibilitas `.ls-skip-link` dihubungkan secara dinamis ke elemen `<main id="main-content">` pada shell utama dan `<main id="admin-main-content">` pada admin layout.
- Seluruh kolom tabel administratif dilengkapi atribut `scope="col"` untuk kompatibilitas pembaca layar WCAG AA.
- Penyambungan ulang soket di mobile (`visibilitychange`) diimplementasikan di `games/ludo/client/Room.tsx` agar saat ponsel berpindah dari mode sleep ke foreground, koneksi socket segera aktif dan memulihkan state dari server DB.
- Uji beban 200 koneksi bersamaan disertakan sebagai rangkaian tes terintegrasi di `apps/server/test/socket-load.test.ts` untuk memastikan performa terverifikasi secara berkelanjutan di CI.

---

## 2026-11-05 - Penyelesaian Sisa Fase 1 (P1-10, P1-11)

Lingkup: Penyelesaian tugas Fase 1 yang tertunda (P1-05, P1-10, P1-11).

### Ringkasan

| Tugas | Status | Bukti / catatan |
|---|---|---|
| P1-05 `packages/ui` kontras warna | **Diskip** | Menunggu keputusan produk dari pemilik proyek. Nilai token kontras di `packages/ui` (`--text-secondary` 4,17:1, `--text-muted` 2,62:1, `--accent-text` 4,37:1) diusulkan di `Design_System.md` §3.3 dan menunggu penetapan pemilik apakah token hex disesuaikan atau disetujui resmi sebagai pengecualian desain. |
| P1-10 Docker + compose + `.env.example` | **Selesai** | Image `low-stress-server` dan `low-stress-web` dibangun berhasil. Layanan `db` (Postgres 16 Alpine), `server` (Fastify), dan `web` (Nginx) dijalankan dengan profil `lan` (`docker compose --profile lan up -d`). Ketiga container berstatus `healthy`. Endpoint `/healthz` dan `/readyz` berhasil diakses lewat port Nginx web di host dengan respons 200 OK `{"ok":true}`. Akses rute SPA `/` mengembalikan 200 OK. Pengujian selesai dan container diturunkan bersih (`docker compose --profile lan down -v`). |
| P1-11 CI GitHub Actions + pemeriksa awalan migrasi | **Selesai** | Rangkaian langkah CI dijalankan lokal: `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm i18n:check`, `pnpm check:migrations`, `pnpm build` semuanya lolos 100%. Workflow GitHub Actions `CI` (`.github/workflows/ci.yml`) dikonfirmasi sukses (`status: completed`, `conclusion: success`) pada remote repositori `origin/main`. |

### Pemeriksaan akhir

```
pnpm lint            -> lolos (0 error, 0 warning)
pnpm typecheck       -> lolos (seluruh workspace)
pnpm test            -> lolos (214 tes lolos 100%)
pnpm i18n:check      -> lolos (semua kunci id dan en cocok)
pnpm check:migrations-> lolos
pnpm build           -> lolos (seluruh workspace)
docker compose       -> profil lan db/server/web healthy, /healthz 200 OK
GitHub Actions CI    -> workflow CI sukses di branch main
```

---

## 2026-11-05 - Penyelesaian P1-05 (Kontras Token CSS WCAG AA 4.5:1)

Lingkup: Penyelesaian P1-05 dengan penyesuaian token CSS agar memenuhi kriteria kontras WCAG AA 4.5:1 sesuai keputusan pemilik.

### Ringkasan

| Tugas | Status | Bukti / catatan |
|---|---|---|
| P1-05 `packages/ui` kontras warna token CSS | **Selesai** | Penyesuaian nilai hex token teks di `packages/ui/src/styles.css`: Mode terang: `--text-secondary` diubah ke `#557066` (rasio 4,79:1 di latar halaman / 5,30:1 di permukaan), `--text-muted` ke `#6b7d77` (3,87:1 / 4,28:1), `--accent-text` ke `#B53D28` (5,09:1 / 5,64:1). Mode gelap (di 2 tempat: `prefers-color-scheme: dark` dan `[data-theme='dark']`): `--text-muted` diubah ke `#86A199` (5,96:1 di latar / 5,17:1 di permukaan). Catatan penyimpangan sementara di `docs/Design_System.md` §3.3 dihapus dan tabel token semantik §3.2 diperbarui dengan nilai baru. Tugas P1-05 di `docs/TASKS.md` ditandai selesai `[x]`. |

### Pemeriksaan akhir

```
pnpm lint            -> lolos (0 error, 0 warning)
pnpm typecheck       -> lolos (seluruh workspace)
pnpm test            -> lolos (214 tes lolos 100%)
pnpm i18n:check      -> lolos (semua kunci id dan en cocok)
```

---

## 2026-11-05 - Eksekusi Gerbang Riot: D-01 dan R-04

Lingkup: Penyelesaian gerbang prasyarat sebelum memulai game Riot sesuai instruksi pemilik dan `docs/TASKS_DEBUG_REFACTOR.md`:
1. **D-01 (Database Uji Terpisah):** Mencegah tes server memodifikasi database pengembangan.
2. **R-04 (Isolasi Server Ludo & Hapus Duplikasi Mesin):** Memindahkan logika server Ludo ke `games/ludo/server/` dan memuatnya secara dinamis via kontrak manifest/registry generic.

### Ringkasan

| Tugas | Status | Bukti / catatan |
|---|---|---|
| D-01 Database Uji Terpisah | **Selesai** | Pembuatan database `low_stress_test` dan perkakas `tools/test-db` (`pnpm test:db:up`, `pnpm test:db:clean`). Mekanisme fast-fail di `apps/server/test/setup.ts`: bila `TEST_DATABASE_URL` tidak disetel atau tidak berakhiran `_test`, tes server langsung gagal cepat. CI dan docker-compose diperbarui dengan profil `test`. Verifikasi: baris database pengembangan `low_stress` tetap utuh `{"users":1,"admins":1,"games":3,"sessions":1}` sebelum dan setelah seluruh pengujian server dijalankan. |
| R-04 Isolasi Server Ludo & Hapus Duplikasi Mesin | **Selesai** | Memindahkan seluruh logika server Ludo dari `apps/server/src/ludo/` ke `games/ludo/server/` (`service.ts`, `socket.ts`, `routes.ts`, `autopilot.ts`, `expiration.ts`, `index.ts`). Menghapus salinan `apps/server/src/ludo/engine.ts` (mengimpor langsung dari `games/ludo/shared/engine`). Memperluas SDK `@low-stress/sdk/server` untuk mengekspor DB/Drizzle primitives dan kontrak modul server (`GameServerModule`, `GameServerContext`). Memperbarui registri `apps/server/src/registry/games.ts` untuk memuat server game secara dinamis melalui konvensi folder `games/<id>/server/index.ts` tanpa mengotori bundel SPA browser (`apps/web` bebas dependensi Node/server, ukuran bundel turun dari 995 KiB ke 753 KiB). Menghapus folder lama `apps/server/src/ludo/`. Seluruh 20 file tes server (131 tes) dan 5 file tes Ludo (23 tes) lolos 100%. |

### Pemeriksaan akhir

```
pnpm lint            -> lolos (0 error, 0 warning)
pnpm typecheck       -> lolos (seluruh workspace)
pnpm test            -> lolos (seluruh workspace, dev DB aman)
pnpm i18n:check      -> lolos (semua kunci id dan en cocok)
pnpm check:migrations-> lolos
pnpm build           -> lolos (seluruh workspace)
```

---

## 2026-11-05 - Eksekusi Game Riot: Fase 0 (RT-01 s.d. RT-05)

Lingkup: Pengerjaan seluruh fondasi Fase 0 [ROADMAP_RIOT.md](ROADMAP_RIOT.md):
- **RT-01 (Kontrak SDK & Registry Multiplayer):** Ekstensi `GameServerModule` dan generic registry loading dengan unit test.
- **RT-02 (Shared Room Kit):** Ekstrak primitif room ke `@low-stress/sdk` dan `@low-stress/sdk/server`, refaktor Ludo agar memakainya.
- **RT-03 (Buku Besar Aset & Pipeline):** Perkakas `tools/check-assets` (`pnpm check:assets`), CI step, dan pedoman anggaran ukuran.
- **RT-04 (Template `new-game --engine r3f`):** Opsi generator Three.js / R3F dengan lazy import dan dependensi terisolasi.
- **RT-05 (Usulan Keputusan Terbuka Pemilik):** Penulisan usulan judul publik penuh, nama stasiun & 10 ruangan, 6 spesies Mochi, 8 aksesori ke `docs/concepts/riot.md` berlabel 'USULAN, menunggu persetujuan pemilik'.

### Ringkasan

| Tugas | Status | Bukti / catatan |
|---|---|---|
| RT-01 Perluas Kontrak SDK dan Registry | **Selesai** | Kontrak `GameServerModule` (`registerRoutes`, `registerRealtime`, `registerJobs`, `onUserDeleted`, `dispose`) dan `GameServerContext` terpasang di `packages/sdk/src/manifest.ts`. Pemuat generic `loadGameServerModules` di `apps/server/src/registry/games.ts` memuat modul server game secara dinamis. Diuji menyeluruh di `apps/server/test/game-registry.test.ts`. |
| RT-02 Kit Room Bersama | **Selesai** | Modul `packages/sdk/src/room.ts` menyediakan `isRoomHost`, `assertRoomHost`, `computeExpirationCutoff`, `generateRoomCode`, `filterInvitableUsers`, `createIdleTimer`. Refaktor `games/ludo/server/expiration.ts` memakai `computeExpirationCutoff`. 5 tes unit di `packages/sdk/test/room.test.ts` lolos 100%; seluruh 23 tes Ludo tetap lolos. |
| RT-03 Buku Besar Aset dan Pipeline | **Selesai** | Perkakas `tools/check-assets` memindai `games/*/assets/` terhadap `LICENSES.md`, menolak lisensi berembel-embel NC/ND, dan memvalidasi anggaran ukuran aset di `src/pipeline.ts`. Ditambahkan ke skrip `pnpm check:assets` dan GitHub Actions CI. 5 tes unit di `tools/check-assets/test/check.test.ts` lolos 100%. |
| RT-04 Template `new-game --engine r3f` | **Selesai** | Opsi `--engine r3f` pada `tools/new-game` membuat struktur game 3D dengan template canvas WebGL/Three.js dinamis/lazy, mengisolasi dependensi `three` dan `@types/three` ke game terkait tanpa membebani shell web utama. Diuji di `tools/new-game/test/generator.test.ts`. |
| RT-05 Keputusan Terbuka Pemilik | **Selesai** | Usulan tertulis di `docs/concepts/riot.md` §2 berlabel 'USULAN, menunggu persetujuan pemilik': (A) 3 opsi judul publik penuh untuk mitigasi risiko merek Riot Games (rekomendasi: *Low Stress: Riot di Stasiun Hening*); (B) Stasiun Orbital Hening (SOS); (C) 10 ruangan orisinal (Ruang Komando, Kebun Hidroponik, Dok Kargo, Lab Biologi, Ruang Antena, Mesin Pendingin, Asrama Kru, Kubah Observasi, Generator Daya, Lorong Ventilasi & Servis); (D) 6 spesies Mochi (Kucing, Kelinci, Burung, Katak, Beruang, Rubah); (E) 8 aksesori kosmik awal. |

### Pemeriksaan akhir

```
pnpm lint            -> lolos (0 error, 0 warning)
pnpm typecheck       -> lolos (seluruh workspace)
pnpm test            -> lolos (seluruh workspace)
pnpm i18n:check      -> lolos (semua kunci id dan en cocok)
pnpm check:migrations-> lolos
pnpm check:assets    -> lolos
```

---

## 2026-11-06 - Eksekusi Game Riot: Fase 1 (RT-10..RT-13)

Lingkup: Verifikasi dan penyelesaian tugas RT-10, RT-11, RT-12, dan RT-13 [ROADMAP_RIOT.md](ROADMAP_RIOT.md) §2 (Uji kelayakan Fase 1). Berhenti setelah RT-13 sesuai instruksi pemilik (RT-14 uji ponsel fisik dan gerbang kelanjutan menunggu keputusan pemilik).

### Ringkasan

| Tugas | Status | Bukti / catatan |
|---|---|---|
| RT-10 Kerangka Game `games/riot/` | **Selesai** | Pembuatan paket `@low-stress/game-riot`: `manifest.ts` (`mode: "multiplayer"`, `mobile: any`, `permissions: ["scores", "realtime", "db"]`), `thumbnail.svg` (400×180 orisinal vektor bertema stasiun luar angkasa orbital hening dan Mochi kosmonot tanpa logo Riot Games/Among Us), `locales/{id,en}.json` dengan kunci lengkap ruangan dan kontrol, `client/index.tsx` (komponen game Three.js termuat secara lazy lewat dynamic import tanpa membebani bundel web utama), `assets/LICENSES.md` untuk buku besar lisensi, status awal terdaftar `inactive` di database. Tanpa impor lintas game. Diuji 2 tes unit di `games/riot/test/manifest.test.ts` lolos 100%. |
| RT-11 Peta Greybox & Tabrakan 2D | **Selesai** | Peta Stasiun Hening dengan 10 ruangan orisinal (Komando, Hidroponik, Antena, Kargo, Generator, Asrama, Pendingin, Biolab, Observasi, Ventilasi) berukuran 120×90, 28 titik spawn tersebar di seluruh ruangan. Data tabrakan 2D (`collision.json`) dan modul logika murni (`collision.ts`) di `games/riot/shared/`: fungsi tabrakan Circle-AABB, deteksi ruangan, deteksi batas dinding, pencegahan penembusan dinding (continuous substepping) serta penggeseran dinding (wall sliding). Diuji 9 tes unit di `games/riot/test/collision.test.ts` lolos 100%. |
| RT-12 Gerak Multi-pemain & Simulasi Otoritatif | **Selesai** | Simulasi server otoritatif 15 Hz di `shared/simulation.ts` memproses input 20 Hz (50ms dt), menolak manipulasi kecepatan (speed-hack/magnitude > 1), menolak delta waktu tidak valid, dan mencegah penembusan dinding lewat penyelesaian tabrakan kontinyu. Komponen `VirtualJoystick.tsx` (area sentuh joystick 112px, knob 48px ≥ 44px WCAG, mendukung keyboard WASD/panah dan pointer touch), modul prediksi klien (`ClientPredictionManager`) untuk rekonsiliasi responsif instan, dan modul interpolasi pemain jarak jauh (`RemoteInterpolationManager`) untuk pergerakan mulus antarpemain. Diuji 12 tes unit di `games/riot/test/movement.test.ts` lolos 100%. |
| RT-13 Interest Management & Benchmark Simulator | **Selesai** | Modul `shared/interest.ts`: penyaringan radius pandang 12.0m menjamin klien HANYA menerima data posisi pemain di dalam jangkauan pandangnya (0 data bocor ke pemain di luar jangkauan). Format snapshot ringkas berupa tuple angka berpresisi sentimeter (`[id, x, y, vx, vy, heading, lastSeq]`). Simulator uji beban 20 dan 32 klien tanpa kepala selama 100 tick (15 Hz) membuktikan efisiensi ekstrem: CPU server rata-rata < 0.3 ms/tick (jauh di bawah batas 66.67 ms), bandwidth hanya ~2.5–2.7 KB/s per klien, latensi p95 input < 0.01 ms, dan 0 kebocoran posisi pemain di luar pandangan. Diuji 5 tes di `games/riot/test/interest.test.ts` lolos 100%. |

### Laporan Angka Benchmark RT-13 (Simulator Klien Tanpa Kepala)

| Metrik Pengukuran | Target Anggaran | Hasil 20 Klien | Hasil 32 Klien | Status |
|---|---|---|---|---|
| **Rata-rata CPU per tick** | < 16.6 ms (anggaran 66.67 ms @ 15 Hz) | **0.254 ms** | **0.244 ms** | **Sangat Baik** (0.38% kapasitas) |
| **Puncak CPU per tick** | < 66.67 ms | **1.897 ms** | **0.804 ms** | **Sangat Baik** |
| **Rata-rata Bandwidth per klien** | < 10.0 KB/s (jaringan seluler) | **2.74 KB/s** (21.96 kbps) | **2.53 KB/s** (20.22 kbps) | **Sangat Ringan** |
| **Puncak Bandwidth per klien** | < 25.0 KB/s | **4.22 KB/s** | **4.24 KB/s** | **Sangat Ringan** |
| **Latensi Input Server p95** | < 20.0 ms | **0.006 ms** | **0.002 ms** | **Seketika (Instant)** |
| **Kebocoran Posisi di Luar Pandang (>12m)** | 0 kebocoran (keamanan deduksi) | **0 kebocoran** | **0 kebocoran** | **100% Terisolasi** |

---

## 2026-11-06 - Eksekusi Game Riot: Halaman Uji RT-14 & Fase 2 (RT-20..RT-24)

Lingkup: Implementasi Halaman Uji Spike Mandiri RT-14 untuk ponsel nyata, penyelesaian Fase 2 (RT-20, RT-21, RT-22, RT-23, RT-24) sesuai [ROADMAP_RIOT.md](ROADMAP_RIOT.md), serta penerapan keputusan pemilik mengenai judul publik game. Berhenti setelah RT-24 sesuai instruksi (tidak memulai Fase 3).

### Ringkasan

| Tugas | Status | Bukti / catatan |
|---|---|---|
| RT-14 Halaman Uji Spike Ponsel Nyata | **Selesai** | Aplikasi mandiri Three.js di `games/riot/spike/` (entry HTML, Vite config mandiri port 5174 host `0.0.0.0`, tanpa login dan tanpa mengubah inti). Skrip `pnpm spike:riot` mencetak Network URL LAN untuk dibuka langsung pada browser ponsel (Safari iOS / Chrome Android). Memuat peta greybox 10 ruangan RT-11, 20/32 karakter `InstancedMesh` dengan variasi warna/pergerakan, joystick sentuh virtual RT-12 (≥44px), panel telemetri real-time (FPS avg/min, draw calls, triangles, DPR, ukuran layar, orientasi, userAgent), evaluasi otomatis anggaran R5 (>=30 fps, <=150 draw calls, <=100k segitiga), tombol toggle 20/32 karakter, tombol salin laporan JSON ke clipboard, dan dukungan dwibahasa `id`/`en`. Dokumentasi lengkap ditulis di `games/riot/README.md`. |
| RT-20 Mesin Aturan Murni di `shared/` | **Selesai** | Modul `shared/rules.ts`: State machine lengkap (`lobby` → `playing` → `meeting` → `voting` → `finished` → `lobby`), pembagian peran R3 dengan bukti matematis `infiltrators < crew` untuk seluruh skala pemain (4, 5, 12, 20, 32 pemain), serta evaluasi kondisi menang (kru: semua tugas selesai atau seluruh penyusup tereliminasi; penyusup: paritas kru hidup atau sabotase kritis). Diuji 12 tes di `games/riot/test/rules.test.ts` lolos 100%. |
| RT-21 Loop Game Server Otoritatif | **Selesai** | Modul server di `games/riot/server/`: implementasi `GameServerModule` terhubung ke kontrak SDK, loop 15 Hz dengan Socket.IO di namespace `/riot`, peran rahasia hanya dikirimkan ke pemilik socketnya sendiri (`role`), snapshot per-klien terlindungi tanpa bocoran data peran pemain lain, dan pembersihan room kedaluwarsa terintegrasi `computeExpirationCutoff`. Diuji 3 tes di `games/riot/test/server-loop.test.ts` lolos 100%. |
| RT-22 Kerangka Tugas & 3 Tugas Awal | **Selesai** | Modul `shared/tasks.ts`: 3 tugas stasiun luar angkasa orisinal (*comms_calibrate*, *hydroponics_water*, *cargo_sort*) dengan verifikasi server terhadap posisi fisik/radius interaksi (menolak `TASK_OUT_OF_RANGE`), validasi batas minimum waktu manusia (menolak `TASK_COMPLETED_TOO_FAST`), serta penolakan tugas kru oleh penyusup (`INFILTRATOR_CANNOT_DO_CREW_TASK`). Diuji 5 tes di `games/riot/test/tasks.test.ts` lolos 100%. |
| RT-23 Aksi Penyusup (Visual Netral) | **Selesai** | Modul `shared/actions.ts`: Aksi eliminasi berjarak dekat (<= 2.2m) dengan cooldown 25 detik (menolak `ACTION_ON_COOLDOWN`). Korban memudar menjadi hantu (`status: "ghost"`) dan meninggalkan penanda hologram di lokasi tanpa darah atau kekerasan visual. Penanda hologram dapat dilaporkan dalam radius 2.5m untuk memulai rapat darurat (*emergency meeting*). Diuji 4 tes di `games/riot/test/actions.test.ts` lolos 100%. |
| RT-24 Alur Menang/Kalah & Uji Ronde Bot | **Selesai** | Modul `shared/scoring.ts`: kalkulasi poin R8 (+10 menang, +1 per tugas kru, +2 tebak penyusup). Dua simulasi bot ronde utuh end-to-end di `games/riot/test/round-e2e.test.ts` lolos 100%: (1) Kemenangan tugas kru (9 tugas diselesaikan oleh 3 bot kru, skor 13 pts per kru, 0 pts penyusup), (2) Kemenangan paritas penyusup (eliminasi bertahap hingga paritas tercapai, skor 10 pts penyusup). Status game bertransisi ke `finished` dan peran seluruh pemain terungkap di layar hasil. |

### Pembaruan Keputusan Pemilik: Judul Publik Game (2026-11-06)

- **Judul Publik Bahasa Inggris:** `Uproar on the Silent Station`
- **Judul Publik Bahasa Indonesia:** `Gaduh di Stasiun Hening`
- **Penerapan Tuntas:** Diterapkan pada `manifest.ts` (title & description), `locales/id.json` & `locales/en.json`, `thumbnail.svg` (vektor tipografi judul diubah tanpa teks "RIOT"), serta halaman uji spike `index.html`.
- **Kepatuhan Aturan:** Kata "Riot" **tidak muncul** pada teks mana pun yang tampil ke pemain (teruji otomatis di `manifest.test.ts`). Pengenal teknis (slug `riot`, id game, namespace socket `/riot`, prefix tabel `riot_`) tetap dipertahankan.

### Pemeriksaan akhir

```
pnpm lint            -> lolos (0 error, 0 warning di seluruh monorepo)
pnpm typecheck       -> lolos (seluruh workspace lolos tsc --noEmit)
pnpm test (riot)     -> lolos (54/54 tes lolos di 9 berkas tes games/riot)
pnpm i18n:check      -> lolos (semua kunci id dan en cocok)
pnpm check:assets    -> lolos (semua berkas aset terdaftar dan memenuhi lisensi CC0/orisinil)
pnpm check:migrations-> lolos (semua tabel game menggunakan prefix yang benar)
Database low_stress  -> UTUH dan TIDAK TERSENTUH (baris data tetap identik)
```

---

## 2026-11-06 - Eksekusi Game Riot: Fase 3 (RT-30..RT-33)

Lingkup: Penyelesaian seluruh tugas Fase 3 (RT-30, RT-31, RT-32, RT-33) dari [ROADMAP_RIOT.md](ROADMAP_RIOT.md) §4 (Interaksi Sosial & Keandalan Jaringan). Berhenti setelah RT-33 sesuai instruksi pemilik (tidak memulai Fase 4).

### Ringkasan

| Tugas | Status | Bukti / catatan |
|---|---|---|
| RT-30 Rapat dan Voting | **Selesai** | Modul `shared/meetings.ts`: Rapat darurat dapat dipanggil via laporan hologram maupun tombol rapat terbatas (kuota divalidasi server). Chat teks difilter secara otoritatif di server dengan sensor kata kasar (`sdk.profanity`), batas ketat maksimal 300 karakter (menolak `MESSAGE_TOO_LONG`), dan batas kecepatan/rate limit 1 pesan/detik (menolak `RATE_LIMITED`). Isolasi chat hantu mutlak: pesan pemain berstatus `ghost` difilter di server (`filterMessagesForViewer`) sehingga tidak pernah terkirim ke pemain berstatus `alive`. Mekanisme voting murni `resolveVotes`: kandidat suara terbanyak tunggal dieliminasi, jika terjadi seri (*tie*) tidak ada pemain yang dieliminasi, jika pilihan *skip* terbanyak tidak ada pemain yang dieliminasi. Eliminasi seluruh penyusup memicu kemenangan instan kru. Diuji 6 tes di `games/riot/test/meeting-voting.test.ts` lolos 100%. |
| RT-31 Sabotase (Otoritatif Server) | **Selesai** | Modul `shared/sabotage.ts`: Penyusup dapat memicu sabotase dengan cooldown 30 detik (hanya 1 sabotase aktif sekaligus). Pemadaman (*blackout*) secara otoritatif menyusutkan radius pandang kru menjadi 3.5 meter pada pembuat snapshot server (`getEffectiveVisionRadius`), sehingga data pemain berjarak >3.5m dihilangkan total dari payload jaringan kru (nol kebocoran posisi). Kunci pintu sementara (*doors*) menyegel ruangan target selama 10 detik dan terbuka otomatis saat waktu habis. Alarm kritis (*critical_alarm*) dua titik berbatas waktu 45 detik: membutuhkan perbaikan serentak di dua stasiun berbeda (*station_cooling* dan *station_power*); jika hitung mundur habis tanpa perbaikan, server mengeksekusi kemenangan instan penyusup (`infiltrators_critical_sabotage`). Diuji 5 tes di `games/riot/test/sabotage.test.ts` lolos 100%. |
| RT-32 Putus Koneksi & Resiliensi Jaringan | **Selesai** | Penanganan diskoneksi mobile di `server/service.ts` & `server/socket.ts`: Pemain yang terputus (layar ponsel mati/aplikasi ke latar belakang) ditandai `connected: false` dan waktu `disconnectedAt` dicatat. Sambung ulang (*reconnect*) dalam masa tenggang mengembalikan kontrol pemain dan status room view pribadi tanpa kehilangan progres. Ronde voting tidak terhambat: bila pemain yang masih terhubung telah selesai memilih seluruhnya, voting disimpulkan otomatis. Masa tenggang 60 detik (`DISCONNECT_GRACE_PERIOD_MS`): jika pemain tidak kembali >60s, pemain ditandai `isAbandoned: true` dan diubah menjadi `ghost` agar sisa pemain aktif tidak terjebak menunggu. Host room memiliki wewenang mengeluarkan pemain (`kickPlayer`) yang langsung memperbarui simulasi dan mengevaluasi ulang kondisi menang. Diuji 4 tes di `games/riot/test/reconnect-resilience.test.ts` lolos 100%. |
| RT-33 Lobi & Opsi Permainan | **Selesai** | Modul `shared/lobby.ts`: Dukungan pembentukan dan daftar room lobi menggunakan arsitektur room bersama. Opsi host dikonfigurasi dan divalidasi dengan fungsi sanitasi batas aman: jumlah penyusup (1–3), jumlah tugas (1–5), kecepatan gerak pemain (0.5–2.5), radius pandang (4.0–16.0), cooldown aksi (10–60 detik), durasi diskusi (15–120 detik), durasi voting (15–120 detik), dan kuota rapat darurat (1–5). Tombol Mulai (`startGame`) dibatasi ketat hanya untuk host dan wajib memiliki minimal 4 pemain (menolak `MIN_PLAYERS_NOT_MET` jika <4). Batas kapasitas maksimal ruang (`riot.maxPlayers` dan env `RIOT_HARD_CAP`, default 32 pemain) ditegakkan di server saat bergabung (menolak `ROOM_CAPACITY_REACHED`). Opsi host dikunci dan tidak dapat diubah saat permainan berjalan. Diuji 5 tes di `games/riot/test/lobby-options.test.ts` lolos 100%. |

### Pemeriksaan Akhir Monorepo

```
pnpm lint            -> lolos (0 error, 0 warning di seluruh monorepo)
pnpm typecheck       -> lolos (seluruh 18 paket/aplikasi/game lolos tsc --noEmit)
pnpm test            -> lolos (seluruh tes monorepo lolos 100%; games/riot 74/74 tes di 13 berkas tes)
pnpm i18n:check      -> lolos (seluruh kunci id dan en identik)
pnpm check:assets    -> lolos (seluruh aset terdaftar & lisensi valid)
pnpm check:migrations-> lolos (seluruh tabel dan migrasi konsisten)
Database low_stress  -> UTUH dan TIDAK TERSENTUH (semua tes berjalan pada database low_stress_test)
```










---

## Fase 4 — Karakter, Tugas Lengkap, Audio & Kredit (RT-40 s.d. RT-44)

Tanggal: 2026-11-08

### Ringkasan

| Tugas | Status | Bukti / catatan |
|---|---|---|
| RT-40 Generator Mochi prosedural | **Selesai** | `client/characters/mochi.ts`: 6 spesies (orb, moth, newt, puff, sprite, crab) dengan geometri per-bagian (body/accent/detail/face/accessory) sehingga bisa di-`InstancedMesh` dengan warna per-instance. Aksesori prosedural 8 jenis. `MochiCrowd` (`characters/crowd.ts`) me-render semuanya via `InstancedMesh` (bucket per spesies + per aksesori + per varian humanoid). Ekspor GLB orisinal ke `assets/models/mochi-*.glb` (6 berkas, masing-masing ~40–59 KB) lewat `tools/export-mochi-glb.ts`. Spike RT-14 kini me-render `MochiCrowd` agar anggaran R5 terukur dengan karakter asli. |
| RT-41 Humanoid CC0 + profil | **Selesai** | 20 varian GLB "Mini Characters" Kenney (CC0, tercatat di `assets/LICENSES.md`) dimuat via `import.meta.glob` tanpa CDN; tekstur `colormap.png` dipetakan ulang via `LoadingManager`. Skema kustomisasi bersama di `shared/character.ts` (Mochi + Humanoid + sanitasi server). Migrasi `games/riot/db/0000_riot_tables.sql` berisi `riot_profiles` (+ `riot_rooms`, `riot_room_players`, `riot_matches`) dan skema Drizzle di `packages/db`. Rute `GET/PUT /api/games/riot/profile` di `server/profile.ts` (sanitasi Zod + `sanitizeCharacterCustomization`). `onUserDeleted` membersihkan data room; `riot_profiles` dibersihkan `ON DELETE CASCADE`. |
| RT-42 Pemilih karakter lobi | **Selesai** | Klien Riot sekarang bisa dimainkan ujung-ke-ujung: `client/index.tsx` (orkestrasi socket `/riot`), `client/Lobby.tsx` (buat/gabung room, daftar pemain, opsi host, mulai), `client/CharacterPicker.tsx` (Mochi: spesies/warna/aksen/aksesori; Humanoid: 20 varian tubuh/palet/aksesoris), `client/GameScene.tsx` (viewport 3D + dinding dari `collision.json`, joystick WASD, prediksi + interpolasi remote, tugas, rapat/chat/voting, sabotase, hasil). Preview 3D per pilihan via `AvatarPreview` (Three.js lazy). Target ketuk ≥44px, `aria-pressed`/label teks sehingga tidak bergantung warna saja. Autentikasi socket diperketat: identitas dari cookie sesi via `ctx.resolvePrincipal`, `handshake.auth` tidak dipercaya; admin/anon ditolak. |
| RT-43 10 tugas + denah + audio | **Selesai (denah level data)** | `STATION_TASKS` kini 10 tugas mencakup seluruh 10 ruangan (tiap lokasi divalidasi berada di dalam bounds ruangan oleh tes). Tugas kini diacak per pemain dan tidak bisa diulang (`TASK_NOT_ASSIGNED`/`TASK_ALREADY_DONE`). Audio orisinal disintesis WebAudio (`client/audio.ts`): click, taskDone, meetingStart, voteCast, ejected, win/lose — dengan tombol bisu yang tersimpan di `localStorage`. Denah final = `shared/collision.json` (10 ruangan, 13 dinding) dirender sebagai dinding greybox 3D; visual final masih greybox. |
| RT-44 Kredit + lisensi | **Selesai** | Layar Kredit dapat dibuka dari lobi (istilah game tidak pernah "Riot" untuk pemain). `assets/LICENSES.md` mencatat semua aset: 6 GLB Mochi internal, 20 GLB + tekstur Kenney CC0, dan audio orisinal. `pnpm check:assets` hijau. |

### Perubahan server/protokol penting

- `RiotClientRoomView` (`shared/protocol.ts`) kini memuat `viewerId`, `myTasks`, `myCompletedTasks` agar klien tahu tugasnya tanpa membocorkan data orang lain.
- Event socket baru: `room:leave`, `character:update`; `room:create`/`room:join` menerima `character` (disanitasi server).
- `startGame` mengacak tugas per pemain (sebelumnya semua kru menerima 3 tugas yang sama).
- Perbaikan keamanan: middleware `/riot` menolak koneksi tanpa sesi user dan menolak admin; identitas pemain selalu dari `resolvePrincipal`.

### Pemeriksaan Akhir

```
pnpm lint              -> lolos (0 error)
pnpm typecheck         -> lolos (seluruh monorepo)
pnpm --filter @low-stress/game-riot test -> 15 berkas, 89 tes lolos
pnpm i18n:check        -> lolos (id/en identik)
pnpm check:assets      -> lolos
pnpm check:migrations  -> lolos
pnpm test (root)       -> games/riot & game non-DB lolos; tes ber-DB
                          (server, ludo censor/expiration, create-admin)
                          dilewati lokal karena DATABASE_URL tidak diatur;
                          1 tes apps/web leaderboard gagal format angka
                          (4.950 vs 4,950) — tidak terkait perubahan ini.
```

### Belum diverifikasi / catatan jujur

- UI baru (lobi, peta 3D, rapat, voting) **belum diuji di browser nyata** — baru lolos typecheck/lint/unit test. Perlu uji manual 360px/desktop terang/gelap.
- Denah masih greybox (box + pad ruangan); "denah final" berarti data kolisi final, bukan art final.
- RT-14 uji ponsel nyata tetap tugas pemilik.
- Game tetap `inactive`; Fase 5 (RT-50–55) belum dikerjakan.

### Tambahan pasca-Fase 4 (perbaikan celah)

- **Rematch**: `service.returnToLobby` + event `room:rematch` (host only) — ronde `finished` kembali ke `lobby` dengan pemain sama; tombol "Main lagi" di layar hasil, non-host melihat status menunggu.
- **Reveal peran**: `RiotClientRoomView.ejectedRole` — peran pemain yang dikeluarkan baru terlihat setelah voting selesai (tidak bocor selama voting/playing).
- **Persistensi**: socket menulis `riot_rooms` + `riot_room_players` (upsert, throttle 5 dtk/room via tick 15 Hz) dan `riot_matches` sekali saat `phase === "finished"`. Kegagalan DB tidak menjatuhkan gameplay.
- **Build web**: `pnpm --filter @low-stress/web build` lolos; chunk Riot lazy-load (three ~679 kB, GLTFLoader ~45 kB, GLB humanoid ~240 kB per varian, diambil on-demand).
- Tes baru: rematch & ejectedRole (2 tes; total riot 91 tes hijau).

### Rehidrasi room & reconnect klien

- `server/hydrate.ts`: saat `registerRealtime`, room berstatus `lobby` di `riot_rooms` + `riot_room_players` dibangun ulang ke `RiotGameService` (nama dari `users`, opsi & kustomisasi dari JSONB). Hanya fase lobby yang dipulihkan; ronde berjalan tetap ephemeral. Pemain hasil hidrasi ditandai offline sampai socket kembali.
- Klien: pada event `connect`, bila masih memegang `view.roomId` klien emit `player:reconnect` — memperbaiki UX putus sambung socket (sebelumnya mapping socket hilang dan view tidak pernah pulih).
- `games/riot/vitest.config.ts`: `testTimeout`/`hookTimeout` 30 dtk — import lazy klien (React + socket.io-client + grafik Three) bisa >5 dtk di mesin lambat.

---

## Fase 5 — Integrasi, QA, Rilis (RT-50 s.d. RT-55)

Tanggal: 2026-11-08

### Ringkasan

| Tugas | Status | Bukti / catatan |
|---|---|---|
| RT-50 Poin ke leaderboard | **Selesai** | `games/riot/server/leaderboard.ts` (`buildLeaderboardScoreEntries`, `matchRecordKey` per `roundStartedAt` agar rematch tercatat); `service.ts` mencatat `roundStartedAt` saat `startGame`; `socket.ts` `recordMatch` memanggil `ctx.recordScore` per pemain berpoin saat `finished` (sekali per ronde). `POST /api/games/:id/scores` untuk game `multiplayer` kini ditolak `SCORE_SERVER_AUTHORITATIVE` (403) di `apps/server/src/games/routes.ts` — skor Riot hanya dari server. 3 tes unit di `games/riot/test/leaderboard-scoring.test.ts`. |
| RT-51 Moderasi admin | **Selesai (API)** | `GET/GET/:id/POST reset/POST kick/DELETE /api/admin/riot/rooms` di `apps/server/src/admin/{service,routes,validation}.ts`, meniru pola Ludo; semua aksi menulis `audit_log` (`riot_reset_room`, `riot_kick_player`, `riot_delete_room`). Detail: room + pemain + riwayat match. **Batasan jujur:** chat rapat Riot ephemeral (tidak dipersist), jadi tidak dapat dilihat admin dari DB — menyimpang dari redaksi RT-51 "lihat chat", dicatat di API_Spec §10. Halaman UI admin belum dibuat (setara Ludo yang juga API-only). Tes `apps/server/test/riot-admin.test.ts` (5 tes) tertulis. |
| RT-52 i18n & aksesibilitas | **Selesai** | `pnpm i18n:check` lolos (id/en identik). `games/riot/client/reduced-motion.ts` (helper murni + hook `usePrefersReducedMotion`); `MochiCrowd.reducedMotion` mematikan goyangan idle (bob) dan mengikuti perubahan preferensi live di `GameScene.tsx`. Kamera sudah kaku tanpa shake/kilat. Informasi tidak hanya lewat warna (nama + teks status + `aria-pressed`/label). 3 tes unit di `games/riot/test/reduced-motion.test.ts`. Audit manual browser belum dilakukan. |
| RT-53 QA & E2E | **Sebagian** | E2E Vitest+Socket.IO `apps/server/test/riot-e2e.test.ts`: 4 konteks socket → buat/gabung → mulai → peran rahasia (tepat 1 penyusup) → skor klien ditolak 403 → rapat → voting → selesai → leaderboard `all` terisi (3 kru berpoin). Angka beban memakai hasil simulator RT-13 (20 klien: CPU 0,254 ms/tick, 2,74 KB/s per klien, 0 kebocoran; 32 klien: 0,244 ms/tick, 2,53 KB/s). Playwright belum terpasang di repo; uji iOS Safari/Android Chrome di ponsel nyata dan RT-14 tetap tugas pemilik — belum diverifikasi. |
| RT-54 Tinjauan kemiripan & nama | **Draf, menunggu pemilik** | `docs/riot-similarity-review.md`: perbandingan denah/tugas/antar muka/suara/nama vs Among Us (semua ekspresi berbeda) dan pemeriksaan judul publik vs merek Riot Games. Belum ditandatangani; **game tetap `inactive`**. |
| RT-55 Dokumentasi | **Selesai** | `docs/API_Spec.md` (§6 skor multiplayer, §9 Riot REST+soket, §10 admin Riot; Admin→§10, Versi→§11), `docs/Screens.md` (rute `/games/riot`, `/admin/riot`), `docs/Architecture.md` (realtime Riot, tabel `riot_*`, skor server-otoritatif), `docs/PRD.md` (baris game Riot, baris admin Riot, paragraf GAME), `AGENTS.md` (§1, status `inactive` sampai RT-54). |

### Pemeriksaan akhir

```
pnpm lint              -> lolos (0 error)
pnpm typecheck         -> lolos (seluruh workspace)
pnpm --filter @low-stress/game-riot test -> 17 berkas, 97 tes lolos
pnpm i18n:check        -> lolos (id/en identik)
pnpm check:assets      -> lolos
pnpm check:migrations  -> lolos
pnpm --filter @low-stress/web build -> lolos (29 entri precache PWA)
```

### Belum diverifikasi / catatan jujur

- ~~Tes ber-DB tidak dijalankan~~ **Sudah dijalankan 2026-11-08** setelah Postgres tersedia: `riot-admin` (5 tes) dan `riot-e2e` (1 tes) lolos; `pnpm test` seluruh monorepo hijau termasuk server 138 tes. Perbaikan kecil: `GameLeaderboard` kini memakai `Intl` sesuai locale aktif (`toLocaleString(i18n.language)`) dan tes P5-04 diselaraskan (`4.950` untuk id) — sebelumnya gagal di mesin ber-locale id.
- Uji ponsel nyata (RT-14 & RT-53): fps/draw call/segitiga di iOS Safari & Android Chrome, lanskap dan potret — belum dilakukan.
- UI Riot belum diuji di browser nyata (360px/desktop terang/gelap) — sama seperti catatan Fase 4.
- Halaman UI admin Riot belum dibuat (API selesai).
- Game tetap `inactive` sampai RT-54 ditandatangani pemilik; setelah itu baru aktifkan via admin.
