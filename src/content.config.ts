import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Editors can leave optional fields blank; treat '' and null as "not set".
const blank = (v: unknown) => (v === '' || v === null ? undefined : v);
const optStr = z.preprocess(blank, z.string().optional());
const optDate = z.preprocess(blank, z.coerce.date().optional());
const strList = z.preprocess((v) => (v == null ? [] : v), z.array(z.string()));

const seo = {
  title: z.string(),
  seoTitle: optStr,
  description: z.preprocess(blank, z.string().max(200).optional()),
};

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    ...seo,
    date: z.coerce.date(),
    updated: optDate,
    topic: z.enum(['AI', 'AEO', 'SEO', 'Healthcare AEO']),
    pillar: z.boolean().default(false),
    draft: z.boolean().default(false),
    image: optStr,
    faqs: z.preprocess((v) => (v == null ? [] : v), z.array(z.object({ q: z.string(), a: z.string() }))),
  }),
});

const services = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/services' }),
  schema: z.object({
    ...seo,
    navLabel: z.string(),
    summary: z.string(),
    order: z.number().default(10),
    offers: strList,
    proof: strList,
    faqs: z.preprocess((v) => (v == null ? [] : v), z.array(z.object({ q: z.string(), a: z.string() }))),
    work: strList,
    topic: z.preprocess(blank, z.enum(['AI', 'AEO', 'SEO', 'Healthcare AEO']).optional()),
  }),
});

const work = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/work' }),
  schema: z.object({
    ...seo,
    client: z.string(),
    summary: z.string(),
    sector: optStr,
    year: z.preprocess((v) => (v === '' || v === null ? undefined : String(v)), z.string().optional()),
    link: optStr,
    results: z.preprocess((v) => (v == null ? [] : v), z.array(z.object({ value: z.coerce.string(), label: z.string() }))),
    services: strList,
    order: z.number().default(10),
    draft: z.boolean().default(false),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    ...seo,
    // Local landing pages: cities/areas served. Adds ProfessionalService schema.
    areaServed: strList,
    faqs: z.preprocess((v) => (v == null ? [] : v), z.array(z.object({ q: z.string(), a: z.string() }))),
    updated: optDate,
  }),
});

export const collections = { blog, services, work, pages };
