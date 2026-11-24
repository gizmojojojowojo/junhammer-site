---
title: "MCP for SEO: Connect Claude to Google Search Console"
description: "MCP for SEO: what the Model Context Protocol is, how to connect Claude to Google Search Console with an open-source server, and how to keep it read-only."
slug: "mcp-for-seo"
date: "2026-11-24"
topic: "SEO"
pillar: false
draft: false
faqs:
  - q: "What is MCP in SEO?"
    a: "MCP in SEO means connecting an AI assistant such as Claude to SEO data sources, like Google Search Console, through an MCP server. You can then ask questions about your search data in plain English."
  - q: "Can Claude access Google Search Console?"
    a: "Yes, through an MCP server. Open-source servers such as mcp-gsc connect Claude to the Search Console API after you authorize them with OAuth or a service account."
  - q: "Is a Search Console MCP server safe?"
    a: "It can be, with read-only access. Google offers a read-only API scope, and mcp-gsc keeps destructive tools disabled by default. Review any third-party server's code before you authorize it."
  - q: "Do I need to code to use MCP for SEO?"
    a: "No coding, but some setup. You create Google API credentials, install a Python tool and edit a JSON config file. After that, you work in plain English."
  - q: "Does MCP show AI Overviews data separately?"
    a: "No. Search Console counts AI Overviews and AI Mode inside overall Web search data, so any MCP server reading it sees them combined."
  - q: "How many rows can Claude pull from Search Console?"
    a: "The Search Console API returns up to 25,000 rows per request and only the top rows, not every row. Large sites may see different long-tail totals than the UI."
---

## Key takeaways

- MCP (Model Context Protocol) is an open-source standard for connecting AI applications to external systems ([MCP docs](https://modelcontextprotocol.io/introduction)). Anthropic introduced it on November 25, 2024 ([Anthropic](https://www.anthropic.com/news/model-context-protocol)).
- For SEO, an MCP server lets Claude query Google Search Console directly, so you can ask questions about clicks, queries and pages in plain English.
- Open-source Search Console servers already exist. One, mcp-gsc (published on PyPI as mcp-search-console), is MIT licensed and reached version 0.4.2 on November 6, 2026 ([PyPI](https://pypi.org/project/mcp-search-console/)).
- Start read-only. Google offers a read-only scope, `webmasters.readonly`, separate from the read/write `webmasters` scope ([Google](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing)).
- The Search Console API returns top rows, not every row, and caps a request at 25,000 rows ([Google](https://developers.google.com/webmaster-tools/v1/searchanalytics/query)).
- AI can misread a table or mix up date ranges. Check any number you plan to act on against the Search Console interface.

MCP for SEO means giving an AI assistant such as Claude a direct, permissioned line into the tools you already use, starting with Google Search Console. Instead of exporting CSVs and pasting them into a chat, you ask Claude which queries lost clicks last week, and it pulls the data itself.

This guide explains what MCP is, what it is good for in SEO work, and how to connect Claude to Search Console with an open-source server. It also covers the safety settings to use and where the setup falls short.

## What is MCP?

MCP (Model Context Protocol) is an open-source standard for connecting AI applications to external systems ([MCP docs](https://modelcontextprotocol.io/introduction)). An MCP server sits between an AI app and a tool, such as Search Console, and exposes a set of actions the AI can call.

Anthropic introduced MCP on November 25, 2024. The company describes it as an open standard for connecting AI assistants to the systems where data lives ([Anthropic](https://www.anthropic.com/news/model-context-protocol)). For a plain-language version, see the "What is MCP?" answer on my [AI automation page](/services/ai-automation/).

## What can an MCP server do for SEO?

An MCP server turns your SEO data into something you can question in plain English. With Search Console connected, Claude can pull performance data, compare periods and inspect URLs on request.

Useful jobs for it:

- **Weekly movers.** Compare the last 7 days to the previous 7 and list the queries and pages that gained or lost the most.
- **Striking-distance queries.** Find queries ranking in positions 8 to 20 with high impressions and low CTR.
- **Page-level diagnosis.** Show every query a single URL ranks for, with clicks and position.
- **Indexing checks.** Run URL inspection on a list of new pages and report which are not indexed yet.
- **Sitemap review.** List submitted sitemaps and any errors.

None of this is new data. MCP removes the export, filter and paste steps between you and the answer.

## How do you connect Claude to Google Search Console?

Install an open-source Search Console MCP server, authorize it with your Google account, and add it to Claude's config file. The steps below follow the mcp-gsc project's README ([mcp-gsc README](https://raw.githubusercontent.com/aminforou/mcp-gsc/HEAD/README.md)). Check the README before you start, since setup details change between versions.

### 1. Pick a server

Several open-source Search Console servers are listed on [mcpservers.org](https://mcpservers.org/servers/aminforou/mcp-gsc). This guide uses **mcp-gsc** by Amin Foroutan, published on PyPI as **mcp-search-console**. It is MIT licensed, needs Python 3.11 or newer, and its latest release is 0.4.2 from November 6, 2026 ([PyPI](https://pypi.org/project/mcp-search-console/)).

Its README lists tools including `list_properties`, `get_search_analytics`, `compare_search_periods`, `get_search_by_page_query`, `inspect_url_enhanced`, `batch_url_inspection`, `check_indexing_issues` and `get_sitemaps`.

### 2. Choose how to authenticate

The README offers two options:

| Option | Best for | How it works |
| --- | --- | --- |
| OAuth (recommended in the README) | One person using their own Google account | You create a Desktop app OAuth client in Google Cloud and point the server at its JSON file |
| Service account | Automation or team use | You add the service account's email to the Search Console property, and the server uses its key file |

For the service account route, the README says to give the account "Full access" on the property.

### 3. Install the server

The README recommends running the server with `uvx`, part of the `uv` Python tool. Install `uv`, then Claude starts the server for you from the config in step 4.

### 4. Add it to Claude's config

In Claude Desktop on a Mac, the config file lives at `~/Library/Application Support/Claude/claude_desktop_config.json`. Per the README, the entry looks like this for OAuth:

```json
{
  "mcpServers": {
    "gscServer": {
      "command": "/FULL/PATH/TO/uvx",
      "args": ["mcp-search-console"],
      "env": {
        "GSC_OAUTH_CLIENT_SECRETS_FILE": "/path/to/client_secrets.json"
      }
    }
  }
}
```

For a service account, the README swaps that variable for `GSC_CREDENTIALS_PATH` and adds `"GSC_SKIP_OAUTH": "true"`.

### 5. Restart and test

Fully quit Claude and reopen it, as the README instructs. Then ask Claude to list your Search Console properties. If it returns them, the connection works. Approve the Google sign-in prompt the first time if you used OAuth.

## How do you keep a Search Console MCP server safe?

Keep the server read-only unless you have a specific reason to write. Google's API has a read-only scope, `webmasters.readonly`, and a read/write scope, `webmasters` ([Google](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing)).

In mcp-gsc, write actions sit behind a setting called `GSC_ALLOW_DESTRUCTIVE`, which defaults to false. The README says adding a site, deleting a site and deleting a sitemap stay disabled by default. Its changelog says the server requests the write scope only when that setting is true, and uses `webmasters.readonly` otherwise ([mcp-gsc README](https://raw.githubusercontent.com/aminforou/mcp-gsc/HEAD/README.md)).

Three more habits:

- **Use your own account for personal work.** OAuth keeps access tied to you and revocable from your Google account.
- **Scope service accounts to the properties they need.** Add the service account only to the sites in the project.
- **Mind the quotas.** Search Analytics allows 1,200 queries per minute per site and per user. URL inspection allows 2,000 queries per day per site ([Google](https://developers.google.com/webmaster-tools/limits)). A bulk inspection request can hit that ceiling.

## Which prompts work best?

Specific prompts with a date range, a metric and a threshold work best. Vague prompts get vague summaries.

| Goal | Prompt |
| --- | --- |
| Weekly movers | "Compare the last 7 days to the previous 7 days for my site. List the 10 queries with the largest click change and the 10 pages with the largest impression change." |
| Striking distance | "Find queries from the last 28 days with average position between 8 and 20 and more than 100 impressions. Sort by impressions." |
| Page diagnosis | "For this URL, list every query from the last 3 months with clicks, impressions, CTR and position." |
| Indexing | "Inspect these 10 URLs and tell me which are not indexed and why." |
| Cannibalization | "Find queries where two or more of my pages each got impressions in the last 28 days." |

Ask Claude to show the raw rows behind any summary. That makes errors easy to spot.

## Where does MCP fall short for SEO?

MCP gives Claude the same data you see in Search Console, with the same limits. It does not fill gaps in that data, and it does not check its own arithmetic.

- **The API returns top rows.** Google says the API does not guarantee all data rows, only top ones, and a single request returns at most 25,000 rows ([Google](https://developers.google.com/webmaster-tools/v1/searchanalytics/query)). Long-tail totals from the API can differ from the UI.
- **AI features are not split out.** Search Console counts AI Overviews and AI Mode inside overall Web search data ([Google](https://developers.google.com/search/docs/appearance/ai-features)). An MCP server cannot separate them either.
- **Fresh data moves.** mcp-gsc lets you choose between all data and final data, which lags by 2 to 3 days ([mcp-gsc README](https://raw.githubusercontent.com/aminforou/mcp-gsc/HEAD/README.md)). Recent days can change after you pull them.
- **Setup takes a technical step.** You need a Google Cloud OAuth client or service account, a config file and a Python tool.
- **Third-party code holds your access.** Read the server's code or README before you authorize it, and revoke access when you stop using it.

I use the same pattern in client work. For a nonprofit digital agency, I built reporting automations that turn GA4 and Search Console data into ready-to-send client deliverables ([case study](/work/agency-ai-tools/)).

## How I help

I set up Claude skills and MCP servers that give AI controlled access to your systems, usually read-only to start. That work sits under my [AI automation](/services/ai-automation/) service. For an agency, I built plugins, browser extensions, Claude skills and reporting automations that package SEO and AEO processes into one-click workflows ([agency AI tools case study](/work/agency-ai-tools/)).

If you want Search Console, GA4 or your CRM connected to Claude with sensible permissions, [tell me about your setup](/contact/). If you are deciding between a fixed workflow and an agent, my guide to [AI agents vs AI workflows](/blog/ai-agent-vs-ai-workflow/) helps.

## FAQ

### What is MCP in SEO?

MCP in SEO means connecting an AI assistant such as Claude to SEO data sources, like Google Search Console, through an MCP server. You can then ask questions about your search data in plain English.

### Can Claude access Google Search Console?

Yes, through an MCP server. Open-source servers such as mcp-gsc connect Claude to the Search Console API after you authorize them with OAuth or a service account.

### Is a Search Console MCP server safe?

It can be, with read-only access. Google offers a read-only API scope, and mcp-gsc keeps destructive tools disabled by default. Review any third-party server's code before you authorize it.

### Do I need to code to use MCP for SEO?

No coding, but some setup. You create Google API credentials, install a Python tool and edit a JSON config file. After that, you work in plain English.

### Does MCP show AI Overviews data separately?

No. Search Console counts AI Overviews and AI Mode inside overall Web search data, so any MCP server reading it sees them combined.

### How many rows can Claude pull from Search Console?

The Search Console API returns up to 25,000 rows per request and only the top rows, not every row. Large sites may see different long-tail totals than the UI.

## Start with one question

Connect Claude to Search Console read-only, ask one specific question you answer every week, and check the result against the UI. If it saves you time, add the next question. If you want help setting it up, [get in touch](/contact/).

## Sources

- [What is the Model Context Protocol (MCP)?](https://modelcontextprotocol.io/introduction), Model Context Protocol docs
- [Introducing the Model Context Protocol](https://www.anthropic.com/news/model-context-protocol), Anthropic, November 25, 2024
- [mcp-gsc README](https://raw.githubusercontent.com/aminforou/mcp-gsc/HEAD/README.md), Amin Foroutan, GitHub
- [mcp-search-console](https://pypi.org/project/mcp-search-console/), PyPI, version 0.4.2, November 6, 2026
- [Authorize requests](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing), Google Search Console API
- [Usage limits](https://developers.google.com/webmaster-tools/limits), Google Search Console API, updated August 28, 2025
- [Search Analytics: query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query), Google Search Console API
- [AI features and your website](https://developers.google.com/search/docs/appearance/ai-features), Google Search Central, updated December 10, 2025
