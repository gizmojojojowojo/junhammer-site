---
title: "AI Engineering"
navLabel: "AI engineering"
seoTitle: "AI Engineering: LLM Apps, AI Search and Data Tools"
description: "Joe Unhammer builds custom AI software: chat and search over your content, natural-language access to your data, and data products, run on Cloudflare."
summary: "I build custom AI software for a specific job: chat and search that answer from your content, plain-language access to your data, and data products people can trust."
order: 2
topic: "AI"
offers:
  - "AI chat functions for websites and internal teams"
  - "Search and question answering over your documents (RAG), with citations"
  - "Plain-language questions over your databases and maps"
  - "Data pipelines that turn public records and APIs into usable datasets"
  - "Fast static sites and APIs on Cloudflare"
proof:
  - "Designed and built AI chat functions for hospital systems"
  - "Built LandmAIn, an AI land intelligence platform with a sourced evidence layer"
  - "Built AI search for this site that cites every source and declines when it has no answer"
work: ["landmain", "hospital-ai-chat", "site-ai-search"]
faqs:
  - q: "What kinds of AI applications do you build?"
    a: "Mostly software that sits on top of an organization's own information: chat and search that answer from your documents, tools that let people ask questions of a database in plain language, and data products that combine public sources into something decision-ready."
  - q: "How long does it take to build an AI prototype?"
    a: "A focused prototype that proves one workflow usually takes two to four weeks. A production tool with authentication, monitoring and documentation takes longer, depending on integrations. I scope in phases so you see a working version early and decide whether to keep going."
  - q: "Who owns and maintains the software after launch?"
    a: "You own the code, prompts, test sets and accounts. I document how it works, keep the stack simple enough that a generalist developer can maintain it, and offer ongoing support if you want it. Hosting on Cloudflare keeps running costs low for most tools."
---
## What I build

I build AI software for specific jobs, not general chatbots. The tools that work best answer from a defined body of knowledge or turn messy sources into structured data a person can trust.

- **Chat and search over your content.** For enterprise health systems I built [AI chat functions that help patients find care](/work/hospital-ai-chat/). This site's [AI search](/work/site-ai-search/) answers from my own pages, cites every source and says so when it has no answer.
- **Plain-language access to your data.** A [map agent](/work/map-agent/) turns a question like "sites over 300 acres in Weld County" into a checked database query and draws the answer on a map.
- **Data products.** [LandmAIn](/work/landmain/) is an AI land intelligence platform for data center and energy site selection. It runs from regional search to a reviewable site brief, and every finding ties to a dated, inspectable source.

## How I build

- **Write the test first.** Before writing prompts, we agree on what a correct answer looks like and collect examples to test against.
- **Show the source.** An AI tool is only useful if people can see where its answers come from.
- **Prefer simple infrastructure.** Static sites, serverless functions and plain files beat complex platforms for most tools, and they are cheaper to run.
- **Ship in phases.** A working prototype in weeks, then hardening, then features.

## Related services

When the job needs a system that chooses its own steps and calls tools, see [AI agent development](/services/ai-agent-development/). For connecting AI to your CRM and the tools you already use, see [AI automation](/services/ai-automation/).

Because I also run [answer engine optimization](/services/answer-engine-optimization/), the public-facing things I build come with clean markup, structured data and fast pages, so they can be found and cited from day one.
