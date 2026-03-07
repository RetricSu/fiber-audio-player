import { getDb } from "./db.js";
import { readdir, readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

export async function runMigrations(): Promise<void> {
  console.log("[migration] Starting migration runner...");

  getDb().exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000)
    );
  `);

  const appliedRows = getDb().prepare("SELECT name FROM migrations").all() as {
    name: string;
  }[];
  const appliedSet = new Set(appliedRows.map((m) => m.name));

  console.log(
    `[migration] ${appliedSet.size} migrations already applied:`,
    Array.from(appliedSet)
  );

  let files: string[];
  try {
    files = await readdir(MIGRATIONS_DIR);
  } catch (err) {
    console.log("[migration] No migrations directory found, skipping...");
    return;
  }

  const migrationFiles = files
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (migrationFiles.length === 0) {
    console.log("[migration] No migration files found");
    return;
  }

  console.log(
    `[migration] Found ${migrationFiles.length} migration files:`,
    migrationFiles
  );

  let appliedCount = 0;
  for (const file of migrationFiles) {
    if (appliedSet.has(file)) {
      console.log(`[migration] Skipping already applied: ${file}`);
      continue;
    }

    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = await readFile(filePath, "utf-8");

    const runTransaction = getDb().transaction(() => {
      getDb().exec(sql);
      getDb().prepare("INSERT INTO migrations (name) VALUES (?)").run(file);
    });

    try {
      runTransaction();
      appliedCount++;
      console.log(`[migration] Applied: ${file}`);
    } catch (err) {
      console.error(`[migration] Failed to apply ${file}:`, err);
      throw err;
    }
  }

  console.log(
    `[migration] Complete. Applied ${appliedCount} new migrations. Total: ${
      appliedSet.size + appliedCount
    }`
  );
}

export function getMigrationStatus(): {
  applied: string[];
  pending: string[];
} {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000)
    );
  `);

  const appliedRows = getDb().prepare("SELECT name FROM migrations").all() as {
    name: string;
  }[];
  const applied = appliedRows.map((m) => m.name);

  return {
    applied,
    pending: [],
  };
}
