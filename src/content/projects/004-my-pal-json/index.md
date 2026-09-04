---
id: "004"
slug: my-pal-json
name: My Pal JSON
description: My Pal JSON is a web-based tool for testing APIs and analyzing JSON responses with features like dynamic header management, request/response viewing, and JSON structure visualization. It can generate code models in six programming languages (C#, Python, JavaScript, C++, Java, Go) and includes dark/light theme switching.
why: I built this project to eliminate the friction of context-switching between multiple tools when working with APIs—I found myself constantly moving JSON between my request client, a formatter, a structure inspector, and code generators. My Pal JSON consolidates all of these workflows into a single lightweight browser workspace, so I can send API requests, analyze responses, explore JSON structure, and generate code models without leaving the application. This unified approach saves time and keeps my focus on the actual API exploration rather than tool management.
status: delivered
privacy: public
startDate: 2024-10-03
updatedDate: 2026-09-04
featuredArtifact: mypaljson2-20260902055735.png
repositoryUrl: https://github.com/aviman1258/my-pal-json
artifactOrder:
  - mypaljson-20260902055709.png
  - mypaljson2-20260902055735.png
  - ui-main-json-api-tester.png
  - how-my-pal-json-works.pdf
deleted: true
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
