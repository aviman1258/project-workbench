---
id: "003"
slug: porfolio-workbench
name: Portfolio Workbench
description: Portfolio Workbench, live at https://www.avisheksportfolio.com, is a portfolio site where every project is a Markdown + YAML file in Git rather than a row in a database. Astro renders a homepage grid of projects and a detail page per project, and the same codebase supports editing — locally via a device-unlocked (WebAuthn) workbench, or on the hosted site via a GitHub personal-access token that commits edits straight to the repo. It also includes an AI "Draft from repository" feature that reads a linked GitHub repo/PR, writes the description and why, and queues a background CI job that boots the app, screenshots every page, and documents it — producing exactly this kind of page-by-page report.
why: I built this because I was tired of my project history living wherever some hosted tool decided to keep it — I wanted my portfolio's actual data to be plain files I could diff, inspect, and move without migration pain. As a senior engineer who ships a lot of side projects, I wanted one place to record not just what I built but why, with enough structure (status, privacy, artifacts) to make the record useful later. I added the device-unlock and GitHub-token editing paths so I could edit from either my laptop or my phone without standing up a backend, and I added the AI drafting and deep-analysis pipeline because writing (and re-writing) descriptions and documentation by hand for every project was the actual bottleneck.
status: delivered
privacy: public
startDate: 2026-09-01
updatedDate: 2026-10-06
repositoryUrl: https://github.com/aviman1258/project-workbench
siteUrl: https://www.avisheksportfolio.com
artifactOrder:
  - page-home.png
  - page-manage.png
  - page-projects-my-pal-json.png
  - page-projects-tour-guide.png
  - page-projects-porfolio-workbench.png
  - how-it-works.pdf
featuredArtifact: page-home.png
---

## What I Built

A local-first workspace for documenting projects, adding timeline events, and collecting artifacts while retaining file-based ownership.

## Product Rationale

The workbench keeps project documentation close to its underlying files instead of making a hosted service the source of truth.

## Technical Approach

> Inferred: The portfolio likely uses Astro as its interface and Markdown/YAML files as the durable project data layer, with editing capabilities available only in the local development environment.

> Inferred: Project creation, timeline updates, and artifact collection likely write directly to the existing local content structure so the resulting records remain portable and inspectable.

## Outcome

> Inferred: The workbench likely became the portfolio’s own authoring surface, reducing the friction of keeping project histories and supporting artifacts up to date.
