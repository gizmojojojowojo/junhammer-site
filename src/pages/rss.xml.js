import rss from '@astrojs/rss';
import { getPosts } from '../lib';
export async function GET(context) {
  const posts = await getPosts();
  return rss({
    title: 'Joe Unhammer: Writing',
    description: 'AI engineering, answer engine optimization and SEO.',
    site: context.site,
    items: posts.map((p) => ({ title: p.data.title, description: p.data.description, pubDate: p.data.date, link: `/blog/${p.id}/` })),
  });
}
