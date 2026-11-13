// Search by meaning for /ask/. Each passage gets an embedding (a list of
// numbers that places similar meanings near each other). A question is embedded
// the same way, and the closest passages are blended with the keyword ranking.
// The model runs on Cloudflare Workers AI; everything here is pure and tested.
import { plain } from './chunk.mjs';
import { search } from './retrieve.mjs';

export const EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';
// BGE models are trained with this prefix on the question side only.
export const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';
export const BATCH = 90;
const RRF = 60;

/** The text that represents a passage: its page, its heading, then the passage. */
export function embedInput(chunk) {
  return `${[chunk.title, chunk.heading].filter(Boolean).join(': ')}\n${plain(chunk.text)}`.slice(0, 1600);
}

/** Unit-length vectors packed as one Int8Array: a quarter of the size of floats, with almost the same ranking. */
export function pack(vectors) {
  const dim = vectors[0].length;
  const data = new Int8Array(vectors.length * dim);
  vectors.forEach((v, i) => {
    let norm = 0;
    for (const x of v) norm += x * x;
    norm = Math.sqrt(norm) || 1;
    for (let j = 0; j < dim; j++) data[i * dim + j] = Math.round((v[j] / norm) * 127);
  });
  return { dim, n: vectors.length, data };
}

export async function buildStore(chunks, embed) {
  const vectors = [];
  for (let i = 0; i < chunks.length; i += BATCH) {
    const out = await embed(chunks.slice(i, i + BATCH).map(embedInput));
    if (!Array.isArray(out) || out.length !== Math.min(BATCH, chunks.length - i)) throw new Error('embedding batch size mismatch');
    vectors.push(...out);
  }
  return pack(vectors);
}

export function encodeStore(store) {
  const bytes = new Uint8Array(store.data.buffer, store.data.byteOffset, store.data.byteLength);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return `${store.dim}:${btoa(bin)}`;
}

/** Returns null when the saved vectors do not match the current index. */
export function decodeStore(text, n) {
  const at = text.indexOf(':');
  const dim = Number(text.slice(0, at));
  if (!dim) return null;
  const bin = atob(text.slice(at + 1));
  if (bin.length !== n * dim) return null;
  const data = new Int8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = (bin.charCodeAt(i) << 24) >> 24;
  return { dim, n, data };
}

/** The `top` passages closest in meaning to the question vector, best first. */
export function nearest(vector, store, top = 50) {
  if (vector.length !== store.dim) return [];
  const scored = [];
  for (let i = 0; i < store.n; i++) {
    let dot = 0;
    const off = i * store.dim;
    for (let j = 0; j < store.dim; j++) dot += vector[j] * store.data[off + j];
    scored.push({ i, sim: dot });
  }
  return scored.sort((a, b) => b.sim - a.sim).slice(0, top);
}

/**
 * Keyword and meaning rankings merged with reciprocal rank fusion: a passage
 * scores 1 / (60 + rank) in each list it appears in. Whether the site can
 * answer at all is still decided by keyword coverage, so off-topic questions
 * are turned away exactly as before.
 */
export function hybridSearch(index, query, vector, store, { k = 8, perUrl = 2, depth = 50 } = {}) {
  const base = search(index, query, { k, perUrl });
  const score = new Map();
  const add = (id, rank) => score.set(id, (score.get(id) || 0) + 1 / (RRF + rank + 1));
  search(index, query, { k: depth, perUrl: depth }).results.forEach((r, rank) => add(r.id, rank));
  nearest(vector, store, depth).forEach((s, rank) => add(s.i, rank));
  const results = [];
  const seen = new Map();
  for (const [id, s] of [...score].sort((a, b) => b[1] - a[1])) {
    const c = index.chunks[id];
    const count = seen.get(c.url) || 0;
    if (count >= perUrl) continue;
    seen.set(c.url, count + 1);
    results.push({ ...c, score: s });
    if (results.length >= k) break;
  }
  return { results, coverage: base.coverage };
}
