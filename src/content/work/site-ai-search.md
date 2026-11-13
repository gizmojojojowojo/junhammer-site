---
title: "AI search for this site: cited answers from my own content"
seoTitle: "AI Site Search With Cited Answers: RAG Case Study"
client: "junhammer.com"
sector: "AI search"
year: "2026"
link: "https://junhammer.com/ask/"
summary: "A question box that answers from this site's pages, cites every source, and declines when the site has no answer. Built on Cloudflare and Claude, with a test set that measures it."
description: "How I built AI search for junhammer.com: BM25 retrieval, streamed answers from Claude with citations, guardrails against invented links, and evals."
order: 7
services: ["ai-engineering", "ai-agent-development"]
results:
  - { value: "60 of 60", label: "test questions get the right page in front of the model" }
  - { value: "93%", label: "of test questions rank the right page first, up from 85% with keywords alone" }
  - { value: "0", label: "packages added to the site" }
---
## The problem

This site has more than 50 pages on AI engineering, answer engine optimization and SEO. A visitor with one question should not have to read five posts to find the answer. Keyword site search returns a list of links. I wanted the site to answer the question, show where the answer came from, and say so when it has nothing.

It is also the same pattern I build for clients, known as retrieval-augmented generation (RAG): find the relevant passages first, then have a language model write an answer from only those passages.

[Try it on the Ask page](/ask/).

## Architecture

The whole feature is three small modules and one page, with no new dependencies and no database.

1. **Index, built at deploy time.** Every post, service page and case study is split into passages by heading, more than 700 in total. Each passage keeps its page title, heading and anchor link. The index ships as a static JSON file.
2. **Retrieval at the edge.** A [Cloudflare Pages Function](https://developers.cloudflare.com/pages/functions/) scores passages against the question with [BM25](https://en.wikipedia.org/wiki/Okapi_BM25), a standard keyword-ranking formula. Headings and titles carry extra weight, and a question that matches a page title lifts every passage on that page.
3. **A gate before the model.** If the best passages cover less than half of the question's meaningful words, the visitor is told the site does not cover it. The model is never called, so off-topic questions cost nothing.
4. **Generation with citations.** The top eight passages go to Claude through the [Anthropic Messages API](https://docs.claude.com/en/api/messages). The instructions allow answers only from those passages, require a numbered citation after each claim, and treat the passages and the question as data so that text inside them cannot change the rules. The answer streams to the page as it is written.
5. **Checks in the browser.** The page turns each citation into a link to its source. It renders a link only if that exact URL appeared in the retrieved passages, so the model cannot invent one. Model output is inserted as text, never as HTML.
6. **A fallback.** If the model is unavailable or a spending limit is reached, the visitor gets the best-matching pages instead of an error.

I built it in one day, working with Claude as a coding agent. The code is public in the [site repository](https://github.com/gizmojojojowojo/junhammer-site).

## Eval results

I wrote the test set before trusting the feature: 60 questions, each labeled with the pages that hold the answer, plus eight off-topic questions the site should turn away. Twelve of the 60 are short or misspelled, the way people type.

| Measure | Result |
|---|---|
| Right page reaches the model | 60 of 60 |
| Right page ranked first | 85% |
| Right page in the top three | 93% |
| Off-topic questions stopped before the model | 4 of 8 |
| Automated tests for index, ranking, prompt, streaming and endpoint | 16 passing |

Two limits apply to these numbers. I tuned the ranking on the same 60 questions, so they are a ceiling. They also measure retrieval only. A second script calls the model for every question and checks that each answer cites a real source, cites an expected page and uses only links from the passages.

The retrieval test fails the build if the right page reaches the model for fewer than 90% of questions. Every poor answer a real visitor gets becomes a new test question.

## Adding search by meaning

Keyword ranking misses a question that shares no words with the page that answers it. So I added a second ranking based on meaning. Each passage is turned into an embedding, a list of numbers that places similar meanings close together, using the [bge-base model on Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/models/bge-base-en-v1.5/). The question is embedded the same way. The two rankings are merged with [reciprocal rank fusion](https://learn.microsoft.com/en-us/azure/search/hybrid-search-ranking), which rewards passages that rank well in either list.

I measured both versions on the same 60 questions against the deployed site.

| Measure | Keywords alone | Keywords plus meaning |
|---|---|---|
| Right page ranked first | 51 of 60 (85%) | 56 of 60 (93%) |
| Right page in the top three | 56 of 60 | 59 of 60 |
| Right page reaches the model | 60 of 60 | 60 of 60 |

Eight questions moved up and one moved down. "What do you charge" went from sixth to third, and "seo how long" from fifth to second. Keyword search already got the right page to the model every time, so the gain is in ordering. The hybrid version is now live, and it falls back to keywords if the embedding service is slow or down. Current numbers are on the [eval results page](/ask/evals/).

## What failed

- **A typo beat the ranking.** The first real question, typed with a word missing, ranked the right post fifth. Adding page-title matching moved it to first, and the question went into the test set.
- **Synonym expansion backfired.** Expanding "SEO" to "search engine optimization" let the common words "engine" and "optimization" outweigh the question itself. Expanded terms now count for 30% of an original term.
- **Tables of contents outranked real sections.** A table of contents repeats every heading on the page, so it matched everything. Those sections are now left out of the index.
- **The off-topic gate catches half.** Four of eight off-topic questions share enough ordinary words with the site to pass retrieval. The model's instructions handle the rest. I would not rely on a keyword gate alone.
- **Keyword ranking has a ceiling.** A question that shares no words with the page will miss. That led to the hybrid ranking above.
- **The longest delay had nothing to do with AI.** A renamed secret in the hosting dashboard kept its name and lost its value, so the function saw a key that was blank. I added a diagnostic mode that reports why an answer fell back to links, and it found the cause in one request. Production AI features need that visibility from the first day.

See [AI engineering](/services/ai-engineering/) and [AI agent development](/services/ai-agent-development/) for how this applies to your site or product.
