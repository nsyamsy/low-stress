-- Tabel khusus game Riot (awalan riot_). Dibuat oleh migrasi game,
-- bukan migrasi inti. Lihat docs/ROADMAP_RIOT.md §3.

-- Profil kustomisasi karakter pemain (RT-41). Diisi lewat
-- PUT /api/games/riot/profile; dibaca saat pemain masuk lobby.
CREATE TABLE IF NOT EXISTS "riot_profiles" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "character" jsonb NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Room Riot yang dipertahankan agar tidak hilang saat server restart.
CREATE TABLE IF NOT EXISTS "riot_rooms" (
  "id" varchar(36) PRIMARY KEY,
  "name" varchar(60) NOT NULL,
  "host_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" varchar(10) NOT NULL DEFAULT 'lobby',
  "options" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_activity_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "riot_room_players" (
  "room_id" varchar(36) NOT NULL REFERENCES "riot_rooms"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" varchar(10) NOT NULL DEFAULT 'joined',
  "character" jsonb,
  "joined_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("room_id", "user_id")
);

CREATE TABLE IF NOT EXISTS "riot_matches" (
  "id" varchar(36) PRIMARY KEY,
  "room_id" varchar(36) NOT NULL REFERENCES "riot_rooms"("id") ON DELETE CASCADE,
  "started_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" timestamp with time zone,
  "winner" varchar(20),
  "players" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_riot_room_players_user" ON "riot_room_players" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_riot_rooms_last_activity" ON "riot_rooms" ("last_activity_at");
CREATE INDEX IF NOT EXISTS "idx_riot_matches_room" ON "riot_matches" ("room_id");
