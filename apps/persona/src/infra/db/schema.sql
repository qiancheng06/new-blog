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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_daily_notes_date ON daily_notes(date DESC);

CREATE TABLE IF NOT EXISTS calendar_tags (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  tone TEXT NOT NULL CHECK (tone IN ('green', 'blue', 'amber', 'red', 'gray')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_tags_active_label
  ON calendar_tags(label) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_tags_active_sort
  ON calendar_tags(deleted_at, sort_order, created_at);

INSERT INTO calendar_tags (id, label, tone, sort_order)
SELECT 'focus', '专注', 'green', 10
WHERE NOT EXISTS (SELECT 1 FROM calendar_tags);
INSERT INTO calendar_tags (id, label, tone, sort_order)
SELECT 'meeting', '会议', 'blue', 20
WHERE (SELECT COUNT(*) FROM calendar_tags) = 1 AND EXISTS (SELECT 1 FROM calendar_tags WHERE id = 'focus');
INSERT INTO calendar_tags (id, label, tone, sort_order)
SELECT 'personal', '个人', 'amber', 30
WHERE (SELECT COUNT(*) FROM calendar_tags) = 2 AND EXISTS (SELECT 1 FROM calendar_tags WHERE id = 'meeting');
INSERT INTO calendar_tags (id, label, tone, sort_order)
SELECT 'reminder', '提醒', 'red', 40
WHERE (SELECT COUNT(*) FROM calendar_tags) = 3 AND EXISTS (SELECT 1 FROM calendar_tags WHERE id = 'personal');

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  tag_id TEXT NOT NULL REFERENCES calendar_tags(id),
  all_day INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0, 1)),
  start_at TEXT,
  end_at TEXT,
  start_date TEXT,
  end_date TEXT,
  time_zone TEXT,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (
    (all_day = 1 AND start_date IS NOT NULL AND end_date IS NOT NULL AND start_at IS NULL AND end_at IS NULL)
    OR
    (all_day = 0 AND start_at IS NOT NULL AND end_at IS NOT NULL AND time_zone IS NOT NULL AND start_date IS NULL AND end_date IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_active_range
  ON calendar_events(deleted_at, all_day, start_date, start_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_tag
  ON calendar_events(tag_id, deleted_at);

CREATE TABLE IF NOT EXISTS background_jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('memory_analysis')),
  source_event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  available_at TEXT NOT NULL DEFAULT (datetime('now')),
  locked_at TEXT,
  lock_owner TEXT,
  last_error TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_claim
  ON background_jobs(status, available_at, created_at);
CREATE INDEX IF NOT EXISTS idx_background_jobs_source
  ON background_jobs(source_event_id);
