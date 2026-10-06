---
id: "004"
slug: my-pal-json
name: My Pal JSON
description: My Pal JSON is a local, browser-based API client (a lightweight Postman-style tool) that stores its collections as files in a git repository instead of a proprietary cloud. From one page you can build and send HTTP requests, pretty-print and analyze JSON bodies, generate typed model classes in six languages, and chain multiple requests together with variable passing between steps. It runs as a small Flask app (via Podman/Docker or plain Python) so that localhost APIs, VPN-only hosts, and secrets never leave the machine it runs on.
why: "I built this because I was tired of juggling Postman collections that lived in someone's cloud account, got out of sync with what was actually checked into source control, and couldn't be reasoned about or diffed like code. I wanted a tool that treats API collections as plain files in the team's repo — pullable, editable, pushable, diffable — while still giving me the everyday conveniences of a request client: headers, environments, JSON formatting, and codegen for whatever language I'm working in that day. The chaining feature came out of repeatedly needing to grab a token from one call and feed it into the next by hand; I wanted to click a value in a response and have it become a variable automatically. As a senior engineer who likes exploring an idea end-to-end, I wrote the Flask backend, the provider abstraction for Azure DevOps/GitHub, and the vanilla-JS frontend myself, with no build step, so the whole thing stays inspectable and easy to run anywhere."
status: delivered
privacy: public
startDate: 2024-10-03
updatedDate: 2026-10-06
repositoryUrl: https://github.com/aviman1258/my-pal-json
artifactOrder:
  - page-home.png
  - how-it-works.pdf
featuredArtifact: page-home.png
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
