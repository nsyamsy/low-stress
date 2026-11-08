# Agents.md — Panduan untuk AI Coding Agent

Dokumen ini untuk agent (Claude Code, dll) yang bekerja di repositori **Low Stress**. Baca seluruhnya sebelum mengubah kode. Untuk detail, lihat dokumen terkait.

| Dokumen | Isi |
|---|---|
| [PRD.md](docs/PRD.md) | Apa yang dibangun dan kenapa |
| [Design_System.md](docs/Design_System.md) | Warna, tipografi, komponen, gaya tulisan |
| [Architecture.md](docs/Architecture.md) | Struktur, stack, data, keamanan, deploy |
| [ROADMAP.md](docs/ROADMAP.md) | **Antrean kerja per fase, kriteria selesai, dan keputusan bawaan** |
| [API_Spec.md](docs/API_Spec.md) | Kontrak REST dan soket, kode error |
| [Screens.md](docs/Screens.md) | Rute dan isi tiap layar (pengganti mockup) |
| [Porting_Guide.md](docs/Porting_Guide.md) | Cara memorting Flappy Bird, Memory Match, Ludo dari `performance_dash` |
| [TASKS_DEBUG_REFACTOR.md](docs/TASKS_DEBUG_REFACTOR.md) | **Antrean perbaikan dan refactor setelah Fase 1–9** (kerjakan D-01 lebih dulu) |
| [ROADMAP_RIOT.md](docs/ROADMAP_RIOT.md) · [concepts/riot.md](docs/concepts/riot.md) | Game "Riot" (deduksi sosial 3D): tugas per fase dan konsep. **Fase 0 sampai 3 selesai; mulai dari [HANDOFF_RIOT.md](docs/HANDOFF_RIOT.md)** |

> Status proyek: **perencanaan selesai, belum ada kode**. Perintah di bawah baru tersedia setelah Fase 1 selesai. Mulai eksekusi hanya ketika pemilik proyek menginstruksikannya, lalu **ikuti [ROADMAP.md](docs/ROADMAP.md) berurutan mulai dari P1-01**. Keputusan produk yang sudah punya nilai bawaan ada di ROADMAP §0; jangan menanyakannya lagi. Jika ada konflik antar dokumen, urutan prioritas: ROADMAP §0 → PRD → Architecture → API_Spec → Screens → Design_System.

---

## 1. Ringkasan proyek

**Low Stress** adalah situs game santai berumur panjang: pemain mendaftar, disetujui admin, memainkan game (Flappy Bird, Memory Match, Ludo, Riot), dan bersaing di leaderboard weekly, monthly, dan all time. Ada panel admin (Superadmin) terpisah. Dua bahasa (Indonesia dan English), mobile-first, PWA, dan bisa dideploy di LAN maupun Public. Riot ("Uproar on the Silent Station") berstatus `inactive` sampai tinjauan kemiripan RT-54 ditandatangani pemilik (`docs/riot-similarity-review.md`).

Pengguna dan skor dari aplikasi lama `performance_dash` **tidak** dimigrasi.

## 2. Stack singkat

pnpm monorepo · TypeScript strict · Vite + React 19 + Tailwind (web) · Fastify + Socket.IO (server) · PostgreSQL + Drizzle · Zod · i18next · Vitest + Playwright. Teknologi tampilan dipilih per game (React, Canvas 2D, SVG, atau Phaser 3 opsional).

## 3. Struktur

```text
apps/web        shell SPA + panel admin
apps/server     API, WebSocket, job
packages/sdk    kontrak game
packages/ui     komponen dan token desain
packages/i18n   teks bersama
packages/db     skema inti dan migrasi
games/<id>/     satu folder per game (manifest, client, server, shared, db, locales)
tools/          create-admin, new-game, check-i18n
docker/         compose dan Caddy
```

## 4. Perintah (rencana)

```bash
pnpm install
pnpm dev                 # web + server
pnpm test                # Vitest
pnpm test:e2e            # Playwright (mobile dan desktop)
pnpm lint                # ESLint, termasuk aturan isolasi
pnpm typecheck
pnpm i18n:check          # kunci id dan en harus identik
pnpm db:migrate          # migrasi inti dan semua game
pnpm create-admin        # membuat Superadmin pertama
pnpm new-game <slug>     # generator folder game
docker compose --profile lan up -d      # deploy LAN
docker compose --profile public up -d   # deploy Public (dengan Caddy)
```

## 5. Aturan wajib

### 5.1 Isolasi game
- Satu game = satu folder `games/<id>/`. **Jangan mengimpor dari game lain.** Game hanya boleh memakai `sdk`, `ui`, `i18n`.
- Tabel khusus game berawalan `<id>_`, dengan migrasi di `games/<id>/db`.
- Rute `/api/games/<id>/...`, room realtime berawalan `<id>:`, namespace i18n `game.<id>`.
- Menambah game **tidak boleh** mengubah file inti. Gunakan `pnpm new-game`. Jika butuh perubahan inti, itu berarti kontrak `sdk` perlu diperluas: ubah `sdk`, bukan membuat jalan pintas.
- Dependensi berat (mis. Phaser) hanya dimuat lewat dynamic import oleh game yang membutuhkannya. Phaser tidak dipakai untuk game yang diporting dari `performance_dash` (Flappy Bird, Memory Match, Ludo).
- Saat memorting game dari `performance_dash`, ambil kode acuan di `reference/performance_dash-games/` dan **pertahankan tampilan di dalam canvas persis seperti aslinya** (palet, sprite hasil kode, layar Game Over, medali, sintesis suara). Palet Low Stress hanya untuk bingkai di sekitar game.

### 5.2 i18n (Indonesia dan English)
- **Tidak ada teks UI yang ditulis langsung di komponen.** Semua lewat kunci i18n.
- Setiap kunci wajib ada di `id.json` **dan** `en.json`. `pnpm i18n:check` harus lolos.
- Pola kunci: `area.elemen.keadaan` (contoh `auth.login.submit`).
- Server mengirim **kode error**, bukan kalimat; klien menerjemahkan.
- Tanggal dan angka memakai `Intl` sesuai locale. Perhatikan teks Indonesia yang lebih panjang saat membuat layout.

### 5.3 Mobile-first
- Rancang di 360px dulu. Titik uji: 360, 390, 768, 1280.
- Target ketuk ≥ 44px, tanpa ketergantungan hover, hormati safe area.
- Setiap game harus bisa dimainkan dengan sentuhan dan pas di viewport tanpa scroll.
- Tabel admin berubah menjadi kartu di bawah 768px.
- Hormati `prefers-reduced-motion`.

### 5.4 Desain
- Pakai token dari `packages/ui`. **Jangan menulis hex, ukuran font, atau jarak mentah** di komponen.
- Satu tombol primary per tampilan. Sentence case. Gaya tulisan sesuai Design_System.md §11.
- Koral `#F2735B` bukan warna teks kecil; pakai `--accent-text`.
- Mode terang dan gelap harus sama-sama diperiksa.
- Tidak memakai emoji sebagai ikon fungsional.

### 5.5 Offline, LAN, dan aset
- **Tidak ada CDN, font eksternal, atau skrip pihak ketiga.** Semua aset di-host sendiri. Aplikasi harus berjalan tanpa internet.
- Jangan mengasumsikan HTTPS. `Secure` cookie dan service worker menyesuaikan lingkungan.

### 5.6 Keamanan
- Password argon2id; jangan pernah mencatat password, token, atau hash di log.
- Semua input divalidasi dengan Zod di server. Jangan percaya data dari klien.
- Admin dan pemain terpisah (tabel dan cookie berbeda). **Admin tidak boleh bisa bermain**, pemain tidak boleh mengakses `/admin`.
- Setiap aksi admin yang mengubah data dicatat di `audit_log`.
- Server otoritatif untuk Ludo (dadu dan validasi langkah di server).
- Skor dari klien hanya divalidasi kewajarannya; jangan menyebutnya "anti-cheat".
- Jangan menaruh rahasia di repositori. `.env` tidak di-commit; ubah `.env.example` bila variabel baru ditambah.

### 5.6a Chat dan sensor
- Panel chat publik **hanya dirender di desktop (≥ 1024px)**; di bawah itu jangan membuka koneksi soketnya. Chat per room Ludo terpisah dan tersedia di mobile.
- **Sensor dilakukan di server** (`sdk.profanity`) sebelum pesan disimpan; klien tidak pernah menyensor sendiri. Berlaku untuk chat publik, chat Ludo, dan nama tampilan.
- Daftar kata kasar bahasa Indonesia dan English ada di repositori dan tabel `banned_words`; jangan menulis ulang logika sensor di tempat lain.
- Rate limit dan batas 300 karakter berlaku untuk setiap jalur chat.

### 5.7 Akun dan email
- Pemain boleh menghapus akunnya sendiri (`DELETE /api/me`, konfirmasi password); game membersihkan datanya lewat `sdk.onUserDeleted`.
- Login memakai **username**, bukan email. Email wajib diisi dan unik tetapi belum diverifikasi sampai SMTP diaktifkan.
- Fitur yang bergantung SMTP disembunyikan di UI selama adapter adalah `LogAdapter`.
- Lupa password saat ini = reset oleh admin.
- Zona waktu logika jadwal dan periode leaderboard: `Asia/Jakarta`.

## 6. Cara menambah game baru

1. `pnpm new-game <slug>`.
2. Isi `manifest.ts` (id, judul dua bahasa, mode, dukungan mobile, aturan skor, `client` lazy) dan ganti `thumbnail.svg` (400x180) dengan gambar kartu game; tanpa berkas itu kartu di beranda memakai inisial.
3. Bangun `client/`; tambah `server/` bila perlu; logika murni di `shared/` dengan unit test.
4. Tulis `locales/id.json` dan `en.json`.
5. Migrasi (bila ada tabel): `games/<slug>/db`, tabel berawalan `<slug>_`.
6. Uji di viewport mobile dan desktop; tambah satu E2E alur utama.
7. Game muncul di admin sebagai `Nonaktif`; admin menyalakannya.

## 7. Alur kerja agent

1. **Baca dulu.** ROADMAP untuk tugas, PRD untuk maksud, Architecture untuk batasan, API_Spec untuk kontrak, Screens dan Design_System untuk tampilan, Porting_Guide untuk game lama.
2. **Ikuti ROADMAP** berurutan (fase dan nomor tugas). Jangan loncat fase tanpa alasan; tandai tugas yang selesai di `docs/progress.md` (buat saat P1-01) dengan tanggal dan catatan singkat.
3. **Perubahan kecil dan terfokus.** Satu perubahan untuk satu tujuan. Jangan merombak hal di luar permintaan.
4. **Tulis tes** untuk logika baru (engine, auth, jadwal, skor). Perbaikan bug dimulai dengan tes yang gagal.
5. **Jalankan** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm i18n:check` sebelum menyatakan selesai.
6. **Tanyakan** bila ada keputusan produk yang belum jelas (lihat PRD §8 dan Architecture §17), jangan menebak.
7. **Laporkan jujur:** sebutkan apa yang diubah, apa yang diuji, dan apa yang belum diverifikasi.
8. Commit hanya bila diminta. Pesan commit ringkas dengan pola `tipe(area): deskripsi` (mis. `feat(auth): add register endpoint`).

## 8. Definisi selesai

Sebuah pekerjaan dianggap selesai jika:
- [ ] Sesuai PRD dan tidak melanggar aturan di bagian 5.
- [ ] Lint, typecheck, tes, dan `i18n:check` lolos.
- [ ] Tampilan diperiksa di 360px dan desktop, mode terang dan gelap.
- [ ] Teks tersedia dalam `id` dan `en`.
- [ ] Tidak ada aset atau permintaan ke domain eksternal.
- [ ] Migrasi (bila ada) berjalan dari database kosong dan dari versi sebelumnya.
- [ ] Dokumentasi diperbarui jika perilaku atau kontrak berubah.

## 9. Hal yang tidak boleh dilakukan

- Mengimpor kode antar game, atau mengedit file inti hanya untuk menambah satu game.
- Menulis teks UI, warna, atau jarak mentah di komponen.
- Menambahkan CDN, tracker, atau layanan eksternal.
- Menyimpan password atau token mentah, atau mencatatnya di log.
- Memberi admin kemampuan bermain, atau pemain akses ke panel admin.
- Menggunakan data atau akun dari `performance_dash`.
- Menjalankan perintah destruktif pada database (drop, truncate) tanpa konfirmasi pemilik proyek.
- Memulai coding sebelum pemilik proyek menginstruksikan eksekusi.
- Menyalin atau mengimpor langsung dari `reference/performance_dash-games/` ke kode aplikasi tanpa mengganti ketergantungan lama (lihat Porting_Guide §0); folder itu hanya acuan dan tidak boleh dikompilasi.
- Mengubah keputusan di ROADMAP §0 tanpa persetujuan pemilik.

## 10. Pertanyaan terbuka yang perlu keputusan pemilik

Sudah diputuskan: Fastify + pnpm + Node, leaderboard per game, Ludo sampai 12 pemain, sensor kata kasar, hapus akun mandiri, HTTPS di LAN bebas. Masih terbuka (PRD §8): keterbacaan Ludo 12 pemain di ponsel, retensi chat, perilaku panel chat di halaman game, dan anti-cheat skor.
