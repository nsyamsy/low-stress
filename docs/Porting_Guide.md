# Low Stress — Panduan Porting Game dari performance_dash

Versi: 0.1 · Tanggal: 2026-11-04

Sumber acuan: `D:\proj\talenta-project\reference\performance_dash-games\` (salinan baca-saja dari `D:\proj\performance_dash`, menu Commercial › Utilities). Folder ini tidak dikompilasi dan bukan bagian aplikasi.

## 0. Aturan umum

1. **Pertahankan tampilan di dalam canvas persis seperti aslinya.** Game ini tidak punya berkas gambar atau audio; semua digambar lewat kode dan semua suara disintesis Web Audio. Salin fungsi gambar, palet, dan sintesis suara apa adanya. Palet Low Stress hanya untuk bingkai di sekitar game.
2. **Pulihkan nama asli.** Nama di aplikasi lama disamarkan:

| Nama di aplikasi lama | Nama di Low Stress |
|---|---|
| Quick Tool (judul "Quick Tool") | **Flappy Bird** |
| Memory Match (judul "Focus Match", lencana "Memory Match") | **Memory Match** |
| Team Sync | **Ludo** |

3. **Ganti ketergantungan lama:**

| Lama | Baru |
|---|---|
| `@/lib/commercial-i18n` (`useCommercialT`, `tt`) | `react-i18next` namespace `game.<id>` (teks lama di bawah dipakai sebagai sumber) |
| `@/lib/utils` (`cn`) | util `cn` di `packages/ui` |
| `@/lib/commercial`, `requireCommercial`, `commercialApi` | auth Low Stress dan klien API `packages/sdk` |
| `@/lib/db` (Drizzle lama), `ensure…Table` (membuat tabel saat pertama dipakai) | skema dan migrasi eksplisit di `packages/db` dan `games/<id>/db` |
| Next.js route handlers | rute Fastify di `games/<id>/server` |
| `users.name`, `users.is_active` | `users.display_name` (disensor) dan `users.status = 'active'` |
| Teks "Commercial", "Administrator bisa selalu bermain" | Hapus: tidak ada lagi bypass admin (admin tidak bermain) |

4. **Hapus** semua penyebutan Commercial, Quick Tool, Team Sync, Focus Match, dan tautan ke area lain `performance_dash`.
5. Setiap game punya folder sendiri: `games/flappy-bird`, `games/memory-match`, `games/ludo` (struktur di Architecture §4.1).

---

## 1. Peta berkas

| Game | Berkas acuan | Tujuan di Low Stress |
|---|---|---|
| Flappy Bird | `flappy-bird/flappy-engine.ts` | `games/flappy-bird/shared/engine.ts` |
| | `flappy-bird/flappy-characters.ts` | `games/flappy-bird/client/characters.ts` |
| | `flappy-bird/FlappyBird.tsx` | `games/flappy-bird/client/FlappyBird.tsx` |
| | `flappy-bird/page.tsx` | halaman game di shell (`/games/flappy-bird`) |
| Memory Match | `memory-match/MemoryMatch.tsx` | `games/memory-match/client/MemoryMatch.tsx` (pisahkan `SoundEngine` ke `client/sound.ts`) |
| | `memory-match/page.tsx` | halaman game di shell |
| Ludo | `ludo/ludo-engine.ts` | `games/ludo/shared/engine.ts` |
| | `ludo/ludo.ts` | `games/ludo/server/` (service, aksi, tabel) |
| | `ludo/LudoBoard.tsx`, `LudoPawn.tsx` | `games/ludo/client/` |
| | `ludo/ludo-sound.ts` | `games/ludo/client/sound.ts` |
| | `ludo/lobby-page.tsx`, `room-page.tsx` | `games/ludo/client/pages/` |
| Bersama | `shared/game-scores.ts` | skor generik di `apps/server/src/games/scores` |
| | `shared/GameLeaderboard.tsx` | komponen leaderboard di shell (Screens §8) |
| | `shared/commercial-games.ts` | gerbang jadwal di `apps/server/src/games/schedule` |

---

## 2. Flappy Bird

**Tampilan asli (dipertahankan):** kanvas logis 360×560, tanah 70px. Langit gradasi `#4ec0ca` → `#b6ecf2` dengan awan putih semi-transparan; bukit `#9bd9a3`; pipa hijau bergradasi (`#5aa02c`, `#8fd14f`, `#4d8a24`, garis `#3b6a1a`); tanah `#ded895` dengan rumput `#73bf2e`/`#9be04a`; teks Game Over oranye `#ffb02e` berkontur cokelat `#3b2f1b`; panel hasil krem `#ded895`; lencana "REKOR BARU" merah `#e5483a`.

**Karakter (6):** `yellow`, `red`, `blue` (palet `body/wing/line/beak`; kuning: `#f8d12f`, `#f0a81c`, `#8a5a12`, `#f4733a`), serta `bat`, `plane`, `ghost` (digambar khusus). Fungsi `drawCharacter(ctx, id, …)`. Pilihan karakter disimpan (kunci lama `cbr-flappy-character`).

**Medali:** perunggu ≥ 10, perak ≥ 20, emas ≥ 30; warna `bronze #cd7f32/#8a5522`, `silver #d7dde2/#8b959c`, `gold #ffd23f/#c99700`.

**Fisika (`CONFIG`, jangan diubah):**

```text
gravity 1500 px/s²   flapVelocity -430   maxFall 640   baseSpeed 150
speedPerPoint 2      maxSpeedBonus 80    gap 150       pipeWidth 58
spacing 210          birdX 90            birdRadius 12 startY 270   gapMargin 46
```

Langkah fisika tetap `1/120` detik; kunci tekan ulang `0.45` detik setelah mati agar tap terlambat tidak melewati layar hasil.

**Kontrol:** ketuk/klik kanvas, Spasi, ↑, atau W. Layar hasil: skor, rekor lokal, medali, "Ketuk untuk main lagi".

**Skor ke server:** hanya jika `score ≥ 1` (run tanpa melewati pipa pertama bukan "play": tidak dihitung dan tidak disimpan). Validasi kewajaran:

```text
score ≤ 500
score ≤ floor(durationMs / 1000 / 0.85) + 1
0 ≤ durationMs ≤ 2 jam
```

**Penyesuaian untuk Low Stress:** skala FIT dengan rasio 360:560 di mobile tanpa scroll; hormati `prefers-reduced-motion` (hilangkan kilat putih saat mati); pindahkan semua teks ke i18n (kunci di §7).

---

## 3. Memory Match

**Papan:** 16 kartu = **8 pasangan** (`CARD_DEFS`, ikon lucide: Rocket, Diamond, Crown, Star, Clover, Flame, Zap, Target dan sejenisnya; pertahankan set dan warna aslinya dari `MemoryMatch.tsx`). Kartu salah dibalik kembali setelah 450 ms; kartu cocok terkunci setelah 200 ms; input dikunci (`lockRef`) selama penundaan.

**Suara (`SoundEngine`, Web Audio, tanpa berkas):** flip, `match` (akor C major 523,25 / 659,25 / 783,99 / 1046,5 Hz, gelombang triangle), `misMatch` (sawtooth 160→120 Hz), `victory` (5 nada sine 523→1318 Hz). Tombol bisukan/bunyikan.

**Rumus skor (jangan diubah):**

```text
totalSecs   = max(1, floor(durasi_ms / 1000))
timePenalty = floor(totalSecs * 25)
movePenalty = max(0, (moves - 8) * 45)
comboBonus  = combos * 150          // combos = beruntun cocok saat selesai; reset ke 0 saat salah
score       = max(200, floor(5000 - timePenalty - movePenalty + comboBonus))
```

Rekor pribadi lama disimpan di browser (`cbr-memorymatch-best`); jadikan hanya cache tampilan, sumber kebenaran adalah server.

**Skor ke server (perubahan dari aslinya):** kirim `{ score, durationMs, moves, combos }`. Server menghitung ulang skor dengan rumus di atas dan **menolak jika berbeda**. Validasi kewajaran tambahan: `50 ≤ score ≤ 10000`, `durationMs ≥ 2000`, `moves ≥ 8`.

**Layout asli halaman:** leaderboard | papan | aturan (tiga kolom di desktop, tumpuk di mobile). Pertahankan urutan di mobile: game, leaderboard, aturan.

---

## 4. Ludo

### 4.1 Aturan (dipertahankan dari `ludo-engine.ts`)

- Dua dadu; gerakkan satu pion sebanyak jumlahnya. Papan klasik untuk ≤ 4 pemain (2 pemain duduk berseberangan, 3 pemain memakai tiga lengan pertama); dari 5 pemain ke atas papan menambah satu lengan per pemain dan lengan memanjang (`geometry(players)`).
- **Aturan keluar kandang** (dipilih host): `double` (dadu kembar apa pun), `sixes` (hanya 6+6), `six` (angka 6 di salah satu dadu).
- Dadu kembar, menangkap pion lawan, atau memasukkan pion ke rumah memberi lemparan lagi. Menangkap mengirim pion lawan ke kandang, kecuali di kotak start dan bintang.
- Sampai tepat di kotak terakhir atau dadu kembar yang mencapai/melewatinya memasukkan pion; lemparan lain yang melewati kotak terakhir memantul.
- Tiga dadu kembar berturut-turut menghanguskan giliran.
- Permainan lanjut setelah pemain pertama sampai sampai `goal` pemain menyelesaikan semua pion (juara 1, 2, 3 …).
- Jumlah pion: bawaan 4 (≤ 6 pemain), 3 (7–8), 2 (≥ 9); host dapat memilih 1–4.
- Jika hanya ada satu pilihan langkah (semua pion yang bisa bergerak di kotak yang sama atau hanya satu), langkah dijalankan otomatis (`autoMove`).
- Pion dapat berkarakter (`pin, crown, star, cat, robot, heart, ghost, rocket`); warna tetap milik pemain.

### 4.2 Perubahan untuk 12 pemain

- `MAX_PLAYERS = 12` (sekarang 10); `clampPlayers` memakai pengaturan admin `ludo.maxPlayers`.
- Tambah **2 warna** pada `LUDO_COLORS` (sekarang 10: merah, hijau, kuning, biru, oranye, ungu, merah muda, toska, cokelat, nila). Pilih dua warna yang kontras terhadap sepuluh yang ada dan tambahkan nama dua bahasa (`color.10`, `color.11`).
- `defaultPawns`: 11–12 pemain = 2 pion.
- Jalankan simulasi (dua dadu, aturan keluar `double`) untuk 11 dan 12 pemain; catat rata-rata lemparan per pemain (acuan lama: 42 untuk 4×4, 70 untuk 6×4, 76 untuk 8×3, 71 untuk 10×2) di PRD atau komentar engine.
- Pastikan `ringCell`/`geometry` tidak membuat kotak tumpang tindih pada 11 dan 12 lengan; tambahkan tes geometri untuk 2..12.
- Uji keterbacaan 12 pemain di 360px (P7-09).

### 4.3 Arsitektur realtime (perubahan dari aslinya)

Aplikasi lama memakai **polling tiap 2 detik** (`POLL_MS = 2000`) dan POST aksi. Low Stress memakai **Socket.IO**:

- Aksi tetap sama (`invite, respond, kick, start, roll, move, skip, pawn, participate, chat, autopilot, reset`), dikirim lewat event soket; server membalas dengan state terbaru per pengguna.
- **Pertahankan:** server melempar dadu dan memvalidasi tiap langkah; state disimpan di DB dengan `version` agar balasan lambat tidak menimpa state lebih baru; jeda CPU `PACE_SECONDS = 1.5`; autopilot mengambil alih setelah `IDLE_SECONDS = 60` tanpa gerakan; waktu bermain dihitung dari server.
- **Reset room:** di aplikasi lama hanya administrator. Di Low Stress admin tidak bermain, jadi reset dilakukan **admin dari panel** (P7-08) **atau host room** (keputusan bawaan: host boleh reset room miliknya; admin boleh semua).
- **Undangan:** pengguna `active` mana pun (bukan hanya "Commercial"). Daftar yang dapat diundang memakai pencarian username/nama tampilan.
- **Kedaluwarsa:** room dihapus jika `last_activity_at` > 7 hari.
- **Chat room:** maks 300 karakter (aslinya 500 di DB) dan disensor server; pesan lama tersimpan di `ludo_messages` hingga room dihapus.

### 4.4 Tabel (pindahkan dengan awalan `ludo_`)

`ludo_rooms` (id, name ≤ 60, host_id, status `lobby|playing|finished`, max_players, pawns, seat_users jsonb, state jsonb, version, started_at, finished_at, last_activity_at, created_at, updated_at), `ludo_players` (room_id, user_id, status `invited|accepted|declined|observer`, pawn, autopilot, invited_at, joined_at), `ludo_messages` (id, room_id, user_id nullable, body ≤ 300, created_at). Buat migrasi eksplisit; jangan memakai pola `CREATE TABLE IF NOT EXISTS` saat runtime.

### 4.5 Tampilan asli (dipertahankan)

Papan SVG (sel 20 unit), warna lengan, pion (`PawnShape`), latar `LudoBackdrop` gradasi biru-ungu-toska bertitik, animasi `ludo-float`, `ludo-confetti`, `ludo-pop` (matikan di `prefers-reduced-motion`), suara sintesis di `ludo-sound.ts`. Di mobile papan harus muat lebar layar tanpa scroll horizontal; chat room berupa laci yang dapat dibuka.

---

## 5. Jadwal game

Porting `commercial-games.ts`:

- Zona waktu tetap `Asia/Jakarta` (label "WIB").
- `GamesSchedule { enabled, windows[1..6] { start "HH:MM", end "HH:MM" }, days[0..6] }`; start masuk, end tidak; `start === end` tidak sah; jendela boleh melewati tengah malam dan tetap berada di bawah hari mulainya.
- `enabled = false` berarti selalu buka.
- **Perubahan:** jadwal berlaku untuk semua pemain (tidak ada bypass admin); tersedia jadwal global dan per game (per game menimpa global); hasil dapat dibaca klien untuk menampilkan "Dibuka pukul …".

---

## 6. Leaderboard

Porting `getLeaderboard`/`recordScore` (`shared/game-scores.ts`) ke SQL eksplisit:

- **Periode:** `all` memakai `game_scores`; `week`/`month` dihitung dari `game_runs` dengan `date_trunc` di zona `Asia/Jakarta` (minggu mulai Senin 00:00, bulan mulai tanggal 1 00:00).
- Per pemain: skor terbaik pada periode (seri: yang lebih awal menang); `plays` = jumlah run pada periode; `bestPlay` = urutan run yang menghasilkan skor terbaik pada periode.
- Peringkat `RANK() OVER (ORDER BY score DESC, at ASC)`; tampilkan **top 10** dan baris pemain sendiri bila di luar top 10 (`me`), serta `mine` selalu.
- Hanya skor > 0 dan pengguna `active`; pengguna yang dihapus tidak muncul.
- `recordScore`: upsert `game_scores` (`best_score = GREATEST`, `plays + 1`, `best_play` bila rekor baru, `best_at`) dan sisipkan `game_runs`. Mengembalikan `{ best, bestPlay, plays, isNewBest }`. Run Flappy Bird dengan skor < 1 tidak disimpan.
- Indeks: `game_scores (game_id, best_score DESC, best_at)`, `game_runs (game_id, played_at)`, `game_runs (game_id, user_id, played_at)`.
- **Perubahan:** kolom `game` di tabel lama menjadi `game_id`; kunci periode dihitung di server, bukan klien.

---

## 7. Teks i18n yang dapat dipakai ulang

Sumber: `D:\proj\performance_dash\src\lib\commercial-i18n.ts`, kunci `games.*` (Inggris, Indonesia). Salin teks sebagai titik awal ke `games/<id>/locales/{en,id}.json`, **ganti nama game** sesuai §0 dan buang rujukan "Commercial", "administrator selalu bisa bermain", dan "disimpan di browser ini" (kecuali relevan). Pemetaan kunci:

| Kelompok kunci lama | Tujuan |
|---|---|
| `games.flappy.*` | `game.flappy-bird` |
| `games.memory.*` | `game.memory-match` |
| `games.ludo.*` | `game.ludo` (termasuk `event.*`, `exit.*`, `exitRule.*`, `rules1..6`, `char.*`, `color.0..9` + tambah `color.10..11`) |
| `games.leaderboard.*` | `common` (leaderboard di shell) |
| `games.title`, `hint`, `limit`, `from`, `to`, `days`, `windows`, `addWindow`, `removeWindow`, `overnight`, `windowsHint`, `save`, `saved`, `saveFailed`, `openNow`, `closedNow`, `alwaysOpen`, `closedTitle`, `closedBody`, `sameTimes`, `pickDay` | `admin` (jadwal) dan `common` (halaman ditutup) |

Gaya tulisan baru mengikuti Design_System §11 (sapaan "kamu", tanpa "berhasil", tombol kata kerja). Teks yang berisi tanda seru atau huruf kapital semua (mis. "NEW BEST", "PLAY AGAIN", "ALL MATCHED!") dinormalkan menjadi sentence case kecuali lencana pendek.

---

## 8. Daftar periksa porting per game

- [ ] Tampilan di dalam canvas identik dengan aslinya (bandingkan berdampingan).
- [ ] Semua teks lewat i18n (`id` dan `en`).
- [ ] Nama asli dipulihkan; tidak ada kata Commercial, Quick Tool, Team Sync, Focus Match.
- [ ] Tidak ada ketergantungan `@/lib/...` lama atau Next.js.
- [ ] Logika murni dipisah ke `shared/` dengan tes unit.
- [ ] Skor melewati validasi server sesuai manifest.
- [ ] Sentuhan dan keyboard bekerja; pas di 360px tanpa scroll.
- [ ] `prefers-reduced-motion` dihormati.
- [ ] Suara disintesis (tanpa berkas) dan dapat dibisukan.
- [ ] Tidak ada permintaan ke domain eksternal.
