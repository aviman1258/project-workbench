---
id: "004"
slug: my-pal-json
name: My Pal JSON
description: My Pal JSON is a browser-based API client that stores request collections in Git repositories, lets you send API calls and analyze JSON responses, and generates model classes in six programming languages. It runs locally so your localhost APIs and secrets never leave your machine, and supports chaining requests together with variable passing between responses.
why: "I built this project to eliminate the friction of context-switching between multiple tools during API development. As someone who constantly moved between a request client, JSON formatter, structure inspector, and code generator, I realized each context switch broke my focus and slowed down exploration—so I set out to consolidate all these workflows into a single lightweight browser application. What started as a productivity fix evolved into something more interesting: a workspace that runs entirely locally, integrates with git repositories to sync API collections with teammates using Postman, and chains requests together visually to simulate complex API flows. I wanted to prove that the right tool design could make API exploration feel seamless rather than fragmented."
status: dev
privacy: public
startDate: 2024-10-03
updatedDate: 2026-09-09
featuredArtifact: page-home.png
repositoryUrl: https://github.com/aviman1258/my-pal-json
artifactOrder:
  - mypaljson-20260902055709.png
  - page-home.png
  - how-it-works.pdf
---

## Observation

The repository implements a Flask web application for working with JSON and HTTP APIs. Its interface supports GET, POST, and PUT requests, dynamic headers, bearer-token handling, request and response tabs, JSON formatting, structure analysis, and copyable output.

## What I Built

- A proxy endpoint for sending API requests and returning response content with status codes.
- A tree-based JSON structure analyzer built with `anytree`.
- Model generators for C#, Python, JavaScript, C++, Java, and Go, including nested objects and arrays.
- Browser-side request history using IndexedDB, with save, reload, duplicate detection, and deletion flows.
- Drag-and-drop JSON input, light and dark themes, dynamic header rows, and request/response switching.
- Docker and Docker Compose configurations, with Gunicorn serving the Flask application on port 5000.

## Product Rationale

> Inferred: The project consolidates common API exploration tasks into one lightweight browser workspace, reducing the need to move JSON between separate request, formatting, schema-inspection, and model-generation tools.

## Technical Approach

Flask blueprints separate request proxying, JSON analysis, and model generation. The frontend uses server-rendered HTML, modular JavaScript, CSS theme stylesheets, browser Clipboard and File APIs, and IndexedDB for local API-call history. The production container uses Python 3.9 Slim and four Gunicorn workers.

## Outcome

The README documents runnable Docker image and Docker Compose workflows. Recent repository work added saved-call history, loading and deleting stored requests, drag-and-drop input, authorization-header controls, styling refinements, and bug fixes.

## What I Learned

> Inferred: Building language-specific generators from sample JSON highlights the tradeoffs of deriving static models from runtime values—especially around empty arrays, nested naming, pluralization, and ambiguous primitive types.
