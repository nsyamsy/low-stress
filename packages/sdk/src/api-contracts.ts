import { z } from "zod";

export const userStatusSchema = z.enum([
  "pending",
  "active",
  "rejected",
  "suspended",
  "banned",
]);

export const localePreferenceSchema = z.enum(["auto", "id", "en"]);
export const themePreferenceSchema = z.enum(["system", "light", "dark"]);

export const meSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  status: userStatusSchema,
  locale: localePreferenceSchema,
  theme: themePreferenceSchema,
  createdAt: z.string(),
});
export type Me = z.infer<typeof meSchema>;

export const publicConfigSchema = z.object({
  registration: z.enum(["approval", "open", "closed"]),
  captcha: z.boolean(),
  emailEnabled: z.boolean(),
  defaultLocale: localePreferenceSchema,
  deployMode: z.enum(["lan", "public"]),
  chatEnabled: z.boolean(),
});
export type PublicConfig = z.infer<typeof publicConfigSchema>;

export const scheduleWindowSchema = z.object({
  start: z.string(),
  end: z.string(),
});

export const scheduleConfigSchema = z.object({
  enabled: z.boolean(),
  windows: z.array(scheduleWindowSchema),
  days: z.array(z.number()),
});

export const gameMobileConfigSchema = z.object({
  supported: z.boolean(),
  orientation: z.enum(["portrait", "landscape", "any"]).optional(),
});

export const gameItemSchema = z.object({
  id: z.string(),
  title: z.object({ id: z.string(), en: z.string() }),
  description: z.object({ id: z.string(), en: z.string() }),
  mode: z.enum(["solo", "multiplayer"]),
  status: z.enum(["active", "maintenance"]),
  open: z.boolean(),
  opensAt: z.string().nullable(),
  windows: z.array(scheduleWindowSchema),
  days: z.array(z.number()),
  maintenanceMessage: z
    .object({ id: z.string().nullable(), en: z.string().nullable() })
    .nullable(),
  badge: z.string().nullable(),
  mobile: gameMobileConfigSchema,
  mine: z.object({ best: z.number(), plays: z.number() }).nullable(),
});
export type GameItem = z.infer<typeof gameItemSchema>;

export const adminGameItemSchema = z.object({
  id: z.string(),
  status: z.enum(["active", "maintenance", "inactive"]),
  maintenanceMessage: z
    .object({ id: z.string(), en: z.string() })
    .nullable(),
  schedule: scheduleConfigSchema.nullable(),
  sortOrder: z.number(),
  badge: z.string().nullable(),
  updatedAt: z.string(),
  manifest: z
    .object({
      title: z.object({ id: z.string(), en: z.string() }),
      description: z.object({ id: z.string(), en: z.string() }),
      mode: z.enum(["solo", "multiplayer"]),
      mobile: gameMobileConfigSchema,
      version: z.string(),
    })
    .nullable(),
});
export type AdminGameItem = z.infer<typeof adminGameItemSchema>;

export const adminMeSchema = z.object({
  id: z.string(),
  username: z.string(),
});
export type AdminMe = z.infer<typeof adminMeSchema>;

export const adminDashboardDataSchema = z.object({
  activeToday: z.number(),
  pending: z.number(),
  newRegistrations7d: z.number(),
  runsToday: z.number(),
  runsByGame: z.record(z.string(), z.number()),
  topGame: z.string().nullable(),
  pendingQueue: z.array(
    z.object({
      id: z.string(),
      username: z.string(),
      displayName: z.string(),
      email: z.string(),
      createdAt: z.string(),
    }),
  ),
});
export type AdminDashboardData = z.infer<typeof adminDashboardDataSchema>;

export const adminUserItemSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  email: z.string(),
  status: userStatusSchema,
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
});
export type AdminUserItem = z.infer<typeof adminUserItemSchema>;

export const adminSettingsSchema = z.object({
  registration: z.enum(["approval", "open", "closed"]),
  defaultLocale: localePreferenceSchema,
  globalSchedule: scheduleConfigSchema,
  chatEnabled: z.boolean(),
  ludoMaxPlayers: z.number(),
  smtp: z.object({
    configured: z.boolean(),
    enabled: z.boolean(),
  }),
});
export type AdminSettings = z.infer<typeof adminSettingsSchema>;

export const auditLogItemSchema = z.object({
  id: z.string(),
  adminId: z.string().nullable(),
  adminUsername: z.string().nullable(),
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  detail: z.unknown(),
  createdAt: z.string(),
});
export type AuditLogItem = z.infer<typeof auditLogItemSchema>;

export const leaderboardPeriodSchema = z.enum(["all", "week", "month"]);
export type LeaderboardPeriod = z.infer<typeof leaderboardPeriodSchema>;

export const leaderboardEntrySchema = z.object({
  rank: z.number(),
  userId: z.string(),
  name: z.string(),
  score: z.number(),
  plays: z.number(),
  bestPlay: z.number().nullable(),
  at: z.string(),
  isMe: z.boolean(),
});
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;

export const leaderboardDataSchema = z.object({
  period: leaderboardPeriodSchema,
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
  entries: z.array(leaderboardEntrySchema),
  me: leaderboardEntrySchema.nullable(),
  mine: leaderboardEntrySchema.nullable(),
});
export type LeaderboardData = z.infer<typeof leaderboardDataSchema>;
