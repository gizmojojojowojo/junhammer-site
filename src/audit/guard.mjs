// URL checks and a bounded fetch for the audit agent. Visitors choose the URL,
// so every request this site makes on their behalf goes through here.

const BLOCKED_SUFFIXES = [
  'localhost', 'local', 'internal', 'intranet', 'lan', 'home', 'corp', 'private',
  'test', 'example', 'invalid', 'onion', 'arpa',
  // Wildcard DNS services that resolve any name to an address embedded in it.
  'nip.io', 'sslip.io', 'xip.io', 'localtest.me', 'lvh.me', 'vcap.me',
];

export const UA = 'junhammer-audit/1.0 (+https://junhammer.com/audit/)';

/**
 * Accepts only public http(s) web addresses on default ports. IP literals are
 * refused outright: the URL parser normalises decimal, hex and octal forms to
 * dotted IPv4, so one pattern covers them. Returns { url } or { error }.
 */
export function checkUrl(input) {
  if (typeof input !== 'string') return { error: 'Enter a web address.' };
  let text = input.trim();
  if (!text || text.length > 2000) return { error: 'Enter a web address.' };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;
  let url;
  try {
    url = new URL(text);
  } catch {
    return { error: 'That does not look like a web address.' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { error: 'Only http and https addresses can be audited.' };
  if (url.username || url.password) return { error: 'Addresses with a username or password cannot be audited.' };
  if (url.port) return { error: 'Only standard web ports can be audited.' };
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const refuse = { error: 'Only public websites can be audited.' };
  if (!host || host.startsWith('[') || host.includes(':')) return refuse;
  if (/^[\d.]+$/.test(host) || /^0x/i.test(host)) return refuse;
  if (!host.includes('.')) return refuse;
  if (!/^[a-z0-9.-]+$/.test(host)) return refuse;
  if (BLOCKED_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))) return refuse;
  url.hash = '';
  return { url };
}

/** Same site, ignoring a leading www. The agent may only fetch within the audited site. */
export function sameSite(a, b) {
  const strip = (h) => h.toLowerCase().replace(/^www\./, '');
  return strip(a.hostname) === strip(b.hostname);
}

async function readCapped(res, maxBytes) {
  if (!res.body) return { text: '', truncated: false };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    text += decoder.decode(value, { stream: true });
    if (bytes >= maxBytes) {
      truncated = true;
      await reader.cancel().catch(() => {});
      break;
    }
  }
  return { text, truncated };
}

/**
 * GET with redirects followed by hand so every hop passes checkUrl, a time
 * limit, and a cap on how much of the body is read.
 * Returns { ok, status, finalUrl, redirects, headers, text, truncated } or { ok: false, error }.
 */
export async function safeFetch(start, { fetchImpl = fetch, maxRedirects = 4, timeoutMs = 9000, maxBytes = 400_000 } = {}) {
  let current = start instanceof URL ? start : checkUrl(start).url;
  if (!current) return { ok: false, error: 'not_allowed' };
  const redirects = [];
  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const res = await fetchImpl(current.href, {
        method: 'GET',
        redirect: 'manual',
        headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        const next = checkUrl(new URL(res.headers.get('location'), current).href);
        if (next.error) return { ok: false, error: 'redirect_not_allowed', redirects };
        redirects.push({ status: res.status, to: next.url.href });
        current = next.url;
        continue;
      }
      const type = res.headers.get('content-type') || '';
      const readable = !type || /text\/|html|xml|json/.test(type);
      const { text, truncated } = readable ? await readCapped(res, maxBytes) : { text: '', truncated: false };
      return { ok: true, status: res.status, finalUrl: current.href, redirects, headers: res.headers, contentType: type, text, truncated };
    }
    return { ok: false, error: 'too_many_redirects', redirects };
  } catch (e) {
    return { ok: false, error: e?.name === 'TimeoutError' ? 'timeout' : 'unreachable', redirects };
  }
}
