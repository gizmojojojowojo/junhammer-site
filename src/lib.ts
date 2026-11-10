import { getCollection, type CollectionEntry } from 'astro:content';

export const TOPICS = {
  AI: { slug: 'ai', label: 'AI', blurb: 'Building with LLMs and agents, and what AI changes for marketing teams.' },
  AEO: { slug: 'aeo', label: 'AEO & AI search', blurb: 'How ChatGPT, Perplexity, Gemini and AI Overviews choose what to cite, and how to become a source.' },
  SEO: { slug: 'seo', label: 'SEO', blurb: 'Technical SEO, search intent, semantic search and the fundamentals that still decide rankings.' },
  'Healthcare AEO': { slug: 'healthcare', label: 'Healthcare search', blurb: 'AEO and SEO for health systems, clinics and regulated content.' },
} as const;
export type Topic = keyof typeof TOPICS;

export async function getPosts() {
  const posts = await getCollection('blog', ({ data }) => !data.draft);
  return posts.sort((a, b) => +(b.data.updated ?? b.data.date) - +(a.data.updated ?? a.data.date));
}
export async function getWork() {
  const items = await getCollection('work', ({ data }) => !data.draft);
  return items.sort((a, b) => a.data.order - b.data.order);
}
export async function getServices() {
  const items = await getCollection('services');
  return items.sort((a, b) => a.data.order - b.data.order);
}
export const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
export const readMins = (body = '') => Math.max(1, Math.round(body.split(/\s+/).length / 230));
export type Post = CollectionEntry<'blog'>;
