import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { readFile } from 'node:fs/promises';
import { loadArtifacts } from '../../../lib/projects';

export const getStaticPaths = (async () => {
  const projects = await getCollection('projects');
  const paths = await Promise.all(
    projects.map(async (project) => {
      const artifacts = await loadArtifacts(project);
      return artifacts.map((artifact) => ({
        params: { project: project.data.slug, file: artifact.relativePath },
        props: artifact,
      }));
    }),
  );

  return paths.flat();
}) satisfies GetStaticPaths;

export const GET = (async ({ props }) => {
  const artifact = props as {
    sourcePath: string;
    mimeType: string;
    filename: string;
  };
  const body = await readFile(artifact.sourcePath);

  return new Response(body, {
    headers: {
      'Content-Type': artifact.mimeType,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(artifact.filename)}`,
      'Cache-Control': 'no-store',
    },
  });
}) satisfies APIRoute;
