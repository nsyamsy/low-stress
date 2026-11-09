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
![Status](https://img.shields.io/badge/status-fase%201--9%20selesai-7FA88B)

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

Semua tugas di [ROADMAP](docs/ROADMAP.md) (Fase 1 sampai 9) sudah dikerjakan; 62 dari 62 butir di [TASKS](docs/TASKS.md) tercentang.

| Fase | Isi | Status |
|---|---|---|
| 1 | Fondasi: monorepo, paket bersama, DB, registry game, Docker, CI, PWA, token kontras AA | Selesai |
| 2 | Auth pemain: register, login, sesi, CSRF, `/api/me`, hapus akun, rate limit | Selesai |
| 3 | Panel admin: persetujuan, pengguna, pengaturan, audit log, SMTP (nonaktif) | Selesai |
| 4 | Gerbang game: status dan jadwal WIB | Selesai |
| 5 | Memory Match dan leaderboard weekly, monthly, all time | Selesai |
| 6 | Flappy Bird (Canvas 2D, 6 karakter, medali) | Selesai |
| 7 | Ludo realtime 2 sampai 12 pemain (Socket.IO) | Selesai |
| 8 | Chat publik, sensor kata kasar, moderasi | Selesai |
| 9 | Aksesibilitas, QA mobile, panduan deploy, uji beban | Selesai |

Pemeriksaan terakhir yang tercatat di [progress](docs/progress.md): lint, typecheck, `i18n:check`, `check:migrations`, dan 214 tes lolos; image Docker dibangun dan profil `lan` sehat (`/healthz` 200); CI di GitHub Actions hijau.

**Belum diverifikasi:** profil `public` (Caddy dengan domain dan HTTPS nyata), pemasangan PWA di HTTPS publik, dan pengujian manual di perangkat iOS dan Android sungguhan. Lihat [qa-mobile](docs/qa-mobile.md).

### Halaman

| Rute | Isi |
|---|---|
| `/login`, `/register`, `/pending` | Akun pemain |
| `/` | Beranda dengan kartu game |
| `/games/:id` | Flappy Bird, Memory Match, Ludo (lobi dan `/games/ludo/:roomId`) |
| `/leaderboard` | Papan peringkat per game |
| `/admin/login` | **Login admin** (terpisah dari `/login`) |
| `/admin`, `/admin/approvals`, `/admin/users`, `/admin/games`, `/admin/leaderboard`, `/admin/chat`, `/admin/settings`, `/admin/audit` | Panel admin |
| `/showcase` | Contoh komponen UI (pengembangan) |

Rincian: [ROADMAP](docs/ROADMAP.md) · [TASKS](docs/TASKS.md) · [progress](docs/progress.md)

## Memulai

Prasyarat: Node 22, pnpm 12, dan PostgreSQL 16.

```bash
pnpm install
cp .env.example .env      # isi DATABASE_URL dan SESSION_SECRET
pnpm db:migrate           # membuat tabel inti
pnpm create-admin         # membuat Superadmin pertama (menanyakan username dan password)
pnpm dev                  # web :5173, server :3001
```

### Langkah pertama setelah pemasangan

Database baru kosong: belum ada pemain dan semua game berstatus **Nonaktif**.

1. Buka `http://localhost:5173/admin/login` dan masuk dengan akun dari `pnpm create-admin`.
2. Di **Game**, ubah status Flappy Bird, Memory Match, dan Ludo menjadi **Aktif**. Tanpa ini beranda pemain kosong.
3. Buka `/register` untuk membuat akun pemain. Pada mode `lan` akun berstatus `pending`.
4. Kembali ke panel admin, **Persetujuan**, setujui akun itu, lalu masuk di `/login`.

### Tidak bisa masuk?

| Gejala | Penyebab | Solusi |
|---|---|---|
| "Username atau password salah" untuk akun admin di `/login` | **Akun admin tidak ada di halaman login pemain.** Admin dan pemain disimpan di tabel terpisah dengan cookie berbeda. | Masuk lewat `/admin/login`. |
| "Terlalu banyak percobaan gagal" | 5 kegagalan berturut-turut mengunci kombinasi username dan IP selama 15 menit. Kunci admin dan pemain terpisah. | Tunggu hitung mundur selesai, atau hapus baris terkait di tabel `login_attempts`. |
| Akun baru tidak bisa dipakai, diarahkan ke `/pending` | Mode `approval` (bawaan `lan`) menunggu admin. | Setujui di `/admin/approvals`. |
| Beranda masuk tetapi tanpa game | Semua game berstatus Nonaktif setelah instalasi. | Aktifkan di `/admin/games`. |
| Ditolak dengan `CSRF_INVALID` saat membuka lewat alamat IP | `APP_ORIGIN` tidak sama dengan alamat yang dibuka. Mode pengembangan hanya melonggarkan alamat `localhost`. | Samakan `APP_ORIGIN` di `.env` dengan alamat yang dibuka, lalu mulai ulang server. |
| Lupa password admin | `pnpm create-admin` menolak username yang sudah ada. | Ubah hash lewat database, atau hapus baris admin lalu jalankan `pnpm create-admin` lagi. |

> [!IMPORTANT]
> - `SESSION_SECRET` minimal 32 karakter acak. Jangan memakai nilai contoh atau kata sandi bawaan seperti `admin123` di lingkungan bersama/produksi.
> - `DATABASE_URL` berformat `postgres://user:password@host:port/nama_db`. Karakter khusus di password harus di-URL-encode.
> - `.env` dan `.env.test` tidak masuk repositori (dipindai otomatis di CI).

> [!WARNING]
> Tes integrasi server (`apps/server/test/*.test.ts`) **wajib** memakai `TEST_DATABASE_URL` (dari `.env.test`) yang nama databasenya berakhiran `_test`. Tes akan gagal cepat (*fast-fail*) bila `TEST_DATABASE_URL` tidak diatur, demi melindungi database pengembangan.

## Perintah

| Perintah | Fungsi |
|---|---|
| `pnpm dev` | Web dan server (mode pengembangan) |
| `pnpm build` | Build semua paket |
| `pnpm lint` | ESLint, termasuk aturan isolasi game, larangan nilai desain mentah, dan larangan teks literal JSX |
| `pnpm typecheck` | Pemeriksaan tipe |
| `pnpm test` | Vitest (memerlukan database uji `low_stress_test` untuk server) |
| `pnpm test:e2e` | Playwright E2E di viewport mobile (360px) dan desktop (1280px) |
| `pnpm test:db:up` | Menyiapkan database uji `low_stress_test` dan migrasi |
| `pnpm test:db:clean` | Membersihkan tabel data pada database uji |
| `pnpm i18n:check` | Kunci `id` dan `en` harus identik |
| `pnpm check:migrations` | Tabel game wajib berawalan `<id>_` & pemindaian rahasia git |
| `pnpm check:assets` | Validasi buku besar lisensi aset game (`LICENSES.md`) |
| `pnpm db:migrate` | Menjalankan migrasi |
| `pnpm db:seed:dev` | Menyalakan game awal (`flappy-bird`, `memory-match`, `ludo`) secara idempoten tanpa membuat akun palsu |
| `pnpm new-game <slug>` | Membuat folder game baru dari template |
| `pnpm create-admin [username] [password]` | Membuat akun Superadmin (tanpa argumen, akan ditanya) |
| `pnpm generate:icons` | Membuat ulang ikon PWA dari logo |

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

Profil `lan` dan `public` (dengan Caddy) ada di `docker-compose.yml`. Profil `lan` sudah dijalankan dan terverifikasi sehat; profil `public` belum diuji dengan domain dan HTTPS nyata. Panduan lengkap di [docs/deploy.md](docs/deploy.md), operasi harian di [docs/operations.md](docs/operations.md).

```bash
docker compose --profile lan up -d      # web di http://<ip-server>:8080
docker compose --profile public up -d   # dengan Caddy dan HTTPS
```

Saat dibuka lewat alamat selain `localhost`, isi `APP_ORIGIN` di `.env` dengan alamat yang dipakai pengguna.

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
| [TASKS](docs/TASKS.md) · [progress](docs/progress.md) | Daftar tugas dan catatan hasil per fase |
| [Deploy](docs/deploy.md) · [Operations](docs/operations.md) | Pemasangan LAN dan Public, operasi harian |
| [Accessibility](docs/accessibility-audit.md) · [QA mobile](docs/qa-mobile.md) · [Load test](docs/load-test.md) | Audit aksesibilitas, uji mobile, uji beban |
