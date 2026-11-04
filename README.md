<div align="center">

<img src="packages/ui/assets/logo/logo-icon.svg" alt="Logo Low Stress" width="96" height="96" />

# Low Stress

**Situs game santai untuk istirahat sebentar: daftar, main, dan bersaing di leaderboard.**

[![CI](https://github.com/nsyamsy/low-stress/actions/workflows/ci.yml/badge.svg)](https://github.com/nsyamsy/low-stress/actions/workflows/ci.yml)
[![CD](https://github.com/nsyamsy/low-stress/actions/workflows/cd.yml/badge.svg)](https://github.com/nsyamsy/low-stress/actions/workflows/cd.yml)
![Node](https://img.shields.io/badge/node-22-2F5D55?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Fastify](https://img.shields.io/badge/Fastify-API-000000?logo=fastify&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Status](https://img.shields.io/badge/status-dalam%20pengembangan-F2B84B)

[Mulai](#-memulai) · [Fitur](#-fitur) · [Status](#-status-pengembangan) · [Arsitektur](#-arsitektur) · [Dokumentasi](#-dokumentasi)

</div>

---

## Tentang

**Low Stress** adalah situs game ringan berumur panjang. Pemain mendaftar, disetujui admin, lalu memainkan sekumpulan game dan bersaing di leaderboard **weekly**, **monthly**, dan **all time**. Panel admin dipisah dari area pemain. Game baru bisa ditambahkan tanpa menyentuh game lain.

Dua bahasa (Indonesia dan English), mobile-first, bisa dipasang sebagai PWA, dan dapat dideploy di **LAN** maupun **Public** dari kode yang sama. Semua aset di-host sendiri, jadi aplikasi jalan tanpa internet.

## Fitur

| | |
|---|---|
| **Game** | Flappy Bird, Memory Match, dan Ludo (2 sampai 12 pemain, realtime) |
| **Leaderboard** | Per game, tiga periode, zona waktu WIB |
| **Akun** | Daftar dengan persetujuan admin, login username, hapus akun sendiri |
| **Admin** | Persetujuan, pengguna, jadwal dan status game, moderasi, audit log |
| **Chat** | Chat publik di desktop dan chat per room Ludo, dengan sensor kata kasar |
| **Modular** | Satu folder per game, isolasi ditegakkan oleh ESLint |
| **Deploy** | Docker Compose profil `lan` dan `public` (Caddy) |

## Status pengembangan

| Fase | Isi | Status |
|---|---|---|
| 1 | Fondasi: monorepo, paket bersama, DB, registry game, PWA | 9 dari 12 tugas selesai |
| 2 | Auth pemain: register, login, sesi, CSRF, `/api/me`, hapus akun, rate limit | Selesai |
| 3 | Panel admin | Belum |
| 4 | Gerbang game: status dan jadwal | Belum |
| 5 | Memory Match dan leaderboard | Belum |
| 6 | Flappy Bird | Belum |
| 7 | Ludo | Belum |
| 8 | Chat publik, sensor, moderasi | Belum |
| 9 | Polish dan rilis | Belum |

Masih terbuka di Fase 1: **P1-05** kontras warna (menunggu keputusan pemilik) dan **P1-10** verifikasi Docker (belum ada Docker di mesin pengembang). P1-11 (CI) kini berjalan di GitHub Actions.

Halaman yang ada saat ini: `/` (beranda sederhana), `/login`, `/register`, `/pending`, dan `/showcase` (contoh komponen). Game, leaderboard, dan panel admin belum ada.

Rincian: [ROADMAP](docs/ROADMAP.md) · [TASKS](docs/TASKS.md) · [progress](docs/progress.md)

## Memulai

Prasyarat: Node 22, pnpm 12, dan PostgreSQL 16.

```bash
pnpm install
cp .env.example .env      # isi DATABASE_URL dan SESSION_SECRET
pnpm db:migrate           # membuat tabel inti
pnpm dev                  # web :5173, server :3001
```

> [!IMPORTANT]
> - `SESSION_SECRET` minimal 32 karakter acak. Jangan memakai nilai contoh.
> - `DATABASE_URL` berformat `postgres://user:password@host:port/nama_db`. Karakter khusus di password harus di-URL-encode.
> - `.env` tidak masuk repositori.

> [!WARNING]
> Tes integrasi server (`apps/server/test/auth.test.ts`) membaca `.env` dan menulis ke database yang ditunjuk `DATABASE_URL`. Jalankan tes hanya terhadap database uji sekali pakai, bukan database berisi data nyata.

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

## Arsitektur

```mermaid
flowchart LR
    B["Browser<br/>React SPA, PWA"] -->|REST /api| S["apps/server<br/>Fastify"]
    B -->|WebSocket| S
    S --> D[("PostgreSQL<br/>Drizzle")]
    S --> G["games/*<br/>manifest, server, shared"]
    B --> W["apps/web<br/>shell + game host"]
    W --> G
    P["packages<br/>sdk, ui, i18n, db"] -.dipakai.-> W
    P -.dipakai.-> S
```

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

| Alur | Pemicu | Isi |
|---|---|---|
| **CI** | Setiap push dan pull request | Install, lint, typecheck, migrasi ke PostgreSQL sementara, test, `i18n:check`, `check:migrations`, build |
| **CD** | CI hijau di `main` | Membangun dan menerbitkan image ke `ghcr.io/nsyamsy/low-stress-web` dan `ghcr.io/nsyamsy/low-stress-server` |

Deploy otomatis ke server belum diaktifkan karena belum ada target dan rahasia deploy.

## Deploy

Profil `lan` dan `public` (dengan Caddy) ada di `docker-compose.yml`. Panduan lengkap di [docs/deploy.md](docs/deploy.md). Berkas Docker sudah ada tetapi belum diverifikasi dengan menjalankan Compose.

## Dokumentasi

| Dokumen | Isi |
|---|---|
| [Agents.md](Agents.md) | Aturan untuk AI coding agent |
| [PRD](docs/PRD.md) | Apa yang dibangun dan kenapa |
| [Architecture](docs/Architecture.md) | Struktur, stack, data, keamanan, deploy |
| [API Spec](docs/API_Spec.md) | Kontrak REST dan soket |
| [Screens](docs/Screens.md) | Rute dan isi tiap layar |
| [Design System](docs/Design_System.md) | Warna, tipografi, komponen |
| [Porting Guide](docs/Porting_Guide.md) | Memorting game dari aplikasi lama |
| [ROADMAP](docs/ROADMAP.md) | Antrean kerja per fase |
