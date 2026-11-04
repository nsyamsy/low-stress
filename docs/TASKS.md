# TASKS — Antrean eksekusi Low Stress

Sumber kebenaran isi tugas dan kriteria selesai: [ROADMAP.md](ROADMAP.md). File ini hanya papan status.
Aturan: ikuti [Agents.md](../Agents.md). Kerjakan berurutan. Tandai `[x]` hanya bila kriteria selesai di ROADMAP terpenuhi, lalu catat tanggal dan catatan singkat di `docs/progress.md`.
Bila terhalang (keputusan produk tidak ada di dokumen, tool gagal, konflik dokumen): **berhenti dan lapor ke pemilik**, jangan menebak dan jangan memutar jalan.

## Lingkup eksekusi saat ini: Selesai Fase 2 (auth pemain)

Fase 1 selesai kecuali P1-05, P1-10, P1-11 yang menunggu keputusan pemilik atau lingkungan; jangan dikerjakan. Fase 2 (P2-01 sampai P2-07) selesai.

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

## Antrean berikutnya (belum diinstruksikan)

- [ ] Fase 3 — Panel admin (P3-01..P3-09)
- [ ] Fase 4 — Gerbang game (P4-01..P4-04)
- [ ] Fase 5 — Memory Match dan leaderboard (P5-01..P5-05)
- [ ] Fase 6 — Flappy Bird (P6-01..P6-04)
- [ ] Fase 7 — Ludo (P7-01..P7-09)
- [ ] Fase 8 — Chat, sensor, moderasi (P8-01..P8-06)
- [ ] Fase 9 — Polish dan rilis (P9-01..P9-05)
