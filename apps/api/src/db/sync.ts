import { readFileSync } from "node:fs"
import { join } from "node:path"
import { migrate } from "drizzle-orm/bun-sql/migrator"
import { db } from "./index"

const MIGRATIONS = join(import.meta.dir, "..", "..", "drizzle")

// Run pending SQL migrations on every API startup, so a new table/column never
// 500s with "relation does not exist". Uses bun-sql's native migrator.
//
// Adoption: this project's dev DBs were built with `drizzle-kit push` (no
// migration journal). On such a DB, migrate() would try to re-CREATE existing
// tables and fail. So if the journal is missing but the schema is already
// there, we baseline migration 0000 (the pre-existing schema) as applied — then
// migrate() only runs the newer migrations (0001+). Fresh DBs run everything.
export async function syncSchema(): Promise<void> {
  await baselineIfAdopting()
  await migrate(db, { migrationsFolder: MIGRATIONS })
}

async function baselineIfAdopting(): Promise<void> {
  const sql = db.$client

  const [journal] = await sql`select to_regclass('drizzle.__drizzle_migrations') as t`
  if (journal.t) {
    const [{ c }] = await sql`select count(*)::int as c from drizzle.__drizzle_migrations`
    if (c > 0) return // already managed by migrations
  }

  const [app] = await sql`select to_regclass('public.user') as t`
  if (!app.t) return // fresh DB — let migrate() create everything

  // Existing push-built DB: mark 0000 (full pre-existing schema) as applied.
  const meta = JSON.parse(readFileSync(join(MIGRATIONS, "meta", "_journal.json"), "utf8"))
  const baseline = meta.entries[0]
  await sql`create schema if not exists drizzle`
  await sql`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`
  await sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${baseline.tag}, ${baseline.when})`
  console.log("[db] adopted existing schema — baselined migrations, applying newer ones")
}
