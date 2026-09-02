import type { APIRoute } from 'astro';
import { withBase } from '../lib/projects';

// Web app manifest so the hosted site installs like an app ("Add to Home Screen").
// Generated as an endpoint because the icon and start URLs need the deploy base path.
export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      name: "Avishek's Project Workbench",
      short_name: 'Avishek',
      description: 'A portfolio of product ideas, experiments, and shipped work.',
      id: withBase('/'),
      start_url: withBase('/'),
      scope: withBase('/'),
      display: 'standalone',
      background_color: '#e9e6da',
      theme_color: '#e9e6da',
      icons: [
        { src: withBase('/icons/icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: withBase('/icons/icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: withBase('/icons/icon-512-maskable.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    }),
    { headers: { 'Content-Type': 'application/manifest+json' } },
  );
