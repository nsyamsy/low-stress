import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  type Database,
  eq,
  riotProfiles,
} from "@low-stress/sdk/server";
import {
  type RiotCharacterCustomization,
  sanitizeCharacterCustomization,
} from "../shared/character";

const updateProfileSchema = z.object({
  character: z.unknown(),
});

function getUserId(request: FastifyRequest): string {
  const user = (request as FastifyRequest & {
    user?: { id: string };
  }).user;
  if (!user) {
    // Gerbang /api/games/:id/* sudah menjamin sesi aktif; ini pertahanan
    // berlapis bila rute dipanggil di luar gerbang.
    throw new Error("UNAUTHENTICATED");
  }
  return user.id;
}

/**
 * Rute profil kustomisasi karakter (RT-41):
 *   GET /api/games/riot/profile -> { character: RiotCharacterCustomization | null }
 *   PUT /api/games/riot/profile -> { character } (disanitasi di server)
 *
 * Route ini berada di bawah gerbang `/api/games/:id/*` (sesi aktif + game
 * gate), sehingga hanya pemain aktif yang dapat membaca/menulis profil.
 */
export function registerRiotProfileRoutes(app: FastifyInstance, db: Database): void {
  app.get("/api/games/riot/profile", async (request) => {
    const userId = getUserId(request);
    const [row] = await db
      .select({ character: riotProfiles.character })
      .from(riotProfiles)
      .where(eq(riotProfiles.userId, userId))
      .limit(1);
    return { character: (row?.character as RiotCharacterCustomization | undefined) ?? null };
  });

  app.put("/api/games/riot/profile", async (request) => {
    const userId = getUserId(request);
    const body = updateProfileSchema.parse(request.body);
    const character = sanitizeCharacterCustomization(body.character);

    await db
      .insert(riotProfiles)
      .values({ userId, character: character as unknown as Record<string, unknown> })
      .onConflictDoUpdate({
        target: riotProfiles.userId,
        set: {
          character: character as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        },
      });

    return { character };
  });
}
