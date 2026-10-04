-- Apply to an existing server before publishing the updated sync-config.yaml.
CREATE TABLE IF NOT EXISTS notes (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text,
  modified_at text,
  content text,
  task_id text
);
CREATE INDEX IF NOT EXISTS notes_owner_idx ON notes (owner_id);


DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='powersync' AND tablename='notes') THEN
 ALTER PUBLICATION powersync ADD TABLE notes;
 END IF;
END $$;
