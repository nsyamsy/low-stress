CREATE TABLE IF NOT EXISTS "ludo_rooms" (
  "id" varchar(36) PRIMARY KEY,
  "name" varchar(60) NOT NULL,
  "host_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" varchar(10) NOT NULL DEFAULT 'lobby',
  "max_players" integer NOT NULL DEFAULT 4,
  "pawns" integer,
  "seat_users" jsonb,
  "state" jsonb,
  "version" integer NOT NULL DEFAULT 0,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "last_activity_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ludo_players" (
  "room_id" varchar(36) NOT NULL REFERENCES "ludo_rooms"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" varchar(10) NOT NULL DEFAULT 'invited',
  "pawn" varchar(12),
  "autopilot" boolean NOT NULL DEFAULT false,
  "invited_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "joined_at" timestamp with time zone,
  PRIMARY KEY ("room_id", "user_id")
);

CREATE TABLE IF NOT EXISTS "ludo_messages" (
  "id" bigserial PRIMARY KEY,
  "room_id" varchar(36) NOT NULL REFERENCES "ludo_rooms"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "body" varchar(300) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_ludo_messages_room" ON "ludo_messages" ("room_id", "id");
CREATE INDEX IF NOT EXISTS "idx_ludo_players_user" ON "ludo_players" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_ludo_rooms_last_activity" ON "ludo_rooms" ("last_activity_at");
