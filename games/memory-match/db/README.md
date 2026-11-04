# Migrasi Memory Match

Letakkan file SQL migrasi game di folder ini. Semua tabel wajib berawalan id game
diikuti garis bawah, misalnya `memory-match_scores`. Pemeriksa
`pnpm check:migrations` menolak tabel yang tidak mengikuti aturan ini.
