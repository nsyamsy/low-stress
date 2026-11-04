import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

export interface DbHandle {
  db: Database;
  sql: Sql;
  close: () => Promise<void>;
}

export interface DbOptions {
  /** Ukuran pool; tes memakai 1 agar koneksi mudah ditutup. */
  max?: number;
  /** Nonaktifkan prepared statement untuk lingkungan dengan pooler. */
  prepare?: boolean;
}

/**
 * Buat koneksi Drizzle ke PostgreSQL. Pemanggil bertanggung jawab menutup
 * koneksi lewat `close()`.
 */
export function createDb(databaseUrl: string, options: DbOptions = {}): DbHandle {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL wajib diisi");
  }
  const sql = postgres(databaseUrl, {
    max: options.max ?? 10,
    prepare: options.prepare ?? true,
    onnotice: () => undefined,
  });
  const db = drizzle(sql, { schema });
  return {
    db,
    sql,
    close: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}

export * from "./schema";
