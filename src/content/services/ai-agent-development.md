---
title: "AI Agent Development"
navLabel: "AI agent development"
seoTitle: "AI Agent Development for Agencies and Small Teams"
description: "Custom AI agents and agentic workflows built by Joe Unhammer: research, QA, reporting and support agents on Claude and MCP, scoped to one job and measured."
summary: "I build AI agents that do one real job for your team, such as research, content QA, reporting or answering from your documents, and I prove they work before they ship."
order: 6
topic: "AI"
offers:
  - "Agent scoping: which tasks need an agent and which need a simpler workflow"
  - "Research and reporting agents that pull from GA4, Search Console, CRMs and the web"
  - "Content QA and audit agents for marketing and SEO teams"
  - "Document assistants that answer only from your own sources (RAG)"
  - "Claude skills, MCP servers and plugins that package your process"
  - "Evaluation sets, guardrails and human review steps"
  - "Hand-off documentation so your team can run and maintain it"
proof:
  - "Builds agentic tools, Claude skills, plugins and browser extensions for a digital agency"
  - "Designed and built AI chat functions for hospital systems"
  - "Built LandmAIn, an AI site-intelligence platform with a sourced evidence layer"
  - "Ten years of SEO and AEO work, so the agents fit how marketing teams actually operate"
work: ["agency-ai-tools", "hospital-ai-chat", "landmain"]
faqs:
  - q: "What is an AI agent?"
    a: "An AI agent is a system where a large language model decides its own next steps and which tools to use to finish a task. A workflow follows a fixed path you define. Many business problems are better served by a workflow, so I start every project by deciding which one the job needs."
  - q: "What kinds of AI agents do you build?"
    a: "Mostly agents for marketing, SEO and operations teams: research agents that gather and summarize sources, QA agents that check content against a standard, reporting agents that turn analytics data into client-ready summaries, and assistants that answer from a defined set of documents."
  - q: "How long does it take to build an AI agent?"
    a: "A focused prototype that proves one job usually takes two to four weeks. Production work with authentication, monitoring and documentation takes longer and depends on the systems it connects to. I scope in phases so you see a working version early."
  - q: "Which AI models and tools do you use?"
    a: "I build mostly with Claude and the Model Context Protocol (MCP), and I use models from OpenAI and Google when a task calls for them. I keep infrastructure simple, often static sites and serverless functions on Cloudflare, so running costs stay low."
  - q: "Do I own the agent after it is built?"
    a: "Yes. You own the code, prompts, evaluation sets and accounts. I document how it works and keep the stack simple enough for a generalist developer to maintain."
  - q: "Do you work with businesses outside Colorado?"
    a: "Yes. I am based in the Denver metro area and work with teams anywhere in the US. Local clients can meet in person."
---
## Agents that do one job well

The useful AI agents I have built each do one defined job. They research a topic and return sources. They check a draft against a style and accuracy standard. They pull Search Console and GA4 data and write the monthly summary. The narrower the job, the easier it is to test, trust and maintain.

That is why I start with scoping. Anthropic's engineering team, in its guide to [building effective agents](https://www.anthropic.com/research/building-effective-agents), recommends finding the simplest solution possible and adding complexity only when needed. In practice, that means some projects end up as a predictable workflow instead of an autonomous agent. I explain the trade-off in [AI agent vs AI workflow](/blog/ai-agent-vs-ai-workflow/).

## How a build runs

1. **Pick the job.** We choose one task your team repeats, with a clear definition of a good result.
2. **Write the test first.** We collect real examples and agree on what correct output looks like, so we can measure the agent instead of eyeballing it.
3. **Prototype.** A working version on your real data, usually within a few weeks.
4. **Add guardrails.** Human review wherever a mistake is costly, logging, and limits on what the agent can touch.
5. **Hand off.** Documentation, a short training session and a plan for who maintains it.

## Built for marketing and agency teams

Most of my agent work is for teams that run SEO, AEO, content and reporting. For a nonprofit digital agency I build [agentic tools, Claude skills and plugins](/work/agency-ai-tools/) that turn repeatable research, QA and reporting into one-click workflows. Because I also lead [answer engine optimization](/services/answer-engine-optimization/) programs, I know what those processes look like from the inside.

If you want an agent that connects Claude directly to your own tools and data, see [Claude and MCP implementation](/services/claude-mcp-implementation/). For broader automation across your marketing and operations stack, see [AI automation](/services/ai-automation/).
