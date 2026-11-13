// Builds the retrieval index for /ask/ at build time. The Pages Function in
// functions/api/ask.js loads this file; scripts/ask/export_docs.py mirrors it for evals.
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPosts, getServices, getWork } from '../lib';
import site from '../data/site.json';
import { buildChunks, extraDocs } from '../ask/chunk.mjs';

export const GET: APIRoute = async () => {
  const [posts, services, work, pages] = await Promise.all([getPosts(), getServices(), getWork(), getCollection('pages')]);
  const docs = [
    ...posts.map((p) => ({
      type: 'article',
      url: `/blog/${p.id}/`,
      title: p.data.title,
      description: p.data.description ?? '',
      body: p.body ?? '',
      faqs: p.data.faqs,
    })),
    ...services.map((s) => ({
      type: 'service',
      url: `/services/${s.id}/`,
      title: s.data.title,
      description: s.data.description ?? '',
      summary: s.data.summary,
      body: s.body ?? '',
      faqs: s.data.faqs,
      lists: { 'What you get': s.data.offers, Proof: s.data.proof },
    })),
    ...work.map((w) => ({
      type: 'case study',
      url: `/work/${w.id}/`,
      title: w.data.title,
      description: w.data.description ?? '',
      summary: w.data.summary,
      body: w.body ?? '',
      lists: { Results: w.data.results.map((r) => `${r.value} ${r.label}`) },
    })),
    ...pages.map((p) => ({
      type: 'page',
      url: `/${p.id}/`,
      title: p.data.title,
      description: p.data.description ?? '',
      body: p.body ?? '',
      faqs: p.data.faqs,
    })),
    ...extraDocs(site),
  ];
  const index = { version: 1, chunks: buildChunks(docs) };
  return new Response(JSON.stringify(index), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
