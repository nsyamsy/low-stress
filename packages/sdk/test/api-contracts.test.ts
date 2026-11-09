import { describe, expect, it } from "vitest";
import {
  adminDashboardDataSchema,
  adminGameItemSchema,
  adminMeSchema,
  adminSettingsSchema,
  adminUserItemSchema,
  auditLogItemSchema,
  gameItemSchema,
  leaderboardDataSchema,
  meSchema,
  publicConfigSchema,
} from "../src/api-contracts";

describe("R-08: Shared API Contracts (@low-stress/sdk)", () => {
  it("memvalidasi skema Me dan PublicConfig", () => {
    expect(
      meSchema.safeParse({
        id: "u1",
        username: "budi",
        displayName: "Budi",
        email: "budi@example.test",
        emailVerified: false,
        status: "active",
        locale: "id",
        theme: "system",
        createdAt: new Date().toISOString(),
      }).success,
    ).toBe(true);

    expect(
      publicConfigSchema.safeParse({
        registration: "approval",
        captcha: false,
        emailEnabled: false,
        defaultLocale: "auto",
        deployMode: "lan",
        chatEnabled: true,
      }).success,
    ).toBe(true);
  });

  it("memvalidasi skema GameItem, AdminGameItem, dan LeaderboardData", () => {
    expect(
      gameItemSchema.safeParse({
        id: "flappy-bird",
        title: { id: "Flappy Bird", en: "Flappy Bird" },
        description: { id: "Terbang", en: "Fly" },
        mode: "solo",
        status: "active",
        open: true,
        opensAt: null,
        windows: [],
        days: [0, 1, 2, 3, 4, 5, 6],
        maintenanceMessage: null,
        badge: null,
        mobile: { supported: true, orientation: "portrait" },
        mine: { best: 10, plays: 2 },
      }).success,
    ).toBe(true);

    expect(
      adminGameItemSchema.safeParse({
        id: "flappy-bird",
        status: "active",
        maintenanceMessage: null,
        schedule: null,
        sortOrder: 0,
        badge: null,
        updatedAt: new Date().toISOString(),
        manifest: {
          title: { id: "Flappy Bird", en: "Flappy Bird" },
          description: { id: "Terbang", en: "Fly" },
          mode: "solo",
          mobile: { supported: true },
          version: "0.1.0",
        },
      }).success,
    ).toBe(true);

    expect(
      leaderboardDataSchema.safeParse({
        period: "all",
        periodStart: null,
        periodEnd: null,
        entries: [],
        me: null,
        mine: null,
      }).success,
    ).toBe(true);
  });

  it("memvalidasi skema AdminMe, AdminDashboardData, AdminUserItem, AdminSettings, dan AuditLogItem", () => {
    expect(adminMeSchema.safeParse({ id: "a1", username: "admin" }).success).toBe(true);

    expect(
      adminDashboardDataSchema.safeParse({
        activeToday: 1,
        pending: 0,
        newRegistrations7d: 2,
        runsToday: 5,
        runsByGame: { "flappy-bird": 5 },
        topGame: "flappy-bird",
        pendingQueue: [],
      }).success,
    ).toBe(true);

    expect(
      adminUserItemSchema.safeParse({
        id: "u1",
        username: "budi",
        displayName: "Budi",
        email: "budi@example.test",
        status: "active",
        createdAt: new Date().toISOString(),
        lastLoginAt: null,
      }).success,
    ).toBe(true);

    expect(
      adminSettingsSchema.safeParse({
        registration: "approval",
        defaultLocale: "auto",
        globalSchedule: { enabled: false, windows: [], days: [0, 1, 2, 3, 4, 5, 6] },
        chatEnabled: true,
        ludoMaxPlayers: 12,
        smtp: { configured: false, enabled: false },
      }).success,
    ).toBe(true);

    expect(
      auditLogItemSchema.safeParse({
        id: "1",
        adminId: "a1",
        adminUsername: "admin",
        action: "user.approve",
        targetType: "user",
        targetId: "u1",
        detail: {},
        createdAt: new Date().toISOString(),
      }).success,
    ).toBe(true);
  });
});
