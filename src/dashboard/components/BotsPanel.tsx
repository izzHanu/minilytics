import { navigate } from '../App';
import { qs } from '../lib/api';
import { useDash } from '../lib/context';
import { fmtAgo, fmtNumber } from '../lib/format';
import { usePref } from '../lib/prefs';
import { useApi } from '../lib/useApi';
import { Favicon } from './Icons';

interface BotRow {
  label: string | null;
  hits: number;
  last_seen: number;
  extra: string | number | null;
}
interface BotStats {
  rows: BotRow[];
  totals: { ai: number; all: number; prevAi: number; prevAll: number };
}

const TABS = [
  { dim: 'ai_bot', label: 'AI bots' },
  { dim: 'ai_page', label: 'Pages AI read' },
  { dim: 'ai_operator', label: 'AI companies' },
  { dim: 'bot', label: 'All crawlers' },
  { dim: 'category', label: 'Type' },
] as const;
type Dim = (typeof TABS)[number]['dim'];

const OPERATOR_DOMAINS: Record<string, string> = {
  OpenAI: 'openai.com',
  Anthropic: 'anthropic.com',
  Perplexity: 'perplexity.ai',
  Google: 'google.com',
  Meta: 'meta.com',
  ByteDance: 'bytedance.com',
  Amazon: 'amazon.com',
  Apple: 'apple.com',
  Microsoft: 'bing.com',
  Mistral: 'mistral.ai',
  DuckDuckGo: 'duckduckgo.com',
  'Common Crawl': 'commoncrawl.org',
  Cohere: 'cohere.com',
  DeepSeek: 'deepseek.com',
  xAI: 'x.ai',
  'You.com': 'you.com',
};

const CATEGORY_HINTS: Record<string, string> = {
  'AI training': 'Collects pages to train AI models',
  'AI search': 'Indexes pages so AI answers can cite them',
  'AI assistant': 'Opened a page because someone asked an AI about it',
  'Search engine': 'Classic search indexing',
  SEO: 'SEO tools',
  'Social preview': 'Link previews in chats and social apps',
  Monitoring: 'Uptime and speed checks',
  'Other bot': 'Unrecognised crawlers',
};

function change(cur: number, prev: number) {
  if (!prev) return null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  return <span className={pct >= 0 ? 'text-emerald-600' : 'text-red-600'}>{pct >= 0 ? '↑' : '↓'} {Math.abs(pct)}%</span>;
}

function Label({ dim, row }: { dim: Dim; row: BotRow }) {
  const l = row.label ?? '(unknown)';
  // ai_bot rows carry the operator, bot rows the category, the others a count of distinct bots.
  const operator = dim === 'ai_bot' ? String(row.extra ?? '') : dim === 'ai_operator' ? l : '';
  const sub =
    dim === 'ai_bot' || dim === 'bot'
      ? row.extra
      : dim === 'category'
        ? CATEGORY_HINTS[l]
        : row.extra
          ? `${row.extra} bot${row.extra === 1 ? '' : 's'}`
          : null;
  return (
    <>
      {operator && OPERATOR_DOMAINS[operator] ? <Favicon domain={OPERATOR_DOMAINS[operator]} /> : <span className="w-4 shrink-0 text-center">🤖</span>}
      <span className="truncate">{l}</span>
      {sub && <span className="hidden truncate text-sm text-stone-400 sm:inline">{sub}</span>}
    </>
  );
}

export function BotsPanel() {
  const { site, q, reloadKey } = useDash();
  const [dim, setDim] = usePref<Dim>('ml_tab_bots', 'ai_bot');
  const active = TABS.some((t) => t.dim === dim) ? dim : 'ai_bot';
  const { data, loading, error } = useApi<BotStats>(`/api/sites/${site.id}/bots?${qs(q, { dim: active })}`, reloadKey);
  const rows = data?.rows ?? [];
  const max = Math.max(1, ...rows.map((r) => r.hits));
  const now = Date.now();

  return (
    <div className="card p-3">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <div className="tabs overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.dim} className={`tab whitespace-nowrap ${t.dim === active ? 'tab-active' : ''}`} onClick={() => setDim(t.dim)}>
              {t.label}
            </button>
          ))}
        </div>
        {data && (
          <div className="flex items-center gap-4 px-2 text-sm">
            <span>
              <span className="text-stone-500">AI bot visits </span>
              <span className="font-semibold">{fmtNumber(data.totals.ai)}</span> {change(data.totals.ai, data.totals.prevAi)}
            </span>
            <span className="hidden sm:inline">
              <span className="text-stone-500">All crawlers </span>
              <span className="font-semibold">{fmtNumber(data.totals.all)}</span>
            </span>
          </div>
        )}
      </div>
      <div className={loading && !data ? 'min-h-[160px] animate-pulse' : ''}>
        {error && <p className="p-3 text-sm text-red-600">{error}</p>}
        {data && rows.length === 0 && (
          <div className="p-6 text-center text-sm text-stone-500">
            <p>No crawler visits in this period.</p>
            {data.totals.all === 0 && (
              <p className="mt-1">
                AI bots don't run JavaScript, so your server has to report them.{' '}
                <button className="font-medium text-ink underline underline-offset-2" onClick={() => navigate(`/site/${site.id}/settings#crawlers`)}>
                  Set up crawler tracking
                </button>
              </p>
            )}
          </div>
        )}
        <div className="space-y-1">
          {rows.slice(0, 15).map((r, i) => (
            <div key={`${r.label}-${i}`} className="group relative flex h-10 items-center rounded-lg">
              <div className="absolute inset-y-0 left-0 rounded-lg bg-visitorsSoft" style={{ width: `${(r.hits / max) * 100}%`, minWidth: 4 }} />
              <div className="relative flex min-w-0 flex-1 items-center gap-2.5 px-3 text-[15px]">
                <Label dim={active} row={r} />
              </div>
              <div className="relative flex shrink-0 items-center gap-3 pr-3 text-[15px] font-medium">
                <span className="hidden text-xs font-normal text-stone-400 group-hover:inline">last seen {fmtAgo(now - r.last_seen)} ago</span>
                {fmtNumber(r.hits)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
