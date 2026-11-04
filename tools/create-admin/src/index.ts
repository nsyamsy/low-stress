import { hash } from "@node-rs/argon2";
import { admins, createDb, type Database } from "@low-stress/db";
import { eq } from "drizzle-orm";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export const ARGON2ID_ALGORITHM = 2;

export const ARGON2_OPTIONS = {
  algorithm: ARGON2ID_ALGORITHM,
  memoryCost: 19456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
} as const;

export interface CreateAdminParams {
  username: string;
  password: string;
}

export function validateAdminInput(params: CreateAdminParams): { username: string; password: string } {
  const username = params.username.trim().toLowerCase();
  const password = params.password;

  if (!username) {
    throw new Error("Username tidak boleh kosong.");
  }

  const usernameRegex = /^[a-z0-9_.]{3,20}$/;
  if (!usernameRegex.test(username)) {
    throw new Error(
      "Username harus 3-20 karakter dan hanya boleh berisi huruf kecil, angka, garis bawah (_), atau titik (.).",
    );
  }

  if (!password || password.length < 8) {
    throw new Error("Password minimal 8 karakter.");
  }

  if (password.toLowerCase() === username) {
    throw new Error("Password tidak boleh sama dengan username.");
  }

  return { username, password };
}

export async function createAdminAccount(
  db: Database,
  params: CreateAdminParams,
): Promise<{ id: string; username: string }> {
  const { username, password } = validateAdminInput(params);

  // Periksa apakah username sudah terpakai
  const existing = await db
    .select({ id: admins.id })
    .from(admins)
    .where(eq(admins.username, username))
    .limit(1);

  if (existing.length > 0) {
    throw new Error(`Admin dengan username '${username}' sudah ada.`);
  }

  const passwordHash = await hash(password, ARGON2_OPTIONS);

  const [inserted] = await db
    .insert(admins)
    .values({
      username,
      passwordHash,
    })
    .returning({
      id: admins.id,
      username: admins.username,
    });

  if (!inserted) {
    throw new Error("Gagal membuat baris admin di database.");
  }

  return inserted;
}

async function runCli(): Promise<void> {
  if (typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile("../../.env");
    } catch {
      try {
        process.loadEnvFile(".env");
      } catch {
        // Abaikan
      }
    }
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL belum diatur di lingkungan atau berkas .env.");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  let username = args[0];
  let password = args[1];

  if (!username || !password) {
    const rl = readline.createInterface({ input, output });
    try {
      if (!username) {
        username = await rl.question("Username admin: ");
      }
      if (!password) {
        password = await rl.question("Password admin (min 8 karakter): ");
      }
    } finally {
      rl.close();
    }
  }

  const dbHandle = createDb(databaseUrl, { max: 1 });
  try {
    const result = await createAdminAccount(dbHandle.db, {
      username: username || "",
      password: password || "",
    });
    console.log(`\nSukses: Admin '${result.username}' berhasil dibuat (ID: ${result.id}).`);
  } catch (error) {
    console.error(`\nGagal membuat admin: ${(error as Error).message}`);
    process.exitCode = 1;
  } finally {
    await dbHandle.close();
  }
}

// Hanya jalankan jika dieksekusi langsung
if (process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js")) {
  runCli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
