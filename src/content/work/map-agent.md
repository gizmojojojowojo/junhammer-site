---
title: "A map agent that answers land questions in plain language"
seoTitle: "Natural-Language Map Agent: AI Agent Case Study"
client: "Map agent (open source)"
sector: "Geospatial AI"
year: "2026"
link: "https://github.com/gizmojojojowojo/map-agent"
summary: "Ask about land sites in plain language and see the answer on a map. The agent picks from three checked tools and never writes its own database queries."
description: "How Joe Unhammer built a natural-language map agent with tool calling, input checks and a 65-question test set run three times per question."
order: 9
services: ["ai-agent-development"]
results:
  - { value: "65", label: "test questions in three sets, each run three times" }
  - { value: "3", label: "tools, with every input checked before it runs" }
  - { value: "0", label: "database queries written by the model" }
---
## The problem

Site selection data lives in GIS layers and databases. The people who need answers, such as developers and investors, ask questions in plain words: "sites over 300 acres in Weld County" or "what's within 5 miles of Hudson?" Turning those questions into correct queries usually takes a GIS analyst.

## What I built

An agent that turns the question into a checked database query and draws the matching parcels on a map with a short written answer.

- **Three tools.** One filters sites by acreage, county and distance to transmission lines and highways. One finds sites within a radius of a point. One looks up a place name, tolerating misspellings and abbreviations.
- **No model-written SQL.** The model chooses a tool and fills in its inputs. Each input is validated before the fixed, read-only query runs, and a bad input goes back to the model as an error so it can correct itself.
- **Chained steps.** "What's within 5 miles of Hudson?" looks up Hudson, then searches around it.
- **Honest limits.** Questions the data cannot answer, such as power capacity or ownership, get a plain statement that the data does not cover them.

## How it was tested

A set of 65 questions in three groups measures the agent. A question passes only when the agent makes the expected tool calls with the expected inputs and the map shows exactly the expected sites.

- **Core (30).** Common requests, including questions the agent should decline.
- **Hard (23).** Written to find the limits: unit conversions, misspelled places, boundary values, vague requests and prompt injection.
- **Fresh (12).** New wording no fix had been written against.

The first version passed every core question and 15 of 23 hard ones. Each hard failure pointed to a specific change, such as shared filters and tolerant place lookup. The fresh set then scored 7 of 12 on its first run, which showed how much the earlier scores reflected tuning. After fixes for those five causes, the fourth version passed all 65 questions in each of three trials. Because all three sets have now guided fixes, the next honest measure needs questions written before any further tuning.

## Status

The agent loop, tools and scoring are covered by tests, and the Claude version has passed a live test run. The demo uses 12 invented parcels near real Colorado towns. Loading open county parcel data is next.

See [AI agent development](/services/ai-agent-development/) for how this applies to your data.
