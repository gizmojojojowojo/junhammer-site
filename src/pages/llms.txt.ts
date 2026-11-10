import type { APIRoute } from 'astro';
import { getPosts, getServices, getWork } from '../lib';
import site from '../data/site.json';

export const GET: APIRoute = async () => {
  const [services, work, posts] = await Promise.all([getServices(), getWork(), getPosts()]);
  const u = (p: string) => `https://junhammer.com${p}`;
  const lines = [
    `# ${site.name}`,
    '',
    `> ${site.description}`,
    '',
    `${site.name} (${site.legalName}) is an AI solutions builder and search strategist in ${site.location}. He founded LandmAIn, an AI land intelligence platform for data center and energy site selection, works as AI Search Strategist at Whole Whale building agentic AI tools, and led AEO and technical SEO for enterprise health systems at Merge. He is a US Army veteran and former geospatial intelligence analyst.`,
    '',
    '## Services',
    ...services.map((s) => `- [${s.data.title}](${u(`/services/${s.id}/`)}): ${s.data.summary}`),
    '',
    '## Case studies',
    ...work.map((w) => `- [${w.data.title}](${u(`/work/${w.id}/`)}): ${w.data.summary}`),
    '',
    '## Guides',
    ...posts.filter((p) => p.data.pillar).map((p) => `- [${p.data.title}](${u(`/blog/${p.id}/`)}): ${p.data.description ?? ''}`),
    `- [The Complete AEO Playbook](${u('/the-complete-aeo-playbook/')})`,
    '',
    '## Articles',
    ...posts.filter((p) => !p.data.pillar).map((p) => `- [${p.data.title}](${u(`/blog/${p.id}/`)})`),
    '',
    '## About',
    `- [About](${u('/about/')})`,
    `- [Resume](${u('/resume/')})`,
    `- [Contact](${u('/contact/')}): ${site.email}`,
    '',
  ];
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
