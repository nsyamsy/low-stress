import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import {
  admins,
  createDb,
  eq,
  settings,
} from "../packages/sdk/src/server";
import { runMigrations, seedDevGames } from "../packages/db/src/index";
import { buildApp } from "../apps/server/src/app";
import { hashPassword } from "../apps/server/src/auth/password";
import { readEnv } from "../apps/server/src/env";
import { notFoundHandler } from "../apps/server/src/errors";
import {
  scanGameManifests,
  syncGameRegistry,
} from "../apps/server/src/registry/games";

const rootDir = resolve(import.meta.dirname, "..");
const envTestPath = join(rootDir, ".env.test");

if (typeof process.loadEnvFile === "function" && existsSync(envTestPath)) {
  try {
    process.loadEnvFile(envTestPath);
  } catch {
    // Abaikan
  }
}

const testDbUrl = process.env.TEST_DATABASE_URL;
if (!testDbUrl || !new URL(testDbUrl).pathname.endsWith("_test")) {
  console.error(
    "GAGAL CEPAT: E2E wajib menggunakan TEST_DATABASE_URL yang berakhiran '_test'.",
  );
  process.exit(1);
}

export const E2E_ADMIN_USERNAME = "e2e_superadmin";
export const E2E_ADMIN_PASSWORD = "E2eSuperAdminPass123!";
const E2E_PORT = Number(process.env.E2E_PORT ?? 4173);

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".glb": "model/gltf-binary",
  ".txt": "text/plain; charset=utf-8",
};

async function startE2eServer() {
  const distDir = join(rootDir, "apps", "web", "dist");
  if (!existsSync(join(distDir, "index.html"))) {
    console.log("Membangun apps/web/dist untuk E2E...");
    execSync("pnpm --filter @low-stress/web build", {
      cwd: rootDir,
      stdio: "inherit",
    });
  }

  await runMigrations(testDbUrl!);

  const dbHandle = createDb(testDbUrl!, { max: 5 });
  const { db } = dbHandle;

  const manifests = await scanGameManifests(join(rootDir, "games"));
  await syncGameRegistry(db, manifests);
  await seedDevGames(db);

  // Pastikan mode pendaftaran "approval" sesuai alur D-15 (daftar -> pending -> admin setujui -> login)
  const now = new Date();
  for (const key of ["registration", "registration_mode"]) {
    await db
      .insert(settings)
      .values({ key, value: "approval" as unknown as Record<string, unknown>, updatedAt: now })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: "approval" as unknown as Record<string, unknown>, updatedAt: now },
      });
  }

  const adminHash = await hashPassword(E2E_ADMIN_PASSWORD);
  const [existingAdmin] = await db
    .select()
    .from(admins)
    .where(eq(admins.username, E2E_ADMIN_USERNAME))
    .limit(1);

  if (existingAdmin) {
    await db
      .update(admins)
      .set({ passwordHash: adminHash })
      .where(eq(admins.id, existingAdmin.id));
  } else {
    await db.insert(admins).values({
      username: E2E_ADMIN_USERNAME,
      passwordHash: adminHash,
    });
  }

  const env = readEnv({
    ...process.env,
    NODE_ENV: "test",
    DEPLOY_MODE: "lan",
    DATABASE_URL: testDbUrl!,
    APP_ORIGIN: `http://localhost:${E2E_PORT}`,
    SESSION_SECRET: "e2e-test-session-secret-minimum-32-characters",
    PORT: String(E2E_PORT),
  });

  const app = await buildApp({
    env,
    db,
    games: manifests,
    checkDatabase: async () => true,
    logger: false,
  });

  const indexHtml = readFileSync(join(distDir, "index.html"));

  app.get("/*", async (request, reply) => {
    const reqPath = (request.url.split("?")[0] ?? "/").replace(/^\/+/, "");
    if (reqPath.startsWith("api/") || reqPath === "api") {
      return notFoundHandler(request, reply);
    }

    if (reqPath) {
      const candidate = normalize(join(distDir, reqPath));
      if (candidate.startsWith(distDir) && existsSync(candidate)) {
        try {
          const st = statSync(candidate);
          if (st.isFile()) {
            const ext = extname(candidate).toLowerCase();
            const mime = MIME_TYPES[ext] ?? "application/octet-stream";
            reply.header("Content-Type", mime);
            return reply.send(readFileSync(candidate));
          }
        } catch {
          // Jatuh ke index.html
        }
      }
    }

    reply.header("Content-Type", "text/html; charset=utf-8");
    return reply.send(indexHtml);
  });

  await app.listen({ host: "127.0.0.1", port: E2E_PORT });
  console.log(`E2E server listening on http://localhost:${E2E_PORT}`);

  const shutdown = async () => {
    await app.close();
    await dbHandle.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

void startE2eServer();
