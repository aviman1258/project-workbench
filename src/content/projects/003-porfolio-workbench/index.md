---
id: "003"
slug: porfolio-workbench
name: Portfolio Workbench
description: Portfolio Workbench is a local-first web application for documenting product ideas, experiments, prototypes, and shipped work using Markdown and YAML files stored in Git. It renders a searchable, filterable portfolio site with Astro, validates project metadata at build time, and includes a development-only editor for creating projects and timeline events without a database or external services. All data lives in version-controlled files, making the portfolio durable, inspectable, and portable for future deployment.
why: Built to keep project documentation and evidence tied to plain files under Git rather than a hosted service, so records stay durable, diffable, and portable, per the README's stated rationale ("Markdown and YAML in Git are the canonical data"). The local-only editor, loopback-request checks, and static build output show a deliberate choice to avoid a database or auth backend for the read path. The AI-fill and device-unlock features suggest the goal was to lower the effort of writing up new projects while still letting some entries stay restricted to the author via passkey rather than a login system.
status: dev
privacy: public
startDate: 2026-09-01
updatedDate: 2026-09-02
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
