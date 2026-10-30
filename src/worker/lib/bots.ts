/**
 * Recognises crawlers and AI agents from their user agent, so the dashboard can show which AI companies
 * read your site and which pages they read. User agents can be faked; treat these as self-reported.
 */

export type BotCategory =
  | 'AI training' // crawls to train models
  | 'AI search' // indexes pages for AI answers / AI search
  | 'AI assistant' // fetches a page because a person asked an assistant about it
  | 'Search engine'
  | 'SEO'
  | 'Social preview'
  | 'Monitoring'
  | 'Other bot';

export const AI_CATEGORIES: BotCategory[] = ['AI training', 'AI search', 'AI assistant'];

export interface BotInfo {
  name: string;
  operator: string | null;
  category: BotCategory;
}

// Most specific first: "Claude-User" must not fall through to a generic match.
const KNOWN: [RegExp, string, string | null, BotCategory][] = [
  // AI assistants, fetching live for a user
  [/ChatGPT-User/i, 'ChatGPT-User', 'OpenAI', 'AI assistant'],
  [/Claude-User/i, 'Claude-User', 'Anthropic', 'AI assistant'],
  [/Perplexity-User/i, 'Perplexity-User', 'Perplexity', 'AI assistant'],
  [/MistralAI-User/i, 'MistralAI-User', 'Mistral', 'AI assistant'],
  [/Meta-ExternalFetcher/i, 'Meta-ExternalFetcher', 'Meta', 'AI assistant'],
  [/Gemini-Deep-Research/i, 'Gemini Deep Research', 'Google', 'AI assistant'],
  [/Google-CloudVertexBot/i, 'Google-CloudVertexBot', 'Google', 'AI assistant'],
  [/DuckAssistBot/i, 'DuckAssistBot', 'DuckDuckGo', 'AI assistant'],
  // AI search indexes
  [/OAI-SearchBot/i, 'OAI-SearchBot', 'OpenAI', 'AI search'],
  [/Claude-SearchBot/i, 'Claude-SearchBot', 'Anthropic', 'AI search'],
  [/PerplexityBot/i, 'PerplexityBot', 'Perplexity', 'AI search'],
  [/YouBot/i, 'YouBot', 'You.com', 'AI search'],
  [/PhindBot/i, 'PhindBot', 'Phind', 'AI search'],
  // AI training crawlers
  [/GPTBot/i, 'GPTBot', 'OpenAI', 'AI training'],
  [/ClaudeBot|anthropic-ai|Claude-Web/i, 'ClaudeBot', 'Anthropic', 'AI training'],
  [/CCBot/i, 'CCBot', 'Common Crawl', 'AI training'],
  [/Bytespider/i, 'Bytespider', 'ByteDance', 'AI training'],
  [/meta-externalagent/i, 'Meta-ExternalAgent', 'Meta', 'AI training'],
  [/FacebookBot/i, 'FacebookBot', 'Meta', 'AI training'],
  [/Amazonbot/i, 'Amazonbot', 'Amazon', 'AI training'],
  [/cohere-ai|cohere-training-data-crawler/i, 'Cohere', 'Cohere', 'AI training'],
  [/Diffbot/i, 'Diffbot', 'Diffbot', 'AI training'],
  [/AI2Bot/i, 'AI2Bot', 'Allen Institute for AI', 'AI training'],
  [/DeepSeekBot/i, 'DeepSeekBot', 'DeepSeek', 'AI training'],
  [/GrokBot|xAI-Bot/i, 'GrokBot', 'xAI', 'AI training'],
  [/PanguBot/i, 'PanguBot', 'Huawei', 'AI training'],
  [/Timpibot/i, 'Timpibot', 'Timpi', 'AI training'],
  [/omgili/i, 'Omgilibot', 'Webz.io', 'AI training'],
  [/ImagesiftBot/i, 'ImagesiftBot', 'ImageSift', 'AI training'],
  [/Kangaroo Bot/i, 'Kangaroo Bot', 'Kangaroo LLM', 'AI training'],
  // Search engines
  [/Googlebot|Google-InspectionTool|Storebot-Google|GoogleOther|AdsBot-Google/i, 'Googlebot', 'Google', 'Search engine'],
  [/bingbot|BingPreview|msnbot/i, 'Bingbot', 'Microsoft', 'Search engine'],
  [/Applebot/i, 'Applebot', 'Apple', 'Search engine'],
  [/DuckDuckBot/i, 'DuckDuckBot', 'DuckDuckGo', 'Search engine'],
  [/YandexBot|YandexMobileBot/i, 'YandexBot', 'Yandex', 'Search engine'],
  [/Baiduspider/i, 'Baiduspider', 'Baidu', 'Search engine'],
  [/PetalBot/i, 'PetalBot', 'Huawei', 'Search engine'],
  [/SeznamBot/i, 'SeznamBot', 'Seznam', 'Search engine'],
  [/Qwantbot|Qwantify/i, 'Qwantbot', 'Qwant', 'Search engine'],
  [/Sogou/i, 'Sogou', 'Sogou', 'Search engine'],
  // SEO tools
  [/AhrefsBot|AhrefsSiteAudit/i, 'AhrefsBot', 'Ahrefs', 'SEO'],
  [/SemrushBot|SiteAuditBot/i, 'SemrushBot', 'Semrush', 'SEO'],
  [/MJ12bot/i, 'MJ12bot', 'Majestic', 'SEO'],
  [/DotBot/i, 'DotBot', 'Moz', 'SEO'],
  [/DataForSeoBot/i, 'DataForSeoBot', 'DataForSEO', 'SEO'],
  [/Screaming Frog/i, 'Screaming Frog', 'Screaming Frog', 'SEO'],
  [/BLEXBot/i, 'BLEXBot', 'WebMeUp', 'SEO'],
  [/serpstatbot/i, 'serpstatbot', 'Serpstat', 'SEO'],
  [/Barkrowler/i, 'Barkrowler', 'Babbar', 'SEO'],
  // Link previews
  [/facebookexternalhit|facebookcatalog/i, 'Facebook preview', 'Meta', 'Social preview'],
  [/Twitterbot/i, 'Twitterbot', 'X', 'Social preview'],
  [/LinkedInBot/i, 'LinkedInBot', 'LinkedIn', 'Social preview'],
  [/Slackbot|Slack-ImgProxy/i, 'Slackbot', 'Slack', 'Social preview'],
  [/Discordbot/i, 'Discordbot', 'Discord', 'Social preview'],
  [/WhatsApp/i, 'WhatsApp', 'Meta', 'Social preview'],
  [/TelegramBot/i, 'TelegramBot', 'Telegram', 'Social preview'],
  [/Pinterestbot|Pinterest\//i, 'Pinterestbot', 'Pinterest', 'Social preview'],
  [/redditbot/i, 'redditbot', 'Reddit', 'Social preview'],
  [/Embedly|Iframely/i, 'Embed preview', null, 'Social preview'],
  // Uptime and speed checks
  [/UptimeRobot/i, 'UptimeRobot', 'UptimeRobot', 'Monitoring'],
  [/Pingdom/i, 'Pingdom', 'Pingdom', 'Monitoring'],
  [/Better ?Uptime|Betterstack/i, 'Better Stack', 'Better Stack', 'Monitoring'],
  [/StatusCake/i, 'StatusCake', 'StatusCake', 'Monitoring'],
  [/Chrome-Lighthouse|PageSpeed/i, 'Lighthouse', 'Google', 'Monitoring'],
];

const GENERIC = /bot\b|bot\/|crawl|spider|slurp|scrap|fetcher|preview/i;
const NAME = /([A-Za-z][\w.-]*(?:bot|crawler|spider|fetcher)[\w.-]*)/i;

/**
 * `signatureAgent` is the HTTP `Signature-Agent` header. Browser-based agents (like ChatGPT agent) use a
 * normal Chrome user agent, but sign their requests and name themselves there.
 */
export function classifyBot(ua: string, signatureAgent?: string | null): BotInfo | null {
  const sig = (signatureAgent ?? '').replace(/"/g, '').toLowerCase();
  if (sig.includes('chatgpt.com') || sig.includes('openai.com')) return { name: 'ChatGPT agent', operator: 'OpenAI', category: 'AI assistant' };
  if (!ua) return null;
  for (const [re, name, operator, category] of KNOWN) if (re.test(ua)) return { name, operator, category };
  if (GENERIC.test(ua)) return { name: (NAME.exec(ua)?.[1] ?? 'Other bot').slice(0, 40), operator: null, category: 'Other bot' };
  return null;
}

export const isAiBot = (b: BotInfo | null) => !!b && AI_CATEGORIES.includes(b.category);
