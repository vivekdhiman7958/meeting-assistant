import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import * as schema from "./schema";

// import.meta.dir is Bun's "folder this file is in". Using join() keeps paths correct on Windows.
export const DATA_DIR = join(import.meta.dir, "..", "..", "data");
export const UPLOADS_DIR = join(DATA_DIR, "uploads");
mkdirSync(UPLOADS_DIR, { recursive: true });

const sqlite = new Database(join(DATA_DIR, "app.db"), { create: true });
// WAL lets reads and writes happen at the same time. foreign_keys is OFF by default in
// SQLite, so without this line the cascade deletes above would silently do nothing.
sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

export const db = drizzle(sqlite, { schema });

// Apply any pending migration files on startup.
migrate(db, { migrationsFolder: join(import.meta.dir, "..", "..", "drizzle") });