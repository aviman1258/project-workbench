---
id: "003"
slug: porfolio-workbench
name: Portfolio Workbench
description: "Portfolio Workbench is a Git-backed portfolio site built with Astro where each project is a Markdown file validated and rendered at build time. It provides two editing interfaces: a local workbench with device authentication for offline editing, and a remote editor that commits changes to GitHub for the live site. All project data, artifacts, and metadata stay in version-controlled files without any database."
why: I built this to keep my project records in Git—as plain Markdown and YAML files—rather than locked into a hosted service or database. As a senior software engineer shipping side projects, I wanted a durable, diffable archive I could version-control, inspect by hand, and redeploy without migration pain. The local-only editor and passkey-based privacy controls let me document experiments and ideas end-to-end while staying selective about what's shareable, and the static build output means the portfolio itself stays simple and portable.
status: dev
privacy: public
startDate: 2026-09-01
updatedDate: 2026-09-07
repositoryUrl: https://github.com/aviman1258/project-workbench
artifactOrder:
  - page-home.png
  - page-manage.png
  - page-projects-my-pal-json.png
  - page-projects-porfolio-workbench.png
  - how-it-works.pdf
featuredArtifact: page-projects-porfolio-workbench.png
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
