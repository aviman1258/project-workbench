// Shared YAML front-matter helpers, usable from both the server (local editor)
// and the browser (hosted editors) — only the yaml package is involved.

import { parse, stringify } from 'yaml';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export interface FrontmatterFile {
  metadata: Record<string, unknown>;
  body: string;
}

/** Split an index.md into metadata and body. Throws when no front matter exists. */
export function parseFrontmatter(text: string): FrontmatterFile {
  const match = FRONTMATTER.exec(text);
  if (!match) throw new Error('index.md is missing YAML front matter.');
  return {
    metadata: { ...(parse(match[1]) as Record<string, unknown>) },
    body: text.slice(match[0].length).replace(/^\r?\n/, ''),
  };
}

/** Rebuild the file; undefined values are dropped from the metadata. */
export function serializeFrontmatter(metadata: Record<string, unknown>, body: string): string {
  for (const key of Object.keys(metadata)) {
    if (metadata[key] === undefined) delete metadata[key];
  }
  return `---\n${stringify(metadata, { lineWidth: 0 }).trimEnd()}\n---\n${body ? `\n${body}` : ''}`;
}

/** Kebab-case a name for filenames and slugs. */
export function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
