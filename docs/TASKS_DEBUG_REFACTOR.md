# Low Stress — Tugas Debug dan Refactor

Versi: 0.2 · Tanggal: 2026-11-08 · Untuk dieksekusi agent lain

Dokumen ini adalah antrean kerja **perbaikan dan perapian** setelah Fase 1–9 dan Riot Fase 0–5 selesai. Setiap butir berisi bukti, tindakan, dan kriteria selesai. Baca dulu [Agents.md](../Agents.md), [Architecture.md](Architecture.md), dan [API_Spec.md](API_Spec.md).

Butir bertanda **Perlu keputusan** tidak boleh dikerjakan sebelum pemilik proyek memutuskan.

---

## 0A. Panduan Serah-Terima (Handoff 2026-11-08) — MULAI DARI SINI

Sebagian besar perbaikan kritis (Gelombang 1 s.d. 5) **sudah diimplementasikan dan lolos `pnpm lint`, `pnpm typecheck`, `pnpm i18n:check`, `pnpm check:migrations`, `pnpm check:assets`, serta seluruh unit test non-DB**:

### Yang SUDAH Selesai pada 2026-11-08:
1. **Keamanan, Auth, Principal, Lockout & Job Server:**
   - **CAPTCHA PoW & CSRF:** `registerBodySchema` kini memvalidasi `signature`, `verifyCaptchaSolution` menolak `difficulty < 1` atau tanpa HMAC `signature` valid (`timingSafeEqual`) serta mencegah replay; `createCsrfMiddleware` memeriksa fallback `Referer`, hostname `localhost`/`127.0.0.1` presisi, dan `timingSafeEqual`.
   - **R-02 (`resolvePrincipal`):** Diekstrak ke `apps/server/src/auth/principal.ts` dan dipakai seragam di `auth/middleware.ts`, `games/routes.ts`, `chat/socket.ts`, dan `app.ts`.
   - **D-03 (Jendela Lockout 10 Menit):** Kolom `last_failed_at` ditambahkan ke `login_attempts` (`packages/db/migrations/0002_login_attempts_last_failed.sql`) dan diterapkan di `apps/server/src/auth/lockout.ts`.
   - **D-08 & R-03 (Modul Job Terpusat):** `apps/server/src/jobs/index.ts` (`createJobRunner`) menjadwalkan `purge-chat`, `purge-sessions` (`purgeExpiredSessions`), `purge-login-attempts` (`purgeStaleLoginAttempts`), serta semua `LoadedGame.jobs` dari modul server game.
   - **Hook `onUserDeleted` & Sensor Kata Kasar DB:** `deleteAccount` dan `deleteUserByAdmin` kini memanggil `serverModule.onUserDeleted`; `censorServerText` (dengan `banned_words` DB) diteruskan lewat `GameServerContext.censorText` ke Ludo dan Riot.
   - **Tes Server Baru (`D-02a..d`, `D-03`, `D-08`, `R-02`, `R-03`):** Sudah ditambahkan di `apps/server/test/auth.test.ts` dan `apps/server/test/games-gate.test.ts`.
2. **Perbaikan Kritis Game (Memory Match, Flappy Bird, Ludo, Riot):**
   - **Memory Match:** Fix bug combo pasangan ke-8 (`nextCombos`), pembersihan `flipTimeoutRef` saat restart/unmount, ukuran tombol 44×44px, ganti emoji trofi ke SVG, simpan `bestScore` di `localStorage`, lokalisasi penuh, dan ganti class Material-3 mati dengan token `@low-stress/ui`.
   - **Flappy Bird:** Pembatas tinggi kanvas mobile (`max-height: calc(100dvh - 210px)`) agar pas di `360×640` tanpa scroll, lokalisasi `"Leaderboard"`, dan token `@low-stress/ui`.
   - **Ludo:** Endpoint `POST /api/games/ludo/rooms/:id/respond` + perbaikan terima/tolak undangan di `Lobby.tsx` dan `Room.tsx`, penghapusan `chatOpen` dari dependency `useEffect` socket (agar buka/tutup chat tidak memutus koneksi), suara menang hanya sekali (`prevWinnerRef`), ticker event `pass`/`doubles3`, penolakan koneksi admin di `/ludo`, dan pengalihan ke CPU autopilot bila akun pemain dihapus.
   - **Riot:** Penegakan `ctx.checkGameGate("riot")` di socket `/riot`, sinkronisasi moderasi admin Riot (`reset`/`kick`/`delete`) dengan `globalService` in-memory, penghapusan baris `riot_room_players` yatim, penyembunyian pemain di luar radius pandang (tidak lagi menumpuk di `(0, 0)`), visual 3D hologram & fog blackout, penggantian 33 `WebGLRenderer` di daftar lobi dengan `<AvatarBadge>` 2D SVG, daur ulang `freeSlots` & disposal geometri/material Three.js, sinkronisasi `role` saat reconnect, dukungan kode pendek 6 karakter saat join, sabotase pintu (`isRoomDoorLocked`), multiplier `playerSpeed`, dan persistensi profil `/api/games/riot/profile`.
3. **Perbaikan Klien Web, Token CSS, i18n & Halaman Admin:**
   - **R-01 (`apiFetch`):** Klien HTTP tunggal di `apps/web/src/lib/apiFetch.ts` (header CSRF otomatis, retry sekali saat `CSRF_INVALID`), dipakai di seluruh `features/*/api.ts` dan `GamePage.tsx`.
   - **R-05 & Token CSS (`packages/ui/src/styles.css` & `tailwind.css`):** Semua referensi variabel CSS yang tidak terdefinisi di `styles.css` sudah diperbaiki; `@theme` ditambahkan di `tailwind.css`.
   - **D-04, D-05, D-07 (`HomePage.tsx` & `LeaderboardPage.tsx`):** `formatNextOpenWib` memakai zona waktu `Asia/Jakarta` (WIB); error state dengan tombol "Coba lagi" diterapkan; paksaan `"memory-match"` dihapus dari `LeaderboardPage.tsx`.
   - **D-06 & R-09 (`packages/i18n` & komponen web):** 41 kode error server ditambahkan ke `errors.*` (`id.json` & `en.json`) dengan helper `translateErrorCode`; teks hardcoded di halaman admin & game dipindahkan ke i18n.
   - **R-07 (`usePreferences`):** Hook terpusat di `apps/web/src/features/preferences/usePreferences.ts` menyinkronkan tema dan bahasa tanpa memanggil API pemain dari panel admin.
   - **D-09, R-10 & Halaman Admin Baru:** Kontrak `AdminLeaderboardPage` (`playedAt`/`createdAt`) diperbaiki, kartu mobile `.ls-admin-card-list` ditambahkan di `AdminLeaderboardPage` & `AdminChatPage`, kartu ganda di `AdminGamesPage` diperbaiki, editor jadwal ditambahkan di `AdminSettingsPage` & `AdminGamesPage`, halaman baru `AdminLudoPage` (`/admin/ludo`) dan `AdminRiotPage` (`/admin/riot`) dibuat, halaman 404 dibuat, dan `/showcase` dibatasi ke `import.meta.env.DEV`.
   - **D-12 & D-13:** `.gitattributes` dibuat dan status `AGENTS.md` diperbarui.

### Status Penyelesaian Handoff (2026-11-09):
Seluruh langkah lanjutan telah selesai dieksekusi dan terverifikasi:
1. **Langkah 1 — Tes Regresi Web (`D-02e..i`, `D-04`, `D-05`, `D-07`, `D-11`) — [SELESAI]:**
   - Berkas `apps/web/test/regressions.test.tsx` ditambahkan dan diuji (termasuk pembuktian tes gagal saat perbaikan `formatNextOpenWib` dicabut sementara). Seluruh 6 berkas tes web (42 tes) lolos.
2. **Langkah 2 — Migrasi & Tes Server terhadap Database Uji (`low_stress_test`) — [SELESAI]:**
   - `tools/create-admin/test/create-admin.test.ts` serta `games/ludo/test/{censor,expiration}.test.ts` diperketat agar hanya memuat `.env.test` dan `TEST_DATABASE_URL` (tidak pernah menyentuh `.env` pengembangan). Seluruh 25 berkas tes server (153 tes) lolos 100% terhadap `low_stress_test`.
3. **Langkah 3 — Sisa Refactor, Pemeriksa Otomatis & Playwright E2E — [SELESAI]:**
   - **D-06 (`low-stress/no-jsx-literal`):** Aturan ESLint `tools/eslint-config/rules/no-jsx-literal.js` ditambahkan untuk menolak teks UI literal di JSX dan atribut aksesibilitas; 4 unit test ditambahkan di `tools/eslint-config/test/rules.test.js`.
   - **R-05 (`low-stress/no-raw-design-values` untuk kelas palet Tailwind):** Aturan `no-raw-design-values.js` diperluas menolak kelas warna palet Tailwind mentah (`bg-slate-*`, `text-amber-*`, dll.); seluruh pemakaian di `Lobby.tsx`, `Room.tsx`, `GameScene.tsx`, `memory-match/client/index.tsx`, dan `flappy-bird/client/index.tsx` diganti token `@low-stress/ui`.
   - **D-11 (Service Worker update & banner offline):** Modul `apps/web/src/features/pwa/swState.ts` dan `PwaStatusBanner.tsx` dipasang di `main.tsx` dan `App.tsx` dengan unit test.
   - **R-08 (Satu sumber tipe/skema Zod DTO):** Skema Zod bersama diekspor di `packages/sdk/src/api-contracts.ts` (`@low-stress/sdk`), dipakai oleh web dan server, serta diverifikasi lewat tes kontrak `packages/sdk/test/api-contracts.test.ts` dan `apps/server/test/api-contracts.test.ts`.
   - **R-06 (Pecah berkas besar):** `apps/server/src/admin/service.ts` dipecah ke `admin/services/{audit,users,settings,runs,rooms}.ts`; `apps/server/src/admin/routes.ts` dipecah ke `admin/routes/{rooms,chat}.ts`; `apps/server/src/games/scores.ts` dipecah ke `games/{leaderboard,plausibility,scores}.ts`; `AdminChatPage.tsx` dipecah ke `pages/admin/chat/{ChatMessagesTab,ChatMutesTab,BannedWordsTab}.tsx`; `games/ludo/client/Room.tsx` dipecah ke `client/room/{types,RoomLobbyView,RoomChatDrawer,InviteModal}.tsx`.
   - **D-15, D-09 & D-10 (Playwright E2E & QA Visual Multi-Viewport):** Playwright dipasang (`playwright.config.ts`, `e2e/server.ts`, `e2e/flow.spec.ts`, `pnpm test:e2e`, dan step CI). Menguji alur daftar → pending → admin setujui → login → beranda → ubah tema di profil → keluar pada 360px (`id`) dan 1280px (`en`), serta memverifikasi 0 overflow horizontal di seluruh 10 rute `/admin/*` dan 6 rute pemain/game pada viewport 360px/390px/768px/1280px mode terang & gelap (termasuk perbaikan overflow `.ls-segmented` di `/admin/leaderboard` dan header/grid `/games/memory-match` pada 360px).
   - **D-13 & D-14:** Skrip idempoten `pnpm db:seed:dev` (`packages/db/src/seed-dev.ts`) dibuat dan diuji; pemindaian rahasia git ditambahkan di `pnpm check:migrations` dan Gitleaks di `.github/workflows/ci.yml`.
   - **Menunggu Keputusan Pemilik:** **D-16** (kebijakan cookie pemain & admin di satu browser), **R-11** (pengarsipan/penghapusan `reference/performance_dash-games/`), **RT-14** (uji ponsel fisik), dan **RT-54** (tanda tangan pemilik sebelum mengaktifkan Riot).

---

## 0. Aturan eksekusi

1. **Kerjakan D-01 lebih dulu.** Sampai D-01 selesai, **jangan menjalankan `pnpm test` untuk `apps/server`**: seluruh tes server membaca `DATABASE_URL` dari `.env` dan menulis ke database itu, yang di mesin pemilik adalah database pengembangan berisi akun sungguhan.
2. Satu butir = satu perubahan yang dapat diuji. Jangan menggabungkan butir yang tidak berkaitan.
3. Perbaikan bug dimulai dengan tes yang gagal (lihat [Agents.md](../Agents.md) §7).
4. Setelah tiap butir: `pnpm lint`, `pnpm typecheck`, `pnpm test` (web, paket, dan server terhadap database uji), `pnpm i18n:check`.
5. Perubahan tampilan wajib diperiksa di 360px dan 1280px, mode terang dan gelap, dan hasilnya dilaporkan (sertakan yang **tidak** sempat diperiksa).
6. Catat hasil di [progress.md](progress.md) (tanggal, butir, bukti). Jangan melakukan commit kecuali diminta pemilik.
7. Jangan menyentuh data nyata di database pengembangan. Bila perlu akun uji, buat sendiri dan hapus setelahnya.

Prioritas: **P1** harus dikerjakan lebih dulu, **P2** penting, **P3** perapian.

---

## 1. Sudah diperiksa dan baik (tidak perlu dikerjakan)

| Hal | Bukti |
|---|---|
| Skor Memory Match dihitung ulang di server | `apps/server/src/games/scores.ts:196` (`calculateMemoryMatchScore`) dipakai di baris 289 untuk membandingkan skor kiriman |
| `.env` tidak pernah masuk riwayat git | `git log --all -- .env` kosong; `.gitignore` memuat `.env` dan `.env.*` |
| Alur daftar, login `pending`, login `active`, `/api/me`, `/api/games` | Diuji langsung terhadap server pada 2026-11-05 |
| Hanya satu `Agents.md` di git | `git ls-files` menunjukkan satu entri |

---

## 2. Debug

### D-01 (P1) Tes server menulis ke database pengembangan

**Bukti:** setiap berkas di `apps/server/test/*.test.ts` membaca `DATABASE_URL`; tidak ada `TEST_DATABASE_URL` atau `.env.test`. README sendiri memperingatkan hal ini. CI memakai PostgreSQL sementara, tetapi lokal tidak.

**Tindakan:**
- Pakai `TEST_DATABASE_URL` khusus tes. Tes menolak berjalan bila variabel itu kosong, atau bila nama database tidak berakhiran `_test`, dengan pesan jelas.
- Setup tes membuat skema dari migrasi pada database uji dan membersihkan data antar berkas (transaksi dibatalkan atau `TRUNCATE` hanya pada database uji).
- Sediakan `docker-compose` profil `test` atau skrip `pnpm test:db:up` untuk membuat database uji; dokumentasikan di README.
- Perbarui CI agar memakai variabel yang sama.

**Selesai bila:**
- [x] Menjalankan `pnpm test` hanya dengan `.env` pengembangan **gagal cepat** dengan pesan yang menyebut `TEST_DATABASE_URL`.
- [x] Dengan database uji, seluruh tes server lolos.
- [x] Jumlah baris `users`, `admins`, `games`, `sessions` di database pengembangan sama sebelum dan sesudah menjalankan tes.

### D-02 (P1) Tes regresi untuk perbaikan 2026-11-05 belum ada

Perbaikan berikut dibuat dan diverifikasi manual/curl, **tanpa tes otomatis**. Tambahkan (butuh D-01 untuk tes server):

| # | Kasus | Berkas terkait |
|---|---|---|
| a | `/api/csrf` memakai ulang token dari cookie `ls_csrf`; dua pemanggilan beruntun mengembalikan token sama; cookie rusak diganti | `apps/server/src/auth/routes.ts` |
| b | Login dengan token CSRF dari "tab A" tetap sah setelah "tab B" memanggil `/api/csrf` | idem |
| c | Setelah kunci login berakhir, satu kegagalan **tidak** langsung mengunci lagi (hitungan mulai dari nol) | `apps/server/src/auth/lockout.ts` |
| d | Gerbang game: sesi pemain + cookie admin → 200; hanya cookie admin → 403; pada `/api/games` dan `/api/games/:id/ping` | `auth/middleware.ts`, `games/routes.ts` |
| e | `AdminLoginPage` menampilkan pesan terkunci pada `AUTH_LOCKED` | `apps/web/src/pages/admin/AdminLoginPage.tsx` |
| f | `getCsrfToken` mendahulukan cookie `ls_csrf` | `apps/web/src/features/auth/api.ts` |
| g | `applyUserPreferences`: akun `system`/`auto` mempertahankan pilihan lokal lalu mendorongnya ke akun; pilihan eksplisit akun menang | `features/auth/AuthContext.tsx` |
| h | `ProfilePage`: ubah nama, ganti password (galat password salah dan lemah), hapus akun dengan konfirmasi, tombol keluar | `pages/ProfilePage.tsx` |
| i | `getGameThumbnail` menemukan `games/*/thumbnail.svg` dan kartu jatuh ke inisial bila tidak ada | `features/games/thumbnails.ts`, `pages/HomePage.tsx` |

**Selesai bila:** semua kasus punya tes yang gagal bila perbaikannya dicabut (buktikan dengan mencabut sementara satu perbaikan).

### D-03 (P2) Aturan kunci login tidak sesuai spesifikasi

**Bukti:** [Architecture.md](Architecture.md) §7 menyatakan 5 kegagalan **dalam 10 menit** mengunci 15 menit. `apps/server/src/auth/lockout.ts` hanya menghitung kegagalan tanpa jendela waktu (tabel `login_attempts` tidak punya penanda waktu kegagalan terakhir), jadi lima kegagalan yang tersebar berhari-hari tetap mengunci.

**Tindakan:** tambah kolom (mis. `last_failed_at`) lewat migrasi; kegagalan lebih tua dari 10 menit mengosongkan hitungan. Perbarui tes dan dokumen.

**Selesai bila:** tes membuktikan 4 kegagalan, jeda 11 menit, lalu 1 kegagalan **tidak** mengunci; 5 kegagalan dalam 10 menit mengunci 15 menit.

### D-04 (P2) Ringkasan jadwal di beranda memakai zona waktu browser tetapi berlabel WIB

**Bukti:** `apps/web/src/pages/HomePage.tsx:65-66` memakai `nextDate.getDay()` dan `getHours()` (waktu lokal browser), lalu menampilkannya sebagai "WIB".

**Tindakan:** hitung hari dan jam dengan `Intl.DateTimeFormat` zona `Asia/Jakarta`. Tambahkan tes dengan `TZ=America/New_York` dan `TZ=Asia/Tokyo`.

**Selesai bila:** keluaran sama di semua zona waktu browser.

### D-05 (P2) Galat jaringan ditelan diam-diam

**Bukti:** `HomePage.tsx` memakai `.catch(() => undefined)` dan `LeaderboardPage.tsx` `.catch(() => {})`. Inilah yang membuat masalah "game tidak muncul" (API menolak karena cookie admin) tampak sebagai daftar kosong tanpa pesan.

**Tindakan:** tampilkan keadaan galat dengan pesan terjemahan dan tombol "Coba lagi"; bedakan galat 403/closed, jaringan, dan kosong. Terapkan di beranda, leaderboard, dan `GameLeaderboard`.

**Selesai bila:** tes menyimulasikan respons 403, 500, dan jaringan putus, dan UI menampilkan pesan yang berbeda dari keadaan kosong.

### D-06 (P2) Teks UI tertulis langsung di komponen (melanggar [Agents.md](../Agents.md) §5.2)

**Bukti:**
- `games/flappy-bird/client/index.tsx:56,188` dan `games/memory-match/client/index.tsx:60,190`: teks "Leaderboard"
- `apps/web/src/pages/LeaderboardPage.tsx:67` dan `pages/admin/AdminLeaderboardPage.tsx:13`: label "Memory Match"
- `apps/web/src/pages/HomePage.tsx:83`: fallback `"Pemain"`
- Lobi Ludo memuat "pemain" tertulis tetap (sudah diperbaiki 2026-11-05); kemungkinan ada kasus lain.

**Tindakan:** pindahkan ke kunci i18n; cari kasus lain (teks literal di JSX, atribut `aria-label`, `title`, `placeholder`); tambahkan pemeriksa otomatis (aturan ESLint atau skrip di `tools/`) yang gagal bila ada teks literal berhuruf di JSX di luar daftar pengecualian.

**Selesai bila:** pemeriksa lolos dan pernah dibuktikan gagal pada kasus di atas.

### D-07 (P2) Leaderboard memaksa "memory-match"

**Bukti:** `LeaderboardPage.tsx` memakai `useState("memory-match")` dan menampilkan chip "Memory Match" tertulis tetap bila daftar game kosong.

**Tindakan:** pilih game pertama dari API; bila kosong tampilkan keadaan kosong; jangan tampilkan chip palsu.

### D-08 (P2) Pembersihan sesi dan percobaan login belum ada

**Bukti:** `apps/server/src/jobs/` kosong. Job chat ada di `chat/purge.ts` dan kedaluwarsa Ludo di `ludo/expiration.ts`, tetapi tidak ada pembersihan sesi kedaluwarsa atau `login_attempts` lama ([Architecture.md](Architecture.md) §13 menyebutnya). Database pengembangan memuat satu sesi pemain yatim (pemilik sudah terhapus).

**Tindakan:** tambah job `purge-sessions` (harian) dan `purge-login-attempts`; pastikan penghapusan akun menghapus sesinya. Gabungkan dengan R-03.

**Selesai bila:** tes dengan jam palsu membuktikan sesi kedaluwarsa dan percobaan lama terhapus, sesi valid tidak.

### D-09 (P2) Halaman admin belum diperiksa setelah Tailwind diaktifkan

Tailwind (termasuk preflight) baru dihubungkan pada 2026-11-05. Halaman pemain, game, dan login sudah dilihat; **halaman admin belum**. Preflight mengatur ulang margin, border, dan daftar.

**Tindakan:** periksa semua `/admin/*` (dashboard, approvals, users, games, leaderboard, chat, settings, audit) di 360px/768px/1280px, terang dan gelap; perbaiki regresi (tabel, border, judul, laci menu, kartu mobile).

### D-10 (P2) QA visual mode terang dan layar ponsel

Pemeriksaan 2026-11-05 hanya tema gelap di lebar 1024px dan satu pemeriksaan 375px. **Tindakan:** QA seluruh halaman pemain dan ketiga game di 360/390/768/1280, terang dan gelap, termasuk panel chat mengambang (bila menutupi konten, usul: terlipat bawaan di bawah lebar tertentu) dan thumbnail kartu. Selesaikan juga **P7-09**: keterbacaan Ludo 12 pemain di 360px (lihat [ROADMAP.md](ROADMAP.md)).

### D-11 (P2) Service worker dapat menyajikan aset lama

**Bukti:** `registerSW({ immediate: true })` di `main.tsx` dengan precache aset statis. Belum ada pengujian alur pembaruan.

**Tindakan:** uji bahwa setelah deploy versi baru, pengguna mendapat versi baru (tanpa memuat ulang paksa) dan klien lama tidak rusak terhadap API baru; tambahkan pesan "versi baru tersedia" bila perlu.

### D-12 (P3) Akhir baris Windows

**Bukti:** satu tes (`admin-ui.test.tsx`) gagal di Windows karena CRLF (sudah dinormalkan). Tidak ada `.gitattributes`; git memperingatkan konversi LF→CRLF.

**Tindakan:** tambah `.gitattributes` (`* text=auto eol=lf`, berkas biner ditandai), normalkan ulang repositori dalam satu commit terpisah, dan cari tes lain yang membaca berkas sumber.

### D-13 (P3) Dokumen usang

- `Agents.md` baris status masih menyatakan "perencanaan selesai, belum ada kode"; perbarui menjadi status sebenarnya (Fase 1–9 selesai) dan arahkan ke dokumen ini.
- [ROADMAP.md](ROADMAP.md) D10 menyebut `pnpm db:seed:dev` yang **tidak ada**. Buat skrip idempoten (menyalakan ketiga game; tanpa membuat pengguna palsu di database sungguhan) atau hapus rujukannya.
- Pastikan [README.md](../README.md), [Architecture.md](Architecture.md), dan `docs/TASKS.md` tidak saling bertentangan; hapus duplikasi (`TASKS.md` vs [ROADMAP.md](ROADMAP.md)).

### D-14 (P3) Kredensial database pengembangan

`.env` pemilik memuat kata sandi database dalam teks biasa dan alamat LAN. Repositori aman (lihat §1), tetapi:
- Tambahkan pemindaian rahasia di CI (mis. gitleaks).
- Dokumentasikan agar kata sandi bawaan seperti `admin123` tidak dipakai di lingkungan bersama.

### D-15 (P2) Tidak ada tes E2E

**Bukti:** tidak ada Playwright, folder `e2e/`, atau skrip `test:e2e` meski [ROADMAP.md](ROADMAP.md) dan [Agents.md](../Agents.md) menyebutnya.

**Tindakan:** pasang Playwright (database uji, D-01) dengan alur: daftar → pending → admin menyetujui → login → beranda menampilkan game → profil ubah tema → keluar. Jalankan di viewport 360 dan 1280, dua bahasa. Tambahkan ke CI.

### D-16 **Perlu keputusan** Cookie pemain dan admin dalam satu browser

Satu browser bisa memegang `ls_session` dan `ls_admin` sekaligus; inilah yang menimbulkan insiden game kosong. Sekarang sesi pemain diutamakan pada gerbang game. Pilihan: (a) biarkan seperti sekarang, (b) login admin menghapus cookie pemain dan sebaliknya, (c) panel admin pada subdomain/asal terpisah. Tanyakan pemilik sebelum bertindak.

---

## 3. Refactor

### R-01 (P1) Satu klien HTTP untuk web

**Bukti:** `parseResponse` disalin di tiga berkas: `features/auth/api.ts`, `features/admin/api.ts`, `features/games/api.ts`; header CSRF disusun manual di puluhan tempat.

**Tindakan:** buat `apiFetch` bersama (kirim `x-csrf-token` dari cookie, ulangi sekali bila `CSRF_INVALID`, urai galat menjadi `ApiError` bertipe, penanganan 401). Ganti semua pemanggil. Perilaku tidak berubah; tes D-02 tetap lolos.

### R-02 (P1) Satu tempat menentukan "siapa pemanggil" di server

**Bukti:** logika cookie admin/pemain tersebar di sepuluh tempat (`auth/middleware.ts` ×3, `games/routes.ts`, `admin/routes.ts`, `ludo/socket.ts`, `chat/socket.ts`, dan lainnya) dengan aturan prioritas yang tidak sama; itulah akar bug gerbang game.

**Tindakan:** buat `resolvePrincipal(cookies)` yang mengembalikan `{ kind: "user" | "admin" | "none", ... }` dengan aturan prioritas tunggal, dan pakai di semua gerbang HTTP dan soket. Tambahkan tes matriks (tanpa cookie, hanya pemain, hanya admin, keduanya, sesi kedaluwarsa, pending, banned).

### R-03 (P2) Modul job terjadwal

**Bukti:** folder `apps/server/src/jobs/` kosong; logika job tersebar (`chat/purge.ts`, `ludo/expiration.ts`, penjadwalan di `app.ts`).

**Tindakan:** daftar job terpusat (nama, interval, fungsi) dengan start/stop, log, dan penanganan galat; pindahkan job yang ada, tambah job D-08. Uji dengan timer palsu.

### R-04 (P1) Mesin Ludo terduplikasi dan server Ludo berada di inti

**Bukti:**
- `apps/server/src/ludo/engine.ts` (517 baris) dan `games/ludo/shared/engine.ts` (518 baris) hampir identik (berbeda satu baris komentar ESLint).
- `games/ludo/server/` **tidak ada**; seluruh logika server Ludo (`apps/server/src/ludo/*`, `service.ts` 879 baris) ada di inti, bertentangan dengan [Agents.md](../Agents.md) §5.1 dan [Architecture.md](Architecture.md) §4 (satu game = satu folder).

**Tindakan:**
1. Hapus salinan; server mengimpor engine dari `games/ludo/shared` lewat jalur yang diizinkan registry.
2. Pindahkan logika server Ludo ke `games/ludo/server` dan muat lewat `manifest.server` (perluas kontrak `sdk` bila perlu, bukan jalan pintas).
3. Lakukan hal yang sama untuk logika skor khusus game di inti (`games/scores.ts`) bila ada aturan per game.

**Selesai bila:** tidak ada `ludo` di `apps/server/src` selain pemuat generik; menghapus folder `games/ludo` tidak merusak build inti (hanya game itu hilang); tes Ludo tetap lolos. **[SELESAI 2026-11-05]** Logika server dipindahkan ke `games/ludo/server/` dan dimuat dinamis oleh `loadGameServerModules`. Duplikasi `engine.ts` dihapus, tes Ludo dan sensor berjalan mulus, build inti lolos.

### R-05 (P2) Warna Tailwind mentah di komponen (melanggar [Agents.md](../Agents.md) §5.4)

**Bukti:** sekitar 208 pemakaian kelas palet (`bg-slate-*`, `text-blue-*`, `border-slate-*`, `bg-white`, dan sejenisnya) di `games/ludo/client/{Die,Lobby,Room}.tsx` dan `apps/web/src/features/leaderboard/GameLeaderboard.tsx`. Aturan lint `no-raw-design-values` tidak menangkap kelas Tailwind, dan warna ini tidak mengikuti mode gelap.

**Tindakan:**
- Petakan token ke tema Tailwind di `apps/web/src/tailwind.css` (`@theme` dengan `--color-primary: var(--primary)` dan seterusnya) sehingga `bg-primary`, `text-secondary` memakai token.
- Ganti kelas palet pada komponen di atas dengan kelas bertoken.
- Tambahkan aturan lint yang melarang kelas palet Tailwind di luar daftar pengecualian. **Pengecualian sah:** warna di dalam papan, dadu, dan pion Ludo serta kanvas game (tampilan asli dipertahankan, [Porting_Guide.md](Porting_Guide.md) §0); dokumentasikan di berkas aturan.

### R-06 (P2) Berkas terlalu besar

Pisahkan menurut tanggung jawab tanpa mengubah perilaku:

| Berkas | Baris | Saran |
|---|---|---|
| `apps/server/src/admin/service.ts` | 1270 | per modul: users, games, settings, runs, chat, audit |
| `games/ludo/client/Room.tsx` | 906 | lobi, papan, panel chat, kontrol giliran, hook soket |
| `apps/server/src/ludo/service.ts` | 879 | ikut R-04 |
| `apps/server/src/admin/routes.ts` | 615 | per modul, sejalan dengan service |
| `apps/server/src/games/scores.ts` | 572 | skor generik, leaderboard, validasi per game |
| `apps/web/src/pages/admin/AdminChatPage.tsx` | 541 | daftar pesan, mute, daftar kata |

Tes yang ada harus tetap lolos tanpa diubah (bukti perilaku tidak berubah).

### R-07 (P2) Logika preferensi tema/bahasa duplikat

`App.tsx`, `AdminLayout.tsx`, dan `ProfilePage.tsx` masing-masing menyimpan state dan handler tema/bahasa. Ekstrak `usePreferences()` (state, ubah, simpan ke akun bila login). Panel admin tidak boleh memanggil API pemain.

### R-08 (P2) Satu sumber tipe antara server dan web

`Me`, `PublicConfig`, `GameItem`, `AdminUserItem`, dan sejenisnya didefinisikan dua kali (server dan `apps/web/src/features/*/types.ts`). Pindahkan skema Zod ke paket bersama (mis. `packages/sdk` atau `packages/api-types`) dan turunkan tipe darinya. Tambahkan tes kontrak yang membandingkan respons nyata dengan skema dan [API_Spec.md](API_Spec.md).

### R-09 (P2) Pemetaan kode galat ke teks terpusat

`LoginPage.mapErrorMessage`, `ProfilePage`, dan halaman admin memetakan kode galat sendiri-sendiri. Buat `errorMessage(code, params)` memakai kunci `errors.<KODE>` di `common`; tambahkan tes bahwa **setiap kode galat server** (lihat [API_Spec.md](API_Spec.md) §1 dan modul `errors.ts`) punya terjemahan `id` dan `en`.

### R-10 (P3) `/showcase` ikut produksi

`apps/web/src/App.tsx:253` mendaftarkan `/showcase` untuk semua lingkungan. Batasi ke mode pengembangan (`import.meta.env.DEV`) agar tidak terkirim ke produksi.

### R-11 (P3) Folder referensi

`reference/performance_dash-games/` hanya acuan porting. Setelah porting dinyatakan selesai oleh pemilik: pindahkan ke arsip di luar repositori atau hapus, dan pastikan tidak masuk build, lint, atau grafik pengetahuan.

---

## 4. Urutan yang disarankan

1. D-01 → D-02 → R-01 → R-02 (fondasi uji dan gerbang)
2. R-04 (mesin Ludo dan isolasi), D-03, D-08 + R-03
3. D-04, D-05, D-06, D-07, R-09
4. R-05, D-09, D-10, D-11
5. D-15, R-06, R-07, R-08
6. D-12, D-13, D-14, R-10, R-11
7. D-16 setelah keputusan pemilik

## 5. Definisi selesai (seluruh dokumen)

- [x] Semua butir P1 dan P2 tercentang dengan bukti di [progress.md](progress.md).
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm i18n:check`, dan E2E lolos di CI.
- [x] Menjalankan tes tidak mengubah database pengembangan.
- [x] Tidak ada teks UI literal dan tidak ada warna palet mentah di luar pengecualian yang tertulis.
- [x] Hal yang tidak sempat diperiksa dicatat, bukan diklaim selesai (D-16, R-11, RT-14 ponsel fisik, dan tanda tangan pemilik RT-54 menunggu pemilik).
