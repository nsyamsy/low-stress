import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/** Tipe `citext` bawaan PostgreSQL untuk username dan email. */
export const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return "citext";
  },
});

export const userStatus = pgEnum("user_status", [
  "pending",
  "active",
  "rejected",
  "suspended",
  "banned",
]);

export const localePref = pgEnum("locale_pref", ["auto", "id", "en"]);
export const themePref = pgEnum("theme_pref", ["system", "light", "dark"]);
export const subjectType = pgEnum("subject_type", ["user", "admin"]);
export const gameStatus = pgEnum("game_status", [
  "active",
  "maintenance",
  "inactive",
]);
export const emailTokenKind = pgEnum("email_token_kind", ["verify", "reset"]);
export const wordLang = pgEnum("word_lang", ["id", "en", "any"]);
export const wordSource = pgEnum("word_source", ["builtin", "admin"]);

export const admins = pgTable("admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: citext("username").notNull().unique(),
    displayName: text("display_name").notNull(),
    email: citext("email").notNull().unique(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    passwordHash: text("password_hash").notNull(),
    status: userStatus("status").notNull().default("pending"),
    localePref: localePref("locale_pref").notNull().default("auto"),
    themePref: themePref("theme_pref").notNull().default("system"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => admins.id, {
      onDelete: "set null",
    }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (table) => [index("users_status_idx").on(table.status)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    subjectType: subjectType("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("sessions_expires_at_idx").on(table.expiresAt)],
);

export const loginAttempts = pgTable("login_attempts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedBy: uuid("updated_by").references(() => admins.id, {
    onDelete: "set null",
  }),
});

export const games = pgTable("games", {
  id: text("id").primaryKey(),
  status: gameStatus("status").notNull().default("inactive"),
  maintenanceMessage: jsonb("maintenance_message").$type<{
    id: string;
    en: string;
  }>(),
  schedule: jsonb("schedule"),
  sortOrder: integer("sort_order").notNull().default(0),
  badge: text("badge"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const gameScores = pgTable(
  "game_scores",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    bestScore: integer("best_score").notNull(),
    plays: integer("plays").notNull().default(0),
    bestPlay: integer("best_play"),
    bestReachedAt: timestamp("best_reached_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.gameId] }),
    index("game_scores_game_best_idx").on(table.gameId, table.bestScore),
  ],
);

export const gameRuns = pgTable(
  "game_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    durationMs: integer("duration_ms").notNull(),
    flagged: boolean("flagged").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("game_runs_game_created_idx").on(table.gameId, table.createdAt),
  ],
);

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminId: uuid("admin_id").references(() => admins.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  detail: jsonb("detail"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const emailTokens = pgTable("email_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: emailTokenKind("kind").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("chat_messages_created_idx").on(table.createdAt)],
);

export const chatMutes = pgTable("chat_mutes", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  mutedUntil: timestamp("muted_until", { withTimezone: true }).notNull(),
  reason: text("reason"),
  adminId: uuid("admin_id").references(() => admins.id, {
    onDelete: "set null",
  }),
});

export const bannedWords = pgTable("banned_words", {
  id: uuid("id").primaryKey().defaultRandom(),
  word: text("word").notNull(),
  lang: wordLang("lang").notNull().default("any"),
  source: wordSource("source").notNull().default("builtin"),
  enabled: boolean("enabled").notNull().default(true),
});

export const ludoRooms = pgTable(
  "ludo_rooms",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    hostId: uuid("host_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("lobby"),
    maxPlayers: integer("max_players").notNull().default(4),
    pawns: integer("pawns"),
    seatUsers: jsonb("seat_users").$type<string[]>(),
    state: jsonb("state"),
    version: integer("version").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_ludo_rooms_last_activity").on(table.lastActivityAt),
  ],
);

export const ludoPlayers = pgTable(
  "ludo_players",
  {
    roomId: text("room_id")
      .notNull()
      .references(() => ludoRooms.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("invited"),
    pawn: text("pawn"),
    autopilot: boolean("autopilot").notNull().default(false),
    invitedAt: timestamp("invited_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.roomId, table.userId] }),
    index("idx_ludo_players_user").on(table.userId),
  ],
);

export const ludoMessages = pgTable(
  "ludo_messages",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    roomId: text("room_id")
      .notNull()
      .references(() => ludoRooms.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_ludo_messages_room").on(table.roomId, table.id)],
);

// --- Tabel game Riot (prefix riot_, migrasi di games/riot/db) ---

export const riotProfiles = pgTable("riot_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  character: jsonb("character").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const riotRooms = pgTable(
  "riot_rooms",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    hostId: uuid("host_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("lobby"),
    options: jsonb("options").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_riot_rooms_last_activity").on(table.lastActivityAt)],
);

export const riotRoomPlayers = pgTable(
  "riot_room_players",
  {
    roomId: text("room_id")
      .notNull()
      .references(() => riotRooms.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("joined"),
    character: jsonb("character").$type<Record<string, unknown>>(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.roomId, table.userId] }),
    index("idx_riot_room_players_user").on(table.userId),
  ],
);

export const riotMatches = pgTable(
  "riot_matches",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => riotRooms.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    winner: text("winner"),
    players: jsonb("players").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_riot_matches_room").on(table.roomId)],
);

/** Daftar tabel inti, dipakai pemeriksa migrasi dan tes. */
export const coreTables = [
  "users",
  "admins",
  "sessions",
  "login_attempts",
  "settings",
  "games",
  "game_scores",
  "game_runs",
  "audit_log",
  "email_tokens",
  "chat_messages",
  "chat_mutes",
  "banned_words",
] as const;
