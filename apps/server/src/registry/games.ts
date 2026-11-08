import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { Database } from "@low-stress/db";
import { games } from "@low-stress/db";
import { assertGameManifest, type GameManifest } from "@low-stress/sdk";

export interface LoadedGame {
  manifest: GameManifest;
  /** Path absolut ke `manifest.ts`. */
  path: string;
  serverModule?: GameServerModule;
  jobs?: GameJob[];
}

export interface GameManifestModule {
  manifest?: unknown;
  default?: unknown;
}

export interface RegistrySyncResult {
  inserted: string[];
  unchanged: string[];
}

const DEFAULT_GAMES_DIR = resolve(import.meta.dirname, "../../../../games");

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Pindai `games/<id>/manifest.ts` dan validasi bentuk manifest. Folder yang
 * tidak punya manifest dilewati; manifest rusak melempar error agar boot gagal
 * dengan pesan yang jelas.
 */
export async function scanGameManifests(
  gamesDir: string = DEFAULT_GAMES_DIR,
): Promise<LoadedGame[]> {
  if (!(await isDirectory(gamesDir))) return [];

  const loaded: LoadedGame[] = [];
  const entries = await readdir(gamesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;

    const manifestPath = join(gamesDir, entry.name, "manifest.ts");
    if (!(await stat(manifestPath).catch(() => null))) continue;

    const module = (await import(
      pathToFileURL(manifestPath).href
    )) as GameManifestModule;
    const candidate = module.manifest ?? module.default;
    assertGameManifest(candidate, `${entry.name}/manifest.ts`);

    if (candidate.id !== entry.name) {
      throw new Error(
        `${entry.name}/manifest.ts: id "${candidate.id}" harus sama dengan nama folder "${entry.name}"`,
      );
    }

    loaded.push({ manifest: candidate, path: manifestPath });
  }

  return loaded.sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
}

/**
 * Sinkronkan manifest ke tabel `games`. Hanya baris baru yang dibuat; field
 * yang dikelola admin (status, jadwal, urutan, badge) tidak pernah ditimpa.
 */
export async function syncGameRegistry(
  db: Database,
  loaded: readonly LoadedGame[],
): Promise<RegistrySyncResult> {
  if (loaded.length === 0) return { inserted: [], unchanged: [] };

  const inserted = await db
    .insert(games)
    .values(loaded.map(({ manifest }) => ({ id: manifest.id })))
    .onConflictDoNothing({ target: games.id })
    .returning({ id: games.id });

  const insertedIds = new Set(inserted.map((row) => row.id));
  return {
    inserted: [...insertedIds].sort(),
    unchanged: loaded
      .map(({ manifest }) => manifest.id)
      .filter((id) => !insertedIds.has(id))
      .sort(),
  };
}

/** Path default, diekspor untuk tes dan tooling. */
export const GAMES_DIR = DEFAULT_GAMES_DIR;

import type { FastifyInstance } from "fastify";
import type { Server as SocketIOServer } from "socket.io";
import type { GameServerContext, GameServerModule, GameJob } from "@low-stress/sdk/server";

export interface InitializedGameServer {
  id: string;
  module: GameServerModule;
  jobs: GameJob[];
}

export async function resolveGameServerModule(
  game: LoadedGame,
): Promise<GameServerModule | undefined> {
  if (game.serverModule) {
    return game.serverModule;
  }
  if (game.manifest.server) {
    const mod = await game.manifest.server();
    game.serverModule = mod;
    return mod;
  }
  const serverPathTs = resolve(GAMES_DIR, game.manifest.id, "server/index.ts");
  const serverPathJs = resolve(GAMES_DIR, game.manifest.id, "server/index.js");
  const serverFile = existsSync(serverPathTs)
    ? serverPathTs
    : existsSync(serverPathJs)
      ? serverPathJs
      : null;
  if (serverFile) {
    const mod = await import(pathToFileURL(serverFile).href);
    const serverModule = (mod.serverModule ?? mod.default) as GameServerModule | undefined;
    if (serverModule) {
      game.serverModule = serverModule;
    }
    return serverModule;
  }
  return undefined;
}

export async function loadGameServerModules(
  loaded: readonly LoadedGame[],
  ctx: GameServerContext,
  app: FastifyInstance,
  io?: SocketIOServer,
): Promise<InitializedGameServer[]> {
  const initialized: InitializedGameServer[] = [];

  for (const item of loaded) {
    const { manifest } = item;
    try {
      const serverModule = await resolveGameServerModule(item);
      if (!serverModule) continue;

      if (serverModule.registerRoutes) {
        await serverModule.registerRoutes(app, ctx);
      }

      if (serverModule.registerRealtime && io) {
        await serverModule.registerRealtime(io, ctx);
      }

      let jobs: GameJob[] = [];
      if (serverModule.registerJobs) {
        jobs = await serverModule.registerJobs(ctx);
      }

      item.serverModule = serverModule;
      item.jobs = jobs;

      initialized.push({
        id: manifest.id,
        module: serverModule,
        jobs,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Gagal memuat modul server game '${manifest.id}':`, msg);
    }
  }

  return initialized;
}
