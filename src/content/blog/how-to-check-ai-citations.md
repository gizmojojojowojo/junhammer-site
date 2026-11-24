---
title: "How to Check AI Citations for Your Website"
seoTitle: "How to Check AI Citations for Your Website (Free + DIY)"
description: "How to check if ChatGPT, Perplexity and Google AI Overviews cite your website: a free manual method, what to track over time, and which tools help."
slug: "how-to-check-ai-citations"
date: "2026-11-24"
topic: "AEO"
pillar: false
draft: false
faqs:
  - q: "How do I check if ChatGPT cites my website?"
    a: "Turn on web search in ChatGPT, ask the questions your buyers ask, and open the sources for each answer. Log whether your URL appears. Repeat the same questions on a schedule."
  - q: "Does Google Search Console show AI Overview traffic?"
    a: "Yes, but not separately. Google counts AI Overviews and AI Mode inside the overall Web search data in the Performance report. There is no filter that isolates them."
  - q: "What is the difference between an AI citation and a mention?"
    a: "A citation links to your page as a source. A mention names your brand without a link. Track both, because the gap between them shows whether engines trust your pages as evidence."
  - q: "How often should I check AI citations?"
    a: "Every week or two, using the same question set. Citations change daily, so a single check is a snapshot. The trend across runs is what to report."
  - q: "Do I need a paid tool to track AI citations?"
    a: "No. A spreadsheet works for 10 to 20 questions. Paid platforms help when you track hundreds of prompts, several markets or competitor share over time."
  - q: "How many questions should I track?"
    a: "Start with 10 to 20 questions a buyer would ask before hiring you. Keep the list fixed so results stay comparable from run to run."
---

## Key takeaways

- To check AI citations by hand, write 10 to 20 questions your buyers ask, run each one in ChatGPT, Perplexity and Google, and record whether your site is linked, named, or absent.
- A citation is a link to your page inside an AI answer. A mention is your brand named without a link. Track them as two separate numbers.
- Google counts AI Overviews and AI Mode inside the normal Web search data in Search Console, with no separate filter ([Google Search Central](https://developers.google.com/search/docs/appearance/ai-features)).
- One check is a snapshot. Ahrefs found 50 to 83% of AI citations were gone the next day, and about 75% of those came back within 20 days ([Ahrefs, 2026](https://ahrefs.com/blog/how-stable-are-ai-citations/)).
- Repeat the same question set on a schedule and report the share of questions where you are cited.
- AI referral visits show up in GA4 as referrals from sources such as chatgpt.com and perplexity.ai. A custom channel group keeps them in one place ([Semrush](https://www.semrush.com/blog/ai-citations/)).
- Free tools and a spreadsheet are enough to start. Paid trackers earn their cost when you need hundreds of prompts or competitor share over time.

If you want to know how to check AI citations for your website, the answer is a repeatable test. You ask AI search engines the questions your buyers ask, then record which sources each answer links to. No tool shows every AI citation you get. Semrush says as much in its own guide ([Semrush](https://www.semrush.com/blog/ai-citations/)). So you build a small, fixed sample and measure it the same way every time.

This guide covers a manual method you can run this afternoon, what to track over time, and when a paid tool is worth it.

## What is an AI citation?

An AI citation is a link to your page that an AI engine shows as a source for its answer. HubSpot defines it as an AI engine "explicitly" referencing your website as a source ([HubSpot](https://blog.hubspot.com/marketing/ai-citation-tracking)).

Three outcomes matter for each question:

| Outcome | What you see | What it tells you |
| --- | --- | --- |
| Cited | A link to your page in the answer or its source list | The engine used your page as evidence |
| Mentioned | Your brand or name in the text, no link | The engine knows you, but used other pages as evidence |
| Absent | Neither | You are not part of this answer yet |

The gap between mentions and citations can be large. In a seven-site test across ChatGPT, Perplexity and Claude, the gap between visibility and citation ran from 25 to 95 points ([freeCodeCamp, 2026](https://www.freecodecamp.org/news/how-to-measure-your-ai-citation-rate-across-chatgpt-perplexity-and-claude/)). The author calls the sample directional, so read it as a reason to track both numbers. For why engines pick the sources they do, see [how AI search engines decide what to cite](/blog/how-ai-search-engines-decide-what-to-cite-and-how-to-get-on-the-list/).

## How do you check whether ChatGPT, Perplexity and Google cite your site?

Run a fixed set of buyer questions through each engine with web search on, and log the sources each answer links to. It takes about an hour for 20 questions across three engines.

### 1. Write the question set

List 10 to 20 questions a buyer would ask before hiring you or buying from you. Use their words, not your keywords. Pull them from sales calls, support emails and the Queries report in Search Console. Mix three kinds:

- Problem questions ("why isn't my company showing up in ChatGPT")
- Comparison questions ("agency vs consultant for AI search")
- Hiring questions ("best AEO consultant for a health system")

Keep the list fixed. Changing the questions each month makes the numbers impossible to compare.

### 2. Run each question in a clean session

AI answers shift with history, context and phrasing ([HubSpot](https://blog.hubspot.com/marketing/ai-citation-tracking)). Use a logged-out or private window where the engine allows it, and turn web search on in ChatGPT. Run each question as a fresh chat.

### 3. Record the sources, not just the text

Open the source list or citation panel for every answer. In Google, check the AI Overview's links and AI Mode's source cards. Log one row per question per engine: date, engine, question, cited (yes/no), mentioned (yes/no), the cited URL, and the competitors cited instead.

### 4. Calculate your share

Your citation rate is the questions where you were cited, divided by all questions asked. Search Engine Land suggests a share-of-citations formula for comparing yourself to competitors: your citations divided by total citations, times 100 ([Search Engine Land](https://searchengineland.com/guide/how-to-measure-brand-visibility)).

### 5. Repeat on a schedule

Re-run the same set every week or two. A single run tells you little, because citations move day to day (see below). The trend across runs is the number to report.

If you would rather not build the question set by hand, my free [AI visibility checker](/ai-visibility-checker/) reads your site and drafts the questions for you. You can then run the check against up to three competitors.

## What should you track over time?

Track four numbers: citation rate, mention rate, AI referral visits and the Search Console trend for the pages that get cited. Together they show whether AI answers use you and whether that turns into visits.

| Metric | Where it comes from | Why it matters |
| --- | --- | --- |
| Citation rate | Your question log | Share of buyer questions where you are a linked source |
| Mention rate | Your question log | Whether engines associate your brand with the topic |
| AI referral visits | GA4 referrals (chatgpt.com, perplexity, gemini, copilot, claude.ai) | Whether citations send people to your site |
| Search performance of cited pages | Search Console, Web search type | AI Overviews and AI Mode are counted here, inside the overall Web data ([Google](https://developers.google.com/search/docs/appearance/ai-features)) |

Two details help with attribution. ChatGPT links often carry `utm_source=chatgpt.com`, and clicks from Google AI Overviews often carry a `#text=` fragment ([HubSpot](https://blog.hubspot.com/marketing/ai-citation-tracking)). Semrush recommends a custom "AI Traffic" channel group in GA4 built on a regex of AI referral sources ([Semrush](https://www.semrush.com/blog/ai-citations/)).

## Which tools check AI citations?

A spreadsheet and a free checker cover a small question set. Paid platforms make sense when you track hundreds of prompts, several markets or competitor share over time.

| Option | Cost | Best for | Limits |
| --- | --- | --- | --- |
| Manual log in a spreadsheet | Free | Up to about 20 questions, any engine | Your time; one person's results |
| [My AI visibility checker](/ai-visibility-checker/) | Drafting questions is free; running the check has a cost | A first baseline against competitors | Not a daily tracker |
| GA4 + Search Console | Free | Visits and search performance | Shows traffic, not which answers cited you |
| Paid AI visibility platforms (Semrush, Ahrefs Brand Radar, HubSpot AEO and others) | Subscription | Hundreds of prompts, share of voice, history | Each vendor samples prompts its own way, so numbers differ between tools |

Pick one method and stay with it. Switching tools resets your baseline.

## Why do AI citations change from one day to the next?

AI engines rerun their searches and pick sources fresh on each answer, so the cited sites shift daily. In an Ahrefs study of 37,500 citations, 50 to 83% were gone the next day, depending on the engine ([Ahrefs, 2026](https://ahrefs.com/blog/how-stable-are-ai-citations/)).

Ahrefs asked five AI tools the same questions every day for 20 days. Perplexity was not part of the study.

| Engine | Citations gone by day two | Citations that lasted all 20 days |
| --- | --- | --- |
| Google AI Overviews | 50% | 6.6% |
| Google AI Mode | 58% | 6.8% |
| ChatGPT | 59% | 4.0% |
| Gemini | 81% | 0.2% |
| Copilot | 83% | 0.5% |

Source: [Ahrefs, How Stable Are AI Citations?](https://ahrefs.com/blog/how-stable-are-ai-citations/), October 2026.

Most lost citations return. About 75% of citations that dropped out at least once came back within the 20 days. A citation that held for 8 or more days almost always returned (96 to 99%). Pages that ranked in Google were about seven times more likely to keep their AI Overviews and AI Mode citations for at least a week ([Ahrefs](https://ahrefs.com/blog/how-stable-are-ai-citations/)).

This is why one check proves little. Measure the same questions on a schedule and report the rate across runs.

## What to do when you are not cited

Start with the pages that should answer your buyer questions. If you are mentioned but not cited, the page often lacks a direct, quotable answer. If you are absent, the engine may not connect your brand to the topic yet. My post on [why content isn't showing up in ChatGPT answers](/blog/why-your-content-isnt-showing-up-in-chatgpt-answers/) walks through the common causes.

For a quick read on one page, run it through my [free AEO audit](/audit/). An agent checks whether the page is ready for AI search and shows what it found.

## How I help

I run AI citation tracking as part of [answer engine optimization](/services/answer-engine-optimization/) work. I track a fixed set of priority questions across the major AI assistants and record whether your brand is cited, mentioned or absent. I report that next to Search Console data, AI referral traffic and branded search trends, so you can see whether visibility turns into visits.

I also test this in public. My [budget agent](/agent/) has $20, 30 days and one goal: get my site cited for five questions. Its diary logs every check.

If you want a baseline for your site, [get in touch](/contact/).

## FAQ

### How do I check if ChatGPT cites my website?

Turn on web search in ChatGPT, ask the questions your buyers ask, and open the sources for each answer. Log whether your URL appears. Repeat the same questions on a schedule.

### Does Google Search Console show AI Overview traffic?

Yes, but not separately. Google counts AI Overviews and AI Mode inside the overall Web search data in the Performance report. There is no filter that isolates them.

### What is the difference between an AI citation and a mention?

A citation links to your page as a source. A mention names your brand without a link. Track both, because the gap between them shows whether engines trust your pages as evidence.

### How often should I check AI citations?

Every week or two, using the same question set. Citations change daily, so a single check is a snapshot. The trend across runs is what to report.

### Do I need a paid tool to track AI citations?

No. A spreadsheet works for 10 to 20 questions. Paid platforms help when you track hundreds of prompts, several markets or competitor share over time.

### How many questions should I track?

Start with 10 to 20 questions a buyer would ask before hiring you. Keep the list fixed so results stay comparable from run to run.

## Start with a baseline

Checking AI citations comes down to a fixed question set, a clean session and a log you repeat. Run it this week, and you will know where you stand in ChatGPT, Perplexity and Google. Want help building the question set or reading the results? [Contact me](/contact/).

## Sources

- [AI features and your website](https://developers.google.com/search/docs/appearance/ai-features), Google Search Central, updated December 10, 2025
- [How Stable Are AI Citations? 10 Things We Learned Tracking 37,500 Citations](https://ahrefs.com/blog/how-stable-are-ai-citations/), Ahrefs, October 29, 2026
- [What Are AI Citations & How Do I Get Them?](https://www.semrush.com/blog/ai-citations/), Semrush, July 30, 2025
- [AI citation tracking: How to track (and grow) AI engine citations](https://blog.hubspot.com/marketing/ai-citation-tracking), HubSpot, updated September 22, 2026
- [How to Measure Your AI Citation Rate Across ChatGPT, Perplexity, and Claude](https://www.freecodecamp.org/news/how-to-measure-your-ai-citation-rate-across-chatgpt-perplexity-and-claude/), freeCodeCamp, April 29, 2026
- [How to measure brand visibility in AI search](https://searchengineland.com/guide/how-to-measure-brand-visibility), Search Engine Land
