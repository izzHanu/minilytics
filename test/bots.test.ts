import { describe, expect, it } from 'vitest';
import { parseCrawl } from '../src/worker/crawls';
import { classifyBot, isAiBot } from '../src/worker/lib/bots';

const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

describe('classifyBot', () => {
  it('recognises AI crawlers by company and purpose', () => {
    expect(classifyBot('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)')).toEqual({ name: 'GPTBot', operator: 'OpenAI', category: 'AI training' });
    expect(classifyBot('Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)')).toMatchObject({ name: 'ClaudeBot', operator: 'Anthropic' });
    expect(classifyBot('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot')).toMatchObject({ name: 'ChatGPT-User', category: 'AI assistant' });
    expect(classifyBot('Mozilla/5.0 (compatible; Claude-User/1.0; +Claude-User@anthropic.com)')).toMatchObject({ name: 'Claude-User', category: 'AI assistant' });
    expect(classifyBot('Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)')).toMatchObject({ name: 'OAI-SearchBot', category: 'AI search' });
    expect(classifyBot('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)')).toMatchObject({ name: 'PerplexityBot', category: 'AI search' });
    expect(classifyBot('meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)')).toMatchObject({ operator: 'Meta', category: 'AI training' });
  });
  it('recognises browser-based agents by their Signature-Agent header', () => {
    expect(classifyBot(CHROME, '"https://chatgpt.com"')).toMatchObject({ name: 'ChatGPT agent', category: 'AI assistant' });
  });
  it('separates search engines and others from AI', () => {
    const g = classifyBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)');
    expect(g).toMatchObject({ name: 'Googlebot', category: 'Search engine' });
    expect(isAiBot(g)).toBe(false);
    expect(classifyBot('Mozilla/5.0 (compatible; AhrefsBot/7.0)')).toMatchObject({ category: 'SEO' });
    expect(classifyBot('Mozilla/5.0 (compatible; WeirdThingBot/0.1)')).toMatchObject({ name: 'WeirdThingBot', category: 'Other bot' });
  });
  it('ignores people', () => {
    expect(classifyBot(CHROME)).toBeNull();
    expect(classifyBot('')).toBeNull();
  });
});

describe('parseCrawl', () => {
  const site = { domain: 'shipkit.dev' };
  const now = Date.parse('2026-10-30T12:00:00Z');
  const ua = 'Mozilla/5.0 (compatible; GPTBot/1.2)';
  it('turns a request into a hit on a clean path', () => {
    expect(parseCrawl(site, { url: 'https://www.shipkit.dev/pricing/?a=1', user_agent: ua }, now)).toMatchObject({ name: 'GPTBot', path: '/pricing', ts: now });
    expect(parseCrawl(site, { path: '/blog/x?utm=1', user_agent: ua }, now)).toMatchObject({ path: '/blog/x' });
  });
  it('rejects other domains, people and bad input', () => {
    expect(parseCrawl(site, { url: 'https://evil.com/', user_agent: ua }, now)).toBe('url is not on this site');
    expect(parseCrawl(site, { url: 'https://shipkit.dev/', user_agent: CHROME }, now)).toBe('not a bot');
    expect(parseCrawl(site, { user_agent: ua }, now)).toBe('url or path is required');
  });
  it('keeps reported times only when plausible', () => {
    expect(parseCrawl(site, { path: '/', user_agent: ua, timestamp: '2026-10-30T11:00:00Z' }, now)).toMatchObject({ ts: now - 3_600_000 });
    expect(parseCrawl(site, { path: '/', user_agent: ua, timestamp: '2020-01-01T00:00:00Z' }, now)).toMatchObject({ ts: now });
  });
});
