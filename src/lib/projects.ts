import type { CollectionEntry } from 'astro:content';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const projectsRoot = path.resolve('src/content/projects');

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
  '.pdf': { kind: 'pdf', mimeType: 'application/pdf' },
  '.mp4': { kind: 'video', mimeType: 'video/mp4' },
};

async function getProjectFolder(project: CollectionEntry<'projects'>): Promise<string> {
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
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const sourcePath = path.join(artifactRoot, entry.name);
      const relativePath = path.relative(artifactRoot, sourcePath).replaceAll('\\', '/');
      const type = artifactTypes[path.extname(entry.name).toLowerCase()];
      return type
        ? {
            filename: entry.name,
            relativePath,
            sourcePath,
            href: `/project-artifacts/${project.data.slug}/${relativePath
              .split('/')
              .map(encodeURIComponent)
              .join('/')}`,
            ...type,
          }
        : null;
    })
    .filter((artifact): artifact is ProjectArtifact => artifact !== null)
    .sort((a, b) => {
      // curated order from front matter wins; unlisted files fall back to images-first, A-Z
      const rankA = orderRank.has(a.filename) ? orderRank.get(a.filename)! : Number.POSITIVE_INFINITY;
      const rankB = orderRank.has(b.filename) ? orderRank.get(b.filename)! : Number.POSITIVE_INFINITY;
      if (rankA !== rankB) return rankA - rankB;
      const kindOrder = Number(b.kind === 'image') - Number(a.kind === 'image');
      return kindOrder || a.filename.localeCompare(b.filename);
    });
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
