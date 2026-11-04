import postgres from "postgres";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://postgres@127.0.0.1:5432/low_stress";
const sql = postgres(databaseUrl);
const rows = await sql.unsafe(`
  select table_name from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE'
  order by table_name
`);
console.log(rows.map((r) => r.table_name).join("\n"));
const ext = await sql.unsafe("select extname from pg_extension order by extname");
console.log("extensions:", ext.map((r) => r.extname).join(", "));
const cols = await sql.unsafe(`
  select column_name, data_type, udt_name from information_schema.columns
  where table_schema='public' and table_name='users' and column_name in ('username','email')
  order by column_name
`);
console.log("users email/username:", JSON.stringify(cols));
await sql.end();
