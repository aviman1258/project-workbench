# New project template

The quickest path is the **+ Add project** form in the running local portfolio. It creates this structure and validates the same fields automatically. Use the manual template below when you prefer to work directly in the files.

Create a directory named with the next ID and a concise source label:

```text
src/content/projects/003-example-project/
├── artifacts/
├── events.yaml
└── index.md
```

Copy the following into `index.md` and replace every placeholder. Delete optional `effort` or `tech` fields when they do not apply.

```markdown
---
id: "003"
title: Example Project
slug: example-project
created: 2026-08-29
updated: 2026-08-29
type: experiment
area: example-area
status: idea
summary: A concise explanation of the opportunity and what this project explores.
tags:
  - example
  - prototype
confidentiality: personal
externalShareable: false
featured: false
effort:
  prototypeHours: 0
  totalHours: 0
tech:
  - TypeScript
---

## Observation

What caused me to notice the opportunity or problem?

## Hypothesis

What do I believe could improve, and why?

## What I Built

What was implemented? Keep sensitive details out of sanitized or public records.

## Product Rationale

Why might a user or the business care?

## Technical Approach

Describe architecture, integrations, interesting engineering decisions, testing, or feature flags.

## Outcome

What happened after building or pitching it?

## What I Learned

What did the experiment teach me?
```

Allowed `type` values:

```text
customer-facing | internal-tool | infrastructure | experiment
```

Allowed `status` values:

```text
idea | exploring | prototype | ready-to-pitch | pitched | product-review |
approved | building | experiment | shipped | rejected | abandoned |
superseded | archived
```

Allowed `confidentiality` values:

```text
personal | internal | sanitized | public
```

`externalShareable` is always an explicit, separate decision. Do not set it to `true` automatically for a `sanitized` or `public` record.

Copy the following into `events.yaml`. Preserve earlier entries and append new events as the project progresses. You can also add events from **Add to this project** on the rendered project page.

```yaml
- date: 2026-08-29
  type: idea
  title: Initial concept
  note: Optional longer context about what prompted the idea.
```

Add PNG, JPG/JPEG, PDF, or MP4 files directly to `artifacts/`, or upload them from **Add to this project**. Leave the directory empty when there is no supporting evidence yet.

Finally, validate the record:

```bash
npm run check
npm run build
```
