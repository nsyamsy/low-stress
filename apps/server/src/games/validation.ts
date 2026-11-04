import { z } from "zod";

export const gameStatusSchema = z.enum(["active", "maintenance", "inactive"]);

export const scheduleWindowSchema = z
  .object({
    start: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format jam mulai harus HH:MM"),
    end: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format jam selesai harus HH:MM"),
  })
  .refine((w) => w.start !== w.end, {
    message: "Jam mulai dan jam selesai tidak boleh sama",
  });

export const scheduleSchema = z.object({
  enabled: z.boolean(),
  windows: z.array(scheduleWindowSchema).min(1).max(6),
  days: z.array(z.number().int().min(0).max(6)).min(1),
});

export const updateGameSchema = z.object({
  status: gameStatusSchema.optional(),
  maintenanceMessage: z
    .object({
      id: z.string().nullable().optional(),
      en: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  schedule: scheduleSchema.nullable().optional(),
  sortOrder: z.number().int().optional(),
  badge: z.string().nullable().optional(),
});

export type UpdateGameInput = z.infer<typeof updateGameSchema>;

export const leaderboardQuerySchema = z.object({
  period: z.enum(["all", "week", "month"]).default("all"),
});

export type LeaderboardQueryInput = z.infer<typeof leaderboardQuerySchema>;

export const submitScoreSchema = z
  .object({
    score: z.number().int().min(0),
    durationMs: z.number().int().min(0),
    moves: z.number().int().min(0).optional(),
    combos: z.number().int().min(0).optional(),
  })
  .passthrough();

export type SubmitScoreInput = z.infer<typeof submitScoreSchema>;
