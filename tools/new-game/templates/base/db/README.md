# Migrasi __GAME_TITLE__

Letakkan file SQL migrasi game di folder ini. Semua tabel wajib berawalan id game
diikuti garis bawah, misalnya `__GAME_ID___scores`. Pemeriksa
`pnpm check:migrations` menolak tabel yang tidak mengikuti aturan ini.
