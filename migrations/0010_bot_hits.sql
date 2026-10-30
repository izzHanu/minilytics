-- Crawler and AI bot visits. Bots don't run the tracking script, so these come from the site's server
-- (POST /api/v1/crawls) or, for the few bots that do run JavaScript, from the script.
-- Counted per hour, bot and page so heavy crawling stays small: one row per (hour, bot, page), not one per hit.
CREATE TABLE bot_hits (
  site_id TEXT NOT NULL,
  hour INTEGER NOT NULL,        -- start of the hour, ms since epoch (UTC)
  bot TEXT NOT NULL,            -- e.g. GPTBot, ClaudeBot, ChatGPT-User
  operator TEXT,                -- e.g. OpenAI, Anthropic
  category TEXT NOT NULL,       -- AI training | AI search | AI assistant | Search engine | SEO | Social preview | Monitoring | Other bot
  path TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (site_id, hour, bot, path)
) WITHOUT ROWID;
