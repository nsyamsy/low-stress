import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, admins, type Database } from "@low-stress/db";
import { eq } from "drizzle-orm";
import { verify } from "@node-rs/argon2";
import {
  ARGON2_OPTIONS,
  createAdminAccount,
  validateAdminInput,
} from "../src/index";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile("../../.env.test");
  } catch {
    try {
      process.loadEnvFile(".env.test");
    } catch {
      // Abaikan
    }
  }
}

const databaseUrl = process.env.TEST_DATABASE_URL;

describe("tools/create-admin", () => {
  describe("validateAdminInput", () => {
    it("menolak username kosong atau karakter tidak sah", () => {
      expect(() => validateAdminInput({ username: "", password: "password123" })).toThrow();
      expect(() => validateAdminInput({ username: "ab", password: "password123" })).toThrow();
      expect(() => validateAdminInput({ username: "admin@root", password: "password123" })).toThrow();
      expect(() => validateAdminInput({ username: "admin space", password: "password123" })).toThrow();
    });

    it("menolak password kurang dari 8 karakter", () => {
      expect(() => validateAdminInput({ username: "superadmin", password: "short" })).toThrow(
        "Password minimal 8 karakter.",
      );
    });

    it("menolak password yang sama dengan username", () => {
      expect(() => validateAdminInput({ username: "superadmin", password: "superadmin" })).toThrow(
        "Password tidak boleh sama dengan username.",
      );
    });

    it("menormalkan username menjadi huruf kecil", () => {
      const res = validateAdminInput({ username: "Super_Admin.1", password: "password123" });
      expect(res.username).toBe("super_admin.1");
    });
  });

  describe("createAdminAccount (DB Integration)", () => {
    let dbHandle: ReturnType<typeof createDb>;
    let db: Database;
    const testUsername = `adm_${Date.now().toString(36)}`;
    const testPassword = "securePassword123!";

    beforeAll(() => {
      if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_test")) {
        throw new Error(
          "TEST_DATABASE_URL (berakhiran _test) diperlukan untuk pengujian integrasi create-admin.",
        );
      }
      dbHandle = createDb(databaseUrl, { max: 1 });
      db = dbHandle.db;
    });

    afterAll(async () => {
      if (db) {
        await db.delete(admins).where(eq(admins.username, testUsername));
      }
      if (dbHandle) {
        await dbHandle.close();
      }
    });

    it("berhasil membuat akun admin dan menyimpan hash password argon2id", async () => {
      const created = await createAdminAccount(db, {
        username: testUsername,
        password: testPassword,
      });

      expect(created.id).toBeDefined();
      expect(created.username).toBe(testUsername);

      const [row] = await db
        .select()
        .from(admins)
        .where(eq(admins.username, testUsername))
        .limit(1);

      expect(row).toBeDefined();
      expect(row!.username).toBe(testUsername);

      // Verifikasi bahwa password di-hash dengan argon2id
      const isValid = await verify(row!.passwordHash, testPassword, ARGON2_OPTIONS);
      expect(isValid).toBe(true);
    });

    it("menolak pembuatan admin bila username sudah terpakai", async () => {
      await expect(
        createAdminAccount(db, {
          username: testUsername,
          password: "anotherPassword123",
        }),
      ).rejects.toThrow(`Admin dengan username '${testUsername}' sudah ada.`);
    });
  });
});
