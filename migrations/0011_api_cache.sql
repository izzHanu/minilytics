-- Short-lived results for the read API (/api/v1/stats), so a site polling it every few seconds costs a
-- handful of database reads instead of re-counting the whole month each time.
CREATE TABLE api_cache (
  site_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (site_id, key)
) WITHOUT ROWID;
