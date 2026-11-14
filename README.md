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
- `AI` (optional Workers AI binding): turns on search by meaning. Passages are embedded once per content change and stored in `ASK_KV`; the first question after a deploy starts that build and is answered by keyword search. Set `ASK_RETRIEVAL` to `keyword` to switch it off.
- `ASK_KV` (optional KV namespace binding): turns on limits of 20 questions per visitor per hour and 400 per day site-wide. Change them with `ASK_HOURLY_LIMIT` and `ASK_DAILY_LIMIT`.

Set a monthly spend limit on the API key in the Anthropic Console as the hard cost cap.

Tests and evals:

- `npm test`: unit tests for chunking, retrieval, the prompt, the stream relay and both endpoints (no network, no key).
- `npm run eval:ask`: retrieval quality on `evals/ask/questions.json`. Fails if the right page reaches the model for fewer than 90% of questions. Needs PyYAML unless the site has been built.
- `ANTHROPIC_API_KEY=... npm run eval:answers`: calls the model for every test question and checks citations, links and length.

If `/ask/` shows a list of pages instead of a written answer, open the browser's network tab and read `reason` in the `/api/ask` response: `no_key` means the secret is missing from that environment or the deployment predates it, and `model_401` or `model_404` means the key or model ID was rejected.

- `node scripts/ask/eval_report.mjs`: runs both and writes `src/data/ask-evals.json`, which `/ask/evals/` displays.

**Published results.** `.github/workflows/ask-evals.yml` runs the tests and the report on every push to `main` and commits the results, so `/ask/evals/` always shows the latest run. Answer grading needs an `ANTHROPIC_API_KEY` repository secret (GitHub > Settings > Secrets and variables > Actions). Without it the workflow still publishes retrieval results.

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

## Break my AI (arcade)

`/arcade/` is a prompt injection game. An AI guard holds a secret word behind each of five doors, and each door adds a defense: instructions only, a briefing on common tricks, an output filter, an input screener (a second model call), then all of them plus the patch log.

- `src/arcade/game.mjs`: the rules. Secret words are derived per player, door and life from a private salt, so they are not in this repository.
- `src/arcade/patches.mjs`: the patch log. Door 5 is told about every entry. To patch a new attack, add an entry and a test.
- `functions/api/arcade.js`: keeps each game on the server in `ASK_KV`, enforces limits and calls the model. Conversations that open door 4 or 5 are saved under `arcade:win:*` for 90 days for review.
- Limits: `ARCADE_DAILY_LIMIT` (default 300 messages a day, whole site) and `ARCADE_GAMES_PER_DAY` (default 3 per visitor). Each message writes to KV twice, so the daily limit also keeps the game inside the KV free tier of 1,000 writes a day.
- `/tools/` lists every tool on the site.

## The budget agent

A long-running agent with a goal, a dollar budget and a public diary at `/agent/`.

- `.github/workflows/agent.yml` runs it once a day. `scripts/agent/run.mjs` is the loop: measure, decide, act, journal. `scripts/agent/lib.mjs` holds the rules and arithmetic, unit tested.
- **Measure.** Each target question is asked through the Messages API with the web search tool, and the answer's citations say whether this site was cited, where it ranked in the results, and who was cited instead.
- **Decide.** The evidence, the earlier journal and three tools (`read_page`, `write_file`, `finish_day`) go to the model, which takes one action a day.
- **Guards.** `write_file` accepts only `src/content/{blog,services,work,pages}/*.md`, at most two files a day, 60 KB each, and rejects em dashes. The agent cannot touch code, settings, the workflow or the measurement.
- **Review.** Content goes to a branch and a pull request. Only `src/data/agent.json`, the journal and measurements, is committed to `main` automatically.
- **Budget.** Costs are computed per call from `PRICES` in `lib.mjs` and `$10 per 1,000` web searches, accumulated into `spentUsd`. A run stops at `CONFIG.dailyCapUsd`, and the campaign stops when the budget or day count runs out. Update `PRICES` when model pricing changes.
- Needs the `ANTHROPIC_API_KEY` repository secret. `node scripts/agent/run.mjs --dry` runs a day and writes nothing.

## Prompt evolution

An optimization loop over the Ask feature's system prompt, published at `/ask/prompt-evolution/`.

- `node scripts/optimize/run.mjs [--generations N] [--dry]`. Needs `ANTHROPIC_API_KEY`.
- The question set is split by a hash of each question into a training set and a holdout. The split is stable, so adding a question does not reshuffle the rest, and the holdout is never used to choose a prompt.
- Each generation: the writer model sees the best prompts so far and the answers that failed, writes four variations, and each is scored on the training questions with `src/ask/grade.mjs`, the same rules the evals use. Retrieval is identical for every candidate, so only the prompt varies.
- At the end the winner and the baseline are both measured on the holdout. `verdict()` in `scripts/optimize/lib.mjs` states plainly whether the gain transferred.
- Nothing is adopted automatically. If the holdout supports the winner, paste its prompt into `SYSTEM` in `src/ask/answer.mjs` by hand and set `winner.adopted` to true.
- Cost: roughly `(variants + 1) x generations x training questions` answer calls, plus the holdout. Start with `--generations 1` to see the scale.

## Career agent (private, local only)

`node scripts/career/run.mjs [--dry] [--limit 8]` reads public company job boards, keeps the postings worth reading, matches each one's requirements against evidence in this site's case studies and service pages, and writes a report to `private/`, which git ignores.

It runs locally and is deliberately not in CI, because this repository is public and the report is not.

- `scripts/career/sources.json`: which boards to read and how to filter. Edit this first. The slugs are a starting point; the script names any board that does not respond.
- Filtering happens before any model call, so a run only pays for postings that could plausibly fit.
- A requirement counts as a strong match only when it cites a real page from the site. A claim with no page behind it is downgraded, so the report cannot talk itself into a fit.
- The useful output is the top section: requirements that keep coming up with nothing in the portfolio behind them, ranked by how many employers asked. That is the list of what to build next.
- Every draft note is a starting point to edit, not something to send as it stands.

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
