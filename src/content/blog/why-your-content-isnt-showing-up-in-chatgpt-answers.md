---
title: "Why Isn't My Business Showing Up in ChatGPT? A 10-Point Diagnosis"
seoTitle: "Why Isn't My Business Showing Up in ChatGPT? 10 Checks"
description: "Business missing from ChatGPT answers? Run these 10 checks in order: crawler access, indexing, the page itself and outside mentions, with a test for each."
slug: "why-your-content-isnt-showing-up-in-chatgpt-answers"
date: "2026-03-13"
updated: "2026-11-18"
topic: "AEO"
pillar: false
draft: false
image: "/images/wp/2024/08/openaigpt-scaled.webp"
faqs:
  - q: "Why doesn't ChatGPT mention my business?"
    a: "Usually for one of three reasons: ChatGPT cannot reach your site, it cannot find a page that answers the question, or other sources look like better answers. Checking in that order finds the cause fastest."
  - q: "Does blocking GPTBot remove my site from ChatGPT search?"
    a: "No. OpenAI uses GPTBot for model training and OAI-SearchBot for ChatGPT search, and each setting is independent. Blocking OAI-SearchBot is what keeps a site out of ChatGPT search answers."
  - q: "How long does ChatGPT take to notice a robots.txt change?"
    a: "OpenAI says it can take about 24 hours from a robots.txt update for its search systems to adjust. Changes to page content show up after the page is crawled again."
  - q: "Does ChatGPT use Google or Bing to search?"
    a: "OpenAI says ChatGPT search sometimes partners with third-party search providers and sends them rewritten queries. Its help page points to Microsoft's privacy statement for those providers, so check that your pages are indexed in Bing as well as Google."
  - q: "Why does ChatGPT give a different answer every time I ask?"
    a: "Recommendation lists vary from run to run. In SparkToro's January 2026 study, there was less than a 1 in 100 chance that ChatGPT would return the same list of brands twice in 100 runs. Track how often you appear across many runs instead of judging one answer."
  - q: "How do I check whether ChatGPT cites my website?"
    a: "Write 10 to 20 questions your buyers ask, run each one in ChatGPT with search turned on several times, and record whether your site is cited, mentioned or absent. Repeat the same set each month so you can see change."
---
**Key takeaways**

- When your business is missing from ChatGPT, the cause sits in one of three layers: ChatGPT cannot reach your site, cannot find the right page, or does not choose you over other sources. Check them in that order.
- ChatGPT search uses a crawler called OAI-SearchBot. [OpenAI's crawler documentation](https://developers.openai.com/api/docs/bots) says sites that opt out of OAI-SearchBot will not be shown in ChatGPT search answers. Blocking GPTBot only affects model training.
- Security tools can block AI crawlers without you noticing. [Cloudflare reported in July 2025](https://www.cloudflare.com/press/press-releases/2025/cloudflare-just-changed-how-ai-crawlers-scrape-the-internet-at-large/) that more than one million customers had turned on its one-click AI crawler block.
- In [Vercel's December 2024 analysis](https://vercel.com/blog/the-rise-of-the-ai-crawler), none of the major AI crawlers, including OpenAI's, rendered JavaScript. Content that loads only in the browser is invisible to them.
- Mentions on other sites matter. In [Ahrefs' 2025 study of 75,000 brands](https://ahrefs.com/blog/ai-overview-brand-correlation/), brand web mentions had the strongest correlation (0.664) with brand visibility in Google's AI Overviews.
- One test proves little. [SparkToro's January 2026 research](https://sparktoro.com/blog/new-research-ais-are-highly-inconsistent-when-recommending-brands-or-products-marketers-should-take-care-when-tracking-ai-visibility/) found less than a 1 in 100 chance that ChatGPT gives the same list of brands twice in 100 runs.

If your business is not showing up in ChatGPT, the fix depends on where the chain breaks. ChatGPT has to reach your site, find a page that answers the question, and then pick that page over other sources. A problem at any step leaves you out of the answer. This guide gives you 10 checks in the order to run them, with a quick test and the usual fix for each.

## Why isn't my business showing up in ChatGPT?

Your business is missing from ChatGPT for one of three reasons: ChatGPT cannot reach your site, it cannot find a page that answers the question, or it finds you and picks other sources. Each reason has different fixes, so diagnose before you change anything.

| Layer | Checks | What it means |
| --- | --- | --- |
| Reach | 1 to 4 | ChatGPT never sees your pages |
| Find | 5 and 6 | ChatGPT can reach you but has no page that matches the question |
| Choose | 7 to 10 | ChatGPT sees your page and cites someone else |

Start at the top. Rewriting content does nothing if a firewall blocks the crawler.

## How do I check whether ChatGPT mentions my business?

Write 10 to 20 questions your buyers ask, run each one in ChatGPT with search turned on several times, and record whether your site is cited, mentioned or absent. One screenshot is a poor test, because answers change from run to run.

SparkToro and Gumshoe had 600 volunteers run 12 prompts through ChatGPT, Claude and Google's AI a combined 2,961 times. They found [less than a 1 in 100 chance](https://sparktoro.com/blog/new-research-ais-are-highly-inconsistent-when-recommending-brands-or-products-marketers-should-take-care-when-tracking-ai-visibility/) that ChatGPT or Google's AI would return the same list of brands in any two responses out of 100. The same research found that how often a brand appears across many runs is a more useful measure.

Use a mix of question types:

- **Category questions:** "Who are the best roofing companies in Parker, CO?"
- **Problem questions:** "How do I fix a leaking skylight?"
- **Comparison questions:** "Is a metal roof worth it in Colorado?"
- **Brand questions:** "What does [your business] do?"

Record two things for each answer: whether your site appears in the sources, and whether the answer names you. My [AI visibility checker](/ai-visibility-checker/) runs this kind of test for you and shows who gets cited instead.

## Can ChatGPT reach your site?

### 1. Did ChatGPT search the web at all?

Check whether the answer shows sources. If it has no citations, ChatGPT likely answered from what its model already knows, and a new or small business may simply not be in that knowledge.

[OpenAI's help page on web search](https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt) says ChatGPT may search the web automatically when a question would benefit from current information. You can also start a search yourself from the tools menu.

**Test:** run the same question with Search selected. **Fix:** if you appear with search on and vanish with it off, your site is reachable. The long-term work is checks 8 and 9, which build the outside mentions that shape what models know.

### 2. Is OAI-SearchBot allowed in your robots.txt?

Open yourdomain.com/robots.txt and look for rules that block OAI-SearchBot, or a `Disallow: /` under `User-agent: *`. Either one can keep you out of ChatGPT search.

OpenAI runs separate crawlers for separate jobs. Its [crawler documentation](https://developers.openai.com/api/docs/bots) says OAI-SearchBot is for search and GPTBot is for training, and each setting is independent of the others. Sites that opt out of OAI-SearchBot will not be shown in ChatGPT search answers, though they can still appear as navigational links. OpenAI recommends allowing OAI-SearchBot and its published IP ranges, and says robots.txt changes can take about 24 hours to reach its search systems.

**Fix:** allow OAI-SearchBot explicitly. You can still block GPTBot if you do not want your content used for training.

### 3. Is a firewall or CDN setting blocking AI crawlers?

Check your CDN, hosting and security plugin settings for AI bot blocking. A clean robots.txt does not help if the firewall turns the crawler away first.

Cloudflare introduced a one-click option to block AI crawlers in September 2024, and its [July 2025 press release](https://www.cloudflare.com/press/press-releases/2025/cloudflare-just-changed-how-ai-crawlers-scrape-the-internet-at-large/) said more than one million customers had chosen it. Since then, every new domain that signs up with Cloudflare is asked whether to allow AI crawlers.

**Test:** look in your server or CDN logs for requests from OAI-SearchBot and the status codes they received. **Fix:** allow the search crawlers you want, and keep blocking the ones you do not.

### 4. Is your content in the HTML, or does it load with JavaScript?

View the page source (not the inspector) and search for a sentence from your main content. If the text is missing from the source, AI crawlers probably cannot read it.

[Vercel and MERJ's December 2024 analysis](https://vercel.com/blog/the-rise-of-the-ai-crawler) found that none of the major AI crawlers rendered JavaScript, including OpenAI's OAI-SearchBot, ChatGPT-User and GPTBot. Vercel's advice is to server-render critical content, including main text, titles, descriptions and navigation.

**Fix:** use server-side rendering or static generation for any page you want cited. Interactive extras such as chat widgets can stay client-side. If your site runs on a JavaScript framework, this is part of the [technical SEO](/services/technical-seo/) work I do.

## Can ChatGPT find the right page?

### 5. Are your pages in the search indexes ChatGPT draws on?

Confirm your key pages are indexed in both Google and Bing. ChatGPT search draws on search results, so a page that no search provider has indexed is hard for it to find.

OpenAI's [web search help page](https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt) says ChatGPT search sometimes partners with other search providers, rewriting your question into targeted queries it sends to them. It points readers to Microsoft's privacy statement for how those providers handle queries.

**Test:** inspect your priority URLs in Google Search Console and Bing Webmaster Tools. **Fix:** submit sitemaps to both, fix pages marked as excluded, and remove accidental `noindex` tags. My guide to [the technical SEO foundation GEO needs](/blog/the-technical-seo-foundation-every-geo-strategy-needs-to-succeed/) covers the full list.

### 6. Do you have a page that answers the question being asked?

Match each test question to one page on your site. If you cannot point to a page that answers it, ChatGPT cannot either.

Common gaps:

- A single "Services" page with no page for each service.
- No page naming the towns or region you serve.
- No answers to cost, timeline or comparison questions buyers ask.
- Key facts that exist only in a PDF or an image.

**Fix:** build pages for the questions where you want to appear. Use the buyer's wording in the heading.

## Will ChatGPT choose you over other sources?

### 7. Does each page answer the question in its first sentences?

Read the first two sentences under each heading. If they do not answer the question in the heading, the page is harder to quote.

AI answers are built from passages. A section that opens with a direct, self-contained answer gives the model something it can lift. A section that builds up to the point over three paragraphs gives it less.

**Fix:** phrase headings as the questions people ask, and open each section with a direct answer of about 40 words. I explain the method in [the 40-word rule for AI citations](/blog/the-40-word-rule-how-to-structure-paragraphs-for-ai-citations-in-2026/).

### 8. Do other sites mention your business?

Search for your business name on other sites: directories, review platforms, local news, industry associations and "best of" lists. If few of them mention you, AI systems have little evidence to work from.

[Ahrefs studied 75,000 brands](https://ahrefs.com/blog/ai-overview-brand-correlation/) in 2025 and found brand web mentions had the strongest correlation (0.664) with brand visibility in Google's AI Overviews. Backlinks correlated far more weakly (0.218). Ahrefs notes that correlation does not prove causation, and the study measured AI Overviews, so read it as a directional signal for ChatGPT.

**Fix:** look at which sites ChatGPT cites for your test questions. Get listed accurately on the directories and lists that keep appearing, and earn coverage in the publications your buyers read.

### 9. Are your business details consistent everywhere?

Compare your name, address, phone, service area and service descriptions across your site, Google Business Profile, Bing Places and major directories. Conflicting details make it harder for AI systems to connect the mentions to one business.

For local questions, OpenAI's [help page](https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt) says ChatGPT uses approximate location and may share it with third-party providers of local information, such as nearby business listings. Those listings need to be complete and correct.

**Fix:** pick one version of your details and use it everywhere. Add Organization or LocalBusiness schema that matches.

### 10. Does each page show who wrote it and where its facts come from?

Check your key pages for a named author or business owner, a visible updated date, and links to sources for any numbers. Pages without them give an AI system less reason to trust the content.

**Fix:** add bylines with a short bio, show updated dates, and cite sources next to claims. Mark it up with Article and Person schema. My guide to [E-E-A-T signals AI search engines recognize](/blog/how-to-build-e-e-a-t-signals-that-ai-search-engines-actually-recognize/) goes step by step.

## Which fixes should you make first?

Fix the reach layer first, because it blocks everything else, then the find layer, then the choose layer.

| # | Check | Quick test | Usual fix |
| --- | --- | --- | --- |
| 1 | Search triggered | Rerun with Search on | Build outside mentions |
| 2 | OAI-SearchBot allowed | Read robots.txt | Allow OAI-SearchBot |
| 3 | No firewall block | Check CDN logs and bot settings | Allow search crawlers |
| 4 | Content in HTML | View page source | Server-render key content |
| 5 | Indexed | Search Console and Bing Webmaster Tools | Sitemaps, remove stray noindex |
| 6 | Matching page exists | Map questions to pages | Build missing pages |
| 7 | Answer comes first | Read first two sentences | Rewrite section openings |
| 8 | Outside mentions | Search your name off-site | Listings and coverage |
| 9 | Consistent details | Compare listings | One version everywhere, plus schema |
| 10 | Trust signals | Look for author, date, sources | Bylines, dates, citations |

Then re-run the same question set each month. You are looking for a rising share of runs where you appear. For how AI systems weigh sources once they find them, see [how AI search engines decide what to cite](/blog/how-ai-search-engines-decide-what-to-cite-and-how-to-get-on-the-list/).

## How I help

I run this diagnosis as part of my [answer engine optimization](/services/answer-engine-optimization/) work. The work includes an AI visibility audit: where you are and are not cited today, plus a review of AI crawler access, structured data and entity signals. You get a prioritized fix list, and I can make the technical fixes or direct your team on the content.

I have led AEO and technical SEO for enterprise hospital systems and now lead AEO for nonprofit clients. I also build AI tools, including the [AI search on this site](/work/site-ai-search/), which answers from its own pages and cites every source.

Want a quick read first? Run a page through my [AEO audit](/audit/), which checks crawler access, answer structure, schema and trust signals. When you want the full diagnosis, [get in touch](/contact/).

## Frequently asked questions

**Why doesn't ChatGPT mention my business?**
Usually for one of three reasons: ChatGPT cannot reach your site, it cannot find a page that answers the question, or other sources look like better answers. Checking in that order finds the cause fastest.

**Does blocking GPTBot remove my site from ChatGPT search?**
No. OpenAI uses GPTBot for model training and OAI-SearchBot for ChatGPT search, and each setting is independent. Blocking OAI-SearchBot is what keeps a site out of ChatGPT search answers.

**How long does ChatGPT take to notice a robots.txt change?**
OpenAI says it can take about 24 hours from a robots.txt update for its search systems to adjust. Changes to page content show up after the page is crawled again.

**Does ChatGPT use Google or Bing to search?**
OpenAI says ChatGPT search sometimes partners with third-party search providers and sends them rewritten queries. Its help page points to Microsoft's privacy statement for those providers, so check that your pages are indexed in Bing as well as Google.

**Why does ChatGPT give a different answer every time I ask?**
Recommendation lists vary from run to run. In SparkToro's January 2026 study, there was less than a 1 in 100 chance that ChatGPT would return the same list of brands twice in 100 runs. Track how often you appear across many runs instead of judging one answer.

**How do I check whether ChatGPT cites my website?**
Write 10 to 20 questions your buyers ask, run each one in ChatGPT with search turned on several times, and record whether your site is cited, mentioned or absent. Repeat the same set each month so you can see change.

## Sources

- OpenAI. [Overview of OpenAI Crawlers](https://developers.openai.com/api/docs/bots). Accessed November 18, 2026.
- OpenAI Help Center. [Searching the web with ChatGPT](https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt). Accessed November 18, 2026.
- Cloudflare. [Cloudflare Just Changed How AI Crawlers Scrape the Internet-at-Large](https://www.cloudflare.com/press/press-releases/2025/cloudflare-just-changed-how-ai-crawlers-scrape-the-internet-at-large/). July 1, 2025.
- Vercel. [The rise of the AI crawler](https://vercel.com/blog/the-rise-of-the-ai-crawler). December 17, 2024.
- Ahrefs (Louise Linehan). [An Analysis of AI Overview Brand Visibility Factors (75K Brands Studied)](https://ahrefs.com/blog/ai-overview-brand-correlation/). May 26, 2025.
- SparkToro (Rand Fishkin). [NEW Research: AIs are highly inconsistent when recommending brands or products](https://sparktoro.com/blog/new-research-ais-are-highly-inconsistent-when-recommending-brands-or-products-marketers-should-take-care-when-tracking-ai-visibility/). January 27, 2026.
