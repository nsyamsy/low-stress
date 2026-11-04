# Low Stress — Design System

Versi: 0.1 (draf) · Tanggal: 2026-11-04

Dokumen terkait: [PRD.md](PRD.md) · [Architecture.md](Architecture.md) · [Agents.md](../Agents.md)

---

## 1. Prinsip

1. **Tenang.** Warna lembut, ruang lega, animasi pelan. Nama produknya "Low Stress".
2. **Ringan.** Sedikit elemen per layar. Satu aksi utama per tampilan.
3. **Mobile-first.** Rancang di 360px dulu, lalu perbesar.
4. **Konsisten.** Semua warna, jarak, dan radius berasal dari token. Tidak ada nilai mentah di komponen.
5. **Dua bahasa.** Layout harus tahan teks yang lebih panjang (Indonesia sering 20–30% lebih panjang dari English).

## 2. Logo

**Logo utama: wordmark "low stress" dengan burung koral** di atas, dan garis gelombang sage di bawah tulisan.

| Varian | Penggunaan |
|---|---|
| Penuh (burung + wordmark + gelombang) | Halaman login, register, splash, dokumen |
| Horizontal (burung kecil + wordmark) | Header aplikasi dan panel admin |
| Ikon (burung saja) | Favicon, ikon PWA, avatar sistem |

Aturan:
- Ruang bebas di sekeliling logo minimal setinggi mata burung dikali 2.
- Ukuran minimum: ikon 16px, horizontal 96px lebar.
- Di mode gelap, wordmark memakai krem `#F6F1E7`; burung tetap koral.
- Jangan memutar, meregangkan, atau mengganti warna burung.
- Berkas sumber SVG disimpan di `packages/ui/assets/logo/` (dibuat di fase 1).

## 3. Warna

### 3.1 Palet dasar

| Nama | Hex | Peran |
|---|---|---|
| Teal | `#2F5D55` | Teks utama, tombol utama, sidebar admin |
| Sage | `#7FA88B` | Aksen lembut, gelombang logo, chip pengguna |
| Krem | `#F6F1E7` | Latar halaman (mode terang) |
| Krem terang | `#FFFDF8` | Permukaan kartu |
| Koral | `#F2735B` | Aksen, burung, badge, peringkat |
| Amber | `#F2B84B` | Paruh, peringatan, status Maintenance |
| Garis | `#D9D2C0` | Border halus |
| Teks sekunder | `#557066` | Teks pendukung |

### 3.2 Token semantik

Komponen hanya memakai token (CSS variables), bukan hex.

| Token | Terang | Gelap |
|---|---|---|
| `--bg-page` | `#F6F1E7` | `#16211F` |
| `--bg-surface` | `#FFFDF8` | `#1E2D2A` |
| `--bg-surface-raised` | `#FFFFFF` | `#25372F` |
| `--bg-inset` | `#F0EADA` | `#121A18` |
| `--text-primary` | `#2F5D55` | `#F6F1E7` |
| `--text-secondary` | `#557066` | `#A9BFB6` |
| `--text-muted` | `#6B7D77` | `#86A199` |
| `--text-on-primary` | `#F6F1E7` | `#16211F` |
| `--border` | `#D9D2C0` | `#32463F` |
| `--border-strong` | `#CFC8B5` | `#44594F` |
| `--primary` | `#2F5D55` | `#7FA88B` |
| `--primary-hover` | `#3F7268` | `#98BFA3` |
| `--accent` | `#F2735B` | `#F2735B` |
| `--accent-text` | `#B53D28` | `#F59A86` |
| `--success-bg` / `--success-text` | `#D5EAD9` / `#1F4D2C` | `#24402D` / `#BFE3C8` |
| `--warning-bg` / `--warning-text` | `#FBEBC7` / `#6B4A0A` | `#4A3A14` / `#F2D690` |
| `--danger-bg` / `--danger-text` | `#F7D9D3` / `#8A2A18` | `#4A2620` / `#F5B8AB` |
| `--focus-ring` | `#2F5D55` | `#7FA88B` |

### 3.3 Aturan penggunaan warna

- **Koral tidak dipakai sebagai warna teks kecil di atas krem** (kontras sekitar 2,9:1). Untuk teks dan tautan koral gunakan `--accent-text`. Koral murni hanya untuk bentuk, ikon, dan teks besar (≥ 18px atau 14px tebal).
- **Satu tombol utama per tampilan**; sisanya tombol sekunder (outline) atau ghost.
- Status memakai pasangan `*-bg` dan `*-text`, tidak pernah hanya warna: selalu disertai label atau ikon.
- Target kontras: teks normal ≥ 4,5:1; teks besar dan ikon fungsional ≥ 3:1.

### 3.4 Mode gelap

Mengikuti `prefers-color-scheme` secara bawaan, dengan sakelar manual (Terang, Gelap, Sistem) di menu pengguna. Token di atas berganti otomatis lewat atribut `data-theme` pada `<html>`.

## 4. Tipografi

- **Keluarga:** font sistem yang bersahabat (`ui-rounded`, `"Nunito"` bila di-host sendiri, lalu `system-ui`, `sans-serif`). Font di-host sendiri di `apps/web/public/fonts` (tanpa Google Fonts, karena LAN). Subset Latin saja.
- **Bobot:** hanya 400 dan 500 (tidak ada tebal berlebihan), kecuali wordmark.
- Judul memakai sentence case. Tidak ada huruf kapital semua.

| Peran | Mobile | Desktop | Bobot | Line height |
|---|---|---|---|---|
| Display (judul halaman login) | 24px | 28px | 500 | 1.25 |
| Heading 1 | 20px | 24px | 500 | 1.3 |
| Heading 2 | 16px | 18px | 500 | 1.35 |
| Body | 14px | 15px | 400 | 1.6 |
| Small | 13px | 13px | 400 | 1.5 |
| Caption | 12px | 12px | 400 | 1.4 |

Tidak ada teks di bawah 12px. Angka papan skor memakai `font-variant-numeric: tabular-nums`.

## 5. Spasi, radius, bayangan

- **Skala spasi (4px):** 4, 8, 12, 16, 20, 24, 32, 48.
- **Gutter halaman:** 16px (mobile), 24px (tablet), 32px (desktop). Lebar konten maksimum 1120px, panel admin 1280px.
- **Radius:** kontrol 8px, kartu 12px, modal 16px, chip dan pil 999px. Tidak ada sudut membulat pada border satu sisi.
- **Border:** 0,5–1px `--border`. Bayangan hampir tidak dipakai; hanya `--shadow-popover` untuk menu dan modal. Tanpa gradien dan efek glow.

## 6. Breakpoint dan layout

| Nama | Lebar | Layout |
|---|---|---|
| `xs` | 360–479 | Satu kolom, navigasi bawah |
| `sm` | 480–767 | Satu kolom, kartu lebih lebar |
| `md` | 768–1023 | Dua kolom kartu game, header penuh |
| `lg` | ≥ 1024 | Tiga kolom kartu game, sidebar admin tetap |

- Navigasi pemain: bar atas di desktop; di mobile, bar bawah dengan tiga tab (Beranda, Leaderboard, Profil).
- Desktop (`lg`): panel chat publik di kolom kanan (lihat §7.9); tidak ada di mobile dan tablet.
- Panel admin: sidebar kiri di desktop; di mobile menjadi drawer. Tabel berubah menjadi daftar kartu di bawah 768px.
- Hormati safe area: `padding: env(safe-area-inset-*)`.

## 7. Komponen

Semua komponen berada di `packages/ui`. Setiap komponen punya keadaan: default, hover, fokus, aktif, disabled, loading, error.

### 7.1 Tombol

| Varian | Tampilan | Penggunaan |
|---|---|---|
| Primary | Isi teal, teks krem | Aksi utama (Masuk, Daftar, Setujui) |
| Secondary | Outline `--border-strong` | Aksi pendukung (Tolak, Kembali) |
| Ghost | Tanpa border | Aksi tersier, ikon |
| Danger | Isi `--danger-text` | Hapus, ban (selalu dengan konfirmasi) |

Tinggi 40px (mobile 44px), padding horizontal 16px, label berupa kata kerja 1–3 kata. Hindari tombol disabled; tampilkan pesan alasan bila aksi tidak tersedia.

### 7.2 Kolom isian

Tinggi 40–44px, label di atas, teks bantuan di bawah (12px), pesan error di bawah dengan ikon dan warna `--danger-text`. Placeholder berisi contoh nyata, bukan label ulang. Field password punya tombol tampilkan/sembunyikan.

### 7.3 Kartu game

Pratinjau berwarna (gambar atau ilustrasi), nama game, chip status, satu baris info (rekor pribadi atau pesan), dan satu tombol. Tiga status:

| Status | Chip | Tombol |
|---|---|---|
| Aktif | Hijau lembut "Aktif" | "Main" (primary) |
| Maintenance | Amber "Maintenance" | "Terkunci" (nonaktif, dengan pesan admin) |
| Nonaktif | Tidak ditampilkan ke pemain | — |

### 7.4 Chip dan badge

Pil kecil 12px, padding 3×10px, pasangan `*-bg` + `*-text`. Dipakai untuk status akun, status game, peran.

### 7.5 Tabel leaderboard

Kolom: peringkat, nama, skor. Tiga peringkat teratas bernomor koral. Baris pemain sendiri disorot `--bg-inset` dengan label "(kamu)". Tab periode memakai kontrol segmen (Weekly, Monthly, All time) dengan pilihan game di atasnya.

### 7.6 Navigasi, modal, toast

- Modal: radius 16px, fokus dikurung (focus trap), tutup dengan Esc dan tombol tutup. Aksi destruktif memakai konfirmasi dua langkah.
- Toast: di bawah pada mobile, kanan atas pada desktop; hilang otomatis 4 detik kecuali error.
- Tab dan kontrol segmen: tinggi 36px (mobile 40px).

### 7.7 Panel admin

Sidebar teal `#2F5D55` dengan item krem; item aktif memakai `#3F7268`. Konten di atas `--bg-page`. Kartu metrik: latar `--bg-surface`, label 12px, angka 20–24px. Kontrol segmen tiga posisi untuk status game (Aktif, Maintenance, Nonaktif); posisi aktif berwarna sesuai status.

### 7.9 Panel chat publik (khusus desktop)

- Tampil hanya di lebar ≥ 1024px sebagai kolom kanan selebar 280px; di bawah itu tidak dirender sama sekali.
- Header: judul "Chat publik", jumlah pemain online, tombol lipat. Saat dilipat menjadi tab vertikal 40px di tepi kanan dengan penanda pesan baru.
- Daftar pesan: nama (500), isi (400), waktu kecil (12px, `--text-muted`). Pesan sendiri rata kanan berlatar `--bg-inset`. Kata yang disensor tampil sebagai `****`.
- Kolom input di bawah (tinggi 40px), tombol kirim ikon, penghitung karakter muncul saat mendekati 300.
- Status khusus: dibisukan ("Kamu dibisukan sampai 14:30"), chat dimatikan admin ("Chat publik sedang dimatikan"), terputus ("Menyambung ulang…").
- Di halaman game, panel otomatis terlipat bila lebar konten game kurang dari yang dibutuhkan.
- Chat room Ludo adalah komponen terpisah di dalam halaman room, bukan panel ini, dan tersedia juga di mobile (laci yang bisa dibuka).

### 7.8 Pemilih bahasa dan tema

Di header (desktop) atau menu profil (mobile): menu pilihan **Ikuti browser**, **Indonesia**, **English**. Sakelar tema: Sistem, Terang, Gelap. Keduanya bisa dipakai sebelum login.

## 8. Ikon dan ilustrasi

- Set ikon outline berstroke seragam 1,5px (disarankan Tabler Icons, di-host sendiri atau dipaketkan dengan bundler). Ukuran 16, 20, 24px.
- Ilustrasi game bergaya datar, bentuk membulat, warna dari palet. Tidak ada tekstur atau bayangan.
- Tidak memakai emoji sebagai ikon fungsional.

## 9. Gerak

| Token | Durasi | Penggunaan |
|---|---|---|
| `--dur-fast` | 120ms | Hover, fokus |
| `--dur-base` | 200ms | Buka-tutup menu, toast |
| `--dur-slow` | 320ms | Transisi halaman, modal |

Kurva `ease-out` untuk masuk, `ease-in` untuk keluar. Hormati `prefers-reduced-motion`: matikan parallax, goyangan, dan animasi dekoratif; animasi game boleh tetap berjalan tetapi efek kilat dihilangkan.

## 10. Aksesibilitas

- Kontras sesuai bagian 3.3. Fokus selalu terlihat (`--focus-ring`, ketebalan 2px, offset 2px).
- Semua kontrol bisa dioperasikan dengan keyboard; urutan tab logis.
- Gambar dan ikon bermakna punya teks alternatif atau `aria-label`; ikon dekoratif `aria-hidden`.
- Status tidak hanya ditandai warna.
- Game: sediakan opsi suara hidup/mati, dan kontrol alternatif non-sentuh (keyboard) bila memungkinkan.
- Bahasa dokumen (`<html lang>`) mengikuti bahasa aktif.

## 11. Gaya tulisan (voice)

Nada: ramah, singkat, tidak menggurui. Berlaku untuk Indonesia dan English.

- Tombol: kata kerja, 1–3 kata ("Masuk", "Buat akun", "Setujui"). Tanpa titik akhir.
- Sapaan memakai "kamu" (Indonesia) dan "you" (English); tidak memakai "saya" atas nama sistem.
- Pesan error: apa yang terjadi, lalu apa yang bisa dilakukan, satu kalimat. Contoh: "Username itu sudah dipakai. Coba yang lain."
- Hindari kata "berhasil" dan tanda seru pada pesan sistem. "Pengaturan disimpan", bukan "Pengaturan berhasil disimpan!".
- Teks kosong mengundang, bukan meminta maaf.
- Kunci i18n memakai pola `area.elemen.keadaan`, contoh `auth.login.submit`, `admin.users.banConfirm`.

## 12. Aturan khusus game

- Setiap game memakai token yang sama untuk UI di sekitar canvas (judul, tombol, skor). Di dalam canvas, game memakai palet dan gambarnya sendiri. Untuk game yang diporting dari `performance_dash` (Flappy Bird, Memory Match, Ludo), tampilan di dalam game dipertahankan persis seperti aslinya; palet Low Stress hanya untuk bingkai di sekitarnya. Game baru bebas memilih palet, sebaiknya selaras dengan Low Stress.
- Area bermain harus pas di viewport mobile tanpa scroll dan menjaga rasio (skala FIT).
- Elemen HUD minimal 12px dan tidak tertutup oleh safe area atau tombol sistem.
- Layar hasil (game over) memuat skor, rekor pribadi, dan tombol "Main lagi" yang tidak bisa terpencet tidak sengaja (jeda singkat setelah game berakhir).
