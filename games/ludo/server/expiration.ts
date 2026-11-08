import type { Server as SocketIOServer } from "socket.io";
import {
  type Database,
  ludoRooms,
  ludoPlayers,
  ludoMessages,
  lt,
  inArray,
  computeExpirationCutoff,
} from "@low-stress/sdk/server";

export const DEFAULT_INACTIVE_DAYS = 7;

export interface ExpireOptions {
  now?: Date;
  days?: number;
}

export async function expireInactiveRooms(
  db: Database,
  optionsOrDaysOrNsp?:
    | ExpireOptions
    | number
    | { emit?: (ev: string, data: unknown) => void },
  autopilot?: { clearRoom?: (roomId: string) => void },
): Promise<number> {
  const isExpireOpts =
    typeof optionsOrDaysOrNsp === "object" &&
    optionsOrDaysOrNsp !== null &&
    ("days" in optionsOrDaysOrNsp || "now" in optionsOrDaysOrNsp);

  const days =
    typeof optionsOrDaysOrNsp === "number"
      ? optionsOrDaysOrNsp
      : isExpireOpts
        ? ((optionsOrDaysOrNsp as ExpireOptions).days ?? DEFAULT_INACTIVE_DAYS)
        : DEFAULT_INACTIVE_DAYS;
  const now =
    isExpireOpts && (optionsOrDaysOrNsp as ExpireOptions).now
      ? (optionsOrDaysOrNsp as ExpireOptions).now!
      : new Date();
  const cutoff = computeExpirationCutoff(days, now);

  const expiredRooms = await db
    .select({ id: ludoRooms.id })
    .from(ludoRooms)
    .where(lt(ludoRooms.lastActivityAt, cutoff));

  if (expiredRooms.length === 0) {
    return 0;
  }

  const roomIds = expiredRooms.map((r: { id: string }) => r.id);

  await db.transaction(async (tx) => {
    await tx
      .delete(ludoMessages)
      .where(inArray(ludoMessages.roomId, roomIds));
    await tx
      .delete(ludoPlayers)
      .where(inArray(ludoPlayers.roomId, roomIds));
    await tx.delete(ludoRooms).where(inArray(ludoRooms.id, roomIds));
  });

  if (autopilot?.clearRoom) {
    for (const id of roomIds) {
      autopilot.clearRoom(id);
    }
  }

  if (
    typeof optionsOrDaysOrNsp === "object" &&
    optionsOrDaysOrNsp !== null &&
    "emit" in optionsOrDaysOrNsp &&
    typeof optionsOrDaysOrNsp.emit === "function"
  ) {
    optionsOrDaysOrNsp.emit("rooms:purged", { count: expiredRooms.length });
  }

  return expiredRooms.length;
}

export const purgeExpiredLudoRooms = expireInactiveRooms;

export function startLudoExpirationJob(
  db: Database,
  io?: SocketIOServer | { of: (ns: string) => { emit: (ev: string, data: unknown) => void } },
  intervalMs = 60 * 60 * 1000,
) {
  const run = async () => {
    try {
      const purged = await expireInactiveRooms(db);
      if (purged > 0 && io && typeof io.of === "function") {
        io.of("/ludo").emit("rooms:purged", { count: purged });
      }
    } catch {
      // Abaikan error job
    }
  };

  const timer = setInterval(() => void run(), intervalMs);
  timer.unref?.();
  return {
    stop: () => clearInterval(timer),
    runNow: run,
  };
}
