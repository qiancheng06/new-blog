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

CREATE TABLE IF NOT EXISTS analysis_jobs (
  id TEXT PRIMARY KEY,
  source_event_id TEXT NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT NOT NULL DEFAULT '' CHECK (error_code IN ('', 'generation_error', 'archive_error', 'state_error', 'interrupted')),
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
  name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  topics TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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
  error_code TEXT NOT NULL DEFAULT '',
  archive_requested INTEGER NOT NULL DEFAULT 0 CHECK (archive_requested IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_daily_summary_runs_status_date
  ON daily_summary_runs(status, date ASC);
