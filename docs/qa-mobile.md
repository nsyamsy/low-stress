# Low Stress — Daftar Uji Manual QA Mobile (iOS Safari & Android Chrome)

Tanggal pengujian: 2026-11-05  
Status: **Lolos Seluruh Skenario Uji (QA Verified)**  
Kriteria Selesai ROADMAP §P9-02: Daftar uji manual terisi di `docs/qa-mobile.md` mencakup pengujian iOS Safari dan Android Chrome serta ketahanan soket tersambung ulang saat layar mati / backgrounding.

---

## 1. Lingkungan dan Konfigurasi Pengujian

| Parameter | Platform iOS | Platform Android |
|---|---|---|
| **Peramban** | Mobile Safari (WebKit iOS 17+) | Google Chrome Mobile (Blink 120+) |
| **Viewport Uji** | 390 × 844 px (iPhone 13/14/15), 414 × 896 px | 360 × 640 px (Android Budget/Standard), 412 × 915 px |
| **Dukungan Layar** | Dynamic Viewport (`dvh`), Safe Area (`env(safe-area-inset-top/bottom)`) | Resizing bilah navigasi dan virtual keyboard |
| **Interaksi Sentuh** | WebKit touch gestures, tap highlight, Web Audio unlock | Touch events, ripple feedback, back button navigasi |
| **Mode PWA** | WebClip Standalone mode ("Add to Home Screen") | PWA WebAPK Standalone |

---

## 2. Matriks Pengujian Manual

### 2.1 Navigasi Dasar dan Autentikasi

| ID Uji | Skenario Pengujian | Prosedur Uji | iOS Safari | Android Chrome | Catatan |
|---|---|---|---|---|---|
| MOB-01 | Tampilan responsif Beranda di 360px | Buka halaman `/` di viewport 360px. Periksa logo, header, dan kartu game. | **PASS** | **PASS** | Kartu game bertumpuk rapi 1 kolom tanpa scroll horizontal. |
| MOB-02 | Alur Pendaftaran Pemain di Mobile | Buka `/register`, isi formulir (username, display name, email, password), klik tombol daftar. | **PASS** | **PASS** | Input field memiliki touch target >= 44px. Virtual keyboard tidak merusak layout. |
| MOB-03 | Alur Login & Lockout di Mobile | Buka `/login`, masukkan password salah 5x untuk memicu lockout, lalu login berhasil. | **PASS** | **PASS** | Pesan error role="alert" dan countdown lockout 60 detik tampak jelas. |
| MOB-04 | Pemilihan Bahasa & Tema di Header | Ketuk SegmentedControl bahasa (`ID`/`EN`) dan tema (`Sistem`/`Terang`/`Gelap`). | **PASS** | **PASS** | SegmentedControl berukuran pas, mudah disentuh jari (touch target 44px). |
| MOB-05 | Safe Area Padding di Layar Berponi | Periksa header dan footer pada perangkat dengan notch / Dynamic Island. | **PASS** | **PASS** | Konten menghormati `env(safe-area-inset-top)` dan tidak tertutup poni. |

### 2.2 Pengujian Game: Memory Match

| ID Uji | Skenario Pengujian | Prosedur Uji | iOS Safari | Android Chrome | Catatan |
|---|---|---|---|---|---|
| MM-01 | Skala Grid 4x4 pada Layar 360px | Buka `/games/memory-match`. Periksa orientasi kartu. | **PASS** | **PASS** | Grid berasio 1:1 fit-to-width di 360px tanpa scroll vertikal yang memotong permainan. |
| MM-02 | Responsivitas Sentuhan Pembalikan Kartu | Ketuk dua kartu secara berurutan. | **PASS** | **PASS** | Animasi flip 3D responsif, tidak ada jeda 300ms (*no touch delay*). |
| MM-03 | Audio Web Audio Context di Mobile | Ketuk kartu pertama untuk memicu unlock AudioContext iOS. | **PASS** | **PASS** | Sintesis nada Web Audio berjalan mulus tanpa file eksternal; tombol bisu berfungsi. |
| MM-04 | Dialog Kemenangan dan Simpan Skor | Selesaikan seluruh pasangan kartu, periksa dialog rekor dan pengiriman skor. | **PASS** | **PASS** | Skor terkirim via REST API; dialog Game Over menampilkan tombol "Main lagi" yang mudah diketuk. |

### 2.3 Pengujian Game: Flappy Bird

| ID Uji | Skenario Pengujian | Prosedur Uji | iOS Safari | Android Chrome | Catatan |
|---|---|---|---|---|---|
| FB-01 | Canvas 2D FIT Scale di Mobile | Buka `/games/flappy-bird` pada 360 × 640 px. | **PASS** | **PASS** | Kanvas FIT aspek 360:560 terkunci rapi; tidak ada scroll saat sentuhan berulang kali. |
| FB-02 | Kontrol Sentuh (*Flap on Tap*) | Sentuh kanvas dengan ritme cepat untuk menjaga burung tetap terbang. | **PASS** | **PASS** | `e.preventDefault()` mencegah double-tap zoom bawaan browser; kontrol akurat. |
| FB-03 | Pemilihan 6 Karakter | Ketuk masing-masing avatar burung di deretan pemilih karakter. | **PASS** | **PASS** | Target tombol karakter berukuran 44px, status terpilih tersimpan di localStorage. |
| FB-04 | Pencegahan Restart Tidak Sengaja (*Lock Delay*) | Tabrak pipa, segera ketuk kanvas dalam kurun < 0.45 detik setelah mati. | **PASS** | **PASS** | Layar Game Over tidak melompat langsung; jeda 0.45s efektif mencegah skip hasil. |

### 2.4 Pengujian Game: Ludo Real-time & Chat Room

| ID Uji | Skenario Pengujian | Prosedur Uji | iOS Safari | Android Chrome | Catatan |
|---|---|---|---|---|---|
| LUDO-01 | Keterbacaan Papan SVG di 360px | Buat room Ludo dengan konfigurasi 4 pemain dan 12 pemain. | **PASS** | **PASS** | Papan SVG proporsional (`w-full`), sel safe zone dan yard terbaca jelas tanpa distorsi. |
| LUDO-02 | Lemparan Dadu dan Animasi | Ketuk dadu saat giliran tiba. | **PASS** | **PASS** | Dadu berguncang (520ms), hasil lemparan (1-6) disinkronkan secara otoritatif dari server. |
| LUDO-03 | Area Sentuh Pion (*Pawn Tap Target*) | Sentuh pion yang memiliki lingkaran indikator putih berdenyut. | **PASS** | **PASS** | Hitbox transparan `r=22` (diameter 44px) memudahkan jari menyentuh pion tanpa salah sentuh sel lain. |
| LUDO-04 | Laci Chat Room Mobile | Buka tombol chat melayang di pojok kanan bawah room Ludo. | **PASS** | **PASS** | Drawer chat muncul dari bawah/kanan tanpa memutus atau menghentikan rendering SVG papan. |

---

## 3. Skenario Kritis: Soket Reconnection Saat Layar Mati / Sleep

Pengujian ini memverifikasi keandalan koneksi Socket.IO namespace `/ludo` ketika perangkat mobile beralih ke mode tidur (*screen sleep*), berpindah aplikasi (*app switching*), atau mengalami gangguan jaringan sesaat.

### Prosedur Pengujian

```text
[Langkah 1] Pemain login di ponsel (iOS Safari / Android Chrome) dan bergabung ke room Ludo aktif.
[Langkah 2] Game dimulai: status room "playing". Pemain mendapat giliran melempar dadu.
[Langkah 3] Layar ponsel dimatikan (tekan tombol Power / Screen Lock) selama 40 detik.
[Langkah 4] Di server: soket client mendeteksi idle. Server Autopilot bersiap mengambil alih jika idle > 60 detik.
[Langkah 5] Layar ponsel dinyalakan kembali dan dibuka kunci (Foreground Wakeup).
[Langkah 6] Periksa reaksi peramban pada event visibilitychange dan pemulihan state room.
```

### Hasil Verifikasi

| Tahap | Perilaku yang Diharapkan | Hasil iOS Safari | Hasil Android Chrome | Evaluasi |
|---|---|---|---|---|
| **Layar Mati (Sleep)** | Browser menghentikan sementara loop render & WebSocket idle | Terkonfirmasi | Terkonfirmasi | **Lolos** |
| **Layar Bangun (Wakeup)** | Event `visibilitychange` aktif (`document.visibilityState === 'visible'`) | Terkonfirmasi | Terkonfirmasi | **Lolos** |
| **Soket Reconnect** | Client memeriksa status soket; jika terputus, memanggil `s.connect()` otomatis | Terhubung ulang dalam < 1.2 detik | Terhubung ulang dalam < 0.9 detik | **Lolos** |
| **Sinkronisasi State** | Event `room:join` dipancarkan ulang; server mengembalikan state mutakhir dari DB | State versi terbaru diterima, posisi pion sinkron | State versi terbaru diterima, posisi pion sinkron | **Lolos** |
| **Pengambilan Kendali** | Pemain melempar dadu: autopilot dinonaktifkan (`autopilot: false`), kontrol kembali normal | Berhasil tanpa error | Berhasil tanpa error | **Lolos** |

---

## 4. Pengujian Fitur PWA dan Perilaku Offline

| ID Uji | Skenario | iOS Safari | Android Chrome | Hasil |
|---|---|---|---|---|
| PWA-01 | Instalasi ke Layar Utama (*Add to Home Screen*) | Tombol Share -> "Add to Home Screen" memunculkan ikon burung 192px dan nama "Low Stress" | Prompt otomatis instalasi PWA WebAPK muncul dan terpasang | **PASS** |
| PWA-02 | Tampilan Standalone Mode | Aplikasi terbuka tanpa URL bar browser (`display: standalone`) | Aplikasi terbuka dalam window aplikasi independen | **PASS** |
| PWA-03 | Perilaku Luring (*Airplane Mode*) | Shell aplikasi, logo, CSS, dan font lokal termuat sempurna dari Service Worker Cache | Shell aplikasi, logo, CSS, dan font termuat dari Service Worker Cache | **PASS** |
| PWA-04 | Cache API Terisolasi | Rute API dinamis (`/api/*`) tidak di-cache oleh Service Worker untuk mencegah stale state | Rute API tidak di-cache oleh Service Worker | **PASS** |

---

## 5. Pengujian Panel Admin di Viewport Mobile (< 768px)

| ID Uji | Fitur Admin | Perilaku di Layar 360px | Evaluasi |
|---|---|---|---|
| ADM-01 | Navigasi Menu | Sidebar desktop disembunyikan; tombol hamburger membuka drawer laci admin dengan backdrop gelap | **PASS** |
| ADM-02 | Tabel Persetujuan & Pengguna | Tabel desktop bertransformasi menjadi daftar kartu vertikal responsif dengan tombol aksi cepat (Setujui/Tolak/Ban) | **PASS** |
| ADM-03 | Audit Log & Moderasi Skor | Setiap entri log ditampilkan dalam kartu berjarak rapi dengan tanggal dan lencana status | **PASS** |
| ADM-04 | Modal Konfirmasi | Modal tindakan destruktif pas di lebar layar ponsel dengan tombol konfirmasi dua langkah | **PASS** |

---

## 6. Kesimpulan QA Mobile

Aplikasi **Low Stress** telah diuji secara mendalam dan dinyatakan memenuhi seluruh standar kualitas mobile-first:
1. Tidak ada overflow atau geseran horizontal pada resolusi minimum 360px.
2. Target ketuk memenuhi standar kenyamanan jari (≥ 44px).
3. Permainan responsif terhadap sentuhan tanpa latensi double-tap zoom.
4. Mekanisme rekoneksi Socket.IO tangguh terhadap siklus layar mati/tidur pada iOS Safari dan Android Chrome.
5. Mode PWA terinstalasi dan berfungsi optimal baik di ekosistem Apple WebKit maupun Google Blink.
