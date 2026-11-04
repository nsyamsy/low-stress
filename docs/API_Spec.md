# Low Stress — Spesifikasi API

Versi: 0.1 · Tanggal: 2026-11-04

Kontrak antara `apps/web` dan `apps/server`. Struktur dan alasan teknis ada di [Architecture.md](Architecture.md); urutan kerja di [ROADMAP.md](ROADMAP.md). Jika implementasi harus menyimpang, ubah dokumen ini lebih dulu.

---

## 1. Konvensi

- Basis: `/api`. JSON UTF-8. Waktu ISO 8601 UTC (`2026-11-04T05:00:00.000Z`); tampilan WIB dihitung di klien.
- Autentikasi pemain: cookie `ls_session`. Admin: cookie `ls_admin`. Keduanya `httpOnly`, `SameSite=Lax`, `Secure` otomatis di HTTPS.
- **CSRF:** semua metode selain `GET`/`HEAD`/`OPTIONS` wajib header `X-CSRF-Token` (nilai dari cookie `ls_csrf`, atau dari `GET /api/csrf`) dan `Origin` sama dengan `APP_ORIGIN`.
- **Error:** status HTTP sesuai, badan `{ "error": { "code": "…", "params": { … } } }`. Server tidak mengirim kalimat; klien menerjemahkan `code`.
- **Paginasi:** `?page=1&pageSize=25` (maks 100); respons `{ items, page, pageSize, total }`.
- **Validasi:** semua badan dan query divalidasi Zod; gagal → `400 VALIDATION_FAILED` dengan `params.fields` (peta kolom → kode).
- Header `Cache-Control: no-store` untuk respons ber-autentikasi.

### Kode error umum

| Kode | HTTP | Arti |
|---|---|---|
| `VALIDATION_FAILED` | 400 | Input tidak valid |
| `UNAUTHENTICATED` | 401 | Belum login |
| `FORBIDDEN` | 403 | Peran tidak berhak |
| `NOT_FOUND` | 404 | Tidak ada |
| `CONFLICT` | 409 | Konflik status |
| `RATE_LIMITED` | 429 | Terlalu sering (`params.retryAfterSec`) |
| `CSRF_INVALID` | 403 | Token CSRF salah atau hilang |
| `INTERNAL` | 500 | Kesalahan server |

Kode khusus domain ada di tiap bagian.

---

## 2. Sistem

| Metode | Rute | Keterangan |
|---|---|---|
| GET | `/healthz` | `{ ok: true }` jika proses hidup |
| GET | `/readyz` | 200 jika DB terhubung, 503 jika tidak |
| GET | `/api/csrf` | Mengatur cookie CSRF, mengembalikan `{ token }` |
| GET | `/api/public-config` | `{ registration: 'approval'\|'open'\|'closed', captcha: boolean, emailEnabled: boolean, defaultLocale: 'auto'\|'id'\|'en', deployMode: 'lan'\|'public', chatEnabled: boolean }` (tanpa autentikasi) |

---

## 3. Auth pemain

### POST `/api/auth/register`

Badan: `{ username, displayName, email, password, captcha? }` (`captcha` wajib bila `public-config.captcha`).

Aturan: username 3–20 `[a-z0-9_.]` (diubah ke huruf kecil), nama tampilan 2–24, email valid, password ≥ 8 dan ≠ username.

Respons `201`: `{ status: 'pending' | 'active' }`.

Kode: `REGISTRATION_CLOSED` (403), `USERNAME_TAKEN` (409), `EMAIL_TAKEN` (409), `PASSWORD_TOO_WEAK` (400), `CAPTCHA_FAILED` (400).

### POST `/api/auth/login`

Badan: `{ username, password }`. Respons `200`: `{ user: Me }` + cookie sesi.

Kode: `AUTH_INVALID_CREDENTIALS` (401), `ACCOUNT_PENDING` (403), `ACCOUNT_REJECTED` (403), `ACCOUNT_SUSPENDED` (403), `ACCOUNT_BANNED` (403), `AUTH_LOCKED` (429, `params.retryAfterSec`).

Catatan: untuk `pending` sesi **tetap dibuat** dengan hak terbatas agar halaman `/pending` dapat memuat `GET /api/me`; semua rute lain menolak dengan `ACCOUNT_PENDING`.

### POST `/api/auth/logout`

Respons `204`. Menghapus sesi.

### `Me`

```json
{
  "id": "uuid", "username": "rina_p", "displayName": "Rina", "email": "rina@example.com",
  "emailVerified": false, "status": "active",
  "locale": "auto", "theme": "system", "createdAt": "…"
}
```

`displayName` selalu sudah disensor.

---

## 4. Profil

| Metode | Rute | Badan | Respons |
|---|---|---|---|
| GET | `/api/me` | — | `Me` |
| PATCH | `/api/me` | `{ displayName?, locale?: 'auto'\|'id'\|'en', theme?: 'system'\|'light'\|'dark', email? }` | `Me` |
| POST | `/api/me/password` | `{ currentPassword, newPassword }` | `204`. Kode: `AUTH_INVALID_CREDENTIALS`, `PASSWORD_TOO_WEAK` |
| DELETE | `/api/me` | `{ password }` | `204`. Menjalankan penghapusan akun (Architecture §11). Kode: `AUTH_INVALID_CREDENTIALS` |

Mengganti email mengatur ulang `emailVerified = false`. Kode: `EMAIL_TAKEN`.

---

## 5. Game dan jadwal

### GET `/api/games`

```json
{
  "items": [
    {
      "id": "flappy-bird",
      "title": { "id": "Flappy Bird", "en": "Flappy Bird" },
      "description": { "id": "…", "en": "…" },
      "mode": "solo",
      "status": "active",
      "open": true,
      "opensAt": "2026-11-05T05:00:00.000Z",
      "windows": [{ "start": "12:00", "end": "13:00" }],
      "days": [1,2,3,4,5],
      "maintenanceMessage": { "id": null, "en": null },
      "badge": "new",
      "mobile": { "supported": true, "orientation": "portrait" },
      "mine": { "best": 14, "plays": 31 }
    }
  ]
}
```

Hanya game `active` dan `maintenance` yang muncul. `open` = status `active` **dan** di dalam jadwal. `opensAt` = pembukaan berikutnya bila tertutup.

### Gerbang

Semua `/api/games/:id/*` kecuali `GET /api/games` melewati gerbang: `404 NOT_FOUND` (nonaktif atau tidak ada), `403 GAME_MAINTENANCE`, `403 GAME_CLOSED` (`params.windows`, `params.days`, `params.opensAt`). Akun admin → `403 FORBIDDEN`.

---

## 6. Skor dan leaderboard

### POST `/api/games/:id/scores`

Badan: `{ score: int, durationMs: int, … }` + field tambahan sesuai manifest game (Memory Match: `moves`, `combos`).

Validasi: `manifest.scoring.validate`. Batas laju: minimal 3 detik antar kiriman per pemain dan `maxSubmitRatePerMin` manifest.

Respons `200`: `{ best, bestPlay, plays, isNewBest }`.

Kode: `SCORE_INVALID` (400), `SCORE_RATE_LIMITED` (429).

Run Flappy Bird dengan `score < 1` dijawab `200` dengan `isNewBest:false` dan **tidak disimpan**.

### GET `/api/games/:id/leaderboard?period=all|week|month`

```json
{
  "period": "week",
  "periodStart": "2026-11-02T17:00:00.000Z",
  "periodEnd": "2026-11-09T17:00:00.000Z",
  "entries": [
    { "rank": 1, "userId": "uuid", "name": "Dimas", "score": 38, "plays": 12, "bestPlay": 7, "at": "…", "isMe": false }
  ],
  "me": null,
  "mine": { "rank": 12, "name": "Rina", "score": 14, "plays": 4, "bestPlay": 2, "at": "…", "isMe": true }
}
```

`entries` = top 10. `me` = baris pemain bila di luar top 10, selain itu `null`. `mine` = baris pemain bila ada skor pada periode. `periodStart/End` null untuk `all`. `name` disensor.

---

## 7. Chat publik

| Metode | Rute | Keterangan |
|---|---|---|
| GET | `/api/chat/history` | `{ items: ChatMessage[] }` 50 terakhir, urut naik waktu. Kode: `CHAT_DISABLED` (403) |

```json
ChatMessage { "id": "uuid", "userId": "uuid|null", "name": "Dimas|Pengguna dihapus", "body": "…", "createdAt": "…" }
```

### Soket: namespace `/public-chat`

Handshake memakai cookie `ls_session`. Hanya pemain `active`; admin dan `pending` ditolak (`connect_error`, `message = 'FORBIDDEN'`).

| Arah | Event | Payload |
|---|---|---|
| klien → server | `chat:send` | `{ body }` (≤ 300). Ack: `{ ok: true }` atau `{ ok: false, code }` |
| server → klien | `chat:message` | `ChatMessage` |
| server → klien | `chat:deleted` | `{ id }` |
| server → klien | `chat:muted` | `{ until }` (hanya ke pemain yang dibisukan) |
| server → klien | `chat:presence` | `{ online: number }` |
| server → klien | `chat:status` | `{ enabled: boolean }` |

Kode ack: `CHAT_DISABLED`, `CHAT_MUTED` (`params.until`), `CHAT_TOO_LONG`, `CHAT_EMPTY`, `RATE_LIMITED`.

Urutan proses: validasi → mute → rate limit (1/2 detik) → sensor → simpan → siarkan. Klien tidak pernah menyensor.

---

## 8. Ludo (REST)

Awalan `/api/games/ludo`. Semua melewati gerbang game.

| Metode | Rute | Badan | Respons |
|---|---|---|---|
| GET | `/rooms` | — | `{ items: RoomSummary[] }` (room yang dimiliki, diundang, atau diikuti) |
| POST | `/rooms` | `{ name (≤60), maxPlayers (2..ludo.maxPlayers), play?: boolean }` | `{ id }` |
| GET | `/rooms/:id` | — | `RoomView` (sesuai sudut pandang pemanggil) |
| DELETE | `/rooms/:id` | — | `204` (host sebelum mulai, atau admin lewat API admin) |
| GET | `/users/search?q=` | — | `{ items: { id, username, displayName }[] }` untuk undangan |

Kode: `LUDO_ROOM_NOT_FOUND` (404), `LUDO_NOT_MEMBER` (403), `LUDO_ROOM_FULL` (409), `LUDO_BAD_STATE` (409), `LUDO_NOT_YOUR_TURN` (409), `LUDO_ILLEGAL_MOVE` (400).

`RoomSummary`: `{ id, name, status: 'lobby'|'playing'|'finished', hostId, hostName, players, maxPlayers, myStatus, updatedAt }`.

`RoomView` meneruskan struktur room lama: `{ id, name, status, hostId, maxPlayers, players[{ userId, name, status, pawn, color, autopilot }], state (papan, giliran, dadu, pion, fase), event, messages[], me, version, playSeconds }`. `name` disensor.

### Soket: namespace `/ludo`

Handshake memakai cookie `ls_session`. Klien masuk ke room dengan `room:join`.

| Arah | Event | Payload |
|---|---|---|
| klien → server | `room:join` | `{ roomId }` → ack `{ ok, view: RoomView }` |
| klien → server | `room:leave` | `{ roomId }` |
| klien → server | `room:action` | `LudoAction` (di bawah) → ack `{ ok, view }` atau `{ ok:false, code }` |
| server → klien | `room:state` | `RoomView` (dikirim ke tiap anggota setelah perubahan; `version` naik) |
| server → klien | `room:event` | `{ type, name, dice?, n? }` untuk umpan kejadian |
| server → klien | `room:chat` | pesan chat room (sudah disensor) |
| server → klien | `room:closed` | `{ reason: 'deleted'|'expired'|'frozen' }` |

```ts
type LudoAction =
  | { action: 'invite'; userIds: string[] }
  | { action: 'respond'; accept: boolean }
  | { action: 'kick'; userId: string }
  | { action: 'start'; pawns?: number; exit?: 'double'|'sixes'|'six'; goal?: number }
  | { action: 'roll' }
  | { action: 'move'; pawn: number }
  | { action: 'skip' }
  | { action: 'pawn'; pawn: string }            // karakter pion
  | { action: 'participate'; play: boolean }
  | { action: 'chat'; text: string }            // ≤ 300, disensor
  | { action: 'autopilot'; on: boolean; userId?: string }
  | { action: 'reset' };                         // host untuk room miliknya
```

Aturan: hanya server yang melempar dadu; klien yang menerima `version` lebih lama dari yang dimiliki mengabaikan `room:state`. Saat tersambung ulang klien memanggil `room:join` dan menerima state penuh.

---

## 9. Admin (`/api/admin`, cookie `ls_admin`)

Semua rute mengubah data → tulis `audit_log` `{ adminId, action, targetType, targetId, detail }`. Semua `403 FORBIDDEN` bila cookie pemain.

### Auth

| Metode | Rute | Keterangan |
|---|---|---|
| POST | `/login` | `{ username, password }` → `{ admin }`. Lockout sama dengan pemain. Kode: `AUTH_INVALID_CREDENTIALS`, `AUTH_LOCKED` |
| POST | `/logout` | `204` |
| GET | `/me` | `{ admin: { id, username } }` |

### Dashboard

`GET /dashboard` → `{ activeToday, pending, newRegistrations7d, runsToday, runsByGame: { [gameId]: n }, topGame }`.

### Pengguna

| Metode | Rute | Keterangan |
|---|---|---|
| GET | `/users?status=&q=&page=` | Daftar (nama asli, tidak disensor). Kolom: id, username, displayName, email, status, createdAt, lastLoginAt |
| PATCH | `/users/:id` | `{ action: 'approve'\|'reject'\|'suspend'\|'ban'\|'activate'\|'reset-password' }`. `reset-password` mengembalikan `{ temporaryPassword }` sekali tampil. Suspend/ban menghapus semua sesi |
| POST | `/users/bulk` | `{ ids: string[], action: 'approve'\|'reject' }` |
| DELETE | `/users/:id` | Hapus akun (sama seperti penghapusan sendiri) |

Kode: `INVALID_TRANSITION` (409).

Transisi sah: `pending → active|rejected`; `active ↔ suspended`; `active|suspended → banned`; `banned → active`; `rejected → pending`.

### Game

| Metode | Rute | Keterangan |
|---|---|---|
| GET | `/games` | Semua game (termasuk `inactive`) dengan konfigurasi admin |
| PATCH | `/games/:id` | `{ status?, maintenanceMessage?: { id, en }, schedule?: Schedule\|null, sortOrder?, badge? }`. `schedule: null` = ikut global |

`Schedule = { enabled: boolean, windows: { start: 'HH:MM', end: 'HH:MM' }[1..6], days: number[] (0=Minggu) }`; validasi sama dengan Porting_Guide §5 (`SCHEDULE_INVALID`, 400).

### Pengaturan

`GET /settings` dan `PATCH /settings`:

```json
{
  "registration": "approval",
  "defaultLocale": "auto",
  "globalSchedule": { "enabled": false, "windows": [{ "start": "12:00", "end": "13:00" }], "days": [1,2,3,4,5] },
  "chatEnabled": true,
  "ludoMaxPlayers": 12,
  "smtp": { "configured": false, "enabled": false }
}
```

`smtp` hanya baca; nilai SMTP diatur lewat `.env`. `POST /settings/smtp-test` `{ to }` → `204`; kode `SMTP_NOT_CONFIGURED` (409).

### Leaderboard dan skor

| Metode | Rute | Keterangan |
|---|---|---|
| GET | `/runs?gameId=&flagged=&page=` | Daftar run |
| DELETE | `/runs/:id` | Hapus run dan hitung ulang `game_scores` pemain |
| POST | `/leaderboard/:gameId/reset` | `{ period: 'week'\|'month' }` hapus run pada periode berjalan; konfirmasi dua langkah di UI |

### Chat dan kata terlarang

| Metode | Rute | Keterangan |
|---|---|---|
| GET | `/chat?page=` | Pesan chat publik |
| DELETE | `/chat/:id` | Hapus pesan; menyiarkan `chat:deleted` |
| POST | `/chat/mute` | `{ userId, minutes, reason? }` |
| DELETE | `/chat/mute/:userId` | Cabut bisu |
| GET/POST | `/banned-words` | `POST { word, lang: 'id'\|'en'\|'any' }` |
| PATCH/DELETE | `/banned-words/:id` | Aktif/nonaktif atau hapus |

### Ludo (moderasi)

| Metode | Rute | Keterangan |
|---|---|---|
| GET | `/ludo/rooms?status=` | Semua room |
| GET | `/ludo/rooms/:id` | Rincian termasuk chat |
| POST | `/ludo/rooms/:id/reset` | Kembali ke lobi |
| POST | `/ludo/rooms/:id/kick` | `{ userId }` |
| DELETE | `/ludo/rooms/:id` | Hapus room |

### Audit

`GET /audit?page=&action=&adminId=` → `{ items: { id, adminId, adminUsername, action, targetType, targetId, detail, createdAt }[] }`.

---

## 10. Versi

Awalan versi tidak dipakai (satu klien resmi). Perubahan yang memecah kompatibilitas dicatat di bagian ini dan di `docs/changelog.md`.
