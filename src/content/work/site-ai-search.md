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
  - { value: "100%", label: "of 60 test questions get the right page in front of the model" }
  - { value: "85%", label: "of test questions rank the right page first" }
  - { value: "0", label: "new dependencies or databases added to the site" }
---
## The problem

This site has more than 50 pages on AI engineering, answer engine optimization and SEO. A visitor with one question should not have to read five posts to find the answer. Keyword site search returns a list of links. I wanted the site to answer the question, show where the answer came from, and say so when it has nothing.

It is also the same pattern I build for clients, known as retrieval-augmented generation (RAG): find the relevant passages first, then have a language model write an answer from only those passages.

[Try it on the Ask page](/ask/).

## What I built

- **An index built at deploy time.** Every post, service page and case study is split into more than 700 passages by heading. The index is a static JSON file, so there is no database to run.
- **Retrieval at the edge.** A [Cloudflare Pages Function](https://developers.cloudflare.com/pages/functions/) scores passages against the question with [BM25](https://en.wikipedia.org/wiki/Okapi_BM25), a standard keyword-ranking formula, and adds weight when the question matches a page title.
- **Answers that cite.** The top eight passages go to Claude through the [Anthropic Messages API](https://docs.claude.com/en/api/messages) with instructions to answer only from them and cite each claim. The answer streams to the page as it is written.
- **Guardrails in code.** If no passage matches, the visitor is told the site does not cover the question and the model is never called. The page only renders links that appeared in the retrieved passages, so the model cannot invent a URL.
- **A fallback that still helps.** If the model is unavailable, the visitor gets the best-matching pages instead of an error.

I built it in one day, working with Claude as a coding agent. The code is public in the [site repository](https://github.com/gizmojojojowojo/junhammer-site).

## How I know it works

I wrote 60 test questions, each with the pages that hold the answer, plus eight off-topic questions the site should turn away. Twelve of the 60 are short or misspelled, the way people type.

- The right page reaches the model for all 60 questions and ranks first for 85% of them.
- Four of the eight off-topic questions are stopped before the model is called. The other four rely on the model's instructions to decline.
- Sixteen automated tests cover the index, the ranking, the prompt, the streaming and the endpoint.

I tuned the ranking on this same question set, so these numbers are a ceiling. The test fails the build if retrieval drops below 90%, and every poor answer a real visitor gets becomes a new test question.

## What I learned

The first version ranked the right post fifth for a question with a typo. Title matching fixed that one, and the failed question went into the test set. Keyword ranking still misses questions that share no words with the page, so embedding-based retrieval is the next step.

The longest delay had nothing to do with AI. A renamed secret in the hosting dashboard kept its name and lost its value. I added a diagnostic mode that reports why an answer fell back to links, and it found the cause in one request. Production AI features need that kind of visibility from the first day.

See [AI engineering](/services/ai-engineering/) and [AI agent development](/services/ai-agent-development/) for how this applies to your site or product.
