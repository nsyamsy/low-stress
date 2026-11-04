# Low Stress

Situs game santai berumur panjang. Pemain mendaftar, disetujui admin, memainkan game (Flappy Bird, Memory Match, Ludo), dan bersaing di leaderboard weekly, monthly, dan all time. Ada panel admin terpisah, dua bahasa (Indonesia dan English), mobile-first, PWA, dan bisa dideploy di LAN maupun Public.

Stack: pnpm monorepo, TypeScript strict, Vite + React 19 (web), Fastify + Socket.IO (server), PostgreSQL + Drizzle, Zod, i18next, Vitest.

## Status

| Fase | Isi | Status |
|---|---|---|
| 1 | Fondasi: monorepo, paket bersama, DB, registry game, PWA | Hampir selesai. P1-05 (kontras warna), P1-10 (verifikasi Docker), P1-11 (CI) masih terbuka |
| 2 | Auth pemain: register, login, sesi, CSRF, `/api/me`, hapus akun, rate limit | Selesai |
| 3 sampai 9 | Panel admin, gerbang game, Memory Match, Flappy Bird, Ludo, chat, rilis | Belum dimulai |

Daftar tugas rinci: [docs/ROADMAP.md](docs/ROADMAP.md) dan [docs/TASKS.md](docs/TASKS.md). Catatan hasil kerja: [docs/progress.md](docs/progress.md).

Halaman yang tersedia saat ini: contoh komponen (`ShowcasePage`) serta `/login`, `/register`, `/pending`. Beranda, game, leaderboard, dan panel admin belum ada.

## Memulai

Butuh Node 22 dan pnpm 12 serta PostgreSQL 16.

```bash
pnpm install
cp .env.example .env      # lalu isi DATABASE_URL dan SESSION_SECRET
pnpm db:migrate           # membuat tabel inti
pnpm dev                  # web http://localhost:5173, server http://localhost:3001
```

Catatan `.env`:
- `SESSION_SECRET` minimal 32 karakter acak. Jangan memakai nilai contoh.
- `DATABASE_URL` berformat `postgres://user:password@host:port/nama_db`. Karakter khusus di password harus di-URL-encode.
- `.env` tidak masuk repositori.

## Perintah

| Perintah | Fungsi |
|---|---|
| `pnpm dev` | Web dan server (mode pengembangan) |
| `pnpm build` | Build semua paket |
| `pnpm lint` | ESLint, termasuk aturan isolasi game dan larangan nilai desain mentah |
| `pnpm typecheck` | Pemeriksaan tipe |
| `pnpm test` | Vitest |
| `pnpm i18n:check` | Kunci `id` dan `en` harus identik |
| `pnpm check:migrations` | Tabel game wajib berawalan `<id>_` |
| `pnpm db:migrate` | Menjalankan migrasi |
| `pnpm new-game <slug>` | Membuat folder game baru dari template |

Peringatan: tes integrasi server (`apps/server/test/auth.test.ts`) membaca `.env` dan menulis ke database yang ditunjuk `DATABASE_URL`. Jalankan tes hanya terhadap database uji sekali pakai, bukan database yang berisi data nyata.

## Struktur

```text
apps/web        shell SPA
apps/server     API, WebSocket, job
packages/sdk    kontrak game
packages/ui     komponen dan token desain
packages/i18n   teks bersama
packages/db     skema inti dan migrasi
games/<id>/     satu folder per game
tools/          new-game, check-i18n, check-migrations, generate-icons
docker/         Dockerfile, Caddy, nginx
docs/           PRD, arsitektur, desain, API, layar, roadmap
reference/      kode game lama untuk acuan porting (baca-saja, tidak dikompilasi)
```

## CI dan CD

- **CI** (`.github/workflows/ci.yml`): setiap push dan pull request menjalankan install, lint, typecheck, migrasi ke PostgreSQL sementara, test, `i18n:check`, `check:migrations`, dan build.
- **CD** (`.github/workflows/cd.yml`): setelah CI hijau di `main`, image `web` dan `server` dibangun dan diterbitkan ke `ghcr.io/nsyamsy/low-stress-web` dan `ghcr.io/nsyamsy/low-stress-server`. Deploy otomatis ke server belum diaktifkan.

## Deploy

Profil `lan` dan `public` (dengan Caddy) ada di `docker-compose.yml`. Panduan: [docs/deploy.md](docs/deploy.md). Berkas ini sudah dibuat tetapi belum diverifikasi dengan menjalankan Docker.

## Dokumentasi

| Dokumen | Isi |
|---|---|
| [Agents.md](Agents.md) | Aturan untuk AI coding agent |
| [docs/PRD.md](docs/PRD.md) | Apa yang dibangun dan kenapa |
| [docs/Architecture.md](docs/Architecture.md) | Struktur, stack, data, keamanan, deploy |
| [docs/API_Spec.md](docs/API_Spec.md) | Kontrak REST dan soket |
| [docs/Screens.md](docs/Screens.md) | Rute dan isi tiap layar |
| [docs/Design_System.md](docs/Design_System.md) | Warna, tipografi, komponen |
| [docs/Porting_Guide.md](docs/Porting_Guide.md) | Memorting game dari aplikasi lama |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Antrean kerja per fase |
