CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_telegram_identity ON events(
  source,
  json_extract(payload, '$.chat_id'),
  json_extract(payload, '$.message_id')
) WHERE source = 'telegram';

CREATE TABLE IF NOT EXISTS conversation_jobs (
  id TEXT PRIMARY KEY,
  source_event_id TEXT NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT NOT NULL DEFAULT '' CHECK (error_code IN ('', 'companion_error', 'reply_error', 'state_error', 'interrupted')),
  reply_event_id TEXT UNIQUE REFERENCES events(id) ON DELETE SET NULL,
  retry_event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_conversation_jobs_status_updated
  ON conversation_jobs(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS analysis_jobs (
  id TEXT PRIMARY KEY,
  source_event_id TEXT NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT NOT NULL DEFAULT '' CHECK (error_code IN ('', 'analysis_error', 'memory_error', 'interrupted')),
  retry_event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status_updated
  ON analysis_jobs(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
  message_count INTEGER NOT NULL DEFAULT 0,
  summary TEXT NOT NULL DEFAULT '',
  related_topics TEXT NOT NULL DEFAULT '[]',
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'archived', 'suppressed')),
  state_event_id TEXT REFERENCES events(id),
  state_reason TEXT NOT NULL DEFAULT '',
  state_updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_topics_last_active ON topics(last_active_at DESC);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  source_event_id TEXT UNIQUE REFERENCES events(id) ON DELETE SET NULL,
  name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 200),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'done', 'archived')),
  topics TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(topics) AND json_type(topics) = 'array'),
  summary TEXT NOT NULL DEFAULT '' CHECK (length(summary) <= 4000),
  state_event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  state_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  archived_at TEXT,
  CHECK (
    (status IN ('active', 'paused') AND completed_at IS NULL AND archived_at IS NULL) OR
    (status = 'done' AND completed_at IS NOT NULL AND archived_at IS NULL) OR
    (status = 'archived' AND completed_at IS NULL AND archived_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_projects_status_updated
  ON projects(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS working_state (
  id TEXT PRIMARY KEY CHECK (id = 'primary'),
  current_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  active_topics TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(active_topics) AND json_type(active_topics) = 'array'),
  current_questions TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(current_questions) AND json_type(current_questions) = 'array'),
  mode TEXT NOT NULL DEFAULT 'S1' CHECK (mode IN ('S1', 'S2', 'S3', 'S4')),
  state_event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  state_reason TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO working_state (id) VALUES ('primary');

CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  source_event_id TEXT NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  project_event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  project_reason TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 500),
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  state_event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  state_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  cancelled_at TEXT,
  CHECK (due_date IS NULL OR due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  CHECK (
    (status = 'open' AND completed_at IS NULL AND cancelled_at IS NULL) OR
    (status = 'done' AND completed_at IS NOT NULL AND cancelled_at IS NULL) OR
    (status = 'cancelled' AND completed_at IS NULL AND cancelled_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_todos_status_due
  ON todos(status, due_date ASC, created_at DESC);

CREATE TABLE IF NOT EXISTS profile (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  source_event_id TEXT REFERENCES events(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'archived', 'suppressed')),
  state_event_id TEXT REFERENCES events(id),
  state_reason TEXT NOT NULL DEFAULT '',
  state_updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_profile_updated_at ON profile(updated_at DESC);

CREATE TABLE IF NOT EXISTS memory_proposals (
  id TEXT PRIMARY KEY,
  source_event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  proposal_type TEXT NOT NULL CHECK (proposal_type IN ('profile')),
  proposal_key TEXT NOT NULL,
  proposed_value TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  review_event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  review_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source_event_id, proposal_type, proposal_key, proposed_value),
  CHECK (
    (
      status = 'pending' AND review_event_id IS NULL AND
      review_reason = '' AND reviewed_at IS NULL
    ) OR (
      status IN ('accepted', 'rejected') AND review_event_id IS NOT NULL AND
      length(trim(review_reason)) > 0 AND reviewed_at IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_memory_proposals_status_created
  ON memory_proposals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_proposals_source
  ON memory_proposals(source_event_id, created_at DESC);

CREATE TABLE IF NOT EXISTS timeline_events (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('insight', 'shift', 'milestone')),
  summary TEXT NOT NULL,
  source_event_id TEXT REFERENCES events(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_timeline_events_recent ON timeline_events(date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS daily_notes (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  summary TEXT NOT NULL DEFAULT '',
  highlights TEXT NOT NULL DEFAULT '[]',
  topic_distribution TEXT NOT NULL DEFAULT '{}',
  source_event_id TEXT REFERENCES events(id),
  archive_path TEXT,
  archive_event_id TEXT REFERENCES events(id),
  archived_at TEXT,
  finalized_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_daily_notes_date ON daily_notes(date DESC);

CREATE TABLE IF NOT EXISTS daily_summary_runs (
  date TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT NOT NULL DEFAULT '' CHECK (error_code IN ('', 'generation_error', 'archive_error', 'state_error', 'interrupted')),
  archive_requested INTEGER NOT NULL DEFAULT 0 CHECK (archive_requested IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_daily_summary_runs_status_date
  ON daily_summary_runs(status, date ASC);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_search USING fts5(
  entity_type UNINDEXED,
  entity_id UNINDEXED,
  title,
  body,
  state UNINDEXED,
  source_event_id UNINDEXED,
  memory_date UNINDEXED,
  tokenize = 'trigram'
);

CREATE TRIGGER IF NOT EXISTS memory_search_topic_insert
AFTER INSERT ON topics BEGIN
  INSERT INTO memory_search (
    entity_type, entity_id, title, body, state, source_event_id, memory_date
  ) VALUES ('topic', NEW.id, NEW.name, NEW.summary, NEW.state, NULL, NEW.last_active_at);
END;

CREATE TRIGGER IF NOT EXISTS memory_search_topic_update
AFTER UPDATE ON topics BEGIN
  DELETE FROM memory_search WHERE entity_type = 'topic' AND entity_id = OLD.id;
  INSERT INTO memory_search (
    entity_type, entity_id, title, body, state, source_event_id, memory_date
  ) VALUES ('topic', NEW.id, NEW.name, NEW.summary, NEW.state, NULL, NEW.last_active_at);
END;

CREATE TRIGGER IF NOT EXISTS memory_search_topic_delete
AFTER DELETE ON topics BEGIN
  DELETE FROM memory_search WHERE entity_type = 'topic' AND entity_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS memory_search_profile_insert
AFTER INSERT ON profile BEGIN
  INSERT INTO memory_search (
    entity_type, entity_id, title, body, state, source_event_id, memory_date
  ) VALUES ('profile', NEW.id, NEW.key, NEW.value, NEW.state, NEW.source_event_id, NEW.updated_at);
END;

CREATE TRIGGER IF NOT EXISTS memory_search_profile_update
AFTER UPDATE ON profile BEGIN
  DELETE FROM memory_search WHERE entity_type = 'profile' AND entity_id = OLD.id;
  INSERT INTO memory_search (
    entity_type, entity_id, title, body, state, source_event_id, memory_date
  ) VALUES ('profile', NEW.id, NEW.key, NEW.value, NEW.state, NEW.source_event_id, NEW.updated_at);
END;

CREATE TRIGGER IF NOT EXISTS memory_search_profile_delete
AFTER DELETE ON profile BEGIN
  DELETE FROM memory_search WHERE entity_type = 'profile' AND entity_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS memory_search_timeline_insert
AFTER INSERT ON timeline_events BEGIN
  INSERT INTO memory_search (
    entity_type, entity_id, title, body, state, source_event_id, memory_date
  ) VALUES ('timeline', NEW.id, NEW.type, NEW.summary, 'active', NEW.source_event_id, NEW.date);
END;

CREATE TRIGGER IF NOT EXISTS memory_search_timeline_update
AFTER UPDATE ON timeline_events BEGIN
  DELETE FROM memory_search WHERE entity_type = 'timeline' AND entity_id = OLD.id;
  INSERT INTO memory_search (
    entity_type, entity_id, title, body, state, source_event_id, memory_date
  ) VALUES ('timeline', NEW.id, NEW.type, NEW.summary, 'active', NEW.source_event_id, NEW.date);
END;

CREATE TRIGGER IF NOT EXISTS memory_search_timeline_delete
AFTER DELETE ON timeline_events BEGIN
  DELETE FROM memory_search WHERE entity_type = 'timeline' AND entity_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS memory_search_daily_note_insert
AFTER INSERT ON daily_notes BEGIN
  INSERT INTO memory_search (
    entity_type, entity_id, title, body, state, source_event_id, memory_date
  ) VALUES (
    'daily_note', NEW.id, NEW.date,
    NEW.summary || char(10) || NEW.highlights || char(10) || NEW.topic_distribution,
    'active', NEW.source_event_id, NEW.date
  );
END;

CREATE TRIGGER IF NOT EXISTS memory_search_daily_note_update
AFTER UPDATE ON daily_notes BEGIN
  DELETE FROM memory_search WHERE entity_type = 'daily_note' AND entity_id = OLD.id;
  INSERT INTO memory_search (
    entity_type, entity_id, title, body, state, source_event_id, memory_date
  ) VALUES (
    'daily_note', NEW.id, NEW.date,
    NEW.summary || char(10) || NEW.highlights || char(10) || NEW.topic_distribution,
    'active', NEW.source_event_id, NEW.date
  );
END;

CREATE TRIGGER IF NOT EXISTS memory_search_daily_note_delete
AFTER DELETE ON daily_notes BEGIN
  DELETE FROM memory_search WHERE entity_type = 'daily_note' AND entity_id = OLD.id;
END;
