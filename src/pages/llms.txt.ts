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
    `${site.name} (${site.legalName}) is an AI engineer and AEO/SEO consultant in ${site.location}. He builds LLM tools and agents, and runs answer engine optimization and technical SEO programs, with a decade of agency work for enterprise healthcare, e-commerce and B2B clients.`,
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
