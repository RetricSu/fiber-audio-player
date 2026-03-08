import DatabaseConstructor from "better-sqlite3";
import type { Database } from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, "..", "data", "podcast.db");

class DatabaseManager {
  private static instance: Database | null = null;

  static getInstance(): Database {
    if (!DatabaseManager.instance) {
      // Ensure data directory exists
      const dataDir = path.dirname(DB_PATH);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      DatabaseManager.instance = new DatabaseConstructor(DB_PATH);
      DatabaseManager.instance.pragma("journal_mode = WAL");
      DatabaseManager.instance.pragma("foreign_keys = ON");

      DatabaseManager.initializeSchema();
    }
    return DatabaseManager.instance;
  }

  private static initializeSchema(): void {
    const db = DatabaseManager.instance!;

    // Schema is managed via migrations in migrations/ directory
    // Only indexes are created here (idempotent with IF NOT EXISTS)

    // Create index for stream_token lookups
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_stream_sessions_token ON stream_sessions(stream_token);
    `);

    // Create index for payment_hash lookups
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_payments_hash ON payments(payment_hash);
    `);

    // Create index for session_id lookups
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_payments_session ON payments(session_id);
    `);
  }

  static healthCheck(): boolean {
    try {
      const db = DatabaseManager.getInstance();
      const result = db.prepare("SELECT 1").get();
      return result !== undefined;
    } catch (error) {
      console.error("Database health check failed:", error);
      return false;
    }
  }

  static close(): void {
    if (DatabaseManager.instance) {
      DatabaseManager.instance.close();
      DatabaseManager.instance = null;
    }
  }
}

// Track initialization state
let isInitialized = false;

/**
 * Initialize the database. Must be called before using getDb().
 * This function is idempotent - calling it multiple times is safe.
 */
export function initialize(): Database {
  if (!isInitialized) {
    DatabaseManager.getInstance();
    isInitialized = true;
  }
  return DatabaseManager.getInstance();
}

/**
 * Get the initialized database instance.
 * Throws if initialize() has not been called first.
 */
export function getDb(): Database {
  if (!isInitialized) {
    throw new Error(
      "Database not initialized. Call initialize() before using getDb()."
    );
  }
  return DatabaseManager.getInstance();
}

/**
 * Check if the database has been initialized.
 */
export function isDbInitialized(): boolean {
  return isInitialized;
}

export const healthCheck = DatabaseManager.healthCheck;
export const closeDb = DatabaseManager.close;

export async function initDb(): Promise<void> {
  // Initialize the database first
  initialize();
  // Then run migrations
  const { runMigrations } = await import("./migrations.js");
  await runMigrations();
}

// For backward compatibility during transition - deprecated
export const db = DatabaseManager.getInstance();

export default getDb;
