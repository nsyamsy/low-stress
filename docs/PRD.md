# Low Stress — Product Requirements Document (PRD)

Versi: 0.1 (draf) · Tanggal: 2026-11-04 · Status: menunggu persetujuan sebelum coding

Dokumen terkait: [Design_System.md](Design_System.md) · [Architecture.md](Architecture.md) · [Agents.md](../Agents.md)

---

## 1. Ringkasan

**Low Stress** adalah situs game santai berumur panjang. Pemain mendaftar, disetujui admin, lalu memainkan sekumpulan game ringan dan bersaing di leaderboard. Situs dirancang agar game baru bisa ditambahkan kapan saja tanpa menyentuh game lain.

Game awal (diporting dari menu Commercial aplikasi `performance_dash`, dengan nama aslinya):

| Game | Deskripsi | Mode |
|---|---|---|
| **Flappy Bird** | Terbang melewati pipa, skor per pipa. Pilihan karakter, medali. | Solo |
| **Memory Match** | Mencocokkan pasangan kartu 4x4, skor berdasarkan waktu dan langkah. | Solo |
| **Ludo** | Papan Ludo 2–12 pemain, undangan, chat per room, autopilot. | Multiplayer realtime |

Pengguna lama aplikasi `performance_dash` **tidak** dimigrasi. Semua data dimulai dari nol.

## 2. Tujuan dan non-tujuan

### Tujuan
1. Situs game yang tenang, ringan, dan nyaman dipakai di ponsel maupun desktop.
2. Sistem akun mandiri (register, login) dengan persetujuan admin.
3. Panel admin terpisah untuk mengelola pengguna, game, jadwal, dan pengaturan.
4. Arsitektur modular: satu folder per game, tanpa bentrok.
5. Dua bahasa (Indonesia dan English), bisa mengikuti browser.
6. Dapat dideploy di **LAN** maupun **Public** dari kode yang sama.

### Non-tujuan (versi 1)
- Migrasi akun atau skor dari `performance_dash`.
- Pembayaran, iklan, atau mata uang dalam game.
- Verifikasi email dan lupa password lewat email (disiapkan, tidak aktif).
- Login sosial (Google, dll).
- Game pihak ketiga yang dijalankan dalam sandbox (arsitektur dibuat fleksibel, lihat Architecture.md §5).

## 3. Persona

| Persona | Kebutuhan |
|---|---|
| **Pemain** | Daftar cepat, main di ponsel saat istirahat, lihat peringkat, main Ludo dengan teman. |
| **Admin (Superadmin)** | Menyetujui pendaftar, mengatur game dan jadwal, menjaga situs tetap rapi. Tidak bermain. |
| **Pengembang** | Menambah game baru dengan mudah dan aman. |

## 4. Lingkup fitur

### 4.1 Akun dan autentikasi

| ID | Kebutuhan | Prioritas |
|---|---|---|
| AUTH-1 | Register dengan username, nama tampilan, **email (wajib)**, dan password. | Must |
| AUTH-2 | Username unik (tidak peka huruf besar-kecil); email unik. | Must |
| AUTH-3 | Akun baru berstatus `pending` (mode approval) sampai disetujui admin. | Must |
| AUTH-4 | Login dengan **username dan password**. Email tidak dipakai untuk login. | Must |
| AUTH-5 | Status akun: `pending`, `active`, `rejected`, `suspended`, `banned`. Hanya `active` yang bisa masuk. | Must |
| AUTH-6 | Pembatasan percobaan login (lockout sementara) dan rate limit register. | Must |
| AUTH-7 | Ganti password saat sudah login. | Should |
| AUTH-8 | Lupa password: **direset admin** (password sementara) selama SMTP belum aktif. | Must |
| AUTH-9 | Logout dan pencabutan sesi (ban atau suspend langsung memutus sesi aktif). | Must |
| AUTH-10 | Email disimpan tapi `email_verified_at` kosong; belum dipakai untuk identitas. | Must |
| AUTH-11 | Pemain boleh **menghapus akunnya sendiri** dari Profil, dengan konfirmasi password. Akun, skor, dan run dihapus (hilang dari leaderboard); pesan chat menjadi "Pengguna dihapus". Jika pemain sedang di Ludo yang berjalan, kursinya diambil autopilot sampai selesai; room yang belum mulai milik host dihapus. | Must |
| AUTH-12 | Nama tampilan yang mengandung kata kasar **disensor** saat ditampilkan (bukan ditolak). | Must |

**Kriteria penerimaan (AUTH-3):** pendaftar yang login saat `pending` melihat halaman "Menunggu persetujuan" dan tidak bisa membuka game atau API game.

### 4.2 Mode pendaftaran (diatur admin)

| Mode | Perilaku |
|---|---|
| `approval` (bawaan) | Daftar, lalu menunggu persetujuan admin. |
| `open` | Akun langsung `active`. Dilindungi rate limit dan CAPTCHA self-hosted. |
| `closed` | Pendaftaran dimatikan; halaman register menampilkan pesan. |

Mode dapat diganti saat aplikasi berjalan, tanpa restart.

### 4.3 Game

| ID | Kebutuhan | Prioritas |
|---|---|---|
| GAME-1 | Beranda menampilkan kartu semua game dengan status. | Must |
| GAME-2 | Status per game, diatur admin: `Aktif`, `Maintenance` (tampil, terkunci, pesan kustom), `Nonaktif` (tersembunyi, akses ditolak). | Must |
| GAME-3 | Jadwal buka per game atau mengikuti jadwal global (jam dan hari, zona WIB). Mendukung jendela yang melewati tengah malam. | Must |
| GAME-4 | Game baru muncul otomatis setelah folder dan manifest-nya ditambahkan. | Must |
| GAME-5 | Setiap game mendukung layar sentuh dan dua bahasa. | Must |

**Flappy Bird:** fisika fixed-step, pilihan karakter, medali (perunggu, perak, emas), skor dikirim saat game berakhir. Tampilan dan perilaku diporting dari kode Canvas 2D di `performance_dash` (tanpa Phaser) agar identik dengan aslinya.

**Memory Match:** 4x4 kartu, skor dari kecepatan dan jumlah langkah, efek suara dengan tombol mute.

**Ludo:** 2–12 pemain (aplikasi lama sampai 10; geometri papan sudah menyesuaikan jumlah lengan, tetapi 12 butuh dua warna tambahan, jumlah pion bawaan 2, simulasi panjang permainan, dan uji keterbacaan di layar ponsel); host membuat room dan mengundang pemain; pemain menerima atau menolak; aturan keluar kandang (`double`, `sixes`, `six`); server yang melempar dadu dan memeriksa setiap langkah; **chat per room** (terpisah dari chat publik, tersedia juga di mobile, dengan sensor kata kasar); autopilot untuk pemain yang terputus; host atau admin dapat mereset room; **room kedaluwarsa dan dihapus otomatis setelah 1 minggu tanpa aktivitas**; koneksi realtime (WebSocket) dengan penyambungan ulang otomatis.

**Perilaku saat game dimatikan:**
- Ludo `Nonaktif` atau `Maintenance`: room yang berjalan **dibekukan** dan dilanjutkan saat game dinyalakan lagi (batas 1 minggu tanpa aktivitas tetap berlaku).
- Leaderboard game nonaktif disembunyikan dari pemain; data tetap tersimpan.

### 4.4 Leaderboard

| ID | Kebutuhan |
|---|---|
| LB-1 | Papan global (tanpa pengelompokan tim atau cabang) dengan tiga periode: **Weekly, Monthly, All time**. |
| LB-2 | Papan dipisah per game karena skor tidak sebanding antar game. *(Sudah diputuskan.)* |
| LB-3 | Minggu dimulai hari Senin, bulan dimulai tanggal 1, keduanya dalam WIB. |
| LB-4 | Menampilkan peringkat teratas dan posisi pemain sendiri. |
| LB-5 | Hanya skor yang lebih baik yang mengubah peringkat (rekor pribadi). |
| LB-6 | Validasi kewajaran skor di server dan batas laju pengiriman. |

### 4.5 Panel admin

Akses: `/admin`, login terpisah, hanya peran **Superadmin**. Akun admin tidak bisa bermain; akun pemain tidak bisa membuka panel.

| Modul | Fungsi |
|---|---|
| Dashboard | Pemain aktif harian, game dimainkan, pendaftar baru, antrean menunggu. |
| Persetujuan | Setujui atau tolak pendaftar (satuan dan massal). |
| Pengguna | Cari, filter, suspend, ban, aktifkan kembali, reset password sementara, hapus akun. |
| Game | Status, jadwal, pesan maintenance, urutan tampil, label "baru". |
| Leaderboard | Lihat run mencurigakan, hapus skor, reset papan periodik. |
| Ludo | Daftar room, hapus atau reset room, kick pemain, moderasi chat. |
| Pengaturan | Mode pendaftaran, jadwal global, bahasa bawaan, konfigurasi email (SMTP). |
| Audit log | Catatan siapa mengubah apa dan kapan. |

Admin pertama dibuat lewat CLI: `pnpm create-admin`.

### 4.6 Email (SMTP) — disiapkan, belum aktif

- Konfigurasi SMTP opsional lewat `.env`; tanpa konfigurasi, layanan email hanya mencatat log.
- Halaman "Pengaturan email" menampilkan status dan tombol "Kirim email uji".
- Saat SMTP aktif, fitur berikut dapat dinyalakan dari admin: verifikasi email, lupa password lewat email, notifikasi undangan Ludo.
- Skema database sudah memuat kolom dan tabel yang dibutuhkan sejak awal.

### 4.7 Bahasa (i18n)

- Dua bahasa: **Indonesia (`id`)** dan **English (`en`)**.
- Opsi pilihan bahasa di header, ditambah opsi **"Ikuti browser"** (bawaan untuk pengunjung baru).
- Pilihan disimpan di profil (sudah login) atau browser (belum login).
- Seluruh UI, pesan error, tanggal, dan angka mengikuti bahasa terpilih; panel admin juga dua bahasa.

### 4.8 Mobile dan PWA

- Mobile-first: seluruh halaman dan semua game bisa dipakai di layar 360px ke atas.
- Target ketuk minimal 44px; tidak bergantung pada hover; mendukung safe area.
- PWA: dapat dipasang ke layar utama (manifest, ikon, service worker). Di LAN tanpa HTTPS, service worker tidak tersedia (batasan browser), sehingga pemasangan penuh memerlukan HTTPS (lihat Architecture.md §9).

### 4.9 Deploy: LAN dan Public

Satu kode, dua profil lewat `DEPLOY_MODE=lan|public`.

| Aspek | LAN | Public |
|---|---|---|
| Mode pendaftaran bawaan | approval | open |
| Perlindungan bot | rate limit | rate limit ketat + CAPTCHA self-hosted |
| HTTPS | opsional | wajib (Caddy) |
| SMTP | boleh kosong | sangat disarankan |

Semua aset di-host sendiri (tanpa CDN) agar jalan tanpa internet.

### 4.10 Chat publik live dan sensor kata kasar

| ID | Kebutuhan | Prioritas |
|---|---|---|
| CHAT-1 | **Panel chat publik live** di sisi kanan, **hanya tampil di desktop** (lebar ≥ 1024px). Tidak ada di mobile dan tablet. Dapat dilipat; pilihan terakhir diingat di browser. | Must |
| CHAT-2 | Hanya pemain `active` yang bisa membaca dan menulis. Admin tidak ikut chat (hanya memoderasi dari panel). | Must |
| CHAT-3 | Pesan maksimum 300 karakter; batas 1 pesan per 2 detik per pemain; saat dibuka menampilkan 50 pesan terakhir; pesan disimpan 7 hari lalu dihapus otomatis. | Must |
| CHAT-4 | **Sensor kata kasar (Indonesia dan English):** kata diganti tanda bintang, pesan tetap terkirim. Berlaku untuk chat publik, chat room Ludo, dan nama tampilan. Daftar bawaan dapat ditambah atau dikurangi admin; mengabaikan huruf besar-kecil, huruf diulang, dan penyisipan simbol sederhana (mis. `b@ng$at`). | Must |
| CHAT-5 | Admin dapat menghapus pesan, membisukan pemain (durasi tertentu), dan mematikan chat publik dari Pengaturan. | Must |
| CHAT-6 | Chat per room di Ludo terpisah dari chat publik dan hanya terlihat anggota room. | Must |

Asumsi yang dapat diubah: panel chat tetap tersedia di halaman game desktop (dilipat otomatis di layar sempit), dan nama tampilan yang kasar disensor, bukan ditolak saat mendaftar.

## 5. Kebutuhan non-fungsional

| Area | Target |
|---|---|
| Performa | Beranda dimuat < 2 detik di jaringan 4G; engine game dimuat lazy per game. |
| Ketersediaan | Satu server cukup; pemulihan otomatis (restart container). |
| Keamanan | Password di-hash argon2; cookie httpOnly; CSRF dilindungi; rate limit; header keamanan; audit log. |
| Aksesibilitas | Kontras WCAG AA, navigasi keyboard, `prefers-reduced-motion` dihormati. |
| Kompatibilitas | Chrome, Safari, Firefox, Edge versi dua tahun terakhir; iOS Safari dan Android Chrome. |
| Skalabilitas | Rancangan untuk ratusan pemain bersamaan di satu server. |
| Pengujian | Unit test engine, integrasi API, E2E alur utama (Playwright). |

## 6. Metrik keberhasilan

- Pemain baru dapat mendaftar dan memainkan game pertama dalam < 3 menit (setelah disetujui).
- Menambah game baru tanpa mengubah file di luar folder game dan template (diperiksa lewat review).
- Tidak ada kunci terjemahan yang hilang antara `id` dan `en` (diperiksa di CI).
- Seluruh alur utama lolos E2E di viewport mobile dan desktop.

## 7. Rencana fase

| Fase | Isi |
|---|---|
| 1 | Fondasi: monorepo, paket `sdk`, `ui`, `i18n`, skema DB, Docker Compose, template game, CI. |
| 2 | Auth pemain: register, login, sesi, lockout, halaman pending. |
| 3 | Panel admin: persetujuan, pengguna, pengaturan, audit log, `create-admin`. |
| 4 | Registry game, status, jadwal, halaman "ditutup". |
| 5 | Memory Match + leaderboard weekly/monthly/all time. |
| 6 | Flappy Bird (porting canvas asli). |
| 7 | Ludo (lobby, papan, WebSocket, chat, autopilot, kedaluwarsa room) + moderasi admin. |
| 8 | Dashboard admin, moderasi skor, chat publik dan sensor kata, hapus akun, PWA. |
| 9 | Polish, QA mobile, paket deploy LAN dan Public, panduan instalasi. |

## 8. Pertanyaan terbuka

Sudah diputuskan: backend Fastify; leaderboard per game; Ludo sampai 12 pemain; kata kasar disensor; pemain boleh hapus akun; HTTPS di LAN bebas (bawaan HTTP, CA internal opsional).

Dokumen pendamping: [ROADMAP.md](ROADMAP.md) (tugas dan keputusan bawaan), [API_Spec.md](API_Spec.md), [Screens.md](Screens.md), [Porting_Guide.md](Porting_Guide.md). Setiap butir di bawah sudah diberi **nilai bawaan** di ROADMAP §0 agar eksekusi tidak terhenti; pemilik dapat mengubahnya kapan saja.

Keputusan fitur:
1. **Keterbacaan dan batas pemain Ludo (Diputuskan pada P7-09):**
   Hasil uji keterbacaan pada viewport 360px menunjukkan papan SVG 12 lengan diskalakan proporsional tanpa scroll horizontal (`w-full`, viewBox adaptif), dan safe zone serta pion tetap terlihat. Berkat mekanisme `autoMove` dan area ketuk pion yang diperlebar (`r=22`), permainan tetap dapat dimainkan di mobile. Namun karena permainan 12 pemain membutuhkan waktu relatif panjang (~144 lemparan/pemain), diputuskan:
   - Nilai pilihan bawaan saat membuat ruangan adalah **4 pemain** (paling ideal untuk mobile).
   - Pemain tetap dapat membuat ruangan hingga **12 pemain** baik di mobile maupun desktop selama diizinkan oleh pengaturan admin.
   - Admin dapat membatasi batas atas ruangan melalui pengaturan `ludo.maxPlayers` (rentang 2–12, bawaan 12).

Diputuskan 2026-11-06 (pemilik meminta asisten memilihkan; pilihan mengikuti nilai bawaan ROADMAP §0):
1. Retensi chat 7 hari dan batas 300 karakter: **dipertahankan** (ROADMAP D5).
2. Panel chat publik **tetap tampil di halaman game desktop dan terlipat secara bawaan** (ROADMAP D5).
3. Anti-cheat skor: **cukup validasi kewajaran di server** (ROADMAP D6). Replay atau simulasi server hanya dipertimbangkan bila ditemukan kecurangan nyata.

Tidak ada pertanyaan terbuka yang tersisa di PRD ini.
