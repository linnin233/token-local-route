import Database from "better-sqlite3";
import path from "node:path";
import os from "node:os";
import { mkdirSync } from "node:fs";
import { initSchema, seedPricing } from "./schema";

// ---------------------------------------------------------------------------
// Singleton database handle
// ---------------------------------------------------------------------------

let db: Database.Database | null = null;

/**
 * Return the singleton better-sqlite3 Database instance.
 *
 * On first call:
 *  1. Creates the directory `~/.token-local-route/` if it does not exist.
 *  2. Opens (or creates) the SQLite file at `~/.token-local-route/token-local-route.db`.
 *  3. Enables WAL journal mode for better concurrent-read performance.
 *  4. Runs `initSchema` (table/index creation) and `seedPricing` (default pricing
 *     rows, INSERT OR IGNORE).
 *
 * Subsequent calls return the already-initialized instance immediately.
 */
export function getDb(): Database.Database {
  if (db) return db;

  const dataDir = path.join(os.homedir(), ".token-local-route");
  const dbPath = path.join(dataDir, "token-local-route.db");

  // Ensure the data directory exists (recursive, noop if present)
  mkdirSync(dataDir, { recursive: true });

  db = new Database(dbPath);

  // Enable WAL mode for better read concurrency
  db.pragma("journal_mode = WAL");

  initSchema(db);
  seedPricing(db);

  return db;
}

/**
 * Close the database connection gracefully.
 *
 * Safe to call multiple times — subsequent calls are no-ops once `db` is null.
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
