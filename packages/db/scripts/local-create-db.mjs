import postgres from "postgres";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://postgres@127.0.0.1:5432/postgres";
const sql = postgres(databaseUrl);
const v = await sql.unsafe("select version()");
console.log(v[0].version);
try {
  await sql.unsafe("CREATE DATABASE low_stress");
  console.log("db created");
} catch (e) {
  console.log("db exists or error:", e.message);
}
await sql.end();
