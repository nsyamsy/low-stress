# Flappy Bird

Folder ini dibuat oleh `pnpm new-game flappy-bird --engine canvas`.

## Isi

- `manifest.ts` - kontrak game (id, judul dua bahasa, mode, aturan skor, klien lazy).
- `client/` - komponen yang dimuat shell saat pemain membuka game.
- `locales/id.json` dan `locales/en.json` - namespace `game.flappy-bird`.
- `db/` - migrasi khusus game; semua tabel wajib berawalan `flappy-bird_` (id game diikuti garis bawah).
- `shared/` - logika murni yang dipakai klien dan server.

## Aturan

- Hanya impor `@low-stress/sdk`, `@low-stress/ui`, dan `@low-stress/i18n`.
- Jangan menulis teks UI langsung di komponen; tambahkan kunci ke kedua file locale.
- Jangan menulis warna, ukuran font, atau jarak mentah; pakai kelas dan token `@low-stress/ui`.
- Game baru muncul di admin sebagai `inactive`. Admin yang menyalakannya.
