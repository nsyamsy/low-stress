import type { Database } from "@low-stress/db";
import { type admins, type users } from "@low-stress/db";
import {
  ADMIN_COOKIE_NAME,
  getAdminSession,
  getSessionUser,
  SESSION_COOKIE_NAME,
} from "./session";

export type Principal =
  | {
      kind: "user";
      user: typeof users.$inferSelect;
      sessionId: string;
    }
  | {
      kind: "admin";
      admin: typeof admins.$inferSelect;
      sessionId: string;
    }
  | {
      kind: "none";
    };

export function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;

  for (const pair of cookieHeader.split(";")) {
    const parts = pair.split("=");
    const key = parts.shift()?.trim();
    if (key) {
      try {
        list[key] = decodeURIComponent(parts.join("=").trim());
      } catch {
        list[key] = parts.join("=").trim();
      }
    }
  }

  return list;
}

/**
 * Menentukan identitas pemanggil dari cookie request / handshake.
 * Aturan prioritas tunggal (R-02):
 * 1. Bila ada sesi pemain (`ls_session`) yang valid, kembalikan `kind: "user"`.
 * 2. Bila tidak, namun ada sesi admin (`ls_admin`) yang valid, kembalikan `kind: "admin"`.
 * 3. Selain itu, kembalikan `kind: "none"`.
 */
export async function resolvePrincipal(
  db: Database,
  cookiesOrHeader?: Record<string, string | undefined> | string,
): Promise<Principal> {
  const cookies =
    typeof cookiesOrHeader === "string"
      ? parseCookieHeader(cookiesOrHeader)
      : (cookiesOrHeader ?? {});

  const userToken = cookies[SESSION_COOKIE_NAME];
  if (userToken) {
    const userSession = await getSessionUser(db, userToken);
    if (userSession) {
      return {
        kind: "user",
        user: userSession.user,
        sessionId: userSession.session.id,
      };
    }
  }

  const adminToken = cookies[ADMIN_COOKIE_NAME];
  if (adminToken) {
    const adminSession = await getAdminSession(db, adminToken);
    if (adminSession) {
      return {
        kind: "admin",
        admin: adminSession.admin,
        sessionId: adminSession.session.id,
      };
    }
  }

  return { kind: "none" };
}
