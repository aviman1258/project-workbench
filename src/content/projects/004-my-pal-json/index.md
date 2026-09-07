---
id: "004"
slug: my-pal-json
name: My Pal JSON
description: My Pal JSON is a web-based tool for testing APIs, sending requests with custom headers, and analyzing JSON responses. It visualizes JSON structure in a tree format and can generate code models in six programming languages (C#, Python, JavaScript, C++, Java, Go), with support for dark and light themes.
why: I built this project to solve the inefficiency of constantly switching between separate tools when working with APIs. As a developer, I found myself juggling a request client, JSON formatter, structure inspector, and code generator—each context switch broke my focus and slowed down exploration. My Pal JSON consolidates these workflows into a single, lightweight browser-based workspace where I can send requests, inspect responses, analyze JSON structure, and generate models across multiple languages without ever leaving the application. It's a practical solution to a real friction point in API development.
status: dev
privacy: public
startDate: 2024-10-03
updatedDate: 2026-09-07
featuredArtifact: mypaljson2-20260902055735.png
repositoryUrl: https://github.com/aviman1258/my-pal-json
artifactOrder:
  - mypaljson-20260902055709.png
  - mypaljson2-20260902055735.png
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
