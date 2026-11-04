import { z } from "zod";

export const adminLoginBodySchema = z.object({
  username: z.string().min(1, "Username wajib diisi"),
  password: z.string().min(1, "Password wajib diisi"),
});

export const adminUserQuerySchema = z.object({
  status: z
    .enum(["pending", "active", "rejected", "suspended", "banned"])
    .optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const adminUserActionSchema = z.object({
  action: z.enum([
    "approve",
    "reject",
    "suspend",
    "ban",
    "activate",
    "reset-password",
  ]),
});

export const adminBulkUserActionSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "Daftar ID tidak boleh kosong"),
  action: z.enum(["approve", "reject"]),
});

export const scheduleWindowSchema = z.object({
  start: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format jam mulai harus HH:MM"),
  end: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format jam selesai harus HH:MM"),
});

export const scheduleSchema = z.object({
  enabled: z.boolean(),
  windows: z.array(scheduleWindowSchema).min(1).max(6),
  days: z.array(z.number().int().min(0).max(6)),
});

export const adminUpdateSettingsSchema = z.object({
  registration: z.enum(["approval", "open", "closed"]).optional(),
  defaultLocale: z.enum(["auto", "id", "en"]).optional(),
  globalSchedule: scheduleSchema.optional(),
  chatEnabled: z.boolean().optional(),
  ludoMaxPlayers: z.number().int().min(2).max(12).optional(),
});

export const adminSmtpTestSchema = z.object({
  to: z.string().email("Format email tujuan tidak valid"),
});

export const adminAuditQuerySchema = z.object({
  action: z.string().optional(),
  adminId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
