# junhammer.com

Personal site for Joe Unhammer: AI consulting, AI engineering, AEO and SEO.
Built with [Astro](https://astro.build), hosted on Cloudflare Pages, edited with [Pages CMS](https://pagescms.org).

## Editing without code

1. Go to **https://app.pagescms.org**, sign in with GitHub and open `junhammer-site`.
2. Edit blog posts, services, case studies, pages, the **Menu** and **Site settings** in the sidebar.
3. Click **Save**. That commits to GitHub, and Cloudflare rebuilds the site in about a minute.

- **Menu and services dropdown:** *Menu* → *Services* → *Dropdown items*.
- **New service page:** add it under *Services*, then add a dropdown item that links to `/services/<file-name>/`.
- **Hide something without deleting it:** tick *Draft*.
- **Changing a URL slug** changes the address. Add the old URL to `data/url_inventory.csv` as a REDIRECT and run `python3 scripts/build_redirects.py`.

## Editing with Python

All content is plain Markdown with YAML frontmatter:

| What | Where |
|---|---|
| Blog posts | `src/content/blog/*.md` |
| Service pages | `src/content/services/*.md` |
| Case studies | `src/content/work/*.md` |
| About, resume, FAQ, AEO Playbook | `src/content/pages/*.md` |
| Menu | `src/data/navigation.json` |
| Name, email, contact form | `src/data/site.json` |
| Colors and fonts | `src/styles/global.css` (top of file) |

Useful scripts:

- `python3 scripts/check_site.py`: validates frontmatter, title and description lengths, and every internal link. Run before pushing.
- `python3 scripts/build_redirects.py`: regenerates `public/_redirects` (301s) and `functions/gone.json` (410s) from `data/url_inventory.csv`.
- `python3 scripts/gsc/gsc_pull.py`: pulls 16 months of Search Console data (needs `client_secret.json` next to it; never commit it).

## Cloudflare Pages settings

- Framework preset: **Astro**
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable: `NODE_VERSION` = `22`

`functions/_middleware.js` returns **410 Gone** for retired URLs. `public/_headers` sets security headers.

## Contact form

The form appears when `formEndpoint` is set in *Site settings*. Free option: create an access key at web3forms.com, then set `formEndpoint` to `https://api.web3forms.com/submit` and `formAccessKey` to your key. Until then, the contact page shows email only.

## Content backlog from the migration

**Merge into the pillar (redirects are already live):**
- User intent guide ← "why user intent is the #1 ranking factor" (keep its "dominant user intent" section; it ranks at position 10) and "why is the user searching for this"
- What is semantic search ← "semantic search revolutionizing…" (ranks at position 9; carry its intro over) and the unpublished NLP draft
- AEO tools guide ← "10 important AI tools" draft
- Definitive AEO guide ← "future of AI SEO"
- What is AEO and GEO ← "what is AEO: a practical guide"
- SEO vs AEO ← "traditional SEO metrics don't tell the full story"
- E-E-A-T signals for AI ← "7 ways to optimize for E-E-A-T"
- Technical SEO foundation for GEO ← "6 critical technical SEO factors"
- SEO is dead, long live SEO ← "top 5 SEO trends 2025" and "Google algorithm updates"
- What is SEO ← "comprehensive guide to SEO" and "why SEO matters"

**Refresh (high impressions, poor position):** the user intent, AEO tools, semantic search and definitive AEO guides; AEO statistics (update to 2026); how AI search engines decide what to cite; human-AI content collaboration; keyword research; the AEO Playbook (expand past 520 words).

**Write:** posts for the AI topic; the AI agents in marketing draft (`draft: true`); the Whole Whale and Merge healthcare chat case studies (`draft: true`).
