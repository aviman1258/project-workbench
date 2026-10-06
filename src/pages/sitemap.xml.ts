import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { aliveProjects } from '../lib/projects';

// Sitemap for search engines: the homepage plus every public, non-deleted
// project. Private projects are locked stubs and carry noindex, so they stay out.
export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://www.avisheksportfolio.com/')).origin;
  const projects = aliveProjects(await getCollection('projects'))
    .filter((project) => project.data.privacy === 'public');
  const latest = projects.reduce(
    (max, p) => (p.data.updatedDate > max ? p.data.updatedDate : max),
    new Date(0),
  );
  const entry = (path: string, lastmod: Date) =>
    `  <url><loc>${origin}${path}</loc><lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod></url>`;
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entry('/', latest),
    ...projects.map((p) => entry(`/projects/${p.data.slug}`, p.data.updatedDate)),
    '</urlset>',
    '',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
};
