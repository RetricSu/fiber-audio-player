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

    // Podcasts table
    db.exec(`
      CREATE TABLE IF NOT EXISTS podcasts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000)
      );
    `);

    // Episodes table
    db.exec(`
      CREATE TABLE IF NOT EXISTS episodes (
        id TEXT PRIMARY KEY,
        podcast_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        duration INTEGER,
        storage_path TEXT NOT NULL,
        price_per_second INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'ready', 'published', 'archived')),
        created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000),
        FOREIGN KEY (podcast_id) REFERENCES podcasts(id) ON DELETE CASCADE
      );
    `);

    // Stream sessions table
    db.exec(`
      CREATE TABLE IF NOT EXISTS stream_sessions (
        id TEXT PRIMARY KEY,
        episode_id TEXT NOT NULL,
        stream_token TEXT NOT NULL UNIQUE,
        total_paid_seconds INTEGER NOT NULL DEFAULT 0,
        max_segment_index INTEGER NOT NULL DEFAULT 0,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000),
        FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
      );
    `);

    // Create index for stream_token lookups
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_stream_sessions_token ON stream_sessions(stream_token);
    `);

    // Payments table
    db.exec(`
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        payment_hash TEXT NOT NULL UNIQUE,
        preimage TEXT,
        amount_shannon INTEGER NOT NULL,
        granted_seconds INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled', 'failed')),
        created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000),
        settled_at INTEGER,
        FOREIGN KEY (session_id) REFERENCES stream_sessions(id) ON DELETE CASCADE
      );
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

// Export singleton instance getter
export const db = DatabaseManager.getInstance();
export const healthCheck = DatabaseManager.healthCheck;
export const closeDb = DatabaseManager.close;

export default db;
