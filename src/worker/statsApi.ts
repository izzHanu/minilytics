import type { Context } from 'hono';
import type { AppEnv, Site } from './env';
import { resolveRange, startOfDay, tzOffset } from './lib/time';
import { siteFromApiKey } from './payments';

/**
 * Read API for your own servers: live visitors, today, this month (or any dashboard period).
 * Authorization: Bearer <site api key>. The key can also record payments, so keep it server-side.
 *
 *   GET /api/v1/live    who is on the site right now, by country, city, page and source
 *   GET /api/v1/stats   live + today + this month, and ?period=7d|30d|… or ?period=custom&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * "Today" and "this month" follow the site's timezone (Settings → General).
 */

const ACTIVE_MS = 5 * 60_000;
const TTL = { live: 10_000, today: 60_000, month: 600_000, range: 300_000 };

const memory = new Map<string, { value: unknown; expires: number }>();

/**
 * Cache results in the isolate and in D1. The isolate cache absorbs bursts; the D1 copy is shared by all
 * isolates, so the expensive count runs at most once per TTL however often the API is polled.
 */
async function cached<T>(db: D1Database, siteId: string, key: string, ttl: number, now: number, compute: () => Promise<T>, shared = true): Promise<T> {
  const mk = `${siteId}:${key}`;
  const hit = memory.get(mk);
  if (hit && hit.expires > now) return hit.value as T;
  if (shared) {
    const row = await db
      .prepare('SELECT value, expires_at FROM api_cache WHERE site_id = ? AND key = ?')
      .bind(siteId, key)
      .first<{ value: string; expires_at: number }>();
    if (row && row.expires_at > now) {
      const value = JSON.parse(row.value) as T;
      memory.set(mk, { value, expires: row.expires_at });
      return value;
    }
  }
  const value = await compute();
  memory.set(mk, { value, expires: now + ttl });
  if (shared) {
    await db.batch([
      // Yesterday's "today" and other stale keys go here, so the table stays tiny.
      db.prepare('DELETE FROM api_cache WHERE site_id = ? AND expires_at < ?').bind(siteId, now - 3_600_000),
      db
        .prepare('INSERT OR REPLACE INTO api_cache (site_id, key, value, expires_at) VALUES (?, ?, ?, ?)')
        .bind(siteId, key, JSON.stringify(value), now + ttl),
    ]);
  }
  if (memory.size > 500) memory.clear();
  return value;
}

/** Midnight on the 1st of the month containing `at`, in the site's timezone, as a UTC timestamp. */
export function startOfMonth(at: number, tz: string): number {
  const local = new Date(at + tzOffset(tz, at));
  const utc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1);
  return utc - tzOffset(tz, utc);
}

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return null;
  }
})();
const countryName = (cc: string | null) => {
  if (!cc) return 'Unknown';
  try {
    return regionNames?.of(cc) ?? cc;
  } catch {
    return cc;
  }
};

interface LiveRow {
  visitor_id: string;
  country: string | null;
  city: string | null;
  page: string | null;
  source: string | null;
  device: string | null;
}

function countBy<T>(rows: T[], key: (r: T) => string | null) {
  const m = new Map<string | null, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export async function liveNow(db: D1Database, site: Site, now: number) {
  const r = await db
    .prepare(
      `SELECT visitor_id, country, city, exit_page AS page, source, device FROM sessions
       WHERE site_id = ? AND started_at > ? AND last_seen_at > ? ORDER BY last_seen_at DESC LIMIT 1000`,
    )
    .bind(site.id, now - 6 * 3_600_000, now - ACTIVE_MS)
    .all<LiveRow>();
  // One entry per person: their most recent session.
  const seen = new Set<string>();
  const people = r.results.filter((v) => !seen.has(v.visitor_id) && !!seen.add(v.visitor_id));
  return {
    visitors: people.length,
    countries: countBy(people, (p) => p.country).map(([code, visitors]) => ({ code, name: countryName(code), visitors })),
    cities: countBy(people, (p) => (p.city ? `${p.city}|${p.country ?? ''}` : null))
      .filter(([k]) => k)
      .slice(0, 20)
      .map(([k, visitors]) => {
        const [city, cc] = (k as string).split('|');
        return { city, country: cc || null, visitors };
      }),
    pages: countBy(people, (p) => p.page).slice(0, 20).map(([path, visitors]) => ({ path, visitors })),
    sources: countBy(people, (p) => p.source).slice(0, 20).map(([source, visitors]) => ({ source: source ?? 'Direct/None', visitors })),
    devices: countBy(people, (p) => p.device).map(([device, visitors]) => ({ device, visitors })),
  };
}

export async function totals(db: D1Database, siteId: string, from: number, to: number) {
  const r = await db
    .prepare(
      `SELECT COUNT(DISTINCT visitor_id) AS visitors, COUNT(*) AS sessions, COALESCE(SUM(pageviews), 0) AS pageviews
       FROM sessions WHERE site_id = ? AND started_at >= ? AND started_at < ?`,
    )
    .bind(siteId, from, to)
    .first<{ visitors: number; sessions: number; pageviews: number }>();
  return { visitors: r?.visitors ?? 0, sessions: r?.sessions ?? 0, pageviews: r?.pageviews ?? 0 };
}

const iso = (ms: number) => new Date(ms).toISOString();

async function auth(c: Context<AppEnv>) {
  const site = await siteFromApiKey(c);
  if (site) c.header('Cache-Control', 'no-store');
  return site;
}

export async function handleLiveApi(c: Context<AppEnv>) {
  const site = await auth(c);
  if (!site) return c.json({ error: 'invalid api key' }, 401);
  const now = Date.now();
  const live = await cached(c.env.DB, site.id, 'live', TTL.live, now, () => liveNow(c.env.DB, site, now), false);
  return c.json({ site: { id: site.id, domain: site.domain }, live, active_window_minutes: ACTIVE_MS / 60_000, updated_at: iso(now) });
}

export async function handleStatsApi(c: Context<AppEnv>) {
  const site = await auth(c);
  if (!site) return c.json({ error: 'invalid api key' }, 401);
  const db = c.env.DB;
  const now = Date.now();
  const tz = site.timezone;
  const dayFrom = startOfDay(now, tz);
  const monthFrom = startOfMonth(now, tz);
  const q = c.req.query();

  // Keys include the start time, so a new day or month never reuses yesterday's numbers.
  const [live, today, month] = await Promise.all([
    cached(db, site.id, 'live', TTL.live, now, () => liveNow(db, site, now), false),
    cached(db, site.id, `today:${dayFrom}`, TTL.today, now, () => totals(db, site.id, dayFrom, now)),
    cached(db, site.id, `month:${monthFrom}`, TTL.month, now, () => totals(db, site.id, monthFrom, now)),
  ]);

  const body: Record<string, unknown> = {
    site: { id: site.id, domain: site.domain, timezone: tz },
    live,
    today: { ...today, from: iso(dayFrom) },
    month: { ...month, from: iso(monthFrom) },
    updated_at: iso(now),
  };

  if (q.period) {
    const range = resolveRange(q, tz, site.created_at, now);
    // Rolling periods (24h, 48h) start at a different millisecond on every call; bucket them so calls share an entry.
    const key = `range:${q.period}:${q.from ?? ''}:${q.to ?? ''}:${Math.floor(range.from / TTL.range)}`;
    const t = await cached(db, site.id, key, TTL.range, now, () => totals(db, site.id, range.from, range.to));
    body.period = { name: q.period, ...t, from: iso(range.from), to: iso(range.to) };
  }
  return c.json(body);
}
