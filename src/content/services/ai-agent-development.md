---
title: "AI Agent Development"
navLabel: "AI agent development"
seoTitle: "AI Agent Development for Agencies and Small Teams"
description: "Custom AI agents built by Joe Unhammer: tool-using agents scoped to one job, tested against real questions, with guardrails and human review."
summary: "I build AI agents that do one real job, such as research, content QA or answering questions from your data, and I prove they work with a test set before they ship."
order: 6
topic: "AI"
offers:
  - "Agent scoping: which tasks need an agent and which need a simpler workflow"
  - "Tool design: the actions an agent can take and the limits on each"
  - "Research and QA agents for marketing and SEO teams"
  - "Agents that answer questions by querying your systems"
  - "Test sets that measure the agent, including questions it should refuse"
  - "Guardrails, logging and human review steps"
proof:
  - "Built a map agent that passed all 65 test questions across three trials each"
  - "Builds agentic research, QA and reporting tools for a digital agency"
  - "Ten years of SEO and AEO work, so agents fit how marketing teams operate"
work: ["map-agent", "agency-ai-tools"]
faqs:
  - q: "What is an AI agent?"
    a: "An AI agent is a system where a large language model decides its own next steps and which tools to use to finish a task. A workflow follows a fixed path you define. Many business problems are better served by a workflow, so I start every project by deciding which one the job needs."
  - q: "When should a business not use an agent?"
    a: "When the steps are the same every time. A fixed workflow is cheaper, faster and easier to test. Agents are worth it when the path depends on the request, such as a question that might need one database lookup or three."
  - q: "How do you test an AI agent?"
    a: "With a written set of test questions and the answers they should produce, including questions the agent should decline. I run each question several times, because models answer differently from run to run, and count a question as passed only when every run passes."
  - q: "What stops an agent from doing something wrong?"
    a: "The tools. An agent can only take the actions its tools allow, so I keep each tool narrow, check every input before it runs, start with read-only access and put a person in front of anything that changes data or reaches a customer."
  - q: "Which AI models and tools do you use?"
    a: "I build mostly with Claude and the Model Context Protocol (MCP), and I use models from OpenAI and Google when a task calls for them. I pick per task on cost, accuracy and data rules."
---
## Agents that do one job well

The useful agents I have built each do one defined job. They research a topic and return sources. They check a draft against a standard. They answer a question by deciding which lookups to run. The narrower the job, the easier it is to test, trust and maintain.

That is why I start with scoping. Anthropic's engineering team, in its guide to [building effective agents](https://www.anthropic.com/research/building-effective-agents), recommends finding the simplest solution possible and adding complexity only when needed. Some projects end up as a predictable workflow instead of an agent. I explain the trade-off in [AI agent vs AI workflow](/blog/ai-agent-vs-ai-workflow/).

## Measured, not eyeballed

The [map agent](/work/map-agent/) shows how I build. It answers questions about land sites by choosing among three tools, and it never writes its own database queries. A set of 65 test questions covers the easy cases, the hard ones, and requests the data cannot answer. Each failure pointed to a specific fix, and the final version passed every question across three trials.

## How a build runs

1. **Pick the job.** One task your team repeats, with a clear definition of a good result.
2. **Write the test first.** Real examples and agreed answers, so we can measure the agent.
3. **Design the tools.** The smallest set of actions that gets the job done, each with checked inputs.
4. **Prototype and tune.** A working version, run against the test set until the failures stop teaching us anything new.
5. **Hand off.** Guardrails, documentation and a plan for who maintains it.

## Related services

For custom AI software that does not need an agent, such as chat over your documents or a data product, see [AI engineering](/services/ai-engineering/). For connecting AI to your CRM and everyday tools, see [AI automation](/services/ai-automation/).
