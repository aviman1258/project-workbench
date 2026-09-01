# Avishek's Portfolio

Avishek's Portfolio is a private, local-first web application for keeping a durable record of product ideas, engineering experiments, prototypes, pitches, and shipped work. It is an interface over files: Markdown and YAML in Git are the canonical data, and Astro turns those records into a searchable portfolio.

The app is deliberately local-only. It has no database, authentication, cloud hosting, or external service dependency. A localhost-only editor is available during `npm run dev`; it writes the same Markdown, YAML, and artifact files you could edit by hand.

## Architecture

- **Astro + TypeScript** render a static portfolio and one static detail route per project.
- **Astro Content Collections + Zod** validate every project's front matter during `astro check` and `astro build`.
- **Markdown front matter** stores project metadata; the Markdown body stores the flexible case study.
- **`events.yaml`** stores a curated, append-only product timeline that is validated with Zod and sorted chronologically at build time.
- **Project `artifacts/` directories** keep supporting files next to the record they belong to. Build-time static endpoints expose supported artifacts without introducing an API server.
- **Vanilla browser JavaScript** combines text search with status, type, area, and tag filters. No UI framework is needed.
- **Local editor controls** use a development-only Vite middleware to create project files, append timeline entries, and save artifacts. Requests are accepted only from the loopback interface.
- **Static output** preserves a straightforward future deployment path without changing the data model.

## Directory structure

```text
builder-portfolio/
├── docs/
│   └── PROJECT_TEMPLATE.md
├── public/
│   ├── profile-avatar-circle.png
│   └── profile-avatar.png
├── src/
│   ├── components/
│   │   ├── ProjectCard.astro
│   │   └── StatusBadge.astro
│   ├── content/
│   │   └── projects/
│   │       ├── 001-qa-listing-search/
│   │       │   ├── artifacts/
│   │       │   ├── events.yaml
│   │       │   └── index.md
│   │       └── 002-filming-nightlife/
│   │           ├── artifacts/
│   │           ├── events.yaml
│   │           └── index.md
│   ├── layouts/
│   │   └── BaseLayout.astro
│   ├── lib/
│   │   ├── local-editor.ts
│   │   ├── project-schema.ts
│   │   └── projects.ts
│   ├── pages/
│   │   ├── project-artifacts/[project]/[...file].ts
│   │   ├── projects/[slug].astro
│   │   ├── 404.astro
│   │   ├── manage.astro
│   │   └── index.astro
│   ├── styles/
│   │   └── global.css
│   └── content.config.ts
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

## Install and run

Requires Node.js 22.12+.

```bash
npm install
npm run dev
```

Astro prints the local URL, normally `http://localhost:4321`.

Useful validation commands:

```bash
npm run check
npm run build
npm run preview
```

## Add projects from the UI

Run `npm run dev`, open the portfolio, and select **+ Add project** in the header. The form creates the next numbered project directory with:

- validated YAML front matter and Markdown case-study content in `index.md`
- an empty `events.yaml`
- an `artifacts/` directory

Open any project and use **Add to this project** to add timeline events or upload PNG, JPG/JPEG, PDF, and MP4 artifacts. These actions update the project's `updated` date and write directly to `src/content/projects/`. Astro refreshes the rendered portfolio after the files change.

The editing controls intentionally work only with the local development server. `npm run build` still produces a read-only static portfolio with no write endpoint.

## Create a project manually

1. Copy [`docs/PROJECT_TEMPLATE.md`](docs/PROJECT_TEMPLATE.md) as a guide.
2. Create a new numbered directory under `src/content/projects/`, for example `003-map-rendering-experiment/`.
3. Add `index.md`, `events.yaml`, and an `artifacts/` directory.
4. Put all project metadata in the YAML front matter of `index.md`; do not add a separate metadata file.
5. Add or append timeline entries to `events.yaml`, or use the controls on the rendered project page.
6. Run `npm run check` and `npm run build`. A missing required field or invalid enum value fails validation.

The directory name organizes source files. The front-matter `slug` controls the public route, such as `/projects/map-rendering-experiment`.

## Project metadata

Required fields:

| Field | Type / allowed values |
| --- | --- |
| `id` | Non-empty string |
| `title` | Non-empty string |
| `slug` | Lowercase kebab-case string |
| `created` | Date |
| `updated` | Date |
| `type` | `customer-facing`, `internal-tool`, `infrastructure`, `experiment` |
| `area` | Non-empty string |
| `status` | `idea`, `exploring`, `prototype`, `ready-to-pitch`, `pitched`, `product-review`, `approved`, `building`, `experiment`, `shipped`, `rejected`, `abandoned`, `superseded`, `archived` |
| `summary` | Non-empty string |
| `tags` | Array of non-empty strings |
| `confidentiality` | `personal`, `internal`, `sanitized`, `public` |
| `externalShareable` | Boolean; always decided explicitly and independently from confidentiality |
| `featured` | Boolean |

Optional fields:

| Field | Type |
| --- | --- |
| `effort.prototypeHours` | Non-negative number |
| `effort.totalHours` | Non-negative number |
| `tech` | Array of non-empty strings |

The case-study headings after front matter are recommendations, not schema requirements. Markdown remains flexible.

## Timeline events

`events.yaml` is the hand-curated product history. It is not generated from commits and should not be rewritten from Git history. Keep existing records and append a new event when something meaningful happens.

```yaml
- date: 2026-08-23
  type: product-review
  title: Prototype submitted for review
  note: Optional longer context about this moment.
```

Every event requires `date`, `type`, and `title`; `note` is optional. The app validates the file and sorts events oldest-to-newest for display, so source entries are still best kept in chronological order for readability.

## Artifacts

Upload artifacts from the controls on a project page, or place files directly in that project's `artifacts/` directory. The portfolio recognizes:

- `.png`
- `.jpg` / `.jpeg`
- `.pdf`
- `.mp4`

Images receive thumbnails. PDFs and videos receive file cards. Unsupported files stay in Git but are not listed by the interface. No artifact metadata database is created. UI uploads are limited to 25 MB per file.

## Why files are canonical

Markdown and YAML keep the portfolio durable, inspectable, diffable, and portable. They work offline, preserve authorship and history through Git, do not depend on a proprietary editor, and can be deployed later without a data migration. The rendered site is a view of those records—not a second source of truth.
