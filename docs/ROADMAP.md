# Low Stress — Roadmap dan Daftar Tugas untuk Agent

Versi: 0.1 · Tanggal: 2026-11-04

Dokumen ini adalah **antrean kerja** untuk agent. Kerjakan berurutan per fase. Maksud produk ada di [PRD.md](PRD.md), batasan teknis di [Architecture.md](Architecture.md), tampilan di [Design_System.md](Design_System.md) dan [Screens.md](Screens.md), kontrak API di [API_Spec.md](API_Spec.md), detail porting game di [Porting_Guide.md](Porting_Guide.md), aturan kerja di [Agents.md](../Agents.md).

---

## 0. Keputusan bawaan (jangan tanyakan lagi)

Pertanyaan terbuka di PRD sudah diberi nilai bawaan agar agent tidak terhenti. Ubah hanya bila pemilik proyek meminta.

| # | Topik | Keputusan bawaan |
|---|---|---|
| D1 | Runtime dan tooling | Node 22 LTS, pnpm, TypeScript strict. Bun tidak dipakai. |
| D2 | Backend | Fastify + Socket.IO. |
| D3 | Leaderboard | Per game; periode weekly, monthly, all time; top 10 + posisi sendiri. |
| D4 | Ludo maksimum pemain | Konstanta `MAX_PLAYERS = 12` di engine, ditambah pengaturan admin `ludo.maxPlayers` (bawaan 12, rentang 2–12) agar bisa diturunkan bila papan tidak terbaca di ponsel. |
| D5 | Chat publik | Retensi 7 hari, maks 300 karakter, 1 pesan per 2 detik, 50 pesan terakhir saat dibuka. Di halaman game desktop panel **terlipat secara bawaan**. |
| D6 | Anti-cheat skor | Hanya validasi kewajaran di server. Memory Match mengirim juga `moves` dan `combos` agar server dapat menghitung ulang skor (lihat Porting_Guide §3). |
| D7 | HTTPS di LAN | HTTP bawaan. Profil Caddy dengan CA internal didokumentasikan sebagai opsi; tidak wajib. |
| D8 | Sensor nama tampilan | Disensor saat dirender; nilai asli tetap di DB. Pendaftaran tidak ditolak karena kata kasar. |
| D9 | Validasi akun | Username 3–20 karakter `[a-z0-9_.]` (disimpan huruf kecil); nama tampilan 2–24 karakter; password minimal 8 karakter dan tidak sama dengan username; email format valid dan unik. |
| D10 | Status awal game | Game baru hasil sinkronisasi registry berstatus `inactive`. Skrip dev `pnpm db:seed:dev` menyalakan ketiga game dan membuat contoh pengguna. |
| D11 | Mode pendaftaran awal | `lan` → `approval`; `public` → `open`. Bisa diubah admin saat runtime. |
| D12 | Pemilik room Ludo | Host boleh **tidak ikut bermain** (mode pengelola) seperti aplikasi lama. |
| D13 | Versi dependensi | Pasang versi stabil terbaru saat Fase 1 dijalankan, lalu kunci di lockfile. Jangan memakai versi pra-rilis. |
| D14 | Pengguna lama | Tidak ada migrasi akun, skor, atau room dari `performance_dash`. |

---

## 1. Aturan eksekusi

- Satu tugas = satu perubahan yang bisa diuji. Selesaikan, uji, lalu lanjut.
- Setiap tugas punya **kriteria selesai**; jangan menandai selesai sebelum semuanya terpenuhi.
- Setelah tiap fase: jalankan `pnpm lint && pnpm typecheck && pnpm test && pnpm i18n:check`, lalu E2E fase tersebut.
- Jika sebuah tugas menuntut keputusan produk yang tidak ada di dokumen, berhenti dan tanya pemilik; jangan menebak.
- Komit hanya jika diminta pemilik. Format pesan: `tipe(area): deskripsi`.

---

## Fase 1 — Fondasi

| ID | Tugas | Kriteria selesai |
|---|---|---|
| P1-01 | Inisialisasi monorepo pnpm (`apps/web`, `apps/server`, `packages/{sdk,ui,i18n,db}`, `games/`, `tools/`, `docker/`) dengan TypeScript strict dan skrip akar (`dev`, `build`, `test`, `lint`, `typecheck`). | `pnpm install && pnpm typecheck` lolos dari repositori bersih. |
| P1-02 | ESLint + `eslint-plugin-boundaries`: game tidak boleh mengimpor game lain; game hanya boleh memakai `sdk`, `ui`, `i18n`; larangan hex/ukuran mentah di UI. | Tes lint dengan impor terlarang **gagal**; impor sah lolos. |
| P1-03 | `packages/db`: koneksi Drizzle, skema inti (Architecture §6), migrasi awal, perintah `pnpm db:migrate`. | Migrasi berjalan dari database kosong; semua tabel inti ada. |
| P1-04 | `packages/i18n` + `tools/check-i18n`: namespace `common`, pemuatan lazy, deteksi bahasa (akun → localStorage → browser → `DEFAULT_LOCALE`). | `pnpm i18n:check` gagal jika kunci `id` dan `en` berbeda. |
| P1-05 | `packages/ui`: token CSS (terang dan gelap) dari Design_System §3, font di-host sendiri, aset logo (SVG: penuh, horizontal, ikon), komponen dasar (Button, Input, Chip, Modal, Toast, SegmentedControl). | Halaman contoh menampilkan semua komponen di terang dan gelap; kontras sesuai §3.3. |
| P1-06 | `packages/sdk`: tipe `GameManifest`, `GameProps`, helper skor, `profanity` (kerangka), `onUserDeleted`. | Tipe dapat diimpor dari game contoh dan server. |
| P1-07 | Server Fastify: konfigurasi `.env` (Zod), logger pino, penanganan error berkode, `/healthz`, `/readyz`, rate limit dasar. | `/readyz` hijau saat DB hidup, merah saat mati. |
| P1-08 | Registry game (server dan web): pemindaian `games/*/manifest.ts`, sinkron ke tabel `games` tanpa menimpa field admin. | Menambah folder game contoh memunculkan baris `games` berstatus `inactive`. |
| P1-09 | Template game dan `tools/new-game` (`--engine react\|canvas\|phaser`). | `pnpm new-game demo` menghasilkan folder yang lolos lint, typecheck, dan muncul di registry. |
| P1-10 | Docker: `Dockerfile` web dan server, `docker-compose.yml` dengan profil `lan` dan `public` (Caddy), `.env.example`. | `docker compose --profile lan up -d` menjalankan web, server, Postgres; `/healthz` menjawab. |
| P1-11 | CI (GitHub Actions): install, lint, typecheck, test, `i18n:check`, pemeriksa awalan tabel migrasi game. | Pipeline hijau pada repositori kosong. |
| P1-12 | PWA dasar (`vite-plugin-pwa`): manifest, ikon burung 192/512, service worker cache aset statis. | Lighthouse PWA terpasang di HTTPS/localhost; tidak ada cache API. |

## Fase 2 — Auth pemain

| ID | Tugas | Kriteria selesai |
|---|---|---|
| P2-01 | Endpoint register (API_Spec §3) dengan validasi D9, hash argon2id, status sesuai mode pendaftaran. | Username/email ganda ditolak dengan kode yang benar; akun `approval` berstatus `pending`. |
| P2-02 | Login, logout, sesi cookie (hash di tabel `sessions`), lockout 5 gagal/10 menit → kunci 15 menit. | Lockout teruji; ban memutus sesi. |
| P2-03 | CSRF (double-submit + cek Origin) dan header keamanan (CSP asal sendiri). | Permintaan tanpa token ditolak; CSP tidak memblokir aset sendiri. |
| P2-04 | UI: halaman `/login`, `/register`, `/pending` (Screens §2), dua bahasa, mobile-first. | E2E: register → pending → (admin menyetujui, stub) → login; viewport 360 dan 1280. |
| P2-05 | `/api/me`: ambil, ubah bahasa/tema/nama, ganti password. | Preferensi bahasa tersimpan dan dipakai setelah login. |
| P2-06 | Hapus akun sendiri (`DELETE /api/me`, konfirmasi password) + hook `sdk.onUserDeleted`. | Skor dan run hilang; chat menjadi "Pengguna dihapus"; sesi dicabut. |
| P2-07 | Rate limit register dan login per IP/akun; CAPTCHA proof-of-work self-hosted aktif hanya saat `DEPLOY_MODE=public`. | Teruji kedua mode. |

## Fase 3 — Panel admin

| ID | Tugas | Kriteria selesai |
|---|---|---|
| P3-01 | `tools/create-admin` (`pnpm create-admin`): meminta username dan password, menyimpan di tabel `admins`. | Admin dapat login di `/admin`; admin tidak bisa mengakses rute game. |
| P3-02 | Login admin terpisah (cookie `ls_admin`), middleware pemisah peran. | Pemain membuka `/admin` → ditolak; admin memanggil API game → ditolak. |
| P3-03 | Persetujuan: antrean `pending`, setujui/tolak satuan dan massal. | Persetujuan mengubah status dan tercatat di `audit_log`. |
| P3-04 | Pengguna: cari, filter status, suspend, ban, aktifkan, reset password sementara, hapus. | Ban/suspend memutus sesi aktif seketika. |
| P3-05 | Pengaturan: mode pendaftaran, bahasa bawaan, jadwal global, status SMTP (Screens §14). | Perubahan berlaku tanpa restart. |
| P3-06 | `EmailAdapter` (`LogAdapter` bawaan, `SmtpAdapter` terprogram), tombol "Kirim email uji" aktif hanya bila SMTP dikonfigurasi. | Tanpa SMTP: UI menyembunyikan fitur bergantung email. |
| P3-07 | Audit log (semua aksi admin yang mengubah data) dan halamannya. | Setiap aksi P3-03..05 muncul di log dengan pelaku dan waktu. |
| P3-08 | Dashboard admin: pemain aktif harian, game dimainkan, pendaftar baru, antrean. | Angka sesuai data uji. |
| P3-09 | Tampilan admin responsif (tabel → kartu < 768px), dua bahasa. | E2E di 360 dan 1280. |

## Fase 4 — Gerbang game

| ID | Tugas | Kriteria selesai |
|---|---|---|
| P4-01 | Status per game (`active`/`maintenance`/`inactive`) + pesan maintenance dua bahasa + urutan + badge. | `inactive` tidak muncul bagi pemain dan API menolak; `maintenance` tampil terkunci. |
| P4-02 | Jadwal (global dan per game) dengan zona WIB, jendela multi-waktu, lintas tengah malam (porting `commercial-games.ts`). | Tes unit mencakup jendela lintas tengah malam dan hari. |
| P4-03 | Halaman beranda dan kartu game (Screens §5), halaman "game ditutup". | E2E: admin menutup game → pemain melihat kartu terkunci. |
| P4-04 | Gerbang API (`/api/games/:id/*`) memakai status dan jadwal. | Semua rute game menolak di luar jadwal dengan `GAME_CLOSED`. |

## Fase 5 — Memory Match dan leaderboard

| ID | Tugas | Kriteria selesai |
|---|---|---|
| P5-01 | Skor generik: `game_scores`, `game_runs`, `recordScore`, `plausibleRun` per manifest (Porting_Guide §3). | Tes unit: rekor, urutan seri (yang lebih awal menang), `plays`, `best_play`. |
| P5-02 | Leaderboard weekly/monthly/all time dalam WIB (Porting_Guide §6). | Tes batas minggu Senin 00:00 dan bulan tanggal 1 WIB. |
| P5-03 | Port Memory Match ke `games/memory-match` dengan tampilan asli (Porting_Guide §3). | Visual dan suara setara aslinya; skor tersimpan. |
| P5-04 | UI Leaderboard (Screens §8) dengan tab periode dan pilihan game. | E2E: skor baru muncul di papan; baris sendiri tersorot. |
| P5-05 | Batas laju kirim skor dan penandaan run janggal (`flagged`). | Run tak wajar ditandai dan terlihat di admin. |

## Fase 6 — Flappy Bird

| ID | Tugas | Kriteria selesai |
|---|---|---|
| P6-01 | Port engine (`flappy-engine`) dengan tes unit untuk fisika, pipa, skor. | Tes lolos; konstanta sama dengan aslinya. |
| P6-02 | Port render Canvas 2D, 6 karakter, medali, layar Game Over, kontrol sentuh dan keyboard. | Tampilan identik dengan aslinya (Porting_Guide §2). |
| P6-03 | Skala FIT di mobile, tanpa scroll, mendukung `prefers-reduced-motion` (hilangkan kilat). | Uji 360x640 dan 1280x800. |
| P6-04 | Integrasi skor: run dengan skor < 1 tidak dihitung; pilihan karakter disimpan. | Sesuai perilaku `recordScore` lama. |

## Fase 7 — Ludo

| ID | Tugas | Kriteria selesai |
|---|---|---|
| P7-01 | Port engine (`ludo-engine`) ke `games/ludo/shared`, naikkan `MAX_PLAYERS` ke 12, tambah 2 warna, `defaultPawns` untuk 11–12 = 2. | Tes unit geometri 2–12 pemain; simulasi panjang permainan didokumentasikan. |
| P7-02 | Tabel `ludo_rooms`, `ludo_players`, `ludo_messages` dengan migrasi dan `last_activity_at`. | Migrasi lolos dari DB kosong. |
| P7-03 | Server otoritatif via Socket.IO: aksi (API_Spec §9), dadu di server, validasi langkah, persist state, pemulihan setelah restart. | Restart server tidak menghilangkan game berjalan. |
| P7-04 | Autopilot (jeda 1,5 dtk; ambil alih setelah 60 dtk tanpa gerakan) dan penyambungan ulang klien. | Pemain terputus digantikan autopilot lalu bisa mengambil alih lagi. |
| P7-05 | UI lobi room, undangan, papan SVG, pion, dadu, suara, chat room (Screens §9–10), mobile dan desktop. | E2E 2 pemain menyelesaikan game; tampilan 360px terbaca. |
| P7-06 | Kedaluwarsa room: hapus yang tidak aktif > 7 hari (job tiap jam). | Tes dengan jam palsu. |
| P7-07 | Perilaku saat game dimatikan: room dibeku, dilanjutkan saat dinyalakan. | Teruji. |
| P7-08 | Moderasi admin untuk Ludo: daftar room, hapus/reset, kick, lihat chat. | Aksi tercatat di audit log. |
| P7-09 | Uji keterbacaan 12 pemain di 360px; bila gagal, turunkan bawaan `ludo.maxPlayers` atau batasi 12 hanya di desktop, dan catat keputusan. | Keputusan tertulis di PRD §8. |

## Fase 8 — Chat publik, sensor, moderasi, PWA

| ID | Tugas | Kriteria selesai |
|---|---|---|
| P8-01 | `sdk.profanity`: normalisasi (huruf kecil, aksen, leet, simbol, huruf berulang), daftar bawaan Indonesia dan English, pengecualian anti-salah-sensor, tabel `banned_words`. | Tes unit: `b@ng$at`, `aanjiing`, kata wajar yang mirip tidak tersensor. |
| P8-02 | Chat publik: namespace Socket.IO `public-chat`, riwayat, rate limit, sensor di server, job `purge-chat`. | Pesan kasar tersimpan tersensor; pemain `pending` ditolak. |
| P8-03 | Panel chat desktop ≥ 1024px (Screens §11); tidak membuka soket di bawahnya. | Uji: di 768px tidak ada koneksi `public-chat`. |
| P8-04 | Moderasi chat admin: hapus pesan, mute, matikan chat, kelola kata. | Aksi tercatat; pesan terhapus hilang dari klien seketika. |
| P8-05 | Moderasi skor admin: lihat run `flagged`, hapus skor, reset papan periodik. | Teruji. |
| P8-06 | Sensor diterapkan pada chat Ludo dan nama tampilan. | Teruji di semua jalur. |

## Fase 9 — Polish dan rilis

| ID | Tugas | Kriteria selesai |
|---|---|---|
| P9-01 | Audit aksesibilitas (kontras, fokus, label, keyboard, reduced motion). | Tidak ada pelanggaran AA pada layar utama. |
| P9-02 | QA mobile (iOS Safari dan Android Chrome), termasuk soket tersambung ulang saat layar mati. | Daftar uji manual terisi di `docs/qa-mobile.md`. |
| P9-03 | Paket deploy LAN dan Public + panduan instalasi `docs/deploy.md` (termasuk cadangan `pg_dump` dan opsi CA internal). | Pemasangan bersih mengikuti panduan berhasil. |
| P9-04 | Uji beban ringan (200 koneksi Socket.IO bersamaan). | Tidak ada error; memori stabil. |
| P9-05 | Dokumen operasi: variabel `.env`, rotasi rahasia, mengaktifkan SMTP, menambah game baru. | Tinjauan pemilik. |

---

## Matriks lintas fase (berlaku untuk setiap tugas UI)

- Dua bahasa (`id`, `en`) lengkap; `pnpm i18n:check` lolos.
- Diperiksa di 360px dan 1280px; terang dan gelap.
- Tidak ada permintaan ke domain eksternal.
- Memakai token desain, tidak ada nilai mentah.
- Aksi admin tercatat di `audit_log`.
