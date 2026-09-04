import type { CollectionEntry } from 'astro:content';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const projectsRoot = path.resolve('src/content/projects');

// Public deploys (PUBLIC_ONLY=1, set by the GitHub Pages workflow) exclude private
// projects from every page, path, and artifact endpoint. Local dev shows everything.
export const publicOnlyBuild = process.env.PUBLIC_ONLY === '1';

export function listedProjects<T extends { data: { privacy: string; deleted?: boolean } }>(projects: T[]): T[] {
  const alive = projects.filter((project) => !project.data.deleted);
  return publicOnlyBuild ? alive.filter((project) => project.data.privacy === 'public') : alive;
}

// Prefix an internal absolute path with the configured base (GitHub Pages serves
// the site under /<repo>/; locally BASE_URL is just "/").
export function withBase(pathname: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}${pathname}`;
}

export type ProjectArtifact = {
  filename: string;
  relativePath: string;
  sourcePath: string;
  href: string;
  kind: 'image' | 'pdf' | 'video' | 'file';
  mimeType: string;
};

const artifactTypes: Record<string, Pick<ProjectArtifact, 'kind' | 'mimeType'>> = {
  '.png': { kind: 'image', mimeType: 'image/png' },
  '.jpg': { kind: 'image', mimeType: 'image/jpeg' },
  '.jpeg': { kind: 'image', mimeType: 'image/jpeg' },
  '.gif': { kind: 'image', mimeType: 'image/gif' },
  '.webp': { kind: 'image', mimeType: 'image/webp' },
  '.svg': { kind: 'image', mimeType: 'image/svg+xml' },
  '.pdf': { kind: 'pdf', mimeType: 'application/pdf' },
  '.mp4': { kind: 'video', mimeType: 'video/mp4' },
  '.webm': { kind: 'video', mimeType: 'video/webm' },
  '.mov': { kind: 'video', mimeType: 'video/quicktime' },
};

// anything else is still a valid artifact — shown as a generic file tile
const fallbackType: Pick<ProjectArtifact, 'kind' | 'mimeType'> = { kind: 'file', mimeType: 'application/octet-stream' };

export async function getProjectFolder(project: CollectionEntry<'projects'>): Promise<string> {
  const entries = await readdir(projectsRoot, { withFileTypes: true });
  const folder = entries.find(
    (entry) =>
      entry.isDirectory() &&
      (entry.name === project.data.id || entry.name.startsWith(`${project.data.id}-`)),
  );

  if (!folder) {
    throw new Error(`No source directory found for project ${project.data.id} (${project.data.name})`);
  }

  return folder.name;
}

export async function loadArtifacts(
  project: CollectionEntry<'projects'>,
): Promise<ProjectArtifact[]> {
  // Public builds must never emit private artifacts (their media lives in the vault).
  if (publicOnlyBuild && project.data.privacy === 'private') return [];
  const artifactRoot = path.join(projectsRoot, await getProjectFolder(project), 'artifacts');
  const orderRank = new Map((project.data.artifactOrder ?? []).map((name, index) => [name, index]));
  let entries;

  try {
    entries = await readdir(artifactRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => {
      const sourcePath = path.join(artifactRoot, entry.name);
      const relativePath = path.relative(artifactRoot, sourcePath).replaceAll('\\', '/');
      const type = artifactTypes[path.extname(entry.name).toLowerCase()] ?? fallbackType;
      return {
        filename: entry.name,
        relativePath,
        sourcePath,
        href: withBase(`/project-artifacts/${project.data.slug}/${relativePath
          .split('/')
          .map(encodeURIComponent)
          .join('/')}`),
        ...type,
      };
    })
    .sort((a, b) => {
      // curated order from front matter wins; unlisted files fall back to images-first, A-Z
      const rankA = orderRank.has(a.filename) ? orderRank.get(a.filename)! : Number.POSITIVE_INFINITY;
      const rankB = orderRank.has(b.filename) ? orderRank.get(b.filename)! : Number.POSITIVE_INFINITY;
      if (rankA !== rankB) return rankA - rankB;
      const kindOrder = Number(b.kind === 'image') - Number(a.kind === 'image');
      return kindOrder || a.filename.localeCompare(b.filename);
    });
}

// Exactly one artifact is featured whenever any exist: the front-matter pick when
// it still exists, otherwise the first artifact in display order.
export function featuredArtifact(
  project: CollectionEntry<'projects'>,
  artifacts: ProjectArtifact[],
): ProjectArtifact | null {
  return artifacts.find((artifact) => artifact.filename === project.data.featuredArtifact) ?? artifacts[0] ?? null;
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatLabel(value: string): string {
  return value.replaceAll('-', ' ');
}
