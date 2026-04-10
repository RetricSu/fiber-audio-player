ALTER TABLE stream_sessions ADD COLUMN client_key TEXT;

CREATE INDEX IF NOT EXISTS idx_stream_sessions_episode_client_key_created_at
ON stream_sessions(episode_id, client_key, created_at);
