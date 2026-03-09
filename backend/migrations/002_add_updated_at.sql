ALTER TABLE episodes ADD COLUMN updated_at INTEGER;

-- Set initial updated_at values to created_at for existing rows
UPDATE episodes SET updated_at = created_at WHERE updated_at IS NULL;
