# Avishek's Project Workbench

A portfolio of side projects, live at **https://www.avisheksportfolio.com**. It is an interface over files: each project is a Markdown record in Git, and Astro turns those records into the site. Markdown is the record, Git is the history, the interface is the view.

The same codebase runs in two modes:

- **Local workbench** (`npm run dev`): a full editor on `http://localhost:4321`. Editing private projects requires a device unlock (WebAuthn — Windows Hello, fingerprint, PIN). File writes go through a development-only Vite middleware bound to the loopback interface.
- **Hosted site** (`PUBLIC_ONLY=1` build, deployed to GitHub Pages): an installable PWA. Editing works from any device by committing through the GitHub contents API with a fine-grained personal access token, entered once via the connections dialog in the header.

## Architecture

- **Astro + TypeScript** render a static index and one detail page per project; **content collections + Zod** (`src/lib/project-schema.ts`) validate every record at build time.
- **Hosted editing** (`RemoteEditor`, `RemoteCreate`, `ProjectDelete`): field edits open themed modals; every apply is a commit. Deleting a project is a soft delete (`deleted: true` in front matter) — builds skip it, git keeps it.
- **Private projects** live in the separate private repo **`workbench-private`**. Public deploys generate locked stubs (`scripts/generate-private-stubs.mjs`, using the `PRIVATE_REPO_TOKEN` Actions secret); the real content is fetched client-side (`PrivateVault`) after GitHub auth, and edits commit back to the vault.
- **Artifacts** (any file type) sit in each project's `artifacts/` folder and render in a shared carousel (`src/lib/artifact-carousel.ts`): images and videos inline, PDFs as first-page previews via pdf.js, everything else as a labeled file tile. A GitHub Action (`convert-pptx.yml`, in both repos) converts uploaded PowerPoints to PDF automatically.
- **AI drafting** (`src/lib/ai-complete.ts`, `src/lib/ai/*`): "Draft from repository" reads the linked repo/PR through the GitHub API (owner-allowlisted, secrets redacted, budgeted) and drafts the description and why in the browser — Anthropic directly with the owner's API key; OpenAI keys work through the bundled Cloudflare Worker proxy (`proxy/openai-worker.js`).
- **Deep analysis** (`scripts/deep-analysis.mjs` + `deep-analysis.yml`, in both repos): pressing Draft also commits an `analysis-requests/<folder>.json` file, which triggers a background CI job that clones the linked repo, boots the app (docker compose / Dockerfile / npm / python), crawls it with a real browser, screenshots every page, documents each control with the model (`ANTHROPIC_API_KEY` Actions secret; `ANALYSIS_MODEL` env, default `claude-sonnet-5`), prints a typeset how-it-works PDF, and commits everything into the project. The site polls the request file, so reopening any page shows a run still in flight; it finishes even if every device is closed.
- **Deploy**: every push to `main` builds with `PUBLIC_ONLY=1` and publishes to GitHub Pages (`.github/workflows/deploy.yml`); the custom domain is set in the Pages settings and `public/CNAME`.

## Project record

One folder per project under `src/content/projects/<id>-<slug>/` with an `index.md` and an `artifacts/` directory. Front matter fields:

| Field | Notes |
|---|---|
| `id`, `slug`, `name` | identity; the slug is the URL |
| `description`, `why` | what it does; why it was built |
| `status` | `idea` \| `dev` \| `review` \| `delivered` — no repository link means it stays `idea` |
| `privacy` | `private` \| `public` |
| `startDate`, `updatedDate` | ISO dates; `updatedDate` is stamped on every save |
| `artifactOrder` | optional curated ordering of artifact filenames |
| `featuredArtifact` | optional; the card's hero image (defaults to the first artifact) |
| `repositoryUrl`, `pullRequestUrl` | optional links; also the AI drafting evidence sources |
| `deleted` | optional; `true` soft-deletes the project |

See `docs/PROJECT_TEMPLATE.md` for a copyable template.

## Commands

```bash
npm run dev                  # local workbench at http://localhost:4321
npm run check                # astro check (types + content schema)
npm run build                # local-mode build
PUBLIC_ONLY=1 npm run build  # hosted-mode build (what the deploy runs)
```

Private project folders (`001-*`, `002-*`) are gitignored here and live in `workbench-private`; folders matching `*-private-stub` are generated at deploy time.
