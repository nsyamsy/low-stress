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

