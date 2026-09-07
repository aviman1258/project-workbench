# Project template

Create `src/content/projects/<id>-<slug>/index.md` (three-digit `id`, kebab-case `slug`) plus an empty `artifacts/` folder. The hosted Add-project form and the local editor both generate this shape; this template is for doing it by hand.

```markdown
---
id: "007"
slug: example-project
name: Example Project
description: One to three sentences on what it does.
why: |
  First-person, two to four sentences on the problem, curiosity,
  or need that made it worth building.
status: dev            # idea | dev | review | delivered
privacy: public        # private | public
startDate: 2026-01-15
updatedDate: 2026-01-15
# --- optional ---
# artifactOrder:            # curated display order; unlisted files follow A-Z
#   - hero-screenshot.png
#   - demo.mp4
# featuredArtifact: hero-screenshot.png   # card hero; defaults to first artifact
# repositoryUrl: https://github.com/aviman1258/example-project
# pullRequestUrl: https://github.com/aviman1258/example-project/pull/12
# deleted: true             # soft delete: hidden from the site, kept in git
---
```

Rules the app enforces:

- Without `repositoryUrl`, the status can only be `idea`.
- `updatedDate` is overwritten on every save; don't bother curating it.
- Exactly one artifact is featured whenever any exist — the front-matter pick if it still exists, otherwise the first in display order.
- Artifacts may be any file type. Images/videos render inline, PDFs get a first-page preview, PowerPoints are converted to PDF by CI, and everything else shows as a labeled file tile.
- `privacy: private` projects belong in the `workbench-private` repo (`projects/<id>-<slug>/…`), not here; public deploys generate locked stubs for them.
