# Riot — Antrean Tugas Eksekusi

Versi: 0.1 · Tanggal: 2026-11-05 · Untuk dieksekusi agent lain

Pemecahan [konsep Riot](concepts/riot.md) menjadi tugas bergaya [ROADMAP.md](ROADMAP.md). **Baca konsep lebih dulu**, terutama §1 (batasan hak cipta), §3 (aturan), dan §8 (aset). Aturan kerja umum ada di [Agents.md](../Agents.md); arsitektur di [Architecture.md](Architecture.md).

Status: **belum dimulai**. Mulai hanya ketika pemilik menginstruksikannya, dan hanya setelah gerbang Fase 0 terpenuhi.

---

## 0. Aturan khusus game ini

1. **Dilarang** memakai nama, karakter, denah, antarmuka, suara, atau aset milik Among Us/Innersloth, atau meniru tugasnya (kabel, geser kartu, unduh/unggah data, bahan bakar mesin, buang sampah, dan sejenisnya). Denah peta digambar sendiri.
2. **Judul "Riot"** punya risiko merek (konsep §10). Gunakan judul penuh yang mengandung deskriptor, tanpa logo atau gaya visual Riot Games. Jangan menyiratkan afiliasi.
3. **Tidak ada unduhan aset tanpa izin pemilik** (izin untuk unduhan CC0 dari halaman resmi pembuat sudah diberikan pemilik pada 2026-11-06; tetap wajib tercatat) dan tanpa entri di `games/riot/assets/LICENSES.md` (nama, pembuat, URL halaman resmi, lisensi yang dibaca dari halaman resmi, tanggal, berkas yang dipakai). Utamakan CC0; hindari NonCommercial dan NoDerivatives.
4. **Server otoritatif.** Peran, posisi di luar jangkauan pandang, dan hasil tugas tidak pernah dipercaya dari klien; informasi tersembunyi tidak dikirim ke klien yang tidak berhak.
5. Semua teks lewat i18n (`id`, `en`); semua UI mobile-first (360px) dan terkena aturan token desain; chat disensor server; tanpa CDN.
6. Setelah tiap tugas: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm i18n:check`. Catat di [progress.md](progress.md). Jangan commit kecuali diminta.

## 1. Keputusan bawaan

| # | Topik | Keputusan |
|---|---|---|
| R1 | Id game | `riot` (`games/riot/`), rute `/games/riot`, soket namespace `/riot`, tabel berawalan `riot_`, status awal `inactive` |
| R2 | Pemain | Minimal 4. **Tanpa batas atas tetap**; pengaturan admin `riot.maxPlayers` (0 = tanpa batas aplikasi) dan batas pengaman server lewat env `RIOT_HARD_CAP` (bawaan 32) agar server tidak jenuh |
| R3 | Penyusup | Bawaan `ceil(pemain / 6)`, batas atas `floor((pemain - 1) / 2)`; host dapat mengubah |
| R4 | Tick | Server 15 Hz; klien mengirim input 20 Hz; interpolasi di klien |
| R5 | Anggaran ponsel | ≥ 30 fps, ≤ ~150 draw call, ≤ ~100 ribu segitiga, atlas ≤ 2048px, total aset ≤ ~8–10 MB terkompresi |
| R6 | Aksi penyusup | Visual netral: korban memudar jadi hantu, meninggalkan penanda hologram yang dapat dilaporkan; tanpa darah |
| R7 | Karakter | Gabungan: tipe tubuh Mochi (prosedural, buatan sendiri) dan Humanoid (aset CC0), plus aksesori |
| R8 | Poin | Menang +10, tugas selesai +1 per tugas (batas per ronde), menebak penyusup +2; dihitung server |
| R9 | Orientasi | `any`; lanskap disarankan di ponsel |
| R10 | Render | three.js + `@react-three/fiber` + `drei`, dimuat lazy hanya di game ini |

---

## Fase 0 — Prasyarat dan gerbang

**Gerbang:** [TASKS_DEBUG_REFACTOR.md](TASKS_DEBUG_REFACTOR.md) **D-01** (database uji terpisah) dan **R-04** (logika server di dalam folder game) harus selesai. Tanpa itu, RT-01 dan seterusnya akan menambah utang pada pola yang salah.

| ID | Tugas | Kriteria selesai |
|---|---|---|
| RT-01 | **Perluas kontrak SDK dan registry.** Temuan: `GameServerModule` di `packages/sdk/src/manifest.ts` hanya punya `registerRoutes` dan `onUserDeleted`, dan registry **belum memuat `manifest.server` sama sekali**. Tambahkan `registerRealtime(io, ctx)` (namespace soket per game), `registerJobs()` (job terjadwal), dan jalur server mencatat skor; muat modul server saat boot. | Game contoh mendaftarkan rute, namespace soket, dan job dari foldernya sendiri; menghapus folder itu tidak merusak inti; tes registry. |
| RT-02 | **Kit room bersama.** Ekstrak primitif lobi/undangan/host/status/kedaluwarsa room (pola Ludo) ke paket bersama (`packages/sdk` atau `packages/rooms`); refaktor Ludo agar memakainya. | Tes Ludo tetap lolos tanpa diubah; Riot dapat memakai kit tanpa mengimpor `games/ludo`. |
| RT-03 | **Buku besar aset dan pipeline.** Alat `tools/check-assets` (CI gagal bila berkas di `games/*/assets/` tidak ada di `LICENSES.md` atau lisensinya NC/ND), skrip kompresi `gltf-transform`/`gltfpack` + WebP, dan aturan ukuran. | CI menggagalkan aset tanpa entri; skrip menghasilkan GLB terkompresi dari contoh. |
| RT-04 | **Template `new-game --engine r3f`** (dan dependensi three/R3F hanya di paket game). | `pnpm new-game demo --engine r3f` menghasilkan game yang lolos lint, typecheck, dan memuat three secara lazy. |
| RT-05 | **Keputusan terbuka pemilik:** nama stasiun dan ruangan, daftar awal spesies (6) dan aksesori (8), judul publik penuh. Tulis ke konsep. | Konsep diperbarui; pemilik menyetujui. |

## Fase 1 — Uji kelayakan (go/no-go)

Tujuan: membuktikan jaringan dan performa ponsel **sebelum** investasi besar. Tanpa peran dan tugas.

| ID | Tugas | Kriteria selesai |
|---|---|---|
| RT-10 | **Kerangka game** `games/riot/`: manifest (`mode: "multiplayer"`, `mobile: any`, `permissions: ["scores","realtime","db"]`), `thumbnail.svg` 400×180 orisinal (bergaya luar angkasa, bukan logo Riot Games), `locales/{id,en}.json`, klien r3f lazy, status `inactive`. | Muncul di registry dan admin sebagai Nonaktif; tidak ada impor lintas game. |
| RT-11 | **Peta greybox v0** dari modul sederhana dengan **denah orisinal**; data tabrakan 2D di `shared/` (JSON) yang dipakai klien dan server. | Satu level 9–11 ruangan; tes tabrakan di server. |
| RT-12 | **Gerak multi-pemain:** input WASD dan joystick virtual (area sentuh ≥ 44px), simulasi otoritatif 15 Hz, prediksi/interpolasi klien, server menolak kecepatan dan tabrakan tidak sah. | Tes unit simulasi; dua klien melihat satu sama lain bergerak mulus; percobaan teleport ditolak. |
| RT-13 | **Interest management:** klien hanya menerima pemain dalam radius pandang; snapshot hemat byte. Simulator **20 klien tanpa kepala** (dan 32). | Laporan: bandwidth per klien, CPU server, p95 latensi; tidak ada posisi di luar jangkauan pandang yang bocor (tes). |
| RT-14 | **Spike performa ponsel:** 20 karakter ber-instance, peta, joystick. Ukur pada ponsel nyata kelas menengah (Android dan iOS). | Laporan `renderer.info` (draw call, segitiga) dan fps terhadap R5; rekomendasi go/no-go tertulis di `progress.md`. |

**Gerbang Fase 1:** pemilik memutuskan lanjut atau berhenti berdasarkan laporan RT-13 dan RT-14.

## Fase 2 — Peran, tugas, kemenangan

| ID | Tugas | Kriteria selesai |
|---|---|---|
| RT-20 | **Mesin aturan murni** di `shared/`: mesin keadaan (lobi → bermain → rapat → voting → selesai), pembagian peran (R3), kondisi menang. | Tes unit dan berbasis properti untuk 4, 5, 12, 20, 32 pemain; penyusup selalu < kru saat mulai. |
| RT-21 | **Loop game server otoritatif:** peran hanya ke pemiliknya, snapshot per klien, pengatur waktu, pembersihan room (kedaluwarsa memakai kit RT-02). | Tes: klien lain tidak pernah menerima peran pemain lain. |
| RT-22 | **Kerangka tugas:** definisi tugas, status, validasi hasil di server, komponen mini-game di klien; implementasi 3 tugas (kalibrasi antena, kebun hidroponik, susun kargo). | Tugas tidak dapat diselesaikan terlalu cepat atau di luar jangkauan (tes); area sentuh ≥ 44px. |
| RT-23 | **Aksi penyusup (netral):** jangkauan, waktu tunggu (diatur host), pemain menjadi hantu, penanda hologram dapat dilaporkan. | Tes aturan; tidak ada elemen darah atau kekerasan pada visual. |
| RT-24 | **Alur menang/kalah dan layar hasil** (peran terungkap, ringkasan tugas, poin). | Satu ronde utuh tanpa rapat dapat diselesaikan oleh bot uji. |

## Fase 3 — Rapat, voting, sabotase, lobi

| ID | Tugas | Kriteria selesai |
|---|---|---|
| RT-30 | **Rapat dan voting:** laporan, tombol rapat (jumlah terbatas), diskusi chat teks (`sdk.profanity`, maks. 300 karakter, rate limit), voting dengan lewati, aturan seri, hantu tidak berbicara ke pemain hidup. | Tes: chat disensor server; hantu tidak bisa mengirim ke hidup; seri tidak menyingkirkan siapa pun. |
| RT-31 | **Sabotase:** pemadaman (radius pandang menyusut di server), kunci pintu sementara, alarm dua titik berbatas waktu. | Tes aturan dan batas waktu; perubahan jangkauan pandang memengaruhi data yang dikirim. |
| RT-32 | **Putus koneksi:** sambung ulang otomatis (juga saat layar ponsel mati), pengambilalihan bot atau dianggap pergi setelah 60 detik, host dapat mengeluarkan pemain. | Tes simulasi putus-sambung; ronde tidak macet. |
| RT-33 | **Lobi:** buat room, undang/daftar room, pilihan karakter, **opsi host** (jumlah penyusup, jumlah tugas, kecepatan, radius pandang, waktu tunggu aksi, durasi diskusi dan voting, jumlah rapat), tombol **Mulai** oleh host (persetujuan master room), minimal 4. | Tes: tidak bisa mulai < 4; batas `riot.maxPlayers` dan `RIOT_HARD_CAP` ditegakkan. |

## Fase 4 — Karakter dan konten

| ID | Tugas | Kriteria selesai |
|---|---|---|
| RT-40 | **Generator Mochi prosedural:** badan bulat, 6 spesies (telinga/ekor/paruh), warna badan (12) dan aksen, aksesori (8) termasuk helm/topi luar angkasa; dirender `InstancedMesh` dengan warna per-instance; alat ekspor GLB. Siluet **bukan** "kacang bervisor". | Tinjauan visual oleh pemilik; 32 karakter lolos anggaran R5. |
| RT-41 | **Tipe tubuh Humanoid** dari paket CC0 yang sudah diverifikasi (mis. Kenney Mini Characters), slot aksesori, dan **skema kustomisasi tunggal** untuk kedua tipe; simpan di tabel `riot_profiles` (migrasi di `games/riot/db`). | Pilihan tersimpan dan dipulihkan; entri `LICENSES.md` lengkap. |
| RT-42 | **Pemilih karakter di lobi** (mobile dan desktop), identifikasi pemain dengan warna **dan** nama **dan** aksesori. | Tidak bergantung warna saja (tes aksesibilitas); area sentuh ≥ 44px. |
| RT-43 | **Tujuh tugas tersisa**, denah final, suara orisinal atau CC0 dengan tombol bisu. | Seluruh 10 tugas lolos tes; suara dapat dibisukan. |
| RT-44 | **Layar Kredit** dan kelengkapan `LICENSES.md`. | `tools/check-assets` hijau. |

## Fase 5 — Integrasi, QA, rilis

| ID | Tugas | Kriteria selesai |
|---|---|---|
| RT-50 | **Poin ke leaderboard:** server mencatat hasil ronde ke sistem skor generik (R8), tanpa menerima skor dari klien. | Tes: klien tidak dapat mengirim skor; papan weekly/monthly/all-time terisi. |
| RT-51 | **Moderasi admin:** daftar room, hapus/reset, keluarkan pemain, lihat chat; semua tercatat di `audit_log`. | Aksi tercatat; pola setara moderasi Ludo. |
| RT-52 | **i18n dan aksesibilitas:** `id`/`en` lengkap; `prefers-reduced-motion` (kurangi goyangan kamera dan kilat); tidak ada informasi hanya lewat warna. | `pnpm i18n:check` lolos; audit manual. |
| RT-53 | **QA:** iOS Safari dan Android Chrome, lanskap dan potret; uji beban 20 dan 32 pemain; E2E Playwright dengan banyak konteks (daftar → bergabung → ronde singkat → hasil). | Laporan angka (fps, bandwidth, CPU) di `progress.md`; E2E hijau di CI. |
| RT-54 | **Tinjauan kemiripan dan nama:** bandingkan denah, tugas, antarmuka, dan suara dengan Among Us dan tulis hasilnya; periksa judul publik terhadap merek Riot Games (konsep §10). **Pemilik menandatangani.** | Dokumen tinjauan di `docs/`; game tetap `inactive` sampai disetujui. |
| RT-55 | **Dokumentasi:** perbarui [Architecture.md](Architecture.md) (kontrak SDK baru), [API_Spec.md](API_Spec.md) (namespace `/riot` dan event), [Screens.md](Screens.md), [PRD.md](PRD.md), dan [Agents.md](../Agents.md). | Dokumen sesuai perilaku nyata. |

---

## 2. Rancangan soket (usulan, akhirnya ditulis di API_Spec pada RT-55)

Namespace `/riot`, autentikasi cookie sesi seperti Ludo (admin ditolak).

| Arah | Event | Isi |
|---|---|---|
| klien → server | `room:join` / `room:leave` | `{ roomId }` |
| klien → server | `input` | `{ seq, dx, dy }` (20 Hz) |
| klien → server | `task:start` / `task:complete` | `{ taskId, proof }` (server memvalidasi) |
| klien → server | `action:eliminate` | `{ targetId }` (hanya penyusup, dalam jangkauan, cooldown) |
| klien → server | `report`, `meeting:call` | `{ markerId }` / `{}` |
| klien → server | `chat:send`, `vote:cast` | `{ body }` / `{ targetId \| "skip" }` |
| klien → server | `sabotage:trigger` | `{ kind }` (hanya penyusup) |
| server → klien | `snapshot` | posisi pemain dalam jangkauan, status, `serverTick` |
| server → klien | `role` | peran (hanya ke pemilik) |
| server → klien | `phase`, `meeting`, `vote:result`, `end` | perubahan fase dan hasil |

## 3. Tabel (awalan `riot_`, migrasi di `games/riot/db`)

`riot_rooms` (id, name, host_id, status, options jsonb, created_at, last_activity_at), `riot_room_players` (room_id, user_id, status, character jsonb), `riot_matches` (id, room_id, started_at, ended_at, winner, players jsonb), `riot_profiles` (user_id, character jsonb, updated_at). Hapus data pemain lewat `onUserDeleted`.

## 4. Urutan dan ketergantungan

`D-01 + R-04` → RT-01 → RT-02 → RT-03/RT-04 (paralel) → RT-05 → **Fase 1 (gerbang)** → Fase 2 → Fase 3 → Fase 4 (RT-40 dapat mulai paralel setelah RT-12) → Fase 5. RT-54 harus selesai sebelum game diaktifkan.

## 5. Definisi selesai

- [ ] Semua tugas Fase 0–5 tercentang dengan bukti di [progress.md](progress.md).
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm i18n:check`, dan E2E lolos.
- [ ] 20 dan 32 pemain lolos anggaran R5 dan laporan jaringan di perangkat nyata.
- [ ] Tidak ada aset tanpa entri lisensi; tidak ada elemen milik Among Us atau Riot Games.
- [ ] Tinjauan RT-54 ditandatangani pemilik.
- [ ] Hal yang tidak sempat diperiksa dicatat, bukan diklaim selesai.
