-- Migration: Add 'failed' status to episodes table
-- This migration adds 'failed' as a valid episode status for transcoding failure recovery

-- Note: SQLite doesn't support ALTER TABLE for CHECK constraints directly.
-- For existing installations that have already applied 001_initial_schema.sql,
-- you need to manually recreate the episodes table with the updated constraint.

-- This migration serves as documentation of the schema change.
-- The application layer validation in validation.ts now accepts 'failed' status.

-- If you need to migrate existing data:
-- 1. Create new table with updated constraint:
--    CREATE TABLE episodes_new (...);
-- 2. Copy data: INSERT INTO episodes_new SELECT * FROM episodes;
-- 3. Drop old: DROP TABLE episodes;
-- 4. Rename: ALTER TABLE episodes_new RENAME TO episodes;

-- For fresh installations, the 001_initial_schema.sql has been updated
-- to include 'failed' in the CHECK constraint.
