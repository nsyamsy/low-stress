# Review dan Refaktor Fase 1 — Low Stress

Dokumen ini berisi hasil review independen dan refaktor ringan terhadap fondasi Fase 1 yang diselesaikan oleh Opencode (lihat `TASKS.md` dan `docs/progress.md`), diverifikasi terhadap kriteria `ROADMAP.md` serta aturan `Agents.md` §5 dan §9.

---

## 1. Hasil Validasi Tugas Selesai (ROADMAP & Agents.md)

| ID | Tugas | Status ROADMAP | Evaluasi Reviewer |
|---|---|---|---|
| **P1-01** | Monorepo pnpm + TypeScript strict + skrip akar | Selesai | **Lolos.** Monorepo 12 paket, `tsconfig.base.json` memakai `strict: true` dan `noUncheckedIndexedAccess: true`. Skrip akar `dev`, `build`, `test`, `lint`, `typecheck`, `i18n:check`, `check:migrations` berfungsi normal. |
| **P1-02** | ESLint + boundaries (isolasi game, larangan nilai mentah) | Selesai | **Lolos.** Menggabungkan `eslint-plugin-boundaries` dengan 2 aturan kustom: `game-workspace-imports` (memastikan game hanya mengimpor `sdk`, `ui`, `i18n`) dan `no-raw-design-values` (menolak hex, fungsi warna, dan ukuran berunit di UI). 8 unit test aturan ESLint lolos. |
| **P1-03** | `packages/db` Drizzle + skema inti + migrasi | Selesai | **Lolos.** 13 tabel inti Architecture §6 terdefinisi lengkap (`admins`, `audit_log`, `banned_words`, `chat_messages`, `chat_mutes`, `email_tokens`, `game_runs`, `game_scores`, `games`, `login_attempts`, `sessions`, `settings`, `users`), ekstensi `citext` terdaftar, migrasi Drizzle `0000_plain_scorpion.sql` valid dan skrip `pnpm db:migrate` siap. |
| **P1-04** | `packages/i18n` + `tools/check-i18n` | Selesai | **Lolos.** Namespace `common` lazy-loadable, deteksi bahasa mengikuti urutan spesifikasi (`akun → localStorage → browser → DEFAULT_LOCALE`), `pnpm i18n:check` memvalidasi paritas kunci `id.json` dan `en.json` (17 unit test lolos). |
| **P1-05** | `packages/ui` token / font / logo / komponen | Sebagian (terhalang) | **Sesuai batasan.** Komponen tampil di terang/gelap tanpa overflow. Masalah rasio kontras token §3.3 tetap ditangguhkan menunggu keputusan pemilik proyek sesuai aturan; token §3.2 tidak diubah. |
| **P1-06** | `packages/sdk` kontrak game | Selesai | **Lolos.** Tipe `GameManifest`, `GameProps`, helper skor (`compareScores`, `isBetterScore`, `isPlausibleRun`), kerangka sensor kata kasar `sdk.profanity`, dan hook `onUserDeleted` tersedia. 19 unit test lolos. |
| **P1-07** | Server Fastify (env Zod, pino, error berkode, healthz/readyz, rate limit) | Selesai | **Lolos (dengan perbaikan refactor).** `/healthz` dan `/readyz` teruji, validasi konfigurasi Zod ketat. (Lihat temuan redaksi pino dan penanganan 4xx di bawah). |
| **P1-08** | Registry game server + web | Selesai | **Lolos.** Pemindaian folder `games/*/manifest.ts` saat boot server dan build web. `syncGameRegistry` hanya memasukkan baris baru sebagai `inactive` tanpa menimpa konfigurasi admin (`status`, `schedule`, `sort_order`, `badge`). |
| **P1-09** | Template game + `tools/new-game` | Selesai | **Lolos.** Perintah `pnpm new-game <slug>` teruji membuat folder baru lengkap (manifest, client, locales, shared, db) yang langsung lolos lint, typecheck, dan paritas i18n. |
| **P1-10** | Docker + Compose (lan/public) + `.env.example` | Terhalang | **Sesuai batasan.** Berkas konfigurasi Docker, Caddy, dan Nginx siap namun belum dijalankan karena mesin tidak memiliki Docker daemon. |
| **P1-11** | CI GitHub Actions + pemeriksa migrasi | Sebagian (terhalang) | **Sesuai batasan.** `check:migrations` lolos, workflow CI siap di `.github/workflows/ci.yml`, menunggu inisialisasi repo/remote git. |
| **P1-12** | PWA dasar (`vite-plugin-pwa`) | Selesai | **Lolos.** Manifest PWA, service worker Workbox dengan navigasi fallback denylist `/api/` dan `/ws`, ikon burung 192/512 self-host, tidak ada precache untuk endpoint dinamis. |

---

## 2. Temuan Nyata

1. **Redaksi Logger Pino belum mencakup hash dan payload bersarang** (`Agents.md` §5.6)
   - **Lokasi:** `apps/server/src/app.ts:27-35`
   - **Deskripsi:** Daftar `redact.paths` awal hanya mencantumkan `"password"` dan `"token"` pada level teratas. `passwordHash`, `tokenHash`, serta properti bersarang (`*.password`, `*.token`, dsb.) belum terlindungi dari pencatatan log jika objek request atau entitas database dicatat.
   - **Dampak:** Risiko kebocoran hash/token ke output log jika logging diperluas pada Fase 2 (Auth).

2. **Penanganan Error 4xx non-AppError mengembalikan kode `"INTERNAL"`** (`API_Spec.md` §1)
   - **Lokasi:** `apps/server/src/errors.ts:64`
   - **Deskripsi:** Di `createErrorHandler`, jika error memiliki `statusCode < 500` selain `ZodError` dan `AppError` (misalnya payload JSON invalid dari Fastify parser), handler mengirimkan amplop `{ error: { code: "INTERNAL" } }` meskipun status HTTP-nya 400.
   - **Dampak:** Kode `"INTERNAL"` bertentangan dengan API Spec yang mengkhususkan `INTERNAL` untuk error server 500.

3. **Duplikasi tipe module manifest dan tipe longgar di registry server**
   - **Lokasi:** `apps/server/src/registry/games.ts:50-54`
   - **Deskripsi:** Modul impor manifest di-cast sebagai tipe anonim `{ manifest?: unknown; default?: unknown; }` yang duplikasi dari tipe yang sama di `apps/web/src/games/registry.ts:11-14`.

4. **Tipe handler SQL Drizzle dapat diperjelas**
   - **Lokasi:** `packages/db/src/client.ts:9`
   - **Deskripsi:** Properti `sql` pada interface `DbHandle` menggunakan `ReturnType<typeof postgres>` alih-alih mengimpor tipe resmi `Sql` dari paket `postgres`.

5. **Skrip scratch lokal di `packages/db/scripts/` dengan port hardcoded**
   - **Lokasi:** `packages/db/scripts/local-create-db.mjs:3` dan `packages/db/scripts/local-verify.mjs:3`
   - **Deskripsi:** Kedua skrip sisa pengujian manual P1-03 memiliki URL hardcoded `postgres://postgres@127.0.0.1:55432/...`. Meskipun bukan rahasia produksi, skrip ini berpotensi gagal jika dijalankan di lingkungan dengan port standar 5432.

6. **Dependensi Tailwind di `apps/web/package.json` belum diintegrasikan**
   - **Lokasi:** `apps/web/package.json:24,29`
   - **Deskripsi:** `@tailwindcss/vite` dan `tailwindcss` tercantum di devDependencies web, tetapi tidak dimuat di `apps/web/vite.config.ts`. Saat ini seluruh UI menggunakan kelas token murni dari `@low-stress/ui/styles.css`.

7. **ESLint boundary policy mengizinkan `apps/*` mengimpor `packages/db`**
   - **Lokasi:** `tools/eslint-config/index.js:27`
   - **Deskripsi:** Kebijakan boundary mengelompokkan `apps/web` dan `apps/server` ke dalam tipe `app`, sehingga secara teoretis `apps/web` diperbolehkan mengimpor `packages/db` tanpa memicu boundary error (meskipun di kode web saat ini tidak ada impor tersebut).

---

## 3. Perubahan Refaktor yang Dilakukan

Semua perubahan dilakukan secara minimal, terfokus, tanpa mengubah kontrak publik maupun perilaku runtime:

1. **Penguatan Redaksi Logger Pino (`apps/server/src/app.ts`)**:
   - Menambahkan pola wildcard dan hash ke daftar redaksi:
     `"res.headers['set-cookie']"`, `"*.password"`, `"*.*.password"`, `"passwordHash"`, `"*.passwordHash"`, `"*.*.passwordHash"`, `"*.token"`, `"*.*.token"`, `"tokenHash"`, `"*.tokenHash"`, `"*.*.tokenHash"`.
2. **Koreksi Kode Error 4xx (`apps/server/src/errors.ts`)**:
   - Mengubah penanganan error klien (< 500) agar memprioritaskan properti `error.code` Fastify atau fallback `"BAD_REQUEST"` untuk status 400, dan bukan lagi mengirim `"INTERNAL"`.
   - Menambahkan unit test di `apps/server/test/app.test.ts` untuk memastikan 4xx ditangani dengan benar.
3. **Ekspor Tipe `GameManifestModule` (`apps/server/src/registry/games.ts`)**:
   - Mendefinisikan interface eksplisit `GameManifestModule` untuk modul manifest game di sisi server.
4. **Pemberian Tipe `Sql` pada `DbHandle` (`packages/db/src/client.ts`)**:
   - Mengimpor tipe `Sql` dari `postgres` menggantikan `ReturnType<typeof postgres>`.
5. **Parameterisasi Skrip Scratch Database (`packages/db/scripts/`)**:
   - Mengubah `local-create-db.mjs` dan `local-verify.mjs` agar membaca `process.env.DATABASE_URL` dengan fallback port standar 5432.

---

## 4. Hasil Pemeriksaan Ulang

Seluruh verifikasi dijalankan ulang pasca-refaktor dan dinyatakan **100% lolos**:

| Perintah | Hasil | Catatan |
|---|---|---|
| `pnpm lint` | **Lolos (0 error, 0 warning)** | Aturan batas workspace dan nilai desain mentah bersih. |
| `pnpm typecheck` | **Lolos** | TypeScript strict di 12 paket workspace bersih tanpa error tipe. |
| `pnpm test` | **Lolos (68/68 passed)** | 8 berkas tes (sdk: 19, i18n: 12, ui: 7, server: 13, eslint-config: 8, check-i18n: 5, check-migrations: 4). |
| `pnpm i18n:check` | **Lolos** | Semua kunci `id.json` dan `en.json` di seluruh namespace identik. |
| `pnpm check:migrations` | **Lolos** | Struktur skema dan penamaan tabel game sesuai spesifikasi. |
| `pnpm build` | **Lolos** | Build web Vite + PWA (17 precache entries) dan build server berhasil. |

---

## 5. Hal yang Belum Diverifikasi

Sesuai instruksi dan status pengerjaan Fase 1:
- **P1-05 (Kontras Warna):** Masih menunggu keputusan pemilik terkait usulan penyesuaian nilai hex token di `Design_System.md` §3.3 vs toleransi pengecualian desain.
- **P1-10 (Docker Compose):** Menunggu ketersediaan daemon Docker/Podman di host untuk menguji kontainer Web, Server, Postgres, dan Caddy.
- **P1-11 (CI GitHub Actions):** Menunggu inisialisasi git repository dan push ke remote GitHub.
- **Service Worker Live Update:** Belum diuji skenario update service worker pada koneksi HTTPS produksi sebenarnya.
