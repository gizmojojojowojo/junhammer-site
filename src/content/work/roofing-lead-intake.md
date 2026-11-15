---
title: "AI lead intake that files roofing leads in HubSpot and Asana"
seoTitle: "AI Lead Intake for a Roofing Company: Case Study"
client: "Roofing lead intake (demo build)"
sector: "Home services"
year: "2026"
summary: "Web forms, emails and voicemails read by AI, sorted by urgency and filed in HubSpot with a drafted reply and an Asana task. Tested on 40 realistic leads."
description: "How Joe Unhammer built AI lead intake for a roofing company scenario: leads sorted, emergencies flagged, deals and tasks created in HubSpot and Asana."
order: 8
services: ["ai-automation"]
results:
  - { value: "40 of 40", label: "test messages sorted into the right category" }
  - { value: "8 of 8", label: "emergencies flagged as emergencies" }
  - { value: "2 of 2", label: "repeat callers matched to their open deal" }
---
## The problem

A roofing company's leads arrive in three places: the website form, the inbox and the voicemail. Many are incomplete. Some are spam or vendor pitches. A few are emergencies, such as water coming through a ceiling, and the company that calls back first usually gets the job. Someone has to read everything, type it into the CRM and decide what comes first.

## What I built

A small service on Cloudflare that takes each new lead and does that first pass.

1. **Reads the message.** A Claude model pulls out the category, name, phone, email, city, job type, urgency and insurance status, and writes a short summary and a draft reply.
2. **Drops the noise.** Spam, vendor pitches and job seekers never reach the CRM.
3. **Files the lead in HubSpot.** It finds or creates the contact, opens a deal in the first pipeline stage and attaches a note with the original message and the draft reply.
4. **Catches repeat callers.** A second message from someone with an open deal attaches to that deal, and an emergency follow-up escalates it.
5. **Creates the task.** An Asana task lands in Emergency dispatch, Estimate visits or Customer service, due the same day for emergencies.

Draft replies wait for a person to approve them. Nothing is sent to customers automatically.

## How it was tested

There was no real roofer's data to start from, so I wrote 40 realistic messages for a fictional company in Parker, Colorado, with an answer key. The set includes spam, a Spanish-language voicemail, repeat callers, a warranty claim, a complaint, an out-of-area job and leads missing a name or phone number. Every person and address in it is invented.

A scoring script sends all 40 to the live service and compares the results with the answer key, field by field. On the final live run:

| Field | Correct |
|---|---|
| Category | 40 of 40 |
| Name, phone, email | 34 of 34 each |
| Job type | 34 of 34 |
| City | 33 of 34 |
| Insurance claim | 20 of 21 |
| Urgency | 26 of 33 |

Every urgency miss was one level off, such as a hail claim with no deadline rated normal instead of high. The run created 29 deals and 32 tasks.

## What it shows

Most of the value came from wiring together tools the company would already pay for. The AI model does the one step plain automation cannot: reading a messy message and deciding what it is. The test set made the build measurable, and the first live run surfaced two problems before any customer could have seen them: a missing HubSpot permission and a missing field in the Asana request.

The next step is a pilot with a real home service company. See [AI automation](/services/ai-automation/) for how this applies to your business.
