# Deploy Low Stress

Dua mode memakai kode yang sama dan dibedakan oleh profil Compose.

## Persiapan

1. Pasang Docker Engine + Docker Compose v2.
2. Salin konfigurasi:

   ```bash
   cp .env.example .env
   ```

3. Isi `SESSION_SECRET` (minimal 32 karakter acak), `APP_ORIGIN`, dan
   `POSTGRES_PASSWORD`. Jangan memakai nilai contoh di server publik.

## LAN

```bash
docker compose --profile lan up -d --build
```

- Web: `http://<ip-server>:8080` (ubah `WEB_PORT` bila perlu).
- Health: `http://<ip-server>:8080/healthz` dan `/readyz`.
- Server dan database tidak diekspos ke host; nginx meneruskan `/api` dan
  `/ws` ke container server.
- PWA penuh memerlukan HTTPS atau `localhost`. Untuk LAN dengan HTTPS,
  tambahkan Caddy dengan CA internal (lihat Architecture §9); sertifikat
  akar perlu dipasang di perangkat kantor.

## Public

```bash
# .env
# DEPLOY_MODE=public
# APP_ORIGIN=https://game.example.com
# APP_DOMAIN=game.example.com

docker compose --profile public up -d --build
```

Caddy mengambil sertifikat Let's Encrypt otomatis (port 80 dan 443 harus
terbuka dan domain mengarah ke server). Data sertifikat disimpan di volume
`caddy-data`.

## Operasional

- Migrasi dijalankan otomatis sebelum server start; aman diulang.
- Log: `docker compose logs -f server`.
- Hentikan: `docker compose --profile lan down` (tambahkan `-v` hanya bila
  benar-benar ingin menghapus database).
- Cadangan database:

  ```bash
  docker compose exec db pg_dump -U low_stress low_stress > backup.sql
  ```

  Restore ke database kosong:

  ```bash
  cat backup.sql | docker compose exec -T db psql -U low_stress -d low_stress
  ```
