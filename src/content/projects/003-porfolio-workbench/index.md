---
id: "003"
slug: porfolio-workbench
name: Portfolio Workbench
description: Portfolio Workbench is a local-first web application that documents product ideas, experiments, prototypes, and shipped work using Markdown and YAML files stored in Git. It renders a searchable, filterable portfolio site with Astro, validates project metadata at build time, and includes a development-only editor for creating projects and timeline events without a database or external services. All data lives in version-controlled files, making the portfolio durable, inspectable, and portable.
why: I built this to keep my project records in Git—as plain Markdown and YAML files—rather than locked into a hosted service or database. As a site reliability engineer shipping side projects, I wanted a durable, diffable archive I could version-control, inspect by hand, and redeploy without migration pain. The local-only editor and passkey-based privacy controls let me document experiments and ideas end-to-end while staying selective about what's shareable, and the static build output means the portfolio itself stays simple and portable.
status: dev
privacy: public
startDate: 2026-09-01
updatedDate: 2026-09-04
artifactOrder:
  - portfolio-workbench-project-index.png
  - portfolio-workbench-project-editor.png
  - portfolio-workbench-add-project.png
featuredArtifact: portfolio-workbench-project-index.png
repositoryUrl: https://github.com/aviman1258/project-workbench
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
