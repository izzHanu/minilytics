import type { Context } from 'hono';
import { siteOwnerActive } from './auth';
import { belongsTo, normalizePath } from './collect';
import type { AppEnv, Site } from './env';
import { AI_CATEGORIES, classifyBot, type BotInfo } from './lib/bots';
import { resolveRange } from './lib/time';
import { siteFromApiKey } from './payments';

const HOUR = 3_600_000;
const MAX_BATCH = 50;

export interface BotHit extends BotInfo {
  path: string;
  ts: number;
}

/** Adds hits to the per-hour counters. Hits for the same hour, bot and page become one write. */
export async function recordBotHits(db: D1Database, siteId: string, hits: BotHit[]) {
  const grouped = new Map<string, BotHit & { hour: number; n: number }>();
  for (const h of hits) {
    const hour = Math.floor(h.ts / HOUR) * HOUR;
    const key = `${hour}|${h.name}|${h.path}`;
    const g = grouped.get(key);
    if (g) {
      g.n++;
      g.ts = Math.max(g.ts, h.ts);
    } else grouped.set(key, { ...h, hour, n: 1 });
  }
  if (!grouped.size) return;
  await db.batch(
    [...grouped.values()].map((g) =>
      db
        .prepare(
          `INSERT INTO bot_hits (site_id, hour, bot, operator, category, path, hits, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (site_id, hour, bot, path) DO UPDATE SET hits = hits + excluded.hits, last_seen = MAX(last_seen, excluded.last_seen)`,
        )
        .bind(siteId, g.hour, g.name, g.operator, g.category, g.path, g.n, g.ts),
    ),
  );
}

interface CrawlInput {
  url?: unknown;
  path?: unknown;
  user_agent?: unknown;
  signature_agent?: unknown;
  timestamp?: unknown;
}

/** Turns one reported request into a hit, or a reason it was skipped. */
export function parseCrawl(site: Pick<Site, 'domain'>, b: CrawlInput, now: number): BotHit | string {
  const ua = typeof b.user_agent === 'string' ? b.user_agent.slice(0, 500) : '';
  const bot = classifyBot(ua, typeof b.signature_agent === 'string' ? b.signature_agent : null);
  if (!bot) return 'not a bot';
  let path: string;
  if (typeof b.url === 'string') {
    let u: URL;
    try {
      u = new URL(b.url);
    } catch {
      return 'invalid url';
    }
    if (!belongsTo(u.hostname, site.domain)) return 'url is not on this site';
    path = normalizePath(u.pathname);
  } else if (typeof b.path === 'string' && b.path.startsWith('/')) {
    path = normalizePath(b.path.split(/[?#]/)[0]);
  } else return 'url or path is required';
  const t = typeof b.timestamp === 'string' || typeof b.timestamp === 'number' ? new Date(b.timestamp).getTime() : NaN;
  // Accept a little clock skew and late batches, nothing from the far past or future.
  const ts = Number.isFinite(t) && t > now - 7 * 86_400_000 && t < now + 300_000 ? t : now;
  return { ...bot, path, ts };
}

/**
 * Crawler visits reported by your own server, since bots don't run the tracking script.
 * POST /api/v1/crawls  Authorization: Bearer <site api key>
 * { "url": "https://example.com/pricing", "user_agent": "...GPTBot/1.2...", "signature_agent": "<Signature-Agent header>" }
 * Also accepts an array of up to 50 of these. Requests from regular browsers are ignored.
 */
export async function handleCrawlApi(c: Context<AppEnv>) {
  const site = await siteFromApiKey(c);
  if (!site) return c.json({ error: 'invalid api key' }, 401);
  if (!siteOwnerActive(c.env, site)) return c.json({ ok: true, recorded: 0 });
  const raw = await c.req.text();
  if (raw.length > 64_000) return c.json({ error: 'too large' }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return c.json({ error: 'invalid json' }, 400);
  }
  const items = (Array.isArray(body) ? body : [body]).slice(0, MAX_BATCH) as CrawlInput[];
  const now = Date.now();
  const hits: BotHit[] = [];
  const skipped: string[] = [];
  for (const item of items) {
    const r = item && typeof item === 'object' ? parseCrawl(site, item, now) : 'invalid item';
    if (typeof r === 'string') skipped.push(r);
    else hits.push(r);
  }
  await recordBotHits(c.env.DB, site.id, hits);
  if (!Array.isArray(body) && skipped.length) return c.json({ ok: true, recorded: 0, skipped: skipped[0] });
  return c.json({ ok: true, recorded: hits.length, skipped: skipped.length });
}

const DIMS: Record<string, { col: string; ai: boolean; extra: string }> = {
  ai_bot: { col: 'bot', ai: true, extra: 'MAX(operator)' },
  ai_page: { col: 'path', ai: true, extra: 'COUNT(DISTINCT bot)' },
  ai_operator: { col: 'operator', ai: true, extra: 'COUNT(DISTINCT bot)' },
  bot: { col: 'bot', ai: false, extra: 'MAX(category)' },
  category: { col: 'category', ai: false, extra: 'COUNT(DISTINCT bot)' },
};

/** Crawler stats for the dashboard. Dashboard filters describe human visits, so they don't apply here. */
export async function botStats(c: Context<AppEnv>) {
  const site = c.get('site');
  const q = c.req.query();
  const dim = DIMS[q.dim ?? 'ai_bot'] ? (q.dim ?? 'ai_bot') : 'ai_bot';
  const d = DIMS[dim];
  const range = resolveRange(q, site.timezone, site.created_at);
  // Counters are hourly, so start at the hour that contains `from`.
  const from = Math.floor(range.from / HOUR) * HOUR;
  const prevFrom = from - (range.to - from);
  const aiIn = `category IN (${AI_CATEGORIES.map(() => '?').join(',')})`;
  const where = `site_id = ? AND hour >= ? AND hour < ?${d.ai ? ` AND ${aiIn}` : ''}`;
  const params = [site.id, from, range.to, ...(d.ai ? AI_CATEGORIES : [])];
  const totalsSql = `SELECT COALESCE(SUM(CASE WHEN ${aiIn} THEN hits END), 0) AS ai, COALESCE(SUM(hits), 0) AS all_hits
                     FROM bot_hits WHERE site_id = ? AND hour >= ? AND hour < ?`;
  const db = c.env.DB;
  const [rows, cur, prev] = await db.batch([
    db
      .prepare(
        `SELECT ${d.col} AS label, SUM(hits) AS hits, MAX(last_seen) AS last_seen, ${d.extra} AS extra
         FROM bot_hits WHERE ${where} GROUP BY label ORDER BY hits DESC LIMIT 200`,
      )
      .bind(...params),
    db.prepare(totalsSql).bind(...AI_CATEGORIES, site.id, from, range.to),
    db.prepare(totalsSql).bind(...AI_CATEGORIES, site.id, prevFrom, from),
  ]);
  const t1 = cur.results[0] as { ai: number; all_hits: number };
  const t0 = prev.results[0] as { ai: number; all_hits: number };
  return c.json({
    rows: rows.results,
    totals: { ai: t1.ai, all: t1.all_hits, prevAi: t0.ai, prevAll: t0.all_hits },
  });
}
