# TASKS — Antrean eksekusi Low Stress

Sumber kebenaran isi tugas dan kriteria selesai: [ROADMAP.md](ROADMAP.md). File ini hanya papan status.
Aturan: ikuti [Agents.md](../Agents.md). Kerjakan berurutan. Tandai `[x]` hanya bila kriteria selesai di ROADMAP terpenuhi, lalu catat tanggal dan catatan singkat di `docs/progress.md`.
Bila terhalang (keputusan produk tidak ada di dokumen, tool gagal, konflik dokumen): **berhenti dan lapor ke pemilik**, jangan menebak dan jangan memutar jalan.

## Lingkup eksekusi saat ini: Fase 6 (Flappy Bird) — Selesai

Fase 1 selesai kecuali P1-05, P1-10, P1-11 yang menunggu keputusan pemilik atau lingkungan; jangan dikerjakan. Fase 2 (P2-01 sampai P2-07) selesai. Fase 3 (P3-01 sampai P3-09) selesai. Fase 4 (P4-01 sampai P4-04) selesai. Fase 5 (P5-01 sampai P5-05) selesai. Fase 6 (P6-01 sampai P6-04) selesai.

Fase 1 (referensi status):

- [x] P1-01 Monorepo pnpm + TypeScript strict + skrip akar
- [x] P1-02 ESLint + boundaries (isolasi game, larangan nilai mentah)
- [x] P1-03 `packages/db` Drizzle, skema inti, migrasi
- [x] P1-04 `packages/i18n` + `tools/check-i18n`
- [ ] P1-05 `packages/ui` token, font self-host, logo, komponen dasar — **sebagian**: semua komponen tampil di terang/gelap tanpa overflow, tetapi kriteria kontras §3.3 belum terpenuhi penuh. Penyimpangan tercatat di `Design_System.md` §3.3 sebagai usulan agent yang menunggu keputusan pemilik; belum ada pengecualian resmi.
- [x] P1-06 `packages/sdk` kontrak game
- [x] P1-07 Server Fastify: env Zod, pino, error berkode, healthz/readyz, rate limit
- [x] P1-08 Registry game (server dan web)
- [x] P1-09 Template game + `tools/new-game`
- [ ] P1-10 Docker + compose (profil lan/public) + `.env.example` — **berkas siap, belum dijalankan**: Docker/Podman/WSL tidak tersedia di mesin ini
- [ ] P1-11 CI GitHub Actions + pemeriksa awalan tabel migrasi — **sebagian**: `check:migrations` lolos, pipeline belum pernah berjalan (belum ada repo git/remote)
- [x] P1-12 PWA dasar

Fase 2 (auth pemain):

- [x] P2-01 Endpoint register (API_Spec §3) dengan validasi D9, hash argon2id, status sesuai mode pendaftaran
- [x] P2-02 Login, logout, sesi cookie (hash di tabel `sessions`), lockout 5 gagal/10 menit → kunci 15 menit
- [x] P2-03 CSRF (double-submit + cek Origin) dan header keamanan (CSP asal sendiri)
- [x] P2-04 UI: halaman `/login`, `/register`, `/pending` (Screens §2), dua bahasa, mobile-first
- [x] P2-05 `/api/me`: ambil, ubah bahasa/tema/nama, ganti password
- [x] P2-06 Hapus akun sendiri (`DELETE /api/me`, konfirmasi password) + hook `sdk.onUserDeleted`
- [x] P2-07 Rate limit register dan login per IP/akun; CAPTCHA proof-of-work self-hosted aktif hanya saat `DEPLOY_MODE=public`

Fase 3 (Panel admin):

- [x] P3-01 `tools/create-admin` (`pnpm create-admin`): meminta username dan password, menyimpan di tabel `admins`, password argon2id
- [x] P3-02 Login admin terpisah (cookie `ls_admin`), middleware pemisah peran (admin dilarang main game, pemain dilarang akses admin)
- [x] P3-03 Persetujuan: antrean `pending`, setujui/tolak satuan dan massal, penolakan memutus sesi, pencatatan di `audit_log`
- [x] P3-04 Pengguna: cari, filter status, suspend, ban, aktifkan, reset password sementara (argon2id), hapus pengguna + data terkait
- [x] P3-05 Pengaturan: mode pendaftaran (`approval`, `open`, `closed`), bahasa bawaan, jadwal global, status SMTP, limit pemain Ludo, chat toggle
- [x] P3-06 `EmailAdapter` (`LogAdapter` bawaan, `SmtpAdapter` terprogram), endpoint uji email aktif hanya bila SMTP dikonfigurasi
- [x] P3-07 Audit log (semua aksi admin yang mengubah data dicatat dengan pelaku, waktu, aksi, target, detail), filter aksi dan pagination
- [x] P3-08 Dashboard admin: pemain aktif harian, game dimainkan, pendaftar baru hari ini, total pengguna per status, antrean persetujuan
- [x] P3-09 UI admin responsif (`apps/web`): layout drawer di <= 767px (360px) dan sidebar di >= 1024px (1280px), tabel beralih ke kartu di mobile, dua bahasa (`id` dan `en`), tanpa nilai mentah

Fase 4 (Gerbang game):

- [x] P4-01 Status per game (`active`/`maintenance`/`inactive`) + pesan maintenance dua bahasa + urutan + badge. `inactive` tidak muncul bagi pemain dan API menolak; `maintenance` tampil terkunci.
- [x] P4-02 Jadwal (global dan per game) dengan zona WIB, jendela multi-waktu, lintas tengah malam (porting `commercial-games.ts`). Tes unit mencakup jendela lintas tengah malam dan hari.
- [x] P4-03 Halaman beranda dan kartu game (Screens §5), halaman "game ditutup". E2E: admin menutup game → pemain melihat kartu terkunci.
- [x] P4-04 Gerbang API (`/api/games/:id/*`) memakai status dan jadwal. Semua rute game menolak di luar jadwal dengan `GAME_CLOSED`.

Fase 5 (Memory Match dan leaderboard):

- [x] P5-01 Skor generik: `game_scores`, `game_runs`, `recordScore`, `plausibleRun` per manifest (Porting_Guide §3). Tes unit: rekor, urutan seri (yang lebih awal menang), `plays`, `best_play`.
- [x] P5-02 Leaderboard weekly/monthly/all time dalam WIB (Porting_Guide §6). Tes batas minggu Senin 00:00 dan bulan tanggal 1 WIB.
- [x] P5-03 Port Memory Match ke `games/memory-match` dengan tampilan asli (Porting_Guide §3). Visual dan suara setara aslinya; skor tersimpan.
- [x] P5-04 UI Leaderboard (Screens §8) dengan tab periode dan pilihan game. E2E: skor baru muncul di papan; baris sendiri tersorot.
- [x] P5-05 Batas laju kirim skor dan penandaan run janggal (`flagged`). Run tak wajar ditandai dan terlihat di admin.

Fase 6 (Flappy Bird):

- [x] P6-01 Port engine (`flappy-engine`) dengan tes unit untuk fisika, pipa, skor. Tes lolos; konstanta sama dengan aslinya.
- [x] P6-02 Port render Canvas 2D, 6 karakter, medali, layar Game Over, kontrol sentuh dan keyboard. Tampilan identik dengan aslinya (Porting_Guide §2).
- [x] P6-03 Skala FIT di mobile, tanpa scroll, mendukung `prefers-reduced-motion` (hilangkan kilat). Uji 360x640 dan 1280x800.
- [x] P6-04 Integrasi skor: run dengan skor < 1 tidak dihitung; pilihan karakter disimpan. Sesuai perilaku `recordScore` lama.

## Antrean berikutnya (belum diinstruksikan)

- [ ] Fase 7 — Ludo (P7-01..P7-09)
- [ ] Fase 8 — Chat, sensor, moderasi (P8-01..P8-06)
- [ ] Fase 9 — Polish dan rilis (P9-01..P9-05)
