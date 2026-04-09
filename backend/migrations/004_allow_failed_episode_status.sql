-- Migration: allow `failed` in episodes.status CHECK constraint.
-- SQLite cannot alter CHECK constraints in place, so rebuild the table.
-- Note: migration runner already wraps each file in a transaction.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE episodes_new (
  id TEXT PRIMARY KEY,
  podcast_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  duration INTEGER,
  storage_path TEXT NOT NULL,
  price_per_second INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'ready', 'published', 'failed', 'archived')),
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  updated_at INTEGER,
  FOREIGN KEY (podcast_id) REFERENCES podcasts(id) ON DELETE CASCADE
);

INSERT INTO episodes_new (
  id,
  podcast_id,
  title,
  description,
  duration,
  storage_path,
  price_per_second,
  status,
  created_at,
  updated_at
)
SELECT
  id,
  podcast_id,
  title,
  description,
  duration,
  storage_path,
  price_per_second,
  status,
  created_at,
  COALESCE(updated_at, created_at)
FROM episodes;

DROP TABLE episodes;
ALTER TABLE episodes_new RENAME TO episodes;
