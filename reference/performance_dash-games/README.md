# Referensi: game dari performance_dash

Salinan baca-saja dari kode game di `D:\proj\performance_dash` (Commercial > Utilities), diambil 2026-11-04.
Hanya untuk acuan porting; BUKAN bagian dari struktur aplikasi Low Stress dan tidak dikompilasi.

Catatan: game ini tidak memiliki berkas gambar atau audio. Semua tampilan digambar lewat kode
(Canvas 2D untuk Flappy Bird, SVG untuk Ludo, ikon lucide untuk Memory Match) dan semua suara
disintesis lewat Web Audio API. "Aset" game = palet warna, fungsi gambar, dan sintesis suara di berkas ini.

Pemetaan nama: Quick Tool = Flappy Bird, Team Sync = Ludo.
Ketergantungan lama yang harus diganti saat porting: `@/lib/commercial-i18n` (teks), `@/lib/utils` (cn),
`@/lib/commercial` dan `@/lib/db` (auth dan database), Next.js route handlers.
