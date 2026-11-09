# Serah-terima: game Riot ("Uproar on the Silent Station")

Tanggal: 2026-11-06 · Untuk agent yang melanjutkan pekerjaan. Baca dokumen ini lebih dulu, lalu [ROADMAP_RIOT.md](ROADMAP_RIOT.md) dan [concepts/riot.md](concepts/riot.md). Aturan umum ada di [Agents.md](../Agents.md).

## 1. Posisi saat ini

| Bagian | Status |
|---|---|
| Gerbang D-01 dan R-04 | Selesai |
| Fase 0 (RT-01 sampai RT-05) | Selesai. RT-05: poin B sampai E disetujui pemilik |
| Fase 1 (RT-10 sampai RT-13) | Selesai. **RT-14 (uji ponsel nyata) belum dilakukan** |
| Fase 2 (RT-20 sampai RT-24) | Selesai (logika dan server) |
| Fase 3 (RT-30 sampai RT-33) | Selesai (logika dan server) |
| Fase 4 (RT-40 sampai RT-44) | Selesai (Mochi 6 spesies, Humanoid CC0, 10 tugas, audio WebAudio, kredit, migrasi `riot_*`) |
| Fase 5 (RT-50 sampai RT-55) | Selesai (poin leaderboard, moderasi admin API + UI `/admin/riot`, i18n/reduced-motion, E2E Socket.IO, draf tinjauan RT-54, dokumentasi). **Menunggu uji ponsel fisik RT-14 dan tanda tangan pemilik pada RT-54** |

Bukti per tugas ada di [progress.md](progress.md). Game berstatus `inactive` dan harus tetap begitu sampai RT-54 ditandatangani pemilik.

## 2. Keputusan pemilik yang berlaku

Sumber: [concepts/riot.md](concepts/riot.md) bagian "Keputusan RT-05".

- Judul publik: **"Uproar on the Silent Station"** (en). Padanan Indonesia **"Gaduh di Stasiun Hening"** adalah turunan asisten dan belum dikonfirmasi pemilik. Kata "Riot" tidak boleh tampil ke pemain. Slug, id, namespace, rute, dan tabel tetap `riot`.
- Disetujui: nama stasiun, 10 ruangan, 6 spesies Mochi, 8 aksesori.
- Gerbang Fase 1: pemilik menyatakan lanjut tanpa menunggu uji ponsel.
- Mengunduh aset CC0 dari halaman resmi pembuat **diizinkan**, dengan lisensi dibaca dari halaman itu dan dicatat di `games/riot/assets/LICENSES.md`.
- Tinjauan kemiripan dan nama (RT-54) dilakukan sendiri oleh pemilik. Pemilik menilai risiko merek kecil karena game untuk pengguna lokal (LAN); periksa ulang bila dideploy Public.
- Keputusan PRD §8 (retensi chat, panel chat di halaman game, anti-cheat) dipilihkan asisten atas permintaan pemilik; mengikuti ROADMAP §0.

## 3. Peta kode (`games/riot/`)

| Folder | Isi |
|---|---|
| `shared/` | Logika murni: `rules` (peran, kondisi menang), `simulation` (gerak 15 Hz), `collision` dan `collision.json` (peta 10 ruangan), `interest` (radius pandang), `tasks`, `actions`, `meetings`, `sabotage`, `lobby`, `scoring` |
| `server/` | `service.ts`, `socket.ts` (namespace `/riot`), `index.ts` (modul server yang dimuat registry) |
| `client/` | `index.tsx`, `VirtualJoystick.tsx`, `prediction.ts` |
| `spike/` | Halaman uji RT-14 mandiri |
| `test/` | 13 berkas tes (74 tes) |
| `locales/` | `id.json`, `en.json` |

## 4. Yang BELUM ada (jangan mengira sudah selesai)

1. **UI klien untuk lobi, pilihan karakter, tugas (mini-game), rapat, voting, layar hasil.** Fase 2 dan 3 hanya menyelesaikan aturan dan server, diuji lewat tes dan bot. Klien baru punya joystick, prediksi, dan kerangka. Game belum bisa dimainkan lewat browser dari awal sampai akhir.
2. **Tabel `riot_*` dan persistensi.** Belum ada migrasi di `games/riot/db`. Rencana tabel ada di ROADMAP_RIOT §3 (`riot_rooms`, `riot_room_players`, `riot_matches`, `riot_profiles`). Pastikan room tidak hilang saat server restart bila itu dibutuhkan.
3. **Peta 3D, karakter, suara.** Peta masih greybox. Belum ada karakter Mochi, tipe Humanoid, aksesori, suara, atau layar Kredit (Fase 4).
4. **7 tugas sisa** dari 10 (hanya 3 yang ada), denah final.
5. **Integrasi leaderboard (RT-50), moderasi admin (RT-51), E2E Playwright (RT-53), dokumentasi API/Screens/Architecture (RT-55).**
6. **Uji jaringan nyata.** Benchmark RT-13 berasal dari simulasi dalam satu proses (CPU 0,25 ms per tick, 2,7 KB/s per klien, 0 kebocoran di luar pandang). Itu bukan latensi jaringan nyata.
7. **Uji ponsel nyata (RT-14).** Halaman uji siap: jalankan `pnpm spike:riot`, buka alamat LAN (port 5174) di ponsel, tekan "Salin laporan". Hasilnya (fps, draw call, segitiga) dibandingkan dengan anggaran R5. Hasil ini belum ada.

## 5. Cara menjalankan dan memeriksa

```bash
pnpm install
pnpm spike:riot                          # halaman uji RT-14 di ponsel
pnpm --filter @low-stress/game-riot test # tes Riot
pnpm lint && pnpm typecheck && pnpm test && pnpm i18n:check && pnpm check:assets && pnpm check:migrations
```

Kondisi terakhir: semua pemeriksaan di atas lolos (Riot 74 tes, server 132 tes) pada 2026-11-06.

Tes server membaca `TEST_DATABASE_URL` dari `.env.test` (gitignored). Nama database wajib berakhiran `_test`; tes menolak jalan bila tidak. Salin dari `.env.example` bagian "Database Uji".

## 6. Aturan yang wajib dipatuhi

1. **Hak cipta:** tidak memakai nama, karakter, denah, tugas, UI, atau suara Among Us/Innersloth. Jangan menyalin tugas mereka (kabel, geser kartu, unduh/unggah data, bahan bakar mesin, buang sampah). Lihat ROADMAP_RIOT §0 dan riot.md §1.
2. **Server otoritatif.** Peran, posisi di luar pandang, dan hasil tugas tidak dipercaya dari klien dan tidak dikirim ke klien yang tidak berhak.
3. **Aset:** hanya CC0 (atau CC-BY dengan Kredit) dari halaman resmi pembuat; tiap berkas tercatat di `LICENSES.md`; `pnpm check:assets` harus hijau. Hindari NC dan ND.
4. **Anggaran ponsel (R5):** ≥ 30 fps, ≤ ~150 draw call, ≤ ~100 ribu segitiga, atlas ≤ 2048px, aset ≤ ~8 sampai 10 MB.
5. **Database:** jangan sentuh database pengembangan. Jangan drop atau truncate. Tes hanya ke database uji.
6. **Teks UI** lewat i18n `id` dan `en`; mobile-first (360px); token desain; chat disensor di server; tanpa CDN.
7. **Jangan menulis klaim "keputusan pemilik"** yang tidak ada di dokumen. Tandai usulan sebagai usulan.
8. **Rahasia:** jangan menampilkan atau meng-commit `.env` dan `.env.test`.
9. Commit dan push hanya bila pemilik meminta. Akun GitHub yang dipakai: `nsyamsy` (`gh auth switch --user nsyamsy`, lalu `gh auth setup-git`); akun lain di mesin ini tidak punya izin tulis.

## 7. Pola kerja yang terbukti

- Beri agent lingkup per fase dan minta ia **berhenti** setelah tugas terakhir fase itu.
- Minta pemeriksaan dijalankan di **foreground**. Agent kadang berhenti menunggu tugas latar belakang; kirim satu prompt dorongan bila itu terjadi.
- Verifikasi sendiri: jalankan seluruh pemeriksaan di bagian 5. Jangan hanya percaya laporan agent.
- Pindai rahasia pada berkas yang akan di-commit (IP LAN, kata sandi, token, nilai `.env`).

## 8. Langkah berikutnya yang disarankan

1. **Uji RT-14 di ponsel nyata** (pemilik). Bila fps atau draw call melewati anggaran, putuskan penyesuaian sebelum Fase 4.
2. **Bangun UI klien** untuk lobi, rapat, voting, tugas, dan hasil. Sebaiknya sebelum aset Fase 4, agar alur bisa dimainkan dan dinilai.
3. Migrasi tabel `riot_*` dan persistensi room.
4. Fase 4 (RT-40 sampai RT-44), lalu Fase 5.

Hasil Fase 5 (RT-54) dan aktivasi game (status `active`) hanya setelah pemilik menyetujui.
