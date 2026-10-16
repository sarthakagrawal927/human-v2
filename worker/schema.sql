CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  configuration TEXT NOT NULL,
  context TEXT NOT NULL,
  baseline TEXT NOT NULL,
  digest TEXT NOT NULL UNIQUE,
  score REAL NOT NULL,
  created_at TEXT NOT NULL
);
