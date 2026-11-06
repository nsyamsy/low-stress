# Riot

Game deduksi sosial 3D multiplayer di Stasiun Orbital Hening (SOS) untuk Low Stress.

## Isi

- `manifest.ts` - kontrak game (id, judul dua bahasa, mode, aturan skor, klien lazy).
- `client/` - komponen yang dimuat shell saat pemain membuka game Three.js.
- `locales/id.json` dan `locales/en.json` - namespace teks dua bahasa.
- `shared/` - logika murni yang dipakai klien dan server (tabrakan 2D, simulasi otoritatif 15 Hz, interest management).
- `spike/` - aplikasi uji mandiri (RT-14) untuk pengujian performa render Three.js pada ponsel nyata.
- `assets/LICENSES.md` - buku besar lisensi aset.

## Halaman Uji Spike Ponsel Nyata (RT-14)

Aplikasi spike mandiri ini dibuat agar pemilik proyek dapat menguji performa visual Three.js (20 dan 32 karakter ber-instance, peta greybox 10 ruangan, joystick virtual) langsung di browser ponsel (iOS Safari / Android Chrome) tanpa perlu login.

### Cara Menjalankan

Jalankan perintah berikut dari root repositori:

```bash
pnpm spike:riot
# atau dari folder games/riot:
pnpm spike
```

Vite akan menampilkan alamat Network URL lokal, contohnya:
```text
  ➜  Local:   http://localhost:5174/
  ➜  Network: http://<ip-server>:5174/
```

Buka URL `Network` tersebut di peramban ponsel yang berada di jaringan Wi-Fi / LAN yang sama.

### Fitur Halaman Uji Spike

- **Peta Greybox RT-11:** 10 ruangan stasiun luar angkasa dengan tabrakan dinding aktif.
- **20 / 32 Karakter InstancedMesh:** Render performa tinggi dengan variasi warna dan pergerakan per-instance.
- **Kontrol:** Joystick virtual sentuh di kiri bawah (area sentuh ≥ 44px) serta dukungan keyboard WASD di desktop.
- **Panel Telemetri Real-time:**
  - FPS terkini, rata-rata, dan minimum (jendela 60 frame).
  - Info WebGL Three.js: draw calls (`renderer.info.render.calls`) dan jumlah segitiga.
  - Info perangkat: DPR (`devicePixelRatio`), ukuran layar, orientasi layar, userAgent.
  - Evaluasi otomatis terhadap anggaran **R5**: FPS ≥ 30, Draw Calls ≤ 150, Segitiga ≤ 100.000 (status **LULUS** / **GAGAL**).
  - Tombol **Mode 20 / 32 Karakter** untuk menguji beban karakter tambahan.
  - Tombol **Salin Laporan** untuk menyalin hasil JSON ke clipboard untuk dikirimkan ke chat.
  - Pengukuran RTT jaringan ke server Fastify (jika server aktif pada host yang sama; bila berjalan mandiri tanpa server, ditandai sebagai keterbatasan offline/spike).

## Aturan

- Hanya impor `@low-stress/sdk`, `@low-stress/ui`, dan `@low-stress/i18n`.
- Jangan menulis teks UI langsung di komponen; gunakan kunci i18n pada kedua file locale (`id` dan `en`).
- Tanpa CDN eksternal, tanpa aset tidak berlisensi, patuhi batasan hak cipta (orisinal).
