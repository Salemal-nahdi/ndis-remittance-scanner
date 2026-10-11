// Creates or updates the database tables from db/schema.sql.
import { readFile } from "node:fs/promises";
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
await sql.unsafe(await readFile(new URL("../db/schema.sql", import.meta.url), "utf8"));
await sql.end();
console.log("Database is up to date");
