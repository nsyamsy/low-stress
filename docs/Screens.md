# Low Stress — Spesifikasi Layar

Versi: 0.1 · Tanggal: 2026-11-04

Spesifikasi teks dari mockup yang dibahas di chat (mockup visual tidak tersimpan di repositori, jadi dokumen ini adalah acuan agent). Gaya visual mengikuti [Design_System.md](Design_System.md); data dari [API_Spec.md](API_Spec.md). Semua teks lewat i18n (`id` dan `en`); contoh teks di sini dalam bahasa Indonesia.

Catatan berlaku untuk semua layar: mobile-first (360px), target ketuk ≥ 44px, terang dan gelap, kunci i18n `area.elemen.keadaan`, tidak ada permintaan eksternal.

## 1. Peta rute

| Rute | Layar | Akses |
|---|---|---|
| `/login` | Login | Tamu |
| `/register` | Daftar | Tamu (sesuai mode) |
| `/pending` | Menunggu persetujuan | Pemain `pending` |
| `/` | Beranda | Pemain `active` |
| `/games/:id` | Halaman game | Pemain `active` (gerbang status dan jadwal) |
| `/games/ludo` | Lobi Ludo | idem |
| `/games/ludo/:roomId` | Room Ludo | Anggota room |
| `/leaderboard` | Leaderboard | Pemain `active` |
| `/profile` | Profil | Pemain `active` |
| `/admin/login` | Login admin | Tamu |
| `/admin` | Dashboard | Admin |
| `/admin/approvals` | Persetujuan | Admin |
| `/admin/users` | Pengguna | Admin |
| `/admin/games` | Kelola game | Admin |
| `/admin/leaderboard` | Moderasi skor | Admin |
| `/admin/chat` | Moderasi chat | Admin |
| `/admin/ludo` | Moderasi Ludo | Admin |
| `/admin/settings` | Pengaturan | Admin |
| `/admin/audit` | Audit log | Admin |

Pengalihan: tamu ke rute pemain → `/login`; pemain `pending` → `/pending`; admin ke rute pemain → `/admin`; pemain ke `/admin/*` → `/`.

---

## 2. Auth (`/login`, `/register`, `/pending`)

**Tata letak:** satu kartu di tengah, lebar maksimum 360px (mobile: penuh dengan gutter 16px). Latar `--bg-page`.

**Login:** logo penuh (burung, wordmark, gelombang) → subjudul "Masuk dan main santai" → kolom Username → kolom Password (tombol tampilkan) → tombol primary "Masuk" → tautan "Belum punya akun? Daftar" (disembunyikan bila `registration = closed`, diganti pesan "Pendaftaran ditutup") → catatan "Lupa password? Hubungi admin" (diganti tautan "Lupa password" saat email aktif). Pemilih bahasa dan tema di pojok kanan atas.

**Register:** judul "Buat akun" → Username, Nama tampilan, Email, Password → teks bantuan "Email dipakai untuk pemulihan akun saat fitur email aktif." → (bila `captcha`) komponen CAPTCHA → tombol "Daftar" → tautan "Sudah punya akun? Masuk".

**Pending:** ilustrasi burung (mata terpejam) → judul "Menunggu persetujuan" → chip amber "Pending" → teks "Admin akan meninjau pendaftaranmu. Kamu bisa masuk setelah disetujui." → "Akun: <username>" → tombol secondary "Kembali ke login". Bila akun `rejected`/`suspended`/`banned`, tampilkan pesan terkait di halaman login, bukan di sini.

**Status:** error inline di bawah kolom (ikon + `--danger-text`); tombol menampilkan keadaan memuat; lockout menampilkan hitung mundur.

## 3. Header dan navigasi pemain

- **Desktop (≥ 1024px):** bar atas: logo horizontal kiri; tautan Beranda, Leaderboard; pemilih bahasa (ikon bahasa + label + panah); chip nama pengguna (menu: Profil, Keluar).
- **Mobile/tablet:** bar atas sederhana (logo kecil, tombol bahasa ID/EN) dan **bar bawah** tiga tab: Beranda, Leaderboard, Profil.
- Pemilih bahasa: menu dengan tiga opsi "Ikuti browser", "Indonesia", "English" (tanda centang pada pilihan aktif). Bisa dipakai sebelum login.

## 4. Halaman game (bingkai)

- Bar atas: tombol kembali, judul game, tombol suara (bila game bersuara).
- Area game di tengah, rasio dijaga, tidak ada scroll di mobile.
- Di bawah/samping: ringkas "Cara bermain", leaderboard game (desktop kolom kiri atau kanan), rekor pribadi.
- Bila game ditutup/maintenance/nonaktif: tampilkan layar status (Screens §6) bukan game.

## 5. Beranda (`/`)

- Sapaan "Halo, <nama tampilan>" dan baris status jadwal ("Buka 12:00–13:00 WIB" atau "Tutup, dibuka kembali Senin 12:00" atau "Buka sepanjang hari").
- Grid kartu game: 1 kolom (< 768px), 2 kolom (768–1023px), 3 kolom (≥ 1024px).
- **Kartu game:** pratinjau berwarna, nama, chip status, satu baris info (rekor pribadi atau pesan maintenance), satu tombol.

| Status | Chip | Tombol |
|---|---|---|
| Aktif dan buka | "Aktif" (hijau) | "Main" (primary) |
| Aktif tapi di luar jadwal | "Tutup" (amber) | "Lihat jadwal" (secondary), membuka layar ditutup |
| Maintenance | "Maintenance" (amber) | "Terkunci" (tak aktif) + pesan admin |
| Nonaktif | tidak ditampilkan | — |

- Desktop: panel chat publik di kanan (Screens §11); di bawah grid, ringkasan leaderboard game pertama (tiga teratas).

## 6. Layar status game (`ditutup`, `maintenance`)

Kartu tengah dengan ikon jam, judul "Game sedang ditutup", isi "Dibuka pukul {windows} WIB, {days}." dan tombol "Kembali ke beranda". Untuk maintenance: judul "Sedang diperbarui" dan pesan dari admin (dua bahasa; bila kosong pakai teks bawaan).

## 7. Game

### 7.1 Flappy Bird (`/games/flappy-bird`)

Kanvas 360×560 (skala FIT). Keadaan: bersiap ("Bersiap", "Ketuk atau tekan Spasi untuk mulai"), bermain (skor besar di atas), selesai (panel hasil: "Game Over", skor, terbaik, medali, "REKOR BARU" bila baru, "Ketuk untuk main lagi", jeda kunci 0,45 dtk). Pemilih karakter (6) di bawah kanvas. Teks "Cara bermain": kontrol (ketuk/klik/Spasi/↑/W), aturan, medali (10/20/30). Tampilan kanvas persis seperti aslinya (Porting_Guide §2).

### 7.2 Memory Match (`/games/memory-match`)

Desktop: tiga kolom (leaderboard | papan 4×4 | aturan); mobile: papan, leaderboard, aturan. HUD: Langkah, Pasangan, Waktu, tombol Ulangi, tombol bisukan. Layar selesai: "Semua cocok", waktu dan langkah, "Skor akhir", "Terbaik", "Rekor baru", tombol "Main lagi". Tampilan sesuai aslinya (Porting_Guide §3).

### 7.3 Ludo — lobi (`/games/ludo`)

Bagian "Undangan" (kartu: "{host} mengundang kamu ke {room}", tombol Gabung dan Tolak), "Ruangan kamu" (daftar room: nama, status Lobi/Berlangsung/Selesai, "{n} / {max} pemain", tombol Buka; kosong: "Belum ada ruangan. Buat satu dan undang temanmu."), dan formulir "Buat ruangan" (Nama ruangan, Maks. pemain 2–`ludo.maxPlayers`, saklar "Saya ikut bermain").

### 7.4 Ludo — room (`/games/ludo/:roomId`)

- **Lobi:** daftar pemain (status Diundang/Bergabung/Menolak/Pengelola), tombol Undang (pencarian username/nama), tombol Keluarkan (host), pilihan pion per pemain (8 karakter), pengaturan host (pion per pemain, aturan keluar kandang, jumlah juara), info papan ("{arms} lengan, {ring} kotak"), tombol "Mulai game" (aktif bila ≥ 2 pemain; pesan "Minimal 2 pemain harus bergabung…"), tombol "Hapus room".
- **Bermain:** papan SVG di tengah (penuh lebar di mobile), umpan kejadian, tombol "Lempar dadu" dan penunjuk "Giliran kamu"/"Giliran {nama}", "Ketuk pion yang menyala untuk menggerakkannya.", waktu bermain, saklar Autopilot, tombol "Lewati giliran" (host), suara hidup/mati, daftar pemain dengan lencana CPU, ringkasan aturan.
- **Selesai:** "{nama} menang!", "Peringkat akhir" (Juara 1, 2, 3 …), tombol "Game baru" (host atau admin) dengan konfirmasi.
- **Chat room:** desktop kolom di samping; mobile laci yang dibuka dari tombol "Chat" (lencana pesan baru). Placeholder "Tulis pesan…", kosong "Belum ada pesan. Sapa yang lain!". Pesan disensor server.
- Penyambungan ulang: banner "Menyambung ulang…" saat soket putus.

## 8. Leaderboard (`/leaderboard`)

Pilihan game (chip), tab periode ("Minggu ini", "Bulan ini", "Sepanjang waktu"; Inggris: This week, This month, All time). Tabel 10 teratas: peringkat (tiga teratas bernomor `--accent-text`), nama (disensor), skor (tabular-nums), keterangan kecil "{n}× main" dan "Highscore di play ke-{n} dari {total}". Baris pemain sendiri (di luar top 10) di bawah dengan pemisah dan tanda "(kamu)", disorot `--bg-inset`. Keadaan kosong "Belum ada skor. Jadilah yang pertama!". Judul periode menampilkan rentang tanggal (WIB). Mobile: baris padat, tanpa kolom tambahan.

## 9. Profil (`/profile`)

Avatar inisial, nama tampilan, `@username`. Bagian: **Bahasa** (kontrol segmen "Ikuti browser | Indonesia | English"), **Tema** ("Sistem | Terang | Gelap"), ubah nama tampilan, email (dengan status "Belum diverifikasi" bila ada), **Ganti password**, **Pasang ke layar utama** (muncul saat `beforeinstallprompt` tersedia), **Keluar**, dan **Hapus akun** (teks `--danger-text`, membuka modal konfirmasi: peringatan skor dan chat, kolom password, tombol Danger "Hapus akun" dan "Batal").

## 10. Layar kosong dan galat

- Offline: banner "Tidak ada koneksi" dan tombol "Coba lagi".
- 404: ilustrasi burung, "Halaman tidak ditemukan", tombol "Ke beranda".
- 500: "Ada yang salah. Coba lagi sebentar."

## 11. Panel chat publik (desktop ≥ 1024px)

Kolom kanan 280px, dapat dilipat menjadi tab vertikal 40px dengan penanda pesan baru; pilihan terakhir disimpan di `localStorage`. Di halaman game terlipat bawaan.

Isi: header ("Chat publik", "{n} online", tombol lipat); daftar pesan (nama, isi, jam; pesan sendiri rata kanan berlatar `--bg-inset`; kata kasar tampil `****`); input (placeholder "Tulis pesan…", tombol kirim, penghitung karakter dari 250). Keadaan: dibisukan ("Kamu dibisukan sampai {jam}"), dimatikan ("Chat publik sedang dimatikan"), menyambung ("Menyambung ulang…"). Di bawah 1024px komponen tidak dirender dan soket tidak dibuka.

---

## 12. Panel admin: kerangka

- **Desktop:** sidebar kiri 150–220px berlatar teal `#2F5D55` dengan item krem (aktif `#3F7268`): Dashboard, Persetujuan (lencana jumlah), Pengguna, Game, Leaderboard, Chat, Ludo, Pengaturan, Audit log. Atas: judul halaman, lencana "Mode deploy: LAN|Public", menu admin (bahasa, tema, keluar). Latar konten `--bg-page`, lebar maks 1280px.
- **Mobile:** sidebar menjadi laci (tombol menu). Tabel menjadi daftar kartu (< 768px).
- Aksi destruktif (hapus, ban, reset papan) selalu lewat modal konfirmasi dua langkah.
- Semua teks admin juga dua bahasa.

## 13. Admin: Dashboard, Persetujuan, Pengguna

- **Dashboard:** empat kartu metrik (Aktif hari ini, Menunggu, Game dimainkan, Daftar baru) + panel "Menunggu persetujuan" (tiga teratas dengan Setujui/Tolak) + ringkasan "Game dimainkan per game".
- **Persetujuan:** daftar pendaftar (username, email, waktu daftar relatif), tombol "Setujui" (primary) dan "Tolak" (secondary) per baris, pilih-semua dan aksi massal.
- **Pengguna:** pencarian, filter status (chip), tabel (username, nama, email, status, daftar, login terakhir) dengan menu aksi: Setujui/Tolak, Suspend/Aktifkan, Ban, Reset password (menampilkan password sementara satu kali dengan tombol salin), Hapus.

## 14. Admin: Game, Pengaturan

- **Game:** tiap game satu kartu/baris: nama, kontrol segmen tiga posisi **Aktif | Maintenance | Nonaktif** (posisi aktif berwarna hijau/amber/abu), ringkasan jadwal ("12:00–13:00 WIB, Sen–Jum" atau "Ikut jadwal global"), tombol "Atur jadwal" (modal: saklar batasan, jendela waktu hingga 6 dengan tambah/hapus, pilih hari, pratinjau "Sedang buka/tutup"), kolom pesan maintenance (dua bahasa), urutan, badge "Baru".
- **Pengaturan** (satu kartu per kelompok):
  1. **Pendaftaran:** kontrol segmen "Approval admin | Terbuka | Ditutup".
  2. **Jadwal global:** saklar, jam mulai/selesai (dengan tambah jendela), hari (S S R K J S M).
  3. **Bahasa bawaan:** "Ikuti browser | ID | EN".
  4. **Chat publik:** saklar, jumlah kata disensor dan tautan "Kelola" (ke daftar kata).
  5. **Ludo:** "Maks. pemain" (2–12).
  6. **Email (SMTP):** chip status ("Belum dikonfigurasi" amber / "Terhubung" hijau), keterangan "Diisi lewat .env. Saat aktif: verifikasi email, lupa password, notifikasi undangan.", kolom baca-saja host/port, tombol "Kirim email uji" (tak aktif sebelum dikonfigurasi, dengan alasan).

## 15. Admin: Leaderboard, Chat, Ludo, Audit

- **Leaderboard:** pilih game, tabel run (pemain, skor, durasi, waktu, penanda `flagged`), filter "Janggal saja", aksi hapus run, tombol "Reset papan mingguan/bulanan" (konfirmasi dua langkah).
- **Chat:** aliran pesan terbaru dengan tombol hapus dan "Bisukan…" (durasi), daftar yang sedang dibisukan, kelola kata terlarang (tabel kata, bahasa, aktif, tambah/hapus).
- **Ludo:** daftar room (nama, host, status, pemain, aktivitas terakhir), rincian (pemain, chat), aksi Reset, Keluarkan, Hapus.
- **Audit:** tabel kronologis (waktu, admin, aksi, target, rincian) dengan filter aksi.

---

## 16. Daftar kunci i18n per area (awalan)

`common.*` (navigasi, tombol, kesalahan), `auth.*`, `profile.*`, `home.*`, `leaderboard.*`, `chat.*`, `admin.*` (dashboard, approvals, users, games, settings, audit, chat, ludo, leaderboard), `game.flappy-bird.*`, `game.memory-match.*`, `game.ludo.*`. Kode error server dipetakan ke `errors.<KODE>` di `common`.
