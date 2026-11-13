# junhammer.com

Personal site for Joe Unhammer: AI consulting, AI engineering, AEO and SEO.
Built with [Astro](https://astro.build), hosted on Cloudflare Pages, edited with [Pages CMS](https://pagescms.org).

## Editing without code

1. Go to **https://app.pagescms.org**, sign in with GitHub and open `junhammer-site`.
2. Edit blog posts, services, case studies, pages, the **Menu** and **Site settings** in the sidebar.
3. Click **Save**. That commits to GitHub, and Cloudflare rebuilds the site in about a minute.

- **Home page:** *Home page* in the sidebar. In the headline, ==double equals== highlights a phrase and [1] links it to source 1. The case studies shown come from *Case studies* (lowest *Order* first).
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
| Home page text | `src/data/home.json` |
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

## Ask this site (AI answers with sources)

`/ask/` answers visitor questions from this site's own content and links every source.

How it works:

1. **Index.** At build time `src/pages/ask-index.json.ts` splits every post, service, case study and page into passages by heading (`src/ask/chunk.mjs`).
2. **Retrieve.** `functions/api/ask.js` scores passages against the question with BM25 (`src/ask/retrieve.mjs`). If nothing matches, it says so and never calls the model.
3. **Answer.** The top eight passages go to Claude with instructions to answer only from them and cite each claim. The answer streams back to the page.
4. **Check.** The page turns `[1]` into a link to the source and refuses to render any link that was not in the retrieved passages.

Setup in Cloudflare Pages (Settings > Variables and Secrets, for both Production and Preview):

- `ANTHROPIC_API_KEY` (secret): required for AI answers. Without it, `/ask/` still works and returns the best-matching pages.
- `ASK_MODEL` (optional): model ID. Defaults to the value of `DEFAULT_MODEL` in `functions/api/ask.js`.
- `ASK_KV` (optional KV namespace binding): turns on limits of 20 questions per visitor per hour and 400 per day site-wide. Change them with `ASK_HOURLY_LIMIT` and `ASK_DAILY_LIMIT`.

Set a monthly spend limit on the API key in the Anthropic Console as the hard cost cap.

Tests and evals:

- `npm test`: unit tests for chunking, retrieval, the prompt, the stream relay and both endpoints (no network, no key).
- `npm run eval:ask`: retrieval quality on `evals/ask/questions.json`. Fails if the right page reaches the model for fewer than 90% of questions. Needs PyYAML unless the site has been built.
- `ANTHROPIC_API_KEY=... npm run eval:answers`: calls the model for every test question and checks citations, links and length.

If `/ask/` shows a list of pages instead of a written answer, open the browser's network tab and read `reason` in the `/api/ask` response: `no_key` means the secret is missing from that environment or the deployment predates it, and `model_401` or `model_404` means the key or model ID was rejected.

Add a question to `evals/ask/questions.json` whenever a real visitor question gets a poor answer.

## AEO audit (AI agent)

`/audit/` takes a URL and returns a scored report on how ready the page is to be cited by AI search.

How it works:

1. **Guard.** `src/audit/guard.mjs` accepts only public http(s) addresses on standard ports and refuses IP addresses, local names and redirects to them. Every fetch has a time limit and a size cap.
2. **Agent loop.** `src/audit/agent.mjs` gives Claude a goal and six tools (fetch a page, map headings, read a section, inspect schema, check trust signals, check robots.txt for AI crawlers). The model picks the next tool from what it has found so far. The loop stops at 8 turns and 3 page fetches, all on the audited site.
3. **Report.** The model finishes by calling `submit_report`. The code fixes the category list, clamps scores and computes the weighted total, so the page layout never depends on free-form model output.
4. **Stream.** `functions/api/audit.js` streams each step to the page as it runs.

Settings (same place as the Ask settings):

- `ANTHROPIC_API_KEY`: shared with `/ask/`.
- `AUDIT_MODEL` (optional): defaults to `DEFAULT_MODEL` in `functions/api/audit.js`.
- `ASK_KV` (optional, shared): makes the limits site-wide. Without it they are counted per server instance only.
- `AUDIT_HOURLY_LIMIT` (default 3 per visitor) and `AUDIT_DAILY_LIMIT` (default 60 site-wide).

`npm test` covers the URL guard, the HTML and robots.txt parsing, the loop limits and the endpoint with a scripted model (no network, no key).

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

**Write:** posts for the AI topic, and the AI agents in marketing draft (`draft: true`).
